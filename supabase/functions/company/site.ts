// Public site routes: the demo-request form, what the free pilot includes, and the free
// level check at /check. Owned by the "gtm" workstream (docs/product/45_COMPANY_ENGLISH.md §3.4).
import { INDUSTRIES, SIZE_BANDS, type Industry, type SizeBand } from '../../../packages/company-core/src/mod.ts';
import { publicCheck, readAnswers, scoreCheck, type CheckResult } from './site/check.ts';
import { check, CompanyError, type Ctx, type Route } from './types.ts';
import { email as readEmail, isCalendarDate, obj, oneOf, storable, tashkentDay, text } from './util.ts';

/** Demo requests one address may send per Tashkent day (ctx.ipHash already includes the day). */
export const LEADS_PER_DAY = 5;
export const INTERESTS = ['hiring', 'placement', 'training', 'reports'] as const;
/** A person needs a few seconds to fill the form; faster submissions are bots. */
export const MIN_FILL_MS = 2500;
export const PHONE = /^\+?[0-9][0-9\s().-]{5,24}$/;
export const SLOTS = ['morning', 'midday', 'afternoon', 'evening'] as const;
export const CHANNELS = ['phone', 'telegram', 'email', 'video'] as const;
/** How far ahead a preferred day can be. */
export const PREFERRED_DAYS_AHEAD = 90;
/** Openings and scorings of the free check one address may make per Tashkent day. */
export const CHECK_OPENS_PER_DAY = 60;
export const CHECK_SCORES_PER_DAY = 30;
const CHECK_RUN_DAYS = 30;

/** Tracking must never cost a real request: odd values are cut down, not refused. */
function tracking(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = storable(value).trim().slice(0, max);
  // A cut can split a surrogate pair, so clean once more after cutting.
  return storable(cleaned) || null;
}

