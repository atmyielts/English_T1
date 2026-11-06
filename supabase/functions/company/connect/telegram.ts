// Telegram reminders. A notice goes out only when all of these hold: the function's
// switch, the workspace's switch, the person's own opt-in, a linked Telegram account,
// outside quiet hours and under the daily cap. Nothing is even read otherwise.
// Linking uses the platform's own tokens, so one link works across Schood.
import { fetchAll } from '../insights/common.ts';
import { check, CompanyError, type CompanyEnv, type Ctx, type Db, type OrgRow, type Route } from '../types.ts';
import { inChunks, int, obj, oneOf, text } from '../util.ts';
import { contractEnded } from '../handler.ts';
import { LOCALES, noticeText, type Locale } from './messages.ts';
import { connectConfig, DAY, inQuietHours, ownMember, readSettings, switches, tashkentHour, tashkentMidnight, type ConnectSettings } from './shared.ts';

export interface PrefsRow {
  member_id: string;
  org_id: string;
  telegram_opt_in: boolean;
  muted_kinds: string[];
  quiet_start: number | null;
  quiet_end: number | null;
  daily_cap: number | null;
  locale: Locale | null;
}
const PREFS_COLUMNS = 'member_id,org_id,telegram_opt_in,muted_kinds,quiet_start,quiet_end,daily_cap,locale';
const NO_PREFS = { telegram_opt_in: false, muted_kinds: [] as string[], quiet_start: null, quiet_end: null, daily_cap: null, locale: null };

/** What a person may mute. */
export const REMINDER_KINDS = ['assignment_due', 'test_todo', 'session_soon', 'candidate_finished', 'seat_on', 'seat_off', 'contract_ending', 'weekly_digest'] as const;
/** A notice older than this is stale news and is not sent. */
const STALE = 2 * DAY;
const MAX_PER_RUN = 200;

async function telegramLinked(db: Db, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const row = check<{ telegram_chat_id: string | null } | null>(await db.from('users').select('telegram_chat_id').eq('id', userId).maybeSingle());
  return Boolean(row?.telegram_chat_id);
}

/** Whether new reminders can start in this workspace right now. */
const workspaceOpen = (ctx: Ctx, settings: ConnectSettings) =>
  switches(ctx.env).telegram && settings.telegram_enabled && (ctx.org!.status === 'pilot' || ctx.org!.status === 'active') && !contractEnded(ctx.org!, ctx.now());

function hour(value: unknown, field: string): number | null {
  return int(value, field, { min: 0, max: 23, optional: true });
}

/** Maps the link functions' errors to messages for people; their own text never reaches a client. */
function linkError(message: string): CompanyError {
  if (message.includes('not_presented')) return new CompanyError('telegram_not_opened', 'Open the link in Telegram and press Start first.', 409);
  if (message.includes('expired')) return new CompanyError('telegram_expired', 'This link has expired. Make a new one.', 410);
  if (message.includes('telegram_chat_already_linked') || message.includes('schood_user_already_linked')) return new CompanyError('telegram_taken', 'This Telegram account or Schood account is already linked to another one.', 409);
  return new CompanyError('telegram_link_failed', 'Telegram could not be linked. Make a new link and try again.', 409);
}

