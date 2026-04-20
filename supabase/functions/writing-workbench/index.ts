import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authUser,
  buildFeedbackPayload,
  calculateAttemptScore,
  corsHeaders,
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

type JsonRecord = Record<string, unknown>;

const routeMarker = "/writing-workbench";

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const stopwords = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "and",
  "or",
  "but",
  "is",
  "are",
  "was",
  "were",
  "i",
  "you",
  "we",
  "they",
  "it",
  "in",
  "on",
  "for",
  "with",
  "this",
  "that",
  "be",
  "because",
]);

const countWords = (text: string): number => {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
};

const tokenize = (text: string): string[] =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, " ")
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const clip = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const detectWritingIssues = (
  text: string,
  prompt: Record<string, unknown>,
): {
  issues: Array<Record<string, unknown>>;
  correctionTargets: Array<Record<string, unknown>>;
  wordCount: number;
  uniqueRatio: number;
} => {
  const issues: Array<Record<string, unknown>> = [];
  const wordCount = countWords(text);
  const minWords = Math.max(10, Number(prompt.expected_length_min ?? 60));
  const maxWords = Math.max(minWords, Number(prompt.expected_length_max ?? 180));
  const tokens = tokenize(text);
  const lexicalTokens = tokens.filter((token) => !stopwords.has(token));
  const uniqueRatio = lexicalTokens.length > 0 ? new Set(lexicalTokens).size / lexicalTokens.length : 0;

  if (wordCount < minWords) {
    issues.push({
      id: crypto.randomUUID(),
      category: "writing",
      subskill_key: "writing.task_completion",
      location_ref: "whole-draft",
      span_start: 0,
      span_end: Math.max(0, text.length - 1),
      explanation: `The draft is too short for this task. Aim for at least ${minWords} words.`,
      correction_hint: "Add one more supporting idea and one closing sentence before resubmitting.",
      severity: 0.82,
    });
  }

  if (wordCount > maxWords) {
    issues.push({
      id: crypto.randomUUID(),
      category: "writing",
      subskill_key: "writing.control",
      location_ref: "whole-draft",
      span_start: 0,
      span_end: Math.max(0, text.length - 1),
      explanation: `The response is longer than the target range of ${maxWords} words.`,
      correction_hint: "Cut repetition and keep only the clearest support points.",
      severity: 0.42,
    });
  }

  const lowercaseI = /\bi\b/g;
  for (const match of text.matchAll(lowercaseI)) {
    issues.push({
      id: crypto.randomUUID(),
      category: "grammar",
      subskill_key: "writing.grammar_accuracy",
      location_ref: "capitalization",
      span_start: match.index ?? 0,
      span_end: (match.index ?? 0) + String(match[0]).length,
      explanation: "The pronoun 'I' should be capitalized.",
      correction_hint: "Review sentence-level grammar and fix pronouns before the next draft.",
      severity: 0.52,
    });
  }

  const trimmed = text.trim();
  if (trimmed && !/[.!?]$/.test(trimmed)) {
    issues.push({
      id: crypto.randomUUID(),
      category: "grammar",
      subskill_key: "writing.sentence_control",
      location_ref: "final-sentence",
      span_start: Math.max(0, text.length - 1),
      span_end: Math.max(0, text.length),
      explanation: "The draft does not end with sentence punctuation.",
      correction_hint: "Finish the final sentence clearly with a full stop, question mark, or exclamation mark.",
      severity: 0.46,
    });
  }

  const sentencePattern = /[^.!?]+[.!?]?/g;
  for (const match of text.matchAll(sentencePattern)) {
    const sentence = String(match[0] ?? "").trim();
    if (!sentence) continue;
    const sentenceWordCount = countWords(sentence);
    if (sentenceWordCount > 28) {
      const start = match.index ?? 0;
      issues.push({
        id: crypto.randomUUID(),
        category: "grammar",
        subskill_key: "writing.sentence_control",
        location_ref: "long-sentence",
        span_start: start,
        span_end: start + sentence.length,
        explanation: "One sentence is too long and hard to control clearly.",
        correction_hint: "Split the long sentence into two shorter ideas or add clearer punctuation.",
        severity: 0.58,
      });
    }
  }

  if (wordCount >= 50 && uniqueRatio < 0.45) {
    issues.push({
      id: crypto.randomUUID(),
      category: "vocabulary",
      subskill_key: "writing.vocabulary_range",
      location_ref: "whole-draft",
      span_start: 0,
      span_end: Math.max(0, text.length - 1),
      explanation: "The draft reuses the same words too often, so lexical range stays narrow.",
      correction_hint: "Replace repeated basic words with one stronger synonym or a useful collocation.",
      severity: 0.62,
    });
  }

  const connectorPattern = /\b(first|second|because|although|however|therefore|so|but)\b/i;
  if (wordCount >= 70 && !connectorPattern.test(text)) {
    issues.push({
      id: crypto.randomUUID(),
      category: "writing",
      subskill_key: "writing.coherence",
      location_ref: "whole-draft",
      span_start: 0,
      span_end: Math.max(0, text.length - 1),
      explanation: "The ideas need clearer linking words to improve flow.",
      correction_hint: "Add at least one connector such as because, however, first, or therefore.",
      severity: 0.56,
    });
  }

  if (wordCount >= 60 && countWords(text.replace(/[.!?]+/g, " ")) <= wordCount && (text.match(/[.!?]/g) ?? []).length < 2) {
    issues.push({
      id: crypto.randomUUID(),
      category: "writing",
      subskill_key: "writing.organization",
      location_ref: "whole-draft",
      span_start: 0,
      span_end: Math.max(0, text.length - 1),
      explanation: "The response would be easier to follow with more than one clear sentence.",
      correction_hint: "Break the draft into shorter sentences with one main idea in each.",
      severity: 0.54,
    });
  }

  const correctionTargets = Array.from(
    new Map(
      issues.map((issue) => [
        `${toText(issue.category, 80)}:${toText(issue.subskill_key, 120)}`,
        {
          category: toText(issue.category, 80),
          subskill_key: toText(issue.subskill_key, 120),
          label: toText(issue.explanation, 160),
        },
      ]),
    ).values(),
  );

  return {
    issues: issues.slice(0, 8),
    correctionTargets,
    wordCount,
    uniqueRatio,
  };
};

