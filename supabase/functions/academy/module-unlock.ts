// Unlock-by-check for course modules (V-CRS-F5). Mirrors the SQL function
// public.academy_module_unlocked, which enforces the same rule on lesson
// progress and quiz attempts; this copy only decides what the learner sees.
//   {}                                              open
//   {"type":"quiz_pass","quiz_id":"…","min_percent":70}   a passed attempt
//   {"type":"previous_module"}                      previous module's lessons completed
type Row = Record<string, unknown>;

const passed = (attempt: Row, minPercent: number | null): boolean => {
  if (!["submitted", "graded"].includes(String(attempt.status))) return false;
  return minPercent == null ? attempt.passed === true : Number(attempt.percentage ?? 0) >= minPercent;
};

export const lockedModuleIds = (
  modules: Row[],
  lessons: Row[],
  completedLessonIds: Set<string>,
  attempts: Row[],
): Set<string> => {
  const locked = new Set<string>();
  const byCourse = new Map<string, Row[]>();
  for (const m of modules) byCourse.set(String(m.course_id), [...(byCourse.get(String(m.course_id)) ?? []), m]);
  for (const list of byCourse.values()) list.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
  for (const m of modules) {
    const rule = (m.unlock_rule && typeof m.unlock_rule === "object" ? m.unlock_rule : {}) as Row;
    if (rule.type === "quiz_pass" && typeof rule.quiz_id === "string") {
      const min = rule.min_percent == null || rule.min_percent === "" ? null : Number(rule.min_percent);
      const ok = attempts.some((a) => String(a.quiz_id) === rule.quiz_id && passed(a, Number.isFinite(min) ? min : null));
      if (!ok) locked.add(String(m.id));
    } else if (rule.type === "previous_module") {
      const siblings = byCourse.get(String(m.course_id)) ?? [];
      const previous = siblings.filter((s) => Number(s.position ?? 0) < Number(m.position ?? 0)).at(-1);
      if (!previous) continue;
      const previousLessons = lessons.filter((l) => String(l.module_id) === String(previous.id));
      if (previousLessons.some((l) => !completedLessonIds.has(String(l.id)))) locked.add(String(m.id));
    }
  }
  return locked;
};
