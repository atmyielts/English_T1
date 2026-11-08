// Team feed lite: kudos between colleagues who opted in, and badges a person chose to
// share. It never reads learning data on its own: a kudos is a preset and a short note, and
// a badge appears only because its owner pressed Share after agreeing to share progress.
// HR can switch the feed off for the whole workspace and remove any entry.
import { HR_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { fetchAll } from '../people/shared.ts';
import { isHr, seatBlock } from '../training/shared.ts';
import { check, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { inChunks, obj, oneOf, text, uuid } from '../util.ts';
import { BADGE_CODES, evaluateBadges, type BadgeCode } from './badges.ts';
import { badgeFacts, practiceHistory, thenAndNow } from './progress.ts';
import { readSettings, saveSettings, today } from './shared.ts';

export const KUDOS_MESSAGES = ['great_call', 'clear_email', 'good_meeting', 'helped_me', 'brave_english', 'keep_going'] as const;
/** Kudos one person can send in a Tashkent day. */
export const KUDOS_DAILY = 10;
const FEED_SIZE = 60;

interface KudosRow { id: string; org_id: string; from_member: string; to_member: string | null; kind: 'kudos' | 'badge'; message: string | null; note: string | null; badge: string | null; day: string; created_at: string }
const KUDOS_COLUMNS = 'id,org_id,from_member,to_member,kind,message,note,badge,day,created_at';
interface PersonRow { id: string; full_name: string | null; user_id: string | null; status: string }

/** A pilot has tests only, and a paused or ended workspace is read-only. A seat is not needed: thanking a colleague is not learning. */
function requireOpenWorkspace(ctx: Ctx): void {
  const reason = ctx.staff ? null : seatBlock(ctx, { seat: true });
  if (reason) throw new CompanyError('seat_required', 'The team feed is not available in this workspace right now.', 402, { reason });
}

async function feedOff(ctx: Ctx): Promise<boolean> {
  const row = check<{ kudos_off: boolean } | null>(await ctx.db.from('company_coach_org').select('kudos_off').eq('org_id', ctx.org!.id).maybeSingle());
  return row?.kudos_off === true;
}

async function optedInIds(ctx: Ctx): Promise<Set<string>> {
  const rows = await fetchAll<{ member_id: string }>(() => ctx.db.from('company_coach_settings').select('member_id').eq('org_id', ctx.org!.id).eq('kudos_opt_in', true).order('member_id'));
  return new Set(rows.map((row) => row.member_id));
}

function needMember(ctx: Ctx): MemberRow {
  if (!ctx.member) throw new CompanyError('not_member', 'Only workspace members can do this.', 403);
  return ctx.member;
}

async function requireFeedOpen(ctx: Ctx, member: MemberRow): Promise<void> {
  if (await feedOff(ctx)) throw new CompanyError('kudos_off', 'Your company has switched the team feed off.', 403);
  const settings = await readSettings(ctx, member);
  if (!settings.kudos_opt_in) throw new CompanyError('kudos_opt_in_required', 'Join the team feed first.', 403);
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/coach/team', access: 'org',
    async handle(ctx) {
      requireOpenWorkspace(ctx);
      const off = await feedOff(ctx);
      const manage = isHr(ctx);
      const mine = ctx.member ? await readSettings(ctx, ctx.member) : null;
      const joined = Boolean(mine?.kudos_opt_in);
      const base = { enabled: !off, joined, can_manage: manage, consent: Boolean(ctx.member?.consent_at), messages: KUDOS_MESSAGES, daily_limit: KUDOS_DAILY };
      if (off || (!joined && !manage)) return { ...base, feed: [], people: [], sent_today: 0 };

      const optedIn = await optedInIds(ctx);
      const people = await inChunks([...optedIn], async (chunk) => check<PersonRow[]>(await ctx.db.from('company_members').select('id,full_name,user_id,status').eq('org_id', ctx.org!.id).in('id', chunk)));
      const shown = new Map(people.filter((person) => person.status === 'active' && person.user_id).map((person) => [person.id, person]));
      const rows = check<KudosRow[]>(await ctx.db.from('company_coach_kudos').select(KUDOS_COLUMNS).eq('org_id', ctx.org!.id).order('created_at', { ascending: false }).limit(FEED_SIZE));
      // Whoever leaves the feed leaves it completely: their entries, sent or received, stop showing.
      const feed = rows.filter((row) => shown.has(row.from_member) && (row.kind === 'badge' || (row.to_member && shown.has(row.to_member))));
      const me = ctx.member?.id ?? null;
      const day = today(ctx);
      return {
        ...base,
        sent_today: rows.filter((row) => row.from_member === me && row.kind === 'kudos' && row.day === day).length,
        people: [...shown.values()].filter((person) => person.id !== me).map((person) => ({ id: person.id, name: person.full_name })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
        feed: feed.map((row) => ({
          id: row.id, kind: row.kind, message: row.message, note: row.note, badge: row.badge, created_at: row.created_at,
          from: shown.get(row.from_member)?.full_name ?? null, to: row.to_member ? shown.get(row.to_member)?.full_name ?? null : null,
          mine: row.from_member === me, about_me: row.to_member === me, can_remove: manage || row.from_member === me || row.to_member === me,
        })),
      };
    },
  },
  {
    // Joining is a choice, never a default. Leaving always works, even in a paused workspace.
    method: 'PUT', path: 'orgs/:org/coach/team/membership', access: 'org', allowSuspended: true,
    async handle(ctx, _params, body) {
      const member = needMember(ctx);
      const joined = obj(body).joined;
      if (typeof joined !== 'boolean') throw new CompanyError('invalid_field', 'joined must be true or false.', 400, { field: 'joined' });
      if (joined) {
        requireOpenWorkspace(ctx);
        if (await feedOff(ctx)) throw new CompanyError('kudos_off', 'Your company has switched the team feed off.', 403);
      }
      await saveSettings(ctx, member, { kudos_opt_in: joined });
      return { joined };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/coach/team/kudos', access: 'org',
    async handle(ctx, _params, body) {
      requireOpenWorkspace(ctx);
      const member = needMember(ctx);
      await requireFeedOpen(ctx, member);
      const input = obj(body);
      const to = uuid(input.to, 'to');
      if (to === member.id) throw new CompanyError('kudos_self', 'Kudos go to a colleague.', 400);
      const message = oneOf(input.message, KUDOS_MESSAGES, 'message');
      const note = text(input.note, 'note', { max: 140, optional: true });
      const target = check<PersonRow | null>(await ctx.db.from('company_members').select('id,full_name,user_id,status').eq('id', to).eq('org_id', ctx.org!.id).maybeSingle());
      const open = target?.status === 'active' && target.user_id && (await optedInIds(ctx)).has(to);
      if (!open) throw new CompanyError('kudos_target', 'This colleague is not in the team feed.', 404);
      const day = today(ctx);
      const sent = check<{ id: string }[]>(await ctx.db.from('company_coach_kudos').select('id').eq('org_id', ctx.org!.id).eq('from_member', member.id).eq('kind', 'kudos').eq('day', day).limit(KUDOS_DAILY + 1));
      if (sent.length >= KUDOS_DAILY) throw new CompanyError('kudos_limit', `You can send ${KUDOS_DAILY} kudos a day.`, 429, { limit: KUDOS_DAILY });
      const inserted = await ctx.db.from('company_coach_kudos').insert({ org_id: ctx.org!.id, from_member: member.id, to_member: to, kind: 'kudos', message, note, day }).select('id').single();
      if (inserted.error?.code === '23505') throw new CompanyError('kudos_duplicate', 'You have already sent this colleague kudos today.', 409);
      check(inserted);
      return { ok: true };
    },
  },
  {
    // Sharing is the owner's own act, and needs their agreement to share progress at all.
    method: 'POST', path: 'orgs/:org/coach/team/share', access: 'org',
    async handle(ctx, _params, body) {
      requireOpenWorkspace(ctx);
      const member = needMember(ctx);
      await requireFeedOpen(ctx, member);
      if (!member.consent_at) throw new CompanyError('consent_required', 'Agree to share your progress first.', 403);
      const badge = oneOf<BadgeCode>(obj(body).badge, BADGE_CODES, 'badge');
      const settings = await readSettings(ctx, member);
      const scores = await thenAndNow(ctx, member);
      const facts = await badgeFacts(ctx, member, await practiceHistory(ctx, member), settings, scores.level_steps);
      if (!evaluateBadges(facts).find((entry) => entry.code === badge)?.earned) throw new CompanyError('badge_not_earned', 'This badge is not earned yet.', 409);
      const inserted = await ctx.db.from('company_coach_kudos').insert({ org_id: ctx.org!.id, from_member: member.id, kind: 'badge', badge, day: today(ctx) }).select('id').single();
      if (inserted.error?.code === '23505') throw new CompanyError('badge_already_shared', 'You have already shared this badge.', 409);
      check(inserted);
      return { ok: true };
    },
  },
  {
    // The sender, the person it is about and HR can each remove an entry, also while the workspace is paused.
    method: 'DELETE', path: 'orgs/:org/coach/team/kudos/:kudos', access: 'org', allowSuspended: true,
    async handle(ctx, params) {
      const id = uuid(params.kudos, 'kudos');
      const row = check<KudosRow | null>(await ctx.db.from('company_coach_kudos').select(KUDOS_COLUMNS).eq('id', id).eq('org_id', ctx.org!.id).maybeSingle());
      if (!row) throw new CompanyError('kudos_not_found', 'This entry is gone.', 404);
      const manage = isHr(ctx), me = ctx.member?.id;
      if (!manage && row.from_member !== me && row.to_member !== me) throw new CompanyError('forbidden', 'Your role cannot do this.', 403);
      check(await ctx.db.from('company_coach_kudos').delete().eq('id', id).eq('org_id', ctx.org!.id));
      if (manage && row.from_member !== me && row.to_member !== me) await ctx.audit('coach.kudos_removed', id);
      return { ok: true };
    },
  },
  {
    method: 'PUT', path: 'orgs/:org/coach/team/settings', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const off = obj(body).kudos_off;
      if (typeof off !== 'boolean') throw new CompanyError('invalid_field', 'kudos_off must be true or false.', 400, { field: 'kudos_off' });
      check(await ctx.db.from('company_coach_org').upsert({ org_id: ctx.org!.id, kudos_off: off, updated_by: ctx.user }, { onConflict: 'org_id' }));
      await ctx.audit('coach.feed_switched', ctx.org!.id, { kudos_off: off });
      return { kudos_off: off };
    },
  },
];
