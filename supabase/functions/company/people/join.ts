// Joining a workspace from a link. GET shows what the link is for (public, so an
// invitee sees the company before signing in); POST accepts it for the signed-in
// person, records their consent and syncs their Schood English access.
// Accepting twice, or as someone already in the workspace, changes nothing.
import { syncAccess } from '../core.ts';
import { MEMBER_COLUMNS, ORG_COLUMNS } from '../handler.ts';
import { check, CompanyError, type Ctx, type MemberRow, type OrgRow, type Route } from '../types.ts';
import { obj, sha256, text } from '../util.ts';
import { INVITE_COLUMNS, inviteState, revokeMemberInvites, type InviteRow, type InviteState } from './shared.ts';

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
type JoinState = InviteState | 'joined' | 'closed' | 'paused';

const home = (orgId: string, role: string) => role === 'employee' ? `/w/${orgId}/me` : `/w/${orgId}`;

/** "d***@silkroad.uz" — enough to recognise, not enough to harvest. */
export function maskEmail(value: string | null): string | null {
  if (!value) return null;
  const [local, domain] = value.split('@');
  if (!domain) return null;
  return `${local.slice(0, 1)}${'*'.repeat(Math.min(5, Math.max(1, local.length - 1)))}@${domain}`;
}

async function findInvite(ctx: Ctx, raw: string): Promise<InviteRow> {
  if (!TOKEN.test(raw)) throw new CompanyError('invite_not_found', 'This invitation link is not valid.', 404);
  const invite = check<InviteRow | null>(await ctx.db.from('company_invites').select(INVITE_COLUMNS).eq('token_hash', await sha256(raw)).maybeSingle());
  if (!invite) throw new CompanyError('invite_not_found', 'This invitation link is not valid.', 404);
  return invite;
}

async function context(ctx: Ctx, invite: InviteRow) {
  const org = check<OrgRow>(await ctx.db.from('company_orgs').select(ORG_COLUMNS).eq('id', invite.org_id).single());
  const target = invite.member_id ? check<MemberRow | null>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('id', invite.member_id).maybeSingle()) : null;
  const own = ctx.user ? check<MemberRow | null>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('user_id', ctx.user).maybeSingle()) : null;
  return { org, target, own };
}

function stateOf(ctx: Ctx, invite: InviteRow, { org, target, own }: Awaited<ReturnType<typeof context>>): JoinState {
  if (org.status === 'closed') return 'closed';
  if (own?.status === 'active') return 'joined';
  if (invite.kind === 'personal') {
    if (!target || target.status === 'removed') return 'revoked';
    if (target.status === 'active') return 'used_up';
  }
  const state = inviteState(invite, ctx.now());
  if (state === 'open' && org.status === 'suspended') return 'paused';
  return state;
}

/** One use of the link, counted atomically (fails when another join took the last use). */
async function claim(ctx: Ctx, invite: InviteRow): Promise<boolean> {
  const taken = check<{ id: string }[]>(await ctx.db.from('company_invites').update({ uses: invite.uses + 1 }).eq('id', invite.id).eq('uses', invite.uses).is('revoked_at', null).select('id'));
  return taken.length === 1;
}

async function emailFree(ctx: Ctx, orgId: string, email: string | null, except: string): Promise<boolean> {
  if (!email) return false;
  const rows = check<{ id: string }[]>(await ctx.db.from('company_members').select('id').eq('org_id', orgId).eq('email', email).neq('status', 'removed'));
  return rows.every((row) => row.id === except);
}

const CLOSED: Record<Exclude<JoinState, 'open' | 'joined'>, [string, string, number]> = {
  expired: ['invite_expired', 'This invitation has expired. Ask HR for a new link.', 410],
  revoked: ['invite_revoked', 'This invitation was withdrawn. Ask HR for a new link.', 410],
  used_up: ['invite_used_up', 'This link has already been used. Ask HR for a new one.', 410],
  closed: ['org_closed', 'This workspace is closed.', 403],
  paused: ['org_suspended', 'This workspace is paused. Contact your HR team.', 403],
};

