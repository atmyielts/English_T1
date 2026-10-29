import { equal, fixture, ID, ok, streamOf } from './fixture.test.ts';

// Specialist overrides (core/specialists) and the admin console's workspace
// switches and audit log (admin/workspaces, admin/audit).

const chat = (body: Record<string, unknown>) => ({ client_message_id: crypto.randomUUID(), ...body });

Deno.test('owners and admins tailor assistants without widening what the code allows', async () => {
  const f = fixture();
  const centre = f.memory.seed.centre({ name: 'Registan Learning Centre', ownerId: ID.owner });
  f.memory.seed.member(centre.id, ID.teacher, 'teacher');
  f.memory.seed.member(centre.id, ID.student, 'student');
  const at = { workspace_id: centre.id };
  equal((await f.json('GET', 'core/specialists', { token: 'tok-teacher', query: at })).body.code, 'role_required', 'teachers cannot change assistants');
  const list = (await f.json('GET', 'core/specialists', { token: 'tok-owner', query: at })).body;
  const assistant = list.specialists.find((s: { key: string }) => s.key === 'assistant');
  equal([assistant.built_in, assistant.override, assistant.default.name, list.custom_context_kinds, list.roles.length], [true, null, 'Schood AI', ['learner_profile'], 5]);

  // Instructions only: the built-in keeps its own name in every language.
  const tuned = await f.json('PUT', 'core/specialists', { token: 'tok-owner', query: at, body: { key: 'assistant', instructions: 'Answer in Uzbek first, then English.', roles: ['teacher', 'student', 'superuser'] } });
  equal(tuned.body.field, 'roles', 'unknown roles are refused');
  const saved = await f.json('PUT', 'core/specialists', { token: 'tok-owner', query: at, body: { key: 'assistant', instructions: 'Answer in Uzbek first, then English.', roles: ['teacher', 'student'], context_kinds: ['learner_profile', 'payments'] } });
  equal([saved.status, saved.body.specialist.override.name, saved.body.specialist.override.context_kinds], [200, null, ['learner_profile']], 'kinds outside the built-in are dropped');
  equal((await f.json('GET', 'core/me', { token: 'tok-student', query: at, headers: { 'x-schood-locale': 'ru' } })).body.specialists[0].name, 'Schood AI');
  // The workspace instructions reach the model below the core rules.
  f.setProvider(() => streamOf(['Salom!']));
  await f.call('POST', 'core/chat', { token: 'tok-student', query: at, body: chat({ message: 'Hi' }) });
  await f.settle();
  const prompt = await f.upstream.at(-1)!.text();
  ok(prompt.includes('Answer in Uzbek first') && prompt.indexOf('Answer in Uzbek first') > prompt.indexOf('Schood'), 'workspace instructions are in the prompt');

  await f.json('PUT', 'core/specialists', { token: 'tok-owner', query: at, body: { key: 'assistant', name: 'Registan helper', roles: ['owner', 'admin', 'teacher'] } });
  equal((await f.json('GET', 'core/me', { token: 'tok-teacher', query: at })).body.specialists[0].name, 'Registan helper');
  equal((await f.json('GET', 'core/me', { token: 'tok-student', query: at })).body.specialists.length, 0, 'narrowed roles apply');
  equal((await f.json('POST', 'core/chat', { token: 'tok-student', query: at, body: chat({ message: 'Hi' }) })).body.code, 'specialist_not_found');

  // Custom assistants: named, limited to the kinds custom assistants may read.
  equal((await f.json('PUT', 'core/specialists', { token: 'tok-owner', query: at, body: { key: 'ielts_helper' } })).body.field, 'name');
  equal((await f.json('PUT', 'core/specialists', { token: 'tok-owner', query: at, body: { key: 'Bad Key', name: 'x' } })).body.field, 'key');
  const custom = await f.json('PUT', 'core/specialists', { token: 'tok-owner', query: at, body: { key: 'ielts_helper', name: 'IELTS helper', description: 'Band 7 practice', instructions: 'Focus on IELTS writing.', context_kinds: ['learner_profile', 'centre_finance'] } });
  equal([custom.body.specialist.built_in, custom.body.specialist.override.context_kinds, custom.body.specialist.override.roles], [false, ['learner_profile'], ['owner', 'admin', 'teacher']]);
  equal((await f.json('GET', 'core/me', { token: 'tok-teacher', query: at })).body.specialists.map((s: { key: string }) => s.key).sort(), ['assistant', 'ielts_helper']);

  // Switching off and back to the defaults.
  await f.json('PUT', 'core/specialists', { token: 'tok-owner', query: at, body: { key: 'ielts_helper', name: 'IELTS helper', enabled: false } });
  equal((await f.json('GET', 'core/me', { token: 'tok-teacher', query: at })).body.specialists.map((s: { key: string }) => s.key), ['assistant']);
  equal((await f.json('DELETE', 'core/specialists', { token: 'tok-owner', query: at, body: { key: 'assistant' } })).body.deleted, true);
  equal((await f.json('GET', 'core/me', { token: 'tok-student', query: at })).body.specialists[0].name, 'Schood AI', 'the built-in is back as it was');
  ok(f.memory.audit.filter((event) => event.event === 'specialist.saved').length >= 4 && f.memory.audit.some((event) => event.event === 'specialist.deleted'), 'changes are audited');
  // A personal workspace's owner may tailor their own, with no roles to choose.
  equal((await f.json('GET', 'core/specialists', { token: 'tok-plus' })).body.roles, ['owner']);
});

