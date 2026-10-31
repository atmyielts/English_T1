import { normalizeWord } from '../../_shared/english-word-store.ts';
import { defineStore, type ServiceDb } from '../stores.ts';

// The learner area's own storage (migrations 2026103020*) plus the few existing
// Schood tables it reads or writes through their own rules: the English
// vocabulary notebook, exam outcomes, referral codes and English duels.
// `learnerStore` is defined with core's defineStore: the Postgres store over the
// service-role client when deployed, the memory twin in tests and dev stacks.
// Routes, providers, guards, plan sources and jobs reach it with ctx.store(learnerStore).

/** Where links in Telegram texts and invites point. */
export const APP_URL = 'https://ai.schood.online';

export type AgeBand = 'adult' | '13_17' | 'under_13';
export interface ConsentRow {
  userId: string;
  ageBand: AgeBand;
  guardianConfirmed: boolean;
  guardianUserId: string | null;
  textVersion: string;
  acceptedAt: string;
  withdrawnAt: string | null;
}

export type FamilyStatus = 'invited' | 'active' | 'declined' | 'unlinked' | 'expired';
export interface FamilyLink {
  id: string;
  workspaceId: string;
  parentId: string;
  childId: string | null;
  childLabel: string;
  status: FamilyStatus;
  inviteHint: string | null;
  inviteExpiresAt: string | null;
  createdAt: string;
  acceptedAt: string | null;
  endedAt: string | null;
}
export type FamilyAcceptFailure = 'not_found' | 'expired' | 'own_invite' | 'already_linked' | 'limit';

export interface ActivityInput {
  userId: string;
  workspaceId: string | null;
  /** Feature id: L2, L3, P1… */
  feature: string;
  /** mistake, check, writing, mock, reading, drill, plan, duel, brief… */
  kind: string;
  score?: number | null;
  minutes?: number;
  summary?: Record<string, unknown>;
}
export interface ActivityRow { id: number; userId: string; workspaceId: string | null; feature: string; kind: string; score: number | null; minutes: number; summary: Record<string, unknown>; createdAt: string }

