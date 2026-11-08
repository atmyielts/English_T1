// What the staff console's modules share: loading a workspace or demo request,
// the contract-end rule, re-syncing a workspace, and the owner's invitation.
import { MEMBER_COLUMNS, ORG_COLUMNS } from '../handler.ts';
import { check, checkUnique, CompanyError, UUID, type Ctx, type MemberRow, type OrgRow } from '../types.ts';
import { dateOrNull, DAY, issueInvite, memberExists, OWNER_DAYS, revokeMemberInvites } from './shared.ts';

export const LEAD_STATUSES = ['new', 'contacted', 'pilot', 'won', 'lost'] as const;
export const LEAD_COLUMNS = 'id,name,company,job_title,phone,email,size_band,industry,interests,need,locale,status,notes,follow_up_at,org_id,source,created_at,updated_at';

export interface LeadRow {
  id: string; name: string; company: string; job_title: string | null; phone: string | null; email: string | null; size_band: string | null;
  industry: string | null; interests: string[] | null; need: string | null; locale: string | null; status: (typeof LEAD_STATUSES)[number];
  notes: string | null; follow_up_at: string | null; org_id: string | null; source: string | null; created_at: string; updated_at: string;
}

export async function loadOrg(ctx: Ctx, id: string): Promise<OrgRow> {
  if (!UUID.test(id)) throw new CompanyError('org_not_found', 'Workspace not found.', 404);
  const org = check<OrgRow | null>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).eq('id', id).maybeSingle());
  if (!org) throw new CompanyError('org_not_found', 'Workspace not found.', 404);
  ctx.org = org;
  return org;
}

export async function loadLead(ctx: Ctx, id: string): Promise<LeadRow> {
  if (!UUID.test(id)) throw new CompanyError('lead_not_found', 'Request not found.', 404);
  const lead = check<LeadRow | null>(await ctx.db.from('company_leads').select(LEAD_COLUMNS).eq('id', id).maybeSingle());
  if (!lead) throw new CompanyError('lead_not_found', 'Request not found.', 404);
  return lead;
}

/** Contract end as the last second of that Tashkent day. */
export function contractEnd(value: unknown): string | null {
  const date = dateOrNull(value, 'contract_ends_at');
  return date ? new Date(`${date}T23:59:59+05:00`).toISOString() : null;
}

/** Re-syncs everyone's Schood English access after a plan change. Never throws. */
export async function syncOrg(ctx: Ctx, orgId: string): Promise<number | null> {
  const { data, error } = await ctx.db.rpc('company_sync_org_access', { p_org: orgId });
  if (error) {
    console.error(JSON.stringify({ company_sync_org: 'failed', org: orgId, error: error.message }));
    return null;
  }
  return Number(data);
}

/** Creates the owner's invited member row and a personal link (30 days). */
export async function ownerInvite(ctx: Ctx, org: OrgRow, email: string | null, full_name: string | null) {
  let member: MemberRow | null = null;
  if (email) member = check<MemberRow | null>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('email', email).neq('status', 'removed').maybeSingle());
  if (member && member.status === 'active') throw new CompanyError('member_exists', 'This person is already in the workspace.', 409, { field: 'owner_email' });
  if (member) {
    // Before the row changes, so the old link never sees the new role.
    await revokeMemberInvites(ctx, member.id);
    if (member.role !== 'owner') {
      // Only while still pending: someone joining through a link in between must not become owner.
      member = check<MemberRow | null>(await ctx.db.from('company_members').update({ role: 'owner' }).eq('id', member.id).eq('status', 'invited').select(MEMBER_COLUMNS).maybeSingle());
      if (!member) throw new CompanyError('member_exists', 'This person is already in the workspace.', 409, { field: 'owner_email' });
    }
  } else {
    member = checkUnique<MemberRow>(await ctx.db.from('company_members').insert({
      org_id: org.id, email, full_name, role: 'owner', status: 'invited', seat: false, invited_by: ctx.user, invited_at: ctx.now().toISOString(),
    }).select(MEMBER_COLUMNS).single(), memberExists);
  }
  const { invite, link } = await issueInvite(ctx, {
    org_id: org.id, member_id: member.id, kind: 'personal', role: 'admin', department_id: null, job_role: 'management', max_uses: 1,
    expires_at: new Date(ctx.now().getTime() + OWNER_DAYS * DAY).toISOString(),
  });
  return { member, invite, link };
}
