// "Continue anywhere" (hub):
//
//   GET  /resume            ?locale=en|ru|uz  what can be continued now, newest first
//   POST /resume            { skill, slug, position? }  where the learner is in an activity
//                           (without a position, an earlier place in the same activity is kept)
//   POST /resume/clear      { skill }  forget a skill's point (finished, or dismissed)
//   GET  /resume/roleplay   ?id=<session id>  an active role-play's lines, to continue it on another device
//
// Rules in _shared/english-resume.ts; the table is english_resume_points.
// loadResumeItems() is also used by GET /next (engine.ts) for "Up next".
import { json, parseBody, toText } from "../_shared/english-learning.ts";
import { parseResumeWrite, RESUME_GRACE_MS, RESUME_MAX_AGE_DAYS, type ResumeItem, selectResume } from "../_shared/english-resume.ts";
import { asLocale, readMessages, ROLEPLAY_MAX_TURNS, ROLEPLAY_MIN_TURNS, ROLEPLAY_SESSION_TTL_MS, roleplayScenario } from "../_shared/english-roleplay.ts";
import { MOCK_RESUME_MS } from "../_shared/english-speaking-mock.ts";
import { TODAY_SKILLS } from "../_shared/english-today.ts";

type Row = Record<string, unknown>;
type Ctx = { sb: any; req: Request; url: URL; route: string; userId: string; languageId: string };

const DAY_MS = 86_400_000;
const DONE_STATUSES = ["submitted", "scored", "failed"];

const relation = (row: Row): Row => {
  const value = row.learning_content_registry_items;
  return ((Array.isArray(value) ? value[0] : value) ?? {}) as Row;
};

/**
 * Everything the learner can continue now. Never throws: a missing table or a
 * failed read just means nothing to continue (the caller still works).
 */
export const loadResumeItems = async (sb: any, userId: string, languageId: string, locale: string | null = "en"): Promise<ResumeItem[]> => {
  try {
    const now = new Date();
    const lang = asLocale(locale);
    const since = new Date(now.getTime() - RESUME_MAX_AGE_DAYS * DAY_MS).toISOString();
    const [pointsRes, roleplaysRes, mocksRes] = await Promise.all([
      sb.from("english_resume_points")
        .select("skill, slug, title, position, updated_at")
        .eq("user_id", userId)
        .eq("language_id", languageId)
        .gte("updated_at", since)
        .order("updated_at", { ascending: false })
        .limit(TODAY_SKILLS.length),
      sb.from("english_roleplay_sessions")
        .select("id, scenario_id, learner_turns, updated_at")
        .eq("user_id", userId)
        .eq("language_id", languageId)
        .eq("status", "active")
        .gte("updated_at", new Date(now.getTime() - ROLEPLAY_SESSION_TTL_MS).toISOString())
        .order("updated_at", { ascending: false })
        .limit(3),
      sb.from("english_speaking_mocks")
        .select("id, started_at")
        .eq("user_id", userId)
        .eq("language_id", languageId)
        .eq("status", "in_progress")
        .gte("started_at", new Date(now.getTime() - MOCK_RESUME_MS).toISOString())
        .order("started_at", { ascending: false })
        .limit(1),
    ]);
    const points = pointsRes.error ? [] : (pointsRes.data ?? []) as Row[];

    // Submissions since the oldest point, to drop points already finished.
    let finished: Array<{ skill: string; slug: string; submitted_at: string }> = [];
    if (points.length) {
      const oldest = Math.min(...points.map((row) => Date.parse(String(row.updated_at))).filter(Number.isFinite));
      const { data } = await sb.from("learning_attempts")
        .select("service_key, submitted_at, learning_content_registry_items!inner(source_ref)")
        .eq("user_id", userId)
        .eq("language_id", languageId)
        .in("status", DONE_STATUSES)
        .in("service_key", [...new Set(points.map((row) => String(row.skill)))])
        .gte("submitted_at", new Date(oldest - RESUME_GRACE_MS).toISOString())
        .order("submitted_at", { ascending: false })
        .limit(300);
      finished = ((data ?? []) as Row[]).map((row) => ({
        skill: String(row.service_key ?? ""),
        slug: String(relation(row).source_ref ?? ""),
        submitted_at: String(row.submitted_at ?? ""),
      }));
    }

    return selectResume({
      now,
      points: points.map((row) => ({
        skill: String(row.skill),
        slug: String(row.slug),
        title: typeof row.title === "string" ? row.title : null,
        position: row.position,
        updated_at: String(row.updated_at),
      })),
      finished,
      roleplays: (roleplaysRes.error ? [] : (roleplaysRes.data ?? []) as Row[]).map((row) => {
        const scenario = roleplayScenario(String(row.scenario_id ?? ""));
        return {
          id: String(row.id),
          scenario_id: String(row.scenario_id ?? ""),
          title: scenario ? scenario.title[lang] || scenario.title.en : null,
          learner_turns: Number(row.learner_turns ?? 0) || 0,
          max_turns: ROLEPLAY_MAX_TURNS,
          updated_at: String(row.updated_at ?? ""),
        };
      }),
      mocks: (mocksRes.error ? [] : (mocksRes.data ?? []) as Row[]).map((row) => ({ id: String(row.id), started_at: String(row.started_at ?? "") })),
      roleplayTtlMs: ROLEPLAY_SESSION_TTL_MS,
      mockResumeMs: MOCK_RESUME_MS,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "english_resume_load_failed", user_id: userId, message: String((error as Error)?.message ?? error) }));
    return [];
  }
};

