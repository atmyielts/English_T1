// Catalog-driven SAT Practice features: official-taxonomy bank, plan drills
// that fill to the promised count, timed modules, the weekly plan loop and
// insights. Selection logic lives in _shared/sat-practice-selection.ts.
import { AttemptError } from './completion.ts';
import { startSelected, type Selection } from './start.ts';
import { LEGACY_DOMAINS, LEGACY_TO_OFFICIAL, type LegacyDomain, OFFICIAL_DOMAIN_IDS, OFFICIAL_DOMAINS, type OfficialDomain } from '../_shared/sat-practice-content.ts';
import {
  buildModule, catalogFacets, type CatalogEntry, type CatalogFilters, type DrillTarget, filterCatalog, type ModuleProfile, normalizeCatalog,
  preferenceOrder, selectDrill, targetFromLegacy,
} from '../_shared/sat-practice-selection.ts';
import { domainStats, scoreImpact } from '../_shared/sat-practice-insights.ts';
import { buildSatPracticePlan } from '../_shared/sat-practice-plan-generator.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const todayIso = (): string => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};

export async function loadCatalog(sb: any, userId: string): Promise<CatalogEntry[]> {
  const { data, error } = await sb.rpc('select_sat_practice_catalog', { p_user_id: userId });
  if (error || !Array.isArray(data)) throw new AttemptError(503, 'The question bank is temporarily unavailable. Please retry.', 'bank_unavailable');
  return normalizeCatalog(data);
}

// ------------------------------------------------------------------- bank
export type BankQuery = CatalogFilters & { limit: number; offset: number };
const choice = <T extends string>(value: unknown, allowed: readonly T[], name: string): T | undefined => {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) throw new AttemptError(400, `Invalid ${name} filter.`, 'invalid_filter');
  return value as T;
};
const SKILLS = OFFICIAL_DOMAIN_IDS.flatMap(d => OFFICIAL_DOMAINS[d].skills);

/** Strict official-taxonomy filters. Legacy `domain` and `mistake_history` stay supported for older clients. */
export function bankQuery(input: Record<string, unknown>, defaults = { limit: 24 }): BankQuery {
  const q: BankQuery = { limit: defaults.limit, offset: 0 };
  q.section_type = choice(input.section_type, ['math', 'reading_writing'] as const, 'section');
  q.official_domain = choice(input.official_domain, OFFICIAL_DOMAIN_IDS, 'domain');
  q.skill = choice(input.skill, SKILLS, 'skill');
  q.difficulty = choice(input.difficulty, ['easy', 'medium', 'hard'] as const, 'difficulty');
  q.format = choice(input.format, ['mcq', 'spr'] as const, 'format');
  q.status = choice(input.status, ['unseen', 'missed', 'correct'] as const, 'status');
  q.domain = choice(input.domain, LEGACY_DOMAINS, 'domain');
  const history = choice(input.mistake_history, ['previously_missed', 'mastered', 'unseen'] as const, 'history');
  if (history && !q.status) q.status = history === 'previously_missed' ? 'missed' : history === 'mastered' ? 'correct' : 'unseen';
  if (q.section_type && q.official_domain && OFFICIAL_DOMAINS[q.official_domain].section !== q.section_type) throw new AttemptError(400, 'This domain belongs to the other section.', 'invalid_filter');
  if (q.skill && q.official_domain && !OFFICIAL_DOMAINS[q.official_domain].skills.includes(q.skill)) throw new AttemptError(400, 'This skill belongs to another domain.', 'invalid_filter');
  for (const key of ['limit', 'offset'] as const) {
    if (input[key] == null || input[key] === '') continue;
    const n = Number(input[key]);
    if (!Number.isInteger(n) || n < (key === 'limit' ? 1 : 0) || n > (key === 'limit' ? 100 : 5000)) throw new AttemptError(400, key === 'limit' ? 'Choose between 1 and 100 questions.' : 'Invalid page.', 'invalid_filter');
    q[key] = n;
  }
  return q;
}
export const hasOfficialFilters = (input: Record<string, unknown>) => ['official_domain', 'skill', 'format', 'status'].some(k => input[k] != null && input[k] !== '');

