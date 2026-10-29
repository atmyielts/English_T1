import type {
  BrandProfile, Channel, ChannelBatch, ChannelPost, Handout, Listing, ListingCopy, ListingRating, MarkingBatch, QuizAnswer, QuizPlayer, QuizSession,
  Script, SellerLedgerRow, TeacherStore, TutorResult,
} from './store.ts';

// The teacher store over Postgres through the service role (the same client shape as
// core's repository.ts). Totals that race go through the SQL functions of
// 20261030300000_schood_ai_teacher.sql; everything else is plain table access the
// routes have already authorised.

type DbError = { code?: string; message: string } | null;
type Result<T> = { data: T | null; error: DbError };
// deno-lint-ignore no-explicit-any
type Query = any;
export interface TeacherDatabase {
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Result<unknown>>;
}
type Row = Record<string, unknown>;

function check<T>(result: Result<T>): T {
  if (result.error) throw new Error(`${result.error.code ?? 'db'}: ${result.error.message}`);
  return result.data as T;
}
const unique = (result: Result<unknown>) => result.error?.code === '23505';
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
const arr = <T = unknown>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

const handout = (row: Row): Handout => ({ id: String(row.id), workspaceId: String(row.workspace_id), pageId: String(row.page_id), tokenHash: String(row.token_hash), createdBy: String(row.created_by ?? ''), createdAt: String(row.created_at), revokedAt: str(row.revoked_at) });
const session = (row: Row): QuizSession => ({
  id: String(row.id), workspaceId: String(row.workspace_id), hostId: String(row.host_id), pageId: str(row.page_id), title: String(row.title), code: String(row.code),
  status: row.status as QuizSession['status'], currentIndex: Number(row.current_index), questionStartedAt: str(row.question_started_at), questions: arr(row.questions),
  secondsPerQuestion: Number(row.seconds_per_question), classLabel: str(row.class_label), group: row.academy_group ? obj(row.academy_group) as unknown as QuizSession['group'] : null,
  createdAt: String(row.created_at), updatedAt: String(row.updated_at), finishedAt: str(row.finished_at),
});
const player = (row: Row): QuizPlayer => ({
  id: String(row.id), sessionId: String(row.session_id), userId: str(row.user_id), nickname: String(row.nickname), tokenHash: String(row.token_hash),
  score: Number(row.score ?? 0), correct: Number(row.correct ?? 0), answered: Number(row.answered ?? 0), joinedAt: String(row.joined_at), removed: row.removed === true,
});
const answer = (row: Row): QuizAnswer => ({ sessionId: String(row.session_id), playerId: String(row.player_id), index: Number(row.question_index), choice: String(row.choice), correct: row.correct === true, points: Number(row.points ?? 0), answeredAt: String(row.answered_at) });
const batch = (row: Row): MarkingBatch => ({
  id: String(row.id), workspaceId: String(row.workspace_id), ownerId: String(row.owner_id), title: String(row.title), rubric: String(row.rubric), task: String(row.task ?? ''),
  level: str(row.level), feedbackLanguage: (row.feedback_language as MarkingBatch['feedbackLanguage']) ?? 'en', status: row.status === 'confirmed' ? 'confirmed' : 'open', createdAt: String(row.created_at), updatedAt: String(row.updated_at),
});
const script = (row: Row): Script => ({
  id: String(row.id), batchId: String(row.batch_id), workspaceId: String(row.workspace_id), studentLabel: String(row.student_label), source: row.source as Script['source'],
  text: str(row.text), meta: obj(row.meta), draft: row.draft ? obj(row.draft) : null, final: row.final ? obj(row.final) : null, signals: row.signals ? obj(row.signals) : null,
  status: row.status as Script['status'], errorCode: str(row.error_code), confirmedBy: str(row.confirmed_by), confirmedAt: str(row.confirmed_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
});
const channel = (row: Row): Channel => ({
  id: String(row.id), workspaceId: String(row.workspace_id), ownerId: String(row.owner_id), chatId: String(row.chat_id), title: String(row.title), username: str(row.username),
  voice: String(row.voice ?? ''), language: (row.language as Channel['language']) ?? 'uz', level: String(row.level ?? 'B1'), topics: String(row.topics ?? ''),
  schedule: { time: '09:00', days: [1, 2, 3, 4, 5], kinds: ['word', 'quiz', 'tip'], ...obj(row.schedule) } as Channel['schedule'],
  status: row.status as Channel['status'], verifiedAt: str(row.verified_at), lastError: str(row.last_error), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
});
const channelBatch = (row: Row): ChannelBatch => ({
  id: String(row.id), channelId: String(row.channel_id), workspaceId: String(row.workspace_id), weekStart: String(row.week_start), status: row.status as ChannelBatch['status'],
  actionId: str(row.action_id), createdBy: String(row.created_by), credits: Number(row.credits ?? 0), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
});
const post = (row: Row): ChannelPost => ({
  id: String(row.id), channelId: String(row.channel_id), workspaceId: String(row.workspace_id), batchId: String(row.batch_id), kind: row.kind as ChannelPost['kind'],
  content: obj(row.content) as ChannelPost['content'], scheduledFor: new Date(String(row.scheduled_for)).toISOString(), status: row.status as ChannelPost['status'],
  messageId: str(row.message_id), attempts: Number(row.attempts ?? 0), lastError: str(row.last_error), sentAt: str(row.sent_at), createdAt: String(row.created_at),
});
const listing = (row: Row): Listing => ({
  id: String(row.id), sellerWorkspaceId: String(row.seller_workspace_id), sellerId: String(row.seller_id), sellerName: String(row.seller_name), sourcePageId: str(row.source_page_id),
  title: String(row.title), description: String(row.description ?? ''), kind: String(row.kind), level: String(row.level), exam: str(row.exam), language: row.language as Listing['language'],
  tags: arr<string>(row.tags).map(String), material: obj(row.material), priceUzs: Number(row.price_uzs ?? 0), status: row.status as Listing['status'],
  moderationNote: str(row.moderation_note), moderatedBy: str(row.moderated_by), moderatedAt: str(row.moderated_at), ratingSum: Number(row.rating_sum ?? 0), ratingCount: Number(row.rating_count ?? 0),
  usageCount: Number(row.usage_count ?? 0), copies: Number(row.copies ?? 0), createdAt: String(row.created_at), updatedAt: String(row.updated_at), publishedAt: str(row.published_at),
});
const rating = (row: Row): ListingRating => ({ listingId: String(row.listing_id), userId: String(row.user_id), stars: Number(row.stars), comment: str(row.comment), createdAt: String(row.created_at) });
const copyRow = (row: Row): ListingCopy => ({ id: String(row.id), listingId: String(row.listing_id), workspaceId: String(row.workspace_id), userId: String(row.user_id), pageId: str(row.page_id), priceUzs: Number(row.price_uzs ?? 0), createdAt: String(row.created_at) });
const ledgerRow = (row: Row): SellerLedgerRow => ({
  id: Number(row.id), listingId: String(row.listing_id), sellerWorkspaceId: String(row.seller_workspace_id), buyerWorkspaceId: String(row.buyer_workspace_id), grossUzs: Number(row.gross_uzs),
  commissionUzs: row.commission_uzs === null || row.commission_uzs === undefined ? null : Number(row.commission_uzs), netUzs: row.net_uzs === null || row.net_uzs === undefined ? null : Number(row.net_uzs),
  status: row.status as SellerLedgerRow['status'], reference: String(row.reference), createdAt: String(row.created_at),
});
const profile = (row: Row): BrandProfile => ({
  workspaceId: String(row.workspace_id), ownerId: String(row.owner_id), displayName: String(row.display_name), subjects: String(row.subjects ?? ''), city: String(row.city ?? ''),
  experienceYears: row.experience_years === null || row.experience_years === undefined ? null : Number(row.experience_years), format: String(row.format ?? ''), contact: String(row.contact ?? ''), about: String(row.about ?? ''), updatedAt: String(row.updated_at),
});
const result = (row: Row): TutorResult => ({
  id: String(row.id), workspaceId: String(row.workspace_id), ownerId: String(row.owner_id), studentLabel: String(row.student_label), consent: row.consent === true, exam: String(row.exam),
  score: String(row.score), previousScore: str(row.previous_score), achievedOn: String(row.achieved_on), note: str(row.note), createdAt: String(row.created_at),
});

/** snake_case columns from a camelCase patch, for the fields a store method allows. */
function columns(patch: Record<string, unknown>, map: Record<string, string>): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(patch)) if (value !== undefined && map[key]) out[map[key]] = value;
  return out;
}
const SESSION_COLUMNS = { status: 'status', currentIndex: 'current_index', questionStartedAt: 'question_started_at', finishedAt: 'finished_at' };
const SCRIPT_COLUMNS = { studentLabel: 'student_label', source: 'source', text: 'text', meta: 'meta', draft: 'draft', final: 'final', signals: 'signals', status: 'status', errorCode: 'error_code', confirmedBy: 'confirmed_by', confirmedAt: 'confirmed_at', updatedAt: 'updated_at' };
const CHANNEL_COLUMNS = { chatId: 'chat_id', title: 'title', username: 'username', voice: 'voice', language: 'language', level: 'level', topics: 'topics', schedule: 'schedule', status: 'status', verifiedAt: 'verified_at', lastError: 'last_error' };
const POST_COLUMNS = { content: 'content', scheduledFor: 'scheduled_for', status: 'status', messageId: 'message_id', attempts: 'attempts', lastError: 'last_error', sentAt: 'sent_at' };
const LISTING_COLUMNS = { title: 'title', description: 'description', tags: 'tags', priceUzs: 'price_uzs', status: 'status', moderationNote: 'moderation_note', moderatedBy: 'moderated_by', moderatedAt: 'moderated_at', publishedAt: 'published_at', material: 'material' };
const like = (text: string) => `%${text.replace(/[%_\\,()]/g, ' ').trim()}%`;

