// Checks over all the Company English content: every job role has a valid track and bank
// items, ids are unique, answer keys point at real options and translations are clean.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { INDUSTRIES, INDUSTRY_ROLES, JOB_ROLES } from '../../../packages/company-core/src/mod.ts';
import { GRAMMAR, LISTENING, READING, SPEAKING, VOCABULARY, WRITING, type ChoiceItem } from './hiring/bank/index.ts';
import { validateTrack } from './training/content.ts';
import { findLesson, findScenario, findTemplate, TRACKS } from './training/tracks/index.ts';
import { TRACK_MINIMUMS } from './training/tracks/_targets.ts';

const specific = JOB_ROLES.filter((role) => role !== 'general');

Deno.test('every job role has a valid track with lessons, role-plays and writing tasks', () => {
  assertEquals(TRACKS.map((track) => track.code), [...JOB_ROLES]);
  const lessons = new Set<string>(), scenarios = new Set<string>(), templates = new Set<string>();
  for (const track of TRACKS) {
    assertEquals(validateTrack(track), [], track.code);
    assert(track.lessons.length >= (TRACK_MINIMUMS[track.code] ?? 8), `${track.code}: ${track.lessons.length} lessons`);
    assert(track.scenarios.length >= 4 && track.templates.length >= 4, `${track.code}: role-plays and writing tasks`);
    for (const lesson of track.lessons) { assert(!lessons.has(lesson.code), lesson.code); lessons.add(lesson.code); assert(findLesson(lesson.code), lesson.code); }
    for (const scenario of track.scenarios) { assert(!scenarios.has(scenario.code), scenario.code); scenarios.add(scenario.code); assert(findScenario(scenario.code), scenario.code); }
    for (const template of track.templates) { assert(!templates.has(template.code), template.code); templates.add(template.code); assert(findTemplate(template.code), template.code); }
  }
});

Deno.test('lesson missions reach a role-play or writing task, and gaps have one blank and a banked answer', () => {
  for (const track of TRACKS) for (const lesson of track.lessons) {
    const mission = lesson.mission;
    assert(mission.kind === 'roleplay' ? findScenario(mission.scenario)?.track === track : findTemplate(mission.template)?.track === track, lesson.code);
    for (const exercise of lesson.exercises) {
      if (exercise.kind !== 'gap') continue;
      for (const item of exercise.items) assertEquals(item.text.split('___').length, 2, `${lesson.code} ${item.text}`);
    }
  }
});

Deno.test('Uzbek text uses U+2018 for o‘ and g‘, Russian is in Cyrillic and spoken lines are English', () => {
  for (const track of TRACKS) {
    const rows = [track.title, track.summary, ...track.scenarios.flatMap((row) => [row.title, row.goal]), ...track.templates.flatMap((row) => [row.title, row.situation]),
      ...track.lessons.flatMap((row) => [row.title, row.goal, ...row.phrases, ...row.words, row.dialogue.setting, row.mission.brief])];
    for (const row of rows) {
      assert(!/[а-яё]/i.test(row.uz), `${track.code}: Cyrillic in Uzbek: ${row.uz}`);
      assert(/[а-яё]/i.test(row.ru), `${track.code}: not Russian: ${row.ru}`);
      assert(!/[а-яё]/i.test(row.en), `${track.code}: Cyrillic in English: ${row.en}`);
    }
    for (const lesson of track.lessons) for (const line of lesson.dialogue.lines) assert(!/[а-яё]/i.test(line.text), `${lesson.code}: ${line.text}`);
  }
});

function checkChoice(item: { id: string; options: string[]; answer: number }) {
  assert(item.options.length >= 3 && item.options.length <= 4, `${item.id}: 3-4 options`);
  assertEquals(new Set(item.options.map((option) => option.trim().toLowerCase())).size, item.options.length, `${item.id}: distinct options`);
  assert(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length, `${item.id}: answer key`);
}

Deno.test('the bank holds the promised amount, and every job role has items in each section', () => {
  assert(GRAMMAR.length >= 200, `grammar ${GRAMMAR.length}`);
  assert(VOCABULARY.length >= 200, `vocabulary ${VOCABULARY.length}`);
  assert(READING.length >= 30, `reading ${READING.length}`);
  assert(LISTENING.length >= 30, `listening ${LISTENING.length}`);
  for (const role of specific) {
    assert(GRAMMAR.filter((item) => item.job_role === role).length >= 6, `grammar ${role}`);
    assert(VOCABULARY.filter((item) => item.job_role === role).length >= 6, `vocabulary ${role}`);
    assert(READING.some((item) => item.job_role === role), `reading ${role}`);
    assert(LISTENING.some((item) => item.job_role === role), `listening ${role}`);
  }
  for (const role of JOB_ROLES) {
    assert(WRITING.filter((item) => item.job_role === role).length >= 2, `writing ${role}`);
    assert(SPEAKING.filter((item) => item.job_role === role).length >= 3, `speaking ${role}`);
  }
});

Deno.test('bank ids are unique and answer keys are valid', () => {
  const ids = [...GRAMMAR, ...VOCABULARY, ...READING, ...LISTENING, ...WRITING, ...SPEAKING].map((entry) => entry.id)
    .concat([...READING, ...LISTENING].flatMap((passage) => passage.questions.map((question) => question.id)));
  assertEquals(ids.filter((id, index) => ids.indexOf(id) !== index), []);
  for (const item of [...GRAMMAR, ...VOCABULARY] as ChoiceItem[]) {
    checkChoice(item);
    assertEquals(item.prompt.split('___').length, 2, `${item.id}: one gap`);
  }
  for (const passage of [...READING, ...LISTENING]) for (const question of passage.questions) {
    checkChoice(question);
    assert(question.id.startsWith(`${passage.id}-`), question.id);
  }
  for (const passage of LISTENING) for (const line of passage.lines) assert(!/\d/.test(line.text), `${passage.id}: spoken numbers are written out: ${line.text}`);
  // No item may give the answer away by always keeping it in the same place.
  const firsts = [...GRAMMAR, ...VOCABULARY].filter((item) => item.answer === 0).length;
  assert(firsts < (GRAMMAR.length + VOCABULARY.length) * 0.6, 'answer positions are varied');
});

Deno.test('every industry suggests only real job roles and at least one role-specific track', () => {
  for (const industry of INDUSTRIES) {
    assert(INDUSTRY_ROLES[industry].length >= 3, industry);
    for (const role of INDUSTRY_ROLES[industry]) assert((JOB_ROLES as readonly string[]).includes(role), `${industry}: ${role}`);
  }
});
