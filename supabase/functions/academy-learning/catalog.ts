// Schood Courses catalogue (V-CRS-F10, lead-based). Staff list a published
// course; anyone can browse schood.online/courses; "request a place" creates a
// lead in that academy's Admissions pipeline through academy_create_lead.

import { auditEvent, type Db, env, HttpError, requireCapability, requireScope } from "./core.ts";
import { isUuid, type Row, text } from "./lib.ts";

type StaffCtx = { sb: Db; actorId: string; academyId: string; body: Row };

const FORMATS = ["online", "offline", "blended"];
const LANGUAGES = ["uz", "ru", "en", "other"];

export const slugify = (value: string): string => {
  const base = value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "course";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
};

const optional = (value: unknown, max: number): string | null => text(value, max) || null;

export const listingGet = async ({ sb, actorId, academyId, body }: StaffCtx) => {
  await requireScope(sb, academyId, actorId, "manageAcademy");
  if (!isUuid(body.course_id)) throw new HttpError(400, "course_id is required");
  const [{ data: course }, { data: listing }] = await Promise.all([
    sb.from("academy_courses").select("id, title, description, level, status").eq("id", body.course_id).eq("academy_id", academyId).maybeSingle(),
    sb.from("academy_course_listings").select("*").eq("course_id", body.course_id).eq("academy_id", academyId).maybeSingle(),
  ]);
  if (!course) throw new HttpError(404, "Course not found");
  return { course, listing: listing ?? null, site_url: env("SITE_URL") ?? "https://schood.online" };
};

export const listingSave = async ({ sb, actorId, academyId, body }: StaffCtx) => {
  await requireScope(sb, academyId, actorId, "manageAcademy");
  if (!isUuid(body.course_id)) throw new HttpError(400, "course_id is required");
  const status = String(body.status ?? "draft");
  if (!["draft", "listed", "hidden"].includes(status)) throw new HttpError(400, "Choose draft, listed or hidden.");
  const { data: course } = await sb.from("academy_courses").select("id, title, status").eq("id", body.course_id).eq("academy_id", academyId).maybeSingle();
  if (!course) throw new HttpError(404, "Course not found");
  if (status === "listed") {
    if (course.status !== "published") throw new HttpError(409, "Publish the course before listing it.");
    await requireCapability(sb, academyId, "courses");
  }
  const headline = text(body.headline, 160) || String(course.title);
  if (headline.length < 3) throw new HttpError(400, "Write a headline of at least 3 characters.");
  const format = String(body.format ?? "blended"), language = String(body.language ?? "uz");
  if (!FORMATS.includes(format)) throw new HttpError(400, "Choose online, offline or blended.");
  if (!LANGUAGES.includes(language)) throw new HttpError(400, "Choose the teaching language.");
  const seats = body.seats == null || body.seats === "" ? null : Number(body.seats);
  if (seats != null && (!Number.isInteger(seats) || seats < 1 || seats > 1000)) throw new HttpError(400, "Seats must be 1 to 1000.");
  const startsOn = body.starts_on ? String(body.starts_on).slice(0, 10) : null;
  if (startsOn && !/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) throw new HttpError(400, "Use a valid start date.");
  const { data: existing } = await sb.from("academy_course_listings").select("id, slug, status, listed_at").eq("course_id", course.id).maybeSingle();
  const now = new Date().toISOString();
  const row = {
    academy_id: academyId, course_id: course.id, status, headline,
    summary: optional(body.summary, 2000), format, city: optional(body.city, 80), language, level: optional(body.level, 60),
    price_text: optional(body.price_text, 120), schedule_text: optional(body.schedule_text, 200), starts_on: startsOn, seats,
    teacher_name: optional(body.teacher_name, 120), updated_by: actorId, updated_at: now,
    listed_at: status === "listed" ? (existing?.status === "listed" ? existing.listed_at : now) : existing?.listed_at ?? null,
  };
  const { data, error } = existing
    ? await sb.from("academy_course_listings").update(row).eq("id", existing.id).select("*").maybeSingle()
    : await sb.from("academy_course_listings").insert({ ...row, slug: slugify(headline), created_by: actorId }).select("*").maybeSingle();
  if (error || !data) throw new HttpError(503, "The listing was not saved. Retry.");
  await auditEvent(sb, { academyId, actorUserId: actorId, action: "course.listing_saved", targetType: "academy_course_listing", targetId: String(data.id), metadata: { status } });
  return { listing: data };
};

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

