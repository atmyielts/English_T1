// Writing depth routes (writing-workbench):
//   POST /prompts/:slug/draft         autosave the learner's draft to the account
//   POST /prompts/:slug/model-answer  short model answer at the learner's level + 1 (after a first submit; cached)
//   GET  /rubric-history              the four criteria over the learner's recent submissions
//   POST /free/check                  feedback on any text (the "Check any text" tool), same engine as tasks
// Helpers used by submit: the previous revision for draft-vs-draft comparison.

import { json, toText, type EnglishProductInfo, type EnglishServiceKey } from "../_shared/english-learning.ts";
import { requireEnglishSuiteAccess } from "../_shared/english-access.ts";
import { callEnglishAIWithCredit, defaultAICreditDeps } from "../_shared/english-ai-quota.ts";
import { buildWritingAIRequest, buildWritingFeedback, countWords, parseChecklist, type WritingPromptSpec } from "../_shared/english-writing.ts";
import {
  buildModelAnswerRequest,
  type Cefr,
  modelAnswerLength,
  modelAnswerLevel,
  normalizeModelAnswer,
  readCriteria,
  type RubricPoint,
} from "../_shared/english-writing-depth.ts";

type JsonRecord = Record<string, unknown>;

const MAX_TEXT = 12000;

const asRecord = (value: unknown): JsonRecord => (value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {});

export type DepthContext = {
  sb: any;
  req: Request;
  route: string;
  url: URL;
  body: JsonRecord;
  userId: string;
  languageId: string;
  productId: string;
  products: Record<EnglishServiceKey, EnglishProductInfo>;
  loadPrompt: (identifier: string) => Promise<JsonRecord | null>;
  publicPrompt: (prompt: JsonRecord) => JsonRecord;
};

/** The learner's writing level: rating, then placement, then the overall estimate. */
export const learnerWritingLevel = async (sb: any, userId: string, languageId: string): Promise<string | null> => {
  const { data } = await sb
    .from("learner_language_goals")
    .select("current_cefr_estimate, metadata")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .maybeSingle();
  const meta = asRecord(data?.metadata);
  const rated = asRecord(asRecord(asRecord(meta.skill_ratings).skills).writing).level;
  const placed = asRecord(asRecord(meta.placement).per_skill).writing;
  const placedLevel = typeof placed === "string" ? placed : asRecord(placed).level;
  return [rated, placedLevel, data?.current_cefr_estimate].map((value) => toText(value, 4).toUpperCase()).find((value) => /^[ABC][12]$/.test(value)) ?? null;
};

