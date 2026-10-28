import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  backoffMs,
  classifyFailure,
  entryForActivity,
  expiredEntries,
  KEEP_DONE_MS,
  MAX_TRIES,
  newClientAttemptId,
  newEntry,
  planOffline,
  type PlanTask,
  type QueueEntry,
  type SendOutcome,
  submitTarget,
  summariseResponse,
  syncQueue,
} from "../src/lib/offline/model.ts";
import { CLIENT_ATTEMPT_ID } from "../../../supabase/functions/_shared/english-client-attempt.ts";

const task = (skill: string, slug: string | null, extra: Partial<PlanTask> = {}): PlanTask => ({
  kind: "activity",
  skill,
  slug,
  title: `${skill} ${slug}`,
  level: "B1",
  minutes: 8,
  done: false,
  ...extra,
});

Deno.test("only unfinished AI-free activities are downloaded; the rest wait for a connection", () => {
  const plan = planOffline([
    task("reading", "a"),
    task("listening", "b"),
    task("grammar", "c", { done: true }),
    task("vocabulary", "d"),
    task("vocabulary", "d"),
    task("writing", "e"),
    task("speaking", "f"),
    task("review", null, { kind: "review" }),
  ]);
  assertEquals(plan.download.map((entry) => `${entry.skill}/${entry.slug}`), ["reading/a", "listening/b", "vocabulary/d"]);
  assertEquals(plan.online.map((entry) => entry.skill), ["writing", "speaking", "review"]);
});

Deno.test("queued answers go to the same submit routes as online", () => {
  assertEquals(submitTarget("reading", "a b"), { fn: "reading-articles", path: "/articles/a%20b/submit" });
  assertEquals(submitTarget("listening", "x"), { fn: "listening-content", path: "/items/x/submit" });
  assertEquals(submitTarget("grammar", "x"), { fn: "grammar-remediation", path: "/units/x/submit" });
  assertEquals(submitTarget("vocabulary", "x"), { fn: "vocabulary-notebook", path: "/decks/x/submit" });
});

Deno.test("client attempt ids are accepted by the server's format", () => {
  for (let i = 0; i < 5; i += 1) assert(CLIENT_ATTEMPT_ID.test(newClientAttemptId()));
  assertEquals(newClientAttemptId(() => "a{b}c-1"), "off_abc-1");
});

Deno.test("failed sends: network stops, refusals fail for good, busy servers retry", () => {
  assertEquals(classifyFailure(0), { action: "stop_offline" });
  assertEquals(classifyFailure(401), { action: "stop_auth" });
  assertEquals(classifyFailure(402, "english_free_limit_reached"), { action: "fail", reason: "free_used" });
  assertEquals(classifyFailure(404), { action: "fail", reason: "not_found" });
  assertEquals(classifyFailure(422), { action: "fail", reason: "invalid" });
  assertEquals(classifyFailure(409, "client_attempt_in_progress"), { action: "retry", reason: "busy" });
  assertEquals(classifyFailure(503, "service_paused"), { action: "retry", reason: "paused" });
  assertEquals(classifyFailure(500), { action: "retry", reason: "server" });
  assertEquals(backoffMs(1), 30_000);
  assertEquals(backoffMs(3), 120_000);
  assertEquals(backoffMs(20), 30 * 60_000);
});

Deno.test("response headlines from every skill", () => {
  assertEquals(summariseResponse({ score: 80, correct: 4, total: 5 }), { score: 80, correct: 4, total: 5, recorded: true });
  assertEquals(summariseResponse({ score: 70, recorded: false, questions: { correct: 2, total: 3 } }), { score: 70, correct: 2, total: 3, recorded: false });
  assertEquals(summariseResponse({ score: null, no_questions: true }), { score: null, correct: null, total: null, recorded: true });
});

const T0 = Date.parse("2026-10-26T08:00:00Z");

const queueOf = (count: number, userId = "u1") =>
  Array.from({ length: count }, (_, index) =>
    newEntry({ userId, skill: "grammar", slug: `unit-${index}`, title: `Unit ${index}`, body: { answers: [] }, now: new Date(T0 + index * 1000), id: `off_entry_${index}` }));

const harness = (outcomes: SendOutcome[]) => {
  const saved = new Map<string, QueueEntry>();
  const sent: string[] = [];
  let call = 0;
  return {
    saved,
    sent,
    deps: {
      userId: "u1",
      now: () => T0 + 60_000,
      send: async (entry: QueueEntry) => {
        sent.push(entry.id);
        return outcomes[call++] ?? { ok: true as const, body: { score: 100 } };
      },
      save: async (entry: QueueEntry) => { saved.set(entry.id, entry); },
    },
  };
};

Deno.test("sync sends oldest first, saves each result, and skips other learners' answers", async () => {
  const entries = [...queueOf(2).reverse(), ...queueOf(1, "u2").map((entry) => ({ ...entry, id: "off_other_0" }))];
  const run = harness([{ ok: true, body: { score: 90, correct: 9, total: 10 } }]);
  const report = await syncQueue(entries, run.deps);
  assertEquals(run.sent, ["off_entry_0", "off_entry_1"]);
  assertEquals(report, { synced: 2, failed: 0, waiting: 0, stopped: null });
  assertEquals(run.saved.get("off_entry_0")?.status, "synced");
  assertEquals(run.saved.get("off_entry_0")?.result?.score, 90);
  assert(!run.saved.has("off_other_0"));
});

