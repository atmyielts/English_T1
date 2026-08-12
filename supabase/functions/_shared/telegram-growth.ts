export type TelegramFunnel = "student_ielts" | "academy" | "course" | "referral" | "generic";

export type AcquisitionAttribution = {
  payload: string | null;
  funnel: TelegramFunnel;
  intent: string;
  roleHint: "student" | "academy" | "unknown";
  source: string | null;
  medium: string | null;
  campaign: string | null;
  creative: string | null;
  referrerCode: string | null;
};

const payloadPattern = /^[A-Za-z0-9_-]{1,64}$/;
const sourceTokens = new Set(["instagram", "meta", "facebook", "telegram", "tiktok", "youtube", "google", "partner"]);

export const parseTelegramStartPayload = (raw: unknown): AcquisitionAttribution => {
  const payload = String(raw ?? "").trim();
  if (!payload) {
    return {
      payload: null,
      funnel: "generic",
      intent: "explore",
      roleHint: "unknown",
      source: null,
      medium: null,
      campaign: null,
      creative: null,
      referrerCode: null,
    };
  }
  if (!payloadPattern.test(payload)) throw new Error("Invalid Telegram start payload");

  const tokens = payload.toLowerCase().split("_").filter(Boolean);
  const first = tokens[0] ?? "";
  const funnel: TelegramFunnel = first === "academy"
    ? "academy"
    : first === "ielts" || first === "student"
      ? "student_ielts"
      : first === "course"
        ? "course"
        : first === "referral" || first === "ref"
          ? "referral"
          : "generic";
  const roleHint = funnel === "academy" ? "academy" : funnel === "generic" ? "unknown" : "student";
  const sourceIndex = tokens.findIndex((token) => sourceTokens.has(token));
  const source = sourceIndex >= 0 ? tokens[sourceIndex] : funnel === "referral" ? "referral" : null;
  const medium = source === "referral" || funnel === "referral" ? "referral" : source ? "social" : null;
  const creative = sourceIndex >= 0 && tokens[sourceIndex + 1] ? tokens.slice(sourceIndex + 1).join("_") : null;
  const referrerCode = funnel === "referral" ? tokens.slice(1).join("_") || null : null;

  return {
    payload,
    funnel,
    intent: funnel === "student_ielts" ? "ielts_diagnostic" : funnel === "academy" ? "academy_demo" : funnel,
    roleHint,
    source,
    medium,
    campaign: payload,
    creative,
    referrerCode,
  };
};

export type NotificationCategory = "transactional" | "academic_required" | "study_habit" | "commercial" | "system";
export type NotificationDecision = {
  outcome: "send" | "suppress" | "defer";
  reason: string;
  deliverAt: string | null;
};

export type NotificationPolicyInput = {
  category: NotificationCategory;
  now?: Date;
  timezone?: string | null;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  telegramEnabled?: boolean;
  categoryEnabled?: boolean;
  specificEnabled?: boolean;
  dedupeSeen?: boolean;
  recentCategoryCount?: number;
  frequencyCap?: number | null;
  mandatory?: boolean;
};

export const safeTimezone = (value: unknown, fallback = "Asia/Tashkent"): string => {
  const timezone = String(value ?? "").trim() || fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return fallback;
  }
};

const localMinute = (date: Date, timezone: string): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
};

const parseMinute = (value: string | null | undefined): number | null => {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
};

const isQuiet = (minute: number, start: number, end: number): boolean =>
  start === end ? false : start < end ? minute >= start && minute < end : minute >= start || minute < end;

const nextAllowedAt = (now: Date, timezone: string, start: number, end: number): Date => {
  const candidate = new Date(now);
  candidate.setUTCSeconds(0, 0);
  for (let index = 0; index < 36 * 60; index += 1) {
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
    if (!isQuiet(localMinute(candidate, timezone), start, end)) return candidate;
  }
  return new Date(now.getTime() + 12 * 60 * 60 * 1000);
};

export const defaultFrequencyCap = (category: NotificationCategory): number | null =>
  category === "study_habit" || category === "commercial" ? 2 : null;

