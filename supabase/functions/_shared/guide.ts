/** Shared by the Edge function and admin preview. No network, clock, or UI dependencies. */
export const GUIDE_SCHEMA_VERSION = 1;
export const locales = ["en", "uz", "ru"] as const;
export type Locale = typeof locales[number];
export type Copy = Record<Locale, string>;
export type Answer = string | number | string[] | null;
export type Answers = Record<string, Answer>;
export type Chapter = "goal" | "starting" | "routine";
export type Predicate = {
  question: string;
  op: "is" | "not" | "has" | "gte" | "lte";
  value: string | number;
};
/** OR of AND groups. An empty condition matches everyone. */
export type Condition = { any: Array<{ all: Predicate[] }> };
export type Option = { id: string; label: Copy; detail?: Copy };
export type Question = {
  id: string;
  chapter: Chapter;
  title: Copy;
  help: Copy;
  kind: "single" | "multi" | "number" | "date";
  required: boolean;
  options: Option[];
  when: Condition;
  maxSelections?: number;
  min?: number;
  max?: number;
  goalField?: "target_score" | "target_date" | "daily_minutes";
};
export type CheckQuestion = {
  id: string;
  bank: "english" | "sat";
  skill: "reading" | "grammar" | "listening" | "math";
  prompt: Copy;
  passage: string;
  options: Option[];
  audioUrl?: string;
  correctOption?: string;
  explanation?: Copy;
  reviewed: boolean;
};
export type Destination =
  | "/contact"
  | "/education-centers"
  | "/center-office"
  | "/partner"
  | "/academy/teacher"
  | "/academy/parent"
  | "/redeem"
  | "/student-center";
export const destinations: Destination[] = [
  "/contact",
  "/education-centers",
  "/center-office",
  "/partner",
  "/academy/teacher",
  "/academy/parent",
  "/redeem",
  "/student-center",
];
export type OfferRule = {
  id: string;
  enabled: boolean;
  priority: number;
  when: Condition;
  kind: "plan" | "product" | "route";
  productId: string;
  planId: string;
  destination: Destination;
  title: Copy;
  reasons: Copy[];
  limitations: Copy;
  action: Copy;
};
export type GuideFlow = {
  schemaVersion: 1;
  name: string;
  intro: Copy;
  questions: Question[];
  checks: CheckQuestion[];
  offers: OfferRule[];
  fallback: { title: Copy; body: Copy; action: Copy; destination: Destination };
  appearance: {
    accent: "teal" | "ink";
    illustration: "route" | "books" | "classroom";
    motion: "gentle" | "none";
  };
};
export type Product = {
  id: string;
  name: string;
  status: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
};
export type Plan = {
  id: string;
  product_id: string;
  name: string;
  amount: number;
  currency: string;
  duration_days: number | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
};
export type Catalog = { products: Product[]; plans: Plan[] };
export type Match = {
  rule: OfferRule;
  product: Product | null;
  plan: Plan | null;
  included: Product[];
  owned: boolean;
  href: string;
};
export type MatchResult = {
  primary: Match | null;
  alternative: Match | null;
  trace: Array<{ ruleId: string; matched: boolean; reason: string }>;
};
export type Signal = { skill: CheckQuestion["skill"]; answered: number; correct: number; available: number };
export const emptyCondition = (): Condition => ({ any: [] });
export const copy = (en: string, uz: string, ru: string): Copy => ({ en, uz, ru });

export function matches(condition: Condition, answers: Answers): boolean {
  return condition.any.length === 0 || condition.any.some((group) =>
    group.all.every((p) => {
      const answer = answers[p.question];
      if (answer === undefined || answer === null) return false;
      switch (p.op) {
        case "is":
          return answer === p.value;
        case "not":
          return answer !== p.value && !(Array.isArray(answer) && answer.includes(String(p.value)));
        case "has":
          return Array.isArray(answer) ? answer.includes(String(p.value)) : answer === p.value;
        case "gte":
          return typeof answer === typeof p.value && !Array.isArray(answer) && answer >= p.value;
        case "lte":
          return typeof answer === typeof p.value && !Array.isArray(answer) && answer <= p.value;
      }
    })
  );
}

