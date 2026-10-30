import { ACADEMY, centreFixture, createCentre, equal, ID, invite, ok } from './testing.ts';

// C1 centre workspace and C7 seats, invites, budgets, admin, audit and usage.

Deno.test('creating a centre: Academy owners link their tenant; Schood admins create one for an owner', async () => {
  const f = await centreFixture();
  equal((await f.json('POST', 'centre/create', { token: 'tok-outsider', body: { academy_id: ACADEMY } })).body.code, 'academy_role_required', 'no Academy membership');
  equal((await f.json('POST', 'centre/create', { body: { academy_id: '00000000-0000-4000-8000-00000000dead' } })).body.code, 'academy_role_required', 'a tenant the owner does not run');
  const ws = await createCentre(f);
  equal((await f.json('POST', 'centre/create', { token: 'tok-office', body: { academy_id: ACADEMY } })).body.code, 'academy_already_linked', 'an Academy admin who is not in the centre is told to ask for an invite');
  const linkable = await f.json('GET', 'centre/academies', { token: 'tok-office' });
  equal([linkable.body.academies[0].linked, linkable.body.academies[0].workspace_id], [true, null], 'linked, but not theirs');

  equal((await f.json('POST', 'centre/create', { token: 'tok-owner', body: { name: 'X', owner_user_id: ID.t1 } })).body.code, 'admin_required', 'only Schood admins create without Academy');
  equal((await f.json('POST', 'centre/create', { token: 'tok-schood-admin', body: { name: 'X', owner_user_id: '00000000-0000-4000-8000-0000000fffff' } })).body.code, 'owner_not_found');
  const contract = await f.json('POST', 'centre/create', { token: 'tok-schood-admin', body: { name: 'Samarqand Academy', owner_user_id: ID.t2, contract_until: '2027-10-01T00:00:00Z' } });
  equal(contract.status, 200, 'created by an admin');
  const enterprise = await f.json('GET', 'centre/overview', { token: 'tok-t2', workspace: contract.body.workspace.id });
  equal([enterprise.body.plan.plans, enterprise.body.seats.teachers.limit, enterprise.body.workspace.created_via], [['enterprise'], null, 'admin'], 'Enterprise contract: no seat limit');
  equal((await f.json('GET', 'centre/overview', { token: 'tok-outsider', workspace: ws })).status, 404, 'outsiders see nothing');
  equal((await f.json('GET', 'centre/overview')).body.code, 'centre_required', 'the personal workspace is not a centre');
  ok(f.memory.audit.some((event) => event.event === 'centre.created' && event.workspaceId === ws), 'audited');
});

