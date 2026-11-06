// Lead automation for Schood staff: a score from the request's own fields, today's calls,
// where requests come from, and turning a request into a pilot in one step.
import { INDUSTRIES, SIZE_BANDS } from '../../../../packages/company-core/src/mod.ts';
import { ORG_COLUMNS } from '../handler.ts';
import { check, CompanyError, type Ctx, type OrgRow, type Route } from '../types.ts';
import { email as readEmail, obj, oneOf, tashkentDay, text } from '../util.ts';
import { PHONE } from '../site.ts';
import { contractTotal, type ContractRow } from './billing.ts';
import { dateOrNull, DAY, fetchAll } from './shared.ts';
import { LEAD_COLUMNS, loadLead, ownerInvite, type LeadRow } from './staffshared.ts';

export type LeadReason = 'size_1000' | 'size_201' | 'size_51' | 'interests' | 'phone' | 'email' | 'job_title' | 'need' | 'customer' | 'fresh' | 'industry';

/** Points per stored field. Reasons say why, so staff can disagree with it. */
export function scoreLead(lead: Pick<LeadRow, 'size_band' | 'interests' | 'phone' | 'email' | 'job_title' | 'need' | 'source' | 'created_at' | 'industry'>, now: Date): { score: number; reasons: LeadReason[] } {
  let score = 0;
  const reasons: LeadReason[] = [];
  const add = (points: number, reason: LeadReason) => { score += points; reasons.push(reason); };
  if (lead.size_band === '1000+') add(30, 'size_1000');
  else if (lead.size_band === '201-1000') add(25, 'size_201');
  else if (lead.size_band === '51-200') add(15, 'size_51');
  else if (lead.size_band === '1-50') score += 5;
  const interests = (lead.interests ?? []).length;
  if (interests) add(Math.min(20, interests * 5), 'interests');
  if (lead.phone) add(10, 'phone');
  if (lead.email) add(5, 'email');
  if (lead.job_title) add(5, 'job_title');
  if ((lead.need ?? '').trim().length >= 20) add(10, 'need');
  if (lead.industry && lead.industry !== 'other') add(5, 'industry');
  // Someone already in a workspace asking for more seats.
  if (lead.source === 'company_seats') add(20, 'customer');
  if (now.getTime() - Date.parse(lead.created_at) <= 3 * DAY) add(5, 'fresh');
  return { score: Math.min(100, score), reasons };
}

const OPEN = ['new', 'contacted', 'pilot'];
/** Where a request staff type in themselves came from. Landing and seat requests set their own. */
export const MANUAL_SOURCES = ['referral', 'call', 'telegram', 'event', 'partner', 'other'] as const;
const digitsOf = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');

export async function callsData(ctx: Ctx) {
  const now = ctx.now(), today = tashkentDay(now);
  const leads = await fetchAll<LeadRow>(() => ctx.db.from('company_leads').select(LEAD_COLUMNS).in('status', OPEN).order('created_at', { ascending: false }).order('id'));
  const due = leads.filter((lead) => lead.follow_up_at ? lead.follow_up_at <= today : lead.status === 'new');
  const rows = due.map((lead) => ({
    ...lead, ...scoreLead(lead, now),
    days_late: lead.follow_up_at && lead.follow_up_at < today ? Math.round((Date.parse(today) - Date.parse(lead.follow_up_at)) / DAY) : 0,
  })).sort((a, b) => Number(b.days_late > 0) - Number(a.days_late > 0) || b.score - a.score || a.created_at.localeCompare(b.created_at));
  const upcoming = leads.filter((lead) => lead.follow_up_at && lead.follow_up_at > today).length;
  return { today, calls: rows, upcoming, no_date: leads.filter((lead) => !lead.follow_up_at && lead.status !== 'new').length };
}

