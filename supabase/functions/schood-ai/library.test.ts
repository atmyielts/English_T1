import { s } from '../../../packages/ai-core/src/mod.ts';
import { equal, fixture, ID, ok, personal } from './fixture.test.ts';
import { MODULES } from './handler.ts';
import { registerMaterialKind } from './library.ts';
import type { FeatureModule } from './types.ts';

// The library through the routes: who may read and change pages, revision-checked
// saves, versions, folders, sharing in centres, export, and ctx.library for areas.

registerMaterialKind<{ items: string[] }>({
  kind: 'test.wordlist', area: 'teacher',
  schema: s.object({ items: s.array(s.string({ max: 40 }), { min: 1, max: 50 }) }),
  toMarkdown: (material) => material.items.map((item) => `- ${item}`).join('\n'),
  toTelegram: (material) => `Words: ${material.items.join(', ')}`,
});
const areaModule: FeatureModule = {
  area: 'teacher',
  routes: {
    save: { POST: async (ctx) => ({ page: await ctx.library.create({ kind: 'test.wordlist', title: 'Unit 3 words', folder: 'Generated', material: { items: ['brave', 'calm'] } }) }) },
  },
};
const modules = [...MODULES.filter((module) => module.area !== 'teacher'), areaModule];
const T = 'tok-teacher-plan';

Deno.test('a teacher creates, finds, saves and versions pages; stale saves are conflicts', async () => {
  const f = fixture();
  const created = await f.json('POST', 'core/pages', { token: T, body: { title: '  Present  perfect  ', folder: ' Grammar / B1 ', body: 'Have you **ever** been to Samarkand?\r\n\r\n- yes' } });
  equal([created.status, created.body.page.title, created.body.page.folder, created.body.page.kind, created.body.page.revision, created.body.page.can_edit, created.body.page.owner.is_me],
    [200, 'Present perfect', 'Grammar/B1', 'note', 1, true, true]);
  const id = created.body.page.id as string;
  equal(created.body.page.body.includes('\r'), false, 'line endings are normalised');

  const listed = await f.json('GET', 'core/pages', { token: T });
  equal([listed.body.pages.length, 'body' in listed.body.pages[0], listed.body.pages[0].excerpt.startsWith('Have you **ever**')], [1, false, true], 'lists carry an excerpt, not the body');
  equal((await f.json('GET', 'core/pages', { token: T, query: { q: 'samarkand' } })).body.pages.length, 1, 'search reads the body');
  equal((await f.json('GET', 'core/pages', { token: T, query: { q: 'tashkent' } })).body.pages.length, 0);
  equal((await f.json('GET', 'core/pages', { token: T, query: { folder: 'Grammar/B1' } })).body.pages.length, 1);
  equal((await f.json('GET', 'core/pages', { token: T, query: { folder: 'Grammar' } })).body.pages.length, 0, 'a folder lists its own pages');

  const first = await f.json('PATCH', 'core/page', { token: T, body: { id, expected_revision: 1, body: 'Have you ever been to Bukhara?' } });
  equal([first.status, first.body.page.revision], [200, 2]);
  const second = await f.json('PATCH', 'core/page', { token: T, body: { id, expected_revision: 2, title: 'Present perfect: travel' } });
  equal(second.body.page.revision, 3);
  // A second tab still on revision 2 cannot overwrite the newer page.
  const stale = await f.json('PATCH', 'core/page', { token: T, body: { id, expected_revision: 2, body: 'Old tab text' } });
  equal([stale.status, stale.body.code, stale.body.page.revision, stale.body.page.title], [409, 'revision_conflict', 3, 'Present perfect: travel']);
  equal((await f.json('GET', 'core/page', { token: T, query: { id } })).body.page.body, 'Have you ever been to Bukhara?', 'the conflict changed nothing');

  // Versions: the first edit kept revision 1; quick edits by the same person do not pile up; an explicit snapshot does.
  let revisions = (await f.json('GET', 'core/page-revisions', { token: T, query: { id } })).body.revisions;
  equal(revisions.map((r: { revision: number }) => r.revision), [1]);
  await f.json('PATCH', 'core/page', { token: T, body: { id, expected_revision: 3, body: 'Snapshot me', snapshot: true } });
  f.advance(11 * 60_000);
  await f.json('PATCH', 'core/page', { token: T, body: { id, expected_revision: 4, body: 'Later edit' } });
  revisions = (await f.json('GET', 'core/page-revisions', { token: T, query: { id } })).body.revisions;
  equal(revisions.map((r: { revision: number; author_is_me: boolean }) => [r.revision, r.author_is_me]), [[4, true], [3, true], [1, true]], 'newest first');
  const old = await f.json('GET', 'core/page-revision', { token: T, query: { id, revision: '1' } });
  equal([old.body.revision.title, old.body.revision.body.includes('Samarkand')], ['Present perfect', true]);
  equal((await f.json('GET', 'core/page-revision', { token: T, query: { id, revision: '2' } })).status, 404);

  const restored = await f.json('POST', 'core/page-restore', { token: T, body: { id, revision: 1, expected_revision: 5 } });
  equal([restored.status, restored.body.page.revision, restored.body.page.title, restored.body.page.body.includes('Samarkand')], [200, 6, 'Present perfect', true]);
  ok((await f.json('GET', 'core/page-revisions', { token: T, query: { id } })).body.revisions.some((r: { revision: number }) => r.revision === 5), 'what was there before the restore is kept');
  equal((await f.json('POST', 'core/page-restore', { token: T, body: { id, revision: 1, expected_revision: 5 } })).status, 409, 'restores are revision-checked too');

  const copy = await f.json('POST', 'core/page-duplicate', { token: T, body: { id } });
  equal([copy.body.page.title, copy.body.page.revision, copy.body.page.visibility, copy.body.page.id === id], ['Present perfect (copy)', 1, 'private', false]);
  equal((await f.json('PATCH', 'core/page', { token: T, body: { id, expected_revision: 6 } })).body.code, 'invalid_request', 'an empty save is refused');
  equal((await f.json('PATCH', 'core/page', { token: T, body: { id, expected_revision: 6, status: 'archived' } })).body.page.status, 'archived');
  equal((await f.json('GET', 'core/pages', { token: T })).body.pages.length, 1, 'archived pages leave the default list');
  equal((await f.json('GET', 'core/pages', { token: T, query: { status: 'archived' } })).body.pages.length, 1);
  equal((await f.json('DELETE', 'core/page', { token: T, body: { id } })).body.deleted, true);
  equal((await f.json('GET', 'core/page', { token: T, query: { id } })).status, 404);
  equal(f.memory.revisions.has(id), false, 'versions go with the page');
});

