// Joining a workspace from a link. GET shows what the link is for (public, so an
// invitee sees the company before signing in); POST accepts it for the signed-in
// person, records their consent and syncs their Schood English access.
// Accepting twice, or as someone already in the workspace, changes nothing.
import { accessSyncFlag, syncAccess } from '../core.ts';
import { contractEnded, MEMBER_COLUMNS, ORG_COLUMNS } from '../handler.ts';
import { check, CompanyError, type Ctx, type MemberRow, type OrgRow, type Route } from '../types.ts';
import { obj, sha256, text } from '../util.ts';
import { withinLimit } from '../hiring/ats.ts';
import { INVITE_COLUMNS, inviteState, revokeMemberInvites, ROLE_RANK, type InviteRow, type InviteState } from './shared.ts';

/**
 * Invitation link views from one network an hour. A team link posted in a company chat is opened by
 * everyone on the office network, twice each (before and after sign-in), so this is generous.
 */
export const JOIN_VIEWS_PER_HOUR = 6000;
/** Lookups of links that do not exist, from one network an hour; only link scanning gets near it. */
export const JOIN_MISSES_PER_HOUR = 300;

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const CLAIM_TRIES = 5;
/** How long a refused accept waits before asking whether the same person's other request has joined. */
const SAME_PERSON_WAIT_MS = 200;
type JoinState = InviteState | 'joined' | 'closed' | 'paused' | 'ended';

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
  const own = ctx.user ? check<(MemberRow & { removed_at?: string | null }) | null>(await ctx.db.from('company_members').select(`${MEMBER_COLUMNS},removed_at`).eq('org_id', org.id).eq('user_id', ctx.user).maybeSingle()) : null;
  return { org, target, own };
}

function stateOf(ctx: Ctx, invite: InviteRow, { org, target, own }: Awaited<ReturnType<typeof context>>): JoinState {
  if (org.status === 'closed') return 'closed';
  if (own?.status === 'active') return 'joined';
  // A team link whose token is from before someone was removed (or left) does not bring
  // them back; that takes a link made or renewed since, or a personal invitation. Checked
  // before the claim, so no use is burned and the preview agrees.
  if (invite.kind === 'link' && own?.status === 'removed' && own.removed_at && !(Date.parse(invite.token_issued_at) > Date.parse(own.removed_at))) return 'revoked';
  if (invite.kind === 'personal') {
    if (!target || target.status === 'removed') return 'revoked';
    if (target.status === 'active') return 'used_up';
  }
  const state = inviteState(invite, ctx.now());
  if (state === 'open' && org.status === 'suspended') return 'paused';
  if (state === 'open' && contractEnded(org, ctx.now())) return 'ended';
  return state;
}

/**
 * Takes one use of the link, counted atomically. Losing the race only means someone
 * else joined at that moment, so re-read and try again while the link stays open.
 * Returns 'open' once a use is taken, the link's state when it has closed, or null
 * when every try lost a race.
 */
async function claim(ctx: Ctx, invite: InviteRow): Promise<InviteState | null> {
  let current = invite;
  for (let attempt = 0; attempt < CLAIM_TRIES; attempt++) {
    const taken = check<{ id: string }[]>(await ctx.db.from('company_invites').update({ uses: current.uses + 1 }).eq('id', current.id).eq('uses', current.uses).is('revoked_at', null).select('id'));
    if (taken.length === 1) return 'open';
    current = check<InviteRow>(await ctx.db.from('company_invites').select(INVITE_COLUMNS).eq('id', invite.id).single());
    const state = inviteState(current, ctx.now());
    if (state !== 'open') return state;
  }
  return null;
}

/** Hands a use back when the person it was taken for did not need it. */
async function giveBack(ctx: Ctx, inviteId: string): Promise<void> {
  for (let attempt = 0; attempt < CLAIM_TRIES; attempt++) {
    const { uses } = check<{ uses: number }>(await ctx.db.from('company_invites').select('uses').eq('id', inviteId).single());
    if (uses <= 0) return;
    const back = check<{ id: string }[]>(await ctx.db.from('company_invites').update({ uses: uses - 1 }).eq('id', inviteId).eq('uses', uses).select('id'));
    if (back.length === 1) return;
  }
  console.error(JSON.stringify({ company_join: 'use_not_returned', invite: inviteId }));
}

/** The caller's own row if they are in the workspace now: another request of theirs got there first. */
async function joinedMeanwhile(ctx: Ctx, orgId: string): Promise<MemberRow | null> {
  const own = check<MemberRow | null>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', orgId).eq('user_id', ctx.user).maybeSingle());
  return own?.status === 'active' ? own : null;
}

/** Raised when a row this request meant to change was taken by a request of the same person. */
class LostRace extends Error {}

async function emailFree(ctx: Ctx, orgId: string, email: string | null, except: string): Promise<boolean> {
  if (!email) return false;
  const rows = check<{ id: string }[]>(await ctx.db.from('company_members').select('id').eq('org_id', orgId).eq('email', email).neq('status', 'removed'));
  return rows.every((row) => row.id === except);
}

