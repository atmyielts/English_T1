// TOEFL iBT 2026 writing rubric profile for grade-writing / grade-writing-v2.
// The rubric text summarises the ETS 2026 scoring guides for "Write an Email"
// and "Write for an Academic Discussion" (0-5 each) in our own words.

type Json = Record<string, unknown>;

export const TOEFL_2026_FREE_MODEL = "google/gemma-4-31b-it:free";

export const TOEFL_2026_WRITING_PROFILE = {
  key: "toefl2026",
  defaultAppName: "Schood TOEFL iBT",
  systemInstruction: [
    "You are an experienced rater for TOEFL iBT practice writing in the 2026 format.",
    "Score each task with one whole number from 0 to 5.",
    "Task type toefl_email (Write an Email, 7 minutes):",
    "5 = fully successful: every requested goal is achieved, elaboration clearly serves the purpose, varied and precise language, appropriate politeness/register for the reader, almost no errors beyond typical timed-writing slips.",
    "4 = generally successful: goals achieved with adequate elaboration, some variety, mostly appropriate tone, few errors (for example one consequential verb-form error keeps a response at 4).",
    "3 = partially successful: the task is generally done but parts are unclear, elaboration is partial, range is moderate, noticeable errors in structure, word form or tone.",
    "2 = mostly unsuccessful: an attempt with limited or irrelevant elaboration, limited range, accumulated errors.",
    "1 = unsuccessful: very little elaboration, telegraphic or disconnected language, serious frequent errors, or mostly copied from the prompt.",
    "0 = blank, off-topic, not English, copied entirely from the prompt, or random keystrokes.",
    "Task type toefl_academic_discussion (Write for an Academic Discussion, 10 minutes):",
    "5 = a relevant, very clearly expressed contribution with well-elaborated reasons, examples or details, a variety of structures, precise idiomatic word choice and almost no errors.",
    "4 = a relevant contribution that is easy to follow, adequately elaborated, with some variety and few errors.",
    "3 = mostly relevant and understandable but part of the explanation is missing, unclear or irrelevant, with some noticeable errors.",
    "2 = an attempt whose ideas are poorly elaborated or partly relevant, with limited range and accumulated errors.",
    "1 = few or no coherent ideas, severely limited language, or mostly borrowed from the posts.",
    "0 = blank, off-topic, not English, copied, or arbitrary keystrokes.",
    "A good discussion answer states its own position and engages with the discussion rather than repeating the student posts; about 100 words or more is typical of effective answers but length alone never earns a score.",
    "Judge the learner's language, not their opinion. Be consistent and do not be lenient.",
    "Give short, concrete, encouraging feedback in English that a learner can act on.",
    "Return ONLY valid JSON with no markdown and no extra prose.",
  ].join(" "),
  outputSchema: {
    tasks: [
      {
        content_unit_id: "uuid",
        task_type: "toefl_email|toefl_academic_discussion",
        word_count: 0,
        score: 0,
        criteria: { task_achievement: 0, elaboration: 0, language_range: 0, accuracy_and_conventions: 0 },
        strengths: ["short bullet"],
        improvements: ["short bullet"],
        actionable_feedback: ["concrete action"],
        feedback: "short paragraph",
      },
    ],
    notes: "short paragraph",
  },
};

export const toefl2026WritingModels = (getEnv: (key: string) => string | null): string[] => {
  const primary = getEnv("TOEFL_WRITING_MODEL") ?? getEnv("OPENROUTER_MODEL") ?? TOEFL_2026_FREE_MODEL;
  const fallbacks = String(getEnv("OPENROUTER_FALLBACK_MODELS") ?? TOEFL_2026_FREE_MODEL)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return Array.from(new Set([primary, ...fallbacks]));
};

const finite = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const strings = (value: unknown, max = 6): string[] =>
  Array.isArray(value) ? value.map((v) => String(v ?? "").trim()).filter(Boolean).slice(0, max).map((v) => v.slice(0, 400)) : [];

/** Clamps every task to a whole 0-5 score and keeps only tasks that were sent. */
export const normalizeToefl2026WritingResult = (
  raw: Json,
  tasks: Array<{ content_unit_id: string; task_type?: string | null; word_count?: number }>,
): Json => {
  const byId = new Map<string, Json>();
  const list = Array.isArray(raw?.tasks) ? (raw.tasks as unknown[]) : [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const t = entry as Json;
    const id = String(t.content_unit_id ?? "");
    if (id) byId.set(id, t);
  }
  // Models sometimes drop ids; fall back to order when the counts match.
  const ordered = list.filter((e) => e && typeof e === "object") as Json[];
  const normalized = tasks.map((task, index) => {
    const source = byId.get(task.content_unit_id) ?? (ordered.length === tasks.length ? ordered[index] : null) ?? {};
    const score = finite(source.score) ?? finite(source.band);
    const criteria = source.criteria && typeof source.criteria === "object" ? (source.criteria as Json) : {};
    return {
      content_unit_id: task.content_unit_id,
      task_type: task.task_type ?? null,
      word_count: task.word_count ?? finite(source.word_count) ?? 0,
      score: score == null ? null : Math.max(0, Math.min(5, Math.round(score))),
      criteria: Object.fromEntries(
        Object.entries(criteria)
          .map(([k, v]) => [k, finite(v)])
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, Math.max(0, Math.min(5, Math.round(v as number)))]),
      ),
      strengths: strings(source.strengths),
      improvements: strings(source.improvements),
      actionable_feedback: strings(source.actionable_feedback),
      feedback: String(source.feedback ?? "").slice(0, 2000),
    };
  });
  // A blank answer is a 0 by the ETS guide regardless of what the model said.
  for (const t of normalized) if ((t.word_count ?? 0) === 0) t.score = 0;
  return {
    tasks: normalized,
    notes: String(raw?.notes ?? "").slice(0, 2000),
    rubric: "toefl-2026",
    scale: "0-5",
    score_version: "toefl-2026-writing-estimate-v1",
    is_estimated: true,
  };
};
