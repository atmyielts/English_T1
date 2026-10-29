// Every teacher i18n key the screens use exists, every value family (kinds, statuses, codes) is complete,
// and every refusal code the teacher routes throw has an error.<code> text. uz.ts and ru.ts are typed
// against en.ts, so the app build checks they have the same keys.
// Run from the repo root: deno run --no-lock --allow-read scripts/check-schood-ai-teacher-i18n.ts
import { CHOICE_TYPES, MATERIAL_KINDS, QUESTION_TYPES, BLOCK_TYPES, TEXT_ROLES, EXAM_TARGETS } from '../packages/ai-core/src/materials/mod.ts';
import { en } from '../apps/schood-ai/src/teacher/i18n/en.ts';
const keys = new Set(Object.keys(en));
const missing: string[] = [];
const need = (key: string) => { if (!keys.has(key)) missing.push(key); };
const walk = (dir: string): string[] => [...Deno.readDirSync(dir)].flatMap((entry) => entry.isDirectory ? walk(`${dir}/${entry.name}`) : /\.tsx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : []);
for (const file of walk('apps/schood-ai/src/teacher')) for (const match of Deno.readTextFileSync(file).matchAll(/'(teacher\.[a-zA-Z0-9_.]+)'/g)) need(match[1]);
const families: Record<string, readonly (string | number)[]> = {
  'teacher.kind': Object.keys(MATERIAL_KINDS), 'teacher.kindHint': Object.keys(MATERIAL_KINDS), 'teacher.group': ['general', 'exam', 'planning', 'textbook'],
  'teacher.status': ['requested', 'generating', 'ready', 'approved', 'rejected', 'failed'], 'teacher.pageStatus': ['draft', 'approved', 'archived'], 'teacher.variant': ['core', 'support', 'stretch'],
  'teacher.qtype': QUESTION_TYPES, 'teacher.block': BLOCK_TYPES, 'teacher.role': TEXT_ROLES,
  'teacher.checks.code': ['block_missing', 'block_not_allowed', 'type_not_allowed', 'exam_type_not_allowed', 'not_auto_markable', 'key_missing', 'mcq_key_count', 'key_not_in_options', 'options_missing', 'options_too_few', 'options_duplicate', 'option_count', 'multi_key_count', 'ordering_key_incomplete', 'matching_options_too_few', 'gap_marker_missing', 'gap_multiple', 'gap_answer_too_long', 'gap_answer_not_in_box', 'gap_answer_not_in_source', 'word_box_too_small', 'cloze_marker_unknown', 'numeric_key_invalid', 'open_has_key', 'source_missing', 'question_count', 'variant_count', 'duplicate_question', 'key_position_bias'],
  'teacher.section': ['listening', 'reading', 'writing', 'speaking', 'reading_writing', 'math'],
  'teacher.task': [...new Set(['task1', 'task2', ...Object.values(EXAM_TARGETS.toefl_2026.tasks!).flat(), ...Object.values(EXAM_TARGETS.multilevel.tasks!).flat()])],
  'teacher.lang': ['uz', 'ru', 'en'], 'teacher.length': ['short', 'standard', 'long'], 'teacher.studio.difficulty': [1, 2, 3], 'teacher.job.tab': ['preview', 'edit'],
  'teacher.page.tab': ['teacher', 'student', 'edit'], 'teacher.print': ['student', 'teacher', 'key_end'], 'teacher.quizStatus': ['lobby', 'question', 'reveal', 'finished'],
  'teacher.marking.mode': ['writing', 'speaking'], 'teacher.marking.from': ['typed', 'pasted', 'photo', 'recording', 'transcript'],
  'teacher.signal': ['similar_text', 'large_paste', 'fast_typing', 'style_shift', 'level_jump', 'duplicate_media', 'untimed_source'],
  'teacher.feedback.purpose': ['report_card', 'term_summary', 'individual'], 'teacher.feedback.tone': ['warm', 'neutral', 'formal'],
  'teacher.channel.status': ['pending', 'verified', 'error'], 'teacher.channel.error': ['bot_unconfigured', 'bot_unavailable', 'channel_not_found', 'not_a_channel', 'bot_not_admin', 'rate_limited'],
  'teacher.channel.weekStatus': ['generating', 'draft', 'proposed', 'approved', 'cancelled'], 'teacher.post': ['word', 'quiz', 'tip'],
  'teacher.post.status': ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'], 'teacher.post.error': ['rate_limited', 'transient', 'network', 'blocked', 'permanent', 'channel_not_verified'],
  'teacher.day': [1, 2, 3, 4, 5, 6, 7], 'teacher.market.tab': ['browse', 'mine', 'review'], 'teacher.market.priceOption': ['any', 'free', 'paid'], 'teacher.market.sortOption': ['rating', 'usage', 'new'],
  'teacher.market.status': ['draft', 'pending', 'published', 'rejected', 'withdrawn'], 'teacher.market.ledger': ['pending', 'cleared', 'reversed'],
  'teacher.brand.kind': ['landing', 'instagram', 'telegram', 'results'], 'teacher.brand.course': ['title', 'level', 'schedule', 'price', 'starts'],
  'teacher.editor.word': ['term', 'meaning', 'meaning_uz', 'meaning_ru', 'example'], 'teacher.editor.card': ['front', 'back', 'example'],
};
for (const [prefix, values] of Object.entries(families)) for (const value of values) need(`${prefix}.${value}`);
void CHOICE_TYPES;
// Every refusal code the teacher routes throw has an error.<code> text (core covers the shared ones).
const core = Deno.readTextFileSync('apps/schood-ai/src/core/i18n/en.ts');
for (const file of walk('supabase/functions/schood-ai/teacher')) for (const match of Deno.readTextFileSync(file).matchAll(/new SchoodAIError\('([a-z_]+)'/g)) if (!keys.has(`error.${match[1]}`) && !core.includes(`'error.${match[1]}'`) && !['invalid_request', 'not_found', 'role_required', 'plan_required'].includes(match[1])) missing.push(`error.${match[1]}`);
if (missing.length) { console.error(`Missing teacher i18n keys: ${[...new Set(missing)].join(' ')}`); Deno.exit(1); }
console.log('Teacher i18n: every key the screens use is in the catalog.');