function readTracking(input: Record<string, unknown>) {
  const utm = input.utm && typeof input.utm === 'object' && !Array.isArray(input.utm) ? input.utm as Record<string, unknown> : {};
  const landing = tracking(input.landing_path, 200);
  const host = tracking(input.referrer_host, 200);
  return {
    utm_source: tracking(utm.source, 120), utm_medium: tracking(utm.medium, 120), utm_campaign: tracking(utm.campaign, 120),
    utm_term: tracking(utm.term, 120), utm_content: tracking(utm.content, 120),
    // A path of this site and a host name only: never a query string or a full address.
    landing_path: landing?.startsWith('/') ? landing.split(/[?#]/)[0] : null,
    referrer_host: host && /^[a-z0-9.-]+$/i.test(host) ? host.toLowerCase() : null,
  };
}

function readPreferred(input: Record<string, unknown>, now: Date) {
  let preferred_day: string | null = null;
  if (input.preferred_day !== undefined && input.preferred_day !== null && input.preferred_day !== '') {
    if (!isCalendarDate(input.preferred_day)) throw new CompanyError('invalid_field', 'preferred_day is not a date.', 400, { field: 'preferred_day' });
    const today = tashkentDay(now);
    const last = tashkentDay(new Date(now.getTime() + PREFERRED_DAYS_AHEAD * 86_400_000));
    if (input.preferred_day < today || input.preferred_day > last) throw new CompanyError('preferred_day_range', 'Choose a day in the next three months.', 400, { field: 'preferred_day' });
    preferred_day = input.preferred_day;
  }
  return {
    preferred_day,
    preferred_slot: input.preferred_slot ? oneOf(input.preferred_slot, SLOTS, 'preferred_slot') : null,
    preferred_channel: input.preferred_channel ? oneOf(input.preferred_channel, CHANNELS, 'preferred_channel') : null,
  };
}

/** The stored estimate: levels and scores only, without question ids or answers. */
function leadCheckResult(result: CheckResult) {
  return {
    estimate: true,
    overall: { level: result.overall.level, score: result.overall.score },
    skills: Object.fromEntries(Object.entries(result.skills).map(([skill, row]) => [skill, { level: row.level, score: row.score }])),
  };
}

/** Counts this address's check runs today; refuses past the limit, and records the new run. */
async function countCheckRun(ctx: Ctx, kind: 'open' | 'score', limit: number, level: string | null = null) {
  const { count, error } = await ctx.db.from('company_check_runs').select('id', { count: 'exact', head: true }).eq('ip_hash', ctx.ipHash).eq('kind', kind);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= limit) throw new CompanyError('check_too_many', 'That is enough checks from this address for today. Try again tomorrow.', 429);
  check(await ctx.db.from('company_check_runs').insert({ kind, ip_hash: ctx.ipHash, level }).select('id').single());
}

export const routes: Route[] = [
  {
    // What the landing and the pilot form show: free pilot tests and whether self-serve is open.
    method: 'GET', path: 'public/leads/form', access: 'public',
    handle(ctx) {
      return Promise.resolve({ pilot_tests: ctx.env.pilotTests, self_serve: ctx.env.selfServe, industries: INDUSTRIES, size_bands: SIZE_BANDS, interests: INTERESTS, slots: SLOTS, channels: CHANNELS });
    },
  },
  {
    // { name, company, job_title?, phone?, email?, industry?, size_band?, interests?, need?, locale?, source?, website (honeypot), elapsed_ms?,
    //   utm?: { source, medium, campaign, term, content }, landing_path?, referrer_host?, preferred_day?, preferred_slot?, preferred_channel?, check_answers? }
    method: 'POST', path: 'public/leads', access: 'public',
    async handle(ctx, _params, body) {
      const input = obj(body);
      // Honeypot and speed checks: answer like a success so bots learn nothing, store nothing.
      const trap = typeof input.website === 'string' && input.website.trim() !== '';
      const elapsed = Number(input.elapsed_ms);
      if (trap || (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS)) return { ok: true };

      const name = text(input.name, 'name', { min: 2, max: 120 })!;
      const company = text(input.company, 'company', { min: 2, max: 160 })!;
      const job_title = text(input.job_title, 'job_title', { max: 120, optional: true });
      const email = readEmail(input.email, 'email', true);
      const phone = text(input.phone, 'phone', { max: 40, optional: true });
      if (phone && !PHONE.test(phone)) throw new CompanyError('invalid_field', 'phone is not a phone number.', 400, { field: 'phone' });
      if (!email && !phone) throw new CompanyError('contact_required', 'Leave a phone number or an email so we can reach you.', 400, { field: 'phone' });
      const industry = input.industry ? oneOf<Industry>(input.industry, INDUSTRIES, 'industry') : null;
      const size_band = input.size_band ? oneOf<SizeBand>(input.size_band, SIZE_BANDS, 'size_band') : null;
      if (input.interests !== undefined && !Array.isArray(input.interests)) throw new CompanyError('invalid_field', 'interests must be a list.', 400, { field: 'interests' });
      const interests = [...new Set(((input.interests as unknown[] | undefined) ?? []).map((value) => oneOf(value, INTERESTS, 'interests')))];
      const need = text(input.need, 'need', { max: 2000, optional: true });
      const locale = oneOf(input.locale, ['en', 'ru', 'uz'] as const, 'locale', 'ru');
      const source = text(input.source, 'source', { max: 80, optional: true });
      const preferred = readPreferred(input, ctx.now());
      // The estimate is worked out again from the answers, so a lead cannot claim a level it did not get.
      const check_result = input.check_answers === undefined || input.check_answers === null ? null : leadCheckResult(scoreCheck(readAnswers(input.check_answers)));

      const { count, error } = await ctx.db.from('company_leads').select('id', { count: 'exact', head: true }).eq('ip_hash', ctx.ipHash);
      if (error) throw new Error(error.message);
      if ((count ?? 0) >= LEADS_PER_DAY) throw new CompanyError('too_many_requests', 'We already have your requests for today. We will be in touch.', 429);

      const lead = check<{ id: string }>(await ctx.db.from('company_leads').insert({
        name, company, job_title, phone, email, industry, size_band, interests, need, locale, source: source ?? 'landing', status: 'new', ip_hash: ctx.ipHash,
        ...readTracking(input), ...preferred, check_result,
      }).select('id').single());
      await ctx.audit('lead.created', lead.id, { company, source: source ?? 'landing' });
      return { ok: true };
    },
  },
  {
    // The free check's questions, without keys.
    method: 'GET', path: 'public/check', access: 'public',
    async handle(ctx) {
      await countCheckRun(ctx, 'open', CHECK_OPENS_PER_DAY);
      return publicCheck();
    },
  },
  {
    // { answers: { itemId: optionIndex } } → the estimate. Stores no answers and no person, only the level for the rate limit and funnel.
    method: 'POST', path: 'public/check/score', access: 'public',
    async handle(ctx, _params, body) {
      const answers = readAnswers(obj(body).answers);
      if (answers.size === 0) throw new CompanyError('check_empty', 'Answer at least one question first.', 400);
      const result = scoreCheck(answers);
      await countCheckRun(ctx, 'score', CHECK_SCORES_PER_DAY, result.overall.level);
      // Housekeeping: the counter only needs recent days. A failure here must not cost the visitor their result.
      const cutoff = new Date(ctx.now().getTime() - CHECK_RUN_DAYS * 86_400_000).toISOString();
      const { error } = await ctx.db.from('company_check_runs').delete().lt('created_at', cutoff);
      if (error) console.error(JSON.stringify({ company_check_prune: 'failed', error: error.message }));
      return result;
    },
  },
];
