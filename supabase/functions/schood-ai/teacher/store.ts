// The teacher area's own tables (migration 20261030300000_schood_ai_teacher.sql):
// handouts, Live Quiz, marking, channel autopilot, marketplace and the tutor brand
// kit. Materials themselves stay in core's ai_generations until the shared library
// lands (see library.ts). pg-store.ts talks to Postgres; memory-store.ts mirrors it.

export type QuizStatus = 'lobby' | 'question' | 'reveal' | 'finished';
export interface QuizQuestionSnapshot { id: string; prompt: string; options: { id: string; text: string }[]; answer: string; explanation?: string; context?: string }
export interface AcademyGroup { academy_id: string; classroom_id: string; classroom_name: string }
export interface QuizSession {
  id: string;
  workspaceId: string;
  hostId: string;
  generationId: string | null;
  title: string;
  code: string;
  status: QuizStatus;
  currentIndex: number;
  questionStartedAt: string | null;
  questions: QuizQuestionSnapshot[];
  secondsPerQuestion: number;
  classLabel: string | null;
  group: AcademyGroup | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}
export interface QuizPlayer { id: string; sessionId: string; userId: string | null; nickname: string; tokenHash: string; score: number; correct: number; answered: number; joinedAt: string; removed: boolean }
export interface QuizAnswer { sessionId: string; playerId: string; index: number; choice: string; correct: boolean; points: number; answeredAt: string }

export type ScriptSource = 'typed' | 'pasted' | 'photo' | 'recording' | 'transcript';
export type ScriptStatus = 'new' | 'marking' | 'marked' | 'failed' | 'confirmed';
export interface MarkingBatch {
  id: string;
  workspaceId: string;
  ownerId: string;
  title: string;
  rubric: string;
  task: string;
  level: string | null;
  feedbackLanguage: 'en' | 'uz' | 'ru';
  status: 'open' | 'confirmed';
  createdAt: string;
  updatedAt: string;
}
export interface Script {
  id: string;
  batchId: string;
  workspaceId: string;
  studentLabel: string;
  source: ScriptSource;
  text: string | null;
  /** How the text was written, when the app knows (pasted characters, typing time): Homework OS-style signals. */
  meta: Record<string, unknown>;
  draft: Record<string, unknown> | null;
  final: Record<string, unknown> | null;
  signals: Record<string, unknown> | null;
  status: ScriptStatus;
  errorCode: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PostKind = 'word' | 'quiz' | 'tip';
export type PostStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
export interface ChannelSchedule { time: string; days: number[]; kinds: PostKind[] }
export interface Channel {
  id: string;
  workspaceId: string;
  ownerId: string;
  chatId: string;
  title: string;
  username: string | null;
  voice: string;
  language: 'en' | 'uz' | 'ru';
  level: string;
  topics: string;
  schedule: ChannelSchedule;
  status: 'pending' | 'verified' | 'error';
  verifiedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ChannelBatch {
  id: string;
  channelId: string;
  workspaceId: string;
  weekStart: string;
  status: 'generating' | 'draft' | 'proposed' | 'approved' | 'cancelled';
  actionId: string | null;
  createdBy: string;
  credits: number;
  createdAt: string;
  updatedAt: string;
}
export interface PostContent { text?: string; poll?: { question: string; options: string[]; correct: number; explanation?: string } }
export interface ChannelPost {
  id: string;
  channelId: string;
  workspaceId: string;
  batchId: string;
  kind: PostKind;
  content: PostContent;
  scheduledFor: string;
  status: PostStatus;
  messageId: string | null;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export type ListingStatus = 'draft' | 'pending' | 'published' | 'rejected' | 'withdrawn';
export interface Listing {
  id: string;
  sellerWorkspaceId: string;
  sellerId: string;
  sellerName: string;
  sourceGenerationId: string | null;
  title: string;
  description: string;
  kind: string;
  level: string;
  exam: string | null;
  language: 'en' | 'uz' | 'ru';
  tags: string[];
  material: Record<string, unknown>;
  priceUzs: number;
  status: ListingStatus;
  moderationNote: string | null;
  moderatedBy: string | null;
  moderatedAt: string | null;
  ratingSum: number;
  ratingCount: number;
  usageCount: number;
  copies: number;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}
export interface ListingRating { listingId: string; userId: string; stars: number; comment: string | null; createdAt: string }
export interface ListingCopy { id: string; listingId: string; workspaceId: string; userId: string; generationId: string; priceUzs: number; createdAt: string }
export interface SellerLedgerRow { id: number; listingId: string; sellerWorkspaceId: string; buyerWorkspaceId: string; grossUzs: number; commissionUzs: number | null; netUzs: number | null; status: 'pending' | 'cleared' | 'reversed'; reference: string; createdAt: string }
export interface ListingQuery { text?: string; kind?: string; level?: string; exam?: string; language?: string; price?: 'free' | 'paid' | 'any'; sort?: 'rating' | 'usage' | 'new'; limit: number; offset: number }

export interface BrandProfile { workspaceId: string; ownerId: string; displayName: string; subjects: string; city: string; experienceYears: number | null; format: string; contact: string; about: string; updatedAt: string }
export interface TutorResult { id: string; workspaceId: string; ownerId: string; studentLabel: string; consent: boolean; exam: string; score: string; previousScore: string | null; achievedOn: string; note: string | null; createdAt: string }

export interface Handout { id: string; workspaceId: string; generationId: string; tokenHash: string; createdBy: string; createdAt: string; revokedAt: string | null }

export interface TeacherStore {
  // Handouts: the student version of an approved material, opened by an unguessable link.
  createHandout(input: Pick<Handout, 'workspaceId' | 'generationId' | 'tokenHash' | 'createdBy'>): Promise<Handout>;
  handoutByHash(tokenHash: string): Promise<Handout | null>;
  revokeHandout(id: string, at: string): Promise<void>;

