import { CLASS, centreFixture, createCentre, equal, ID, invite, ok, streamText } from './testing.ts';

// C2 groups and Student Assistant rules (`centre_rules`), T7 teacher assistant over
// Academy classes, the assistant hand-off for web and Telegram, and C6 insights.

async function setup() {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'admin', ['tok-office'], 1);
  await invite(f, ws, 'teacher', ['tok-t1', 'tok-t2']);
  await invite(f, ws, 'student', ['tok-s1', 'tok-s2', 'tok-s3', 'tok-s4', 'tok-s5', 'tok-s6']);
  return { f, ws };
}

Deno.test('groups: the office makes them, the group’s teacher sets the rules, students only', async () => {
  const { f, ws } = await setup();
  equal((await f.json('POST', 'centre/groups', { token: 'tok-t1', workspace: ws, body: { name: '5B' } })).status, 403, 'teachers do not create groups');
  const created = await f.json('POST', 'centre/groups', { token: 'tok-office', workspace: ws, body: { name: '5B', level: 'B1', teacher_ids: [ID.t1] } });
  equal([created.status, created.body.group.hint_policy], [200, 'during_homework'], 'hints during homework by default');
  equal((await f.json('POST', 'centre/groups', { token: 'tok-office', workspace: ws, body: { name: 'X', teacher_ids: [ID.s1] } })).status, 400, 'teachers must be staff');
  const id = created.body.group.id;
  const rules = await f.json('PATCH', 'centre/groups', { token: 'tok-t1', workspace: ws, body: { id, hint_policy: 'always', focus_topics: ['present perfect', 'articles'], note: 'Exam in two weeks.' } });
  equal([rules.status, rules.body.group.focus_topics], [200, ['present perfect', 'articles']], 'the group’s teacher sets rules');
  equal((await f.json('PATCH', 'centre/groups', { token: 'tok-t2', workspace: ws, body: { id, hint_policy: 'off' } })).status, 403, 'another teacher cannot');
  equal((await f.json('PATCH', 'centre/groups', { token: 'tok-t1', workspace: ws, body: { id, name: 'Renamed' } })).status, 403, 'teachers do not rename');
  equal((await f.json('PUT', 'centre/group-members', { token: 'tok-t1', workspace: ws, body: { group_id: id, user_ids: [ID.s1, ID.t2] } })).status, 400, 'only students join a group');
  equal((await f.json('PUT', 'centre/group-members', { token: 'tok-t1', workspace: ws, body: { group_id: id, user_ids: [ID.s1, ID.s2] } })).body.members, 2);
  const list = await f.json('GET', 'centre/groups', { token: 'tok-t2', workspace: ws });
  equal([list.body.groups[0].members, list.body.groups[0].can_edit, list.body.can_create], [2, false, false], 'listed for all staff');

  // The student's rules, exactly as the model sees them.
  const context = await f.json('GET', 'core/context', { token: 'tok-s1', workspace: ws, query: { kind: 'centre_rules' } });
  const data = context.body.blocks[0].data;
  equal([data.hint_policy, data.focus_topics, data.groups[0].teacher_note], ['always', ['present perfect', 'articles'], 'Exam in two weeks.'], 'centre_rules for the student');
  equal(data.homework, { default: 'hints_only', assignments: {} }, 'the learner homework helper’s shape: hints only by default');
  const ungrouped = await f.json('GET', 'core/context', { token: 'tok-s3', workspace: ws, query: { kind: 'centre_rules' } });
  equal([ungrouped.body.blocks[0].data.hint_policy, ungrouped.body.blocks[0].data.homework.default], ['during_homework', 'hints_only'], 'without a group, the centre default applies');

  // Per-homework rules from the group's teacher, read from Academy with their token.
  await f.store.table('groups').update({ id }, { academy_classroom_id: CLASS.b5 });
  const homework = await f.json('GET', 'centre/assignment-rules', { token: 'tok-t1', workspace: ws, query: { group_id: id } });
  equal([homework.body.default, homework.body.assignments.map((row: { title: string }) => row.title)], ['hints_only', ['Present perfect worksheet', 'Unit test']], 'the group’s Academy homework');
  const test = homework.body.assignments[1].id, sheet = homework.body.assignments[0].id;
  equal((await f.json('PUT', 'centre/assignment-rules', { token: 'tok-t2', workspace: ws, body: { group_id: id, assignment_id: test, rule: 'explain' } })).status, 403, 'only the group’s teacher');
  await f.json('PUT', 'centre/assignment-rules', { token: 'tok-t1', workspace: ws, body: { group_id: id, assignment_id: test, rule: 'off', title: 'Unit test' } });
  await f.json('PUT', 'centre/assignment-rules', { token: 'tok-t1', workspace: ws, body: { group_id: id, assignment_id: sheet, rule: 'explain' } });
  await f.json('PATCH', 'centre/groups', { token: 'tok-t1', workspace: ws, body: { id, homework_rule: 'explain' } });
  const withRules = (await f.json('GET', 'core/context', { token: 'tok-s1', workspace: ws, query: { kind: 'centre_rules' } })).body.blocks[0].data.homework;
  equal(withRules, { default: 'explain', assignments: { [test]: 'off', [sheet]: 'explain' } }, 'group default and per-homework overrides');
  await f.json('PUT', 'centre/assignment-rules', { token: 'tok-t1', workspace: ws, body: { group_id: id, assignment_id: sheet, rule: null } });
  await f.json('PATCH', 'centre/groups', { token: 'tok-t1', workspace: ws, body: { id, homework_rule: null } });
  equal((await f.json('GET', 'core/context', { token: 'tok-s1', workspace: ws, query: { kind: 'centre_rules' } })).body.blocks[0].data.homework, { default: 'hints_only', assignments: { [test]: 'off' } }, 'cleared rules fall back');

  // The Student Assistant reads the rules and answers under the centre's name.
  await f.json('PATCH', 'core/settings', { workspace: ws, body: { branding: { assistant_name: 'Registan Buddy', primary_color: '#2f6f4f' } } });
  f.model(/study assistant/, 'Hint: which tense goes with “yesterday”?');
  const reply = await streamText(await f.call('POST', 'core/chat', { token: 'tok-s1', workspace: ws, body: { client_message_id: crypto.randomUUID(), specialist: 'student_assistant', message: 'Just give me the answer to exercise 3' } }));
  ok(reply.some((event) => event.event === 'delta'), 'answered');
  const system = f.upstream.at(-1)!.system;
  ok(system.includes('You are Registan Buddy') && system.includes('"hint_policy":"always"') && system.includes('never the final answers'), 'branded, with the group rule');
  equal(reply[0].data.context.map((block: { kind: string }) => block.kind), ['centre_rules'], 'the student sees which context was used');

  // Web and Telegram find the student's branded assistant.
  const where = await f.json('GET', 'centre/student-assistant', { token: 'tok-s1' });
  equal([where.body.centres[0].assistant_name, where.body.centres[0].specialist, where.body.centres[0].primary_color], ['Registan Buddy', 'student_assistant', '#2f6f4f']);
  equal((await f.json('GET', 'centre/student-assistant', { token: 'tok-t1' })).body.centres, [], 'staff are not listed as students');
});

