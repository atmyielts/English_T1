#!/usr/bin/env node
// Validate private IELTS materials and produce insert-only seed migrations outside this checkout.
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const usage = 'Usage: node scripts/content/ielts-eight-week.mjs --source-dir <private dir> --output-dir <private dir> [--check]';
const { values: args } = parseArgs({ options: {
  'source-dir': { type: 'string' }, 'output-dir': { type: 'string' }, check: { type: 'boolean' }, help: { type: 'boolean' },
} });
if (args.help) {
  console.log(usage);
  process.exit(0);
}
if (!args['source-dir'] || !args['output-dir']) {
  console.error(usage);
  process.exit(1);
}

const checkout = realpathSync(resolve(import.meta.dirname, '..', '..'));
const privateDirectory = (path) => {
  const dir = realpathSync(path);
  const rel = relative(checkout, dir);
  assert.ok(isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep), 'Use a private directory outside this checkout.');
  return dir;
};
const sourceDir = privateDirectory(args['source-dir']);
const outputDir = privateDirectory(args['output-dir']);
const read = (directory, name) => readFileSync(resolve(directory, name), 'utf8');
const practice = JSON.parse(read(sourceDir, 'short-sets.json'));
const playbook = JSON.parse(read(sourceDir, 'worked-examples.json'));
const offline = JSON.parse(read(sourceDir, 'offline-listening.json'));
const readingChoices = ['True', 'False', 'Not Given'];
const guides = new Set([
  'guide-reading-paraphrase-premium', 'guide-writing-task-2-premium', 'guide-speaking-band-7-premium',
]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const wordCount = (value) => value.trim().split(/\s+/).filter(Boolean).length;
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
const textList = (list, count) => Array.isArray(list) && list.length >= count && list.every(hasText);
const count = (rows, skill, track) =>
  rows.filter((row) => row.skill === skill && row.track === track).length;

function validateEvidence(questions, review, stimulus) {
  assert.equal(questions.length, review.length);
  questions.forEach(({ prompt, options }, index) => {
    const { key, evidence } = review[index];
    assert.ok(hasText(prompt) && hasText(evidence) && stimulus.includes(evidence), prompt);
    if (options) {
      assert.ok(textList(options, 3) && options.length <= 4 && new Set(options).size === options.length, prompt);
      assert.ok(Number.isInteger(key) && key >= 0 && key < options.length, prompt);
      if (options.includes('Not Given')) assert.deepEqual(options, readingChoices, prompt);
    } else {
      assert.ok(prompt.includes('ONE WORD ONLY'), prompt);
      assert.ok(textList(key, 1), prompt);
      for (const word of key) {
        assert.equal(wordCount(word), 1, prompt);
        assert.ok(stimulus.toLowerCase().includes(word.toLowerCase()), prompt);
      }
    }
  });
}

function validateWriting(row) {
  const { learner_content: task, review_content: review } = row;
  const minimum = row.minutes === 20 ? 150 : 250;
  const needsTable = row.minutes === 20 && row.track === 'academic';
  assert.ok(row.minutes === 20 || row.minutes === 40, row.slug);
  assert.equal(task.minimum_words, minimum);
  assert.equal(review.retry.minimum_words, minimum);
  assert.notEqual(task.prompt, review.retry.prompt);
  assert.ok(wordCount(review.model) >= minimum, row.slug);
  assert.ok(textList(review.planning, 2) && textList(review.notes, 2), row.slug);
  assert.ok(hasText(review.revision.before) && hasText(review.revision.after));
  assert.notEqual(review.revision.before, review.revision.after);
  assert.ok(textList(review.revision.why, 2) && textList(review.retry.checks, 2), row.slug);
  for (const attempt of [task, review.retry]) {
    assert.ok(hasText(attempt.prompt) && attempt.prompt.includes(String(minimum)), row.slug);
    assert.equal(Boolean(attempt.table), needsTable, row.slug);
    if (attempt.table) {
      const { headers, rows } = attempt.table;
      assert.ok(textList(headers, 2) && new Set(headers).size === headers.length);
      assert.ok(rows.length >= 3 && rows.every((cells) => cells.length === headers.length
        && hasText(cells[0]) && cells.slice(1).every(Number.isFinite)));
    }
  }
}

assert.deepEqual(
  ['academic', 'general', 'both'].flatMap((track) => ['reading', 'writing', 'speaking'].map((skill) => count(practice, skill, track))),
  [2, 1, 0, 2, 1, 0, 0, 3, 3],
);
assert.equal(new Set(practice.map((row) => row.slug)).size, practice.length);
assert.equal(new Set(practice.map((row) => row.display_order)).size, practice.length);
for (const row of practice) {
  const { slug, learner_content: learner, review_content: review } = row;
  assert.ok(slug.startsWith('ielts-eight-week-') && slugPattern.test(slug) && slug.length <= 100);
  assert.ok(hasText(row.title) && row.title.length <= 180 && Number.isInteger(row.display_order));
  if (row.skill === 'reading') {
    assert.deepEqual(Object.keys(learner).sort(), ['passage', 'questions']);
    assert.ok(wordCount(learner.passage) >= 180);
    assert.equal(learner.questions.length, 6);
    assert.ok(learner.questions.every((question) => Object.keys(question).sort().join() === 'options,prompt'));
    assert.ok(review.questions.every(({ explanation }) => hasText(explanation)));
    validateEvidence(learner.questions, review.questions, learner.passage);
  } else if (row.skill === 'writing') {
    assert.ok(Object.keys(learner).every((field) => ['prompt', 'minimum_words', 'table'].includes(field)));
    validateWriting(row);
  } else {
    assert.deepEqual(Object.keys(learner).sort(), ['part1', 'part2', 'part3']);
    assert.ok(textList(learner.part1, 4) && textList(learner.part3, 4) && textList(learner.part2.points, 4));
    assert.ok(hasText(learner.part2.cue) && hasText(review.model));
    assert.equal(review.follow_ups.length, 2);
    assert.ok(review.follow_ups.every(({ prompt, model, note }) =>
      hasText(prompt) && hasText(note) && wordCount(model) >= 40 && !learner.part3.includes(prompt)));
  }
}

assert.equal(offline.length, 2);
for (const set of offline) {
  assert.equal(set.status, 'script_only');
  assert.equal(set.questions.length, 5);
  assert.ok(set.turns.every(({ speaker, text }) => hasText(speaker) && hasText(text)));
  const stimulus = set.turns.map((turn) => turn.text).join('\n');
  validateEvidence(set.questions,
    set.questions.map(({ answer: key, evidence }) => ({ key, evidence })), stimulus);
}

assert.equal(playbook.length, 4);
assert.equal(new Set(playbook.map(({ slug, id }) => slug + '/' + id)).size, playbook.length);
assert.deepEqual(new Set(playbook.map((section) => section.slug)), guides);
for (const section of playbook) {
  assert.ok(guides.has(section.slug) && slugPattern.test(section.id));
  assert.ok([section.heading, section.lead, section.body, section.exercise.prompt, section.exercise.answer].every(hasText));
}

const tag = '$ielts_eight_week$';
const embed = (value) => {
  const json = JSON.stringify(value, null, 2);
  assert.ok(!json.includes(tag), 'The source contains the SQL delimiter');
  return tag + json + tag + '::jsonb';
};
const generated = (body) => '-- Generated by scripts/content/ielts-eight-week.mjs. Do not edit manually.\n'
  + "begin;\nset local lock_timeout = '5s';\n\n" + body + '\ncommit;\n';

const practiceSql = generated(
  'insert into public.ielts_practice_library_sets (\n'
  + '  slug, skill, track, title, minutes, display_order, learner_content, review_content, response_format_version, is_published\n'
  + ')\n'
  + 'select slug, skill, track, title, minutes, display_order, learner_content, review_content, 2, true\n'
  + 'from jsonb_to_recordset(' + embed(practice) + ') as source (\n'
  + '  slug text, skill text, track text, title text, minutes smallint, display_order smallint, learner_content jsonb, review_content jsonb\n'
  + ')\n'
  + 'on conflict (slug) do nothing;\n',
);

const playbookSql = generated(
  'with source as (\n'
  + '  select item, position from jsonb_array_elements(' + embed(playbook) + ') with ordinality as lines(item, position)\n'
  + '), blocks as (\n'
  + "  select item, md5('schood-ielts-pb-eight-week:' || (item->>'slug') || ':' || (item->>'id'))::uuid as id,\n"
  + "         row_number() over (partition by item->>'slug' order by position) as section_offset\n"
  + '  from source\n'
  + '), target as (\n'
  + '  select p.id, p.slug, coalesce(max(s.sort_order) filter (where s.id not in (select id from blocks)), 0) as base_order\n'
  + '  from public.ielts_playbook_pages p\n'
  + '  left join public.ielts_playbook_page_sections s on s.page_id = p.id\n'
  + "  where p.locale_code = 'en' and p.visibility = 'premium' and p.slug in (select item->>'slug' from blocks)\n"
  + '  group by p.id, p.slug\n'
  + ')\n'
  + 'insert into public.ielts_playbook_page_sections (id, page_id, block_type, heading, status, sort_order, content, metadata)\n'
  + "select b.id, t.id, 'rich_text', b.item->>'heading', 'published', (t.base_order + b.section_offset)::integer,\n"
  + "       b.item - 'id' - 'slug' - 'heading', jsonb_build_object('pack', 'eight_week_worked_examples')\n"
  + "from blocks b join target t on t.slug = b.item->>'slug'\n"
  + 'on conflict (id) do nothing;\n',
);

const outputs = [
  ['20261124150000_ielts_practice_eight_week_short_sets.sql', practiceSql],
  ['20261124150001_ielts_playbook_worked_examples.sql', playbookSql],
];
for (const [name, sql] of outputs) {
  if (args.check) {
    assert.equal(read(outputDir, name), sql, name + ' is stale');
  } else {
    writeFileSync(resolve(outputDir, name), sql);
  }
}
console.log('Verified 12 Practice sets, 24 Reading keys, 4 Playbook exercises and 2 offline Listening scripts.');
