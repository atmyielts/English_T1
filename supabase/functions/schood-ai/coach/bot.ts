import { nextTashkentMidnight } from '../../../../packages/ai-core/src/mod.ts';
import {
  escapeHtml, levelLabel, nodeLevel, pick, plain, say,
  type CoachPack, type CopyKey, type Locale, type MasteryState, type OutButton, type OutMessage, type PlanTask, type UpdateRequest,
} from '../../../../packages/coach-packs/src/mod.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import type { CoachRuntime } from './runtime.ts';
import type { Enrollment, EnrollmentPatch } from './store.ts';
import { DEFAULT_TZ, localParts } from './time.ts';

// The context of one Telegram update: who, which coach, the conversation state,
// and the messages going back. Flows read and change `state`; `save()` writes it
// with the enrolment's revision so two updates never silently overwrite each other.

export interface SpeakItem { part: string; label: string; question: string; ref: string; kind: 'question' | 'cue'; card?: string }
export interface InlineItem { id: string; prompt: string; options?: string[]; answer: number | string[]; explanation: string }

export type FlowState =
  | { flow: 'idle' }
  | { flow: 'onboard'; step: 'target' | 'date' | 'minutes' | 'reminder'; draft: { target?: number; examDate?: string | null; minutes?: number } }
  | { flow: 'speaking'; sessionId: string; activityId: string; mock: boolean; queue: SpeakItem[]; index: number; askedAt: string; awaiting: 'answer' | 'after'; lastTurnId: string | null }
  | { flow: 'roleplay'; sessionId: string; activityId: string; turns: number; hidden: Record<string, number | string | boolean>; goalsMet: string[]; scriptId?: string }
  | { flow: 'writing'; sessionId: string; activityId: string; awaiting: 'answer' | 'confirm' | 'after'; pendingTurnId: string | null; previousSessionId: string | null }
  /**
   * `items`: the questions of a drawn set, a mini-mock or the mistake notebook, as
   * `<set id>#<question id>`; without it, the whole set in order. `limit`: seconds, when
   * not the set's own.
   */
  | { flow: 'quiz'; sessionId: string; activityId: string; index: number; answers: (number | string | null)[]; startedAt: string; items?: string[]; kind?: 'mock' | 'mistakes'; limit?: number }
  /** The script builder (B4): the answers so far. */
  | { flow: 'script'; step: number; answers: string[] }
  | { flow: 'deck'; sessionId: string; queue: string[]; index: number; correct: number; fresh: number }
  | { flow: 'drill'; sessionId: string; activityId: string; items: InlineItem[]; index: number; correct: number; tag: string }
  | { flow: 'shadow'; sessionId: string; activityId: string; sentences: string[]; index: number; scores: number[] }
  | { flow: 'settings'; step: 'reminder' };

export interface CoachState {
  current: FlowState;
  /** Choices offered in the last message (activity ids, part ids), picked with `o:<i>`. */
  options?: string[];
  /** Today's plan as shown, started with `t:<i>`. */
  plan?: { day: string; tasks: PlanTask[] };
  /** Recently used cue cards, topics and drill items, so practice does not repeat. */
  recent?: { cards?: string[]; topics?: string[]; items?: string[] };
  /** The plan task being worked on, to tick it off. */
  task?: number | null;
}

const LANGUAGE_NAMES: Record<Locale, string> = { uz: 'O‘zbek', ru: 'Русский', en: 'English' };

export class Bot {
  messages: OutMessage[] = [];
  toast: string | undefined;
  clearButtons = false;
  state: CoachState;
  private patch: EnrollmentPatch = {};

  constructor(public ctx: RequestContext, public runtime: CoachRuntime, public pack: CoachPack, public enrollment: Enrollment, public request: UpdateRequest | null) {
    const raw = enrollment.state as Partial<CoachState>;
    this.state = { current: raw.current ?? { flow: 'idle' }, options: raw.options, plan: raw.plan, recent: raw.recent ?? {}, task: raw.task ?? null };
  }

  /** The interface language: the person's, or the coach's first when it does not speak theirs (B3: uz, ru). */
  get locale(): Locale {
    const chosen = this.patch.locale ?? this.enrollment.locale, languages = this.pack.manifest.uiLanguages;
    return languages.includes(chosen) ? chosen : languages[0] ?? chosen;
  }
  get store() { return this.runtime.store; }
  get feature() { return this.pack.manifest.feature; }
  get tz() { return this.enrollment.settings.timeZone ?? DEFAULT_TZ; }
  get coachName() { return pick(this.pack.manifest.name, this.locale); }
  local() { return localParts(this.ctx.now(), this.tz); }

  t(key: CopyKey, values: Record<string, string | number> = {}, raw: Record<string, string> = {}) { return say(this.locale, key, values, raw); }
  p(key: CopyKey, values: Record<string, string | number> = {}) { return plain(this.locale, key, values); }

  text(html: string, buttons?: OutButton[][]) { this.messages.push({ kind: 'text', html, ...(buttons?.length ? { buttons } : {}) }); }
  push(message: OutMessage) { this.messages.push(message); }
  set(current: FlowState) { this.state.current = current; }
  update(patch: EnrollmentPatch) {
    Object.assign(this.patch, patch);
    Object.assign(this.enrollment, patch);
  }

