// Plan-template parsing and date adaptation shared by the SAT and TOEFL
// playbooks. Pure functions (no I/O) so they are unit-tested directly.
//
// Primary shape (content contract, see content/sat-playbook/plans/*.json):
//   schedule_json = {
//     version, who_for, rules: string[], resources: [{label,url}], error_codes: [{code,meaning}],
//     weekly_hours: {min,max,total}, simulator_cta, practice_cta,
//     phases: [{label, weeks: number[], goal}], modules: slug[], guides: slug[],
//     weeks: [{ week, label, focus: string[], hours, checkpoint: string,
//               days: [{ day, weekday, minutes, tasks: string[] }] }],
//     checkpoints: [{ week, title, pass_rule, if_not }] }
// Task strings reference pages as "(/module-slug)" and tools as "(https://…)".
// Older IELTS-style shapes ({weeks:[{label, focus, tasks|daily_routine, modules}]}
// or phase-only templates) are still accepted.

export type TemplateTask = {
  title: string;
  page_slug: string | null;
  url: string | null;
  minutes: number | null;
  day: number | null;
  weekday: string | null;
};

export type TemplateDay = { day: number; weekday: string | null; minutes: number | null; tasks: TemplateTask[] };

export type TemplateCheckpoint = { title: string | null; pass_rule: string | null; if_not: string | null; text: string | null };

export type TemplateWeek = {
  index: number;
  label: string;
  focus: string[];
  hours: number | null;
  days: TemplateDay[];
  /** All tasks of the week (day tasks flattened, plus week-level tasks). */
  tasks: TemplateTask[];
  modules: string[];
  checkpoint: TemplateCheckpoint | null;
};

export type TemplateMeta = {
  who_for: string | null;
  rules: string[];
  resources: Array<{ label: string; url: string }>;
  error_codes: Array<{ code: string; meaning: string }>;
  weekly_hours: { min: number | null; max: number | null; total: number | null } | null;
  simulator_cta: string | null;
  practice_cta: string | null;
  phases: Array<{ label: string; weeks: number[]; goal: string | null }>;
  modules: string[];
  guides: string[];
};

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  !!value && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown, max = 600): string => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const textOrNull = (value: unknown, max = 600): string | null => text(value, max) || null;
const numOrNull = (value: unknown, max = 10000): number | null => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const asStringList = (value: unknown, max = 600): string[] => {
  if (typeof value === "string") return value.trim() ? [text(value, max)] : [];
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? text(entry, max) : isRecord(entry) ? text(entry.title ?? entry.label ?? entry.text ?? "", max) : ""))
    .filter(Boolean);
};

const slugFrom = (value: unknown): string | null => {
  const raw = isRecord(value) ? value.slug ?? value.module_slug ?? value.page_slug ?? value.module : value;
  const candidate = text(raw, 160).replace(/^\/+/, "").toLowerCase();
  return SLUG_RE.test(candidate) ? candidate : null;
};

/** "(/math-algebra)" style page references inside task text. */
const linkedSlug = (value: string): string | null => {
  const match = value.match(/\(\/([a-z0-9]+(?:-[a-z0-9]+)*)\)/);
  return match ? match[1] : null;
};

/** First https URL inside task text, without trailing punctuation. */
export const linkedUrl = (value: string): string | null => {
  const match = value.match(/https:\/\/[^\s)]+/);
  return match ? match[0].replace(/[.,;:]+$/, "") : null;
};

const findKnownSlug = (value: string, knownSlugs?: ReadonlySet<string>): string | null => {
  if (!knownSlugs || knownSlugs.size === 0) return null;
  const lowered = value.toLowerCase();
  let best: string | null = null;
  for (const slug of knownSlugs) {
    const re = new RegExp(`(^|[^a-z0-9-])${slug.replace(/[-]/g, "\\-")}($|[^a-z0-9-])`);
    if (re.test(lowered) && (!best || slug.length > best.length)) best = slug;
  }
  return best;
};

const TASK_KEYS = ["tasks", "daily_routine", "sessions", "activities", "checklist", "items", "actions"];
const MODULE_KEYS = ["modules", "module_slugs", "playbook_modules", "pages", "read", "guides"];
const LABEL_KEYS = ["label", "title", "theme", "name", "heading"];

