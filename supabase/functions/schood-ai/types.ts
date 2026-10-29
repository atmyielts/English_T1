import type {
  AccessDecision, Capability, CreditKey, PlanCode, Registry, RegistryModel, RegistryProvider, RegistryRoute, Role, Schema, Switches, WorkspaceKind,
} from '../../../packages/ai-core/src/mod.ts';
import type { ChatMessage, SpeechAudio, Transcript } from './providers/types.ts';
export type { PlanCode, Role, WorkspaceKind } from '../../../packages/ai-core/src/mod.ts';
export type { ChatMessage, ContentPart, SpeechAudio, Transcript } from './providers/types.ts';
import type { Gateway } from './gateway.ts';
import type { LibraryService } from './library.ts';

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

export interface ReportRow { id: string; messageId: string | null; workspaceId: string | null; reporterId: string | null; reason: string; note: string | null; excerpt: string; status: 'open' | 'reviewed' | 'dismissed'; createdAt: string }
export interface AuditEvent { workspaceId: string | null; actorId: string | null; event: string; targetType?: string | null; targetId?: string | null; details?: Record<string, unknown> }

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
export type NotifyDecision = { allowed: true; remaining: number } | { allowed: false; reason: 'quiet_hours' | 'daily_limit'; retryAt: string };

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
  updateWorkspace(id: string, patch: Partial<Pick<Workspace, 'name' | 'branding' | 'houseStyle' | 'settings'>>): Promise<Workspace>;

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
  charge(input: { workspaceId: string; userId: string; cost: number; creditKey: string; reference: string; grant: number; anchor: string | null }): Promise<ChargeOutcome>;
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

  addLearningEvents(events: LearningEvent[]): Promise<void>;
  notify(userId: string, channel: string, take: boolean): Promise<NotifyDecision>;
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

export interface FunctionCallInit { method?: Method; query?: Record<string, string>; body?: unknown; timeoutMs?: number; maxBytes?: number }

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
  user: RequestUser;
  now(): Date;
  repo: SchoodAIRepository;
  gateway: Gateway;
  ai: ChargedAI;
  actions: ActionService;
  /** The library: create, get, save and list pages with the same rules as the core/page routes. */
  library: LibraryService;
  events: { emit(event: LearningEventInput): void };
  notify: { allowed(userId: string, channel: string): Promise<NotifyDecision>; take(userId: string, channel: string): Promise<NotifyDecision> };
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