export function bankPage(entries: CatalogEntry[], q: BankQuery) {
  const matches = filterCatalog(entries, q);
  // Facets: counts within the chosen section, so empty combinations are visible before choosing them.
  const facetBase = filterCatalog(entries, { section_type: q.section_type, official_domain: q.official_domain });
  return { matches, page: matches.slice(q.offset, q.offset + q.limit), facets: catalogFacets(facetBase), total: matches.length };
}

/** Questions for a bank drill: the filtered pool, unseen first then the oldest misses. */
export function bankSelection(entries: CatalogEntry[], q: BankQuery, count: number): Selection {
  const ids = preferenceOrder(filterCatalog(entries, q)).slice(0, count).map(e => e.id);
  const meta: Record<string, unknown> = { mode: 'bank', requested_count: count };
  if (q.official_domain) meta.official_domain = q.official_domain;
  if (q.skill) meta.skill = q.skill;
  if (q.format) meta.answer_format = q.format;
  if (q.status) meta.status = q.status;
  return { ids, meta };
}

// --------------------------------------------------------------- modules
export function moduleSelection(entries: CatalogEntry[], section: 'reading_writing' | 'math', profile: ModuleProfile, planItemId?: string): Selection & { build: ReturnType<typeof buildModule> } {
  const build = buildModule(entries, section, profile);
  const meta: Record<string, unknown> = { mode: 'module', module_section: section, module_profile: profile,
    time_limit_seconds: build.time_limit_seconds, requested_count: build.requested };
  if (planItemId) meta.plan_item_id = planItemId;
  return { ids: build.ids, meta, build };
}

// ------------------------------------------------------------------ plans
export type PlanRow = { id: string; scheduled_for: string; task_type: string; payload: Record<string, unknown>; status: string; estimated_minutes: number; completed_at?: string | null };

async function dueReviewCount(sb: any, userId: string): Promise<number> {
  const { count, error } = await sb.from('sat_practice_srs_queue').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).lte('next_review_at', new Date().toISOString());
  if (error) return 0;
  return Number(count ?? 0);
}

/** Replace the not-yet-started items from today on with a fresh 7-day plan. */
export async function generateWeek(sb: any, userId: string, goals: any, entries?: CatalogEntry[]): Promise<PlanRow[]> {
  const today = todayIso();
  const catalog = entries ?? await loadCatalog(sb, userId);
  const tasks = buildSatPracticePlan(domainStats(catalog), {
    targetScore: Number(goals?.target_score ?? 1400), testDate: typeof goals?.test_date === 'string' ? goals.test_date : null,
    hoursPerWeek: Number(goals?.hours_per_week ?? 3),
  }, { today, dueReviews: await dueReviewCount(sb, userId) });
  const del = await sb.from('sat_practice_plan_items').delete().eq('user_id', userId).gte('scheduled_for', today).in('status', ['pending', 'skipped']);
  if (del.error) throw new AttemptError(503, 'The plan could not be updated. Please retry.', 'plan_unavailable');
  if (!tasks.length) return [];
  const rows = tasks.map(t => ({ ...t, payload: { ...t.payload, week_start: today }, user_id: userId, status: 'pending' }));
  const { data, error } = await sb.from('sat_practice_plan_items').insert(rows).select('*');
  if (error) throw new AttemptError(503, 'The plan could not be updated. Please retry.', 'plan_unavailable');
  return data ?? [];
}

