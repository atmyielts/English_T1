// Shadowing routes (hub). The voice work happens in the browser; see
// _shared/english-shadowing.ts for the rules.
//
//   GET  /shadowing/sets   ?level=A1..C2  sentence sets cut from published listening scripts and reading texts
//   POST /shadowing/log    { score, words, seconds, source }  one take, recorded as a light speaking
//                          attempt (capped per learner day; never consumes the free activity)
import { learnerDayStart } from "../_shared/english-allowance.ts";
import { json, parseBody, resolveEnglishProducts, resolveOrCreateContentItem, toText } from "../_shared/english-learning.ts";
import { isServicePaused, loadEnglishSettings } from "../_shared/english-settings.ts";
import {
  buildShadowSets,
  decideShadowLog,
  parseShadowLog,
  seedFrom,
  SHADOWING_ATTEMPT_TYPE,
  SHADOWING_CONTENT_TYPE,
  SHADOWING_LOGS_PER_DAY,
  SHADOWING_SOURCE_REF,
  shadowRatio,
  type ShadowSourceRow,
} from "../_shared/english-shadowing.ts";
import { CEFR_ORDER, type Cefr, isCefr } from "../_shared/english-today.ts";

type Products = Awaited<ReturnType<typeof resolveEnglishProducts>>;
type Ctx = { sb: any; req: Request; url: URL; route: string; userId: string; languageId: string; products: Products };
type Row = Record<string, unknown>;

const SOURCE_ROWS_PER_KIND = 40;

/** The learner's speaking level (placement per skill, else overall), or null. */
const speakingLevel = async (ctx: Ctx): Promise<Cefr | null> => {
  const { data } = await ctx.sb.from("learner_language_goals")
    .select("current_cefr_estimate, metadata")
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .maybeSingle();
  const row = (data ?? {}) as Row;
  const placement = ((row.metadata as Row | undefined)?.placement ?? {}) as Row;
  const entry = (placement.per_skill as Row | undefined)?.speaking;
  const level = typeof entry === "string" ? entry : (entry as Row | undefined)?.level;
  if (isCefr(level)) return level;
  return isCefr(row.current_cefr_estimate) ? row.current_cefr_estimate : null;
};

const loadSources = async (ctx: Ctx, levels: Cefr[]): Promise<ShadowSourceRow[]> => {
  const listeningProduct = ctx.products.listening?.productId;
  const readingProduct = ctx.products.reading?.productId;
  const [listening, reading] = await Promise.all([
    listeningProduct
      ? ctx.sb.from("listening_items")
        .select("slug, title, level, transcript_text")
        .eq("product_id", listeningProduct)
        .eq("language_id", ctx.languageId)
        .eq("status", "published")
        .in("level", levels)
        .limit(SOURCE_ROWS_PER_KIND)
      : Promise.resolve({ data: [] }),
    readingProduct
      ? ctx.sb.from("reading_articles")
        .select("slug, title, level, content_markdown")
        .eq("product_id", readingProduct)
        .eq("language_id", ctx.languageId)
        .eq("status", "published")
        .in("level", levels)
        .limit(SOURCE_ROWS_PER_KIND)
      : Promise.resolve({ data: [] }),
  ]);
  return [
    ...((listening.data ?? []) as Row[]).map((row) => ({
      kind: "listening" as const,
      slug: toText(row.slug, 160),
      title: toText(row.title, 220),
      level: toText(row.level, 8).toUpperCase() || null,
      text: toText(row.transcript_text, 12000),
    })),
    ...((reading.data ?? []) as Row[]).map((row) => ({
      kind: "reading" as const,
      slug: toText(row.slug, 160),
      title: toText(row.title, 220),
      level: toText(row.level, 8).toUpperCase() || null,
      text: toText(row.content_markdown, 20000),
    })),
  ].filter((row) => row.slug && row.text);
};

