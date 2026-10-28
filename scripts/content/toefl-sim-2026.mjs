#!/usr/bin/env node
// TOEFL iBT 2026 simulator content generator (agent: toefl-sim).
//
// Source of truth: content/toefl-2026/{reading,listening,writing-speaking}.json
// (100% original Schood items). This script:
//   1. validates the items,
//   2. writes content/toefl-2026/audio-manifest.json (every audio file + the
//      lines and voices to synthesise; run scripts/content/toefl-sim-2026-tts.py),
//   3. writes the migrations that create ONE full 2026-format test (router +
//      lower + upper modules for Reading and Listening, full Writing and
//      Speaking) and the single-task practice bank.
//
//   node scripts/content/toefl-sim-2026.mjs            # manifest + SQL (needs audio durations)
//   node scripts/content/toefl-sim-2026.mjs --check    # validate only, fail on any problem
//
// No dependencies beyond Node. Ids are deterministic (md5 of a stable key) and
// every insert is `on conflict do nothing`, so re-running a migration is safe.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const contentDir = path.join(root, 'content', 'toefl-2026');
const audioDir = path.join(contentDir, 'audio');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const CHECK_ONLY = process.argv.includes('--check');

export const PRODUCT_ID = 'b262ffa8-9912-4eba-93d7-58af3164d1cc';
export const AUDIO_BASE = '/media/toefl-2026';
const REVISION = 'original-2026-10-v1';
const SOURCE = 'original-schood-toefl-2026';

const read = (name) => JSON.parse(fs.readFileSync(path.join(contentDir, name), 'utf8'));
const reading = read('reading.json');
const listening = read('listening.json');
const ws = read('writing-speaking.json');

