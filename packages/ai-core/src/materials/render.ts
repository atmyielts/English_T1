import { optionsOf } from './keys.ts';
import { CHOICE_TYPES, versions, type Block, type Choice, type Material, type Question, type QuestionsBlock } from './model.ts';

// The shapes every renderer and export uses: question numbers, the student version
// (no answers, explanations or model answers), the answer key, plain and
// Telegram-ready text, Live Quiz questions and Assessment Cloud draft items. Pure:
// the app's print view, the function's exports and other areas share them.

const CLOZE = /\[\[([a-z][a-z0-9_-]{0,30})\]\]/g;

/** Printed question numbers (1, 2, 3…) per version, in reading order. */
export function questionNumbers(blocks: readonly Block[]): Map<string, number> {
  const numbers = new Map<string, number>();
  let next = 0;
  for (const block of blocks) if (block.type === 'questions') for (const question of block.questions) numbers.set(question.id, ++next);
  return numbers;
}

/** A cloze text with `[[q3]]` markers shown as `(3) ________`. */
export const clozeText = (body: string, numbers: Map<string, number>): string =>
  body.replace(CLOZE, (whole, id: string) => (numbers.has(id) ? `(${numbers.get(id)}) ________` : whole));

const stripQuestion = (question: Question): Question => {
  const { explanation: _explanation, ...rest } = question;
  return { ...rest, answer: [] };
};
const studentBlocks = (blocks: readonly Block[]): Block[] => blocks
  .filter((block) => block.type !== 'model_answer')
  .map((block) => (block.type === 'questions' ? { ...block, questions: block.questions.map(stripQuestion) } : block));

/** What students see: no keys, no explanations, no model answers. */
export function studentView(material: Material): Material {
  return {
    ...material,
    blocks: studentBlocks(material.blocks),
    ...(material.variants ? { variants: material.variants.map((variant) => ({ ...variant, blocks: studentBlocks(variant.blocks) })) } : {}),
  };
}

export interface KeyEntry { version: 'core' | 'support' | 'stretch'; number: number; question: string; answer: string; explanation?: string }
const JUDGEMENT_IDS = new Set(['T', 'F', 'NG', 'Y', 'N']);
const optionLabel = (id: string, options: readonly Choice[]) => {
  const option = options.find((entry) => entry.id === id);
  if (!option) return id;
  return JUDGEMENT_IDS.has(id) && option.text === option.text.toUpperCase() ? option.text : `${id} (${option.text})`;
};
/** The key as people read it: "3. B (the library)", "4. river / the river". */
export function displayAnswer(question: Question, block?: Pick<QuestionsBlock, 'options'>): string {
  if (question.type === 'open') return '';
  if (CHOICE_TYPES.includes(question.type)) {
    const options = optionsOf(question, block);
    return question.answer.map((id) => optionLabel(id, options)).join(question.type === 'ordering' ? ' → ' : ', ');
  }
  return question.answer.join(' / ');
}
export function answerKey(material: Material): KeyEntry[] {
  const out: KeyEntry[] = [];
  for (const version of versions(material)) {
    let number = 0;
    for (const block of version.blocks) {
      if (block.type !== 'questions') continue;
      for (const question of block.questions) {
        number++;
        if (question.type === 'open') continue;
        out.push({ version: version.label, number, question: question.id, answer: displayAnswer(question, block), ...(question.explanation ? { explanation: question.explanation } : {}) });
      }
    }
  }
  return out;
}

// --- Plain and Telegram text ---------------------------------------------------------------

