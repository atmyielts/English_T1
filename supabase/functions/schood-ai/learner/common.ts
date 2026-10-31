import { SchemaError, type Schema } from '../../../../packages/ai-core/src/mod.ts';
import { buildSystemPrompt, dataBlock, neutralise, wrapUserMessage } from '../prompt.ts';
import type { ResolvedSpecialist } from '../specialists.ts';
import { SchoodAIError, type ChargedAI, type ContextBlock, type LearningEventInput, type Locale, type RequestContext, type WorkspaceAccess } from '../types.ts';
import { learnerStore, type ConsentRow, type LearnerStore, type RecordRow } from './store.ts';

// Shared pieces of the learner area: the store for this request, the under-18
// consent gate, activity tracking (with verified learning events), prompts that
// keep the core prompt rules, quote checks against the learner's own words and
// the catalogue of real Schood practice links that plans may point to.

export const store = (ctx: RequestContext): LearnerStore => ctx.store(learnerStore);

// --- Under-18 consent -------------------------------------------------------------------
/** Bumped when the owner changes the consent text; people then confirm again. */
export const CONSENT_VERSION = '2026-10-30-draft';
export type ConsentState = 'ok' | 'required' | 'guardian_required' | 'parent_link_required';

/** adult: ok. 13–17: a guardian's agreement (confirmed by the learner or a linked parent). Under 13: only a linked parent. */
export function consentState(row: ConsentRow | null): ConsentState {
  if (!row || row.withdrawnAt || row.textVersion !== CONSENT_VERSION) return 'required';
  if (row.ageBand === 'adult') return 'ok';
  if (row.ageBand === '13_17') return row.guardianConfirmed ? 'ok' : 'guardian_required';
  return row.guardianUserId && row.guardianConfirmed ? 'ok' : 'parent_link_required';
}
export async function requireConsent(ctx: RequestContext): Promise<void> {
  const state = consentState(await store(ctx).consent(ctx.user.id));
  if (state !== 'ok') throw new SchoodAIError('consent_required', 'Confirm your age before using the assistant.', 403, { state });
}
/**
 * The consent step as a chat guard (core runs it before every core/chat turn,
 * after the plan check, on the web and the Telegram path). It applies where a
 * learner may be chatting: personal workspaces (except teacher and family plans,
 * whose holders are adults by product) and centre students. Centre staff and
 * parents are not asked.
 */
export async function consentGuard(ctx: RequestContext, input: { access: WorkspaceAccess }): Promise<void> {
  if (ctx.caller !== 'user' && ctx.caller !== 'service') return;
  const { workspace, role } = input.access;
  if (workspace.kind === 'centre') { if (role === 'student') await requireConsent(ctx); return; }
  const plans = (await ctx.planFor(workspace.id)).plans;
  if (plans.some((plan) => plan === 'teacher' || plan === 'teacher_pro' || plan === 'family')) return;
  await requireConsent(ctx);
}
/** The same step for every core/chat turn with any specialist (the tutor checks it in its own guard). */
export async function chatConsentGuard(ctx: RequestContext, input: { specialist: string; access: WorkspaceAccess }): Promise<void> {
  if (input.specialist === 'tutor') return;
  await consentGuard(ctx, input);
}
/** For core's adults-only prices: the age band from the consent step. */
export async function ageFromConsent(ctx: RequestContext, userId: string): Promise<'adult' | 'minor' | null> {
  const row = await store(ctx).consent(userId);
  if (!row || row.withdrawnAt) return null;
  return row.ageBand === 'adult' ? 'adult' : 'minor';
}

/** The plan (and role) first, so free users see the plans; then the consent step. */
export async function requireLearner(ctx: RequestContext, featureOrKey: string): Promise<WorkspaceAccess> {
  const access = await ctx.requireFeature(featureOrKey);
  await requireConsent(ctx);
  return access;
}