export const leadRoutes: Route[] = [
  {
    // A request that did not come through the site: a referral, a call, an event. Warns once about a likely duplicate.
    method: 'POST', path: 'staff/leads', access: 'staff',
    async handle(ctx, _params, body) {
      const input = obj(body);
      const name = text(input.name, 'name', { min: 2, max: 120 })!;
      const company = text(input.company, 'company', { min: 2, max: 160 })!;
      const email = readEmail(input.email, 'email', true);
      const phone = text(input.phone, 'phone', { max: 40, optional: true });
      if (phone && !PHONE.test(phone)) throw new CompanyError('invalid_field', 'phone is not a phone number.', 400, { field: 'phone' });
      if (!email && !phone) throw new CompanyError('contact_required', 'Leave a phone number or an email.', 400, { field: 'phone' });
      const source = oneOf(input.source, MANUAL_SOURCES, 'source', 'other');
      const industry = input.industry ? oneOf(input.industry, INDUSTRIES, 'industry') : null;
      const size_band = input.size_band ? oneOf(input.size_band, SIZE_BANDS, 'size_band') : null;
      const follow_up_at = dateOrNull(input.follow_up_at, 'follow_up_at');
      if (input.force !== true) {
        const open = await fetchAll<Pick<LeadRow, 'id' | 'company' | 'phone' | 'email'>>(() => ctx.db.from('company_leads').select('id,company,phone,email').in('status', OPEN).order('id'));
        const wanted = digitsOf(phone);
        const same = open.find((row) => (email && row.email?.toLowerCase() === email) || (wanted.length >= 7 && digitsOf(row.phone) === wanted));
        if (same) throw new CompanyError('lead_duplicate', `${same.company} already has an open request with this contact.`, 409, { company: same.company, lead_id: same.id });
      }
      const lead = check<LeadRow>(await ctx.db.from('company_leads').insert({
        name, company, job_title: text(input.job_title, 'job_title', { max: 120, optional: true }), phone, email, industry, size_band, interests: [],
        need: text(input.need, 'need', { max: 2000, optional: true }), locale: oneOf(input.locale, ['en', 'ru', 'uz'] as const, 'locale', 'ru'), status: 'new', source, follow_up_at,
      }).select(LEAD_COLUMNS).single());
      await ctx.audit('lead.created', lead.id, { company, source, manual: true });
      return { lead };
    },
  },
  {
    // Who to call today: follow-ups due or late, and new requests nobody has dated yet. Strongest first within each.
    method: 'GET', path: 'staff/leads/today', access: 'staff',
    handle: (ctx) => callsData(ctx),
  },
  {
    // Where requests come from, from the lead's stored source, and what became of them.
    method: 'GET', path: 'staff/leads/report', access: 'staff',
    async handle(ctx) {
      const leads = await fetchAll<LeadRow>(() => ctx.db.from('company_leads').select(LEAD_COLUMNS).order('created_at', { ascending: false }).order('id'));
      const contracts = await fetchAll<ContractRow>(() => ctx.db.from('company_contracts').select('org_id,status,seats,price_per_seat,tests_fee').eq('status', 'signed').order('id'));
      const signed = new Map<string, number>();
      for (const row of contracts) signed.set(row.org_id, (signed.get(row.org_id) ?? 0) + contractTotal(row));
      const now = ctx.now(), sources = new Map<string, { source: string; total: number; new: number; contacted: number; pilot: number; won: number; lost: number; signed_value: number; score_sum: number }>();
      const counted = new Set<string>();
      for (const lead of leads) {
        const source = lead.source?.trim() || 'unknown';
        const entry = sources.get(source) ?? { source, total: 0, new: 0, contacted: 0, pilot: 0, won: 0, lost: 0, signed_value: 0, score_sum: 0 };
        entry.total++;
        entry[lead.status]++;
        entry.score_sum += scoreLead(lead, now).score;
        // A workspace's value counts once, for the request that opened it.
        if (lead.org_id && !counted.has(lead.org_id) && signed.has(lead.org_id)) {
          entry.signed_value += signed.get(lead.org_id)!;
          counted.add(lead.org_id);
        }
        sources.set(source, entry);
      }
      const months = new Map<string, number>();
      for (const lead of leads) {
        const month = tashkentDay(new Date(lead.created_at)).slice(0, 7);
        months.set(month, (months.get(month) ?? 0) + 1);
      }
      return {
        sources: [...sources.values()].sort((a, b) => b.total - a.total).map(({ score_sum, ...row }) => ({ ...row, average_score: row.total ? Math.round(score_sum / row.total) : 0, won_share: row.total ? Math.round(row.won / row.total * 100) : 0 })),
        months: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, count]) => ({ month, count })),
        total: leads.length,
      };
    },
  },
  {
    // One click from request to pilot: the workspace, the owner's link, a follow-up in a week.
    method: 'POST', path: 'staff/leads/:lead/convert', access: 'staff',
    async handle(ctx, params) {
      const lead = await loadLead(ctx, params.lead);
      if (lead.org_id) throw new CompanyError('lead_has_workspace', 'This request already has a workspace.', 409, { org_id: lead.org_id });
      const company = lead.company.trim();
      if (company.length < 2) throw new CompanyError('invalid_field', 'The company name is too short.', 400, { field: 'name' });
      const org = check<OrgRow>(await ctx.db.from('company_orgs').insert({
        name: company.slice(0, 120),
        industry: (INDUSTRIES as readonly string[]).includes(lead.industry ?? '') ? lead.industry : 'other',
        size_band: (SIZE_BANDS as readonly string[]).includes(lead.size_band ?? '') ? lead.size_band : '1-50',
        contact_phone: lead.phone, billing_email: lead.email, status: 'pilot', seats_limit: 0, tests_limit: ctx.env.pilotTests, created_by: ctx.user,
        settings: { locale: ['en', 'ru', 'uz'].includes(lead.locale ?? '') ? lead.locale : 'ru' },
      }).select(ORG_COLUMNS).single());
      // Only the first click may link: a second tab's new workspace is taken back, before anyone could have used it.
      const follow = new Date(ctx.now().getTime() + 7 * DAY);
      const linked = check<{ id: string }[]>(await ctx.db.from('company_leads').update({ org_id: org.id, status: lead.status === 'won' ? 'won' : 'pilot', follow_up_at: lead.follow_up_at ?? tashkentDay(follow) }).eq('id', lead.id).is('org_id', null).select('id'));
      if (!linked.length) {
        check(await ctx.db.from('company_orgs').delete().eq('id', org.id));
        throw new CompanyError('lead_has_workspace', 'This request already has a workspace.', 409);
      }
      ctx.org = org;
      const owner = await ownerInvite(ctx, org, lead.email, lead.name);
      await ctx.audit('lead.workspace', lead.id, { org_id: org.id, name: org.name });
      await ctx.audit('staff.org_created', org.id, { name: org.name, status: 'pilot', lead_id: lead.id, owner_email: lead.email, converted: true });
      return { org, owner: owner.member, link: owner.link, expires_at: owner.invite.expires_at };
    },
  },
];