const searchText = (value: unknown): string | null => text(value, 80).replace(/[%_\\]/g, " ").trim() || null;

export const publicCourses = async (sb: Db, body: Row) => {
  const { data, error } = await sb.rpc("academy_public_course_catalog", {
    p_slug: null, p_query: searchText(body.query),
    p_language: LANGUAGES.includes(String(body.language)) ? String(body.language) : null,
    p_format: FORMATS.includes(String(body.format)) ? String(body.format) : null, p_limit: 60,
  });
  if (error) throw new HttpError(503, "Courses could not load. Retry.");
  return { courses: data ?? [] };
};

export const publicCourse = async (sb: Db, body: Row) => {
  const slug = text(body.slug, 80).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug)) throw new HttpError(404, "Course not found");
  const { data, error } = await sb.rpc("academy_public_course_catalog", { p_slug: slug, p_query: null, p_language: null, p_format: null, p_limit: 1 });
  if (error) throw new HttpError(503, "The course could not load. Retry.");
  const course = Array.isArray(data) ? data[0] : null;
  if (!course) throw new HttpError(404, "Course not found");
  return { course };
};

const clientIp = (req: Request): string =>
  (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim().slice(0, 80);

const sha256 = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (b) => b.toString(16).padStart(2, "0")).join("");

export const normalizePhone = (value: unknown): string | null => {
  const raw = String(value ?? "").replace(/[^\d+]/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (raw.startsWith("+") ? "+" : "") + digits;
};

export const publicCourseLead = async (sb: Db, req: Request, body: Row) => {
  const fullName = text(body.full_name, 180);
  const phone = normalizePhone(body.phone);
  const telegram = text(body.telegram, 64).replace(/^@/, "") || null;
  if (fullName.length < 2) throw new HttpError(400, "Write your name.");
  if (!phone && !telegram) throw new HttpError(400, "Add a phone number or Telegram username so the teacher can reach you.");
  if (telegram && !/^[A-Za-z0-9_]{4,32}$/.test(telegram)) throw new HttpError(400, "Check the Telegram username.");
  const requestId = text(body.request_id, 64);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(requestId)) throw new HttpError(400, "Refresh the page and try again.");

  const rateKey = "course_lead:" + await sha256(`${env("SUPABASE_SERVICE_ROLE_KEY") ?? ""}:${clientIp(req)}`);
  const { data: rate } = await sb.rpc("telegram_public_rate_limit_consume", { p_rate_key: rateKey, p_window_seconds: 600, p_max_requests: 5 }).maybeSingle();
  if (rate && (rate as Row).allowed === false) throw new HttpError(429, "Too many requests. Try again in a few minutes.");

  const slug = text(body.slug, 80).toLowerCase();
  const { data: listing } = await sb.from("academy_course_listings").select("id, academy_id, course_id, status, headline").eq("slug", slug).maybeSingle();
  if (!listing || listing.status !== "listed") throw new HttpError(404, "This course is no longer taking requests.");
  const { data: allowed } = await sb.rpc("academy_learning_allows", { p_academy: listing.academy_id, p_capability: "courses" });
  if (allowed !== true) throw new HttpError(404, "This course is no longer taking requests.");

  const { data: lead, error } = await sb.rpc("academy_create_lead", {
    p_academy_id: listing.academy_id,
    p_actor_id: null,
    p_payload: {
      full_name: fullName, phone, telegram, interested_course: listing.headline, source_key: "website", campaign: "schood_courses",
      notes: text(body.message, 1000) || null,
      metadata: { source: "schood_courses", listing_id: listing.id, course_id: listing.course_id },
    },
    p_idempotency_key: `course_lead:${requestId}`,
  });
  if (error || !lead) throw new HttpError(503, "Your request was not sent. Try again.");
  await sb.from("academy_leads").update({ interested_course_id: listing.course_id }).eq("id", (lead as Row).id).eq("academy_id", listing.academy_id);
  return { ok: true };
};