export function validAnswer(q: Question, answer: unknown): answer is Answer {
  if (answer === null) return !q.required;
  if (q.kind === "single") return typeof answer === "string" && q.options.some((o) => o.id === answer);
  if (q.kind === "multi") {
    return Array.isArray(answer) && answer.length > 0 && answer.length <= (q.maxSelections ?? 3) &&
      new Set(answer).size === answer.length && answer.every((a) =>
        typeof a === "string" && q.options.some((o) => o.id === a)
      );
  }
  if (q.kind === "number") {
    return typeof answer === "number" && Number.isFinite(answer) && answer >= (q.min ?? 0) &&
      answer <= (q.max ?? 10000);
  }
  return typeof answer === "string" && /^\d{4}-\d{2}-\d{2}$/.test(answer) &&
    !Number.isNaN(Date.parse(answer)) && new Date(answer).toISOString().slice(0, 10) === answer;
}

/** Discard hidden/invalid answers in order, so changing a parent cannot leave stale children. */
export function normalizeAnswers(flow: GuideFlow, input: Answers): Answers {
  const result: Answers = {};
  for (const q of flow.questions) {
    if (matches(q.when, result) && Object.hasOwn(input, q.id) && validAnswer(q, input[q.id])) {
      result[q.id] = input[q.id];
    }
  }
  return result;
}
export function visibleQuestions(flow: GuideFlow, input: Answers): Question[] {
  const answers = normalizeAnswers(flow, input);
  return flow.questions.filter((q) => matches(q.when, answers));
}
export function nextQuestion(flow: GuideFlow, input: Answers): Question | undefined {
  const answers = normalizeAnswers(flow, input);
  return visibleQuestions(flow, answers).find((q) => !Object.hasOwn(answers, q.id));
}
export function changeAnswer(flow: GuideFlow, input: Answers, questionId: string, value: Answer): Answers {
  const index = flow.questions.findIndex((q) => q.id === questionId);
  if (index < 0 || !validAnswer(flow.questions[index], value)) throw new Error("Invalid answer");
  // Every later dependent question is reset, even if both old/new branches remain visible.
  const affected = new Set([questionId]);
  const updated = { ...input, [questionId]: value };
  for (const q of flow.questions.slice(index + 1)) {
    if (q.when.any.some((g) => g.all.some((p) => affected.has(p.question)))) {
      affected.add(q.id);
      delete updated[q.id];
    }
  }
  return normalizeAnswers(flow, updated);
}
export function checkBank(answers: Answers): "english" | "sat" | null {
  if (
    !["learner", "parent"].includes(String(answers.audience)) || answers.parent_intent === "progress" ||
    answers.access === "code" || answers.access === "enrolled" || answers.exam === "unsure"
  ) return null;
  return answers.exam === "sat" ? "sat" : answers.exam ? "english" : null;
}
export function scoreCheck(
  flow: GuideFlow,
  answers: Answers,
  responses: Record<string, string | null>,
): Signal[] {
  const bank = checkBank(answers);
  if (!bank) return [];
  const signals = new Map<string, Signal>();
  for (const q of flow.checks.filter((q) => q.bank === bank && q.reviewed)) {
    const signal = signals.get(q.skill) ?? { skill: q.skill, correct: 0, answered: 0, available: 0 };
    signal.available++;
    if (typeof responses[q.id] === "string" && q.options.some((o) => o.id === responses[q.id])) {
      signal.answered++;
      if (responses[q.id] === q.correctOption) signal.correct++;
    }
    signals.set(q.skill, signal);
  }
  return [...signals.values()];
}
export function publicFlow(flow: GuideFlow): GuideFlow {
  // Explicit projection prevents answer-key leakage through future metadata fields.
  return {
    schemaVersion: flow.schemaVersion,
    name: flow.name,
    intro: flow.intro,
    questions: flow.questions,
    appearance: flow.appearance,
    fallback: flow.fallback,
    offers: [],
    checks: flow.checks.filter((q) => q.reviewed).map((q) => ({
      id: q.id,
      bank: q.bank,
      skill: q.skill,
      prompt: q.prompt,
      passage: q.passage,
      options: q.options,
      audioUrl: q.audioUrl,
      reviewed: true,
    })),
  };
}

