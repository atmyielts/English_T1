import { equal, ok, personal } from '../fixture.test.ts';
import { deterministicSignals, overallFor, RUBRICS } from './marking.ts';
import type { Script } from './store.ts';
import { promptOf, reply, teacherFixture } from './test-kit.ts';

// T3 marking, T14 speaking marking from recordings, T15 writing signals, T4 feedback.

const T = 'tok-teacher-plan';
const ESSAY = 'Some people believe that public transport should be free for everyone in big cities. In my opinion this is a good idea because it reduces traffic and pollution, and it helps families with low incomes. However, the government must find money to pay for buses and metro lines, which may mean higher taxes for everyone who lives in the city.';
const MARKS = {
  criteria: [
    { id: 'task_response', mark: 6, comment: 'Clear position.', evidence: ['In my opinion this is a good idea'] },
    { id: 'coherence_cohesion', mark: 6.4, comment: 'Logical.', evidence: ['However'] },
    { id: 'lexical_resource', mark: 7, comment: 'Good range.', evidence: ['low incomes'] },
    { id: 'grammatical_range_accuracy', mark: 6, comment: 'Mostly accurate.', evidence: ['which may mean'] },
  ],
  comments: 'A solid answer that needs more development.', fixes: ['Develop each idea with an example.', 'Add a conclusion.', 'Use a wider range of linking words.'], level_estimate: 'B2',
};

Deno.test('marking: rubric drafts with evidence, teacher-confirmed final marks, photo scripts', async () => {
  const f = teacherFixture();
  try {
    let photoSeen = 0;
    f.setProvider(async (request) => {
      const { user, images } = await promptOf(request);
      if (images) { photoSeen = images; return reply({ text: ESSAY, ...MARKS }); }
      ok(user.includes('<user_message>'), 'the script is user data');
      return reply(MARKS);
    });
    const ws = await personal(f, T);
    equal((await f.json('POST', 'teacher/marking', { token: 'tok-plus', body: { title: 'x', rubric: 'ielts_task2' } })).body.code, 'plan_required');
    const batch = (await f.json('POST', 'teacher/marking', { token: T, body: { title: '10A essays', rubric: 'ielts_task2', task: 'Should public transport be free?', level: 'B2', feedback_language: 'uz' } })).body.batch;
    const script = (await f.json('POST', 'teacher/marking-script', { token: T, body: { batch_id: batch.id, student_label: 'Aziz', source: 'typed', text: ESSAY } })).body.script;
    const marked = await f.json('POST', 'teacher/marking-run', { token: T, body: { script_id: script.id } });
    equal(marked.status, 200, JSON.stringify(marked.body));
    equal(marked.body.script.status, 'marked');
    equal(marked.body.script.draft.criteria.map((entry: { mark: number }) => entry.mark), [6, 6, 7, 6], 'marks snap to the rubric scale');
    equal(marked.body.script.draft.overall, { value: 6.5, scale: 'band 0–9' }, 'IELTS overall: mean, to the half band');
    equal(marked.body.script.draft.fixes.length, 3, 'the top three fixes');
    equal(marked.body.credits, 4);
    // The teacher changes a mark and confirms: only then is it final.
    const confirmed = await f.json('PATCH', 'teacher/marking-script', { token: T, body: { id: script.id, final: { marks: { task_response: 7, coherence_cohesion: 6, lexical_resource: 7, grammatical_range_accuracy: 6 }, comments: 'Well argued.', fixes: MARKS.fixes }, confirm: true } });
    equal(confirmed.body.script.status, 'confirmed');
    equal(confirmed.body.script.final.overall.value, 6.5);
    equal((await f.json('POST', 'teacher/marking-run', { token: T, body: { script_id: script.id } })).body.code, 'already_confirmed');

    // A photographed script: read and marked in one vision call.
    const photo = (await f.json('POST', 'teacher/marking-script', { token: T, body: { batch_id: batch.id, student_label: 'Malika', source: 'photo' } })).body.script;
    equal((await f.json('POST', 'teacher/marking-run', { token: T, body: { script_id: photo.id } })).body.code, 'invalid_request', 'the photo is needed');
    const fromPhoto = await f.json('POST', 'teacher/marking-run', { token: T, body: { script_id: photo.id, images: [`data:image/jpeg;base64,${'/9j/4AAQ'.repeat(30)}`] } });
    equal([fromPhoto.body.script.status, fromPhoto.body.script.text.slice(0, 20), photoSeen], ['marked', ESSAY.slice(0, 20), 1]);

    const list = await f.json('GET', 'teacher/marking', { token: T });
    equal([list.body.batches[0].scripts, list.body.batches[0].confirmed], [2, 1]);
    equal(f.memory.ledger.filter((row) => row.workspaceId === ws && row.kind === 'charge').map((row) => row.delta), [-4, -4]);
  } finally {
    f.reset();
  }
});

