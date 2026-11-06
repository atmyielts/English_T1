// Training spend and value: HR enters what they paid and when; the app divides.
// Plain arithmetic per currency, never converted and with no benchmarks. Activity
// counts only people who share their progress, and the page says so. HR only.
import { HR_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { check, CompanyError, UUID, type Ctx, type Route } from '../types.ts';
import { isCalendarDate, obj, oneOf, text } from '../util.ts';
import { activitySummary, csv, gradedStaffAttempts, isLearner, loadScope, localDate, monthOf, parseRange, sharingIds, type Range } from './common.ts';
import { movementOf } from './cohorts.ts';

export const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB', 'KZT', 'KGS', 'TJS', 'TMT'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const CATEGORIES = ['schood', 'trainer', 'materials', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

export interface SpendRow { id: string; org_id: string; spent_on: string; amount: number | string; currency: Currency; category: Category; description: string | null; created_at: string }
const COLUMNS = 'id,org_id,spent_on,amount,currency,category,description,created_at';
const MAX_AMOUNT = 99_999_999_999_999;

const money = (value: number): number => Math.round(value * 100) / 100;
const per = (total: number, count: number): number | null => count > 0 ? money(total / count) : null;

/** Cost per active learner, per level gained and per hour of learning, for one currency. */
export function valueOf(total: number, outcome: { active: number; minutes: number; levels_gained: number }) {
  return { per_active: per(total, outcome.active), per_level: per(total, outcome.levels_gained), per_hour: outcome.minutes > 0 ? money(total / (outcome.minutes / 60)) : null };
}

function amountOf(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[\s,]/g, '')) : Number.NaN;
  if (!Number.isFinite(number) || number <= 0 || number > MAX_AMOUNT) throw new CompanyError('invalid_field', 'amount must be a positive number.', 400, { field: 'amount' });
  return money(number);
}
function spentOn(value: unknown, today: string): string {
  if (!isCalendarDate(value)) throw new CompanyError('invalid_field', 'spent_on must be a date.', 400, { field: 'spent_on' });
  if (value > today) throw new CompanyError('invalid_field', 'spent_on cannot be in the future.', 400, { field: 'spent_on' });
  return value;
}

async function load(ctx: Ctx, id: string): Promise<SpendRow> {
  if (!UUID.test(id)) throw new CompanyError('spend_not_found', 'Entry not found.', 404);
  const row = check<SpendRow | null>(await ctx.db.from('company_training_spend').select(COLUMNS).eq('org_id', ctx.org!.id).eq('id', id).maybeSingle());
  if (!row) throw new CompanyError('spend_not_found', 'Entry not found.', 404);
  return row;
}

/** What the period produced, for the division. */
export async function outcomeFor(ctx: Ctx, range: Pick<Range, 'start' | 'end'>) {
  const { members } = await loadScope(ctx);
  const active = members.filter((member) => member.status === 'active');
  const learners = active.filter(isLearner);
  const sharing = sharingIds(active);
  const [summary, attempts] = await Promise.all([
    activitySummary(ctx.db, ctx.org!.id, range.start, range.end, sharing),
    gradedStaffAttempts(ctx.db, ctx.org!.id, range.end),
  ]);
  const ids = new Set(learners.map((member) => member.id));
  const movement = movementOf(attempts.filter((attempt) => attempt.member_id && ids.has(attempt.member_id)), learners, range);
  return {
    active: summary.members.filter((row) => row.events > 0).length,
    minutes: summary.members.reduce((sum, row) => sum + row.minutes, 0),
    levels_gained: movement.levels_gained, moved_up: movement.up,
    learners: learners.length, sharing: sharing.length,
  };
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/insights/spend', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const today = localDate(ctx.now());
      // This calendar year so far by default.
      const params = new URLSearchParams(query);
      if (!params.get('from')) params.set('from', `${monthOf(today).slice(0, 4)}-01-01`);
      const range = parseRange(params, ctx.now(), 731);
      const format = oneOf(query.get('format') ?? 'json', ['json', 'csv'] as const, 'format');
      const rows = check<SpendRow[]>(await ctx.db.from('company_training_spend').select(COLUMNS).eq('org_id', ctx.org!.id).gte('spent_on', range.from).lte('spent_on', range.to).order('spent_on', { ascending: false }).order('id').limit(1000));
      if (format === 'csv') {
        await ctx.audit('spend.exported', null, { from: range.from, to: range.to, rows: rows.length });
        return { filename: `schood-company-spend-${range.from}-${range.to}.csv`, rows: rows.length, csv: csv(['date', 'amount', 'currency', 'category', 'description'], rows.map((row) => [row.spent_on, Number(row.amount), row.currency, row.category, row.description ?? ''])) };
      }
      const outcome = await outcomeFor(ctx, range);
      const currencies = [...new Set(rows.map((row) => row.currency))].sort();
      return {
        range: { from: range.from, to: range.to, days: range.days },
        entries: rows.map((row) => ({ ...row, amount: Number(row.amount) })),
        outcome,
        value: currencies.map((currency) => {
          const inCurrency = rows.filter((row) => row.currency === currency);
          const total = money(inCurrency.reduce((sum, row) => sum + Number(row.amount), 0));
          return {
            currency, total, entries: inCurrency.length, ...valueOf(total, outcome),
            by_category: CATEGORIES.map((category) => ({ category, total: money(inCurrency.filter((row) => row.category === category).reduce((sum, row) => sum + Number(row.amount), 0)) })).filter((row) => row.total > 0),
          };
        }),
      };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/insights/spend', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const row = check<SpendRow>(await ctx.db.from('company_training_spend').insert({
        org_id: ctx.org!.id, spent_on: spentOn(input.spent_on, localDate(ctx.now())), amount: amountOf(input.amount),
        currency: oneOf<Currency>(input.currency, CURRENCIES, 'currency', 'UZS'), category: oneOf<Category>(input.category, CATEGORIES, 'category', 'other'),
        description: text(input.description, 'description', { max: 300, optional: true }), created_by: ctx.user,
      }).select(COLUMNS).single());
      await ctx.audit('spend.created', row.id, { spent_on: row.spent_on, currency: row.currency });
      return { entry: { ...row, amount: Number(row.amount) } };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/insights/spend/:entry', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const input = obj(body);
      const current = await load(ctx, params.entry);
      const patch: Record<string, unknown> = {};
      if (input.spent_on !== undefined) patch.spent_on = spentOn(input.spent_on, localDate(ctx.now()));
      if (input.amount !== undefined) patch.amount = amountOf(input.amount);
      if (input.currency !== undefined) patch.currency = oneOf<Currency>(input.currency, CURRENCIES, 'currency');
      if (input.category !== undefined) patch.category = oneOf<Category>(input.category, CATEGORIES, 'category');
      if (input.description !== undefined) patch.description = text(input.description, 'description', { max: 300, optional: true });
      if (!Object.keys(patch).length) return { entry: { ...current, amount: Number(current.amount) } };
      const row = check<SpendRow>(await ctx.db.from('company_training_spend').update(patch).eq('id', current.id).eq('org_id', ctx.org!.id).select(COLUMNS).single());
      await ctx.audit('spend.updated', row.id, { fields: Object.keys(patch) });
      return { entry: { ...row, amount: Number(row.amount) } };
    },
  },
  {
    method: 'DELETE', path: 'orgs/:org/insights/spend/:entry', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const current = await load(ctx, params.entry);
      check(await ctx.db.from('company_training_spend').delete().eq('id', current.id).eq('org_id', ctx.org!.id));
      await ctx.audit('spend.deleted', current.id);
      return { ok: true };
    },
  },
];