Deno.test('library access: staff only, reading without a plan, editing needs T6, no sharing outside centres', async () => {
  const f = fixture();
  const page = (await f.json('POST', 'core/pages', { token: T, body: { title: 'Mine' } })).body.page;
  equal((await f.json('GET', 'core/page', { token: 'tok-plus', query: { id: page.id } })).status, 404, 'other people cannot see it, or tell it exists');
  equal((await f.json('PATCH', 'core/page', { token: 'tok-plus', body: { id: page.id, expected_revision: 1, title: 'Taken' } })).status, 402, 'no plan, no edits anywhere');
  equal((await f.json('GET', 'core/pages', { token: 'tok-plus' })).body.pages, [], 'a library without the plan is still readable');
  const refused = await f.json('POST', 'core/pages', { token: 'tok-plus', body: { title: 'Notes' } });
  equal([refused.status, refused.body.code], [402, 'plan_required']);
  equal((await f.json('POST', 'core/pages', { token: T, body: { title: 'Shared?', visibility: 'workspace' } })).body.field, 'visibility', 'no sharing in a personal workspace');
  equal((await f.json('POST', 'core/pages', { token: T, body: { title: 'x', kind: 'mystery' } })).body.field, 'kind');
  equal((await f.json('POST', 'core/pages', { token: T, body: { title: 'x', material: { items: ['a'] } } })).body.field, 'material', 'notes have no material');
  equal((await f.json('POST', 'core/pages', { token: T, body: { title: 'x', folder: 'a/b/c/d/e/f' } })).body.field, 'folder', 'five levels at most');
  equal((await f.json('POST', 'core/pages', { token: T, body: { title: 'x', body: 'y'.repeat(200_001) } })).body.field, 'body');
  equal((await f.json('POST', 'core/pages', { token: T, body: { title: '' } })).body.field, 'title');
  equal((await f.json('GET', 'core/page', { token: T, query: { id: 'not-an-id' } })).status, 400);
  // A generation can be linked only by the person (or managers) whose generation it is.
  const someone = await f.memory.repository.createGeneration({ workspaceId: await personal(f, 'tok-plus'), userId: ID.plus, feature: 'T1', input: {} });
  equal((await f.json('POST', 'core/pages', { token: T, body: { title: 'x', source_generation_id: someone.id } })).body.field, 'source_generation_id');
});

