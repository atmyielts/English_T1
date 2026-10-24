// Search inside the content (hub):
//
//   GET /search   ?q=<text, 2..80 characters>
//
// Lessons in every skill by title, topic or level ("b1"), the learner's own
// notebook words and recent mistakes, and grammar handbook rules. Each lesson
// says whether the learner can open it (in their plan / today's free activity
// / not in their plan). Ranking rules in _shared/english-search.ts.
import { corsHeaders, json, toText } from "../_shared/english-learning.ts";
import { checkActivityAccess } from "../_shared/english-allowance.ts";
import { topicFromSubskill } from "../_shared/english-mistakes.ts";
import {
  ilikePattern,
  rankSearch,
  type SearchLesson,
  type SearchMistake,
  type SearchRule,
  searchTerms,
  type SearchWord,
} from "../_shared/english-search.ts";
import { type Cefr, CEFR_ORDER, isCefr, TODAY_SKILLS } from "../_shared/english-today.ts";

type Row = Record<string, unknown>;
type Ctx = { sb: any; req: Request; url: URL; route: string; userId: string; languageId: string; products: Record<string, { productId?: string | null }> };

const PRIMARY_CONTENT_TYPES = [
  "reading.article",
  "listening.item",
  "writing.prompt",
  "speaking.prompt",
  "grammar.unit",
  "immersion.mission",
  "vocabulary.deck",
];
const CACHE_MS = 5 * 60_000;
const MISTAKE_DAYS = 120;

// The catalog and the handbook are the same for everyone: cached per function instance.
let contentCache: { at: number; languageId: string; lessons: SearchLesson[]; rules: SearchRule[] } | null = null;

const loadContent = async (sb: any, languageId: string) => {
  if (contentCache && contentCache.languageId === languageId && Date.now() - contentCache.at < CACHE_MS) return contentCache;
  const [lessonsRes, rulesRes] = await Promise.all([
    sb.from("learning_content_registry_items")
      .select("id, service_key, source_ref, title, cefr_level, tags")
      .eq("language_id", languageId)
      .eq("status", "published")
      .in("content_type", PRIMARY_CONTENT_TYPES)
      .limit(3000),
    sb.from("grammar_units")
      .select("slug, title, level, focus_area")
      .eq("language_id", languageId)
      .eq("status", "published")
      .limit(1000),
  ]);
  if (lessonsRes.error) throw new Error(`Failed to load lessons: ${lessonsRes.error.message}`);
  const lessons: SearchLesson[] = ((lessonsRes.data ?? []) as Row[])
    .filter((row) => (TODAY_SKILLS as readonly string[]).includes(String(row.service_key)) && row.source_ref && row.title)
    .map((row) => ({
      id: String(row.id),
      skill: String(row.service_key),
      slug: String(row.source_ref),
      title: String(row.title),
      level: typeof row.cefr_level === "string" ? row.cefr_level : null,
      tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map(String).slice(0, 12) : [],
    }));
  const rules: SearchRule[] = rulesRes.error ? [] : ((rulesRes.data ?? []) as Row[])
    .filter((row) => row.slug && row.title)
    .map((row) => ({
      slug: String(row.slug),
      title: String(row.title),
      level: typeof row.level === "string" ? row.level : null,
      focus_area: typeof row.focus_area === "string" ? row.focus_area : null,
    }));
  contentCache = { at: Date.now(), languageId, lessons, rules };
  return contentCache;
};

/** The grammar lesson for a topic closest to the learner's level. */
const lessonForTopic = (rules: SearchRule[], topic: string, level: Cefr | null): string | null => {
  const target = CEFR_ORDER.indexOf(level ?? "B1");
  return rules
    .filter((rule) => rule.focus_area === topic)
    .sort((a, b) => Math.abs(CEFR_ORDER.indexOf(a.level as Cefr) - target) - Math.abs(CEFR_ORDER.indexOf(b.level as Cefr) - target))[0]?.slug ?? null;
};

const search = async (ctx: Ctx): Promise<Response> => {
  const raw = toText(ctx.url.searchParams.get("q"), 80);
  const terms = searchTerms(raw);
  if (!terms) return json(200, { ok: true, results: [] });
  const { sb, userId, languageId } = ctx;
  const wordPattern = terms.words.length ? ilikePattern(terms.words.join(" ")) : null;

  const [content, access, goalRes, wordsRes, mistakesRes] = await Promise.all([
    loadContent(sb, languageId),
    checkActivityAccess(sb, { userId, languageId, products: ctx.products, skill: null }),
    sb.from("learner_language_goals").select("current_cefr_estimate").eq("user_id", userId).eq("language_id", languageId).maybeSingle(),
    wordPattern
      ? sb.from("user_vocabulary_notebook_entries")
        .select("id, word, metadata")
        .eq("user_id", userId)
        .eq("language_id", languageId)
        .eq("is_archived", false)
        .ilike("word", wordPattern)
        .order("updated_at", { ascending: false })
        .limit(20)
      : Promise.resolve({ data: [], error: null }),
    sb.from("learner_language_errors")
      .select("id, service_key, skill_key, subskill_key, error_type")
      .eq("user_id", userId)
      .eq("language_id", languageId)
      .in("mastery_status", ["open", "reopened", "improving"])
      .gte("last_seen_at", new Date(Date.now() - MISTAKE_DAYS * 86_400_000).toISOString())
      .order("last_seen_at", { ascending: false })
      .limit(300),
  ]);

  const learnerLevel = isCefr(goalRes.data?.current_cefr_estimate) ? goalRes.data.current_cefr_estimate as Cefr : null;
  const words: SearchWord[] = ((wordsRes.data ?? []) as Row[]).map((row) => {
    const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Row;
    const definition = typeof meta.definition === "string" ? meta.definition : typeof meta.translation === "string" ? meta.translation : null;
    return { id: String(row.id), word: String(row.word ?? ""), definition };
  });
  const mistakes: SearchMistake[] = ((mistakesRes.data ?? []) as Row[]).flatMap((row) => {
    const text = String(row.error_type ?? "").trim();
    if (!text) return [];
    const topic = topicFromSubskill(String(row.subskill_key ?? ""));
    const skill = row.service_key === "academy_homework" ? String(row.skill_key ?? "grammar") : topic ? "grammar" : String(row.service_key ?? "");
    return [{
      id: String(row.id),
      skill,
      subskill: String(row.subskill_key ?? ""),
      text: text.slice(0, 200),
      topic,
      lesson_slug: topic ? lessonForTopic(content.rules, topic, learnerLevel) : null,
    }];
  });

  const results = rankSearch(raw, { lessons: content.lessons, words, mistakes, rules: content.rules }, {
    access: { owned: access.admin ? [...TODAY_SKILLS] : access.entitled_skills, freeLeft: access.free_left },
    learnerLevel,
  });
  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=30", ...corsHeaders },
  });
};

/** Hub dispatch for content search; null when the route is not this one. */
export const handleSearchRoute = async (ctx: Ctx): Promise<Response | null> => {
  if (ctx.req.method === "GET" && ctx.route === "/search") return await search(ctx);
  return null;
};