export const RECORD_KINDS = ['explain', 'writing', 'ladder', 'essay', 'speaking', 'pronunciation', 'plan', 'gap', 'abroad', 'words', 'reading', 'photo', 'hint', 'brief', 'parent_brief'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export type RecordStatus = 'active' | 'ready' | 'finished' | 'archived';
export interface RecordRow {
  id: string;
  userId: string;
  workspaceId: string;
  kind: RecordKind;
  day: string | null;
  status: RecordStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  /** Answer keys and solutions; never returned before they are earned. */
  secret: Record<string, unknown>;
  state: Record<string, unknown>;
  version: number;
  credits: number;
  createdAt: string;
  updatedAt: string;
}
export type RecordInput = Pick<RecordRow, 'userId' | 'workspaceId' | 'kind'> & Partial<Pick<RecordRow, 'day' | 'status' | 'input' | 'output' | 'secret' | 'state' | 'credits'>>;
export type RecordPatch = Partial<Pick<RecordRow, 'status' | 'output' | 'secret' | 'state' | 'credits'>>;

export type BriefKind = 'daily' | 'parent';
export interface BriefSchedule {
  userId: string;
  kind: BriefKind;
  enabled: boolean;
  /** HH:MM local, 08:00–21:59. */
  sendTime: string;
  weekday: number | null;
  timeZone: string;
  locale: 'en' | 'uz' | 'ru';
  nextDueAt: string | null;
  lastSentAt: string | null;
}

export interface Snapshot { userId: string; profile: Record<string, unknown> | null; prediction: Record<string, unknown> | null; refreshedAt: string }

export interface DuelRow { duelId: string; code: string; creatorId: string; workspaceId: string; topic: string; level: string | null; referralCode: string | null; scoredAt: string | null; createdAt: string }
export interface DuelQuestion { prompt: string; options: string[]; correct_index: number; side: 'shared'; level: string | null }
export interface EnglishDuelState {
  code: string;
  status: 'open' | 'active' | 'finished' | 'expired';
  creatorId: string;
  opponentId: string | null;
  winnerId: string | null;
  inviteExpiresAt: string;
  players: { userId: string; role: 'creator' | 'opponent'; correct: number; answered: number; finished: boolean; outcome: string | null }[];
}

export interface ExamOutcome { name: string | null; band: string | null; score: number | null; date: string | null }
export interface NotebookWord { word: string; definition: string; example: string | null; meaningUz: string | null; meaningRu: string | null; level: string | null }

export interface LearnerStore {
  consent(userId: string): Promise<ConsentRow | null>;
  saveConsent(row: ConsentRow): Promise<ConsentRow>;

  familyInvite(input: { workspaceId: string; parentId: string; label: string; hash: string; hint: string; expiresAt: string; consentVersion: string; now: string; limit: number }): Promise<{ ok: true; id: string } | { ok: false; code: 'limit' }>;
  familyAccept(hash: string, childId: string, now: string, limit: number): Promise<{ ok: true; id: string; workspaceId: string; parentId: string } | { ok: false; code: FamilyAcceptFailure }>;
  familyLinks(filter: { workspaceId?: string; parentId?: string; childId?: string; statuses?: FamilyStatus[] }): Promise<FamilyLink[]>;
  familyLink(id: string): Promise<FamilyLink | null>;
  /** Ends an invited or active link; null when it was neither. */
  endFamilyLink(id: string, status: 'unlinked' | 'declined' | 'expired', actorId: string, now: string): Promise<FamilyLink | null>;

  addActivity(rows: ActivityInput[]): Promise<void>;
  activity(userId: string, options: { since?: string; limit: number; kinds?: string[] }): Promise<ActivityRow[]>;

  createRecord(input: RecordInput): Promise<RecordRow>;
  record(id: string): Promise<RecordRow | null>;
  records(userId: string, options: { kind: RecordKind; workspaceId?: string; limit: number; status?: RecordStatus[] }): Promise<RecordRow[]>;
  recordOfDay(userId: string, kind: RecordKind, day: string): Promise<RecordRow | null>;
  /** Saves only at `version` (optimistic lock); returns the new row or null. */
  updateRecord(id: string, version: number, patch: RecordPatch): Promise<RecordRow | null>;
  deleteRecords(userId: string, workspaceId: string | null): Promise<number>;

  schedule(userId: string, kind: BriefKind): Promise<BriefSchedule | null>;
  saveSchedule(row: BriefSchedule): Promise<BriefSchedule>;
  dueSchedules(now: string, limit: number): Promise<BriefSchedule[]>;

  snapshot(userId: string): Promise<Snapshot | null>;
  saveSnapshot(userId: string, patch: { profile?: Record<string, unknown> | null; prediction?: Record<string, unknown> | null }, now: string): Promise<void>;

  telegramThread(userId: string): Promise<{ workspaceId: string | null; threadId: string | null } | null>;
  setTelegramThread(userId: string, workspaceId: string | null, threadId: string | null): Promise<void>;

  saveDuel(row: Omit<DuelRow, 'scoredAt' | 'createdAt'>): Promise<DuelRow>;
  duels(creatorId: string, limit: number): Promise<DuelRow[]>;
  duelByCode(code: string): Promise<DuelRow | null>;
  /** True the first time only. */
  markDuelScored(duelId: string, now: string): Promise<boolean>;

  // --- Existing Schood tables -------------------------------------------------------
  /** Saves into the English vocabulary notebook (one row per word; existing words are kept). */
  saveNotebookWords(userId: string, words: NotebookWord[], source: { label: string; ref: string }, now: string): Promise<number>;
  examOutcomes(userId: string, limit: number): Promise<ExamOutcome[]>;
  /** The person's existing referral code, if they have one (never creates one). */
  referralCode(userId: string): Promise<string | null>;
  displayName(userId: string): Promise<string | null>;
  createEnglishDuel(userId: string, input: { questions: DuelQuestion[]; locale: 'en' | 'uz' | 'ru'; channel: 'web' | 'telegram' }): Promise<{ duelId: string; code: string; webUrl: string; botUrl: string }>;
  englishDuel(code: string): Promise<EnglishDuelState | null>;
}

// --- Memory store ---------------------------------------------------------------------

export interface MemoryLearnerSeed {
  names?: Record<string, string>;
  outcomes?: Record<string, ExamOutcome[]>;
  referralCodes?: Record<string, string>;
}
export type MemoryLearnerStore = LearnerStore & {
  notebook: Map<string, (NotebookWord & { userId: string; source: string })[]>;
  englishDuels: Map<string, EnglishDuelState & { questions: DuelQuestion[]; duelId: string }>;
  seed: Required<MemoryLearnerSeed>;
  records: LearnerStore['records'];
  allRecords: Map<string, RecordRow>;
  allActivity: ActivityRow[];
  links: Map<string, FamilyLink & { hash: string | null }>;
};

const clone = <T>(value: T): T => structuredClone(value);

export function createMemoryLearnerStore(seed: MemoryLearnerSeed = {}, now: () => Date = () => new Date()): MemoryLearnerStore {
  const consents = new Map<string, ConsentRow>();
  const links = new Map<string, FamilyLink & { hash: string | null }>();
  const activityRows: ActivityRow[] = [];
  const records = new Map<string, RecordRow>();
  const schedules = new Map<string, BriefSchedule>();
  const snapshots = new Map<string, Snapshot>();
  const telegram = new Map<string, { workspaceId: string | null; threadId: string | null }>();
  const duels = new Map<string, DuelRow>();
  const notebook = new Map<string, (NotebookWord & { userId: string; source: string })[]>();
  const englishDuels = new Map<string, EnglishDuelState & { questions: DuelQuestion[]; duelId: string }>();
  const full: Required<MemoryLearnerSeed> = { names: { ...seed.names }, outcomes: { ...seed.outcomes }, referralCodes: { ...seed.referralCodes } };
  let activityId = 0;
  const view = ({ hash: _hash, ...link }: FamilyLink & { hash: string | null }): FamilyLink => clone(link);
  const sizeOk = (value: unknown, max: number) => JSON.stringify(value ?? {}).length <= max;

  const store: MemoryLearnerStore = {
    notebook, englishDuels, seed: full, allRecords: records, allActivity: activityRows, links,
    consent: (userId) => Promise.resolve(consents.has(userId) ? clone(consents.get(userId)!) : null),
    saveConsent(row) { consents.set(row.userId, clone(row)); return Promise.resolve(clone(row)); },

    familyInvite(input) {
      for (const link of links.values()) {
        if (link.workspaceId === input.workspaceId && link.parentId === input.parentId && link.status === 'invited' && link.inviteExpiresAt! <= input.now) Object.assign(link, { status: 'expired', hash: null });
      }
      const open = [...links.values()].filter((link) => link.workspaceId === input.workspaceId && link.parentId === input.parentId && (link.status === 'invited' || link.status === 'active')).length;
      if (open >= input.limit) return Promise.resolve({ ok: false as const, code: 'limit' as const });
      const id = crypto.randomUUID();
      links.set(id, { id, workspaceId: input.workspaceId, parentId: input.parentId, childId: null, childLabel: input.label.trim(), status: 'invited', inviteHint: input.hint, inviteExpiresAt: input.expiresAt, createdAt: input.now, acceptedAt: null, endedAt: null, hash: input.hash });
      return Promise.resolve({ ok: true as const, id });
    },
    familyAccept(hash, childId, now, limit) {
      const link = [...links.values()].find((entry) => entry.hash === hash);
      if (!link || link.status !== 'invited') return Promise.resolve({ ok: false as const, code: 'not_found' as const });
      if (link.inviteExpiresAt! <= now) { Object.assign(link, { status: 'expired', hash: null }); return Promise.resolve({ ok: false as const, code: 'expired' as const }); }
      if (link.parentId === childId) return Promise.resolve({ ok: false as const, code: 'own_invite' as const });
      const siblings = [...links.values()].filter((entry) => entry.workspaceId === link.workspaceId && entry.parentId === link.parentId && entry.status === 'active');
      if (siblings.some((entry) => entry.childId === childId)) { Object.assign(link, { status: 'expired', hash: null }); return Promise.resolve({ ok: false as const, code: 'already_linked' as const }); }
      if (siblings.length >= limit) return Promise.resolve({ ok: false as const, code: 'limit' as const });
      Object.assign(link, { status: 'active', childId, acceptedAt: now, hash: null, inviteHint: null });
      return Promise.resolve({ ok: true as const, id: link.id, workspaceId: link.workspaceId, parentId: link.parentId });
    },
    familyLinks(filter) {
      return Promise.resolve([...links.values()].filter((link) =>
        (!filter.workspaceId || link.workspaceId === filter.workspaceId) && (!filter.parentId || link.parentId === filter.parentId)
        && (!filter.childId || link.childId === filter.childId) && (!filter.statuses || filter.statuses.includes(link.status)))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(view));
    },
    familyLink: (id) => Promise.resolve(links.has(id) ? view(links.get(id)!) : null),
    endFamilyLink(id, status, _actorId, now) {
      const link = links.get(id);
      if (!link || (link.status !== 'invited' && link.status !== 'active')) return Promise.resolve(null);
      Object.assign(link, { status, endedAt: now, hash: null });
      return Promise.resolve(view(link));
    },

    addActivity(rows) {
      for (const row of rows) {
        if (!sizeOk(row.summary, 4000)) throw new Error('activity summary too large');
        activityRows.push({ id: ++activityId, userId: row.userId, workspaceId: row.workspaceId, feature: row.feature, kind: row.kind, score: row.score ?? null, minutes: row.minutes ?? 0, summary: clone(row.summary ?? {}), createdAt: now().toISOString() });
      }
      return Promise.resolve();
    },
    activity(userId, options) {
      return Promise.resolve(activityRows.filter((row) => row.userId === userId && (!options.since || row.createdAt >= options.since) && (!options.kinds || options.kinds.includes(row.kind)))
        .sort((a, b) => b.id - a.id).slice(0, options.limit).map(clone));
    },

    createRecord(input) {
      if (input.day && [...records.values()].some((row) => row.userId === input.userId && row.kind === input.kind && row.day === input.day)) throw new Error('duplicate record for the day');
      for (const [field, max] of [['input', 64000], ['output', 128000], ['secret', 64000], ['state', 128000]] as const) if (!sizeOk(input[field], max)) throw new Error(`record ${field} too large`);
      const at = now().toISOString();
      const row: RecordRow = {
        id: crypto.randomUUID(), userId: input.userId, workspaceId: input.workspaceId, kind: input.kind, day: input.day ?? null, status: input.status ?? 'ready',
        input: clone(input.input ?? {}), output: clone(input.output ?? {}), secret: clone(input.secret ?? {}), state: clone(input.state ?? {}), version: 1, credits: input.credits ?? 0, createdAt: at, updatedAt: at,
      };
      records.set(row.id, row);
      return Promise.resolve(clone(row));
    },
    record: (id) => Promise.resolve(records.has(id) ? clone(records.get(id)!) : null),
    records(userId, options) {
      return Promise.resolve([...records.values()].filter((row) => row.userId === userId && row.kind === options.kind && (!options.workspaceId || row.workspaceId === options.workspaceId) && (!options.status || options.status.includes(row.status)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, options.limit).map(clone));
    },
    recordOfDay: (userId, kind, day) => Promise.resolve(clone([...records.values()].find((row) => row.userId === userId && row.kind === kind && row.day === day) ?? null)),
    updateRecord(id, version, patch) {
      const row = records.get(id);
      if (!row || row.version !== version) return Promise.resolve(null);
      for (const [field, max] of [['output', 128000], ['secret', 64000], ['state', 128000]] as const) if (patch[field] !== undefined && !sizeOk(patch[field], max)) throw new Error(`record ${field} too large`);
      Object.assign(row, clone(patch), { version: row.version + 1, updatedAt: now().toISOString() });
      return Promise.resolve(clone(row));
    },
    deleteRecords(userId, workspaceId) {
      let count = 0;
      for (const [id, row] of records) if (row.userId === userId && (!workspaceId || row.workspaceId === workspaceId)) { records.delete(id); count++; }
      for (let i = activityRows.length - 1; i >= 0; i--) if (activityRows[i].userId === userId && (!workspaceId || activityRows[i].workspaceId === workspaceId)) activityRows.splice(i, 1);
      return Promise.resolve(count);
    },

    schedule: (userId, kind) => Promise.resolve(clone(schedules.get(`${userId}:${kind}`) ?? null)),
    saveSchedule(row) {
      if (row.sendTime < '08:00' || row.sendTime >= '22:00') throw new Error('send time inside quiet hours');
      schedules.set(`${row.userId}:${row.kind}`, clone(row));
      return Promise.resolve(clone(row));
    },
    dueSchedules: (now, limit) => Promise.resolve([...schedules.values()].filter((row) => row.enabled && row.nextDueAt && row.nextDueAt <= now).sort((a, b) => a.nextDueAt!.localeCompare(b.nextDueAt!)).slice(0, limit).map(clone)),

    snapshot: (userId) => Promise.resolve(clone(snapshots.get(userId) ?? null)),
    saveSnapshot(userId, patch, now) {
      const current = snapshots.get(userId) ?? { userId, profile: null, prediction: null, refreshedAt: now };
      snapshots.set(userId, { ...current, ...clone(patch), refreshedAt: now });
      return Promise.resolve();
    },

    telegramThread: (userId) => Promise.resolve(clone(telegram.get(userId) ?? null)),
    setTelegramThread(userId, workspaceId, threadId) { telegram.set(userId, { workspaceId, threadId }); return Promise.resolve(); },

    saveDuel(row) {
      const saved: DuelRow = { ...row, scoredAt: null, createdAt: now().toISOString() };
      duels.set(row.duelId, saved);
      return Promise.resolve(clone(saved));
    },
    duels: (creatorId, limit) => Promise.resolve([...duels.values()].filter((row) => row.creatorId === creatorId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).map(clone)),
    duelByCode: (code) => Promise.resolve(clone([...duels.values()].find((row) => row.code === code) ?? null)),
    markDuelScored(duelId, now) {
      const row = duels.get(duelId);
      if (!row || row.scoredAt) return Promise.resolve(false);
      row.scoredAt = now;
      return Promise.resolve(true);
    },

    saveNotebookWords(userId, words, source) {
      const list = notebook.get(userId) ?? [];
      let added = 0;
      for (const word of words) {
        const key = word.word.trim().toLowerCase();
        if (!key || list.some((entry) => entry.word.trim().toLowerCase() === key)) continue;
        list.push({ ...clone(word), userId, source: source.label });
        added++;
      }
      notebook.set(userId, list);
      return Promise.resolve(added);
    },
    examOutcomes: (userId, limit) => Promise.resolve(clone((full.outcomes[userId] ?? []).slice(0, limit))),
    referralCode: (userId) => Promise.resolve(full.referralCodes[userId] ?? null),
    displayName: (userId) => Promise.resolve(full.names[userId] ?? null),
    createEnglishDuel(userId, input) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(crypto.getRandomValues(new Uint8Array(10)), (byte) => alphabet[byte & 31]).join('');
      const duelId = crypto.randomUUID();
      englishDuels.set(code, { code, duelId, status: 'open', creatorId: userId, opponentId: null, winnerId: null, inviteExpiresAt: new Date(now().getTime() + 86_400_000).toISOString(), questions: clone(input.questions), players: [{ userId, role: 'creator', correct: 0, answered: 0, finished: false, outcome: null }] });
      return Promise.resolve({ duelId, code, webUrl: `https://english.schood.online/duel/${code}`, botUrl: `https://t.me/schoodstudentbot?start=duel_${code}` });
    },
    englishDuel(code) {
      const duel = englishDuels.get(code);
      if (!duel) return Promise.resolve(null);
      const { questions: _questions, duelId: _id, ...state } = duel;
      return Promise.resolve(clone(state));
    },
  };
  return store;
}

// --- Postgres store -------------------------------------------------------------------
type Row = Record<string, unknown>;
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
function check<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new Error(`${result.error.code ?? 'db'}: ${result.error.message}`);
  return result.data as T;
}

