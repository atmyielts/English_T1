import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

type Json = Record<string, unknown>;
type ModuleType = "listening" | "reading" | "writing";
type SectionType = ModuleType | "reading_writing" | "math";

type ImportPayload = {
  product_id: string;
  experience: {
    id?: string;
    version?: number;
    name: string;
    display_order?: number;
    is_active?: boolean;
    price_amount?: number | null;
    price_currency?: string | null;
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
        answer_key?: { correct: Json; metadata?: Json } | null;
      }>;
    }>;
  }>;
  deleted?: {
    section_ids?: string[];
    part_ids?: string[];
    unit_ids?: string[];
  };
  answer_key_unit_ids?: string[];
};

type SectionTemplateUpsertPayload = {
  product_id: string;
  template_name: string;
  template_key?: string | null;
  section_type: SectionType;
  section_payload: Json;
  template_id?: string | null;
  source_snapshot_id?: string | null;
  auto_split_parts?: boolean;
};

type PartTemplateUpsertPayload = {
  product_id: string;
  template_name: string;
  template_key?: string | null;
  module_type: ModuleType;
  part_payload: Json;
  template_id?: string | null;
  source_section_template_version_id?: string | null;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const asObject = (v: unknown): Record<string, unknown> => (isObject(v) ? v : {});
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const readString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null)) as T;
const slugifyKey = (value: string, fallback: string): string => {
  const out = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return out || fallback;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const statusFromRpcMessage = (message: string): number => {
  const normalized = message.toLowerCase();
  if (message.includes("Version conflict")) return 409;
  if (message.includes("Publish gate")) return 422;
  if (normalized.includes("non-empty array")) return 400;
  if (normalized.includes("not found")) return 404;
  if (normalized.includes("required") || normalized.includes("invalid")) return 400;
  return 500;
};

const normalizeSectionType = (value: unknown): SectionType | "" => {
  const clean = readString(value).toLowerCase();
  return ["listening", "reading", "writing", "reading_writing", "math"].includes(clean)
    ? (clean as SectionType)
    : "";
};

const normalizeModuleType = (value: unknown): ModuleType | "" => {
  const clean = readString(value).toLowerCase();
  return ["listening", "reading", "writing"].includes(clean) ? (clean as ModuleType) : "";
};

const normalizeUnitPayload = (rawUnit: unknown, index: number): Record<string, unknown> => {
  const unit = asObject(rawUnit);
  const answerKey = asObject(unit.answer_key);
  return {
    type: readString(unit.type) || "instruction",
    display_order: Number.isFinite(Number(unit.display_order)) ? Math.floor(Number(unit.display_order)) : index + 1,
    data: cloneJson(asObject(unit.data)),
    metadata: cloneJson(asObject(unit.metadata)),
    answer_key:
      isObject(answerKey.correct)
        ? {
            correct: cloneJson(asObject(answerKey.correct)),
            metadata: cloneJson(asObject(answerKey.metadata)),
          }
        : null,
  };
};

const normalizePartPayload = (rawPart: unknown, index: number): Record<string, unknown> => {
  const part = asObject(rawPart);
  const rawUnits = asArray<unknown>(part.content_units);
  return {
    name: readString(part.name) || `Part ${index + 1}`,
    display_order: Number.isFinite(Number(part.display_order)) ? Math.floor(Number(part.display_order)) : index + 1,
    metadata: cloneJson(asObject(part.metadata)),
    content_units: rawUnits.map((unit, unitIndex) => normalizeUnitPayload(unit, unitIndex)),
  };
};

const normalizeSectionPayload = (rawSection: unknown, fallbackType?: SectionType): Record<string, unknown> => {
  const section = asObject(rawSection);
  const metadata = cloneJson(asObject(section.metadata));
  const sectionType = normalizeSectionType((metadata as any).type) || fallbackType || "reading";
  (metadata as any).type = sectionType;
  const rawParts = asArray<unknown>(section.parts);
  return {
    name: readString(section.name) || sectionType.charAt(0).toUpperCase() + sectionType.slice(1),
    display_order: Number.isFinite(Number(section.display_order)) ? Math.floor(Number(section.display_order)) : 1,
    metadata,
    parts: rawParts.map((part, partIndex) => normalizePartPayload(part, partIndex)),
  };
};

const resolveSectionTemplateVersion = async (
  sb: any,
  productId: string,
  templateKey: string,
  versionRaw?: string | null,
): Promise<Record<string, unknown> | null> => {
  const { data: template, error: templateError } = await sb
    .from("section_templates")
    .select("id, template_key, name, section_type, latest_version")
    .eq("product_id", productId)
    .eq("template_key", templateKey)
    .maybeSingle();
  if (templateError) throw templateError;
  if (!template) return null;

  const version = Number.isFinite(Number(versionRaw)) && Number(versionRaw) > 0
    ? Math.floor(Number(versionRaw))
    : Number((template as any).latest_version ?? 1);

  const { data: versionRow, error: versionError } = await sb
    .from("section_template_versions")
    .select("id, version, source_snapshot_id, section_payload")
    .eq("template_id", String((template as any).id))
    .eq("version", version)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!versionRow) return null;

  return {
    template_version_id: String((versionRow as any).id),
    template_id: String((template as any).id),
    template_key: String((template as any).template_key ?? ""),
    template_name: String((template as any).name ?? ""),
    section_type: String((template as any).section_type ?? ""),
    version: Number((versionRow as any).version ?? version),
    source_snapshot_id: (versionRow as any).source_snapshot_id ?? null,
    section_payload: (versionRow as any).section_payload ?? {},
  };
};