export const telegramRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/connect/me', access: 'org', allowSuspended: true,
    async handle(ctx) {
      const member = ownMember(ctx);
      const settings = await readSettings(ctx.db, ctx.org!.id);
      const prefs = check<PrefsRow | null>(await ctx.db.from('company_connect_prefs').select(PREFS_COLUMNS).eq('member_id', member.id).maybeSingle());
      return {
        available: workspaceOpen(ctx, settings),
        function_on: switches(ctx.env).telegram,
        workspace_on: settings.telegram_enabled,
        workspace: { quiet_start: settings.quiet_start, quiet_end: settings.quiet_end, daily_cap: settings.daily_cap },
        prefs: prefs ?? { member_id: member.id, org_id: ctx.org!.id, ...NO_PREFS },
        linked: await telegramLinked(ctx.db, member.user_id),
        kinds: REMINDER_KINDS,
      };
    },
  },
  {
    // Turning reminders off must always work, so this runs in a paused workspace too; turning them on is checked below.
    method: 'PATCH', path: 'orgs/:org/connect/me', access: 'org', allowSuspended: true,
    async handle(ctx, _params, body) {
      const member = ownMember(ctx), input = obj(body);
      const patch: Record<string, unknown> = { member_id: member.id, org_id: ctx.org!.id };
      if ('telegram_opt_in' in input) {
        if (typeof input.telegram_opt_in !== 'boolean') throw new CompanyError('invalid_field', 'telegram_opt_in must be true or false.', 400, { field: 'telegram_opt_in' });
        if (input.telegram_opt_in) {
          if (!workspaceOpen(ctx, await readSettings(ctx.db, ctx.org!.id))) throw new CompanyError('telegram_off', 'Telegram reminders are not switched on for this workspace.', 409);
          if (!await telegramLinked(ctx.db, member.user_id)) throw new CompanyError('telegram_not_linked', 'Connect your Telegram first.', 409);
        }
        patch.telegram_opt_in = input.telegram_opt_in;
      }
      if ('muted_kinds' in input) {
        if (!Array.isArray(input.muted_kinds) || input.muted_kinds.some((kind) => !(REMINDER_KINDS as readonly unknown[]).includes(kind))) throw new CompanyError('invalid_field', 'muted_kinds has an unknown kind.', 400, { field: 'muted_kinds' });
        patch.muted_kinds = [...new Set(input.muted_kinds as string[])];
      }
      if ('quiet_start' in input) patch.quiet_start = hour(input.quiet_start, 'quiet_start');
      if ('quiet_end' in input) patch.quiet_end = hour(input.quiet_end, 'quiet_end');
      if ('daily_cap' in input) patch.daily_cap = int(input.daily_cap, 'daily_cap', { min: 1, max: 20, optional: true });
      if ('locale' in input) patch.locale = input.locale === null ? null : oneOf<Locale>(input.locale, LOCALES, 'locale');
      const saved = check<PrefsRow>(await ctx.db.from('company_connect_prefs').upsert(patch, { onConflict: 'member_id' }).select(PREFS_COLUMNS).single());
      if ('telegram_opt_in' in input) await ctx.audit(input.telegram_opt_in ? 'connect.telegram_opt_in' : 'connect.telegram_opt_out', member.id);
      return { prefs: saved };
    },
  },
  {
    // Makes the link the person opens in Telegram, with the platform's own token.
    method: 'POST', path: 'orgs/:org/connect/telegram/link', access: 'org',
    async handle(ctx) {
      const member = ownMember(ctx);
      if (!member.user_id) throw new CompanyError('not_member', 'Only members of this workspace have this.', 403);
      if (!workspaceOpen(ctx, await readSettings(ctx.db, ctx.org!.id))) throw new CompanyError('telegram_off', 'Telegram reminders are not switched on for this workspace.', 409);
      const bot = (connectConfig(ctx).telegramBot ?? '').replace(/^@/, '');
      if (!/^[A-Za-z0-9_]{3,64}$/.test(bot)) throw new CompanyError('telegram_off', 'Telegram reminders are not switched on for this workspace.', 409);
      const { data, error } = await ctx.db.rpc('issue_telegram_link_token', { p_user_id: member.user_id, p_telegram_user_id: null, p_acquisition_session_id: null });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        console.error(JSON.stringify({ company_telegram_link: 'failed', error: error?.message ?? 'no token' }));
        throw new CompanyError('telegram_link_failed', 'Telegram could not be linked. Make a new link and try again.', 409);
      }
      const issued = row as { token: string; expires_at: string };
      return { link_url: `https://t.me/${bot}?start=${issued.token}`, token: issued.token, expires_at: issued.expires_at };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/connect/telegram/confirm', access: 'org',
    async handle(ctx, _params, body) {
      const member = ownMember(ctx), input = obj(body);
      const value = text(input.token, 'token', { min: 32, max: 200 })!;
      if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new CompanyError('invalid_field', 'token is not valid.', 400, { field: 'token' });
      const { data, error } = await ctx.db.rpc('confirm_telegram_link_token', { p_token: value, p_user_id: member.user_id });
      if (error || !(Array.isArray(data) ? data[0] : data)) throw linkError(error?.message ?? '');
      await ctx.audit('connect.telegram_linked', member.id);
      return { linked: true };
    },
  },
];

/** A person's effective rule: their own stricter choice, within the workspace's. */
function ruleFor(settings: ConnectSettings, prefs: PrefsRow) {
  return {
    quietStart: prefs.quiet_start ?? settings.quiet_start,
    quietEnd: prefs.quiet_end ?? settings.quiet_end,
    cap: Math.min(prefs.daily_cap ?? settings.daily_cap, settings.daily_cap),
  };
}

export interface PushResult { sent: number; held: number; skipped: number; failed: number }

