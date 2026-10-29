// Invitations: a personal link for one person (creates their invited member row)
// or a team join link for a department (max uses, expiry). Links are shown once;
// only the token's sha256 is stored, so a lost link is renewed, not re-shown.
import { HR_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, CompanyError, UUID, type MemberRow, type Route } from '../types.ts';
import { email as readEmail, int, obj, oneOf, text } from '../util.ts';
import {
  actsAsOwner, DAY, departmentIn, INVITE_COLUMNS, inviteRoleFor, inviteState, issueInvite, jobRole, levelOrNull, dateOrNull, orgRole, PERSONAL_DAYS,
  revokeMemberInvites, type InviteRow,
} from './shared.ts';
import { sha256, token } from '../util.ts';
import { joinLink } from './shared.ts';

async function loadInvite(ctx: Parameters<Route['handle']>[0], orgId: string, id: string): Promise<InviteRow> {
  if (!UUID.test(id)) throw new CompanyError('invite_not_found', 'This invitation does not exist.', 404);
  const invite = check<InviteRow | null>(await ctx.db.from('company_invites').select(INVITE_COLUMNS).eq('org_id', orgId).eq('id', id).maybeSingle());
  if (!invite) throw new CompanyError('invite_not_found', 'This invitation does not exist.', 404);
  return invite;
}

export const inviteRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/invites', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx) {
      const invites = check<InviteRow[]>(await ctx.db.from('company_invites').select(INVITE_COLUMNS).eq('org_id', ctx.org!.id).order('created_at', { ascending: false }).limit(500));
      const now = ctx.now();
      return { invites: invites.map((invite) => ({ ...invite, state: inviteState(invite, now) })) };
    },
  },
  {
    // { kind: 'personal', full_name, email?, role, department_id, job_role, target_level?, target_date? }
    // { kind: 'link', role: 'employee'|'manager', department_id, job_role, max_uses?, expires_days }
    method: 'POST', path: 'orgs/:org/invites', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const org = ctx.org!, input = obj(body);
      const kind = oneOf(input.kind, ['personal', 'link'] as const, 'kind', 'personal');
      const department_id = await departmentIn(ctx, org.id, input.department_id);
      const job_role = jobRole(input.job_role);
      if (kind === 'link') {
        const role = oneOf(input.role, ['employee', 'manager'] as const, 'role', 'employee');
        const max_uses = int(input.max_uses, 'max_uses', { min: 1, max: 5000, optional: true });
        const days = int(input.expires_days, 'expires_days', { min: 1, max: 90, optional: true }) ?? 14;
        const open = check<{ id: string }[]>(await ctx.db.from('company_invites').select('id').eq('org_id', org.id).eq('kind', 'link').is('revoked_at', null).gt('expires_at', ctx.now().toISOString()));
        if (open.length >= 50) throw new CompanyError('too_many_links', 'Revoke some team links before making more.', 409);
        const { invite, link } = await issueInvite(ctx, {
          org_id: org.id, member_id: null, kind: 'link', role, department_id, job_role, max_uses, expires_at: new Date(ctx.now().getTime() + days * DAY).toISOString(),
        });
        await ctx.audit('invite.link_created', invite.id, { role, department_id, job_role, max_uses, days });
        return { invite: { ...invite, state: 'open' }, link };
      }
      const role = orgRole(input.role);
      if (role === 'owner' && !actsAsOwner(ctx)) throw new CompanyError('owner_protected', 'Only an owner can invite another owner.', 403);
      const full_name = text(input.full_name, 'full_name', { min: 2, max: 120 });
      const email = readEmail(input.email, 'email', true);
      if (email) {
        const taken = check<{ id: string; status: string }[]>(await ctx.db.from('company_members').select('id,status').eq('org_id', org.id).eq('email', email).neq('status', 'removed'));
        if (taken.length) throw new CompanyError('member_exists', 'Someone with this email is already in the workspace.', 409, { field: 'email', member_id: taken[0].id, status: taken[0].status });
      }
      const member = check<MemberRow>(await ctx.db.from('company_members').insert({
        org_id: org.id, full_name, email, role, department_id, job_role, status: 'invited', seat: false,
        target_level: levelOrNull(input.target_level, 'target_level'), target_date: dateOrNull(input.target_date, 'target_date'),
        invited_by: ctx.user, invited_at: ctx.now().toISOString(),
      }).select(MEMBER_COLUMNS).single());
      const { invite, link } = await issueInvite(ctx, {
        org_id: org.id, member_id: member.id, kind: 'personal', role: inviteRoleFor(role), department_id, job_role, max_uses: 1,
        expires_at: new Date(ctx.now().getTime() + PERSONAL_DAYS * DAY).toISOString(),
      });
      await ctx.audit('member.invited', member.id, { name: full_name, email, role });
      return { member, invite: { ...invite, state: 'open' }, link };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/invites/:invite/revoke', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx, params) {
      const invite = await loadInvite(ctx, ctx.org!.id, params.invite);
      if (invite.revoked_at) return { invite: { ...invite, state: 'revoked' } };
      const updated = check<InviteRow>(await ctx.db.from('company_invites').update({ revoked_at: ctx.now().toISOString() }).eq('id', invite.id).select(INVITE_COLUMNS).single());
      await ctx.audit('invite.revoked', invite.id, { kind: invite.kind, member_id: invite.member_id });
      return { invite: { ...updated, state: 'revoked' } };
    },
  },
  {
    // A fresh link: for a personal invite the old one stops working; a team link keeps
    // its settings and use count, and gets a new token and expiry.
    method: 'POST', path: 'orgs/:org/invites/:invite/renew', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const org = ctx.org!, input = body === undefined ? {} : obj(body);
      const invite = await loadInvite(ctx, org.id, params.invite);
      const now = ctx.now();
      if (invite.kind === 'personal') {
        const member = check<MemberRow | null>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('id', invite.member_id).maybeSingle());
        if (!member || member.status !== 'invited') throw new CompanyError('invite_closed', 'This person has already joined or was removed.', 409);
        if (member.role === 'owner' && !actsAsOwner(ctx)) throw new CompanyError('owner_protected', 'Only an owner can invite another owner.', 403);
        await revokeMemberInvites(ctx, member.id);
        const { invite: fresh, link } = await issueInvite(ctx, {
          org_id: org.id, member_id: member.id, kind: 'personal', role: inviteRoleFor(member.role), department_id: member.department_id, job_role: member.job_role,
          max_uses: 1, expires_at: new Date(now.getTime() + PERSONAL_DAYS * DAY).toISOString(),
        });
        await ctx.audit('invite.renewed', fresh.id, { kind: 'personal', member_id: member.id, previous: invite.id });
        return { invite: { ...fresh, state: 'open' }, link };
      }
      if (invite.revoked_at) throw new CompanyError('invite_closed', 'This link was revoked. Create a new one.', 409);
      const days = int(input.expires_days, 'expires_days', { min: 1, max: 90, optional: true }) ?? 14;
      const raw = token();
      const updated = check<InviteRow>(await ctx.db.from('company_invites').update({ token_hash: await sha256(raw), expires_at: new Date(now.getTime() + days * DAY).toISOString() }).eq('id', invite.id).select(INVITE_COLUMNS).single());
      await ctx.audit('invite.renewed', invite.id, { kind: 'link', days });
      return { invite: { ...updated, state: inviteState(updated, now) }, link: joinLink(ctx, raw) };
    },
  },
];
