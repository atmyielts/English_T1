// Public site routes (landing page): the demo-request form and what the free pilot
// includes. Owned by the "gtm" workstream (docs/product/45_COMPANY_ENGLISH.md §3.4).
import { INDUSTRIES, SIZE_BANDS, type Industry, type SizeBand } from '../../../packages/company-core/src/mod.ts';
import { check, CompanyError, type Route } from './types.ts';
import { email as readEmail, obj, oneOf, text } from './util.ts';

/** Demo requests one address may send per Tashkent day (ctx.ipHash already includes the day). */
export const LEADS_PER_DAY = 5;
export const INTERESTS = ['hiring', 'placement', 'training', 'reports'] as const;
/** A person needs a few seconds to fill the form; faster submissions are bots. */
export const MIN_FILL_MS = 2500;
const PHONE = /^\+?[0-9][0-9\s().-]{5,24}$/;

export const routes: Route[] = [
  {
    // What the landing and the pilot form show: free pilot tests and whether self-serve is open.
    method: 'GET', path: 'public/leads/form', access: 'public',
    handle(ctx) {
      return Promise.resolve({ pilot_tests: ctx.env.pilotTests, self_serve: ctx.env.selfServe, industries: INDUSTRIES, size_bands: SIZE_BANDS, interests: INTERESTS });
    },
  },
  {
    // { name, company, job_title?, phone?, email?, industry?, size_band?, interests?, need?, locale?, source?, website (honeypot), elapsed_ms? }
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

      const { count, error } = await ctx.db.from('company_leads').select('id', { count: 'exact', head: true }).eq('ip_hash', ctx.ipHash);
      if (error) throw new Error(error.message);
      if ((count ?? 0) >= LEADS_PER_DAY) throw new CompanyError('too_many_requests', 'We already have your requests for today. We will be in touch.', 429);

      const lead = check<{ id: string }>(await ctx.db.from('company_leads').insert({
        name, company, job_title, phone, email, industry, size_band, interests, need, locale, source: source ?? 'landing', status: 'new', ip_hash: ctx.ipHash,
      }).select('id').single());
      await ctx.audit('lead.created', lead.id, { company, source: source ?? 'landing' });
      return { ok: true };
    },
  },
];
