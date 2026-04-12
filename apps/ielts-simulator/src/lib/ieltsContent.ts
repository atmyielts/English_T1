import type {
  AdminBuilderPayload,
  AdminPartTemplatePayload,
  AdminSectionTemplatePayload,
} from './platformClient';
import { normalizeAiToCanonical } from './import/aiToCanonical';

export type JsonObject = Record<string, unknown>;
export type ModuleType = 'listening' | 'reading' | 'writing';

export type IeltsContentUnitV1 = {
  type: string;
  display_order?: number;
  data: JsonObject;
  metadata?: JsonObject;
  answer_key?: { correct: JsonObject; metadata?: JsonObject } | null;
};

export type IeltsPartPayloadV1 = {
  name: string;
  display_order?: number;
  metadata?: JsonObject;
  content_units: IeltsContentUnitV1[];
};

export type IeltsPartTemplateV1 = {
  schema_version: 'ielts.content.v1';
  entity_type: 'part';
  module_type: ModuleType;
  template_key?: string;
  name: string;
  metadata?: JsonObject;
  content_units: IeltsContentUnitV1[];
};

export type IeltsSectionTemplateV1 = {
  schema_version: 'ielts.content.v1';
  entity_type: 'section';
  module_type: ModuleType;
  template_key?: string;
  name: string;
  metadata?: JsonObject;
  parts: IeltsPartPayloadV1[];
};

export type IeltsMockTestSectionRefV1 = {
  module_type: ModuleType;
  section_template_key: string;
  section_template_version: number;
};

export type IeltsMockTestV1 = {
  schema_version: 'ielts.content.v1';
  entity_type: 'mock_test';
  name: string;
  display_order?: number;
  is_active?: boolean;
  price_amount?: number | null;
  price_currency?: string | null;
  metadata?: JsonObject;
  sections: IeltsMockTestSectionRefV1[];
};

export type NormalizedMockImport = {
  mock: IeltsMockTestV1;
  sections: IeltsSectionTemplateV1[];
};

const MODULE_ORDER: ModuleType[] = ['listening', 'reading', 'writing'];

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asObject = (value: unknown): JsonObject => (isObject(value) ? value : {});
const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value ?? null)) as T;

export const slugifyTemplateKey = (value: string, fallback = 'template'): string => {
  const out = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out || fallback;
};

export const expectedPartCount = (moduleType: ModuleType): number =>
  moduleType === 'listening' ? 4 : moduleType === 'reading' ? 3 : 2;

export const moduleLabel = (moduleType: ModuleType): string =>
  moduleType === 'listening' ? 'Listening' : moduleType === 'reading' ? 'Reading' : 'Writing';

const moduleOrder = (moduleType: ModuleType): number => {
  const index = MODULE_ORDER.indexOf(moduleType);
  return index >= 0 ? index : MODULE_ORDER.length;
};

const isQuestionUnitType = (value: unknown): boolean => readString(value).toLowerCase().startsWith('question_');

const countObjectKeys = (value: unknown): number => (isObject(value) ? Object.keys(value).length : 0);

const countTableBlanks = (value: unknown): number =>
  asArray<unknown>(value).reduce<number>(
    (total, row) =>
      total +
      asArray<unknown>(row).reduce<number>(
        (rowTotal, cell) => rowTotal + (readString(asObject(cell).blank_id) ? 1 : 0),
        0,
      ),
    0,
  );

const countQuestionItems = (unit: IeltsContentUnitV1): number => {
  if (!isQuestionUnitType(unit.type)) return 0;

  const correct = asObject(unit.answer_key?.correct);
  const data = asObject(unit.data);

  if (unit.type === 'question_single_choice' || unit.type === 'question_multi_choice' || unit.type === 'question_text') {
    return 1;
  }

  if (
    unit.type === 'question_matching' ||
    unit.type === 'question_matching_headings' ||
    unit.type === 'question_sentence_endings'
  ) {
    return countObjectKeys(correct.matches) || asArray<unknown>(data.items).length;
  }

  if (unit.type === 'question_true_false_not_given' || unit.type === 'question_yes_no_not_given') {
    return countObjectKeys(correct.matches) || asArray<unknown>(data.statements).length;
  }

  if (unit.type === 'question_gap_fill' || unit.type === 'question_select_from_list') {
    return countObjectKeys(correct.blanks) || asArray<unknown>(data.blanks).length;
  }

  if (unit.type === 'question_table_completion') {
    return countObjectKeys(correct.cells) || countTableBlanks(data.rows);
  }

  if (unit.type === 'question_diagram_labeling') {
    return countObjectKeys(correct.labels) || asArray<unknown>(data.labels).length;
  }

  if (unit.type === 'question_drag_drop') {
    return countObjectKeys(correct.targets) || asArray<unknown>(data.targets).length;
  }

  return 0;
};

