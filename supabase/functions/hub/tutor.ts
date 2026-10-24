// The AI tutor (hub):
//   GET  /tutor/context            what the tutor knows about the learner + suggested next steps (no AI)
//   GET  /tutor/threads            the learner's conversations (newest first)
//   GET  /tutor/threads/:id        one conversation's messages
//   POST /tutor/threads            {action: "create" | "delete" (id) | "import" (messages from the old on-device history)}
//   GET|POST /tutor/memory         notes the learner chose to keep (account-wide)
//   POST /ai/tutor-chat            one turn: {thread_id?, message}. Older apps send {messages} (answered without saving)
//   POST /tutor/lesson             start a mini-lesson {thread_id?, topic?} (cached per topic and level)
//   POST /tutor/lesson/answer      {message_id, item_id, answer}: checked without AI
// Prompt building, limits and lesson checking: _shared/english-tutor.ts.

import { json, parseBody, toText, type EnglishProductInfo, type EnglishServiceKey } from "../_shared/english-learning.ts";
import { type EnglishAIRequest, type EnglishAIResult, isEnglishAIConfigured } from "../_shared/english-ai.ts";
import { requireEnglishSuiteAccess } from "../_shared/english-access.ts";
import { callEnglishAIWithCredit, defaultAICreditDeps } from "../_shared/english-ai-quota.ts";
import { isServicePaused, loadEnglishSettings, servicePausedBody } from "../_shared/english-settings.ts";
import { topicFromSubskill } from "../_shared/english-mistakes.ts";
import { loadPracticeWords } from "../_shared/english-words.ts";
import { projectByKey, readRunDays, projectState, learnerDay } from "../_shared/english-immersion-depth.ts";
import {
  buildLessonRequest,
  buildTutorChatRequest,
  buildTutorContext,
  checkLessonAnswer,
  contextActions,
  type Lesson,
  type LessonAnswers,
  lessonItemById,
  lessonTopicFor,
  mergeActions,
  normalizeLesson,
  normalizeTutorReply,
  publicLesson,
  threadTitle,
  type TutorAction,
  type TutorContext,
  type TutorContextInput,
  type TutorMessage,
  TUTOR_LIMITS,
} from "../_shared/english-tutor.ts";

type Row = Record<string, unknown>;

export type TutorRouteContext = {
  sb: any;
  req: Request;
  url: URL;
  route: string;
  userId: string;
  languageId: string;
  products: Record<EnglishServiceKey, EnglishProductInfo>;
  /** The hub's AI call for this request (already charged one credit; refunded on failure). */
  aiCall: <T>(req: EnglishAIRequest, fallback: T) => Promise<EnglishAIResult<T>>;
  requestId: string;
};

const asRecord = (value: unknown): Row => (value && typeof value === "object" && !Array.isArray(value) ? value as Row : {});

// ---------------------------------------------------------------------------
// Memories (moved from hub/index.ts; same storage: learner_language_goals.metadata.tutor_memories)
// ---------------------------------------------------------------------------

const TUTOR_MEMORY_KINDS = ["goal", "preference", "struggle", "win", "context", "deadline"];
type TutorMemory = { id: string; kind: string; text: string; added_at: string };

const loadTutorMemories = async (sb: any, userId: string, languageId: string): Promise<TutorMemory[]> => {
  const { data } = await sb.from("learner_language_goals").select("metadata").eq("user_id", userId).eq("language_id", languageId).maybeSingle();
  const raw = asRecord(asRecord(data).metadata).tutor_memories;
  return (Array.isArray(raw) ? raw : [])
    .map((entry) => asRecord(entry))
    .map((m) => ({ id: String(m.id ?? ""), kind: String(m.kind ?? "context"), text: String(m.text ?? ""), added_at: String(m.added_at ?? "") }))
    .filter((m) => m.id && m.text)
    .slice(-30);
};

