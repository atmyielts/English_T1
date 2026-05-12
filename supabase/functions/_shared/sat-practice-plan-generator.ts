import type { SatDifficulty, SatDomain, SatSectionType } from "./sat-practice-core.ts";

type Mastery = {
  section_type: SatSectionType;
  domain: SatDomain;
  difficulty: SatDifficulty;
  mastery_level: number | null;
  rolling_accuracy: number | null;
};

export const buildSatPracticePlan = (
  masteryRows: Mastery[],
  opts: { targetScore: number; testDate: string | null; today: string },
): Array<{
  scheduled_for: string;
  task_type: "drill" | "notebook_review" | "half_mock" | "tutor_session";
  payload: Record<string, unknown>;
  estimated_minutes: number;
}> => {
  const sorted = [...masteryRows].sort((a, b) => (a.mastery_level ?? 0) - (b.mastery_level ?? 0));
  const first = sorted[0] ?? { section_type: "math" as const, domain: "algebra" as const, difficulty: "medium" as const };
  const second = sorted.find((row) => row.domain !== first.domain) ??
    { section_type: "reading_writing" as const, domain: "grammar" as const, difficulty: "medium" as const };
  const daysToTest = opts.testDate ? Math.ceil((Date.parse(opts.testDate) - Date.now()) / 86_400_000) : null;
  const urgent = daysToTest != null && daysToTest <= 14;

  return [
    {
      scheduled_for: opts.today,
      task_type: "drill",
      payload: {
        section_type: first.section_type,
        domain: first.domain,
        difficulty: first.difficulty,
        rationale: `Lowest current mastery for a ${opts.targetScore} target.`,
      },
      estimated_minutes: urgent ? 25 : 20,
    },
    {
      scheduled_for: opts.today,
      task_type: "notebook_review",
      payload: { count: 5, rationale: "Convert previous misses into due reviews." },
      estimated_minutes: 15,
    },
    {
      scheduled_for: opts.today,
      task_type: urgent ? "half_mock" : "drill",
      payload: {
        section_type: second.section_type,
        domain: second.domain,
        difficulty: second.difficulty,
        rationale: urgent ? "Test date is close; keep pacing visible." : "Balance the other side of the score.",
      },
      estimated_minutes: urgent ? 30 : 20,
    },
  ];
};
