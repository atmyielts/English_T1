import { boundedJson } from "../_shared/ai-response.ts";
export { boundedJson } from "../_shared/ai-response.ts";
import {
  buildUserPrompt,
  IELTS_SYSTEM_PROMPT,
  ITEP_SYSTEM_PROMPT,
} from "./prompts.ts";

export type WritingInput = {
  essay: string;
  prompt: string;
  exam_type: "ielts" | "itep";
  task_type: "task1" | "task2";
  word_count: number;
};
export type WritingFeedback = {
  exam_type: string;
  task_type: string;
  word_count: number;
  overall_band: number;
  criteria: Record<string, number>;
  strengths: string[];
  improvements: string[];
  actionable_feedback: string[];
  feedback: string;
  word_count_comment: string;
  model: string;
  tokens_used: number | null;
};
export function writingInput(body: Record<string, unknown>): WritingInput {
  if (
    typeof body.essay !== "string" || body.essay.trim().length < 50 ||
    body.essay.length > 20000 || body.essay.includes("\0")
  ) throw new Error("Enter an essay of 50–20,000 characters.");
  if (
    typeof body.prompt !== "string" || body.prompt.trim().length < 10 ||
    body.prompt.length > 5000 || body.prompt.includes("\0")
  ) {
    throw new Error(
      "Include the writing task and any source figures (10–5,000 characters).",
    );
  }
  if (
    !["ielts", "itep"].includes(String(body.exam_type)) ||
    !["task1", "task2"].includes(String(body.task_type))
  ) throw new Error("Choose a supported exam and task.");
  return {
    essay: body.essay.trim(),
    prompt: body.prompt.trim(),
    exam_type: body.exam_type as WritingInput["exam_type"],
    task_type: body.task_type as WritingInput["task_type"],
    word_count: body.essay.trim().split(/\s+/).length,
  };
}
export function writingFeedback(
  raw: unknown,
  input: WritingInput,
  model: string,
  tokens: unknown,
): WritingFeedback {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("invalid_provider_result");
  }
  const data = raw as Record<string, unknown>,
    max = input.exam_type === "itep" ? 6 : 9;
  const score = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 &&
    value <= max;
  if (!score(data.overall_band)) throw new Error("invalid_provider_score");
  const overall = data.overall_band as number,
    step = input.exam_type === "itep" ? 10 : 2;
  if (Math.abs(overall * step - Math.round(overall * step)) > 1e-8) {
    throw new Error("invalid_provider_score");
  }
  if (
    !data.criteria || typeof data.criteria !== "object" ||
    Array.isArray(data.criteria)
  ) throw new Error("invalid_provider_criteria");
  const criteria: Record<string, number> = {};
  for (const key of ["TR", "CC", "LR", "GRA"]) {
    const value = (data.criteria as Record<string, unknown>)[key];
    if (!score(value)) throw new Error("invalid_provider_criteria");
    criteria[key] = value as number;
  }
  const text = (key: string, max: number) => {
    const value = data[key];
    if (
      typeof value !== "string" || !value.trim() || value.length > max ||
      value.includes("\0")
    ) throw new Error("invalid_provider_text");
    return value.trim();
  };
  const list = (key: string) => {
    const values = data[key];
    if (
      !Array.isArray(values) || values.length > 3 ||
      values.some((value) =>
        typeof value !== "string" || !value.trim() || value.length > 1000 ||
        value.includes("\0")
      )
    ) throw new Error("invalid_provider_advice");
    return values.map((value) => value.trim()) as string[];
  };
  const feedback = {
    exam_type: input.exam_type,
    task_type: input.task_type,
    word_count: input.word_count,
    overall_band: overall,
    criteria,
    strengths: list("strengths"),
    improvements: list("improvements"),
    actionable_feedback: list("actionable_feedback"),
    feedback: text("feedback", 8000),
    word_count_comment: text("word_count_comment", 1000),
    model,
    tokens_used:
      typeof tokens === "number" && Number.isInteger(tokens) && tokens >= 0 &&
        tokens <= 100000
        ? tokens
        : null,
  };
  // Leave room for database JSON spacing and the receipt inside the 64 KiB ledger limit.
  if (
    typeof model !== "string" || !model.trim() || model.length > 200 ||
    new TextEncoder().encode(JSON.stringify(feedback)).length > 60000
  ) throw new Error("invalid_provider_result");
  return feedback;
}
export function createWritingGrader(
  config: { key: string; model: string; baseUrl: string; referer: string },
  fetcher: typeof fetch = fetch,
) {
  return async (input: WritingInput): Promise<WritingFeedback> => {
    const response = await fetcher(
      `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        signal: AbortSignal.timeout(25000),
        headers: {
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
          "X-Title": "Schood Writing Tutor",
          "HTTP-Referer": config.referer,
        },
        body: JSON.stringify({
          model: config.model,
          stream: false,
          temperature: 0.3,
          max_tokens: 1800,
          messages: [{
            role: "system",
            content: input.exam_type === "itep"
              ? ITEP_SYSTEM_PROMPT
              : IELTS_SYSTEM_PROMPT,
          }, {
            role: "user",
            content: buildUserPrompt(
              input.exam_type,
              input.task_type,
              input.prompt,
              input.essay,
              input.word_count,
            ),
          }],
          response_format: { type: "json_object" },
        }),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("provider_http_" + response.status);
    }
    const payload = await boundedJson(response, 65536) as {
      choices?: { message?: { content?: unknown }; finish_reason?: string }[];
      usage?: { total_tokens?: unknown };
    };
    const choice = payload?.choices?.[0];
    if (
      choice?.finish_reason !== "stop" ||
      typeof choice.message?.content !== "string"
    ) throw new Error("invalid_provider_result");
    return writingFeedback(
      JSON.parse(choice.message.content),
      input,
      config.model,
      payload?.usage?.total_tokens,
    );
  };
}
