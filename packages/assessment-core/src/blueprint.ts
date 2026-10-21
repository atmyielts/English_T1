/** Provider-free classification and exact, bounded constrained form assembly.
 * Estimates are authored labels, never calibrated psychometric difficulty. */
export const BLUEPRINT_PROTOCOL = "assessment.blueprint.v1";
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = typeof DIFFICULTIES[number];
export interface Classification {
  topics: string[];
  estimated_difficulty?: Difficulty;
}
export interface BlueprintRule {
  id: string;
  label: string;
  topics: string[];
  difficulties: Difficulty[];
  types: string[];
  all_topics: boolean;
  minimum: number;
  maximum: number;
}
export interface Blueprint {
  schema_version: typeof BLUEPRINT_PROTOCOL;
  rules: BlueprintRule[];
  minimum_points?: number;
  maximum_points?: number;
}
export interface BlueprintCandidate {
  id: string;
  item: { type: string; max_score: number; classification?: Classification };
}
export class BlueprintError extends Error {
  constructor(
    public code:
      | "invalid_blueprint"
      | "blueprint_infeasible"
      | "blueprint_search_limit",
    message: string,
  ) {
    super(message);
    this.name = "BlueprintError";
  }
}
const invalid = (message: string): never => {
  throw new BlueprintError("invalid_blueprint", message);
};
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown>
    : invalid("Use a structured blueprint object.");
const fields = (v: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(v).some((key) => !allowed.includes(key))) {
    invalid("The blueprint contains unsupported fields.");
  }
};
function strings(v: unknown, max: number, length = 80) {
  if (!Array.isArray(v) || v.length > max) {
    invalid("Too many or malformed blueprint labels.");
  }
  const result = (v as unknown[]).map((value) =>
    typeof value === "string" && value.trim().length > 0 &&
      value.length <= length
      ? value.trim()
      : invalid("Blueprint labels must be non-empty text.")
  );
  if (new Set(result).size !== result.length) {
    invalid("Blueprint labels must not repeat.");
  }
  return result;
}
export function classification(v: unknown): Classification {
  const data = object(v);
  fields(data, ["topics", "estimated_difficulty"]);
  const topics = strings(data.topics ?? [], 20),
    difficulty = data.estimated_difficulty;
  if (
    difficulty !== undefined &&
    !(DIFFICULTIES as readonly unknown[]).includes(difficulty)
  ) invalid("Choose easy, medium or hard as an author-estimated difficulty.");
  if (!topics.length && difficulty === undefined) {
    invalid("Set a topic or an author-estimated difficulty.");
  }
  return {
    topics,
    ...(difficulty === undefined
      ? {}
      : { estimated_difficulty: difficulty as Difficulty }),
  };
}
export function blueprint(
  v: unknown,
  draw: number,
  types: readonly string[],
): Blueprint {
  const data = object(v);
  fields(data, ["schema_version", "rules", "minimum_points", "maximum_points"]);
  if (
    data.schema_version !== BLUEPRINT_PROTOCOL || !Array.isArray(data.rules) ||
    data.rules.length > 20
  ) invalid("Use a supported blueprint with at most 20 rules per section.");
  const count = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 &&
      value <= draw
      ? value
      : invalid(
        "Rule counts must be whole numbers within the section draw count.",
      );
  const rules = (data.rules as unknown[]).map((value) => {
    const rule = object(value);
    fields(rule, [
      "id",
      "label",
      "topics",
      "difficulties",
      "types",
      "all_topics",
      "minimum",
      "maximum",
    ]);
    if (
      typeof rule.id !== "string" ||
      !(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i).test(rule.id)
    ) invalid("Each rule needs a stable UUID.");
    if (
      typeof rule.label !== "string" || !rule.label.trim() ||
      rule.label.length > 200
    ) invalid("Name each blueprint requirement.");
    const topics = strings(rule.topics ?? [], 20),
      difficulties = strings(rule.difficulties ?? [], 3) as Difficulty[],
      kinds = strings(rule.types ?? [], types.length),
      minimum = count(rule.minimum),
      maximum = count(rule.maximum ?? draw);
    if (
      difficulties.some((value) =>
        !(DIFFICULTIES as readonly string[]).includes(value)
      ) || kinds.some((value) => !types.includes(value)) ||
      !topics.length && !difficulties.length && !kinds.length ||
      minimum > maximum ||
      rule.all_topics !== undefined && typeof rule.all_topics !== "boolean"
    ) invalid("Review the rule filters and minimum/maximum counts.");
    return {
      id: (rule.id as string).toLowerCase(),
      label: (rule.label as string).trim(),
      topics,
      difficulties,
      types: kinds,
      all_topics: rule.all_topics === true,
      minimum,
      maximum,
    };
  });
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length) {
    invalid("Blueprint rule IDs must be unique.");
  }
  const points = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 500000 &&
      Math.round(v * 1e6) / 1e6 === v
      ? v
      : invalid("Point bounds support 0 to 500,000 with six decimal places.");
  const minimum = data.minimum_points === undefined
      ? undefined
      : points(data.minimum_points),
    maximum = data.maximum_points === undefined
      ? undefined
      : points(data.maximum_points);
  if (
    !rules.length && minimum === undefined && maximum === undefined ||
    minimum !== undefined && maximum !== undefined && minimum > maximum
  ) invalid("Set a quota or a valid section points range.");
  return {
    schema_version: BLUEPRINT_PROTOCOL,
    rules,
    ...(minimum === undefined ? {} : { minimum_points: minimum }),
    ...(maximum === undefined ? {} : { maximum_points: maximum }),
  };
}
export function matchesRule(
  candidate: BlueprintCandidate,
  rule: BlueprintRule,
) {
  const c = candidate.item.classification;
  return (!rule.topics.length ||
    (rule.all_topics
      ? rule.topics.every((topic) => c?.topics.includes(topic))
      : rule.topics.some((topic) => c?.topics.includes(topic)))) &&
    (!rule.difficulties.length ||
      !!c?.estimated_difficulty &&
        rule.difficulties.includes(c.estimated_difficulty)) &&
    (!rule.types.length || rule.types.includes(candidate.item.type));
}
export function summarizeBlueprint(
  candidates: BlueprintCandidate[],
  rules: Blueprint,
) {
  return {
    questions: candidates.length,
    points: candidates.reduce(
      (sum, c) => sum + Math.round(c.item.max_score * 1e6),
      0,
    ) / 1e6,
    rules: rules.rules.map((rule) => ({
      id: rule.id,
      label: rule.label,
      matched: candidates.filter((c) => matchesRule(c, rule)).length,
      minimum: rule.minimum,
      maximum: rule.maximum,
    })),
  };
}
export function satisfiesBlueprint(
  candidates: BlueprintCandidate[],
  rules: Blueprint,
) {
  const summary = summarizeBlueprint(candidates, rules);
  return summary.rules.every((rule) =>
    rule.matched >= rule.minimum && rule.matched <= rule.maximum
  ) &&
    (rules.minimum_points === undefined ||
      summary.points >= rules.minimum_points) &&
    (rules.maximum_points === undefined ||
      summary.points <= rules.maximum_points);
}
/** Randomized branch order is not a claim of uniform sampling of feasible forms.
 * A bounded exact search either finds a satisfying subset, proves infeasibility,
 * or explicitly reports indeterminate capacity. It never relaxes a rule. */
