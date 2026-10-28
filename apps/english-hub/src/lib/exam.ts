import { edge } from './api';
import type { CefrLevel } from './skills';

// National exam track (hub /exam/*): practice in the style of Uzbekistan's
// Multilevel English exam. Scores are 0-75 estimates; see
// docs/english/MULTILEVEL_FORMAT.md for what is official and what is not.

export type ExamSection = 'listening' | 'reading' | 'writing' | 'speaking';
export const EXAM_SECTIONS: ExamSection[] = ['listening', 'reading', 'writing', 'speaking'];
export type ExamLevel = 'C1' | 'B2' | 'B1' | 'below_b1';
export type MockKind = 'full' | ExamSection;

export type ExamAllowance = { allowed: boolean; basis: 'owner' | 'admin' | 'free'; left: number; per: 'day' | 'week'; limit: number };

export type SectionEstimate = {
  section: ExamSection;
  score: number | null;
  level: ExamLevel | null;
  source: 'mock' | 'rating' | null;
  at: string | null;
  tentative: boolean;
};

export type PlanWeek = { weeks_to_go: number; starts: string; ends: string; focus: ExamSection; mock: 'full' | 'section'; final: boolean };
export type ExamPlan = { status: 'none' | 'upcoming' | 'today' | 'past'; date: string | null; days_left: number | null; weeks: PlanWeek[]; this_week: PlanWeek | null };

export type MockView = {
  id: string;
  kind: MockKind;
  paper_id: string;
  paper_title: string | null;
  started_at: string;
  sections: Array<{ section: ExamSection; done: boolean; score: number | null; level: ExamLevel | null }>;
};

export type MarkedPart = { score: number; max: number; comment: string | null };
export type MarkPriority = { area: string; text: string; practice: 'writing' | 'speaking' | 'roleplay' | 'grammar' | 'vocabulary'; topic: string | null };
export type MarkFix = { said: string; better: string; why: string; topic: string | null; l1: string | null };

export type SectionResult = {
  section: ExamSection;
  score: number;
  level: ExamLevel;
  overtime: boolean;
  submitted_at: string;
  objective?: {
    correct: number;
    total: number;
    parts: Array<{ id: string; type: string; level: CefrLevel; correct: number; total: number }>;
    items: Array<{ id: string; given: string; correct: string; ok: boolean }>;
  };
  marked?: { parts: Record<string, MarkedPart>; raw: number; raw_max: number; priorities: MarkPriority[]; fixes: MarkFix[] };
  spoken?: boolean;
};

export type PracticeLink = { section: ExamSection; skill: ExamSection; slug: string; title: string; level: CefrLevel | null };

export type MockResult = {
  kind: MockKind;
  paper_id: string;
  paper_title: string;
  summary: { scores: Partial<Record<ExamSection, number>>; overall: number | null; level: ExamLevel | null; weakest: ExamSection | null };
  sections: Partial<Record<ExamSection, SectionResult>>;
  practice?: PracticeLink[];
};

export type ExamOverview = {
  paused: boolean;
  ai_available: boolean;
  onboarded: boolean;
  target_level: CefrLevel | null;
  estimates: SectionEstimate[];
  estimate: { score: number | null; level: ExamLevel | null };
  plan: ExamPlan;
  allowance: { full: ExamAllowance; section: ExamAllowance };
  timing: { seconds: Record<ExamSection, number>; speaking_talk: number[]; speaking_prep: number[] };
  in_progress: MockView | null;
  history: Array<{ id: string; kind: MockKind; finished_at: string; overall_score: number | null; level: ExamLevel | null; result: MockResult | null }>;
};

// --- Section content (answer keys stay on the server) ---

export type Choice = { id: string; text: string };
export type McqView = { id: string; prompt: string; options: Choice[] };

export type ReadingPartView =
  | { id: string; type: 'gap_fill'; level: CefrLevel; title: string; text: string; gaps: string[] }
  | { id: string; type: 'mcq'; level: CefrLevel; title: string; text: string; questions: McqView[] }
  | { id: string; type: 'headings'; level: CefrLevel; title: string; headings: Choice[]; paragraphs: Array<{ id: string; text: string }> };

export type ListeningPartView =
  | { id: string; type: 'dialogues'; level: CefrLevel; title: string; items: Array<McqView & { script: string }> }
  | { id: string; type: 'notes'; level: CefrLevel; title: string; script: string; notes: Array<{ id: string; before: string; after: string }> }
  | { id: string; type: 'mcq'; level: CefrLevel; title: string; script: string; questions: McqView[] };

export type WritingView = { input: { from: string; subject: string; body: string }; task11: string; task12: string; part2: string };
export type SpeakingView = {
  part11: string[];
  part12: { scene: string; questions: string[] };
  part2: { scene: string; questions: string[] };
  part3: { statement: string; for: string[]; against: string[] };
};

export type SectionContent =
  | { section: 'reading'; content: { parts: ReadingPartView[] } }
  | { section: 'listening'; content: { parts: ListeningPartView[] } }
  | { section: 'writing'; content: WritingView }
  | { section: 'speaking'; content: SpeakingView };

export type OpenSection = SectionContent & { mock_id: string; started_at: string; seconds: number };

export type SpeakingAnswerInput = { text: string; mode: 'speech' | 'typed'; seconds: number | null };

export type SubmitResponse = { mock_id: string; section: ExamSection; section_result: SectionResult; finished: boolean; result: MockResult | null };

const query = { language_code: 'en' };

export const getExamOverview = (signal?: AbortSignal) => edge<ExamOverview>('hub', '/exam', { query, signal });

export const saveExamDate = (date: string | null) => edge<ExamOverview>('hub', '/exam/date', { query, body: { date } });

export const startExamMock = (kind: MockKind) =>
  edge<{ resumed: boolean; allowance: ExamAllowance; mock: MockView }>('hub', '/exam/mock/start', { query, body: { kind } });

export const openExamSection = (mockId: string, section: ExamSection, signal?: AbortSignal) =>
  edge<OpenSection>('hub', '/exam/mock/section', { query: { ...query, mock_id: mockId, section }, signal });

export const submitExamSection = (mockId: string, section: ExamSection, answers: unknown) =>
  edge<SubmitResponse>('hub', '/exam/mock/submit', { query, body: { mock_id: mockId, section, answers } });

/** Item keys of an objective part ("r2.3"), in order. */
export const itemKeys = (part: ReadingPartView | ListeningPartView): string[] => {
  switch (part.type) {
    case 'gap_fill': return part.gaps.map((gap) => `${part.id}.${gap}`);
    case 'mcq': return part.questions.map((question) => `${part.id}.${question.id}`);
    case 'headings': return part.paragraphs.map((paragraph) => `${part.id}.${paragraph.id}`);
    case 'dialogues': return part.items.map((item) => `${part.id}.${item.id}`);
    case 'notes': return part.notes.map((note) => `${part.id}.${note.id}`);
  }
};

export const wordCount = (text: string): number => (text.match(/[A-Za-z0-9’']+/g) ?? []).length;

/** Answers in progress survive a reload of the tab (sessionStorage; never required). */
const STORE = 'english-hub:exam:v1:';
export const readDraft = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.sessionStorage.getItem(STORE + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
export const writeDraft = (key: string, value: unknown | null) => {
  try {
    if (value === null) window.sessionStorage.removeItem(STORE + key);
    else window.sessionStorage.setItem(STORE + key, JSON.stringify(value));
  } catch {
    // Storage may be blocked; answers stay in this tab.
  }
};