Deno.test('invites: roles, expiry, revocation, uses and seats; members and budgets', async () => {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'admin', ['tok-office'], 1);
  equal((await f.json('POST', 'centre/invites', { token: 'tok-office', workspace: ws, body: { role: 'admin' } })).body.code, 'role_required', 'admins cannot invite admins');
  const teacherInvite = await f.json('POST', 'centre/invites', { token: 'tok-office', workspace: ws, body: { role: 'teacher', max_uses: 1, expires_in_days: 3, label: 'Malika' } });
  equal([teacherInvite.status, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(teacherInvite.body.code), teacherInvite.body.link.startsWith('https://ai.schood.online/join?code=')], [200, true, true], 'a typeable code and a link');
  const listed = await f.json('GET', 'centre/invites', { workspace: ws });
  ok(!JSON.stringify(listed.body).includes(teacherInvite.body.code.replace('-', '')), 'codes are never listed');
  const preview = await f.json('GET', 'centre/invite-preview', { token: 'tok-t1', query: { code: teacherInvite.body.code.toLowerCase() } });
  equal([preview.body.centre.name, preview.body.role, preview.body.state, preview.body.member], ['Registan Learning Centre', 'teacher', 'active', false], 'preview before joining, any case');
  equal((await f.json('POST', 'centre/join', { token: 'tok-t1', body: { code: teacherInvite.body.code } })).body.role, 'teacher');
  equal((await f.json('POST', 'centre/join', { token: 'tok-t2', body: { code: teacherInvite.body.code } })).body.code, 'invite_used_up');
  equal((await f.json('POST', 'centre/join', { token: 'tok-t2', body: { code: 'ZZZZZ-ZZZZZ' } })).status, 404, 'unknown code');
  const revoked = await f.json('POST', 'centre/invites', { workspace: ws, body: { role: 'student' } });
  await f.json('DELETE', 'centre/invites', { workspace: ws, body: { id: revoked.body.invite.id } });
  equal((await f.json('POST', 'centre/join', { token: 'tok-s1', body: { code: revoked.body.code } })).body.code, 'invite_revoked');
  const expiring = await f.json('POST', 'centre/invites', { workspace: ws, body: { role: 'student', expires_in_days: 1 } });
  f.advance(2 * 86_400_000);
  equal((await f.json('POST', 'centre/join', { token: 'tok-s1', body: { code: expiring.body.code } })).body.code, 'invite_expired');

  // Seats come from the centre's own plan (core's ctx.planFor) plus add-ons, even though the joiner is not a member.
  const accept = f.store.acceptInvite.bind(f.store);
  const asked: { teacherSeats: number | null; studentSeats: number | null }[] = [];
  let full = false;
  f.store.acceptInvite = (input) => { asked.push({ teacherSeats: input.teacherSeats, studentSeats: input.studentSeats }); return accept(full ? { ...input, teacherSeats: 2 } : input); };
  await f.store.table('settings').update({ workspace_id: ws }, { extra_teacher_seats: 3 });
  const seats = await f.json('POST', 'centre/invites', { workspace: ws, body: { role: 'teacher', max_uses: 5 } });
  full = true;
  equal((await f.json('POST', 'centre/join', { token: 'tok-t2', body: { code: seats.body.code } })).body.code, 'seats_full', 'office admin + teacher fill two seats');
  equal(asked.at(-1), { teacherSeats: 18, studentSeats: 400 }, 'Centre Pro’s 15 seats and 3 added, 400 places');
  full = false;
  f.store.acceptInvite = accept;
  await invite(f, ws, 'student', ['tok-s1', 'tok-s2', 'tok-s3']);
  await invite(f, ws, 'parent', ['tok-parent']);

  // Members: the office manages teachers and students; only the owner manages admins; nobody changes the owner.
  const list = await f.json('GET', 'centre/members', { token: 'tok-t1', workspace: ws });
  equal([list.body.can_manage, list.body.members.some((m: { role: string }) => m.role === 'parent')], [false, false], 'teachers see staff and students, not parents');
  equal((await f.json('PATCH', 'centre/members', { token: 'tok-office', workspace: ws, body: { user_id: ID.owner, credit_budget: 1 } })).body.code, 'owner_protected');
  equal((await f.json('PATCH', 'centre/members', { token: 'tok-office', workspace: ws, body: { user_id: ID.t1, role: 'admin' } })).body.code, 'role_required', 'only the owner makes admins');
  equal((await f.json('PATCH', 'centre/members', { token: 'tok-t1', workspace: ws, body: { user_id: ID.s1, credit_budget: 5 } })).status, 403, 'teachers cannot change members');
  equal((await f.json('PATCH', 'centre/members', { token: 'tok-office', workspace: ws, body: { user_id: ID.s1, credit_budget: 30, status: 'suspended' } })).status, 200);
  equal((await f.memory.repository.membership(ws, ID.s1))!.status, 'suspended', 'suspended');
  equal((await f.json('GET', 'centre/overview', { token: 'tok-s1', workspace: ws })).status, 404, 'a suspended member is out');
  equal((await f.json('PATCH', 'centre/members', { token: 'tok-office', workspace: ws, body: { user_id: ID.s1, status: 'active' } })).status, 200, 'back within the plan’s places');
  equal((await f.json('DELETE', 'centre/members', { token: 'tok-office', workspace: ws, body: { user_id: ID.owner } })).body.code, 'owner_protected');
  equal((await f.json('DELETE', 'centre/members', { token: 'tok-office', workspace: ws, body: { user_id: ID.s3 } })).status, 200, 'removed');
  equal((await f.json('POST', 'centre/leave', { token: 'tok-parent', workspace: ws })).status, 200, 'a member can leave');
  equal((await f.json('POST', 'centre/leave', { workspace: ws })).body.code, 'owner_protected', 'the owner cannot leave');

  // Budgets: defaults for new members, and applied to existing ones on request.
  const budgets = await f.json('POST', 'centre/budgets', { token: 'tok-office', workspace: ws, body: { defaults: { teacher: 800, student: 60 }, apply_to_existing: true } });
  equal([budgets.body.budget_defaults, budgets.body.applied], [{ teacher: 800, student: 60 }, 3], 'teacher and two students; the admin is the owner’s to set');
  await invite(f, ws, 'student', ['tok-s4']);
  equal((await f.memory.repository.membership(ws, ID.s4))!.creditBudget, 60, 'new students get the default');
  const members = await f.json('GET', 'centre/members', { workspace: ws });
  const s4 = members.body.members.find((m: { user_id: string }) => m.user_id === ID.s4);
  equal([s4.budget, s4.used_this_month, s4.name], [60, 0, 'Student 4'], 'members show budget and use');
});

