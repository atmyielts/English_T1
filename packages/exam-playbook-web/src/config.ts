// Per-exam configuration for the shared exam playbook web app (SAT today).
// apps/sat-playbook passes SAT_CONFIG to <PlaybookApp>. Slugs are the fixed content contract (section B).

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
};

export const PLATFORM_URL = 'https://schood.online';
