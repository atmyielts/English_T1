import type {
  AiImportPayloadV1,
  CanonicalImportPayloadLike,
  CanonicalImportSectionLike,
  NormalizationReport,
} from './aiSchema';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const readNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const readBoolean = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

const pushUnique = (list: string[], value: string) => {
  if (!value.trim()) return;
  if (!list.includes(value)) list.push(value);
};

const safeObject = (value: unknown): Record<string, unknown> => (isObject(value) ? value : {});

type NormalizeResult = {
  payload: CanonicalImportPayloadLike | null;
  warnings: string[];
  errors: string[];
  autoDefaults: string[];
  report: NormalizationReport;
};

const pickName = (
  obj: Record<string, unknown>,
  path: string,
  warnings: string[],
): string => {
  const name = readString(obj.name);
  if (name) return name;
  const title = readString(obj.title);
  if (title) {
    pushUnique(warnings, `${path}: mapped "title" to "name".`);
    return title;
  }
  return '';
};

const pickDisplayOrder = (
  obj: Record<string, unknown>,
  path: string,
  fallback: number,
  warnings: string[],
  autoDefaults: string[],
): number => {
  const displayOrder = readNumber(obj.display_order);
  if (displayOrder !== null) return Math.floor(displayOrder);
  const order = readNumber(obj.order);
  if (order !== null) {
    pushUnique(warnings, `${path}: mapped "order" to "display_order".`);
    return Math.floor(order);
  }
  pushUnique(autoDefaults, `${path}: defaulted display_order=${fallback}.`);
  return fallback;
};

const pickIsActive = (
  obj: Record<string, unknown>,
  warnings: string[],
  autoDefaults: string[],
): boolean => {
  const isActive = readBoolean(obj.is_active);
  if (isActive !== null) return isActive;
  const active = readBoolean(obj.active);
  if (active !== null) {
    pushUnique(warnings, 'experience: mapped "active" to "is_active".');
    return active;
  }
  pushUnique(autoDefaults, 'experience: defaulted is_active=false.');
  return false;
};

const pickSections = (
  root: Record<string, unknown>,
  examLike: Record<string, unknown>,
  warnings: string[],
): unknown[] => {
  const rootSections = asArray<unknown>(root.sections);
  if (rootSections.length > 0) return rootSections;

  const examSections = asArray<unknown>(examLike.sections);
  if (examSections.length > 0) {
    if (root !== examLike) {
      pushUnique(warnings, 'mapped nested sections to top-level canonical sections.');
    }
    return examSections;
  }

  return [];
};

const pickExamLike = (
  root: Record<string, unknown>,
  warnings: string[],
): Record<string, unknown> => {
  if (isObject(root.exam)) {
    pushUnique(warnings, 'mapped root.exam to canonical experience.');
    return root.exam;
  }
  if (isObject(root.test)) {
    pushUnique(warnings, 'mapped root.test to canonical experience.');
    return root.test;
  }
  if (isObject(root.experience)) {
    return root.experience;
  }
  return root;
};

const normalizeUnitAnswerKey = (
  unit: Record<string, unknown>,
  path: string,
  warnings: string[],
  errors: string[],
): Record<string, unknown> | undefined => {
  if (isObject(unit.answer_key)) return unit.answer_key;

  if (isObject(unit.answerKey)) {
    pushUnique(warnings, `${path}: mapped "answerKey" to "answer_key".`);
    return unit.answerKey;
  }

  if (isObject(unit.correct)) {
    pushUnique(warnings, `${path}: mapped "correct" to "answer_key.correct".`);
    return { correct: unit.correct };
  }

  const hasInvalidAnswerShape =
    unit.answer_key !== undefined || unit.answerKey !== undefined || unit.correct !== undefined;
  if (hasInvalidAnswerShape) {
    pushUnique(errors, `${path}: answer_key/answerKey/correct must be an object when provided.`);
  }
  return undefined;
};

