import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

type ImportPayload = {
  product_id: string;
  experience: {
    id?: string;
    name: string;
    display_order?: number;
    is_active?: boolean;
    metadata?: Json;
  };
  sections: Array<{
    id?: string;
    name: string;
    display_order?: number;
    metadata?: Json;
    parts: Array<{
      id?: string;
      name: string;
      display_order?: number;
      metadata?: Json;
      content_units: Array<{
        id?: string;
        type: string;
        display_order?: number;
        data: Json;
        metadata?: Json;
        answer_key?: { correct: Json; metadata?: Json };
      }>;
    }>;
  }>;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const uuid = (): string => crypto.randomUUID();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sanitizeName = (raw: unknown): string => (typeof raw === "string" ? raw.trim() : "");
const asNumber = (raw: unknown): number | null =>
  typeof raw === "number" && Number.isFinite(raw) ? raw : null;
const asBoolean = (raw: unknown): boolean | null => (typeof raw === "boolean" ? raw : null);
const isUuid = (raw: unknown): raw is string => typeof raw === "string" && UUID_RE.test(raw.trim());

const resolveEntityId = (raw: unknown): { id: string; externalId: string | null } => {
  const value = sanitizeName(raw);
  if (!value) return { id: uuid(), externalId: null };
  if (isUuid(value)) return { id: value, externalId: null };
  return { id: uuid(), externalId: value };
};

const resolveDisplayOrder = (preferred: unknown, fallbackOrder: unknown, indexFallback: number): number => {
  const a = asNumber(preferred);
  if (a != null) return a;
  const b = asNumber(fallbackOrder);
  if (b != null) return b;
  return indexFallback;
};

const normalizeAnswerKey = (raw: unknown): { correct: Json; metadata: Json } | null => {
  if (!isObject(raw)) return null;
  const metadata = isObject((raw as any).metadata) ? ((raw as any).metadata as Json) : {};

  if (isObject((raw as any).correct)) {
    return { correct: (raw as any).correct as Json, metadata };
  }

  const fallback: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === "metadata" || k === "correct") continue;
    fallback[k] = v;
  }
  if (!isObject(fallback) || Object.keys(fallback).length === 0) return null;
  return { correct: fallback as Json, metadata };
};

