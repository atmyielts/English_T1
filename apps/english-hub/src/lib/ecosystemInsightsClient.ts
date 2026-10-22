import { edge } from './api';
import type { CefrLevel } from './skills';

// Client for the AI practice tools served by the `hub` edge function
// (`/hub/ai/*`). Every response carries `ai_status`; when it is not 'ok' the
// handler returns either a rule-based result (`fallback: true`) or an empty
// one, and the card explains that to the learner in plain words.

export type { CefrLevel };
export type AiStatus = 'ok' | 'unconfigured' | 'failed';

type AiBase = {
  ok: boolean;
  ai_available: boolean;
  ai_status: AiStatus;
  generated_at?: string;
};

const post = <T>(path: string, body: unknown) => edge<T>('hub', path, { body, query: { language_code: 'en' } });

// --- Vocabulary in context ---

export type NotebookExample = { word: string; definition: string; example: string };

export type VocabInContextResponse = AiBase & {
  fallback: boolean;
  /** True when the learner has no saved words yet. */
  empty: boolean;
  words: string[];
  entries: NotebookExample[];
  passage: string;
  translations: Record<string, string>;
  topic: string | null;
};

export const generateVocabInContext = (body: { words?: string[]; topic?: string; target_level?: CefrLevel }) =>
  post<VocabInContextResponse>('/ai/vocab-in-context', body);

// --- Grammar decoder ---

export type GrammarSignal = { label: string; match: string; tip: string };

export type GrammarDecodeResponse = AiBase & {
  fallback: boolean;
  sentence: string;
  clauses: Array<{ role: string; text: string; function: string }>;
  tense: string;
  voice: string;
  register: string;
  notes: string[];
  rephrasings: Array<{ text: string; why_different: string }>;
  signals: GrammarSignal[];
};

export const decodeGrammar = (sentence: string) => post<GrammarDecodeResponse>('/ai/grammar-decode', { sentence });

// --- Writing feedback ---

export type EssayGradeResponse = AiBase & {
  fallback: boolean;
  target_level: CefrLevel;
  word_count: number;
  stats: { words: number; sentences: number; paragraphs: number; avg_sentence_words: number };
  checks: string[];
  overall_level: CefrLevel | null;
  criteria: Partial<Record<'task' | 'coherence' | 'range' | 'accuracy', { level: string; comment: string }>>;
  strengths: string[];
  improvements: string[];
  actionable_next_step: string;
  rewrite_sample: string;
};

export const gradeEssay = (body: { text: string; target_level?: CefrLevel; prompt?: string }) =>
  post<EssayGradeResponse>('/ai/essay-grade', body);

// --- Translation compare ---

export type TranslationCompareResponse = AiBase & {
  source_text: string;
  detected_language: string;
  translations: Array<{ text: string; register: string; style_note: string }>;
  nuance_summary: string;
};

export const compareTranslations = (body: { source_text: string; source_language?: string }) =>
  post<TranslationCompareResponse>('/ai/translation-compare', body);

// --- Idioms and collocations ---

export type IdiomExtractResponse = AiBase & {
  target_level: CefrLevel;
  source_text_length: number;
  idioms: Array<{ phrase: string; meaning: string; register: string; example: string }>;
  collocations: Array<{ phrase: string; type: string; meaning: string; example: string }>;
  cultural_notes: string[];
};

export const extractIdioms = (body: { source_text: string; target_level?: CefrLevel }) =>
  post<IdiomExtractResponse>('/ai/idiom-extract', body);

// --- Dictation ---

export type DictationGenerateResponse = AiBase & {
  fallback: boolean;
  target_level: CefrLevel;
  topic: string | null;
  accent: string;
  speed: string;
  text: string;
  tricky_tokens: string[];
  comprehension_question: string;
  comprehension_answer: string;
};

export const generateDictation = (body: { target_level?: CefrLevel; topic?: string; previous_text?: string }) =>
  post<DictationGenerateResponse>('/ai/dictation/generate', body);

// --- Daily challenge ---

export type PracticeSkill = 'reading' | 'writing' | 'listening' | 'speaking' | 'grammar' | 'vocabulary';

export type DailyChallengeTask = {
  skill: PracticeSkill;
  label: string;
  instruction: string;
  estimated_minutes: number;
  route_hint: string;
};

export type DailyChallengeResponse = AiBase & {
  theme: string;
  why_this_theme: string;
  tasks: DailyChallengeTask[];
  cefr_level: CefrLevel;
  minutes_budget: number;
};

