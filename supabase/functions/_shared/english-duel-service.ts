// Vocabulary duels: loading and saving. One service for every place a duel is
// played (hub /duel* for the web app, hub /internal/telegram-social for chat
// play in @schoodstudentbot, telegram-app english_duel for the Mini App), so
// the rules in english-duel.ts apply the same way everywhere.
import {
  applyDuelAnswer,
  buildDuelQuestions,
  buildDuelView,
  DUEL_CREATE_DAILY_LIMIT,
  DUEL_GRACE_MS,
  DUEL_INVITE_HOURS,
  DUEL_PLAY_HOURS,
  type DuelOutcome,
  type DuelPlayerRecord,
  type DuelPlayerWords,
  type DuelRecord,
  type DuelRole,
  type DuelStatus,
  type DuelView,
  type DuelWord,
  duelFirstName,
  effectiveFinish,
  generateDuelCode,
  normalizeDuelCode,
  parseDuelAnswers,
  parseDuelQuestions,
  scoreOf,
  settleDuel,
  startClock,
} from "./english-duel.ts";
import { type Cefr, isCefr } from "./english-today.ts";
import { isServicePaused, loadEnglishSettings } from "./english-settings.ts";
import {
  botStartUrl,
  type BotButton,
  type DuelLinks,
  duelReadyReply,
  duelResultReply,
  type SocialLocale,
} from "./english-social-telegram.ts";

type Row = Record<string, unknown>;

export type DuelChannel = "web" | "telegram" | "mini_app";

export type DuelErrorCode =
  | "not_found"
  | "expired"
  | "taken"
  | "own_duel"
  | "limit"
  | "no_words"
  | "not_participant"
  | "not_active"
  | "paused";

const STATUS: Record<DuelErrorCode, number> = {
  not_found: 404,
  expired: 410,
  taken: 409,
  own_duel: 409,
  limit: 429,
  no_words: 409,
  not_participant: 403,
  not_active: 409,
  paused: 503,
};

export class DuelError extends Error {
  readonly code: DuelErrorCode;
  readonly status: number;
  constructor(code: DuelErrorCode) {
    super(code);
    this.code = code;
    this.status = STATUS[code];
  }
}

/** Sends one Telegram message to a learner (send-telegram gateway). */
export type DuelNotify = (input: { userId: string; text: string; buttons: BotButton[][]; dedupe: string }) => Promise<void>;

export type DuelContext = {
  sb: any;
  languageId: string;
  appUrl: string;
  botName: string;
  notify?: DuelNotify;
  now?: () => Date;
};

const DUEL_COLUMNS =
  "id, code, language_id, creator_id, opponent_id, status, questions, created_at, invite_expires_at, joined_at, play_expires_at, finished_at, winner_id, rematch_of, rematch_id";
const PLAYER_COLUMNS =
  "duel_id, user_id, role, channel, locale, started_at, deadline_at, finished_at, answers, answered_count, correct_count, elapsed_ms, outcome, xp";

const nowOf = (ctx: DuelContext) => ctx.now?.() ?? new Date();
const isLocale = (value: unknown): value is SocialLocale => value === "en" || value === "ru" || value === "uz";

/** Links for a duel: the web page, the bot invite and the Mini App route. */
export const duelLinks = (ctx: Pick<DuelContext, "appUrl" | "botName">, code: string): DuelLinks => ({
  webUrl: `${ctx.appUrl.replace(/\/$/, "")}/duel/${code}`,
  botInviteUrl: botStartUrl(ctx.botName, `duel_${code}`),
  miniAppRoute: `view=english&duel=${code}`,
});

const ensureOpen = async (sb: any) => {
  if (isServicePaused(await loadEnglishSettings(sb), "duels")) throw new DuelError("paused");
};

const toPlayer = (row: Row): DuelPlayerRecord & { outcome: DuelOutcome | null; xp: number; locale: SocialLocale; channel: DuelChannel } => ({
  user_id: String(row.user_id),
  role: row.role === "opponent" ? "opponent" : "creator",
  started_at: row.started_at ? String(row.started_at) : null,
  deadline_at: row.deadline_at ? String(row.deadline_at) : null,
  finished_at: row.finished_at ? String(row.finished_at) : null,
  answers: parseDuelAnswers(row.answers),
  outcome: (row.outcome as DuelOutcome | null) ?? null,
  xp: Number(row.xp ?? 0) || 0,
  locale: isLocale(row.locale) ? row.locale : "en",
  channel: row.channel === "telegram" || row.channel === "mini_app" ? row.channel : "web",
});