  /** The standard ways on: today and the menu. */
  nav(extra: OutButton[] = []): OutButton[][] {
    return [...(extra.length ? [extra] : []), [{ text: this.p('btn.today'), data: 'm:today' }, { text: this.p('btn.menu'), data: 'm:menu' }]];
  }
  menuButtons(): OutButton[][] {
    const items = this.pack.manifest.menu.map((item) => ({ text: `${item.emoji ? `${item.emoji} ` : ''}${pick(item.label, this.locale)}`, data: `m:${item.action}` }));
    const rows: OutButton[][] = [];
    for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
    rows.push([{ text: this.p('btn.open_app'), app: `/coach/${this.pack.manifest.id}` }]);
    return rows;
  }
  menu(lead?: string) { this.text(lead ?? this.t('menu.title'), this.menuButtons()); }
  app(text: string, path = '') { return { text, app: `/coach/${this.pack.manifest.id}${path}` }; }
  /**
   * The charge reference of this update: unique per Telegram update (a redelivered
   * update is dropped before it gets here), so a retry after a failure is a new charge.
   */
  reference(kind: string) { return `${kind}:${this.pack.manifest.id}:${this.request?.updateId ?? this.ctx.requestId}`.slice(0, 200); }

  /** Whether this person may use the coach (a plan, a pass, a seat or beta). */
  async allowed(): Promise<boolean> { return (await this.ctx.access(this.feature)).allowed; }
  paywall() {
    this.text(this.t('paywall', { coach: this.coachName }), [
      [{ text: this.p('paywall.plans'), url: `${this.runtime.config.appUrl}/plans` }],
      [{ text: this.p('paywall.samples'), data: 'm:samples' }, { text: this.p('paywall.test'), data: 'm:test' }],
    ]);
  }
  /** Runs `work` only with access; otherwise shows the paywall. */
  async gated(work: () => Promise<void>): Promise<void> {
    if (!(await this.allowed())) { this.paywall(); return; }
    await work();
  }

  /** A refusal from the AI gateway as a clear message; the state stays so the person can retry. */
  aiError(cause: unknown, voice = false): void {
    if (!(cause instanceof SchoodAIError)) throw cause;
    const d = cause.details as Record<string, unknown>;
    switch (cause.code) {
      case 'plan_required': this.paywall(); return;
      case 'ai_unavailable': this.text(this.t(voice ? 'error.voice_unavailable' : 'error.ai_unavailable')); return;
      case 'ai_disabled': this.text(this.t('error.ai_disabled')); return;
      case 'capped': {
        const when = typeof d.retry_after === 'string' ? new Date(d.retry_after) : nextTashkentMidnight(this.ctx.now());
        const local = localParts(when, this.tz);
        this.text(this.t('error.capped', { time: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}` }));
        return;
      }
      case 'insufficient_credits': this.text(this.t('error.insufficient_credits', { cost: Number(d.cost ?? 0), available: Number(d.available ?? 0) }), [[{ text: this.p('paywall.plans'), url: `${this.runtime.config.appUrl}/credits` }]]); return;
      case 'budget_exhausted': this.text(this.t('error.budget_exhausted')); return;
      case 'invalid_request': this.text(this.t('error.generic')); return;
      default: this.text(this.t('error.ai_failed'), this.nav()); return;
    }
  }

  /** Explanations: the interface language, or English when the person asked for it (and for B2+ learners in packs that switch). */
  explainIn(level: number | null): Locale {
    if (this.enrollment.settings.explain === 'en') return 'en';
    if (this.enrollment.settings.explain === 'ui') return this.locale;
    const below = this.pack.manifest.explainInUiLanguageBelow;
    if (below !== undefined && level !== null && level >= below) return 'en';
    return this.locale;
  }

  async mastery(): Promise<Map<string, MasteryState>> {
    return new Map((await this.store.mastery(this.enrollment.userId, this.pack.manifest.id)).map((row) => [row.node, row]));
  }
  /** The learner's level: measured where possible, else the placement test. */
  async level(node?: string): Promise<number | null> {
    const rows = await this.mastery();
    const roots = this.pack.manifest.skills.filter((skill) => !skill.parent).map((skill) => skill.id);
    const values = (node ? [node] : roots).map((id) => nodeLevel(this.pack, rows, id)).filter((value): value is number => value !== null);
    if (values.length) return values.reduce((a, b) => a + b, 0) / values.length;
    return this.enrollment.placement?.overall ?? null;
  }
  label(value: number | null) { return value === null ? '—' : levelLabel(this.pack.manifest.scale, value); }
  languageName(locale: Locale) { return LANGUAGE_NAMES[locale]; }

  /** Writes state and pending changes with the revision check; a lost race is logged, the newer state kept. */
  async save(): Promise<void> {
    const state = this.state as unknown as Record<string, unknown>;
    const next = await this.store.updateEnrollment(this.enrollment.id, this.enrollment.revision, { ...this.patch, state });
    if (next) { this.enrollment = next; return; }
    const fresh = await this.store.enrollment(this.enrollment.userId, this.enrollment.pack);
    if (!fresh) return;
    console.error(JSON.stringify({ event: 'schood_coach_state_race', pack: this.pack.manifest.id, request_id: this.ctx.requestId }));
    const keep = JSON.stringify(fresh.state) === JSON.stringify(this.enrollment.state) ? { ...this.patch, state } : this.patch;
    const retried = await this.store.updateEnrollment(fresh.id, fresh.revision, keep);
    if (retried) this.enrollment = retried;
  }
}

export const esc = escapeHtml;
