import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classesEn } from "../src/i18n/classes.en.ts";
import { classesRu } from "../src/i18n/classes.ru.ts";
import { classesUz } from "../src/i18n/classes.uz.ts";
import { csvCell, daysUntil, rosterCsv } from "../src/lib/classesFormat.ts";
import { YOU_ENTRIES } from "../src/app/navModel.ts";

Deno.test("classes strings have the same keys in English, Russian and Uzbek", () => {
  const en = Object.keys(classesEn).sort();
  assertEquals(Object.keys(classesRu).sort(), en);
  assertEquals(Object.keys(classesUz).sort(), en);
  for (const [key, value] of [...Object.entries(classesRu), ...Object.entries(classesUz)]) {
    assert(typeof value === "string" && value.trim().length > 0, `${key} must not be empty`);
  }
});

Deno.test("every assignment kind, plan tier and tab has a label", () => {
  for (const catalog of [classesEn, classesRu, classesUz]) {
    for (const kind of ["lessons", "skill_count", "roleplay", "speaking_mock"]) {
      assert(catalog[`classes.kind.${kind}`], kind);
      assert(catalog[`classes.kind.${kind}.hint`], `${kind}.hint`);
    }
    for (const plan of ["free", "partial", "full"]) assert(catalog[`classes.plan.${plan}`], plan);
    for (const tab of ["students", "assignments", "digest", "settings"]) assert(catalog[`classes.tab.${tab}`], tab);
  }
});

Deno.test("placeholders match across languages; plural forms hold no placeholders; Russian plurals have one/few/many", () => {
  const params = (text: string) => [...new Set([...text.matchAll(/\{(\w+)/g)].map((match) => match[1]))].sort();
  for (const [key, english] of Object.entries(classesEn)) {
    assertEquals(params(classesRu[key] ?? ""), params(english), `ru ${key}`);
    assertEquals(params(classesUz[key] ?? ""), params(english), `uz ${key}`);
    for (const text of [english, classesRu[key] ?? "", classesUz[key] ?? ""]) {
      for (const match of text.matchAll(/\{\w+\|([^}]*)\}/g)) assert(!match[1]!.includes("{"), `nested placeholder in ${key}`);
    }
    const ru = classesRu[key] ?? "";
    if (ru.includes("{count|")) assert(/one:/.test(ru) && /few:/.test(ru) && /many:/.test(ru), `ru plural ${key}`);
  }
});

Deno.test("Uzbek uses the ʻ letter mark, not an ASCII apostrophe, in oʻ and gʻ", () => {
  for (const [key, value] of Object.entries(classesUz)) {
    assert(!/[og]'/i.test(value ?? ""), `${key} uses ' instead of ʻ`);
  }
});

Deno.test("Classes is one entry in the personal section of the navigation", () => {
  assertEquals(YOU_ENTRIES.filter((entry) => entry.to === "/classes").length, 1);
  assertEquals(YOU_ENTRIES.find((entry) => entry.to === "/classes")?.labelKey, "classes.nav");
});

Deno.test("CSV export quotes cells and neutralises spreadsheet formulas", () => {
  assertEquals(csvCell('He said "hi"'), '"He said ""hi"""');
  assertEquals(csvCell("=HYPERLINK(1)"), `"'=HYPERLINK(1)"`);
  assertEquals(csvCell(null), '""');
  const csv = rosterCsv(
    [{ name: "Aziza K.", levels: { reading: "B1" }, streak: 3, minutes_week: 42, activities_week: 5, last_active: "2026-10-29T05:00:00Z", assignments_done: 1, assignments_total: 2, plan: "free" }],
    ["reading", "listening"],
    {
      name: "Name",
      skill: (skill) => skill,
      streak: "Streak",
      minutes: "Minutes",
      activities: "Activities",
      lastActive: "Last active",
      assignments: "Assignments",
      plan: "Plan",
      planLabel: (plan) => (plan === "free" ? "Free tier" : plan),
    },
  );
  assertEquals(csv.split("\r\n"), [
    '"Name","reading","listening","Streak","Minutes","Activities","Last active","Assignments","Plan"',
    '"Aziza K.","B1","","3","42","5","2026-10-29","1/2","Free tier"',
  ]);
});

Deno.test("days until a due date follow learner time", () => {
  const now = new Date("2026-10-29T20:00:00Z"); // already the 30th in Tashkent
  assertEquals(daysUntil("2026-10-30", now), 0);
  assertEquals(daysUntil("2026-10-31", now), 1);
  assertEquals(daysUntil("2026-10-29", now), -1);
});
