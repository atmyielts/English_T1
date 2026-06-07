import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
const getBearerToken = (req: Request) => { const h = req.headers.get("Authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : h || null; };
const normalizeText = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

// Maps exam_type to a display label and scoring schema
const EXAM_CONFIG: Record<string, { label: string; scoreLabel: string; maxScore: number | null; useBand: boolean }> = {
  ielts: { label: "IELTS Academic", scoreLabel: "Overall Band Score", maxScore: 9, useBand: true },
  "ielts-practice": { label: "IELTS Practice Test", scoreLabel: "Overall Band Score", maxScore: 9, useBand: true },
  sat: { label: "SAT", scoreLabel: "Total Score", maxScore: 1600, useBand: false },
  toefl: { label: "TOEFL iBT", scoreLabel: "Total Score", maxScore: 120, useBand: false },
  itep: { label: "iTEP Academic Plus", scoreLabel: "Composite Score", maxScore: 6, useBand: true },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sbUrl = getEnv("SUPABASE_URL");
    const sbService = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sbAnon = getEnv("SUPABASE_ANON_KEY");

    const url = new URL(req.url);
    const token = getBearerToken(req);

    // ── Public: GET /certificates?token=xxx ──────────────────────────────────
    const publicToken = url.searchParams.get("token");
    if (req.method === "GET" && publicToken) {
      const sb = createClient(sbUrl, sbService, { auth: { persistSession: false } });
      const { data, error } = await sb
        .from("issued_certificates")
        .select("id, public_token, user_id, exam_type, overall_band, overall_score, section_scores, candidate_name, exam_date, center_name, center_logo_url, is_public, metadata, issued_at, expires_at")
        .eq("public_token", publicToken)
        .eq("is_public", true)
        .maybeSingle();

      if (error) return json(500, { error: "Failed to load certificate" });
      if (!data) return json(404, { error: "Certificate not found" });
      if (data.expires_at && new Date(data.expires_at) < new Date()) return json(410, { error: "Certificate has expired" });

      const config = EXAM_CONFIG[data.exam_type] ?? { label: data.exam_type, scoreLabel: "Score", maxScore: null, useBand: false };
      return json(200, { certificate: { ...data, exam_config: config } });
    }

    // All other routes require auth
    if (!token) return json(401, { error: "Unauthorized" });
    const authSb = createClient(sbUrl, sbAnon, { auth: { persistSession: false } });
    const sb = createClient(sbUrl, sbService, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await authSb.auth.getUser(token);
    if (authError || !auth?.user) return json(401, { error: "Unauthorized" });
    const userId = auth.user.id;

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = normalizeText(url.searchParams.get("action") || body?.action, 64).toLowerCase();

    // ── GET /certificates?action=list ────────────────────────────────────────
    if (req.method === "GET" && action === "list") {
      const { data, error } = await sb
        .from("issued_certificates")
        .select("id, public_token, exam_type, overall_band, overall_score, candidate_name, exam_date, center_name, issued_at, expires_at")
        .eq("user_id", userId)
        .order("issued_at", { ascending: false })
        .limit(50);
      if (error) return json(500, { error: "Failed to list certificates" });
      return json(200, { certificates: data ?? [] });
    }

    // ── POST issue ────────────────────────────────────────────────────────────
    if (req.method === "POST" && action === "issue") {
      const sessionId = normalizeText(body?.session_id, 64) || null;
      const examType = normalizeText(body?.exam_type, 40).toLowerCase() || "ielts";
      const candidateName = normalizeText(body?.candidate_name, 120) || (auth.user.email?.split("@")[0] ?? "Candidate");

      let overallBand: number | null = null;
      let overallScore: number | null = null;
      let sectionScores: Record<string, unknown> | null = null;
      let outcomeId: string | null = null;
      let tenantId: string | null = null;
      let productId: string | null = null;
      let centerName: string | null = null;
      let centerLogoUrl: string | null = null;
      let examDate = body?.exam_date ? String(body.exam_date).slice(0, 10) : new Date().toISOString().slice(0, 10);

      // Load from exam outcome if session provided
      if (sessionId) {
        const { data: outcome } = await sb
          .from("exam_outcomes")
          .select("id, user_id, product_id, overall_band, overall_score, section_scores, computed_at")
          .eq("session_id", sessionId)
          .eq("user_id", userId)
          .maybeSingle();

        if (outcome?.id) {
          outcomeId = String(outcome.id);
          overallBand = typeof outcome.overall_band === "number" ? outcome.overall_band : null;
          overallScore = typeof outcome.overall_score === "number" ? outcome.overall_score : null;
          sectionScores = outcome.section_scores as Record<string, unknown> | null;
          productId = outcome.product_id ? String(outcome.product_id) : null;
          examDate = outcome.computed_at ? String(outcome.computed_at).slice(0, 10) : examDate;

          // Get tenant from session
          const { data: sessionRow } = await sb.from("sessions").select("metadata").eq("id", sessionId).maybeSingle();
          const sessionMeta = (sessionRow?.metadata as Record<string, unknown>) ?? {};
          tenantId = String(sessionMeta?.tenant_id ?? "").trim() || null;
        }
      } else {
        // Manual values from body
        overallBand = typeof body?.overall_band === "number" ? body.overall_band : null;
        overallScore = typeof body?.overall_score === "number" ? body.overall_score : null;
        sectionScores = (body?.section_scores && typeof body.section_scores === "object") ? body.section_scores : null;
      }

      // Look up center info if tenant
      if (!tenantId) {
        const { data: firstMembership } = await sb
          .from("tenant_memberships")
          .select("tenant_id")
          .eq("user_id", userId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        tenantId = firstMembership?.tenant_id ? String(firstMembership.tenant_id) : null;
      }

      if (tenantId) {
        const { data: tenantRow } = await sb
          .from("tenants")
          .select("name, metadata")
          .eq("id", tenantId)
          .maybeSingle();
        if (tenantRow) {
          centerName = body?.center_name || String(tenantRow.name ?? "");
          centerLogoUrl = (tenantRow.metadata as any)?.logo_url ?? null;
        }
      }

      if (body?.center_name) centerName = normalizeText(body.center_name, 120);

      const { data: cert, error } = await sb
        .from("issued_certificates")
        .insert({
          user_id: userId,
          session_id: sessionId,
          outcome_id: outcomeId,
          tenant_id: tenantId,
          product_id: productId,
          exam_type: examType,
          overall_band: overallBand,
          overall_score: overallScore,
          section_scores: sectionScores,
          candidate_name: candidateName,
          exam_date: examDate,
          center_name: centerName,
          center_logo_url: centerLogoUrl,
          is_public: true,
          metadata: body?.metadata && typeof body.metadata === "object" ? body.metadata : {},
        })
        .select("id, public_token, exam_type, overall_band, overall_score, candidate_name, exam_date, center_name, issued_at")
        .maybeSingle();

      if (error) return json(500, { error: "Failed to issue certificate", detail: error.message });

      const config = EXAM_CONFIG[examType] ?? { label: examType, scoreLabel: "Score", maxScore: null, useBand: false };
      const shareUrl = `${Deno.env.get("SITE_URL") ?? "https://schood.online"}/certificate?token=${cert?.public_token}`;
      return json(200, { certificate: cert, share_url: shareUrl, exam_config: config });
    }

    // ── POST revoke ───────────────────────────────────────────────────────────
    if (req.method === "POST" && action === "revoke") {
      const certId = normalizeText(body?.certificate_id, 64);
      if (!certId) return json(400, { error: "certificate_id is required" });
      const { error } = await sb.from("issued_certificates").update({ is_public: false }).eq("id", certId).eq("user_id", userId);
      if (error) return json(500, { error: "Failed to revoke" });
      return json(200, { ok: true });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