const validateUniqueOrder = (label: string, orders: number[]): string | null => {
  const seen = new Set<number>();
  for (const o of orders) {
    if (seen.has(o)) return `${label}: duplicate display_order ${o}`;
    seen.add(o);
  }
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const url = new URL(req.url);
    const dryRun = String(url.searchParams.get("dry_run") ?? "").toLowerCase() === "true";

    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearerToken(req);
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: authData, error: authError } = await sb.auth.getUser(token);
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const authedUserId = authData.user.id;
    const { data: userRow } = await sb.from("users").select("role").eq("id", authedUserId).maybeSingle();
    if (String((userRow as any)?.role ?? "").toLowerCase() !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = (await req.json()) as unknown;
    if (!isObject(body)) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const payload = body as unknown as ImportPayload;
    const root = payload as any;
    const expInputRaw = isObject(root.experience) ? (root.experience as any) : null;

    const productRef = sanitizeName(root.product_id ?? expInputRaw?.product_id);
    if (!productRef) {
      return new Response(JSON.stringify({ error: "product_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!expInputRaw) {
      return new Response(JSON.stringify({ error: "experience is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const expInput = expInputRaw;
    const expName = sanitizeName(expInput.name ?? expInput.title);
    if (!expName) {
      return new Response(JSON.stringify({ error: "experience.name is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const sectionsInput = asArray<any>(root.sections).length > 0 ? asArray<any>(root.sections) : asArray<any>(expInput.sections);
    if (sectionsInput.length === 0) {
      return new Response(JSON.stringify({ error: "sections must be a non-empty array" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Resolve product by UUID id first, then by metadata.slug, then by name.
    let resolvedProductId: string | null = null;
    const { data: productById } = await sb.from("products").select("id").eq("id", productRef).maybeSingle();
    if (productById?.id) {
      resolvedProductId = String(productById.id);
    } else {
      const { data: productBySlug } = await sb
        .from("products")
        .select("id")
        .filter("metadata->>slug", "eq", productRef)
        .maybeSingle();
      if (productBySlug?.id) resolvedProductId = String(productBySlug.id);
    }
    if (!resolvedProductId) {
      const { data: productByName } = await sb.from("products").select("id").ilike("name", productRef).maybeSingle();
      if (productByName?.id) resolvedProductId = String(productByName.id);
    }
    if (!resolvedProductId) {
      return new Response(JSON.stringify({ error: "Invalid product_id (product not found)" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const expIdResolved = resolveEntityId(expInput.id);
    const experienceId = expIdResolved.id;
    const activeFlag = asBoolean(expInput.is_active);
    const legacyActive = asBoolean(expInput.active);
    const version = asNumber(expInput.version);
    const experienceMetadata = isObject(expInput.metadata) ? { ...(expInput.metadata as Json) } : {};
    if (expIdResolved.externalId && experienceMetadata.external_id == null) {
      experienceMetadata.external_id = expIdResolved.externalId;
    }
    if (version != null && experienceMetadata.version == null) experienceMetadata.version = version;
    const experienceRow = {
      id: experienceId,
      product_id: resolvedProductId,
      name: expName,
      display_order: resolveDisplayOrder(expInput.display_order, expInput.order, 0),
      is_active: activeFlag ?? legacyActive ?? true,
      metadata: experienceMetadata,
    };

    const sectionRows: any[] = [];
    const partRows: any[] = [];
    const unitRows: any[] = [];
    const keyRows: any[] = [];

    const normalized: ImportPayload = {
      product_id: resolvedProductId,
      experience: {
        id: experienceId,
        name: experienceRow.name,
        display_order: experienceRow.display_order,
        is_active: experienceRow.is_active,
        metadata: experienceRow.metadata,
      },
      sections: [],
    };

    const sectionOrders: number[] = [];

    sectionsInput.forEach((s: any, sIdx: number) => {
      if (!isObject(s)) throw new Error(`sections[${sIdx}] must be an object`);
      const sName = sanitizeName(s.name ?? s.title);
      if (!sName) throw new Error(`sections[${sIdx}].name is required`);

      const sectionIdResolved = resolveEntityId(s.id);
      const sectionId = sectionIdResolved.id;
      const sectionDisplayOrder = resolveDisplayOrder(s.display_order, s.order, sIdx + 1);
      sectionOrders.push(sectionDisplayOrder);
      const sectionMetadata = isObject(s.metadata) ? { ...(s.metadata as Json) } : {};
      if (sectionIdResolved.externalId && sectionMetadata.external_id == null) {
        sectionMetadata.external_id = sectionIdResolved.externalId;
      }
      const sectionType = sanitizeName(s.type);
      if (sectionType && !sectionMetadata.type) sectionMetadata.type = sectionType;
      const sectionDurationMinutes = asNumber(s.duration_minutes);
      if (sectionDurationMinutes != null && sectionMetadata.duration_seconds == null) {
        sectionMetadata.duration_seconds = Math.max(0, Math.floor(sectionDurationMinutes * 60));
      }

      const sectionRow = {
        id: sectionId,
        experience_id: experienceId,
        name: sName,
        display_order: sectionDisplayOrder,
        metadata: sectionMetadata,
      };
      sectionRows.push(sectionRow);

      const normalizedSection: any = {
        id: sectionId,
        name: sectionRow.name,
        display_order: sectionRow.display_order,
        metadata: sectionRow.metadata,
        parts: [],
      };

      const parts = asArray<any>(s.parts);
      if (parts.length === 0) throw new Error(`sections[${sIdx}].parts must be a non-empty array`);

      const partOrders: number[] = [];

      parts.forEach((p: any, pIdx: number) => {
        if (!isObject(p)) throw new Error(`sections[${sIdx}].parts[${pIdx}] must be an object`);
        const pName = sanitizeName(p.name ?? p.title);
        if (!pName) throw new Error(`sections[${sIdx}].parts[${pIdx}].name is required`);

        const partIdResolved = resolveEntityId(p.id);
        const partId = partIdResolved.id;
        const partDisplayOrder = resolveDisplayOrder(p.display_order, p.order, pIdx + 1);
        partOrders.push(partDisplayOrder);
        const partMetadata = isObject(p.metadata) ? { ...(p.metadata as Json) } : {};
        if (partIdResolved.externalId && partMetadata.external_id == null) {
          partMetadata.external_id = partIdResolved.externalId;
        }

        const partRow = {
          id: partId,
          section_id: sectionId,
          name: pName,
          display_order: partDisplayOrder,
          metadata: partMetadata,
        };
        partRows.push(partRow);

        const normalizedPart: any = {
          id: partId,
          name: partRow.name,
          display_order: partRow.display_order,
          metadata: partRow.metadata,
          content_units: [],
        };

        const units = asArray<any>(p.content_units).length > 0 ? asArray<any>(p.content_units) : asArray<any>(p.units);
        if (units.length === 0) throw new Error(`sections[${sIdx}].parts[${pIdx}].content_units must be a non-empty array`);

        const unitOrders: number[] = [];

        units.forEach((u: any, uIdx: number) => {
          if (!isObject(u)) throw new Error(`content_units[${uIdx}] must be an object`);
          const type = sanitizeName(u.type);
          if (!type) throw new Error(`content_units[${uIdx}].type is required`);
          if (!isObject(u.data)) throw new Error(`content_units[${uIdx}].data must be an object`);

          const unitIdResolved = resolveEntityId(u.id);
          const unitId = unitIdResolved.id;
          const unitDisplayOrder = resolveDisplayOrder(u.display_order, u.order, uIdx + 1);
          unitOrders.push(unitDisplayOrder);
          const unitData = { ...(u.data as Json) };
          if ((type === "question_single_choice" || type === "question_multi_choice") && Array.isArray((unitData as any).options)) {
            (unitData as any).options = (unitData as any).options.map((opt: any) =>
              isObject(opt) ? { ...opt, label: sanitizeName(opt.label ?? opt.text) } : opt,
            );
          }

          const unitMetadata = isObject(u.metadata) ? { ...(u.metadata as Json) } : {};
          if (unitIdResolved.externalId && unitMetadata.external_id == null) {
            unitMetadata.external_id = unitIdResolved.externalId;
          }

          const unitRow = {
            id: unitId,
            part_id: partId,
            type,
            data: unitData,
            display_order: unitDisplayOrder,
            metadata: unitMetadata,
          };
          unitRows.push(unitRow);

          const normalizedUnit: any = {
            id: unitId,
            type: unitRow.type,
            display_order: unitRow.display_order,
            data: unitRow.data,
            metadata: unitRow.metadata,
          };

          if (isObject(u.answer_key)) {
            const normalizedKey = normalizeAnswerKey(u.answer_key);
            if (!normalizedKey) throw new Error(`content_units[${uIdx}].answer_key must be an object`);
            keyRows.push({
              content_unit_id: unitId,
              correct: normalizedKey.correct,
              metadata: normalizedKey.metadata,
            });
            normalizedUnit.answer_key = {
              correct: normalizedKey.correct,
              metadata: normalizedKey.metadata,
            };
          }

          normalizedPart.content_units.push(normalizedUnit);
        });

        const unitOrderErr = validateUniqueOrder(`section[${sIdx}].part[${pIdx}].content_units`, unitOrders);
        if (unitOrderErr) throw new Error(unitOrderErr);

        normalizedSection.parts.push(normalizedPart);
      });

      const partOrderErr = validateUniqueOrder(`section[${sIdx}].parts`, partOrders);
      if (partOrderErr) throw new Error(partOrderErr);

      normalized.sections.push(normalizedSection);
    });

    const sectionOrderErr = validateUniqueOrder("sections", sectionOrders);
    if (sectionOrderErr) {
      return new Response(JSON.stringify({ error: sectionOrderErr }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!dryRun) {
      // Insert in dependency order.
      const { error: expErr } = await sb.from("experiences").upsert(experienceRow, { onConflict: "id" });
      if (expErr) throw expErr;

      const { error: secErr } = await sb.from("sections").upsert(sectionRows, { onConflict: "id" });
      if (secErr) throw secErr;

      const { error: partErr } = await sb.from("parts").upsert(partRows, { onConflict: "id" });
      if (partErr) throw partErr;

      const { error: unitErr } = await sb.from("content_units").upsert(unitRows, { onConflict: "id" });
      if (unitErr) throw unitErr;

      if (keyRows.length > 0) {
        const { error: keyErr } = await sb.from("answer_keys").upsert(keyRows, { onConflict: "content_unit_id" });
        if (keyErr) throw keyErr;
      }
    }

    return new Response(
      JSON.stringify({
        experience_id: experienceId,
        dry_run: dryRun,
        counts: {
          sections: sectionRows.length,
          parts: partRows.length,
          content_units: unitRows.length,
          answer_keys: keyRows.length,
        },
        normalized,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err) {
    console.error("import-experience error", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return "Unknown error";
            }
          })();
    const status = message.toLowerCase().includes("invalid input syntax for type uuid") ? 400 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