Deno.test('groups sync from Academy classrooms, matching students by their Schood account', async () => {
  const { f, ws } = await setup();
  const synced = await f.json('POST', 'centre/groups-sync', { token: 'tok-office', workspace: ws });
  equal([synced.body.classrooms, synced.body.created, synced.body.linked], [2, 2, 7], '5B (5 students) and IELTS evening (2)');
  const again = await f.json('POST', 'centre/groups-sync', { token: 'tok-office', workspace: ws });
  equal([again.body.created, again.body.linked], [0, 0], 'idempotent');
  equal((await f.json('POST', 'centre/groups-sync', { token: 'tok-t1', workspace: ws })).status, 403, 'office only');
});

Deno.test('T7: the teacher assistant answers from the teacher’s own Academy classes, read with their token', async () => {
  const { f, ws } = await setup();
  const classes = await f.json('GET', 'centre/my-classes', { token: 'tok-t1', workspace: ws });
  const b5 = classes.body.classes[0];
  equal([classes.body.classes.length, b5.name, b5.assignments_due], [1, '5B', 2], 'Academy scopes the teacher to 5B; two homeworks are due');
  equal(b5.students.filter((student: { missed_homework: number }) => student.missed_homework >= 2).map((student: { name: string }) => student.name), ['Student 1'], 'who missed two homeworks');
  equal(b5.students.find((student: { name: string }) => student.name === 'Student 1').absences_30d, 2, 'absences');
  f.model(/help a teacher of this centre/, 'Student 1 missed two homeworks in 5B.');
  const reply = await streamText(await f.call('POST', 'core/chat', { token: 'tok-t1', workspace: ws, body: { client_message_id: crypto.randomUUID(), specialist: 'teacher_assistant', message: 'Who missed two homeworks in 5B?' } }));
  equal(reply[0].data.context.map((block: { kind: string }) => block.kind), ['teacher_classes'], 'class data was used');
  ok(f.upstream.at(-1)!.system.includes('"missed_homework":2') && f.upstream.at(-1)!.system.includes('read-only'), 'read-only and grounded');
  ok(f.academy.calls.filter((call) => call.action === 'gradebook').every((call) => call.token === 'tok-t1' || call.token === 'tok-owner'), 'with the teacher’s own token');
  const student = await f.call('POST', 'core/chat', { token: 'tok-s1', workspace: ws, body: { client_message_id: crypto.randomUUID(), specialist: 'teacher_assistant', message: 'hi' } });
  equal(student.status, 404, 'students do not get the teacher assistant');
  equal(f.memory.ledger.filter((row) => row.kind === 'charge' && row.creditKey === 'teacher_assistant.reply').length, 1, 'one credit from the pool');
});

