import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

type Json = Record<string, unknown>;

type ExperienceRow = {
  id: string;
  product_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  version: number;
  price_amount?: number | null;
  price_currency?: string | null;
  metadata: Json | null;
  created_at: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.tests.manage",
      action: "admin.tests",
    });
    if (!authz.ok) return authz.response;

    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname.endsWith("/list")) {
      const productId = url.searchParams.get("product_id");
      if (!productId) {
        return new Response(JSON.stringify({ error: "product_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: experiences, error: expErr } = await sb
        .from("experiences")
        .select("id, product_id, name, display_order, is_active, version, price_amount, price_currency, metadata, created_at")
        .eq("product_id", productId)
        .order("display_order", { ascending: true });

      if (expErr) throw expErr;

      const expRows = (experiences ?? []) as ExperienceRow[];
      const expIds = expRows.map((e) => e.id);

      if (expIds.length === 0) {
        return new Response(JSON.stringify({ experiences: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: sections, error: secErr } = await sb
        .from("sections")
        .select("id, experience_id")
        .in("experience_id", expIds);
      if (secErr) throw secErr;

      const sectionToExp = new Map((sections ?? []).map((s: any) => [s.id, s.experience_id]));
      const sectionIds = (sections ?? []).map((s: any) => s.id);

      const { data: parts, error: partErr } = await sb.from("parts").select("id, section_id").in("section_id", sectionIds);
      if (partErr) throw partErr;

      const partToSection = new Map((parts ?? []).map((p: any) => [p.id, p.section_id]));
      const partIds = (parts ?? []).map((p: any) => p.id);

      const { data: units, error: unitErr } = await sb.from("content_units").select("id, part_id").in("part_id", partIds);
      if (unitErr) throw unitErr;

      const countsByExpId = new Map<string, { sections: number; parts: number; units: number }>();
      const inc = (expId: string, k: "sections" | "parts" | "units") => {
        const cur = countsByExpId.get(expId) ?? { sections: 0, parts: 0, units: 0 };
        (cur as any)[k] += 1;
        countsByExpId.set(expId, cur);
      };

      for (const s of (sections ?? []) as any[]) inc(String(s.experience_id), "sections");
      for (const p of (parts ?? []) as any[]) {
        const expId = sectionToExp.get(String(p.section_id));
        if (expId) inc(String(expId), "parts");
      }
      for (const u of (units ?? []) as any[]) {
        const sectionId = partToSection.get(String(u.part_id));
        const expId = sectionId ? sectionToExp.get(String(sectionId)) : null;
        if (expId) inc(String(expId), "units");
      }

      return new Response(
        JSON.stringify({
          experiences: expRows.map((e) => ({
            ...e,
            counts: countsByExpId.get(e.id) ?? { sections: 0, parts: 0, units: 0 },
          })),
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (req.method === "PATCH" && url.pathname.endsWith("/update")) {
      const body = (await req.json()) as unknown;
      if (!isObject(body)) {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const experienceId = String((body as any).experience_id ?? "");
      const patch = isObject((body as any).patch) ? ((body as any).patch as Json) : {};
      if (!experienceId) {
        return new Response(JSON.stringify({ error: "experience_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const versionRaw = (patch as any).version;
      const expectedVersion = typeof versionRaw === "number" && Number.isFinite(versionRaw) ? Math.floor(versionRaw) : null;
      if (!expectedVersion || expectedVersion <= 0) {
        return new Response(JSON.stringify({ error: "patch.version is required for optimistic locking" }), {
          status: 409,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const update: any = {};
      if (typeof patch.name === "string") update.name = patch.name;
      if (typeof patch.display_order === "number" && Number.isFinite(patch.display_order)) update.display_order = patch.display_order;
      if (typeof patch.is_active === "boolean") update.is_active = patch.is_active;
      if (typeof (patch as any).price_amount === "number" && Number.isFinite((patch as any).price_amount)) {
        update.price_amount = (patch as any).price_amount;
      }
      if (typeof (patch as any).price_currency === "string") {
        update.price_currency = (patch as any).price_currency;
      }
      if (patch.metadata && typeof patch.metadata === "object" && !Array.isArray(patch.metadata)) update.metadata = patch.metadata;
      update.version = expectedVersion + 1;

      if (Object.keys(update).length === 1) {
        return new Response(JSON.stringify({ error: "No updatable fields in patch" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      if (patch.is_active === true) {
        const { error: gateErr } = await sb.rpc("admin_builder_assert_publish_ready_experience", {
          p_experience_id: experienceId,
        });
        if (gateErr) {
          const message = String(gateErr.message ?? "Publish gate failed");
          const code = String((gateErr as any)?.code ?? "");
          const status = message.includes("Publish gate") || code === "P0001" ? 422 : 500;
          return new Response(JSON.stringify({ error: message }), {
            status,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }

      const { data: updated, error: updateErr } = await sb
        .from("experiences")
        .update(update)
        .eq("id", experienceId)
        .eq("version", expectedVersion)
        .select("id, product_id, name, display_order, is_active, version, price_amount, price_currency, metadata, created_at")
        .maybeSingle();

      if (updateErr) throw updateErr;
      if (!updated) {
        return new Response(JSON.stringify({ error: "Version conflict: test changed by another admin" }), {
          status: 409,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ experience: updated }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "POST" && url.pathname.endsWith("/reorder")) {
      const body = (await req.json()) as any;
      const order = Array.isArray(body?.order) ? body.order : [];
      const rows = order
        .map((o: any) => ({ id: String(o?.experience_id ?? ""), display_order: Number(o?.display_order ?? NaN) }))
        .filter((o: any) => o.id && Number.isFinite(o.display_order));

      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: "order must be a non-empty array" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { error: upsertErr } = await sb.from("experiences").upsert(rows, { onConflict: "id" });
      if (upsertErr) throw upsertErr;

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "POST" && url.pathname.endsWith("/clone")) {
      const body = (await req.json()) as any;
      const experienceId = String(body?.experience_id ?? "");
      const newNameRaw = body?.new_name;
      if (!experienceId) {
        return new Response(JSON.stringify({ error: "experience_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: exp, error: expErr } = await sb
        .from("experiences")
        .select("id, product_id, name, display_order, is_active, metadata, price_amount, price_currency")
        .eq("id", experienceId)
        .maybeSingle();
      if (expErr || !exp) {
        return new Response(JSON.stringify({ error: "Experience not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: sections, error: secErr } = await sb
        .from("sections")
        .select("id, name, display_order, metadata")
        .eq("experience_id", experienceId);
      if (secErr) throw secErr;

      const oldSectionIds = (sections ?? []).map((s: any) => s.id);
      const { data: parts, error: partErr } = await sb
        .from("parts")
        .select("id, section_id, name, display_order, metadata")
        .in("section_id", oldSectionIds);
      if (partErr) throw partErr;

      const oldPartIds = (parts ?? []).map((p: any) => p.id);
      const { data: units, error: unitErr } = await sb
        .from("content_units")
        .select("id, part_id, type, data, display_order, metadata")
        .in("part_id", oldPartIds);
      if (unitErr) throw unitErr;

      const oldUnitIds = (units ?? []).map((u: any) => u.id);
      const { data: keys, error: keyErr } = await sb
        .from("answer_keys")
        .select("content_unit_id, correct, metadata")
        .in("content_unit_id", oldUnitIds);
      if (keyErr) throw keyErr;

      const newExperienceId = crypto.randomUUID();
      const newName =
        typeof newNameRaw === "string" && newNameRaw.trim().length > 0 ? newNameRaw.trim() : `${String(exp.name)} (Copy)`;

      // Place cloned test after all existing tests in product.
      const { data: maxOrder } = await sb
        .from("experiences")
        .select("display_order")
        .eq("product_id", String(exp.product_id))
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const maxDisplayOrder = Number.isFinite(maxOrder?.display_order)
        ? Number(maxOrder?.display_order)
        : Number(exp.display_order);
      const nextDisplayOrder = maxDisplayOrder + 1;

      const sectionIdMap = new Map<string, string>();
      for (const s of sections ?? []) sectionIdMap.set(String((s as any).id), crypto.randomUUID());

      const partIdMap = new Map<string, string>();
      for (const p of parts ?? []) partIdMap.set(String((p as any).id), crypto.randomUUID());

      const unitIdMap = new Map<string, string>();
      for (const u of units ?? []) unitIdMap.set(String((u as any).id), crypto.randomUUID());

      const newExperience = {
        id: newExperienceId,
        product_id: exp.product_id,
        name: newName,
        display_order: nextDisplayOrder,
        is_active: false,
        version: 1,
        metadata: exp.metadata ?? {},
        price_amount: exp.price_amount ?? null,
        price_currency: exp.price_currency ?? "UZS",
      };

      const newSections = (sections ?? []).map((s: any) => ({
        id: sectionIdMap.get(String(s.id)),
        experience_id: newExperienceId,
        name: s.name,
        display_order: s.display_order,
        metadata: s.metadata ?? {},
      }));

      const newParts = (parts ?? []).map((p: any) => ({
        id: partIdMap.get(String(p.id)),
        section_id: sectionIdMap.get(String(p.section_id)),
        name: p.name,
        display_order: p.display_order,
        metadata: p.metadata ?? {},
      }));

      const newUnits = (units ?? []).map((u: any) => ({
        id: unitIdMap.get(String(u.id)),
        part_id: partIdMap.get(String(u.part_id)),
        type: u.type,
        data: u.data,
        display_order: u.display_order,
        metadata: u.metadata ?? {},
      }));

      const newKeys = (keys ?? [])
        .map((k: any) => ({
          content_unit_id: unitIdMap.get(String(k.content_unit_id)),
          correct: k.correct,
          metadata: k.metadata ?? {},
        }))
        .filter((k: any) => k.content_unit_id);

      const { error: insertExpErr } = await sb.from("experiences").insert(newExperience);
      if (insertExpErr) throw insertExpErr;

      const { error: insertSecErr } = await sb.from("sections").insert(newSections);
      if (insertSecErr) throw insertSecErr;

      const { error: insertPartErr } = await sb.from("parts").insert(newParts);
      if (insertPartErr) throw insertPartErr;

      for (const batch of chunk(newUnits, 500)) {
        const { error: insertUnitErr } = await sb.from("content_units").insert(batch);
        if (insertUnitErr) throw insertUnitErr;
      }

      for (const batch of chunk(newKeys, 500)) {
        const { error: insertKeyErr } = await sb.from("answer_keys").insert(batch);
        if (insertKeyErr) throw insertKeyErr;
      }

      return new Response(JSON.stringify({ experience_id: newExperienceId }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (req.method === "DELETE" && url.pathname.endsWith("/delete")) {
      let body: any = null;
      if ((req.headers.get("content-length") ?? "0") !== "0") {
        try {
          body = await req.json();
        } catch {
          body = null;
        }
      }

      const fromBody = body && typeof body === "object" ? String(body.experience_id ?? "") : "";
      const experienceId = String(url.searchParams.get("experience_id") ?? fromBody).trim();
      if (!experienceId) {
        return new Response(JSON.stringify({ error: "experience_id is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const { data: exp, error: expErr } = await sb
        .from("experiences")
        .select("id, name")
        .eq("id", experienceId)
        .maybeSingle();
      if (expErr) throw expErr;
      if (!exp) {
        return new Response(JSON.stringify({ error: "Experience not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Preserve candidate/session history: block hard-delete when attempts already exist.
      const { count: sessionsCount, error: sessionsErr } = await sb
        .from("sessions")
        .select("id", { head: true, count: "exact" })
        .eq("experience_id", experienceId);
      if (sessionsErr) throw sessionsErr;

      if ((sessionsCount ?? 0) > 0) {
        return new Response(
          JSON.stringify({
            error: "Cannot delete test with existing sessions. Deactivate it instead.",
            details: { sessions_count: sessionsCount },
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      const { error: delErr } = await sb.from("experiences").delete().eq("id", experienceId);
      if (delErr) throw delErr;

      return new Response(JSON.stringify({ ok: true, experience_id: experienceId, name: exp.name ?? null }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