// --- Activity and learning events -----------------------------------------------------------
export interface TrackInput {
  feature: string;
  kind: string;
  score?: number | null;
  minutes?: number;
  summary?: Record<string, unknown>;
  /** Emitted only for a real learning act; verified kinds may carry minutes. */
  event?: Omit<LearningEventInput, 'area' | 'feature'> & { feature?: string };
}
export function track(ctx: RequestContext, access: WorkspaceAccess, input: TrackInput): void {
  const summary = clipSummary(input.summary ?? {});
  ctx.after(() => store(ctx).addActivity([{ userId: ctx.user.id, workspaceId: access.workspace.id, feature: input.feature, kind: input.kind, score: input.score ?? null, minutes: Math.max(0, Math.min(240, Math.round(input.minutes ?? 0))), summary }]));
  if (input.event) ctx.events.emit({ area: 'learner', ...input.event, feature: input.event.feature ?? input.feature });
}
/** Summaries stay small: short strings, short lists. */
export function clipSummary(value: Record<string, unknown>): Record<string, unknown> {
  const clip = (entry: unknown, depth: number): unknown => {
    if (typeof entry === 'string') return entry.slice(0, 240);
    if (typeof entry === 'number' || typeof entry === 'boolean' || entry === null) return entry;
    if (Array.isArray(entry)) return depth > 2 ? [] : entry.slice(0, 6).map((item) => clip(item, depth + 1));
    if (entry && typeof entry === 'object') return depth > 2 ? {} : Object.fromEntries(Object.entries(entry).slice(0, 12).map(([key, item]) => [key.slice(0, 40), clip(item, depth + 1)]));
    return null;
  };
  let out = clip(value, 0) as Record<string, unknown>;
  while (JSON.stringify(out).length > 3500) out = Object.fromEntries(Object.entries(out).slice(0, Math.max(1, Object.keys(out).length - 1)));
  return out;
}

// --- Prompts ---------------------------------------------------------------------------------------
export const LANGUAGE: Record<Locale, string> = { en: 'English', uz: 'Uzbek (Latin script)', ru: 'Russian' };
const same = (value: string): Record<Locale, string> => ({ en: value, uz: value, ru: value });

/** The core system prompt (rules first) for a learner tool, with the tool's own role text. */
/**
 * Who a piece of work is for and who pays: the signed-in person (ctx.ai), or, in a
 * scheduled job, a named person whose workspace pays (ctx.paidBy).
 */
export interface Actor { userId: string; locale: Locale; access: WorkspaceAccess; ai: ChargedAI }
export const userActor = (ctx: RequestContext, access: WorkspaceAccess): Actor => ({ userId: ctx.user.id, locale: ctx.locale, access, ai: ctx.ai });

export function systemFor(ctx: RequestContext, access: WorkspaceAccess, role: { name: string; instructions: string[] }, blocks: ContextBlock[] = [], locale: Locale = ctx.locale): string {
  const specialist: ResolvedSpecialist = {
    key: 'learner_tool', name: same(role.name), description: same(''), instructions: [
      ...role.instructions,
      `Write every explanation, comment and tip in ${LANGUAGE[locale]}, even when the learner's own text is in English. Quote the learner's words exactly as they wrote them.`,
    ].join(' '),
    workspaceInstructions: null, contextKinds: [], creditKey: 'assistant.reply', roles: [], custom: false, suggestions: { en: [], uz: [], ru: [] },
  };
  return buildSystemPrompt({ specialist, workspace: access.workspace, locale, blocks });
}
export { dataBlock, neutralise, wrapUserMessage };

/** A request body as one tagged block: what the learner typed is data, never instructions. */
export function learnerInput(fields: Record<string, unknown>): string {
  return wrapUserMessage(JSON.stringify(fields, null, 1));
}

// --- The learner's own words ----------------------------------------------------------------------
export const normalise = (value: string): string =>
  value.toLowerCase().replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"').replace(/[^\p{L}\p{N}'\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
