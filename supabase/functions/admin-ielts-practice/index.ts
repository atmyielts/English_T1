import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";
import {
  cloneBlueprintToDeliveryExperience,
  listSimulatorSourceSections,
  loadBlueprintsWithBuilds,
  normalizePracticeExperienceKind,
  PRACTICE_EXPERIENCE_KINDS,
} from "../_shared/ielts-practice-blueprints.ts";

type JsonRecord = Record<string, unknown>;

type Scope = {
  practiceProductId: string;
  simulatorProductId: string;
  languageId: string;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

const PRACTICE_PRODUCT_SLUG = "ielts-practice";
const SIMULATOR_PRODUCT_SLUG = "ielts-academic-simulator";
const SIMULATOR_PRODUCT_ID_FALLBACK = "ead05eae-aa97-4bda-a07c-51e5dbb062c0";

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const toText = (value: unknown, maxLen = 320): string => String(value ?? "").trim().slice(0, maxLen);
const toNullableText = (value: unknown, maxLen = 320): string | null => {
  const text = toText(value, maxLen);
  return text.length > 0 ? text : null;
};
const toNumber = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const isObject = (value: unknown): value is JsonRecord => !!value && typeof value === "object" && !Array.isArray(value);

const parseBody = async (req: Request): Promise<JsonRecord> => {
  try {
    const parsed = await req.json();
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const extractRoute = (url: URL): string => {
  const marker = "/admin-ielts-practice";
  const idx = url.pathname.indexOf(marker);
  if (idx < 0) return "";
  const tail = url.pathname.slice(idx + marker.length);
  return tail.startsWith("/") ? tail : tail ? `/${tail}` : "";
};

const resolveProductIdBySlug = async (sb: any, slug: string): Promise<string | null> => {
  const { data, error } = await sb
    .from("products")
    .select("id")
    .eq("metadata->>slug", slug)
    .maybeSingle();
  if (error) return null;
  return data?.id ? String((data as any).id) : null;
};

const resolveScope = async (sb: any): Promise<Scope> => {
  const practiceProductId = (await resolveProductIdBySlug(sb, PRACTICE_PRODUCT_SLUG))
    ?? "a74195fd-b4f3-4fd4-93bf-c807e42250c6";
  const simulatorProductId = (await resolveProductIdBySlug(sb, SIMULATOR_PRODUCT_SLUG))
    ?? SIMULATOR_PRODUCT_ID_FALLBACK;

  const { data: languageRow } = await sb.from("languages").select("id").eq("code", "en").maybeSingle();
  if (!languageRow?.id) throw new Error("English language row not found");

  return {
    practiceProductId,
    simulatorProductId,
    languageId: String((languageRow as any).id),
  };
};

const questionTypeFromUnit = (unit: any): string => {
  const fromMeta = toText(unit?.metadata?.question_type, 120).toLowerCase();
  if (fromMeta) return fromMeta;
  const fromData = toText(unit?.data?.question_type ?? unit?.data?.questionType, 120).toLowerCase();
  if (fromData) return fromData;
  const fromType = toText(unit?.type, 120).toLowerCase();
  return fromType || "question_unknown";
};

const toSectionType = (value: unknown): "reading" | "listening" | "writing" | null => {
  const text = toText(isObject(value) ? (value as JsonRecord).type : value, 32).toLowerCase();
  if (text === "reading" || text === "listening" || text === "writing") return text;
  return null;
};

const listSources = async (sb: any, scope: Scope, url: URL): Promise<Response> => {
  const rows = await listSimulatorSourceSections(sb, scope, {
    experienceId: toNullableText(url.searchParams.get("experience_id"), 80),
    sectionType: toNullableText(url.searchParams.get("section_type"), 32),
    limit: toNumber(url.searchParams.get("limit")),
  });
  return json(200, { sources: rows });
};

const listBlueprints = async (sb: any, scope: Scope, url: URL): Promise<Response> => {
  const rows = await loadBlueprintsWithBuilds(sb, scope, {
    status: toNullableText(url.searchParams.get("status"), 32),
    includeDraftBuilds: true,
  });
  return json(200, { blueprints: rows });
};

const createBlueprint = async (sb: any, scope: Scope, body: JsonRecord, adminUserId: string): Promise<Response> => {
  const sourceSectionId = toNullableText(body.source_section_id, 80);
  if (!sourceSectionId) return json(422, { error: "source_section_id is required" });

  const { data: sourceSection, error: sectionError } = await sb
    .from("sections")
    .select("id,experience_id,name,metadata")
    .eq("id", sourceSectionId)
    .maybeSingle();
  if (sectionError) return json(500, { error: "Failed to load source section", details: sectionError });
  if (!sourceSection) return json(404, { error: "Source section not found" });

  const sectionType = toSectionType((sourceSection as any).metadata);
  if (!sectionType) return json(422, { error: "Source section must be reading, listening, or writing" });

  const { data: sourceExperience } = await sb
    .from("experiences")
    .select("id,name")
    .eq("id", String((sourceSection as any).experience_id))
    .maybeSingle();

  const status = toText(body.status, 32).toLowerCase();
  const experienceKind = normalizePracticeExperienceKind(body.experience_kind ?? (isObject(body.metadata) ? body.metadata.experience_kind : null));
  const title = toText(body.title, 240)
    || `${toText((sourceExperience as any)?.name, 160) || "Simulator"} · ${toText((sourceSection as any).name, 160) || "Section"}`;

  const row = {
    product_id: scope.practiceProductId,
    language_id: scope.languageId,
    title,
    section_type: sectionType,
    source_product_id: scope.simulatorProductId,
    source_experience_id: String((sourceSection as any).experience_id),
    source_section_id: String((sourceSection as any).id),
    target_question_types: Array.isArray(body.target_question_types)
      ? body.target_question_types.map((entry) => toText(entry, 120)).filter(Boolean)
      : [],
    estimated_minutes: Math.max(5, Math.min(120, Math.floor(toNumber(body.estimated_minutes) ?? 25))),
    status: ["draft", "published", "archived"].includes(status) ? status : "draft",
    experience_kind: experienceKind,
    metadata: {
      ...(isObject(body.metadata) ? body.metadata : {}),
      experience_kind: experienceKind,
    },
    created_by: adminUserId,
    updated_by: adminUserId,
  };

  const { data, error } = await sb
    .from("ielts_practice_blueprints")
    .insert(row)
    .select("id,title,section_type,source_product_id,source_experience_id,source_section_id,target_question_types,estimated_minutes,status,experience_kind,metadata,latest_delivery_build_id")
    .maybeSingle();
  if (error || !data) return json(500, { error: "Failed to create blueprint", details: error });
  return json(200, { blueprint: data });
};

const patchBlueprint = async (sb: any, scope: Scope, body: JsonRecord, adminUserId: string): Promise<Response> => {
  const id = toNullableText(body.id, 80);
  const patch = isObject(body.patch) ? body.patch : {};
  if (!id) return json(422, { error: "id is required" });

  const update: JsonRecord = { updated_by: adminUserId };
  if (typeof patch.title === "string") update.title = toText(patch.title, 240);
  if (Array.isArray(patch.target_question_types)) {
    update.target_question_types = patch.target_question_types.map((entry) => toText(entry, 120)).filter(Boolean);
  }
  if (patch.estimated_minutes != null) {
    update.estimated_minutes = Math.max(5, Math.min(120, Math.floor(toNumber(patch.estimated_minutes) ?? 25)));
  }
  if (typeof patch.status === "string") {
    const status = toText(patch.status, 32).toLowerCase();
    if (["draft", "published", "archived"].includes(status)) update.status = status;
  }
  if (patch.experience_kind != null) update.experience_kind = normalizePracticeExperienceKind(patch.experience_kind);
  if (patch.metadata != null && isObject(patch.metadata)) update.metadata = patch.metadata;

  if (typeof patch.source_section_id === "string" && patch.source_section_id.trim()) {
    const { data: sourceSection } = await sb
      .from("sections")
      .select("id,experience_id,metadata")
      .eq("id", toText(patch.source_section_id, 80))
      .maybeSingle();
    if (!sourceSection) return json(404, { error: "New source section not found" });
    const sectionType = toSectionType((sourceSection as any).metadata);
    if (!sectionType) return json(422, { error: "New source section must be reading, listening, or writing" });
    update.section_type = sectionType;
    update.source_section_id = String((sourceSection as any).id);
    update.source_experience_id = String((sourceSection as any).experience_id);
    update.source_product_id = scope.simulatorProductId;
  }

  const { data, error } = await sb
    .from("ielts_practice_blueprints")
    .update(update)
    .eq("id", id)
    .select("id,title,section_type,source_product_id,source_experience_id,source_section_id,target_question_types,estimated_minutes,status,experience_kind,metadata,latest_delivery_build_id")
    .maybeSingle();
  if (error || !data) return json(500, { error: "Failed to update blueprint", details: error });
  return json(200, { blueprint: data });
};

const buildBlueprint = async (sb: any, scope: Scope, body: JsonRecord, adminUserId: string): Promise<Response> => {
  const blueprintId = toNullableText(body.blueprint_id, 80);
  if (!blueprintId) return json(422, { error: "blueprint_id is required" });

  const { data: blueprintData, error: blueprintError } = await sb
    .from("ielts_practice_blueprints")
    .select("id,title,section_type,source_product_id,source_experience_id,source_section_id,target_question_types,estimated_minutes,status,experience_kind,metadata,latest_delivery_build_id")
    .eq("id", blueprintId)
    .eq("product_id", scope.practiceProductId)
    .eq("language_id", scope.languageId)
    .maybeSingle();
  if (blueprintError) return json(500, { error: "Failed to load blueprint", details: blueprintError });
  if (!blueprintData) return json(404, { error: "Blueprint not found" });

  try {
    const build = await cloneBlueprintToDeliveryExperience(sb, scope, blueprintData as any, adminUserId, {
      publish: body.publish === true,
    });
    return json(200, { ok: true, build });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : "Blueprint build failed" });
  }
};

const listBuilds = async (sb: any, scope: Scope, url: URL): Promise<Response> => {
  const status = toText(url.searchParams.get("status"), 32).toLowerCase();
  let query = sb
    .from("ielts_practice_delivery_builds")
    .select("id,blueprint_id,delivery_experience_id,status,experience_kind,build_version,build_summary,validation_summary,metadata,created_at,updated_at")
    .eq("product_id", scope.practiceProductId)
    .eq("language_id", scope.languageId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return json(500, { error: "Failed to load builds", details: error });

  const blueprintIds = Array.from(new Set((Array.isArray(data) ? data : []).map((row: any) => String(row.blueprint_id ?? "")).filter(Boolean)));
  const { data: blueprintRows } = await sb
    .from("ielts_practice_blueprints")
    .select("id,title,section_type")
    .in("id", blueprintIds.length > 0 ? blueprintIds : ["00000000-0000-0000-0000-000000000000"]);
  const blueprintById = new Map<string, any>();
  for (const row of Array.isArray(blueprintRows) ? blueprintRows : []) blueprintById.set(String((row as any).id), row);

  return json(200, {
    builds: (Array.isArray(data) ? data : []).map((row: any) => ({
      ...row,
      blueprint: blueprintById.get(String(row.blueprint_id ?? "")) ?? null,
    })),
  });
};

const factoryTitle = (
  source: { experience_name: string; section_name: string; section_type: string },
  kind: string,
  questionType?: string | null,
): string => {
  const kindLabel = kind.replace(/_/g, " ").replace(/\b\w/g, (token) => token.toUpperCase());
  const focus = questionType ? ` | ${questionType.replace(/^question_/, "").replace(/_/g, " ")}` : "";
  return `${kindLabel} | ${source.section_type} | ${source.section_name}${focus}`;
};

const factoryEstimateMinutes = (sectionType: string, kind: string): number => {
  if (sectionType === "writing") return kind === "strategy" ? 12 : kind === "timed_mini" ? 40 : 25;
  if (kind === "strategy") return 10;
  if (kind === "repair_drill") return 15;
  if (kind === "timed_mini") return 25;
  if (kind === "mastery_check") return 18;
  return 20;
};

const contentFactoryBuild = async (sb: any, scope: Scope, body: JsonRecord, adminUserId: string): Promise<Response> => {
  const publish = body.publish !== false;
  const sectionTypeFilter = toNullableText(body.section_type, 32);
  const limit = clamp(Math.floor(toNumber(body.limit) ?? 60), 1, 300);
  const sources = await listSimulatorSourceSections(sb, scope, {
    sectionType: sectionTypeFilter,
    limit,
  });

  const selectedSources = sources.filter((source) => source.question_count > 0);
  const results: Array<JsonRecord> = [];
  let created = 0;
  let reused = 0;
  let built = 0;
  let failed = 0;

  for (const source of selectedSources) {
    const baseKinds = source.section_type === "writing"
      ? ["strategy", "writing_rewrite", "guided_set", "timed_mini", "mastery_check"]
      : ["strategy", "repair_drill", "guided_set", "timed_mini", "mastery_check"];

    for (const kindRaw of baseKinds) {
      const kind = normalizePracticeExperienceKind(kindRaw);
      const qtypeGroups = kind === "repair_drill" && source.question_types.length > 0
        ? source.question_types.map((questionType) => [questionType])
        : [source.question_types];

      for (const questionTypes of qtypeGroups) {
        const focusKey = questionTypes.length === 1 ? questionTypes[0] : "mixed";
        const factoryKey = [
          "ielts-practice-v2",
          source.section_id,
          kind,
          focusKey,
        ].join(":");

        try {
          const { data: existing } = await sb
            .from("ielts_practice_blueprints")
            .select("id,title,section_type,source_product_id,source_experience_id,source_section_id,target_question_types,estimated_minutes,status,experience_kind,metadata,latest_delivery_build_id")
            .eq("product_id", scope.practiceProductId)
            .eq("language_id", scope.languageId)
            .eq("metadata->>factory_key", factoryKey)
            .maybeSingle();

          let blueprint = existing as JsonRecord | null;
          const row = {
            product_id: scope.practiceProductId,
            language_id: scope.languageId,
            title: factoryTitle(source, kind, questionTypes.length === 1 ? questionTypes[0] : null),
            section_type: source.section_type,
            source_product_id: scope.simulatorProductId,
            source_experience_id: source.experience_id,
            source_section_id: source.section_id,
            target_question_types: questionTypes,
            estimated_minutes: factoryEstimateMinutes(source.section_type, kind),
            status: "draft",
            experience_kind: kind,
            metadata: {
              factory_key: factoryKey,
              factory_source: "content_factory_v2",
              experience_kind: kind,
              source_question_count: source.question_count,
              source_question_types: source.question_types,
              source_has_audio: source.has_audio,
              source_has_passage: source.has_passage,
              source_has_image: source.has_image,
            },
            updated_by: adminUserId,
          };

          if (blueprint?.id) {
            reused += 1;
            const { data: updated, error: updateError } = await sb
              .from("ielts_practice_blueprints")
              .update(row)
              .eq("id", String(blueprint.id))
              .select("id,title,section_type,source_product_id,source_experience_id,source_section_id,target_question_types,estimated_minutes,status,experience_kind,metadata,latest_delivery_build_id")
              .maybeSingle();
            if (updateError || !updated) throw new Error("Failed to update factory blueprint");
            blueprint = updated as JsonRecord;
          } else {
            created += 1;
            const { data: inserted, error: insertError } = await sb
              .from("ielts_practice_blueprints")
              .insert({ ...row, created_by: adminUserId })
              .select("id,title,section_type,source_product_id,source_experience_id,source_section_id,target_question_types,estimated_minutes,status,experience_kind,metadata,latest_delivery_build_id")
              .maybeSingle();
            if (insertError || !inserted) throw new Error("Failed to create factory blueprint");
            blueprint = inserted as JsonRecord;
          }

          const build = await cloneBlueprintToDeliveryExperience(sb, scope, blueprint as any, adminUserId, { publish });
          built += 1;
          results.push({
            factory_key: factoryKey,
            blueprint_id: blueprint.id,
            build_id: build.id,
            status: build.status,
            section_type: source.section_type,
            experience_kind: kind,
            question_types: questionTypes,
          });
        } catch (err) {
          failed += 1;
          results.push({
            factory_key: factoryKey,
            section_type: source.section_type,
            experience_kind: kind,
            question_types: questionTypes,
            error: err instanceof Error ? err.message : "Factory build failed",
          });
        }
      }
    }
  }

  const coverage = {
    sources_considered: sources.length,
    sources_with_questions: selectedSources.length,
    sections: {
      reading: selectedSources.filter((source) => source.section_type === "reading").length,
      listening: selectedSources.filter((source) => source.section_type === "listening").length,
      writing: selectedSources.filter((source) => source.section_type === "writing").length,
    },
    required_experience_kinds: PRACTICE_EXPERIENCE_KINDS,
  };

  return json(200, {
    ok: failed === 0,
    publish,
    created,
    reused,
    built,
    failed,
    coverage,
    results: results.slice(0, 500),
  });
};

const listExercises = async (sb: any, scope: Scope, url: URL): Promise<Response> => {
  const status = toText(url.searchParams.get("status"), 32).toLowerCase();
  const sectionType = toText(url.searchParams.get("section_type"), 32).toLowerCase();
  const query = toText(url.searchParams.get("q"), 120).toLowerCase();
  const limit = clamp(Math.floor(toNumber(url.searchParams.get("limit")) ?? 200), 1, 1000);

  let q = sb
    .from("ielts_practice_exercises")
    .select("id,title,section_type,question_type,skill_tags,difficulty_band_min,difficulty_band_max,estimated_minutes,payload_json,status,metadata,source_experience_id,source_content_unit_id,created_at,updated_at")
    .eq("product_id", scope.practiceProductId)
    .eq("language_id", scope.languageId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) q = q.eq("status", status);
  if (sectionType) q = q.eq("section_type", sectionType);
  if (query) q = q.or(`title.ilike.%${query}%,question_type.ilike.%${query}%`);

  const { data, error } = await q;
  if (error) return json(500, { error: "Failed to load exercises", details: error });
  return json(200, { exercises: data ?? [] });
};

const createExercise = async (sb: any, scope: Scope, body: JsonRecord, adminUserId: string): Promise<Response> => {
  const title = toText(body.title, 240);
  const sectionType = toText(body.section_type, 32).toLowerCase();
  const questionType = toText(body.question_type, 120).toLowerCase();
  if (!title || !["reading", "listening", "writing"].includes(sectionType) || !questionType) {
    return json(422, { error: "title, section_type(reading/listening/writing), and question_type are required" });
  }

  const difficultyMin = clamp(toNumber(body.difficulty_band_min) ?? 4, 0, 9);
  const difficultyMax = clamp(toNumber(body.difficulty_band_max) ?? 9, 0, 9);
  const estimatedMinutes = clamp(Math.floor(toNumber(body.estimated_minutes) ?? 20), 1, 180);
  const status = toText(body.status, 32).toLowerCase() || "draft";

  const row = {
    product_id: scope.practiceProductId,
    language_id: scope.languageId,
    title,
    section_type: sectionType,
    question_type: questionType,
    skill_tags: Array.isArray(body.skill_tags) ? body.skill_tags.map((entry) => toText(entry, 80)).filter(Boolean) : [],
    difficulty_band_min: Math.min(difficultyMin, difficultyMax),
    difficulty_band_max: Math.max(difficultyMin, difficultyMax),
    estimated_minutes: estimatedMinutes,
    payload_json: isObject(body.payload_json) ? body.payload_json : {},
    source_product_id: toNullableText(body.source_product_id, 80),
    source_experience_id: toNullableText(body.source_experience_id, 80),
    source_content_unit_id: toNullableText(body.source_content_unit_id, 80),
    status: ["draft", "published", "archived"].includes(status) ? status : "draft",
    metadata: isObject(body.metadata) ? body.metadata : {},
    created_by: adminUserId,
    updated_by: adminUserId,
  };

  const { data, error } = await sb
    .from("ielts_practice_exercises")
    .insert(row)
    .select("id,title,section_type,question_type,status,created_at,updated_at")
    .maybeSingle();
  if (error || !data) return json(500, { error: "Failed to create exercise", details: error });
  return json(200, { exercise: data });
};

const patchExercise = async (sb: any, body: JsonRecord, adminUserId: string): Promise<Response> => {
  const id = toText(body.id, 80);
  const patch = isObject(body.patch) ? body.patch : {};
  if (!id) return json(422, { error: "id is required" });

  const update: JsonRecord = { updated_by: adminUserId };
  if (typeof patch.title === "string") update.title = toText(patch.title, 240);
  if (typeof patch.section_type === "string") {
    const value = toText(patch.section_type, 32).toLowerCase();
    if (["reading", "listening", "writing"].includes(value)) update.section_type = value;
  }
  if (typeof patch.question_type === "string") update.question_type = toText(patch.question_type, 120).toLowerCase();
  if (Array.isArray(patch.skill_tags)) update.skill_tags = patch.skill_tags.map((entry) => toText(entry, 80)).filter(Boolean);
  if (patch.payload_json != null && isObject(patch.payload_json)) update.payload_json = patch.payload_json;
  if (patch.metadata != null && isObject(patch.metadata)) update.metadata = patch.metadata;
  if (typeof patch.status === "string") {
    const value = toText(patch.status, 32).toLowerCase();
    if (["draft", "published", "archived"].includes(value)) update.status = value;
  }
  if (patch.difficulty_band_min != null) update.difficulty_band_min = clamp(toNumber(patch.difficulty_band_min) ?? 4, 0, 9);
  if (patch.difficulty_band_max != null) update.difficulty_band_max = clamp(toNumber(patch.difficulty_band_max) ?? 9, 0, 9);
  if (patch.estimated_minutes != null) update.estimated_minutes = clamp(Math.floor(toNumber(patch.estimated_minutes) ?? 20), 1, 180);

  const { data, error } = await sb
    .from("ielts_practice_exercises")
    .update(update)
    .eq("id", id)
    .select("id,title,section_type,question_type,status,updated_at")
    .maybeSingle();
  if (error || !data) return json(500, { error: "Failed to update exercise", details: error });
  return json(200, { exercise: data });
};

const importFromSimulator = async (sb: any, scope: Scope, body: JsonRecord, adminUserId: string): Promise<Response> => {
  const experienceId = toNullableText(body.experience_id, 80);
  const sectionFilter = toText(body.section_type, 32).toLowerCase();
  const publish = body.publish === true;
  const limit = clamp(Math.floor(toNumber(body.limit) ?? 200), 1, 2000);

  let experienceQuery = sb
    .from("experiences")
    .select("id,product_id,name")
    .eq("product_id", scope.simulatorProductId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (experienceId) experienceQuery = experienceQuery.eq("id", experienceId);
  const { data: experiences, error: expError } = await experienceQuery;
  if (expError) return json(500, { error: "Failed to load simulator experiences", details: expError });
  const experienceIds = Array.from(new Set((experiences ?? []).map((row: any) => String(row.id ?? "")).filter(Boolean)));
  if (experienceIds.length === 0) return json(404, { error: "No simulator experiences found for import scope" });

  let sectionsQuery = sb
    .from("sections")
    .select("id,experience_id,metadata")
    .in("experience_id", experienceIds);
  if (sectionFilter) sectionsQuery = sectionsQuery.eq("metadata->>type", sectionFilter);
  const { data: sections, error: secError } = await sectionsQuery;
  if (secError) return json(500, { error: "Failed to load sections", details: secError });

  const sectionById = new Map<string, any>();
  for (const row of sections ?? []) sectionById.set(String((row as any).id), row);
  const sectionIds = Array.from(sectionById.keys());
  if (sectionIds.length === 0) return json(404, { error: "No sections found for selected scope" });

  const { data: parts, error: partError } = await sb.from("parts").select("id,section_id").in("section_id", sectionIds);
  if (partError) return json(500, { error: "Failed to load parts", details: partError });
  const partToSection = new Map<string, string>();
  for (const row of parts ?? []) partToSection.set(String((row as any).id), String((row as any).section_id));

  const partIds = Array.from(partToSection.keys());
  if (partIds.length === 0) return json(404, { error: "No parts found for import scope" });

  const { data: units, error: unitError } = await sb
    .from("content_units")
    .select("id,part_id,type,data,metadata,display_order")
    .in("part_id", partIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unitError) return json(500, { error: "Failed to load content units", details: unitError });
  if (!units || units.length === 0) return json(404, { error: "No content units found for import scope" });

  const unitIds = units.map((row: any) => String(row.id));
  const { data: answerKeys } = await sb.from("answer_keys").select("content_unit_id,correct").in("content_unit_id", unitIds);
  const answerKeyByUnitId = new Map<string, any>();
  for (const row of answerKeys ?? []) answerKeyByUnitId.set(String((row as any).content_unit_id), (row as any).correct ?? {});

  const experienceById = new Map<string, any>();
  for (const row of experiences ?? []) experienceById.set(String((row as any).id), row);

  const rows = [];
  for (const unit of units) {
    const type = toText((unit as any).type, 120).toLowerCase();
    if (!type.startsWith("question_") && type !== "question_text") continue;
    const sectionId = partToSection.get(String((unit as any).part_id));
    if (!sectionId) continue;
    const section = sectionById.get(sectionId);
    const sectionType = toText((section as any)?.metadata?.type, 32).toLowerCase();
    if (!["reading", "listening", "writing"].includes(sectionType)) continue;
    if (sectionFilter && sectionType !== sectionFilter) continue;

    const experienceIdForUnit = String((section as any)?.experience_id ?? "");
    const sourceExperience = experienceById.get(experienceIdForUnit);
    const title =
      toText((unit as any)?.data?.title, 220)
      || toText((unit as any)?.data?.prompt, 220)
      || `${sectionType.toUpperCase()} ${type.replace("question_", "").replaceAll("_", " ")} ${String((unit as any)?.display_order ?? "")}`.trim();

    rows.push({
      product_id: scope.practiceProductId,
      language_id: scope.languageId,
      title,
      section_type: sectionType,
      question_type: questionTypeFromUnit(unit),
      skill_tags: [],
      difficulty_band_min: 4,
      difficulty_band_max: 9,
      estimated_minutes: sectionType === "writing" ? 35 : 20,
      payload_json: {
        source_unit_type: type,
        source_unit_data: (unit as any).data ?? {},
        answer_key: answerKeyByUnitId.get(String((unit as any).id)) ?? {},
      },
      source_product_id: scope.simulatorProductId,
      source_experience_id: sourceExperience?.id ?? experienceIdForUnit,
      source_content_unit_id: String((unit as any).id),
      status: publish ? "published" : "draft",
      metadata: { imported_from: "ielts-simulator", imported_by: adminUserId },
      created_by: adminUserId,
      updated_by: adminUserId,
    });
  }

  if (rows.length === 0) return json(422, { error: "No compatible question units found for import" });

  const { data, error } = await sb
    .from("ielts_practice_exercises")
    .upsert(rows, { onConflict: "product_id,source_content_unit_id" })
    .select("id,status,source_content_unit_id");
  if (error) return json(500, { error: "Failed to import exercises", details: error });

  return json(200, {
    ok: true,
    imported: (data ?? []).length,
    publish_mode: publish ? "published" : "draft",
  });
};

const listRules = async (sb: any, scope: Scope): Promise<Response> => {
  const { data, error } = await sb
    .from("ielts_practice_rules")
    .select("id,rule_key,rule_name,description,status,weight,config,metadata,updated_at")
    .eq("product_id", scope.practiceProductId)
    .eq("language_id", scope.languageId)
    .order("updated_at", { ascending: false });
  if (error) return json(500, { error: "Failed to load rules", details: error });
  return json(200, { rules: data ?? [] });
};

const patchRules = async (sb: any, scope: Scope, body: JsonRecord, adminUserId: string): Promise<Response> => {
  const updates = Array.isArray(body.rules) ? body.rules : [];
  if (updates.length === 0) return json(422, { error: "rules[] payload is required" });

  const rows = updates
    .map((entry) => (isObject(entry) ? entry : null))
    .filter((entry): entry is JsonRecord => Boolean(entry))
    .map((entry) => {
      const ruleKey = toText(entry.rule_key, 120).toLowerCase();
      return {
        language_id: scope.languageId,
        product_id: scope.practiceProductId,
        rule_key: ruleKey,
        rule_name: toText(entry.rule_name, 160) || ruleKey,
        description: toNullableText(entry.description, 1000),
        status: ["draft", "active", "disabled"].includes(toText(entry.status, 32).toLowerCase())
          ? toText(entry.status, 32).toLowerCase()
          : "active",
        weight: Math.max(0.01, toNumber(entry.weight) ?? 1),
        config: isObject(entry.config) ? entry.config : {},
        metadata: isObject(entry.metadata) ? entry.metadata : {},
        updated_by: adminUserId,
      };
    })
    .filter((row) => row.rule_key.length > 0);

  const { data, error } = await sb
    .from("ielts_practice_rules")
    .upsert(rows, { onConflict: "language_id,product_id,rule_key" })
    .select("id,rule_key,status,weight,updated_at");

  if (error) return json(500, { error: "Failed to update rules", details: error });
  return json(200, { ok: true, rules: data ?? [] });
};

const previewPlan = async (sb: any, scope: Scope, url: URL): Promise<Response> => {
  const userId = toText(url.searchParams.get("user_id"), 80);
  if (!userId) return json(422, { error: "user_id query param is required" });
  const count = clamp(Math.floor(toNumber(url.searchParams.get("count")) ?? 10), 3, 20);

  const [{ data: goalsData }, { data: diagnosticsData }, { data: exercisesData }] = await Promise.all([
    sb
      .from("ielts_practice_user_goals")
      .select("target_overall_band,target_section_bands")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .maybeSingle(),
    sb
      .from("ielts_practice_diagnostic_snapshots")
      .select("diagnostics")
      .eq("user_id", userId)
      .eq("language_id", scope.languageId)
      .eq("is_current", true)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("ielts_practice_exercises")
      .select("id,title,section_type,question_type,difficulty_band_min,difficulty_band_max,status")
      .eq("language_id", scope.languageId)
      .eq("product_id", scope.practiceProductId)
      .eq("status", "published")
      .limit(1000),
  ]);

  const diagnostics = isObject((diagnosticsData as any)?.diagnostics) ? ((diagnosticsData as any).diagnostics as JsonRecord) : {};
  const sectionMap = isObject(diagnostics.sections) ? (diagnostics.sections as JsonRecord) : {};
  const questionRows = Array.isArray(diagnostics.question_types) ? diagnostics.question_types : [];
  const targetBand = clamp(toNumber((goalsData as any)?.target_overall_band) ?? 6.5, 0, 9);

  const questionWeakness = new Map<string, number>();
  for (const row of questionRows) {
    if (!isObject(row)) continue;
    const section = toText(row.section_type, 32).toLowerCase();
    const question = toText(row.question_type, 120).toLowerCase();
    if (!section || !question) continue;
    questionWeakness.set(`${section}::${question}`, Math.max(0, toNumber(row.weakness_score) ?? 0));
  }

  const ranked = (Array.isArray(exercisesData) ? exercisesData : [])
    .map((exercise: any) => {
      const section = toText(exercise.section_type, 32).toLowerCase();
      const sectionGap = Math.max(0, toNumber((sectionMap[section] as any)?.band_gap) ?? 0);
      const question = toText(exercise.question_type, 120).toLowerCase();
      const weakness = questionWeakness.get(`${section}::${question}`) ?? 0;
      const difficultyCenter = ((toNumber(exercise.difficulty_band_min) ?? 4) + (toNumber(exercise.difficulty_band_max) ?? 9)) / 2;
      const difficultyFit = Math.max(0, 1 - Math.abs(difficultyCenter - targetBand) / 5);
      const score = sectionGap * 1.35 + weakness * 1.45 + difficultyFit * 0.55 + 1;
      return {
        ...exercise,
        preview_score: Number(score.toFixed(4)),
        rationale: {
          section_gap: Number(sectionGap.toFixed(4)),
          weakness: Number(weakness.toFixed(4)),
          difficulty_fit: Number(difficultyFit.toFixed(4)),
        },
      };
    })
    .sort((a: any, b: any) => b.preview_score - a.preview_score || String(a.id).localeCompare(String(b.id)))
    .slice(0, count);

  return json(200, {
    user_id: userId,
    target_overall_band: targetBand,
    preview_items: ranked,
  });
};

const analytics = async (sb: any, scope: Scope, url: URL): Promise<Response> => {
  const days = clamp(Math.floor(toNumber(url.searchParams.get("days")) ?? 30), 1, 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: attemptsData, error } = await sb
    .from("ielts_practice_attempts")
    .select("id,user_id,section_type,question_type,status,accuracy_ratio,estimated_band,created_at,scored_at")
    .eq("product_id", scope.practiceProductId)
    .eq("language_id", scope.languageId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10000);

  if (error) return json(500, { error: "Failed to load analytics", details: error });
  const attempts = Array.isArray(attemptsData) ? attemptsData : [];

  const bySection = new Map<string, { attempts: number; scored: number; accuracyTotal: number; accuracyCount: number }>();
  const byQuestion = new Map<string, { attempts: number; scored: number; accuracyTotal: number; accuracyCount: number }>();
  const users = new Set<string>();
  let scoredAttempts = 0;
  let accuracyTotal = 0;
  let accuracyCount = 0;

  for (const row of attempts) {
    const section = toText((row as any).section_type, 32).toLowerCase() || "unknown";
    const question = toText((row as any).question_type, 120).toLowerCase() || "unknown";
    const status = toText((row as any).status, 32).toLowerCase();
    const accuracy = toNumber((row as any).accuracy_ratio);
    users.add(String((row as any).user_id ?? ""));

    const sec = bySection.get(section) ?? { attempts: 0, scored: 0, accuracyTotal: 0, accuracyCount: 0 };
    sec.attempts += 1;
    if (status === "scored") sec.scored += 1;
    if (accuracy != null) {
      sec.accuracyTotal += accuracy;
      sec.accuracyCount += 1;
    }
    bySection.set(section, sec);

    const qKey = `${section}::${question}`;
    const q = byQuestion.get(qKey) ?? { attempts: 0, scored: 0, accuracyTotal: 0, accuracyCount: 0 };
    q.attempts += 1;
    if (status === "scored") q.scored += 1;
    if (accuracy != null) {
      q.accuracyTotal += accuracy;
      q.accuracyCount += 1;
    }
    byQuestion.set(qKey, q);

    if (status === "scored") scoredAttempts += 1;
    if (accuracy != null) {
      accuracyTotal += accuracy;
      accuracyCount += 1;
    }
  }

  const sectionStats = Array.from(bySection.entries())
    .map(([section, value]) => ({
      section_type: section,
      attempts: value.attempts,
      scored_attempts: value.scored,
      completion_ratio: value.attempts > 0 ? Number((value.scored / value.attempts).toFixed(4)) : null,
      accuracy_avg: value.accuracyCount > 0 ? Number((value.accuracyTotal / value.accuracyCount).toFixed(4)) : null,
    }))
    .sort((a, b) => b.attempts - a.attempts);

  const questionStats = Array.from(byQuestion.entries())
    .map(([key, value]) => {
      const [section, question] = key.split("::");
      return {
        section_type: section,
        question_type: question,
        attempts: value.attempts,
        scored_attempts: value.scored,
        completion_ratio: value.attempts > 0 ? Number((value.scored / value.attempts).toFixed(4)) : null,
        accuracy_avg: value.accuracyCount > 0 ? Number((value.accuracyTotal / value.accuracyCount).toFixed(4)) : null,
      };
    })
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 100);

  return json(200, {
    window_days: days,
    since,
    totals: {
      attempts: attempts.length,
      scored_attempts: scoredAttempts,
      unique_users: users.size,
      completion_ratio: attempts.length > 0 ? Number((scoredAttempts / attempts.length).toFixed(4)) : null,
      accuracy_avg: accuracyCount > 0 ? Number((accuracyTotal / accuracyCount).toFixed(4)) : null,
    },
    by_section: sectionStats,
    by_question_type: questionStats,
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = getEnv("SUPABASE_URL");
    const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.products.manage",
      action: "admin.ielts_practice",
    });
    if (!authz.ok) return authz.response;

    const scope = await resolveScope(sb);
    const url = new URL(req.url);
    const route = extractRoute(url);

    if (req.method === "GET" && route === "/sources") return await listSources(sb, scope, url);
    if (req.method === "GET" && route === "/blueprints") return await listBlueprints(sb, scope, url);
    if (req.method === "POST" && route === "/blueprints") return await createBlueprint(sb, scope, await parseBody(req), authz.context.userId);
    if (req.method === "PATCH" && route === "/blueprints") return await patchBlueprint(sb, scope, await parseBody(req), authz.context.userId);
    if (req.method === "POST" && route === "/blueprints/build") {
      return await buildBlueprint(sb, scope, await parseBody(req), authz.context.userId);
    }
    if (req.method === "GET" && route === "/builds") return await listBuilds(sb, scope, url);
    if (req.method === "POST" && route === "/content-factory/build") {
      return await contentFactoryBuild(sb, scope, await parseBody(req), authz.context.userId);
    }

    if (req.method === "GET" && route === "/exercises") return await listExercises(sb, scope, url);
    if (req.method === "POST" && route === "/exercises") return await createExercise(sb, scope, await parseBody(req), authz.context.userId);
    if (req.method === "PATCH" && route === "/exercises") return await patchExercise(sb, await parseBody(req), authz.context.userId);
    if (req.method === "POST" && route === "/exercises/import-from-simulator") {
      return await importFromSimulator(sb, scope, await parseBody(req), authz.context.userId);
    }

    if (req.method === "GET" && route === "/rules") return await listRules(sb, scope);
    if (req.method === "PATCH" && route === "/rules") return await patchRules(sb, scope, await parseBody(req), authz.context.userId);

    if (req.method === "GET" && route === "/preview-plan") return await previewPlan(sb, scope, url);
    if (req.method === "GET" && route === "/analytics") return await analytics(sb, scope, url);

    return json(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return json(status, { error: message });
  }
});
