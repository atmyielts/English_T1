import { SchoodAIError, type Locale, type NotifyPrefs, type RequestContext } from '../types.ts';
import { engage, type EngageBinding } from './binding.ts';
import { DAY_MS, DEFAULT_NOTIFY_HOUR, isAdult, localParts, weekStart } from './rules.ts';
import type { EngageProfile } from './types.ts';

// What every engage route starts from: the store, the person's engage profile, and
// their local day. Also the clock helpers that turn a local day into UTC bounds.

export interface Engage {
  ctx: RequestContext;
  b: EngageBinding;
  userId: string;
  profile: EngageProfile;
  /** The person's own notification preferences (core): time zone, preferred hour, delivery, mutes. */
  prefs: NotifyPrefs;
  now: Date;
  today: string;
  hour: number;
  week: string;
  adult: boolean;
  locale: Locale;
}

/** Offset of a time zone from UTC at a moment, in ms (Tashkent: +5 h). */
export function zoneOffset(at: Date, zone: string): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at).map((part) => [part.type, part.value]));
  const local = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return local - Math.floor(at.getTime() / 1000) * 1000;
}
/** The UTC moment a local day starts in a zone. */
export function dayStart(day: string, zone: string): Date {
  const guess = new Date(Date.parse(`${day}T00:00:00Z`));
  return new Date(guess.getTime() - zoneOffset(new Date(guess.getTime() + 12 * 3_600_000), zone));
}
export const dayEnd = (day: string, zone: string) => new Date(dayStart(day, zone).getTime() + DAY_MS);

/** The person's engage profile with the zone and preferred hour they chose in core's notification settings. */
async function profileWithPrefs(ctx: RequestContext, b: EngageBinding, userId: string) {
  const [profile, prefs] = await Promise.all([b.repo.profile(userId), ctx.notify.prefs(userId)]);
  return { profile: { ...profile, timeZone: prefs.timeZone, notifyHour: prefs.preferredHour ?? DEFAULT_NOTIFY_HOUR }, prefs };
}

/**
 * The same for a person a scheduled job acts on (core's system jobs have no signed-in
 * user). Their saved language applies. e.ctx is the system ctx: nothing that needs the
 * person's own session (ctx.user, ctx.ai, ctx.plan) can run, and engage never asks it to.
 */
export async function beginFor(ctx: RequestContext, userId: string): Promise<Engage> {
  const b = engage(ctx);
  const { profile, prefs } = await profileWithPrefs(ctx, b, userId);
  const now = ctx.now(), local = localParts(now, profile.timeZone);
  return { ctx, b, userId, profile, prefs, now, today: local.day, hour: local.hour, week: weekStart(now), adult: isAdult(profile, local.day), locale: profile.locale };
}

export async function begin(ctx: RequestContext, options: { locale?: boolean } = {}): Promise<Engage> {
  const b = engage(ctx);
  let { profile, prefs } = await profileWithPrefs(ctx, b, ctx.user.id);
  // Remember the person's language for messages sent later by the scheduled jobs.
  if ((options.locale ?? true) && ctx.user.via === 'jwt' && profile.locale !== ctx.locale) {
    profile = { ...await b.repo.saveProfile(ctx.user.id, { locale: ctx.locale }), timeZone: profile.timeZone, notifyHour: profile.notifyHour };
  }
  const now = ctx.now(), local = localParts(now, profile.timeZone);
  return { ctx, b, userId: ctx.user.id, profile, prefs, now, today: local.day, hour: local.hour, week: weekStart(now), adult: isAdult(profile, local.day), locale: ctx.user.via === 'jwt' ? ctx.locale : profile.locale };
}

/** The person's display name from their Schood profile (never an email). */
export async function nameOf(ctx: RequestContext, userId: string): Promise<string | null> {
  const profile = await ctx.repo.profile(userId);
  const name = profile?.name?.trim();
  return name && !name.includes('@') ? name : null;
}

export const refuse = (code: string, message: string, status = 400, details: Record<string, unknown> = {}): never => {
  throw new SchoodAIError(code, message, status, details);
};

/** Admin-only routes inside engage: Schood admins (the same check core uses for beta). */
export async function requireSchoodAdmin(ctx: RequestContext): Promise<void> {
  if (!(await ctx.isSchoodAdmin())) refuse('admin_required', 'Schood admins only.', 403);
}

/** Learner engagement needs a plan (or a centre seat); the Passport and opt-ins do not. */
export async function requireEngage(ctx: RequestContext, feature: string) {
  return await ctx.requireFeature(feature);
}

export async function sha256(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Short codes people can read aloud (squad invites); random and unbiased. */
export function shortCode(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => ALPHABET[byte % 32]).join('');
}
/** A link token: 32 random bytes, base64url. Only its hash is stored. */
export function linkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A stable shuffle (Fisher–Yates over a seeded generator), so a sitting's item order survives reloads. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) { state ^= seed.charCodeAt(i); state = Math.imul(state, 16777619) >>> 0; }
  const next = () => { state = (Math.imul(state ^ (state >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return state / 4294967296; };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
