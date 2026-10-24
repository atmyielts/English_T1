// academy-learning: Homework OS and Courses on top of Academy
// (docs/product/40_HOMEWORK_OS.md, 41_SCHOOD_COURSES.md, 42_HOMEWORK_AND_COURSES_BUILD_PLAN.md).
//
// Callers:
//   * Academy staff (JWT): review queue, decisions, mistakes, funnel, plan, settings, course unlock rules.
//   * Learners (JWT): their own mistake bank and whether it feeds Schood English (D4).
//   * Guardians (JWT): that same setting for their child.
//   * The student bot Worker (x-worker-secret = TELEGRAM_INTERNAL_SECRET): telegram_update.
//   * pg_cron (x-worker-secret = internal_runtime_secrets.academy_learning_secret): worker cycles.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  anonClient, corsHeaders, type Db, env, HttpError, json, requiredEnv, rpc, secretEquals, serviceClient, telegramClient,
} from "./core.ts";
import { isUuid, type Row } from "./lib.ts";
import { runPremarkSweep } from "./premark.ts";
import * as catalog from "./catalog.ts";
import * as consent from "./consent.ts";
import * as miniapp from "./miniapp.ts";
import * as staff from "./staff.ts";
import { handleTelegramUpdate } from "./telegram.ts";

const STAFF_ACTIONS: Record<string, (ctx: Parameters<typeof staff.overview>[0]) => Promise<unknown>> = {
  homework_overview: staff.overview,
  homework_settings: staff.updateSettings,
  review_queue: staff.reviewQueue,
  review_decide: staff.reviewDecide,
  correction_decide: staff.correctionDecide,
  homework_mistakes: staff.mistakes,
  mistake_update: staff.mistakeUpdate,
  homework_funnel: staff.funnel,
  course_modules: staff.courseModules,
  set_module_unlock: staff.setModuleUnlock,
  course_listing_get: catalog.listingGet,
  course_listing_save: catalog.listingSave,
};

const bearer = (req: Request): string | null => {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token && !token.startsWith("sb_")) return token;
  return req.headers.get("x-user-jwt")?.trim() || null;
};

const workerSecret = async (sb: Db): Promise<string> => {
  const fromEnv = env("ACADEMY_LEARNING_WORKER_SECRET");
  if (fromEnv) return fromEnv;
  const { data } = await sb.from("internal_runtime_secrets").select("secret").eq("key", "academy_learning_secret").maybeSingle();
  return String(data?.secret ?? "");
};

const isTelegramWorker = async (req: Request): Promise<boolean> => {
  const supplied = req.headers.get("x-worker-secret")?.trim() ?? "";
  if (supplied) return secretEquals(supplied, env("TELEGRAM_INTERNAL_SECRET") ?? "");
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") && secretEquals(header.slice(7).trim(), env("SUPABASE_SERVICE_ROLE_KEY") ?? "");
};

const studentMistakes = async (sb: Db, userId: string, academyId: string | null) => {
  const result = await rpc<Row>(sb, "academy_student_contacts_command", { p_actor_id: userId }, "Your student links could not be confirmed.");
  const contacts = (Array.isArray(result?.contacts) ? result.contacts as Row[] : [])
    .filter((c) => !academyId || String(c.academy_id) === academyId);
  const contactIds = contacts.map((c) => String(c.id)).filter(isUuid);
  if (!contactIds.length) return { mistakes: [] };
  const { data } = await sb.from("academy_homework_mistakes")
    .select("id, academy_id, assignment_id, tag, excerpt, correction, explanation, status, created_at, resolved_at")
    .in("contact_id", contactIds).neq("status", "dismissed").order("created_at", { ascending: false }).limit(300);
  const rows = (data ?? []) as Row[];
  const assignmentIds = [...new Set(rows.map((m) => String(m.assignment_id)))];
  const { data: assignments } = assignmentIds.length
    ? await sb.from("academy_assignments").select("id, title").in("id", assignmentIds)
    : { data: [] };
  const titles = new Map(((assignments ?? []) as Row[]).map((a) => [String(a.id), String(a.title ?? "")]));
  return { mistakes: rows.map((m) => ({ ...m, assignment_title: titles.get(String(m.assignment_id)) ?? null })) };
};

// Checked once per warm instance; cheap (one getMyCommands) and idempotent.
let botCommandsChecked = false;

const HOMEWORK_BOT_COMMANDS = [
  { command: "homework", description: "Open homework; send answers here" },
  { command: "center", description: "Choose which centre gets your homework" },
];

/** Adds the homework commands to the student bot's menu, keeping every existing command. */
export const ensureBotCommands = async (tg: Pick<ReturnType<typeof telegramClient>, "call">) => {
  const current = await tg.call("getMyCommands", {});
  const existing = Array.isArray(current.result) ? current.result as Array<{ command: string; description: string }> : [];
  // A bot with no menu yet gets the commands its /help already advertises.
  const base = existing.length ? existing : [
    { command: "app", description: "Open the Schood Telegram app" },
    { command: "assignments", description: "Assignments due this week" },
    { command: "results", description: "Recent scores" },
    { command: "schedule", description: "Weekly class timetable" },
    { command: "help", description: "All commands" },
  ];
  const missing = HOMEWORK_BOT_COMMANDS.filter((c) => !base.some((e) => e.command === c.command));
  if (!existing.length) {
    const result = await tg.call("setMyCommands", { commands: [...base.slice(0, 2), ...missing, ...base.slice(2)] });
    return { changed: result.ok === true, commands: base.length + missing.length };
  }
  if (!missing.length) return { changed: false, commands: existing.length };
  const result = await tg.call("setMyCommands", { commands: [...existing, ...missing] });
  return { changed: result.ok === true, commands: existing.length + missing.length };
};

