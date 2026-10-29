import { IELTS_QUESTION_TYPES } from '../../../ielts-core/src/question-types.ts';
import { TOEFL_2026_TASKS } from '../../../../supabase/functions/_shared/toefl-2026.ts';
import { creditPrice, isCreditKey, quoteCredits } from '../credits.ts';
import { SchemaError } from '../schema.ts';
import {
  ADMISSION_MATH_TOPIC_CODES, answerKey, assessmentItems, briefProblems, briefSchema, checkMaterial, compareSolver, draftContentSchema,
  draftQuestionsSchema, draftSourceSchema, EXAM_TARGETS, generationPlan, ieltsTypesFor, isCorrect, materialCredit, materialKind, MATERIAL_KINDS,
  materialText, MULTILEVEL_READING_PARTS, normaliseAnswer, parseMaterial, parseNumber, plannedCount, quizQuestions, renumber, solverAnswersSchema,
  solverTasks, studentView, telegramMessages, toeflTasksFor, verification, type Block, type Material,
} from './mod.ts';

const equal = (actual: unknown, expected: unknown, label = '') => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const ok = (value: unknown, label: string) => { if (!value) throw new Error(label); };
const throws = (run: () => unknown, label: string) => {
  try { run(); } catch (cause) { if (cause instanceof SchemaError) return; throw new Error(`${label}: wrong error ${cause}`); }
  throw new Error(`${label}: did not throw`);
};
const codes = (material: Material, expected?: number) => checkMaterial(material, { expectedQuestions: expected }).issues.map((issue) => issue.code);

const PASSAGE = 'The Aral Sea was once the fourth largest lake in the world. In the 1960s, rivers that fed it were diverted to grow cotton. '
  + 'By 2007 the sea had shrunk to a tenth of its size, and fishing towns such as Muynak were left far from the water. Scientists now monitor salt storms from the dry seabed.';

/** A small IELTS-style reading set with a clean key. */
function readingSet(): Material {
  return parseMaterial({
    schema: 'schood.material.v1', kind: 'ielts_reading', title: 'The shrinking sea', level: 'B2', topic: 'The Aral Sea', instruction_language: 'en',
    exam: { format: 'ielts', section: 'reading' },
    blocks: [
      { id: 'b1', type: 'text', role: 'passage', title: 'The Aral Sea', body: PASSAGE },
      { id: 'b2', type: 'questions', instructions: 'Do the statements agree with the passage? Write TRUE, FALSE or NOT GIVEN.', source: 'b1', exam_type: 'question_true_false_not_given', questions: [
        { id: 'q1', type: 'true_false_not_given', prompt: 'The Aral Sea used to be among the largest lakes on Earth.', options: [{ id: 'T', text: 'TRUE' }, { id: 'F', text: 'FALSE' }, { id: 'NG', text: 'NOT GIVEN' }], answer: ['T'] },
        { id: 'q2', type: 'true_false_not_given', prompt: 'Cotton farming in the region has now stopped.', options: [{ id: 'T', text: 'TRUE' }, { id: 'F', text: 'FALSE' }, { id: 'NG', text: 'NOT GIVEN' }], answer: ['NG'] },
      ] },
      { id: 'b3', type: 'questions', instructions: 'Complete the notes. Write NO MORE THAN TWO WORDS from the passage.', source: 'b1', word_limit: 2, from_source: true, exam_type: 'question_gap_fill', questions: [
        { id: 'q3', type: 'gap', prompt: 'Rivers were diverted to grow ____.', answer: ['cotton'] },
        { id: 'q4', type: 'gap', prompt: 'Scientists watch ____ from the seabed.', answer: ['salt storms'] },
      ] },
      { id: 'b4', type: 'questions', instructions: 'Choose the correct letter, A, B, C or D.', source: 'b1', exam_type: 'question_single_choice', questions: [
        { id: 'q5', type: 'single_choice', prompt: 'By 2007 the sea was', options: [{ id: 'A', text: 'twice as big' }, { id: 'B', text: 'a tenth of its size' }, { id: 'C', text: 'the same size' }, { id: 'D', text: 'completely dry' }], answer: ['B'], explanation: 'The passage says it had shrunk to a tenth of its size.' },
      ] },
    ],
  });
}

