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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sbUrl = getEnv("SUPABASE_URL");
    const sbService = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sbAnon = getEnv("SUPABASE_ANON_KEY");
    const sb = createClient(sbUrl, sbService, { auth: { persistSession: false } });
    const url = new URL(req.url);

    // ── Public: GET /parent-report?token=xxx ─────────────────────────────────
    const reportToken = url.searchParams.get("token");
    if (req.method === "GET" && reportToken) {
      const { data: tokenRow, error: tokenErr } = await sb
        .from("parent_report_tokens")
        .select("id, academy_id, contact_id, label, expires_at, is_active, view_count")
        .eq("token", reportToken)
        .eq("is_active", true)
        .maybeSingle();

      if (tokenErr || !tokenRow) return json(404, { error: "Report link not found or expired" });
      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) return json(410, { error: "Report link has expired" });

      // Increment view count
      await sb.from("parent_report_tokens").update({ view_count: (tokenRow.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() }).eq("id", tokenRow.id);

      const academyId = String(tokenRow.academy_id);
      const contactId = String(tokenRow.contact_id);

      // Load contact + academy info
      const [contactResult, academyResult, membershipsResult, submissionsResult, attendanceResult] = await Promise.all([
        sb.from("academy_contacts").select("id, first_name, last_name, email, status, last_activity_at").eq("id", contactId).maybeSingle(),
        sb.from("tenants").select("id, name, metadata").eq("id", academyId).maybeSingle(),
        sb.from("academy_classroom_memberships").select("classroom_id, role, joined_at, academy_classrooms(id, name, is_active, score_weights)").eq("contact_id", contactId).eq("academy_id", academyId).limit(20),
        sb.from("academy_submissions")
          .select("id, assignment_id, score, max_score, status, submitted_at, graded_at, notes, academy_assignments(title, assignment_type, due_at, max_score, score_weight)")
          .eq("contact_id", contactId).eq("academy_id", academyId)
          .order("submitted_at", { ascending: false }).limit(50),
        sb.from("academy_attendance")
          .select("session_date, status")
          .eq("contact_id", contactId).eq("academy_id", academyId)
          .order("session_date", { ascending: false }).limit(60),
      ]);

      const submissions = (submissionsResult.data ?? []) as Array<Record<string, unknown>>;
      const attendance = (attendanceResult.data ?? []) as Array<Record<string, unknown>>;
      const graded = submissions.filter((s) => typeof s.score === "number");

      const avgScore = graded.length > 0
        ? Math.round(graded.reduce((acc, s) => {
            const maxS = Number((s.academy_assignments as any)?.max_score ?? s.max_score ?? 100);
            return acc + (maxS > 0 ? (Number(s.score) / maxS) * 100 : 0);
          }, 0) / graded.length * 10) / 10
        : null;

      const presentDays = attendance.filter((a) => a.status === "present" || a.status === "late").length;
      const attendanceRate = attendance.length > 0 ? Math.round((presentDays / attendance.length) * 100) : null;

      // Recent 4 weeks trend (last 4 graded submissions in order)
      const trend = graded.slice(0, 8).reverse().map((s) => {
        const maxS = Number((s.academy_assignments as any)?.max_score ?? s.max_score ?? 100);
        return {
          date: s.submitted_at ? String(s.submitted_at).slice(0, 10) : null,
          label: (s.academy_assignments as any)?.title ?? "Assignment",
          score_pct: maxS > 0 ? Math.round((Number(s.score) / maxS) * 100) : null,
        };
      });

      return json(200, {
        contact: contactResult.data,
        academy: { id: academyResult.data?.id, name: academyResult.data?.name, logo_url: (academyResult.data?.metadata as any)?.logo_url ?? null },
        classrooms: (membershipsResult.data ?? []).map((m) => (m.academy_classrooms as Record<string, unknown>)),
        stats: { avg_score: avgScore, attendance_rate: attendanceRate, total_submissions: submissions.length, graded_submissions: graded.length, present_days: presentDays, total_attendance_days: attendance.length },
        recent_submissions: submissions.slice(0, 10),
        recent_attendance: attendance.slice(0, 14),
        trend,
        report_label: tokenRow.label ?? null,
      });
    }

    // All write actions require auth
    const bearerToken = getBearerToken(req);
    if (!bearerToken) return json(401, { error: "Unauthorized" });
    const authSb = createClient(sbUrl, sbAnon, { auth: { persistSession: false } });
    const { data: auth, error: authErr } = await authSb.auth.getUser(bearerToken);
    if (authErr || !auth?.user) return json(401, { error: "Unauthorized" });
    const userId = auth.user.id;

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = normalizeText(url.searchParams.get("action") || body?.action, 64).toLowerCase();

    // ── POST generate_token ───────────────────────────────────────────────────
    if (action === "generate_token") {
      const academyId = normalizeText(body?.academy_id, 64);
      const contactId = normalizeText(body?.contact_id, 64);
      const label = normalizeText(body?.label, 120) || null;
      const expiresInDays = typeof body?.expires_in_days === "number" ? Math.min(Math.max(1, body.expires_in_days), 365) : null;

      if (!academyId) return json(400, { error: "academy_id is required" });
      if (!contactId) return json(400, { error: "contact_id is required" });

      // Verify caller is an academy admin
      const { data: membership } = await sb.from("tenant_memberships").select("role").eq("tenant_id", academyId).eq("user_id", userId).eq("status", "active").maybeSingle();
      if (!membership || !["owner", "admin"].includes(String(membership.role ?? ""))) return json(403, { error: "Only academy admins can generate report links" });

      // Verify contact belongs to academy
      const { data: contact } = await sb.from("academy_contacts").select("id, first_name, last_name").eq("id", contactId).eq("academy_id", academyId).maybeSingle();
      if (!contact) return json(404, { error: "Contact not found" });

      const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000).toISOString() : null;

      const { data: tokenRow, error } = await sb
        .from("parent_report_tokens")
        .insert({ academy_id: academyId, contact_id: contactId, created_by: userId, label, expires_at: expiresAt })
        .select("id, token, label, expires_at, created_at")
        .maybeSingle();

      if (error) return json(500, { error: "Failed to generate token", detail: error.message });

      const shareUrl = `${Deno.env.get("SITE_URL") ?? "https://schood.online"}/parent-report?token=${tokenRow?.token}`;
      return json(200, { token: tokenRow, share_url: shareUrl, contact: { id: contact.id, name: `${contact.first_name} ${contact.last_name}`.trim() } });
    }

    // ── GET list_tokens ───────────────────────────────────────────────────────
    if (action === "list_tokens") {
      const academyId = normalizeText(url.searchParams.get("academy_id") || body?.academy_id, 64);
      if (!academyId) return json(400, { error: "academy_id is required" });

      const { data: membership } = await sb.from("tenant_memberships").select("role").eq("tenant_id", academyId).eq("user_id", userId).eq("status", "active").maybeSingle();
      if (!membership || !["owner", "admin"].includes(String(membership.role ?? ""))) return json(403, { error: "Forbidden" });

      const { data, error } = await sb
        .from("parent_report_tokens")
        .select("id, token, contact_id, label, expires_at, is_active, view_count, last_viewed_at, created_at, academy_contacts(first_name, last_name, email)")
        .eq("academy_id", academyId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) return json(500, { error: "Failed to list tokens" });
      return json(200, { tokens: data ?? [] });
    }

    // ── POST revoke_token ─────────────────────────────────────────────────────
    if (action === "revoke_token") {
      const tokenId = normalizeText(body?.token_id, 64);
      if (!tokenId) return json(400, { error: "token_id is required" });
      const { error } = await sb.from("parent_report_tokens").update({ is_active: false }).eq("id", tokenId).eq("created_by", userId);
      if (error) return json(500, { error: "Failed to revoke" });
      return json(200, { ok: true });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
