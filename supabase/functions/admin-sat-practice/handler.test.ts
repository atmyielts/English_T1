import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createAdminHandler } from "./handler.ts";

const admin = "33333333-3333-4333-8333-333333333333";
const item = {
  slug: "alg-lf-001", section: "math", official_domain: "algebra", skill: "linear_functions", sat_domain: "algebra", difficulty: "easy", format: "mcq",
  prompt: "If $f(x)=2x$, what is $f(3)$?", options: ["A", "B", "C", "D"].map((id, i) => ({ id, label: `$${4 + i}$` })), answer: "C",
  explanation: "Multiply: 2 times 3 is 6. Choice A and Choice B add instead of multiplying; Choice D adds one.",
};
function setup(authorized = true) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const handler = createAdminHandler({
    cors: {},
    authorize: async () => authorized ? { ok: true, userId: admin } : { ok: false, response: new Response('{"error":"Forbidden"}', { status: 403 }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: name === "admin_upsert_sat_practice_items" ? { inserted: 1, updated: 0 } : name === "admin_set_sat_practice_item_status" ? 1 : { total: 0, items: [] }, error: null };
    },
  });
  const post = (path: string, body: unknown) => handler(new Request("https://x.test/admin-sat-practice" + path, { method: "POST", body: JSON.stringify(body) }));
  return { handler, calls, post };
}

Deno.test("Non-admins are refused before any database call", async () => {
  const { handler, post, calls } = setup(false);
  assertEquals((await handler(new Request("https://x.test/admin-sat-practice/items"))).status, 403);
  assertEquals((await post("/import", { items: [item], status: "published" })).status, 403);
  assertEquals(calls.length, 0);
});

Deno.test("Validation errors block the import and nothing is written", async () => {
  const { post, calls } = setup();
  const bad = await post("/import", { items: [{ ...item, answer: "E" }, { ...item, slug: "alg-lf-002", prompt: "Other", figure_svg: '<svg viewBox="0 0 1 1"><script>x</script></svg>' }], status: "published" });
  assertEquals(bad.status, 422);
  const body = await bad.json();
  assert(body.errors.length >= 2);
  assertEquals(calls.length, 0);
  const preview = await (await post("/validate", { items: [item] })).json();
  assertEquals(preview.ok, true);
  assertEquals((await post("/import", { items: [item], status: "live" })).status, 400);
  assertEquals((await post("/import", "not an object")).status, 413);
});

Deno.test("Valid items import as drafts with contract-A rows and the admin as actor", async () => {
  const { post, calls } = setup();
  const res = await post("/import", { items: [item], status: "draft" });
  assertEquals(res.status, 200);
  assertEquals(calls.length, 1);
  const { name, args } = calls[0]!;
  assertEquals(name, "admin_upsert_sat_practice_items");
  assertEquals(args.p_actor, admin);
  assertEquals(args.p_status, "draft");
  const row = (args.p_items as Array<Record<string, any>>)[0]!;
  assertEquals(row.type, "question_single_choice");
  assertEquals(row.correct, { option_id: "C" });
  assertEquals(row.metadata.content_status, "draft");
  assertEquals(row.metadata.sat_official_domain, "algebra");
  assertEquals(row.part_name, "Algebra");
  assertEquals(row.key_metadata.feedback.explanation, item.explanation);
});

Deno.test("Publishing and listing validate their parameters", async () => {
  const { post, handler, calls } = setup();
  assertEquals((await post("/items/status", { ids: ["not-a-uuid"], status: "published" })).status, 400);
  assertEquals((await post("/items/status", { ids: [admin], status: "deleted" })).status, 400);
  assertEquals((await post("/items/status", { ids: [admin], status: "published" })).status, 200);
  assertEquals((await handler(new Request("https://x.test/admin-sat-practice/items?status=nope"))).status, 400);
  assertEquals((await handler(new Request("https://x.test/admin-sat-practice/items?domain=algebra&limit=10"))).status, 200);
  assertEquals(calls.map(c => c.name), ["admin_set_sat_practice_item_status", "admin_list_sat_practice_items"]);
  assertEquals((await handler(new Request("https://x.test/admin-sat-practice/other"))).status, 404);
});