const saveTutorMemories = async (sb: any, userId: string, languageId: string, memories: TutorMemory[]): Promise<void> => {
  const { data } = await sb.from("learner_language_goals").select("metadata").eq("user_id", userId).eq("language_id", languageId).maybeSingle();
  const meta = asRecord(asRecord(data).metadata);
  const row = { user_id: userId, language_id: languageId, metadata: { ...meta, tutor_memories: memories.slice(-30) } };
  const { error } = await sb.from("learner_language_goals").upsert(row, { onConflict: "user_id,language_id" });
  if (error) throw new Error(`Failed to save tutor memory: ${error.message}`);
};

const memoryRoute = async (ctx: TutorRouteContext): Promise<Response> => {
  const { sb, userId, languageId } = ctx;
  if (ctx.req.method === "GET") return json(200, { ok: true, memories: await loadTutorMemories(sb, userId, languageId) });
  const body = await parseBody(ctx.req) as Row;
  const action = toText(body.action, 16);
  const current = await loadTutorMemories(sb, userId, languageId);
  let next = current;
  if (action === "add") {
    const items = (Array.isArray(body.memories) ? body.memories : [body.memory])
      .filter((m): m is Row => !!m && typeof m === "object" && !Array.isArray(m))
      .map((m) => ({
        id: `mem_${crypto.randomUUID().slice(0, 12)}`,
        kind: TUTOR_MEMORY_KINDS.includes(toText(m.kind, 24)) ? toText(m.kind, 24) : "context",
        text: toText(m.text, 320),
        added_at: new Date().toISOString(),
      }))
      .filter((m) => m.text && !current.some((existing) => existing.text.toLowerCase() === m.text.toLowerCase()));
    next = [...current, ...items].slice(-30);
  } else if (action === "remove") {
    const id = toText(body.id, 64);
    next = current.filter((memory) => memory.id !== id);
  } else {
    return json(422, { error: "action must be add or remove" });
  }
  await saveTutorMemories(sb, userId, languageId, next);
  return json(200, { ok: true, memories: next });
};

// ---------------------------------------------------------------------------
// Learner context
// ---------------------------------------------------------------------------

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];

/**
 * Class work for the learner, if the classes tables exist. Tolerant by design:
 * a missing table or column returns nothing. Expected shape (owned by the
 * classes workstream): english_class_members(class_id, user_id) and
 * english_class_assignments(class_id, title, skill, route|slug, due_at|due_on, status).
 */
export const loadAssignments = async (sb: any, userId: string): Promise<TutorContextInput["assignments"]> => {
  try {
    const members = await sb.from("english_class_members").select("class_id").eq("user_id", userId).limit(10);
    if (members.error || !Array.isArray(members.data) || !members.data.length) return [];
    const classIds = (members.data as Row[]).map((row) => String(row.class_id ?? "")).filter(Boolean);
    if (!classIds.length) return [];
    const { data, error } = await sb.from("english_class_assignments").select("*").in("class_id", classIds).limit(20);
    if (error || !Array.isArray(data)) return [];
    const today = new Date().toISOString().slice(0, 10);
    return (data as Row[])
      .filter((row) => !["archived", "closed", "done", "completed", "cancelled"].includes(String(row.status ?? "").toLowerCase()))
      .map((row) => {
        const skill = toText(row.skill ?? row.service_key, 24) || null;
        const slug = toText(row.slug ?? row.content_slug ?? row.source_ref, 120);
        const route = toText(row.route, 160) || (skill && slug ? `/${skill}/${slug}` : skill ? `/${skill}` : "");
        const due = toText(row.due_at ?? row.due_on ?? row.due_date, 10) || null;
        return { title: toText(row.title ?? row.name, 120), skill, due, route: route || null };
      })
      .filter((entry) => entry.title && (!entry.due || entry.due >= today))
      .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"))
      .slice(0, 3);
  } catch {
    return [];
  }
};

/** The learner's active project (for "continue your project"), if any. */
const loadActiveProject = async (sb: any, userId: string, languageId: string): Promise<{ key: string; title: string; day: number; days: number } | null> => {
  const { data, error } = await sb
    .from("english_immersion_project_runs")
    .select("project_key, days")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const project = projectByKey(String(data.project_key ?? ""));
  if (!project) return null;
  const state = projectState(project, readRunDays(data.days), learnerDay(new Date()));
  const day = state.current ?? Math.min(project.days.length, readRunDays(data.days).length + 1);
  return { key: project.key, title: project.title, day, days: project.days.length };
};

