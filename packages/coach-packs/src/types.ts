// The Schood Coaches pack format. A pack is data only: every coach (B1–B6) is one
// pack plus a bot token, running on the shared engine. The engine validates each
// pack when it loads and in CI (validate.ts); README.md documents every field.
//
// Two kinds of text:
//   - `Localized`: shown to the learner in their interface language. Every
//     language in `manifest.uiLanguages` is required.
//   - plain `string`: practice content in the pack's practice language (an IELTS
//     question, a persona line, a reading passage). Never translated.

export const LOCALES = ['en', 'uz', 'ru'] as const;
export type Locale = (typeof LOCALES)[number];
export type Localized = Partial<Record<Locale, string>>;

/** The coach features of the plan matrix (packages/ai-core plans.ts). */
export const COACH_FEATURES = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] as const;
export type CoachFeature = (typeof COACH_FEATURES)[number];

/** The generic activity kinds the engine runs. A pack offers any subset. */
export const ACTIVITY_KINDS = ['speaking_exam', 'roleplay', 'writing', 'quiz_set', 'deck', 'drill', 'shadowing', 'lesson', 'photo_help'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** A level scale: IELTS bands, CEFR levels, a percentage. Goals, milestones and rubrics use one. */
export interface LevelScale {
  /** `ielts_band`, `cefr`, `percent`… */
  id: string;
  min: number;
  max: number;
  /** Smallest difference between two values (0.5 for IELTS bands). */
  step: number;
  /** Named values (CEFR: 1 = A1 … 6 = C2). A value without a label is shown as a number. */
  labels?: { value: number; label: string }[];
  decimals?: number;
  /**
   * Values on this scale are accuracies (a percentage scale, B3 Admission Maths): a
   * checked set moves a skill's level as well as its mastery.
   */
  fromAccuracy?: true;
}

// --- Manifest -----------------------------------------------------------------------

export interface SkillNode {
  /** `speaking.fluency`; the engine reports it as `<pack id>.<node id>`. */
  id: string;
  name: Localized;
  /** Parent node id; roots have none. */
  parent?: string;
  /** Relative importance for the planner (default 1). */
  weight?: number;
  /**
   * Prerequisite nodes (a topic graph such as packages/subject-core's maths topics).
   * With `plan.selection: 'mastery'` a topic waits while its prerequisites are weak.
   */
  requires?: string[];
}

/** A recurring error the engine counts per learner, with its fix. */
export interface ErrorTag {
  /** `articles`, `tense_consistency`… */
  id: string;
  name: Localized;
  /** The rule in one or two sentences, in the interface language (beginners read it in uz/ru). */
  explain: Localized;
  /** The skill node it hurts. */
  node: string;
  /** The authored drill that fixes it. */
  drill?: string;
}

/** What the main bot menu offers, in order. The engine knows each action. */
export const MENU_ACTIONS = ['today', 'speaking', 'mock', 'roleplay', 'writing', 'reading', 'listening', 'practice', 'vocab', 'phrases', 'drill', 'shadowing', 'photo', 'lesson', 'mistakes', 'script', 'progress', 'report', 'plan', 'settings', 'help'] as const;
export type MenuAction = (typeof MENU_ACTIONS)[number];
export interface MenuItem { action: MenuAction; label: Localized; emoji?: string }

export interface PackManifest {
  /** URL and bot id: `/tg/<id>`, `/coach/<id>`. `^[a-z][a-z0-9-]{1,15}$`. */
  id: string;
  /** The plan-matrix feature this coach is sold as; also the credit-key prefix (`coach_b1.turn`). */
  feature: CoachFeature;
  /** Bumped when content changes; stored on every session. */
  version: string;
  name: Localized;
  tagline: Localized;
  description: Localized;
  /** Languages the coach explains things in. */
  uiLanguages: Locale[];
  /** The language the learner practises in; also the speech-to-text language hint. */
  practiceLanguage: Locale | 'mixed';
  audience: { description: Localized; minAge?: number; levels: [number, number] };
  scale: LevelScale;
  skills: SkillNode[];
  errorTags: ErrorTag[];
  menu: MenuItem[];
  /** Bot commands for BotFather's menu (`/today`). */
  commands: { command: string; description: Localized }[];
  /** Explanations switch to the interface language below this level (beginners). */
  explainInUiLanguageBelow?: number;
  /** Correction styles the learner can pick in role-plays and speaking. */
  correctionModes?: ('gentle' | 'strict')[];
  /** Brand colour for the Mini App header (a hex colour). */
  accent?: string;
  /**
   * In a `mixed` pack: the language the plain practice strings are written in. The
   * other interface languages come from each item's `i18n`, written with `T()` in the
   * pack files and split by `definePack` (localize.ts). Default `en`.
   */
  contentLanguage?: Locale;
}

// --- Fluency (speaking analysis) -------------------------------------------------------------

export interface FluencyConfig {
  /** Filler words and phrases per language ("um", "ee", "типа", "anu"). */
  fillers: Partial<Record<Locale, string[]>>;
  /** A pause between words longer than this counts as a long pause. */
  longPauseSeconds: number;
  /** Comfortable pace in words per minute, per level band: `[minLevel, minWpm, maxWpm]`. */
  pace: [number, number, number][];
}

// --- Rubrics and calibration --------------------------------------------------------------------

export interface Descriptor { score: number; text: string }
export interface RubricCriterion {
  /** Stable id stored with every score (`fluency_coherence`). */
  id: string;
  name: Localized;
  short: string;
  /**
   * `model`: scored from the learner's words with quoted evidence.
   * `audio`: needs analysis of the sound itself; the engine reports it as not
   * scored instead of guessing from a transcript (IELTS pronunciation).
   */
  source: 'model' | 'audio';
  /** The skill node this score moves (mastery and gap tracking). */
  node: string;
  weight?: number;
  /** What each score means, in the pack's own words (never copied descriptors). */
  descriptors: Descriptor[];
  /** What the assessor looks for. */
  focus: string;
}

/** A learner answer with author-rated reference scores. */
export interface CalibrationSample {
  id: string;
  /** The task or question it answers. */
  task: string;
  response: string;
  /** Speaking samples may carry measured fluency numbers. */
  metrics?: { wpm?: number; longPauses?: number; fillers?: number; seconds?: number };
  /** Reference score per criterion (only `model` criteria), on the rubric's scale. */
  reference: Record<string, number>;
  /** Why: so a reviewer can disagree with a reason. */
  rationale: string;
}

/**
 * One assessor run on a sample, in the shape the model returns. Authored runs test the
 * pipeline in CI; scripts/coach-calibration-live.ts --out produces real ones to replace them.
 */
export interface CalibrationRun {
  criteria: Record<string, { score: number; evidence: string[] }>;
}

export interface Rubric {
  id: string;
  name: Localized;
  /**
   * Results come from an answer key (timed sets that name this rubric, such as B3's
   * mini-mocks: the share right, on this scale), not from a model. A keyed rubric has no
   * criteria and no calibration set; milestones, forecasts and certificates work as for
   * any rubric.
   */
  keyed?: true;
  /**
   * Keyed rubrics on a percentage scale: exam blocks the share right is projected onto
   * ("≈ 7 of 10 questions"), shown with each result. Counts only; no points or grades.
   */
  projections?: { name: Localized; questions: number }[];
  /** Scale of each criterion. */
  scale: LevelScale;
  criteria: RubricCriterion[];
  /** Overall = weighted mean of scored criteria, rounded with `round` to `step` (default the criterion step). */
  overall: { round: 'step' | 'half_up' | 'down'; step?: number };
  /** Quotes the assessor must give per criterion. */
  evidence: { min: number; max: number };
  /** Rules for the assessor in the practice language. */
  assessorNotes: string;
  calibration: {
    /** CI fails below these against the recorded runs; the live script reports the same against real models. */
    thresholds: { exact: number; adjacent: number; maxMae: number; maxSpread: number; evidenceValid: number };
    samples: CalibrationSample[];
    /** Assessor runs per sample id (at least two per sample, for run-to-run consistency). */
    runs: Record<string, CalibrationRun[]>;
  };
}

// --- Activities --------------------------------------------------------------------------------

interface ActivityBase {
  /** Unique in the pack: `ielts.speaking.mock`, `rp.cafe-order`. `^[a-z0-9][a-z0-9_.-]{1,80}$`. */
  id: string;
  kind: ActivityKind;
  title: Localized;
  /** The skill node it practises. */
  node: string;
  /** Levels (on the pack scale) it suits: `[min, max]`. */
  levels: [number, number];
  /** About how long it takes. */
  minutes: number;
  tags?: string[];
  /**
   * Curated fact datasets (`facts[].id`) this activity relies on, such as a student-visa
   * interview. The model gets only these facts, and the learner sees when they were checked.
   */
  facts?: string[];
  /**
   * Mixed packs only: the practice text in the other interface languages, as the same
   * shape holding only strings (written with `T()` and split by `definePack`; localize.ts).
   */
  i18n?: Partial<Record<Locale, unknown>>;
}

export interface CueCard {
  id: string;
  topic: string;
  points: string[];
  prepSeconds: number;
  talkSeconds: number;
  /** Below this the coach says the talk was short. */
  minTalkSeconds: number;
  /** Short questions after the long turn. */
  roundOff: string[];
  /** Discussion questions linked to the card (IELTS Part 3). */
  discussion: string[];
}

export interface SpeakingPart {
  id: string;
  title: Localized;
  /** `questions`: short answers; `long_turn`: a cue card with prep and talk timers. */
  kind: 'questions' | 'long_turn';
  /** What the examiner says to open the part. */
  intro: string;
  /** For `questions`: topic groups to pick from. */
  topics?: { id: string; title: string; questions: string[] }[];
  pickTopics?: number;
  askPerTopic?: number;
  /** For `questions`: take the questions from the long-turn card chosen in this part instead. */
  fromCard?: string;
  /** For `long_turn`. */
  cards?: CueCard[];
  /** Answer length that fits this part, in seconds. */
  answerSeconds: { min: number; target: number; max: number };
}

/** A structured speaking exam or rehearsal: IELTS Parts 1–3, an elevator pitch, an impromptu talk. */
export interface SpeakingExam extends ActivityBase {
  kind: 'speaking_exam';
  rubric: string;
  parts: SpeakingPart[];
  /** True: the whole flow with a final report (the `review` credit). False: single-part practice. */
  mock: boolean;
}

export interface HiddenField {
  id: string;
  kind: 'number' | 'enum' | 'boolean';
  min?: number;
  max?: number;
  values?: string[];
  /** What it means, for the persona model. */
  description: string;
  /** Shown to the learner in the review ("Budget: 12m — they could afford it"). */
  revealInReview: boolean;
}

/** A conversation with a persona whose hidden state reacts to what the learner says. */
export interface Roleplay extends ActivityBase {
  kind: 'roleplay';
  rubric: string;
  setting: Localized;
  learnerRole: Localized;
  goal: Localized;
  persona: {
    name: string;
    role: string;
    /** How the persona talks and behaves. */
    style: string;
    /** The persona's first line. */
    opening: string;
    /** Text-to-speech voice name when a provider is set up. */
    voice?: string;
  };
  hiddenState: {
    fields: HiddenField[];
    initial: Record<string, number | string | boolean>;
    /** How the state moves with what the learner says, in plain words. */
    rules: string;
  };
  /**
   * What the learner should achieve; the review ticks each one with a quote. `kind`
   * feeds the sales scorecard: objections handled (of those in the call) and whether a
   * next step was secured.
   */
  goals: { id: string; text: Localized; check: string; kind?: 'objection' | 'next_step' }[];
  /** Deterministic scorecard numbers to show after the call. */
  scorecard: ('talk_ratio' | 'questions_asked' | 'average_turn_words' | 'pace')[];
  minTurns: number;
  maxTurns: number;
  /** How the persona adapts its language by learner level: `[maxLevel, note]`, lowest first. */
  levelNotes: [number, string][];
  /** Phrase-bank card ids worth using here. */
  phrases?: string[];
  /**
   * `own_product`: practised with one of the learner's saved scripts (the script
   * builder): the persona becomes a buyer of their product and raises their
   * objections. Not listed with the other role-plays.
   */
  template?: 'own_product';
}

export interface DataTable {
  kind: 'table' | 'bar' | 'line' | 'pie' | 'process' | 'map';
  title: string;
  unit?: string;
  columns: string[];
  rows: (string | number)[][];
  /** "Figures are for practice only." */
  note: string;
}

export interface WritingTask extends ActivityBase {
  kind: 'writing';
  rubric: string;
  prompt: string;
  /** A chart or table the learner describes (rendered in the Mini App, sent as text in chat). */
  data?: DataTable;
  minWords: number;
  recommendedMinutes: number;
  /** What a strong answer covers, for the assessor. */
  assessorNotes: string;
  /** Essay ladder levels (on the rubric scale). */
  ladder?: number[];
}

export interface QuizQuestion {
  id: string;
  /** A question type from `questionTypes` (true_false_not_given, form_completion, numeric…). */
  type: string;
  prompt: string;
  options?: string[];
  /** Option index, accepted answers (case and spacing ignored), or a number with a tolerance. */
  answer: number | string[] | { numeric: number; tolerance?: number };
  /** Why that is the answer. */
  explanation: Localized;
  /** The words in the passage or script that prove it. */
  evidence?: string;
  /** "NO MORE THAN TWO WORDS". */
  wordLimit?: number;
  /** Step-by-step hints before the answer (maths). */
  hints?: Localized[];
  /** 1 easy, 2 medium, 3 hard: drawn sets start near the learner's level. */
  difficulty?: 1 | 2 | 3;
}

export interface QuizSet extends ActivityBase {
  kind: 'quiz_set';
  /** `reading` shows a passage, `listening` plays a script, `practice` stands alone. */
  mode: 'reading' | 'listening' | 'practice';
  passage?: { title: string; text: string };
  /** Listening: the script read aloud by text-to-speech, or by the browser in the Mini App. */
  audio?: { script: string; voice?: string };
  timeLimitSeconds: number;
  questions: QuizQuestion[];
  /**
   * Draw this many questions per session from `questions` (a topic bank): first ones
   * never answered, then ones answered wrong; none answered right in the last week.
   */
  draw?: number;
  /**
   * A timed mini-mock assembled from the pack's practice banks, spread over their skill
   * nodes by node weight like an exam blueprint. `questions` stays empty.
   */
  mock?: { questions: number; nodes?: string[] };
  /** A keyed rubric the result is recorded on (the share right, on its scale): milestones and forecasts. */
  rubric?: string;
}

export interface DeckCard {
  id: string;
  /** The word or phrase. */
  front: string;
  /** Meaning in the practice language. */
  meaning: string;
  translations: Partial<Record<Locale, string>>;
  example: string;
  /** Phrases: when you would say it. */
  situation?: string;
  /** Wrong options for quiz polls (at least three). */
  distractors: string[];
  collocations?: string[];
}
/** Spaced-repetition cards, reviewed with quiz polls. */
export interface Deck extends ActivityBase {
  kind: 'deck';
  cardType: 'word' | 'phrase';
  cards: DeckCard[];
}

export interface DrillItem {
  id: string;
  prompt: string;
  options?: string[];
  answer: number | string[];
  explanation: Localized;
}
/** Targeted practice for one recurring error. */
export interface Drill extends ActivityBase {
  kind: 'drill';
  errorTag: string;
  explain: Localized;
  items: DrillItem[];
  /** When the authored items run out, fresh AI items (checked like T2) may be made. */
  aiVariants: boolean;
}

export interface Shadowing extends ActivityBase {
  kind: 'shadowing';
  sentences: { id: string; text: string; focus: Localized; translations?: Partial<Record<Locale, string>> }[];
}

export interface Lesson extends ActivityBase {
  kind: 'lesson';
  body: Localized;
  example: string;
  check: { prompt: string; options: string[]; answer: number; explanation: Localized };
}

/** A photo of a problem or a page: hints first, the worked solution on request (maths). */
export interface PhotoHelp extends ActivityBase {
  kind: 'photo_help';
  subject: string;
  hintLevels: number;
  solutionOnRequest: boolean;
  /** Rules for the model in the practice language. */
  instructions: string;
}

export type Activity = SpeakingExam | Roleplay | WritingTask | QuizSet | Deck | Drill | Shadowing | Lesson | PhotoHelp;

// --- Diagnostic (non-AI, auto-scored) -----------------------------------------------------------

export interface DiagnosticItem {
  id: string;
  /** Skill node the item measures. */
  skill: string;
  /** The level on the pack scale this item sits at. */
  level: number;
  /** `question`: one right option. `can_do`: a self-assessment (Yes / Partly / Not yet). */
  kind: 'question' | 'can_do';
  /** Practice-language text for questions; a Localized statement for can-do items. */
  prompt: string | Localized;
  /** A short text the question is about. */
  passage?: string;
  /** Two to four options (questions only). */
  options?: string[];
  answer?: number;
  /** Mixed packs: the question in the other interface languages (the same option order). */
  i18n?: Partial<Record<Locale, { prompt?: string; passage?: string; options?: string[] }>>;
}

export interface Diagnostic {
  intro: Localized;
  minutes: number;
  /** At most 30, so the answers fit in Telegram button data for people who have not linked yet. */
  items: DiagnosticItem[];
  /** Share of a level's items right to count it as reached. */
  passRatio: number;
}

// --- Plans, reminders, milestones, samples, facts -----------------------------------------------

export const PLAN_SLOTS = ['speaking', 'roleplay', 'writing', 'reading', 'listening', 'practice', 'vocab', 'drill', 'shadowing', 'lesson', 'photo'] as const;
export type PlanSlot = (typeof PLAN_SLOTS)[number];

export interface PlanPhase {
  id: string;
  title: Localized;
  /** The phase applies while at least this many weeks are left (the first match wins, highest first). */
  minWeeksLeft: number;
  /** Relative weight of each slot in a day's tasks. */
  mix: Partial<Record<PlanSlot, number>>;
}

export interface PlanRules {
  goal: {
    /** Target levels the learner can pick (on the pack scale). */
    options: number[];
    default: number;
    examDate: 'required' | 'optional' | 'none';
    /** Plan length when there is no date. */
    defaultWeeks: number;
  };
  dailyMinutes: { options: number[]; default: number };
  phases: PlanPhase[];
  /** A weekly full mock on this weekday (0 = Sunday). */
  weeklyMock?: { activity: string; weekday: number; title: Localized };
  /** Links out (the Schood IELTS simulator). Only https://*.schood.online. */
  links: { id: string; label: Localized; url: string }[];
  /**
   * How practice sets are chosen: `recent` (default), the least recently done set at
   * the learner's level; `mastery`, the topic with the most to gain (node weight × gap
   * to the target) whose prerequisites (`SkillNode.requires`) are not weak, so each day's
   * set follows the topic graph.
   */
  selection?: 'recent' | 'mastery';
  /**
   * Accuracy on timed sets → level, per set mode: `[accuracy 0–1, level]`, rising.
   * The engine reads the level at the highest accuracy reached over recent sets
   * (at least 18 questions), and calls it an estimate.
   */
  estimates?: Partial<Record<'reading' | 'listening' | 'practice', [number, number][]>>;
}

export interface Reminders {
  /** Daily nudges; placeholders {name}, {task}, {minutes}, {streak}. */
  daily: Localized[];
  /** When yesterday was missed. */
  comeback: Localized[];
  /** The weekly report is ready; {delta} is the headline change. */
  weekly: Localized;
  /** {days} days to the exam. */
  countdown: Localized[];
}

export interface Milestone {
  id: string;
  name: Localized;
  /** The level it certifies, on the pack scale. */
  level: number;
  /** Reached when `count` scored results on `rubric` (overall or one criterion) are at least `min` within `withinDays`. */
  rule: { rubric: string; metric: 'overall' | string; min: number; count: number; withinDays: number };
  certificate: boolean;
}

/** One criterion line in an example report: the score and the learner's own words that justify it. */
export interface SampleCriterion { id: string; score: number | null; evidence: string[]; note: Localized }
export interface SampleBodies {
  speaking_report: {
    task: string;
    overall: number;
    criteria: SampleCriterion[];
    metrics: { wpm: number; fillersPerMinute: number; longPauses: number; seconds: number };
    upgrades: { said: string; better: string; why: Localized }[];
  };
  writing_report: {
    task: string;
    overall: number;
    criteria: SampleCriterion[];
    corrections: { original: string; corrected: string; tag: string; why: Localized }[];
    ladder?: { level: number; text: string }[];
  };
  weekly_report: {
    rows: { label: Localized; before: number; after: number; unit?: string; lowerIsBetter?: boolean }[];
    minutes: number;
    streak: number;
    focus: Localized[];
  };
  roleplay_review: {
    scenario: string;
    goals: { text: Localized; met: boolean; quote: string | null }[];
    criteria: SampleCriterion[];
    scorecard: { talkRatio: number; questionsAsked: number; averageTurnWords: number };
    betterLines: { said: string; better: string; why: Localized }[];
  };
  plan: { target: number; weeks: number; days: { day: Localized; tasks: Localized[] }[] };
}
export type SampleKind = keyof SampleBodies;

/** A static, pre-made example shown to people without a plan. Labelled as an example. */
export type Sample = { [K in SampleKind]: {
  id: string;
  kind: K;
  title: Localized;
  /** Short text for the bot. */
  preview: Localized;
  /** The example itself, rendered by the Mini App. */
  body: SampleBodies[K];
  /** Mixed packs: the body's practice text in the other interface languages. */
  i18n?: Partial<Record<Locale, unknown>>;
} }[SampleKind];

/** A curated, dated fact (visa rules, requirements). The engine shows the date and "check the official site". */
export interface FactDataset {
  id: string;
  title: Localized;
  topic: string;
  /** `YYYY-MM-DD` the facts were checked. */
  checkedAt: string;
  /** After this many days the coach says the facts may be out of date. */
  maxAgeDays: number;
  source: { name: string; url: string };
  entries: { id: string; statement: Localized; appliesTo?: string }[];
}

export interface PackSource {
  manifest: PackManifest;
  diagnostic: Diagnostic;
  rubrics: Rubric[];
  activities: Activity[];
  /** Question types with the strategy the coach teaches for each; `node` is the skill node a result moves. */
  questionTypes: { id: string; name: Localized; strategy: Localized; node: string }[];
  fluency: FluencyConfig;
  plan: PlanRules;
  reminders: Reminders;
  milestones: Milestone[];
  samples: Sample[];
  facts?: FactDataset[];
  /** The script builder (B4): the learner's own product becomes a call script, an objection map and a role-play buyer. */
  scriptBuilder?: ScriptBuilder;
  /**
   * An anonymous percentile against the coach's other learners, from aggregated results
   * on a keyed rubric (B3 mini-mocks). Shown only when at least 30 people have a result in
   * the window; never a list of people.
   */
  percentile?: { rubric: string; windowDays: number };
}

/** The script builder's questions, and the rules the model follows to build a script from the answers. */
export interface ScriptBuilder {
  /** Asked in order in the bot and shown as fields in the Mini App. */
  questions: { id: string; prompt: Localized; example: Localized; maxChars: number }[];
  /** Objection types the objection map is organised by (price, "I'll think about it", a competitor…). */
  objectionTypes: { id: string; name: Localized }[];
  /** The `own_product` role-play that practises a saved script. */
  roleplay: string;
  /** Rules for the model, in English. */
  instructions: string;
  /** Saved scripts per person. */
  maxScripts: number;
}

/** A validated pack with lookups the engine uses. */
export interface CoachPack extends PackSource {
  byId: ReadonlyMap<string, Activity>;
  rubricById: ReadonlyMap<string, Rubric>;
  skillById: ReadonlyMap<string, SkillNode>;
  errorById: ReadonlyMap<string, ErrorTag>;
  cardById: ReadonlyMap<string, { deck: Deck; card: DeckCard }>;
  ofKind<K extends ActivityKind>(kind: K): Extract<Activity, { kind: K }>[];
}