export function selectBlueprint<T extends BlueprintCandidate>(
  pool: T[],
  draw: number,
  rules: Blueprint,
  next: (max: number) => number,
  budget = { remaining: 100000 },
): T[] {
  if (
    !Number.isInteger(draw) || draw < 1 || draw > pool.length ||
    pool.length > 500 || new Set(pool.map((c) => c.id)).size !== pool.length
  ) invalid("Use 1–500 distinct pinned approved question versions.");
  if (draw === pool.length) {
    if (!satisfiesBlueprint(pool, rules)) {
      throw new BlueprintError(
        "blueprint_infeasible",
        "The fixed selection does not meet its blueprint requirements.",
      );
    }
    return [...pool];
  }
  const candidates = [...pool];
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = next(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) {
      invalid("Invalid form random source.");
    }
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const n = candidates.length,
    flags = rules.rules.map((rule) =>
      candidates.map((c) => matchesRule(c, rule) ? 1 : 0)
    ),
    counts = rules.rules.map(() => 0),
    suffix = flags.map((row) => {
      const values = new Uint16Array(n + 1);
      for (let i = n - 1; i >= 0; i--) values[i] = values[i + 1] + row[i];
      return values;
    }),
    points = candidates.map((c) => Math.round(c.item.max_score * 1e6)),
    lowest = new Float64Array(n + 1),
    highest = new Float64Array(n + 1),
    selected: number[] = [];
  lowest[n] = Infinity;
  for (let i = n - 1; i >= 0; i--) {
    lowest[i] = Math.min(points[i], lowest[i + 1]);
    highest[i] = Math.max(points[i], highest[i + 1]);
  }
  const minPoints = Math.round((rules.minimum_points ?? 0) * 1e6),
    maxPoints = Math.round((rules.maximum_points ?? 500000) * 1e6);
  function visit(index: number, needed: number, total: number): boolean {
    if (--budget.remaining < 0) {
      throw new BlueprintError(
        "blueprint_search_limit",
        "This blueprint exceeded the bounded form-assembly search. No requirements were relaxed. Simplify conflicting rules or request an institution review; feasibility is not yet confirmed.",
      );
    }
    if (n - index < needed || total > maxPoints) return false;
    for (let r = 0; r < counts.length; r++) {
      if (
        counts[r] > rules.rules[r].maximum ||
        counts[r] + Math.min(needed, suffix[r][index]) < rules.rules[r].minimum
      ) return false;
    }
    if (needed === 0) return total >= minPoints;
    if (
      total + needed * lowest[index] > maxPoints ||
      total + needed * highest[index] < minPoints
    ) return false;
    selected.push(index);
    for (let r = 0; r < counts.length; r++) counts[r] += flags[r][index];
    if (visit(index + 1, needed - 1, total + points[index])) return true;
    selected.pop();
    for (let r = 0; r < counts.length; r++) counts[r] -= flags[r][index];
    return index + 1 < n && visit(index + 1, needed, total);
  }
  if (!visit(0, draw, 0)) {
    throw new BlueprintError(
      "blueprint_infeasible",
      "No selection from these pinned approved versions satisfies all blueprint counts and point bounds. Review overlapping requirements or add approved questions.",
    );
  }
  const chosen = new Set(selected.map((index) => candidates[index].id));
  return pool.filter((c) => chosen.has(c.id));
}
