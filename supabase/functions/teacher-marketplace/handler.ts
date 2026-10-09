import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-marketplace-client-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-Marketplace-Version",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Marketplace-Version": "2",
    },
  });
const publicActions = new Set(["teachers", "jobs"]);
const privateActions = new Set([
  "manageable_tenants",
  "get_my_profile",
  "upsert_profile",
  "my_applications",
  "post_job",
  "my_jobs",
  "close_job",
  "apply",
  "list_applications",
  "update_application_status",
]);
const mutations = new Set(["upsert_profile", "post_job", "close_job", "apply", "update_application_status"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 50_000) {
        await reader.cancel();
        throw new RangeError("Request too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new SyntaxError("Invalid request");
  return body;
}

export function createMarketplaceHandler(deps: {
  client: Pick<SupabaseClient, "rpc">;
  authenticate: (token: string) => Promise<string | null>;
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (!["GET", "POST"].includes(req.method)) return json(405, { error: "Use GET or POST" });
    try {
      let body: Record<string, unknown> = {};
      if (req.method === "POST") {
        try {
          body = await readBody(req);
        } catch (error) {
          return json(error instanceof RangeError ? 413 : 400, {
            error: error instanceof RangeError ? "Request too large" : "Send a valid JSON object",
          });
        }
      }
      const url = new URL(req.url);
      const action = String(url.searchParams.get("action") ?? body.action ?? "").trim().toLowerCase();
      if (!publicActions.has(action) && !privateActions.has(action)) {
        return json(404, { error: "Unknown action" });
      }
      if (mutations.has(action) && req.method !== "POST") return json(405, { error: "Use POST for changes" });
      let actor: string | null = null;
      if (!publicActions.has(action)) {
        const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("Authorization") ?? "");
        if (!match) return json(401, { error: "Sign in to continue" });
        actor = await deps.authenticate(match[1]);
        if (!actor || !uuid.test(actor)) return json(401, { error: "Sign in to continue" });
      }
      if (mutations.has(action) && req.headers.get("X-Marketplace-Client-Version") !== "2") {
        return json(409, {
          error: "Marketplace has been updated. Refresh this page and keep your draft before retrying.",
        });
      }
      const payload = { ...body };
      for (const field of ["subject", "tenant_id", "job_id", "listing_id", "application_id"]) {
        const value = url.searchParams.get(field);
        if (req.method === "GET" && value !== null) payload[field] = value;
      }
      const idField = ["post_job", "my_jobs"].includes(action)
        ? "tenant_id"
        : ["close_job", "list_applications"].includes(action)
        ? "job_id"
        : action === "apply"
        ? "listing_id"
        : action === "update_application_status"
        ? "application_id"
        : null;
      if (idField && (typeof payload[idField] !== "string" || !uuid.test(payload[idField] as string))) {
        return json(400, { error: `A valid ${idField} is required` });
      }
      if (
        ["upsert_profile", "post_job", "update_application_status"].includes(action) &&
        (typeof payload.request_id !== "string" || !uuid.test(payload.request_id))
      ) return json(400, { error: "A valid request id is required" });
      if (
        payload.subject !== undefined && (typeof payload.subject !== "string" || payload.subject.length > 120)
      ) return json(400, { error: "Invalid subject" });
      const { data, error } = await deps.client.rpc("marketplace_command", {
        p_actor: actor,
        p_action: action,
        p_payload: payload,
      });
      if (error) {
        const code = String(error.code ?? "");
        if (/^PT(400|403|404|409)$/.test(code)) return json(Number(code.slice(2)), { error: error.message });
        if (["22P02", "22003", "22023"].includes(code)) {
          return json(400, { error: "Check the submitted values and retry" });
        }
        return json(503, { error: "Marketplace is temporarily unavailable. Keep your draft and retry." });
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return json(503, { error: "Could not confirm the result. Keep your draft and retry." });
      }
      return json(200, data);
    } catch {
      return json(503, { error: "Marketplace is temporarily unavailable. Keep your draft and retry." });
    }
  };
}