export function productAvailable(product: Product | undefined): product is Product {
  return !!product && product.status === "active" && product.metadata?.hidden !== true &&
    product.metadata?.archived !== true && product.metadata?.visible !== false;
}
export function safeProductUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" || url.username || url.password || url.port ||
      !(url.hostname === "schood.online" || url.hostname.endsWith(".schood.online"))
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}
export function includedProducts(plan: Plan, catalog: Catalog): Product[] | null {
  const raw = plan.metadata?.included_product_ids;
  if (raw !== undefined && (!Array.isArray(raw) || raw.some((id) => typeof id !== "string"))) return null;
  const ids = [...new Set([plan.product_id, ...((raw as string[] | undefined) ?? [])])];
  const products = ids.map((id) => catalog.products.find((p) => p.id === id));
  return products.every(productAvailable) ? products as Product[] : null;
}
export function recommend(
  flow: GuideFlow,
  input: Answers,
  catalog: Catalog,
  effectiveIds: string[] = [],
  signals: Signal[] = [],
): MatchResult {
  const answers = normalizeAnswers(flow, input);
  const signalAnswers: Answers = { ...answers };
  for (const s of signals) if (s.answered >= 2) signalAnswers[`signal_${s.skill}`] = s.correct / s.answered;
  const trace: MatchResult["trace"] = [];
  const eligible: Match[] = [];
  for (const rule of [...flow.offers].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    const reject = (reason: string) => trace.push({ ruleId: rule.id, matched: false, reason });
    if (!rule.enabled) {
      reject("Not approved for onboarding");
      continue;
    }
    if (!matches(rule.when, signalAnswers)) {
      reject("Answers do not match");
      continue;
    }
    if (rule.kind === "route") {
      eligible.push({ rule, product: null, plan: null, included: [], owned: false, href: rule.destination });
      trace.push({ ruleId: rule.id, matched: true, reason: "Relevant existing workflow" });
      continue;
    }
    const product = catalog.products.find((p) => p.id === rule.productId);
    if (!productAvailable(product)) {
      reject("Product unavailable");
      continue;
    }
    const href = safeProductUrl(product.metadata?.app_url);
    if (!href) {
      reject("No safe product destination");
      continue;
    }
    const plan = rule.kind === "plan"
      ? catalog.plans.find((p) => p.id === rule.planId && p.product_id === product.id)
      : null;
    if (
      rule.kind === "plan" && (!plan || !plan.is_active || !Number.isFinite(plan.amount) || plan.amount < 0)
    ) {
      reject("Plan unavailable");
      continue;
    }
    const included = plan ? includedProducts(plan, catalog) : [product];
    if (!included) {
      reject("Bundle contains unavailable products");
      continue;
    }
    const owned = included.every((p) => effectiveIds.includes(p.id));
    if (!plan && !owned && product.metadata?.guide_free_access !== true) {
      reject("Product requires an eligible plan or existing access");
      continue;
    }
    if (answers.budget === "free" && !owned && plan && plan.amount > 0) {
      reject("Does not meet free-only preference");
      continue;
    }
    eligible.push({
      rule,
      product,
      plan: plan ?? null,
      included,
      owned,
      href: owned || !plan
        ? href
        : `/checkout?plan_id=${encodeURIComponent(plan.id)}&product=${
          encodeURIComponent(String(product.metadata?.slug ?? ""))
        }&returnTo=${encodeURIComponent("/start/result")}`,
    });
    trace.push({
      ruleId: rule.id,
      matched: true,
      reason: owned ? "Suitable existing access" : "Eligible offer",
    });
  }
  // Preserve workflow priorities; ownership only reorders comparable product recommendations.
  const workflow = eligible.find((m) => m.rule.kind === "route");
  const products = eligible.filter((m) => m.product).sort((a, b) =>
    Number(b.owned) - Number(a.owned) || b.rule.priority - a.rule.priority ||
    a.rule.id.localeCompare(b.rule.id)
  );
  const primary = workflow && (!products[0] || workflow.rule.priority > products[0].rule.priority)
    ? workflow
    : products[0] ?? workflow ?? null;
  const alternative = primary?.product
    ? products.find((m) => m.rule.id !== primary.rule.id && m.product?.id !== primary.product?.id) ?? null
    : null;
  return { primary, alternative, trace };
}