Deno.test("losing the connection stops the sync and keeps everything queued", async () => {
  const run = harness([{ ok: true, body: { score: 50 } }, { ok: false, status: 0, code: "network" }]);
  const report = await syncQueue(queueOf(3), run.deps);
  assertEquals(report.stopped, "offline");
  assertEquals(report.synced, 1);
  assertEquals(report.waiting, 2);
  assertEquals(run.sent.length, 2, "the third is not tried");
  assertEquals([...run.saved.keys()], ["off_entry_0"], "nothing else changes");
});

Deno.test("a signed-out learner's sync stops without spending tries", async () => {
  const run = harness([{ ok: false, status: 401, code: null }]);
  const report = await syncQueue(queueOf(2), run.deps);
  assertEquals(report.stopped, "auth");
  assertEquals(run.saved.size, 0);
});

Deno.test("refusals are final; server errors back off and give up after MAX_TRIES", async () => {
  const run = harness([
    { ok: false, status: 402, code: "english_free_limit_reached" },
    { ok: false, status: 500, code: null },
    { ok: false, status: 503, code: "service_paused" },
  ]);
  const report = await syncQueue(queueOf(3), run.deps);
  assertEquals(report, { synced: 0, failed: 1, waiting: 2, stopped: null });
  assertEquals(run.saved.get("off_entry_0")?.status, "failed");
  assertEquals(run.saved.get("off_entry_0")?.reason, "free_used");
  const retried = run.saved.get("off_entry_1")!;
  assertEquals(retried.status, "queued");
  assertEquals(retried.tries, 1);
  assertEquals(Date.parse(retried.next_try_at!), T0 + 60_000 + 30_000);
  assertEquals(run.saved.get("off_entry_2")?.tries, 0, "a paused skill does not use up tries");

  // Not due yet: skipped without a send.
  const later = harness([]);
  const waitReport = await syncQueue([retried], later.deps);
  assertEquals(later.sent, []);
  assertEquals(waitReport.waiting, 1);

  // The last allowed try fails for good.
  const lastTry = harness([{ ok: false, status: 502, code: null }]);
  await syncQueue([{ ...retried, tries: MAX_TRIES - 1, next_try_at: null }], lastTry.deps);
  assertEquals(lastTry.saved.get("off_entry_1")?.status, "failed");
  assertEquals(lastTry.saved.get("off_entry_1")?.reason, "server");
});

Deno.test("a resend after an interrupted sync reuses the same client attempt id", async () => {
  // First sync: the request reached the server, but the answer was lost (network error).
  const first = harness([{ ok: false, status: 0, code: "network" }]);
  const entries = queueOf(1);
  await syncQueue(entries, first.deps);
  // Second sync: same entry, same id; the server replays its stored response.
  const second = harness([{ ok: true, body: { score: 70, replayed: true } }]);
  await syncQueue(entries, second.deps);
  assertEquals(first.sent, second.sent);
  assertEquals(second.saved.get("off_entry_0")?.status, "synced");
});

Deno.test("finished entries are kept a week; the activity list shows the latest answer", () => {
  const entries = queueOf(3);
  const synced = { ...entries[0]!, status: "synced" as const, synced_at: new Date(T0).toISOString() };
  const failed = { ...entries[1]!, status: "failed" as const };
  assertEquals(expiredEntries([synced, failed, entries[2]!], T0 + KEEP_DONE_MS + 5000), ["off_entry_0", "off_entry_1"]);
  assertEquals(expiredEntries([synced], T0 + 1000), []);

  const pack = { user_id: "u1", saved_at: new Date(T0 - 1000).toISOString() };
  const older = { ...entries[0]!, slug: "unit-x", created_at: new Date(T0).toISOString(), id: "off_old_0001" };
  const newer = { ...entries[0]!, slug: "unit-x", created_at: new Date(T0 + 5000).toISOString(), id: "off_new_0001" };
  assertEquals(entryForActivity([older, newer], pack, { skill: "grammar", slug: "unit-x" })?.id, "off_new_0001");
  assertEquals(entryForActivity([older], { ...pack, saved_at: new Date(T0 + 10_000).toISOString() }, { skill: "grammar", slug: "unit-x" }), null, "answers from before this download do not count");
});

Deno.test("the service worker caches the offline shell on request, never API data", async () => {
  const worker = await Deno.readTextFile(new URL("../public/sw.js", import.meta.url));
  assert(worker.includes("const VERSION = 'v5'"), "cache version bumped for the offline download");
  assert(worker.includes("data.type !== 'warm-cache'"));
  assert(worker.includes("if (url.origin !== self.location.origin) return;"), "warming accepts same-origin files only");
  assert(worker.includes("if (!shell && !isHashedAsset(url) && !isIcon(url)) return;"), "only the shell, build files and icons");
  assert(worker.includes("if (isApiOrigin(url) || url.origin !== self.location.origin) return;"), "API requests are still never touched");
  assert(!worker.includes("skipWaiting(") && !worker.includes("clients.claim("));
});
