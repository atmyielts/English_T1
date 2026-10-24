import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { countByDay, MAX_FREEZES, streakGuard } from "./english-streak.ts";
import { currentStreak } from "./english-today.ts";
import { learnerDate } from "./english-xp.ts";

const day = (offset: number) => new Date(Date.parse("2026-10-01T00:00:00Z") + offset * 86_400_000).toISOString().slice(0, 10);
/** Activity counts on the given day offsets from 2026-10-01. */
const counts = (entries: Array<number | [number, number]>) =>
  new Map(entries.map((entry) => (Array.isArray(entry) ? [day(entry[0]), entry[1]] : [day(entry), 1])));
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

Deno.test("no activity means no streak and nothing held", () => {
  const guard = streakGuard(new Map(), day(0));
  assertEquals([guard.current, guard.freezes, guard.comeback, guard.at_risk], [0, 0, null, false]);
});

Deno.test("seven days in a row earn a freeze; at most two are held", () => {
  assertEquals(streakGuard(counts(range(0, 5)), day(5)).freezes, 0);
  const seven = streakGuard(counts(range(0, 6)), day(6));
  assertEquals([seven.current, seven.freezes, seven.next_freeze_in], [7, 1, 7]);
  const many = streakGuard(counts(range(0, 29)), day(29));
  assertEquals([many.current, many.freezes, many.next_freeze_in], [30, MAX_FREEZES, null]);
});

Deno.test("a single missed day uses a freeze and the streak survives", () => {
  const guard = streakGuard(counts([...range(0, 6), ...range(8, 9)]), day(9));
  assertEquals(guard.current, 9);
  assertEquals(guard.freezes, 0);
  assertEquals(guard.frozen_days, [day(7)]);
  // The plain streak used elsewhere is unchanged by the layer.
  const plain = currentStreak([...range(0, 6), ...range(8, 9)].map((offset) => ({ content_item_id: "x", skill: "reading", score: 1, submitted_at: `${day(offset)}T10:00:00Z` })), day(9));
  assertEquals(plain, 2);
});

Deno.test("today never counts as missed; a frozen yesterday leaves the streak at risk", () => {
  const guard = streakGuard(counts(range(0, 6)), day(8));
  assertEquals([guard.current, guard.freezes, guard.at_risk, guard.today_done], [7, 0, true, false]);
  assertEquals(guard.frozen_days, [day(7)]);
});

Deno.test("two missed days in a row break the streak and give the freeze back", () => {
  const guard = streakGuard(counts(range(0, 6)), day(9));
  assertEquals(guard.current, 0);
  assertEquals(guard.freezes, 1);
  assertEquals(guard.frozen_days, []);
  assertEquals(guard.comeback?.status, "open");
  assertEquals(guard.comeback?.old_streak, 7);
  assertEquals([guard.comeback?.starts, guard.comeback?.ends], [day(9), day(11)]);
});

Deno.test("three activities within three learner days win the old streak back", () => {
  // Five days, then two missed (no freeze yet), then three activities over two days.
  const won = streakGuard(counts([...range(0, 4), [7, 2], [8, 1]]), day(8));
  assertEquals(won.comeback?.status, "won");
  assertEquals(won.comeback?.won_on, day(8));
  assertEquals(won.current, 5 + 2);
  // Days missed inside the window cost nothing once it is won.
  const gap = streakGuard(counts([...range(0, 4), [6, 1], [8, 2]]), day(8));
  assertEquals([gap.comeback?.status, gap.current], ["won", 5 + 2]);
});

Deno.test("an open challenge shows progress; a lost one disappears and a fresh streak runs", () => {
  const open = streakGuard(counts([...range(0, 4), [6, 1]]), day(6));
  assertEquals([open.comeback?.status, open.comeback?.done, open.comeback?.needed, open.current], ["open", 1, 3, 1]);
  const lost = streakGuard(counts([...range(0, 4), [6, 1], [9, 1]]), day(9));
  assertEquals(lost.comeback, null);
  assertEquals(lost.current, 1);
});

Deno.test("short streaks have no challenge, and a won challenge stops showing after two days", () => {
  assertEquals(streakGuard(counts([0, 1, 5]), day(5)).comeback, null);
  const later = streakGuard(counts([...range(0, 4), [6, 3], ...range(7, 10)]), day(10));
  assertEquals(later.comeback, null);
  assertEquals(later.current, 5 + 5);
});

Deno.test("activity days follow the learner's clock (UTC+5)", () => {
  // 20:00 UTC is already the next day in Tashkent.
  const map = countByDay(["2026-10-01T20:00:00Z", "2026-10-01T10:00:00Z", "bad"], learnerDate);
  assertEquals([...map.entries()].sort(), [["2026-10-01", 1], ["2026-10-02", 1]]);
});
