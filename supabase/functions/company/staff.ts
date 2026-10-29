// Schood staff console routes: workspaces (plan, seats, tests, contract, AI cap),
// the audit log, and the demo-request pipeline. Owned by the "gtm" workstream
// (docs/product/45_COMPANY_ENGLISH.md §3.4). Every route is `staff`.
import { INDUSTRIES, ORG_STATUSES, SIZE_BANDS, type Industry, type OrgStatus, type SizeBand } from '../../../packages/company-core/src/mod.ts';
import { usage } from './core.ts';
import { MEMBER_COLUMNS, ORG_COLUMNS } from './handler.ts';
import { check, CompanyError, UUID, type Ctx, type MemberRow, type OrgRow, type Route } from './types.ts';
import { email as readEmail, int, obj, oneOf, text } from './util.ts';
import { dateOrNull, DAY, fetchAll, issueInvite, OWNER_DAYS, revokeMemberInvites, seatCount } from './people/shared.ts';
import { PHONE } from './site.ts';

export const LEAD_STATUSES = ['new', 'contacted', 'pilot', 'won', 'lost'] as const;
const LEAD_COLUMNS = 'id,name,company,job_title,phone,email,size_band,industry,interests,need,locale,status,notes,follow_up_at,org_id,source,created_at,updated_at';

interface LeadRow {
  id: string; name: string; company: string; job_title: string | null; phone: string | null; email: string | null; size_band: string | null;
  industry: string | null; interests: string[] | null; need: string | null; locale: string | null; status: (typeof LEAD_STATUSES)[number];
  notes: string | null; follow_up_at: string | null; org_id: string | null; source: string | null; created_at: string; updated_at: string;
}

async function loadOrg(ctx: Ctx, id: string): Promise<OrgRow> {
  if (!UUID.test(id)) throw new CompanyError('org_not_found', 'Workspace not found.', 404);
  const org = check<OrgRow | null>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).eq('id', id).maybeSingle());
  if (!org) throw new CompanyError('org_not_found', 'Workspace not found.', 404);
  ctx.org = org;
  return org;
}

async function loadLead(ctx: Ctx, id: string): Promise<LeadRow> {
  if (!UUID.test(id)) throw new CompanyError('lead_not_found', 'Request not found.', 404);
  const lead = check<LeadRow | null>(await ctx.db.from('company_leads').select(LEAD_COLUMNS).eq('id', id).maybeSingle());
  if (!lead) throw new CompanyError('lead_not_found', 'Request not found.', 404);
  return lead;
}

/** Contract end as the last second of that Tashkent day. */
function contractEnd(value: unknown): string | null {
  const date = dateOrNull(value, 'contract_ends_at');
  return date ? new Date(`${date}T23:59:59+05:00`).toISOString() : null;
}

/** Re-syncs everyone's Schood English access after a plan change. Never throws. */
async function syncOrg(ctx: Ctx, orgId: string): Promise<number | null> {
  const { data, error } = await ctx.db.rpc('company_sync_org_access', { p_org: orgId });
  if (error) {
    console.error(JSON.stringify({ company_sync_org: 'failed', org: orgId, error: error.message }));
    return null;
  }
  return Number(data);
}

/** Who did what: audit actors resolved to the names workspaces know them by. */
async function withActors<T extends { actor: string | null }>(ctx: Ctx, rows: T[]): Promise<(T & { actor_name: string | null })[]> {
  const ids = [...new Set(rows.map((row) => row.actor).filter((id): id is string => Boolean(id)))];
  const people = ids.length ? check<{ user_id: string; full_name: string | null; email: string | null }[]>(await ctx.db.from('company_members').select('user_id,full_name,email').in('user_id', ids)) : [];
  const names = new Map(people.map((row) => [row.user_id, row.full_name || row.email]));
  return rows.map((row) => ({ ...row, actor_name: row.actor ? names.get(row.actor) ?? null : null }));
}