export const joinRoutes: Route[] = [
  {
    method: 'GET', path: 'join/:token', access: 'public',
    async handle(ctx, params) {
      const invite = await findInvite(ctx, params.token);
      const found = await context(ctx, invite);
      const { org, target, own } = found;
      const department_id = target?.department_id ?? invite.department_id;
      const department = department_id ? check<{ name: string } | null>(await ctx.db.from('company_departments').select('name').eq('id', department_id).maybeSingle()) : null;
      const state = stateOf(ctx, invite, found);
      return {
        state,
        kind: invite.kind,
        org: { id: org.id, name: org.name, industry: org.industry, city: org.city },
        role: target?.role ?? invite.role,
        department: department?.name ?? null,
        job_role: target?.job_role ?? invite.job_role,
        full_name: target?.full_name ?? null,
        email_hint: maskEmail(target?.email ?? null),
        expires_at: invite.expires_at,
        signed_in: Boolean(ctx.user),
        home: state === 'joined' && own ? home(org.id, own.role) : null,
      };
    },
  },
  {
    // { consent: true, full_name? }
    method: 'POST', path: 'join/:token', access: 'user',
    async handle(ctx, params, body) {
      const input = body === undefined ? {} : obj(body);
      if (input.consent !== true) throw new CompanyError('consent_required', 'Agree to share your progress with the company to join.', 400, { field: 'consent' });
      const typedName = text(input.full_name, 'full_name', { max: 120, optional: true });
      const invite = await findInvite(ctx, params.token);
      const found = await context(ctx, invite);
      const { org, target, own } = found;
      const state = stateOf(ctx, invite, found);
      if (state === 'joined') return { state, already: true, org_id: org.id, home: home(org.id, own!.role) };
      if (state !== 'open') {
        const [code, message, status] = CLOSED[state];
        throw new CompanyError(code, message, status);
      }
      if (!(await claim(ctx, invite))) throw new CompanyError(...CLOSED.used_up);
      const at = ctx.now().toISOString();
      let member: MemberRow;

      if (invite.kind === 'personal' && target) {
        if (own) {
          // They were in this workspace before (removed): bring that row back with the
          // invitation's details, so their history stays in one place.
          check(await ctx.db.from('company_members').update({ status: 'removed', seat: false, removed_at: at }).eq('id', target.id));
          member = check<MemberRow>(await ctx.db.from('company_members').update({
            status: 'active', role: target.role, department_id: target.department_id, job_role: target.job_role, seat: target.seat,
            target_level: target.target_level, target_date: target.target_date, full_name: target.full_name ?? own.full_name ?? typedName,
            email: (await emailFree(ctx, org.id, target.email, own.id)) ? target.email : own.email, consent_at: at, joined_at: at, removed_at: null,
          }).eq('id', own.id).select(MEMBER_COLUMNS).single());
        } else {
          member = check<MemberRow>(await ctx.db.from('company_members').update({
            user_id: ctx.user, status: 'active', joined_at: at, consent_at: target.consent_at ?? at,
            full_name: target.full_name ?? typedName,
            email: target.email ?? ((await emailFree(ctx, org.id, ctx.email, target.id)) ? ctx.email : null),
          }).eq('id', target.id).select(MEMBER_COLUMNS).single());
        }
      } else {
        const invited = ctx.email ? check<MemberRow[]>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('email', ctx.email).eq('status', 'invited')) : [];
        if (own) {
          member = check<MemberRow>(await ctx.db.from('company_members').update({
            status: 'active', role: invite.role, department_id: invite.department_id, job_role: invite.job_role, seat: false,
            full_name: own.full_name ?? typedName, consent_at: at, joined_at: at, removed_at: null,
          }).eq('id', own.id).select(MEMBER_COLUMNS).single());
        } else if (invited[0]) {
          // HR already invited this email personally: join as that person, keep HR's settings.
          member = check<MemberRow>(await ctx.db.from('company_members').update({
            user_id: ctx.user, status: 'active', joined_at: at, consent_at: at, full_name: invited[0].full_name ?? typedName,
            department_id: invited[0].department_id ?? invite.department_id,
          }).eq('id', invited[0].id).select(MEMBER_COLUMNS).single());
          await revokeMemberInvites(ctx, invited[0].id);
        } else {
          member = check<MemberRow>(await ctx.db.from('company_members').insert({
            org_id: org.id, user_id: ctx.user, email: (await emailFree(ctx, org.id, ctx.email, '')) ? ctx.email : null, full_name: typedName, role: invite.role, department_id: invite.department_id,
            job_role: invite.job_role, status: 'active', seat: false, consent_at: at, joined_at: at, invited_by: invite.created_by, invited_at: at,
          }).select(MEMBER_COLUMNS).single());
        }
      }

      const access = await syncAccess(ctx.db, ctx.user);
      ctx.org = org;
      await ctx.audit('member.joined', member.id, { via: invite.kind, invite: invite.id, access });
      return { state: 'joined', already: false, org_id: org.id, role: member.role, home: home(org.id, member.role) };
    },
  },
];