export const normalizeAiToCanonical = (input: unknown, productId: string): NormalizeResult => {
  const warnings: string[] = [];
  const errors: string[] = [];
  const autoDefaults: string[] = [];

  if (!isObject(input)) {
    const message = 'Input JSON must be an object.';
    return {
      payload: null,
      warnings,
      errors: [message],
      autoDefaults,
      report: { warnings, errors: [message], autoDefaults },
    };
  }

  const root = input as AiImportPayloadV1 & Record<string, unknown>;
  const examLike = pickExamLike(root, warnings);

  const sourceProduct = readString(root.product_id) || readString((examLike as any).product_id);
  if (sourceProduct && sourceProduct !== productId) {
    pushUnique(warnings, `Overriding payload product_id "${sourceProduct}" with selected product "${productId}".`);
  }

  const experienceName = pickName(examLike, 'experience', warnings);
  if (!experienceName) {
    pushUnique(errors, 'experience.name is required (or provide title).');
  }

  const experienceDisplayOrder = pickDisplayOrder(examLike, 'experience', 0, warnings, autoDefaults);
  const experienceIsActive = pickIsActive(examLike, warnings, autoDefaults);
  const experienceMetadata = safeObject(examLike.metadata);
  const experienceId = readString(examLike.id);
  const experienceVersion = readNumber(examLike.version);

  const sectionsInput = pickSections(root, examLike, warnings);
  if (sectionsInput.length === 0) {
    pushUnique(errors, 'sections must be a non-empty array.');
  }

  const sections: CanonicalImportSectionLike[] = [];

  sectionsInput.forEach((rawSection, sectionIndex) => {
    const sectionPath = `sections[${sectionIndex}]`;
    if (!isObject(rawSection)) {
      pushUnique(errors, `${sectionPath} must be an object.`);
      return;
    }

    const sectionName = pickName(rawSection, sectionPath, warnings);
    if (!sectionName) {
      pushUnique(errors, `${sectionPath}.name is required.`);
    }

    const sectionDisplayOrder = pickDisplayOrder(rawSection, sectionPath, sectionIndex + 1, warnings, autoDefaults);
    const sectionMetadata = safeObject(rawSection.metadata);
    const sectionId = readString(rawSection.id);

    const partsInput = asArray<unknown>(rawSection.parts);
    if (partsInput.length === 0) {
      pushUnique(errors, `${sectionPath}.parts must be a non-empty array.`);
    }

    const parts: Array<{
      id?: string;
      name: string;
      display_order: number;
      metadata: Record<string, unknown>;
      content_units: Array<{
        id?: string;
        type: string;
        display_order: number;
        data: Record<string, unknown>;
        metadata: Record<string, unknown>;
        answer_key?: Record<string, unknown>;
      }>;
    }> = [];

    partsInput.forEach((rawPart, partIndex) => {
      const partPath = `${sectionPath}.parts[${partIndex}]`;
      if (!isObject(rawPart)) {
        pushUnique(errors, `${partPath} must be an object.`);
        return;
      }

      const partName = pickName(rawPart, partPath, warnings);
      if (!partName) {
        pushUnique(errors, `${partPath}.name is required.`);
      }

      const partDisplayOrder = pickDisplayOrder(rawPart, partPath, partIndex + 1, warnings, autoDefaults);
      const partMetadata = safeObject(rawPart.metadata);
      const partId = readString(rawPart.id);

      const contentUnitsInput = asArray<unknown>(rawPart.content_units);
      const unitsInput = asArray<unknown>(rawPart.units);
      const pickedUnits = contentUnitsInput.length > 0 ? contentUnitsInput : unitsInput;

      if (contentUnitsInput.length === 0 && unitsInput.length > 0) {
        pushUnique(warnings, `${partPath}: mapped "units" to "content_units".`);
      }

      if (pickedUnits.length === 0) {
        pushUnique(errors, `${partPath}.content_units must be a non-empty array.`);
      }

      const contentUnits: Array<{
        id?: string;
        type: string;
        display_order: number;
        data: Record<string, unknown>;
        metadata: Record<string, unknown>;
        answer_key?: Record<string, unknown>;
      }> = [];

      pickedUnits.forEach((rawUnit, unitIndex) => {
        const unitPath = `${partPath}.content_units[${unitIndex}]`;
        if (!isObject(rawUnit)) {
          pushUnique(errors, `${unitPath} must be an object.`);
          return;
        }

        const type = readString(rawUnit.type);
        if (!type) {
          pushUnique(errors, `${unitPath}.type is required.`);
        }

        const data = rawUnit.data;
        if (!isObject(data)) {
          pushUnique(errors, `${unitPath}.data must be an object.`);
        }

        const unitDisplayOrder = pickDisplayOrder(rawUnit, unitPath, unitIndex + 1, warnings, autoDefaults);
        const unitMetadata = safeObject(rawUnit.metadata);
        const unitId = readString(rawUnit.id);
        const answerKey = normalizeUnitAnswerKey(rawUnit, unitPath, warnings, errors);

        if (type && isObject(data)) {
          contentUnits.push({
            ...(unitId ? { id: unitId } : {}),
            type,
            display_order: unitDisplayOrder,
            data,
            metadata: unitMetadata,
            ...(answerKey ? { answer_key: answerKey } : {}),
          });
        }
      });

      if (partName && contentUnits.length > 0) {
        parts.push({
          ...(partId ? { id: partId } : {}),
          name: partName,
          display_order: partDisplayOrder,
          metadata: partMetadata,
          content_units: contentUnits,
        });
      }
    });

    if (sectionName && parts.length > 0) {
      sections.push({
        ...(sectionId ? { id: sectionId } : {}),
        name: sectionName,
        display_order: sectionDisplayOrder,
        metadata: sectionMetadata,
        parts,
      });
    }
  });

  if (sections.length === 0) {
    pushUnique(errors, 'No valid sections could be normalized.');
  }

  if (errors.length > 0) {
    return {
      payload: null,
      warnings,
      errors,
      autoDefaults,
      report: { warnings, errors, autoDefaults },
    };
  }

  const payload: CanonicalImportPayloadLike = {
    product_id: productId,
    experience: {
      ...(experienceId ? { id: experienceId } : {}),
      ...(experienceVersion !== null ? { version: Math.floor(experienceVersion) } : {}),
      name: experienceName,
      display_order: experienceDisplayOrder,
      is_active: experienceIsActive,
      metadata: experienceMetadata,
    },
    sections,
  };

  return {
    payload,
    warnings,
    errors,
    autoDefaults,
    report: { warnings, errors, autoDefaults },
  };
};
