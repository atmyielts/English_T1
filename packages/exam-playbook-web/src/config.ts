// Per-exam configuration for the shared exam playbook web app.
// apps/sat-playbook passes SAT_CONFIG and apps/toefl-playbook TOEFL_CONFIG to <PlaybookApp>. Slugs are the fixed content contract (section B).

export type ExamKey = 'sat' | 'toefl';

export type ExamConfig = {
  exam: ExamKey;
  /** Short exam name used in copy, e.g. "SAT". */
  examName: string;
  /** Service name, e.g. "SAT Playbook". */
  serviceName: string;
  functionName: string;
  productId: string;
  productSlug: string;
  appUrl: string;
  simulator: { url: string; productId: string; productSlug: string };
  /** Where "Practice this" goes and which product unlocks it. */
  practice: {
    kind: 'product' | 'simulator_mode';
    url: string;
    productId: string;
    productSlug: string;
    /** i18n key for the product name shown in access labels. */
    nameKey: string;
  };
  /** Bundle name shown in labels (the platform owns bundle pricing). */
  completeBundleName: string;
  sections: string[];
  modules: string[];
  guides: string[];
  templates: string[];
  /** Module slug per section for landing cards. */
  sectionModules: Record<string, string[]>;
  /** How scores are expressed: SAT scaled points or TOEFL 2026 bands (1–6). */
  scale: 'sat_points' | 'toefl_band';
  /** Practice deep links: module slug → simulator task id (sent as ?task=…). */
  moduleTasks: Record<string, string>;
};

export const SAT_CONFIG: ExamConfig = {
  exam: 'sat',
  examName: 'SAT',
  serviceName: 'SAT Playbook',
  functionName: 'sat-playbook',
  productId: 'a8b41e2c-9a36-4caf-9bba-7212e35a8b8c',
  productSlug: 'sat-playbook',
  appUrl: 'https://playbook.sat.schood.online',
  simulator: { url: 'https://sat.schood.online', productId: '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef', productSlug: 'sat-exam-simulator' },
  practice: {
    kind: 'product',
    url: 'https://practice.sat.schood.online',
    productId: '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010',
    productSlug: 'sat-practice',
    nameKey: 'product.satPractice',
  },
  completeBundleName: 'SAT Complete',
  sections: ['reading_writing', 'math'],
  modules: [
    'sat-essentials',
    'reading-writing-information-ideas',
    'reading-writing-craft-structure',
    'reading-writing-expression-of-ideas',
    'reading-writing-conventions',
    'math-algebra',
    'math-advanced-math',
    'math-problem-solving-data-analysis',
    'math-geometry-trigonometry',
    'desmos-and-calculator-strategy',
    'pacing-and-adaptive-modules',
    'test-day-guide',
    'score-goals-and-study-plans',
    'retake-and-superscore-strategy',
  ],
  guides: [
    'guide-rw-hard-module-traps',
    'guide-math-hard-module-traps',
    'guide-1200-to-1400-roadmap',
    'guide-1400-to-1550-roadmap',
    'guide-desmos-power-moves',
    'guide-final-14-days',
  ],
  templates: ['four-week-sprint', 'eight-week-standard', 'twelve-week-foundation', 'math-priority', 'reading-writing-priority'],
  sectionModules: {
    reading_writing: ['reading-writing-information-ideas', 'reading-writing-craft-structure', 'reading-writing-expression-of-ideas', 'reading-writing-conventions'],
    math: ['math-algebra', 'math-advanced-math', 'math-problem-solving-data-analysis', 'math-geometry-trigonometry'],
  },
  scale: 'sat_points',
  moduleTasks: {},
};

export const TOEFL_CONFIG: ExamConfig = {
  exam: 'toefl',
  examName: 'TOEFL',
  serviceName: 'TOEFL Playbook',
  functionName: 'toefl-playbook',
  productId: 'f9512c15-ec1c-4fcb-a5ec-a2c6ac3a020e',
  productSlug: 'toefl-playbook',
  appUrl: 'https://playbook.toefl.schood.online',
  simulator: { url: 'https://toefl.schood.online', productId: 'b262ffa8-9912-4eba-93d7-58af3164d1cc', productSlug: 'toefl-ibt-simulator' },
  // TOEFL practice is the simulator's practice mode, not a separate product.
  practice: {
    kind: 'simulator_mode',
    url: 'https://toefl.schood.online/practice',
    productId: 'b262ffa8-9912-4eba-93d7-58af3164d1cc',
    productSlug: 'toefl-ibt-simulator',
    nameKey: 'product.toeflSimulator',
  },
  completeBundleName: 'TOEFL Complete',
  sections: ['reading', 'listening', 'writing', 'speaking'],
  modules: [
    'toefl-essentials',
    'score-scale-2026',
    'reading-complete-the-words',
    'reading-daily-life-and-academic',
    'listening-strategy',
    'writing-build-a-sentence',
    'writing-email',
    'writing-academic-discussion',
    'speaking-listen-and-repeat',
    'speaking-take-an-interview',
    'test-day-guide',
    'score-goals-and-study-plans',
    'retake-and-mybest-strategy',
  ],
  guides: [
    'guide-band-4-to-5-roadmap',
    'guide-band-5-to-6-roadmap',
    'guide-complete-the-words-drills',
    'guide-email-and-discussion-templates',
    'guide-interview-answer-frameworks',
    'guide-final-14-days',
  ],
  templates: ['four-week-sprint', 'eight-week-standard', 'twelve-week-foundation', 'speaking-writing-priority', 'reading-listening-priority'],
  sectionModules: {
    reading: ['reading-complete-the-words', 'reading-daily-life-and-academic'],
    listening: ['listening-strategy'],
    writing: ['writing-build-a-sentence', 'writing-email', 'writing-academic-discussion'],
    speaking: ['speaking-listen-and-repeat', 'speaking-take-an-interview'],
  },
  scale: 'toefl_band',
  // Task ids are the ones the TOEFL simulator scorer writes (toefl-2026.ts).
  moduleTasks: {
    'reading-complete-the-words': 'complete_the_words',
    'reading-daily-life-and-academic': 'read_daily_life',
    'writing-build-a-sentence': 'build_sentence',
    'writing-email': 'write_email',
    'writing-academic-discussion': 'write_academic_discussion',
    'speaking-listen-and-repeat': 'listen_repeat',
    'speaking-take-an-interview': 'take_interview',
  },
};

export const PLATFORM_URL = 'https://schood.online';
