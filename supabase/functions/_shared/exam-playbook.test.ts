import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FakeDb } from "./exam-playbook-fake-db.test.ts";
import { PUBLIC_CACHE, type PlaybookDeps, __resetEventThrottle, createPlaybookHandler } from "./exam-playbook.ts";
import { SAT_PLAYBOOK_CONFIG } from "./sat-playbook.ts";
import { TOEFL_PLAYBOOK_CONFIG } from "./toefl-playbook.ts";

const learner = "11111111-1111-4111-8111-111111111111";
const premiumLearner = "22222222-2222-4222-8222-222222222222";
const SAT = SAT_PLAYBOOK_CONFIG.playbookProductId;
const pageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const premiumPageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sectionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const seed = () =>
  new FakeDb({
    sat_playbook_pages: [
      { id: pageId, product_id: SAT, locale_code: "en", slug: "math-algebra", title: "Algebra", summary: "Linear equations", page_type: "module", visibility: "public", status: "published", sort_order: 1, parent_page_id: null },
      { id: premiumPageId, product_id: SAT, locale_code: "en", slug: "guide-math-hard-module-traps", title: "Hard module traps", summary: "Advanced", page_type: "guide", visibility: "premium", status: "published", sort_order: 2, parent_page_id: null },
      { id: crypto.randomUUID(), product_id: SAT, locale_code: "en", slug: "math-advanced-math", title: "Draft", summary: "", page_type: "module", visibility: "public", status: "draft", sort_order: 3, parent_page_id: null },
    ],
    sat_playbook_page_sections: [
      { id: sectionId, page_id: pageId, block_type: "rich_text", heading: "Isolate the variable", status: "published", sort_order: 1, content: { body: "Undo operations in reverse order." } },
    ],
    sat_playbook_plan_templates: [
      {
        id: crypto.randomUUID(), product_id: SAT, slug: "four-week-sprint", title: "4-week sprint", plan_type: "crash", duration_days: 28, status: "published",
        schedule_json: { weeks: [{ label: "Week 1", tasks: ["Read math-algebra"] }, { label: "Week 2", tasks: ["Timed set"] }, { label: "Week 3", tasks: ["Mock"] }, { label: "Week 4", modules: ["test-day-guide"] }] },
      },
    ],
  });

const makeDeps = (db: FakeDb, overrides: Partial<PlaybookDeps> = {}) => {
  const logs: Array<{ level: string; event: string; detail: Record<string, unknown> }> = [];
  const deps: PlaybookDeps = {
    db,
    getUser: (token) => Promise.resolve(token === "learner-token" ? { id: learner } : token === "premium-token" ? { id: premiumLearner } : token === "premium2-token" ? { id: "33333333-3333-4333-8333-333333333333" } : null),
    hasProduct: (token) => Promise.resolve(token.startsWith("premium")),
    ai: (_options, fallback) => Promise.resolve({ data: fallback, status: "unconfigured" }),
    now: () => new Date("2026-10-24T09:00:00Z"),
    log: (level, event, detail) => logs.push({ level, event, detail }),
    ...overrides,
  };
  return { deps, logs };
};