const consent = (row: Row): ConsentRow => ({
  userId: String(row.user_id), ageBand: row.age_band as ConsentRow['ageBand'], guardianConfirmed: row.guardian_confirmed === true,
  guardianUserId: str(row.guardian_user_id), textVersion: String(row.text_version), acceptedAt: String(row.accepted_at), withdrawnAt: str(row.withdrawn_at),
});
const link = (row: Row): FamilyLink => ({
  id: String(row.id), workspaceId: String(row.workspace_id), parentId: String(row.parent_id), childId: str(row.child_id), childLabel: String(row.child_label),
  status: row.status as FamilyLink['status'], inviteHint: str(row.invite_hint), inviteExpiresAt: str(row.invite_expires_at), createdAt: String(row.created_at),
  acceptedAt: str(row.accepted_at), endedAt: str(row.ended_at),
});
const activity = (row: Row): ActivityRow => ({
  id: Number(row.id), userId: String(row.user_id), workspaceId: str(row.workspace_id), feature: String(row.feature), kind: String(row.kind),
  score: row.score === null || row.score === undefined ? null : Number(row.score), minutes: Number(row.minutes ?? 0), summary: obj(row.summary), createdAt: String(row.created_at),
});
const record = (row: Row): RecordRow => ({
  id: String(row.id), userId: String(row.user_id), workspaceId: String(row.workspace_id), kind: row.kind as RecordRow['kind'], day: str(row.day),
  status: row.status as RecordRow['status'], input: obj(row.input), output: obj(row.output), secret: obj(row.secret), state: obj(row.state),
  version: Number(row.version ?? 1), credits: Number(row.credits ?? 0), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
});
const schedule = (row: Row): BriefSchedule => ({
  userId: String(row.user_id), kind: row.kind as BriefSchedule['kind'], enabled: row.enabled !== false, sendTime: String(row.send_time ?? '08:30').slice(0, 5),
  weekday: row.weekday === null || row.weekday === undefined ? null : Number(row.weekday), timeZone: String(row.time_zone ?? 'Asia/Tashkent'),
  locale: (['en', 'uz', 'ru'].includes(String(row.locale)) ? row.locale : 'en') as BriefSchedule['locale'], nextDueAt: str(row.next_due_at), lastSentAt: str(row.last_sent_at),
});
const duel = (row: Row): DuelRow => ({
  duelId: String(row.duel_id), code: String(row.code), creatorId: String(row.creator_id), workspaceId: String(row.workspace_id), topic: String(row.topic),
  level: str(row.level), referralCode: str(row.referral_code), scoredAt: str(row.scored_at), createdAt: String(row.created_at),
});
const RECORD_COLUMNS = 'id, user_id, workspace_id, kind, day, status, input, output, secret, state, version, credits, created_at, updated_at';
const LINK_COLUMNS = 'id, workspace_id, parent_id, child_id, child_label, status, invite_hint, invite_expires_at, created_at, accepted_at, ended_at';

