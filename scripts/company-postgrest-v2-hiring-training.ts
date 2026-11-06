// Real-handler coverage for the applicant tracking and company training release.
// Data lives only in the driver's throwaway Postgres/PostgREST containers.
import type { V2Harness } from './company-postgrest-v2-harness.ts';
import { TRACKS } from '../supabase/functions/company/training/tracks/index.ts';

const localized = (en: string) => ({ en, ru: 'Учебный пример', uz: 'O‘quv misoli' });
const scenario = {
  title: localized('A late checkout'), goal: localized('Explain the checkout policy'),
  persona: 'A hotel guest asking to leave later.', learner_role: 'Receptionist', setting: 'A hotel in Tashkent',
  opening: 'Can I check out at two?', difficulty: 'medium', checklist: ['Explains the time', 'Offers an alternative'],
};
const lesson = {
  title: localized('Checkout policy'), goal: localized('Explain checkout times'), level: 'a2',
  phrases: [{ en: 'Checkout is at noon.', ru: 'Выезд в полдень.', uz: 'Chiqish tushda.' }],
  words: [{ en: 'noon', ru: 'полдень', uz: 'tush' }],
  dialogue: { setting: localized('At reception'), lines: [{ speaker: 'Guest', text: 'When is checkout?' }, { speaker: 'Receptionist', text: 'At noon.' }] },
  exercises: [
    { id: 'choice', kind: 'choice', items: [{ q: 'When is checkout?', options: ['At noon', 'At night'], answer: 0 }] },
    { id: 'gap', kind: 'gap', items: [{ text: 'Checkout is at ___.', answers: ['noon'] }] },
  ],
  mission: { kind: 'task', brief: localized('Explain the policy to a guest') },
};
const answers = { choice: [0], gap: ['noon'] };
const keyOf = (link: string) => link.split('/').at(-1)!;
const SOURCE = 'Our hotel checkout time is noon. The receptionist may offer a later checkout if a room is available.';