const loadPrompt = async (sb: any, productId: string, languageId: string, identifier: string): Promise<Record<string, unknown> | null> => {
  let query = sb
    .from("writing_prompts")
    .select("id, slug, title, prompt_text, guidance_text, level, genre, target_grammar, target_vocabulary, target_structure, expected_length_min, expected_length_max, status, sort_order, metadata, presentation_meta")
    .eq("product_id", productId)
    .eq("language_id", languageId)
    .eq("status", "published")
    .limit(1);
  query = isUuid(identifier) ? query.eq("id", identifier) : query.eq("slug", identifier);
  const { data, error } = await query.maybeSingle();
  if (error || !data?.id) return null;
  return data as Record<string, unknown>;
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
    const scope = await resolveLanguageScope(
      sb,
      toText(url.searchParams.get("language_code") ?? body.language_code, 16) || "en",
    );
    const products = await resolveEnglishProducts(sb);
    const productId = products.writing?.productId;
    if (!productId) return json(500, { error: "english-writing product is not configured" });

    if (req.method === "GET" && (route === "" || route === "/" || route === "/prompts")) {
      const level = toText(url.searchParams.get("level"), 8).toUpperCase();
      const limit = Math.max(1, Math.min(30, Math.floor(toNumber(url.searchParams.get("limit")) ?? 12)));

      let query = sb
        .from("writing_prompts")
        .select("id, slug, title, prompt_text, guidance_text, level, genre, target_grammar, target_vocabulary, target_structure, expected_length_min, expected_length_max, status, sort_order, metadata, presentation_meta")
        .eq("product_id", productId)
        .eq("language_id", scope.languageId)
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(limit);
      if (level) query = query.eq("level", level);

      const { data, error } = await query;
      if (error) return json(500, { error: "Failed to load writing prompts", details: error.message });
      return json(200, {
        prompts: data ?? [],
        scope: {
          product_id: productId,
          language_id: scope.languageId,
        },
      });
    }

    if (req.method === "GET" && route.startsWith("/prompts/")) {
      const identifier = decodeURIComponent(route.slice("/prompts/".length)).trim();
      if (!identifier) return json(404, { error: "Writing prompt not found" });
      const prompt = await loadPrompt(sb, productId, scope.languageId, identifier);
      if (!prompt) return json(404, { error: "Writing prompt not found" });
      return json(200, { prompt });
    }

    if (req.method === "POST" && route === "/drafts/start") {
      const identifier = toText(body.prompt_id ?? body.slug ?? body.source_ref, 120);
      if (!identifier) return json(422, { error: "prompt_id (or slug) is required" });

      const prompt = await loadPrompt(sb, productId, scope.languageId, identifier);
      if (!prompt) return json(404, { error: "Writing prompt not found" });

      const existingRes = await sb
        .from("writing_drafts")
        .select("*")
        .eq("user_id", auth.userId)
        .eq("language_id", scope.languageId)
        .eq("prompt_id", String(prompt.id))
        .in("status", ["draft", "submitted", "revising"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existingRes.error && existingRes.data?.id) {
        const cyclesRes = await sb
          .from("writing_revision_cycles")
          .select("id, revision_index, feedback_summary, issues, correction_targets, improvement_ratio, created_at")
          .eq("draft_id", String(existingRes.data.id))
          .order("revision_index", { ascending: false })
          .limit(6);
        return json(200, {
          draft: existingRes.data,
          prompt,
          revision_cycles: cyclesRes.data ?? [],
        });
      }

      const { data, error } = await sb
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
          metadata: {
            prompt_slug: toText(prompt.slug, 120),
            genre: toText(prompt.genre, 80),
          },
        })
        .select("*")
        .maybeSingle();
      if (error || !data?.id) return json(500, { error: "Failed to start writing draft", details: error?.message ?? null });

      return json(200, {
        draft: data,
        prompt,
        revision_cycles: [],
      });
    }

    if (req.method === "GET" && route.startsWith("/drafts/")) {
      const draftId = decodeURIComponent(route.slice("/drafts/".length)).trim();
      if (!draftId) return json(404, { error: "Writing draft not found" });

      const draftRes = await sb
        .from("writing_drafts")
        .select("*")
        .eq("id", draftId)
        .maybeSingle();
      if (draftRes.error || !draftRes.data?.id) return json(404, { error: "Writing draft not found" });
      if (String(draftRes.data.user_id ?? "") !== auth.userId) return json(403, { error: "Forbidden" });

      const draft = draftRes.data as Record<string, unknown>;
      const prompt = await loadPrompt(sb, productId, scope.languageId, String(draft.prompt_id ?? ""));
      if (!prompt) return json(404, { error: "Writing prompt not found" });

      const cyclesRes = await sb
        .from("writing_revision_cycles")
        .select("id, revision_index, feedback_summary, issues, correction_targets, improvement_ratio, attempt_id, created_at")
        .eq("draft_id", draftId)
        .order("revision_index", { ascending: false })
        .limit(12);

      return json(200, {
        draft,
        prompt,
        revision_cycles: cyclesRes.data ?? [],
      });
    }

    if (req.method === "POST" && route === "/drafts/submit") {
      const draftId = toText(body.draft_id, 120);
      const submissionText = toText(body.submission_text, 12000);
      if (!draftId || !submissionText) return json(422, { error: "draft_id and submission_text are required" });

      const draftRes = await sb
        .from("writing_drafts")
        .select("*")
        .eq("id", draftId)
        .maybeSingle();
      if (draftRes.error || !draftRes.data?.id) return json(404, { error: "Writing draft not found" });
      if (String(draftRes.data.user_id ?? "") !== auth.userId) return json(403, { error: "Forbidden" });
      const draft = draftRes.data as Record<string, unknown>;

      const prompt = await loadPrompt(sb, productId, scope.languageId, String(draft.prompt_id ?? ""));
      if (!prompt) return json(404, { error: "Writing prompt not found" });

      const cyclesRes = await sb
        .from("writing_revision_cycles")
        .select("id, revision_index, issues")
        .eq("draft_id", draftId)
        .order("revision_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      const previousCycle = cyclesRes.data as Record<string, unknown> | null;
      const previousIssues = Array.isArray(previousCycle?.issues) ? previousCycle?.issues as Array<Record<string, unknown>> : [];

      const analysis = detectWritingIssues(submissionText, prompt);
      const previousIssueCount = previousIssues.length;
      const improvementRatio = previousIssueCount > 0
        ? clip((previousIssueCount - analysis.issues.length) / previousIssueCount, 0, 1)
        : null;

      const contentItem = await resolveOrCreateContentItem(sb, {
        productId,
        languageId: scope.languageId,
        serviceKey: "writing",
        contentType: "writing.prompt",
        sourceRef: toText(prompt.slug, 160) || String(prompt.id),
        title: toText(prompt.title, 220),
        description: toText(prompt.prompt_text, 900),
        skillKey: "writing",
        subskillKeys: ["writing.grammar_accuracy", "writing.sentence_control", "writing.coherence", "vocabulary.usage"],
        cefrLevel: toText(prompt.level, 8),
        estimatedMinutes: Math.max(8, Math.min(30, Math.ceil(Number(prompt.expected_length_max ?? 160) / 18))),
        learningObjective: toText(prompt.guidance_text ?? prompt.prompt_text, 900),
        tags: [
          toText(prompt.genre, 80),
          toText(prompt.target_grammar, 120),
        ].filter(Boolean),
        payloadJson: {
          genre: toText(prompt.genre, 80),
          target_grammar: toText(prompt.target_grammar, 120),
          target_structure: toText(prompt.target_structure, 160),
          expected_length_min: Number(prompt.expected_length_min ?? 60),
          expected_length_max: Number(prompt.expected_length_max ?? 180),
        },
        metadata: prompt.metadata && typeof prompt.metadata === "object" ? prompt.metadata as JsonRecord : {},
      });

      const lengthPenalty = analysis.wordCount < Number(prompt.expected_length_min ?? 60)
        ? Math.min(0.35, (Number(prompt.expected_length_min ?? 60) - analysis.wordCount) / Number(prompt.expected_length_min ?? 60))
        : analysis.wordCount > Number(prompt.expected_length_max ?? 180)
        ? Math.min(0.18, (analysis.wordCount - Number(prompt.expected_length_max ?? 180)) / Number(prompt.expected_length_max ?? 180))
        : 0;
      const issuePenalty = Math.min(0.68, analysis.issues.length * 0.11);
      const lexicalPenalty = analysis.wordCount >= 50 && analysis.uniqueRatio < 0.45 ? 0.08 : 0;
      const correctnessRatio = clip(1 - lengthPenalty - issuePenalty - lexicalPenalty, 0.15, 0.98);
      const correctionQualityRatio = improvementRatio == null
        ? clip(correctnessRatio * 0.92, 0.25, 0.95)
        : clip(0.45 + (improvementRatio * 0.45) + (correctnessRatio * 0.1), 0.25, 0.98);

      const score = calculateAttemptScore({
        correctnessRatio,
        estimatedMinutes: Number(contentItem.estimated_minutes ?? 12),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        hintUsageCount: toNumber(body.hint_usage_count),
        retryCount: toNumber(body.retry_count ?? Number(draft.revision_count ?? 0)),
        correctionQualityRatio,
      });
      const feedback = buildFeedbackPayload({
        serviceKey: "writing",
        score: score.overallScore,
        title: toText(prompt.title, 220),
        reason: toText(prompt.prompt_text, 900),
        issues: analysis.issues,
      });

      const recorded = await recordEvaluatedAttempt(sb, {
        userId: auth.userId,
        languageId: scope.languageId,
        productId,
        serviceKey: "writing",
        contentItem,
        attemptType: "writing.revision",
        responseJson: {
          draft_id: draftId,
          prompt_id: String(prompt.id),
          submission_text: submissionText,
          word_count: analysis.wordCount,
          raw_issues: analysis.issues,
        },
        metadata: {
          draft_id: draftId,
          prompt_id: String(prompt.id),
          revision_index: Number(draft.revision_count ?? 0) + 1,
          genre: toText(prompt.genre, 80),
          target_grammar: toText(prompt.target_grammar, 120),
        },
        hintUsageCount: toNumber(body.hint_usage_count),
        retryCount: toNumber(body.retry_count ?? Number(draft.revision_count ?? 0)),
        timeSpentSeconds: toNumber(body.time_spent_seconds),
        score,
        feedback,
        products,
      });

      const nextRevisionIndex = Number(draft.revision_count ?? 0) + 1;
      const nextStatus = score.overallScore >= 0.8 && nextRevisionIndex > 1
        ? "completed"
        : nextRevisionIndex > 1
        ? "revising"
        : "submitted";

      const revisionCycleRes = await sb
        .from("writing_revision_cycles")
        .insert({
          draft_id: draftId,
          user_id: auth.userId,
          revision_index: nextRevisionIndex,
          submitted_text: submissionText,
          word_count: analysis.wordCount,
          issues: analysis.issues,
          correction_targets: analysis.correctionTargets,
          feedback_summary: String(recorded.feedbackRow.summary ?? ""),
          attempt_id: String(recorded.attempt.id ?? ""),
          improvement_ratio: improvementRatio,
          metadata: {
            unique_ratio: analysis.uniqueRatio,
            target_grammar: toText(prompt.target_grammar, 120),
          },
        })
        .select("*")
        .maybeSingle();
      if (revisionCycleRes.error || !revisionCycleRes.data?.id) {
        return json(500, { error: "Failed to create revision cycle", details: revisionCycleRes.error?.message ?? null });
      }

      const updatedDraftRes = await sb
        .from("writing_drafts")
        .update({
          status: nextStatus,
          current_text: submissionText,
          word_count: analysis.wordCount,
          revision_count: nextRevisionIndex,
          latest_attempt_id: String(recorded.attempt.id ?? ""),
          latest_feedback: {
            normalized_feedback: recorded.feedbackRow,
            raw_issues: analysis.issues,
            correction_targets: analysis.correctionTargets,
          },
          metadata: {
            ...(draft.metadata && typeof draft.metadata === "object" ? draft.metadata as JsonRecord : {}),
            prompt_slug: toText(prompt.slug, 120),
            genre: toText(prompt.genre, 80),
          },
        })
        .eq("id", draftId)
        .select("*")
        .maybeSingle();
      if (updatedDraftRes.error || !updatedDraftRes.data?.id) {
        return json(500, { error: "Failed to update draft", details: updatedDraftRes.error?.message ?? null });
      }

      return json(200, {
        ok: true,
        draft: updatedDraftRes.data,
        prompt,
        revision_cycle: revisionCycleRes.data,
        attempt: recorded.attempt,
        feedback: recorded.feedbackRow,
        scoring: {
          correctness_ratio: score.correctnessRatio,
          correction_quality_ratio: score.correctionQualityRatio,
          overall_score: score.overallScore,
        },
        raw_issues: analysis.issues,
        correction_targets: analysis.correctionTargets,
        signals_enqueued: recorded.signalsCount,
        errors_updated: recorded.errorsCount,
        recommendations_regenerated: recorded.recommendationsCount,
      });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});
