import { scheduleProblems, type JobSchedule } from './schedule.ts';
import type { StoreHandle } from './stores.ts';
import type { Area, GenerationRow, Locale, RequestContext, WorkspaceAccess } from './types.ts';

// Small registries areas add to: what happens when a generation job is approved
// (the teacher area saves the material's library page), the kinds of notification
// a person can mute in Settings, scheduled jobs, and a workspace's own model keys.

// --- Generation approval -------------------------------------------------------------
/**
 * Runs after `core/generations` approves a job of this feature (the job is already
 * `approved`). Return a small JSON result for the screen (`{ page_id }`). If it
 * throws, the job goes back to `ready` and the error is the response.
 */
export type GenerationApproval = (ctx: RequestContext, input: { generation: GenerationRow; access: WorkspaceAccess }) => Promise<Record<string, unknown> | void>;
const approvals = new Map<string, GenerationApproval>();

/** One hook per generation feature (the job's credit key, for example `material.generate`). Register at module load. */
export function registerGenerationApproval(feature: string, approval: GenerationApproval): void {
  if (!/^[a-z][a-z0-9_]{1,30}\.[a-z][a-z0-9_]{1,30}$/.test(feature)) throw new Error(`generation feature ${feature} is invalid`);
  if (approvals.has(feature)) throw new Error(`generation approval for ${feature} is already registered`);
  approvals.set(feature, approval);
}
export const generationApproval = (feature: string) => approvals.get(feature) ?? null;

// --- Notification kinds ---------------------------------------------------------------
const kinds = new Map<string, { area: Area; label: Record<Locale, string> }>();
const KIND = /^[a-z][a-z0-9_]{1,30}(\.[a-z][a-z0-9_.-]{1,40})?$/;

/**
 * A kind of message your area sends through ctx.notify (the channel you pass, for
 * example `engage.winback` or `coach.ielts`). Settings lists every registered kind
 * so people can mute it; muting the area prefix (`engage`) mutes all of its kinds.
 */
export function registerNotifyKind(key: string, definition: { area: Area; label: Record<Locale, string> }): void {
  if (!KIND.test(key)) throw new Error(`notification kind ${key} is invalid`);
  if (kinds.has(key)) throw new Error(`notification kind ${key} is already registered`);
  if ((['en', 'uz', 'ru'] as const).some((locale) => !definition.label[locale]?.trim() || definition.label[locale].length > 80)) throw new Error(`notification kind ${key}: label needs uz, ru and en`);
  kinds.set(key, definition);
}
export const notifyKinds = (locale: Locale) => [...kinds].map(([key, entry]) => ({ key, area: entry.area, label: entry.label[locale] })).sort((a, b) => a.key.localeCompare(b.key));

// --- Scheduled jobs --------------------------------------------------------------------
export interface SystemJob {
  area: Area;
  /** Every N minutes (5 to 1440), daily at a local time, or weekly on a local weekday (0 is Sunday). Default zone Asia/Tashkent. */
  schedule: JobSchedule;
  /**
   * The work, with a system ctx (no user: see CONTRACT.md). Keep it bounded and idempotent; a thrown
   * error is logged and the job is retried on the next tick, at most three times in a period.
   */
  run(ctx: RequestContext): Promise<unknown>;
  /** At most this long (default 60 s, at most 120 s); then it counts as failed and is retried. */
  timeoutMs?: number;
}
const jobs = new Map<string, SystemJob>();

/** Work core's scheduler runs for you (pg_cron calls core/system-tick every five minutes). Names `<area>.<job>`; register at module load. */
export function registerSystemJob(name: string, job: SystemJob): void {
  if (!/^[a-z][a-z0-9_]{1,30}\.[a-z][a-z0-9_.-]{1,40}$/.test(name)) throw new Error(`system job ${name} is invalid`);
  if (jobs.has(name)) throw new Error(`system job ${name} is already registered`);
  const problems = scheduleProblems(job.schedule);
  if (problems.length) throw new Error(`system job ${name}: ${problems.join(', ')}`);
  if (job.timeoutMs !== undefined && !(job.timeoutMs >= 1_000 && job.timeoutMs <= 120_000)) throw new Error(`system job ${name}: timeoutMs is 1000 to 120000`);
  jobs.set(name, job);
}
export const systemJobs = () => [...jobs].sort(([a], [b]) => a.localeCompare(b));

// --- A workspace's own model keys (C15) --------------------------------------------------
/**
 * The workspace's own key for a provider, unsealed (Supabase Vault), or null. Never log it.
 * label: `[a-z0-9_-]`, up to 41 characters, shown in ai_calls as `byok:<label>`.
 * feeCredits: the platform fee per call, 0 to 1000 (0 or left out when the contract bills it).
 */
export type OwnKeyResolver = (input: { workspaceId: string; providerKey: string; store<T>(handle: StoreHandle<T>): T }) => Promise<{ label: string; apiKey: string; feeCredits?: number } | null>;
/**
 * Whether the workspace has any own key set up, without unsealing one. Core asks it only when the
 * workspace's plan does not grant C15: a workspace with keys but no C15 is refused (`plan_required`)
 * rather than moved to Schood's keys and credits without being told.
 */
export type OwnKeysConfigured = (input: { workspaceId: string; store<T>(handle: StoreHandle<T>): T }) => Promise<boolean>;
let ownKeys: OwnKeyResolver | null = null;
let ownKeysConfigured: OwnKeysConfigured | null = null;

/**
 * The centre area's hook for "bring your own key": when a workspace has an enabled key for
 * a provider on the route, the gateway calls only those models with it (never Schood's keys),
 * logs the provider as `byok:<label>` with no USD cost, and charges the fee instead of the
 * credit price. Plans, roles, switches and call caps still apply. One resolver; register at module load.
 */
export function registerOwnKeyResolver(resolver: OwnKeyResolver, options: { configured?: OwnKeysConfigured } = {}): void {
  if (ownKeys) throw new Error('an own-key resolver is already registered');
  ownKeys = resolver;
  ownKeysConfigured = options.configured ?? null;
}
export const ownKeyResolver = () => ownKeys;
/** The registered `configured` check, or null. */
export const ownKeyConfigured = () => ownKeysConfigured;