function blockText(block: Block, numbers: Map<string, number>, withKey: boolean): string {
  const head = block.title ? `${block.title}\n` : '';
  switch (block.type) {
    case 'text': return `${head}${clozeText(block.body, numbers)}`;
    case 'script': return `${head}${block.setting ? `${block.setting}\n` : ''}${block.lines.map((line) => `${line.speaker}: ${line.text}`).join('\n')}`;
    case 'questions': {
      const shared = block.options?.length ? `${block.options.map((option) => `${option.id}. ${option.text}`).join('\n')}\n` : '';
      const box = block.word_box?.length ? `[ ${block.word_box.join(' | ')} ]\n` : '';
      const lines = block.questions.map((question) => {
        const judgement = question.type === 'true_false' || question.type === 'true_false_not_given' || question.type === 'yes_no_not_given';
        const options = judgement ? undefined : question.options;
        const choices = !options?.length ? '' : question.type === 'ordering'
          ? `\n   ${options.map((option) => `${option.id}) ${option.text}`).join('   ')}`
          : `\n${options.map((option) => `   ${option.id}) ${option.text}`).join('\n')}`;
        const key = withKey && question.type !== 'open' ? `\n   ✓ ${displayAnswer(question, block)}${question.explanation ? ` — ${question.explanation}` : ''}` : '';
        const prompt = question.prompt.trim() || (numbers.has(question.id) ? '________' : '');
        return `${numbers.get(question.id) ?? ''}. ${prompt}${choices}${key}`;
      });
      return `${head}${block.instructions}\n${shared}${box}${lines.join('\n')}`;
    }
    case 'words': return `${head}${block.words.map((word) => `• ${word.term}${word.part_of_speech ? ` (${word.part_of_speech})` : ''} — ${word.meaning}${word.meaning_uz ? ` | ${word.meaning_uz}` : ''}${word.meaning_ru ? ` | ${word.meaning_ru}` : ''}${word.example ? `\n  ${word.example}` : ''}`).join('\n')}`;
    case 'cards': return `${head}${block.cards.map((card, index) => `${index + 1}. ${card.title}\n${card.prompt}${card.points?.length ? `\n${card.points.map((point) => `   – ${point}`).join('\n')}` : ''}${card.role ? `\n   (${card.role})` : ''}`).join('\n\n')}`;
    case 'flashcards': return `${head}${block.cards.map((card) => `• ${card.front} — ${card.back}${card.example ? ` (${card.example})` : ''}`).join('\n')}`;
    case 'task': return `${head}${block.prompt}${block.words ? `\n(${block.words.min}–${block.words.max} words)` : ''}`;
    case 'model_answer': return withKey ? `${head}${block.body}` : '';
    case 'rubric': return `${head}${block.criteria.map((criterion) => `• ${criterion.name} (0–${criterion.max}): ${criterion.description}`).join('\n')}`;
    case 'stages': return `${head}${block.stages.map((stage, index) => `${index + 1}. ${stage.name} — ${stage.minutes} min\n   ${stage.aim}\n${stage.steps.map((step) => `   – ${step}`).join('\n')}`).join('\n')}${block.homework ? `\n\n${block.homework}` : ''}`;
    case 'slides': return `${head}${block.slides.map((slide, index) => `${index + 1}. ${slide.title}\n${slide.bullets.map((bullet) => `   – ${bullet}`).join('\n')}`).join('\n')}`;
    case 'outline': return `${head}${block.units.map((unit, index) => `${index + 1}. ${unit.title}${unit.weeks ? ` (${unit.weeks} wk)` : ''}\n${[...unit.aims, ...unit.can_do].map((line) => `   – ${line}`).join('\n')}`).join('\n')}`;
  }
}

/** The whole material as plain text: the student version, or with the key. */
export function materialText(material: Material, options: { key?: boolean; version?: 'core' | 'support' | 'stretch' } = {}): string {
  const version = versions(material).find((entry) => entry.label === (options.version ?? 'core')) ?? versions(material)[0];
  const numbers = questionNumbers(version.blocks);
  const body = version.blocks.map((block) => blockText(block, numbers, !!options.key)).filter((part) => part.trim()).join('\n\n');
  return `${material.title}\n\n${body}`.trim();
}

/** Text split into Telegram messages of at most `limit` characters, at block and line boundaries. */
export function telegramMessages(material: Material, options: { key?: boolean; limit?: number } = {}): string[] {
  const limit = Math.max(200, Math.min(options.limit ?? 4000, 4096));
  const parts = materialText(material, options).split('\n\n');
  const out: string[] = [];
  let current = '';
  const flush = () => { if (current.trim()) out.push(current.trim()); current = ''; };
  for (const part of parts) {
    if (`${current}\n\n${part}`.length <= limit) { current = current ? `${current}\n\n${part}` : part; continue; }
    flush();
    if (part.length <= limit) { current = part; continue; }
    for (const line of part.split('\n')) {
      if (`${current}\n${line}`.length > limit) flush();
      current = current ? `${current}\n${line.slice(0, limit)}` : line.slice(0, limit);
    }
  }
  flush();
  return out;
}

// --- Live Quiz ------------------------------------------------------------------------------