/** The current week's plan; a new week is generated automatically once the previous one has ended. */
export async function currentWeek(sb: any, userId: string, goals: any, entries?: CatalogEntry[]) {
  const today = todayIso();
  const { data, error } = await sb.from('sat_practice_plan_items').select('*').eq('user_id', userId)
    .gte('scheduled_for', addDays(today, -6)).order('scheduled_for').order('created_at');
  if (error) throw new AttemptError(503, 'The plan is temporarily unavailable. Please retry.', 'plan_unavailable');
  let rows: PlanRow[] = data ?? [];
  let generated = false;
  if (!rows.some(r => r.scheduled_for >= today)) {
    await generateWeek(sb, userId, goals, entries);
    generated = true;
    const again = await sb.from('sat_practice_plan_items').select('*').eq('user_id', userId)
      .gte('scheduled_for', addDays(today, -6)).order('scheduled_for').order('created_at');
    if (again.error) throw new AttemptError(503, 'The plan is temporarily unavailable. Please retry.', 'plan_unavailable');
    rows = again.data ?? [];
  }
  const upcoming = rows.filter(r => r.scheduled_for >= today);
  const weekStart = upcoming.map(r => String(r.payload?.week_start ?? '')).filter(Boolean).sort().pop() ?? today;
  const week = rows.filter(r => String(r.payload?.week_start ?? '') === weekStart || (!r.payload?.week_start && r.scheduled_for >= weekStart));
  const done = week.filter(r => r.status === 'completed').length;
  return { week_start: weekStart, week_end: addDays(weekStart, 6), today, generated, items: week, today_items: week.filter(r => r.scheduled_for === today),
    progress: { completed: done, total: week.length, minutes_planned: week.reduce((s, r) => s + Number(r.estimated_minutes ?? 0), 0),
      minutes_completed: week.filter(r => r.status === 'completed').reduce((s, r) => s + Number(r.estimated_minutes ?? 0), 0) } };
}

const legacyDomain = (v: unknown): LegacyDomain | null => typeof v === 'string' && (LEGACY_DOMAINS as string[]).includes(v) ? v as LegacyDomain : null;
const difficultyOf = (v: unknown) => v === 'easy' || v === 'hard' ? v : 'medium';

export function drillTargetFor(payload: Record<string, unknown>): DrillTarget {
  const official = typeof payload.official_domain === 'string' && payload.official_domain in OFFICIAL_DOMAINS ? payload.official_domain as OfficialDomain : null;
  const legacy = legacyDomain(payload.domain);
  if (official) {
    const skill = typeof payload.skill === 'string' && OFFICIAL_DOMAINS[official].skills.includes(payload.skill) ? payload.skill : null;
    return { section_type: OFFICIAL_DOMAINS[official].section, official_domain: official, skills: skill ? [skill] : null, legacy_domain: legacy, difficulty: difficultyOf(payload.difficulty) };
  }
  return targetFromLegacy(legacy ?? (payload.section_type === 'math' ? 'algebra' : 'grammar'), difficultyOf(payload.difficulty));
}

export type PlanStart = { attempt?: unknown; questions?: unknown[]; completed?: boolean; selection?: Record<string, unknown> };