// deno-lint-ignore no-explicit-any
type Query = any;
/** The learner store on Postgres through the service-role client core passes in. */
export function createPostgresLearnerStore(client: ServiceDb): LearnerStore {
  const db = client as unknown as { from(table: string): Query; rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> };
  let englishId: Promise<string> | null = null;
  const english = () => (englishId ??= (async () => {
    const row = check<Row | null>(await db.from('languages').select('id').eq('code', 'en').maybeSingle());
    if (!row?.id) throw new Error('English language row is missing');
    return String(row.id);
  })().catch((cause) => { englishId = null; throw cause; }));

  return {
    async consent(userId) {
      const row = check<Row | null>(await db.from('ai_learner_consents').select('*').eq('user_id', userId).maybeSingle());
      return row ? consent(row) : null;
    },
    async saveConsent(row) {
      const saved = check<Row>(await db.from('ai_learner_consents').upsert({
        user_id: row.userId, age_band: row.ageBand, guardian_confirmed: row.guardianConfirmed, guardian_user_id: row.guardianUserId,
        text_version: row.textVersion, accepted_at: row.acceptedAt, withdrawn_at: row.withdrawnAt, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }).select('*').single());
      return consent(saved);
    },

    async familyInvite(input) {
      const out = obj(check(await db.rpc('ai_learner_family_invite', {
        p_workspace: input.workspaceId, p_parent: input.parentId, p_label: input.label, p_hash: input.hash, p_hint: input.hint,
        p_expires: input.expiresAt, p_consent: input.consentVersion, p_now: input.now, p_limit: input.limit,
      })));
      return out.ok === true ? { ok: true, id: String(out.id) } : { ok: false, code: 'limit' };
    },
    async familyAccept(hash, childId, now, limit) {
      const out = obj(check(await db.rpc('ai_learner_family_accept', { p_hash: hash, p_child: childId, p_now: now, p_limit: limit })));
      if (out.ok === true) return { ok: true, id: String(out.id), workspaceId: String(out.workspace_id), parentId: String(out.parent_id) };
      const code = String(out.code);
      return { ok: false, code: (['expired', 'own_invite', 'already_linked', 'limit'].includes(code) ? code : 'not_found') as 'not_found' };
    },
    async familyLinks(filter) {
      let query = db.from('ai_learner_family_links').select(LINK_COLUMNS).order('created_at', { ascending: true }).limit(50);
      if (filter.workspaceId) query = query.eq('workspace_id', filter.workspaceId);
      if (filter.parentId) query = query.eq('parent_id', filter.parentId);
      if (filter.childId) query = query.eq('child_id', filter.childId);
      if (filter.statuses) query = query.in('status', filter.statuses);
      return (check<Row[]>(await query) ?? []).map(link);
    },
    async familyLink(id) {
      const row = check<Row | null>(await db.from('ai_learner_family_links').select(LINK_COLUMNS).eq('id', id).maybeSingle());
      return row ? link(row) : null;
    },
    async endFamilyLink(id, status, actorId, now) {
      const row = check<Row | null>(await db.from('ai_learner_family_links').update({ status, ended_at: now, ended_by: actorId, invite_hash: null })
        .eq('id', id).in('status', ['invited', 'active']).select(LINK_COLUMNS).maybeSingle());
      return row ? link(row) : null;
    },

    async addActivity(rows) {
      if (!rows.length) return;
      check(await db.from('ai_learner_activity').insert(rows.map((row) => ({
        user_id: row.userId, workspace_id: row.workspaceId, feature: row.feature, kind: row.kind, score: row.score ?? null, minutes: row.minutes ?? 0, summary: row.summary ?? {},
      }))));
    },
    async activity(userId, options) {
      let query = db.from('ai_learner_activity').select('*').eq('user_id', userId).order('id', { ascending: false }).limit(options.limit);
      if (options.since) query = query.gte('created_at', options.since);
      if (options.kinds) query = query.in('kind', options.kinds);
      return (check<Row[]>(await query) ?? []).map(activity);
    },

    async createRecord(input) {
      const row = check<Row>(await db.from('ai_learner_records').insert({
        user_id: input.userId, workspace_id: input.workspaceId, kind: input.kind, day: input.day ?? null, status: input.status ?? 'ready',
        input: input.input ?? {}, output: input.output ?? {}, secret: input.secret ?? {}, state: input.state ?? {}, credits: input.credits ?? 0,
      }).select(RECORD_COLUMNS).single());
      return record(row);
    },
    async record(id) {
      const row = check<Row | null>(await db.from('ai_learner_records').select(RECORD_COLUMNS).eq('id', id).maybeSingle());
      return row ? record(row) : null;
    },
    async records(userId, options) {
      let query = db.from('ai_learner_records').select(RECORD_COLUMNS).eq('user_id', userId).eq('kind', options.kind).order('created_at', { ascending: false }).limit(options.limit);
      if (options.workspaceId) query = query.eq('workspace_id', options.workspaceId);
      if (options.status) query = query.in('status', options.status);
      return (check<Row[]>(await query) ?? []).map(record);
    },
    async recordOfDay(userId, kind, day) {
      const row = check<Row | null>(await db.from('ai_learner_records').select(RECORD_COLUMNS).eq('user_id', userId).eq('kind', kind).eq('day', day).maybeSingle());
      return row ? record(row) : null;
    },
    async updateRecord(id, version, patch) {
      const row = check<Row | null>(await db.from('ai_learner_records').update({ ...patch, version: version + 1, updated_at: new Date().toISOString() })
        .eq('id', id).eq('version', version).select(RECORD_COLUMNS).maybeSingle());
      return row ? record(row) : null;
    },
    async deleteRecords(userId, workspaceId) {
      let records = db.from('ai_learner_records').delete().eq('user_id', userId);
      let rows = db.from('ai_learner_activity').delete().eq('user_id', userId);
      if (workspaceId) { records = records.eq('workspace_id', workspaceId); rows = rows.eq('workspace_id', workspaceId); }
      const deleted = check<Row[]>(await records.select('id')) ?? [];
      check(await rows);
      return deleted.length;
    },

    async schedule(userId, kind) {
      const row = check<Row | null>(await db.from('ai_learner_briefs').select('*').eq('user_id', userId).eq('kind', kind).maybeSingle());
      return row ? schedule(row) : null;
    },
    async saveSchedule(row) {
      const saved = check<Row>(await db.from('ai_learner_briefs').upsert({
        user_id: row.userId, kind: row.kind, enabled: row.enabled, send_time: row.sendTime, weekday: row.weekday, time_zone: row.timeZone, locale: row.locale,
        next_due_at: row.nextDueAt, last_sent_at: row.lastSentAt, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,kind' }).select('*').single());
      return schedule(saved);
    },
    async dueSchedules(now, limit) {
      return (check<Row[]>(await db.from('ai_learner_briefs').select('*').eq('enabled', true).lte('next_due_at', now).order('next_due_at').limit(limit)) ?? []).map(schedule);
    },

    async snapshot(userId) {
      const row = check<Row | null>(await db.from('ai_learner_snapshots').select('*').eq('user_id', userId).maybeSingle());
      return row ? { userId, profile: row.profile ? obj(row.profile) : null, prediction: row.prediction ? obj(row.prediction) : null, refreshedAt: String(row.refreshed_at) } satisfies Snapshot : null;
    },
    async saveSnapshot(userId, patch, now) {
      check(await db.from('ai_learner_snapshots').upsert({ user_id: userId, ...patch, refreshed_at: now }, { onConflict: 'user_id' }));
    },

    async telegramThread(userId) {
      const row = check<Row | null>(await db.from('ai_learner_telegram').select('workspace_id, thread_id').eq('user_id', userId).maybeSingle());
      return row ? { workspaceId: str(row.workspace_id), threadId: str(row.thread_id) } : null;
    },
    async setTelegramThread(userId, workspaceId, threadId) {
      check(await db.from('ai_learner_telegram').upsert({ user_id: userId, workspace_id: workspaceId, thread_id: threadId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
    },

    async saveDuel(row) {
      const saved = check<Row>(await db.from('ai_learner_duels').insert({
        duel_id: row.duelId, code: row.code, creator_id: row.creatorId, workspace_id: row.workspaceId, topic: row.topic, level: row.level, referral_code: row.referralCode,
      }).select('*').single());
      return duel(saved);
    },
    async duels(creatorId, limit) {
      return (check<Row[]>(await db.from('ai_learner_duels').select('*').eq('creator_id', creatorId).order('created_at', { ascending: false }).limit(limit)) ?? []).map(duel);
    },
    async duelByCode(code) {
      const row = check<Row | null>(await db.from('ai_learner_duels').select('*').eq('code', code).maybeSingle());
      return row ? duel(row) : null;
    },
    async markDuelScored(duelId, now) {
      const row = check<Row | null>(await db.from('ai_learner_duels').update({ scored_at: now }).eq('duel_id', duelId).is('scored_at', null).select('duel_id').maybeSingle());
      return !!row;
    },

    async saveNotebookWords(userId, words, source, now) {
      const languageId = await english();
      const seen = new Set<string>();
      const rows = words.slice(0, 50).flatMap((entry) => {
        const word = entry.word.trim().slice(0, 200), normalized = normalizeWord(word);
        if (!normalized || !entry.definition.trim() || seen.has(normalized)) return [];
        seen.add(normalized);
        return [{
          user_id: userId, language_id: languageId, word, normalized_word: normalized, source_type: 'schood-ai', source_label: source.label.slice(0, 120), source_ref: source.ref.slice(0, 120),
          context_text: entry.example?.slice(0, 600) ?? null, next_review_at: now,
          metadata: { definition: entry.definition.slice(0, 600), example: entry.example?.slice(0, 600) ?? null, translations: { uz: entry.meaningUz, ru: entry.meaningRu }, level: entry.level, captured_at: now },
        }];
      });
      if (!rows.length) return 0;
      // ignoreDuplicates: a word the learner already has keeps its review schedule.
      const data = check<Row[]>(await db.from('user_vocabulary_notebook_entries').upsert(rows, { onConflict: 'user_id,language_id,normalized_word', ignoreDuplicates: true }).select('id'));
      return (data ?? []).length;
    },
    async examOutcomes(userId, limit) {
      const rows = check<Row[]>(await db.from('exam_outcomes').select('overall_band, overall_score, computed_at, products(name)').eq('user_id', userId).eq('status', 'completed').order('computed_at', { ascending: false }).limit(limit)) ?? [];
      return rows.map((row): ExamOutcome => ({
        name: str(obj(row.products).name), band: str(row.overall_band), score: row.overall_score === null || row.overall_score === undefined ? null : Number(row.overall_score), date: str(row.computed_at)?.slice(0, 10) ?? null,
      }));
    },
    async referralCode(userId) {
      const row = check<Row | null>(await db.from('referral_accounts').select('referral_code, status').eq('user_id', userId).maybeSingle());
      return row && row.status === 'active' && /^[A-Z0-9]{4,16}$/.test(String(row.referral_code)) ? String(row.referral_code) : null;
    },
    async displayName(userId) {
      const row = check<Row | null>(await db.from('users').select('full_name').eq('id', userId).maybeSingle());
      const name = String(row?.full_name ?? '').trim();
      return name ? name.split(/\s+/)[0].slice(0, 40) : null;
    },
    async createEnglishDuel(userId, input) {
      const service = await import('../../_shared/english-duel-service.ts');
      const ctx = { sb: db, languageId: await english(), appUrl: 'https://english.schood.online', botName: 'schoodstudentbot' };
      const created = await service.createDuel(ctx, userId, { channel: input.channel, locale: input.locale, questions: input.questions });
      const row = check<Row>(await db.from('english_duels').select('id').eq('code', created.code).single());
      return { duelId: String(row.id), code: created.code, webUrl: created.links.webUrl, botUrl: created.links.botInviteUrl };
    },
    async englishDuel(code) {
      const row = check<Row | null>(await db.from('english_duels').select('id, code, status, creator_id, opponent_id, winner_id, invite_expires_at').eq('code', code).maybeSingle());
      if (!row) return null;
      const players = check<Row[]>(await db.from('english_duel_players').select('user_id, role, correct_count, answered_count, finished_at, outcome').eq('duel_id', row.id)) ?? [];
      return {
        code: String(row.code), status: row.status as EnglishDuelState['status'], creatorId: String(row.creator_id), opponentId: str(row.opponent_id), winnerId: str(row.winner_id),
        inviteExpiresAt: String(row.invite_expires_at),
        players: players.map((player) => ({
          userId: String(player.user_id), role: player.role === 'opponent' ? 'opponent' as const : 'creator' as const, correct: Number(player.correct_count ?? 0),
          answered: Number(player.answered_count ?? 0), finished: !!player.finished_at, outcome: str(player.outcome),
        })),
      };
    },
  };
}


export const learnerStore = defineStore<LearnerStore>('learner', {
  postgres: (db) => createPostgresLearnerStore(db),
  memory: ({ now }) => createMemoryLearnerStore({}, now),
});
