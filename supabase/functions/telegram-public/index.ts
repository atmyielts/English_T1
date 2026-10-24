import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalRequest } from "../_shared/internal-auth.ts";
import { advanceTelegramJourney, parseTelegramStartPayload } from "../_shared/telegram-growth.ts";
import { validateTelegramInitData } from "../_shared/telegram-init-data.ts";
import { runEnglishCheck } from "./english-check.ts";

type Json = Record<string, any>;
type DbClient = ReturnType<typeof createClient<any>>;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors } });
const env = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};
const normalize = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const telegramId = (value: unknown) => {
  const id = normalize(value, 80);
  return /^\d{1,20}$/.test(id) ? id : null;
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const normalizeWhitespace = (value: unknown, max = 4000) => normalize(value, max).replace(/\s+/g, " ");
const canonicalSourceUrl = (value: unknown): string => {
  try {
    const url = new URL(normalize(value, 1000));
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
};
const timeBucket = (milliseconds: number, now = Date.now()) => new Date(Math.floor(now / milliseconds) * milliseconds).toISOString();
const enforcePublicRateLimit = async (sb: DbClient, req: Request, secret: string) => {
  const address = normalize(req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown", 120);
  const rateKey = await sha256(`${secret}\u001f${address}`);
  const { data, error } = await sb.rpc("telegram_public_rate_limit_consume", {
    p_rate_key: rateKey,
    p_window_seconds: 600,
    p_max_requests: 10,
  }).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "rate_limit_check_failed");
  return data as { allowed: boolean; request_count: number; retry_after_seconds: number };
};
const readTelegramContext = async (initData: string): Promise<Json | null> => {
  const botToken = Deno.env.get("TELEGRAM_PUBLIC_BOT_TOKEN") || "";
  if (!initData || !botToken) return null;
  try {
    return await validateTelegramInitData(initData, botToken);
  } catch {
    return null;
  }
};

const journeyEvent = async (sb: DbClient, session: Json, eventName: string, step: string, idempotencyKey: string | null, metadata: Json = {}) => {
  const { error } = await sb.from("telegram_journey_events").insert({
    session_id: session.id,
    telegram_user_id: session.telegram_user_id,
    event_name: eventName,
    step,
    idempotency_key: idempotencyKey,
    metadata,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
};

const claimUpdate = async (sb: DbClient, body: Json) => {
  const updateId = Number(body.update_id);
  const botName = normalize(body.bot_name, 80);
  if (!Number.isSafeInteger(updateId) || !botName) return { status: 400, body: { error: "valid bot_name and update_id required" } };
  const { data, error } = await sb.rpc("claim_telegram_update", {
    p_bot_name: botName,
    p_update_id: updateId,
    p_telegram_user_id: telegramId(body.telegram_user_id),
    p_update_kind: normalize(body.update_kind, 80) || null,
    p_stale_after_seconds: 120,
  }).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "telegram_update_claim_failed");
  const claim = data as Record<string, unknown>;
  return { status: claim.outcome === "busy" ? 409 : 200, body: { ok: true, ...claim } };
};

const completeUpdate = async (sb: DbClient, body: Json) => {
  const updateId = Number(body.update_id);
  const botName = normalize(body.bot_name, 80);
  const claimToken = normalize(body.claim_token, 80);
  if (!Number.isSafeInteger(updateId) || !botName || !uuidPattern.test(claimToken)) return { ok: false, error: "invalid_update_completion" };
  const { data, error } = await sb.rpc("complete_telegram_update", {
    p_bot_name: botName,
    p_update_id: updateId,
    p_claim_token: claimToken,
    p_failed: Boolean(body.failed),
    p_error: body.failed ? normalize(body.error, 1000) || "processing_failed" : null,
  });
  if (error) throw new Error(error.message);
  return { ok: data === true };
};

const startSession = async (sb: DbClient, body: Json) => {
  const userId = telegramId(body.telegram_user_id);
  if (!userId) return { status: 400, body: { error: "valid telegram_user_id required" } };
  let attribution;
  try { attribution = parseTelegramStartPayload(body.payload); } catch { return { status: 400, body: { error: "Invalid start payload" } }; }
  const botName = normalize(body.bot_name, 80) || "schoodonlinebot";
  const now = new Date().toISOString();
  let { data: session } = await sb.from("telegram_acquisition_sessions").select("*")
    .eq("bot_name", botName).eq("telegram_user_id", userId).eq("status", "active").maybeSingle();
  const touch = {
    source: attribution.source, medium: attribution.medium, campaign: attribution.campaign,
    creative: attribution.creative, offer: null, funnel: attribution.funnel, payload: attribution.payload,
  };
  const switchesFocusedFunnel = session && attribution.payload && attribution.funnel !== "generic" && attribution.funnel !== session.funnel;
  if (switchesFocusedFunnel && session) {
    const previousMetadata = session.metadata && typeof session.metadata === "object" ? session.metadata : {};
    const { error } = await sb.from("telegram_acquisition_sessions").update({
      status: "superseded",
      updated_at: now,
      metadata: { ...previousMetadata, superseded_by_payload: attribution.payload, superseded_at: now },
    }).eq("id", session.id).eq("status", "active");
    if (error) throw new Error(error.message);
    session = null;
  }
  if (session) {
    const updates: Json = { latest_attribution: touch, updated_at: now };
    if (attribution.payload) Object.assign(updates, {
      campaign_id: attribution.campaign, source: attribution.source, medium: attribution.medium,
      creative: attribution.creative, funnel: attribution.funnel, intent: attribution.intent,
      role_hint: attribution.roleHint, deep_link_payload: attribution.payload, referrer_code: attribution.referrerCode,
    });
    const result = await sb.from("telegram_acquisition_sessions").update(updates).eq("id", session.id).select("*").maybeSingle();
    if (result.error) throw new Error(result.error.message);
    session = result.data ?? session;
  } else {
    const { data, error } = await sb.from("telegram_acquisition_sessions").insert({
      bot_name: botName, telegram_user_id: userId, campaign_id: attribution.campaign,
      source: attribution.source, medium: attribution.medium, creative: attribution.creative,
      funnel: attribution.funnel, intent: attribution.intent, role_hint: attribution.roleHint,
      deep_link_payload: attribution.payload, referrer_code: attribution.referrerCode,
      original_attribution: touch, latest_attribution: touch,
    }).select("*").maybeSingle();
    if (error || !data) {
      const retry = await sb.from("telegram_acquisition_sessions").select("*")
        .eq("bot_name", botName).eq("telegram_user_id", userId).eq("status", "active").maybeSingle();
      if (!retry.data) throw new Error(error?.message ?? "Failed to start acquisition session");
      session = retry.data;
    } else session = data;
  }

  if (attribution.payload) {
    const { error: touchError } = await sb.from("telegram_acquisition_touches").insert({
      session_id: session.id,
      telegram_update_id: Number.isSafeInteger(Number(body.update_id)) ? Number(body.update_id) : null,
      campaign_id: attribution.campaign, source: attribution.source, medium: attribution.medium,
      creative: attribution.creative, deep_link_payload: attribution.payload, attribution: touch,
    });
    if (touchError && touchError.code !== "23505") throw new Error(touchError.message);
  }
  await journeyEvent(sb, session, "telegram_start", "started", Number.isSafeInteger(Number(body.update_id)) ? `telegram_start:${botName}:${body.update_id}` : null, touch);
  await journeyEvent(sb, session, "telegram_funnel_started", "started", `funnel_started:${session.id}`, { funnel: session.funnel });
  const { data: linkedUser, error: linkedUserError } = await sb.from("users").select("id,full_name").eq("telegram_chat_id", userId).maybeSingle();
  if (linkedUserError) throw new Error(linkedUserError.message);
  return { status: 200, body: { ok: true, session_id: session.id, funnel: session.funnel, last_step: session.last_step, state: session.journey_state, linked_user: linkedUser ?? null } };
};

const activeSession = async (sb: DbClient, body: Json) => {
  const userId = telegramId(body.telegram_user_id);
  if (!userId) throw new Error("valid telegram_user_id required");
  const { data, error } = await sb.from("telegram_acquisition_sessions").select("*")
    .eq("bot_name", normalize(body.bot_name, 80) || "schoodonlinebot").eq("telegram_user_id", userId)
    .eq("status", "active").gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("active_session_not_found");
  return data as Json;
};

const createAcademyLead = async (sb: DbClient, session: Json, state: Json, body: Json) => {
  const rangeCounts: Record<string, number> = { under50: 25, "50_199": 100, "200_499": 300, "500plus": 500 };
  const contact = normalize(state.contact, 320);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact.toLowerCase() : null;
  const phone = email ? null : contact;
  const { data, error } = await sb.from("sales_leads").insert({
    acquisition_session_id: session.id,
    telegram_user_id: session.telegram_user_id,
    lead_type: "academy",
    academy_name: normalize(state.academy_name, 200),
    contact_name: normalize(body.first_name, 120) || "Telegram contact",
    phone,
    email,
    preferred_contact_method: state.preferred_contact_method,
    student_count: rangeCounts[state.student_range] ?? null,
    requested_capability: state.capability,
    source: session.source,
    medium: session.medium,
    campaign: session.campaign_id,
    creative: session.creative,
    metadata: { student_range: state.student_range, telegram_username: normalize(body.username, 120) || null },
  }).select("id,status,sla_due_at").maybeSingle();
  if (error?.code === "23505") {
    const existing = await sb.from("sales_leads").select("id,status,sla_due_at").eq("acquisition_session_id", session.id).maybeSingle();
    if (existing.error || !existing.data) throw new Error(existing.error?.message ?? "Failed to recover academy lead");
    if (existing.data?.id) {
      await journeyEvent(sb, session, "academy_lead_created", "academy_lead_ready", `academy_lead_created:${session.id}`, { lead_id: existing.data.id });
    }
    return existing.data;
  }
  if (error || !data) throw new Error(error?.message ?? "Failed to create academy lead");
  await journeyEvent(sb, session, "academy_lead_created", "academy_lead_ready", `academy_lead_created:${session.id}`, { lead_id: data.id });
  return data;
};

const journeyStep = async (sb: DbClient, body: Json) => {
  const session = await activeSession(sb, body);
  const action = normalize(body.step_action, 80).toLowerCase();
  const input = normalize(body.input, 320);
  const telegramUpdateId = Number(body.update_id);
  const stableUpdateId = Number.isSafeInteger(telegramUpdateId) ? String(telegramUpdateId) : null;
  const stepIdempotencyKey = stableUpdateId ? `funnel_step:${session.id}:${stableUpdateId}:${action}` : null;
  if (stepIdempotencyKey) {
    const { data: previous, error: previousError } = await sb.from("telegram_journey_events").select("id")
      .eq("idempotency_key", stepIdempotencyKey).maybeSingle();
    if (previousError) throw new Error(previousError.message);
    if (previous) {
      const { data: current, error: currentError } = await sb.from("telegram_acquisition_sessions").select("*").eq("id", session.id).maybeSingle();
      if (currentError || !current) throw new Error(currentError?.message ?? "Failed to recover Telegram journey");
      let repairedLead: Json | null = null;
      if (current?.last_step === "academy_lead_ready" && !current.academy_lead_id) {
        repairedLead = await createAcademyLead(sb, current as Json, (current.journey_state ?? {}) as Json, body);
        if (repairedLead?.id) await sb.from("telegram_acquisition_sessions").update({ academy_lead_id: repairedLead.id }).eq("id", session.id).is("academy_lead_id", null);
      }
      if (current?.first_value_action_at) {
        await journeyEvent(sb, current as Json, "first_value_action_completed", String(current.last_step ?? "first_value"), `first_value:${session.id}`, {});
      }
      return { status: 200, body: { ok: true, replayed: true, session_id: session.id, funnel: current?.funnel, step: current?.last_step, state: current?.journey_state, lead: repairedLead } };
    }
  }
  const transition = advanceTelegramJourney({
    funnel: session.funnel,
    lastStep: session.last_step,
    state: session.journey_state,
    expiresAt: session.expires_at,
    status: session.status,
  }, action, input);
  const now = new Date().toISOString();
  const update: Json = { journey_state: transition.state, last_step: transition.step, updated_at: now };
  if (transition.funnel === "academy") Object.assign(update, { funnel: "academy", intent: "academy_demo", role_hint: "academy" });
  if (transition.funnel === "student_ielts") Object.assign(update, { funnel: "student_ielts", intent: "ielts_diagnostic", role_hint: "student" });
  if (transition.event === "diagnostic_started") update.diagnostic_started_at = now;
  if (transition.event === "diagnostic_completed") update.diagnostic_completed_at = now;
  if (transition.firstValue) update.first_value_action_at = now;
  if (transition.canceled) update.status = "canceled";
  const effectiveIdempotencyKey = stepIdempotencyKey ?? `funnel_step:${session.id}:${crypto.randomUUID()}:${action}`;
  const { data: applied, error } = await sb.rpc("apply_telegram_journey_transition", {
    p_session_id: session.id,
    p_expected_last_step: session.last_step,
    p_update: update,
    p_event_name: transition.event ?? "telegram_funnel_step_completed",
    p_event_step: transition.step,
    p_idempotency_key: effectiveIdempotencyKey,
    p_event_metadata: { action },
  });
  if (error) throw new Error(error.message);
  const updated = (applied?.session ?? null) as Json | null;
  if (!updated) throw new Error("journey_transition_failed");
  if (transition.firstValue) await journeyEvent(sb, updated, "first_value_action_completed", transition.step, `first_value:${session.id}`, {});
  const lead = transition.createLead ? await createAcademyLead(sb, updated, transition.state, body) : null;
  if (lead) await sb.from("telegram_acquisition_sessions").update({ academy_lead_id: lead.id }).eq("id", session.id);
  return { status: 200, body: { ok: true, session_id: session.id, funnel: updated.funnel, step: transition.step, state: transition.state, lead } };
};

const createSupport = async (sb: DbClient, body: Json) => {
  const contact = normalize(body.contact, 320);
  const message = normalize(body.message, 4000);
  if (!contact || !message) return { status: 400, body: { error: "contact and message are required" } };
  const context = await readTelegramContext(normalize(body.initData ?? body.init_data, 12000));
  if (normalize(body.initData ?? body.init_data, 12000) && !context) return { status: 401, body: { error: "Invalid or expired Telegram authentication" } };
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact.toLowerCase() : "telegram-lead@schood.online";
  const windowBucket = timeBucket(15 * 60 * 1000);
  const fingerprint = await sha256([
    context?.telegram_user_id ?? "anonymous",
    contact.toLowerCase(),
    normalizeWhitespace(message).toLowerCase(),
    normalize(body.role, 80).toLowerCase(),
    canonicalSourceUrl(body.source_url),
  ].join("\u001f"));
  const { data, error } = await sb.from("support_messages").insert({
    user_id: null, name: normalize(body.name, 120) || "Telegram visitor", email,
    telegram: email === contact.toLowerCase() ? null : contact,
    subject: `Telegram support: ${normalize(body.goal, 200) || "request"}`,
    message, source: "telegram_public_bot", service_slug: "telegram-public",
    metadata: {
      role: normalize(body.role, 80),
      telegram_chat_id: context?.telegram_user_id ?? null,
      telegram_user_id: context?.telegram_user_id ?? null,
      telegram_username: context?.username ?? null,
      source_url: canonicalSourceUrl(body.source_url),
      request_fingerprint: fingerprint,
      request_window_bucket: windowBucket,
    },
    status: "new",
  }).select("id,status,created_at").maybeSingle();
  if (error?.code === "23505") return { status: 200, body: { ok: true, duplicate: true } };
  return error ? { status: 500, body: { error: "Failed to create support request" } } : { status: 200, body: { ok: true, message: data } };
};

const publicLeadIdempotencyKey = async (parts: string[]) => {
  const bytes = new TextEncoder().encode(parts.join("\u001f"));
  return `telegram_public:${hex(await crypto.subtle.digest("SHA-256", bytes))}`;
};

const campaignFromUrl = (value: unknown) => {
  try { return normalize(new URL(canonicalSourceUrl(value)).searchParams.get("campaign"), 200) || null; } catch { return null; }
};

const createPublicLead = async (sb: DbClient, body: Json) => {
  const role = normalize(body.role, 80).toLowerCase();
  if (role !== "center") return createSupport(sb, body);
  const context = await readTelegramContext(normalize(body.initData ?? body.init_data, 12000));
  if (!context) return { status: 401, body: { error: "Open this form from Telegram and try again" } };
  const contact = normalize(body.contact, 320);
  const name = normalize(body.name, 120) || context.first_name || "Telegram academy contact";
  if (!contact) return { status: 400, body: { error: "contact is required" } };
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact.toLowerCase() : null;
  const idempotencyKey = await publicLeadIdempotencyKey([
    context.telegram_user_id,
    contact.toLowerCase().replace(/\s+/g, ""),
    canonicalSourceUrl(body.source_url),
    timeBucket(30 * 24 * 60 * 60 * 1000),
  ]);
  const { data, error } = await sb.from("sales_leads").insert({
    idempotency_key: idempotencyKey,
    telegram_user_id: context.telegram_user_id,
    lead_type: "academy",
    academy_name: normalize(body.goal, 200) || null,
    contact_name: name,
    phone: email ? null : contact,
    email,
    preferred_contact_method: contact.startsWith("@") ? "telegram" : email ? "email" : "phone",
    source: "telegram",
    medium: "mini_app",
    campaign: campaignFromUrl(body.source_url),
    notes: normalize(body.message, 4000) || null,
    metadata: { telegram_username: context.username || null, source_url: canonicalSourceUrl(body.source_url) },
  }).select("id,status,sla_due_at").maybeSingle();
  if (error?.code === "23505") {
    const existing = await sb.from("sales_leads").select("id,status,sla_due_at").eq("idempotency_key", idempotencyKey).maybeSingle();
    if (existing.error || !existing.data) return { status: 500, body: { error: "Failed to recover academy lead" } };
    return { status: 200, body: { ok: true, lead: existing.data, duplicate: true } };
  }
  if (error || !data) return { status: 500, body: { error: "Failed to create academy lead" } };
  return { status: 200, body: { ok: true, lead: data } };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  try {
    const body = await req.json().catch(() => ({})) as Json;
    const action = normalize(body.action, 80).toLowerCase() || "bootstrap";
    const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(env("SUPABASE_URL"), serviceRole, { auth: { persistSession: false } });
    // === "Check my English" (./english-check.ts; @schoodonlinebot Worker only) ===
    if (action === "english_check") {
      if (!(await isInternalRequest(req, serviceRole, Deno.env.get("TELEGRAM_INTERNAL_SECRET")))) return json(401, { error: "Unauthorized" });
      const result = await runEnglishCheck(sb, body); return json(result.status, result.body);
    }
    if (["claim_update", "complete_update", "session_start", "journey_step"].includes(action)) {
      if (!(await isInternalRequest(req, serviceRole, Deno.env.get("TELEGRAM_INTERNAL_SECRET")))) return json(401, { error: "Unauthorized" });
      if (action === "claim_update") { const result = await claimUpdate(sb, body); return json(result.status, result.body); }
      if (action === "complete_update") {
        const result = await completeUpdate(sb, body);
        return json(result.ok ? 200 : 409, result);
      }
      if (action === "session_start") { const result = await startSession(sb, body); return json(result.status, result.body); }
      const result = await journeyStep(sb, body); return json(result.status, result.body);
    }
    if (action === "bootstrap") return json(200, { ok: true, site_url: Deno.env.get("SITE_URL") ?? "https://schood.online" });
    if (action === "lead_create") {
      const rateLimit = await enforcePublicRateLimit(sb, req, env("TELEGRAM_RATE_LIMIT_SECRET"));
      if (!rateLimit.allowed) return new Response(JSON.stringify({ error: "Too many requests", retry_after: rateLimit.retry_after_seconds }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(rateLimit.retry_after_seconds), ...cors },
      });
      const result = await createPublicLead(sb, body); return json(result.status, result.body);
    }
    if (action === "support_create") {
      const rateLimit = await enforcePublicRateLimit(sb, req, env("TELEGRAM_RATE_LIMIT_SECRET"));
      if (!rateLimit.allowed) return new Response(JSON.stringify({ error: "Too many requests", retry_after: rateLimit.retry_after_seconds }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(rateLimit.retry_after_seconds), ...cors },
      });
      const result = await createSupport(sb, body); return json(result.status, result.body);
    }
    return json(400, { error: "Unknown action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error(JSON.stringify({ event: "telegram_public_action_failed", reason: message }));
    const status = message === "active_session_not_found" ? 410 : message.includes("invalid_") ? 409 : 500;
    return json(status, { error: status === 500 ? "Telegram action failed" : message });
  }
});
