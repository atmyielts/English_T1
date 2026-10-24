import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { examEn } from "../src/i18n/exam.en.ts";
import { examRu } from "../src/i18n/exam.ru.ts";
import { examUz } from "../src/i18n/exam.uz.ts";
import { EXAM_SECTIONS } from "../../../supabase/functions/_shared/english-exam-format.ts";
import { MOCK_KINDS, PRACTICE_TARGETS, SPEAKING_GROUPS, WRITING_TASKS } from "../../../supabase/functions/_shared/english-exam.ts";
import { DAY_ENTRIES } from "../src/app/navModel.ts";

Deno.test("exam strings have the same keys in English, Russian and Uzbek", () => {
  const en = Object.keys(examEn).sort();
  assertEquals(Object.keys(examRu).sort(), en);
  assertEquals(Object.keys(examUz).sort(), en);
  for (const [key, value] of [...Object.entries(examRu), ...Object.entries(examUz)]) {
    assert(typeof value === "string" && value.trim().length > 0, `${key} must not be empty`);
  }
});

Deno.test("every section, kind, level, task and practice target the server sends has a label", () => {
  for (const catalog of [examEn, examRu, examUz]) {
    for (const section of EXAM_SECTIONS) assert(catalog[`exam.section.${section}`] && catalog[`exam.format.${section}`] && catalog[`exam.intro.${section}`], section);
    for (const kind of MOCK_KINDS) assert(catalog[`exam.kind.${kind}`], kind);
    for (const level of ["C1", "B2", "B1", "below_b1"]) assert(catalog[`exam.level.${level}`], level);
    for (const task of [...WRITING_TASKS, ...SPEAKING_GROUPS]) assert(catalog[`exam.result.task.${task}`], task);
    for (const target of PRACTICE_TARGETS) assert(catalog[`exam.practice.${target}`], target);
  }
});

Deno.test("placeholders match across languages; Russian plurals have one/few/many", () => {
  const params = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((match) => match[1]).sort();
  for (const [key, english] of Object.entries(examEn)) {
    assertEquals(params(examRu[key] ?? ""), params(english), `ru ${key}`);
    assertEquals(params(examUz[key] ?? ""), params(english), `uz ${key}`);
    const ru = examRu[key] ?? "";
    if (ru.includes("{count|")) assert(/one:/.test(ru) && /few:/.test(ru) && /many:/.test(ru), `ru plural ${key}`);
  }
});

Deno.test("Uzbek uses the ʻ letter mark, not an ASCII apostrophe, in oʻ and gʻ", () => {
  for (const [key, value] of Object.entries(examUz)) {
    assert(!/[og]'/i.test(value ?? ""), `${key} uses ' instead of ʻ`);
  }
});

Deno.test("the exam page is one entry in the daily navigation", () => {
  assertEquals(DAY_ENTRIES.filter((entry) => entry.to === "/exam").map((entry) => entry.labelKey), ["exam.nav"]);
});