Deno.test('admin: switchable areas, retention, Schood add-on grants, audit and the usage report', async () => {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'student', ['tok-s1']);
  const admin = await f.json('GET', 'centre/admin', { workspace: ws });
  ok(admin.body.areas.some((area: { area: string }) => area.area === 'admissions') && admin.body.areas.some((area: { area: string }) => area.area === 'student_assistant'), 'centre features can be switched');
  equal(admin.body.retention_days, 180, 'default retention [ASSUMPTION]');
  equal((await f.json('PATCH', 'centre/admin', { workspace: ws, body: { retention_days: 10 } })).status, 400, 'at least 30 days');
  equal((await f.json('PATCH', 'centre/admin', { workspace: ws, body: { retention_days: 365 } })).status, 400, 'core keeps conversations at most 180 days');
  equal((await f.json('PATCH', 'centre/admin', { workspace: ws, body: { retention_days: 60 } })).body.retention_days, 60);
  equal((await f.json('PATCH', 'centre/admin', { token: 'tok-s1', workspace: ws, body: { retention_days: 60 } })).status, 403, 'students cannot');
  // Parent features (P1, P2) are off until the centre switches them on (features.parent = true, read by the learner area).
  equal([admin.body.parent_features, admin.body.areas.some((area: { area: string }) => area.area === 'parent'), admin.body.areas.some((area: { area: string }) => area.area === 'parent.message')], [false, false, true], 'opt-in parent switch, separate from T8 drafts');
  equal((await f.json('PATCH', 'centre/admin', { workspace: ws, body: { parent_features: true } })).body.parent_features, true);
  equal((f.memory.workspaces.get(ws)!.settings as { features: Record<string, boolean> }).features.parent, true, 'stored as features.parent = true');
  equal((await f.json('GET', 'centre/admin', { workspace: ws })).body.parent_features, true);
  await f.json('PATCH', 'centre/admin', { workspace: ws, body: { parent_features: false } });
  equal('parent' in (f.memory.workspaces.get(ws)!.settings as { features: Record<string, boolean> }).features, false, 'switched off again');
  // Switching a feature off uses core's settings route; the student assistant then refuses.
  equal((await f.json('PATCH', 'core/settings', { workspace: ws, body: { features: { student_assistant: false } } })).status, 200);
  f.model(/study assistant/, 'Hint: look at the time word.');
  const off = await f.call('POST', 'core/chat', { token: 'tok-s1', workspace: ws, body: { client_message_id: crypto.randomUUID(), specialist: 'student_assistant', message: 'help' } });
  equal([off.status, (await off.json()).code], [503, 'ai_disabled'], 'switched off for the centre');
  await f.json('PATCH', 'core/settings', { workspace: ws, body: { features: {} } });

  equal((await f.json('PATCH', 'centre/grants', { body: { workspace_id: ws, extra_teacher_seats: 3 } })).body.code, 'admin_required', 'owners cannot grant themselves add-ons');
  equal((await f.json('PATCH', 'centre/grants', { token: 'tok-schood-admin', body: { workspace_id: ws, extra_teacher_seats: 3, extra_students: 100 } })).body.extra_students, 100);
  equal((await f.json('GET', 'centre/overview', { workspace: ws })).body.seats.teachers.limit, 18, 'Centre Pro 15 + 3 granted seats');

  // Usage: one student reply and one refunded failure.
  const answered = await f.call('POST', 'core/chat', { token: 'tok-s1', workspace: ws, body: { client_message_id: crypto.randomUUID(), specialist: 'student_assistant', message: 'Explain articles' } });
  await answered.text();
  await f.settle();
  const usage = await f.json('GET', 'centre/usage', { workspace: ws, query: { days: '7' } });
  const reply = usage.body.features.find((row: { key: string }) => row.key === 'student_assistant.reply');
  equal([reply.credits, reply.feature], [1, 'C2'], 'credits by feature');
  equal([usage.body.members[0].name, usage.body.members[0].credits, usage.body.members[0].role], ['Student 1', 1, 'student'], 'credits by member');
  ok(usage.body.cost.calls >= 1, 'model calls counted');
  const audit = await f.json('GET', 'centre/audit', { workspace: ws });
  ok(audit.body.events.some((event: { event: string; actor: { name: string } }) => event.event === 'centre.retention' && event.actor.name === 'Jasur Aliyev'), 'audit log with names');
  equal((await f.json('GET', 'centre/audit', { token: 'tok-s1', workspace: ws })).status, 403, 'students cannot read the audit log');
});

