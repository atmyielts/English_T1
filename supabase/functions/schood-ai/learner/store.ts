// The learner area's own storage (migration 20261030200000_schood_ai_learner.sql)
// plus the few existing Schood tables it reads or writes through their own rules:
// the English vocabulary notebook, exam outcomes, referral codes and English duels.
//
// RequestContext has no handle for an area's own tables yet (see
// docs/product/ai-requests/learner.md), so this module is a small adapter: the
// store is bound to the core repository object. Tests and the dev stack bind a
// memory store; the deployed function builds the Postgres store from the service
// role on first use.

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

// --- Binding --------------------------------------------------------------------------

export interface LearnerConfig {
  /** Schood product id of Plus Family (SCHOOD_AI_FAMILY_PRODUCT_ID); children get Plus while the parent holds it. */
  familyProductId: string | null;
  /** ai.schood.online, for links in Telegram texts. */
  appUrl: string;
}
const bound = new WeakMap<object, { store: LearnerStore; config: LearnerConfig }>();
let deployed: { store: LearnerStore; config: LearnerConfig } | null = null;

const env = (name: string): string | undefined => {
  try { return Deno.env.get(name) ?? undefined; } catch { return undefined; }
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bindLearnerStore(repo: object, store: LearnerStore, config: Partial<LearnerConfig> = {}): void {
  bound.set(repo, { store, config: { familyProductId: config.familyProductId ?? null, appUrl: config.appUrl ?? 'https://ai.schood.online' } });
}

function fromEnvironment(): { store: LearnerStore; config: LearnerConfig } {
  const family = env('SCHOOD_AI_FAMILY_PRODUCT_ID');
  const config: LearnerConfig = { familyProductId: family && UUID.test(family) ? family.toLowerCase() : null, appUrl: env('SCHOOD_AI_APP_URL') ?? 'https://ai.schood.online' };
  const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (url && key) return { store: lazyPostgres(url, key), config };
  // Only a local run without a project gets here (index.ts refuses to start without the service role).
  console.warn(JSON.stringify({ event: 'schood_ai_learner_store_memory' }));
  return { store: createMemoryLearnerStore(), config };
}

/** The store for this repository: the bound one, else the deployed one. */
export function learnerStore(repo: object): LearnerStore {
  return learnerBinding(repo).store;
}
export function learnerConfig(repo: object): LearnerConfig {
  return learnerBinding(repo).config;
}
function learnerBinding(repo: object) {
  const hit = bound.get(repo);
  if (hit) return hit;
  deployed ??= fromEnvironment();
  bound.set(repo, deployed);
  return deployed;
}

/** The Postgres store, loaded on first use so tests never fetch the client. */
function lazyPostgres(url: string, key: string): LearnerStore {
  let loading: Promise<LearnerStore> | null = null;
  const load = () => (loading ??= import('./store-postgres.ts').then((module) => module.createPostgresLearnerStore(url, key)));
  return new Proxy({} as LearnerStore, {
    get: (_target, name) => (...args: unknown[]) => load().then((store) => (store as unknown as Record<string, (...a: unknown[]) => unknown>)[String(name)](...args)),
  });
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
