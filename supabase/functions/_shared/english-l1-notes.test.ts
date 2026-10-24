import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { L1_NOTES, l1NoteIdForError, matchL1Notes, splitMistake, topL1Traps } from "./english-l1-notes.ts";
import { GRAMMAR_TOPICS } from "./english-mistakes.ts";

// grammar_units slugs that have a handbook page (20261024123000_english_grammar_handbook.sql).
const HANDBOOK_SLUGS = new Set([
  "to-be-am-is-are", "present-simple-routines", "there-is-there-are", "can-and-cant", "plurals-this-that-these-those",
  "possessives-my-your-s", "a1-prepositions-of-place", "a1-present-continuous-now", "articles-basic-control",
  "past-simple-did-didnt", "present-continuous-vs-simple", "comparatives-superlatives", "future-going-to-will",
  "countable-uncountable-quantifiers", "a2-prepositions-of-time", "a2-present-perfect-experience", "past-simple-time-control",
  "prepositions-common-use", "subject-verb-agreement", "present-perfect-vs-past-simple", "conditionals-first-second",
  "used-to-past-habits", "modals-of-obligation", "relative-clauses", "gerund-or-infinitive", "past-perfect", "passive-voice",
  "reported-speech", "third-and-mixed-conditionals", "modals-of-deduction", "linking-contrast",
]);

Deno.test("the library has about 40+ complete notes in three languages", () => {
  assert(L1_NOTES.length >= 40, `only ${L1_NOTES.length} notes`);
  const ids = new Set<string>();
  for (const note of L1_NOTES) {
    assert(/^[a-z0-9-]+$/.test(note.id), note.id);
    assert(!ids.has(note.id), `duplicate ${note.id}`);
    ids.add(note.id);
    for (const lang of ["en", "ru", "uz"] as const) {
      assert(note.title[lang].trim().length > 2, `${note.id} title.${lang}`);
      assert(note.why[lang].trim().length > 30, `${note.id} why.${lang}`);
    }
    assert(/[а-яё]/i.test(note.why.ru), `${note.id}: Russian text should be Cyrillic`);
    assert(!/[og]'/i.test(note.why.uz + note.title.uz), `${note.id}: Uzbek must use ʻ, not '`);
    assert(note.examples.length > 0, `${note.id} examples`);
    if (note.handbook) assert(HANDBOOK_SLUGS.has(note.handbook), `${note.id}: unknown handbook slug ${note.handbook}`);
    for (const topic of note.match.topics ?? []) assert((GRAMMAR_TOPICS as readonly string[]).includes(topic), `${note.id}: ${topic}`);
  }
  // Specific false friends asked for by name.
  for (const id of ["ff-magazine", "ff-sympathetic", "ff-accurate", "ff-fabric", "he-she", "make-do", "uncountable-plurals", "question-do", "time-in-on-at"]) {
    assert(ids.has(id), `missing ${id}`);
  }
});

Deno.test("each note's own example is matched to that note", () => {
  for (const note of L1_NOTES) {
    const example = note.examples[0]!;
    const [best] = matchL1Notes({ original: example.bad, corrected: example.good, topic: note.match.topics?.[0] ?? null });
    assertEquals(best?.id, note.id, `example "${example.bad}" → "${example.good}"`);
  }
});

Deno.test("at most one generic note per grammar topic", () => {
  const seen = new Map<string, string>();
  for (const note of L1_NOTES.filter((entry) => entry.generic)) {
    const topic = note.match.topics?.[0];
    assert(topic, `${note.id} is generic but has no topic`);
    assert(!seen.has(topic), `${topic}: ${seen.get(topic)} and ${note.id}`);
    seen.set(topic, note.id);
  }
});

Deno.test("matcher: specific patterns, topic fallback, and no false hits", () => {
  assertEquals(matchL1Notes({ original: "I need some informations", corrected: "I need some information" })[0]?.id, "uncountable-plurals");
  assertEquals(matchL1Notes({ original: "She works in a magazine", corrected: "She works in a shop" })[0]?.id, "ff-magazine");
  // Two traps in one sentence: both are found.
  const both = matchL1Notes({ original: "My mother is nurse. He works at night.", corrected: "My mother is a nurse. She works at night." }, 3).map((n) => n.id);
  assert(both.includes("he-she") && both.includes("article-jobs"), both.join(","));
  // Only the topic is known: the topic's generic note.
  assertEquals(matchL1Notes({ topic: "articles" })[0]?.id, "articles-none");
  // A topic without a generic note and no text: nothing.
  assertEquals(matchL1Notes({ topic: "passive" }), []);
  // A correct sentence or a spelling fix explains nothing.
  assertEquals(matchL1Notes({ original: "I recieve letters", corrected: "I receive letters" }), []);
  assertEquals(matchL1Notes({}), []);
  // A magazine that really is a magazine is fine.
  assertEquals(matchL1Notes({ original: "I read a magazine", corrected: "I read a magazine every week" }).some((n) => n.id === "ff-magazine"), false);
});

Deno.test("stored mistakes are split and matched; traps are ranked by frequency", () => {
  assertEquals(splitMistake('"I didn\'t went" → "I didn\'t go"'), { original: "I didn't went", corrected: "I didn't go" });
  assertEquals(splitMistake("Answer every point"), { original: "Answer every point", corrected: "" });
  assertEquals(l1NoteIdForError({ subskill_key: "grammar.past-simple", error_type: '"I didn\'t went home" → "I didn\'t go home"' }), "did-plus-base");
  assertEquals(l1NoteIdForError({ subskill_key: "speaking.task_completion", error_type: "Answer every point in a speaking task" }), null);
  const traps = topL1Traps([
    { subskill_key: "grammar.articles", error_type: '"She is doctor" → "She is a doctor"', error_frequency: 2 },
    { subskill_key: "grammar.quantifiers", error_type: '"many advices" → "a lot of advice"', error_frequency: 5 },
    { subskill_key: "grammar.articles", error_type: '"He is engineer" → "He is an engineer"', error_frequency: 2 },
    { subskill_key: "writing.style", error_type: "Use linking words", error_frequency: 9 },
  ]);
  assertEquals(traps.map((trap) => [trap.id, trap.count]), [["uncountable-plurals", 5], ["article-jobs", 4]]);
  assert(traps[0]!.example?.includes("→"));
});
