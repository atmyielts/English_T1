type JsonRecord = Record<string, unknown>;

export const PRACTICE_DELIVERY_SCHEMA_VERSION = "ielts.practice.delivery.v2";
export const PRACTICE_LAB_SCHEMA_VERSION = "ielts.practice.lab.v1";
export const PRACTICE_EXPERIENCE_KINDS = [
  "strategy",
  "repair_drill",
  "guided_set",
  "timed_mini",
  "writing_rewrite",
  "mastery_check",
] as const;

export type PracticeExperienceKind = typeof PRACTICE_EXPERIENCE_KINDS[number];

export type PracticeScope = {
  practiceProductId: string;
  simulatorProductId: string;
  languageId: string;
  languageCode?: string;
};

export type BlueprintRow = {
  id: string;
  title: string;
  section_type: "reading" | "listening" | "writing";
  source_product_id: string | null;
  source_experience_id: string | null;
  source_section_id: string | null;
  target_question_types: string[];
  estimated_minutes: number;
  status: string;
  experience_kind?: PracticeExperienceKind | string | null;
  metadata: JsonRecord;
  latest_delivery_build_id: string | null;
};

export type DeliveryBuildRow = {
  id: string;
  blueprint_id: string;
  delivery_experience_id: string | null;
  source_product_id?: string | null;
  source_experience_id?: string | null;
  source_section_id?: string | null;
  status: string;
  experience_kind?: PracticeExperienceKind | string | null;
  build_version: number;
  build_summary: JsonRecord;
  validation_summary: JsonRecord;
  metadata: JsonRecord;
  created_at?: string;
  updated_at?: string;
};