const parseTask = (entry: unknown, knownSlugs?: ReadonlySet<string>, day: { day: number | null; weekday: string | null } = { day: null, weekday: null }): TemplateTask | null => {
  if (typeof entry === "string") {
    const title = text(entry);
    if (!title) return null;
    return { title, page_slug: linkedSlug(title) ?? findKnownSlug(title, knownSlugs), url: linkedUrl(title), minutes: null, ...day };
  }
  if (!isRecord(entry)) return null;
  const base = text(entry.title ?? entry.label ?? entry.task ?? entry.name ?? entry.activity ?? entry.description ?? entry.text ?? "");
  const dayLabel = typeof entry.day === "string" ? text(entry.day, 40) : "";
  const title = dayLabel && base ? `${dayLabel}: ${base}` : base || dayLabel;
  if (!title) return null;
  const explicitSlug = slugFrom(entry.module_slug ?? entry.page_slug ?? entry.slug ?? entry.module ?? null);
  const url = textOrNull(entry.url, 800);
  return {
    title,
    page_slug: explicitSlug ?? linkedSlug(title) ?? findKnownSlug(title, knownSlugs),
    url: url && url.startsWith("https://") ? url : linkedUrl(title),
    minutes: numOrNull(entry.minutes ?? entry.duration_minutes, 600),
    ...day,
  };
};

const parseCheckpoint = (value: unknown): TemplateCheckpoint | null => {
  if (typeof value === "string") return value.trim() ? { title: null, pass_rule: null, if_not: null, text: text(value, 1200) } : null;
  if (!isRecord(value)) return null;
  const cp = {
    title: textOrNull(value.title ?? value.label, 200),
    pass_rule: textOrNull(value.pass_rule ?? value.pass, 800),
    if_not: textOrNull(value.if_not ?? value.otherwise, 800),
    text: textOrNull(value.text ?? value.description, 1200),
  };
  return cp.title || cp.pass_rule || cp.if_not || cp.text ? cp : null;
};

const mergeCheckpoints = (a: TemplateCheckpoint | null, b: TemplateCheckpoint | null): TemplateCheckpoint | null => {
  if (!a) return b;
  if (!b) return a;
  return { title: b.title ?? a.title, pass_rule: b.pass_rule ?? a.pass_rule, if_not: b.if_not ?? a.if_not, text: a.text ?? b.text };
};

const parseWeek = (entry: unknown, index: number, knownSlugs?: ReadonlySet<string>): TemplateWeek | null => {
  if (typeof entry === "string") {
    const label = text(entry, 200);
    return label ? { index, label, focus: [], hours: null, days: [], tasks: [], modules: [], checkpoint: null } : null;
  }
  if (!isRecord(entry)) return null;
  let label = "";
  for (const key of LABEL_KEYS) {
    label = text(entry[key], 200);
    if (label) break;
  }
  const focus = [...asStringList(entry.focus), ...asStringList(entry.goals), ...asStringList(entry.goal), ...asStringList(entry.objectives)].slice(0, 12);

  const days: TemplateDay[] = [];
  const dayList = Array.isArray(entry.days) ? entry.days : [];
  dayList.forEach((rawDay, i) => {
    if (isRecord(rawDay) && (Array.isArray(rawDay.tasks) || typeof rawDay.tasks === "string")) {
      const dayNumber = numOrNull(rawDay.day, 7) ?? i + 1;
      const weekday = textOrNull(rawDay.weekday, 12);
      const tasks = (Array.isArray(rawDay.tasks) ? rawDay.tasks : [rawDay.tasks])
        .map((task) => parseTask(task, knownSlugs, { day: dayNumber, weekday }))
        .filter((task): task is TemplateTask => !!task)
        .slice(0, 12);
      days.push({ day: dayNumber, weekday, minutes: numOrNull(rawDay.minutes, 900), tasks });
    }
  });

  const tasks: TemplateTask[] = days.flatMap((d) => d.tasks);
  for (const key of TASK_KEYS) {
    const value = entry[key];
    const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    for (const item of list) {
      const task = parseTask(item, knownSlugs);
      if (task) tasks.push(task);
    }
  }
  // Legacy: "days" as a plain list of activities.
  if (days.length === 0) {
    for (const item of dayList) {
      const task = parseTask(item, knownSlugs);
      if (task) tasks.push(task);
    }
  }
  for (const key of ["practice", "simulator", "mock", "review"]) {
    for (const value of asStringList(entry[key])) tasks.push({ title: value, page_slug: linkedSlug(value) ?? findKnownSlug(value, knownSlugs), url: linkedUrl(value), minutes: null, day: null, weekday: null });
  }
  const modules: string[] = [];
  for (const key of MODULE_KEYS) {
    const value = entry[key];
    const list = Array.isArray(value) ? value : value ? [value] : [];
    for (const item of list) {
      const slug = slugFrom(item);
      if (slug && !modules.includes(slug)) modules.push(slug);
    }
  }
  return {
    index,
    label: label || `#${index + 1}`,
    focus,
    hours: numOrNull(entry.hours, 168),
    days,
    tasks: tasks.slice(0, 80),
    modules: modules.slice(0, 12),
    checkpoint: parseCheckpoint(entry.checkpoint),
  };
};