const getSets = async (ctx: Ctx): Promise<Response> => {
  const requested = toText(ctx.url.searchParams.get("level"), 4).toUpperCase();
  const learnerLevel = await speakingLevel(ctx);
  const level: Cefr = isCefr(requested) ? requested : learnerLevel ?? "A2";
  const index = CEFR_ORDER.indexOf(level);
  // The level and its neighbours, so a level with little content still gets sets.
  const levels = CEFR_ORDER.filter((_, position) => Math.abs(position - index) <= 1);
  const rows = await loadSources(ctx, [...levels]);
  const day = learnerDayStart().slice(0, 10);
  const sets = buildShadowSets(rows, { level, seed: seedFrom(`${ctx.userId}:${day}`) });
  return json(200, { ok: true, level, learner_level: learnerLevel, levels: CEFR_ORDER, sets });
};

const logTake = async (ctx: Ctx): Promise<Response> => {
  const take = parseShadowLog(await parseBody(ctx.req));
  if (!take) return json(422, { error: "Say at least a few words first", code: "shadowing_take_too_short" });
  const productId = ctx.products.speaking?.productId;
  if (!productId) return json(200, { ok: true, logged: false, reason: "unavailable", left: 0 });

  const [settings, todayRes] = await Promise.all([
    loadEnglishSettings(ctx.sb),
    ctx.sb.from("learning_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .eq("attempt_type", SHADOWING_ATTEMPT_TYPE)
      .gte("created_at", learnerDayStart()),
  ]);
  const decision = decideShadowLog({ loggedToday: Number(todayRes.count ?? 0), paused: isServicePaused(settings, "speaking") });
  if (!decision.log) return json(200, { ok: true, logged: false, reason: decision.reason, left: decision.left });

  const contentItem = await resolveOrCreateContentItem(ctx.sb, {
    productId,
    languageId: ctx.languageId,
    serviceKey: "speaking",
    contentType: SHADOWING_CONTENT_TYPE,
    sourceRef: SHADOWING_SOURCE_REF,
    title: "Shadowing",
    description: "Listen to a sentence and say it with the same rhythm.",
    skillKey: "speaking",
    subskillKeys: ["speaking.pronunciation", "speaking.fluency"],
    estimatedMinutes: 1,
    tags: [SHADOWING_CONTENT_TYPE],
  });
  // A light record: no feedback rows, skill signals or mistakes, so a
  // shadowing take never moves the speaking rating or the mistake list.
  const ratio = shadowRatio(take);
  const nowIso = new Date().toISOString();
  const { data, error } = await ctx.sb.from("learning_attempts")
    .insert({
      user_id: ctx.userId,
      language_id: ctx.languageId,
      product_id: productId,
      content_item_id: String(contentItem.id),
      service_key: "speaking",
      attempt_type: SHADOWING_ATTEMPT_TYPE,
      status: "scored",
      response_json: { source: take.source, words: take.words, score: take.score },
      scoring_json: { correctness_ratio: ratio, overall_score: ratio, word_check: take.score !== null },
      time_spent_seconds: take.seconds,
      correctness_ratio: ratio,
      overall_score: ratio,
      started_at: nowIso,
      submitted_at: nowIso,
      scored_at: nowIso,
      metadata: { source: take.source, light: true },
    })
    .select("id")
    .maybeSingle();
  if (error || !data?.id) throw new Error(`Failed to record shadowing: ${error?.message ?? "unknown"}`);
  return json(200, { ok: true, logged: true, reason: "ok", left: decision.left, attempt_id: String(data.id), per_day: SHADOWING_LOGS_PER_DAY });
};

/** Returns a response for /shadowing/* routes, or null for anything else. */
export const handleShadowingRoute = async (ctx: Ctx): Promise<Response | null> => {
  if (ctx.req.method === "GET" && ctx.route === "/shadowing/sets") return await getSets(ctx);
  if (ctx.req.method === "POST" && ctx.route === "/shadowing/log") return await logTake(ctx);
  return null;
};
