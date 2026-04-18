import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

type Json = Record<string, unknown>;

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
};

type ExistingExperience = {
  id: string;
  version: number;
};

type ExistingTree = {
  experience: ExistingExperience | null;
  sectionIds: Set<string>;
  partIds: Set<string>;
  unitIds: Set<string>;
  sectionsByExternalId: Map<string, string>;
  partsByExternalId: Map<string, string>;
  unitsByExternalId: Map<string, string>;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null)) as T;
const uuid = (): string => crypto.randomUUID();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sanitizeName = (value: unknown): string => readString(value);
const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const asBoolean = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value.trim());

const toJsonObject = (value: unknown): Json => (isObject(value) ? cloneJson(value as Json) : {});

const resolveDisplayOrder = (preferred: unknown, fallbackOrder: unknown, indexFallback: number): number => {
  const preferredNumber = asNumber(preferred);
  if (preferredNumber != null) return Math.floor(preferredNumber);
  const fallbackNumber = asNumber(fallbackOrder);
  if (fallbackNumber != null) return Math.floor(fallbackNumber);
  return indexFallback;
};

const normalizeExternalId = (value: unknown): string | null => {
  const clean = readString(value);
  if (!clean || isUuid(clean)) return null;
  return clean;
};

const readMetadataExternalId = (metadata: Json): string | null => normalizeExternalId((metadata as Record<string, unknown>).external_id);

const withExternalId = (metadata: Json, externalId: string | null): Json => {
  if (!externalId || readMetadataExternalId(metadata)) return metadata;
  return { ...metadata, external_id: externalId };
};

const normalizeAnswerKey = (raw: unknown): { correct: Json; metadata: Json } | null => {
  if (!isObject(raw)) return null;

  const metadata = toJsonObject((raw as Record<string, unknown>).metadata);
  if (isObject((raw as Record<string, unknown>).correct)) {
    return { correct: cloneJson((raw as Record<string, unknown>).correct as Json), metadata };
  }

  const fallback: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "metadata" || key === "correct") continue;
    fallback[key] = value;
  }
  if (Object.keys(fallback).length === 0) return null;
  return { correct: cloneJson(fallback as Json), metadata };
};

const validateUniqueOrder = (label: string, orders: number[]): string | null => {
  const seen = new Set<number>();
  for (const order of orders) {
    if (seen.has(order)) return `${label}: duplicate display_order ${order}`;
    seen.add(order);
  }
  return null;
};

