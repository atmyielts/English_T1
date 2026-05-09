import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

type ReviewRow = {
  id: string;
  user_id: string;
  language_id: string;
  product_id: string | null;
  section_type: "reading" | "listening" | "writing";
  question_type: string;
  leitner_box: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  last_accuracy_ratio: number | null;
  rolling_accuracy_ratio: number | null;
  review_count: number;
  correct_count: number;
  incorrect_count: number;
  is_archived: boolean;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type LanguageRow = { id: string; code: string };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get("Authorization") ?? "";
  if (!header) return null;
  return header.startsWith("Bearer ") ? header.slice(7) : header;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

const intervalDaysForBox = (box: number): number => {
  if (box <= 1) return 1;
  if (box === 2) return 2;
  if (box === 3) return 4;
  if (box === 4) return 8;
  return 16;
};

const safeObj = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

const clampAccuracy = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
};

const resolveLanguage = async (sb: any, code = "en"): Promise<LanguageRow | null> => {
  const { data } = await sb.from("languages").select("id, code").eq("code", code.toLowerCase()).limit(1).maybeSingle();
  if (!data) return null;
  return { id: String(data.id), code: String(data.code).toLowerCase() };
};

const sectionTypeFor = (questionType: string): "reading" | "listening" | "writing" => {
  const qt = questionType.toLowerCase();
  if (qt.includes("listening")) return "listening";
  if (qt.includes("writing") || qt.includes("essay")) return "writing";
  return "reading";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const token = getBearerToken(req);
    if (!token) return json(401, { error: "Unauthorized" });

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) return json(401, { error: "Unauthorized" });

    const userId = authData.user.id;
    const language = (await resolveLanguage(sb, "en")) ?? null;
    if (!language) return json(500, { error: "Language 'en' not found" });

    const url = new URL(req.url);

    if (req.method === "GET") {
      const mode = (url.searchParams.get("mode") ?? "daily").toLowerCase();
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? "10")));
      const sectionFilter = url.searchParams.get("section_type")?.trim().toLowerCase() || null;

      let query = sb
        .from("ielts_srs_question_reviews")
        .select("*")
        .eq("user_id", userId)
        .eq("language_id", language.id);

      if (mode === "daily") {
        query = query
          .eq("is_archived", false)
          .lte("next_review_at", new Date().toISOString())
          .order("next_review_at", { ascending: true });
      } else if (mode === "upcoming") {
        query = query.eq("is_archived", false).order("next_review_at", { ascending: true });
      } else if (mode === "all") {
        query = query.order("updated_at", { ascending: false });
      } else if (mode === "mastered") {
        query = query.eq("is_archived", true).order("updated_at", { ascending: false });
      } else {
        return json(400, { error: "Invalid mode. Use daily | upcoming | all | mastered." });
      }

      if (sectionFilter && (sectionFilter === "reading" || sectionFilter === "listening" || sectionFilter === "writing")) {
        query = query.eq("section_type", sectionFilter);
      }

      const { data, error } = await query.limit(limit);
      if (error) return json(500, { error: "Failed to load reviews", details: error });

      // Compose summary counts so the dashboard can show "X due now" without a second call.
      const { count: dueCount } = await sb
        .from("ielts_srs_question_reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("language_id", language.id)
        .eq("is_archived", false)
        .lte("next_review_at", new Date().toISOString());

      const { count: archivedCount } = await sb
        .from("ielts_srs_question_reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("language_id", language.id)
        .eq("is_archived", true);

      const { count: totalCount } = await sb
        .from("ielts_srs_question_reviews")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("language_id", language.id);

      return json(200, {
        items: (data ?? []) as ReviewRow[],
        summary: {
          due: dueCount ?? 0,
          mastered: archivedCount ?? 0,
          total: totalCount ?? 0,
        },
      });
    }

    if (req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as Json;
      const path = url.pathname;

      // Bulk endpoint: /ielts-srs/bulk-from-mastery
      // Used by the lab page after submit. Body: { items: [{ question_type, accuracy_ratio, section_type? }] }
      if (path.endsWith("/bulk-from-mastery") || (Array.isArray((body as any).items) && (body as any).items.length > 0)) {
        const items = Array.isArray((body as any).items) ? ((body as any).items as Json[]) : [];
        if (items.length === 0) return json(400, { error: "items[] required" });

        const productId = typeof (body as any).product_id === "string" ? String((body as any).product_id) : null;

        const results: Array<{ question_type: string; ok: boolean; box?: number; next_review_at?: string; error?: string }> = [];

        for (const raw of items.slice(0, 50)) {
          const item = safeObj(raw);
          const questionType = String(item.question_type ?? "").trim();
          if (!questionType) {
            results.push({ question_type: "(missing)", ok: false, error: "question_type required" });
            continue;
          }
          const accuracy = clampAccuracy(item.accuracy_ratio);
          if (accuracy == null) {
            results.push({ question_type: questionType, ok: false, error: "accuracy_ratio required" });
            continue;
          }
          const explicit =
            String(item.section_type ?? "").toLowerCase() === "reading"
            || String(item.section_type ?? "").toLowerCase() === "listening"
            || String(item.section_type ?? "").toLowerCase() === "writing"
              ? (String(item.section_type).toLowerCase() as "reading" | "listening" | "writing")
              : null;
          const sectionType = explicit ?? sectionTypeFor(questionType);

          const updated = await applyReview(sb, {
            userId,
            languageId: language.id,
            productId,
            sectionType,
            questionType,
            accuracy,
            seed: false,
          });
          results.push({
            question_type: questionType,
            ok: true,
            box: updated.leitner_box,
            next_review_at: updated.next_review_at,
          });
        }

        return json(200, { ok: true, results });
      }

      // Single-review submit: { question_type, accuracy_ratio, section_type?, product_id?, seed? }
      // seed=true means "user is adding this type to their queue", not a real
      // review. We insert with 0 counts and next_review_at = now so it shows up
      // immediately in mode=daily. If a row already exists, seed is a no-op.
      const questionType = String((body as any).question_type ?? "").trim();
      if (!questionType) return json(400, { error: "question_type required" });
      const accuracy = clampAccuracy((body as any).accuracy_ratio);
      if (accuracy == null) return json(400, { error: "accuracy_ratio required (0..1)" });
      const explicitSection =
        String((body as any).section_type ?? "").toLowerCase() === "reading"
        || String((body as any).section_type ?? "").toLowerCase() === "listening"
        || String((body as any).section_type ?? "").toLowerCase() === "writing"
          ? (String((body as any).section_type).toLowerCase() as "reading" | "listening" | "writing")
          : null;
      const sectionType = explicitSection ?? sectionTypeFor(questionType);
      const productId = typeof (body as any).product_id === "string" ? String((body as any).product_id) : null;
      const seed = (body as any).seed === true;

      const updated = await applyReview(sb, {
        userId,
        languageId: language.id,
        productId,
        sectionType,
        questionType,
        accuracy,
        seed,
      });

      return json(200, { ok: true, item: updated });
    }

    return json(405, { error: "Method not allowed" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});

const applyReview = async (
  sb: any,
  args: {
    userId: string;
    languageId: string;
    productId: string | null;
    sectionType: "reading" | "listening" | "writing";
    questionType: string;
    accuracy: number;
    seed: boolean;
  },
): Promise<ReviewRow> => {
  const { userId, languageId, productId, sectionType, questionType, accuracy, seed } = args;
  const correct = accuracy >= 0.7;

  // Fetch existing row (uniqueness key includes product_id; coalesce null with `is`).
  let existingQuery = sb
    .from("ielts_srs_question_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("section_type", sectionType)
    .eq("question_type", questionType)
    .limit(1);
  existingQuery = productId ? existingQuery.eq("product_id", productId) : existingQuery.is("product_id", null);
  const { data: existingData } = await existingQuery.maybeSingle();
  const existing = existingData as ReviewRow | null;

  // Seed is a no-op when the row already exists: we don't want to reset
  // counters or reschedule a row the user is already reviewing.
  if (seed && existing) return existing;

  const nowIso = new Date().toISOString();

  if (seed && !existing) {
    const seedPayload = {
      user_id: userId,
      language_id: languageId,
      product_id: productId,
      section_type: sectionType,
      question_type: questionType,
      leitner_box: 1,
      next_review_at: nowIso,
      last_reviewed_at: null,
      last_accuracy_ratio: Number(accuracy.toFixed(4)),
      rolling_accuracy_ratio: Number(accuracy.toFixed(4)),
      review_count: 0,
      correct_count: 0,
      incorrect_count: 0,
      is_archived: false,
      metadata: { seeded_at: nowIso, seed_accuracy: Number(accuracy.toFixed(4)) },
    };
    const { data, error } = await sb
      .from("ielts_srs_question_reviews")
      .insert(seedPayload)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to seed SRS row: ${error.message}`);
    return data as ReviewRow;
  }

  // Real review path (existing or fresh first-attempt). Advance/reset box.
  const prevBox = existing ? Number(existing.leitner_box ?? 1) : 1;
  const nextBox = correct ? Math.min(5, prevBox + 1) : 1;
  const reviewCount = (existing?.review_count ?? 0) + 1;
  const correctCount = (existing?.correct_count ?? 0) + (correct ? 1 : 0);
  const incorrectCount = (existing?.incorrect_count ?? 0) + (correct ? 0 : 1);
  const rolling =
    typeof existing?.rolling_accuracy_ratio === "number"
      ? Number((existing.rolling_accuracy_ratio * 0.7 + accuracy * 0.3).toFixed(4))
      : Number(accuracy.toFixed(4));
  const nextReviewAt = new Date(Date.now() + intervalDaysForBox(nextBox) * 24 * 60 * 60 * 1000).toISOString();
  const isArchived = nextBox >= 5 && rolling >= 0.85;

  const payload = {
    user_id: userId,
    language_id: languageId,
    product_id: productId,
    section_type: sectionType,
    question_type: questionType,
    leitner_box: nextBox,
    next_review_at: nextReviewAt,
    last_reviewed_at: nowIso,
    last_accuracy_ratio: Number(accuracy.toFixed(4)),
    rolling_accuracy_ratio: rolling,
    review_count: reviewCount,
    correct_count: correctCount,
    incorrect_count: incorrectCount,
    is_archived: isArchived,
  };

  if (existing) {
    const { data, error } = await sb
      .from("ielts_srs_question_reviews")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update SRS row: ${error.message}`);
    return data as ReviewRow;
  }

  const { data, error } = await sb
    .from("ielts_srs_question_reviews")
    .insert({ ...payload, metadata: {} })
    .select("*")
    .single();
  if (error) throw new Error(`Failed to insert SRS row: ${error.message}`);
  return data as ReviewRow;
};