  // Live Quiz.
  /** Null when the code is already used by a session that is not finished. */
  createQuizSession(input: Omit<QuizSession, 'id' | 'createdAt' | 'updatedAt' | 'finishedAt' | 'status' | 'currentIndex' | 'questionStartedAt'>): Promise<QuizSession | null>;
  quizSession(id: string): Promise<QuizSession | null>;
  /** The open (not finished) session with this code. */
  quizSessionByCode(code: string): Promise<QuizSession | null>;
  quizSessions(workspaceId: string, hostId: string, limit: number): Promise<QuizSession[]>;
  /** Updates only while the session is in one of `from` (the race guard). */
  updateQuizSession(id: string, patch: Partial<Pick<QuizSession, 'status' | 'currentIndex' | 'questionStartedAt' | 'finishedAt'>>, from: QuizStatus[]): Promise<QuizSession | null>;
  /** Null when the nickname is taken in this session. */
  addQuizPlayer(input: Pick<QuizPlayer, 'sessionId' | 'userId' | 'nickname' | 'tokenHash'>): Promise<QuizPlayer | null>;
  quizPlayer(sessionId: string, tokenHash: string): Promise<QuizPlayer | null>;
  quizPlayerByUser(sessionId: string, userId: string): Promise<QuizPlayer | null>;
  /** Best first; removed players are left out. */
  quizPlayers(sessionId: string): Promise<QuizPlayer[]>;
  removeQuizPlayer(sessionId: string, playerId: string): Promise<boolean>;
  /** One answer per player and question; adds the points. False when already answered. */
  answerQuiz(input: Omit<QuizAnswer, 'answeredAt'>): Promise<boolean>;
  quizAnswers(sessionId: string, index?: number): Promise<QuizAnswer[]>;

