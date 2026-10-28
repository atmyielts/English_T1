import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { cleanMarks, compareAttempts, findFillers, fluencySignals, LONG_PAUSE_MS, pauseGaps, sanitizeClientFluency } from "./english-fluency.ts";

Deno.test("fillers: hesitation words and stock phrases, 'like' is not counted", () => {
  assertEquals(findFillers("Um, I think, you know, it is like, uh, kind of good. You know?").sort(), ["kind of", "uh", "um", "you know", "you know"].sort());
  assertEquals(findFillers("I like it."), []);
});

Deno.test("timeline is cleaned: out of order, shrinking word counts and junk are dropped", () => {
  const marks = cleanMarks([
    { at: 800, words: 1 },
    { at: 700, words: 2 },
    { at: 1200, words: 1 },
    { at: 1500, words: 3 },
    { at: "x", words: 4 },
    { at: -5, words: 9 },
    null,
    { at: 5000, words: 6 },
  ]);
  assertEquals(marks, [{ at: 800, words: 1 }, { at: 1500, words: 3 }, { at: 5000, words: 6 }]);
  assertEquals(pauseGaps(marks), [700, 3500]);
  assertEquals(cleanMarks("nope"), []);
});

Deno.test("fluency signals: words per minute, long pauses, longest pause and time to first word", () => {
  const transcript = "So I think um the best place to visit is Samarkand because it has a lot of history";
  const marks = [
    { at: 1800, words: 2 },
    { at: 2400, words: 5 },
    { at: 2900, words: 8 },
    { at: 6400, words: 11 }, // 3.5 s pause
    { at: 7000, words: 14 },
    { at: 10100, words: 18 }, // 3.1 s pause
  ];
  const signals = fluencySignals({ transcript, speakingSeconds: 12, marks });
  assertEquals(signals.words, 18);
  assertEquals(signals.wpm, 90);
  assertEquals(signals.long_pauses, 2);
  assertEquals(signals.longest_pause_seconds, 3.5);
  assertEquals(signals.first_word_seconds, 1.8);
  assertEquals(signals.filler_count, 1);
  assertEquals(signals.fillers, ["um"]);
  assert(3500 > LONG_PAUSE_MS);
});

Deno.test("no timing: no pace and no pause data, never invented", () => {
  const signals = fluencySignals({ transcript: "A typed answer with several words in it", speakingSeconds: null });
  assertEquals(signals.wpm, null);
  assertEquals(signals.long_pauses, 0);
  assertEquals(signals.longest_pause_seconds, null);
  assertEquals(signals.first_word_seconds, null);
  // Under 5 seconds is too short for a pace.
  assertEquals(fluencySignals({ transcript: "one two three", speakingSeconds: 3 }).wpm, null);
});

Deno.test("server keeps the app's timing summary only when it is consistent", () => {
  const transcript = "one two three four five six seven eight";
  assertEquals(sanitizeClientFluency({ long_pauses: 1, longest_pause_seconds: 3.04, first_word_seconds: 1.21 }, transcript, 30), {
    long_pauses: 1,
    longest_pause_seconds: 3,
    first_word_seconds: 1.2,
  });
  assertEquals(sanitizeClientFluency({ long_pauses: 1, longest_pause_seconds: 99, first_word_seconds: 1 }, transcript, 30), null);
  assertEquals(sanitizeClientFluency({ long_pauses: 50, longest_pause_seconds: 3, first_word_seconds: 1 }, transcript, 30), null);
  assertEquals(sanitizeClientFluency({ long_pauses: 2, longest_pause_seconds: null, first_word_seconds: 1 }, transcript, 30), null);
  assertEquals(sanitizeClientFluency({ long_pauses: 0, longest_pause_seconds: null, first_word_seconds: null }, transcript, null), null);
  assertEquals(sanitizeClientFluency("x", transcript, 30), null);
});

Deno.test("comparing two attempts: higher scores better, fewer pauses better, pace judged against the band", () => {
  const before = { overall: 60, task: 70, vocabulary: 55, grammar: 50, fluency: 60, wpm: 70, long_pauses: 4, filler_count: 3, words: 60 };
  const after = { overall: 68, task: 70, vocabulary: 60, grammar: 48, fluency: 75, wpm: 95, long_pauses: 1, filler_count: 3, words: 90 };
  const rows = compareAttempts(before, after, [90, 130]);
  const verdict = Object.fromEntries(rows.map((row) => [row.key, row.verdict]));
  assertEquals(verdict.overall, "better");
  assertEquals(verdict.task, "same");
  assertEquals(verdict.grammar, "worse");
  assertEquals(verdict.long_pauses, "better");
  assertEquals(verdict.filler_count, "same");
  assertEquals(verdict.wpm, "better");
  assertEquals(rows.find((row) => row.key === "overall")?.delta, 8);
  // Speeding far past the band is not better.
  const tooFast = compareAttempts({ ...before, wpm: 120 }, { ...after, wpm: 190 }, [90, 130]);
  assertEquals(tooFast.find((row) => row.key === "wpm")?.verdict, "worse");
  // Unknown values give no verdict; rows unknown on both sides are dropped.
  const typed = compareAttempts({ ...before, wpm: null, fluency: null }, { ...after, wpm: null, fluency: null }, null);
  assertEquals(typed.some((row) => row.key === "wpm"), false);
  assertEquals(compareAttempts({ ...before, wpm: 80 }, { ...after, wpm: 100 }, null).find((row) => row.key === "wpm")?.verdict, null);
});
