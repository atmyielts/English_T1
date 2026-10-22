import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authUser,
  buildFeedbackPayload,
  calculateAttemptScore,
  corsHeaders,
  type EnglishProductInfo,
  type EnglishServiceKey,
  extractRoute,
  getEnv,
  json,
  parseBody,
  recordEvaluatedAttempt,
  resolveEnglishProducts,
  resolveLanguageScope,
  resolveOrCreateContentItem,
  toNumber,
  toText,
} from "../_shared/english-learning.ts";
import { callEnglishAIWithStatus, isEnglishAIConfigured } from "../_shared/english-ai.ts";
import { consumeEnglishAiDailyQuota, parseEnglishAiDailyLimit, requireEnglishSuiteAccess } from "../_shared/english-access.ts";
import {
  buildWritingAIRequest,
  buildWritingFeedback,
  countWords,
  issuesFromFeedback,
  minimumWordsToSubmit,
  parseChecklist,
  type WritingFeedback,
  type WritingPromptSpec,
} from "../_shared/english-writing.ts";

type JsonRecord = Record<string, unknown>;

const routeMarker = "/writing-workbench";
const MAX_TEXT = 12000;

const PROMPT_COLUMNS =
  "id, slug, title, prompt_text, guidance_text, level, genre, target_grammar, target_vocabulary, target_structure, expected_length_min, expected_length_max, status, sort_order, metadata";

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const asRecord = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {});

/** Minutes per activity, by level band: A 8, B 15, C 25. */
const minutesFor = (level: unknown): number => {
  const key = String(level ?? "").toUpperCase();
  if (key.startsWith("A")) return 8;
  if (key.startsWith("C")) return 25;
  return 15;
};

/** The prompt as the learner sees it (no internal metadata). */
const publicPrompt = (prompt: JsonRecord) => {
  const meta = asRecord(prompt.metadata);
  return {
    id: String(prompt.id),
    slug: toText(prompt.slug, 160),
    title: toText(prompt.title, 220),
    prompt_text: toText(prompt.prompt_text, 2000),
    guidance_text: toText(prompt.guidance_text, 2000) || null,
    checklist: parseChecklist(toText(prompt.guidance_text, 2000)),
    level: toText(prompt.level, 8) || null,
    genre: toText(prompt.genre, 80) || null,
    audience: toText(meta.audience, 200) || null,
    target_grammar: toText(prompt.target_grammar, 200) || null,
    target_vocabulary: Array.isArray(prompt.target_vocabulary) ? (prompt.target_vocabulary as unknown[]).map((word) => toText(word, 60)).filter(Boolean) : [],
    target_structure: toText(prompt.target_structure, 300) || null,
    expected_length_min: Number(prompt.expected_length_min ?? 60),
    expected_length_max: Number(prompt.expected_length_max ?? 180),
    minutes: minutesFor(prompt.level),
    min_words_to_submit: minimumWordsToSubmit(Number(prompt.expected_length_min ?? 60)),
  };
};

const promptSpec = (prompt: JsonRecord): WritingPromptSpec => {
  const meta = asRecord(prompt.metadata);
  const keywords = Array.isArray(meta.checklist_keywords)
    ? (meta.checklist_keywords as unknown[]).map((entry) => (Array.isArray(entry) ? entry.map((word) => toText(word, 60)).filter(Boolean) : []))
    : null;
  const pub = publicPrompt(prompt);
  return {
    title: pub.title,
    prompt_text: pub.prompt_text,
    guidance_text: pub.guidance_text,
    level: pub.level,
    genre: pub.genre,
    target_grammar: pub.target_grammar,
    target_vocabulary: pub.target_vocabulary,
    target_structure: pub.target_structure,
    expected_length_min: pub.expected_length_min,
    expected_length_max: pub.expected_length_max,
    checklist_keywords: keywords,
  };
};

const loadPrompt = async (sb: any, productId: string, languageId: string, identifier: string): Promise<JsonRecord | null> => {
  let query = sb
    .from("writing_prompts")
    .select(PROMPT_COLUMNS)
    .eq("product_id", productId)
    .eq("language_id", languageId)
    .eq("status", "published")
    .limit(1);
  query = isUuid(identifier) ? query.eq("id", identifier) : query.eq("slug", identifier);
  const { data, error } = await query.maybeSingle();
  if (error || !data?.id) return null;
  return data as JsonRecord;
};

const findRegistryItemId = async (sb: any, languageId: string, slug: string): Promise<string | null> => {
  const { data } = await sb
    .from("learning_content_registry_items")
    .select("id")
    .eq("language_id", languageId)
    .eq("service_key", "writing")
    .eq("content_type", "writing.prompt")
    .eq("source_ref", slug)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
};

