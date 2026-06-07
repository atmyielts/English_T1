import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };
const bearer = (req: Request) => { const h = req.headers.get("Authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : h || null; };
const normalizeText = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sbUrl = getEnv("SUPABASE_URL");
    const sb = createClient(sbUrl, getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // ── Public: candidate accesses their test via invite token ────────────────
    const inviteToken = url.searchParams.get("invite") || body?.invite_token;
    if (inviteToken && req.method === "GET") {
      const { data } = await sb.from("corporate_candidates")
        .select("id, assessment_id, email, full_name, status, expires_at, corporate_assessments(title, description, exam_type, experience_id, passing_band)")
        .eq("invite_token", inviteToken).maybeSingle();
      if (!data) return json(404, { error: "Invite link not found" });
      if (data.expires_at && new Date(data.expires_at) < new Date()) return json(410, { error: "This invite has expired" });
      if (data.status === "completed") return json(200, { status: "completed", candidate: data });
      return json(200, { candidate: data, assessment: data.corporate_assessments });
    }

    // All other routes require auth
    const token = bearer(req);
    if (!token) return json(401, { error: "Unauthorized" });
    const authSb = createClient(sbUrl, getEnv("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    const { data: auth } = await authSb.auth.getUser(token);
    if (!auth?.user) return json(401, { error: "Unauthorized" });
    const userId = auth.user.id;

    const action = normalizeText(url.searchParams.get("action") || body?.action, 64).toLowerCase();

    if (action === "list_assessments") {
      const tenantId = normalizeText(url.searchParams.get("tenant_id") || body?.tenant_id, 64);
      if (!tenantId) return json(400, { error: "tenant_id required" });
      const { data: membership } = await sb.from("tenant_memberships").select("role").eq("tenant_id", tenantId).eq("user_id", userId).eq("status", "active").maybeSingle();
      if (!membership || !["owner", "admin"].includes(String(membership.role ?? ""))) return json(403, { error: "Forbidden" });
      const { data } = await sb.from("corporate_assessments").select("id, title, exam_type, passing_band, status, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false });
      return json(200, { assessments: data ?? [] });
    }

    if (action === "create_assessment") {
      const tenantId = normalizeText(body?.tenant_id, 64);
      const title = normalizeText(body?.title, 160);
      if (!tenantId || !title) return json(400, { error: "tenant_id and title required" });
      const { data: membership } = await sb.from("tenant_memberships").select("role").eq("tenant_id", tenantId).eq("user_id", userId).eq("status", "active").maybeSingle();
      if (!membership || !["owner", "admin"].includes(String(membership.role ?? ""))) return json(403, { error: "Forbidden" });
      const { data, error } = await sb.from("corporate_assessments").insert({
        tenant_id: tenantId, title, description: normalizeText(body?.description, 1000) || null,
        exam_type: normalizeText(body?.exam_type, 40) || "ielts",
        passing_band: typeof body?.passing_band === "number" ? body.passing_band : null,
        created_by: userId,
      }).select("id, title, exam_type, passing_band, status, created_at").maybeSingle();
      if (error) return json(500, { error: error.message });
      return json(200, { assessment: data });
    }

    if (action === "invite_candidates") {
      const assessmentId = normalizeText(body?.assessment_id, 64);
      const candidates = Array.isArray(body?.candidates) ? body.candidates as Array<{ email: string; full_name?: string }> : [];
      if (!assessmentId || candidates.length === 0) return json(400, { error: "assessment_id and candidates required" });

      const { data: assess } = await sb.from("corporate_assessments").select("tenant_id, title").eq("id", assessmentId).maybeSingle();
      if (!assess) return json(404, { error: "Assessment not found" });

      const { data: membership } = await sb.from("tenant_memberships").select("role").eq("tenant_id", assess.tenant_id).eq("user_id", userId).eq("status", "active").maybeSingle();
      if (!membership || !["owner", "admin"].includes(String(membership.role ?? ""))) return json(403, { error: "Forbidden" });

      const expiresAt = body?.expires_in_days ? new Date(Date.now() + Number(body.expires_in_days) * 86400000).toISOString() : null;
      const siteUrl = Deno.env.get("SITE_URL") ?? "https://schood.online";

      const results = [];
      for (const c of candidates.slice(0, 100)) {
        const email = String(c.email ?? "").trim().toLowerCase();
        if (!email.includes("@")) { results.push({ email, status: "invalid" }); continue; }
        const { data: cand, error } = await sb.from("corporate_candidates").upsert({
          assessment_id: assessmentId, tenant_id: assess.tenant_id,
          email, full_name: String(c.full_name ?? "").trim() || null,
          status: "invited", expires_at: expiresAt,
        }, { onConflict: "assessment_id,email", ignoreDuplicates: false }).select("id, invite_token").maybeSingle();
        if (error) { results.push({ email, status: "error", detail: error.message }); continue; }
        const inviteUrl = `${siteUrl}/corporate-test?invite=${cand?.invite_token}`;
        results.push({ email, status: "ok", invite_url: inviteUrl, candidate_id: cand?.id });
      }
      return json(200, { results, summary: { ok: results.filter((r) => r.status === "ok").length, total: results.length } });
    }

    if (action === "list_candidates") {
      const assessmentId = normalizeText(url.searchParams.get("assessment_id") || body?.assessment_id, 64);
      if (!assessmentId) return json(400, { error: "assessment_id required" });
      const { data: assess } = await sb.from("corporate_assessments").select("tenant_id").eq("id", assessmentId).maybeSingle();
      if (!assess) return json(404, { error: "Assessment not found" });
      const { data: membership } = await sb.from("tenant_memberships").select("role").eq("tenant_id", assess.tenant_id).eq("user_id", userId).eq("status", "active").maybeSingle();
      if (!membership || !["owner", "admin"].includes(String(membership.role ?? ""))) return json(403, { error: "Forbidden" });
      const { data } = await sb.from("corporate_candidates").select("id, email, full_name, status, overall_band, overall_score, invited_at, completed_at").eq("assessment_id", assessmentId).order("invited_at", { ascending: false });
      return json(200, { candidates: data ?? [] });
    }

    return json(404, { error: "Not found" });
  } catch (err) { return json(500, { error: err instanceof Error ? err.message : "Unknown" }); }
});