export const evaluateNotificationPolicy = (input: NotificationPolicyInput): NotificationDecision => {
  if (input.dedupeSeen) return { outcome: "suppress", reason: "duplicate", deliverAt: null };
  if (input.mandatory || input.category === "system") return { outcome: "send", reason: "mandatory", deliverAt: null };
  if (input.telegramEnabled === false) return { outcome: "suppress", reason: "telegram_disabled", deliverAt: null };
  if (input.categoryEnabled === false) return { outcome: "suppress", reason: "category_disabled", deliverAt: null };
  if (input.specificEnabled === false) return { outcome: "suppress", reason: "notification_type_disabled", deliverAt: null };

  const canBeCapped = input.category === "study_habit" || input.category === "commercial";
  const cap = input.frequencyCap === undefined ? defaultFrequencyCap(input.category) : input.frequencyCap;
  if (canBeCapped && cap != null && (input.recentCategoryCount ?? 0) >= cap) {
    return { outcome: "suppress", reason: "frequency_cap", deliverAt: null };
  }

  if (input.category === "transactional") {
    return { outcome: "send", reason: "eligible", deliverAt: null };
  }

  const quietStart = parseMinute(input.quietHoursStart);
  const quietEnd = parseMinute(input.quietHoursEnd);
  if (quietStart != null && quietEnd != null) {
    const now = input.now ?? new Date();
    const timezone = safeTimezone(input.timezone);
    if (isQuiet(localMinute(now, timezone), quietStart, quietEnd)) {
      return { outcome: "defer", reason: "quiet_hours", deliverAt: nextAllowedAt(now, timezone, quietStart, quietEnd).toISOString() };
    }
  }

  return { outcome: "send", reason: "eligible", deliverAt: null };
};

export const categoryForNotificationType = (type: unknown): NotificationCategory => {
  const normalized = String(type ?? "").trim().toLowerCase();
  if (/security|recovery|account/.test(normalized)) return "system";
  if (/receipt|payment_success|enrollment|certificate/.test(normalized)) return "transactional";
  if (/assignment|grade|score|class|attendance|teacher_feedback|schedule/.test(normalized)) return "academic_required";
  if (/upgrade|trial_expiry|promotion|offer|demo_follow/.test(normalized)) return "commercial";
  return "study_habit";
};

export type StudentContextInput = {
  paymentOverdue?: boolean;
  overdueAssignment?: { id: string; title: string } | null;
  dueAssignment?: { id: string; title: string; dueAt?: string | null } | null;
  upcomingClass?: { id: string; label: string; startsAt?: string | null } | null;
  activeLearning?: { label: string; route: string; progress?: number | null } | null;
  vocabularyDue?: number;
  vocabularyFailed?: number;
  recentWeakResult?: { id: string; label: string; score: number | null } | null;
  courseCompleted?: boolean;
};

export type StudentNextAction = {
  kind: string;
  headline: string;
  detail: string;
  cta: string;
  route: string;
  priority: number;
};

export const deriveStudentNextAction = (input: StudentContextInput): StudentNextAction => {
  if (input.paymentOverdue) return { kind: "payment_overdue", headline: "Payment needs attention", detail: "Your learning access may be interrupted.", cta: "Review payment", route: "/telegram?view=payments", priority: 1 };
  if (input.overdueAssignment) return { kind: "assignment_overdue", headline: input.overdueAssignment.title, detail: "This assignment is overdue.", cta: "Continue assignment", route: `/telegram?view=academy&assignment=${encodeURIComponent(input.overdueAssignment.id)}`, priority: 2 };
  if (input.dueAssignment) return { kind: "assignment_due", headline: input.dueAssignment.title, detail: input.dueAssignment.dueAt ? `Due ${input.dueAssignment.dueAt}` : "Due soon", cta: "Open assignment", route: `/telegram?view=academy&assignment=${encodeURIComponent(input.dueAssignment.id)}`, priority: 3 };
  if (input.upcomingClass) return { kind: "upcoming_class", headline: input.upcomingClass.label, detail: input.upcomingClass.startsAt ? `Starts ${input.upcomingClass.startsAt}` : "Upcoming class", cta: "Open schedule", route: "/telegram?view=academy&section=schedule", priority: 4 };
  if (input.activeLearning) return { kind: "active_learning", headline: input.activeLearning.label, detail: input.activeLearning.progress == null ? "Continue where you stopped." : `${Math.round(input.activeLearning.progress)}% complete`, cta: "Continue studying", route: input.activeLearning.route, priority: 5 };
  if ((input.vocabularyDue ?? 0) > 0) return { kind: "vocabulary_due", headline: `${input.vocabularyDue} words due`, detail: (input.vocabularyFailed ?? 0) > 0 ? `${input.vocabularyFailed} were difficult last time.` : "A short review is ready.", cta: "Start review", route: "/telegram?view=practice", priority: 6 };
  if (input.recentWeakResult) return { kind: "result_recovery", headline: input.recentWeakResult.label, detail: input.recentWeakResult.score == null ? "Review your latest result." : `Latest score: ${input.recentWeakResult.score}`, cta: "Review result", route: `/telegram?view=home&result=${encodeURIComponent(input.recentWeakResult.id)}`, priority: 7 };
  if (input.courseCompleted) return { kind: "course_completed", headline: "Course completed", detail: "Your next learning path is ready.", cta: "Choose next step", route: "/telegram?view=home", priority: 8 };
  return { kind: "clear", headline: "You're clear for today", detail: "Start a short practice session when you are ready.", cta: "Practice now", route: "/telegram?view=practice", priority: 9 };
};

