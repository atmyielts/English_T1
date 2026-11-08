// Invitation emails. Off unless the function's switch and the workspace's switch are both
// on, and HR presses the button each time: nothing here runs on a schedule. A raw link is
// never stored, so each email carries a fresh one. The person's previous link stops
// working only after the email has gone, so a failed send loses nothing.
import { check, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { DAY, inviteRoleFor, issueInvite, actsAsOwner, PERSONAL_DAYS } from '../people/shared.ts';
import { inChunks, obj } from '../util.ts';
import { brandOf } from './brand.ts';
import { inviteEmail, LOCALES, type Locale } from './messages.ts';
import { allowDayHit, allowHit, connectConfig, HR, readSettings, switches } from './shared.ts';

const MAX_PER_REQUEST = 50;
const DAILY_CAP = 300;
/** One email per person per ten minutes: a double click does not send two. */
const PER_PERSON_SECONDS = 600;

export type InviteOutcome = { member_id: string; status: 'sent' | 'skipped' | 'failed'; reason?: string };

/** Sends one person's invitation. Assumes the switches were checked. */
export async function emailInvite(ctx: Ctx, member: MemberRow): Promise<InviteOutcome> {
  const org = ctx.org!, config = connectConfig(ctx), out = (status: InviteOutcome['status'], reason?: string): InviteOutcome => ({ member_id: member.id, status, ...(reason ? { reason } : {}) });
  if (member.status !== 'invited') return out('skipped', 'not_invited');
  if (!member.email) return out('skipped', 'no_email');
  if (member.role === 'owner' && !actsAsOwner(ctx)) return out('skipped', 'owner_protected');
  if (!await allowHit(ctx.db, `invite:${member.id}`, 1, PER_PERSON_SECONDS)) return out('skipped', 'just_sent');
  if (!await allowDayHit(ctx.db, `invite-org:${org.id}`, DAILY_CAP, ctx.now())) return out('skipped', 'daily_cap');

  const previous = check<{ id: string }[]>(await ctx.db.from('company_invites').select('id').eq('member_id', member.id).is('revoked_at', null));
  const { invite, link } = await issueInvite(ctx, {
    org_id: org.id, member_id: member.id, kind: 'personal', role: inviteRoleFor(member.role), department_id: member.department_id, job_role: member.job_role,
    max_uses: 1, expires_at: new Date(ctx.now().getTime() + PERSONAL_DAYS * DAY).toISOString(),
  });
  const locale: Locale = LOCALES.includes(org.settings?.locale as Locale) ? org.settings.locale as Locale : 'ru';
  const brand = await brandOf(ctx.db, org.id);
  const message = inviteEmail(locale, brand?.name ?? org.name, member.full_name, link);
  const sent = await config.email!({ to: member.email, ...message }).catch(() => ({ ok: false, reason: 'network' }));
  if (!sent.ok) {
    // The person's old link still works; the one that did not go out is closed.
    check(await ctx.db.from('company_invites').update({ revoked_at: ctx.now().toISOString() }).eq('id', invite.id));
    await ctx.audit('invite.email_failed', member.id, { reason: String(sent.reason ?? 'failed').slice(0, 60) });
    return out('failed', 'send_failed');
  }
  if (previous.length) await inChunks(previous.map((row) => row.id), async (chunk) => check<unknown[]>(await ctx.db.from('company_invites').update({ revoked_at: ctx.now().toISOString() }).in('id', chunk).select('id')));
  await ctx.audit('invite.emailed', member.id, { invite: invite.id });
  return out('sent');
}

/** Whether emails can go out for this workspace. */
export async function emailOpen(ctx: Ctx): Promise<boolean> {
  return switches(ctx.env).email && (await readSettings(ctx.db, ctx.org!.id)).email_enabled;
}

export const emailRoutes: Route[] = [
  {
    // Invited people with an address, for the page that sends them.
    method: 'GET', path: 'orgs/:org/connect/email/invited', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx) {
      const rows = check<Pick<MemberRow, 'id' | 'full_name' | 'email' | 'role'>[]>(await ctx.db.from('company_members').select('id,full_name,email,role').eq('org_id', ctx.org!.id).eq('status', 'invited').order('full_name').limit(500));
      return { available: await emailOpen(ctx), function_on: switches(ctx.env).email, people: rows.filter((row) => row.email) };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/connect/email/invites', access: 'org', roles: HR,
    async handle(ctx, _params, body) {
      const input = obj(body);
      if (!Array.isArray(input.member_ids) || !input.member_ids.length || input.member_ids.length > MAX_PER_REQUEST || input.member_ids.some((id) => typeof id !== 'string' || !UUID.test(id))) {
        throw new CompanyError('invalid_field', `Choose 1 to ${MAX_PER_REQUEST} people.`, 400, { field: 'member_ids' });
      }
      if (!await emailOpen(ctx)) throw new CompanyError('email_off', 'Invitation emails are not switched on for this workspace.', 409);
      const ids = [...new Set(input.member_ids as string[])];
      const members = check<MemberRow[]>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', ctx.org!.id).in('id', ids));
      const results: InviteOutcome[] = [];
      for (const member of members) results.push(await emailInvite(ctx, member));
      const known = new Set(members.map((member) => member.id));
      for (const id of ids) if (!known.has(id)) results.push({ member_id: id, status: 'skipped', reason: 'not_found' });
      return { results, sent: results.filter((entry) => entry.status === 'sent').length };
    },
  },
];
