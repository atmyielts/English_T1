import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;
type SupabaseClientLike = ReturnType<typeof createClient<any>>;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const normalizeText = (value: unknown, maxLen = 500): string => String(value ?? "").trim().slice(0, maxLen);
const normalizeEmail = (value: unknown): string => normalizeText(value, 320).toLowerCase();
const isObject = (value: unknown): value is Json => Boolean(value && typeof value === "object" && !Array.isArray(value));

const hex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

const hmac = async (key: string | Uint8Array, message: string): Promise<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const rawKey = typeof key === "string" ? encoder.encode(key) : key;
  const keyData = rawKey.buffer.slice(rawKey.byteOffset, rawKey.byteOffset + rawKey.byteLength) as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
};

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

type TelegramIdentity = {
  telegram_user_id: string;
  first_name: string | null;
  username: string | null;
  auth_date: number;
};

const validateTelegramInitData = async (initData: string, botToken: string): Promise<TelegramIdentity> => {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") ?? "";
  if (!receivedHash) throw new Error("Missing Telegram hash");

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  pairs.sort();

  const secret = new Uint8Array(await hmac("WebAppData", botToken));
  const expectedHash = hex(await hmac(secret, pairs.join("\n")));
  if (!timingSafeEqual(expectedHash, receivedHash)) throw new Error("Invalid Telegram signature");

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!Number.isFinite(authDate) || authDate <= 0) throw new Error("Missing Telegram auth date");
  const maxAgeSeconds = 60 * 60 * 24;
  if (Math.floor(Date.now() / 1000) - authDate > maxAgeSeconds) throw new Error("Telegram session expired");

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("Missing Telegram user");
  const parsed = JSON.parse(userRaw) as Record<string, unknown>;
  const id = String(parsed.id ?? "").trim();
  if (!id) throw new Error("Missing Telegram user id");

  return {
    telegram_user_id: id,
    first_name: normalizeText(parsed.first_name, 120) || null,
    username: normalizeText(parsed.username, 120) || null,
    auth_date: authDate,
  };
};

type UserContext = {
  user: { id: string; email: string | null; full_name: string | null; telegram_chat_id: string | null };
  telegram: TelegramIdentity;
};

