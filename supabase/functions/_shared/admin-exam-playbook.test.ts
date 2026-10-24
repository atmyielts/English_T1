import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FakeDb } from "./exam-playbook-fake-db.test.ts";
import { type AdminDeps, createAdminExamPlaybookHandler } from "./admin-exam-playbook.ts";
import { json } from "./exam-playbook.ts";

const admin = "99999999-9999-4999-8999-999999999999";
const SAT = "a8b41e2c-9a36-4caf-9bba-7212e35a8b8c";
const TOEFL = "f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e";

type Who = "anonymous" | "editor" | "analyst" | "viewer";

const setup = (who: Who, db = new FakeDb()) => {
  const authorizedFor: string[] = [];
  const deps: AdminDeps = {
    db,
    authorize: (_req, exam) => {
      authorizedFor.push(exam);
      if (who === "anonymous") return Promise.resolve({ ok: false as const, response: json(401, { error: "Unauthorized" }) });
      const permissions = who === "editor" ? ["admin.products.manage"] : who === "analyst" ? ["admin.analytics.view"] : ["admin.users.view"];
      return Promise.resolve({ ok: true as const, context: { userId: admin, permissions } });
    },
    now: () => new Date("2026-10-24T09:00:00Z"),
    log: () => undefined,
  };
  const handler = createAdminExamPlaybookHandler(() => deps);
  const call = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const res = await handler(new Request(`https://example.test/functions/v1/admin-exam-playbook${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }));
    return { status: res.status, body: await res.json() };
  };
  return { call, db, authorizedFor };
};

Deno.test("admin: exam must be sat or toefl, checked before anything else", async () => {
  const { call, authorizedFor } = setup("editor");
  assertEquals((await call("/pages")).status, 400);
  assertEquals((await call("/pages?exam=ielts")).body.code, "invalid_exam");
  assertEquals(authorizedFor, []);
});

Deno.test("admin: the shared admin authorisation gates every route and permissions are enforced", async () => {
  assertEquals((await setup("anonymous").call("/pages?exam=sat")).status, 401);
  const viewer = setup("viewer");
  assertEquals((await viewer.call("/pages?exam=sat")).status, 403);
  assertEquals((await viewer.call("/analytics?exam=sat")).status, 403);
  const analyst = setup("analyst");
  assertEquals((await analyst.call("/analytics?exam=toefl")).status, 200);
  assertEquals((await analyst.call("/pages?exam=toefl", { method: "POST", body: { slug: "x", title: "x" } })).status, 403);
  assertEquals(analyst.authorizedFor, ["toefl", "toefl"]);
});

Deno.test("admin: authoring writes to the selected exam's tables and validates input", async () => {
  const { call, db } = setup("editor");
  const created = await call("/pages?exam=toefl", { method: "POST", body: { slug: "listening-strategy", title: "Listening strategy", page_type: "module", visibility: "public" } });
  assertEquals(created.status, 200);
  assertEquals(db.rows("toefl_playbook_pages")[0].product_id, TOEFL);
  assertEquals(db.rows("toefl_playbook_pages")[0].status, "draft");
  assertEquals(db.rows("sat_playbook_pages").length, 0);
  assertEquals((await call("/pages?exam=sat", { method: "POST", body: { slug: "Bad Slug", title: "x" } })).body.code, "invalid_field");
  assertEquals((await call("/pages?exam=sat", { method: "POST", body: { slug: "ok-slug", title: "x", visibility: "secret" } })).status, 400);

  const pageId = created.body.page.id;
  // Block types follow each exam's schema: domain_grid is SAT-only.
  assertEquals((await call("/sections?exam=toefl", { method: "POST", body: { page_id: pageId, block_type: "domain_grid", content: {} } })).status, 400);
  const section = await call("/sections?exam=toefl", { method: "POST", body: { page_id: pageId, block_type: "skill_grid", heading: "Tasks", content: { items: [] } } });
  assertEquals(section.status, 200);
  // A section cannot be attached to a page of the other exam.
  assertEquals((await call("/sections?exam=sat", { method: "POST", body: { page_id: pageId, content: {} } })).status, 404);

  const published = await call("/publish?exam=toefl", { method: "POST", body: { kind: "page", id: pageId, published: true } });
  assertEquals(published.body.row.status, "published");
  assertEquals(published.body.row.published_at, "2026-10-24T09:00:00.000Z");
  const unpublished = await call("/publish?exam=toefl", { method: "POST", body: { kind: "page", id: pageId, published: false } });
  assertEquals(unpublished.body.row.status, "draft");

  const preview = await call("/preview/pages/listening-strategy?exam=toefl");
  assertEquals([preview.status, preview.body.preview, preview.body.sections.length], [200, true, 1]); // drafts included

  const template = await call("/plan-templates?exam=sat", { method: "POST", body: { slug: "four-week-sprint", title: "Sprint", duration_days: 28, focus_section: "math", schedule_json: { weeks: [{ label: "W1" }] } } });
  assertEquals(template.status, 200);
  assertEquals(db.rows("sat_playbook_plan_templates")[0].product_id, SAT);
  assertEquals((await call("/plan-templates?exam=sat", { method: "POST", body: { slug: "x", title: "x", duration_days: 28, focus_section: "speaking", schedule_json: {} } })).status, 400);
  const list = await call("/plan-templates?exam=sat");
  assertEquals(list.body.plan_templates[0].normalized_weeks.length, 1);

  const qa = await call("/qa?exam=sat");
  assertEquals(qa.body.plan_templates.find((t: { slug: string }) => t.slug === "four-week-sprint").status, "draft");
  assertEquals(qa.body.modules.every((m: { status: string }) => m.status === "missing"), true);
});

Deno.test("admin: diagnostic preview runs the engine without saving anything", async () => {
  const { call, db } = setup("editor");
  const res = await call("/preview/diagnostic?exam=toefl", { method: "POST", body: { profile: { target_band: 5, section_current_bands: { reading: 4, listening: 4, writing: 4, speaking: 3 } } } });
  assertEquals(res.status, 200);
  assertEquals(res.body.diagnostic.current.overall, 4);
  assert(res.body.diagnostic.bottlenecks.length > 0);
  assertEquals(db.calls.filter((c) => c.op !== "select").length, 0);
});