Deno.test('centres share pages: owners read everything, edit what is shared, students never see the library', async () => {
  const f = fixture();
  const centre = f.memory.seed.centre({ name: 'Registan Learning Centre', ownerId: ID.owner });
  f.memory.seed.member(centre.id, ID.teacher, 'teacher');
  f.memory.seed.member(centre.id, ID.outsider, 'teacher');
  f.memory.seed.member(centre.id, ID.student, 'student');
  const at = { workspace_id: centre.id };
  const draft = (await f.json('POST', 'core/pages', { token: 'tok-teacher', query: at, body: { title: 'Mock test notes', folder: 'IELTS' } })).body.page;
  equal(draft.can_edit, true, 'the centre plan covers its teachers');
  equal((await f.json('GET', 'core/page', { token: 'tok-outsider', query: { ...at, id: draft.id } })).status, 404, 'another teacher cannot see a private page');
  const asOwner = await f.json('GET', 'core/page', { token: 'tok-owner', query: { ...at, id: draft.id } });
  equal([asOwner.status, asOwner.body.page.can_edit], [200, false], 'owners can read but not edit a private page');
  equal((await f.json('PATCH', 'core/page', { token: 'tok-owner', query: at, body: { id: draft.id, expected_revision: 1, title: 'Mine now' } })).status, 403);
  equal((await f.json('DELETE', 'core/page', { token: 'tok-owner', query: at, body: { id: draft.id } })).status, 403);

  const shared = await f.json('PATCH', 'core/page', { token: 'tok-teacher', query: at, body: { id: draft.id, expected_revision: 1, visibility: 'workspace' } });
  equal(shared.body.page.visibility, 'workspace');
  ok(f.memory.audit.some((event) => event.event === 'library.page_visibility' && event.targetId === draft.id), 'sharing is audited');
  const colleague = await f.json('GET', 'core/page', { token: 'tok-outsider', query: { ...at, id: draft.id } });
  equal([colleague.status, colleague.body.page.can_edit], [200, false], 'colleagues read shared pages');
  equal((await f.json('GET', 'core/pages', { token: 'tok-outsider', query: { ...at, scope: 'workspace' } })).body.pages.length, 1);
  equal((await f.json('GET', 'core/pages', { token: 'tok-outsider', query: at })).body.pages.length, 0, '"mine" is the default');
  const edited = await f.json('PATCH', 'core/page', { token: 'tok-owner', query: at, body: { id: draft.id, expected_revision: 2, body: 'Checked by the owner.' } });
  equal([edited.status, edited.body.page.owner.is_me], [200, false], 'owners edit shared pages');
  equal((await f.json('GET', 'core/page-revisions', { token: 'tok-teacher', query: { ...at, id: draft.id } })).body.revisions.length, 2, 'another editor always keeps a version');

  equal((await f.json('GET', 'core/pages', { token: 'tok-student', query: at })).body.code, 'role_required');
  equal((await f.json('GET', 'core/page', { token: 'tok-student', query: { ...at, id: draft.id } })).body.code, 'role_required');
  // The page lives in the centre: from the teacher's personal workspace it is not there.
  equal((await f.json('GET', 'core/page', { token: 'tok-teacher', query: { id: draft.id } })).status, 404);
  equal((await f.json('DELETE', 'core/page', { token: 'tok-owner', query: at, body: { id: draft.id } })).body.deleted, true, 'owners delete shared pages');
  ok(f.memory.audit.some((event) => event.event === 'library.page_deleted'), 'deletes in a centre are audited');
});