/** Creates the owner's invited member row and a personal link (30 days). */
async function ownerInvite(ctx: Ctx, org: OrgRow, email: string | null, full_name: string | null) {
  let member: MemberRow | null = null;
  if (email) member = check<MemberRow | null>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('email', email).neq('status', 'removed').maybeSingle());
  if (member && member.status === 'active') throw new CompanyError('member_exists', 'This person is already in the workspace.', 409, { field: 'owner_email' });
  if (member) {
    if (member.role !== 'owner') member = check<MemberRow>(await ctx.db.from('company_members').update({ role: 'owner' }).eq('id', member.id).select(MEMBER_COLUMNS).single());
    await revokeMemberInvites(ctx, member.id);
  } else {
    member = check<MemberRow>(await ctx.db.from('company_members').insert({
      org_id: org.id, email, full_name, role: 'owner', status: 'invited', seat: false, invited_by: ctx.user, invited_at: ctx.now().toISOString(),
    }).select(MEMBER_COLUMNS).single());
  }
  const { invite, link } = await issueInvite(ctx, {
    org_id: org.id, member_id: member.id, kind: 'personal', role: 'admin', department_id: null, job_role: 'management', max_uses: 1,
    expires_at: new Date(ctx.now().getTime() + OWNER_DAYS * DAY).toISOString(),
  });
  return { member, invite, link };
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'staff/orgs', access: 'staff',
    async handle(ctx, _params, _body, query) {
      const status = query.get('status'), q = (query.get('q') ?? '').trim().toLowerCase();
      let orgs = check<OrgRow[]>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).order('created_at', { ascending: false }).limit(1000));
      if (status && (ORG_STATUSES as readonly string[]).includes(status)) orgs = orgs.filter((org) => org.status === status);
      if (q) orgs = orgs.filter((org) => [org.name, org.city, org.billing_email, org.contact_phone, org.tax_id].some((value) => String(value ?? '').toLowerCase().includes(q)));
      const ids = orgs.map((org) => org.id);
      const members = ids.length ? await fetchAll<{ org_id: string; status: string; seat: boolean }>(() => ctx.db.from('company_members').select('org_id,status,seat').in('org_id', ids).neq('status', 'removed').order('id')) : [];
      const tally = new Map<string, { people: number; invited: number; seats_used: number }>();
      for (const row of members) {
        const entry = tally.get(row.org_id) ?? { people: 0, invited: 0, seats_used: 0 };
        if (row.status === 'invited') entry.invited++; else entry.people++;
        if (row.seat) entry.seats_used++;
        tally.set(row.org_id, entry);
      }
      const all = check<{ status: string }[]>(await ctx.db.from('company_orgs').select('status').limit(5000));
      const counts = Object.fromEntries(ORG_STATUSES.map((value) => [value, all.filter((row) => row.status === value).length]));
      return { orgs: orgs.map((org) => ({ ...org, ...(tally.get(org.id) ?? { people: 0, invited: 0, seats_used: 0 }) })), counts };
    },
  },
  {
    // Opens a workspace (optionally for a demo request) with an owner invitation link.
    method: 'POST', path: 'staff/orgs', access: 'staff',
    async handle(ctx, _params, body) {
      const input = obj(body);
      const lead = input.lead_id ? await loadLead(ctx, String(input.lead_id)) : null;
      if (lead?.org_id) throw new CompanyError('lead_has_workspace', 'This request already has a workspace.', 409, { org_id: lead.org_id });
      const status = oneOf(input.status, ['pilot', 'active'] as const, 'status', 'pilot');
      const owner_email = readEmail(input.owner_email, 'owner_email', true);
      const owner_name = text(input.owner_name, 'owner_name', { max: 120, optional: true });
      if (!owner_email && !owner_name) throw new CompanyError('invalid_field', 'Name the owner or give their email.', 400, { field: 'owner_email' });
      const settings: Record<string, unknown> = { locale: oneOf(input.locale, ['en', 'ru', 'uz'] as const, 'locale', 'ru') };
      const ai = int(input.ai_daily_limit, 'ai_daily_limit', { min: 0, max: 100_000, optional: true });
      if (ai !== null) settings.ai_daily_limit = ai;
      const org = check<OrgRow>(await ctx.db.from('company_orgs').insert({
        name: text(input.name, 'name', { min: 2, max: 120 }),
        industry: oneOf<Industry>(input.industry, INDUSTRIES, 'industry', 'other'),
        size_band: oneOf<SizeBand>(input.size_band, SIZE_BANDS, 'size_band', '1-50'),
        city: text(input.city, 'city', { max: 80, optional: true }),
        contact_phone: text(input.contact_phone, 'contact_phone', { max: 40, optional: true }),
        billing_email: readEmail(input.billing_email, 'billing_email', true) ?? owner_email,
        tax_id: text(input.tax_id, 'tax_id', { max: 40, optional: true }),
        status,
        seats_limit: int(input.seats_limit, 'seats_limit', { min: 0, max: 100_000, optional: true }) ?? 0,
        tests_limit: input.tests_limit === null ? null : int(input.tests_limit, 'tests_limit', { min: 0, max: 1_000_000, optional: true }) ?? ctx.env.pilotTests,
        contract_ends_at: contractEnd(input.contract_ends_at),
        created_by: ctx.user,
        settings,
      }).select(ORG_COLUMNS).single());
      ctx.org = org;
      const owner = await ownerInvite(ctx, org, owner_email, owner_name);
      if (lead) {
        check(await ctx.db.from('company_leads').update({ org_id: org.id, status: status === 'active' ? 'won' : lead.status === 'won' ? 'won' : 'pilot' }).eq('id', lead.id));
        await ctx.audit('lead.workspace', lead.id, { org_id: org.id, name: org.name });
      }
      await ctx.audit('staff.org_created', org.id, { name: org.name, status, lead_id: lead?.id ?? null, owner_email });
      return { org, owner: owner.member, link: owner.link, expires_at: owner.invite.expires_at };
    },
  },
  {
    method: 'GET', path: 'staff/orgs/:org', access: 'staff',
    async handle(ctx, params) {
      const org = await loadOrg(ctx, params.org);
      const people = await fetchAll<MemberRow>(() => ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).neq('status', 'removed').order('id'));
      const audit = await withActors(ctx, check<{ id: string; actor: string | null; action: string; target: string | null; details: Record<string, unknown>; created_at: string }[]>(
        await ctx.db.from('company_audit').select('id,actor,action,target,details,created_at').eq('org_id', org.id).order('created_at', { ascending: false }).limit(100),
      ));
      const leads = check<LeadRow[]>(await ctx.db.from('company_leads').select(LEAD_COLUMNS).eq('org_id', org.id));
      const departments = check<{ id: string }[]>(await ctx.db.from('company_departments').select('id').eq('org_id', org.id));
      return {
        org,
        usage: await usage(ctx.db, org),
        counts: { people: people.filter((row) => row.status === 'active').length, invited: people.filter((row) => row.status === 'invited').length, departments: departments.length },
        admins: people.filter((row) => row.role === 'owner' || row.role === 'admin'),
        audit,
        leads,
        ai_default: ctx.env.aiDailyLimit,
      };
    },
  },
  {
    // { status?, seats_limit?, tests_limit? (null = unlimited), contract_ends_at? (YYYY-MM-DD | null), ai_daily_limit? (null = default), name?, billing_email?, tax_id? }
    method: 'PATCH', path: 'staff/orgs/:org', access: 'staff',
    async handle(ctx, params, body) {
      const org = await loadOrg(ctx, params.org), input = obj(body);
      const patch: Record<string, unknown> = {};
      if ('status' in input) patch.status = oneOf<OrgStatus>(input.status, ORG_STATUSES, 'status');
      if ('seats_limit' in input) {
        const seats = int(input.seats_limit, 'seats_limit', { min: 0, max: 100_000 })!;
        const used = await seatCount(ctx.db, org.id);
        if (seats < used) throw new CompanyError('seats_below_used', `${used} seats are in use. Turn some off first.`, 409, { field: 'seats_limit', used });
        patch.seats_limit = seats;
      }
      if ('tests_limit' in input) patch.tests_limit = input.tests_limit === null ? null : int(input.tests_limit, 'tests_limit', { min: 0, max: 1_000_000 });
      if ('contract_ends_at' in input) patch.contract_ends_at = contractEnd(input.contract_ends_at);
      if ('name' in input) patch.name = text(input.name, 'name', { min: 2, max: 120 });
      if ('billing_email' in input) patch.billing_email = readEmail(input.billing_email, 'billing_email', true);
      if ('tax_id' in input) patch.tax_id = text(input.tax_id, 'tax_id', { max: 40, optional: true });
      // Staff-only keys in settings: the AI cap and the Schood contact HR sees for "Talk to Schood about seats".
      const settings = { ...(org.settings ?? {}) } as Record<string, unknown>;
      const settingKeys: string[] = [];
      const setSetting = (key: string, value: unknown) => {
        if (value === null) delete settings[key]; else settings[key] = value;
        settingKeys.push(key);
      };
      if ('ai_daily_limit' in input) setSetting('ai_daily_limit', int(input.ai_daily_limit, 'ai_daily_limit', { min: 0, max: 100_000, optional: true }));
      if ('schood_contact_email' in input) setSetting('schood_contact_email', readEmail(input.schood_contact_email, 'schood_contact_email', true));
      if ('schood_contact_phone' in input) {
        const phone = text(input.schood_contact_phone, 'schood_contact_phone', { max: 40, optional: true });
        if (phone && !PHONE.test(phone)) throw new CompanyError('invalid_field', 'schood_contact_phone is not a phone number.', 400, { field: 'schood_contact_phone' });
        setSetting('schood_contact_phone', phone);
      }
      if (settingKeys.length) patch.settings = settings;
      if (!Object.keys(patch).length) return { org, synced: null };
      const updated = check<OrgRow>(await ctx.db.from('company_orgs').update(patch).eq('id', org.id).select(ORG_COLUMNS).single());
      const synced = await syncOrg(ctx, org.id);
      const before = org as unknown as Record<string, unknown>, after = updated as unknown as Record<string, unknown>;
      const oldSettings = (org.settings ?? {}) as Record<string, unknown>, newSettings = (updated.settings ?? {}) as Record<string, unknown>;
      const changes = Object.fromEntries([
        ...Object.keys(patch).filter((field) => field !== 'settings').map((field) => [field, { from: before[field] ?? null, to: after[field] ?? null }]),
        ...settingKeys.map((key) => [key, { from: oldSettings[key] ?? null, to: newSettings[key] ?? null }]),
      ]);
      await ctx.audit('staff.org_updated', org.id, { ...changes, synced });
      return { org: updated, usage: await usage(ctx.db, updated), synced };
    },
  },
  {
    // A (new) owner invitation for a workspace, e.g. when the first link was lost.
    method: 'POST', path: 'staff/orgs/:org/owner-invite', access: 'staff',
    async handle(ctx, params, body) {
      const org = await loadOrg(ctx, params.org), input = obj(body);
      const email = readEmail(input.email, 'email', true);
      const full_name = text(input.full_name, 'full_name', { max: 120, optional: true });
      if (!email && !full_name) throw new CompanyError('invalid_field', 'Name the owner or give their email.', 400, { field: 'email' });
      const owner = await ownerInvite(ctx, org, email, full_name);
      await ctx.audit('staff.owner_invited', owner.member.id, { email });
      return { owner: owner.member, link: owner.link, expires_at: owner.invite.expires_at };
    },
  },
  {
    method: 'GET', path: 'staff/audit', access: 'staff',
    async handle(ctx, _params, _body, query) {
      const limit = Math.min(500, Math.max(1, Number(query.get('limit')) || 200));
      let q = ctx.db.from('company_audit').select('id,org_id,actor,action,target,details,created_at');
      const orgId = query.get('org');
      if (orgId && UUID.test(orgId)) q = q.eq('org_id', orgId);
      const action = query.get('action');
      if (action && /^[a-z_.]{2,60}$/.test(action)) q = q.ilike('action', `${action}%`);
      const rows = check<{ id: string; org_id: string | null; actor: string | null; action: string; target: string | null; details: Record<string, unknown>; created_at: string }[]>(await q.order('created_at', { ascending: false }).limit(limit));
      const orgIds = [...new Set(rows.map((row) => row.org_id).filter((id): id is string => Boolean(id)))];
      const orgs = orgIds.length ? check<{ id: string; name: string }[]>(await ctx.db.from('company_orgs').select('id,name').in('id', orgIds)) : [];
      const names = new Map(orgs.map((org) => [org.id, org.name]));
      return { audit: (await withActors(ctx, rows)).map((row) => ({ ...row, org_name: row.org_id ? names.get(row.org_id) ?? null : null })) };
    },
  },
  {
    method: 'GET', path: 'staff/leads', access: 'staff',
    async handle(ctx) {
      const leads = check<LeadRow[]>(await ctx.db.from('company_leads').select(LEAD_COLUMNS).order('created_at', { ascending: false }).limit(1000));
      const orgIds = [...new Set(leads.map((lead) => lead.org_id).filter((id): id is string => Boolean(id)))];
      const orgs = orgIds.length ? check<{ id: string; name: string; status: string }[]>(await ctx.db.from('company_orgs').select('id,name,status').in('id', orgIds)) : [];
      const byId = new Map(orgs.map((org) => [org.id, org]));
      const counts = Object.fromEntries(LEAD_STATUSES.map((status) => [status, leads.filter((lead) => lead.status === status).length]));
      return { leads: leads.map((lead) => ({ ...lead, org: lead.org_id ? byId.get(lead.org_id) ?? null : null })), counts };
    },
  },
  {
    method: 'GET', path: 'staff/leads/:lead', access: 'staff',
    async handle(ctx, params) {
      const lead = await loadLead(ctx, params.lead);
      const timeline = await withActors(ctx, check<{ id: string; actor: string | null; action: string; details: Record<string, unknown>; created_at: string }[]>(
        await ctx.db.from('company_audit').select('id,actor,action,details,created_at').eq('target', lead.id).order('created_at', { ascending: false }).limit(200),
      ));
      const org = lead.org_id ? check<{ id: string; name: string; status: string } | null>(await ctx.db.from('company_orgs').select('id,name,status').eq('id', lead.org_id).maybeSingle()) : null;
      return { lead, org, timeline };
    },
  },
  {
    // { status?, notes?, follow_up_at? }
    method: 'PATCH', path: 'staff/leads/:lead', access: 'staff',
    async handle(ctx, params, body) {
      const lead = await loadLead(ctx, params.lead), input = obj(body);
      const patch: Record<string, unknown> = {};
      if ('status' in input) patch.status = oneOf(input.status, LEAD_STATUSES, 'status');
      if ('notes' in input) patch.notes = text(input.notes, 'notes', { max: 4000, optional: true });
      if ('follow_up_at' in input) patch.follow_up_at = dateOrNull(input.follow_up_at, 'follow_up_at');
      if (!Object.keys(patch).length) return { lead };
      const updated = check<LeadRow>(await ctx.db.from('company_leads').update(patch).eq('id', lead.id).select(LEAD_COLUMNS).single());
      const changes: Record<string, unknown> = {};
      if (patch.status !== undefined && patch.status !== lead.status) changes.status = { from: lead.status, to: patch.status };
      if (patch.follow_up_at !== undefined && patch.follow_up_at !== lead.follow_up_at) changes.follow_up_at = { from: lead.follow_up_at, to: patch.follow_up_at };
      if (patch.notes !== undefined && patch.notes !== lead.notes) changes.notes = true;
      if (Object.keys(changes).length) await ctx.audit('lead.updated', lead.id, changes);
      return { lead: updated };
    },
  },
  {
    // A dated note in the request's timeline (calls, meetings, next steps).
    method: 'POST', path: 'staff/leads/:lead/notes', access: 'staff',
    async handle(ctx, params, body) {
      const lead = await loadLead(ctx, params.lead);
      const note = text(obj(body).body, 'body', { min: 1, max: 2000 })!;
      await ctx.audit('lead.note', lead.id, { body: note });
      return { ok: true };
    },
  },
];