const resolvePartTemplateVersion = async (
  sb: any,
  productId: string,
  templateKey: string,
  versionRaw?: string | null,
): Promise<Record<string, unknown> | null> => {
  const { data: template, error: templateError } = await sb
    .from("part_templates")
    .select("id, template_key, name, module_type, latest_version")
    .eq("product_id", productId)
    .eq("template_key", templateKey)
    .maybeSingle();
  if (templateError) throw templateError;
  if (!template) return null;

  const version = Number.isFinite(Number(versionRaw)) && Number(versionRaw) > 0
    ? Math.floor(Number(versionRaw))
    : Number((template as any).latest_version ?? 1);

  const { data: versionRow, error: versionError } = await sb
    .from("part_template_versions")
    .select("id, version, source_section_template_version_id, part_payload")
    .eq("template_id", String((template as any).id))
    .eq("version", version)
    .maybeSingle();
  if (versionError) throw versionError;
  if (!versionRow) return null;

  return {
    template_version_id: String((versionRow as any).id),
    template_id: String((template as any).id),
    template_key: String((template as any).template_key ?? ""),
    template_name: String((template as any).name ?? ""),
    module_type: String((template as any).module_type ?? ""),
    version: Number((versionRow as any).version ?? version),
    source_section_template_version_id: (versionRow as any).source_section_template_version_id ?? null,
    part_payload: (versionRow as any).part_payload ?? {},
  };
};

const lookupSectionTemplateKeyById = async (sb: any, templateId: string | null): Promise<string> => {
  if (!templateId) return "";
  const { data, error } = await sb
    .from("section_templates")
    .select("template_key")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data) return "";
  return String((data as any).template_key ?? "").trim();
};

const lookupPartTemplateKeyById = async (sb: any, templateId: string | null): Promise<string> => {
  if (!templateId) return "";
  const { data, error } = await sb
    .from("part_templates")
    .select("template_key")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data) return "";
  return String((data as any).template_key ?? "").trim();
};