/** Start the drill, module or review behind one plan item. */
export async function startPlanItem(sb: any, userId: string, itemId: string, body: Record<string, unknown>): Promise<PlanStart> {
  if (!uuid.test(itemId)) throw new AttemptError(400, 'Invalid plan item.', 'invalid_request');
  const { data: item, error } = await sb.from('sat_practice_plan_items').select('*').eq('id', itemId).eq('user_id', userId).maybeSingle();
  if (error) throw new AttemptError(503, 'The plan is temporarily unavailable. Please retry.', 'plan_unavailable');
  if (!item) throw new AttemptError(404, 'Plan item not found.', 'plan_item_not_found');
  const payload = (item.payload && typeof item.payload === 'object' ? item.payload : {}) as Record<string, unknown>;
  let selection: Record<string, unknown> = {};
  const select = async (): Promise<Selection> => {
    if (item.task_type === 'notebook_review') {
      const count = Math.max(1, Math.min(20, Number(payload.count ?? 5) || 5));
      const { data: due } = await sb.rpc('select_sat_practice_due_questions', { p_user_id: userId });
      let ids: string[] = Array.isArray(due) ? due.map((r: any) => r?.question?.id).filter((id: unknown): id is string => typeof id === 'string') : [];
      if (!ids.length) {
        const visible = new Set((await loadCatalog(sb, userId)).map(e => e.id));
        const { data: misses } = await sb.from('sat_practice_mistake_notebook').select('question_id').eq('user_id', userId).eq('status', 'active')
          .not('question_id', 'is', null).order('created_at', { ascending: false }).limit(40);
        ids = [...new Set<string>((misses ?? []).map((r: any) => r.question_id).filter((id: unknown): id is string => typeof id === 'string' && visible.has(id)))];
      }
      ids = ids.slice(0, count);
      selection = { requested: count, available: ids.length };
      return { ids, meta: { mode: 'review', plan_item_id: itemId, requested_count: count } };
    }
    const entries = await loadCatalog(sb, userId);
    if (item.task_type === 'module' || item.task_type === 'half_mock') {
      const section = (payload.module_section ?? payload.section_type) === 'math' ? 'math' : 'reading_writing';
      const m = moduleSelection(entries, section, payload.profile === 'harder' ? 'harder' : 'standard', itemId);
      selection = { requested: m.build.requested, available: m.ids.length, domains: m.build.domains, time_limit_seconds: m.build.time_limit_seconds };
      return m;
    }
    const count = Math.max(1, Math.min(30, Number(payload.question_count ?? 8) || 8));
    const target = drillTargetFor(payload);
    const drill = selectDrill(entries, target, count);
    selection = { requested: drill.requested, available: drill.available, widened: drill.widened };
    return { ids: drill.ids, meta: { mode: 'plan', plan_item_id: itemId, requested_count: count, official_domain: target.official_domain,
      ...(target.skills?.length === 1 ? { skill: target.skills[0] } : {}) } };
  };
  try {
    const started = await startSelected(sb, userId, body, select);
    return { ...started, selection };
  } catch (failure) {
    // Nothing is due and nothing was missed: the review task is honestly done.
    if (failure instanceof AttemptError && failure.code === 'no_questions' && item.task_type === 'notebook_review') {
      await sb.from('sat_practice_plan_items').update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        payload: { ...payload, note: 'nothing_due' } }).eq('id', itemId).eq('user_id', userId).neq('status', 'completed');
      return { completed: true, selection: { requested: selection.requested ?? 0, available: 0 } };
    }
    throw failure;
  }
}

// --------------------------------------------------------------- insights
export function officialMastery(rows: any[]) {
  return OFFICIAL_DOMAIN_IDS.map(domain => {
    const mine = rows.filter(r => LEGACY_TO_OFFICIAL[legacyDomain(r.domain) ?? 'grammar'] === domain && legacyDomain(r.domain));
    const attempts = mine.reduce((s, r) => s + Number(r.attempts ?? 0), 0);
    const level = attempts ? mine.reduce((s, r) => s + Number(r.mastery_level ?? 0) * Number(r.attempts ?? 0), 0) / attempts : null;
    return { official_domain: domain, section_type: OFFICIAL_DOMAINS[domain].section, attempts, mastery_level: level === null ? null : Math.round(level * 1000) / 1000 };
  });
}

export function insights(entries: CatalogEntry[], masteryRows: any[]) {
  const stats = domainStats(entries);
  return { domains: stats, score_impact: scoreImpact(stats), official_mastery: officialMastery(masteryRows),
    totals: { bank: entries.length, answered: stats.reduce((s, d) => s + d.answered, 0), correct: stats.reduce((s, d) => s + d.correct, 0) } };
}

export function enrichNotebook(items: any[], entries: CatalogEntry[]) {
  const byId = new Map(entries.map(e => [e.id, e]));
  return items.map(item => {
    const q = item.question_id ? byId.get(item.question_id) : undefined;
    const legacy = legacyDomain(item.domain) ?? 'grammar';
    return { ...item, official_domain: q?.official_domain ?? LEGACY_TO_OFFICIAL[legacy], skill: q?.skill ?? null, answer_format: q?.format ?? null };
  });
}