Deno.test('every T1 material type in the doc has a schema, rules and a price', () => {
  const doc = [
    'worksheet', 'reading', 'listening', 'gap_fill', 'vocabulary', 'grammar', 'error_correction', 'speaking_cards', 'dialogue', 'writing_task', 'quiz', 'homework',
    'ielts_reading', 'ielts_listening', 'ielts_writing', 'ielts_speaking', 'toefl_2026', 'multilevel', 'sat_reading_writing', 'sat_math', 'admission_math',
    'lesson_plan', 'slide_outline', 'flashcards', 'course_outline', 'textbook_lesson', 'live_quiz',
  ];
  for (const kind of doc) ok(materialKind(kind), `${kind} is a kind`);
  for (const spec of Object.values(MATERIAL_KINDS)) {
    ok(isCreditKey(spec.creditKey), `${spec.kind} credit key`);
    ok(['T1', 'T5', 'T9', 'T10'].includes(creditPrice(spec.creditKey).feature), `${spec.kind} priced under a teacher feature`);
    for (const type of spec.required) ok(spec.allowed.includes(type), `${spec.kind}: required ${type} is allowed`);
  }
  equal(materialKind('ielts_reading')!.creditKey, 'material.exam_set');
  equal(materialKind('textbook_lesson')!.creditKey, 'textbook.lesson');
  equal(materialKind('live_quiz')!.creditKey, 'quiz.pack');
  // Three levels at once cost +10 on top of the material.
  const credit = materialCredit({ kind: 'reading', variants: true });
  equal(credit, { key: 'material.generate', addOns: ['material.differentiate'] });
  equal(quoteCredits(credit.key, credit.addOns).credits, 20);
  equal(quoteCredits('material.exam_set', materialCredit({ kind: 'ielts_reading', variants: true }).addOns).credits, 25);
  equal(materialCredit({ kind: 'live_quiz', variants: true }).addOns, [], 'kinds without variants never add the charge');
});

Deno.test('exam-style sets reuse the existing format definitions', () => {
  for (const type of ieltsTypesFor('reading')) ok((IELTS_QUESTION_TYPES as readonly string[]).includes(type), `${type} is an ielts-core type`);
  ok(!ieltsTypesFor('reading').includes('question_map_labeling'), 'picture types are left out of text materials');
  equal([...toeflTasksFor('reading'), ...toeflTasksFor('listening'), ...toeflTasksFor('writing'), ...toeflTasksFor('speaking')].sort(), [...TOEFL_2026_TASKS].sort());
  equal([...MULTILEVEL_READING_PARTS], ['gap_fill', 'mcq', 'headings']);
  ok(ADMISSION_MATH_TOPIC_CODES.includes('math.alg.quadratic'), 'admission topics come from subject-core');
  equal(EXAM_TARGETS.sat.tasks!.math, ['algebra', 'advanced_math', 'problem_solving_data_analysis', 'geometry_trigonometry']);
  equal(briefProblems({ kind: 'toefl_2026', level: 'B2', topic: 'Campus life', instruction_language: 'en', length: 'short', exam: { format: 'toefl_2026', section: 'reading', task: 'write_email' } }), ['exam.task'], 'a task from another section');
  equal(briefProblems({ kind: 'toefl_2026', level: 'B2', topic: 'Campus life', instruction_language: 'en', length: 'short', exam: { format: 'toefl_2026', section: 'reading', task: 'read_daily_life' } }), []);
  equal(briefProblems({ kind: 'reading', level: 'B1', topic: 'Food', instruction_language: 'uz', length: 'short', exam: { format: 'ielts' } }), ['exam']);
  equal(briefProblems({ kind: 'live_quiz', level: 'B1', topic: 'Food', instruction_language: 'uz', length: 'short', variants: true }), ['variants']);
});

Deno.test('long sets are chunked into calls that each stay small', () => {
  const full = generationPlan({ kind: 'ielts_reading', level: 'B2', topic: 'Cities', instruction_language: 'en', length: 'long' });
  equal(full.map((step) => step.produce), ['source', 'questions', 'source', 'questions', 'source', 'questions']);
  equal(full.filter((step) => step.produce === 'questions').map((step) => step.questions), [13, 13, 14], 'the test\'s own passage split');
  equal(plannedCount({ kind: 'ielts_reading', length: 'long' }), 40);
  const listening = generationPlan({ kind: 'ielts_listening', level: 'B2', topic: 'Travel', instruction_language: 'en', length: 'long' });
  equal(listening.filter((step) => step.produce === 'source').length, 4);
  const sat = generationPlan({ kind: 'sat_math', level: 'band:1200', topic: 'Linear functions', instruction_language: 'en', length: 'long', exam: { format: 'sat', domain: 'algebra' } });
  equal(sat.reduce((sum, step) => sum + (step.questions ?? 0), 0), 22, 'one Math module');
  for (const step of [...full, ...listening, ...sat]) ok((step.questions ?? 0) <= 15, `${step.id} is at most 15 questions`);
  const variants = generationPlan({ kind: 'reading', level: 'B1', topic: 'Sport', instruction_language: 'ru', length: 'standard', variants: true });
  equal(variants.filter((step) => step.produce === 'variant').map((step) => step.variant), ['support', 'stretch']);
  equal(new Set(variants.map((step) => step.id)).size, variants.length, 'step ids are unique');
});

