// Grammar mastery for one learner, read from their lesson results
// (rules in _shared/english-grammar-mastery.ts).

import { dueRechecks, type UnitAttempt, unitMastery, type UnitMastery } from "../_shared/english-grammar-mastery.ts";

type Row = Record<string, unknown>;

const relation = (row: Row): Row => {
  const value = row.learning_content_registry_items;
  return ((Array.isArray(value) ? value[0] : value) ?? {}) as Row;
};

/** Lesson results per unit slug, oldest first (one year back). */
export const loadUnitAttempts = async (sb: any, userId: string, languageId: string, slug?: string): Promise<Map<string, UnitAttempt[]>> => {
  let query = sb
    .from("learning_attempts")
    .select("correctness_ratio, overall_score, submitted_at, learning_content_registry_items!inner(source_ref, content_type)")
    .eq("user_id", userId)
    .eq("language_id", languageId)
    .eq("service_key", "grammar")
    .eq("learning_content_registry_items.content_type", "grammar.unit")
    .in("status", ["scored", "submitted"])
    .not("submitted_at", "is", null)
    .gte("submitted_at", new Date(Date.now() - 365 * 86_400_000).toISOString())
    .order("submitted_at", { ascending: true })
    .limit(2000);
  if (slug) query = query.eq("learning_content_registry_items.source_ref", slug);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load grammar results: ${error.message}`);
  const out = new Map<string, UnitAttempt[]>();
  for (const row of (data ?? []) as Row[]) {
    const unitSlug = String(relation(row).source_ref ?? "");
    if (!unitSlug) continue;
    const raw = row.correctness_ratio ?? row.overall_score;
    const score = raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? null : Math.max(0, Math.min(1, Number(raw)));
    const list = out.get(unitSlug) ?? [];
    list.push({ score, submitted_at: String(row.submitted_at) });
    out.set(unitSlug, list);
  }
  return out;
};

export type UnitWithMastery = { slug: string; title: string; level: string | null; focus_area: string | null; mastery: UnitMastery };

/** Every published unit with the learner's mastery, and the re-checks that are due. */
export const masteryOverview = async (sb: any, input: { userId: string; languageId: string; productId: string }) => {
  const [unitsRes, attempts] = await Promise.all([
    sb.from("grammar_units")
      .select("slug, title, level, focus_area, sort_order")
      .eq("product_id", input.productId)
      .eq("language_id", input.languageId)
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    loadUnitAttempts(sb, input.userId, input.languageId),
  ]);
  if (unitsRes.error) throw new Error(`Failed to load grammar units: ${unitsRes.error.message}`);
  const now = new Date();
  const units: UnitWithMastery[] = ((unitsRes.data ?? []) as Row[]).map((unit) => ({
    slug: String(unit.slug),
    title: String(unit.title ?? ""),
    level: unit.level ? String(unit.level) : null,
    focus_area: unit.focus_area ? String(unit.focus_area) : null,
    mastery: unitMastery(attempts.get(String(unit.slug)) ?? [], now),
  }));
  const counts = { new: 0, started: 0, practising: 0, secure: 0, mastered: 0 } as Record<string, number>;
  for (const unit of units) counts[unit.mastery.name] = (counts[unit.mastery.name] ?? 0) + 1;
  return { units, due: dueRechecks(units).slice(0, 10), counts };
};

/** One unit's mastery (after a submit, the attempt just recorded is included). */
export const unitMasteryFor = async (sb: any, userId: string, languageId: string, slug: string): Promise<UnitMastery> => {
  const attempts = await loadUnitAttempts(sb, userId, languageId, slug);
  return unitMastery(attempts.get(slug) ?? []);
};
