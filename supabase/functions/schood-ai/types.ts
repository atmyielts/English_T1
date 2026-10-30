import type {
  AccessDecision, Capability, CreditKey, PlanCode, Registry, RegistryModel, RegistryProvider, RegistryRoute, Role, Schema, Switches, WorkspaceKind,
} from '../../../packages/ai-core/src/mod.ts';
import type { ChatMessage, SpeechAudio, Transcript } from './providers/types.ts';
export type { PlanCode, Role, WorkspaceKind } from '../../../packages/ai-core/src/mod.ts';
export type { ChatMessage, ContentPart, SpeechAudio, Transcript } from './providers/types.ts';
import type { Gateway } from './gateway.ts';
import type { LibraryService } from './library.ts';
import type { StoreHandle } from './stores.ts';

// The shared types of the Schood AI function: what a route receives (RequestContext),
// how an area registers its routes (FeatureModule) and what the repository stores.
// Feature areas import from here; see CONTRACT.md.

export const AREAS = ['core', 'admin', 'learner', 'teacher', 'centre', 'coach', 'engage'] as const;
export type Area = (typeof AREAS)[number];
export type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
export type Locale = 'en' | 'uz' | 'ru';

/** An expected failure with a stable `code` the app translates. Anything else is a 500. */
export class SchoodAIError extends Error {
  constructor(public code: string, message: string, public status = 400, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

// --- Routes and modules --------------------------------------------------------------

/** Returns a JSON-serialisable value (sent as 200) or a ready Response (SSE, audio). */
export type RouteFn = (ctx: RequestContext) => Promise<unknown>;
export interface RouteHandler {
  GET?: RouteFn;
  POST?: RouteFn;
  PATCH?: RouteFn;
  PUT?: RouteFn;
  DELETE?: RouteFn;
  /** Largest accepted request body in bytes (default 64 KB). */
  maxBody?: number;
  /** Also callable by the trusted Telegram worker with the service secret (default no). */
  service?: boolean;
  /** Admin area only: the existing admin RBAC permission the route needs. */
  adminPermission?: string;
  /**
   * A scheduled or system job: called with X-Schood-Service-Secret only (the worker secret, or the
   * system secret pg_cron sends through invoke_schood_ai_system), never with a user. ctx.caller is
   * 'system'; anything that would act as a user throws. Pay for AI with ctx.paidBy(workspaceId).
   */
  system?: boolean;
  /**
   * Open without signing in (a Live Quiz player, a shared Passport, a centre's widget), limited per
   * IP: 30 a minute and 1000 a day unless set. ctx.caller is 'anonymous'; anything that would act as
   * a user throws, ctx.ai included. Only ctx.paidBy(centreWorkspaceId) can pay for AI here.
   */
  anonymous?: boolean | AnonymousOptions;
}
/** One feature area: `/schood-ai/<area>/<action>`. */
export interface FeatureModule {
  area: Area;
  routes: Record<string, RouteHandler>;
}

// --- People and workspaces ------------------------------------------------------------

export interface AuthUser { id: string; email: string | null }
export interface UserProfile { id: string; role: string; isActive: boolean; telegramChatId: string | null; name: string | null }
export interface RequestUser {
  id: string;
  email: string | null;
  /** The person's own Supabase token; null when the Telegram worker acts for them. */
  token: string | null;
  via: 'jwt' | 'service';
  telegramChatId: string | null;
}

export interface Workspace {
  id: string;
  kind: WorkspaceKind;
  name: string;
  ownerId: string;
  academyTenantId: string | null;
  contractPlan: 'enterprise' | null;
  contractUntil: string | null;
  /** logo_url, primary_color, accent_color, assistant_name. */
  branding: Record<string, unknown>;
  /** Instruction language, tone, worksheet template. */
  houseStyle: Record<string, unknown>;
  /** `features` (workspace switches) and area-specific settings. */
  settings: Record<string, unknown>;
  status: 'active' | 'suspended';
}
export interface Member {
  workspaceId: string;
  userId: string;
  role: Role;
  status: 'active' | 'suspended';
  creditBudget: number | null;
  budgetPeriod: string | null;
  budgetUsed: number;
}
export interface WorkspaceAccess { workspace: Workspace; member: Member; role: Role }

export interface PlanState {
  workspaceKind: WorkspaceKind;
  /** Plans in force here: personal plans in a personal workspace, workspace plans in a centre. */
  plans: PlanCode[];
  /** Features granted directly (a coach pass, a team seat). */
  features: string[];
  /** Schood admin or allowlisted tester (for a centre: its owner is). */
  beta: boolean;
  /** Credits per 30-day cycle for this workspace's account. */
  grant: number;
  /** Start of the entitlement that grants them, so cycles follow the purchase; null for beta and contracts. */
  anchor: string | null;
}

// --- Credits ---------------------------------------------------------------------------

export interface Balance { plan: number; planGrant: number; pack: number; total: number; cycleEndsAt: string | null }
export type ChargeOutcome =
  | { ok: true; chargeId: string; cost: number; replayed: boolean; balance: Balance }
  | { ok: false; code: 'insufficient_credits' | 'budget_exhausted' | 'not_member' | 'reference_refunded'; cost?: number; available?: number; budget?: number; used?: number; balance?: Balance };
export interface LedgerRow { id: number; userId: string | null; kind: string; bucket: 'plan' | 'pack'; delta: number; balanceAfter: number; creditKey: string | null; reference: string | null; createdAt: string }

// --- Service settings, registry, calls --------------------------------------------------

export interface ServiceSettings {
  aiEnabled: boolean;
  features: Switches;
  globalDailyCalls: number;
  userDailyCalls: number;
  workspaceDailyCalls: number;
  globalDailyUsd: number | null;
}
export type CapScope = 'global' | 'spend' | 'workspace' | 'user';
export type CallStatus = 'ok' | 'failed' | 'timeout' | 'rate_limited' | 'invalid_output' | 'stopped' | 'capped' | 'disabled' | 'unavailable';
/** One row of ai_calls: a provider attempt, or a call refused before one. Never prompt or answer text. */
export interface CallRecord {
  callId: string;
  attempt: number;
  requestId: string | null;
  feature: string;
  userId: string | null;
  workspaceId: string | null;
  routeKey: string | null;
  providerKey: string | null;
  modelKey: string | null;
  status: CallStatus;
  errorCode: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  usageEstimated: boolean;
  costUsd: number;
  credits: number;
  chargeId: string | null;
  streamed: boolean;
}
export interface UsageRow { feature: string; modelKey: string | null; status: CallStatus; calls: number; costUsd: number; latencyMs: number | null }

// --- Chat, specialists, jobs, actions -----------------------------------------------------

export interface Thread { id: string; workspaceId: string; userId: string; specialistKey: string; pageId: string | null; title: string; pinned: boolean; createdAt: string; lastMessageAt: string }
export type MessageStatus = 'complete' | 'streaming' | 'failed' | 'stopped';
export interface Message {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatus;
  clientMessageId: string | null;
  creditKey: string | null;
  credits: number;
  callId: string | null;
  chargeId: string | null;
  contextKinds: string[];
  errorCode: string | null;
  createdAt: string;
}
/** `name` is empty when a built-in keeps its own (translated) name. */
export interface SpecialistRow { key: string; name: string; description: string | null; instructions: string; contextKinds: string[]; roles: Role[]; enabled: boolean }

export type GenerationStatus = 'requested' | 'generating' | 'ready' | 'approved' | 'rejected' | 'failed';
export interface GenerationRow {
  id: string;
  workspaceId: string;
  userId: string | null;
  feature: string;
  status: GenerationStatus;
  input: Record<string, unknown>;
  output: unknown;
  verification: unknown;
  progress: Record<string, unknown>;
  errorCode: string | null;
  credits: number;
  chargeId: string | null;
  modelKey: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  heartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ActionStatus = 'pending' | 'running' | 'done' | 'failed' | 'declined' | 'expired';
export interface ActionRow {
  id: string;
  workspaceId: string;
  kind: string;
  payload: Record<string, unknown>;
  summary: string;
  status: ActionStatus;
  proposedBy: string | null;
  threadId: string | null;
  messageId: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  expiresAt: string;
  createdAt: string;
}

// --- Library pages ----------------------------------------------------------------------------

export interface PageRow {
  id: string;
  workspaceId: string;
  ownerId: string | null;
  folder: string;
  kind: string;
  title: string;
  body: string;
  material: unknown;
  revision: number;
  visibility: 'private' | 'workspace';
  status: 'draft' | 'approved' | 'archived';
  sourceGenerationId: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface PageRevisionRow { pageId: string; revision: number; title: string; body: string; material: unknown; authorId: string | null; createdAt: string }
export interface PageQuery {
  workspaceId: string;
  viewerId: string;
  /** Owners and admins see every page in the workspace. */
  manager: boolean;
  scope: 'mine' | 'workspace' | 'all';
  folder?: string | null;
  kind?: string;
  status?: PageRow['status'];
  query?: string;
  limit: number;
  before?: string;
}
export type PagePatch = Partial<Pick<PageRow, 'title' | 'body' | 'material' | 'folder' | 'visibility' | 'status'>>;

export interface ReportRow { id: string; messageId: string | null; workspaceId: string | null; reporterId: string | null; reason: string; note: string | null; excerpt: string; status: 'open' | 'reviewed' | 'dismissed'; createdAt: string }
export interface AuditEvent { workspaceId: string | null; actorId: string | null; event: string; targetType?: string | null; targetId?: string | null; details?: Record<string, unknown> }
export interface AuditRow extends AuditEvent { id: number; createdAt: string }

// --- Learning events and notifications ------------------------------------------------------

export const LEARNING_EVENT_KINDS = {
  /** A speaking, role-play or tutor turn the engine scored. */
  turn_scored: true,
  /** An answer or task passed its check. */
  check_passed: true,
  /** Attempted and checked, not passed: counted, never XP. */
  check_failed: false,
  /** A drill finished with a score. */
  drill_finished: true,
  /** A mock or assessment finished with a score. */
  mock_finished: true,
  /** Opened or read without a check: never verified. */
  lesson_viewed: false,
  goal_set: false,
  /** A real exam result or certificate. */
  outcome_recorded: true,
} as const;
export type LearningEventKind = keyof typeof LEARNING_EVENT_KINDS;
export interface LearningEventInput {
  kind: LearningEventKind;
  area: Area;
  /** Feature id (`B1`, `L3`) or credit key. */
  feature: string;
  /** Skill node, for example `ielts.speaking.fluency`. */
  skill?: string;
  /** Minutes of verified practice this act represents (0 for unverified kinds). */
  verified_minutes?: number;
  score?: number;
  /** `passed`, `failed`, `band_6_5`… */
  outcome?: string;
  /** The area's own id for the act (a session, a mock). */
  ref?: string;
}
export interface LearningEvent {
  userId: string;
  workspaceId: string | null;
  area: Area;
  kind: LearningEventKind;
  verified: boolean;
  feature: string;
  skill: string | null;
  verifiedMinutes: number;
  score: number | null;
  outcome: string | null;
  ref: string | null;
  source: 'web' | 'telegram' | 'system';
}
export type NotifyDecision = { allowed: true; remaining: number } | { allowed: false; reason: 'quiet_hours' | 'daily_limit' | 'muted'; retryAt: string };
export interface NotifyPrefs {
  timeZone: string;
  quietStart: number;
  quietEnd: number;
  /** 0 to 2 messages a day across every bot. */
  dailyLimit: number;
  /** The local hour they like messages, or null for any time. */
  preferredHour: number | null;
  delivery: ('telegram' | 'web')[];
  /** Kinds ("engage.winback") or whole areas ("engage") they opted out of. */
  muted: string[];
}
/** A minted Supabase session (ctx.auth.sessionFor). */
export interface MintedSession { access_token: string; refresh_token: string; expires_at: number }
export interface NotifyMessage {
  /** The kind registered with registerNotifyKind (`centre.brief`). */
  kind: string;
  /** Plain text, at most 4000 characters. */
  text: string;
  /** Buttons opening Schood AI pages (`/centre`), at most 4. */
  buttons?: { label: string; path: string }[];
  /** Sends once per key (a retried job does not send twice). */
  dedupeKey?: string;
}
export type NotifySendResult =
  | { sent: true }
  | { sent: false; reason: 'quiet_hours' | 'daily_limit' | 'muted' | 'delivery_off' | 'no_telegram' | 'deferred' | 'suppressed' | 'failed'; retryAt?: string | null };
export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { timeZone: 'Asia/Tashkent', quietStart: 22, quietEnd: 8, dailyLimit: 2, preferredHour: null, delivery: ['telegram', 'web'], muted: [] };
export type LearningEventRow = LearningEvent & { id: number; createdAt: string };
export interface SystemRunRow { job: string; lastRunAt: string | null; runningUntil: string | null; failures: number; lastStatus: 'ok' | 'failed' | 'timeout' | null; lastError: string | null; lastFinishedAt: string | null }

// --- Repository -------------------------------------------------------------------------------

/** Every read and write the function makes. repository.ts talks to Postgres; memory-repository.ts mirrors it for tests. */
export interface SchoodAIRepository {
  /** Verifies a Supabase access token. */
  user(token: string): Promise<AuthUser | null>;
  profile(userId: string): Promise<UserProfile | null>;
  /** The existing admin RBAC permissions of a person (admin-access.ts). */
  adminPermissions(userId: string, role: string): Promise<string[]>;
  /** Effective Schood product ids of a person, with access-effective's own logic (for owners and worker calls). */
  productsHeldBy(userId: string): Promise<string[]>;
  /** Earliest start of each product the person holds now (product id → ISO time). */
  productStarts(userId: string): Promise<Record<string, string>>;

  ensurePersonalWorkspace(userId: string, name: string): Promise<Workspace>;
  workspace(id: string): Promise<Workspace | null>;
  membership(workspaceId: string, userId: string): Promise<Member | null>;
  memberships(userId: string): Promise<{ workspace: Workspace; member: Member }[]>;
  updateWorkspace(id: string, patch: Partial<Pick<Workspace, 'name' | 'branding' | 'houseStyle' | 'settings' | 'status'>>): Promise<Workspace>;
  /** Workspaces by exact id or by name (admin console), newest first. */
  searchWorkspaces(query: string, limit: number): Promise<Workspace[]>;

  settings(): Promise<ServiceSettings>;
  updateSettings(patch: Partial<ServiceSettings>, actor: string): Promise<ServiceSettings>;
  registry(): Promise<Registry>;
  saveProvider(provider: RegistryProvider, actor: string): Promise<void>;
  saveModel(model: RegistryModel, actor: string): Promise<void>;
  saveRoute(route: RegistryRoute, actor: string): Promise<void>;

  takeCall(input: { day: string; userId: string | null; workspaceId: string | null; globalCap: number; userCap: number; workspaceCap: number; globalUsd: number | null }): Promise<{ ok: true } | { ok: false; scope: CapScope }>;
  recordCalls(rows: CallRecord[]): Promise<void>;
  usage(since: Date): Promise<UsageRow[]>;

  creditBalance(workspaceId: string, grant: number, anchor: string | null): Promise<Balance>;
  charge(input: { workspaceId: string; userId: string | null; cost: number; creditKey: string; reference: string; grant: number; anchor: string | null }): Promise<ChargeOutcome>;
  refund(chargeId: string): Promise<{ refunded: number }>;
  grantCredits(input: { workspaceId: string; amount: number; kind: 'pack' | 'adjust'; reference: string; userId: string | null }): Promise<Balance>;
  ledger(workspaceId: string, options: { userId?: string; limit: number }): Promise<LedgerRow[]>;

  threads(workspaceId: string, userId: string, limit: number): Promise<Thread[]>;
  thread(id: string): Promise<Thread | null>;
  createThread(input: Pick<Thread, 'workspaceId' | 'userId' | 'specialistKey' | 'pageId' | 'title'>): Promise<Thread>;
  updateThread(id: string, patch: Partial<Pick<Thread, 'title' | 'pinned'>> & { touch?: boolean }): Promise<Thread | null>;
  deleteThreads(workspaceId: string, userId: string, ids: string[] | 'all'): Promise<number>;
  messages(threadId: string, limit: number): Promise<Message[]>;
  message(id: string): Promise<Message | null>;
  /** Returns null when the thread already has a message with this client id. */
  addMessage(input: Omit<Message, 'id' | 'createdAt'>): Promise<Message | null>;
  updateMessage(id: string, patch: Partial<Pick<Message, 'content' | 'status' | 'callId' | 'errorCode' | 'credits' | 'chargeId'>>): Promise<void>;
  deleteMessage(id: string): Promise<void>;

  specialists(workspaceId: string): Promise<SpecialistRow[]>;
  /** Creates or replaces a workspace's override or custom specialist. */
  saveSpecialist(workspaceId: string, row: SpecialistRow, actor: string): Promise<void>;
  deleteSpecialist(workspaceId: string, key: string): Promise<boolean>;

  createAction(input: Pick<ActionRow, 'workspaceId' | 'kind' | 'payload' | 'summary' | 'proposedBy' | 'threadId' | 'messageId' | 'expiresAt'>): Promise<ActionRow>;
  action(id: string): Promise<ActionRow | null>;
  actions(workspaceId: string, options: { statuses?: ActionStatus[]; limit: number }): Promise<ActionRow[]>;
  /** Moves an action only if it is still in one of `from` (the race guard); returns the new row or null. */
  transitionAction(id: string, from: ActionStatus[], patch: Partial<ActionRow>): Promise<ActionRow | null>;

  createGeneration(input: Pick<GenerationRow, 'workspaceId' | 'userId' | 'feature' | 'input'> & Partial<GenerationRow>): Promise<GenerationRow>;
  generation(id: string): Promise<GenerationRow | null>;
  generations(workspaceId: string, userId: string | null, limit: number): Promise<GenerationRow[]>;
  /** Updates only while the job is in one of `from` when given. */
  updateGeneration(id: string, patch: Partial<GenerationRow>, from?: GenerationStatus[]): Promise<GenerationRow | null>;

  createReport(input: Omit<ReportRow, 'id' | 'status' | 'createdAt'>): Promise<{ id: string; created: boolean }>;
  reports(status: ReportRow['status'], limit: number): Promise<ReportRow[]>;
  reviewReport(id: string, status: 'reviewed' | 'dismissed', actor: string): Promise<boolean>;
  audit(event: AuditEvent): Promise<void>;
  /** The audit log, newest first (admin console). */
  auditEvents(filter: { workspaceId?: string; prefix?: string; before?: number; limit: number }): Promise<AuditRow[]>;

  addLearningEvents(events: LearningEvent[]): Promise<void>;
  /** A person's learning events in order, after an id (tests, dev stacks and areas that fold events). */
  learningEvents(filter: { userId: string; afterId?: number; limit: number }): Promise<LearningEventRow[]>;

  createPage(input: Pick<PageRow, 'workspaceId' | 'ownerId' | 'folder' | 'kind' | 'title' | 'body' | 'material' | 'visibility' | 'status' | 'sourceGenerationId'>): Promise<PageRow>;
  page(id: string): Promise<PageRow | null>;
  /** Visible pages, newest first: `mine` (owned), `workspace` (shared), `all` (owned or shared; managers: everything). Archived only when asked. */
  pages(query: PageQuery): Promise<PageRow[]>;
  /** Saves only at the expected revision (ai_page_save). */
  savePage(id: string, expectedRevision: number, patch: PagePatch, authorId: string, snapshot: boolean): Promise<{ ok: true; page: PageRow } | { ok: false; code: 'not_found' | 'revision_conflict'; current: PageRow | null }>;
  deletePage(id: string): Promise<boolean>;
  pageRevisions(pageId: string, limit: number): Promise<PageRevisionRow[]>;
  pageRevision(pageId: string, revision: number): Promise<PageRevisionRow | null>;
  /** Folders of the visible pages, with counts. */
  folders(query: Pick<PageQuery, 'workspaceId' | 'viewerId' | 'manager'>): Promise<{ path: string; count: number }[]>;
  /** Moves pages in `from` (and below) to `to`, only those the viewer may edit. */
  moveFolder(query: Pick<PageQuery, 'workspaceId' | 'viewerId' | 'manager'>, from: string, to: string): Promise<number>;
  notify(userId: string, channel: string, take: boolean): Promise<NotifyDecision>;
  notifyPrefs(userId: string): Promise<NotifyPrefs>;
  saveNotifyPrefs(userId: string, prefs: NotifyPrefs): Promise<NotifyPrefs>;
  /** One hit in a fixed window for a bucket (anonymous routes); false when the window is full. */
  takeRate(bucket: string, limit: number, windowSeconds: number): Promise<{ ok: true; remaining: number } | { ok: false; retryAt: string }>;
  /** internal_runtime_secrets.schood_ai_system_secret, which pg_cron sends to system routes. */
  systemSecret(): Promise<string | null>;
  /** Claims a scheduled job for the period that started at periodStart (ai_system_claim). */
  claimSystemJob(job: string, periodStart: string, leaseSeconds: number): Promise<boolean>;
  finishSystemJob(job: string, status: 'ok' | 'failed' | 'timeout', error: string | null): Promise<void>;
  systemRuns(): Promise<SystemRunRow[]>;
}

// --- The request context -----------------------------------------------------------------------

export interface ContextBlock {
  kind: string;
  /** Shown to the learner ("Your Schood results") and to the model as the block's label. */
  title: string;
  /** JSON-serialisable data. It reaches the model as delimited data, never as instructions. */
  data: unknown;
}

export interface ChargedCall {
  /** The model never comes from a feature: only the credit key and its requirements. */
  key: CreditKey | string;
  addOns?: string[];
  /** Idempotency for the charge; defaults to the request's Idempotency-Key or a fresh id. */
  reference?: string;
  messages: ChatMessage[];
  requires?: { capabilities?: Capability[]; noTraining?: boolean };
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}
/** `replayed`: the same idempotency key was already charged, so this is a repeat of that request. */
export interface ChargeReceipt { credits: number; chargeId: string; balance: Balance; replayed: boolean }
export interface PreparedStream extends ChargeReceipt {
  callId: string;
  /** Runs the stream. Failure refunds; a stop by the person keeps the charge. Never throws. */
  run(onDelta: (text: string) => void, signal?: AbortSignal): Promise<{ status: 'ok' | 'stopped' | 'failed'; text: string; code?: string; modelKey: string | null }>;
}
/** Model calls bound to one charge, for features that need several calls (a checked answer key). */
export interface ChargedSession {
  text(input: Omit<ChargedCall, 'key' | 'addOns' | 'reference'>): Promise<string>;
  json<T>(input: Omit<ChargedCall, 'key' | 'addOns' | 'reference'> & { schema: Schema<T> }): Promise<T>;
  transcribe(input: { audio: Uint8Array; mime: string; language?: string }): Promise<Transcript>;
  speak(input: { text: string; voice?: string; format?: 'mp3' | 'opus' | 'wav' }): Promise<SpeechAudio>;
}
/**
 * Every AI call from a route goes through here: plan and role check, switches,
 * route availability, charge before the call, automatic refund on failure. Errors
 * are SchoodAIError with codes plan_required, role_required, ai_disabled,
 * ai_unavailable, capped, insufficient_credits, budget_exhausted, ai_failed.
 */
export interface ChargedAI {
  text(input: ChargedCall): Promise<ChargeReceipt & { text: string; callId: string }>;
  json<T>(input: ChargedCall & { schema: Schema<T> }): Promise<ChargeReceipt & { data: T; callId: string }>;
  stream(input: ChargedCall): Promise<PreparedStream>;
  transcribe(input: { key: string; audio: Uint8Array; mime: string; language?: string; reference?: string }): Promise<ChargeReceipt & { transcript: Transcript }>;
  speak(input: { key: string; text: string; voice?: string; format?: 'mp3' | 'opus' | 'wav'; reference?: string }): Promise<ChargeReceipt & SpeechAudio>;
  /** `mode` is what the first call does, so availability is checked for it before charging (default text). */
  charged<R>(input: { key: string; addOns?: string[]; reference?: string; requires?: ChargedCall['requires']; mode?: 'text' | 'json' | 'stt' | 'tts' }, work: (session: ChargedSession) => Promise<R>): Promise<ChargeReceipt & { result: R }>;
}

export interface ActionView extends ActionRow { canApprove: boolean; display: Record<string, string>; interrupted: boolean; retrySafe: boolean }
export interface ActionService {
  /** Queues an action for Approve & run. The stored payload is exactly what runs. */
  propose(input: { kind: string; payload: unknown; threadId?: string | null; messageId?: string | null }): Promise<ActionView>;
  list(options?: { statuses?: ActionStatus[]; limit?: number }): Promise<ActionView[]>;
  /** One action, if you proposed it or may approve it; otherwise not_found. */
  get(id: string): Promise<ActionView>;
  decide(id: string, decision: 'approve' | 'decline' | 'retry'): Promise<ActionView>;
}

export interface FunctionCallInit {
  method?: Method;
  query?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  maxBytes?: number;
  /** Only Idempotency-Key and If-Match (Assessment Cloud commands need them); anything else is refused. */
  headers?: Record<string, string>;
}
/** Limits and CORS for an anonymous route. */
export interface AnonymousOptions {
  /** Per caller IP, or per rateKey when it returns one. 1 to 600 a minute (3000 with a rateKey). */
  perMinute?: number;
  /** Up to 100000 a day (1000000 with a rateKey). */
  perDay?: number;
  /**
   * Whose budget a request uses instead of the caller IP: a Telegram webhook's bot, a Live Quiz game.
   * Return the key only when the request names something you know (a bot by the hash of its secret
   * token, an open game by its code); return null otherwise, so unknown or forged callers stay limited
   * per IP. `body()` is the parsed JSON body (null when it is not JSON); the route can still read it.
   * Hashed before it is stored. A per-IP ceiling (ipLimit) still applies to keyed requests.
   */
  rateKey?(req: Request, input: { store<T>(handle: StoreHandle<T>): T; body(): Promise<unknown> }): string | null | Promise<string | null>;
  /**
   * The per-IP ceiling for requests a rateKey keyed, across all keys (a whole school behind one
   * address). Default 3000 a minute and 300000 a day; at most 6000 and 2000000.
   */
  ipLimit?: { perMinute?: number; perDay?: number };
  /**
   * The per-IP limit for requests your rateKey did not recognise (it returned null): made-up game
   * codes or tokens. Default: the ordinary anonymous limit (30 a minute, 1000 a day), and never above
   * this route's own perMinute and perDay or the ordinary maximum (600 a minute, 100000 a day).
   */
  unkeyedLimit?: { perMinute?: number; perDay?: number };
  /**
   * `'any'`: answer CORS for any Origin (an embeddable widget on a centre's own site). Core echoes the
   * Origin with no credentials; the route must check ctx.origin against the centre's own list and refuse others.
   */
  cors?: 'any';
}
/** Who is calling: a signed-in person, the Telegram worker for a linked person, a scheduled job, or nobody signed in. */
export type Caller = 'user' | 'service' | 'system' | 'anonymous';
export interface SpendReceipt extends ChargeReceipt {
  /** Gives the credits back (for example when the thing bought could not be delivered). Refunding twice refunds once. */
  refund(): Promise<void>;
}

export interface RequestContext {
  requestId: string;
  area: Area;
  action: string;
  method: Method;
  url: URL;
  query: URLSearchParams;
  /** The parsed JSON body (an object), read once; throws invalid_request otherwise. */
  body<T = Record<string, unknown>>(): Promise<T>;
  /** The raw body, for audio uploads. */
  bytes(): Promise<Uint8Array>;
  idempotencyKey: string | null;
  locale: Locale;
  /** The person calling. On system and anonymous routes reading it throws (check ctx.caller first). */
  user: RequestUser;
  caller: Caller;
  /** The request headers (read-only), for routes that check their own callers (a Telegram webhook's secret token). */
  headers: Headers;
  /** The Origin header, or null. */
  origin: string | null;
  /** The plan of any workspace, for example to check seats before someone joins a centre. Throws workspace_not_found. */
  planFor(workspaceId: string): Promise<PlanState>;
  /**
   * System and anonymous routes: charged AI paid by a named workspace's pool, with that workspace's
   * plan, switches and caps (no member budget, no user on the ledger). Anonymous routes may name only an
   * active centre. Signed-in routes use ctx.ai, which charges the caller's own workspace.
   */
  paidBy(workspaceId: string): Promise<ChargedAI>;
  /** Priced actions that make no model call (a streak freeze): plan, role, age and switches apply, idempotent per reference. */
  credits: { spend(input: { key: string; addOns?: string[]; reference?: string }): Promise<SpendReceipt> };
  now(): Date;
  repo: SchoodAIRepository;
  gateway: Gateway;
  ai: ChargedAI;
  actions: ActionService;
  /** The library: create, get, save and list pages with the same rules as the core/page routes. */
  library: LibraryService;
  /** Your area's own tables (stores.ts defineStore): Postgres when deployed, the memory twin in tests. */
  store<T>(handle: StoreHandle<T>): T;
  events: { emit(event: LearningEventInput): void };
  notify: {
    allowed(userId: string, channel: string): Promise<NotifyDecision>;
    take(userId: string, channel: string): Promise<NotifyDecision>;
    /** The person's own choices: preferred hour, delivery (telegram, web), muted kinds, quiet hours, zone. */
    prefs(userId: string): Promise<NotifyPrefs>;
    /** Sends through the Schood bot (send-telegram) inside the budget: their delivery choice, mutes, quiet hours and daily limit apply. */
    send(userId: string, message: NotifyMessage): Promise<NotifySendResult>;
  };
  auth: {
    /**
     * A Supabase session for a person your route has already verified (a Telegram Mini App's signed
     * initData). `reason` names why, `<area>.<what>` (`coach.mini_app`). Audited, limited (10 an hour
     * and 30 a day per person, 2000 an hour per area), never for Schood admins or inactive accounts.
     * A signed-in caller may mint only their own. Hand the tokens to that person only; never log or store them.
     */
    sessionFor(userId: string, options: { reason: string }): Promise<MintedSession>;
  };
  /** The workspace in `?workspace_id=` (or the personal one) with the caller's active membership. */
  workspace(options?: { roles?: readonly Role[] }): Promise<WorkspaceAccess>;
  plan(): Promise<PlanState>;
  /** Plan and role decision for a feature id (`L3`) or credit key (`writing.feedback`) here. */
  access(featureOrKey: string): Promise<AccessDecision>;
  /** Throws plan_required or role_required unless the feature is usable here. */
  requireFeature(featureOrKey: string): Promise<WorkspaceAccess>;
  /** Runs the registered context providers for these kinds; a failing provider is skipped. */
  context(kinds: readonly string[], input?: { ref?: string; specialist?: string }): Promise<ContextBlock[]>;
  /** Calls another Schood Edge Function with the person's own token, so its permissions apply. */
  functions: { call<T = unknown>(name: string, path?: string, init?: FunctionCallInit): Promise<T> };
  isSchoodAdmin(): Promise<boolean>;
  audit(event: string, details?: Record<string, unknown>, target?: { type: string; id: string }): Promise<void>;
  /** Work that runs after the response; failures are logged, never shown. */
  after(work: () => Promise<unknown>): void;
  /** A server-sent events response with this request's headers; `signal` aborts when the person leaves. */
  sse(produce: (send: (event: string, data: unknown) => void, signal: AbortSignal) => Promise<void>): Response;
}