export const uuid = (key) => {
  const h = createHash('md5').update(`schood-toefl26:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const problems = [];
const problem = (slug, message) => problems.push(`${slug}: ${message}`);
const LETTERS = ['A', 'B', 'C', 'D'];

// ---------------------------------------------------------------------------
// Complete the Words: ETS rule — intact first sentence, then the second half of
// every second word is removed (kept = floor(length / 2)), 10 words per text.

export const damageParagraph = (text, count = 10) => {
  const firstEnd = text.search(/[.!?](\s|$)/);
  if (firstEnd < 0) throw new Error('no first sentence');
  const head = text.slice(0, firstEnd + 1);
  const rest = text.slice(firstEnd + 1);
  const pieces = rest.split(/([A-Za-z]+)/);
  let wordIndex = 0;
  let damaged = 0;
  const blanks = [];
  const out = pieces.map((piece, i) => {
    if (i % 2 === 0 || damaged >= count) return piece;
    wordIndex += 1;
    if (wordIndex % 2 !== 0) return piece;
    if (piece.length < 2) {
      wordIndex -= 1; // single letters cannot be split; the next word takes the turn
      return piece;
    }
    damaged += 1;
    const keep = Math.floor(piece.length / 2);
    const id = String(damaged);
    blanks.push({ id, stem: piece.slice(0, keep), missing: piece.slice(keep), word: piece });
    return `{{${id}}}`;
  });
  return { text: head + out.join(''), blanks };
};

// ---------------------------------------------------------------------------
// Voices (Piper, licences recorded in the TTS script and the PR)

export const VOICES = {
  f_uk: 'en_GB-cori-medium',
  f_us1: 'en_US-ljspeech-medium',
  f_us2: 'en_US-kristin-medium',
  m_us1: 'en_US-john-medium',
  m_us2: 'en_US-norman-medium',
  m_us3: 'en_US-joe-medium',
};
const narratorFor = (used) => (used.includes('f_us2') ? 'm_us2' : 'f_us2');
const speedFor = (difficulty) => (difficulty === 'easy' ? 1.1 : difficulty === 'hard' ? 0.96 : 1.0);

const manifest = [];
const addAudio = (file, difficulty, segments) => {
  for (const s of segments) if (!VOICES[s.voice]) problem(file, `unknown voice ${s.voice}`);
  manifest.push({ file, length_scale: speedFor(difficulty), segments });
  return file;
};

const durationsPath = path.join(audioDir, 'durations.json');
const durations = fs.existsSync(durationsPath) ? JSON.parse(fs.readFileSync(durationsPath, 'utf8')) : {};
const audioRef = (file) => {
  const seconds = durations[file];
  if (!CHECK_ONLY && !(seconds > 0)) problem(file, 'missing audio duration (run the TTS script first)');
  return { url: `${AUDIO_BASE}/${file}`, duration_seconds: seconds > 0 ? Math.round(seconds * 10) / 10 : null };
};

// ---------------------------------------------------------------------------
// SQL helpers

const lit = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const jsonLit = (v) => `${lit(JSON.stringify(v))}::jsonb`;

class Sql {
  constructor() { this.lines = []; }
  experience(id, name, order, metadata) {
    this.lines.push(`insert into public.experiences(id,product_id,name,display_order,is_active,metadata) values(${lit(id)},${lit(PRODUCT_ID)},${lit(name)},${order},true,${jsonLit(metadata)}) on conflict (id) do nothing;`);
  }
  section(id, experienceId, name, order, metadata) {
    this.lines.push(`insert into public.sections(id,experience_id,name,display_order,metadata) values(${lit(id)},${lit(experienceId)},${lit(name)},${order},${jsonLit(metadata)}) on conflict (id) do nothing;`);
  }
  part(id, sectionId, name, order, metadata) {
    this.lines.push(`insert into public.parts(id,section_id,name,display_order,metadata) values(${lit(id)},${lit(sectionId)},${lit(name)},${order},${jsonLit(metadata)}) on conflict (id) do nothing;`);
  }
  unit(id, partId, type, order, data, metadata, correct, keyMeta) {
    this.lines.push(`insert into public.content_units(id,part_id,type,data,display_order,metadata) values(${lit(id)},${lit(partId)},${lit(type)},${jsonLit(data)},${order},${jsonLit(metadata)}) on conflict (id) do nothing;`);
    if (correct !== undefined) {
      this.lines.push(`insert into public.answer_keys(content_unit_id,correct,metadata) values(${lit(id)},${jsonLit(correct)},${jsonLit({ source: SOURCE, ...(keyMeta ?? {}) })}) on conflict (content_unit_id) do nothing;`);
    }
  }
}

// ---------------------------------------------------------------------------
// Builders: each returns the units for one part (stimulus set)

const baseMeta = (task, item, tier) => ({
  toefl_task: task,
  original_slug: item.slug,
  difficulty: item.difficulty ?? null,
  difficulty_basis: 'editorial',
  content_status: 'published',
  content_revision: REVISION,
  ...(tier ? { difficulty_tier: tier } : {}),
});

const mcUnits = (task, item, tier, questions, prefix) =>
  questions.map((q, i) => {
    if (!Array.isArray(q.options) || q.options.length !== 4) problem(item.slug, `question ${i + 1} needs 4 options`);
    if (!LETTERS.includes(q.answer)) problem(item.slug, `question ${i + 1} answer ${q.answer}`);
    return {
      key: `${prefix}:q${i + 1}`,
      type: 'question_single_choice',
      data: { prompt: q.prompt, options: q.options.map((label, j) => ({ id: LETTERS[j], label })) },
      metadata: { ...baseMeta(task, item, tier), question_index: i + 1, ...(q.skill ? { skill: q.skill } : {}) },
      correct: { option_id: q.answer },
      keyMeta: { feedback: { explanation: q.explanation ?? '' } },
    };
  });

const parts = {
  complete_the_words(item, tier) {
    const words = item.text.split(/\s+/).filter(Boolean).length;
    if (words < 60 || words > 110) problem(item.slug, `paragraph has ${words} words`);
    const d = damageParagraph(item.text);
    if (d.blanks.length !== 10) problem(item.slug, `only ${d.blanks.length} damaged words`);
    return {
      name: 'Complete the Words',
      units: [{
        key: `${item.slug}:cw`,
        type: 'question_complete_words',
        data: {
          prompt: 'Fill in the missing letters in the paragraph.',
          text: d.text,
          blanks: d.blanks.map((b) => ({ id: b.id, stem: b.stem, length: b.missing.length })),
          topic: item.topic ?? null,
        },
        metadata: baseMeta('complete_the_words', item, tier),
        correct: {
          blanks: Object.fromEntries(d.blanks.map((b) => [b.id, b.missing.toLowerCase()])),
          stems: Object.fromEntries(d.blanks.map((b) => [b.id, b.stem.toLowerCase()])),
          words: Object.fromEntries(d.blanks.map((b) => [b.id, b.word])),
        },
        keyMeta: { feedback: { explanation: `Full paragraph: ${item.text}` } },
      }],
    };
  },
  read_daily_life(item, tier) {
    if (![2, 3].includes(item.questions?.length)) problem(item.slug, 'needs 2 or 3 questions');
    return {
      name: 'Read in Daily Life',
      units: [
        {
          key: `${item.slug}:text`,
          type: 'reading_passage',
          data: {
            toefl_stimulus: 'daily_life', format: item.format, title: item.title ?? null, heading: item.heading ?? null,
            text: item.body ?? '', ...(item.email ? { email: item.email } : {}), ...(item.messages ? { messages: item.messages } : {}),
            ...(item.table ? { table: item.table } : {}),
          },
          metadata: { ...baseMeta('read_daily_life', item, tier), toefl_task: undefined, toefl_stimulus: 'read_daily_life' },
        },
        ...mcUnits('read_daily_life', item, tier, item.questions, item.slug),
      ],
    };
  },
  read_academic_passage(item, tier) {
    const words = item.text.split(/\s+/).filter(Boolean).length;
    if (words < 160 || words > 240) problem(item.slug, `passage has ${words} words`);
    if (item.questions?.length !== 5) problem(item.slug, 'needs 5 questions');
    return {
      name: 'Read an Academic Passage',
      units: [
        { key: `${item.slug}:text`, type: 'reading_passage', data: { toefl_stimulus: 'academic_passage', title: item.title, text: item.text, subject: item.subject ?? null }, metadata: { ...baseMeta('read_academic_passage', item, tier), toefl_task: undefined, toefl_stimulus: 'read_academic_passage' } },
        ...mcUnits('read_academic_passage', item, tier, item.questions, item.slug),
      ],
    };
  },
  listen_choose_response(item, tier) {
    const file = addAudio(`${item.slug}.mp3`, item.difficulty, [{ voice: item.voice, text: item.utterance }]);
    return {
      name: 'Listen and Choose a Response',
      units: [
        { key: `${item.slug}:audio`, type: 'audio', data: { ...audioRef(file), play_once: true, auto_start: true, toefl_stimulus: 'choose_response', speakers: [item.voice], context: 'Listen and choose the best response.' }, metadata: { toefl_stimulus: 'listen_choose_response', original_slug: item.slug, ...(tier ? { difficulty_tier: tier } : {}) }, correct: { transcript: [{ speaker: 'Speaker', text: item.utterance }] } },
        ...mcUnits('listen_choose_response', item, tier, [{ prompt: 'Choose the best response.', options: item.options, answer: item.answer, explanation: item.explanation }], item.slug),
      ],
    };
  },
  listen_conversation(item, tier) {
    const voices = [...new Set(item.lines.map((l) => l.voice))];
    if (voices.length < 2) problem(item.slug, 'conversation needs two voices');
    const narrator = narratorFor(voices);
    const file = addAudio(`${item.slug}.mp3`, item.difficulty, [{ voice: narrator, text: item.context }, ...item.lines.map((l) => ({ voice: l.voice, text: l.text }))]);
    return listeningSet('Listen to a Conversation', 'listen_conversation', item, tier, file, [{ speaker: 'Narrator', text: item.context }, ...item.lines.map((l) => ({ speaker: l.speaker, text: l.text }))], voices);
  },
  listen_announcement(item, tier) {
    const narrator = narratorFor([item.voice]);
    const file = addAudio(`${item.slug}.mp3`, item.difficulty, [{ voice: narrator, text: item.context }, { voice: item.voice, text: item.text }]);
    return listeningSet('Listen to an Announcement', 'listen_announcement', item, tier, file, [{ speaker: 'Narrator', text: item.context }, { speaker: 'Speaker', text: item.text }], [item.voice]);
  },
  listen_academic_talk(item, tier) {
    if (item.questions?.length !== 4) problem(item.slug, 'needs 4 questions');
    const narrator = narratorFor([item.voice]);
    const file = addAudio(`${item.slug}.mp3`, item.difficulty, [{ voice: narrator, text: item.context }, { voice: item.voice, text: item.text }]);
    return listeningSet('Listen to an Academic Talk', 'listen_academic_talk', item, tier, file, [{ speaker: 'Narrator', text: item.context }, { speaker: 'Speaker', text: item.text }], [item.voice]);
  },
};

function listeningSet(name, task, item, tier, file, transcript, voices) {
  return {
    name,
    units: [
      { key: `${item.slug}:audio`, type: 'audio', data: { ...audioRef(file), play_once: true, auto_start: true, toefl_stimulus: task, speakers: voices, context: item.context }, metadata: { toefl_stimulus: task, original_slug: item.slug, ...(tier ? { difficulty_tier: tier } : {}) }, correct: { transcript } },
      ...mcUnits(task, item, tier, item.questions, item.slug),
    ],
  };
}

const buildSentenceUnit = (item) => {
  const slots = item.frame.filter((f) => f === '_').length;
  if (slots !== item.answer.length) problem(item.slug, 'frame slots != answer length');
  const tiles = item.tiles.map((label, i) => ({ id: `t${i + 1}`, label }));
  const used = new Set();
  const order = item.answer.map((label) => {
    const tile = tiles.find((t) => t.label === label && !used.has(t.id));
    if (!tile) { problem(item.slug, `answer "${label}" missing from tiles`); return ''; }
    used.add(tile.id);
    return tile.id;
  });
  if (tiles.length - item.answer.length > 1) problem(item.slug, 'more than one distractor');
  const sentence = item.frame.map((f) => f).join(' ');
  let slot = 0;
  const full = item.frame.map((f) => (f === '_' ? item.answer[slot++] : f)).join(' ');
  return {
    key: `${item.slug}:bs`,
    type: 'question_build_sentence',
    data: { prompt: 'Make an appropriate sentence.', context: item.context, frame: item.frame, tiles },
    metadata: baseMeta('build_sentence', item),
    correct: { order, tiles: Object.fromEntries(tiles.map((t) => [t.id, t.label])), sentence: full },
    keyMeta: { feedback: { explanation: `Correct sentence: ${full}` }, frame: sentence },
  };
};

const emailUnit = (item) => {
  if (item.goals?.length !== 3) problem(item.slug, 'email needs 3 goals');
  const prompt = `${item.scenario}\n\nWrite an email to ${item.to}. In your email, do the following:\n${item.goals.map((g) => `- ${g}`).join('\n')}\n\nWrite as much as you can and in complete sentences.`;
  return {
    key: `${item.slug}:email`,
    type: 'question_text',
    data: {
      task_type: 'toefl_email', prompt, scenario: item.scenario, to: item.to, to_address: item.to_address ?? null, subject: item.subject,
      goals: item.goals, task_seconds: 420, rows: 12, show_word_count: true, placeholder: 'Write your email here.',
    },
    metadata: baseMeta('write_email', item),
  };
};

const discussionUnit = (item) => {
  const prompt = `Your professor is teaching a class on ${item.course}. Write a post responding to the professor's question. In your response, you should express and support your opinion and make a contribution to the discussion in your own words. An effective response will contain at least 100 words.\n\n${item.professor.name}: ${item.professor.text}\n\n${item.students.map((s) => `${s.name}: ${s.text}`).join('\n\n')}`;
  return {
    key: `${item.slug}:disc`,
    type: 'question_text',
    data: {
      task_type: 'toefl_academic_discussion', prompt, course: item.course, professor: item.professor, students: item.students,
      task_seconds: 600, min_words: 100, rows: 12, show_word_count: true, placeholder: 'Write your post here.',
    },
    metadata: baseMeta('write_academic_discussion', item),
  };
};

const responseSecondsFor = (sentence) => {
  const words = sentence.split(/\s+/).length;
  return words <= 7 ? 8 : words <= 11 ? 10 : 12;
};

const repeatUnits = (item) => {
  if (item.sentences?.length !== 7) problem(item.slug, 'listen and repeat needs 7 sentences');
  return item.sentences.map((sentence, i) => {
    const file = addAudio(`${item.slug}-s${i + 1}.mp3`, 'medium', [{ voice: item.voice, text: sentence }]);
    return {
      key: `${item.slug}:s${i + 1}`,
      type: 'question_speaking_repeat',
      data: { prompt: 'Listen and repeat only once.', scenario: item.scenario, index: i + 1, of: item.sentences.length, audio: audioRef(file), response_seconds: responseSecondsFor(sentence) },
      metadata: { ...baseMeta('listen_repeat', item), sentence_index: i + 1 },
      correct: { text: sentence },
    };
  });
};

const interviewUnits = (item) => {
  if (item.questions?.length !== 4) problem(item.slug, 'interview needs 4 questions');
  return item.questions.map((question, i) => {
    const file = addAudio(`${item.slug}-q${i + 1}.mp3`, 'medium', [{ voice: item.voice, text: question }]);
    return {
      key: `${item.slug}:q${i + 1}`,
      type: 'question_speaking_interview',
      data: { prompt: 'Answer the interviewer\'s question.', scenario: item.scenario, index: i + 1, of: item.questions.length, audio: audioRef(file), response_seconds: 45 },
      metadata: { ...baseMeta('take_interview', item), question_index: i + 1 },
      correct: { question_text: question },
    };
  });
};

// ---------------------------------------------------------------------------
// Assembly

const pick = (list, use) => list.filter((item) => item.use === use);
const emitParts = (sql, sectionKey, sectionId, partList) => {
  partList.forEach((p, pi) => {
    const partId = uuid(`${sectionKey}:part:${pi + 1}:${p.units[0].key}`);
    sql.part(partId, sectionId, p.name, pi + 1, { toefl_task: p.task ?? null, ...(p.tier ? { difficulty_tier: p.tier } : {}), ...(p.task_seconds ? { task_seconds: p.task_seconds } : {}) });
    p.units.forEach((u, ui) => {
      const metadata = Object.fromEntries(Object.entries(u.metadata ?? {}).filter(([, v]) => v !== undefined));
      sql.unit(uuid(`unit:${u.key}`), partId, u.type, ui + 1, u.data, metadata, u.correct, u.keyMeta);
    });
  });
};

const readingModule = (use, tier) => [
  ...pick(reading.complete_the_words, use).map((i) => ({ ...parts.complete_the_words(i, tier), task: 'complete_the_words', tier })),
  ...pick(reading.read_daily_life, use).map((i) => ({ ...parts.read_daily_life(i, tier), task: 'read_daily_life', tier })),
  ...pick(reading.read_academic_passage, use).map((i) => ({ ...parts.read_academic_passage(i, tier), task: 'read_academic_passage', tier })),
];
const listeningModule = (use, tier) => [
  ...pick(listening.listen_choose_response, use).map((i) => ({ ...parts.listen_choose_response(i, tier), task: 'listen_choose_response', tier })),
  ...pick(listening.listen_conversation, use).map((i) => ({ ...parts.listen_conversation(i, tier), task: 'listen_conversation', tier })),
  ...pick(listening.listen_announcement, use).map((i) => ({ ...parts.listen_announcement(i, tier), task: 'listen_announcement', tier })),
  ...pick(listening.listen_academic_talk, use).map((i) => ({ ...parts.listen_academic_talk(i, tier), task: 'listen_academic_talk', tier })),
];

const countItems = (partList) => partList.reduce((n, p) => n + p.units.reduce((m, u) => m + (u.type === 'question_complete_words' ? u.data.blanks.length : u.type.startsWith('question_') ? 1 : 0), 0), 0);

export const TEST_EXPERIENCE_ID = uuid('experience:test-1');
export const PRACTICE_EXPERIENCE_ID = uuid('experience:practice-bank');

const buildTest = () => {
  const sql = new Sql();
  const exp = TEST_EXPERIENCE_ID;
  sql.experience(exp, 'TOEFL iBT Practice Test 1 (2026 format)', 0, {
    format: 'toefl-2026', catalog: 'full_test', launch_pack: 'toefl_2026_v1', content_revision: REVISION,
    duration_seconds: 21 * 60 + 9 * 60 + 18 * 60 + 11 * 60 + 23 * 60 + 8 * 60, original_content: true,
    adaptive: { router_threshold: 0.6, modules: 'router + lower/upper' },
  });
  const ids = {
    readingRouter: uuid('test-1:section:reading-router'), readingSecond: uuid('test-1:section:reading-second'),
    listeningRouter: uuid('test-1:section:listening-router'), listeningSecond: uuid('test-1:section:listening-second'),
    writing: uuid('test-1:section:writing'), speaking: uuid('test-1:section:speaking'),
  };
  const common = { format: 'toefl-2026', duration_mode: 'fixed' };
  const rRouter = readingModule('test:router');
  const rSecond = [...readingModule('test:lower', 'standard'), ...readingModule('test:upper', 'advanced')];
  const lRouter = listeningModule('test:router');
  const lSecond = [...listeningModule('test:lower', 'standard'), ...listeningModule('test:upper', 'advanced')];
  const counts = {
    reading_router: countItems(rRouter), reading_lower: countItems(rSecond.filter((p) => p.tier === 'standard')), reading_upper: countItems(rSecond.filter((p) => p.tier === 'advanced')),
    listening_router: countItems(lRouter), listening_lower: countItems(lSecond.filter((p) => p.tier === 'standard')), listening_upper: countItems(lSecond.filter((p) => p.tier === 'advanced')),
  };
  if (counts.reading_router + counts.reading_lower !== 50 || counts.reading_router + counts.reading_upper !== 50) problem('test-1', `reading items ${JSON.stringify(counts)}`);
  if (counts.listening_router + counts.listening_lower !== 47 || counts.listening_router + counts.listening_upper !== 47) problem('test-1', `listening items ${JSON.stringify(counts)}`);

  sql.section(ids.readingRouter, exp, 'Reading: Module 1', 1, { ...common, type: 'reading', toefl_module: 'router', duration_seconds: 21 * 60, item_count: counts.reading_router });
  emitParts(sql, 'test-1:reading-router', ids.readingRouter, rRouter);
  sql.section(ids.readingSecond, exp, 'Reading: Module 2', 2, {
    ...common, type: 'reading', toefl_module: 'second', duration_seconds: 9 * 60, duration_seconds_by_tier: { standard: 9 * 60, advanced: 9 * 60 },
    adaptive_source_section_id: ids.readingRouter, adaptive_threshold: 0.6, item_count: counts.reading_lower,
  });
  emitParts(sql, 'test-1:reading-second', ids.readingSecond, rSecond);
  sql.section(ids.listeningRouter, exp, 'Listening: Module 1', 3, { ...common, type: 'listening', toefl_module: 'router', duration_seconds: 18 * 60, item_count: counts.listening_router });
  emitParts(sql, 'test-1:listening-router', ids.listeningRouter, lRouter);
  sql.section(ids.listeningSecond, exp, 'Listening: Module 2', 4, {
    ...common, type: 'listening', toefl_module: 'second', duration_seconds: 11 * 60, duration_seconds_by_tier: { standard: 7 * 60, advanced: 11 * 60 },
    adaptive_source_section_id: ids.listeningRouter, adaptive_threshold: 0.6, item_count: counts.listening_lower,
  });
  emitParts(sql, 'test-1:listening-second', ids.listeningSecond, lSecond);

  const bs = pick(ws.build_sentence, 'test');
  if (bs.length !== 10) problem('test-1', `build a sentence count ${bs.length}`);
  sql.section(ids.writing, exp, 'Writing', 5, { ...common, type: 'writing', duration_seconds: 23 * 60, item_count: 12 });
  emitParts(sql, 'test-1:writing', ids.writing, [
    { name: 'Build a Sentence', task: 'build_sentence', task_seconds: 6 * 60, units: bs.map(buildSentenceUnit) },
    { name: 'Write an Email', task: 'write_email', task_seconds: 7 * 60, units: pick(ws.write_email, 'test').map(emailUnit) },
    { name: 'Write for an Academic Discussion', task: 'write_academic_discussion', task_seconds: 10 * 60, units: pick(ws.write_academic_discussion, 'test').map(discussionUnit) },
  ]);
  sql.section(ids.speaking, exp, 'Speaking', 6, { ...common, type: 'speaking', duration_seconds: 8 * 60, item_count: 11 });
  emitParts(sql, 'test-1:speaking', ids.speaking, [
    { name: 'Listen and Repeat', task: 'listen_repeat', units: pick(ws.listen_repeat, 'test').flatMap(repeatUnits) },
    { name: 'Take an Interview', task: 'take_interview', units: pick(ws.take_interview, 'test').flatMap(interviewUnits) },
  ]);
  return { sql, counts, ids };
};

export const PRACTICE_TASKS = [
  { task: 'complete_the_words', name: 'Complete the Words', type: 'reading', minutes: 25 },
  { task: 'read_daily_life', name: 'Read in Daily Life', type: 'reading', minutes: 25 },
  { task: 'read_academic_passage', name: 'Read an Academic Passage', type: 'reading', minutes: 50 },
  { task: 'listen_choose_response', name: 'Listen and Choose a Response', type: 'listening', minutes: 12 },
  { task: 'listen_conversation', name: 'Listen to a Conversation', type: 'listening', minutes: 22 },
  { task: 'listen_announcement', name: 'Listen to an Announcement', type: 'listening', minutes: 20 },
  { task: 'listen_academic_talk', name: 'Listen to an Academic Talk', type: 'listening', minutes: 45 },
  { task: 'build_sentence', name: 'Build a Sentence', type: 'writing', minutes: 9 },
  { task: 'write_email', name: 'Write an Email', type: 'writing', minutes: 30 },
  { task: 'write_academic_discussion', name: 'Write for an Academic Discussion', type: 'writing', minutes: 42 },
  { task: 'listen_repeat', name: 'Listen and Repeat', type: 'speaking', minutes: 10 },
  { task: 'take_interview', name: 'Take an Interview', type: 'speaking', minutes: 12 },
];

const buildPractice = () => {
  const sql = new Sql();
  const exp = PRACTICE_EXPERIENCE_ID;
  sql.experience(exp, 'TOEFL iBT 2026 Task Practice', 30, {
    format: 'toefl-2026', catalog: 'practice_bank_2026', content_revision: REVISION, original_content: true,
    practice_tasks: PRACTICE_TASKS.map((t) => t.task),
  });
  const counts = {};
  PRACTICE_TASKS.forEach((t, si) => {
    const sectionId = uuid(`practice:section:${t.task}`);
    let partList;
    if (parts[t.task]) {
      const source = t.task.startsWith('listen_') ? listening[t.task] : reading[t.task];
      partList = pick(source, 'practice').map((i) => ({ ...parts[t.task](i, null), task: t.task }));
    } else if (t.task === 'build_sentence') {
      partList = [{ name: 'Build a Sentence', task: t.task, units: pick(ws.build_sentence, 'practice').map(buildSentenceUnit) }];
    } else if (t.task === 'write_email') {
      partList = pick(ws.write_email, 'practice').map((i, n) => ({ name: `Write an Email ${n + 1}`, task: t.task, task_seconds: 420, units: [emailUnit(i)] }));
    } else if (t.task === 'write_academic_discussion') {
      partList = pick(ws.write_academic_discussion, 'practice').map((i, n) => ({ name: `Academic Discussion ${n + 1}`, task: t.task, task_seconds: 600, units: [discussionUnit(i)] }));
    } else if (t.task === 'listen_repeat') {
      partList = pick(ws.listen_repeat, 'practice').map((i, n) => ({ name: `Listen and Repeat ${n + 1}`, task: t.task, units: repeatUnits(i) }));
    } else {
      partList = pick(ws.take_interview, 'practice').map((i, n) => ({ name: `Take an Interview ${n + 1}`, task: t.task, units: interviewUnits(i) }));
    }
    const sets = partList.length;
    const itemTotal = t.task === 'build_sentence' ? partList[0].units.length : sets;
    counts[t.task] = itemTotal;
    const machine = !['write_email', 'write_academic_discussion', 'listen_repeat', 'take_interview'].includes(t.task);
    if (machine && itemTotal < 10) problem(t.task, `only ${itemTotal} practice items`);
    sql.section(sectionId, exp, t.name, si + 1, {
      format: 'toefl-2026', type: t.type, practice_task: t.task, duration_seconds: t.minutes * 60, duration_mode: 'fixed', item_sets: itemTotal,
    });
    emitParts(sql, `practice:${t.task}`, sectionId, partList);
  });
  return { sql, counts };
};

// ---------------------------------------------------------------------------

const test = buildTest();
const practice = buildPractice();

// Unique slugs across all sources.
const slugs = new Map();
for (const file of [reading, listening, ws]) for (const list of Object.values(file)) for (const item of list) {
  if (slugs.has(item.slug)) problem(item.slug, 'duplicate slug');
  slugs.set(item.slug, true);
}

if (problems.length) {
  console.error(`TOEFL 2026 content problems (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

fs.mkdirSync(audioDir, { recursive: true });
fs.writeFileSync(path.join(contentDir, 'audio-manifest.json'), `${JSON.stringify({ voices: VOICES, files: manifest }, null, 1)}\n`);

if (CHECK_ONLY) {
  console.log(`ok: ${manifest.length} audio files, test ${JSON.stringify(test.counts)}, practice ${JSON.stringify(practice.counts)}`);
  process.exit(0);
}

const wrap = (title, body) => [
  `-- ${title}`,
  '-- Generated by scripts/content/toefl-sim-2026.mjs from content/toefl-2026/*.json (original Schood content).',
  '-- Idempotent: deterministic ids, on conflict do nothing. Audio is served by the simulator at /media/toefl-2026/.',
  'begin;',
  "set local lock_timeout='5s';",
  "set local statement_timeout='60s';",
  `do $$ begin if not exists(select 1 from public.products where id='${PRODUCT_ID}') then raise exception 'TOEFL iBT Simulator product missing'; end if; end $$;`,
  ...body,
  'commit;',
  '',
].join('\n');

fs.writeFileSync(path.join(migrationsDir, '20261028120100_toefl_2026_full_test.sql'), wrap('TOEFL iBT 2026 format: Practice Test 1 (router + lower/upper modules, Writing, Speaking).', test.sql.lines));
fs.writeFileSync(path.join(migrationsDir, '20261028120200_toefl_2026_practice_bank.sql'), wrap('TOEFL iBT 2026 format: single-task practice bank (one section per task type).', practice.sql.lines));
console.log(`wrote migrations; ${manifest.length} audio files; test ${JSON.stringify(test.counts)}; practice ${JSON.stringify(practice.counts)}`);