export type Validation = { errors: string[]; maxPath: number; paths: number };
const validCopy = (v: unknown): v is Copy =>
  !!v && typeof v === "object" &&
  locales.every((l) =>
    typeof (v as Copy)[l] === "string" && (v as Copy)[l].trim().length > 0 && (v as Copy)[l].length <= 4000
  );
const validId = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(v);

/** Publication validation is bounded; complicated configurations fail closed. */
export function validateFlow(input: unknown, catalog?: Catalog): Validation {
  try {
    return validateFlowStructure(input, catalog);
  } catch {
    return {
      errors: ["Malformed configuration: check questions, conditions, offers, and translations"],
      maxPath: 0,
      paths: 0,
    };
  }
}
function validateFlowStructure(input: unknown, catalog?: Catalog): Validation {
  const errors: string[] = [];
  let maxPath = 0;
  let paths = 0;
  if (!input || typeof input !== "object") return { errors: ["Flow must be an object"], maxPath, paths };
  const flow = input as GuideFlow;
  if (
    flow.schemaVersion !== 1 || typeof flow.name !== "string" || !flow.name.trim() || flow.name.length > 120
  ) errors.push("Invalid flow version or name");
  if (!validCopy(flow.intro)) errors.push("Intro needs English, Uzbek, and Russian copy");
  if (
    !Array.isArray(flow.questions) || flow.questions.length < 1 || flow.questions.length > 80 ||
    !Array.isArray(flow.offers) || flow.offers.length > 150 || !Array.isArray(flow.checks) ||
    flow.checks.length > 80
  ) return { errors: [...errors, "Invalid question, offer, or check collection"], maxPath, paths };
  const seen = new Map<string, Question>();
  const checkCondition = (condition: Condition, where: string, allowSignals = false) => {
    if (!condition || !Array.isArray(condition.any) || condition.any.length > 12) {
      errors.push(`${where}: invalid conditions`);
      return;
    }
    for (const group of condition.any) {
      if (!group || !Array.isArray(group.all) || group.all.length < 1 || group.all.length > 12) {
        errors.push(`${where}: empty or oversized condition group`);
        continue;
      }
      for (const p of group.all) {
        if (!p || !["is", "not", "has", "gte", "lte"].includes(p.op)) {
          errors.push(`${where}: invalid comparison`);
          continue;
        }
        if (
          allowSignals && /^signal_(reading|grammar|listening|math)$/.test(p.question) &&
          typeof p.value === "number" && p.value >= 0 && p.value <= 1 && ["gte", "lte"].includes(p.op)
        ) continue;
        const q = seen.get(p.question);
        if (!q) {
          errors.push(`${where}: ${p.question} must refer to an earlier question`);
          continue;
        }
        if (q.kind === "single" || q.kind === "multi") {
          if (
            !q.options.some((o) => o.id === p.value) || !["is", "not", "has"].includes(p.op) ||
            (q.kind === "multi" && p.op === "is")
          ) errors.push(`${where}: invalid option comparison for ${q.id}`);
        } else if (!["is", "not", "gte", "lte"].includes(p.op) || !validAnswer(q, p.value)) {
          errors.push(`${where}: invalid numeric/date comparison`);
        }
      }
    }
  };
  const optionsValid = (options: Option[]) =>
    Array.isArray(options) && options.length >= 2 && options.length <= 12 && new Set(options.map((o) =>
        o?.id
      )).size === options.length &&
    options.every((o) => o && validId(o.id) && validCopy(o.label) && (!o.detail || validCopy(o.detail)));
  for (const q of flow.questions) {
    if (!q || !validId(q.id) || seen.has(q.id)) {
      errors.push("Question IDs must be unique stable names");
      continue;
    }
    if (!validCopy(q.title) || !validCopy(q.help)) {
      errors.push(`${q.id}: all three translations are required`);
    }
    if (
      !["goal", "starting", "routine"].includes(q.chapter) ||
      !["single", "multi", "number", "date"].includes(q.kind) || typeof q.required !== "boolean"
    ) errors.push(`${q.id}: invalid question settings`);
    if (["single", "multi"].includes(q.kind) && !optionsValid(q.options)) {
      errors.push(`${q.id}: invalid options or missing translations`);
    }
    if (q.kind === "number" && (!(Number.isFinite(q.min) && Number.isFinite(q.max)) || q.min! > q.max!)) {
      errors.push(`${q.id}: invalid number range`);
    }
    if (
      q.kind === "multi" &&
      (!Number.isInteger(q.maxSelections) || q.maxSelections! < 1 || q.maxSelections! > 3)
    ) errors.push(`${q.id}: select between one and three answers`);
    if (q.goalField && !["target_score", "target_date", "daily_minutes"].includes(q.goalField)) {
      errors.push(`${q.id}: unsupported goal field`);
    }
    if (q.goalField && q.kind !== (q.goalField === "target_date" ? "date" : "number")) {
      errors.push(`${q.id}: goal fields need a compatible number or date question`);
    }
    checkCondition(q.when, q.id);
    seen.set(q.id, q);
  }
  if (
    flow.questions[0]?.id !== "audience" || flow.questions[0]?.kind !== "single" ||
    !flow.questions[0]?.required || flow.questions[0]?.when?.any?.length !== 0 ||
    !["learner", "parent", "teacher", "center"].every((id) =>
      flow.questions[0]?.options?.some((o) => o.id === id)
    )
  ) errors.push("The first question must be the four-audience selector");
  const ruleIds = new Set<string>();
  for (const r of flow.offers) {
    if (!r || !validId(r.id) || ruleIds.has(r.id)) {
      errors.push("Offer IDs must be unique");
      continue;
    }
    ruleIds.add(r.id);
    checkCondition(r.when, r.id, true);
    if (
      !Number.isInteger(r.priority) || typeof r.enabled !== "boolean" ||
      !["plan", "product", "route"].includes(r.kind) || !destinations.includes(r.destination)
    ) errors.push(`${r.id}: invalid offer settings`);
    if (
      !validCopy(r.title) || !validCopy(r.action) || !validCopy(r.limitations) || !Array.isArray(r.reasons) ||
      r.reasons.length !== 3 || !r.reasons.every(validCopy)
    ) errors.push(`${r.id}: offer needs three reasons and complete translations`);
    if (r.enabled && r.kind !== "route" && catalog) {
      const p = catalog.products.find((p) => p.id === r.productId);
      const plan = catalog.plans.find((p) => p.id === r.planId && p.product_id === r.productId);
      if (!productAvailable(p) || !safeProductUrl(p?.metadata?.app_url)) {
        errors.push(`${r.id}: product is unavailable or has no safe destination`);
      }
      if (
        r.kind === "plan" &&
        (!plan?.is_active || !includedProducts(plan, catalog) || !Number.isFinite(plan.amount) ||
          plan.amount < 0)
      ) errors.push(`${r.id}: invalid plan or bundle`);
    }
  }
  const checkIds = new Set<string>();
  for (const q of flow.checks) {
    if (!q || !validId(q.id) || checkIds.has(q.id)) {
      errors.push("Check IDs must be unique");
      continue;
    }
    checkIds.add(q.id);
    if (
      !["english", "sat"].includes(q.bank) ||
      !["reading", "grammar", "listening", "math"].includes(q.skill) || !validCopy(q.prompt) ||
      !validCopy(q.explanation) || typeof q.passage !== "string" || q.passage.length > 8000 ||
      !optionsValid(q.options) || !q.options.some((o) => o.id === q.correctOption)
    ) errors.push(`${q.id}: incomplete check or answer key`);
    if (q.reviewed && q.skill === "listening" && !safeProductUrl(q.audioUrl)) {
      errors.push(`${q.id}: reviewed listening checks need an approved Schood HTTPS audio URL`);
    }
    if (typeof q.reviewed !== "boolean") errors.push(`${q.id}: review status required`);
  }
  for (const bank of ["english", "sat"] as const) {
    const reviewed = flow.checks.filter((q) => q.bank === bank && q.reviewed);
    if (reviewed.length !== 6) {
      errors.push(`${bank}: exactly six reviewed questions are required for the short check`);
    }
    const skills = bank === "english" ? { reading: 2, grammar: 2, listening: 2 } : { reading: 3, math: 3 };
    for (const [skill, count] of Object.entries(skills)) {
      if (reviewed.filter((q) => q.skill === skill).length !== count) {
        errors.push(`${bank}: expected ${count} ${skill} questions`);
      }
    }
  }
  if (
    !flow.fallback || !destinations.includes(flow.fallback.destination) || !validCopy(flow.fallback.title) ||
    !validCopy(flow.fallback.body) || !validCopy(flow.fallback.action)
  ) errors.push("A translated safe fallback is required");
  if (
    !flow.appearance || !["teal", "ink"].includes(flow.appearance.accent) ||
    !["route", "books", "classroom"].includes(flow.appearance.illustration) ||
    !["gentle", "none"].includes(flow.appearance.motion)
  ) errors.push("Choose supported appearance presets");
  if (errors.length) return { errors, maxPath, paths };
  // Enumerate only branch-relevant answers, not every survey combination.
  const dependentIds = new Set(
    flow.questions.flatMap((q) => q.when.any.flatMap((g) => g.all.map((p) => p.question))),
  );
  const reached = new Set<string>();
  let visits = 0;
  let reversedChapter = false;
  function walk(index: number, answers: Answers, count: number, lastChapter = 0) {
    if (++visits > 50000) return;
    if (index === flow.questions.length) {
      paths++;
      maxPath = Math.max(count, maxPath);
      return;
    }
    const q = flow.questions[index];
    if (!matches(q.when, answers)) {
      walk(index + 1, answers, count, lastChapter);
      return;
    }
    reached.add(q.id);
    const chapter = ["goal", "starting", "routine"].indexOf(q.chapter);
    if (chapter < lastChapter) reversedChapter = true;
    if (!dependentIds.has(q.id)) {
      walk(index + 1, answers, count + 1, chapter);
      return;
    }
    let values: Answer[];
    if (q.kind === "single") values = q.options.map((o) => o.id);
    else if (q.kind === "multi") {
      values = [];
      const combinations = (from: number, selected: string[]) => {
        if (selected.length) values.push(selected);
        if (selected.length < (q.maxSelections ?? 3)) {
          q.options.slice(from).forEach((o, i) => combinations(from + i + 1, [...selected, o.id]));
        }
      };
      combinations(0, []);
    } else {
      const thresholds = flow.questions.flatMap((q2) =>
        q2.when.any.flatMap((g) => g.all.filter((p) => p.question === q.id).map((p) => p.value))
      );
      values = q.kind === "number"
        ? [q.min!, q.max!, ...thresholds.flatMap((v) => [Number(v) - 0.001, Number(v), Number(v) + 0.001])]
          .filter((v) => validAnswer(q, v))
        : [
          "1900-01-01",
          "2100-12-31",
          ...thresholds.flatMap((v) =>
            [-1, 0, 1].map((d) => new Date(Date.parse(String(v)) + d * 86400000).toISOString().slice(0, 10))
          ),
        ];
    }
    if (!q.required) values.push(null);
    for (const value of values) {
      walk(index + 1, { ...answers, [q.id]: value }, count + 1, chapter);
      if (visits > 50000) break;
    }
  }
  walk(0, {}, 0);
  if (visits > 50000) errors.push("Branching is too complex to verify safely; simplify the conditions");
  if (maxPath > 12) errors.push(`Longest interview is ${maxPath} questions; maximum is 12`);
  if (reversedChapter) {
    errors.push(
      "A route moves backward through chapters; reorder its questions as Goal, Starting point, Routine",
    );
  }
  for (const q of flow.questions) if (!reached.has(q.id)) errors.push(`${q.id}: question is unreachable`);
  return { errors, maxPath, paths };
}