  // Marking (T3, T14, T15).
  createBatch(input: Omit<MarkingBatch, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<MarkingBatch>;
  batch(id: string): Promise<MarkingBatch | null>;
  batches(workspaceId: string, ownerId: string | null, limit: number): Promise<(MarkingBatch & { scripts: number; confirmed: number })[]>;
  updateBatch(id: string, patch: Partial<Pick<MarkingBatch, 'title' | 'task' | 'status' | 'level'>>): Promise<MarkingBatch | null>;
  addScript(input: Pick<Script, 'batchId' | 'workspaceId' | 'studentLabel' | 'source' | 'text' | 'meta'>): Promise<Script>;
  script(id: string): Promise<Script | null>;
  scripts(batchId: string): Promise<Script[]>;
  /** Updates only while the script is in one of `from` when given. */
  updateScript(id: string, patch: Partial<Omit<Script, 'id' | 'batchId' | 'workspaceId' | 'createdAt'>>, from?: ScriptStatus[]): Promise<Script | null>;
  deleteScript(id: string): Promise<void>;

  // Channel autopilot (T11).
  createChannel(input: Omit<Channel, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'verifiedAt' | 'lastError'>): Promise<Channel | null>;
  channel(id: string): Promise<Channel | null>;
  channels(workspaceId: string): Promise<Channel[]>;
  updateChannel(id: string, patch: Partial<Omit<Channel, 'id' | 'workspaceId' | 'ownerId' | 'createdAt'>>): Promise<Channel | null>;
  deleteChannel(id: string): Promise<void>;
  createChannelBatch(input: Pick<ChannelBatch, 'channelId' | 'workspaceId' | 'weekStart' | 'createdBy'>): Promise<ChannelBatch>;
  channelBatch(id: string): Promise<ChannelBatch | null>;
  channelBatches(channelId: string, limit: number): Promise<ChannelBatch[]>;
  updateChannelBatch(id: string, patch: Partial<Pick<ChannelBatch, 'status' | 'actionId' | 'credits'>>, from?: ChannelBatch['status'][]): Promise<ChannelBatch | null>;
  addChannelPosts(posts: Pick<ChannelPost, 'channelId' | 'workspaceId' | 'batchId' | 'kind' | 'content' | 'scheduledFor'>[]): Promise<ChannelPost[]>;
  channelPosts(batchId: string): Promise<ChannelPost[]>;
  channelPost(id: string): Promise<ChannelPost | null>;
  updateChannelPost(id: string, patch: Partial<Pick<ChannelPost, 'content' | 'scheduledFor' | 'status' | 'messageId' | 'attempts' | 'lastError' | 'sentAt'>>, from?: PostStatus[]): Promise<ChannelPost | null>;
  /** Scheduled posts due by `now`, oldest first, for these workspaces (all when null). */
  duePosts(now: string, limit: number, workspaceIds: string[] | null): Promise<ChannelPost[]>;
  /** Posts sent to a channel since a time (posting limits). */
  sentSince(channelId: string, since: string): Promise<number>;

  // Marketplace (T12). Money never moves here: paid listings sit behind a switch that ships off.
  createListing(input: Omit<Listing, 'id' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'ratingSum' | 'ratingCount' | 'usageCount' | 'copies' | 'moderationNote' | 'moderatedBy' | 'moderatedAt'>): Promise<Listing>;
  listing(id: string): Promise<Listing | null>;
  updateListing(id: string, patch: Partial<Pick<Listing, 'title' | 'description' | 'tags' | 'priceUzs' | 'status' | 'moderationNote' | 'moderatedBy' | 'moderatedAt' | 'publishedAt' | 'material'>>, from?: ListingStatus[]): Promise<Listing | null>;
  searchListings(query: ListingQuery): Promise<{ rows: Listing[]; total: number }>;
  sellerListings(workspaceId: string): Promise<Listing[]>;
  moderationQueue(limit: number): Promise<Listing[]>;
  /** One rating per person; replaces their earlier one and keeps the listing's totals exact. */
  rateListing(input: Omit<ListingRating, 'createdAt'>): Promise<Listing | null>;
  ratings(listingId: string, limit: number): Promise<ListingRating[]>;
  /** Null when this workspace already has a copy. */
  addCopy(input: Omit<ListingCopy, 'id' | 'createdAt'>): Promise<ListingCopy | null>;
  copyFor(listingId: string, workspaceId: string): Promise<ListingCopy | null>;
  copyByGeneration(generationId: string): Promise<ListingCopy | null>;
  /** Verified use (assigned, played, printed) by a workspace that holds a copy; counted once per workspace. */
  recordUse(listingId: string, workspaceId: string, kind: 'homework' | 'live_quiz' | 'print' | 'assessment'): Promise<boolean>;
  addLedger(row: Omit<SellerLedgerRow, 'id' | 'createdAt'>): Promise<SellerLedgerRow | null>;
  ledger(sellerWorkspaceId: string, limit: number): Promise<SellerLedgerRow[]>;

  // Tutor brand kit (T13): only what the tutor entered.
  brandProfile(workspaceId: string): Promise<BrandProfile | null>;
  saveBrandProfile(profile: Omit<BrandProfile, 'updatedAt'>): Promise<BrandProfile>;
  results(workspaceId: string): Promise<TutorResult[]>;
  addResult(input: Omit<TutorResult, 'id' | 'createdAt'>): Promise<TutorResult>;
  deleteResult(workspaceId: string, id: string): Promise<boolean>;
}