/**
 * Sends one workspace's waiting notices. Nothing happens unless the function's switch is
 * on and the workspace agreed. Claiming each row first means two runs cannot both send it.
 */
export async function pushOrg(db: Db, env: CompanyEnv, org: OrgRow, now: Date): Promise<PushResult> {
  const result: PushResult = { sent: 0, held: 0, skipped: 0, failed: 0 };
  const config = connectConfig({ env });
  if (!switches(env).telegram || !config.telegram) return result;
  if ((org.status !== 'pilot' && org.status !== 'active') || contractEnded(org, now)) return result;
  const settings = await readSettings(db, org.id);
  if (!settings.telegram_enabled) return result;

  const prefs = await fetchAll<PrefsRow>(() => db.from('company_connect_prefs').select(PREFS_COLUMNS).eq('org_id', org.id).eq('telegram_opt_in', true).order('member_id'));
  if (!prefs.length) return result;
  const members = await inChunks(prefs.map((entry) => entry.member_id), async (chunk) =>
    check<{ id: string; user_id: string | null; status: string }[]>(await db.from('company_members').select('id,user_id,status').eq('org_id', org.id).in('id', chunk)));
  const active = new Map(members.filter((entry) => entry.status === 'active' && entry.user_id).map((entry) => [entry.id, entry.user_id!]));
  const users = await inChunks([...active.values()], async (chunk) =>
    check<{ id: string; telegram_chat_id: string | null }[]>(await db.from('users').select('id,telegram_chat_id').in('id', chunk)));
  const linked = new Set(users.filter((entry) => entry.telegram_chat_id).map((entry) => entry.id));

  const hourNow = tashkentHour(now), midnight = tashkentMidnight(now).toISOString();
  const waitingSince = new Date(now.getTime() - STALE).toISOString();
  const defaultLocale: Locale = LOCALES.includes(org.settings?.locale as Locale) ? org.settings.locale as Locale : 'ru';
  const orgRowLink = (link: string | null) => link ? `${env.appUrl}${link}` : null;

  for (const entry of prefs) {
    const userId = active.get(entry.member_id);
    if (!userId || !linked.has(userId)) continue;
    const rule = ruleFor(settings, entry);
    if (inQuietHours(hourNow, rule.quietStart, rule.quietEnd) || inQuietHours(hourNow, settings.quiet_start, settings.quiet_end)) { result.held++; continue; }
    const sentToday = check<{ id: string }[]>(await db.from('company_notices').select('id').eq('member_id', entry.member_id).eq('push_state', 'sent').gte('pushed_at', midnight).limit(50)).length;
    let room = rule.cap - sentToday;
    const waiting = check<{ id: string; kind: string; params: Record<string, unknown>; link: string | null; created_at: string }[]>(await db.from('company_notices').select('id,kind,params,link,created_at')
      .eq('member_id', entry.member_id).is('push_state', null).gte('created_at', waitingSince).order('created_at', { ascending: true }).limit(20));
    for (const notice of waiting) {
      if (result.sent >= MAX_PER_RUN) return result;
      if (entry.muted_kinds?.includes(notice.kind)) {
        check(await db.from('company_notices').update({ push_state: 'skipped', push_reason: 'muted' }).eq('id', notice.id).is('push_state', null));
        result.skipped++;
        continue;
      }
      if (room <= 0) { result.held++; break; }
      const claimed = check<boolean>(await db.rpc('company_claim_push_notice', {
        p_org: org.id, p_member: entry.member_id, p_notice: notice.id, p_limit: rule.cap, p_at: now.toISOString(),
      }));
      if (!claimed) { result.held++; continue; }
      const outcome = await config.telegram({
        user_id: userId, key: `company:${notice.id}`, cta_url: orgRowLink(notice.link),
        text: noticeText(entry.locale ?? defaultLocale, notice.kind, notice.params ?? {}, orgRowLink(notice.link)),
      }).catch(() => ({ ok: false, retry: true, reason: 'network' }));
      if (outcome.ok) {
        check(await db.from('company_notices').update({ push_state: 'sent', pushed_at: now.toISOString(), push_reason: null }).eq('id', notice.id));
        result.sent++;
        room--;
      } else if (outcome.retry) {
        check(await db.from('company_notices').update({ push_state: null, push_reason: String(outcome.reason ?? 'retry').slice(0, 60) }).eq('id', notice.id));
        result.held++;
      } else {
        check(await db.from('company_notices').update({ push_state: 'failed', push_reason: String(outcome.reason ?? 'failed').slice(0, 60) }).eq('id', notice.id));
        result.failed++;
      }
    }
  }
  return result;
}
