// Admin-only SAT Practice authoring: validate, import (draft or published),
// list and publish/unpublish contract-A questions. Authorisation is the shared
// admin check (admin.products.manage), exactly as other admin functions use.
import { type ContractItem, OFFICIAL_DOMAINS, toContentRows, validateItems } from "../_shared/sat-practice-content.ts";

type Json = Record<string, unknown>;
export type AdminDeps = {
  authorize: (req: Request) => Promise<{ ok: true; userId: string } | { ok: false; response: Response }>;
  rpc: (name: string, args: Json) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
  cors: Record<string, string>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 6_000_000;

export function createAdminHandler(deps: AdminDeps) {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...deps.cors },
  });
  const readJson = async (req: Request): Promise<Json | null> => {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_BODY) return null;
    const text = await req.text();
    if (text.length > MAX_BODY) return null;
    try {
      const value = JSON.parse(text);
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  };
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: deps.cors });
    const auth = await deps.authorize(req);
    if (!auth.ok) return auth.response;
    const url = new URL(req.url);
    const at = url.pathname.indexOf("/admin-sat-practice");
    const route = (at >= 0 ? url.pathname.slice(at + "/admin-sat-practice".length) : url.pathname).replace(/\/+$/, "") || "/";
    try {
      if (req.method === "GET" && route === "/items") {
        const status = url.searchParams.get("status") || null, domain = url.searchParams.get("domain") || null;
        const search = (url.searchParams.get("q") || "").trim() || null;
        const limit = Number(url.searchParams.get("limit") ?? 25), offset = Number(url.searchParams.get("offset") ?? 0);
        if (status && !["draft", "published", "retired"].includes(status)) return json(400, { error: "Invalid status filter.", code: "invalid_request" });
        if (domain && !(domain in OFFICIAL_DOMAINS)) return json(400, { error: "Invalid domain filter.", code: "invalid_request" });
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || (search && search.length > 100)) {
          return json(400, { error: "Invalid page.", code: "invalid_request" });
        }
        const { data, error } = await deps.rpc("admin_list_sat_practice_items", { p_status: status, p_domain: domain, p_search: search, p_limit: limit, p_offset: offset });
        if (error) return json(503, { error: "Questions are temporarily unavailable.", code: "unavailable" });
        return json(200, data);
      }
      if (req.method === "POST" && (route === "/validate" || route === "/import")) {
        const body = await readJson(req);
        if (!body) return json(413, { error: 'Send a JSON object {"items": [...]} up to 6 MB.', code: "invalid_request" });
        const result = validateItems(body.items);
        if (route === "/validate") return json(200, { ok: result.errors.length === 0, ...result });
        const status = body.status === "published" ? "published" : body.status === "draft" ? "draft" : null;
        if (!status) return json(400, { error: "Choose draft or published.", code: "invalid_request" });
        if (result.errors.length) return json(422, { ok: false, error: "Fix the validation errors before importing.", code: "validation_failed", ...result });
        const rows = (body.items as ContractItem[]).map(item => ({ ...toContentRows(item, status), part_name: OFFICIAL_DOMAINS[item.official_domain].label }));
        const { data, error } = await deps.rpc("admin_upsert_sat_practice_items", { p_actor: auth.userId, p_items: rows, p_status: status });
        if (error) {
          if (error.code === "23505") return json(409, { error: "A question with this slug belongs to other content, or a domain part could not be created.", code: "conflict" });
          return json(503, { error: "The import could not be saved. Nothing was changed; retry.", code: "unavailable" });
        }
        return json(200, { ok: true, ...(data as Json), warnings: result.warnings, count: result.count });
      }
      if (req.method === "POST" && route === "/items/status") {
        const body = await readJson(req);
        const ids = body?.ids, status = body?.status;
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > 500 || ids.some(id => typeof id !== "string" || !uuid.test(id))
          || !["draft", "published", "retired"].includes(String(status))) {
          return json(400, { error: "Choose questions and draft, published or retired.", code: "invalid_request" });
        }
        const { data, error } = await deps.rpc("admin_set_sat_practice_item_status", { p_actor: auth.userId, p_ids: ids, p_status: status });
        if (error) return json(503, { error: "The status could not be changed. Retry.", code: "unavailable" });
        return json(200, { ok: true, changed: data });
      }
      return json(404, { error: "Not found", code: "not_found" });
    } catch {
      return json(500, { error: "SAT Practice admin is temporarily unavailable.", code: "unavailable" });
    }
  };
}