Deno.test('C6 insights: topic counts per group of five or more, never text, topics only when two students asked', async () => {
  const { f, ws } = await setup();
  const big = (await f.json('POST', 'centre/groups', { token: 'tok-office', workspace: ws, body: { name: '5B', teacher_ids: [ID.t1] } })).body.group.id;
  const small = (await f.json('POST', 'centre/groups', { token: 'tok-office', workspace: ws, body: { name: 'Tiny', teacher_ids: [ID.t2] } })).body.group.id;
  await f.json('PUT', 'centre/group-members', { token: 'tok-office', workspace: ws, body: { group_id: big, user_ids: [ID.s1, ID.s2, ID.s3, ID.s4, ID.s5] } });
  await f.json('PUT', 'centre/group-members', { token: 'tok-office', workspace: ws, body: { group_id: small, user_ids: [ID.s5, ID.s6] } });
  await f.store.table('groups').update({ id: big }, { academy_classroom_id: CLASS.b5 });
  const ask = async (user: string, texts: string[]) => {
    const thread = await f.memory.repository.createThread({ workspaceId: ws, userId: user, specialistKey: 'student_assistant', pageId: null, title: 't' });
    for (const text of texts) await f.memory.repository.addMessage({ threadId: thread.id, role: 'user', content: text, status: 'complete', clientMessageId: crypto.randomUUID(), creditKey: null, credits: 0, callId: null, chargeId: null, contextKinds: [], errorCode: null });
  };
  await ask(ID.s1, ['When do I use the present perfect?', 'What does “reluctant” mean?']);
  await ask(ID.s2, ['Present perfect or past simple here?']);
  await ask(ID.s3, ['Qaysi zamon ishlatiladi?', 'IELTS essay structure please']);
  await ask(ID.s4, ['My secret diary entry about my family']);
  const computed = await f.json('POST', 'centre/insights', { token: 'tok-office', workspace: ws });
  equal([computed.status, computed.body.groups], [200, 1], 'only the group of five is counted');
  const view = await f.json('GET', 'centre/insights', { token: 'tok-office', workspace: ws, query: { weak: '1' } });
  const b5 = view.body.groups.find((group: { name: string }) => group.name === '5B'), tiny = view.body.groups.find((group: { name: string }) => group.name === 'Tiny');
  equal(b5.topics.map((topic: { topic: string; students: number }) => [topic.topic, topic.students]), [['grammar.tenses', 3]], 'tenses asked by three students; one-student topics hidden');
  equal([tiny.shown, tiny.topics], [false, []], 'a group under five is not shown');
  equal(b5.weak_spots[0], { tag: 'present perfect', open: 6, total: 11 }, 'Academy weak spots per group');
  const stored = JSON.stringify(await f.store.table('insights').list({ workspace_id: ws }));
  ok(!stored.includes('diary') && !stored.includes('reluctant') && !stored.includes(ID.s1), 'no text and no person is stored');
  const teacher = await f.json('GET', 'centre/insights', { token: 'tok-t2', workspace: ws });
  equal(teacher.body.groups.map((group: { name: string }) => group.name), ['Tiny'], 'teachers see their own groups');
  equal((await f.json('GET', 'centre/insights', { token: 'tok-s1', workspace: ws })).status, 403, 'students never see insights');
});