/** Normalise any supported schedule shape into an ordered list of template weeks. */
export const normalizeTemplateWeeks = (
  schedule: unknown,
  durationDays?: number | null,
  knownSlugs?: ReadonlySet<string>,
): TemplateWeek[] => {
  const source = isRecord(schedule) ? schedule : {};
  const weeksRaw = Array.isArray(source.weeks) ? source.weeks : [];
  const checkpoints = Array.isArray(source.checkpoints) ? source.checkpoints.filter(isRecord) : [];
  const weeks = weeksRaw
    .map((entry, index) => parseWeek(entry, index, knownSlugs))
    .filter((entry): entry is TemplateWeek => !!entry)
    .slice(0, 26)
    .map((week, index) => {
      const declared = isRecord(weeksRaw[index]) ? numOrNull((weeksRaw[index] as Json).week, 60) : null;
      const number = declared ?? index + 1;
      const extra = checkpoints.find((cp) => numOrNull(cp.week, 60) === number);
      return { ...week, index, checkpoint: mergeCheckpoints(week.checkpoint, parseCheckpoint(extra)) };
    });
  if (weeks.length > 0) return weeks;

  // Phase-only templates: expand each phase over its declared week count, or
  // split the template duration evenly between phases.
  const phases = Array.isArray(source.phases) ? source.phases.filter((p) => isRecord(p) || typeof p === "string") : [];
  if (phases.length === 0) return [];
  const totalWeeks = Math.max(phases.length, Math.ceil(Math.max(7, Number(durationDays) || phases.length * 7) / 7));
  const declared = phases.map((phase) => {
    if (!isRecord(phase)) return 0;
    if (Array.isArray(phase.weeks)) return Math.min(26, phase.weeks.length);
    const n = Number(phase.weeks ?? phase.duration_weeks ?? NaN);
    return Number.isFinite(n) && n >= 1 ? Math.min(26, Math.floor(n)) : 0;
  });
  const undeclared = declared.filter((n) => n === 0).length;
  const remaining = Math.max(0, totalWeeks - declared.reduce((sum, n) => sum + n, 0));
  const share = undeclared > 0 ? Math.max(1, Math.floor(remaining / undeclared)) : 0;
  const out: TemplateWeek[] = [];
  phases.forEach((phase, phaseIndex) => {
    const parsed = parseWeek(isRecord(phase) ? { ...phase, weeks: undefined } : phase, out.length, knownSlugs);
    if (!parsed) return;
    const span = declared[phaseIndex] || share || 1;
    const goal = isRecord(phase) ? text(phase.goal ?? "", 400) : "";
    for (let i = 0; i < span && out.length < 26; i += 1) {
      out.push({
        ...parsed,
        index: out.length,
        label: span > 1 ? `${parsed.label} (${i + 1}/${span})` : parsed.label,
        focus: goal && !parsed.focus.includes(goal) ? [goal, ...parsed.focus] : parsed.focus,
      });
    }
  });
  return out;
};