Deno.test('speaking marking: recordings wait for a speech provider; typed transcripts work now', async () => {
  const f = teacherFixture();
  try {
    f.setProvider(() => reply({ ...MARKS, criteria: [
      { id: 'fluency_coherence', mark: 6, comment: 'Some pauses.', evidence: ['erm'] }, { id: 'lexical_resource', mark: 6, comment: 'Adequate.', evidence: ['nice'] },
      { id: 'grammatical_range_accuracy', mark: 5, comment: 'Errors.', evidence: ['he go'] }, { id: 'pronunciation', mark: 6, comment: 'Clear.', evidence: ['city'] },
    ] }));
    const ws = await personal(f, T);
    const batch = (await f.json('POST', 'teacher/marking', { token: T, body: { title: 'Part 2', rubric: 'ielts_speaking' } })).body.batch;
    const audio = new Uint8Array(4000).fill(7);
    const recording = await f.call('POST', `teacher/marking-audio?batch_id=${batch.id}&student_label=Aziz&mime=audio/webm`, { token: T, body: audio as unknown as string, headers: { 'content-type': 'audio/webm' } });
    const refused = await recording.json();
    equal([recording.status, refused.code], [503, 'ai_unavailable'], 'no speech route is set up yet');
    equal(f.memory.ledger.filter((row) => row.workspaceId === ws && row.kind === 'charge').length, 0, 'nothing charged');
    const typed = (await f.json('POST', 'teacher/marking-script', { token: T, body: { batch_id: batch.id, student_label: 'Aziz', source: 'transcript', text: 'I want to talk about my favourite city, it is Samarkand, he go there every summer with my family and erm it is nice.' } })).body.script;
    const marked = await f.json('POST', 'teacher/marking-run', { token: T, body: { script_id: typed.id } });
    equal(marked.body.script.draft.overall.value, 6, 'band per criterion and the overall');
    equal(marked.body.credits, 4, 'speaking.marking');
  } finally {
    f.reset();
  }
});

Deno.test('writing signals: Homework OS rules, an explain-it check, never an accusation', async () => {
  const f = teacherFixture();
  try {
    f.setProvider(() => reply({ observations: [{ kind: 'level_jump', note: 'Vocabulary well above B1.', quote: 'ubiquitous' }, { kind: 'ai_written', note: 'nope' }], explain_it: ['What does "low incomes" mean?', 'Why did you choose buses?', 'How does paragraph two link to the first?'] }));
    await personal(f, T);
    const batch = (await f.json('POST', 'teacher/marking', { token: T, body: { title: 'Essays', rubric: 'general_writing', level: 'B1' } })).body.batch;
    const first = (await f.json('POST', 'teacher/marking-script', { token: T, body: { batch_id: batch.id, student_label: 'Aziz', source: 'typed', text: ESSAY } })).body.script;
    await f.json('POST', 'teacher/marking-script', { token: T, body: { batch_id: batch.id, student_label: 'Bobur', source: 'pasted', text: `${ESSAY} Thank you.`, meta: { pasted_chars: ESSAY.length } } });
    const checked = await f.json('POST', 'teacher/marking-signals', { token: T, body: { script_id: first.id } });
    equal(checked.status, 200, JSON.stringify(checked.body));
    const signals = checked.body.script.signals;
    equal(signals.signals.map((signal: { signal: string; severity: string }) => [signal.signal, signal.severity]), [['similar_text', 'review'], ['level_jump', 'info']], 'only Homework OS-style signals; no "AI-written" verdict');
    equal(signals.explain_it.length, 3);
    ok(!JSON.stringify(signals).includes('probability'), 'no likelihood score');
    equal(checked.body.credits, 1);
  } finally {
    f.reset();
  }
});

Deno.test('signal and score rules, no model', () => {
  const base = { batchId: 'b', workspaceId: 'w', source: 'typed', draft: null, final: null, signals: null, status: 'new', errorCode: null, confirmedBy: null, confirmedAt: null, createdAt: '', updatedAt: '' } as const;
  const script = (id: string, text: string, meta: Record<string, unknown> = {}): Script => ({ ...base, id, studentLabel: id, text, meta });
  equal(deterministicSignals(script('a', ESSAY), [script('b', 'A completely different short answer about cats and dogs that does not match at all in any way whatsoever, really not.')]), []);
  equal(deterministicSignals(script('a', ESSAY, { pasted_chars: ESSAY.length, typing_ms: 5_000 }), []).map((signal) => signal.signal), ['large_paste', 'fast_typing']);
  equal(overallFor(RUBRICS.multilevel_writing, { task11: 4, task12: 4.5, part2: 5 }), { value: 64, scale: '0–75' }, 'Multilevel raw 13.5 reads the Agency table: 64');
  equal(overallFor(RUBRICS.toefl_writing, { task: 4, organisation: 4.5, language: 5 }), { value: 4.5, scale: 'band 1–6' });
});

Deno.test('feedback comments come from the teacher\'s marks and notes only', async () => {
  const f = teacherFixture();
  try {
    let prompt = '';
    f.setProvider(async (request) => { prompt = (await promptOf(request)).user; return reply({ comment: 'Aziz worked steadily this term and his reading improved. Next term, focus on writing longer answers with examples.' }); });
    await personal(f, T);
    equal((await f.json('POST', 'teacher/feedback', { token: T, body: { purpose: 'report_card', student_label: 'Aziz' } })).body.code, 'invalid_request', 'something to write from');
    const out = await f.json('POST', 'teacher/feedback', { token: T, body: { purpose: 'report_card', student_label: 'Aziz', language: 'ru', marks: [{ what: 'Reading mock', mark: '6.5' }], notes: 'Hands in homework late sometimes.' } });
    equal([out.status, out.body.credits], [200, 1]);
    ok(prompt.includes('Russian') && prompt.includes('Reading mock'), 'the marks reach the model as data');
  } finally {
    f.reset();
  }
});