const renumberPartQuestions = (part: IeltsPartPayloadV1, nextQuestionNumber: number): { part: IeltsPartPayloadV1; nextQuestionNumber: number } => {
  let current = nextQuestionNumber;

  return {
    part: {
      ...part,
      content_units: part.content_units.map((unit, index) => {
        const questionCount = countQuestionItems(unit);
        const metadata = clone(asObject(unit.metadata));
        if (questionCount > 0) {
          metadata.question_number = current;
          current += questionCount;
        }
        return {
          ...unit,
          display_order: unit.display_order ?? index + 1,
          metadata,
        };
      }),
    },
    nextQuestionNumber: current,
  };
};

export const renumberSectionQuestions = (section: IeltsSectionTemplateV1): IeltsSectionTemplateV1 => {
  let current = 1;

  return {
    ...section,
    parts: section.parts.map((part, index) => {
      const result = renumberPartQuestions(
        {
          ...part,
          display_order: part.display_order ?? index + 1,
        },
        current,
      );
      current = result.nextQuestionNumber;
      return result.part;
    }),
  };
};

export const sortMockSectionRefs = (sections: IeltsMockTestSectionRefV1[]): IeltsMockTestSectionRefV1[] =>
  sections.slice().sort((left, right) => moduleOrder(left.module_type) - moduleOrder(right.module_type));

export const downloadJsonFile = (filename: string, value: unknown): void => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const normalizeUnit = (rawUnit: unknown, index: number): IeltsContentUnitV1 => {
  const unit = asObject(rawUnit);
  const answerKey = asObject(unit.answer_key);
  return {
    type: readString(unit.type) || 'instruction',
    display_order: Number.isFinite(Number(unit.display_order)) ? Math.floor(Number(unit.display_order)) : index + 1,
    data: clone(asObject(unit.data)),
    metadata: clone(asObject(unit.metadata)),
    answer_key: isObject(answerKey.correct)
      ? {
          correct: clone(asObject(answerKey.correct)),
          metadata: clone(asObject(answerKey.metadata)),
        }
      : null,
  };
};

const normalizePartPayload = (rawPart: unknown, index: number, fallbackName: string): IeltsPartPayloadV1 => {
  const part = asObject(rawPart);
  const contentUnits = asArray<unknown>(part.content_units);
  return {
    name: readString(part.name) || fallbackName,
    display_order: Number.isFinite(Number(part.display_order)) ? Math.floor(Number(part.display_order)) : index + 1,
    metadata: clone(asObject(part.metadata)),
    content_units: contentUnits.map((unit, unitIndex) => normalizeUnit(unit, unitIndex)),
  };
};

export const normalizePartTemplateInput = (
  raw: unknown,
  fallbackModuleType: ModuleType,
): IeltsPartTemplateV1 => {
  const root = asObject(raw);
  const partPayload = isObject(root.part_payload) ? root.part_payload : root;
  const moduleType = (readString(root.module_type || root.section_type).toLowerCase() as ModuleType) || fallbackModuleType;
  const normalized = normalizePartPayload(partPayload, 0, moduleType === 'reading' ? 'Passage 1' : moduleType === 'writing' ? 'Task 1' : 'Part 1');
  return {
    schema_version: 'ielts.content.v1',
    entity_type: 'part',
    module_type: moduleType,
    template_key: readString(root.template_key),
    name: normalized.name,
    metadata: normalized.metadata,
    content_units: normalized.content_units,
  };
};