/** Plan-wide information (who it is for, rules, resources, hours, phases). */
export const normalizeTemplateMeta = (schedule: unknown): TemplateMeta => {
  const s = isRecord(schedule) ? schedule : {};
  const https = (v: unknown) => {
    const url = textOrNull(v, 800);
    return url && url.startsWith("https://") ? url : null;
  };
  const hours = isRecord(s.weekly_hours) ? s.weekly_hours : null;
  return {
    who_for: textOrNull(s.who_for, 2000),
    rules: asStringList(s.rules, 600).slice(0, 20),
    resources: (Array.isArray(s.resources) ? s.resources.filter(isRecord) : [])
      .map((r) => ({ label: text(r.label ?? r.title, 200), url: https(r.url) ?? "" }))
      .filter((r) => r.label && r.url)
      .slice(0, 20),
    error_codes: (Array.isArray(s.error_codes) ? s.error_codes.filter(isRecord) : [])
      .map((e) => ({ code: text(e.code, 8), meaning: text(e.meaning, 300) }))
      .filter((e) => e.code && e.meaning)
      .slice(0, 12),
    weekly_hours: hours ? { min: numOrNull(hours.min, 168), max: numOrNull(hours.max, 168), total: numOrNull(hours.total, 5000) } : null,
    simulator_cta: https(s.simulator_cta),
    practice_cta: https(s.practice_cta),
    phases: (Array.isArray(s.phases) ? s.phases.filter(isRecord) : []).map((p) => ({
      label: text(p.label ?? p.title, 200),
      weeks: Array.isArray(p.weeks) ? p.weeks.map((w) => numOrNull(w, 60)).filter((w): w is number => w != null) : [],
      goal: textOrNull(p.goal, 600),
    })).filter((p) => p.label).slice(0, 12),
    modules: (Array.isArray(s.modules) ? s.modules : []).map(slugFrom).filter((x): x is string => !!x).slice(0, 30),
    guides: (Array.isArray(s.guides) ? s.guides : []).map(slugFrom).filter((x): x is string => !!x).slice(0, 30),
  };
};

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value: unknown): Date | null => {
  const raw = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const date = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

export const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY_MS);

export type ScheduledTask = TemplateTask & { date: string };

export type ScheduledWeek = {
  calendar_week: number;
  starts_on: string;
  ends_on: string;
  template_weeks: number[];
  label: string;
  focus: string[];
  hours: number | null;
  tasks: ScheduledTask[];
  modules: string[];
  checkpoints: TemplateCheckpoint[];
};

export type ScheduleResult = {
  start_date: string;
  test_date: string | null;
  weeks_available: number | null;
  template_weeks: number;
  compressed: boolean;
  buffer_weeks: number;
  weeks: ScheduledWeek[];
};

/**
 * Map template weeks onto the learner's calendar. When the test is closer than
 * the template length, template weeks are merged proportionally (the final
 * template week always lands in the last calendar week before the test). When
 * the test is further away, the plan runs from the start date and the spare
 * weeks are reported as buffer. Day-numbered tasks get their own date.
 */