const toRecord = (row: Row): DuelRecord => ({
  status: (["open", "active", "finished", "expired"].includes(String(row.status)) ? row.status : "expired") as DuelStatus,
  invite_expires_at: String(row.invite_expires_at),
  play_expires_at: row.play_expires_at ? String(row.play_expires_at) : null,
  creator_id: String(row.creator_id),
  opponent_id: row.opponent_id ? String(row.opponent_id) : null,
});

type Loaded = { row: Row; duel: DuelRecord; players: ReturnType<typeof toPlayer>[] };

const loadByCode = async (ctx: DuelContext, rawCode: unknown): Promise<Loaded> => {
  const code = normalizeDuelCode(rawCode);
  if (!code) throw new DuelError("not_found");
  const { data, error } = await ctx.sb.from("english_duels").select(DUEL_COLUMNS).eq("code", code).maybeSingle();
  if (error) throw new Error(`Failed to load duel: ${error.message}`);
  if (!data || String(data.language_id) !== ctx.languageId) throw new DuelError("not_found");
  const { data: players, error: playersError } = await ctx.sb.from("english_duel_players").select(PLAYER_COLUMNS).eq("duel_id", data.id);
  if (playersError) throw new Error(`Failed to load duel players: ${playersError.message}`);
  return { row: data as Row, duel: toRecord(data as Row), players: ((players ?? []) as Row[]).map(toPlayer) };
};

/** First names only (kid-safe); "" when unknown. */
const firstNames = async (sb: any, userIds: string[]): Promise<Map<string, string>> => {
  const out = new Map<string, string>();
  if (!userIds.length) return out;
  const [profiles, users] = await Promise.all([
    sb.from("user_profiles").select("user_id, first_name").in("user_id", userIds),
    sb.from("users").select("id, full_name").in("id", userIds),
  ]);
  const firsts = new Map(((profiles.data ?? []) as Row[]).map((row) => [String(row.user_id), row.first_name]));
  for (const row of (users.data ?? []) as Row[]) {
    out.set(String(row.id), duelFirstName({ first: firsts.get(String(row.id)), full: row.full_name }));
  }
  for (const id of userIds) if (!out.has(id)) out.set(id, duelFirstName({ first: firsts.get(id) }));
  return out;
};

// === Words for the questions ===