/** Best accuracy (0..100) the learner has had on this prompt, or null if never tried. */
const bestScore = async (sb: any, userId: string, contentItemId: string | null): Promise<number | null> => {
  if (!contentItemId) return null;
  const { data } = await sb
    .from("learning_attempts")
    .select("correctness_ratio")
    .eq("user_id", userId)
    .eq("content_item_id", contentItemId)
    .in("status", ["submitted", "scored", "failed"])
    .not("correctness_ratio", "is", null)
    .order("correctness_ratio", { ascending: false })
    .limit(1)
    .maybeSingle();
  const value = Number(data?.correctness_ratio);
  return data && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 100) : null;
};

const latestDraft = async (sb: any, userId: string, languageId: string, promptId: string): Promise<JsonRecord | null> => {
  const { data } = await sb
    .from("writing_drafts")
    .select("*")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("prompt_id", promptId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? data as JsonRecord : null;
};

/** Calls the AI only for learners with access and AI quota left; otherwise returns null (basic feedback). */
const askAI = async (sb: any, userId: string, products: Record<EnglishServiceKey, EnglishProductInfo>, text: string, spec: WritingPromptSpec) => {
  if (!isEnglishAIConfigured()) return null;
  try {
    const access = await requireEnglishSuiteAccess(sb, userId, products);
    if (!access.allowed) return null;
    const quota = await consumeEnglishAiDailyQuota(sb, userId, parseEnglishAiDailyLimit(Deno.env.get("ENGLISH_AI_DAILY_LIMIT")));
    if (!quota.allowed) return null;
    const result = await callEnglishAIWithStatus<unknown>(buildWritingAIRequest(text, spec), null);
    if (result.status !== "ok") console.warn("writing-workbench: AI feedback unavailable", result.status, result.error ?? "");
    return { status: result.status, data: result.data };
  } catch (error) {
    console.warn("writing-workbench: AI feedback failed", error instanceof Error ? error.message : String(error));
    return null;
  }
};

/**
 * Checks one submission and records it as ONE attempt on the prompt's registry
 * item. Revisions are new attempts and are never penalised; the best score counts.
 */
const evaluateSubmission = async (
  sb: any,
  input: {
    userId: string;
    languageId: string;
    productId: string;
    products: Record<EnglishServiceKey, EnglishProductInfo>;
    prompt: JsonRecord;
    text: string;
    timeSpentSeconds: number | null;
  },
): Promise<Response> => {
  const { prompt, text } = input;
  const spec = promptSpec(prompt);
  const slug = toText(prompt.slug, 160) || String(prompt.id);
  const wordCount = countWords(text);
  const minWords = minimumWordsToSubmit(spec.expected_length_min);
  if (wordCount < minWords) {
    return json(422, { error: `Write at least ${minWords} words before asking for feedback.`, code: "too_short", min_words: minWords });
  }

  const ai = await askAI(sb, input.userId, input.products, text, spec);
  const feedback: WritingFeedback = buildWritingFeedback(text, spec, ai);

  const minutes = minutesFor(prompt.level);
  const contentItem = await resolveOrCreateContentItem(sb, {
    productId: input.productId,
    languageId: input.languageId,
    serviceKey: "writing",
    contentType: "writing.prompt",
    sourceRef: slug,
    title: spec.title,
    description: spec.prompt_text,
    skillKey: "writing",
    subskillKeys: ["writing.task_completion", "writing.organisation", "writing.vocabulary", "writing.grammar"],
    cefrLevel: spec.level,
    estimatedMinutes: minutes,
    learningObjective: spec.guidance_text ?? spec.prompt_text,
    tags: [spec.genre ?? "", spec.target_grammar ?? ""].filter(Boolean),
  });

  const previousBest = await bestScore(sb, input.userId, String(contentItem.id));
  const ratio = Math.max(0, Math.min(1, feedback.overall / 100));
  const score = calculateAttemptScore({
    correctnessRatio: ratio,
    estimatedMinutes: Number(contentItem.estimated_minutes ?? minutes),
    timeSpentSeconds: input.timeSpentSeconds,
    hintUsageCount: 0,
    retryCount: 0,
    correctionQualityRatio: ratio,
  });
  const issues = issuesFromFeedback(feedback, slug);
  const feedbackPayload = buildFeedbackPayload({
    serviceKey: "writing",
    score: score.overallScore,
    title: spec.title,
    reason: spec.prompt_text,
    issues,
  });

  // Keep the learner's draft and revision history (best effort; the attempt is what counts).
  let revision = 1;
  let draftId: string | null = null;
  const existing = await latestDraft(sb, input.userId, input.languageId, String(prompt.id)).catch(() => null);
  if (existing) {
    revision = Number(existing.revision_count ?? 0) + 1;
    draftId = String(existing.id);
  }

  const recorded = await recordEvaluatedAttempt(sb, {
    userId: input.userId,
    languageId: input.languageId,
    productId: input.productId,
    serviceKey: "writing",
    contentItem,
    attemptType: "writing.submission",
    responseJson: { prompt_id: String(prompt.id), text, word_count: wordCount, feedback },
    metadata: { prompt_slug: slug, feedback_source: feedback.source, revision, overall: feedback.overall },
    hintUsageCount: 0,
    retryCount: 0,
    timeSpentSeconds: input.timeSpentSeconds,
    score,
    feedback: feedbackPayload,
    products: input.products,
  });
  const attemptId = String(recorded.attempt.id ?? "");

  try {
    const previousOverall = Number(asRecord(existing?.latest_feedback).overall);
    const draftFields = {
      status: revision > 1 ? "revising" : "submitted",
      current_text: text,
      word_count: wordCount,
      revision_count: revision,
      latest_attempt_id: attemptId || null,
      latest_feedback: { overall: feedback.overall, source: feedback.source, corrections: feedback.corrections.length },
    };
    if (draftId) {
      await sb.from("writing_drafts").update(draftFields).eq("id", draftId);
    } else {
      const inserted = await sb
        .from("writing_drafts")
        .insert({ user_id: input.userId, language_id: input.languageId, product_id: input.productId, prompt_id: String(prompt.id), metadata: { prompt_slug: slug }, ...draftFields })
        .select("id")
        .maybeSingle();
      draftId = inserted.data?.id ? String(inserted.data.id) : null;
    }
    if (draftId) {
      await sb.from("writing_revision_cycles").insert({
        draft_id: draftId,
        user_id: input.userId,
        revision_index: revision,
        submitted_text: text,
        word_count: wordCount,
        issues,
        correction_targets: feedback.corrections,
        feedback_summary: feedback.next_step,
        attempt_id: attemptId || null,
        improvement_ratio: Number.isFinite(previousOverall) && previousOverall < 100
          ? Math.max(0, Math.min(1, (feedback.overall - previousOverall) / (100 - previousOverall)))
          : null,
        metadata: { overall: feedback.overall, source: feedback.source },
      });
    }
  } catch (error) {
    console.warn("writing-workbench: draft history not saved", error instanceof Error ? error.message : String(error));
  }

  return json(200, {
    ok: true,
    attempt_id: attemptId,
    score: feedback.overall,
    previous_best: previousBest,
    revision,
    feedback,
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const auth = await authUser(sb, req);
    if (!auth) return json(401, { error: "Unauthorized" });

    const url = new URL(req.url);
    const route = extractRoute(url, routeMarker);
    const body = req.method === "POST" ? await parseBody(req) : {};
    const scope = await resolveLanguageScope(sb, toText(url.searchParams.get("language_code") ?? body.language_code, 16) || "en");
    const products = await resolveEnglishProducts(sb);
    const productId = products.writing?.productId;
    if (!productId) return json(500, { error: "Writing is not available right now." });

    const timeSpent = (() => {
      const value = toNumber(body.time_spent_seconds);
      return value === null ? null : Math.max(1, Math.min(4 * 3600, Math.round(value)));
    })();

    // Library list (the skill home uses /hub/catalog; kept for older clients).
    if (req.method === "GET" && (route === "" || route === "/" || route === "/prompts")) {
      const level = toText(url.searchParams.get("level"), 8).toUpperCase();
      const limit = Math.max(1, Math.min(60, Math.floor(toNumber(url.searchParams.get("limit")) ?? 30)));
      let query = sb
        .from("writing_prompts")
        .select(PROMPT_COLUMNS)
        .eq("product_id", productId)
        .eq("language_id", scope.languageId)
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(limit);
      if (level) query = query.eq("level", level);
      const { data, error } = await query;
      if (error) return json(500, { error: "Could not load writing tasks." });
      return json(200, { prompts: ((data ?? []) as JsonRecord[]).map(publicPrompt) });
    }

    // Submit a draft for feedback: POST /prompts/:slug/submit { text, time_spent_seconds }
    if (req.method === "POST" && route.startsWith("/prompts/") && route.endsWith("/submit")) {
      const identifier = decodeURIComponent(route.slice("/prompts/".length, -"/submit".length)).trim();
      const prompt = identifier ? await loadPrompt(sb, productId, scope.languageId, identifier) : null;
      if (!prompt) return json(404, { error: "Writing task not found" });
      const text = toText(body.text, MAX_TEXT);
      return await evaluateSubmission(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        productId,
        products,
        prompt,
        text,
        timeSpentSeconds: timeSpent,
      });
    }

    // One task with the learner's saved draft and best score.
    if (req.method === "GET" && route.startsWith("/prompts/")) {
      const identifier = decodeURIComponent(route.slice("/prompts/".length)).trim();
      const prompt = identifier ? await loadPrompt(sb, productId, scope.languageId, identifier) : null;
      if (!prompt) return json(404, { error: "Writing task not found" });
      const [itemId, draft] = await Promise.all([
        findRegistryItemId(sb, scope.languageId, toText(prompt.slug, 160)),
        latestDraft(sb, auth.userId, scope.languageId, String(prompt.id)),
      ]);
      const best = await bestScore(sb, auth.userId, itemId);
      return json(200, {
        prompt: publicPrompt(prompt),
        best_score: best,
        draft: draft
          ? {
            text: toText(draft.current_text, MAX_TEXT),
            revision_count: Number(draft.revision_count ?? 0),
            updated_at: draft.updated_at ?? null,
          }
          : null,
      });
    }

    // ---- Older draft endpoints (kept working on the same scoring) ----

    if (req.method === "POST" && route === "/drafts/start") {
      const identifier = toText(body.prompt_id ?? body.slug ?? body.source_ref, 160);
      if (!identifier) return json(422, { error: "prompt_id (or slug) is required" });
      const prompt = await loadPrompt(sb, productId, scope.languageId, identifier);
      if (!prompt) return json(404, { error: "Writing task not found" });
      let draft = await latestDraft(sb, auth.userId, scope.languageId, String(prompt.id));
      if (!draft) {
        const inserted = await sb
          .from("writing_drafts")
          .insert({
            user_id: auth.userId,
            language_id: scope.languageId,
            product_id: productId,
            prompt_id: String(prompt.id),
            status: "draft",
            current_text: "",
            word_count: 0,
            revision_count: 0,
            metadata: { prompt_slug: toText(prompt.slug, 160) },
          })
          .select("*")
          .maybeSingle();
        if (inserted.error || !inserted.data?.id) return json(500, { error: "Could not start a draft." });
        draft = inserted.data as JsonRecord;
      }
      const cycles = await sb
        .from("writing_revision_cycles")
        .select("id, revision_index, feedback_summary, issues, correction_targets, improvement_ratio, created_at")
        .eq("draft_id", String(draft.id))
        .order("revision_index", { ascending: false })
        .limit(6);
      return json(200, { draft, prompt: publicPrompt(prompt), revision_cycles: cycles.data ?? [] });
    }

    if (req.method === "GET" && route.startsWith("/drafts/")) {
      const draftId = decodeURIComponent(route.slice("/drafts/".length)).trim();
      if (!isUuid(draftId)) return json(404, { error: "Draft not found" });
      const draftRes = await sb.from("writing_drafts").select("*").eq("id", draftId).maybeSingle();
      if (draftRes.error || !draftRes.data?.id) return json(404, { error: "Draft not found" });
      if (String(draftRes.data.user_id ?? "") !== auth.userId) return json(403, { error: "Forbidden" });
      const draft = draftRes.data as JsonRecord;
      const prompt = await loadPrompt(sb, productId, scope.languageId, String(draft.prompt_id ?? ""));
      if (!prompt) return json(404, { error: "Writing task not found" });
      const cycles = await sb
        .from("writing_revision_cycles")
        .select("id, revision_index, feedback_summary, issues, correction_targets, improvement_ratio, attempt_id, created_at")
        .eq("draft_id", draftId)
        .order("revision_index", { ascending: false })
        .limit(12);
      return json(200, { draft, prompt: publicPrompt(prompt), revision_cycles: cycles.data ?? [] });
    }

    if (req.method === "POST" && route === "/drafts/submit") {
      const draftId = toText(body.draft_id, 120);
      const text = toText(body.submission_text ?? body.text, MAX_TEXT);
      if (!isUuid(draftId) || !text) return json(422, { error: "draft_id and submission_text are required" });
      const draftRes = await sb.from("writing_drafts").select("id, user_id, prompt_id").eq("id", draftId).maybeSingle();
      if (draftRes.error || !draftRes.data?.id) return json(404, { error: "Draft not found" });
      if (String(draftRes.data.user_id ?? "") !== auth.userId) return json(403, { error: "Forbidden" });
      const prompt = await loadPrompt(sb, productId, scope.languageId, String(draftRes.data.prompt_id ?? ""));
      if (!prompt) return json(404, { error: "Writing task not found" });
      return await evaluateSubmission(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        productId,
        products,
        prompt,
        text,
        timeSpentSeconds: timeSpent,
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error("writing-workbench error", error instanceof Error ? error.message : String(error));
    return json(500, { error: "Something went wrong. Please try again." });
  }
});