export const scheduleTemplateWeeks = (
  weeks: TemplateWeek[],
  options: { startDate: string | Date; testDate?: string | Date | null },
): ScheduleResult => {
  const start = options.startDate instanceof Date ? options.startDate : parseDate(options.startDate) ?? new Date();
  const startDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const test = options.testDate instanceof Date ? options.testDate : parseDate(options.testDate ?? null);
  const testValid = test && test.getTime() > startDay.getTime() ? test : null;
  const n = weeks.length;
  const weeksAvailable = testValid ? Math.max(1, Math.floor(daysBetween(startDay, testValid) / 7)) : null;
  const calendarWeeks = n === 0 ? 0 : weeksAvailable == null ? n : Math.min(n, weeksAvailable);
  const compressed = weeksAvailable != null && weeksAvailable < n;

  const out: ScheduledWeek[] = [];
  for (let c = 0; c < calendarWeeks; c += 1) {
    const members = weeks.filter((_, j) => (compressed ? Math.floor((j * calendarWeeks) / n) === c : j === c));
    const startsOn = new Date(startDay.getTime() + c * 7 * DAY_MS);
    let endsOn = new Date(startsOn.getTime() + 6 * DAY_MS);
    if (testValid && c === calendarWeeks - 1 && compressed) endsOn = new Date(testValid.getTime() - DAY_MS);
    if (testValid && endsOn.getTime() >= testValid.getTime()) endsOn = new Date(testValid.getTime() - DAY_MS);
    if (endsOn.getTime() < startsOn.getTime()) endsOn = startsOn;
    const span = Math.max(1, daysBetween(startsOn, endsOn) + 1);
    const modules: string[] = [];
    for (const member of members) for (const slug of member.modules) if (!modules.includes(slug)) modules.push(slug);
    const tasks: ScheduledTask[] = [];
    members.forEach((member, m) => {
      for (const task of member.tasks) {
        // Day d of template week m inside a merged calendar week of `span` days.
        const slot = task.day != null ? ((m * 7 + task.day - 1) * span) / (members.length * 7) : span - 1;
        const offset = Math.min(span - 1, Math.max(0, Math.floor(slot)));
        tasks.push({ ...task, date: isoDate(new Date(startsOn.getTime() + offset * DAY_MS)) });
      }
    });
    const hoursValues = members.map((member) => member.hours).filter((h): h is number => h != null);
    out.push({
      calendar_week: c + 1,
      starts_on: isoDate(startsOn),
      ends_on: isoDate(endsOn),
      template_weeks: members.map((member) => member.index + 1),
      label: members.map((member) => member.label).join(" + "),
      focus: members.flatMap((member) => member.focus).slice(0, 16),
      hours: hoursValues.length === members.length && hoursValues.length > 0 ? Math.round(hoursValues.reduce((a, b) => a + b, 0) * 10) / 10 : null,
      tasks: tasks.slice(0, 120),
      modules,
      checkpoints: members.map((member) => member.checkpoint).filter((cp): cp is TemplateCheckpoint => !!cp),
    });
  }

  return {
    start_date: isoDate(startDay),
    test_date: testValid ? isoDate(testValid) : null,
    weeks_available: weeksAvailable,
    template_weeks: n,
    compressed,
    buffer_weeks: weeksAvailable != null && weeksAvailable > n ? weeksAvailable - n : 0,
    weeks: out,
  };
};

export type PlanItemDraft = {
  kind: "task";
  title: string;
  page_slug: string | null;
  week_number: number;
  due_date: string;
  sort_order: number;
  metadata: Json;
};

/** Turn a scheduled plan into trackable checklist items: every task, each referenced module, and each weekly checkpoint. */
export const planItemsFromSchedule = (schedule: ScheduleResult, maxItems = 500): PlanItemDraft[] => {
  const items: PlanItemDraft[] = [];
  let order = 0;
  for (const week of schedule.weeks) {
    const covered = new Set<string>();
    for (const task of week.tasks) {
      if (task.page_slug) covered.add(task.page_slug);
      const metadata: Json = {};
      if (task.day != null) metadata.day = task.day;
      if (task.weekday) metadata.weekday = task.weekday;
      if (task.minutes) metadata.minutes = task.minutes;
      if (task.url) metadata.url = task.url;
      items.push({ kind: "task", title: task.title, page_slug: task.page_slug, week_number: week.calendar_week, due_date: task.date, sort_order: order++, metadata });
    }
    for (const slug of week.modules) {
      if (covered.has(slug)) continue;
      items.push({ kind: "task", title: slug, page_slug: slug, week_number: week.calendar_week, due_date: week.ends_on, sort_order: order++, metadata: { reading: true } });
    }
    for (const cp of week.checkpoints) {
      items.push({
        kind: "task",
        title: cp.title ?? cp.pass_rule ?? cp.text ?? week.label,
        page_slug: null,
        week_number: week.calendar_week,
        due_date: week.ends_on,
        sort_order: order++,
        metadata: { checkpoint: true, pass_rule: cp.pass_rule, if_not: cp.if_not, text: cp.text },
      });
    }
    if (week.tasks.length === 0 && week.modules.length === 0 && week.checkpoints.length === 0) {
      items.push({ kind: "task", title: week.focus[0] ?? week.label, page_slug: null, week_number: week.calendar_week, due_date: week.ends_on, sort_order: order++, metadata: {} });
    }
  }
  return items.slice(0, maxItems);
};