Deno.test('model drafts in loose shapes become canonical blocks', () => {
  const sets = draftQuestionsSchema().parse({ sets: [
    { instructions: 'Choose.', questions: [
      { type: 'mcq', prompt: 'Capital of Uzbekistan?', options: ['A) Samarkand', 'B) Tashkent', 'C) Bukhara', 'D) Khiva'], answer: 'B' },
      { type: 'multiple_choice', prompt: 'Odd one out', options: ['cat', 'dog', 'car'], answer: 'car' },
      { type: 'mcq', prompt: 'Third option?', options: ['one', 'two', 'three'], answer: 3 },
      { type: 'tfng', prompt: 'It rains.', answer: 'Not given' },
      { type: 'multi', prompt: 'Pick two', options: ['red', 'blue', 'green', 'loud'], answer: 'A, C' },
      { type: 'spr', prompt: 'x = ?', answer: 0.5 },
      { type: 'gap', prompt: 'I ____ to school.', answer: 'walk / go' },
    ] },
  ] });
  const [first] = sets;
  equal(first.questions.map((question) => question.answer), [['B'], ['C'], ['C'], ['NG'], ['A', 'C'], ['0.5'], ['walk', 'go']]);
  equal(first.questions[0].options![1], { id: 'B', text: 'Tashkent' }, 'option labels are stripped');
  equal(first.questions[4].choose, 2);
  equal(first.questions[3].options!.map((option) => option.id), ['T', 'F', 'NG'], 'judgement types get the fixed options');
  throws(() => draftQuestionsSchema().parse({ sets: [{ instructions: 'x', questions: [] }] }), 'empty sets go back for repair');
  throws(() => draftContentSchema().parse({ blocks: [{ type: 'hologram' }] }), 'unknown blocks go back for repair');

  const source = draftSourceSchema('script').parse({ title: 'At the station', lines: ['Anna: Hello!', { speaker: 'Clerk', text: 'Good morning.' }] });
  equal(source.block.type === 'script' && source.block.lines.map((entry) => entry.speaker), ['Anna', 'Clerk']);

  const content = draftContentSchema().parse({ blocks: [
    { type: 'text', role: 'passage', body: 'Yesterday I [[1]] to the park and [[2]] a friend.' },
    { type: 'questions', instructions: 'Fill the gaps.', questions: [{ type: 'gap', prompt: '', answer: 'went' }, { type: 'gap', prompt: '', answer: 'met' }] },
  ] });
  const numbered = renumber(content.blocks);
  equal(numbered.map((block) => block.id), ['b1', 'b2']);
  equal((numbered[0] as Extract<Block, { type: 'text' }>).body, 'Yesterday I [[q1]] to the park and [[q2]] a friend.', 'cloze markers point at question ids');
  equal((numbered[1] as Extract<Block, { type: 'questions' }>).source, 'b1');
});

Deno.test('the strict schema rejects malformed or unsafe materials', () => {
  const material = readingSet();
  throws(() => parseMaterial({ ...material, level: 'B9' }), 'bad level');
  throws(() => parseMaterial({ ...material, blocks: [...material.blocks, material.blocks[0]] }), 'duplicate block ids');
  throws(() => parseMaterial({ ...material, blocks: [{ id: 'B 1', type: 'text', role: 'passage', body: 'x' }] }), 'bad id');
  throws(() => parseMaterial({ ...material, schema: 'other' }), 'wrong schema version');
  throws(() => briefSchema.parse({ kind: 'reading', level: 'B1', topic: 'x', instruction_language: 'de', length: 'short' }), 'unknown language');
  equal(parseMaterial(JSON.parse(JSON.stringify(material))), material, 'round trip');
});

