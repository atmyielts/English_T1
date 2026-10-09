import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createMarketplaceHandler } from "./handler.ts";
const actor = "11111111-1111-4111-8111-111111111111";
const target = "22222222-2222-4222-8222-222222222222";
function fixture(
  options: {
    identity?: string | null;
    authFailure?: boolean;
    data?: unknown;
    error?: unknown;
    rpcFailure?: boolean;
  } = {},
) {
  const calls: Record<string, unknown>[] = [];
  const tokens: string[] = [];
  const handler = createMarketplaceHandler({
    client: {
      rpc: ((_name: string, args: Record<string, unknown>) => {
        calls.push(args);
        if (options.rpcFailure) throw Error("secret connection string");
        return Promise.resolve({
          data: Object.hasOwn(options, "data") ? options.data : { ok: true },
          error: options.error ?? null,
        });
      }) as never,
    },
    authenticate: (token) => {
      tokens.push(token);
      if (options.authFailure) throw Error("secret identity details");
      return Promise.resolve(Object.hasOwn(options, "identity") ? options.identity! : actor);
    },
  });
  const request = (body: unknown, headers: Record<string, string> = {}, method = "POST", search = "") =>
    handler(
      new Request("https://example.test/teacher-marketplace" + search, {
        method,
        headers: {
          Authorization: "Bearer synthetic",
          "Content-Type": "application/json",
          "X-Marketplace-Client-Version": "2",
          ...headers,
        },
        ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
      }),
    );
  return { calls, tokens, request };
}
Deno.test("public browse does not authenticate and explicitly has no actor", async () => {
  const f = fixture();
  const r = await f.request(null, {}, "GET", "?action=teachers&subject=ielts");
  assertEquals(r.status, 200);
  assertEquals(f.tokens, []);
  assertEquals(f.calls[0].p_actor, null);
  assertEquals(f.calls[0].p_payload, { subject: "ielts" });
  assertEquals(r.headers.get("Cache-Control"), "no-store");
  assertEquals(r.headers.get("X-Marketplace-Version"), "2");
});
Deno.test("every private action binds the verified actor, never a body-supplied identity", async () => {
  for (
    const action of [
      "manageable_tenants",
      "get_my_profile",
      "my_applications",
      "my_jobs",
      "list_applications",
      "upsert_profile",
      "post_job",
      "close_job",
      "apply",
      "update_application_status",
    ]
  ) {
    const f = fixture();
    const r = await f.request({
      action,
      p_actor: target,
      user_id: target,
      tenant_id: target,
      job_id: target,
      listing_id: target,
      application_id: target,
      request_id: target,
    });
    assertEquals(r.status, 200);
    assertEquals(f.calls[0].p_actor, actor);
    assertEquals(f.calls[0].p_action, action);
  }
});
Deno.test("missing, malformed and invalid bearer identities never execute a command", async () => {
  for (
    const headers of [{ Authorization: "" }, { Authorization: "synthetic" }, {
      Authorization: "Bearer one two",
    }]
  ) {
    const f = fixture();
    assertEquals((await f.request({ action: "get_my_profile" }, headers)).status, 401);
    assertEquals(f.calls.length, 0);
  }
  const f = fixture({ identity: null });
  assertEquals((await f.request({ action: "get_my_profile" })).status, 401);
  assertEquals(f.calls.length, 0);
});
Deno.test("authentication outage is retryable and hides internal details", async () => {
  const f = fixture({ authFailure: true });
  const r = await f.request({ action: "get_my_profile" });
  assertEquals(r.status, 503);
  assert(!JSON.stringify(await r.json()).includes("secret"));
  assertEquals(f.calls.length, 0);
});
Deno.test("mutations require current client and POST before reaching SQL", async () => {
  for (const action of ["upsert_profile", "post_job", "close_job", "apply", "update_application_status"]) {
    const f = fixture();
    assertEquals((await f.request({ action }, { "X-Marketplace-Client-Version": "" })).status, 409);
    assertEquals(f.calls.length, 0);
    assertEquals((await f.request(null, {}, "GET", "?action=" + action)).status, 405);
    assertEquals(f.calls.length, 0);
  }
});
Deno.test("bad JSON, arrays, oversized bodies and unsupported methods are refused", async () => {
  for (const value of ["{", [], null, 4]) {
    const f = fixture();
    assertEquals((await f.request(value)).status, 400);
    assertEquals(f.calls.length, 0);
  }
  const f = fixture();
  assertEquals((await f.request({ action: "teachers", text: "x".repeat(50_000) })).status, 413);
  assertEquals(f.calls.length, 0);
  assertEquals((await f.request(null, {}, "DELETE")).status, 405);
  assertEquals((await f.request({ action: "unknown" })).status, 404);
});
Deno.test("invalid command identifiers and subject values never execute SQL", async () => {
  for (
    const action of [
      "post_job",
      "my_jobs",
      "close_job",
      "list_applications",
      "apply",
      "update_application_status",
      "upsert_profile",
    ]
  ) {
    const f = fixture();
    assertEquals((await f.request({ action })).status, 400);
    assertEquals(f.calls.length, 0);
  }
  const f = fixture();
  assertEquals((await f.request({ action: "teachers", subject: [] })).status, 400);
  assertEquals(f.calls.length, 0);
});
Deno.test("SQL authorization, missing, validation and conflict errors retain their status", async () => {
  for (const code of ["PT400", "PT403", "PT404", "PT409"]) {
    const f = fixture({ error: { code, message: "Known command error" } });
    const r = await f.request({ action: "get_my_profile" });
    assertEquals(r.status, Number(code.slice(2)));
    assertEquals(await r.json(), { error: "Known command error" });
  }
  const f = fixture({ error: { code: "22P02", message: "sensitive SQL" } });
  const r = await f.request({ action: "get_my_profile" });
  assertEquals(r.status, 400);
  assert(!JSON.stringify(await r.json()).includes("sensitive"));
});
Deno.test("database outages, malformed receipts and exceptions never become empty success", async () => {
  for (
    const options of [{ error: { code: "42P01", message: "sensitive schema" } }, { rpcFailure: true }, {
      data: null,
    }, { data: [] }]
  ) {
    const f = fixture(options);
    const r = await f.request({ action: "teachers" });
    assertEquals(r.status, 503);
    assert(!JSON.stringify(await r.json()).includes("sensitive"));
  }
});
Deno.test("preflight advertises the required client header and performs no command", async () => {
  const f = fixture();
  const r = await f.request(null, {}, "OPTIONS");
  assertEquals(r.status, 200);
  assert(r.headers.get("Access-Control-Allow-Headers")?.includes("x-marketplace-client-version"));
  assertEquals(f.calls.length, 0);
});