Deno.test('folders, export and material kinds; areas save through ctx.library', async () => {
  const f = fixture({ modules });
  for (const folder of ['Unit 1', 'Unit 1/Week 2', 'Unit 1/Week 2', 'Unit 10', 'Reading']) {
    await f.json('POST', 'core/pages', { token: T, body: { title: `Page in ${folder}`, folder } });
  }
  equal((await f.json('GET', 'core/folders', { token: T })).body.folders, [{ path: 'Reading', count: 1 }, { path: 'Unit 1', count: 1 }, { path: 'Unit 1/Week 2', count: 2 }, { path: 'Unit 10', count: 1 }]);
  equal((await f.json('POST', 'core/folders', { token: T, body: { from: 'Unit 1', to: 'Unit 1/Old' } })).body.field, 'to', 'not into itself');
  equal((await f.json('POST', 'core/folders', { token: T, body: { from: 'Unit 1', to: 'a/b/c/d/e' } })).body.field, 'to', 'moved sub-folders stay five deep');
  equal((await f.json('POST', 'core/folders', { token: T, body: { from: 'Unit 1', to: 'Term A/Unit 1' } })).body.moved, 3);
  equal((await f.json('GET', 'core/folders', { token: T })).body.folders.map((folder: { path: string }) => folder.path), ['Reading', 'Term A/Unit 1', 'Term A/Unit 1/Week 2', 'Unit 10'], '"Unit 10" is not inside "Unit 1"');
  equal((await f.json('POST', 'core/folders', { token: 'tok-plus', body: { from: 'Unit 10', to: 'X' } })).status, 402);

  const saved = await f.json('POST', 'teacher/save', { token: T });
  equal([saved.status, saved.body.page.kind, saved.body.page.body, saved.body.page.folder], [200, 'test.wordlist', '- brave\n- calm', 'Generated'], 'the body is made from the material');
  equal((await f.json('POST', 'teacher/save', { token: 'tok-plus' })).body.code, 'plan_required', 'ctx.library applies the same rules');
  const id = saved.body.page.id;
  equal((await f.json('PATCH', 'core/page', { token: T, body: { id, expected_revision: 1, material: { items: [] } } })).body.field, 'material', 'materials are validated');
  const rebuilt = await f.json('PATCH', 'core/page', { token: T, body: { id, expected_revision: 1, material: { items: ['bold'] } } });
  equal(rebuilt.body.page.body, '- bold', 'a new material rebuilds the document');

  const telegram = (await f.json('GET', 'core/page-export', { token: T, query: { id, format: 'telegram' } })).body.export;
  equal([telegram.parts, telegram.mime, telegram.filename], [['Words: bold'], 'text/plain', 'unit-3-words.txt'], 'a kind can give its own Telegram text');
  const note = (await f.json('POST', 'core/pages', { token: T, body: { title: 'Ўзбекча матн', body: `## Task\n\n${'Read the text. '.repeat(400)}` } })).body.page;
  const parts = (await f.json('GET', 'core/page-export', { token: T, query: { id: note.id, format: 'telegram' } })).body.export.parts as string[];
  ok(parts.length === 2 && parts.every((part) => part.length <= 4000) && parts[0].startsWith('ЎЗБЕКЧА МАТН\n\nTASK'), 'long pages split into Telegram-sized messages');
  const markdown = (await f.json('GET', 'core/page-export', { token: T, query: { id: note.id } })).body.export;
  equal([markdown.format, markdown.filename, markdown.parts[0].startsWith('# Ўзбекча матн\n\n## Task')], ['markdown', 'ўзбекча-матн.md', true]);
  const json = JSON.parse((await f.json('GET', 'core/page-export', { token: T, query: { id, format: 'json' } })).body.export.parts[0]);
  equal([json.kind, json.material], ['test.wordlist', { items: ['bold'] }]);
  equal((await f.json('GET', 'core/page-export', { token: T, query: { id, format: 'pdf' } })).status, 400);
  equal((await f.json('GET', 'core/page-export', { token: 'tok-plus', query: { id } })).status, 404);
});
