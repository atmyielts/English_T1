// Plan-template parsing and date adaptation shared by the SAT and TOEFL
// playbooks. Pure functions (no I/O) so they are unit-tested directly.
//
// Templates are authored by content agents / admins as `schedule_json`. The
// renderer accepts the IELTS-style shape and a few reasonable variants:
//   { weeks: [{ label, focus: string|string[], tasks|daily_routine|sessions:
//       [string | { title, module_slug|page_slug|slug, minutes, day }],
//       modules|module_slugs|playbook_modules: [slug | { slug }] }],
//     phases: [{ label, goal, weeks: number, focus, tasks }] }

export type TemplateTask = {
  title: string;
  page_slug: string | null;
  minutes: number | null;
};

export type TemplateWeek = {
  index: number;
  label: string;
  focus: string[];
  tasks: TemplateTask[];
  modules: string[];
};

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  !!value && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown, max = 400): string => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const asStringList = (value: unknown, max = 400): string[] => {
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

const TASK_KEYS = ["tasks", "daily_routine", "sessions", "activities", "days", "checklist", "items", "actions"];
const MODULE_KEYS = ["modules", "module_slugs", "playbook_modules", "pages", "read"];
const LABEL_KEYS = ["label", "title", "theme", "name", "heading"];

const parseTask = (entry: unknown, knownSlugs?: ReadonlySet<string>): TemplateTask | null => {
  if (typeof entry === "string") {
    const title = text(entry);
    if (!title) return null;
    return { title, page_slug: findKnownSlug(title, knownSlugs), minutes: null };
  }
  if (!isRecord(entry)) return null;
  const base = text(entry.title ?? entry.label ?? entry.task ?? entry.name ?? entry.activity ?? entry.description ?? entry.text ?? "");
  const day = text(entry.day ?? "", 40);
  const title = day && base ? `${day}: ${base}` : base || day;
  if (!title) return null;
  const explicitSlug = slugFrom(entry.module_slug ?? entry.page_slug ?? entry.slug ?? entry.module ?? null);
  const minutesRaw = Number(entry.minutes ?? entry.duration_minutes ?? NaN);
  return {
    title,
    page_slug: explicitSlug ?? findKnownSlug(title, knownSlugs),
    minutes: Number.isFinite(minutesRaw) && minutesRaw > 0 ? Math.min(600, Math.round(minutesRaw)) : null,
  };
};

const parseWeek = (entry: unknown, index: number, knownSlugs?: ReadonlySet<string>): TemplateWeek | null => {
  if (typeof entry === "string") {
    const label = text(entry, 200);
    return label ? { index, label, focus: [], tasks: [], modules: [] } : null;
  }
  if (!isRecord(entry)) return null;
  let label = "";
  for (const key of LABEL_KEYS) {
    label = text(entry[key], 200);
    if (label) break;
  }
  const focus = [...asStringList(entry.focus), ...asStringList(entry.goals), ...asStringList(entry.goal), ...asStringList(entry.objectives)].slice(0, 12);
  const tasks: TemplateTask[] = [];
  for (const key of TASK_KEYS) {
    const value = entry[key];
    const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    for (const item of list) {
      const task = parseTask(item, knownSlugs);
      if (task) tasks.push(task);
    }
  }
  for (const key of ["practice", "simulator", "mock", "review"]) {
    for (const value of asStringList(entry[key])) tasks.push({ title: value, page_slug: findKnownSlug(value, knownSlugs), minutes: null });
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
    tasks: tasks.slice(0, 30),
    modules: modules.slice(0, 12),
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
  const weeks = weeksRaw
    .map((entry, index) => parseWeek(entry, index, knownSlugs))
    .filter((entry): entry is TemplateWeek => !!entry);
  if (weeks.length > 0) return weeks.slice(0, 26).map((week, index) => ({ ...week, index }));

  // Phase-only templates: expand each phase over its declared week count, or
  // split the template duration evenly between phases.
  const phases = Array.isArray(source.phases) ? source.phases.filter((p) => isRecord(p) || typeof p === "string") : [];
  if (phases.length === 0) return [];
  const totalWeeks = Math.max(phases.length, Math.ceil(Math.max(7, Number(durationDays) || phases.length * 7) / 7));
  const declared = phases.map((phase) => {
    const n = isRecord(phase) ? Number(phase.weeks ?? phase.duration_weeks ?? NaN) : NaN;
    return Number.isFinite(n) && n >= 1 ? Math.min(26, Math.floor(n)) : 0;
  });
  const undeclared = declared.filter((n) => n === 0).length;
  const remaining = Math.max(0, totalWeeks - declared.reduce((sum, n) => sum + n, 0));
  const share = undeclared > 0 ? Math.max(1, Math.floor(remaining / undeclared)) : 0;
  const out: TemplateWeek[] = [];
  phases.forEach((phase, phaseIndex) => {
    const parsed = parseWeek(phase, out.length, knownSlugs);
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

const DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value: unknown): Date | null => {
  const raw = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const date = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

export const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY_MS);

export type ScheduledWeek = {
  calendar_week: number;
  starts_on: string;
  ends_on: string;
  template_weeks: number[];
  label: string;
  focus: string[];
  tasks: TemplateTask[];
  modules: string[];
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
 * weeks are reported as buffer.
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
    const modules: string[] = [];
    for (const member of members) for (const slug of member.modules) if (!modules.includes(slug)) modules.push(slug);
    out.push({
      calendar_week: c + 1,
      starts_on: isoDate(startsOn),
      ends_on: isoDate(endsOn),
      template_weeks: members.map((member) => member.index + 1),
      label: members.map((member) => member.label).join(" + "),
      focus: members.flatMap((member) => member.focus).slice(0, 16),
      tasks: members.flatMap((member) => member.tasks).slice(0, 40),
      modules,
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

/** Turn a scheduled plan into trackable checklist items (one per task and per referenced module). */
export const planItemsFromSchedule = (schedule: ScheduleResult, maxItems = 300): PlanItemDraft[] => {
  const items: PlanItemDraft[] = [];
  let order = 0;
  for (const week of schedule.weeks) {
    const covered = new Set<string>();
    for (const task of week.tasks) {
      if (task.page_slug) covered.add(task.page_slug);
      items.push({
        kind: "task",
        title: task.title,
        page_slug: task.page_slug,
        week_number: week.calendar_week,
        due_date: week.ends_on,
        sort_order: order++,
        metadata: task.minutes ? { minutes: task.minutes } : {},
      });
    }
    for (const slug of week.modules) {
      if (covered.has(slug)) continue;
      items.push({
        kind: "task",
        title: slug,
        page_slug: slug,
        week_number: week.calendar_week,
        due_date: week.ends_on,
        sort_order: order++,
        metadata: { reading: true },
      });
    }
    if (week.tasks.length === 0 && week.modules.length === 0) {
      items.push({
        kind: "task",
        title: week.focus[0] ?? week.label,
        page_slug: null,
        week_number: week.calendar_week,
        due_date: week.ends_on,
        sort_order: order++,
        metadata: {},
      });
    }
  }
  return items.slice(0, maxItems);
};
