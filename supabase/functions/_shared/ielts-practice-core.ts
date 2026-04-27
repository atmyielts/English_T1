export type JsonRecord = Record<string, unknown>;

export const isObject = (value: unknown): value is JsonRecord =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const PLAN_REGENERATION_REPLACEABLE_STATUSES = ["planned", "expired"] as const;
export const PLAN_REGENERATION_PRESERVED_STATUSES = ["in_progress", "completed"] as const;

export const isReplaceablePlanStatus = (status: unknown): boolean =>
  PLAN_REGENERATION_REPLACEABLE_STATUSES.includes(String(status ?? "") as (typeof PLAN_REGENERATION_REPLACEABLE_STATUSES)[number]);

const toText = (value: unknown, maxLen = 240): string => String(value ?? "").trim().slice(0, maxLen);

const toNumber = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const isWithinEntitlementWindow = (
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
  nowMs = Date.now(),
): boolean => {
  const starts = startsAt ? Date.parse(startsAt) : NaN;
  const ends = endsAt ? Date.parse(endsAt) : NaN;
  if (Number.isFinite(starts) && nowMs < starts) return false;
  if (Number.isFinite(ends) && nowMs > ends) return false;
  return true;
};

export const hasActiveProductEntitlement = (
  rows: unknown,
  productId: string,
  nowMs = Date.now(),
): boolean => (Array.isArray(rows) ? rows : []).some((row) => {
  if (!isObject(row)) return false;
  return row.is_active === true
    && String(row.resource_type ?? "product") === "product"
    && String(row.resource_id ?? "") === productId
    && isWithinEntitlementWindow(String(row.starts_at ?? "") || null, String(row.ends_at ?? "") || null, nowMs);
});

export const hasActiveSponsoredProductAccess = (
  rows: unknown,
  productId: string,
  nowMs = Date.now(),
): boolean => (Array.isArray(rows) ? rows : []).some((row) => {
  if (!isObject(row)) return false;
  return String(row.status ?? "") === "active"
    && String(row.grant_type ?? "") === "product_access"
    && String(row.resource_type ?? "") === "product"
    && String(row.resource_id ?? "") === productId
    && isWithinEntitlementWindow(String(row.starts_at ?? "") || null, String(row.expires_at ?? "") || null, nowMs);
});

export const safeTimezone = (value: unknown): string => {
  const raw = toText(value, 80) || "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return "UTC";
  }
};

export const todayInTimezone = (timezoneRaw: unknown, now = new Date()): string => {
  const timezone = safeTimezone(timezoneRaw);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get("year")}-${map.get("month")}-${map.get("day")}`;
};

export const parsePlanDate = (raw: unknown, timezoneRaw: unknown, now = new Date()): string => {
  const text = toText(raw, 20);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return todayInTimezone(timezoneRaw, now);
};

const dateToUtcMs = (date: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map((part) => Number(part));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  return Date.UTC(year, month - 1, day);
};

export const deriveTargetDate = (practiceStartDate: string, programDurationDays: number): string => {
  const startMs = dateToUtcMs(practiceStartDate) ?? dateToUtcMs(todayInTimezone("UTC")) ?? Date.now();
  const duration = clamp(Math.floor(programDurationDays), 1, 365);
  return new Date(startMs + (duration - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
};

export const normalizeProgramDurationDays = (value: unknown, fallback = 30): number =>
  clamp(Math.floor(toNumber(value) ?? fallback), 1, 365);

export const normalizeDailyPracticeMinutes = (value: unknown, fallback = 60): number =>
  clamp(Math.floor(toNumber(value) ?? fallback), 10, 360);

export const dailyCountFromPracticeMinutes = (
  dailyMinutesRaw: unknown,
  legacyDailyCountRaw: unknown,
  dailyMinutesProvided: boolean,
): number => {
  if (dailyMinutesProvided) {
    const dailyMinutes = normalizeDailyPracticeMinutes(dailyMinutesRaw, 60);
    return clamp(Math.max(1, Math.round(dailyMinutes / 20)), 1, 12);
  }
  const legacy = toNumber(legacyDailyCountRaw);
  return Number.isFinite(legacy) ? clamp(Math.floor(legacy as number), 3, 12) : 3;
};

export const daysUntilDate = (targetDate: string | null | undefined, timezoneRaw: unknown, now = new Date()): number | null => {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  const todayMs = dateToUtcMs(todayInTimezone(timezoneRaw, now));
  const targetMs = dateToUtcMs(targetDate);
  if (todayMs == null || targetMs == null) return null;
  return Math.max(0, Math.ceil((targetMs - todayMs) / (24 * 60 * 60 * 1000)));
};

const normalizeText = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[â€™`Â´]/g, "'")
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeChoiceToken = (raw: string): string =>
  raw
    .trim()
    .toUpperCase()
    .replace(/^OPTION[\s_-]*/i, "")
    .replace(/[^A-Z0-9_-]+/g, "");

const normalizeTfngToken = (raw: string): string => {
  const v = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (v === "t" || v === "true") return "T";
  if (v === "f" || v === "false") return "F";
  if (v === "ng" || v === "notgiven") return "NG";
  return "";
};