const statusFromMessage = (message: string): number => {
  const normalized = message.toLowerCase();
  if (message.includes("Version conflict")) return 409;
  if (message.includes("Publish gate")) return 422;
  if (normalized.includes("method not allowed")) return 405;
  if (
    normalized.includes("required") ||
    normalized.includes("invalid") ||
    normalized.includes("duplicate display_order") ||
    normalized.includes("non-empty array") ||
    normalized.includes("must be") ||
    normalized.includes("not found") ||
    normalized.includes("invalid input syntax for type uuid")
  ) {
    return 400;
  }
  return 500;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const resolveProductId = async (sb: any, productRef: string): Promise<string | null> => {
  const { data: productById } = await sb.from("products").select("id").eq("id", productRef).maybeSingle();
  if (productById?.id) return String(productById.id);

  const { data: productBySlug } = await sb
    .from("products")
    .select("id")
    .filter("metadata->>slug", "eq", productRef)
    .maybeSingle();
  if (productBySlug?.id) return String(productBySlug.id);

  const { data: productByName } = await sb.from("products").select("id").ilike("name", productRef).maybeSingle();
  if (productByName?.id) return String(productByName.id);

  return null;
};

const findExistingExperience = async (
  sb: any,
  productId: string,
  explicitId: string,
  metadata: Json,
): Promise<ExistingExperience | null> => {
  if (isUuid(explicitId)) {
    const { data } = await sb.from("experiences").select("id, version").eq("id", explicitId).eq("product_id", productId).maybeSingle();
    if (data?.id) return { id: String(data.id), version: Number((data as Record<string, unknown>).version ?? 1) };
    return null;
  }

  const externalId = normalizeExternalId(explicitId) ?? readMetadataExternalId(metadata);
  if (!externalId) return null;

  const { data } = await sb
    .from("experiences")
    .select("id, version")
    .eq("product_id", productId)
    .filter("metadata->>external_id", "eq", externalId)
    .maybeSingle();

  if (!data?.id) return null;
  return { id: String(data.id), version: Number((data as Record<string, unknown>).version ?? 1) };
};

const loadExistingTree = async (sb: any, experience: ExistingExperience | null): Promise<ExistingTree> => {
  const tree: ExistingTree = {
    experience,
    sectionIds: new Set<string>(),
    partIds: new Set<string>(),
    unitIds: new Set<string>(),
    sectionsByExternalId: new Map<string, string>(),
    partsByExternalId: new Map<string, string>(),
    unitsByExternalId: new Map<string, string>(),
  };

  if (!experience) return tree;

  const { data: sections, error: sectionsError } = await sb
    .from("sections")
    .select("id, metadata")
    .eq("experience_id", experience.id);
  if (sectionsError) throw sectionsError;

  const sectionIds = (sections ?? []).map((row: any) => String(row.id ?? "")).filter(Boolean);
  for (const row of sections ?? []) {
    const id = String((row as any).id ?? "");
    if (!id) continue;
    tree.sectionIds.add(id);
    const externalId = readMetadataExternalId(toJsonObject((row as any).metadata));
    if (externalId && !tree.sectionsByExternalId.has(externalId)) {
      tree.sectionsByExternalId.set(externalId, id);
    }
  }

  const { data: parts, error: partsError } =
    sectionIds.length > 0
      ? await sb.from("parts").select("id, metadata").in("section_id", sectionIds)
      : { data: [], error: null };
  if (partsError) throw partsError;

  const partIds = (parts ?? []).map((row: any) => String(row.id ?? "")).filter(Boolean);
  for (const row of parts ?? []) {
    const id = String((row as any).id ?? "");
    if (!id) continue;
    tree.partIds.add(id);
    const externalId = readMetadataExternalId(toJsonObject((row as any).metadata));
    if (externalId && !tree.partsByExternalId.has(externalId)) {
      tree.partsByExternalId.set(externalId, id);
    }
  }

  const { data: units, error: unitsError } =
    partIds.length > 0
      ? await sb.from("content_units").select("id, metadata").in("part_id", partIds)
      : { data: [], error: null };
  if (unitsError) throw unitsError;

  for (const row of units ?? []) {
    const id = String((row as any).id ?? "");
    if (!id) continue;
    tree.unitIds.add(id);
    const externalId = readMetadataExternalId(toJsonObject((row as any).metadata));
    if (externalId && !tree.unitsByExternalId.has(externalId)) {
      tree.unitsByExternalId.set(externalId, id);
    }
  }

  return tree;
};

const resolveNestedId = (explicitId: string, metadata: Json, existingIdsByExternalId: Map<string, string>): { id: string; externalId: string | null } => {
  if (isUuid(explicitId)) return { id: explicitId, externalId: null };

  const externalId = normalizeExternalId(explicitId) ?? readMetadataExternalId(metadata);
  if (externalId) {
    return { id: existingIdsByExternalId.get(externalId) ?? uuid(), externalId };
  }

  return { id: uuid(), externalId: null };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const url = new URL(req.url);
    const dryRun = String(url.searchParams.get("dry_run") ?? "").toLowerCase() === "true";

    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.builder.manage",
      action: "admin.builder.import",
    });
    if (!authz.ok) return authz.response;
    const authedUserId = authz.context.userId;

    const body = (await req.json()) as unknown;
    if (!isObject(body)) return json(400, { error: "Invalid JSON body" });

    const payload = body as ImportPayload;
    const root = payload as Record<string, unknown>;
    const expInputRaw = isObject(root.experience) ? (root.experience as Record<string, unknown>) : null;
    if (!expInputRaw) return json(400, { error: "experience is required" });

    const productRef = sanitizeName(root.product_id ?? expInputRaw.product_id);
    if (!productRef) return json(400, { error: "product_id is required" });

    const resolvedProductId = await resolveProductId(sb, productRef);
    if (!resolvedProductId) return json(400, { error: "Invalid product_id (product not found)" });

    const expName = sanitizeName(expInputRaw.name ?? expInputRaw.title);
    if (!expName) return json(400, { error: "experience.name is required" });

    const sectionsInput = asArray<Record<string, unknown>>(root.sections).length > 0
      ? asArray<Record<string, unknown>>(root.sections)
      : asArray<Record<string, unknown>>(expInputRaw.sections);
    if (sectionsInput.length === 0) return json(400, { error: "sections must be a non-empty array" });

    const experienceMetadataBase = toJsonObject(expInputRaw.metadata);
    const explicitExperienceId = readString(expInputRaw.id);
    const existingExperience = await findExistingExperience(sb, resolvedProductId, explicitExperienceId, experienceMetadataBase);
    const existingTree = await loadExistingTree(sb, existingExperience);

    const experienceExternalId = normalizeExternalId(explicitExperienceId) ?? readMetadataExternalId(experienceMetadataBase);
    const experienceId = isUuid(explicitExperienceId) ? explicitExperienceId : existingExperience?.id ?? uuid();
    const experienceVersionInput = asNumber(expInputRaw.version);
    const experienceVersion = existingExperience?.version ?? (experienceVersionInput != null ? Math.max(1, Math.floor(experienceVersionInput)) : undefined);
    const experienceIsActive = asBoolean(expInputRaw.is_active) ?? asBoolean(expInputRaw.active) ?? true;
    const experiencePriceAmount = expInputRaw.price_amount === null ? null : asNumber(expInputRaw.price_amount);
    const experiencePriceCurrency = readString(expInputRaw.price_currency).toUpperCase() || null;
    const experienceMetadata = withExternalId(experienceMetadataBase, experienceExternalId);

    const normalized: ImportPayload = {
      product_id: resolvedProductId,
      experience: {
        id: experienceId,
        name: expName,
        display_order: resolveDisplayOrder(expInputRaw.display_order, expInputRaw.order, 0),
        is_active: experienceIsActive,
        metadata: experienceMetadata,
      },
      sections: [],
    };
    if (experienceVersion != null) normalized.experience.version = experienceVersion;
    if (experiencePriceAmount != null) normalized.experience.price_amount = experiencePriceAmount;
    if (experiencePriceCurrency) normalized.experience.price_currency = experiencePriceCurrency;

    const payloadSectionIds = new Set<string>();
    const payloadPartIds = new Set<string>();
    const payloadUnitIds = new Set<string>();
    const answerKeyUnitIds: string[] = [];

    const sectionOrders: number[] = [];
    let partCount = 0;
    let unitCount = 0;
    let answerKeyCount = 0;

    sectionsInput.forEach((sectionInput, sectionIndex) => {
      if (!isObject(sectionInput)) throw new Error(`sections[${sectionIndex}] must be an object`);

      const sectionName = sanitizeName(sectionInput.name ?? sectionInput.title);
      if (!sectionName) throw new Error(`sections[${sectionIndex}].name is required`);

      const sectionMetadataBase = toJsonObject(sectionInput.metadata);
      const sectionResolved = resolveNestedId(readString(sectionInput.id), sectionMetadataBase, existingTree.sectionsByExternalId);
      const sectionMetadata = withExternalId(sectionMetadataBase, sectionResolved.externalId);
      const sectionDisplayOrder = resolveDisplayOrder(sectionInput.display_order, sectionInput.order, sectionIndex + 1);
      sectionOrders.push(sectionDisplayOrder);
      payloadSectionIds.add(sectionResolved.id);

      const normalizedSection = {
        id: sectionResolved.id,
        name: sectionName,
        display_order: sectionDisplayOrder,
        metadata: sectionMetadata,
        parts: [] as ImportPayload["sections"][number]["parts"],
      };

      const partsInput = asArray<Record<string, unknown>>(sectionInput.parts);
      if (partsInput.length === 0) throw new Error(`sections[${sectionIndex}].parts must be a non-empty array`);

      const partOrders: number[] = [];

      partsInput.forEach((partInput, partIndex) => {
        if (!isObject(partInput)) throw new Error(`sections[${sectionIndex}].parts[${partIndex}] must be an object`);

        const partName = sanitizeName(partInput.name ?? partInput.title);
        if (!partName) throw new Error(`sections[${sectionIndex}].parts[${partIndex}].name is required`);

        const partMetadataBase = toJsonObject(partInput.metadata);
        const partResolved = resolveNestedId(readString(partInput.id), partMetadataBase, existingTree.partsByExternalId);
        const partMetadata = withExternalId(partMetadataBase, partResolved.externalId);
        const partDisplayOrder = resolveDisplayOrder(partInput.display_order, partInput.order, partIndex + 1);
        partOrders.push(partDisplayOrder);
        payloadPartIds.add(partResolved.id);
        partCount += 1;

        const normalizedPart = {
          id: partResolved.id,
          name: partName,
          display_order: partDisplayOrder,
          metadata: partMetadata,
          content_units: [] as ImportPayload["sections"][number]["parts"][number]["content_units"],
        };

        const unitsInput = asArray<Record<string, unknown>>(partInput.content_units).length > 0
          ? asArray<Record<string, unknown>>(partInput.content_units)
          : asArray<Record<string, unknown>>(partInput.units);
        if (unitsInput.length === 0) {
          throw new Error(`sections[${sectionIndex}].parts[${partIndex}].content_units must be a non-empty array`);
        }

        const unitOrders: number[] = [];

        unitsInput.forEach((unitInput, unitIndex) => {
          if (!isObject(unitInput)) throw new Error(`content_units[${unitIndex}] must be an object`);

          const type = sanitizeName(unitInput.type);
          if (!type) throw new Error(`content_units[${unitIndex}].type is required`);
          if (!isObject(unitInput.data)) throw new Error(`content_units[${unitIndex}].data must be an object`);

          const unitMetadataBase = toJsonObject(unitInput.metadata);
          const unitResolved = resolveNestedId(readString(unitInput.id), unitMetadataBase, existingTree.unitsByExternalId);
          const unitMetadata = withExternalId(unitMetadataBase, unitResolved.externalId);
          const unitDisplayOrder = resolveDisplayOrder(unitInput.display_order, unitInput.order, unitIndex + 1);
          unitOrders.push(unitDisplayOrder);
          payloadUnitIds.add(unitResolved.id);
          unitCount += 1;

          const unitData = cloneJson(unitInput.data as Json);
          if ((type === "question_single_choice" || type === "question_multi_choice") && Array.isArray((unitData as Record<string, unknown>).options)) {
            (unitData as Record<string, unknown>).options = ((unitData as Record<string, unknown>).options as unknown[]).map((option) =>
              isObject(option)
                ? { ...option, label: sanitizeName((option as Record<string, unknown>).label ?? (option as Record<string, unknown>).text) }
                : option
            );
          }

          const normalizedUnit: ImportPayload["sections"][number]["parts"][number]["content_units"][number] = {
            id: unitResolved.id,
            type,
            display_order: unitDisplayOrder,
            data: unitData,
            metadata: unitMetadata,
          };

          if (isObject(unitInput.answer_key)) {
            const answerKey = normalizeAnswerKey(unitInput.answer_key);
            if (!answerKey) throw new Error(`content_units[${unitIndex}].answer_key must be an object`);
            normalizedUnit.answer_key = {
              correct: answerKey.correct,
              metadata: answerKey.metadata,
            };
            answerKeyUnitIds.push(unitResolved.id);
            answerKeyCount += 1;
          }

          normalizedPart.content_units.push(normalizedUnit);
        });

        const unitOrderError = validateUniqueOrder(`section[${sectionIndex}].part[${partIndex}].content_units`, unitOrders);
        if (unitOrderError) throw new Error(unitOrderError);

        normalizedSection.parts.push(normalizedPart);
      });

      const partOrderError = validateUniqueOrder(`section[${sectionIndex}].parts`, partOrders);
      if (partOrderError) throw new Error(partOrderError);

      normalized.sections.push(normalizedSection);
    });

    const sectionOrderError = validateUniqueOrder("sections", sectionOrders);
    if (sectionOrderError) return json(400, { error: sectionOrderError });

    const deletedSectionIds = Array.from(existingTree.sectionIds).filter((id) => !payloadSectionIds.has(id));
    const deletedPartIds = Array.from(existingTree.partIds).filter((id) => !payloadPartIds.has(id));
    const deletedUnitIds = Array.from(existingTree.unitIds).filter((id) => !payloadUnitIds.has(id));
    const staleCounts = {
      sections: deletedSectionIds.length,
      parts: deletedPartIds.length,
      content_units: deletedUnitIds.length,
    };

    const counts = {
      sections: normalized.sections.length,
      parts: partCount,
      content_units: unitCount,
      answer_keys: answerKeyCount,
    };

    if (dryRun) {
      return json(200, {
        experience_id: experienceId,
        dry_run: true,
        version: experienceVersion ?? null,
        counts,
        stale_counts: staleCounts,
        normalized,
      });
    }

    const savePayload = cloneJson(normalized) as Record<string, unknown>;
    if (answerKeyUnitIds.length > 0) {
      savePayload.answer_key_unit_ids = answerKeyUnitIds;
    }

    const deleted: Record<string, string[]> = {};
    if (deletedSectionIds.length > 0) deleted.section_ids = deletedSectionIds;
    if (deletedPartIds.length > 0) deleted.part_ids = deletedPartIds;
    if (deletedUnitIds.length > 0) deleted.unit_ids = deletedUnitIds;
    if (Object.keys(deleted).length > 0) savePayload.deleted = deleted;

    const { data: saveData, error: saveError } = await sb.rpc("admin_builder_save", {
      p_payload: savePayload,
      p_actor: authedUserId,
      p_action: "import",
    });

    if (saveError) {
      const message = String(saveError.message ?? "Import failed");
      return json(statusFromMessage(message), { error: message, details: saveError });
    }

    const saveResult = (saveData ?? {}) as Record<string, unknown>;
    const savedExperienceId = readString(saveResult.experience_id) || experienceId;
    const savedVersion = Number(saveResult.version ?? NaN);
    if (Number.isFinite(savedVersion)) {
      normalized.experience.version = Math.floor(savedVersion);
    }

    let syncErrorMessage: string | null = null;
    let syncedCount = 0;
    const syncResult = await sb.rpc("admin_builder_sync_section_instances", {
      p_experience_id: savedExperienceId,
      p_sections: normalized.sections,
      p_actor: authedUserId,
    });
    if (syncResult.error) {
      syncErrorMessage = String(syncResult.error.message ?? "Failed to sync section instances");
    } else {
      syncedCount = Number(syncResult.data ?? 0);
    }

    return json(200, {
      experience_id: savedExperienceId,
      version: Number.isFinite(savedVersion) ? Math.floor(savedVersion) : null,
      snapshot_id: readString(saveResult.snapshot_id) || null,
      counts: (saveResult.counts as Record<string, unknown> | null) ?? counts,
      stale_counts: staleCounts,
      normalized,
      section_instances_synced: !syncErrorMessage,
      section_instances_count: syncedCount,
      section_instances_error: syncErrorMessage,
    });
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
    return json(statusFromMessage(message), { error: message });
  }
});