export interface QuizQuestion { id: string; prompt: string; options: Choice[]; answer: string; explanation?: string; context?: string }
const QUIZ_TYPES = new Set(['single_choice', 'true_false', 'true_false_not_given', 'yes_no_not_given', 'matching']);
/** The questions a class can play: one answer from two to six options (the core version). */
export function quizQuestions(material: Material): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  const numbers = questionNumbers(material.blocks);
  const byId = new Map(material.blocks.map((block) => [block.id, block]));
  for (const block of material.blocks) {
    if (block.type !== 'questions') continue;
    const source = block.source ? byId.get(block.source) : undefined;
    for (const question of block.questions) {
      if (!QUIZ_TYPES.has(question.type) || question.answer.length !== 1) continue;
      const options = [...optionsOf(question, block)];
      if (options.length < 2 || options.length > 6 || !options.some((option) => option.id === question.answer[0])) continue;
      const prompt = question.prompt.trim() || `${numbers.get(question.id)}. ${block.instructions}`;
      out.push({ id: question.id, prompt: prompt.slice(0, 500), options: options.map((option) => ({ id: option.id, text: option.text.slice(0, 200) })), answer: question.answer[0], ...(question.explanation ? { explanation: question.explanation.slice(0, 400) } : {}), ...(source?.title ? { context: source.title } : {}) });
    }
  }
  return out;
}

// --- Assessment Cloud draft items -----------------------------------------------------------

/** `assessment.item.v1` (packages/assessment-core): the fields a draft item needs. */
export interface AssessmentItemDraft {
  ref: string;
  item: {
    schema_version: 'assessment.item.v1';
    type: 'single_choice' | 'multi_choice' | 'true_false' | 'ordering' | 'short_answer' | 'numeric';
    prompt: string;
    locale: 'uz' | 'ru' | 'en';
    max_score: number;
    tags: string[];
    options?: Choice[];
    classification: { topics: string[] };
  };
  key: { correct?: string | string[]; numeric?: { value: number; tolerance: number }; solution?: string };
}

/** Every auto-markable question of the core version as an Assessment Cloud draft item; open prompts are left out. */
export function assessmentItems(material: Material): AssessmentItemDraft[] {
  const byId = new Map(material.blocks.map((block) => [block.id, block]));
  const numbers = questionNumbers(material.blocks);
  const out: AssessmentItemDraft[] = [];
  const tag = (value: string) => value.toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').slice(0, 60);
  for (const block of material.blocks) {
    if (block.type !== 'questions') continue;
    const source = block.source ? byId.get(block.source) : undefined;
    const context = source?.type === 'text' ? `${source.title ? `${source.title}\n\n` : ''}${source.body}` : source?.type === 'script' ? source.lines.map((line) => `${line.speaker}: ${line.text}`).join('\n') : '';
    const cloze = material.blocks.find((entry) => entry.type === 'text' && block.questions.some((question) => entry.body.includes(`[[${question.id}]]`)));
    const clozeBody = cloze?.type === 'text' ? clozeText(cloze.body, numbers) : '';
    for (const question of block.questions) {
      if (question.type === 'open' || !question.answer.length) continue;
      const stem = question.prompt.trim() || `(${numbers.get(question.id)}) ________`;
      const prompt = [context || clozeBody, block.instructions, `${numbers.get(question.id)}. ${stem}`].filter(Boolean).join('\n\n').slice(0, 50_000);
      const tags = [...new Set(['schood-ai', tag(material.kind), tag(material.level), ...(question.skill ? [tag(question.skill)] : []), ...(question.exam_type ?? block.exam_type ? [tag((question.exam_type ?? block.exam_type)!)] : [])])].slice(0, 50);
      const base = { schema_version: 'assessment.item.v1' as const, prompt, locale: material.instruction_language, max_score: question.points ?? 1, tags, classification: { topics: [...new Set([material.topic.slice(0, 60), ...(question.skill ? [question.skill] : [])])].slice(0, 20) } };
      const solution = question.explanation ? { solution: question.explanation.slice(0, 20_000) } : {};
      const options = [...optionsOf(question, block)];
      if (question.type === 'true_false') out.push({ ref: question.id, item: { ...base, type: 'true_false', options }, key: { correct: question.answer[0], ...solution } });
      else if (question.type === 'multi_choice') out.push({ ref: question.id, item: { ...base, type: 'multi_choice', options }, key: { correct: question.answer, ...solution } });
      else if (question.type === 'ordering') out.push({ ref: question.id, item: { ...base, type: 'ordering', options }, key: { correct: question.answer, ...solution } });
      else if (CHOICE_TYPES.includes(question.type)) out.push({ ref: question.id, item: { ...base, type: 'single_choice', options }, key: { correct: question.answer[0], ...solution } });
      else if (question.type === 'numeric') {
        const value = Number(question.answer[0]);
        if (Number.isFinite(value)) out.push({ ref: question.id, item: { ...base, type: 'numeric' }, key: { numeric: { value, tolerance: question.tolerance ?? 0 }, ...solution } });
      } else out.push({ ref: question.id, item: { ...base, type: 'short_answer' }, key: { correct: question.answer, ...solution } });
    }
  }
  return out;
}
