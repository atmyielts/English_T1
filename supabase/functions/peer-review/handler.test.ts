import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createPeerReviewHandler } from "./handler.ts";

const actor = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const req = (body: unknown, method = "POST", query = "") => new Request("https://example.test/peer-review" + query, {
  method, headers: { Authorization: "Bearer qa-token", "Content-Type": "application/json", "X-Peer-Review-Client-Version": "2" },
  ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
});

Deno.test("peer HTTP: stale mutation clients fail before dispatch and CORS exposes the update header", async () => {
  const { handler, calls } = setup();
  const old = new Request("https://example.test", { method: "POST", headers: { Authorization: "Bearer qa-token", "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit", essay_text: "private" }) });
  assertEquals((await handler(old)).status, 409);
  assertEquals(calls.length, 0);
  const preflight = await handler(new Request("https://example.test", { method: "OPTIONS" }));
  assertEquals(preflight.headers.get("Access-Control-Allow-Headers")?.includes("x-peer-review-client-version"), true);
});
function setup(result: unknown = { submissions: [] }, failure: unknown = null) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return Promise.resolve({ data: result, error: failure }); },
    from: () => { throw new Error("Unexpected table access"); },
  } as unknown as SupabaseClient;
  return { calls, handler: createPeerReviewHandler({ client, authenticate: () => Promise.resolve(actor) }) };
}

Deno.test("peer HTTP: requires bearer authentication and POST for mutations", async () => {
  const { handler, calls } = setup();
  assertEquals((await handler(new Request("https://example.test"))).status, 401);
  assertEquals((await handler(req(null, "GET", "?action=submit_review"))).status, 405);
  assertEquals((await handler(req(null, "DELETE"))).status, 405);
  assertEquals(calls.length, 0);
});
Deno.test("peer HTTP: binds the command actor to verified identity and marks privacy API version", async () => {
  const { handler, calls } = setup();
  const response = await handler(req({ action: "queue", p_actor: id, user_id: id }));
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Cache-Control"), "no-store");
  assertEquals(response.headers.get("X-Peer-Review-Version"), "2");
  assertEquals(calls[0].args.p_actor, actor);
  assertEquals(calls[0].name, "peer_review_command");
});
Deno.test("peer HTTP: malformed, oversized, and invalid id requests never reach SQL", async () => {
  const { handler, calls } = setup();
  for (const body of ["{", "[]", "null"]) assertEquals((await handler(req(body))).status, 400);
  assertEquals((await handler(req({ action: "submit", essay_text: "a".repeat(100_001) }))).status, 413);
  assertEquals((await handler(req({ action: "claim_submission", submission_id: "not-uuid" }))).status, 400);
  assertEquals((await handler(req({ action: "rate_helpful", review_id: id, is_helpful: "false" }))).status, 400);
  assertEquals(calls.length, 0);
});
Deno.test("peer HTTP: authorization and reservation conflicts remain actionable; internal errors stay private", async () => {
  for (const [code, status] of [["PT403", 403], ["PT404", 404], ["PT409", 409]] as const) {
    const { handler } = setup(null, { code, message: "Reserve this essay first" });
    assertEquals((await handler(req({ action: "claim_submission", submission_id: id }))).status, status);
  }
  const { handler } = setup(null, { code: "42P01", message: "sensitive schema/internal error" });
  const response = await handler(req({ action: "queue" }));
  assertEquals(response.status, 503);
  assertEquals((await response.text()).includes("sensitive"), false);
});
Deno.test("peer HTTP: auth outage is retryable; invalid session is unauthorized", async () => {
  const client = {} as SupabaseClient;
  const outage = createPeerReviewHandler({ client, authenticate: () => Promise.reject(new Error("down")) });
  const expired = createPeerReviewHandler({ client, authenticate: () => Promise.resolve(null) });
  assertEquals((await outage(req({ action: "queue" }))).status, 503);
  assertEquals((await expired(req({ action: "queue" }))).status, 401);
});
Deno.test("peer HTTP: history read failure is not a successful empty state", async () => {
  const { handler } = setup(null, { code: "08006", message: "db down" });
  const response = await handler(req({ action: "my_submissions" }));
  assertEquals(response.status, 503);
  assertEquals("submissions" in await response.json(), false);
  for (const malformed of [null, [], "unexpected"]) {
    assertEquals((await setup(malformed).handler(req({ action: "my_submissions" }))).status, 503);
  }
});

Deno.test("peer HTTP: history and helpful commands use the same verified actor boundary", async () => {
  const { handler, calls } = setup({ ok: true });
  for (const body of [{ action: "my_submissions", user_id: id }, { action: "my_reviews", reviewer_id: id },
    { action: "rate_helpful", review_id: id, is_helpful: false, p_actor: id }]) {
    assertEquals((await handler(req(body))).status, 200);
  }
  assertEquals(calls.map((call) => call.args.p_actor), [actor, actor, actor]);
});
