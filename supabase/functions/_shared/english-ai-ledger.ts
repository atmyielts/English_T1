// Ledger of English AI calls (public.english_ai_calls). One row per call or
// refused call: who, which feature, provider/model, outcome, latency, sizes
// and token counts. No prompt or answer text is ever stored.
//
// Writing is fire-and-forget: it never throws and never delays the response
// (on Supabase Edge the insert is handed to EdgeRuntime.waitUntil).

import { englishServiceClient } from "./english-settings.ts";

export type EnglishAICallStatus = "ok" | "failed" | "unconfigured" | "disabled" | "over_limit";

export type EnglishAICallRecord = {
  feature?: string | null;
  userId?: string | null;
  provider?: string | null;
  model?: string | null;
  status: EnglishAICallStatus;
  latencyMs?: number | null;
  inputChars?: number | null;
  outputChars?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  error?: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const count = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(2_000_000_000, Math.round(value)) : null;

/** Removes anything that looks like a key or bearer token from provider error text. */
const scrubError = (text: string): string =>
  text
    .replace(/\b(sk|rk|pk)-[A-Za-z0-9_-]{8,}/g, "[key]")
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [key]")
    .replace(/\s+/g, " ")
    .trim();

/** The row as stored: clamped numbers, valid uuid or null, short scrubbed error. */
export const ledgerRow = (record: EnglishAICallRecord) => ({
  user_id: record.userId && UUID.test(record.userId) ? record.userId : null,
  feature: String(record.feature ?? "").trim().toLowerCase().slice(0, 48) || "unknown",
  provider: record.provider ? String(record.provider).slice(0, 32) : null,
  model: record.model ? String(record.model).slice(0, 120) : null,
  status: record.status,
  latency_ms: count(record.latencyMs),
  input_chars: count(record.inputChars),
  output_chars: count(record.outputChars),
  prompt_tokens: count(record.promptTokens),
  completion_tokens: count(record.completionTokens),
  error: record.error ? scrubError(String(record.error)).slice(0, 300) || null : null,
});

const keepAlive = (promise: Promise<unknown>) => {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  try {
    runtime?.waitUntil?.(promise);
  } catch {
    // Older runtimes: the promise still runs on its own.
  }
};

/** Writes one ledger row in the background. Never throws. */
export const recordEnglishAICall = (record: EnglishAICallRecord, sb?: any): void => {
  try {
    const client = sb ?? englishServiceClient();
    if (!client) return;
    const write = Promise.resolve(client.from("english_ai_calls").insert(ledgerRow(record)))
      .then((result: { error?: { message?: string } | null }) => {
        if (result?.error) {
          console.warn(JSON.stringify({ event: "english_ai_ledger_write_failed", error: String(result.error.message ?? "").slice(0, 200) }));
        }
      })
      .catch((error: unknown) => {
        console.warn(JSON.stringify({ event: "english_ai_ledger_write_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
      });
    keepAlive(write);
  } catch {
    // Logging must never affect the learner.
  }
};
