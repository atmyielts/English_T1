import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-peer-review-client-version", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", "X-Peer-Review-Version": "2", "Access-Control-Expose-Headers": "X-Peer-Review-Version" },
});
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const commands = new Set(["submit", "queue", "get_submission", "claim_submission", "release_submission", "submit_review", "set_sharing", "my_submissions", "my_reviews", "rate_helpful"]);
const mutations = new Set(["submit", "claim_submission", "release_submission", "submit_review", "set_sharing", "rate_helpful"]);
const unavailable = () => json(503, { error: "Peer Review is temporarily unavailable. Your work has not been cleared; please retry." });

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const reader = req.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 100_000) { await reader.cancel(); throw new RangeError("Request too large"); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  const body = JSON.parse(text);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SyntaxError("Expected an object");
  return body;
}

export function createPeerReviewHandler(deps: {
  client: SupabaseClient;
  authenticate: (token: string) => Promise<string | null>;
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (!["GET", "POST"].includes(req.method)) return json(405, { error: "Method not allowed" });
    const token = req.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) return json(401, { error: "Sign in to use Peer Review" });
    try {
      const actor = await deps.authenticate(token);
      if (!actor) return json(401, { error: "Your session expired. Sign in again." });
      const url = new URL(req.url);
      let body: Record<string, unknown> = {};
      if (req.method === "POST") {
        try { body = await readBody(req); }
        catch (error) {
          return json(error instanceof RangeError ? 413 : 400, { error: error instanceof RangeError ? "Request too large" : "Invalid JSON request" });
        }
      }
      const action = String(url.searchParams.get("action") || body.action || "queue").toLowerCase();
      if (mutations.has(action) && req.method !== "POST") return json(405, { error: "Use POST for this action" });
      if (mutations.has(action) && req.headers.get("X-Peer-Review-Client-Version") !== "2") return json(409, { error: "Refresh Peer Review to use the updated privacy controls. Your draft has not been cleared." });
      if (commands.has(action)) {
        const payload = { ...body };
        if (action === "get_submission") payload.submission_id = url.searchParams.get("submission_id") || body.submission_id;
        if (["get_submission", "claim_submission", "release_submission", "submit_review", "set_sharing"].includes(action) && !uuid.test(String(payload.submission_id ?? ""))) {
          return json(400, { error: "A valid submission id is required" });
        }
        if (action === "rate_helpful" && (!uuid.test(String(payload.review_id ?? "")) || typeof payload.is_helpful !== "boolean")) {
          return json(400, { error: "A valid review id and helpful rating are required" });
        }
        const { data, error } = await deps.client.rpc("peer_review_command", { p_actor: actor, p_action: action, p_payload: payload });
        if (error) {
          if (["PT400", "PT403", "PT404", "PT409"].includes(error.code)) return json(Number(error.code.slice(2)), { error: error.message });
          if (error.code === "22P02") return json(400, { error: "Invalid request values" });
          return unavailable();
        }
        if (!data || typeof data !== "object" || Array.isArray(data)) return unavailable();
        return json(200, data);
      }
      return json(404, { error: "Unknown action" });
    } catch { return unavailable(); }
  };
}