export const normalizeSectionTemplateInput = (
  raw: unknown,
  fallbackModuleType: ModuleType,
): IeltsSectionTemplateV1 => {
  const root = asObject(raw);
  const sectionPayload = isObject(root.section_payload) ? root.section_payload : root;
  const explicitType = readString(root.module_type || root.section_type || asObject(sectionPayload.metadata).type).toLowerCase() as ModuleType;
  const moduleType = explicitType || fallbackModuleType;
  const parts = asArray<unknown>(sectionPayload.parts).map((part, index) =>
    normalizePartPayload(
      part,
      index,
      moduleType === 'reading' ? `Passage ${index + 1}` : moduleType === 'writing' ? `Task ${index + 1}` : `Part ${index + 1}`,
    ),
  );
  return renumberSectionQuestions({
    schema_version: 'ielts.content.v1',
    entity_type: 'section',
    module_type: moduleType,
    template_key: readString(root.template_key),
    name: readString(sectionPayload.name) || moduleLabel(moduleType),
    metadata: { ...clone(asObject(sectionPayload.metadata)), type: moduleType },
    parts,
  });
};

export const normalizeMockTestInput = (
  raw: unknown,
  productId: string,
): NormalizedMockImport => {
  const root = asObject(raw);

  if (readString(root.entity_type) === 'mock_test') {
    const sections = asArray<unknown>(root.sections)
      .map((entry) => asObject(entry))
      .map((entry) => ({
        module_type: readString(entry.module_type).toLowerCase() as ModuleType,
        section_template_key: readString(entry.section_template_key),
        section_template_version: Number(entry.section_template_version ?? 0),
      }))
      .filter((entry) => entry.module_type && entry.section_template_key && Number.isFinite(entry.section_template_version));

    return {
      mock: {
        schema_version: 'ielts.content.v1',
        entity_type: 'mock_test',
        name: readString(root.name) || 'Untitled IELTS Mock Test',
        display_order: Number.isFinite(Number(root.display_order)) ? Math.floor(Number(root.display_order)) : 0,
        is_active: typeof root.is_active === 'boolean' ? Boolean(root.is_active) : false,
        price_amount: Number.isFinite(Number(root.price_amount)) ? Number(root.price_amount) : null,
        price_currency: readString(root.price_currency) || 'UZS',
        metadata: clone(asObject(root.metadata)),
        sections: sortMockSectionRefs(sections),
      },
      sections: [],
    };
  }

  const normalized = normalizeAiToCanonical(raw, productId);
  if (!normalized.payload) {
    throw new Error(normalized.errors.join('\n') || 'Could not normalize mock test JSON.');
  }

  const sections = normalized.payload.sections.map((section) => {
    const metadata = clone(asObject(section.metadata));
    const moduleType = readString((metadata as any).type).toLowerCase() as ModuleType;
    const parts = asArray<unknown>(section.parts).map((part, index) =>
      normalizePartPayload(
        part,
        index,
        moduleType === 'reading' ? `Passage ${index + 1}` : moduleType === 'writing' ? `Task ${index + 1}` : `Part ${index + 1}`,
      ),
    );
    return {
      schema_version: 'ielts.content.v1',
      entity_type: 'section',
      module_type: moduleType,
      template_key: readString((metadata as any).template_key),
      name: section.name,
      metadata,
      parts,
    } as IeltsSectionTemplateV1;
  });

  return {
    mock: {
      schema_version: 'ielts.content.v1',
      entity_type: 'mock_test',
      name: normalized.payload.experience.name,
      display_order: normalized.payload.experience.display_order ?? 0,
      is_active: normalized.payload.experience.is_active ?? false,
      price_amount: Number.isFinite(Number((normalized.payload.experience as any).price_amount))
        ? Number((normalized.payload.experience as any).price_amount)
        : null,
      price_currency: readString((normalized.payload.experience as any).price_currency) || 'UZS',
      metadata: clone(asObject(normalized.payload.experience.metadata)),
      sections: [],
    },
    sections,
  };
};

export const partTemplatePayloadToCanonical = (
  payload: AdminPartTemplatePayload,
): IeltsPartTemplateV1 =>
  normalizePartTemplateInput(
    {
      entity_type: 'part',
      module_type: payload.module_type,
      template_key: payload.template_key,
      template_name: payload.template_name,
      ...(isObject(payload.part_payload) ? payload.part_payload : {}),
    },
    payload.module_type,
  );