const saveResume = async (ctx: Ctx): Promise<Response> => {
  const input = parseResumeWrite(await parseBody(ctx.req));
  if (!input) return json(422, { error: "Invalid resume point", code: "resume_invalid" });
  // Only real, published activities; the title shown later is the catalog's, not the client's.
  const { data: item, error: itemError } = await ctx.sb.from("learning_content_registry_items")
    .select("title")
    .eq("language_id", ctx.languageId)
    .eq("service_key", input.skill)
    .eq("source_ref", input.slug)
    .eq("status", "published")
    .limit(1)
    .maybeSingle();
  if (itemError) throw new Error(`Failed to check the activity: ${itemError.message}`);
  if (!item) return json(404, { error: "Activity not found", code: "resume_unknown_activity" });
  const nowIso = new Date().toISOString();
  if (!input.position) {
    // Just opened: keep a place saved earlier in the same activity (perhaps on another device).
    const { data: touched, error: touchError } = await ctx.sb.from("english_resume_points")
      .update({ updated_at: nowIso })
      .eq("user_id", ctx.userId)
      .eq("language_id", ctx.languageId)
      .eq("skill", input.skill)
      .eq("slug", input.slug)
      .select("skill");
    if (touchError) throw new Error(`Failed to save the resume point: ${touchError.message}`);
    if ((touched ?? []).length) return json(200, { ok: true });
  }
  const { error } = await ctx.sb.from("english_resume_points").upsert({
    user_id: ctx.userId,
    language_id: ctx.languageId,
    skill: input.skill,
    slug: input.slug,
    title: typeof item.title === "string" ? item.title.slice(0, 220) : input.title,
    position: input.position,
    updated_at: nowIso,
  }, { onConflict: "user_id,language_id,skill" });
  if (error) throw new Error(`Failed to save the resume point: ${error.message}`);
  return json(200, { ok: true });
};

const clearResume = async (ctx: Ctx): Promise<Response> => {
  const body = await parseBody(ctx.req) as Row;
  const skill = toText(body.skill, 24);
  if (!(TODAY_SKILLS as readonly string[]).includes(skill)) return json(422, { error: "Invalid skill", code: "resume_invalid" });
  let query = ctx.sb.from("english_resume_points").delete().eq("user_id", ctx.userId).eq("language_id", ctx.languageId).eq("skill", skill);
  const slug = toText(body.slug, 160);
  if (slug) query = query.eq("slug", slug);
  const { error } = await query;
  if (error) throw new Error(`Failed to clear the resume point: ${error.message}`);
  return json(200, { ok: true });
};

/** An active role-play's conversation, so it can be continued on another device. */
const roleplayState = async (ctx: Ctx): Promise<Response> => {
  const id = toText(ctx.url.searchParams.get("id"), 64);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(404, { error: "Role-play not found", code: "roleplay_not_found" });
  const { data, error } = await ctx.sb.from("english_roleplay_sessions")
    .select("id, scenario_id, level, status, messages, goals_met, learner_turns, updated_at")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .eq("language_id", ctx.languageId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load role-play: ${error.message}`);
  const row = data as Row | null;
  const fresh = row && Date.now() - Date.parse(String(row.updated_at)) < ROLEPLAY_SESSION_TTL_MS;
  if (!row || row.status !== "active" || !fresh || !roleplayScenario(row.scenario_id)) {
    return json(409, { error: "This conversation has ended. Start a new one.", code: "roleplay_session_closed" });
  }
  const turns = Number(row.learner_turns ?? 0) || 0;
  return json(200, {
    ok: true,
    session_id: String(row.id),
    scenario_id: String(row.scenario_id),
    level: row.level ?? null,
    messages: readMessages(row.messages),
    goals_met: Array.isArray(row.goals_met) ? (row.goals_met as unknown[]).map(String) : [],
    turns_left: Math.max(0, ROLEPLAY_MAX_TURNS - turns),
    can_finish: turns >= ROLEPLAY_MIN_TURNS,
    should_finish: turns >= ROLEPLAY_MAX_TURNS,
  });
};

/** Hub dispatch for "continue anywhere"; null when the route is not one of these. */
export const handleResumeRoute = async (ctx: Ctx): Promise<Response | null> => {
  const { req, route } = ctx;
  if (req.method === "GET" && route === "/resume") {
    const items = await loadResumeItems(ctx.sb, ctx.userId, ctx.languageId, ctx.url.searchParams.get("locale"));
    return json(200, { ok: true, items });
  }
  if (req.method === "POST" && route === "/resume") return await saveResume(ctx);
  if (req.method === "POST" && route === "/resume/clear") return await clearResume(ctx);
  if (req.method === "GET" && route === "/resume/roleplay") return await roleplayState(ctx);
  return null;
};