export const IELTS_VOCAB_DIAGNOSTIC = [
  { id: "q1", word: "assess", prompt: "What does assess mean?", options: ["to evaluate", "to avoid", "to repeat"], answer: "to evaluate" },
  { id: "q2", word: "relevant", prompt: "What does relevant mean?", options: ["connected to the topic", "very expensive", "difficult to hear"], answer: "connected to the topic" },
  { id: "q3", word: "interpret", prompt: "What does interpret mean?", options: ["to explain meaning", "to memorize spelling", "to shorten a text"], answer: "to explain meaning" },
] as const;

export const scoreVocabularyDiagnostic = (answers: Record<string, string>) => {
  const missed = IELTS_VOCAB_DIAGNOSTIC.filter((question) => answers[question.id] !== question.answer);
  const correct = IELTS_VOCAB_DIAGNOSTIC.length - missed.length;
  const readiness = correct === 3 ? "strong_starter" : correct === 2 ? "developing" : "needs_foundation";
  const dailyMinutes = readiness === "strong_starter" ? 12 : readiness === "developing" ? 15 : 20;
  return {
    correct,
    total: IELTS_VOCAB_DIAGNOSTIC.length,
    readiness,
    missedWords: missed.map((question) => question.word),
    plan: Array.from({ length: 7 }, (_, index) => ({ day: index + 1, minutes: dailyMinutes, focus: index % 2 === 0 ? "vocabulary review" : "reading in context" })),
  };
};

export type JourneySnapshot = {
  funnel: TelegramFunnel;
  lastStep: string;
  state?: Record<string, unknown>;
  expiresAt?: string | null;
  status?: string;
};

export type JourneyTransition = {
  step: string;
  state: Record<string, unknown>;
  funnel?: TelegramFunnel;
  event?: string;
  firstValue?: boolean;
  canceled?: boolean;
  createLead?: boolean;
};

export const advanceTelegramJourney = (
  snapshot: JourneySnapshot,
  action: string,
  input = "",
  now = new Date(),
): JourneyTransition => {
  if (snapshot.status && snapshot.status !== "active") throw new Error("inactive_funnel_session");
  if (snapshot.expiresAt && new Date(snapshot.expiresAt).getTime() <= now.getTime()) throw new Error("expired_funnel_session");
  const state = { ...(snapshot.state ?? {}) } as Record<string, any>;
  if (action === "cancel") return { step: "canceled", state, canceled: true };
  if (action === "academy_begin") return { step: "academy_name", state, funnel: "academy" };
  if (action === "student_begin") return { step: "student_goal", state, funnel: "student_ielts" };

  if (snapshot.funnel === "academy") {
    if (action === "input" && snapshot.lastStep === "academy_name" && input.trim().length >= 2) {
      state.academy_name = input.trim().slice(0, 200);
      return { step: "academy_contact", state };
    }
    if (action === "input" && snapshot.lastStep === "academy_contact" && input.trim().length >= 3) {
      state.contact = input.trim().slice(0, 320);
      return { step: "academy_students", state };
    }
    if (/^students_(under50|50_199|200_499|500plus)$/.test(action) && snapshot.lastStep === "academy_students") {
      state.student_range = action.slice(9);
      return { step: "academy_capability", state };
    }
    if (/^cap_(attendance|homework|payments|all)$/.test(action) && snapshot.lastStep === "academy_capability") {
      state.capability = action.slice(4);
      return { step: "academy_preference", state };
    }
    if (/^contact_(telegram|phone|email)$/.test(action) && snapshot.lastStep === "academy_preference") {
      state.preferred_contact_method = action.slice(8);
      return { step: "academy_lead_ready", state, createLead: true, firstValue: true };
    }
    throw new Error("invalid_funnel_transition");
  }

  if (/^goal_(6_5|7_0|7_5)$/.test(action) && snapshot.lastStep === "student_goal") {
    state.target_score = action.slice(5).replace("_", ".");
    return { step: "student_exam_date", state };
  }
  if (/^exam_(30|90|later)$/.test(action) && snapshot.lastStep === "student_exam_date") {
    state.exam_window = action.slice(5);
    return { step: "diagnostic_q1", state, event: "diagnostic_started" };
  }
  const answer = action.match(/^answer_q([123])_([012])$/);
  if (answer && snapshot.lastStep === `diagnostic_q${answer[1]}`) {
    const question = Number(answer[1]);
    const answers = { ...(state.answers ?? {}), [`q${question}`]: IELTS_VOCAB_DIAGNOSTIC[question - 1].options[Number(answer[2])] };
    state.answers = answers;
    if (question < 3) return { step: `diagnostic_q${question + 1}`, state };
    state.result = scoreVocabularyDiagnostic(answers);
    return { step: "diagnostic_result", state, event: "diagnostic_completed", firstValue: true };
  }
  throw new Error("invalid_funnel_transition");
};