export const generateDailyChallenge = (body: { minutes_budget?: number } = {}) =>
  post<DailyChallengeResponse>('/ai/daily-challenge', body);

// --- Culture and tone notes ---

export type CulturalNotesResponse = AiBase & {
  cultural_references: string[];
  register_observations: string[];
  regional_variants: string[];
  tone_pitfalls: string[];
};

export const extractCulturalNotes = (body: { source_text: string }) =>
  post<CulturalNotesResponse>('/ai/cultural-notes', body);

// --- Level examples (rubric calibration) ---

export type RubricCalibrateResponse = AiBase & {
  prompt: string;
  lower_level: CefrLevel;
  mid_level: CefrLevel;
  upper_level: CefrLevel;
  samples: Array<{ level: string; word_count_target: number; text: string; examiner_note: string }>;
  deltas: Array<{
    from_level: string;
    to_level: string;
    axes: { task: string; coherence: string; range: string; accuracy: string; register: string };
  }>;
  what_to_practise: string[];
};

export const calibrateWritingRubric = (body: {
  prompt: string;
  lower_level?: CefrLevel;
  mid_level?: CefrLevel;
  upper_level?: CefrLevel;
}) => post<RubricCalibrateResponse>('/ai/rubric-calibrate', body);

// --- Themed week ---

export type ThemedWeekDay = {
  day_index: number;
  day_label: string;
  skill: PracticeSkill;
  activity_label: string;
  instruction: string;
  recycles_words: string[];
  route_hint: string;
};

export type ThemedWeekResponse = AiBase & {
  theme: string;
  why_this_theme: string;
  cefr_level: CefrLevel;
  minutes_per_day: number;
  anchor_vocabulary: string[];
  days: ThemedWeekDay[];
  weekend_review: string;
};

export const generateThemedWeek = (body: { theme?: string; minutes_per_day?: number } = {}) =>
  post<ThemedWeekResponse>('/ai/themed-week', body);

// --- Real-world content ideas ---

export type ContentRecommendItem = {
  type: string;
  title: string;
  creator: string;
  why_for_you: string;
  where_to_find: string;
  difficulty_note: string;
  first_step: string;
};

export type ContentRecommendResponse = AiBase & {
  cefr_level: CefrLevel;
  interests: string[];
  session_minutes: number;
  items: ContentRecommendItem[];
  immersion_tip: string;
};

export const recommendContent = (body: { interests?: string[]; session_minutes?: number; formats?: string[] } = {}) =>
  post<ContentRecommendResponse>('/ai/content-recommend', body);

// --- Shadowing ---

export type ShadowingChunk = {
  index: number;
  text: string;
  focus_label: string;
  focus_explanation: string;
  watch_for: string[];
};

export type ShadowingPrepResponse = AiBase & {
  fallback: boolean;
  target_level: CefrLevel;
  accent: string;
  source_text_length: number;
  warm_up: string;
  chunks: ShadowingChunk[];
  global_tips: string[];
};

export const prepareShadowing = (body: { source_text: string; target_level?: CefrLevel; accent?: string }) =>
  post<ShadowingPrepResponse>('/ai/shadowing-prep', body);

// --- Pronunciation ---

export type PronunciationPerWord = {
  target_word: string;
  what_was_heard: string;
  likely_issue: string;
  fix_tip: string;
};

export type PronunciationFeedbackResponse = AiBase & {
  fallback: boolean;
  target_text: string;
  recognized_text: string;
  user_l1: string | null;
  target_level: CefrLevel;
  /** Share of target words the speech recognizer heard (0-100). */
  accuracy_score: number;
  words_total: number;
  words_matched: number;
  missed_words: string[];
  per_word: PronunciationPerWord[];
  prosody_notes: string[];
  l1_interference: string[];
  retry_priority: string;
};

export const analyzePronunciation = (body: {
  target_text: string;
  recognized_text: string;
  user_l1?: string;
  target_level?: CefrLevel;
}) => post<PronunciationFeedbackResponse>('/ai/pronunciation-feedback', body);

// --- Conversation partner ---

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type VoiceConversationCorrection = { original: string; better: string; why: string };

export type VoiceConversationTurnResponse = AiBase & {
  cefr_level: CefrLevel | string;
  partner_reply: string;
  correction: VoiceConversationCorrection | null;
  suggested_user_reply: string;
  scenario_progress: string;
};

export const sendVoiceConversationTurn = (body: {
  messages: ChatMessage[];
  scenario?: string;
  persona_name?: string;
  target_level?: CefrLevel;
}) => post<VoiceConversationTurnResponse>('/ai/voice-conversation-turn', body);
