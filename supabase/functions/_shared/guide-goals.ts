import {
  type Answers,
  type Copy,
  copy,
  type GuideFlow,
  normalizeAnswers,
  type Product,
  safeProductUrl,
} from "./guide.ts";
export type GoalTarget = { table: string; scope: "language" | "product" | "user"; exam: string };
export type GoalChange = { field: string; label: Copy; previous: unknown; next: unknown };
export function goalTarget(product: Product): GoalTarget | null {
  const url = safeProductUrl(product.metadata?.app_url);
  if (!url) return null;
  const host = new URL(url).hostname;
  if (host === "practice.ielts.schood.online") {
    return { table: "ielts_practice_user_goals", scope: "language", exam: "ielts" };
  }
  if (host === "practice.sat.schood.online") {
    return { table: "sat_practice_user_goals", scope: "user", exam: "sat" };
  }
  if (host === "playbook.ielts.schood.online") {
    return { table: "ielts_playbook_user_profiles", scope: "product", exam: "ielts" };
  }
  if (host === "playbook.toefl.schood.online") {
    return { table: "toefl_playbook_user_profiles", scope: "product", exam: "toefl" };
  }
  if (host === "english.schood.online" || host.endsWith(".english.schood.online")) {
    return { table: "learner_language_goals", scope: "language", exam: "english" };
  }
  return null;
}
const labels: Record<string, Copy> = {
  target_overall_band: copy("Target IELTS band", "Maqsadli IELTS bali", "Целевой балл IELTS"),
  target_score: copy("Target SAT score", "Maqsadli SAT bali", "Целевой балл SAT"),
  target_date: copy("Target date", "Maqsadli sana", "Целевая дата"),
  deadline_date: copy("Target date", "Maqsadli sana", "Целевая дата"),
  test_date: copy("Test date", "Test sanasi", "Дата теста"),
  daily_practice_minutes: copy("Daily practice minutes", "Kunlik mashq daqiqalari", "Минут практики в день"),
  daily_time_minutes: copy("Daily study minutes", "Kunlik o‘qish daqiqalari", "Минут занятий в день"),
  hours_per_week: copy(
    "Whole study hours per week",
    "Haftalik butun o‘qish soatlari",
    "Целых часов занятий в неделю",
  ),
  practice_start_date: copy("Practice start date", "Mashq boshlanish sanasi", "Дата начала практики"),
  program_duration_days: copy(
    "Program length in days",
    "Dastur davomiyligi, kun",
    "Длительность программы в днях",
  ),
};
/** Only user-confirmed goals. Never writes score history, CEFR estimates, roles or memberships. */
export function goalChanges(
  flow: GuideFlow,
  input: Answers,
  target: GoalTarget,
  current: Record<string, unknown> | null,
  today: string,
): GoalChange[] {
  const answers = normalizeAnswers(flow, input);
  if (
    !["learner", "parent"].includes(String(answers.audience)) || answers.exam !== target.exam ||
    answers.parent_intent === "progress"
  ) return [];
  const goals: Record<string, string | number> = {};
  for (const q of flow.questions) {
    if (q.goalField && (typeof answers[q.id] === "number" || typeof answers[q.id] === "string")) {
      goals[q.goalField] = answers[q.id] as string | number;
    }
  }
  const patch: Record<string, string | number> = {};
  const score = typeof goals.target_score === "number" ? goals.target_score : null;
  const minutes = typeof goals.daily_minutes === "number" ? Math.floor(goals.daily_minutes) : null;
  const date = typeof goals.target_date === "string" && goals.target_date >= today ? goals.target_date : null;
  if (target.exam === "ielts" && score !== null && score >= 0 && score <= 9) {
    patch.target_overall_band = Math.round(score * 10) / 10;
  }
  if (target.table === "sat_practice_user_goals") {
    if (score !== null && score >= 400 && score <= 1600) patch.target_score = Math.round(score);
    if (date) patch.test_date = date;
    if (minutes !== null) patch.hours_per_week = Math.max(1, Math.min(40, Math.round(minutes * 7 / 60)));
  } else if (target.table === "ielts_practice_user_goals") {
    if (minutes !== null) patch.daily_practice_minutes = Math.max(10, Math.min(360, minutes));
    if (date) {
      const start = typeof current?.practice_start_date === "string" && current.practice_start_date <= date
        ? current.practice_start_date
        : today;
      const duration = Math.round((Date.parse(date) - Date.parse(start)) / 86400000) + 1;
      if (duration >= 1 && duration <= 365) {
        patch.target_date = date;
        patch.practice_start_date = start;
        patch.program_duration_days = duration;
      }
    }
  } else if (target.scope === "product" && date) patch.deadline_date = date;
  else if (target.table === "learner_language_goals" && minutes !== null) {
    patch.daily_time_minutes = Math.max(5, Math.min(240, minutes));
  }
  return Object.entries(patch).filter(([field, next]) => current?.[field] !== next).map(([field, next]) => ({
    field,
    label: labels[field],
    previous: current?.[field] ?? null,
    next,
  }));
}
