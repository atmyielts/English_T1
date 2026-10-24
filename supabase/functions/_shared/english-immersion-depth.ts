// Real-life tasks that remember the learner.
//
// 1. Personal targets for any mission or project step: up to three saved
//    notebook words to use (using one counts as a review), and up to two of
//    the learner's recent mistakes to watch out for. After checking, each
//    watched mistake is "repeated" (the wrong form is back), "avoided" (the
//    right form is used and the wrong one is not) or "not_seen".
// 2. Multi-day projects: a small real goal done in three steps on three
//    learner days (UTC+5). Each day is a reply or a spoken message judged by
//    the same checker as mission steps, and builds on the previous day's
//    answer. A day can be redone on the day it was done; the next day opens
//    on the following learner day.
//
// Pure module with no imports.

// ---------------------------------------------------------------------------
// Personal targets
// ---------------------------------------------------------------------------

export type WatchItem = { id: string; wrong: string; right: string; topic: string | null };
export type WatchOutcome = WatchItem & { result: "repeated" | "avoided" | "not_seen" };

const squash = (value: string): string =>
  ` ${String(value ?? "").toLowerCase().replace(/[’‘`]/g, "'").replace(/[^\p{L}\p{N}']+/gu, " ").replace(/\s+/g, " ").trim()} `;

/** "wrong → right" from a stored mistake, or null when it is not a learner sentence. */
export const splitWatchMistake = (text: string): { wrong: string; right: string } | null => {
  const parts = String(text ?? "").split(/\s*(?:→|->)\s*/);
  if (parts.length !== 2) return null;
  const wrong = parts[0]!.replace(/^["“']|["”']$/g, "").trim();
  const right = parts[1]!.replace(/^["“']|["”']$/g, "").trim();
  if (!wrong || !right || squash(wrong) === squash(right)) return null;
  const words = wrong.split(/\s+/).length;
  if (words > 8 || squash(wrong).trim().length < 3) return null;
  return { wrong, right };
};

/** Up to `max` mistakes to watch, newest and most frequent first, one per wrong form. */
export const pickWatchItems = (
  rows: Array<{ id: string; error_type: unknown; topic: string | null; times?: number; last_seen_at?: string | null }>,
  max = 2,
): WatchItem[] => {
  const seen = new Set<string>();
  const out: WatchItem[] = [];
  const sorted = [...rows].sort((a, b) =>
    (Number(b.times ?? 1) - Number(a.times ?? 1)) || String(b.last_seen_at ?? "").localeCompare(String(a.last_seen_at ?? "")));
  for (const row of sorted) {
    const split = splitWatchMistake(String(row.error_type ?? ""));
    if (!split) continue;
    const key = squash(split.wrong);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: String(row.id), wrong: split.wrong, right: split.right, topic: row.topic });
    if (out.length >= max) break;
  }
  return out;
};

/** Did the learner's text repeat the mistake, avoid it by using the right form, or not touch it? */
export const watchResult = (text: string, item: Pick<WatchItem, "wrong" | "right">): WatchOutcome["result"] => {
  const haystack = squash(text);
  const wrong = squash(item.wrong);
  const right = squash(item.right);
  if (wrong.trim().length < 3) return "not_seen";
  // The wrong form inside the right one ("go school" in "go to school") must not count.
  const withoutRight = right.trim() ? haystack.split(right).join(" ") : haystack;
  if (withoutRight.includes(wrong)) return "repeated";
  if (right.trim() && haystack.includes(right)) return "avoided";
  return "not_seen";
};

export const watchOutcomes = (texts: string[], items: WatchItem[]): WatchOutcome[] => {
  const joined = texts.join("\n");
  return items.map((item) => ({ ...item, result: watchResult(joined, item) }));
};

// ---------------------------------------------------------------------------
// Multi-day projects
// ---------------------------------------------------------------------------

export type ProjectPoint = { label: string; any: string[] };

export type ProjectDay = {
  day: number;
  kind: "reply" | "speak";
  title: string;
  /** What happened, in English (shown to the learner). */
  situation: string;
  /** What to write or say. */
  task: string;
  goal: string;
  points: ProjectPoint[];
  min_words: number;
  model_answer: string;
};

export type ProjectDef = {
  key: string;
  title: string;
  level: "A2" | "B1";
  summary: string;
  /** What the learner can say they can do after finishing. */
  can_do: string;
  days: ProjectDay[];
};

export const PROJECTS: readonly ProjectDef[] = [
  {
    key: "weekend-trip",
    title: "Plan a weekend trip",
    level: "B1",
    summary: "Over three days, suggest a trip to your friends, book a place to stay and share the final plan.",
    can_do: "I can plan a short trip in English: suggest it, book a room and explain the plan.",
    days: [
      {
        day: 1,
        kind: "reply",
        title: "Suggest the trip",
        situation: "You and two friends from your English class want to go away for a weekend next month.",
        task: "Write a message to the group chat. Suggest a place and say why it is a good idea, give possible dates, and ask your friends for their opinion.",
        goal: "The friends understand where, why and when, and are invited to answer.",
        points: [
          { label: "suggest a place", any: ["let's go", "how about", "what about", "we could", "why don't we", "i suggest", "go to"] },
          { label: "give a reason", any: ["because", "since", "it's", "it is", "beautiful", "famous", "cheap", "we can see"] },
          { label: "give possible dates", any: ["saturday", "sunday", "friday", "the 1*", "the 2*", "the 3*", "from the", "on the"] },
          { label: "ask what they think", any: ["what do you think", "are you free", "do you want", "would you like", "is that ok", "let me know", "what about you"] },
        ],
        min_words: 35,
        model_answer:
          "Hi everyone! How about a weekend in Samarkand next month? It's only two hours by train, and we can see the Registan lit up at night. I'm free on the 14th and 15th, so we could leave on Saturday morning and come back on Sunday evening. What do you think? Are you both free that weekend?",
      },
      {
        day: 2,
        kind: "reply",
        title: "Book a place to stay",
        situation: "Your friends liked the idea. Now you need somewhere to stay for one night.",
        task: "Write a short email to a small guesthouse. Say when you are coming and how many of you there are, ask about the cost and the morning meal, and ask one more question.",
        goal: "The guesthouse can answer with a price and confirm the room.",
        points: [
          { label: "say when you are coming", any: ["saturday", "sunday", "night", "arrive", "on the", "from the", "the 1*"] },
          { label: "say how many people", any: ["three people", "3 people", "for three", "for 3", "three of us", "we are three", "people"] },
          { label: "ask about the price", any: ["how much", "price", "rate", "per night"] },
          { label: "ask about breakfast", any: ["breakfast"] },
          { label: "open and close politely", any: ["dear", "hello", "best regards", "kind regards", "thank you", "thanks", "regards"] },
        ],
        min_words: 45,
        model_answer:
          "Dear Sir or Madam,\n\nI would like to book a room for three people for the night of Saturday 14th. We will arrive in the afternoon by train. How much is a room for three for one night, and is breakfast included? Also, is it easy to walk from your guesthouse to the Registan?\n\nThank you in advance.\nBest regards,\nAziza",
      },
      {
        day: 3,
        kind: "speak",
        title: "Share the plan",
        situation: "The guesthouse answered and everything is booked.",
        task: "Record a voice message for the group (about a minute). Explain how you will travel, where you will stay, what you will do there, and when and where to meet.",
        goal: "Everyone knows the plan and what to do on the day.",
        points: [
          { label: "say how you will travel", any: ["train", "bus", "car", "taxi", "by train", "leave", "ticket"] },
          { label: "say where you will stay", any: ["guesthouse", "hotel", "stay", "room"] },
          { label: "say what you will do", any: ["visit", "see", "go to", "walk", "try", "eat", "explore"] },
          { label: "say when and where to meet", any: ["meet", "o'clock", "at the station", "in the morning", "don't be late", "pm"] },
        ],
        min_words: 50,
        model_answer:
          "Hi guys, here's the plan. We're taking the 8 o'clock train on Saturday, so let's meet at the station at half past seven. We're staying at a small guesthouse near the Registan, and breakfast is included. On Saturday we'll visit the Registan and walk to the Siab Bazaar, and in the evening we can try plov. On Sunday we'll see Shah-i-Zinda and come back by the evening train. Don't forget your passports!",
      },
    ],
  },
  {
    key: "part-time-job",
    title: "Apply for a part-time job",
    level: "B1",
    summary: "Answer a job advert, do the interview out loud, then follow up like a professional.",
    can_do: "I can apply for a job in English: write about myself, answer interview questions and follow up.",
    days: [
      {
        day: 1,
        kind: "reply",
        title: "Answer the advert",
        situation: "A café in Tashkent is looking for a weekend assistant who can speak some English with tourists. Applicants should send a short message about themselves.",
        task: "Write your message to the manager. Introduce yourself, explain why you want this job, say when you can work and mention any useful experience.",
        goal: "The manager wants to invite you to an interview.",
        points: [
          { label: "introduce yourself", any: ["my name is", "i am", "i'm", "i study", "student"] },
          { label: "say why you want the job", any: ["because", "would like", "want to", "interested", "enjoy", "love"] },
          { label: "say when you can work", any: ["saturday", "sunday", "weekends", "available", "free", "can work"] },
          { label: "mention experience or skills", any: ["experience", "worked", "helped", "used to", "i can", "good at", "volunteer*"] },
        ],
        min_words: 40,
        model_answer:
          "Dear Manager,\n\nMy name is Jasur and I'm a second-year student at a university in Tashkent. I would like to work at your café because I enjoy meeting people and I want to practise my English with tourists. I am free every Saturday and Sunday. Last summer I helped at my uncle's shop, so I know how to use a till and talk to customers.\n\nBest regards,\nJasur",
      },
      {
        day: 2,
        kind: "speak",
        title: "The interview",
        situation: "The manager calls you for a short phone interview.",
        task: "Answer out loud, one after another: Why do you want to work here? What are you good at? What would you do if a customer was unhappy with their order?",
        goal: "Clear, friendly answers to all three questions.",
        points: [
          { label: "give a reason for applying", any: ["because", "would like", "want to", "enjoy", "love", "interested"] },
          { label: "describe a strength", any: ["good at", "i can", "i'm good", "friendly", "patient", "hard-working", "fast learner", "careful"] },
          { label: "handle the unhappy customer", any: ["sorry", "apologi*", "listen", "calm", "new one", "change", "replace", "help"] },
        ],
        min_words: 50,
        model_answer:
          "I'd like to work here because I really enjoy talking to people, and your café is popular with tourists, so I can use my English every day. I'm good at working in a team and I stay calm when it's busy. If a customer was unhappy, I would listen carefully, say sorry and offer to change the order. If I couldn't solve the problem, I would ask you for help.",
      },
      {
        day: 3,
        kind: "reply",
        title: "Follow up",
        situation: "The interview went well and the manager said she would decide this week.",
        task: "Write a short follow-up email: thank the manager, mention something you liked about the interview or the café, say when you could start, and ask about the next step.",
        goal: "A polite, professional email that keeps you in the manager's mind.",
        points: [
          { label: "thank the manager", any: ["thank you", "thanks", "grateful", "appreciate"] },
          { label: "mention something you liked", any: ["enjoyed", "liked", "nice to", "pleasure", "interesting", "learnt", "learned"] },
          { label: "say when you could start", any: ["start", "begin", "from monday", "next week", "available", "this saturday"] },
          { label: "ask about the next step", any: ["next step", "hear from you", "let me know", "when will", "what happens", "decision"] },
        ],
        min_words: 40,
        model_answer:
          "Dear Ms Karimova,\n\nThank you for talking to me yesterday. I enjoyed hearing about how the café works at weekends, and I liked the friendly team. I could start this Saturday if you need me. Could you let me know when you will make your decision?\n\nBest wishes,\nJasur",
      },
    ],
  },
  {
    key: "birthday-dinner",
    title: "Organise a birthday dinner",
    level: "A2",
    summary: "Invite friends, book a table by phone and deal with a last-minute change.",
    can_do: "I can organise a small event in English: invite people, book a table and change the plan.",
    days: [
      {
        day: 1,
        kind: "reply",
        title: "Invite your friends",
        situation: "Your friend Malika's birthday is next Saturday. You want to take her out for dinner with some friends.",
        task: "Write a message to your friends. Say what it is for, when and where, and ask them to answer.",
        goal: "Your friends know the plan and reply.",
        points: [
          { label: "say what it is for", any: ["birthday", "celebrate", "party", "surprise"] },
          { label: "say when", any: ["saturday", "o'clock", "pm", "evening", "at 7", "at seven", "at 6", "at six"] },
          { label: "say where", any: ["restaurant", "café", "cafe", "place", "at the"] },
          { label: "ask them to answer", any: ["let me know", "tell me", "can you come", "reply", "are you coming", "will you come"] },
        ],
        min_words: 25,
        model_answer:
          "Hi all! Next Saturday is Malika's birthday. Let's take her out for dinner! I want to book a table at Caravan restaurant at 7 pm. It's a surprise, so don't tell her. Can you come? Please let me know by Thursday.",
      },
      {
        day: 2,
        kind: "speak",
        title: "Book a table",
        situation: "Five friends can come. Now you call the restaurant.",
        task: "Say what you would say on the phone: ask for a table, give the day, the time and how many people, and ask if they can bring a cake.",
        goal: "The restaurant has everything it needs for your booking.",
        points: [
          { label: "ask for a table", any: ["book", "reserve", "table", "reservation"] },
          { label: "give the day and time", any: ["saturday", "o'clock", "pm", "evening", "at 7", "at seven"] },
          { label: "say how many people", any: ["people", "of us", "six", "five", "persons", "for 6", "for 5"] },
          { label: "ask about a cake", any: ["cake", "dessert", "candles"] },
        ],
        min_words: 25,
        model_answer:
          "Hello, I'd like to book a table for six people for this Saturday at 7 pm, please. It's my friend's birthday. Can you bring a cake with candles at the end of the dinner? My name is Dilnoza. Thank you!",
      },
      {
        day: 3,
        kind: "reply",
        title: "A change of plan",
        situation: "The restaurant calls you: they are closed on Saturday evening for a private event. They have a free table on Sunday at the same time.",
        task: "Write to your friends. Explain the problem, apologise and suggest the new plan. Ask them to confirm.",
        goal: "Your friends understand the change and confirm.",
        points: [
          { label: "explain the problem", any: ["closed", "problem", "can't", "cannot", "cancel*", "private event", "not open"] },
          { label: "say sorry", any: ["sorry", "apologi*", "unfortunately"] },
          { label: "suggest the new plan", any: ["sunday", "instead", "new plan", "how about", "let's", "moved", "change"] },
          { label: "ask them to confirm", any: ["let me know", "confirm", "is that ok", "can you come", "tell me", "reply"] },
        ],
        min_words: 25,
        model_answer:
          "Hi everyone, I'm sorry, but there's a problem. The restaurant is closed on Saturday evening because of a private event. They have a table for us on Sunday at 7 pm instead. Is that OK for you? Please let me know today so I can confirm the booking.",
      },
    ],
  },
];

export const projectByKey = (key: string): ProjectDef | null => PROJECTS.find((project) => project.key === key) ?? null;

/** The day's expected answer for the step checker (immersion judge). */
export const dayExpected = (day: ProjectDay): Record<string, unknown> => ({
  goal: day.goal,
  points: day.points,
  min_words: day.min_words,
  model_answer: day.model_answer,
});

export type ProjectDayResult = {
  day: number;
  score: number;
  response: string;
  mode: "voice" | "typed";
  achieved: boolean;
  points: Array<{ label: string; met: boolean }>;
  corrections: Array<{ original: string; better: string; explanation: string }>;
  summary: string;
  words_used: string[];
  feedback_mode: "ai" | "basic";
  /** Learner date (UTC+5, YYYY-MM-DD) it was done. */
  done_on: string;
  at: string;
};

export type ProjectRun = {
  status: "active" | "completed" | "abandoned";
  days: ProjectDayResult[];
  started_at: string;
  completed_at: string | null;
};

export const LEARNER_OFFSET_MS = 5 * 3_600_000;

/** Learner calendar date (UTC+5). */
export const learnerDay = (at: Date | string): string =>
  new Date(new Date(at).getTime() + LEARNER_OFFSET_MS).toISOString().slice(0, 10);

/** Reads stored day results, keeping only well-formed ones in day order. */
export const readRunDays = (raw: unknown): ProjectDayResult[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((entry): entry is ProjectDayResult =>
      Boolean(entry) && typeof entry === "object" && Number.isInteger((entry as ProjectDayResult).day) && typeof (entry as ProjectDayResult).done_on === "string")
    .sort((a, b) => a.day - b.day);

export type DayStatus = "done" | "open" | "tomorrow" | "locked";

export type ProjectState = {
  days: Array<{ day: number; status: DayStatus; result: ProjectDayResult | null; can_redo: boolean }>;
  /** The day to do now, or null (finished, or waiting for tomorrow). */
  current: number | null;
  /** Learner date the next day opens, when waiting. */
  opens_on: string | null;
  done: boolean;
};

const nextDate = (date: string): string => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

/**
 * Status of every day. Day 1 opens when the project starts; each later day
 * opens on the learner day after the previous one was done. The latest done
 * day can be redone on the same learner day (to improve it) while the next
 * day is still closed.
 */
export const projectState = (project: ProjectDef, runDays: ProjectDayResult[], today: string): ProjectState => {
  const byDay = new Map(runDays.map((entry) => [entry.day, entry]));
  const out: ProjectState["days"] = [];
  let current: number | null = null;
  let opensOn: string | null = null;
  for (const day of project.days) {
    const result = byDay.get(day.day) ?? null;
    const previous = day.day === 1 ? null : byDay.get(day.day - 1) ?? null;
    if (result) {
      const nextDone = byDay.has(day.day + 1);
      out.push({ day: day.day, status: "done", result, can_redo: !nextDone && result.done_on === today });
      continue;
    }
    if (day.day === 1 || (previous && previous.done_on < today)) {
      out.push({ day: day.day, status: current === null ? "open" : "locked", result: null, can_redo: false });
      if (current === null) current = day.day;
    } else if (previous && previous.done_on >= today) {
      out.push({ day: day.day, status: "tomorrow", result: null, can_redo: false });
      opensOn ??= nextDate(previous.done_on);
    } else {
      out.push({ day: day.day, status: "locked", result: null, can_redo: false });
    }
  }
  return { days: out, current, opens_on: current === null ? opensOn : null, done: out.every((entry) => entry.status === "done") };
};

/** Whether the learner may submit this day now. */
export const canSubmitDay = (project: ProjectDef, runDays: ProjectDayResult[], dayNumber: number, today: string): { ok: true } | { ok: false; reason: "unknown_day" | "locked" | "tomorrow" | "done" } => {
  const state = projectState(project, runDays, today);
  const entry = state.days.find((day) => day.day === dayNumber);
  if (!entry) return { ok: false, reason: "unknown_day" };
  if (entry.status === "open") return { ok: true };
  if (entry.status === "done") return entry.can_redo ? { ok: true } : { ok: false, reason: "done" };
  return { ok: false, reason: entry.status === "tomorrow" ? "tomorrow" : "locked" };
};

/** Adds (or replaces, when redone) one day's result; the run completes when every day is done. */
export const applyDayResult = (project: ProjectDef, run: ProjectRun, result: ProjectDayResult): ProjectRun => {
  const days = [...run.days.filter((entry) => entry.day !== result.day), result].sort((a, b) => a.day - b.day);
  const complete = project.days.every((day) => days.some((entry) => entry.day === day.day));
  return {
    ...run,
    days,
    status: complete ? "completed" : "active",
    completed_at: complete ? (run.completed_at ?? result.at) : null,
  };
};

/** What the learner wrote or said the day before, as a short quote for continuity. */
export const previousExcerpt = (runDays: ProjectDayResult[], dayNumber: number, max = 160): string | null => {
  const previous = runDays.find((entry) => entry.day === dayNumber - 1);
  const text = previous?.response?.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

export type ProjectSummary = {
  score: number;
  days: Array<{ day: number; title: string; score: number; achieved: boolean }>;
  points_met: number;
  points_total: number;
  words_used: string[];
  corrections: number;
  can_do: string;
  achieved_all: boolean;
};

/** End-of-project summary across the days (only from stored results). */
export const projectSummary = (project: ProjectDef, runDays: ProjectDayResult[]): ProjectSummary => {
  const days = project.days.map((day) => {
    const result = runDays.find((entry) => entry.day === day.day);
    return { day: day.day, title: day.title, score: result ? Math.round(result.score) : 0, achieved: result?.achieved ?? false };
  });
  const points = runDays.flatMap((entry) => entry.points);
  return {
    score: days.length ? Math.round(days.reduce((sum, day) => sum + day.score, 0) / days.length) : 0,
    days,
    points_met: points.filter((point) => point.met).length,
    points_total: points.length,
    words_used: [...new Set(runDays.flatMap((entry) => entry.words_used))],
    corrections: runDays.reduce((sum, entry) => sum + entry.corrections.length, 0),
    can_do: project.can_do,
    achieved_all: days.every((day) => day.achieved),
  };
};