/** True when `quote` really appears in `text` (case, punctuation and spacing ignored). */
export function quoted(quote: string, text: string): boolean {
  const q = normalise(quote);
  return q.length >= 2 && normalise(text).includes(q);
}
export const countWords = (text: string): number => (text.match(/[\p{L}\p{N}’']+/gu) ?? []).length;

// --- Small helpers ----------------------------------------------------------------------------------
export const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Cefr = (typeof CEFR)[number];
export const isCefr = (value: unknown): value is Cefr => typeof value === 'string' && (CEFR as readonly string[]).includes(value);
export const today = (now: Date, timeZone = 'Asia/Tashkent'): string => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const daysBetween = (from: Date, to: string): number => Math.ceil((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${today(from)}T00:00:00Z`)) / 86_400_000);

/** A record that belongs to the caller in this workspace, or not_found. */
export async function ownRecord(ctx: RequestContext, access: WorkspaceAccess, id: string, kind: RecordRow['kind']): Promise<RecordRow> {
  const row = await store(ctx).record(id);
  if (!row || row.userId !== ctx.user.id || row.workspaceId !== access.workspace.id || row.kind !== kind) throw new SchoodAIError('not_found', 'Not found.', 404);
  return row;
}
/** Saves a record patch with its optimistic lock; a lost race is a conflict the app can retry. */
export async function saveRecord(ctx: RequestContext, row: RecordRow, patch: Parameters<LearnerStore['updateRecord']>[2]): Promise<RecordRow> {
  const saved = await store(ctx).updateRecord(row.id, row.version, patch);
  if (!saved) throw new SchoodAIError('conflict', 'This was changed in another tab. Reload and try again.', 409);
  return saved;
}
export const receipt = (out: { credits: number; balance: { total: number } }) => ({ credits: out.credits, balance: out.balance.total });

/**
 * A JSON object whose shape a shared parser checks afterwards (the English
 * speaking and role-play parsers, which also verify quotes). `json` still tells
 * the model the shape.
 */
export const looseObject = (json: Record<string, unknown>): Schema<Record<string, unknown>> => ({
  parse(value, path = '') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SchemaError(path, 'expected an object');
    return value as Record<string, unknown>;
  },
  json: { type: 'object', ...json },
});

// --- Audio from the browser ----------------------------------------------------------------------
const AUDIO_MIME = /^audio\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|aac|m4a|x-m4a)(;.*)?$/i;
/** A recording sent as base64 in JSON: at most 3 MB of audio. */
export function audioFrom(body: Record<string, unknown>): { audio: Uint8Array; mime: string } | null {
  if (body.audio === undefined || body.audio === null) return null;
  if (typeof body.audio !== 'string' || body.audio.length < 200 || body.audio.length > 4_200_000) throw new SchoodAIError('invalid_request', 'The recording must be up to 3 MB.', 400, { field: 'audio' });
  const mime = typeof body.mime === 'string' && AUDIO_MIME.test(body.mime) ? body.mime.split(';')[0].toLowerCase() : null;
  if (!mime) throw new SchoodAIError('invalid_request', 'Unsupported recording type.', 400, { field: 'mime' });
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(body.audio.replace(/^data:[^,]*,/, '')), (char) => char.charCodeAt(0)); } catch { throw new SchoodAIError('invalid_request', 'The recording could not be read.', 400, { field: 'audio' }); }
  return { audio: bytes, mime };
}
export function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

// --- Images from the browser ----------------------------------------------------------------------
/** A photo as a data: URL (JPEG, PNG or WebP), at most about 3 MB. */
export function imageFrom(value: unknown, field = 'image'): string {
  if (typeof value !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) || value.length > 4_200_000 || value.length < 200) {
    throw new SchoodAIError('invalid_request', 'The photo must be a JPEG, PNG or WebP of up to 3 MB.', 400, { field });
  }
  return value;
}

// --- Real Schood practice links -----------------------------------------------------------------------
// Plans, gap reports and briefs may only point here: the model picks ids, never URLs.
export interface PracticeLink { id: string; exam: 'ielts' | 'sat' | 'toefl' | 'multilevel' | 'english' | 'itep' | 'ai'; skill: string; url: string; label: string }
export const PRACTICE_LINKS: readonly PracticeLink[] = [
  { id: 'ielts.today', exam: 'ielts', skill: 'any', url: 'https://practice.ielts.schood.online/today?source=schood_ai', label: 'IELTS Practice: today\'s set' },
  ...(['reading', 'listening', 'writing', 'speaking'] as const).map((skill) => ({ id: `ielts.${skill}`, exam: 'ielts' as const, skill, url: `https://practice.ielts.schood.online/today?source=schood_ai&weak_skill=${skill}`, label: `IELTS Practice: ${skill}` })),
  { id: 'ielts.writing_prep', exam: 'ielts', skill: 'writing', url: 'https://practice.ielts.schood.online/writing-prep', label: 'IELTS Practice: writing preparation' },
  { id: 'ielts.reviews', exam: 'ielts', skill: 'any', url: 'https://practice.ielts.schood.online/practice/reviews', label: 'IELTS Practice: review missed questions' },
  { id: 'ielts.mock', exam: 'ielts', skill: 'any', url: 'https://ielts.schood.online/full-exam', label: 'IELTS Simulator: full mock' },
  { id: 'ielts.section', exam: 'ielts', skill: 'any', url: 'https://ielts.schood.online/practice', label: 'IELTS Simulator: one section' },
  { id: 'sat.today', exam: 'sat', skill: 'any', url: 'https://practice.sat.schood.online/today', label: 'SAT Practice: today\'s set' },
  { id: 'sat.missed', exam: 'sat', skill: 'any', url: 'https://practice.sat.schood.online/bank?status=missed', label: 'SAT Practice: questions you missed' },
  { id: 'sat.modules', exam: 'sat', skill: 'any', url: 'https://practice.sat.schood.online/modules', label: 'SAT Practice: modules' },
  { id: 'sat.notebook', exam: 'sat', skill: 'any', url: 'https://practice.sat.schood.online/notebook', label: 'SAT Practice: mistake notebook' },
  { id: 'sat.mock', exam: 'sat', skill: 'any', url: 'https://sat.schood.online/full-exam', label: 'SAT Simulator: full mock' },
  { id: 'toefl.mock', exam: 'toefl', skill: 'any', url: 'https://toefl.schood.online/full-exam', label: 'TOEFL Simulator: full test' },
  ...([['complete_the_words', 'reading'], ['read_daily_life', 'reading'], ['build_sentence', 'writing'], ['write_email', 'writing'], ['write_academic_discussion', 'writing'], ['listen_repeat', 'speaking'], ['take_interview', 'speaking']] as const)
    .map(([task, skill]) => ({ id: `toefl.${task}`, exam: 'toefl' as const, skill, url: `https://toefl.schood.online/practice?task=${task}`, label: `TOEFL Simulator: ${task.replace(/_/g, ' ')}` })),
  { id: 'toefl.playbook', exam: 'toefl', skill: 'any', url: 'https://playbook.toefl.schood.online/dashboard', label: 'TOEFL Playbook' },
  { id: 'multilevel.mock', exam: 'multilevel', skill: 'any', url: 'https://english.schood.online/exam', label: 'Multilevel: mock test' },
  { id: 'english.today', exam: 'english', skill: 'any', url: 'https://english.schood.online/today', label: 'Schood English: today' },
  ...(['reading', 'listening', 'writing', 'speaking', 'grammar', 'vocabulary'] as const).map((skill) => ({ id: `english.${skill}`, exam: 'english' as const, skill, url: `https://english.schood.online/${skill}`, label: `Schood English: ${skill}` })),
  { id: 'english.review', exam: 'english', skill: 'any', url: 'https://english.schood.online/review', label: 'Schood English: review' },
  { id: 'english.speaking_mock', exam: 'english', skill: 'speaking', url: 'https://english.schood.online/speaking-mock', label: 'Schood English: IELTS speaking mock' },
  { id: 'itep.practice', exam: 'itep', skill: 'any', url: 'https://itep.schood.online/practice', label: 'iTEP Simulator: practice' },
  { id: 'ai.write', exam: 'ai', skill: 'writing', url: 'https://ai.schood.online/write', label: 'Schood AI: writing coach' },
  { id: 'ai.speak', exam: 'ai', skill: 'speaking', url: 'https://ai.schood.online/speak', label: 'Schood AI: speaking partner' },
  { id: 'ai.pronounce', exam: 'ai', skill: 'speaking', url: 'https://ai.schood.online/pronounce', label: 'Schood AI: pronunciation' },
  { id: 'ai.reading', exam: 'ai', skill: 'reading', url: 'https://ai.schood.online/reading', label: 'Schood AI: graded reading' },
  { id: 'ai.words', exam: 'ai', skill: 'vocabulary', url: 'https://ai.schood.online/words', label: 'Schood AI: words from your texts' },
];
const LINKS_BY_ID = new Map(PRACTICE_LINKS.map((link) => [link.id, link]));
export const practiceLink = (id: unknown): PracticeLink | null => (typeof id === 'string' ? LINKS_BY_ID.get(id) ?? null : null);
/** The links that fit an exam (and the general English and Schood AI ones). */
export const linksFor = (exam: string): PracticeLink[] => PRACTICE_LINKS.filter((link) => link.exam === exam || link.exam === 'ai' || (exam !== 'english' && link.exam === 'english' && link.skill !== 'any'));