/** Lesson slug per grammar topic, nearest to the learner's grammar level. */
const lessonsFor = async (sb: any, languageId: string, topics: string[], level: string | null): Promise<Record<string, string>> => {
  if (!topics.length) return {};
  const { data } = await sb.from("grammar_units").select("slug, focus_area, level").eq("language_id", languageId).eq("status", "published").in("focus_area", topics);
  const target = CEFR.indexOf(level ?? "B1");
  const out: Record<string, string> = {};
  for (const topic of topics) {
    const unit = ((data ?? []) as Row[])
      .filter((row) => row.focus_area === topic)
      .sort((a, b) => Math.abs(CEFR.indexOf(String(a.level)) - target) - Math.abs(CEFR.indexOf(String(b.level)) - target))[0];
    if (unit?.slug) out[topic] = String(unit.slug);
  }
  return out;
};

export const loadTutorContext = async (sb: any, userId: string, languageId: string): Promise<{ context: TutorContext; projectKey: string | null }> => {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const nowIso = new Date().toISOString();
  const [goalRes, errorsRes, attemptsRes, dueRes, words, assignments, memories, project] = await Promise.all([
    sb.from("learner_language_goals")
      .select("current_cefr_estimate, target_cefr, goal_keys, daily_time_minutes, metadata")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .maybeSingle(),
    sb.from("learner_language_errors")
      .select("subskill_key, error_type, error_frequency")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("mastery_status", ["open", "reopened"])
      .gte("last_seen_at", since)
      .order("error_frequency", { ascending: false })
      .limit(40),
    sb.from("learning_attempts")
      .select("service_key, correctness_ratio, submitted_at")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(6),
    sb.from("user_vocabulary_notebook_entries")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .eq("is_archived", false)
      .lte("next_review_at", nowIso),
    loadPracticeWords(sb, userId, languageId, 5).catch(() => []),
    loadAssignments(sb, userId),
    loadTutorMemories(sb, userId, languageId).catch(() => [] as TutorMemory[]),
    loadActiveProject(sb, userId, languageId).catch(() => null),
  ]);
  const mistakes = ((errorsRes.data ?? []) as Row[]).map((row) => ({
    topic: topicFromSubskill(String(row.subskill_key ?? "")),
    subskill: String(row.subskill_key ?? ""),
    example: String(row.error_type ?? ""),
    times: Number(row.error_frequency ?? 1),
  }));
  const goal = (goalRes.data ?? null) as TutorContextInput["goal"];
  const grammarLevel = toText(asRecord(asRecord(asRecord(asRecord(goal?.metadata).skill_ratings).skills).grammar).level, 4) || toText(goal?.current_cefr_estimate, 4) || null;
  const topics = [...new Set(mistakes.map((entry) => entry.topic).filter((topic): topic is NonNullable<typeof topic> => Boolean(topic)))].slice(0, 4);
  const lessons = await lessonsFor(sb, languageId, topics, grammarLevel).catch(() => ({}));
  const context = buildTutorContext({
    goal,
    mistakes,
    recent: ((attemptsRes.data ?? []) as Row[]).map((row) => {
      const score = Number(row.correctness_ratio);
      return { skill: String(row.service_key ?? ""), score: row.correctness_ratio === null || !Number.isFinite(score) ? null : Math.round(score * 100), at: String(row.submitted_at ?? "") };
    }),
    dueWords: { count: Number(dueRes.count ?? 0), words: words.map((entry) => entry.word) },
    assignments,
    memories,
    project,
    lessons,
  });
  return { context, projectKey: project?.key ?? null };
};

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

const THREAD_COLUMNS = "id, title, summary, message_count, last_message_at, created_at";

const publicThread = (row: Row) => ({
  id: String(row.id),
  title: toText(row.title, 80) || "Conversation",
  message_count: Number(row.message_count ?? 0),
  last_message_at: String(row.last_message_at ?? row.created_at ?? ""),
});

