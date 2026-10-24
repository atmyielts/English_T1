import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { OFFICIAL_DOMAINS, type OfficialDomain } from "./sat-practice-content.ts";
import {
  buildModule, catalogFacets, type CatalogEntry, filterCatalog, MODULE_SPEC, normalizeCatalog, preferenceOrder, selectDrill, targetFromLegacy,
} from "./sat-practice-selection.ts";
import { domainStats, scoreImpact } from "./sat-practice-insights.ts";
import { buildSatPracticePlan } from "./sat-practice-plan-generator.ts";

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
function row(domain: OfficialDomain, skill: string, difficulty: string, extra: Record<string, unknown> = {}) {
  const section = OFFICIAL_DOMAINS[domain].section;
  return { id: uuid(), type: "question_single_choice", section_type: section, domain: domain === "geometry_trigonometry" ? "geometry_trig" : section === "math" ? domain : "grammar",
    difficulty, official_domain: domain, skill, answer_format: "mcq", seen: 0, correct_count: 0, last_seen_at: null, last_correct: null, bank_order: n, ...extra };
}
function bank(perSkillPerDifficulty = 2): CatalogEntry[] {
  const rows = [];
  for (const [domain, spec] of Object.entries(OFFICIAL_DOMAINS)) {
    for (const skill of spec.skills) for (const d of ["easy", "medium", "hard"]) for (let i = 0; i < perSkillPerDifficulty; i++) rows.push(row(domain as OfficialDomain, skill, d));
  }
  return normalizeCatalog(rows);
}

Deno.test("Catalog: legacy rows get official taxonomy; status reflects the learner's latest result", () => {
  const rows = normalizeCatalog([
    { id: "a", type: "question_single_choice", section_type: "reading_writing", domain: "transitions", difficulty: "easy", seen: 0 },
    { id: "b", type: "question_spr", section_type: "math", domain: "geometry_trig", difficulty: "hard", seen: 2, correct_count: 1, last_correct: false, last_seen_at: "2026-10-01T00:00:00Z" },
    { id: "c", type: "question_single_choice", section_type: "math", domain: "algebra", difficulty: "weird", seen: 1, correct_count: 1, last_correct: true },
    { nope: true },
  ]);
  assertEquals(rows.map(r => [r.official_domain, r.skill, r.status, r.format, r.difficulty]), [
    ["expression_of_ideas", "transitions", "unseen", "mcq", "easy"],
    ["geometry_trigonometry", null, "missed", "spr", "hard"],
    ["algebra", null, "correct", "mcq", "medium"],
  ]);
});

Deno.test("Bank filters: official domain, skill, difficulty, format and status combine exactly", () => {
  const entries = normalizeCatalog([
    row("algebra", "linear_functions", "easy"), row("algebra", "linear_functions", "hard", { answer_format: "spr", type: "question_spr" }),
    row("algebra", "linear_inequalities", "hard", { seen: 1, last_correct: false }), row("craft_and_structure", "words_in_context", "hard", { seen: 1, last_correct: true }),
  ]);
  assertEquals(filterCatalog(entries, { official_domain: "algebra" }).length, 3);
  assertEquals(filterCatalog(entries, { official_domain: "algebra", difficulty: "hard" }).length, 2);
  assertEquals(filterCatalog(entries, { format: "spr" }).map(e => e.skill), ["linear_functions"]);
  assertEquals(filterCatalog(entries, { status: "missed" }).map(e => e.skill), ["linear_inequalities"]);
  assertEquals(filterCatalog(entries, { status: "correct", section_type: "reading_writing" }).length, 1);
  assertEquals(filterCatalog(entries, { skill: "words_in_context", section_type: "math" }).length, 0);
  const facets = catalogFacets(entries);
  assertEquals(facets.total, 4); assertEquals(facets.status, { unseen: 2, missed: 1, correct: 1 }); assertEquals(facets.format, { mcq: 3, spr: 1 });
});

Deno.test("Preference: unseen first, then missed longest ago, then correct longest ago", () => {
  const entries = normalizeCatalog([
    row("algebra", "linear_functions", "easy", { seen: 1, last_correct: true, last_seen_at: "2026-09-01T00:00:00Z" }),
    row("algebra", "linear_functions", "easy", { seen: 1, last_correct: false, last_seen_at: "2026-10-20T00:00:00Z" }),
    row("algebra", "linear_functions", "easy"),
    row("algebra", "linear_functions", "easy", { seen: 1, last_correct: false, last_seen_at: "2026-08-01T00:00:00Z" }),
  ]);
  assertEquals(preferenceOrder(entries).map(e => `${e.status}:${e.last_seen_at?.slice(5, 7) ?? "-"}`), ["unseen:-", "missed:08", "missed:10", "correct:09"]);
});

