import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };
const bearer = (req: Request) => { const h = req.headers.get("Authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : h || null; };
const n = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const arr = (v: unknown): string[] => Array.isArray(v) ? v.map(String).filter(Boolean) : [];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sbUrl = getEnv("SUPABASE_URL");
    const sb = createClient(sbUrl, getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const url = new URL(req.url);

    // ── Public: browse teachers + job listings ────────────────────────────────
    const publicAction = url.searchParams.get("action");
    if (req.method === "GET" && (publicAction === "teachers" || publicAction === "jobs")) {
      if (publicAction === "teachers") {
        const subject = url.searchParams.get("subject");
        let q = sb.from("teacher_profiles").select("id, full_name, bio, avatar_url, subjects, languages, location, hourly_rate, currency, experience_years, certifications, available, verified").eq("is_public", true).eq("available", true).order("verified", { ascending: false }).limit(50);
        if (subject) q = q.contains("subjects", [subject]);
        const { data } = await q;
        return json(200, { teachers: data ?? [] });
      }
      if (publicAction === "jobs") {
        const { data } = await sb.from("job_listings").select("id, tenant_id, title, description, subjects, employment_type, salary_min, salary_max, currency, location, remote_ok, created_at, tenants(name)").eq("status", "open").order("created_at", { ascending: false }).limit(50);
        return json(200, { jobs: data ?? [] });
      }
    }

    // Authenticated routes
    const token = bearer(req);
    if (!token) return json(401, { error: "Unauthorized" });
    const authSb = createClient(sbUrl, getEnv("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    const { data: auth } = await authSb.auth.getUser(token);
    if (!auth?.user) return json(401, { error: "Unauthorized" });
    const userId = auth.user.id;

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = n(url.searchParams.get("action") || body?.action, 64).toLowerCase();

    // Teacher profile management
    if (action === "get_my_profile") {
      const { data } = await sb.from("teacher_profiles").select("*").eq("user_id", userId).maybeSingle();
      return json(200, { profile: data ?? null });
    }

    if (action === "upsert_profile") {
      const { data: userRow } = await sb.from("users").select("email").eq("id", userId).maybeSingle();
      const fullName = n(body?.full_name, 120) || String(userRow?.email ?? "").split("@")[0];
      const payload = {
        user_id: userId, full_name: fullName,
        bio: n(body?.bio, 2000) || null, avatar_url: n(body?.avatar_url, 500) || null,
        subjects: arr(body?.subjects), languages: arr(body?.languages),
        location: n(body?.location, 120) || null, timezone: n(body?.timezone, 80) || null,
        hourly_rate: typeof body?.hourly_rate === "number" ? body.hourly_rate : null,
        experience_years: typeof body?.experience_years === "number" ? body.experience_years : null,
        certifications: arr(body?.certifications),
        available: typeof body?.available === "boolean" ? body.available : true,
        is_public: typeof body?.is_public === "boolean" ? body.is_public : true,
      };
      const { data, error } = await sb.from("teacher_profiles").upsert(payload, { onConflict: "user_id" }).select("*").maybeSingle();
      if (error) return json(500, { error: error.message });
      return json(200, { profile: data });
    }

    // Job listings (for centers)
    if (action === "post_job") {
      const tenantId = n(body?.tenant_id, 64);
      const title = n(body?.title, 160);
      if (!tenantId || !title) return json(400, { error: "tenant_id and title required" });
      const { data: membership } = await sb.from("tenant_memberships").select("role").eq("tenant_id", tenantId).eq("user_id", userId).eq("status", "active").maybeSingle();
      if (!membership || !["owner", "admin"].includes(String(membership.role ?? ""))) return json(403, { error: "Forbidden" });
      const expiresAt = body?.expires_in_days ? new Date(Date.now() + Number(body.expires_in_days) * 86400000).toISOString() : null;
      const { data, error } = await sb.from("job_listings").insert({
        tenant_id: tenantId, title,
        description: n(body?.description, 3000) || null,
        subjects: arr(body?.subjects),
        employment_type: n(body?.employment_type, 20) || "part_time",
        salary_min: typeof body?.salary_min === "number" ? body.salary_min : null,
        salary_max: typeof body?.salary_max === "number" ? body.salary_max : null,
        location: n(body?.location, 120) || null,
        remote_ok: Boolean(body?.remote_ok),
        created_by: userId, expires_at: expiresAt,
      }).select("id, title, status, created_at").maybeSingle();
      if (error) return json(500, { error: error.message });
      return json(200, { job: data });
    }

    if (action === "my_jobs") {
      const tenantId = n(url.searchParams.get("tenant_id") || body?.tenant_id, 64);
      if (!tenantId) return json(400, { error: "tenant_id required" });
      const { data } = await sb.from("job_listings").select("id, title, employment_type, status, created_at, (select count(*) from public.job_applications where listing_id = job_listings.id)").eq("tenant_id", tenantId).order("created_at", { ascending: false });
      return json(200, { jobs: data ?? [] });
    }

    if (action === "close_job") {
      const jobId = n(body?.job_id, 64);
      if (!jobId) return json(400, { error: "job_id required" });
      const { data: job } = await sb.from("job_listings").select("tenant_id").eq("id", jobId).maybeSingle();
      if (!job) return json(404, { error: "Job not found" });
      const { data: m } = await sb.from("tenant_memberships").select("role").eq("tenant_id", job.tenant_id).eq("user_id", userId).maybeSingle();
      if (!m || !["owner", "admin"].includes(String(m.role ?? ""))) return json(403, { error: "Forbidden" });
      await sb.from("job_listings").update({ status: "closed" }).eq("id", jobId);
      return json(200, { ok: true });
    }

    // Applications (teacher side)
    if (action === "apply") {
      const listingId = n(body?.listing_id, 64);
      if (!listingId) return json(400, { error: "listing_id required" });
      const { data: profile } = await sb.from("teacher_profiles").select("id").eq("user_id", userId).maybeSingle();
      if (!profile?.id) return json(400, { error: "Create a teacher profile first" });
      const { data, error } = await sb.from("job_applications").upsert({ listing_id: listingId, teacher_id: profile.id, cover_note: n(body?.cover_note, 2000) || null, status: "pending" }, { onConflict: "listing_id,teacher_id" }).select("id, status, applied_at").maybeSingle();
      if (error) return json(500, { error: error.message });
      return json(200, { application: data });
    }

    if (action === "my_applications") {
      const { data: profile } = await sb.from("teacher_profiles").select("id").eq("user_id", userId).maybeSingle();
      if (!profile?.id) return json(200, { applications: [] });
      const { data } = await sb.from("job_applications").select("id, status, applied_at, cover_note, job_listings(title, employment_type, tenants(name))").eq("teacher_id", profile.id).order("applied_at", { ascending: false }).limit(30);
      return json(200, { applications: data ?? [] });
    }

    if (action === "list_applications") {
      const jobId = n(url.searchParams.get("job_id") || body?.job_id, 64);
      if (!jobId) return json(400, { error: "job_id required" });
      const { data: job } = await sb.from("job_listings").select("tenant_id").eq("id", jobId).maybeSingle();
      if (!job) return json(404, { error: "Job not found" });
      const { data: m } = await sb.from("tenant_memberships").select("role").eq("tenant_id", job.tenant_id).eq("user_id", userId).maybeSingle();
      if (!m || !["owner", "admin"].includes(String(m.role ?? ""))) return json(403, { error: "Forbidden" });
      const { data } = await sb.from("job_applications").select("id, status, applied_at, cover_note, teacher_profiles(full_name, bio, subjects, experience_years, hourly_rate, location, available)").eq("listing_id", jobId).order("applied_at");
      return json(200, { applications: data ?? [] });
    }

    if (action === "update_application_status") {
      const appId = n(body?.application_id, 64);
      const status = n(body?.status, 20);
      if (!appId || !["shortlisted", "rejected", "hired"].includes(status)) return json(400, { error: "application_id and valid status required" });
      const { data: app } = await sb.from("job_applications").select("listing_id").eq("id", appId).maybeSingle();
      if (!app) return json(404, { error: "Application not found" });
      const { data: job } = await sb.from("job_listings").select("tenant_id").eq("id", app.listing_id).maybeSingle();
      if (!job) return json(404, { error: "Job not found" });
      const { data: m } = await sb.from("tenant_memberships").select("role").eq("tenant_id", job.tenant_id).eq("user_id", userId).maybeSingle();
      if (!m || !["owner", "admin"].includes(String(m.role ?? ""))) return json(403, { error: "Forbidden" });
      await sb.from("job_applications").update({ status }).eq("id", appId);
      return json(200, { ok: true });
    }

    return json(404, { error: "Not found" });
  } catch (err) { return json(500, { error: err instanceof Error ? err.message : "Unknown" }); }
});
