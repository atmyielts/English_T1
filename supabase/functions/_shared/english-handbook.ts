// Grammar handbook: every published grammar rule as a reference page.
//
// The English explanation is the unit's own `explanation_text`; Russian and
// Uzbek explanations live in `grammar_units.metadata.explanation_ru` /
// `explanation_uz` (seeded by 20261024123000_english_grammar_handbook.sql).
// A missing translation is sent as null so the app can fall back to English.
// Pure helpers only, so they can be unit-tested without a database.

export const HANDBOOK_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type HandbookLevel = (typeof HANDBOOK_LEVELS)[number];

export type HandbookExample = { bad: string | null; good: string };

export type HandbookEntry = {
  slug: string;
  title: string;
  level: HandbookLevel;
  focus_area: string | null;
  explanation: { en: string; ru: string | null; uz: string | null };
  contrast_text: string | null;
  common_error_pattern: string | null;
  examples: HandbookExample[];
};

/** Columns the handbook needs from grammar_units. */
export const HANDBOOK_COLUMNS = "slug, title, level, focus_area, explanation_text, contrast_text, common_error_pattern, examples_json, sort_order, metadata";

const text = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

const isLevel = (value: unknown): value is HandbookLevel =>
  typeof value === "string" && (HANDBOOK_LEVELS as readonly string[]).includes(value);

/** One grammar_units row as a handbook entry, or null when it can't be shown. */
export const handbookEntry = (row: Record<string, unknown>): HandbookEntry | null => {
  const slug = text(row.slug, 160);
  const title = text(row.title, 220);
  const english = text(row.explanation_text, 4000);
  const level = typeof row.level === "string" ? row.level.trim().toUpperCase() : "";
  if (!slug || !title || !english || !isLevel(level)) return null;

  const meta = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const examples = (Array.isArray(row.examples_json) ? row.examples_json : [])
    .flatMap((example): HandbookExample[] => {
      if (!example || typeof example !== "object") return [];
      const record = example as Record<string, unknown>;
      const good = text(record.good, 400);
      return good ? [{ bad: text(record.bad, 400), good }] : [];
    })
    .slice(0, 8);

  return {
    slug,
    title,
    level,
    focus_area: text(row.focus_area, 80),
    explanation: {
      en: english,
      ru: text(meta.explanation_ru, 4000),
      uz: text(meta.explanation_uz, 4000),
    },
    contrast_text: text(row.contrast_text, 1000),
    common_error_pattern: text(row.common_error_pattern, 1000),
    examples,
  };
};

/** All showable entries, one per slug, ordered by level, then the library order, then title. */
export const buildHandbook = (rows: Array<Record<string, unknown>>): HandbookEntry[] => {
  const seen = new Set<string>();
  return rows
    .map((row) => ({ entry: handbookEntry(row), order: Number(row.sort_order ?? 0) || 0 }))
    .filter((item): item is { entry: HandbookEntry; order: number } => item.entry !== null)
    .sort((a, b) =>
      HANDBOOK_LEVELS.indexOf(a.entry.level) - HANDBOOK_LEVELS.indexOf(b.entry.level)
      || a.order - b.order
      || a.entry.title.localeCompare(b.entry.title))
    .flatMap(({ entry }) => {
      if (seen.has(entry.slug)) return [];
      seen.add(entry.slug);
      return [entry];
    });
};