Deno.test('retention deletes old student chats and admissions conversations, never pinned ones or staff chats', async () => {
  const f = await centreFixture();
  const ws = await createCentre(f);
  await invite(f, ws, 'student', ['tok-s1']);
  await invite(f, ws, 'teacher', ['tok-t1']);
  const old = await f.memory.repository.createThread({ workspaceId: ws, userId: ID.s1, specialistKey: 'student_assistant', pageId: null, title: 'old' });
  const pinned = await f.memory.repository.createThread({ workspaceId: ws, userId: ID.s1, specialistKey: 'student_assistant', pageId: null, title: 'pinned' });
  await f.memory.repository.updateThread(pinned.id, { pinned: true });
  const staff = await f.memory.repository.createThread({ workspaceId: ws, userId: ID.t1, specialistKey: 'teacher_assistant', pageId: null, title: 'staff' });
  await f.store.table('threads').insert({ workspace_id: ws, channel: 'widget', external_id: 'old-prospect', last_message_at: f.now().toISOString() });
  f.advance(200 * 86_400_000);
  const fresh = await f.memory.repository.createThread({ workspaceId: ws, userId: ID.s1, specialistKey: 'student_assistant', pageId: null, title: 'new' });
  const run = await f.json('POST', 'centre/retention-run', { workspace: ws });
  equal([run.body.chats, run.body.conversations], [1, 1], 'one chat and one conversation');
  ok(!f.memory.threads.has(old.id) && f.memory.threads.has(pinned.id) && f.memory.threads.has(staff.id) && f.memory.threads.has(fresh.id), 'only the old unpinned student chat went');
});