Deno.test('admin console: workspace switches, suspension and the audit log', async () => {
  const f = fixture();
  const centre = f.memory.seed.centre({ name: 'Registan Learning Centre', ownerId: ID.owner });
  f.memory.seed.member(centre.id, ID.teacher, 'teacher');
  const at = { workspace_id: centre.id };
  equal((await f.json('GET', 'admin/workspaces', { token: 'tok-owner' })).status, 403, 'admins only');
  const found = (await f.json('GET', 'admin/workspaces', { token: 'tok-admin', query: { q: 'registan' } })).body.workspaces;
  equal(found.map((ws: { id: string; kind: string }) => [ws.id, ws.kind]), [[centre.id, 'centre']]);
  equal((await f.json('GET', 'admin/workspaces', { token: 'tok-admin', query: { q: centre.id } })).body.workspaces.length, 1, 'by id too');
  equal((await f.json('PATCH', 'admin/workspaces', { token: 'tok-admin', body: { id: centre.id } })).status, 400);
  const off = await f.json('PATCH', 'admin/workspaces', { token: 'tok-admin', body: { id: centre.id, features: { assistant: false, 'Not A Key': true } } });
  equal(off.body.workspace.features, { assistant: false });
  equal((await f.json('POST', 'core/chat', { token: 'tok-teacher', query: at, body: chat({ message: 'Hi' }) })).body.scope, 'workspace', 'the switch applies');
  equal((await f.json('PATCH', 'admin/workspaces', { token: 'tok-admin', body: { id: centre.id, status: 'suspended' } })).body.workspace.status, 'suspended');
  equal((await f.json('GET', 'core/me', { token: 'tok-teacher', query: at })).body.code, 'workspace_suspended');
  await f.json('PATCH', 'admin/workspaces', { token: 'tok-admin', body: { id: centre.id, status: 'active' } });
  equal((await f.json('GET', 'core/me', { token: 'tok-teacher', query: at })).status, 200);

  const audit = (await f.json('GET', 'admin/audit', { token: 'tok-admin', query: { event: 'admin.' } })).body.events;
  equal(audit.map((event: { event: string }) => event.event), ['admin.workspace', 'admin.workspace', 'admin.workspace'], 'newest first, filtered by prefix');
  equal(audit[1].details.status, 'suspended');
  const older = (await f.json('GET', 'admin/audit', { token: 'tok-admin', query: { before: String(audit[0].id) } })).body.events;
  ok(older.every((event: { id: number }) => event.id < audit[0].id), 'paging by id');
  equal((await f.json('GET', 'admin/audit', { token: 'tok-admin', query: { event: 'Robert); drop' } })).status, 400);
  equal((await f.json('GET', 'admin/audit', { token: 'tok-plus' })).status, 403);
});

Deno.test('delete my history removes my conversations in every workspace and nobody else’s', async () => {
  const f = fixture();
  const centre = f.memory.seed.centre({ name: 'Registan Learning Centre', ownerId: ID.owner });
  f.memory.seed.member(centre.id, ID.plus, 'student');
  f.memory.seed.member(centre.id, ID.teacher, 'teacher');
  const at = { workspace_id: centre.id };
  f.setProvider(() => streamOf(['Salom!']));
  for (const [token, query] of [['tok-plus', {}], ['tok-plus', at], ['tok-teacher', at]] as const) {
    equal((await f.call('POST', 'core/chat', { token, query, body: chat({ message: 'Hi' }) })).status, 200);
    await f.settle();
  }
  equal(f.memory.threads.size, 3);
  equal((await f.json('DELETE', 'core/history', { token: 'tok-plus', body: {} })).body.deleted, 2);
  equal([...f.memory.threads.values()].map((thread) => thread.userId), [ID.teacher], 'only mine are gone');
  ok(f.memory.audit.some((event) => event.event === 'history.deleted' && event.details?.conversations === 2), 'audited without content');
});