/** The first of these addresses that nobody else in the workspace holds, or null. */
async function firstFreeEmail(ctx: Ctx, orgId: string, except: string, ...emails: (string | null)[]): Promise<string | null> {
  for (const email of emails) if (await emailFree(ctx, orgId, email, except)) return email;
  return null;
}

const CLOSED: Record<Exclude<JoinState, 'open' | 'joined'>, [string, string, number]> = {
  expired: ['invite_expired', 'This invitation has expired. Ask HR for a new link.', 410],
  revoked: ['invite_revoked', 'This invitation was withdrawn. Ask HR for a new link.', 410],
  used_up: ['invite_used_up', 'This link has already been used. Ask HR for a new one.', 410],
  closed: ['org_closed', 'This workspace is closed.', 403],
  paused: ['org_suspended', 'This workspace is paused. Contact your HR team.', 403],
  ended: ['contract_ended', 'This company\'s agreement with Schood has ended. Contact your HR team.', 403],
};

/**
 * Someone who was in this workspace before (removed) and whom HR has invited again:
 * retire the row HR prepared and bring the old one back with its details, so their
 * history stays in one place. The old row may hold the same email, which the unique
 * index allows only once the prepared row is out of the way.
 */
async function bringBack(ctx: Ctx, own: MemberRow, prepared: MemberRow, accountEmail: string | null, typedName: string | null, at: string): Promise<MemberRow> {
  check(await ctx.db.from('company_members').update({ status: 'removed', seat: false, removed_at: at }).eq('id', prepared.id).eq('status', 'invited'));
  await revokeMemberInvites(ctx, prepared.id);
  return await changed(ctx.db.from('company_members').update({
    status: 'active', role: prepared.role, department_id: prepared.department_id, job_role: prepared.job_role, seat: prepared.seat,
    target_level: prepared.target_level, target_date: prepared.target_date, full_name: prepared.full_name ?? own.full_name ?? typedName,
    email: await firstFreeEmail(ctx, own.org_id, own.id, accountEmail, prepared.email, own.email), consent_at: at, joined_at: at, removed_at: null,
  }).eq('id', own.id).neq('status', 'active'));
}

/** Runs a guarded update of one member row; no row means another request of this person changed it first. */
async function changed(update: { select: (columns: string) => PromiseLike<{ data: MemberRow[] | null; error: { code?: string; message: string } | null }> }): Promise<MemberRow> {
  const rows = check<MemberRow[]>(await update.select(MEMBER_COLUMNS));
  if (!rows.length) throw new LostRace();
  return rows[0];
}

/** Writes the caller's membership for a claimed use of the invitation. */
async function admit(ctx: Ctx, org: OrgRow, invite: InviteRow, target: MemberRow | null, own: MemberRow | null, typedName: string | null): Promise<MemberRow> {
  const at = ctx.now().toISOString();
  // The person joining is whoever holds this account, so their row shows its address.
  const accountEmail = ctx.email?.trim().toLowerCase() || null;
  if (invite.kind === 'personal' && target) {
    if (own) return await bringBack(ctx, own, target, accountEmail, typedName, at);
    const email = await firstFreeEmail(ctx, org.id, target.id, accountEmail, target.email);
    const update = ctx.db.from('company_members').update({
      user_id: ctx.user, status: 'active', joined_at: at, consent_at: target.consent_at ?? at,
      full_name: target.full_name ?? typedName, email,
    }).eq('id', target.id).eq('status', 'invited').eq('role', target.role);
    // HR raising the role or correcting the address stops this link; a join already on its way stops here.
    return await changed(target.email === null ? update.is('email', null) : update.eq('email', target.email));
  }
  const invited = accountEmail ? check<MemberRow[]>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('email', accountEmail).eq('status', 'invited')) : [];
  // A team link never gives more than its own role: a higher pending role needs that person's own link.
  if (invited[0] && ROLE_RANK[invited[0].role] > ROLE_RANK[invite.role]) throw new CompanyError('personal_link_needed', 'Use the personal link HR sent you for this role.', 409);
  // HR already invited this email again: join as that person, keep HR's settings.
  if (own && invited[0]) return await bringBack(ctx, own, { ...invited[0], department_id: invited[0].department_id ?? invite.department_id }, accountEmail, typedName, at);
  if (own) {
    return await changed(ctx.db.from('company_members').update({
      status: 'active', role: invite.role, department_id: invite.department_id, job_role: invite.job_role, seat: false,
      full_name: own.full_name ?? typedName, email: await firstFreeEmail(ctx, org.id, own.id, accountEmail, own.email), consent_at: at, joined_at: at, removed_at: null,
    }).eq('id', own.id).neq('status', 'active'));
  }
  if (invited[0]) {
    // HR already invited this email personally: join as that person, keep HR's settings.
    const member = await changed(ctx.db.from('company_members').update({
      user_id: ctx.user, status: 'active', joined_at: at, consent_at: at, full_name: invited[0].full_name ?? typedName,
      department_id: invited[0].department_id ?? invite.department_id,
    }).eq('id', invited[0].id).eq('status', 'invited'));
    await revokeMemberInvites(ctx, invited[0].id);
    return member;
  }
  return check<MemberRow>(await ctx.db.from('company_members').insert({
    org_id: org.id, user_id: ctx.user, email: await firstFreeEmail(ctx, org.id, '', accountEmail), full_name: typedName, role: invite.role, department_id: invite.department_id,
    job_role: invite.job_role, status: 'active', seat: false, consent_at: at, joined_at: at, invited_by: invite.created_by, invited_at: at,
  }).select(MEMBER_COLUMNS).single());
}