const call = async (handler: (r: Request) => Promise<Response>, path: string, init: { method?: string; token?: string; body?: unknown; ip?: string; fn?: string } = {}) => {
  const headers: Record<string, string> = { "Content-Type": "application/json", "cf-connecting-ip": init.ip ?? "203.0.113.1" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await handler(new Request(`https://example.test/functions/v1/${init.fn ?? "sat-playbook"}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  }));
  return { status: res.status, headers: res.headers, body: await res.json() };
};

Deno.test("catalog and public modules are readable without sign-in and cacheable; premium stays gated", async () => {
  const db = seed();
  const { deps } = makeDeps(db);
  const handler = createPlaybookHandler(SAT_PLAYBOOK_CONFIG, () => deps);
  const catalog = await call(handler, "/catalog");
  assertEquals(catalog.status, 200);
  assertEquals(catalog.headers.get("Cache-Control"), PUBLIC_CACHE);
  assertEquals(catalog.body.modules.map((m: { slug: string }) => m.slug), ["math-algebra"]);
  assertEquals(catalog.body.premium_guides.map((m: { slug: string }) => m.slug), ["guide-math-hard-module-traps"]);
  assertEquals(catalog.body.plan_templates[0].slug, "four-week-sprint");

  const page = await call(handler, "/pages/math-algebra");
  assertEquals(page.status, 200);
  assertEquals(page.headers.get("Cache-Control"), PUBLIC_CACHE);
  assertEquals(page.body.sections.length, 1);

  const anonPremium = await call(handler, "/pages/guide-math-hard-module-traps");
  assertEquals([anonPremium.status, anonPremium.body.code], [401, "auth_required"]);
  assertEquals(anonPremium.body.teaser.title, "Hard module traps");
  assertEquals(anonPremium.body.sections, undefined);
  const nonPremium = await call(handler, "/pages/guide-math-hard-module-traps", { token: "learner-token" });
  assertEquals([nonPremium.status, nonPremium.body.code], [403, "premium_required"]);
  const premium = await call(handler, "/pages/guide-math-hard-module-traps", { token: "premium-token" });
  assertEquals(premium.status, 200);
  assertEquals(premium.headers.get("Cache-Control"), "private, no-store");
  assertEquals((await call(handler, "/pages/math-advanced-math")).status, 404); // drafts are invisible
});

Deno.test("GET /diagnostic never writes a snapshot; Run diagnostic writes exactly one and retires the old", async () => {
  const db = seed();
  const { deps } = makeDeps(db);
  const handler = createPlaybookHandler(SAT_PLAYBOOK_CONFIG, () => deps);
  for (let i = 0; i < 3; i += 1) {
    const view = await call(handler, "/diagnostic", { token: "premium-token" });
    assertEquals(view.status, 200);
    assertEquals(view.body.snapshot, null);
  }
  assertEquals(db.count("sat_playbook_recommendation_snapshots", "insert"), 0);
  assertEquals(db.count("sat_playbook_recommendation_snapshots", "update"), 0);

  await call(handler, "/profile", { method: "PATCH", token: "premium-token", body: { target_total_score: 1400, current_section_scores: { reading_writing: 650, math: 560 }, deadline_date: "2026-11-15" } });
  assertEquals(db.rows("sat_playbook_recommendation_snapshots").length, 1); // profile change re-runs once
  const run = await call(handler, "/diagnostic/run", { method: "POST", token: "premium-token" });
  assertEquals(run.status, 200);
  const snapshots = db.rows("sat_playbook_recommendation_snapshots");
  assertEquals(snapshots.length, 2);
  assertEquals(snapshots.filter((s) => s.is_current).length, 1);
  const rec = run.body.snapshot.recommendation_json;
  assertEquals(rec.current.total, 1210);
  assertEquals(rec.plan_suggestion.template_slug, "four-week-sprint");
  assertEquals(rec.plan_suggestion.template_published, true);
  assert(db.rows("sat_playbook_events").some((e) => e.event_name === "diagnostic_run" && e.user_id === premiumLearner));

  // Saving the same values again does not re-run.
  await call(handler, "/profile", { method: "PATCH", token: "premium-token", body: { target_total_score: 1400 } });
  assertEquals(db.rows("sat_playbook_recommendation_snapshots").length, 2);
  const view = await call(handler, "/diagnostic", { token: "premium-token" });
  assertEquals(view.body.snapshot.id, run.body.snapshot.id);
});

Deno.test("diagnostic and plans require Premium with a clear code, never a raw error", async () => {
  const db = seed();
  const { deps } = makeDeps(db);
  const handler = createPlaybookHandler(SAT_PLAYBOOK_CONFIG, () => deps);
  assertEquals((await call(handler, "/diagnostic")).body.code, "auth_required");
  const gated = await call(handler, "/diagnostic/run", { method: "POST", token: "learner-token" });
  assertEquals([gated.status, gated.body.code, gated.body.product_slug], [403, "premium_required", "sat-playbook"]);
  const bad = await call(handler, "/profile", { method: "PATCH", token: "premium-token", body: { target_total_score: 2000 } });
  assertEquals([bad.status, bad.body.code], [400, "invalid_field"]);
});

Deno.test("events: anonymous visitors may only send page views/clicks, throttled; others need sign-in", async () => {
  __resetEventThrottle();
  const db = seed();
  const { deps } = makeDeps(db, { anonEventsPerIpPerMinute: 3, anonEventsPerMinute: 1000 });
  const handler = createPlaybookHandler(SAT_PLAYBOOK_CONFIG, () => deps);
  assertEquals((await call(handler, "/events", { method: "POST", body: { event_name: "note_saved" } })).status, 401);
  assertEquals((await call(handler, "/events", { method: "POST", body: { event_name: "made_up" } })).status, 400);
  const ok = await call(handler, "/events", { method: "POST", body: { event_name: "page_view", page_id: pageId }, ip: "198.51.100.7" });
  assertEquals([ok.status, ok.body.accepted], [200, true]);
  // Unknown page ids from anonymous visitors are dropped.
  const ghost = await call(handler, "/events", { method: "POST", body: { event_name: "page_view", page_id: crypto.randomUUID() }, ip: "198.51.100.7" });
  assertEquals(ghost.body.accepted, false);
  await call(handler, "/events", { method: "POST", body: { event_name: "upgrade_click" }, ip: "198.51.100.7" });
  const limited = await call(handler, "/events", { method: "POST", body: { event_name: "page_view" }, ip: "198.51.100.7" });
  assertEquals([limited.status, limited.body.accepted], [202, false]);
  const anonRows = db.rows("sat_playbook_events").filter((e) => e.user_id == null);
  assertEquals(anonRows.map((e) => e.event_name), ["page_view", "upgrade_click"]);

  const signedIn = await call(handler, "/events", { method: "POST", token: "learner-token", body: { event_name: "module_open", page_id: pageId, module_key: "math" } });
  assertEquals(signedIn.status, 200);
  assert(db.rows("sat_playbook_events").some((e) => e.event_name === "module_open" && e.user_id === learner));
});

Deno.test("events: the global anonymous cap drops floods without touching signed-in events", async () => {
  __resetEventThrottle();
  const db = seed();
  const { deps } = makeDeps(db, { anonEventsPerMinute: 2 });
  const handler = createPlaybookHandler(SAT_PLAYBOOK_CONFIG, () => deps);
  const results = [];
  for (let i = 0; i < 4; i += 1) results.push((await call(handler, "/events", { method: "POST", body: { event_name: "page_view" }, ip: `192.0.2.${i}` })).body.accepted);
  assertEquals(results, [true, true, false, false]);
});

Deno.test("the public anon key is not a session: no auth lookup, public cache, and repeat views come from memory", async () => {
  const db = seed();
  let authLookups = 0;
  const { deps } = makeDeps(db, { getUser: () => { authLookups += 1; return Promise.resolve(null); } });
  const handler = createPlaybookHandler(SAT_PLAYBOOK_CONFIG, () => deps);
  const b64 = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const anonKey = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "anon", iss: "supabase" })}.signature`;

  const first = await call(handler, "/pages/math-algebra", { token: anonKey });
  assertEquals(first.status, 200);
  assertEquals(first.headers.get("Cache-Control"), PUBLIC_CACHE);
  assertEquals((await call(handler, "/catalog", { token: "sb_publishable_example" })).status, 200);
  assertEquals(authLookups, 0);

  // A second view is served from the isolate memo even if the database is unavailable.
  db.throwOn = (table) => table === "sat_playbook_pages" || table === "sat_playbook_page_sections";
  const second = await call(handler, "/pages/math-algebra", { token: anonKey });
  assertEquals(second.status, 200);
  assertEquals(second.body.sections.length, first.body.sections.length);

  // Gated pages are never memoised: they still go to the database.
  const premium = await call(handler, "/pages/guide-math-hard-module-traps", { token: "premium-token" });
  assertEquals(premium.status, 500);
});

Deno.test("unexpected failures return a generic message and log the detail", async () => {
  const db = seed();
  db.throwOn = (table) => table === "sat_playbook_pages";
  const { deps, logs } = makeDeps(db);
  const handler = createPlaybookHandler(SAT_PLAYBOOK_CONFIG, () => deps);
  const res = await call(handler, "/catalog");
  assertEquals(res.status, 500);
  assertEquals(res.body, { error: "Something went wrong. Please try again.", code: "internal_error" });
  assert(!JSON.stringify(res.body).includes("private"));
  assertEquals(logs[0].event, "unhandled_error");
  assert(String(logs[0].detail.message).includes("private database detail"));
});

Deno.test("adopting a template adapts dates to the test date and items toggle done/undone", async () => {
  const db = seed();
  const { deps } = makeDeps(db);
  const handler = createPlaybookHandler(SAT_PLAYBOOK_CONFIG, () => deps);
  await call(handler, "/profile", { method: "PATCH", token: "premium-token", body: { deadline_date: "2026-11-07" } });
  const adopted = await call(handler, "/plans/four-week-sprint/adopt", { method: "POST", token: "premium-token", body: { start_date: "2026-10-24" } });
  assertEquals(adopted.status, 200);
  assertEquals(adopted.body.plan.schedule.compressed, true);
  assertEquals(adopted.body.plan.schedule.weeks.length, 2);
  assert(adopted.body.plan_items.every((i: { due_date: string }) => i.due_date <= "2026-11-06"));
  assert(db.rows("sat_playbook_events").some((e) => e.event_name === "plan_adopted"));

  // Adopting again archives the previous plan.
  await call(handler, "/plans/four-week-sprint/adopt", { method: "POST", token: "premium-token" });
  assertEquals(db.rows("sat_playbook_user_plans").filter((p) => p.status === "active").length, 1);

  const task = adopted.body.plan_items[0];
  assertEquals((await call(handler, `/my-plan/items/${task.id}`, { method: "DELETE", token: "premium-token" })).status, 409);

  const added = await call(handler, "/my-plan/items", { method: "POST", token: "premium-token", body: { page_slug: "math-algebra" } });
  assertEquals([added.status, added.body.created], [200, true]);
  const again = await call(handler, "/my-plan/items", { method: "POST", token: "premium-token", body: { page_slug: "math-algebra" } });
  assertEquals(again.body.created, false);
  const done = await call(handler, `/my-plan/items/${added.body.item.id}`, { method: "PATCH", token: "premium-token", body: { status: "done" } });
  assertEquals(done.body.item.status, "done");
  const undone = await call(handler, `/my-plan/items/${added.body.item.id}`, { method: "PATCH", token: "premium-token", body: { status: "todo" } });
  assertEquals([undone.body.item.status, undone.body.item.done_at], ["todo", null]);
  const dash = await call(handler, "/dashboard", { token: "premium-token" });
  assertEquals(dash.body.module_items.length, 1);
  assertEquals(dash.body.progress.modules_total, 1);
  // Another premium learner cannot see or change the item.
  assertEquals((await call(handler, `/my-plan/items/${added.body.item.id}`, { method: "PATCH", token: "premium2-token", body: { status: "done" } })).status, 404);
});

Deno.test("section progress, notes and the AI coach are premium; coach reports unavailability honestly", async () => {
  const db = seed();
  const { deps } = makeDeps(db);
  const handler = createPlaybookHandler(SAT_PLAYBOOK_CONFIG, () => deps);
  assertEquals((await call(handler, `/pages/math-algebra/sections/${sectionId}/complete`, { method: "POST", token: "learner-token", body: {} })).body.code, "premium_required");
  const complete = await call(handler, `/pages/math-algebra/sections/${sectionId}/complete`, { method: "POST", token: "premium-token", body: { done: true } });
  assertEquals(complete.status, 200);
  assert(db.rows("sat_playbook_events").some((e) => e.event_name === "section_complete"));
  const note = await call(handler, "/notes", { method: "POST", token: "premium-token", body: { page_slug: "math-algebra", anchor_text: "reverse order", body: "remember", section_id: sectionId } });
  assertEquals(note.status, 200);
  assert(db.rows("sat_playbook_events").some((e) => e.event_name === "note_saved"));
  const me = await call(handler, "/pages/math-algebra/me", { token: "premium-token" });
  assertEquals(me.body.completed_section_ids, [sectionId]);
  assertEquals(me.body.notes.length, 1);
  const notes = await call(handler, "/notes", { token: "premium-token" });
  assertEquals(notes.body.notes[0].page.slug, "math-algebra");

  const coach = await call(handler, `/pages/math-algebra/sections/${sectionId}/ask`, { method: "POST", token: "premium-token", body: { message: "Why reverse?" } });
  assertEquals([coach.status, coach.body.ok, coach.body.code], [200, false, "coach_unavailable"]);
  assertEquals(db.rows("sat_playbook_section_threads").length, 0);

  const { deps: aiDeps } = makeDeps(db, { ai: () => Promise.resolve({ data: { reply: "Because the last operation applied is the first one to undo." } as never, status: "ok" }) });
  const aiHandler = createPlaybookHandler(SAT_PLAYBOOK_CONFIG, () => aiDeps);
  const answered = await call(aiHandler, `/pages/math-algebra/sections/${sectionId}/ask`, { method: "POST", token: "premium-token", body: { message: "Why reverse?" } });
  assertEquals(answered.body.messages.length, 2);
  assertEquals(answered.body.messages[1].ai, true);
});

Deno.test("TOEFL profile accepts 2026 bands and legacy 0-120 input, keeping both columns in sync", async () => {
  const db = new FakeDb();
  const { deps } = makeDeps(db);
  const handler = createPlaybookHandler(TOEFL_PLAYBOOK_CONFIG, () => deps);
  const patch = (body: unknown) => call(handler, "/profile", { method: "PATCH", token: "premium-token", fn: "toefl-playbook", body });
  const band = await patch({ score_scale: "band_2026", target_band: 4.5, current_band: 4 });
  assertEquals([band.body.profile.target_band, band.body.profile.target_total_score, band.body.profile.current_score_or_estimate], [4.5, 86, 72]);
  const legacy = await patch({ score_scale: "legacy_120", target_total_score: 100, current_score_or_estimate: 80, legacy_section_scores: { reading: 22, speaking: 23 } });
  assertEquals([legacy.body.profile.target_band, legacy.body.profile.current_band], [5, 4]);
  assertEquals(legacy.body.profile.section_current_bands, { reading: 4.5, speaking: 4.5 });
  assertEquals((await patch({ target_band: 7 })).status, 400);
  assertEquals((await patch({ target_band: 4.3 })).body.profile.target_band, 4.5); // snapped to the half band
  // A changed goal re-ran the diagnostic on the TOEFL tables.
  assert(db.rows("toefl_playbook_recommendation_snapshots").length >= 1);
  assertEquals(db.rows("sat_playbook_recommendation_snapshots").length, 0);
});

Deno.test("TOEFL diagnostic reads the TOEFL simulator's outcomes and writes TOEFL snapshots only", async () => {
  const db = new FakeDb({
    exam_outcomes: [{
      id: "o1", user_id: premiumLearner, product_id: TOEFL_PLAYBOOK_CONFIG.simulatorProductId, status: "completed", computed_at: "2026-10-27T08:00:00Z",
      raw_result: { toefl: { format: "toefl-2026", sections: { reading: { band: 4 }, listening: { band: 4 }, writing: { band: 3.5 }, speaking: { band: 3.5 } }, overall_band: 4, tasks: [] } },
    }, {
      id: "sat", user_id: premiumLearner, product_id: SAT_PLAYBOOK_CONFIG.simulatorProductId, status: "completed", computed_at: "2026-10-28T08:00:00Z",
      raw_result: { sat: { reading_writing_score: 600, math_score: 600, total_score: 1200 } },
    }],
  });
  const { deps } = makeDeps(db);
  const handler = createPlaybookHandler(TOEFL_PLAYBOOK_CONFIG, () => deps);
  await call(handler, "/profile", { method: "PATCH", token: "premium-token", fn: "toefl-playbook", body: { target_band: 5 } });
  const run = await call(handler, "/diagnostic/run", { method: "POST", token: "premium-token", fn: "toefl-playbook" });
  assertEquals(run.status, 200);
  const rec = run.body.snapshot.recommendation_json;
  assertEquals([rec.exam, rec.current.overall, rec.current.overall_cefr], ["toefl", 4, "B2"]);
  assertEquals(rec.bottlenecks.map((b: { section: string }) => b.section), ["writing", "speaking", "reading", "listening"]);
  assertEquals(run.body.snapshot.latest_exam_outcome_id, "o1");
  assertEquals(db.rows("sat_playbook_recommendation_snapshots").length, 0);
});