export const handleAcademyLearningRequest = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Use POST" });
  try {
    if ((req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return json(400, { error: "Invalid upload" });
      }
      if (form.get("action") !== "miniapp_submit") return json(400, { error: "Unknown action" });
      return json(200, await miniapp.miniAppSubmit({ sb: serviceClient() }, form));
    }
    let body: Row;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Invalid JSON" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Invalid JSON" });
    const action = String(body.action ?? "");
    const sb = serviceClient();

    if (action === "worker") {
      const supplied = req.headers.get("x-worker-secret")?.trim() ?? "";
      if (!(await secretEquals(supplied, await workerSecret(sb)))) return json(401, { error: "Unauthorized" });
      if (body.cycle === "premark") return json(200, await runPremarkSweep({ sb }));
      if (body.cycle === "digest") {
        const { data, error } = await sb.rpc("academy_homework_queue_guardian_digest", { p_week_start: null });
        if (error) throw new HttpError(503, "Digest queueing failed");
        return json(200, { queued: data });
      }
      if (body.cycle === "bot_commands") return json(200, await ensureBotCommands(telegramClient(requiredEnv("TELEGRAM_BOT_TOKEN"))));
      return json(400, { error: "Unknown worker cycle" });
    }

    if (action === "miniapp_homework") return json(200, await miniapp.miniAppHomework({ sb }, body));
    if (action === "miniapp_center") return json(200, await miniapp.miniAppSetCentre({ sb }, body));
    if (action === "miniapp_mistakes") return json(200, await miniapp.miniAppMistakes({ sb }, body));
    if (action === "miniapp_mistake_feed") return json(200, await miniapp.miniAppFeedConsent({ sb }, body));
    if (action === "miniapp_mistake_feed_set") return json(200, await miniapp.miniAppSetFeedConsent({ sb }, body));

    if (action === "public_courses") return json(200, await catalog.publicCourses(sb, body));
    if (action === "public_course") return json(200, await catalog.publicCourse(sb, body));
    if (action === "public_course_lead") return json(200, await catalog.publicCourseLead(sb, req, body));

    if (action === "telegram_update") {
      if (!(await isTelegramWorker(req))) return json(401, { error: "Unauthorized" });
      const update = body.update && typeof body.update === "object" ? body.update as Row : null;
      if (!update) return json(400, { error: "update is required" });
      const tg = telegramClient(requiredEnv("TELEGRAM_BOT_TOKEN"));
      const result = await handleTelegramUpdate({ sb, tg, siteUrl: env("SITE_URL") ?? "https://schood.online" }, update);
      if (result.handled && !botCommandsChecked) {
        botCommandsChecked = true;
        await ensureBotCommands(tg).catch(() => { botCommandsChecked = false; });
      }
      return json(200, result);
    }

    const token = bearer(req);
    if (!token) return json(401, { error: "Unauthorized" });
    const { data: auth, error: authError } = await anonClient().auth.getUser(token);
    if (authError || !auth?.user?.id) return json(401, { error: "Unauthorized" });
    const userId = String(auth.user.id);
    if (body._expected_actor != null && body._expected_actor !== userId) {
      return json(409, { error: "Your account changed. Reopen this page." });
    }

    if (action === "student_mistakes") return json(200, await studentMistakes(sb, userId, isUuid(body.academy_id) ? String(body.academy_id) : null));
    if (action === "student_mistake_feed") return json(200, await consent.learnerConsents(sb, userId, isUuid(body.academy_id) ? String(body.academy_id) : null));
    if (action === "student_mistake_feed_set") return json(200, await consent.setLearnerConsent(sb, userId, body, "academy_web"));
    if (action === "guardian_mistake_feed") return json(200, await consent.guardianConsent(sb, userId, body));
    if (action === "guardian_mistake_feed_set") return json(200, await consent.setGuardianConsent(sb, userId, body));

    const handler = STAFF_ACTIONS[action];
    if (!handler) return json(400, { error: "Unknown action" });
    const academyId = String(body.academy_id ?? "");
    if (!isUuid(academyId)) return json(400, { error: "academy_id is required" });
    return json(200, await handler({ sb, actorId: userId, academyId, body, siteUrl: env("SITE_URL") ?? "https://schood.online" }));
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message, ...(error.code ? { error_code: error.code } : {}) });
    console.error(JSON.stringify({ event: "academy_learning_unhandled", message: error instanceof Error ? error.message : "unknown" }));
    return json(500, { error: "Something went wrong. Retry." });
  }
};

if (import.meta.main) serve(handleAcademyLearningRequest);