Deno.test('deterministic key checks pass a clean key and catch every broken one', () => {
  const clean = readingSet();
  const report = checkMaterial(clean, { expectedQuestions: 5 });
  equal(report.issues, [], 'clean set');
  equal([report.questions, report.autoMarkable], [5, 5]);

  const broken = (change: (material: Material) => void) => { const copy = structuredClone(clean); change(copy); return copy; };
  const q = (material: Material, blockIndex: number, questionIndex: number) => (material.blocks[blockIndex] as Extract<Block, { type: 'questions' }>).questions[questionIndex];
  ok(codes(broken((m) => { q(m, 3, 0).answer = ['A', 'B']; })).includes('mcq_key_count'), 'one key per MCQ');
  ok(codes(broken((m) => { q(m, 3, 0).answer = ['E']; })).includes('key_not_in_options'), 'the key exists in the options');
  ok(codes(broken((m) => { q(m, 3, 0).options![2].text = 'twice as big'; })).includes('options_duplicate'), 'two identical options');
  ok(codes(broken((m) => { q(m, 2, 0).answer = ['cotton farming fields']; })).includes('gap_answer_too_long'), 'gap answers within the word limit');
  ok(codes(broken((m) => { q(m, 2, 1).answer = ['dust clouds']; })).includes('gap_answer_not_in_source'), 'gap answers come from the passage');
  ok(codes(broken((m) => { q(m, 2, 0).prompt = 'Rivers ____ were diverted to grow ____.'; })).includes('gap_multiple'), 'one gap per question');
  ok(codes(broken((m) => { (m.blocks[2] as Extract<Block, { type: 'questions' }>).word_box = ['wheat', 'rice', 'salt storms']; })).includes('gap_answer_not_in_box'), 'gap answers from the word box');
  ok(codes(clean, 6).includes('question_count'), 'counts match the brief');
  ok(codes(broken((m) => { q(m, 1, 0).answer = []; })).includes('key_missing'), 'every question has a key');

  const quiz = parseMaterial({ schema: 'schood.material.v1', kind: 'quiz', title: 'Quiz', level: 'A2', topic: 'Food', instruction_language: 'uz', blocks: [
    { id: 'b1', type: 'questions', instructions: 'Choose.', questions: [
      ...Array.from({ length: 8 }, (_, index) => ({ id: `q${index + 1}`, type: 'single_choice', prompt: `Question number ${index + 1} about food?`, options: [{ id: 'A', text: 'yes' }, { id: 'B', text: 'no' }, { id: 'C', text: 'maybe' }, { id: 'D', text: 'never' }], answer: ['A'] })),
      { id: 'q9', type: 'open', prompt: 'Describe your breakfast.', answer: [] },
      { id: 'q10', type: 'multi_choice', prompt: 'Pick two fruits.', options: [{ id: 'A', text: 'apple' }, { id: 'B', text: 'bread' }, { id: 'C', text: 'pear' }], answer: ['A', 'C'], choose: 3 },
      { id: 'q11', type: 'ordering', prompt: 'Order the words.', options: [{ id: 'A', text: 'I' }, { id: 'B', text: 'like' }, { id: 'C', text: 'tea' }], answer: ['A', 'B'] },
      { id: 'q12', type: 'numeric', prompt: '2 + 2 = ?', answer: ['four'] },
      { id: 'q13', type: 'single_choice', prompt: 'Short?', options: [{ id: 'A', text: 'x' }, { id: 'B', text: 'y' }, { id: 'C', text: 'z' }], answer: ['A'] },
    ] },
  ] });
  const found = codes(quiz);
  for (const code of ['not_auto_markable', 'multi_key_count', 'ordering_key_incomplete', 'numeric_key_invalid', 'key_position_bias', 'option_count']) ok(found.includes(code as never), `quiz flags ${code}`);

  const headings = parseMaterial({ ...clean, blocks: [clean.blocks[0], { id: 'b2', type: 'questions', instructions: 'Match the headings.', exam_type: 'question_matching_headings', source: 'b1', options: [{ id: 'i', text: 'A lost sea' }, { id: 'ii', text: 'New science' }], questions: [
    { id: 'q1', type: 'matching', prompt: 'Paragraph A', answer: ['i'] }, { id: 'q2', type: 'matching', prompt: 'Paragraph B', answer: ['ii'] },
  ] }] });
  ok(codes(headings).includes('matching_options_too_few'), 'more headings than paragraphs');

  const variants = parseMaterial({ ...clean, variants: [{ label: 'support', level: 'B1', blocks: [clean.blocks[0], { ...clean.blocks[3] }] }] });
  ok(codes(variants).includes('variant_count'), 'three-level versions keep the same count');
});