export async function hiringTrainingV2(h: V2Harness) {
  const { call, sql, area, eq, ok, need, state: S, users: U } = h;
  const o = `orgs/${need(S.org, 'active org')}`;
  const hr = { as: U.owner };
  const employee = { as: U.employee };
  const future = '2098-12-01';

  await area('v2 hiring: templates, personal links, pipeline, notes, messages and privacy', async () => {
    const templates = await call('GET', `${o}/hiring/role-templates`, hr);
    ok('25 or more role templates', templates.body.templates.length >= 25);
    const made = await call('POST', `${o}/hiring/role-templates/${templates.body.templates[0].code}`, { ...hr, body: {} });
    const assessment = need(made.body.assessment.id, 'v2 test');
    const p = `${o}/assessments/${assessment}`;
    await call('GET', p, hr);
    await call('GET', `${p}/pipeline`, { as: U.manager, expect: 403 });
    await call('GET', `${p}/pipeline`, { as: U.otherOwner, expect: 403 });
    const added = await call('POST', `${p}/candidates`, { ...hr, body: { rows: [
      { name: 'V2 Aziza Karimova', email: 'v2-aziza@example.uz' },
      { name: 'V2 Jasur Toshev', email: 'v2-jasur@example.uz' },
    ], locale: 'uz' } });
    eq('two invites stored', added.body.created.length, 2);
    const [a, b] = added.body.created;
    const c = `${o}/candidates/${a.id}`;
    const publicPath = `public/t/${keyOf(a.link)}`;
    await call('GET', publicPath);
    await call('GET', `${p}/pipeline`, hr);
    await call('GET', `${p}/pipeline/export`, hr);
    await call('GET', `${p}/health`, hr);
    await call('GET', `${o}/candidates`, hr);
    await call('GET', c, hr);
    await call('GET', `orgs/${S.otherOrg}/candidates/${a.id}`, { as: U.otherOwner, expect: 404 });
    await call('PATCH', c, { ...hr, body: { stage: 'reviewing', phone: '+998901234567' } });
    const note = await call('POST', `${c}/notes`, { ...hr, body: { body: 'Discuss customer conversations in the interview.' } });
    await call('DELETE', `${c}/notes/${note.body.note.id}`, { as: U.admin, expect: 403 });
    await call('DELETE', `${c}/notes/${note.body.note.id}`, hr);
    await call('POST', `${o}/candidates/bulk`, { ...hr, body: { ids: [a.id, b.id], stage: 'interview' } });
    await call('POST', `${o}/candidates/bulk/messages`, { ...hr, body: { ids: [a.id, b.id], kind: 'invite', locale: 'ru', links: { [a.id]: a.link, [b.id]: b.link }, mark: true } });
    await call('POST', `${c}/message`, { ...hr, body: { kind: 'reminder', locale: 'en', link: a.link, mark: true } });
    const kit = await call('POST', `${c}/interview-kit`, { ...hr, body: { locale: 'en' } });
    ok('kit contains questions', kit.body.kit.questions.length >= 3);
    await call('PATCH', `${c}/interview-kit`, { ...hr, body: { ratings: { 0: 4 }, summary: 'Can explain the policy.' } });
    const fresh = await call('POST', `${c}/link`, hr);
    await call('GET', publicPath, { expect: 404 });
    const activePath = `public/t/${keyOf(fresh.body.link)}`;
    const started = await call('POST', `${activePath}/start`, { body: { consent: true }, ip: '192.0.2.231' });
    const attemptId = need(started.body.attempt.id, 'v2 candidate attempt');
    const accessBefore = await sql(`select access_token_hash from company_attempts where id='${attemptId}'`);
    await sql(`update company_orgs set status='closed' where id='${S.org}'`);
    const closedIntro = await call('GET', activePath);
    eq('closed workspace offers no resume or personal details', [closedIntro.body.open, closedIntro.body.personal], [false, null]);
    await call('POST', `${activePath}/start`, { body: {}, expect: 403 });
    eq('refusal leaves access key untouched', await sql(`select access_token_hash from company_attempts where id='${attemptId}'`), accessBefore);
    await sql(`update company_orgs set status='active' where id='${S.org}'`);
    await call('POST', `${activePath}/start`, { body: {}, ip: '192.0.2.231' });
    // Grading is separately covered end-to-end by the original harness. Keep this
    // row realistic while exercising the ATS result/share and erasure SQL paths.
    await sql(`update company_attempts set status='graded', submitted_at=now(), graded_at=now(), overall_level='b1', overall_score=60, skill_results='{"grammar":{"score":60,"level":"b1","source":"auto"}}'::jsonb where id='${attemptId}'`);
    const report = await call('POST', `${p}/shares`, { ...hr, body: { days: 2 } });
    await call('GET', `${p}/shares`, hr);
    const reportPath = `public/s/${keyOf(report.body.link)}`;
    const shared = await call('GET', reportPath);
    ok('public report includes graded candidate', shared.body.candidates.some((row: { name: string }) => row.name === 'V2 Aziza Karimova'));
    ok('public report omits contacts', !JSON.stringify(shared.body).includes('v2-aziza@example.uz'));
    const feedback = await call('POST', `${c}/shares`, { ...hr, body: { include_feedback: false } });
    await call('GET', `${c}/shares`, hr);
    const feedbackPath = `public/s/${keyOf(feedback.body.link)}`;
    eq('feedback can omit written assessment', (await call('GET', feedbackPath)).body.feedback, null);
    await call('DELETE', `${o}/shares/${report.body.share.id}`, hr);
    await call('GET', reportPath, { expect: 404 });
    const preview = await call('POST', `${p}/preview`, { ...hr, body: { action: 'start' } });
    await call('POST', `${p}/preview`, { ...hr, body: { action: 'submit', state: preview.body.state, answers: {} } });
    const settings = await call('GET', `${o}/hiring/settings`, hr);
    eq('retention defaults off', settings.body.retention_months, null);
    await call('PUT', `${o}/hiring/settings`, { ...hr, body: { retention_months: 6 } });
    await call('POST', `${c}/erase`, hr);
    await call('GET', feedbackPath, { expect: 404 });
    eq('PII removed from the actual attempt', await sql(`select (candidate_name is null and candidate_email is null and access_token_hash is null and answers='{}'::jsonb)::text from company_attempts where id='${attemptId}'`), 'true');
    await call('POST', `${o}/candidates/bulk/erase`, { ...hr, body: { ids: [a.id, b.id] } });
    await call('PUT', `${o}/hiring/settings`, { ...hr, body: { retention_months: null } });
  });

  await area('v2 training: drafts, versions, company course, paths and certificates', async () => {
    await call('GET', `${o}/builder`, hr);
    await call('GET', `${o}/builder`, { ...employee, expect: 403 });
    const created = await call('POST', `${o}/builder/lessons`, { ...hr, body: { title: 'V2 checkout policy', level: 'a2' } });
    const id = need(created.body.lesson.id, 'company lesson');
    const lp = `${o}/builder/lessons/${id}`;
    const saved = await call('PUT', lp, { ...hr, body: { revision: created.body.lesson.revision, draft: lesson } });
    await call('GET', lp, hr);
    await call('GET', `orgs/${S.otherOrg}/builder/lessons/${id}`, { as: U.otherOwner, expect: 404 });
    await call('GET', `${lp}/preview`, hr);
    await call('POST', `${lp}/preview-check`, { ...hr, body: { answers } });
    await call('POST', `${lp}/publish`, { ...hr, body: { revision: saved.body.lesson.revision } });
    const duplicate = await call('POST', `${lp}/duplicate`, hr);
    await call('DELETE', `${o}/builder/lessons/${duplicate.body.id}`, hr);
    const copied = await call('POST', `${o}/builder/lessons/from-track`, { ...hr, body: { lesson_code: TRACKS[0].lessons[0].code } });
    await call('POST', `${o}/builder/lessons/${copied.body.id}/translate`, { ...hr, body: {} });
    await call('DELETE', `${o}/builder/lessons/${copied.body.id}`, hr);
    const aiDraft = await call('POST', `${o}/builder/draft`, { ...hr, body: { source: SOURCE, level: 'a2' } });
    eq('AI lesson stays unpublished', aiDraft.body.lesson.status, 'draft');
    await call('POST', `${o}/builder/lessons/${aiDraft.body.lesson.id}/publish`, { ...hr, body: {}, expect: 409 });
    await call('DELETE', `${o}/builder/lessons/${aiDraft.body.lesson.id}`, hr);
    const course = await call('POST', `${o}/builder/courses`, { ...hr, body: { title: 'V2 reception course' } });
    const courseId = need(course.body.course.id, 'company course');
    const cp = `${o}/builder/courses/${courseId}`;
    await call('PUT', cp, { ...hr, body: { revision: course.body.course.revision, lesson_ids: [id] } });
    await call('GET', cp, hr);
    await call('POST', `${cp}/publish`, { ...hr, body: {} });
    const code = `co-${id}`, courseCode = `c-${courseId}`;
    await call('GET', `${o}/tracks/${courseCode}`, employee);
    await call('GET', `${o}/learn/${code}`, employee);
    const passed = await call('POST', `${o}/learn/${code}/check`, { ...employee, body: { answers, minutes: 5 } });
    eq('custom lesson completed', passed.body.passed, true);
    const certificateCode = need(passed.body.certificates[0]?.code, 'automatic certificate');
    const mine = await call('GET', `${o}/my/certificates`, employee);
    await call('POST', `${o}/my/certificates`, { ...employee, body: { kind: 'course', code: courseCode } });
    const certificates = await call('GET', `${o}/certificates`, hr);
    const cert = need(certificates.body.certificates.find((row: { code: string }) => row.code === certificateCode), 'HR certificate');
    await call('GET', `public/c/${certificateCode}`);
    await call('POST', `${o}/certificates/${cert.id}/revoke`, { ...hr, body: {} });
    eq('public check shows revocation', (await call('GET', `public/c/${certificateCode}`)).body.certificate.revoked, true);
    await call('POST', `${o}/certificates/${cert.id}/revoke`, { ...hr, body: { revoke: false } });
    ok('own certificate remains accessible', mine.body.certificates.some((row: { code: string }) => row.code === certificateCode));
    await call('GET', `${lp}/results`, hr);
    await call('GET', `${cp}/results`, hr);
    await call('POST', `${o}/paths/suggest`, { ...hr, body: { level: 'a2', target_level: 'b1', job_role: 'hospitality' } });
    const path = await call('POST', `${o}/paths`, { ...hr, body: { member_id: S.emp1Member, steps: [{ kind: 'course', code: courseCode }], target_level: 'b1', due_date: future } });
    await call('GET', `${o}/paths`, hr);
    await call('GET', `${o}/paths/member/${S.emp1Member}`, hr);
    await call('GET', `${o}/my/path`, employee);
    await call('GET', `${o}/paths/member/${S.emp1Member}`, { as: U.otherOwner, expect: 403 });
    await call('DELETE', `${o}/paths/${path.body.path.id}`, hr);
    const assignment = await call('POST', `${o}/assignments`, { ...hr, body: { scope: 'all', track_code: courseCode, due_date: future } });
    const assignmentId = need(assignment.body.assignments?.[0]?.id ?? assignment.body.assignment?.id, 'v2 assignment');
    await call('GET', `${o}/training/due`, employee);
    await call('POST', `${o}/assignments/reassign`, { ...hr, body: { mode: 'extend', assignment_ids: [assignmentId], due_date: future } });
    // Republish without resetting progress, and restore a historical version.
    const current = await call('GET', lp, hr);
    await call('PUT', lp, { ...hr, body: { revision: current.body.lesson.revision, draft: { ...lesson, title: localized('Updated checkout') } } });
    await call('POST', `${lp}/publish`, { ...hr, body: {} });
    eq('republish keeps completion', (await call('GET', `${o}/learn/${code}`, employee)).body.progress.status, 'completed');
    await call('POST', `${lp}/restore`, { ...hr, body: { version: 1 } });
    await call('POST', `${lp}/archive`, hr);
    await call('DELETE', lp, hr);
    await call('DELETE', cp, hr);
  });

  await area('v2 training: private snippets and custom role-play depth', async () => {
    const snippet = await call('POST', `${o}/writing/saved`, { ...employee, body: { title: 'V2 customer reply', body: 'Thank you for your message.', tone: 'friendly' } });
    const sp = `${o}/writing/saved/${snippet.body.template.id}`;
    await call('GET', `${o}/writing/saved`, employee);
    await call('PATCH', sp, { ...employee, body: { tone: 'formal' } });
    await call('PATCH', sp, { as: U.employee2, body: { title: 'Someone else' }, expect: 404 });
    await call('DELETE', sp, employee);
    const drafted = await call('POST', `${o}/builder/scenarios/draft`, { ...hr, body: { source: SOURCE } });
    eq('AI scenario is only a draft', drafted.body.status, 'ok');
    await call('DELETE', `${o}/builder/scenarios/${drafted.body.id}`, hr);
    const made = await call('POST', `${o}/builder/scenarios`, { ...hr, body: scenario });
    const id = need(made.body.scenario.id, 'v2 custom scenario');
    const p = `${o}/builder/scenarios/${id}`;
    await call('GET', p, hr);
    await call('PUT', p, { ...hr, body: scenario });
    await call('POST', `${p}/publish`, hr);
    const start = await call('POST', `${o}/roleplay`, { ...employee, body: { scenario: `cs-${id}`, difficulty: 'hard', locale: 'uz' } });
    const rp = `${o}/roleplay/${start.body.session.id}`;
    await call('POST', `${rp}/hint`, { ...employee, body: {} });
    await call('POST', `${rp}/turn`, { ...employee, body: { text: 'Checkout is at noon, but I can check availability.' } });
    await call('POST', `${rp}/finish`, { ...employee, body: {} });
    await call('GET', `${o}/roleplay/history`, employee);
    await call('POST', `${rp}/replay`, { ...employee, body: { turn: 1 } });
    await call('POST', `${rp}/replay`, { as: U.employee2, body: { turn: 1 }, expect: 404 });
    await call('POST', `${p}/archive`, hr);
    eq('published scenario delete preserves history', (await call('DELETE', p, hr)).body.archived, true);
  });
}