const loadUserContext = async (sb: SupabaseClientLike, telegram: TelegramIdentity): Promise<UserContext | null> => {
  const { data, error } = await sb
    .from("users")
    .select("id,email,full_name,telegram_chat_id")
    .eq("telegram_chat_id", telegram.telegram_user_id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load linked Schood user: ${error.message}`);
  if (!data?.id) return null;
  return { user: data as UserContext["user"], telegram };
};

const contactSelect =
  "id, academy_id, user_id, first_name, last_name, email, phone, telegram_id, status, metadata, created_at, updated_at";
const studentStatuses = ["active", "trial", "paused"];

const loadStudentContacts = async (
  sb: SupabaseClientLike,
  userId: string,
  userEmail: string | null,
  telegramUserId: string,
): Promise<Array<Record<string, unknown>>> => {
  const { data: directRows, error: directError } = await sb
    .from("academy_contacts")
    .select(contactSelect)
    .eq("user_id", userId)
    .in("status", studentStatuses);
  if (directError) throw new Error(`Failed to load contacts: ${directError.message}`);
  const direct = (directRows ?? []) as Array<Record<string, unknown>>;
  if (direct.length > 0) return direct;

  const email = normalizeEmail(userEmail);
  if (!email) return [];
  const { data: emailRows, error: emailError } = await sb
    .from("academy_contacts")
    .select(contactSelect)
    .is("user_id", null)
    .ilike("email", email)
    .in("status", studentStatuses);
  if (emailError) throw new Error(`Failed to load contacts by email: ${emailError.message}`);

  const rows = (emailRows ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((row) => String(row.id ?? "")).filter(Boolean);
  if (ids.length > 0) {
    await sb.from("academy_contacts").update({ user_id: userId, telegram_id: telegramUserId }).in("id", ids);
  }
  return rows.map((row) => ({ ...row, user_id: userId, telegram_id: telegramUserId }));
};

const academyName = (academies: Array<Record<string, unknown>>, academyId: string): string => {
  const row = academies.find((a) => String(a.id) === academyId);
  return String(row?.name ?? "Academy");
};

const awlStarterSeed = [
  ["analyse", "to examine something carefully", "The report analyses the causes of migration."],
  ["approach", "a way of dealing with a task or problem", "This approach helps students build fluency."],
  ["assess", "to judge or evaluate", "Teachers assess progress through regular feedback."],
  ["concept", "an idea or principle", "The concept is easier to understand with examples."],
  ["consistent", "happening in the same way over time", "Consistent practice improves confidence."],
  ["evidence", "facts that support a claim", "Use evidence to support your argument."],
  ["factor", "something that influences a result", "Motivation is a key factor in learning."],
  ["interpret", "to explain the meaning of something", "Students must interpret data in Task 1."],
  ["relevant", "closely connected to the topic", "Choose relevant examples in your essay."],
  ["specific", "clear and exact", "Specific feedback is easier to act on."],
  ["structure", "the way parts are organized", "A clear structure improves writing."],
  ["significant", "important or large enough to notice", "The results showed a significant change."],
] as const;

const loadDashboard = async (sb: SupabaseClientLike, ctx: UserContext) => {
  const contacts = await loadStudentContacts(sb, ctx.user.id, ctx.user.email, ctx.telegram.telegram_user_id);
  const contactIds = contacts.map((c) => String(c.id ?? "")).filter(Boolean);
  const academyIds = Array.from(new Set(contacts.map((c) => String(c.academy_id ?? "")).filter(Boolean)));
  if (contactIds.length === 0 || academyIds.length === 0) {
    return {
      academies: [],
      contacts: [],
      classrooms: [],
      memberships: [],
      announcements: [],
      schedule: [],
      assignments: [],
      attendance: [],
      billing: [],
      outcomes: [],
      certificates: [],
      vocab: { total: 0, due: 0, learned: 0 },
    };
  }

  const [academiesRes, membershipsRes, classroomsRes, announcementsRes, scheduleRes, assignmentsRes, submissionsRes, attendanceRes, offersRes, entitlementsRes, paymentsRes, outcomesRes, certsRes, vocabStats] = await Promise.all([
    sb.from("tenants").select("id,name,slug,type,metadata").in("id", academyIds).limit(100),
    sb.from("academy_classroom_memberships").select("id,academy_id,classroom_id,contact_id,role,joined_at").in("contact_id", contactIds).limit(1000),
    sb.from("academy_classrooms").select("id,academy_id,name,description,is_active,metadata").in("academy_id", academyIds).eq("is_active", true).limit(1000),
    sb.from("academy_announcements").select("id,academy_id,classroom_id,title,body,created_at").in("academy_id", academyIds).order("created_at", { ascending: false }).limit(60),
    sb.from("academy_classroom_schedules").select("id,academy_id,classroom_id,day_of_week,start_time,end_time,timezone,label,is_active").in("academy_id", academyIds).eq("is_active", true).order("day_of_week").order("start_time").limit(200),
    sb.from("academy_assignments").select("id,academy_id,classroom_id,title,description,assignment_type,experience_url,due_at,released_at,max_score,score_weight,status,metadata,position,created_at").in("academy_id", academyIds).eq("status", "active").order("position", { ascending: true }).limit(600),
    sb.from("academy_submissions").select("id,academy_id,assignment_id,classroom_id,contact_id,score,max_score,status,submitted_at,graded_at,notes,submission_content,submission_url").in("contact_id", contactIds).limit(1000),
    sb.from("academy_attendance").select("id,academy_id,classroom_id,contact_id,session_date,status,notes").in("contact_id", contactIds).order("session_date", { ascending: false }).limit(120),
    sb.from("academy_offers").select("id,academy_id,classroom_id,name,price_amount,currency,duration_days,description,is_active").in("academy_id", academyIds).eq("is_active", true).not("classroom_id", "is", null).limit(500),
    sb.from("academy_entitlements").select("contact_id,resource_id,status,expires_at,resource_type").in("contact_id", contactIds).eq("resource_type", "classroom").limit(1000),
    sb.from("academy_payments").select("id,contact_id,offer_id,amount,currency,status,created_at").in("contact_id", contactIds).order("created_at", { ascending: false }).limit(1000),
    sb.from("exam_outcomes").select("id,overall_band,overall_score,computed_at,status,products(name,slug)").eq("user_id", ctx.user.id).eq("status", "completed").order("computed_at", { ascending: false }).limit(8),
    sb.from("issued_certificates").select("id,public_token,exam_type,overall_band,overall_score,candidate_name,exam_date,issued_at").eq("user_id", ctx.user.id).eq("is_public", true).order("issued_at", { ascending: false }).limit(8),
    loadVocabStats(sb, ctx.user.id),
  ]);

  const academies = (academiesRes.data ?? []) as Array<Record<string, unknown>>;
  const memberships = (membershipsRes.data ?? []) as Array<Record<string, unknown>>;
  const enrolledClassrooms = new Set(memberships.map((m) => String(m.classroom_id ?? "")).filter(Boolean));
  const submissions = (submissionsRes.data ?? []) as Array<Record<string, unknown>>;
  const submissionByAssignment = new Map(submissions.map((s) => [String(s.assignment_id), s]));
  const assignments = ((assignmentsRes.data ?? []) as Array<Record<string, unknown>>)
    .filter((a) => enrolledClassrooms.has(String(a.classroom_id)))
    .map((a) => ({ ...a, submission: submissionByAssignment.get(String(a.id)) ?? null }));

  const activeClassroomEntitlements = new Set(
    ((entitlementsRes.data ?? []) as Array<Record<string, unknown>>)
      .filter((e) => String(e.status) === "active" && (!e.expires_at || new Date(String(e.expires_at)) > new Date()))
      .map((e) => `${e.contact_id}__${e.resource_id}`),
  );
  const latestPaymentByOffer = new Map<string, Record<string, unknown>>();
  for (const payment of (paymentsRes.data ?? []) as Array<Record<string, unknown>>) {
    const key = `${payment.contact_id}__${payment.offer_id}`;
    if (!latestPaymentByOffer.has(key)) latestPaymentByOffer.set(key, payment);
  }
  const offers = (offersRes.data ?? []) as Array<Record<string, unknown>>;
  const billing: Array<Record<string, unknown>> = [];
  for (const membership of memberships) {
    const classroomId = String(membership.classroom_id ?? "");
    const contactId = String(membership.contact_id ?? "");
    const offer = offers.find((o) => String(o.classroom_id) === classroomId && String(o.academy_id) === String(membership.academy_id));
    if (!offer) continue;
    billing.push({
      academy_id: String(membership.academy_id),
      classroom_id: classroomId,
      contact_id: contactId,
      academy_name: academyName(academies, String(membership.academy_id)),
      offer,
      paid: activeClassroomEntitlements.has(`${contactId}__${classroomId}`),
      last_payment: latestPaymentByOffer.get(`${contactId}__${offer.id}`) ?? null,
      payment_handoff_url: `${getSiteUrl()}/my-academy`,
    });
  }

  return {
    academies,
    contacts,
    classrooms: classroomsRes.data ?? [],
    memberships,
    announcements: announcementsRes.data ?? [],
    schedule: scheduleRes.data ?? [],
    assignments,
    attendance: attendanceRes.data ?? [],
    billing,
    outcomes: outcomesRes.data ?? [],
    certificates: certsRes.data ?? [],
    vocab: vocabStats,
  };
};

const getOrCreateVocabDeck = async (sb: SupabaseClientLike, userId: string): Promise<string | null> => {
  const { data: existing } = await sb.from("vocab_drill_decks").select("id").eq("user_id", userId).eq("source", "ielts_awl").maybeSingle();
  if (existing?.id) return String(existing.id);
  const { data: created, error } = await sb.from("vocab_drill_decks").insert({ user_id: userId, name: "IELTS Academic Word List", source: "ielts_awl" }).select("id").maybeSingle();
  if (error || !created?.id) return null;
  const today = new Date().toISOString().slice(0, 10);
  const cards = awlStarterSeed.map(([word, definition, example]) => ({
    deck_id: created.id,
    user_id: userId,
    word,
    definition,
    example,
    next_review: today,
  }));
  await sb.from("vocab_drill_cards").insert(cards);
  return String(created.id);
};

const loadVocabStats = async (sb: SupabaseClientLike, userId: string) => {
  const deckId = await getOrCreateVocabDeck(sb, userId);
  if (!deckId) return { total: 0, due: 0, learned: 0 };
  const today = new Date().toISOString().slice(0, 10);
  const [totalRes, dueRes, learnedRes] = await Promise.all([
    sb.from("vocab_drill_cards").select("id", { count: "exact", head: true }).eq("deck_id", deckId),
    sb.from("vocab_drill_cards").select("id", { count: "exact", head: true }).eq("deck_id", deckId).lte("next_review", today),
    sb.from("vocab_drill_cards").select("id", { count: "exact", head: true }).eq("deck_id", deckId).gt("repetitions", 0),
  ]);
  return { total: totalRes.count ?? 0, due: dueRes.count ?? 0, learned: learnedRes.count ?? 0 };
};

const loadNextVocabCard = async (sb: SupabaseClientLike, userId: string) => {
  const deckId = await getOrCreateVocabDeck(sb, userId);
  if (!deckId) return null;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await sb
    .from("vocab_drill_cards")
    .select("id,word,definition,example,interval,repetitions,last_review")
    .eq("deck_id", deckId)
    .lte("next_review", today)
    .order("next_review", { ascending: true })
    .limit(1);
  return data?.[0] ?? null;
};

const sm2 = (interval: number, easeFactor: number, repetitions: number, quality: number) => {
  if (quality < 3) return { interval: 1, easeFactor: Math.max(1.3, easeFactor - 0.2), repetitions: 0 };
  const nextEase = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  const nextInterval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.round(interval * nextEase);
  return { interval: nextInterval, easeFactor: nextEase, repetitions: repetitions + 1 };
};

const reviewVocabCard = async (sb: SupabaseClientLike, userId: string, cardId: string, qualityRaw: unknown) => {
  const quality = Math.min(5, Math.max(0, Math.round(Number(qualityRaw))));
  if (!cardId || !Number.isFinite(quality)) return { error: "card_id and quality are required" };
  const { data: card } = await sb.from("vocab_drill_cards").select("interval,ease_factor,repetitions").eq("id", cardId).eq("user_id", userId).maybeSingle();
  if (!card) return { error: "Card not found" };
  const next = sm2(Number(card.interval ?? 1), Number(card.ease_factor ?? 2.5), Number(card.repetitions ?? 0), quality);
  const nextReview = new Date(Date.now() + next.interval * 86400000).toISOString().slice(0, 10);
  await sb.from("vocab_drill_cards").update({
    interval: next.interval,
    ease_factor: next.easeFactor,
    repetitions: next.repetitions,
    next_review: nextReview,
    last_review: new Date().toISOString().slice(0, 10),
  }).eq("id", cardId).eq("user_id", userId);
  return { ok: true, next_review: nextReview, next: await loadNextVocabCard(sb, userId), stats: await loadVocabStats(sb, userId) };
};

const submitAssignment = async (sb: SupabaseClientLike, ctx: UserContext, body: Json) => {
  const assignmentId = normalizeText(body.assignment_id, 64);
  if (!assignmentId) return { status: 400, body: { error: "assignment_id is required" } };
  const contacts = await loadStudentContacts(sb, ctx.user.id, ctx.user.email, ctx.telegram.telegram_user_id);
  if (contacts.length === 0) return { status: 403, body: { error: "No academy enrollment found" } };
  const { data: assignment } = await sb
    .from("academy_assignments")
    .select("id,academy_id,classroom_id,max_score,status")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment?.id) return { status: 404, body: { error: "Assignment not found" } };
  if (assignment.status !== "active") return { status: 400, body: { error: "Assignment is not open for submission" } };
  const contact = contacts.find((c) => String(c.academy_id) === String(assignment.academy_id));
  if (!contact) return { status: 403, body: { error: "Not enrolled in this academy" } };
  const { data: membership } = await sb
    .from("academy_classroom_memberships")
    .select("id")
    .eq("classroom_id", assignment.classroom_id)
    .eq("contact_id", contact.id)
    .maybeSingle();
  if (!membership?.id) return { status: 403, body: { error: "Not enrolled in this classroom" } };

  const payload = {
    academy_id: String(assignment.academy_id),
    assignment_id: assignmentId,
    classroom_id: String(assignment.classroom_id),
    contact_id: String(contact.id),
    user_id: ctx.user.id,
    submission_content: normalizeText(body.content ?? body.submission_content, 10000) || null,
    submission_url: normalizeText(body.url ?? body.submission_url, 2000) || null,
    status: "submitted",
    submitted_at: new Date().toISOString(),
    notes: normalizeText(body.notes, 500) || null,
    metadata: { source: "telegram_app" },
  };
  if (!payload.submission_content && !payload.submission_url) {
    return { status: 400, body: { error: "Text answer or URL is required" } };
  }

  const { data, error } = await sb
    .from("academy_submissions")
    .upsert(payload, { onConflict: "assignment_id,contact_id" })
    .select("id,assignment_id,contact_id,score,max_score,status,submitted_at,notes,submission_content,submission_url,updated_at")
    .maybeSingle();
  if (error) return { status: 500, body: { error: "Failed to submit assignment", detail: error.message } };
  return { status: 200, body: { submission: data } };
};

const loadPreferences = async (sb: SupabaseClientLike, userId: string) => {
  const defaults = { user_id: userId };
  const { data, error } = await sb
    .from("telegram_user_preferences")
    .upsert(defaults, { onConflict: "user_id" })
    .select("user_id,notifications_enabled,assignment_reminders,class_reminders,score_notifications,certificate_notifications,digest_frequency,quiet_hours_start,quiet_hours_end,timezone,updated_at")
    .maybeSingle();
  if (error) throw new Error(`Failed to load preferences: ${error.message}`);
  return data;
};

const updatePreferences = async (sb: SupabaseClientLike, userId: string, input: Json) => {
  const patch: Record<string, unknown> = {};
  for (const key of ["notifications_enabled", "assignment_reminders", "class_reminders", "score_notifications", "certificate_notifications"]) {
    if (typeof input[key] === "boolean") patch[key] = input[key];
  }
  const digest = normalizeText(input.digest_frequency, 20).toLowerCase();
  if (["off", "daily", "weekly"].includes(digest)) patch.digest_frequency = digest;
  const timezone = normalizeText(input.timezone, 80);
  if (timezone) patch.timezone = timezone;
  if (Object.keys(patch).length === 0) return await loadPreferences(sb, userId);
  patch.updated_at = new Date().toISOString();
  const { data, error } = await sb
    .from("telegram_user_preferences")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
    .select("user_id,notifications_enabled,assignment_reminders,class_reminders,score_notifications,certificate_notifications,digest_frequency,quiet_hours_start,quiet_hours_end,timezone,updated_at")
    .maybeSingle();
  if (error) throw new Error(`Failed to update preferences: ${error.message}`);
  return data;
};

const supportCreate = async (sb: SupabaseClientLike, ctx: UserContext, body: Json) => {
  const message = normalizeText(body.message, 4000);
  if (!message) return { status: 400, body: { error: "message is required" } };
  const subject = normalizeText(body.subject, 180) || "Telegram Mini App support";
  const name = normalizeText(body.name, 120) || ctx.user.full_name || ctx.telegram.first_name || "Telegram student";
  const email = normalizeEmail(body.email) || normalizeEmail(ctx.user.email) || "telegram@schood.online";
  const { data, error } = await sb.from("support_messages").insert({
    user_id: ctx.user.id,
    name,
    email,
    telegram: ctx.telegram.username ? `@${ctx.telegram.username}` : ctx.telegram.telegram_user_id,
    subject,
    message,
    source: "telegram_app",
    service_slug: normalizeText(body.service_slug, 120) || "telegram",
    metadata: {
      telegram_chat_id: ctx.telegram.telegram_user_id,
      telegram_user_id: ctx.telegram.telegram_user_id,
      telegram_username: ctx.telegram.username,
      telegram_context: ctx.telegram,
    },
    status: "new",
  }).select("id,status,created_at").maybeSingle();
  if (error) return { status: 500, body: { error: "Failed to create support request", detail: error.message } };
  return { status: 200, body: { ok: true, message: data } };
};

const logEvent = async (sb: SupabaseClientLike, args: { userId?: string | null; telegramUserId?: string | null; action: string; status: string; metadata?: Json }) => {
  await sb.from("telegram_app_events").insert({
    user_id: args.userId ?? null,
    telegram_user_id: args.telegramUserId ?? null,
    action: args.action,
    status: args.status,
    metadata: args.metadata ?? {},
  }).then(() => undefined);
};

const getSiteUrl = (): string => Deno.env.get("SITE_URL") ?? "https://schood.online";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const sb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  let action = "bootstrap";
  let telegramId: string | null = null;
  let ctx: UserContext | null = null;

  try {
    const body = (await req.json().catch(() => ({}))) as Json;
    action = normalizeText(body.action, 80).toLowerCase() || "bootstrap";
    const initData = normalizeText(body.initData ?? body.init_data, 12000);
    if (!initData) {
      await logEvent(sb, { action, status: "unauthorized" });
      return json(401, { error: "Telegram initData is required" });
    }

    const telegram = await validateTelegramInitData(initData, getEnv("TELEGRAM_BOT_TOKEN"));
    telegramId = telegram.telegram_user_id;
    ctx = await loadUserContext(sb, telegram);
    if (!ctx) {
      await logEvent(sb, { telegramUserId: telegramId, action, status: "unlinked" });
      return json(200, {
        linked: false,
        telegram_user_id: telegramId,
        link_account_url: `${getSiteUrl()}/account?returnTo=${encodeURIComponent("/telegram")}`,
        message: "Telegram verified this app session, but this Telegram account is not linked to a Schood account yet.",
      });
    }

    if (action === "bootstrap") {
      const dashboard = await loadDashboard(sb, ctx);
      const preferences = await loadPreferences(sb, ctx.user.id);
      await logEvent(sb, { userId: ctx.user.id, telegramUserId: telegramId, action, status: "ok" });
      return json(200, {
        linked: true,
        site_url: getSiteUrl(),
        user: ctx.user,
        telegram: ctx.telegram,
        preferences,
        dashboard,
      });
    }

    if (action === "assignments" || action === "grades" || action === "attendance" || action === "billing" || action === "certificates") {
      const dashboard = await loadDashboard(sb, ctx);
      const key = action === "certificates" ? "certificates" : action;
      await logEvent(sb, { userId: ctx.user.id, telegramUserId: telegramId, action, status: "ok" });
      return json(200, { linked: true, [key]: (dashboard as any)[key] ?? [] });
    }

    if (action === "submit_assignment") {
      const result = await submitAssignment(sb, ctx, body);
      await logEvent(sb, { userId: ctx.user.id, telegramUserId: telegramId, action, status: result.status === 200 ? "ok" : "error" });
      return json(result.status, result.body);
    }

    if (action === "vocab_next") {
      const card = await loadNextVocabCard(sb, ctx.user.id);
      await logEvent(sb, { userId: ctx.user.id, telegramUserId: telegramId, action, status: "ok" });
      return json(200, { card, stats: await loadVocabStats(sb, ctx.user.id) });
    }

    if (action === "vocab_review") {
      const result = await reviewVocabCard(sb, ctx.user.id, normalizeText(body.card_id, 64), body.quality);
      await logEvent(sb, { userId: ctx.user.id, telegramUserId: telegramId, action, status: (result as any).error ? "error" : "ok" });
      return json((result as any).error ? 400 : 200, result);
    }

    if (action === "notification_preferences") {
      const preferences = await updatePreferences(sb, ctx.user.id, isObject(body.preferences) ? body.preferences : body);
      await logEvent(sb, { userId: ctx.user.id, telegramUserId: telegramId, action, status: "ok" });
      return json(200, { preferences });
    }

    if (action === "support_create") {
      const result = await supportCreate(sb, ctx, body);
      await logEvent(sb, { userId: ctx.user.id, telegramUserId: telegramId, action, status: result.status === 200 ? "ok" : "error" });
      return json(result.status, result.body);
    }

    await logEvent(sb, { userId: ctx.user.id, telegramUserId: telegramId, action, status: "error" });
    return json(400, { error: "Unknown action" });
  } catch (err) {
    await logEvent(sb, {
      userId: ctx?.user.id ?? null,
      telegramUserId: telegramId,
      action,
      status: "error",
      metadata: { message: err instanceof Error ? err.message : String(err) },
    });
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = /telegram|signature|hash|auth|initdata/i.test(message) ? 401 : 500;
    return json(status, { error: message });
  }
});