export function createPgTeacherStore(db: TeacherDatabase): TeacherStore {
  const one = async <T>(query: PromiseLike<Result<Row | null>>, map: (row: Row) => T): Promise<T | null> => {
    const row = check(await query);
    return row ? map(row) : null;
  };
  const many = async <T>(query: PromiseLike<Result<Row[]>>, map: (row: Row) => T): Promise<T[]> => (check(await query) ?? []).map(map);

  return {
    async createHandout(input) {
      return handout(check(await db.from('ai_teacher_handouts').insert({ workspace_id: input.workspaceId, page_id: input.pageId, token_hash: input.tokenHash, created_by: input.createdBy }).select('*').single()));
    },
    handoutByHash: (hash) => one(db.from('ai_teacher_handouts').select('*').eq('token_hash', hash).maybeSingle(), handout),
    async revokeHandout(id, at) { check(await db.from('ai_teacher_handouts').update({ revoked_at: at }).eq('id', id).is('revoked_at', null)); },

    async createQuizSession(input) {
      const res = await db.from('ai_teacher_quiz_sessions').insert({
        workspace_id: input.workspaceId, host_id: input.hostId, page_id: input.pageId, title: input.title, code: input.code, questions: input.questions,
        seconds_per_question: input.secondsPerQuestion, class_label: input.classLabel, academy_group: input.group,
      }).select('*').single();
      if (unique(res)) return null;
      return session(check(res));
    },
    quizSession: (id) => one(db.from('ai_teacher_quiz_sessions').select('*').eq('id', id).maybeSingle(), session),
    quizSessionByCode: (code) => one(db.from('ai_teacher_quiz_sessions').select('*').eq('code', code).neq('status', 'finished').maybeSingle(), session),
    quizSessions: (workspaceId, hostId, limit) => many(db.from('ai_teacher_quiz_sessions').select('*').eq('workspace_id', workspaceId).eq('host_id', hostId).order('created_at', { ascending: false }).limit(limit), session),
    updateQuizSession: (id, patch, from) => one(db.from('ai_teacher_quiz_sessions').update(columns(patch, SESSION_COLUMNS)).eq('id', id).in('status', from).select('*').maybeSingle(), session),
    async addQuizPlayer(input) {
      const res = await db.from('ai_teacher_quiz_players').insert({ session_id: input.sessionId, user_id: input.userId, nickname: input.nickname, token_hash: input.tokenHash }).select('*').single();
      if (unique(res)) return null;
      return player(check(res));
    },
    quizPlayer: (sessionId, hash) => one(db.from('ai_teacher_quiz_players').select('*').eq('session_id', sessionId).eq('token_hash', hash).eq('removed', false).maybeSingle(), player),
    quizPlayerByUser: (sessionId, userId) => one(db.from('ai_teacher_quiz_players').select('*').eq('session_id', sessionId).eq('user_id', userId).eq('removed', false).maybeSingle(), player),
    quizPlayers: (sessionId) => many(db.from('ai_teacher_quiz_players').select('*').eq('session_id', sessionId).eq('removed', false).order('score', { ascending: false }).order('joined_at', { ascending: true }).limit(500), player),
    async removeQuizPlayer(sessionId, playerId) {
      const rows = check(await db.from('ai_teacher_quiz_players').update({ removed: true }).eq('id', playerId).eq('session_id', sessionId).eq('removed', false).select('id')) as Row[] | null;
      return !!rows?.length;
    },
    async answerQuiz(input) {
      return check(await db.rpc('ai_teacher_quiz_answer', { p_session: input.sessionId, p_player: input.playerId, p_index: input.index, p_choice: input.choice, p_correct: input.correct, p_points: input.points })) === true;
    },
    quizAnswers(sessionId, index) {
      let query = db.from('ai_teacher_quiz_answers').select('*').eq('session_id', sessionId);
      if (index !== undefined) query = query.eq('question_index', index);
      return many(query.limit(5000), answer);
    },

    async createBatch(input) {
      return batch(check(await db.from('ai_teacher_marking_batches').insert({ workspace_id: input.workspaceId, owner_id: input.ownerId, title: input.title, rubric: input.rubric, task: input.task, level: input.level, feedback_language: input.feedbackLanguage }).select('*').single()));
    },
    batch: (id) => one(db.from('ai_teacher_marking_batches').select('*').eq('id', id).maybeSingle(), batch),
    async batches(workspaceId, ownerId, limit) {
      let query = db.from('ai_teacher_marking_batches').select('*, ai_teacher_scripts(status)').eq('workspace_id', workspaceId);
      if (ownerId) query = query.eq('owner_id', ownerId);
      const rows = check(await query.order('created_at', { ascending: false }).limit(limit)) as Row[] | null;
      return (rows ?? []).map((row) => {
        const scripts = arr<Row>(row.ai_teacher_scripts);
        return { ...batch(row), scripts: scripts.length, confirmed: scripts.filter((entry) => entry.status === 'confirmed').length };
      });
    },
    updateBatch: (id, patch) => one(db.from('ai_teacher_marking_batches').update(columns(patch, { title: 'title', task: 'task', status: 'status', level: 'level' })).eq('id', id).select('*').maybeSingle(), batch),
    async addScript(input) {
      return script(check(await db.from('ai_teacher_scripts').insert({ batch_id: input.batchId, workspace_id: input.workspaceId, student_label: input.studentLabel, source: input.source, text: input.text, meta: input.meta }).select('*').single()));
    },
    script: (id) => one(db.from('ai_teacher_scripts').select('*').eq('id', id).maybeSingle(), script),
    scripts: (batchId) => many(db.from('ai_teacher_scripts').select('*').eq('batch_id', batchId).order('created_at', { ascending: true }).limit(200), script),
    updateScript(id, patch, from) {
      let query = db.from('ai_teacher_scripts').update(columns(patch, SCRIPT_COLUMNS)).eq('id', id);
      if (from) query = query.in('status', from);
      return one(query.select('*').maybeSingle(), script);
    },
    async deleteScript(id) { check(await db.from('ai_teacher_scripts').delete().eq('id', id)); },

    async createChannel(input) {
      const res = await db.from('ai_teacher_channels').insert({
        workspace_id: input.workspaceId, owner_id: input.ownerId, chat_id: input.chatId, title: input.title, username: input.username, voice: input.voice,
        language: input.language, level: input.level, topics: input.topics, schedule: input.schedule,
      }).select('*').single();
      if (unique(res)) return null;
      return channel(check(res));
    },
    channel: (id) => one(db.from('ai_teacher_channels').select('*').eq('id', id).maybeSingle(), channel),
    channels: (workspaceId) => many(db.from('ai_teacher_channels').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: true }).limit(20), channel),
    updateChannel: (id, patch) => one(db.from('ai_teacher_channels').update(columns(patch, CHANNEL_COLUMNS)).eq('id', id).select('*').maybeSingle(), channel),
    async deleteChannel(id) { check(await db.from('ai_teacher_channels').delete().eq('id', id)); },
    async createChannelBatch(input) {
      return channelBatch(check(await db.from('ai_teacher_channel_batches').insert({ channel_id: input.channelId, workspace_id: input.workspaceId, week_start: input.weekStart, created_by: input.createdBy }).select('*').single()));
    },
    channelBatch: (id) => one(db.from('ai_teacher_channel_batches').select('*').eq('id', id).maybeSingle(), channelBatch),
    channelBatches: (channelId, limit) => many(db.from('ai_teacher_channel_batches').select('*').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(limit), channelBatch),
    updateChannelBatch(id, patch, from) {
      let query = db.from('ai_teacher_channel_batches').update(columns(patch, { status: 'status', actionId: 'action_id', credits: 'credits' })).eq('id', id);
      if (from) query = query.in('status', from);
      return one(query.select('*').maybeSingle(), channelBatch);
    },
    async addChannelPosts(input) {
      if (!input.length) return [];
      return many(db.from('ai_teacher_channel_posts').insert(input.map((entry) => ({ channel_id: entry.channelId, workspace_id: entry.workspaceId, batch_id: entry.batchId, kind: entry.kind, content: entry.content, scheduled_for: entry.scheduledFor }))).select('*'), post);
    },
    channelPosts: (batchId) => many(db.from('ai_teacher_channel_posts').select('*').eq('batch_id', batchId).order('scheduled_for', { ascending: true }).limit(100), post),
    channelPost: (id) => one(db.from('ai_teacher_channel_posts').select('*').eq('id', id).maybeSingle(), post),
    updateChannelPost(id, patch, from) {
      let query = db.from('ai_teacher_channel_posts').update(columns(patch, POST_COLUMNS)).eq('id', id);
      if (from) query = query.in('status', from);
      return one(query.select('*').maybeSingle(), post);
    },
    duePosts(at, limit, workspaceIds) {
      let query = db.from('ai_teacher_channel_posts').select('*').eq('status', 'scheduled').lte('scheduled_for', at);
      if (workspaceIds) query = query.in('workspace_id', workspaceIds.length ? workspaceIds : ['00000000-0000-0000-0000-000000000000']);
      return many(query.order('scheduled_for', { ascending: true }).limit(limit), post);
    },
    async sentSince(channelId, since) {
      const res = await db.from('ai_teacher_channel_posts').select('id', { count: 'exact', head: true }).eq('channel_id', channelId).eq('status', 'sent').gte('sent_at', since);
      if (res.error) throw new Error(`${res.error.code ?? 'db'}: ${res.error.message}`);
      return Number(res.count ?? 0);
    },

    async createListing(input) {
      return listing(check(await db.from('ai_teacher_listings').insert({
        seller_workspace_id: input.sellerWorkspaceId, seller_id: input.sellerId, seller_name: input.sellerName, source_page_id: input.sourcePageId, title: input.title,
        description: input.description, kind: input.kind, level: input.level, exam: input.exam, language: input.language, tags: input.tags, material: input.material, price_uzs: input.priceUzs, status: input.status,
      }).select('*').single()));
    },
    listing: (id) => one(db.from('ai_teacher_listings').select('*').eq('id', id).maybeSingle(), listing),
    updateListing(id, patch, from) {
      let query = db.from('ai_teacher_listings').update(columns(patch, LISTING_COLUMNS)).eq('id', id);
      if (from) query = query.in('status', from);
      return one(query.select('*').maybeSingle(), listing);
    },
    async searchListings(input) {
      // The list never carries the material itself (the key stays with the buyer's copy).
      let query = db.from('ai_teacher_listings').select('id, seller_workspace_id, seller_id, seller_name, source_page_id, title, description, kind, level, exam, language, tags, price_uzs, status, rating_sum, rating_count, usage_count, copies, created_at, updated_at, published_at, moderation_note, moderated_by, moderated_at', { count: 'exact' }).eq('status', 'published');
      if (input.kind) query = query.eq('kind', input.kind);
      if (input.level) query = query.eq('level', input.level);
      if (input.exam) query = query.eq('exam', input.exam);
      if (input.language) query = query.eq('language', input.language);
      if (input.price === 'free') query = query.eq('price_uzs', 0);
      if (input.price === 'paid') query = query.gt('price_uzs', 0);
      for (const word of (input.text ?? '').split(/\s+/).filter((entry) => entry.length >= 2).slice(0, 5)) query = query.or(`title.ilike.${like(word)},description.ilike.${like(word)}`);
      query = input.sort === 'usage' ? query.order('usage_count', { ascending: false }) : input.sort === 'new' ? query.order('published_at', { ascending: false }) : query.order('rating_count', { ascending: false }).order('rating_sum', { ascending: false });
      const res = await query.range(input.offset, input.offset + input.limit - 1);
      if (res.error) throw new Error(`${res.error.code ?? 'db'}: ${res.error.message}`);
      return { rows: ((res.data ?? []) as Row[]).map((row) => listing({ ...row, material: {} })), total: Number(res.count ?? 0) };
    },
    sellerListings: (workspaceId) => many(db.from('ai_teacher_listings').select('*').eq('seller_workspace_id', workspaceId).order('created_at', { ascending: false }).limit(200), listing),
    moderationQueue: (limit) => many(db.from('ai_teacher_listings').select('*').eq('status', 'pending').order('updated_at', { ascending: true }).limit(limit), listing),
    async rateListing(input) {
      const row = check(await db.rpc('ai_teacher_rate_listing', { p_listing: input.listingId, p_user: input.userId, p_stars: input.stars, p_comment: input.comment })) as Row | null;
      return row && row.id ? listing(row) : null;
    },
    ratings: (listingId, limit) => many(db.from('ai_teacher_listing_ratings').select('*').eq('listing_id', listingId).order('created_at', { ascending: false }).limit(limit), rating),
    async addCopy(input) {
      const id = check(await db.rpc('ai_teacher_add_copy', { p_listing: input.listingId, p_workspace: input.workspaceId, p_user: input.userId, p_page: input.pageId, p_price: input.priceUzs }));
      if (!id) return null;
      return { ...input, id: String(id), createdAt: new Date().toISOString() };
    },
    copyFor: (listingId, workspaceId) => one(db.from('ai_teacher_listing_copies').select('*').eq('listing_id', listingId).eq('workspace_id', workspaceId).maybeSingle(), copyRow),
    copyByPage: (pageId) => one(db.from('ai_teacher_listing_copies').select('*').eq('page_id', pageId).maybeSingle(), copyRow),
    async recordUse(listingId, workspaceId, kind) {
      return check(await db.rpc('ai_teacher_record_use', { p_listing: listingId, p_workspace: workspaceId, p_kind: kind })) === true;
    },
    async addLedger(row) {
      const res = await db.from('ai_teacher_seller_ledger').insert({
        listing_id: row.listingId, seller_workspace_id: row.sellerWorkspaceId, buyer_workspace_id: row.buyerWorkspaceId, gross_uzs: row.grossUzs,
        commission_uzs: row.commissionUzs, net_uzs: row.netUzs, status: row.status, reference: row.reference,
      }).select('*').single();
      if (unique(res)) return null;
      return ledgerRow(check(res));
    },
    ledger: (workspaceId, limit) => many(db.from('ai_teacher_seller_ledger').select('*').eq('seller_workspace_id', workspaceId).order('created_at', { ascending: false }).limit(limit), ledgerRow),

    brandProfile: (workspaceId) => one(db.from('ai_teacher_brand_profiles').select('*').eq('workspace_id', workspaceId).maybeSingle(), profile),
    async saveBrandProfile(input) {
      return profile(check(await db.from('ai_teacher_brand_profiles').upsert({
        workspace_id: input.workspaceId, owner_id: input.ownerId, display_name: input.displayName, subjects: input.subjects, city: input.city, experience_years: input.experienceYears,
        format: input.format, contact: input.contact, about: input.about, updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id' }).select('*').single()));
    },
    results: (workspaceId) => many(db.from('ai_teacher_results').select('*').eq('workspace_id', workspaceId).order('achieved_on', { ascending: false }).limit(200), result),
    async addResult(input) {
      return result(check(await db.from('ai_teacher_results').insert({
        workspace_id: input.workspaceId, owner_id: input.ownerId, student_label: input.studentLabel, consent: input.consent, exam: input.exam, score: input.score,
        previous_score: input.previousScore, achieved_on: input.achievedOn, note: input.note,
      }).select('*').single()));
    },
    async deleteResult(workspaceId, id) {
      const rows = check(await db.from('ai_teacher_results').delete().eq('id', id).eq('workspace_id', workspaceId).select('id')) as Row[] | null;
      return !!rows?.length;
    },
  };
}
