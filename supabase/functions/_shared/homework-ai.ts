// AI pre-marking for Academy homework (V-HW-F4).
//
// The model drafts a score, comments and a list of tagged mistakes for the
// teacher. Nothing here writes a released score: the teacher approves or edits
// the draft through academy_grading_command.
//
// Cost rule: only free OpenRouter models run unless HOMEWORK_AI_ALLOW_PAID is
// "true", so a misconfigured model id can never start spending money.

export const PREMARK_PROMPT_VERSION = "homework-premark-v1";
export const DEFAULT_PREMARK_MODEL = "google/gemma-4-31b-it:free";

export type RubricCriterion = { id: string; title: string; max: number; description?: string };

export type PremarkInput = {
  assignmentTitle: string;
  assignmentType: string;
  instructions: string;
  maxScore: number;
  rubric: RubricCriterion[] | null;
  text: string | null;
  imageUrls: string[];
};

export type PremarkMistake = { tag: string; excerpt: string | null; correction: string | null; explanation: string | null };

export type PremarkResult = {
  suggested_score: number;
  rubric_scores: Record<string, number>;
  summary: string;
  strengths: string[];
  improvements: string[];
  mistakes: PremarkMistake[];
  confidence: number;
};

export class PremarkError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

const clip = (value: unknown, max: number): string => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const roundHalf = (value: number): number => Math.round(value * 2) / 2;

export const normalizeTag = (value: unknown): string => {
  const tag = String(value ?? "").toLowerCase().trim()
    .replace(/[^a-z0-9_.:-]+/g, "_").replace(/_+/g, "_").replace(/^[_.:-]+|[_.:-]+$/g, "");
  return tag.length >= 2 ? tag.slice(0, 80) : "general";
};

export const isFreeModel = (model: string): boolean => model.endsWith(":free");

export const resolvePremarkModel = (env: (key: string) => string | undefined): string => {
  const model = (env("HOMEWORK_AI_MODEL") || env("OPENROUTER_MODEL") || DEFAULT_PREMARK_MODEL).trim();
  if (!isFreeModel(model) && env("HOMEWORK_AI_ALLOW_PAID") !== "true") {
    throw new PremarkError("paid_model_not_allowed", `Homework pre-marking refuses paid model ${model}`);
  }
  return model;
};

const SYSTEM_PROMPT = [
  "You pre-mark student homework for a teacher at an education centre. The teacher reviews every result before the student sees it.",
  "Be fair and specific. Judge only what the student actually produced. Never invent content that is not in the work.",
  "If the work is empty, unreadable or does not answer the task, give a low score and say why in the summary.",
  "Write the summary, strengths, improvements and explanations in the same language as the task instructions (default English).",
  "Tag each mistake with one short lowercase code, for example grammar.articles, grammar.tense, grammar.agreement, spelling, punctuation,",
  "vocabulary.word_choice, structure.coherence, task.incomplete, math.arithmetic, math.algebra, math.units, math.method, reading.detail, listening.detail.",
  "List at most 8 mistakes, most important first. Quote the student's words in excerpt and give the corrected form in correction.",
  "Respond ONLY with a JSON object of this shape:",
  '{"suggested_score":number,"rubric_scores":{"<criterion id>":number},"summary":string,"strengths":[string],"improvements":[string],',
  '"mistakes":[{"tag":string,"excerpt":string,"correction":string,"explanation":string}],"confidence":number between 0 and 1}',
].join("\n");

export const buildPremarkMessages = (input: PremarkInput): Array<Record<string, unknown>> => {
  const rubricText = input.rubric?.length
    ? "Rubric (score every criterion, suggested_score must equal their sum):\n" +
      input.rubric.map((c) => `- ${c.id}: ${c.title} (0-${c.max})${c.description ? ` - ${c.description}` : ""}`).join("\n")
    : `Score from 0 to ${input.maxScore}. Use an empty object for rubric_scores.`;
  const header = [
    `Assignment: ${clip(input.assignmentTitle, 300)}`,
    `Type: ${clip(input.assignmentType, 40)}`,
    `Task instructions:\n${clip(input.instructions, 4000) || "(none given)"}`,
    rubricText,
    input.text ? `Student's written answer:\n${String(input.text).slice(0, 12000)}` : "The student's written answer is empty.",
    input.imageUrls.length ? `The student also sent ${input.imageUrls.length} photo(s) of their work, attached in order.` : "",
  ].filter(Boolean).join("\n\n");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: header }];
  for (const url of input.imageUrls.slice(0, 6)) content.push({ type: "image_url", image_url: { url } });
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: input.imageUrls.length ? content : header },
  ];
};