Deno.test('the solver sees no key, and disagreements are listed per question', () => {
  const material = readingSet();
  const tasks = solverTasks(material);
  equal(tasks.length, 1);
  const json = JSON.stringify(tasks);
  ok(!json.includes('"answer"') && !json.includes('explanation'), 'no keys or explanations reach the solver');
  equal(tasks[0].sources.map((source) => source.id), ['b1']);
  equal(tasks[0].questions.map((question) => question.number), [1, 2, 3, 4, 5]);
  equal(solverTasks(parseMaterial({ ...material, blocks: [material.blocks[0], { id: 'b2', type: 'questions', instructions: 'x', source: 'b1', questions: Array.from({ length: 45 }, (_, index) => ({ id: `q${index + 1}`, type: 'short_answer', prompt: `Q${index}`, answer: ['x'] })) }] })).map((task) => task.questions.length), [15, 15, 15], 'chunks of at most 20');

  const parsed = solverAnswersSchema.parse({ answers: [
    { id: 'q1', answer: 'TRUE' }, { id: 'q2', answer: ['false'], reason: 'It says farming continues.' }, { id: 'q3', answer: 'Cotton.' },
    { id: 'q4', answer: ['the salt storms'] }, { id: 'q5', answer: 'a tenth of its size' },
  ] });
  const comparison = compareSolver(material, parsed.answers);
  equal(comparison.agreed, 4, 'case, articles, punctuation and option text vs letter agree');
  equal(comparison.disagreements.map((entry) => [entry.number, entry.key, entry.solver, entry.reason]), [[2, ['NG'], ['false'], 'It says farming continues.']]);
  const report = verification(checkMaterial(material, { expectedQuestions: 5 }), { ...comparison, status: 'done' });
  equal(report.clean, false, 'a disagreement keeps the card flagged');
  equal(compareSolver(material, []).unanswered.length, 5);
});

Deno.test('answer comparison handles numbers, options and accepted alternatives', () => {
  const numeric = { id: 'q1', type: 'numeric' as const, prompt: 'x', answer: ['0.5'] };
  ok(isCorrect(numeric, ['1/2']) && isCorrect(numeric, ['0,5']) && !isCorrect(numeric, ['0.6']), 'fractions and comma decimals');
  equal([parseNumber('1 1/2'), parseNumber('40%'), parseNumber('−3'), parseNumber('abc')], [1.5, 40, -3, null]);
  const gap = { id: 'q2', type: 'gap' as const, prompt: '____', answer: ['colour', 'color'] };
  ok(isCorrect(gap, ['Color']) && isCorrect(gap, ['the colour']) && !isCorrect(gap, ['shape']), 'alternatives and articles');
  const multi = { id: 'q3', type: 'multi_choice' as const, prompt: 'x', options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }, { id: 'C', text: 'c' }], answer: ['A', 'C'] };
  ok(isCorrect(multi, ['C', 'A']) && !isCorrect(multi, ['A']) && !isCorrect(multi, ['A', 'B']), 'multi-choice as a set');
  equal(normaliseAnswer('  “The River”. '), 'the river');
});

Deno.test('renderers: student view, key, text, Telegram, Live Quiz and Assessment Cloud items', () => {
  const material = parseMaterial({ ...readingSet(), blocks: [...readingSet().blocks, { id: 'b5', type: 'model_answer', body: 'Model notes for teachers.' }] });
  const student = studentView(material);
  const json = JSON.stringify(student);
  ok(!json.includes('Model notes') && !json.includes('a tenth of its size."') && !json.includes('explanation'), 'no model answers or explanations');
  ok(JSON.stringify(student.blocks).includes('"answer":[]'), 'no keys');
  equal(answerKey(material).map((entry) => entry.answer), ['TRUE', 'NOT GIVEN', 'cotton', 'salt storms', 'B (a tenth of its size)']);
  const text = materialText(material);
  ok(text.startsWith('The shrinking sea') && !text.includes('✓') && !text.includes('Model notes'), 'student text');
  ok(materialText(material, { key: true }).includes('✓ B (a tenth of its size)'), 'teacher text has the key');
  const long = parseMaterial({ ...material, blocks: [{ id: 'b1', type: 'text', role: 'passage', body: 'word '.repeat(2400) }, ...material.blocks.slice(1)] });
  const messages = telegramMessages(long);
  ok(messages.length >= 3 && messages.every((message) => message.length <= 4000), 'Telegram messages fit the limit');
  const quiz = quizQuestions(material);
  equal(quiz.map((entry) => [entry.id, entry.answer]), [['q1', 'T'], ['q2', 'NG'], ['q5', 'B']], 'only one-answer choice questions are playable');
  const items = assessmentItems(material);
  equal(items.map((entry) => entry.item.type), ['single_choice', 'single_choice', 'short_answer', 'short_answer', 'single_choice']);
  equal(items[4].key, { correct: 'B', solution: 'The passage says it had shrunk to a tenth of its size.' });
  ok(items.every((entry) => entry.item.schema_version === 'assessment.item.v1' && entry.item.prompt.includes('Aral Sea')), 'items carry their passage');
});