const levelFromGoal = (goal: Row | null): Cefr | null => {
  const meta = (goal?.metadata && typeof goal.metadata === "object" ? goal.metadata : {}) as Row;
  const placement = (meta.placement && typeof meta.placement === "object" ? meta.placement : {}) as Row;
  const perSkill = (placement.per_skill && typeof placement.per_skill === "object" ? placement.per_skill : {}) as Row;
  const entry = perSkill.vocabulary;
  const level = typeof entry === "string" ? entry : (entry as Row | undefined)?.level;
  if (isCefr(level)) return level;
  return isCefr(goal?.current_cefr_estimate) ? goal!.current_cefr_estimate as Cefr : null;
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const loadPlayerWords = async (sb: any, userId: string, languageId: string): Promise<DuelPlayerWords> => {
  const [goalRes, wordsRes] = await Promise.all([
    sb.from("learner_language_goals").select("current_cefr_estimate, metadata").eq("user_id", userId).eq("language_id", languageId).maybeSingle(),
    sb.from("user_vocabulary_notebook_entries")
      .select("word, metadata, lexicon_entry_id")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);
  const rows = (wordsRes.data ?? []) as Row[];
  const lexiconIds = [...new Set(rows.filter((row) => !text((row.metadata as Row | null)?.definition) && row.lexicon_entry_id).map((row) => String(row.lexicon_entry_id)))];
  const lexicon = new Map<string, string>();
  if (lexiconIds.length) {
    const { data } = await sb.from("language_lexicon_entries").select("id, definition").in("id", lexiconIds.slice(0, 60));
    for (const entry of (data ?? []) as Row[]) lexicon.set(String(entry.id), text(entry.definition));
  }
  const saved: DuelWord[] = rows
    .map((row) => ({
      word: text(row.word),
      definition: text((row.metadata as Row | null)?.definition) || (row.lexicon_entry_id ? lexicon.get(String(row.lexicon_entry_id)) ?? "" : ""),
      level: null,
    }))
    .filter((word) => word.word && word.definition);
  return { level: levelFromGoal(goalRes.data as Row | null), saved };
};

const loadDeckWords = async (sb: any, languageId: string): Promise<DuelWord[]> => {
  const { data: decks, error } = await sb.from("vocabulary_decks")
    .select("id, level")
    .eq("language_id", languageId)
    .eq("status", "published")
    .limit(200);
  if (error) throw new Error(`Failed to load decks: ${error.message}`);
  const levelOf = new Map(((decks ?? []) as Row[]).map((deck) => [String(deck.id), isCefr(deck.level) ? deck.level : null]));
  if (!levelOf.size) return [];
  const { data: words, error: wordsError } = await sb.from("vocabulary_deck_words")
    .select("deck_id, word, definition")
    .in("deck_id", [...levelOf.keys()])
    .limit(1500);
  if (wordsError) throw new Error(`Failed to load deck words: ${wordsError.message}`);
  return ((words ?? []) as Row[]).map((row) => ({
    word: text(row.word),
    definition: text(row.definition),
    level: levelOf.get(String(row.deck_id)) ?? null,
  }));
};

const buildQuestionsFor = async (sb: any, languageId: string, creatorId: string, opponentId: string) => {
  const [creator, opponent, deck] = await Promise.all([
    loadPlayerWords(sb, creatorId, languageId),
    loadPlayerWords(sb, opponentId, languageId),
    loadDeckWords(sb, languageId),
  ]);
  const questions = buildDuelQuestions({ creator, opponent, deck });
  if (!questions) throw new DuelError("no_words");
  return questions;
};

// === Settling and notifying ===

/**
 * Writes what settleDuel decided. Only the call that moves the duel to
 * "finished" writes the outcomes and XP and sends the result, so a result is
 * never recorded or announced twice.
 */
const persistSettlement = async (ctx: DuelContext, loaded: Loaded, now: Date, actorId: string | null): Promise<Loaded> => {
  const { sb } = ctx;
  const settled = settleDuel(loaded.duel, loaded.players, now);
  const duelId = String(loaded.row.id);

  // Clocks that ran out are closed at their deadline.
  for (const player of loaded.players) {
    const finish = settled.players.find((entry) => entry.user_id === player.user_id)?.finished_at ?? null;
    if (finish && !player.finished_at && player.started_at && settled.status !== "finished") {
      const score = scoreOf(player.answers);
      await sb.from("english_duel_players")
        .update({ finished_at: finish, correct_count: score.correct, elapsed_ms: score.elapsed_ms })
        .eq("duel_id", duelId).eq("user_id", player.user_id).is("finished_at", null);
      player.finished_at = finish;
    }
  }

  if (settled.status === loaded.duel.status) return loaded;

  if (settled.status === "expired") {
    await sb.from("english_duels").update({ status: "expired" }).eq("id", duelId).eq("status", loaded.duel.status);
    loaded.duel.status = "expired";
    return loaded;
  }

  if (settled.status !== "finished") return loaded;
  const { data: claimed, error } = await sb.from("english_duels")
    .update({ status: "finished", finished_at: now.toISOString(), winner_id: settled.winner_id })
    .eq("id", duelId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Failed to finish duel: ${error.message}`);
  if (!claimed) return await loadByCode(ctx, loaded.row.code);

  for (const entry of settled.players) {
    const { error: playerError } = await sb.from("english_duel_players").update({
      finished_at: entry.finished_at,
      outcome: entry.outcome,
      xp: entry.xp,
      xp_at: entry.xp > 0 ? now.toISOString() : null,
      correct_count: entry.score.correct,
      elapsed_ms: entry.score.elapsed_ms,
    }).eq("duel_id", duelId).eq("user_id", entry.user_id);
    if (playerError) throw new Error(`Failed to save duel result: ${playerError.message}`);
  }
  const fresh = await loadByCode(ctx, loaded.row.code);

  // Everyone except the player whose action ended the duel hears about it in
  // Telegram; that player sees the result where they are playing.
  if (ctx.notify) {
    const names = await firstNames(sb, fresh.players.map((player) => player.user_id));
    for (const player of fresh.players) {
      if (player.user_id === actorId) continue;
      const view = viewFor(ctx, fresh, player.user_id, names, now);
      const reply = duelResultReply(player.locale, view, duelLinks(ctx, String(fresh.row.code)));
      await ctx.notify({ userId: player.user_id, text: reply.text, buttons: reply.buttons, dedupe: `english-duel-result:${duelId}` })
        .catch((cause) => console.warn(JSON.stringify({ event: "english_duel_notify_failed", message: String((cause as Error)?.message ?? cause) })));
    }
  }
  return fresh;
};

const viewFor = (ctx: DuelContext, loaded: Loaded, userId: string, names: Map<string, string>, now: Date): DuelView => {
  const me = loaded.players.find((player) => player.user_id === userId);
  if (!me) throw new DuelError("not_participant");
  const them = loaded.players.find((player) => player.user_id !== userId) ?? null;
  return buildDuelView({
    code: String(loaded.row.code),
    duel: { ...loaded.duel, rematch_code: (loaded.row as Row & { rematch_code?: string | null }).rematch_code ?? null },
    questions: parseDuelQuestions(loaded.row.questions),
    me,
    them,
    opponentName: them ? names.get(them.user_id) ?? "" : "",
    now,
  });
};

const withRematchCode = async (sb: any, loaded: Loaded): Promise<Loaded> => {
  if (!loaded.row.rematch_id) return loaded;
  const { data } = await sb.from("english_duels").select("code").eq("id", loaded.row.rematch_id).maybeSingle();
  return { ...loaded, row: { ...loaded.row, rematch_code: data?.code ? String(data.code) : null } };
};

const present = async (ctx: DuelContext, loaded: Loaded, userId: string, now: Date): Promise<DuelView> => {
  const names = await firstNames(ctx.sb, loaded.players.map((player) => player.user_id));
  return viewFor(ctx, await withRematchCode(ctx.sb, loaded), userId, names, now);
};

// === Actions ===

const insertDuel = async (ctx: DuelContext, values: Row): Promise<Row> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await ctx.sb.from("english_duels").insert({ ...values, code: generateDuelCode() }).select(DUEL_COLUMNS).single();
    if (!error) return data as Row;
    if (error.code !== "23505") throw new Error(`Failed to create duel: ${error.message}`);
  }
  throw new Error("Failed to create duel: no free code");
};

const checkCreateLimit = async (ctx: DuelContext, userId: string, now: Date) => {
  const { count, error } = await ctx.sb.from("english_duels")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", userId)
    .gte("created_at", new Date(now.getTime() - 86_400_000).toISOString());
  if (error) throw new Error(`Failed to count duels: ${error.message}`);
  if (Number(count ?? 0) >= DUEL_CREATE_DAILY_LIMIT) throw new DuelError("limit");
};

/** A new open invite. The friend's join builds the questions. */
export const createDuel = async (ctx: DuelContext, userId: string, input: { channel: DuelChannel; locale: SocialLocale }) => {
  await ensureOpen(ctx.sb);
  const now = nowOf(ctx);
  await checkCreateLimit(ctx, userId, now);
  const row = await insertDuel(ctx, {
    language_id: ctx.languageId,
    creator_id: userId,
    status: "open",
    invite_expires_at: new Date(now.getTime() + DUEL_INVITE_HOURS * 3_600_000).toISOString(),
  });
  const { error } = await ctx.sb.from("english_duel_players").insert({
    duel_id: row.id, user_id: userId, language_id: ctx.languageId, role: "creator", channel: input.channel, locale: input.locale,
  });
  if (error) throw new Error(`Failed to create duel: ${error.message}`);
  return { code: String(row.code), links: duelLinks(ctx, String(row.code)) };
};

/**
 * The friend accepts: questions are built from both players' words, and the
 * creator hears about it in Telegram. Joining again is harmless.
 */
export const joinDuel = async (ctx: DuelContext, userId: string, code: unknown, input: { channel: DuelChannel; locale: SocialLocale }) => {
  await ensureOpen(ctx.sb);
  const now = nowOf(ctx);
  let loaded = await persistSettlement(ctx, await loadByCode(ctx, code), now, null);
  if (loaded.players.some((player) => player.user_id === userId)) {
    if (loaded.duel.creator_id === userId && loaded.duel.status === "open") throw new DuelError("own_duel");
    return { view: await present(ctx, loaded, userId, now), joined: false };
  }
  if (loaded.duel.status === "expired") throw new DuelError("expired");
  if (loaded.duel.status !== "open") throw new DuelError("taken");

  const questions = await buildQuestionsFor(ctx.sb, ctx.languageId, loaded.duel.creator_id, userId);
  const { data: claimed, error } = await ctx.sb.from("english_duels").update({
    opponent_id: userId,
    status: "active",
    questions,
    joined_at: now.toISOString(),
    play_expires_at: new Date(now.getTime() + DUEL_PLAY_HOURS * 3_600_000).toISOString(),
  }).eq("id", loaded.row.id).eq("status", "open").is("opponent_id", null).select("id").maybeSingle();
  if (error) throw new Error(`Failed to join duel: ${error.message}`);
  if (!claimed) throw new DuelError("taken");
  const { error: playerError } = await ctx.sb.from("english_duel_players").insert({
    duel_id: loaded.row.id, user_id: userId, language_id: ctx.languageId, role: "opponent", channel: input.channel, locale: input.locale,
  });
  if (playerError) throw new Error(`Failed to join duel: ${playerError.message}`);
  loaded = await loadByCode(ctx, loaded.row.code);

  const names = await firstNames(ctx.sb, [loaded.duel.creator_id, userId]);
  if (ctx.notify) {
    const creator = loaded.players.find((player) => player.role === "creator");
    const reply = duelReadyReply(creator?.locale ?? "en", String(loaded.row.code), names.get(userId) ?? "", true);
    await ctx.notify({ userId: loaded.duel.creator_id, text: reply.text, buttons: reply.buttons, dedupe: `english-duel-joined:${loaded.row.id}` })
      .catch((cause) => console.warn(JSON.stringify({ event: "english_duel_notify_failed", message: String((cause as Error)?.message ?? cause) })));
  }
  return { view: viewFor(ctx, loaded, userId, names, now), joined: true };
};

/** Starts this player's 60 seconds (once; starting again returns the running clock). */
export const startDuel = async (ctx: DuelContext, userId: string, code: unknown, input: { channel: DuelChannel; locale: SocialLocale }) => {
  const now = nowOf(ctx);
  const loaded = await persistSettlement(ctx, await loadByCode(ctx, code), now, userId);
  const me = loaded.players.find((player) => player.user_id === userId);
  if (!me) throw new DuelError("not_participant");
  if (loaded.duel.status === "expired") throw new DuelError("expired");
  if (loaded.duel.status === "open") throw new DuelError("not_active");
  if (loaded.duel.status === "active" && !me.started_at) {
    await ensureOpen(ctx.sb);
    const clock = startClock(now);
    const { data, error } = await ctx.sb.from("english_duel_players")
      .update({ ...clock, channel: input.channel, locale: input.locale })
      .eq("duel_id", loaded.row.id).eq("user_id", userId).is("started_at", null)
      .select("started_at, deadline_at").maybeSingle();
    if (error) throw new Error(`Failed to start duel: ${error.message}`);
    // A double tap: the first start's clock stands.
    me.started_at = data ? clock.started_at : me.started_at;
    me.deadline_at = data ? clock.deadline_at : me.deadline_at;
    if (!data) return { view: await present(ctx, await loadByCode(ctx, code), userId, now) };
  }
  return { view: await present(ctx, loaded, userId, now) };
};

export type DuelAnswerOutcome = {
  view: DuelView;
  accepted: boolean;
  reason: string | null;
  correct: boolean | null;
  correct_index: number | null;
  /** The question that was answered, for the chat reply. */
  answered: { index: number; total: number; prompt: string; options: string[] } | null;
};

/** Checks and records one answer against the server's clock. */
export const answerDuel = async (
  ctx: DuelContext,
  userId: string,
  code: unknown,
  input: { index: number; choice: number },
): Promise<DuelAnswerOutcome> => {
  const now = nowOf(ctx);
  const loaded = await loadByCode(ctx, code);
  const me = loaded.players.find((player) => player.user_id === userId);
  if (!me) throw new DuelError("not_participant");
  const questions = parseDuelQuestions(loaded.row.questions);
  if (loaded.duel.status !== "active" || !questions) {
    const settled = await persistSettlement(ctx, loaded, now, userId);
    return { view: await present(ctx, settled, userId, now), accepted: false, reason: "not_active", correct: null, correct_index: null, answered: null };
  }

  const result = applyDuelAnswer(me, questions, input, now);
  const question = questions[input.index];
  const answered = question ? { index: input.index, total: questions.length, prompt: question.prompt, options: question.options } : null;
  if (!result.ok) {
    const settled = await persistSettlement(ctx, loaded, now, userId);
    return { view: await present(ctx, settled, userId, now), accepted: false, reason: result.reason, correct: null, correct_index: null, answered };
  }

  const score = scoreOf(result.state.answers);
  const { data: saved, error } = await ctx.sb.from("english_duel_players").update({
    answers: result.state.answers,
    answered_count: result.state.answers.length,
    correct_count: score.correct,
    elapsed_ms: score.elapsed_ms,
    finished_at: result.state.finished_at,
  }).eq("duel_id", loaded.row.id).eq("user_id", userId).eq("answered_count", me.answers.length).is("finished_at", null)
    .select("duel_id").maybeSingle();
  if (error) throw new Error(`Failed to save duel answer: ${error.message}`);
  if (!saved) {
    // Another tap saved first (double tap, two devices): show where things stand.
    const fresh = await loadByCode(ctx, code);
    return { view: await present(ctx, fresh, userId, now), accepted: false, reason: "already_answered", correct: null, correct_index: null, answered };
  }
  me.answers = result.state.answers;
  me.finished_at = result.state.finished_at;
  const settled = await persistSettlement(ctx, loaded, now, userId);
  return { view: await present(ctx, settled, userId, now), accepted: true, reason: null, correct: result.correct, correct_index: result.correct_index, answered };
};

/** The duel as this player sees it (settling clocks and results first). */
export const getDuel = async (ctx: DuelContext, userId: string, code: unknown): Promise<DuelView> => {
  const now = nowOf(ctx);
  const loaded = await loadByCode(ctx, code);
  if (!loaded.players.some((player) => player.user_id === userId)) {
    // Someone opening a friend's invite: they may join it, nothing more.
    if (loaded.duel.status === "open" && now.getTime() <= Date.parse(loaded.duel.invite_expires_at)) throw new DuelError("not_participant");
    throw new DuelError(loaded.duel.status === "open" || loaded.duel.status === "expired" ? "expired" : "taken");
  }
  return await present(ctx, await persistSettlement(ctx, loaded, now, userId), userId, now);
};

/** What someone holding an invite may see before joining: the inviter's first name. */
export const peekInvite = async (ctx: DuelContext, code: unknown) => {
  const now = nowOf(ctx);
  const loaded = await loadByCode(ctx, code);
  const open = loaded.duel.status === "open" && now.getTime() <= Date.parse(loaded.duel.invite_expires_at);
  const names = await firstNames(ctx.sb, [loaded.duel.creator_id]);
  return { status: open ? "open" as const : loaded.duel.status === "open" ? "expired" as const : loaded.duel.status, inviter_name: names.get(loaded.duel.creator_id) ?? "" };
};

export type DuelSummary = {
  code: string;
  status: DuelStatus;
  role: DuelRole;
  opponent_name: string;
  created_at: string;
  my_correct: number | null;
  their_correct: number | null;
  outcome: DuelOutcome | null;
  /** What this learner can do now. */
  next: "play" | "wait_friend" | "wait_join" | null;
};

/** The learner's last duels, newest first. */
export const listDuels = async (ctx: DuelContext, userId: string): Promise<DuelSummary[]> => {
  const now = nowOf(ctx);
  const { data: mine, error } = await ctx.sb.from("english_duel_players")
    .select("duel_id")
    .eq("user_id", userId)
    .eq("language_id", ctx.languageId)
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) throw new Error(`Failed to load duels: ${error.message}`);
  const ids = ((mine ?? []) as Row[]).map((row) => String(row.duel_id));
  if (!ids.length) return [];
  const [duelsRes, playersRes] = await Promise.all([
    ctx.sb.from("english_duels").select(DUEL_COLUMNS).in("id", ids),
    ctx.sb.from("english_duel_players").select(PLAYER_COLUMNS).in("duel_id", ids),
  ]);
  if (duelsRes.error) throw new Error(`Failed to load duels: ${duelsRes.error.message}`);
  const playersBy = new Map<string, ReturnType<typeof toPlayer>[]>();
  for (const row of (playersRes.data ?? []) as Row[]) {
    playersBy.set(String(row.duel_id), [...(playersBy.get(String(row.duel_id)) ?? []), toPlayer(row)]);
  }
  const names = await firstNames(ctx.sb, [...new Set([...playersBy.values()].flat().map((player) => player.user_id))]);
  return ((duelsRes.data ?? []) as Row[])
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .flatMap((row) => {
      const players = playersBy.get(String(row.id)) ?? [];
      const me = players.find((player) => player.user_id === userId);
      if (!me) return [];
      const them = players.find((player) => player.user_id !== userId) ?? null;
      const settled = settleDuel(toRecord(row), players, now);
      const myFinish = effectiveFinish(me, now);
      const status = settled.status;
      const outcome = me.outcome ?? settled.players.find((entry) => entry.user_id === userId)?.outcome ?? null;
      return [{
        code: String(row.code),
        status,
        role: me.role,
        opponent_name: them ? names.get(them.user_id) ?? "" : "",
        created_at: String(row.created_at),
        my_correct: me.started_at ? scoreOf(me.answers).correct : null,
        their_correct: status === "finished" && them ? scoreOf(them.answers).correct : null,
        outcome: status === "finished" ? outcome : null,
        next: status === "open" ? "wait_join" : status === "active" ? (myFinish ? "wait_friend" : "play") : null,
      }];
    });
};

/** A new duel for the same two players, ready to play; one rematch per duel. */
export const rematchDuel = async (ctx: DuelContext, userId: string, code: unknown, input: { channel: DuelChannel; locale: SocialLocale }) => {
  await ensureOpen(ctx.sb);
  const now = nowOf(ctx);
  const loaded = await persistSettlement(ctx, await loadByCode(ctx, code), now, null);
  const me = loaded.players.find((player) => player.user_id === userId);
  const them = loaded.players.find((player) => player.user_id !== userId);
  if (!me || !them) throw new DuelError("not_participant");
  if (loaded.duel.status !== "finished") throw new DuelError("not_active");
  if (loaded.row.rematch_id) {
    const { data } = await ctx.sb.from("english_duels").select("code").eq("id", loaded.row.rematch_id).maybeSingle();
    if (data?.code) return { code: String(data.code), created: false };
  }
  await checkCreateLimit(ctx, userId, now);
  const questions = await buildQuestionsFor(ctx.sb, ctx.languageId, userId, them.user_id);
  const row = await insertDuel(ctx, {
    language_id: ctx.languageId,
    creator_id: userId,
    opponent_id: them.user_id,
    status: "active",
    questions,
    invite_expires_at: now.toISOString(),
    joined_at: now.toISOString(),
    play_expires_at: new Date(now.getTime() + DUEL_PLAY_HOURS * 3_600_000).toISOString(),
    rematch_of: loaded.row.id,
  });
  const { data: linked } = await ctx.sb.from("english_duels")
    .update({ rematch_id: row.id }).eq("id", loaded.row.id).is("rematch_id", null).select("id").maybeSingle();
  if (!linked) {
    // Both asked at once: keep the other rematch, drop this one.
    await ctx.sb.from("english_duels").delete().eq("id", row.id);
    const { data } = await ctx.sb.from("english_duels").select("rematch_id").eq("id", loaded.row.id).maybeSingle();
    const { data: other } = data?.rematch_id ? await ctx.sb.from("english_duels").select("code").eq("id", data.rematch_id).maybeSingle() : { data: null };
    if (other?.code) return { code: String(other.code), created: false };
    throw new DuelError("not_active");
  }
  const { error } = await ctx.sb.from("english_duel_players").insert([
    { duel_id: row.id, user_id: userId, language_id: ctx.languageId, role: "creator", channel: input.channel, locale: input.locale },
    { duel_id: row.id, user_id: them.user_id, language_id: ctx.languageId, role: "opponent", channel: them.channel, locale: them.locale },
  ]);
  if (error) throw new Error(`Failed to create rematch: ${error.message}`);
  if (ctx.notify) {
    const names = await firstNames(ctx.sb, [userId]);
    const reply = duelReadyReply(them.locale, String(row.code), names.get(userId) ?? "", true);
    await ctx.notify({ userId: them.user_id, text: reply.text, buttons: reply.buttons, dedupe: `english-duel-joined:${row.id}` })
      .catch((cause) => console.warn(JSON.stringify({ event: "english_duel_notify_failed", message: String((cause as Error)?.message ?? cause) })));
  }
  return { code: String(row.code), created: true };
};

/**
 * Settles duels nobody is looking at (hourly, from the reminder cron): clocks
 * that ran out in a Telegram chat, invites nobody accepted and play windows
 * that closed. This is what sends a waiting player their result when the
 * other player simply stopped tapping.
 */
export const sweepDuels = async (ctx: DuelContext, limit = 100): Promise<{ checked: number }> => {
  const now = nowOf(ctx);
  const nowIso = now.toISOString();
  const [timedOut, invites, windows] = await Promise.all([
    ctx.sb.from("english_duel_players").select("duel_id")
      .eq("language_id", ctx.languageId)
      .is("finished_at", null)
      .not("deadline_at", "is", null)
      .lt("deadline_at", new Date(now.getTime() - DUEL_GRACE_MS - 1_000).toISOString())
      .limit(limit),
    ctx.sb.from("english_duels").select("id").eq("language_id", ctx.languageId).eq("status", "open").lt("invite_expires_at", nowIso).limit(limit),
    ctx.sb.from("english_duels").select("id").eq("language_id", ctx.languageId).eq("status", "active").lt("play_expires_at", nowIso).limit(limit),
  ]);
  const ids = [...new Set([
    ...((timedOut.data ?? []) as Row[]).map((row) => String(row.duel_id)),
    ...((invites.data ?? []) as Row[]).map((row) => String(row.id)),
    ...((windows.data ?? []) as Row[]).map((row) => String(row.id)),
  ])].slice(0, limit);
  if (!ids.length) return { checked: 0 };
  const { data: codes } = await ctx.sb.from("english_duels").select("code").in("id", ids);
  for (const row of (codes ?? []) as Row[]) {
    try {
      await persistSettlement(ctx, await loadByCode(ctx, row.code), now, null);
    } catch (error) {
      console.warn(JSON.stringify({ event: "english_duel_sweep_failed", message: error instanceof Error ? error.message : "unknown" }));
    }
  }
  return { checked: ids.length };
};

/**
 * A notifier that sends through the send-telegram gateway (quiet hours, the
 * study-habit cap and dedupe apply). Learners without Telegram are skipped.
 */
export const telegramDuelNotifier = (input: { supabaseUrl: string; serviceRoleKey: string }): DuelNotify =>
  async ({ userId, text: body, buttons, dedupe }) => {
    const markup = buttons.length
      ? {
        inline_keyboard: buttons.map((row) =>
          row.flatMap((button): Array<Record<string, string>> => {
            if (button.callback_data) return [{ text: button.text, callback_data: button.callback_data }];
            if (button.url) return [{ text: button.text, url: button.url }];
            return [];
          })
        ).filter((row) => row.length),
      }
      : undefined;
    await fetch(`${input.supabaseUrl}/functions/v1/send-telegram`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.serviceRoleKey}` },
      body: JSON.stringify({
        user_id: userId,
        text: body,
        parse_mode: "HTML",
        notification_type: "english_duel",
        category: "study_habit",
        dedupe_key: dedupe,
        reply_markup: markup,
      }),
    });
  };

/** Learner id for a Telegram account, or null when it is not linked. */
export const userForTelegram = async (sb: any, telegramUserId: unknown): Promise<string | null> => {
  const id = String(telegramUserId ?? "").trim();
  if (!/^\d{1,20}$/.test(id)) return null;
  const { data, error } = await sb.from("users").select("id").eq("telegram_chat_id", id).limit(1);
  if (error) throw new Error(`Failed to resolve Telegram user: ${error.message}`);
  const row = ((data ?? []) as Row[])[0];
  return row?.id ? String(row.id) : null;
};