export type SourceCatalogRow = {
  experience_id: string;
  experience_name: string;
  section_id: string;
  section_name: string;
  section_type: "reading" | "listening" | "writing";
  part_count: number;
  unit_count: number;
  question_count: number;
  question_types: string[];
  has_audio: boolean;
  has_passage: boolean;
  has_image: boolean;
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
const isObject = (value: unknown): value is JsonRecord => !!value && typeof value === "object" && !Array.isArray(value);

export const normalizePracticeExperienceKind = (value: unknown): PracticeExperienceKind => {
  const text = toText(value, 80).toLowerCase();
  return (PRACTICE_EXPERIENCE_KINDS as readonly string[]).includes(text)
    ? (text as PracticeExperienceKind)
    : "guided_set";
};

const formatQuestionType = (value: string): string =>
  value
    .replace(/^question_/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (token) => token.toUpperCase());

const isQuestionUnit = (unit: unknown): boolean => {
  if (!isObject(unit)) return false;
  const type = toText(unit.type, 120).toLowerCase();
  return type.startsWith("question_") || type === "question_text";
};

const isContextUnit = (unit: unknown): boolean => {
  if (!isObject(unit)) return false;
  const type = toText(unit.type, 120).toLowerCase();
  return type === "instruction" || type === "reading_passage" || type === "audio" || type === "image";
};

const questionLimitForKind = (kind: PracticeExperienceKind, sectionType: "reading" | "listening" | "writing"): number => {
  if (sectionType === "writing") return kind === "strategy" ? 1 : 2;
  if (kind === "strategy") return 3;
  if (kind === "repair_drill") return 5;
  if (kind === "guided_set") return 8;
  if (kind === "timed_mini") return 12;
  return 10;
};

const titleForKind = (kind: PracticeExperienceKind): string => {
  switch (kind) {
    case "strategy":
      return "Strategy primer";
    case "repair_drill":
      return "Repair drill";
    case "timed_mini":
      return "Timed mini-session";
    case "writing_rewrite":
      return "Writing rewrite";
    case "mastery_check":
      return "Mastery check";
    case "guided_set":
    default:
      return "Guided set";
  }
};

const instructionForKind = (
  kind: PracticeExperienceKind,
  sectionType: "reading" | "listening" | "writing",
  questionTypes: string[],
): string => {
  const focus = questionTypes.length > 0
    ? questionTypes.slice(0, 4).map(formatQuestionType).join(", ")
    : "mixed IELTS tasks";
  const base = `${titleForKind(kind)} | ${sectionType.toUpperCase()} | Focus: ${focus}.`;

  if (kind === "strategy") {
    return `${base}\n\nBefore answering, identify the task type, predict what evidence you need, and name the distractor pattern you expect. Accuracy matters more than speed in this session.`;
  }
  if (kind === "repair_drill") {
    return `${base}\n\nWork slowly and repair the exact mistake pattern. After each answer, check whether the wording in the question was paraphrased, contradicted, or distracted by nearby information.`;
  }
  if (kind === "timed_mini") {
    return `${base}\n\nUse exam timing. Answer without pausing to over-review, then use the result to update your next practice target.`;
  }
  if (kind === "writing_rewrite") {
    return `${base}\n\nRewrite with one concrete upgrade: clearer task position, stronger paragraph control, more precise vocabulary, or cleaner grammar. Submit a full response for AI feedback.`;
  }
  if (kind === "mastery_check") {
    return `${base}\n\nTreat this as a checkpoint. No hints: prove that this question type is ready to move up in difficulty.`;
  }
  return `${base}\n\nFollow the guided sequence: understand the prompt, locate evidence, answer, and then compare the question wording with the source.`;
};

const promptLeadForKind = (
  kind: PracticeExperienceKind,
  sectionType: "reading" | "listening" | "writing",
  questionTypes: string[],
): string => {
  const focus = questionTypes.length > 0
    ? questionTypes.slice(0, 3).map(formatQuestionType).join(", ")
    : "mixed IELTS questions";

  if (kind === "strategy") {
    if (sectionType === "listening") {
      return `Strategy task (${focus}): predict the answer type, listen for signposts, and note the paraphrase before choosing.`;
    }
    if (sectionType === "writing") {
      return `Strategy task (${focus}): identify the task demand, plan the position, and decide the paragraph job before writing.`;
    }
    return `Strategy task (${focus}): locate the evidence first, underline the phrase that proves it, then answer.`;
  }

  if (kind === "repair_drill") {
    return `Repair drill (${focus}): slow down, eliminate the distractor, and answer only after checking the exact wording.`;
  }

  if (kind === "timed_mini") {
    return `Timed mini-session (${focus}): work at exam pace and do not over-review before submitting.`;
  }

  if (kind === "writing_rewrite") {
    return `Writing rewrite (${focus}): improve the response with clearer task achievement, paragraph control, vocabulary, and grammar.`;
  }

  if (kind === "mastery_check") {
    return `Mastery check (${focus}): no hints. Prove this skill is ready to move up.`;
  }

  return `Guided set (${focus}): follow the evidence, answer, then compare the wording with the source.`;
};

const withPromptLead = (data: JsonRecord, lead: string): JsonRecord => {
  const prompt = toText(data.prompt, 5000);
  return {
    ...data,
    prompt: prompt ? `${lead}\n\n${prompt}` : lead,
  };
};

const transformUnitDataForPractice = (unit: any, plan: TransformationPlan): JsonRecord => {
  const data = isObject(unit?.data) ? { ...(unit.data as JsonRecord) } : {};
  const type = toText(unit?.type, 120).toLowerCase();

  if (!isQuestionUnit(unit)) {
    if (type === "reading_passage") {
      return {
        ...data,
        title: toText(data.title, 500) || "Practice evidence source",
      };
    }
    return data;
  }

  const transformed = withPromptLead(data, promptLeadForKind(plan.experienceKind, plan.sectionType, plan.targetQuestionTypes));
  if (plan.experienceKind === "writing_rewrite" && type === "question_text") {
    transformed.placeholder = toText(transformed.placeholder, 500) || "Rewrite your improved answer here.";
    transformed.show_word_count = transformed.show_word_count ?? true;
  }

  return {
    ...transformed,
    practice_mode: {
      experience_kind: plan.experienceKind,
      section_type: plan.sectionType,
      target_question_types: plan.targetQuestionTypes,
      transformed_from_simulator: true,
    },
  };
};

export type TransformationPlan = {
  experienceKind: PracticeExperienceKind;
  sectionType: "reading" | "listening" | "writing";
  targetQuestionTypes: string[];
  selectedUnits: any[];
  selectedQuestionUnits: any[];
  selectedPartIds: string[];
  questionLimit: number;
};

export type PracticeLabPayload = JsonRecord & {
  version: typeof PRACTICE_LAB_SCHEMA_VERSION;
  lab_kind: string;
  section_type: "reading" | "listening" | "writing";
  experience_kind: PracticeExperienceKind;
  title: string;
  coach_template: JsonRecord;
  steps: JsonRecord[];
  answer_key: Record<string, JsonRecord>;
  feedback_rules: JsonRecord;
  variant_seed: string;
  source_refs: JsonRecord;
  validation: JsonRecord;
};

export const buildTransformationPlan = (
  sectionType: "reading" | "listening" | "writing",
  experienceKindRaw: unknown,
  sourceUnits: any[],
  targetQuestionTypesRaw: unknown,
): TransformationPlan => {
  const normalizedKind = normalizePracticeExperienceKind(experienceKindRaw);
  const experienceKind = sectionType === "writing" && normalizedKind === "repair_drill" ? "writing_rewrite" : normalizedKind;
  const targetQuestionTypes = Array.isArray(targetQuestionTypesRaw)
    ? targetQuestionTypesRaw.map((entry) => toText(entry, 120).toLowerCase()).filter(Boolean)
    : [];
  const targetSet = new Set(targetQuestionTypes);
  const sourceQuestions = sourceUnits
    .filter(isQuestionUnit)
    .filter((unit) => targetSet.size === 0 || targetSet.has(questionTypeFromUnit(unit)))
    .sort((a, b) => (toNumber(a?.display_order) ?? 0) - (toNumber(b?.display_order) ?? 0));

  const limit = questionLimitForKind(experienceKind, sectionType);
  const selectedQuestionUnits = sourceQuestions.slice(0, Math.max(1, limit));
  const selectedPartIds = Array.from(new Set(
    selectedQuestionUnits
      .map((unit) => toText(unit?.part_id, 80))
      .filter(Boolean),
  ));

  if (selectedPartIds.length === 0 && sectionType === "writing") {
    const fallbackParts = Array.from(new Set(sourceUnits.map((unit) => toText(unit?.part_id, 80)).filter(Boolean)));
    selectedPartIds.push(...fallbackParts.slice(0, 2));
  }

  const selectedQuestionIds = new Set(selectedQuestionUnits.map((unit) => toText(unit?.id, 80)));
  const selectedPartSet = new Set(selectedPartIds);
  const selectedUnits = sourceUnits
    .filter((unit) => {
      const partId = toText(unit?.part_id, 80);
      if (!selectedPartSet.has(partId)) return false;
      if (isQuestionUnit(unit)) return selectedQuestionIds.has(toText(unit?.id, 80));
      return isContextUnit(unit);
    })
    .sort((a, b) => (toNumber(a?.display_order) ?? 0) - (toNumber(b?.display_order) ?? 0));

  return {
    experienceKind,
    sectionType,
    targetQuestionTypes: selectedQuestionUnits.length > 0
      ? Array.from(new Set(selectedQuestionUnits.map(questionTypeFromUnit))).sort()
      : targetQuestionTypes,
    selectedUnits,
    selectedQuestionUnits,
    selectedPartIds,
    questionLimit: limit,
  };
};

const readSectionType = (raw: unknown): "reading" | "listening" | "writing" | null => {
  const text = toText(isObject(raw) ? raw.type : raw, 32).toLowerCase();
  if (text === "reading" || text === "listening" || text === "writing") return text;
  return null;
};

const questionTypeFromUnit = (unit: unknown): string => {
  if (!isObject(unit)) return "question_unknown";
  const meta = isObject(unit.metadata) ? unit.metadata : {};
  const data = isObject(unit.data) ? unit.data : {};
  return (
    toText(meta.question_type, 120).toLowerCase()
    || toText((data as JsonRecord).question_type, 120).toLowerCase()
    || toText((data as JsonRecord).questionType, 120).toLowerCase()
    || toText(unit.type, 120).toLowerCase()
    || "question_unknown"
  );
};

const summarizeUnits = (units: any[]): Pick<SourceCatalogRow, "question_count" | "question_types" | "has_audio" | "has_passage" | "has_image"> => {
  const questionTypes = new Set<string>();
  let questionCount = 0;
  let hasAudio = false;
  let hasPassage = false;
  let hasImage = false;

  for (const unit of units) {
    const type = toText(unit?.type, 120).toLowerCase();
    if (type === "audio") hasAudio = true;
    if (type === "reading_passage") hasPassage = true;
    if (type === "image" || (type === "question_diagram_labeling" && isObject(unit?.data) && isObject((unit.data as any).image))) {
      hasImage = true;
    }
    if (type.startsWith("question_") || type === "question_text") {
      questionCount += 1;
      questionTypes.add(questionTypeFromUnit(unit));
    }
  }

  return {
    question_count: questionCount,
    question_types: Array.from(questionTypes).sort(),
    has_audio: hasAudio,
    has_passage: hasPassage,
    has_image: hasImage,
  };
};

const firstText = (value: JsonRecord, keys: string[], maxLen = 12000): string => {
  for (const key of keys) {
    const raw = value[key];
    if (typeof raw === "string" && raw.trim().length > 0) return toText(raw, maxLen);
  }
  return "";
};

const unitText = (unit: any, keys: string[], maxLen = 12000): string => {
  const data = isObject(unit?.data) ? (unit.data as JsonRecord) : {};
  const metadata = isObject(unit?.metadata) ? (unit.metadata as JsonRecord) : {};
  return firstText(data, keys, maxLen) || firstText(metadata, keys, maxLen);
};

const optionsFromUnit = (unit: any): JsonRecord[] => {
  const data = isObject(unit?.data) ? (unit.data as JsonRecord) : {};
  const raw = Array.isArray(data.options)
    ? data.options
    : Array.isArray(data.choices)
      ? data.choices
      : [];
  return raw
    .map((entry, index) => {
      if (isObject(entry)) {
        return {
          id: toText(entry.id ?? entry.value ?? entry.key ?? String(index + 1), 80),
          label: toText(entry.label ?? entry.text ?? entry.value ?? entry.id ?? "", 1200),
        };
      }
      return { id: String(index + 1), label: toText(entry, 1200) };
    })
    .filter((entry) => toText(entry.id, 80) || toText(entry.label, 1200));
};

const responseShapeFromCorrect = (correct: unknown): JsonRecord => {
  if (!isObject(correct)) return { kind: "free_text", keys: [] };
  for (const key of ["blanks", "matches", "cells", "labels", "targets"]) {
    if (isObject(correct[key])) return { kind: "map", map_key: key, keys: Object.keys(correct[key] as JsonRecord) };
  }
  if (Array.isArray(correct.option_ids)) return { kind: "multi_choice" };
  if (typeof correct.option_id === "string") return { kind: "single_choice" };
  return { kind: "free_text", keys: [] };
};

const labKindFor = (
  sectionType: "reading" | "listening" | "writing",
  experienceKind: PracticeExperienceKind,
): string => {
  if (sectionType === "writing") return "writing_rewrite";
  if (experienceKind === "timed_mini") return "timed_mini";
  if (experienceKind === "mastery_check") return "mastery_check";
  if (sectionType === "listening") return experienceKind === "repair_drill" ? "distractor_drill" : "listening_replay";
  if (experienceKind === "repair_drill") return "distractor_drill";
  return "evidence_locator";
};

const stepKindFor = (
  sectionType: "reading" | "listening" | "writing",
  experienceKind: PracticeExperienceKind,
): string => {
  if (sectionType === "writing") return "writing_rewrite";
  if (experienceKind === "mastery_check") return "mastery_response";
  if (experienceKind === "timed_mini") return "timed_response";
  if (sectionType === "listening") return experienceKind === "repair_drill" ? "distractor_elimination" : "listening_replay";
  return experienceKind === "repair_drill" ? "distractor_elimination" : "evidence_locator";
};

const sourceContextForUnit = (question: any, selectedUnits: any[]): JsonRecord => {
  const partId = toText(question?.part_id, 80);
  const samePart = selectedUnits.filter((unit) => toText(unit?.part_id, 80) === partId);
  const passage = samePart.find((unit) => toText(unit?.type, 120).toLowerCase() === "reading_passage");
  const audio = samePart.find((unit) => toText(unit?.type, 120).toLowerCase() === "audio");
  const image = samePart.find((unit) => toText(unit?.type, 120).toLowerCase() === "image");
  const passageText = passage ? unitText(passage, ["text", "passage", "content", "body"], 18000) : "";
  const transcript = audio ? unitText(audio, ["transcript", "transcript_text", "text"], 18000) : "";
  const audioData = audio && isObject(audio.data) ? (audio.data as JsonRecord) : {};
  return {
    passage_title: passage ? unitText(passage, ["title"], 500) || "Reading passage" : null,
    passage_text: passageText || null,
    transcript: transcript || null,
    audio_url: toNullableText(audioData.url ?? audioData.audio_url ?? audioData.public_url ?? audioData.path, 1200),
    image: image && isObject(image.data) ? image.data : null,
    has_passage: Boolean(passageText),
    has_transcript: Boolean(transcript),
    has_audio: Boolean(audio),
  };
};

const createPracticeLabStep = (
  unit: any,
  index: number,
  plan: TransformationPlan,
  answerKeyBySourceUnitId: Map<string, JsonRecord>,
  clonedUnitIdBySourceUnitId?: Map<string, string>,
): JsonRecord => {
  const sourceUnitId = toText(unit?.id, 80);
  const questionType = questionTypeFromUnit(unit);
  const data = isObject(unit?.data) ? (unit.data as JsonRecord) : {};
  const correct = answerKeyBySourceUnitId.get(sourceUnitId)?.correct ?? {};
  const context = sourceContextForUnit(unit, plan.selectedUnits);
  const stepKind = stepKindFor(plan.sectionType, plan.experienceKind);
  const prompt = firstText(data, ["prompt", "question", "text", "title"], 5000) || promptLeadForKind(plan.experienceKind, plan.sectionType, [questionType]);
  const stepId = `step_${index + 1}_${questionType.replace(/[^a-z0-9]+/gi, "_")}`;

  return {
    id: stepId,
    kind: stepKind,
    title: stepKind === "writing_rewrite"
      ? "Writing Rewrite Lab"
      : `${formatQuestionType(questionType)} ${stepKind.replace(/_/g, " ")}`,
    instructions: promptLeadForKind(plan.experienceKind, plan.sectionType, [questionType]),
    question_type: questionType,
    prompt,
    options: optionsFromUnit(unit),
    response_shape: responseShapeFromCorrect(correct),
    source_content_unit_id: sourceUnitId,
    delivery_content_unit_id: clonedUnitIdBySourceUnitId?.get(sourceUnitId) ?? null,
    context,
    replay: {
      available: Boolean(context.has_transcript || context.has_audio),
      transcript: context.transcript ?? null,
      signpost_prompt: plan.sectionType === "listening" ? "Listen for signposts, paraphrase, and late corrections before answering." : null,
    },
    evidence: {
      required: stepKind === "evidence_locator",
      target: isObject((answerKeyBySourceUnitId.get(sourceUnitId)?.metadata as unknown)) ? (answerKeyBySourceUnitId.get(sourceUnitId)?.metadata as JsonRecord).evidence : null,
      fallback: stepKind === "evidence_locator" && !context.has_passage ? "best_effort_without_passage" : null,
    },
    distractors: {
      required: stepKind === "distractor_elimination",
      trap_types: ["word_match", "opposite_meaning", "too_broad", "nearby_but_wrong", "wrong_number", "wrong_speaker", "not_given"],
    },
    answer_key: correct,
  };
};

export const buildPracticeLabPayload = (
  plan: TransformationPlan,
  answerKeys: any[],
  opts?: {
    sourceExperienceId?: string | null;
    sourceSectionId?: string | null;
    sourceSectionName?: string | null;
    clonedUnitIdBySourceUnitId?: Map<string, string>;
  },
): PracticeLabPayload => {
  const answerKeyBySourceUnitId = new Map<string, JsonRecord>();
  for (const row of Array.isArray(answerKeys) ? answerKeys : []) {
    const unitId = toText((row as any)?.content_unit_id, 80);
    if (!unitId) continue;
    answerKeyBySourceUnitId.set(unitId, {
      correct: isObject((row as any)?.correct) || Array.isArray((row as any)?.correct) ? (row as any).correct : {},
      metadata: isObject((row as any)?.metadata) ? (row as any).metadata : {},
    });
  }

  const labKind = labKindFor(plan.sectionType, plan.experienceKind);
  const questionTypes = plan.targetQuestionTypes.length > 0 ? plan.targetQuestionTypes : plan.selectedQuestionUnits.map(questionTypeFromUnit);
  const steps = plan.selectedQuestionUnits.map((unit, index) =>
    createPracticeLabStep(unit, index, plan, answerKeyBySourceUnitId, opts?.clonedUnitIdBySourceUnitId)
  );
  const answerKey: Record<string, JsonRecord> = {};
  for (const step of steps) {
    answerKey[toText(step.id, 120)] = {
      question_type: step.question_type,
      correct: step.answer_key,
      source_content_unit_id: step.source_content_unit_id,
      delivery_content_unit_id: step.delivery_content_unit_id,
    };
  }

  const hasAnswerKeys = steps.every((step) => isObject(step.answer_key) && Object.keys(step.answer_key as JsonRecord).length > 0)
    || plan.sectionType === "writing";
  const hasTranscript = steps.some((step) => isObject(step.context) && Boolean((step.context as JsonRecord).has_transcript));
  const hasPassage = steps.some((step) => isObject(step.context) && Boolean((step.context as JsonRecord).has_passage));
  const errors: string[] = [];
  const warnings: string[] = [];
  if (steps.length === 0) errors.push("No lab steps generated");
  if (!hasAnswerKeys) errors.push("Missing answer keys for objective lab steps");
  if (labKind === "listening_replay" && !hasTranscript) warnings.push("Listening replay will use prediction and reasoning fallback because transcript is missing");
  if (labKind === "evidence_locator" && !hasPassage) warnings.push("Evidence locator has no passage text and will use best-effort evidence reflection");

  return {
    version: PRACTICE_LAB_SCHEMA_VERSION,
    lab_kind: labKind,
    section_type: plan.sectionType,
    experience_kind: plan.experienceKind,
    title: `${titleForKind(plan.experienceKind)} Lab`,
    coach_template: {
      headline: `${formatQuestionType(questionTypes[0] ?? plan.sectionType)} focus`,
      body: instructionForKind(plan.experienceKind, plan.sectionType, questionTypes),
      watch_for: plan.sectionType === "writing"
        ? ["Task position", "Paragraph control", "Vocabulary precision", "Grammar accuracy"]
        : ["Question wording", "Paraphrase", "Distractors", "Evidence"],
      source: "diagnostics_mastery_and_plan_rationale",
    },
    steps,
    answer_key: answerKey,
    feedback_rules: {
      score_model: plan.sectionType === "writing" ? "grade-writing-v2-with-heuristic-fallback" : "objective-plus-lab-process",
      partial_credit: true,
      mastery_updates: true,
      notebook_updates: true,
      roadmap_updates: true,
    },
    variant_seed: [
      opts?.sourceSectionId ?? "source",
      plan.experienceKind,
      questionTypes.join(".") || "mixed",
      String(steps.length),
    ].join(":"),
    source_refs: {
      source_experience_id: opts?.sourceExperienceId ?? null,
      source_section_id: opts?.sourceSectionId ?? null,
      source_section_name: opts?.sourceSectionName ?? null,
      question_types: questionTypes,
      has_passage: hasPassage,
      has_transcript: hasTranscript,
      selected_source_unit_count: plan.selectedUnits.length,
    },
    validation: {
      valid: errors.length === 0,
      errors,
      warnings,
    },
  };
};

export const listSimulatorSourceSections = async (
  sb: any,
  scope: PracticeScope,
  opts?: { experienceId?: string | null; sectionType?: string | null; limit?: number | null },
): Promise<SourceCatalogRow[]> => {
  const experienceId = toText(opts?.experienceId, 80);
  const sectionTypeFilter = toText(opts?.sectionType, 32).toLowerCase();
  const limit = Math.max(1, Math.min(500, Math.floor(toNumber(opts?.limit) ?? 200)));

  let experienceQuery = sb
    .from("experiences")
    .select("id,name")
    .eq("product_id", scope.simulatorProductId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (experienceId) experienceQuery = experienceQuery.eq("id", experienceId);

  const { data: experiences, error: experienceError } = await experienceQuery;
  if (experienceError) throw new Error("Failed to load simulator experiences");

  const experienceIds = Array.from(new Set((Array.isArray(experiences) ? experiences : []).map((row: any) => String(row.id ?? "")).filter(Boolean)));
  if (experienceIds.length === 0) return [];

  let sectionsQuery = sb
    .from("sections")
    .select("id,experience_id,name,display_order,metadata")
    .in("experience_id", experienceIds)
    .order("display_order", { ascending: true });
  if (sectionTypeFilter) sectionsQuery = sectionsQuery.eq("metadata->>type", sectionTypeFilter);

  const { data: sections, error: sectionError } = await sectionsQuery;
  if (sectionError) throw new Error("Failed to load simulator sections");

  const sectionRows = (Array.isArray(sections) ? sections : [])
    .map((row: any) => ({ ...row, _sectionType: readSectionType(row?.metadata) }))
    .filter((row: any) => row._sectionType != null)
    .slice(0, limit);
  const sectionIds = sectionRows.map((row: any) => String(row.id));
  if (sectionIds.length === 0) return [];

  const { data: parts, error: partError } = await sb
    .from("parts")
    .select("id,section_id")
    .in("section_id", sectionIds)
    .order("display_order", { ascending: true });
  if (partError) throw new Error("Failed to load simulator parts");

  const partIds = (Array.isArray(parts) ? parts : []).map((row: any) => String(row.id ?? "")).filter(Boolean);
  const { data: units, error: unitError } = await sb
    .from("content_units")
    .select("id,part_id,type,data,metadata")
    .in("part_id", partIds.length > 0 ? partIds : ["00000000-0000-0000-0000-000000000000"]);
  if (unitError) throw new Error("Failed to load simulator content units");

  const partsBySection = new Map<string, any[]>();
  for (const part of Array.isArray(parts) ? parts : []) {
    const key = String((part as any).section_id ?? "");
    const bucket = partsBySection.get(key) ?? [];
    bucket.push(part);
    partsBySection.set(key, bucket);
  }

  const unitsByPart = new Map<string, any[]>();
  for (const unit of Array.isArray(units) ? units : []) {
    const key = String((unit as any).part_id ?? "");
    const bucket = unitsByPart.get(key) ?? [];
    bucket.push(unit);
    unitsByPart.set(key, bucket);
  }

  const experienceById = new Map<string, any>();
  for (const experience of Array.isArray(experiences) ? experiences : []) {
    experienceById.set(String((experience as any).id ?? ""), experience);
  }

  return sectionRows.map((section: any) => {
    const partsForSection = partsBySection.get(String(section.id)) ?? [];
    const unitsForSection = partsForSection.flatMap((part) => unitsByPart.get(String((part as any).id ?? "")) ?? []);
    const summary = summarizeUnits(unitsForSection);
    const experience = experienceById.get(String(section.experience_id ?? ""));
    return {
      experience_id: String(section.experience_id),
      experience_name: toText(experience?.name, 240) || "Experience",
      section_id: String(section.id),
      section_name: toText(section.name, 240) || "Section",
      section_type: section._sectionType,
      part_count: partsForSection.length,
      unit_count: unitsForSection.length,
      question_count: summary.question_count,
      question_types: summary.question_types,
      has_audio: summary.has_audio,
      has_passage: summary.has_passage,
      has_image: summary.has_image,
    };
  });
};

const createBuildSummary = (
  sourceExperience: any,
  sourceSection: any,
  parts: any[],
  units: any[],
  plan?: TransformationPlan,
): JsonRecord => {
  const contentSummary = summarizeUnits(units);
  return {
    schema_version: PRACTICE_DELIVERY_SCHEMA_VERSION,
    transformed: true,
    source_experience_id: toText(sourceExperience?.id, 80),
    source_section_id: toText(sourceSection?.id, 80),
    source_experience_name: toText(sourceExperience?.name, 240),
    source_section_name: toText(sourceSection?.name, 240),
    section_type: readSectionType(sourceSection?.metadata),
    experience_kind: plan?.experienceKind ?? "guided_set",
    part_count: parts.length,
    unit_count: units.length,
    question_count: contentSummary.question_count,
    question_types: contentSummary.question_types,
    target_question_types: plan?.targetQuestionTypes ?? contentSummary.question_types,
    selected_source_unit_count: plan?.selectedUnits.length ?? units.length,
    selected_question_count: plan?.selectedQuestionUnits.length ?? contentSummary.question_count,
    question_limit: plan?.questionLimit ?? null,
    has_audio: contentSummary.has_audio,
    has_passage: contentSummary.has_passage,
    has_image: contentSummary.has_image,
  };
};

const createValidationSummary = (buildSummary: JsonRecord): JsonRecord => {
  const questionCount = Math.max(0, Math.floor(toNumber(buildSummary.question_count) ?? 0));
  const sectionType = readSectionType(buildSummary.section_type);
  return {
    valid: questionCount > 0 && sectionType != null && buildSummary.transformed === true,
    checks: {
      has_questions: questionCount > 0,
      has_context: buildSummary.has_audio === true || buildSummary.has_passage === true || sectionType === "writing",
      section_type_known: sectionType != null,
      transformed_runtime: buildSummary.transformed === true,
      schema_version: buildSummary.schema_version === PRACTICE_DELIVERY_SCHEMA_VERSION,
    },
  };
};

export const loadBlueprintsWithBuilds = async (
  sb: any,
  scope: PracticeScope,
  opts?: { status?: string | null; includeDraftBuilds?: boolean },
): Promise<Array<BlueprintRow & { latest_build: DeliveryBuildRow | null }>> => {
  const status = toText(opts?.status, 32).toLowerCase();
  let blueprintQuery = sb
    .from("ielts_practice_blueprints")
    .select("id,title,section_type,source_product_id,source_experience_id,source_section_id,target_question_types,estimated_minutes,status,experience_kind,metadata,latest_delivery_build_id")
    .eq("product_id", scope.practiceProductId)
    .eq("language_id", scope.languageId)
    .order("updated_at", { ascending: false });
  if (status) blueprintQuery = blueprintQuery.eq("status", status);

  const { data: blueprints, error: blueprintError } = await blueprintQuery;
  if (blueprintError) throw new Error("Failed to load practice blueprints");

  const rows = Array.isArray(blueprints) ? blueprints : [];
  const buildIds = Array.from(new Set(rows.map((row: any) => String(row.latest_delivery_build_id ?? "")).filter(Boolean)));
  let builds: any[] = [];
  if (buildIds.length > 0) {
    let buildQuery = sb
      .from("ielts_practice_delivery_builds")
      .select("id,blueprint_id,delivery_experience_id,source_product_id,source_experience_id,source_section_id,status,experience_kind,build_version,build_summary,validation_summary,metadata,created_at,updated_at")
      .in("id", buildIds);
    if (!opts?.includeDraftBuilds) buildQuery = buildQuery.neq("status", "failed");
    const { data: buildRows, error: buildError } = await buildQuery;
    if (buildError) throw new Error("Failed to load practice delivery builds");
    builds = Array.isArray(buildRows) ? buildRows : [];
  }

  const buildById = new Map<string, DeliveryBuildRow>();
  for (const build of builds) {
    buildById.set(String((build as any).id ?? ""), build as DeliveryBuildRow);
  }

  return rows.map((row: any) => ({
    ...(row as BlueprintRow),
    latest_build: buildById.get(String(row.latest_delivery_build_id ?? "")) ?? null,
  }));
};

export const cloneBlueprintToDeliveryExperience = async (
  sb: any,
  scope: PracticeScope,
  blueprint: BlueprintRow,
  adminUserId: string,
  opts?: { publish?: boolean },
): Promise<DeliveryBuildRow> => {
  const sourceSectionId = toText(blueprint.source_section_id, 80);
  if (!sourceSectionId) throw new Error("Blueprint is missing source_section_id");

  const { data: sourceSection, error: sourceSectionError } = await sb
    .from("sections")
    .select("id,experience_id,name,display_order,metadata")
    .eq("id", sourceSectionId)
    .maybeSingle();
  if (sourceSectionError) throw new Error("Failed to load source section");
  if (!sourceSection) throw new Error("Source section not found");

  const sectionType = readSectionType((sourceSection as any).metadata);
  if (!sectionType) throw new Error("Source section type is unsupported");

  const { data: sourceExperience, error: sourceExperienceError } = await sb
    .from("experiences")
    .select("id,name,metadata")
    .eq("id", String((sourceSection as any).experience_id))
    .maybeSingle();
  if (sourceExperienceError) throw new Error("Failed to load source experience");
  if (!sourceExperience) throw new Error("Source experience not found");

  const { data: parts, error: partError } = await sb
    .from("parts")
    .select("id,name,display_order,metadata")
    .eq("section_id", sourceSectionId)
    .order("display_order", { ascending: true });
  if (partError) throw new Error("Failed to load source parts");

  const sourceParts = Array.isArray(parts) ? parts : [];
  const sourcePartIds = sourceParts.map((row: any) => String(row.id ?? "")).filter(Boolean);

  const { data: units, error: unitError } = await sb
    .from("content_units")
    .select("id,part_id,type,display_order,data,metadata")
    .in("part_id", sourcePartIds.length > 0 ? sourcePartIds : ["00000000-0000-0000-0000-000000000000"])
    .order("display_order", { ascending: true });
  if (unitError) throw new Error("Failed to load source content units");

  const sourceUnits = Array.isArray(units) ? units : [];
  const sourceUnitIds = sourceUnits.map((row: any) => String(row.id ?? "")).filter(Boolean);
  const { data: answerKeys, error: answerKeyError } = await sb
    .from("answer_keys")
    .select("content_unit_id,correct,metadata")
    .in("content_unit_id", sourceUnitIds.length > 0 ? sourceUnitIds : ["00000000-0000-0000-0000-000000000000"]);
  if (answerKeyError) throw new Error("Failed to load source answer keys");

  const { data: latestBuildData } = await sb
    .from("ielts_practice_delivery_builds")
    .select("build_version")
    .eq("blueprint_id", blueprint.id)
    .order("build_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const buildVersion = Math.max(1, Math.floor(toNumber((latestBuildData as any)?.build_version) ?? 0) + 1);
  const transformationPlan = buildTransformationPlan(
    sectionType,
    blueprint.experience_kind ?? blueprint.metadata?.experience_kind,
    sourceUnits,
    blueprint.target_question_types,
  );
  if (transformationPlan.selectedUnits.length === 0 || transformationPlan.selectedQuestionUnits.length === 0) {
    throw new Error("No compatible source questions found for transformed practice build");
  }

  const deliveryExperienceMeta = {
    ...(isObject((sourceExperience as any).metadata) ? ((sourceExperience as any).metadata as JsonRecord) : {}),
    practice_blueprint_id: blueprint.id,
    practice_delivery_build_version: buildVersion,
    delivery_kind: "ielts_practice_transformed",
    delivery_schema_version: PRACTICE_DELIVERY_SCHEMA_VERSION,
    experience_kind: transformationPlan.experienceKind,
    source_product_id: scope.simulatorProductId,
    source_experience_id: String((sourceExperience as any).id),
    source_section_id: String((sourceSection as any).id),
    section_type: sectionType,
  };

  const { data: deliveryExperience, error: deliveryExperienceError } = await sb
    .from("experiences")
    .insert({
      product_id: scope.practiceProductId,
      name: `${titleForKind(transformationPlan.experienceKind)} | ${toText(blueprint.title, 220) || toText((sourceSection as any).name, 160) || "IELTS Practice"}`,
      display_order: 0,
      is_active: opts?.publish === true,
      metadata: deliveryExperienceMeta,
    })
    .select("id")
    .maybeSingle();
  if (deliveryExperienceError || !deliveryExperience) throw new Error("Failed to create practice delivery experience");

  const { data: deliverySection, error: deliverySectionError } = await sb
    .from("sections")
    .insert({
      experience_id: String((deliveryExperience as any).id),
      name: titleForKind(transformationPlan.experienceKind),
      display_order: 1,
      metadata: {
        ...(isObject((sourceSection as any).metadata) ? ((sourceSection as any).metadata as JsonRecord) : {}),
        source_section_id: String((sourceSection as any).id),
        source_experience_id: String((sourceExperience as any).id),
        practice_blueprint_id: blueprint.id,
        delivery_kind: "ielts_practice_transformed",
        delivery_schema_version: PRACTICE_DELIVERY_SCHEMA_VERSION,
        experience_kind: transformationPlan.experienceKind,
      },
    })
    .select("id")
    .maybeSingle();
  if (deliverySectionError || !deliverySection) throw new Error("Failed to create practice delivery section");

  const selectedPartSet = new Set(transformationPlan.selectedPartIds);
  const selectedSourceParts = sourceParts.filter((part: any) => selectedPartSet.has(String(part.id)));
  const partIdMap = new Map<string, string>();
  if (selectedSourceParts.length > 0) {
    const partRows = selectedSourceParts.map((part: any, index: number) => {
      const id = crypto.randomUUID();
      partIdMap.set(String(part.id), id);
      return {
        id,
        section_id: String((deliverySection as any).id),
        name: index === 0 ? titleForKind(transformationPlan.experienceKind) : (toText(part.name, 240) || "Part"),
        display_order: Math.max(1, Math.floor(toNumber(part.display_order) ?? index + 1)),
        metadata: {
          ...(isObject(part.metadata) ? (part.metadata as JsonRecord) : {}),
          source_part_id: String(part.id),
          practice_blueprint_id: blueprint.id,
          delivery_kind: "ielts_practice_transformed",
          delivery_schema_version: PRACTICE_DELIVERY_SCHEMA_VERSION,
          experience_kind: transformationPlan.experienceKind,
        },
      };
    });
    const { error: insertPartsError } = await sb.from("parts").insert(partRows);
    if (insertPartsError) throw new Error("Failed to create practice delivery parts");
  }

  const unitIdMap = new Map<string, string>();
  if (transformationPlan.selectedUnits.length > 0) {
    const firstPartId = partIdMap.get(transformationPlan.selectedPartIds[0] ?? "");
    const introRow = firstPartId
      ? [{
        id: crypto.randomUUID(),
        part_id: firstPartId,
        type: "instruction",
        display_order: 0,
        data: {
          text: instructionForKind(
            transformationPlan.experienceKind,
            transformationPlan.sectionType,
            transformationPlan.targetQuestionTypes,
          ),
        },
        metadata: {
          practice_blueprint_id: blueprint.id,
          delivery_kind: "ielts_practice_transformed",
          delivery_schema_version: PRACTICE_DELIVERY_SCHEMA_VERSION,
          experience_kind: transformationPlan.experienceKind,
          generated_by: "ielts-practice.content-factory",
        },
      }]
      : [];

    const unitRows = transformationPlan.selectedUnits.map((unit: any) => {
      const id = crypto.randomUUID();
      unitIdMap.set(String(unit.id), id);
      return {
        id,
        part_id: partIdMap.get(String(unit.part_id)) ?? null,
        type: toText(unit.type, 120),
        display_order: Math.max(1, Math.floor(toNumber(unit.display_order) ?? 1)) + 1,
        data: transformUnitDataForPractice(unit, transformationPlan),
        metadata: {
          ...(isObject(unit.metadata) ? (unit.metadata as JsonRecord) : {}),
          source_content_unit_id: String(unit.id),
          source_part_id: String(unit.part_id),
          practice_blueprint_id: blueprint.id,
          delivery_kind: "ielts_practice_transformed",
          delivery_schema_version: PRACTICE_DELIVERY_SCHEMA_VERSION,
          experience_kind: transformationPlan.experienceKind,
          transformed_from_simulator: true,
        },
      };
    }).filter((row) => typeof row.part_id === "string" && row.part_id.length > 0);

    const { error: insertUnitsError } = await sb.from("content_units").insert([...introRow, ...unitRows]);
    if (insertUnitsError) throw new Error("Failed to create practice delivery content units");
  }

  const keyRows = (Array.isArray(answerKeys) ? answerKeys : [])
    .map((row: any) => {
      const clonedUnitId = unitIdMap.get(String((row as any).content_unit_id ?? ""));
      if (!clonedUnitId) return null;
      return {
        content_unit_id: clonedUnitId,
        correct: isObject((row as any).correct) || Array.isArray((row as any).correct) ? (row as any).correct : {},
        metadata: {
          ...(isObject((row as any).metadata) ? ((row as any).metadata as JsonRecord) : {}),
          source_content_unit_id: String((row as any).content_unit_id ?? ""),
          practice_blueprint_id: blueprint.id,
        },
      };
    })
    .filter((row) => row != null);
  if (keyRows.length > 0) {
    const { error: insertKeysError } = await sb.from("answer_keys").insert(keyRows);
    if (insertKeysError) throw new Error("Failed to clone practice answer keys");
  }

  const labPayload = buildPracticeLabPayload(transformationPlan, Array.isArray(answerKeys) ? answerKeys : [], {
    sourceExperienceId: String((sourceExperience as any).id),
    sourceSectionId: String((sourceSection as any).id),
    sourceSectionName: toText((sourceSection as any).name, 240) || null,
    clonedUnitIdBySourceUnitId: unitIdMap,
  });
  const buildSummary = createBuildSummary(sourceExperience, sourceSection, selectedSourceParts, transformationPlan.selectedUnits, transformationPlan);
  const baseValidationSummary = createValidationSummary(buildSummary);
  const labValidation = isObject(labPayload.validation) ? labPayload.validation : {};
  const validationSummary = {
    ...baseValidationSummary,
    valid: baseValidationSummary.valid === true && labValidation.valid !== false,
    checks: {
      ...(isObject(baseValidationSummary.checks) ? baseValidationSummary.checks : {}),
      lab_payload_ready: labPayload.version === PRACTICE_LAB_SCHEMA_VERSION && labValidation.valid !== false,
    },
    lab: labPayload.validation,
  };
  const buildStatus = opts?.publish === true ? "published" : "draft";

  if (opts?.publish === true) {
    const { data: previousPublished } = await sb
      .from("ielts_practice_delivery_builds")
      .select("id,delivery_experience_id")
      .eq("blueprint_id", blueprint.id)
      .eq("status", "published");
    const previousBuildIds = (Array.isArray(previousPublished) ? previousPublished : []).map((row: any) => String(row.id ?? "")).filter(Boolean);
    const previousExperienceIds = (Array.isArray(previousPublished) ? previousPublished : []).map((row: any) => String(row.delivery_experience_id ?? "")).filter(Boolean);
    if (previousBuildIds.length > 0) {
      await sb.from("ielts_practice_delivery_builds").update({ status: "archived" }).in("id", previousBuildIds);
    }
    if (previousExperienceIds.length > 0) {
      await sb.from("experiences").update({ is_active: false }).in("id", previousExperienceIds);
    }
  }

  const { data: buildRow, error: buildError } = await sb
    .from("ielts_practice_delivery_builds")
    .insert({
      blueprint_id: blueprint.id,
      product_id: scope.practiceProductId,
      language_id: scope.languageId,
      source_product_id: blueprint.source_product_id ?? scope.simulatorProductId,
      source_experience_id: String((sourceExperience as any).id),
      source_section_id: String((sourceSection as any).id),
      delivery_experience_id: String((deliveryExperience as any).id),
      build_version: buildVersion,
      status: buildStatus,
      experience_kind: transformationPlan.experienceKind,
      build_summary: buildSummary,
      validation_summary: validationSummary,
      metadata: {
        created_by: adminUserId,
        section_type: sectionType,
        experience_kind: transformationPlan.experienceKind,
        delivery_schema_version: PRACTICE_DELIVERY_SCHEMA_VERSION,
        lab_payload: labPayload,
        lab_schema_version: PRACTICE_LAB_SCHEMA_VERSION,
      },
      created_by: adminUserId,
    })
    .select("id,blueprint_id,delivery_experience_id,source_product_id,source_experience_id,source_section_id,status,experience_kind,build_version,build_summary,validation_summary,metadata,created_at,updated_at")
    .maybeSingle();
  if (buildError || !buildRow) throw new Error("Failed to persist practice delivery build");

  const blueprintPatch: JsonRecord = {
    latest_delivery_build_id: String((buildRow as any).id),
    updated_by: adminUserId,
    section_type: sectionType,
    experience_kind: transformationPlan.experienceKind,
  };
  if (opts?.publish === true) blueprintPatch.status = "published";

  await sb
    .from("ielts_practice_blueprints")
    .update(blueprintPatch)
    .eq("id", blueprint.id);

  return buildRow as DeliveryBuildRow;
};

export const loadPublishedBlueprintCandidates = async (
  sb: any,
  scope: PracticeScope,
): Promise<Array<BlueprintRow & { latest_build: DeliveryBuildRow }>> => {
  const rows = await loadBlueprintsWithBuilds(sb, scope, { status: "published" });
  return rows
    .filter((row): row is BlueprintRow & { latest_build: DeliveryBuildRow } =>
      row.latest_build != null
      && row.latest_build.status === "published"
      && typeof row.latest_build.delivery_experience_id === "string"
      && row.latest_build.build_summary?.schema_version === PRACTICE_DELIVERY_SCHEMA_VERSION
      && row.latest_build.build_summary?.transformed === true
      && typeof row.latest_build.build_summary?.source_section_id === "string"
      && row.latest_build.build_summary.source_section_id.length > 0
      && isObject(row.latest_build.metadata?.lab_payload)
      && row.latest_build.metadata.lab_payload.version === PRACTICE_LAB_SCHEMA_VERSION
      && isObject(row.latest_build.metadata.lab_payload.validation)
      && row.latest_build.metadata.lab_payload.validation.valid !== false)
    .sort((a, b) => String(b.latest_build.updated_at ?? b.latest_build.created_at ?? "").localeCompare(String(a.latest_build.updated_at ?? a.latest_build.created_at ?? "")));
};
