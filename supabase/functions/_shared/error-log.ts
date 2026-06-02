// Lightweight error-logging helper for edge functions. Writes a row to
// public.app_function_error_log on a caught error so the admin surface can
// show us what's actually breaking in prod — Supabase's built-in logs are
// gated behind a personal access token, so we maintain our own table.
//
// Usage:
//   try { ... } catch (err) {
//     await logFunctionError(sb, {
//       function_name: "ielts-practice",
//       route: route,
//       user_id: auth?.userId ?? null,
//       error: err,
//       request_summary: { method: req.method, ... }, // small, no PII
//     });
//     return json(500, { error: err.message });
//   }
//
// Best-effort. Never throws from inside this helper.

export type LogFunctionErrorInput = {
  function_name: string;
  route?: string | null;
  http_status?: number | null;
  user_id?: string | null;
  error: unknown;
  request_summary?: Record<string, unknown>;
};

const sanitizeSummary = (input: Record<string, unknown> | undefined): Record<string, unknown> => {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (raw == null) continue;
    if (typeof raw === "string") {
      // Trim long strings, never log full request bodies (likely contain user content)
      out[key] = raw.length > 240 ? `${raw.slice(0, 240)}…(${raw.length}ch)` : raw;
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      out[key] = raw;
    } else if (Array.isArray(raw)) {
      out[key] = `array(${raw.length})`;
    } else if (typeof raw === "object") {
      out[key] = `object(${Object.keys(raw as Record<string, unknown>).length} keys)`;
    }
  }
  return out;
};

export const logFunctionError = async (
  sb: any,
  input: LogFunctionErrorInput,
): Promise<void> => {
  try {
    const message = input.error instanceof Error
      ? input.error.message
      : typeof input.error === "string"
        ? input.error
        : "Unknown error";
    const stack = input.error instanceof Error && input.error.stack
      ? input.error.stack.slice(0, 4000)
      : null;
    await sb.from("app_function_error_log").insert({
      function_name: String(input.function_name).slice(0, 80),
      route: input.route ? String(input.route).slice(0, 400) : null,
      http_status: input.http_status ?? null,
      user_id: input.user_id ?? null,
      error_message: message.slice(0, 2000),
      error_stack: stack,
      request_summary: sanitizeSummary(input.request_summary),
    });
  } catch {
    // Swallow: error logging must never become its own error source.
  }
};