const normalizeYnngToken = (raw: string): string => {
  const v = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (v === "y" || v === "yes") return "Y";
  if (v === "n" || v === "no") return "N";
  if (v === "ng" || v === "notgiven") return "NG";
  return "";
};

const toStringList = (value: unknown): string[] => {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => toStringList(entry));
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (isObject(value)) {
    if (typeof value.value === "string") return [value.value];
    if (typeof value.text === "string") return [value.text];
    if (typeof value.answer === "string") return [value.answer];
  }
  return [String(value)];
};

const firstNormalized = (value: unknown, normalizer: (raw: string) => string): string =>
  toStringList(value).map((entry) => normalizer(entry)).filter(Boolean)[0] ?? "";

const setEquals = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  if (sa.size !== a.length) return false;
  for (const item of b) if (!sa.has(item)) return false;
  return true;
};

const scoreMapAnswers = (
  expected: Record<string, unknown>,
  actual: Record<string, unknown> | null,
  normalizer: (raw: string) => string,
): { score: number; max: number } => {
  const keys = Object.keys(expected);
  if (keys.length === 0) return { score: 0, max: 0 };
  let score = 0;
  for (const key of keys) {
    const expectedToken = firstNormalized(expected[key], normalizer);
    if (!expectedToken) continue;
    const actualTokens = toStringList(actual?.[key]).map((entry) => normalizer(entry)).filter(Boolean);
    if (actualTokens.includes(expectedToken)) score += 1;
  }
  return { score, max: keys.length };
};

const mapResponse = (responseData: unknown, key: string): Record<string, unknown> | null => {
  if (isObject(responseData) && isObject(responseData[key])) return responseData[key] as Record<string, unknown>;
  return isObject(responseData) ? responseData : null;
};

export const scoreObjectiveQuestion = (
  questionType: string,
  answerKey: unknown,
  responseData: unknown,
): { score: number; max: number } | null => {
  if (!isObject(answerKey)) return null;
  const type = toText(questionType, 120).toLowerCase();

  if (type === "question_single_choice") {
    const expected = normalizeChoiceToken(String(answerKey.option_id ?? ""));
    const actualRaw = typeof responseData === "string"
      ? responseData
      : isObject(responseData)
        ? String(responseData.selected_option ?? responseData.option_id ?? "")
        : "";
    const actual = normalizeChoiceToken(actualRaw);
    return { score: expected && actual === expected ? 1 : 0, max: expected ? 1 : 0 };
  }

  if (type === "question_multi_choice") {
    const expected = Array.isArray(answerKey.option_ids)
      ? answerKey.option_ids.map((entry) => normalizeChoiceToken(String(entry))).filter(Boolean)
      : [];
    const actual = Array.isArray(responseData)
      ? responseData.map((entry) => normalizeChoiceToken(String(entry))).filter(Boolean)
      : isObject(responseData) && Array.isArray(responseData.selected_options)
        ? responseData.selected_options.map((entry) => normalizeChoiceToken(String(entry))).filter(Boolean)
        : [];
    return { score: expected.length > 0 && setEquals(expected, actual) ? 1 : 0, max: expected.length > 0 ? 1 : 0 };
  }

  if (type === "question_text") {
    const expected = Array.isArray(answerKey.answers)
      ? answerKey.answers.map((entry) => normalizeText(String(entry))).filter(Boolean)
      : [];
    const actualRaw = typeof responseData === "string"
      ? responseData
      : isObject(responseData)
        ? String(responseData.text ?? responseData.answer ?? "")
        : "";
    const actual = normalizeText(actualRaw);
    return { score: expected.includes(actual) ? 1 : 0, max: expected.length > 0 ? 1 : 0 };
  }

  if (type === "question_true_false_not_given" && isObject(answerKey.matches)) {
    return scoreMapAnswers(answerKey.matches as Record<string, unknown>, mapResponse(responseData, "matches"), normalizeTfngToken);
  }

  if (type === "question_yes_no_not_given" && isObject(answerKey.matches)) {
    return scoreMapAnswers(answerKey.matches as Record<string, unknown>, mapResponse(responseData, "matches"), normalizeYnngToken);
  }

  if (
    (type === "question_matching" || type === "question_matching_headings" || type === "question_sentence_endings")
    && isObject(answerKey.matches)
  ) {
    return scoreMapAnswers(answerKey.matches as Record<string, unknown>, mapResponse(responseData, "matches"), normalizeChoiceToken);
  }

  if ((type === "question_gap_fill" || type === "question_select_from_list") && isObject(answerKey.blanks)) {
    const normalizer = type === "question_select_from_list" ? normalizeChoiceToken : normalizeText;
    return scoreMapAnswers(answerKey.blanks as Record<string, unknown>, mapResponse(responseData, "blanks"), normalizer);
  }

  for (const mapKey of ["cells", "labels", "targets"]) {
    if (isObject(answerKey[mapKey])) {
      return scoreMapAnswers(answerKey[mapKey] as Record<string, unknown>, mapResponse(responseData, mapKey), normalizeText);
    }
  }

  return null;
};