Deno.test("Plan drill fills the promised count by widening difficulty, then neighbouring skills, without repeats", () => {
  // Only one target-skill question at the target difficulty, as in production today.
  const entries = normalizeCatalog([
    row("algebra", "linear_functions", "medium"),
    row("algebra", "linear_functions", "easy"), row("algebra", "linear_functions", "hard"), row("algebra", "linear_functions", "hard"),
    row("algebra", "linear_inequalities", "medium"), row("algebra", "systems_of_linear_equations", "easy"),
    row("algebra", "linear_equations_one_variable", "hard"), row("algebra", "linear_equations_two_variables", "medium"),
    row("advanced_math", "nonlinear_functions", "medium"), row("craft_and_structure", "words_in_context", "medium"),
  ]);
  const target = { section_type: "math" as const, official_domain: "algebra" as const, skills: ["linear_functions"], difficulty: "medium" as const };
  const drill = selectDrill(entries, target, 8);
  assertEquals(drill.ids.length, 8); assertEquals(drill.available, 8); assertEquals(new Set(drill.ids).size, 8);
  const byId = new Map(entries.map(e => [e.id, e]));
  assertEquals(drill.ids.slice(0, 4).map(id => byId.get(id)!.skill), Array(4).fill("linear_functions"));
  assertEquals(byId.get(drill.ids[0]!)!.difficulty, "medium");
  assert(drill.ids.every(id => byId.get(id)!.official_domain === "algebra"));
  assertEquals(drill.widened, ["difficulty", "neighbouring_skills"]);
  // The pool is smaller than promised: say so honestly instead of padding.
  const short = selectDrill(entries, target, 20);
  assertEquals(short.available, 8); assertEquals(short.requested, 20);
  // Unseen first, then the oldest miss.
  const seenFirst = normalizeCatalog([
    row("algebra", "linear_functions", "medium", { seen: 1, last_correct: true, last_seen_at: "2026-10-01T00:00:00Z" }),
    row("algebra", "linear_functions", "medium", { seen: 1, last_correct: false, last_seen_at: "2026-10-02T00:00:00Z" }),
    row("algebra", "linear_functions", "medium"),
  ]);
  assertEquals(selectDrill(seenFirst, target, 3).ids.map(id => seenFirst.find(e => e.id === id)!.status), ["unseen", "missed", "correct"]);
});

Deno.test("Legacy plan targets map to official domains and their named skills", () => {
  assertEquals(targetFromLegacy("vocabulary_in_context", "easy"), { section_type: "reading_writing", official_domain: "craft_and_structure", skills: ["words_in_context"], legacy_domain: "vocabulary_in_context", difficulty: "easy" });
  const entries = bank(1);
  const drill = selectDrill(entries, targetFromLegacy("grammar", "medium"), 6);
  assertEquals(drill.available, 6);
  assert(drill.ids.every(id => entries.find(e => e.id === id)!.official_domain === "standard_english_conventions"));
});

Deno.test("Module builder: 27 R&W / 22 Math with the official domain mix, ordered like the test", () => {
  const entries = bank(3);
  const rw = buildModule(entries, "reading_writing");
  assertEquals(rw.ids.length, 27); assertEquals(rw.time_limit_seconds, 32 * 60); assertEquals(new Set(rw.ids).size, 27);
  const byId = new Map(entries.map(e => [e.id, e]));
  const count = (ids: string[]) => ids.reduce((m, id) => ({ ...m, [byId.get(id)!.official_domain]: (m[byId.get(id)!.official_domain] ?? 0) + 1 }), {} as Record<string, number>);
  assertEquals(count(rw.ids), MODULE_SPEC.reading_writing.mix);
  const order = rw.ids.map(id => byId.get(id)!.official_domain);
  assertEquals([...new Set(order)], ["craft_and_structure", "information_and_ideas", "standard_english_conventions", "expression_of_ideas"]);
  // Skills inside a domain are spread, not one skill repeated.
  assertEquals(new Set(rw.ids.filter(id => byId.get(id)!.official_domain === "craft_and_structure").map(id => byId.get(id)!.skill)).size, 3);
  const math = buildModule(entries, "math");
  assertEquals(math.ids.length, 22); assertEquals(math.time_limit_seconds, 35 * 60); assertEquals(count(math.ids), MODULE_SPEC.math.mix);
  const diffs = math.ids.map(id => ["easy", "medium", "hard"].indexOf(byId.get(id)!.difficulty));
  assertEquals(diffs, [...diffs].sort((a, b) => a - b));
  const tally = (ids: string[]) => ids.reduce((m, id) => ({ ...m, [byId.get(id)!.difficulty]: (m[byId.get(id)!.difficulty] ?? 0) + 1 }), {} as Record<string, number>);
  const harder = tally(buildModule(entries, "math", "harder").ids);
  assert(harder.hard! > tally(math.ids).hard!);
});