export const joinRoutes: Route[] = [
  {
    method: 'GET', path: 'join/:token', access: 'public',
    async handle(ctx, params) {
      if (!(await withinLimit(ctx, 'join', JOIN_VIEWS_PER_HOUR))) throw new CompanyError('too_many_requests', 'Too many requests from this network. Try again in an hour.', 429);
      let invite: InviteRow;
      try {
        invite = await findInvite(ctx, params.token);
      } catch (cause) {
        if (cause instanceof CompanyError && cause.code === 'invite_not_found' && !(await withinLimit(ctx, 'join_miss', JOIN_MISSES_PER_HOUR))) {
          throw new CompanyError('too_many_requests', 'Too many requests from this network. Try again in an hour.', 429);
        }
        throw cause;
      }
      const found = await context(ctx, invite);
      const { org, target, own } = found;
      const state = stateOf(ctx, invite, found);
      // Anyone can hold an old link, and it ends what it could show: a link that cannot be
      // used says so and names the company, not who it was for.
      if (state !== 'open' && state !== 'joined') return { state, org: { name: org.name }, signed_in: Boolean(ctx.user) };
      // Someone already in the workspace sees their own place, whoever this link was made for.
      const person = state === 'joined' ? own : target;
      const department_id = person?.department_id ?? (state === 'joined' ? null : invite.department_id);
      const department = department_id ? check<{ name: string } | null>(await ctx.db.from('company_departments').select('name').eq('id', department_id).maybeSingle()) : null;
      return {
        state,
        kind: invite.kind,
        org: { id: org.id, name: org.name, industry: org.industry, city: org.city },
        role: person?.role ?? invite.role,
        department: department?.name ?? null,
        job_role: person?.job_role ?? invite.job_role,
        full_name: person?.full_name ?? null,
        email_hint: maskEmail(person?.email ?? null),
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
      // Nothing to change, but an access sync that failed earlier gets another go.
      if (state === 'joined') return { state, already: true, org_id: org.id, home: home(org.id, own!.role), ...accessSyncFlag(await syncAccess(ctx.db, ctx.user)) };
      if (state !== 'open') {
        const [code, message, status] = CLOSED[state];
        throw new CompanyError(code, message, status);
      }
      const claimed = await claim(ctx, invite);
      if (claimed !== 'open') {
        // The same person pressing twice: the last use went to their other request, which may still be writing.
        await new Promise((resolve) => setTimeout(resolve, SAME_PERSON_WAIT_MS));
        const mine = await joinedMeanwhile(ctx, org.id);
        if (mine) return { state: 'joined', already: true, org_id: org.id, home: home(org.id, mine.role) };
        if (claimed === null) throw new CompanyError('invite_busy', 'Many people are joining right now. Try again in a moment.', 409);
        throw new CompanyError(...CLOSED[claimed]);
      }
      let member: MemberRow;
      try {
        member = await admit(ctx, org, invite, target, own, typedName);
      } catch (cause) {
        // Nobody joined on this use. A unique index (company_members_user_key) or a guarded update
        // says the same person's other request got there first, and that is a join, not an error.
        await giveBack(ctx, invite.id);
        const conflict = cause instanceof LostRace || (cause instanceof Error && cause.message.startsWith('23505'));
        if (!conflict) throw cause;
        const mine = await joinedMeanwhile(ctx, org.id);
        if (mine) return { state: 'joined', already: true, org_id: org.id, home: home(org.id, mine.role) };
        throw new CompanyError('invite_busy', 'Many people are joining right now. Try again in a moment.', 409);
      }

      const access = await syncAccess(ctx.db, ctx.user);
      ctx.org = org;
      // A personal link can be accepted from another address; HR can see that here.
      const invitedEmail = invite.kind === 'personal' && target?.email && target.email !== member.email ? { invited_email: target.email } : {};
      await ctx.audit('member.joined', member.id, { via: invite.kind, invite: invite.id, access, ...invitedEmail });
      return { state: 'joined', already: false, org_id: org.id, role: member.role, home: home(org.id, member.role), ...accessSyncFlag(access) };
    },
  },
];
