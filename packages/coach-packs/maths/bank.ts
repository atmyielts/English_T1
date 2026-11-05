import { UZ_MATH_TOPICS } from '../../subject-core/src/data/uz-math-topics.ts';
import { T } from '../src/localize.ts';
import type { PackSource, QuizQuestion, QuizSet } from '../src/types.ts';

// Shared helpers for the B3 topic banks: one bank per topic of the subject-core maths
// topic graph, each dealing five questions per session (never answered first, then the
// ones answered wrong). Every problem is original Schood material, and every answer is
// checked by computation in packages/coach-packs/test/maths-answers.test.ts.
//
// Prompts are written in Uzbek and Russian (T); options are mathematics, the same in
// both languages, so the keyed option is the same everywhere.

export type L = { uz: string; ru: string };
type Difficulty = 1 | 2 | 3;

const hash = (text: string) => { let h = 2166136261; for (const char of text) { h ^= char.codePointAt(0)!; h = Math.imul(h, 16777619); } return h >>> 0; };
/**
 * Options are written with the right one first; this puts them in a fixed order of
 * their own per item (seeded by its id), so the right option's position varies and
 * never gives the answer away.
 */
export function arrange<I extends { options?: string[]; answer?: unknown }>(item: I, seed: string): I {
  if (!item.options || typeof item.answer !== 'number') return item;
  const order = item.options.map((option, index) => ({ option, index, key: hash(`${seed}:${index}`) })).sort((a, b) => a.key - b.key);
  return { ...item, options: order.map((entry) => entry.option), answer: order.findIndex((entry) => entry.index === item.answer) };
}

const prompt = (text: L | string) => (typeof text === 'string' ? text : T(text));

/** A single-choice question (the exam's format): four options, one right. */
export function mc(id: string, difficulty: Difficulty, text: L | string, options: string[], answer: number, explanation: L, hints: L[] = []): QuizQuestion {
  return { id, type: 'single_choice', difficulty, prompt: prompt(text), options, answer, explanation, ...(hints.length ? { hints } : {}) };
}

/** A typed number (decimals with a comma or a point, fractions such as 3/4). */
export function num(id: string, difficulty: Difficulty, text: L | string, value: number, explanation: L, hints: L[] = [], tolerance?: number): QuizQuestion {
  return { id, type: 'numeric', difficulty, prompt: prompt(text), answer: tolerance === undefined ? { numeric: value } : { numeric: value, tolerance }, explanation, ...(hints.length ? { hints } : {}) };
}

/** A topic bank: the topic's own node, five questions per session, two minutes a question. */
export function bank(code: string, questions: QuizQuestion[]): QuizSet {
  const topic = UZ_MATH_TOPICS.topics.find((entry) => entry.code === code);
  if (!topic) throw new Error(`unknown topic ${code}`);
  return {
    id: `bank.${code}`, kind: 'quiz_set', mode: 'practice', node: code, levels: [0, 100], minutes: 10, timeLimitSeconds: 600, draw: 5,
    title: { uz: topic.names.uz, ru: topic.names.ru, en: topic.names.en }, questions: questions.map((question) => arrange(question, `${code}#${question.id}`)),
  };
}

export const questionTypes: PackSource['questionTypes'] = [
  {
    id: 'single_choice', node: 'algebra',
    name: { uz: 'Bir javobli test', ru: 'Тест с одним ответом', en: 'Single choice' },
    strategy: {
      uz: 'Avval o‘zingiz yeching, keyin javobni variantlardan qidiring. Ishonchingiz komil bo‘lmasa, variantlarni shartga qo‘yib tekshiring va aniq noto‘g‘rilarini chiqarib tashlang. Ishoraga, ildizlar soniga va aniqlanish sohasiga alohida qarang: noto‘g‘ri variantlar aynan shu xatolardan tuziladi.',
      ru: 'Сначала решите сами, потом ищите ответ среди вариантов. Если сомневаетесь, подставьте варианты в условие и отбросьте явно неверные. Отдельно проверьте знак, число корней и область определения: неверные варианты составлены именно из этих ошибок.',
    },
  },
  {
    id: 'numeric', node: 'algebra',
    name: { uz: 'Javobni yozish', ru: 'Ответ числом', en: 'Typed answer' },
    strategy: {
      uz: 'Javobni son bilan yozing: kasrni 3/4 yoki 0,75 ko‘rinishida. Yuborishdan oldin natijani shartga qo‘yib tekshiring va so‘ralgan kattalikni (yig‘indi, musbat ildiz, birlik) yana bir bor o‘qing.',
      ru: 'Запишите ответ числом: дробь как 3/4 или 0,75. Перед отправкой подставьте результат в условие и ещё раз прочитайте, что спрашивают (сумму, положительный корень, единицы).',
    },
  },
];

const compulsory = UZ_MATH_TOPICS.topics.filter((topic) => topic.blocks.includes('compulsory')).map((topic) => topic.code);

// Mini-mocks: assembled from the banks by topic weight, timed, no hints, recorded on the
// keyed `admission.mock` rubric. Two minutes a question follows subject-core's
// MOCK_MINUTES_PER_QUESTION, an unverified reading of 90 questions in 180 minutes.
export const mocks: QuizSet[] = [
  {
    id: 'mock.compulsory', kind: 'quiz_set', mode: 'practice', node: 'algebra', levels: [0, 100], minutes: 20, timeLimitSeconds: 1200, questions: [],
    mock: { questions: 10, nodes: compulsory }, rubric: 'admission.mock',
    title: { uz: 'Mini sinov: majburiy blok (10 savol)', ru: 'Мини-пробник: обязательный блок (10 вопросов)', en: 'Mini-mock: compulsory block (10 questions)' },
  },
  {
    id: 'mock.specialised', kind: 'quiz_set', mode: 'practice', node: 'algebra', levels: [0, 100], minutes: 60, timeLimitSeconds: 3600, questions: [],
    mock: { questions: 30 }, rubric: 'admission.mock',
    title: { uz: 'To‘liq sinov: mutaxassislik fani (30 savol)', ru: 'Полный пробник: профильный предмет (30 вопросов)', en: 'Full mock: specialised subject (30 questions)' },
  },
];