const autoSplitSectionToPartTemplates = async (
  sb: any,
  authedUserId: string,
  body: {
    productId: string;
    sectionType: SectionType;
    sectionTemplateKey: string;
    sectionPayload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> => {
  const normalized = cloneJson(normalizeSectionPayload(body.sectionPayload, body.sectionType));
  const moduleType = normalizeModuleType(body.sectionType);
  if (!moduleType) return normalized;

  const parts = asArray<Record<string, unknown>>((normalized as any).parts).map((part) => cloneJson(part));
  const nextParts: Array<Record<string, unknown>> = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const metadata = cloneJson(asObject(part.metadata));
    const partRef = asObject((metadata as any).part_template_ref);
    const partName = readString(part.name) || `Part ${index + 1}`;
    const templateId = readString((partRef as any).template_id) || null;
    const explicitTemplateKey = readString((partRef as any).template_key);
    const existingTemplateKey = explicitTemplateKey || (await lookupPartTemplateKeyById(sb, templateId));
    const derivedTemplateKey =
      existingTemplateKey ||
      slugifyKey(`${body.sectionTemplateKey}-${partName}`, `${body.sectionTemplateKey}-part-${index + 1}`);

    const { data, error } = await sb.rpc("admin_part_template_upsert", {
      p_product_id: body.productId,
      p_template_name: partName,
      p_template_key: derivedTemplateKey,
      p_module_type: moduleType,
      p_part_payload: normalizePartPayload(part, index),
      p_actor: authedUserId,
      p_template_id: templateId,
      p_source_section_template_version_id: null,
    });

    if (error) {
      const message = String(error.message ?? "Part template save failed");
      throw new Error(message);
    }

    (metadata as any).part_template_ref = {
      template_id: (data as any)?.template_id ?? null,
      template_key: (data as any)?.template_key ?? derivedTemplateKey,
      template_version_id: (data as any)?.template_version_id ?? null,
      template_version: (data as any)?.version ?? null,
    };

    nextParts.push({
      ...part,
      name: partName,
      metadata,
      content_units: asArray<unknown>((part as any).content_units).map((unit, unitIndex) => normalizeUnitPayload(unit, unitIndex)),
    });
  }

  return {
    ...normalized,
    parts: nextParts,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.builder.manage",
      action: "admin.builder",
    });
    if (!authz.ok) return authz.response;
    const authedUserId = authz.context.userId;

    if (req.method === "GET" && url.pathname.endsWith("/load")) {
      const experienceId = String(url.searchParams.get("experience_id") ?? "");
      if (!experienceId) return json(400, { error: "experience_id is required" });

      const { data: experience, error: expErr } = await sb
        .from("experiences")
        .select("id, product_id, name, display_order, is_active, metadata, price_amount, price_currency, version")
        .eq("id", experienceId)
        .maybeSingle();

      if (expErr) return json(500, { error: "Failed to load experience", details: expErr });
      if (!experience) return json(404, { error: "Experience not found" });

      const { data: sections, error: secErr } = await sb
        .from("sections")
        .select("id, experience_id, name, display_order, metadata")
        .eq("experience_id", experienceId)
        .order("display_order", { ascending: true });

      if (secErr) return json(500, { error: "Failed to load sections", details: secErr });

      const sectionIds = (sections ?? []).map((s: any) => s.id);
      const { data: parts, error: partErr } = await sb
        .from("parts")
        .select("id, section_id, name, display_order, metadata")
        .in("section_id", sectionIds.length > 0 ? sectionIds : ["00000000-0000-0000-0000-000000000000"])
        .order("display_order", { ascending: true });

      if (partErr) return json(500, { error: "Failed to load parts", details: partErr });

      const partIds = (parts ?? []).map((p: any) => p.id);
      const { data: units, error: unitErr } = await sb
        .from("content_units")
        .select("id, part_id, type, display_order, data, metadata")
        .in("part_id", partIds.length > 0 ? partIds : ["00000000-0000-0000-0000-000000000000"])
        .order("display_order", { ascending: true });

      if (unitErr) return json(500, { error: "Failed to load content units", details: unitErr });

      const unitIds = (units ?? []).map((u: any) => u.id);
      const { data: keys, error: keyErr } = await sb
        .from("answer_keys")
        .select("content_unit_id, correct, metadata")
        .in("content_unit_id", unitIds.length > 0 ? unitIds : ["00000000-0000-0000-0000-000000000000"]);

      if (keyErr) return json(500, { error: "Failed to load answer keys", details: keyErr });

      const keyByUnit = new Map<string, any>();
      for (const k of (keys ?? []) as any[]) keyByUnit.set(k.content_unit_id, k);

      const partsBySection = new Map<string, any[]>();
      for (const p of (parts ?? []) as any[]) {
        const list = partsBySection.get(p.section_id) ?? [];
        list.push(p);
        partsBySection.set(p.section_id, list);
      }

      const unitsByPart = new Map<string, any[]>();
      for (const u of (units ?? []) as any[]) {
        const list = unitsByPart.get(u.part_id) ?? [];
        list.push(u);
        unitsByPart.set(u.part_id, list);
      }

      const payload: ImportPayload = {
        product_id: (experience as any).product_id,
        experience: {
          id: experience.id,
          version: Number((experience as any).version ?? 1),
          name: experience.name,
          display_order: experience.display_order,
          is_active: experience.is_active,
          price_amount: (experience as any).price_amount ?? null,
          price_currency: (experience as any).price_currency ?? "UZS",
          metadata: (experience.metadata ?? {}) as Json,
        },
        sections: (sections ?? []).map((s: any) => ({
          id: s.id,
          name: s.name,
          display_order: s.display_order,
          metadata: (s.metadata ?? {}) as Json,
          parts: (partsBySection.get(s.id) ?? []).map((p: any) => ({
            id: p.id,
            name: p.name,
            display_order: p.display_order,
            metadata: (p.metadata ?? {}) as Json,
            content_units: (unitsByPart.get(p.id) ?? []).map((u: any) => {
              const key = keyByUnit.get(u.id);
              return {
                id: u.id,
                type: u.type,
                display_order: u.display_order,
                data: (u.data ?? {}) as Json,
                metadata: (u.metadata ?? {}) as Json,
                answer_key: key ? { correct: key.correct ?? {}, metadata: key.metadata ?? {} } : null,
              };
            }),
          })),
        })),
      };

      return json(200, { payload });
    }

    if (req.method === "GET" && url.pathname.endsWith("/snapshots")) {
      const experienceId = String(url.searchParams.get("experience_id") ?? "");
      if (!experienceId) return json(400, { error: "experience_id is required" });

      const limitRaw = Number(url.searchParams.get("limit") ?? 20);
      const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 20));

      const { data, error } = await sb
        .from("experience_snapshots")
        .select("id, experience_id, version, action, created_by, created_at")
        .eq("experience_id", experienceId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return json(500, { error: "Failed to load snapshots", details: error });
      return json(200, { snapshots: data ?? [] });
    }

    if (req.method === "GET" && url.pathname.endsWith("/templates")) {
      const templateVersionId = readString(url.searchParams.get("template_version_id"));
      if (templateVersionId) {
        const { data, error } = await sb.rpc("admin_section_template_get_payload", {
          p_template_version_id: templateVersionId,
        });
        if (error) return json(500, { error: "Failed to load template payload", details: error });
        if (!Array.isArray(data) || data.length === 0) return json(404, { error: "Template version not found" });
        return json(200, data[0]);
      }

      const productId = readString(url.searchParams.get("product_id"));
      const templateKey = readString(url.searchParams.get("template_key"));
      const version = readString(url.searchParams.get("version"));

      if (productId && templateKey) {
        const resolved = await resolveSectionTemplateVersion(sb, productId, templateKey, version || null);
        if (!resolved) return json(404, { error: "Template version not found" });
        return json(200, resolved);
      }

      if (!productId) return json(400, { error: "product_id is required" });

      const { data, error } = await sb.rpc("admin_section_templates_list", {
        p_product_id: productId,
      });
      if (error) return json(500, { error: "Failed to load templates", details: error });
      return json(200, { templates: data ?? [] });
    }

    if (req.method === "GET" && url.pathname.endsWith("/part-templates")) {
      const templateVersionId = readString(url.searchParams.get("template_version_id"));
      if (templateVersionId) {
        const { data, error } = await sb.rpc("admin_part_template_get_payload", {
          p_template_version_id: templateVersionId,
        });
        if (error) return json(500, { error: "Failed to load part template payload", details: error });
        if (!Array.isArray(data) || data.length === 0) return json(404, { error: "Template version not found" });
        return json(200, data[0]);
      }

      const productId = readString(url.searchParams.get("product_id"));
      const templateKey = readString(url.searchParams.get("template_key"));
      const version = readString(url.searchParams.get("version"));

      if (productId && templateKey) {
        const resolved = await resolvePartTemplateVersion(sb, productId, templateKey, version || null);
        if (!resolved) return json(404, { error: "Template version not found" });
        return json(200, resolved);
      }

      if (!productId) return json(400, { error: "product_id is required" });

      const { data, error } = await sb.rpc("admin_part_templates_list", {
        p_product_id: productId,
      });
      if (error) return json(500, { error: "Failed to load part templates", details: error });
      return json(200, { templates: data ?? [] });
    }

    if (req.method === "POST" && url.pathname.endsWith("/save")) {
      const body = (await req.json()) as unknown;
      if (!isObject(body)) return json(400, { error: "Invalid JSON body" });

      const payload = (isObject((body as any).payload) ? (body as any).payload : body) as ImportPayload;
      if (!Array.isArray(payload.sections) || payload.sections.length === 0) {
        return json(400, { error: "sections must be a non-empty array" });
      }
      const actionRaw = String((body as any).action ?? "save").trim().toLowerCase();
      const action = actionRaw || "save";

      const { data, error } = await sb.rpc("admin_builder_save", {
        p_payload: payload,
        p_actor: authedUserId,
        p_action: action,
      });

      if (error) {
        const message = String(error.message ?? "Save failed");
        return json(statusFromRpcMessage(message), { error: message, details: error });
      }
      const saveResult = (data ?? {}) as Record<string, unknown>;
      const savedExperienceId = String(saveResult.experience_id ?? "").trim();

      let syncErrorMessage: string | null = null;
      let syncedCount = 0;
      const payloadSections = Array.isArray(payload.sections) ? payload.sections : [];
      if (savedExperienceId) {
        const syncResult = await sb.rpc("admin_builder_sync_section_instances", {
          p_experience_id: savedExperienceId,
          p_sections: payloadSections,
          p_actor: authedUserId,
        });
        if (syncResult.error) {
          syncErrorMessage = String(syncResult.error.message ?? "Failed to sync section instances");
        } else {
          syncedCount = Number(syncResult.data ?? 0);
        }
      }

      return json(200, {
        ...saveResult,
        section_instances_synced: !syncErrorMessage,
        section_instances_count: syncedCount,
        section_instances_error: syncErrorMessage,
      });
    }

    if (req.method === "POST" && url.pathname.endsWith("/templates/upsert")) {
      const body = (await req.json()) as unknown;
      if (!isObject(body)) return json(400, { error: "Invalid JSON body" });

      const payload = body as SectionTemplateUpsertPayload;
      const productId = readString(payload.product_id);
      const templateName = readString(payload.template_name);
      const sectionType = normalizeSectionType(payload.section_type);
      const templateId = readString(payload.template_id) || null;
      const sourceSnapshotId = readString(payload.source_snapshot_id) || null;
      const templateKey =
        readString(payload.template_key) ||
        (await lookupSectionTemplateKeyById(sb, templateId)) ||
        slugifyKey(templateName, "section-template");

      if (!productId) return json(400, { error: "product_id is required" });
      if (!templateName) return json(400, { error: "template_name is required" });
      if (!sectionType) return json(400, { error: "section_type must be listening|reading|writing|reading_writing|math" });
      if (!isObject(payload.section_payload)) return json(400, { error: "section_payload must be an object" });

      const normalizedSectionPayload = normalizeSectionPayload(payload.section_payload, sectionType);
      const sectionPayload =
        payload.auto_split_parts === false
          ? normalizedSectionPayload
          : await autoSplitSectionToPartTemplates(sb, authedUserId, {
              productId,
              sectionType,
              sectionTemplateKey: templateKey,
              sectionPayload: normalizedSectionPayload,
            });

      const { data, error } = await sb.rpc("admin_section_template_upsert", {
        p_product_id: productId,
        p_template_name: templateName,
        p_template_key: templateKey,
        p_section_type: sectionType,
        p_section_payload: sectionPayload,
        p_actor: authedUserId,
        p_template_id: templateId,
        p_source_snapshot_id: sourceSnapshotId,
      });

      if (error) {
        const message = String(error.message ?? "Template save failed");
        return json(statusFromRpcMessage(message), { error: message, details: error });
      }

      return json(200, data ?? {});
    }

    if (req.method === "POST" && url.pathname.endsWith("/part-templates/upsert")) {
      const body = (await req.json()) as unknown;
      if (!isObject(body)) return json(400, { error: "Invalid JSON body" });

      const payload = body as PartTemplateUpsertPayload;
      const productId = readString(payload.product_id);
      const templateName = readString(payload.template_name);
      const moduleType = normalizeModuleType(payload.module_type);
      const templateId = readString(payload.template_id) || null;
      const templateKey =
        readString(payload.template_key) ||
        (await lookupPartTemplateKeyById(sb, templateId)) ||
        slugifyKey(templateName, "part-template");

      if (!productId) return json(400, { error: "product_id is required" });
      if (!templateName) return json(400, { error: "template_name is required" });
      if (!moduleType) return json(400, { error: "module_type must be listening|reading|writing" });
      if (!isObject(payload.part_payload)) return json(400, { error: "part_payload must be an object" });

      const normalizedPartPayload = normalizePartPayload(payload.part_payload, 0);

      const { data, error } = await sb.rpc("admin_part_template_upsert", {
        p_product_id: productId,
        p_template_name: templateName,
        p_template_key: templateKey,
        p_module_type: moduleType,
        p_part_payload: normalizedPartPayload,
        p_actor: authedUserId,
        p_template_id: templateId,
        p_source_section_template_version_id: readString(payload.source_section_template_version_id) || null,
      });

      if (error) {
        const message = String(error.message ?? "Part template save failed");
        return json(statusFromRpcMessage(message), { error: message, details: error });
      }

      return json(200, data ?? {});
    }

    if (req.method === "POST" && url.pathname.endsWith("/rollback")) {
      const body = (await req.json()) as unknown;
      if (!isObject(body)) return json(400, { error: "Invalid JSON body" });

      const snapshotId = readString((body as any).snapshot_id);
      if (!snapshotId) return json(400, { error: "snapshot_id is required" });

      const { data, error } = await sb.rpc("admin_builder_rollback", {
        p_snapshot_id: snapshotId,
        p_actor: authedUserId,
      });

      if (error) {
        const message = String(error.message ?? "Rollback failed");
        return json(statusFromRpcMessage(message), { error: message, details: error });
      }

      return json(200, data ?? {});
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(500, { error: message });
  }
});
