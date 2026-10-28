import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cleanLink,
  deriveInbox,
  type InboxFacts,
  inboxRow,
  type InboxRow,
  mergeInbox,
  missingDerived,
  pushInbox,
} from "./english-inbox.ts";

// Saturday 2026-10-24, 17:00 in Tashkent (UTC+5).
const NOW = new Date("2026-10-24T12:00:00Z");

const facts = (patch: Partial<InboxFacts> = {}): InboxFacts => ({
  now: NOW,
  levels: [],
  badges: [],
  certificates: [],
  streak: null,
  dueReviews: 0,
  check: { due: false, next_at: null },
  paused: [],
  lastWeek: null,
  ...patch,
});

const keys = (items: Array<{ key: string }>) => items.map((item) => item.key);

Deno.test("nothing to say: no notices", () => {
  assertEquals(deriveInbox(facts()), []);
});

Deno.test("level rises in the last two weeks are announced, overall or per skill; placements are not", () => {
  const items = deriveInbox(facts({
    levels: [
      { at: "2026-09-01T05:00:00Z", source: "placement", overall: "A2", per_skill: { reading: "A2", writing: "A2" } },
      { at: "2026-09-20T05:00:00Z", source: "level_up", overall: "A2", per_skill: { reading: "B1", writing: "A2" } },
      { at: "2026-10-15T05:00:00Z", source: "level_up", overall: "A2", per_skill: { reading: "B1", writing: "B1" } },
      { at: "2026-10-20T05:00:00Z", source: "check", overall: "B1", per_skill: { reading: "B1", writing: "B1" } },
      { at: "2026-10-22T05:00:00Z", source: "check", overall: "B1", per_skill: { reading: "B1", writing: "B1" } },
    ],
  }));
  assertEquals(items.map((item) => [item.kind, item.key, item.params]), [
    ["level_up", "level:2026-10-15T05:00:00Z", { skill: "writing", level: "B1" }],
    ["level_up", "level:2026-10-20T05:00:00Z", { level: "B1", skills: 0 }],
  ]);
});

Deno.test("recent badges and certificates; old ones are not announced again", () => {
  const items = deriveInbox(facts({
    badges: [{ key: "streak_7", earned_at: "2026-10-23T05:00:00Z" }, { key: "first_activity", earned_at: "2026-08-01T05:00:00Z" }],
    certificates: [{ code: "ABCDEFGHJKMN", overall: "B1", issued_at: "2026-10-22T05:00:00Z" }],
  }));
  assertEquals(keys(items), ["badge:streak_7", "certificate:ABCDEFGHJKMN"]);
});

Deno.test("streak at risk only in the afternoon of a day without practice, with a streak worth keeping", () => {
  assertEquals(keys(deriveInbox(facts({ streak: { current: 5, at_risk: true } }))), ["streak_risk:2026-10-24"]);
  assertEquals(deriveInbox(facts({ streak: { current: 1, at_risk: true } })), []);
  assertEquals(deriveInbox(facts({ streak: { current: 5, at_risk: false } })), []);
  // 13:00 in Tashkent: too early to worry.
  assertEquals(deriveInbox(facts({ now: new Date("2026-10-24T08:00:00Z"), streak: { current: 5, at_risk: true } })), []);
});

Deno.test("due reviews, the monthly check, paused services and last week's report", () => {
  const items = deriveInbox(facts({
    dueReviews: 12,
    check: { due: true, next_at: "2026-10-20T05:00:00Z" },
    paused: ["writing"],
    lastWeek: { start_date: "2026-10-12", activities: 9 },
  }));
  assertEquals(items.map((item) => [item.kind, item.key]), [
    ["review_due", "review_due:2026-10-24"],
    ["check_ready", "check_ready:2026-10-20"],
    ["service_paused", "paused:writing:2026-10-24"],
    ["weekly_report", "weekly:2026-10-12"],
  ]);
  const review = items[0]!;
  assertEquals(review.params, { count: 12 });
  // Ends with the learner's day (midnight in Tashkent).
  assertEquals(review.expiresAt, "2026-10-24T19:00:00.000Z");
  const weekly = items[3]!;
  assertEquals([weekly.link, weekly.createdAt], ["/journey?week=2026-10-12", "2026-10-18T19:00:00.000Z"]);
  assertEquals(deriveInbox(facts({ lastWeek: { start_date: "2026-10-12", activities: 0 } })), []);
});

