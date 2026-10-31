import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createDuel, type DuelContext, joinDuel } from "./english-duel-service.ts";
import { DUEL_QUESTION_COUNT } from "./english-duel.ts";

// createDuel and joinDuel over an in-memory stand-in for the Supabase client:
// ten questions the creator brings (Schood AI's topic duels, L17) are stored as
// they are and kept when the friend joins; without them, the join still builds
// the questions from the players' words and the published decks, as before.

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

function fakeSupabase(seed: Record<string, Row[]>) {
  const tables = new Map(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  const table = (name: string) => tables.get(name) ?? tables.set(name, []).get(name)!;
  let ids = 0;
  const from = (name: string) => {
    const filters: Filter[] = [];
    let mode: "select" | "insert" | "update" = "select", payload: Row | Row[] | null = null, head = false, counted = false, limit = Infinity, returning = false;
    const run = () => {
      const rows = table(name);
      if (mode === "insert") {
        const added = (Array.isArray(payload) ? payload : [payload!]).map((row) => ({ id: `${name}-${++ids}`, created_at: new Date().toISOString(), ...row }));
        rows.push(...added);
        return { data: added, error: null };
      }
      const matched = rows.filter((row) => filters.every((filter) => filter(row)));
      if (mode === "update") { for (const row of matched) Object.assign(row, payload); return { data: matched, error: null }; }
      return { data: head ? null : matched.slice(0, limit), count: counted ? matched.length : null, error: null };
    };
    const one = (strict: boolean) => {
      const result = run() as { data: Row[] | null; error: null };
      const row = result.data?.[0] ?? null;
      return Promise.resolve(strict && !row ? { data: null, error: { message: "no rows" } } : { data: row ? { ...row } : null, error: null });
    };
    const builder = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) { if (mode === "select") { head = !!options?.head; counted = options?.count === "exact"; } else returning = true; return builder; },
      insert(values: Row | Row[]) { mode = "insert"; payload = values; return builder; },
      update(values: Row) { mode = "update"; payload = values; return builder; },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return builder; },
      is(column: string, value: unknown) { filters.push((row) => (row[column] ?? null) === value); return builder; },
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return builder; },
      gte(column: string, value: string) { filters.push((row) => String(row[column] ?? "") >= value); return builder; },
      order() { return builder; },
      limit(count: number) { limit = count; return builder; },
      maybeSingle: () => one(false),
      single: () => one(true),
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        try {
          const result = run() as { data: Row[] | null };
          return Promise.resolve(mode === "select" || returning ? result : { ...result, data: null }).then(resolve, reject);
        } catch (cause) { return Promise.reject(cause).then(resolve, reject); }
      },
    };
    return builder;
  };
  return { sb: { from }, table };
}

const LANGUAGE = "lang-en";
const CREATOR = "00000000-0000-4000-8000-0000000000c1", FRIEND = "00000000-0000-4000-8000-0000000000c2";
const ctxOf = (sb: unknown): DuelContext => ({ sb, languageId: LANGUAGE, appUrl: "https://ai.schood.online", botName: "schoodstudentbot", now: () => new Date("2026-11-02T06:00:00Z") });
const topicQuestions = Array.from({ length: DUEL_QUESTION_COUNT }, (_, n) => ({
  prompt: `Choose the opposite of word ${n}`, options: [`a${n}`, `b${n}`, `c${n}`, `d${n}`], correct_index: 2, side: "shared", level: "B1",
}));
const deck = {
  vocabulary_decks: [{ id: "deck-1", language_id: LANGUAGE, status: "published", level: "B1" }],
  vocabulary_deck_words: Array.from({ length: 40 }, (_, n) => ({ deck_id: "deck-1", word: `word${n}`, definition: `the meaning of word number ${n}` })),
};

Deno.test("a duel created with ten ready questions stores them and keeps them when the friend joins", async () => {
  const fake = fakeSupabase({ ...deck });
  const ctx = ctxOf(fake.sb);
  const created = await createDuel(ctx, CREATOR, { channel: "web", locale: "en", questions: topicQuestions });
  assert(/^[A-Z0-9]{4,12}$/.test(created.code), "a share code");
  assertEquals(fake.table("english_duels")[0].questions, topicQuestions, "stored as they are");
  assertEquals(fake.table("english_duel_players").map((row) => [row.user_id, row.role]), [[CREATOR, "creator"]]);
  const joined = await joinDuel(ctx, FRIEND, created.code, { channel: "telegram", locale: "uz" });
  assertEquals(joined.joined, true);
  const duel = fake.table("english_duels")[0];
  assertEquals([duel.status, duel.opponent_id, duel.questions], ["active", FRIEND, topicQuestions], "the creator's questions stay");
  assertEquals(fake.table("english_duel_players").map((row) => [row.user_id, row.role, row.channel]), [[CREATOR, "creator", "web"], [FRIEND, "opponent", "telegram"]]);
});

Deno.test("without ready questions the join builds them from the players' words and the decks, as before", async () => {
  const fake = fakeSupabase({ ...deck });
  const ctx = ctxOf(fake.sb);
  const created = await createDuel(ctx, CREATOR, { channel: "web", locale: "en" });
  assertEquals(fake.table("english_duels")[0].questions ?? null, null, "nothing until the friend joins");
  await joinDuel(ctx, FRIEND, created.code, { channel: "web", locale: "en" });
  const questions = fake.table("english_duels")[0].questions as { prompt: string }[];
  assertEquals(questions.length, DUEL_QUESTION_COUNT);
  assert(questions.every((question) => /meaning of word number|word\d+/.test(question.prompt)), "built from deck words");
});

Deno.test("questions that are not ten valid ones are refused before anything is saved", async () => {
  const fake = fakeSupabase({ ...deck });
  const ctx = ctxOf(fake.sb);
  await assertRejects(() => createDuel(ctx, CREATOR, { channel: "web", locale: "en", questions: topicQuestions.slice(0, 9) }), Error, "invalid questions");
  await assertRejects(() => createDuel(ctx, CREATOR, { channel: "web", locale: "en", questions: topicQuestions.map((question) => ({ ...question, correct_index: 7 })) }), Error, "invalid questions");
  assertEquals([fake.table("english_duels").length, fake.table("english_duel_players").length], [0, 0]);
});