const stringList = (value: unknown, maxItems: number, maxChars: number): string[] =>
  Array.isArray(value) ? value.map((item) => clip(item, maxChars)).filter(Boolean).slice(0, maxItems) : [];

export const parsePremark = (raw: unknown, input: PremarkInput): PremarkResult => {
  let value = raw;
  if (typeof value === "string") {
    const text = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
    try {
      value = JSON.parse(text);
    } catch {
      const start = text.indexOf("{"), end = text.lastIndexOf("}");
      if (start < 0 || end <= start) throw new PremarkError("invalid_json");
      try { value = JSON.parse(text.slice(start, end + 1)); } catch { throw new PremarkError("invalid_json"); }
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PremarkError("invalid_shape");
  const row = value as Record<string, unknown>;

  const rubricScores: Record<string, number> = {};
  let score: number;
  if (input.rubric?.length) {
    const given = (row.rubric_scores && typeof row.rubric_scores === "object") ? row.rubric_scores as Record<string, unknown> : {};
    let total = 0;
    for (const criterion of input.rubric) {
      const n = Number(given[criterion.id]);
      if (!Number.isFinite(n)) throw new PremarkError("missing_rubric_score", criterion.id);
      const bounded = Math.min(Math.max(roundHalf(n), 0), criterion.max);
      rubricScores[criterion.id] = bounded;
      total += bounded;
    }
    score = Math.round(total * 100) / 100;
  } else {
    const n = Number(row.suggested_score);
    if (!Number.isFinite(n)) throw new PremarkError("missing_score");
    score = Math.min(Math.max(roundHalf(n), 0), input.maxScore);
  }

  const mistakes: PremarkMistake[] = Array.isArray(row.mistakes)
    ? row.mistakes.slice(0, 8).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const m = item as Record<string, unknown>;
      const excerpt = clip(m.excerpt, 600) || null, correction = clip(m.correction, 600) || null;
      const explanation = clip(m.explanation, 1200) || null;
      if (!excerpt && !correction && !explanation) return [];
      return [{ tag: normalizeTag(m.tag), excerpt, correction, explanation }];
    })
    : [];
  const confidence = Number(row.confidence);
  return {
    suggested_score: score,
    rubric_scores: rubricScores,
    summary: clip(row.summary, 4000),
    strengths: stringList(row.strengths, 3, 500),
    improvements: stringList(row.improvements, 3, 500),
    mistakes,
    confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0.5,
  };
};

export type PremarkCallOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  referer?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

export const callPremarkModel = async (
  input: PremarkInput,
  options: PremarkCallOptions,
): Promise<{ result: PremarkResult; model: string; tokens: number | null }> => {
  if (!options.apiKey) throw new PremarkError("ai_unconfigured");
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(`${(options.baseUrl || "https://openrouter.ai/api/v1").replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": options.referer || "https://schood.online",
      "X-Title": "Schood Homework OS",
    },
    body: JSON.stringify({
      model: options.model,
      messages: buildPremarkMessages(input),
      temperature: 0.2,
      max_tokens: 1800,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 30000),
  }).catch((error) => {
    throw new PremarkError("provider_unreachable", error instanceof Error ? error.message : "fetch failed");
  });
  const text = await response.text();
  if (!response.ok) {
    const lowered = text.toLowerCase();
    if (input.imageUrls.length && /image|vision|multimodal|image_url|unsupported/.test(lowered)) throw new PremarkError("vision_unavailable");
    throw new PremarkError(response.status === 429 ? "rate_limited" : "provider_error", `HTTP ${response.status}`);
  }
  if (text.length > 200000) throw new PremarkError("response_too_large");
  let body: Record<string, unknown>;
  try { body = JSON.parse(text); } catch { throw new PremarkError("invalid_provider_json"); }
  const choice = (body.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const message = choice?.message as Record<string, unknown> | undefined;
  if (!message || typeof message.content !== "string") throw new PremarkError("empty_response");
  const usage = body.usage as Record<string, unknown> | undefined;
  return {
    result: parsePremark(message.content, input),
    model: String(body.model ?? options.model),
    tokens: Number.isFinite(Number(usage?.total_tokens)) ? Number(usage?.total_tokens) : null,
  };
};