export const sectionTemplatePayloadToCanonical = (
  payload: AdminSectionTemplatePayload,
): IeltsSectionTemplateV1 =>
  normalizeSectionTemplateInput(
    {
      entity_type: 'section',
      module_type: payload.section_type,
      template_key: payload.template_key,
      ...(isObject(payload.section_payload) ? payload.section_payload : {}),
    },
    payload.section_type as ModuleType,
  );

export const canonicalPartToTemplatePayload = (part: IeltsPartTemplateV1): JsonObject => ({
  name: part.name,
  metadata: clone(part.metadata ?? {}),
  content_units: part.content_units.map((unit, index) => ({
    type: unit.type,
    display_order: unit.display_order ?? index + 1,
    data: clone(unit.data),
    metadata: clone(unit.metadata ?? {}),
    answer_key: unit.answer_key
      ? { correct: clone(unit.answer_key.correct), metadata: clone(unit.answer_key.metadata ?? {}) }
      : null,
  })),
});

export const canonicalSectionToTemplatePayload = (section: IeltsSectionTemplateV1): JsonObject => ({
  name: section.name,
  metadata: { ...clone(section.metadata ?? {}), type: section.module_type },
  parts: section.parts.map((part, index) => ({
    name: part.name,
    display_order: part.display_order ?? index + 1,
    metadata: clone(part.metadata ?? {}),
    content_units: part.content_units.map((unit, unitIndex) => ({
      type: unit.type,
      display_order: unit.display_order ?? unitIndex + 1,
      data: clone(unit.data),
      metadata: clone(unit.metadata ?? {}),
      answer_key: unit.answer_key
        ? { correct: clone(unit.answer_key.correct), metadata: clone(unit.answer_key.metadata ?? {}) }
        : null,
    })),
  })),
});

export const canonicalSectionToAdminSection = (
  section: IeltsSectionTemplateV1,
): AdminBuilderPayload['sections'][number] => ({
  name: section.name,
  metadata: { ...clone(section.metadata ?? {}), type: section.module_type },
  parts: section.parts.map((part, index) => ({
    name: part.name,
    display_order: part.display_order ?? index + 1,
    metadata: clone(part.metadata ?? {}),
    content_units: part.content_units.map((unit, unitIndex) => ({
      type: unit.type,
      display_order: unit.display_order ?? unitIndex + 1,
      data: clone(unit.data),
      metadata: clone(unit.metadata ?? {}),
      answer_key: unit.answer_key
        ? { correct: clone(unit.answer_key.correct), metadata: clone(unit.answer_key.metadata ?? {}) }
        : null,
    })),
  })),
});

export const builderSectionToCanonicalSection = (
  section: AdminBuilderPayload['sections'][number],
): IeltsSectionTemplateV1 => {
  const metadata = clone(asObject(section.metadata));
  const moduleType = (readString((metadata as any).type).toLowerCase() as ModuleType) || 'reading';
  return {
    schema_version: 'ielts.content.v1',
    entity_type: 'section',
    module_type: moduleType,
    template_key: readString(asObject((metadata as any).template_ref).template_key),
    name: section.name,
    metadata,
    parts: section.parts.map((part, index) => ({
      name: part.name,
      display_order: part.display_order ?? index + 1,
      metadata: clone(asObject(part.metadata)),
      content_units: part.content_units.map((unit, unitIndex) => ({
        type: unit.type,
        display_order: unit.display_order ?? unitIndex + 1,
        data: clone(asObject(unit.data)),
        metadata: clone(asObject(unit.metadata)),
        answer_key: unit.answer_key && isObject(unit.answer_key.correct)
          ? {
              correct: clone(asObject(unit.answer_key.correct)),
              metadata: clone(asObject(unit.answer_key.metadata)),
            }
          : null,
      })),
    })),
  };
};

export const createMockTestExport = (input: {
  name: string;
  display_order?: number;
  is_active?: boolean;
  price_amount?: number | null;
  price_currency?: string | null;
  metadata?: JsonObject;
  sections: IeltsMockTestSectionRefV1[];
}): IeltsMockTestV1 => ({
  schema_version: 'ielts.content.v1',
  entity_type: 'mock_test',
  name: input.name,
  display_order: input.display_order ?? 0,
  is_active: input.is_active ?? false,
  price_amount: input.price_amount ?? null,
  price_currency: input.price_currency ?? 'UZS',
  metadata: clone(input.metadata ?? {}),
  sections: sortMockSectionRefs(input.sections),
});