Deno.test("Module builder fills from the section when a domain is short and scales time honestly", () => {
  const small = normalizeCatalog([
    ...Array.from({ length: 10 }, () => row("algebra", "linear_functions", "medium")),
    ...Array.from({ length: 3 }, () => row("geometry_trigonometry", "circles", "hard")),
  ]);
  const m = buildModule(small, "math");
  assertEquals(m.ids.length, 13);
  assertEquals(m.domains.find(d => d.official_domain === "advanced_math"), { official_domain: "advanced_math", wanted: 7, selected: 0 });
  assertEquals(m.time_limit_seconds, Math.round((35 * 60 * 13) / 22 / 60) * 60);
  assertEquals(buildModule([], "reading_writing").ids, []);
});

Deno.test("Insights and score impact use only real answers", () => {
  const empty = scoreImpact(domainStats(bank(1)));
  assertEquals(empty.status, "insufficient_data"); assertEquals(empty.conservative, null);
  const answered = normalizeCatalog(Array.from({ length: 10 }, (_, i) => row("algebra", "linear_functions", "medium", { seen: 1, last_correct: i < 4 })));
  const stats = domainStats(answered);
  const algebra = stats.find(s => s.official_domain === "algebra")!;
  assertEquals([algebra.answered, algebra.correct, algebra.accuracy], [10, 4, 0.4]);
  const impact = scoreImpact(stats);
  assertEquals(impact.status, "ok");
  // (0.9 - 0.4) x 0.35 x 600 = 105 -> 110 high, 50 low (rounded to tens)
  assertEquals([impact.conservative, impact.optimistic], [50, 110]);
  const perfect = scoreImpact(domainStats(normalizeCatalog(Array.from({ length: 10 }, () => row("algebra", "linear_functions", "medium", { seen: 1, last_correct: true })))));
  assertEquals([perfect.status, perfect.conservative, perfect.optimistic], ["ok", 0, 0]);
});

Deno.test("Weekly plan: uses goal hours and test date, schedules modules, fills drills, stops at the test", () => {
  const entries = bank(2);
  const stats = domainStats(entries);
  const plan = buildSatPracticePlan(stats, { targetScore: 1450, testDate: null, hoursPerWeek: 7 }, { today: "2026-10-24", dueReviews: 3 });
  const days = new Set(plan.map(t => t.scheduled_for));
  assertEquals(days.size, 7);
  assertEquals(plan.filter(t => t.task_type === "module").length, 1);
  assert(plan.filter(t => t.task_type === "drill").every(t => Number(t.payload.question_count) >= 5 && t.payload.official_domain));
  assertEquals(plan[0]!.task_type, "notebook_review");
  const perDay = [...days].map(d => plan.filter(t => t.scheduled_for === d).reduce((s, t) => s + t.estimated_minutes, 0));
  assert(perDay.every(m => m <= 60 + 40), JSON.stringify(perDay));
  assertEquals(plan.find(t => t.task_type === "drill")!.payload.difficulty, "hard");
  const soon = buildSatPracticePlan(stats, { targetScore: 1100, testDate: "2026-10-27", hoursPerWeek: 10 }, { today: "2026-10-24", dueReviews: 0 });
  assertEquals(new Set(soon.map(t => t.scheduled_for)).size, 4);
  assertEquals(soon.find(t => t.task_type === "drill")!.payload.difficulty, "easy");
  assertEquals(buildSatPracticePlan([], { targetScore: 1400, testDate: null, hoursPerWeek: 3 }, { today: "2026-10-24", dueReviews: 0 }), []);
});