const stored = (patch: Partial<InboxRow>): InboxRow => ({
  id: crypto.randomUUID(),
  kind: "badge",
  dedupe_key: "badge:streak_7",
  params: { badge: "streak_7" },
  title: null,
  body: null,
  link: "/progress",
  created_at: "2026-10-23T05:00:00Z",
  read_at: null,
  expires_at: null,
  ...patch,
});

Deno.test("merge: live notices only while still true and with today's numbers; expired ones hidden; unread first", () => {
  const derived = deriveInbox(facts({ dueReviews: 3 }));
  const rows = [
    stored({}),
    stored({ kind: "review_due", dedupe_key: "review_due:2026-10-24", params: { count: 12 }, created_at: "2026-10-24T03:00:00Z", read_at: "2026-10-24T04:00:00Z" }),
    stored({ kind: "streak_risk", dedupe_key: "streak_risk:2026-10-24", created_at: "2026-10-24T11:00:00Z" }),
    stored({ kind: "weekly_report", dedupe_key: "weekly:2026-10-05", created_at: "2026-10-12T19:00:00Z", expires_at: "2026-10-19T19:00:00Z" }),
    stored({ kind: "system", dedupe_key: "system:maintenance", title: "Maintenance tonight", created_at: "2026-10-22T05:00:00Z", read_at: "2026-10-22T06:00:00Z" }),
    stored({ kind: "not_a_kind", dedupe_key: "x:y" }),
  ];
  const { items, unread } = mergeInbox(rows, derived, NOW);
  assertEquals(items.map((item) => [item.kind, item.read, item.live]), [
    ["badge", false, false],
    ["review_due", true, true],
    ["system", true, false],
  ]);
  assertEquals(items[1]!.params, { count: 3 });
  assertEquals(unread, 1);
});

Deno.test("only derived notices not stored yet are inserted", () => {
  const derived = deriveInbox(facts({ dueReviews: 2, badges: [{ key: "streak_7", earned_at: "2026-10-23T05:00:00Z" }] }));
  assertEquals(keys(missingDerived(derived, [{ dedupe_key: "badge:streak_7" }])), ["review_due:2026-10-24"]);
});

Deno.test("rows are cleaned: app links only, known kinds only, small params", () => {
  assertEquals(cleanLink("/journey?week=2026-10-12"), "/journey?week=2026-10-12");
  assertEquals(cleanLink("https://evil.example"), null);
  assertEquals(cleanLink("//evil.example"), null);
  assertEquals(cleanLink("javascript:alert(1)"), null);
  assertEquals(inboxRow("user", { kind: "nope" as never, key: "abc" }), null);
  assertEquals(inboxRow("user", { kind: "system", key: "" }), null);
  const row = inboxRow("user", {
    kind: "assignment_due",
    key: "assignment:1",
    params: { title: "Essay", due: 3, Bad: "x", nested: { a: 1 } as never },
    link: "https://elsewhere.example",
    title: "  Essay   due  ",
  })!;
  assertEquals([row.params, row.link, row.title], [{ title: "Essay", due: 3 }, null, "Essay due"]);
});

Deno.test("pushInbox: ignores a key already used, never throws", async () => {
  const calls: unknown[] = [];
  const fake = (result: unknown) => ({
    from: () => ({
      upsert: (row: unknown, options: unknown) => {
        calls.push({ row, options });
        return { select: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)) };
      },
    }),
  });
  assert(await pushInbox(fake({ data: [{ id: "1" }], error: null }), "user", { kind: "system", key: "system:hello", title: "Hello" }));
  assertEquals((calls[0] as { options: unknown }).options, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  assertEquals(await pushInbox(fake({ data: [], error: null }), "user", { kind: "system", key: "system:hello" }), false);
  assertEquals(await pushInbox(fake({ data: null, error: { message: "boom" } }), "user", { kind: "system", key: "system:hello" }), false);
  assertEquals(await pushInbox(fake(new Error("network")), "user", { kind: "system", key: "system:hello" }), false);
  assertEquals(await pushInbox(fake({ data: [], error: null }), "", { kind: "system", key: "system:hello" }), false);
});