const loadThread = async (ctx: TutorRouteContext, id: string): Promise<Row | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await ctx.sb.from("english_tutor_threads").select(THREAD_COLUMNS).eq("id", id).eq("user_id", ctx.userId).maybeSingle();
  return data?.id ? data as Row : null;
};

const createThread = async (ctx: TutorRouteContext, title: string): Promise<Row> => {
  const { data, error } = await ctx.sb
    .from("english_tutor_threads")
    .insert({ user_id: ctx.userId, language_id: ctx.languageId, title: threadTitle(title) })
    .select(THREAD_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Failed to start a conversation: ${error?.message ?? "no row"}`);
  // Keep at most threadsPerLearner conversations: the oldest go.
  const old = await ctx.sb
    .from("english_tutor_threads")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .order("last_message_at", { ascending: false })
    .range(TUTOR_LIMITS.threadsPerLearner, TUTOR_LIMITS.threadsPerLearner + 20);
  const ids = ((old.data ?? []) as Row[]).map((row) => String(row.id));
  if (ids.length) await ctx.sb.from("english_tutor_threads").delete().eq("user_id", ctx.userId).in("id", ids);
  return data as Row;
};

type StoredMessage = { role: "user" | "assistant"; kind: "chat" | "lesson"; content: string; payload?: Row };

/** Adds messages, updates the thread and keeps at most threadMessages per thread. */
const appendMessages = async (ctx: TutorRouteContext, thread: Row, messages: StoredMessage[], summary?: string): Promise<Row[]> => {
  const { data, error } = await ctx.sb
    .from("english_tutor_messages")
    .insert(messages.map((message) => ({
      thread_id: String(thread.id),
      user_id: ctx.userId,
      role: message.role,
      kind: message.kind,
      content: message.content.slice(0, TUTOR_LIMITS.storedMessageChars),
      payload: message.payload ?? {},
    })))
    .select("id, role, kind, content, payload, created_at");
  if (error) throw new Error(`Failed to save the conversation: ${error.message}`);
  const count = Number(thread.message_count ?? 0) + messages.length;
  await ctx.sb
    .from("english_tutor_threads")
    .update({
      message_count: Math.min(count, TUTOR_LIMITS.threadMessages),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(summary !== undefined ? { summary: summary.slice(0, TUTOR_LIMITS.summaryChars) } : {}),
    })
    .eq("id", String(thread.id));
  if (count > TUTOR_LIMITS.threadMessages) {
    const cutoff = await ctx.sb
      .from("english_tutor_messages")
      .select("id")
      .eq("thread_id", String(thread.id))
      .order("id", { ascending: false })
      .range(TUTOR_LIMITS.threadMessages - 1, TUTOR_LIMITS.threadMessages - 1)
      .maybeSingle();
    if (cutoff.data?.id) await ctx.sb.from("english_tutor_messages").delete().eq("thread_id", String(thread.id)).lt("id", cutoff.data.id);
  }
  return (data ?? []) as Row[];
};

const readLesson = (payload: unknown): { lesson: Lesson; answers: LessonAnswers } | null => {
  const rec = asRecord(payload);
  const raw = asRecord(rec.lesson);
  const lesson = normalizeLesson(raw, String(raw.topic ?? ""), String(raw.level ?? "B1"));
  if (!lesson) return null;
  const answers: LessonAnswers = {};
  for (const [id, value] of Object.entries(asRecord(rec.answers))) {
    const entry = asRecord(value);
    answers[id] = { given: toText(entry.given, 200), correct: entry.correct === true };
  }
  return { lesson, answers };
};

/** A stored message as the app shows it (lesson answers stay hidden until answered). */
const publicMessage = (row: Row) => {
  const payload = asRecord(row.payload);
  const base = { id: Number(row.id), role: String(row.role), kind: String(row.kind ?? "chat"), content: String(row.content ?? ""), created_at: String(row.created_at ?? "") };
  if (base.kind === "lesson") {
    const parsed = readLesson(payload);
    return { ...base, lesson: parsed ? publicLesson(parsed.lesson, parsed.answers) : null, mistake: toText(payload.mistake, 160) || null };
  }
  return {
    ...base,
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    lesson_topic: toText(payload.lesson_topic, 48) || null,
  };
};

/** Recent turns for the model: lessons become a one-line note. */
const recentForModel = async (ctx: TutorRouteContext, threadId: string): Promise<TutorMessage[]> => {
  const { data } = await ctx.sb
    .from("english_tutor_messages")
    .select("role, kind, content, payload")
    .eq("thread_id", threadId)
    .order("id", { ascending: false })
    .limit(TUTOR_LIMITS.recentMessages);
  return ((data ?? []) as Row[]).reverse().map((row) => {
    if (row.kind === "lesson") {
      const parsed = readLesson(row.payload);
      const progress = parsed ? publicLesson(parsed.lesson, parsed.answers).progress : null;
      return { role: "assistant" as const, content: `[Mini-lesson "${String(row.content ?? "")}"${progress ? `: ${progress.correct}/${progress.total} correct` : ""}]` };
    }
    return { role: row.role === "assistant" ? "assistant" as const : "user" as const, content: String(row.content ?? "") };
  });
};

const threadsRoute = async (ctx: TutorRouteContext): Promise<Response> => {
  if (ctx.req.method === "GET") {
    const { data, error } = await ctx.sb
      .from("english_tutor_threads")
      .select(THREAD_COLUMNS)
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .order("last_message_at", { ascending: false })
      .limit(TUTOR_LIMITS.threadsPerLearner);
    if (error) return json(500, { error: "Could not load your conversations." });
    return json(200, { threads: ((data ?? []) as Row[]).map(publicThread) });
  }
  const body = await parseBody(ctx.req) as Row;
  const action = toText(body.action, 16);
  if (action === "create") return json(200, { thread: publicThread(await createThread(ctx, toText(body.title, 80) || "Conversation")) });
  if (action === "delete") {
    await ctx.sb.from("english_tutor_threads").delete().eq("id", toText(body.id, 64)).eq("user_id", ctx.userId);
    return json(200, { ok: true });
  }
  if (action === "import") {
    // The old tutor kept history on each device; bring it over as one conversation.
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .map((entry) => asRecord(entry))
      .map((entry) => ({ role: entry.role === "assistant" ? "assistant" as const : "user" as const, kind: "chat" as const, content: toText(entry.content, 2000) }))
      .filter((entry) => entry.content)
      .slice(-30);
    if (!messages.length) return json(200, { imported: false });
    const firstUser = messages.find((entry) => entry.role === "user")?.content ?? "Earlier conversation";
    // The same history sent twice (the device could not forget it) is not imported again.
    const same = await ctx.sb
      .from("english_tutor_threads")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .eq("title", threadTitle(firstUser));
    if (Number(same.count ?? 0) > 0) return json(200, { imported: false });
    const thread = await createThread(ctx, firstUser);
    await appendMessages(ctx, thread, messages);
    return json(200, { imported: true, thread: publicThread({ ...thread, message_count: messages.length }) });
  }
  return json(422, { error: "action must be create, delete or import" });
};

const threadMessagesRoute = async (ctx: TutorRouteContext, id: string): Promise<Response> => {
  const thread = await loadThread(ctx, id);
  if (!thread) return json(404, { error: "Conversation not found" });
  const { data, error } = await ctx.sb
    .from("english_tutor_messages")
    .select("id, role, kind, content, payload, created_at")
    .eq("thread_id", id)
    .order("id", { ascending: false })
    .limit(60);
  if (error) return json(500, { error: "Could not load the conversation." });
  return json(200, { thread: publicThread(thread), messages: ((data ?? []) as Row[]).reverse().map(publicMessage) });
};

// ---------------------------------------------------------------------------
// Chat turn
// ---------------------------------------------------------------------------

const chatRoute = async (ctx: TutorRouteContext): Promise<Response> => {
  const body = await parseBody(ctx.req) as Row;
  const message = toText(body.message, 2000);
  const { context, projectKey } = await loadTutorContext(ctx.sb, ctx.userId, ctx.languageId);

  // Older app versions send the whole history and keep it themselves: answer without saving.
  if (!message && Array.isArray(body.messages)) {
    const messages: TutorMessage[] = (body.messages as unknown[])
      .map((entry) => asRecord(entry))
      .map((entry) => ({ role: entry.role === "assistant" ? "assistant" as const : "user" as const, content: toText(entry.content, 2000) }))
      .filter((entry) => entry.content);
    if (!messages.length) return json(400, { error: "messages must contain at least one entry with role/content" });
    const result = await ctx.aiCall<unknown>(buildTutorChatRequest({ context, summary: "", messages }), null);
    const reply = result.status === "ok" ? normalizeTutorReply(result.data) : null;
    return json(200, {
      ok: true,
      ai_available: isEnglishAIConfigured(),
      ai_status: reply ? "ok" : result.status === "ok" ? "failed" : result.status,
      reply: reply?.reply ?? "",
      suggested_memories: reply?.memories ?? [],
      suggested_actions: (reply ? mergeActions(reply.actions, contextActions(context, projectKey)) : []).map((action) => ({ label: action.label ?? action.route, route: action.route, why: action.why ?? "" })),
      generated_at: new Date().toISOString(),
    });
  }

  if (!message) return json(400, { error: "Write a message first." });
  const threadId = toText(body.thread_id, 64);
  let thread = threadId ? await loadThread(ctx, threadId) : null;
  if (threadId && !thread) return json(404, { error: "Conversation not found" });
  const history = thread ? await recentForModel(ctx, String(thread.id)) : [];
  const summary = toText(thread?.summary, TUTOR_LIMITS.summaryChars);
  const result = await ctx.aiCall<unknown>(buildTutorChatRequest({ context, summary, messages: [...history, { role: "user", content: message }] }), null);
  const reply = result.status === "ok" ? normalizeTutorReply(result.data, summary) : null;
  if (!reply) {
    if (result.status === "failed") console.error(JSON.stringify({ event: "english_ai_failed", route: ctx.route, request_id: ctx.requestId, error: String(result.error ?? "unusable reply").slice(0, 300) }));
    return json(200, { ok: false, ai_status: result.status === "ok" ? "failed" : result.status, thread: thread ? publicThread(thread) : null });
  }
  thread ??= await createThread(ctx, message);
  const actions: TutorAction[] = mergeActions(reply.actions, contextActions(context, projectKey));
  const saved = await appendMessages(ctx, thread, [
    { role: "user", kind: "chat", content: message },
    { role: "assistant", kind: "chat", content: reply.reply, payload: { actions, lesson_topic: reply.lesson_topic } },
  ], reply.summary);
  return json(200, {
    ok: true,
    ai_status: "ok",
    thread: publicThread({ ...thread, message_count: Number(thread.message_count ?? 0) + 2, last_message_at: new Date().toISOString() }),
    messages: saved.map(publicMessage),
    reply: reply.reply,
    suggested_actions: actions,
    suggested_memories: reply.memories,
    lesson_topic: reply.lesson_topic,
  });
};

// ---------------------------------------------------------------------------
// Mini-lessons
// ---------------------------------------------------------------------------

const lessonRoute = async (ctx: TutorRouteContext): Promise<Response> => {
  const body = await parseBody(ctx.req) as Row;
  const access = await requireEnglishSuiteAccess(ctx.sb, ctx.userId, ctx.products);
  if (!access.allowed) return json(403, { error: "An active English service entitlement is required", code: "english_entitlement_required" });
  if (!("admin" in access && access.admin) && isServicePaused(await loadEnglishSettings(ctx.sb), "tutor")) return json(503, servicePausedBody("tutor"));

  const { context } = await loadTutorContext(ctx.sb, ctx.userId, ctx.languageId);
  const topic = lessonTopicFor(body.topic, context);
  if (!topic) return json(422, { error: "Choose a grammar point to practise.", code: "no_topic" });
  const grammarLevel = (context.levels.grammar ?? context.level ?? "B1").slice(0, 2);
  const level = CEFR.includes(grammarLevel) ? grammarLevel : "B1";
  const mistake = context.mistakes.find((entry) => entry.topic === topic && entry.example?.includes("→"))?.example ?? null;

  // Same lesson for everyone at this topic and level: one AI call, then the cache.
  let lesson: Lesson | null = null;
  const cached = await ctx.sb.from("english_tutor_lesson_cache").select("lesson").eq("topic", topic).eq("level", level).maybeSingle();
  if (cached.data?.lesson) lesson = normalizeLesson(cached.data.lesson, topic, level);
  if (!lesson) {
    const result = await callEnglishAIWithCredit<unknown>(
      defaultAICreditDeps(ctx.sb),
      ctx.userId,
      { ...buildLessonRequest({ topic, level, learnerExample: null }), feature: "tutor-lesson", userId: ctx.userId },
      null,
    );
    if (result.over_limit) return json(429, { error: "Daily English AI limit reached. Try again tomorrow.", code: "english_ai_daily_limit_reached" });
    lesson = result.status === "ok" ? normalizeLesson(result.data, topic, level) : null;
    if (!lesson) return json(200, { ok: false, ai_status: result.status === "ok" ? "failed" : result.status });
    await ctx.sb.from("english_tutor_lesson_cache").upsert({ topic, level, lesson }, { onConflict: "topic,level" });
  }

  const threadId = toText(body.thread_id, 64);
  let thread = threadId ? await loadThread(ctx, threadId) : null;
  thread ??= await createThread(ctx, lesson.title);
  const [saved] = await appendMessages(ctx, thread, [{ role: "assistant", kind: "lesson", content: lesson.title, payload: { lesson, answers: {}, mistake } }]);
  return json(200, {
    ok: true,
    thread: publicThread({ ...thread, message_count: Number(thread.message_count ?? 0) + 1 }),
    message: saved ? publicMessage(saved) : null,
  });
};

const lessonAnswerRoute = async (ctx: TutorRouteContext): Promise<Response> => {
  const body = await parseBody(ctx.req) as Row;
  const messageId = Number(body.message_id);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return json(422, { error: "message_id is required" });
  const { data } = await ctx.sb
    .from("english_tutor_messages")
    .select("id, role, kind, content, payload, created_at")
    .eq("id", messageId)
    .eq("user_id", ctx.userId)
    .eq("kind", "lesson")
    .maybeSingle();
  const parsed = data ? readLesson(data.payload) : null;
  if (!data || !parsed) return json(404, { error: "Lesson not found" });
  const item = lessonItemById(parsed.lesson, toText(body.item_id, 16));
  if (!item) return json(404, { error: "Question not found" });
  if (!parsed.answers[item.id]) {
    const checked = checkLessonAnswer(item, body.answer);
    if (!checked.given.trim()) return json(422, { error: "Write an answer first." });
    parsed.answers[item.id] = { given: checked.given, correct: checked.correct };
    const payload = { ...asRecord(data.payload), answers: parsed.answers };
    await ctx.sb.from("english_tutor_messages").update({ payload }).eq("id", messageId).eq("user_id", ctx.userId);
  }
  return json(200, { ok: true, message: publicMessage({ ...data, payload: { ...asRecord(data.payload), answers: parsed.answers } }) });
};

/** Dispatches tutor routes; null for anything else. */
export const handleTutorRoute = async (ctx: TutorRouteContext): Promise<Response | null> => {
  const { req, route } = ctx;
  if (route === "/tutor/memory" && (req.method === "GET" || req.method === "POST")) return await memoryRoute(ctx);
  if (route === "/tutor/context" && req.method === "GET") {
    const { context, projectKey } = await loadTutorContext(ctx.sb, ctx.userId, ctx.languageId);
    return json(200, { context, actions: contextActions(context, projectKey) });
  }
  if (route === "/tutor/threads" && (req.method === "GET" || req.method === "POST")) return await threadsRoute(ctx);
  const threadMatch = /^\/tutor\/threads\/([0-9a-f-]{36})$/i.exec(route);
  if (threadMatch && req.method === "GET") return await threadMessagesRoute(ctx, threadMatch[1]!);
  if (route === "/ai/tutor-chat" && req.method === "POST") return await chatRoute(ctx);
  if (route === "/tutor/lesson" && req.method === "POST") return await lessonRoute(ctx);
  if (route === "/tutor/lesson/answer" && req.method === "POST") return await lessonAnswerRoute(ctx);
  return null;
};
