type JsonRecord = Record<string, unknown>;

export type ItepSkillKey = 'reading' | 'listening' | 'grammar' | 'writing';
export type ItepFamily = 'academic' | 'slate' | 'business';
export type ItepVariant = 'core' | 'writing_live';

export type ItepResultShape = {
  overall_score?: number | null;
  itep?: {
    reading_score: number | null;
    listening_score: number | null;
    grammar_score: number | null;
    writing_score: number | null;
    composite_score: number | null;
    visible_scored_sections?: string[] | null;
  } | null;
  sections?: Record<
    string,
    {
      type?: string | null;
      scaled_score_6?: number | null;
      band?: number | null;
    }
  >;
};

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundNumber = (value: number, precision = 1): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const average = (values: number[]): number | null => {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const fallbackSectionAverage = (result: ItepResultShape, type: ItepSkillKey): number | null => {
  const sections = Object.values(result.sections ?? {});
  const matches = sections
    .filter((section) => String(section?.type ?? '').toLowerCase() === type)
    .map((section) => asNumber(section?.scaled_score_6) ?? asNumber(section?.band))
    .filter((value): value is number => value != null);
  const avg = average(matches);
  return avg != null ? roundNumber(avg, 1) : null;
};

export const getItepSkillScore = (result: ItepResultShape | null | undefined, type: ItepSkillKey): number | null => {
  if (!result) return null;
  const itep = result.itep ?? null;
  const direct = itep ? asNumber((itep as JsonRecord)[`${type}_score`]) : null;
  if (direct != null) return roundNumber(direct, 1);
  return fallbackSectionAverage(result, type);
};

export const getItepComposite = (result: ItepResultShape | null | undefined): number | null => {
  if (!result) return null;
  const direct = asNumber(result.itep?.composite_score) ?? asNumber(result.overall_score);
  if (direct != null) return roundNumber(direct, 1);

  const visibleScores = (['reading', 'listening', 'grammar', 'writing'] as ItepSkillKey[])
    .map((type) => getItepSkillScore(result, type))
    .filter((value): value is number => value != null);
  const avg = average(visibleScores);
  return avg != null ? roundNumber(avg, 1) : null;
};

export const getItepVisibleSectionTypes = (result: ItepResultShape | null | undefined): ItepSkillKey[] => {
  if (!result) return [];
  const visible = Array.isArray(result.itep?.visible_scored_sections)
    ? result.itep?.visible_scored_sections ?? []
    : Object.values(result.sections ?? {}).map((section) => String(section?.type ?? '').toLowerCase());
  return Array.from(
    new Set(
      visible.filter((type): type is ItepSkillKey =>
        ['reading', 'listening', 'grammar', 'writing'].includes(String(type)),
      ),
    ),
  );
};

export const formatItepFamily = (family: unknown): string => {
  const normalized = String(family ?? '').trim().toLowerCase();
  if (normalized === 'academic') return 'Academic';
  if (normalized === 'slate') return 'SLATE';
  if (normalized === 'business') return 'Business';
  return 'General';
};

export const formatItepVariant = (variant: unknown): string => {
  const normalized = String(variant ?? '').trim().toLowerCase();
  if (normalized === 'core') return 'Core';
  if (normalized === 'writing_live') return 'Writing Live';
  return 'Standard';
};

export const getItepCefrBand = (score: number | null): string => {
  if (score == null) return 'Pending';
  if (score >= 5.5) return 'CEFR C2';
  if (score >= 4.5) return 'CEFR C1';
  if (score >= 3.5) return 'CEFR B2';
  if (score >= 2.5) return 'CEFR B1';
  if (score >= 2.0) return 'CEFR A2';
  if (score > 0) return 'CEFR A1';
  return 'Below A1';
};

export const getItepScoreMeaning = (score: number | null): string => {
  if (score == null) return 'Finish a scored section to generate your estimate.';
  if (score >= 5.5) return 'Mastery to near-top band';
  if (score >= 5.0) return 'Advanced academic or workplace control';
  if (score >= 4.0) return 'Upper-intermediate, typically B2-aligned';
  if (score >= 3.0) return 'Intermediate independent-user range';
  if (score >= 2.0) return 'Elementary to developing proficiency';
  if (score > 0) return 'Beginner to limited ability';
  return 'No measurable performance yet';
};