export const latestDraftRow = async (sb: any, userId: string, languageId: string, promptId: string): Promise<JsonRecord | null> => {
  const { data } = await sb
    .from("writing_drafts")
    .select("id, status, current_text, word_count, revision_count, latest_feedback, updated_at")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("prompt_id", promptId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? data as JsonRecord : null;
};

export type PreviousRevision = {
  revision: number;
  text: string;
  overall: number | null;
  criteria: Partial<Record<string, number>>;
  submitted_at: string | null;
};

/** The newest submitted revision of a draft, with its criteria (older rows: read from the attempt). */
export const loadPreviousRevision = async (sb: any, draftId: string | null): Promise<PreviousRevision | null> => {
  if (!draftId) return null;
  const { data } = await sb
    .from("writing_revision_cycles")
    .select("revision_index, submitted_text, metadata, attempt_id, created_at")
    .eq("draft_id", draftId)
    .order("revision_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const meta = asRecord(data.metadata);
  let criteria = readCriteria(meta.criteria);
  if (!Object.keys(criteria).length && data.attempt_id) {
    const attempt = await sb
      .from("learning_attempts")
      .select("criteria:response_json->feedback->criteria")
      .eq("id", String(data.attempt_id))
      .maybeSingle();
    criteria = readCriteria(attempt.data?.criteria);
  }
  const overall = Number(meta.overall);
  return {
    revision: Number(data.revision_index ?? 0),
    text: toText(data.submitted_text, MAX_TEXT),
    overall: Number.isFinite(overall) ? Math.round(overall) : null,
    criteria,
    submitted_at: data.created_at ? String(data.created_at) : null,
  };
};

/** Short list of submitted revisions for the task page ("draft 2 · 64"). */
export const loadRevisionList = async (sb: any, draftId: string | null): Promise<Array<{ revision: number; overall: number | null; at: string }>> => {
  if (!draftId) return [];
  const { data } = await sb
    .from("writing_revision_cycles")
    .select("revision_index, metadata, created_at")
    .eq("draft_id", draftId)
    .order("revision_index", { ascending: false })
    .limit(8);
  return ((data ?? []) as JsonRecord[]).map((row) => {
    const overall = Number(asRecord(row.metadata).overall);
    return { revision: Number(row.revision_index ?? 0), overall: Number.isFinite(overall) ? Math.round(overall) : null, at: String(row.created_at ?? "") };
  }).reverse();
};

/** Words (text) of the learner's own notebook entries, for the AI to notice. */
export const loadWordTexts = async (sb: any, userId: string, ids: string[]): Promise<string[]> => {
  const wanted = [...new Set(ids.map(String).filter(Boolean))].slice(0, 5);
  if (!wanted.length) return [];
  const { data } = await sb.from("user_vocabulary_notebook_entries").select("word").eq("user_id", userId).in("id", wanted);
  return ((data ?? []) as JsonRecord[]).map((row) => toText(row.word, 60)).filter(Boolean);
};

/** Writing request with the learner's practice words added, so the vocabulary comment can count them. */
export const writingRequestWithWords = (text: string, spec: WritingPromptSpec, words: string[]) => {
  const base = buildWritingAIRequest(text, spec);
  if (!words.length) return base;
  const payload = JSON.parse(base.userPayload) as JsonRecord;
  payload.learner_saved_words = words;
  return {
    ...base,
    systemPrompt: `${base.systemPrompt} learner_saved_words are words the learner is practising: in the vocabulary comment, say which of them they used well (or suggest one).`,
    userPayload: JSON.stringify(payload),
  };
};

const autosave = async (ctx: DepthContext, prompt: JsonRecord): Promise<Response> => {
  const text = toText(ctx.body.text, MAX_TEXT);
  const wordCount = countWords(text);
  const existing = await latestDraftRow(ctx.sb, ctx.userId, ctx.languageId, String(prompt.id));
  if (existing) {
    if (toText(existing.current_text, MAX_TEXT) === text) {
      return json(200, { ok: true, saved_at: existing.updated_at ?? null, unchanged: true });
    }
    const status = Number(existing.revision_count ?? 0) > 0 ? "revising" : "draft";
    const { data, error } = await ctx.sb
      .from("writing_drafts")
      .update({ current_text: text, word_count: wordCount, status })
      .eq("id", String(existing.id))
      .eq("user_id", ctx.userId)
      .select("updated_at")
      .maybeSingle();
    if (error) return json(500, { error: "Could not save your draft." });
    return json(200, { ok: true, saved_at: data?.updated_at ?? new Date().toISOString() });
  }
  if (!text.trim()) return json(200, { ok: true, saved_at: null, unchanged: true });
  const { data, error } = await ctx.sb
    .from("writing_drafts")
    .insert({
      user_id: ctx.userId,
      language_id: ctx.languageId,
      product_id: ctx.productId,
      prompt_id: String(prompt.id),
      status: "draft",
      current_text: text,
      word_count: wordCount,
      revision_count: 0,
      metadata: { prompt_slug: toText(prompt.slug, 160) },
    })
    .select("updated_at")
    .maybeSingle();
  if (error) return json(500, { error: "Could not save your draft." });
  return json(200, { ok: true, saved_at: data?.updated_at ?? new Date().toISOString() });
};

const modelAnswer = async (ctx: DepthContext, prompt: JsonRecord): Promise<Response> => {
  // Only after the learner has written and submitted their own text.
  const draft = await latestDraftRow(ctx.sb, ctx.userId, ctx.languageId, String(prompt.id));
  if (!draft || Number(draft.revision_count ?? 0) < 1) {
    return json(409, { error: "Send your own text for feedback first, then you can see a model answer.", code: "submit_first" });
  }
  const level: Cefr = modelAnswerLevel(await learnerWritingLevel(ctx.sb, ctx.userId, ctx.languageId), prompt.level);
  const cached = await ctx.sb
    .from("english_writing_model_answers")
    .select("answer_text, notes, word_count")
    .eq("prompt_id", String(prompt.id))
    .eq("level", level)
    .maybeSingle();
  if (cached.data?.answer_text) {
    return json(200, {
      ok: true,
      level,
      text: String(cached.data.answer_text),
      notes: Array.isArray(cached.data.notes) ? cached.data.notes.map(String).slice(0, 3) : [],
      word_count: Number(cached.data.word_count ?? 0),
      cached: true,
    });
  }
  const access = await requireEnglishSuiteAccess(ctx.sb, ctx.userId, ctx.products);
  if (!access.allowed) return json(403, { error: "Model answers need an English plan.", code: "english_entitlement_required" });
  const meta = asRecord(prompt.metadata);
  const length = modelAnswerLength(Number(prompt.expected_length_min ?? 60), Number(prompt.expected_length_max ?? 150));
  const result = await callEnglishAIWithCredit<unknown>(
    defaultAICreditDeps(ctx.sb),
    ctx.userId,
    {
      ...buildModelAnswerRequest({
        level,
        title: toText(prompt.title, 220),
        task: toText(prompt.prompt_text, 2000),
        points: parseChecklist(toText(prompt.guidance_text, 2000)),
        genre: toText(prompt.genre, 80) || null,
        audience: toText(meta.audience, 200) || null,
        length,
      }),
      feature: "writing-model-answer",
      userId: ctx.userId,
    },
    null,
  );
  if (result.over_limit) return json(429, { error: "Daily English AI limit reached. Try again tomorrow.", code: "english_ai_daily_limit_reached" });
  const answer = result.status === "ok" ? normalizeModelAnswer(result.data, length) : null;
  if (!answer) return json(200, { ok: false, level, text: null, notes: [], word_count: 0, cached: false, ai_status: result.status });
  await ctx.sb
    .from("english_writing_model_answers")
    .upsert({ prompt_id: String(prompt.id), level, answer_text: answer.text, notes: answer.notes, word_count: answer.word_count }, { onConflict: "prompt_id,level" });
  return json(200, { ok: true, level, ...answer, cached: false });
};

const rubricHistory = async (ctx: DepthContext): Promise<Response> => {
  const { data, error } = await ctx.sb
    .from("learning_attempts")
    .select("submitted_at, content_item_id, criteria:response_json->feedback->criteria, overall:response_json->feedback->overall, source:response_json->feedback->source")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .eq("service_key", "writing")
    .eq("attempt_type", "writing.submission")
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(30);
  if (error) return json(500, { error: "Could not load your writing history." });
  const rows = (data ?? []) as JsonRecord[];
  const itemIds = [...new Set(rows.map((row) => String(row.content_item_id ?? "")).filter(Boolean))];
  const titles = new Map<string, { title: string; slug: string }>();
  if (itemIds.length) {
    const items = await ctx.sb.from("learning_content_registry_items").select("id, title, source_ref").in("id", itemIds);
    for (const item of (items.data ?? []) as JsonRecord[]) titles.set(String(item.id), { title: toText(item.title, 160), slug: toText(item.source_ref, 160) });
  }
  const points = rows.map((row): RubricPoint => {
    const overall = Number(row.overall);
    const item = titles.get(String(row.content_item_id ?? ""));
    return {
      at: String(row.submitted_at),
      overall: Number.isFinite(overall) ? Math.round(overall) : null,
      criteria: readCriteria(row.criteria),
      title: item?.title ?? null,
      slug: item?.slug ?? null,
      source: row.source === "ai" || row.source === "basic" ? row.source : null,
    };
  }).filter((point) => Object.keys(point.criteria).length > 0);
  return json(200, { points: points.reverse() });
};

const freeCheck = async (ctx: DepthContext): Promise<Response> => {
  const text = toText(ctx.body.text, 5000);
  const task = toText(ctx.body.task ?? ctx.body.prompt, 600);
  const levelIn = toText(ctx.body.target_level ?? ctx.body.level, 4).toUpperCase();
  const words = countWords(text);
  if (words < 15) return json(422, { error: "Write at least 15 words to get feedback.", code: "too_short", min_words: 15 });
  const access = await requireEnglishSuiteAccess(ctx.sb, ctx.userId, ctx.products);
  if (!access.allowed) return json(403, { error: "An active English plan is needed for this tool.", code: "english_entitlement_required" });
  const level = /^[ABC][12]$/.test(levelIn) ? levelIn : (await learnerWritingLevel(ctx.sb, ctx.userId, ctx.languageId)) ?? "B1";
  // The learner's own text has no set length: the range is built around it so length never costs points.
  const spec: WritingPromptSpec = {
    title: "Your own text",
    prompt_text: task || "Free writing on a topic the learner chose.",
    guidance_text: null,
    level,
    genre: null,
    target_grammar: null,
    target_vocabulary: [],
    target_structure: null,
    expected_length_min: Math.max(15, Math.round(words * 0.8)),
    expected_length_max: Math.max(30, Math.round(words * 1.5)),
    checklist_keywords: null,
  };
  const ai = await callEnglishAIWithCredit<unknown>(
    defaultAICreditDeps(ctx.sb),
    ctx.userId,
    { ...buildWritingAIRequest(text, spec), feature: "writing-free-check", userId: ctx.userId },
    null,
  );
  const feedback = buildWritingFeedback(text, spec, ai.over_limit ? null : { status: ai.status, data: ai.data });
  return json(200, { ok: true, level, over_limit: Boolean(ai.over_limit), feedback });
};

/** Handles the depth routes; returns null for any other route. */
export const handleWritingDepthRoute = async (ctx: DepthContext): Promise<Response | null> => {
  const { req, route } = ctx;
  if (req.method === "GET" && route === "/rubric-history") return await rubricHistory(ctx);
  if (req.method === "POST" && route === "/free/check") return await freeCheck(ctx);
  const match = /^\/prompts\/([^/]+)\/(draft|model-answer)$/.exec(route);
  if (!match || req.method !== "POST") return null;
  let identifier = "";
  try {
    identifier = decodeURIComponent(match[1]!).trim();
  } catch {
    return json(404, { error: "Writing task not found" });
  }
  const prompt = identifier ? await ctx.loadPrompt(identifier) : null;
  if (!prompt) return json(404, { error: "Writing task not found" });
  return match[2] === "draft" ? await autosave(ctx, prompt) : await modelAnswer(ctx, prompt);
};
