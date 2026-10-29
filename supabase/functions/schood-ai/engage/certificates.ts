import { BROWSER_EVENTS } from '../../../../packages/proctor-web/src/types.ts';
import { cleanDisplayName, formatCertificateCode, generateCertificateCode, normalizeCertificateCode } from '../../_shared/english-certificate.ts';
import { bool, integer, jsonObject, oneOf, optionalText, record, text, uuid } from '../input.ts';
import type { RequestContext } from '../types.ts';
import { begin, nameOf, refuse, requireSchoodAdmin, seededShuffle, type Engage } from './base.ts';
import { CERT_EXAMS, examByKey, type CertExam } from './content/certificates.ts';
import { message, PRIORITY } from './content/messages.ts';
import { pick } from './content/text.ts';
import { SITE } from './passport.ts';
import { currentSittingSource } from './seams.ts';
import { audioMime, fromBase64 } from './storage.ts';
import type { SittingRow, SittingSignal } from './types.ts';

// E12 Skill Certificates: paid, proctored exams per coach level, verified by QR.
//   1. A sitting needs a purchased sitting (registerSittingSource, from the pricing
//      phase: one purchase is one sitting, enforced by a unique reference) or beta access.
//   2. The browser runs Proctor Lite's client (packages/proctor-web) against
//      sitting-proctor and sitting-command, which speak the same protocol as the proctor
//      function: candidate state, session.heartbeat, events.append, notice.acknowledge.
//   3. Items are marked automatically with checked keys; speaking and writing tasks and
//      the integrity record go to a human reviewer (Proctor Lite's review step), who is
//      never the candidate. A pass issues a certificate with a code and a QR link.

const GRACE_MS = 2 * 60_000;
const NOTICE_EVERY = 3;
const SIGNALS = new Set<string>(BROWSER_EVENTS);
const isLive = (row: SittingRow, now: Date) => row.status === 'started' && now.getTime() <= Date.parse(row.deadlineAt) + GRACE_MS;

/** Auto-submits a sitting whose time is over (what was saved is what is marked). */
async function settleSitting(e: Engage, row: SittingRow): Promise<SittingRow> {
  if (row.status !== 'started' || isLive(row, e.now)) return row;
  return await submit(e, row, true) ?? (await e.b.repo.sitting(row.id))!;
}

function autoScore(exam: CertExam, answers: Record<string, string>) {
  return { score: exam.items.filter((item) => answers[item.id] === item.answer).length, total: exam.items.length };
}
function integritySummary(signals: SittingSignal[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const signal of signals) out[signal.kind] = (out[signal.kind] ?? 0) + 1;
  return out;
}
function notices(row: SittingRow, signals: SittingSignal[]) {
  const away = signals.filter((signal) => signal.kind === 'focus_loss' || signal.kind === 'tab_hidden');
  const count = Math.floor(away.length / NOTICE_EVERY);
  return Array.from({ length: Math.min(count, 5) }, (_, index) => ({
    id: `away-${index + 1}`, kind: 'warning' as const, reason: 'You left the exam page several times. Please stay on this page until you submit; the reviewer sees every time you leave.',
    issued_at: away[(index + 1) * NOTICE_EVERY - 1].at, acknowledged: (row.integrity[`ack:away-${index + 1}`] ?? 0) > 0, issuer_kind: 'system' as const,
  }));
}

async function submit(e: Engage, row: SittingRow, auto: boolean): Promise<SittingRow | null> {
  const exam = examByKey(row.examKey)!;
  const signals = await e.b.repo.signals(row.id);
  const { score, total } = autoScore(exam, row.answers);
  const next = await e.b.repo.updateSitting(row.id, { status: 'submitted', submittedAt: e.now.toISOString(), autoScore: score, autoTotal: total, integrity: { ...row.integrity, ...integritySummary(signals), auto_submitted: auto ? 1 : 0 } }, ['started']);
  return next;
}

const examView = (exam: CertExam, locale: Engage['locale']) => ({
  key: exam.key, title: pick(exam.title, locale), lead: pick(exam.lead, locale), level: exam.level, coach: exam.coach, minutes: exam.minutes,
  items: exam.items.length, tasks: exam.tasks.map((task) => ({ id: task.id, kind: task.kind })), pass: exam.pass,
  rubric: exam.rubric.map((criterion) => ({ id: criterion.id, title: pick(criterion.title, locale), max: criterion.max })),
});

function sittingView(row: SittingRow, exam: CertExam, locale: Engage['locale'], full: boolean) {
  const base = { id: row.id, exam: row.examKey, title: pick(exam.title, locale), status: row.status, started_at: row.startedAt, deadline_at: row.deadlineAt, submitted_at: row.submittedAt, certificate_id: row.certificateId, test: row.entitlementRef.startsWith('beta:') };
  if (!full) return { ...base, auto_score: row.status === 'started' ? null : row.autoScore, auto_total: row.status === 'started' ? null : row.autoTotal, decided_at: row.decidedAt };
  // Items in a per-sitting order, without keys.
  return {
    ...base,
    items: seededShuffle(exam.items, row.id).map((item) => ({ id: item.id, prompt: item.prompt, options: item.options })),
    tasks: exam.tasks.map((task) => ({ ...task, answered: !!row.responses[task.id] })),
    answers: row.answers,
    writing: Object.fromEntries(exam.tasks.filter((task) => task.kind === 'writing').map((task) => [task.id, String((row.responses[task.id] as { text?: string } | undefined)?.text ?? '')])),
    policy: exam.policy,
  };
}

async function availableSittings(e: Engage): Promise<{ refs: { ref: string; examKey: string | null }[]; beta: boolean }> {
  const used = new Set(await e.b.repo.usedEntitlements(e.userId));
  const source = currentSittingSource();
  const bought = source ? await source(e.ctx, e.userId).catch(() => []) : [];
  const refs = bought.filter((entry) => !used.has(entry.ref) && (!entry.expiresAt || Date.parse(entry.expiresAt) > e.now.getTime())).map((entry) => ({ ref: entry.ref, examKey: entry.examKey }));
  return { refs, beta: (await e.ctx.plan()).beta };
}

async function ownSitting(e: Engage, id: unknown): Promise<SittingRow> {
  const row = await e.b.repo.sitting(uuid(id, 'sitting'));
  if (!row || row.userId !== e.userId) refuse('not_found', 'Sitting not found.', 404);
  return await settleSitting(e, row!);
}

// --- Learner routes ----------------------------------------------------------------------------------
export async function listCertificates(ctx: RequestContext) {
  await ctx.requireFeature('E12');
  const e = await begin(ctx);
  const sittings = await Promise.all((await e.b.repo.sittings(e.userId)).map((row) => settleSitting(e, row)));
  const certificates = await e.b.repo.certificates(e.userId);
  const available = await availableSittings(e);
  return {
    exams: CERT_EXAMS.map((exam) => examView(exam, e.locale)),
    sittings: sittings.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((row) => sittingView(row, examByKey(row.examKey)!, e.locale, false)),
    certificates: certificates.map((row) => ({ id: row.id, exam: row.examKey, title: pick(examByKey(row.examKey)?.title ?? { en: row.examKey, uz: row.examKey, ru: row.examKey }, e.locale), level: row.level, score: row.score, code: formatCertificateCode(row.code), issued_at: row.issuedAt, revoked: !!row.revokedAt, test: row.test, verify_url: `${SITE}/verify/${formatCertificateCode(row.code)}` })),
    // A sitting is bought separately (the pricing phase owns the product); until then only beta testers sit test exams.
    available: { sittings: available.refs.length, exams: [...new Set(available.refs.map((entry) => entry.examKey).filter(Boolean))], beta: available.beta, for_sale: !!currentSittingSource() },
  };
}

export async function startSitting(ctx: RequestContext) {
  await ctx.requireFeature('E12');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const exam = examByKey(text(body.exam, 'exam', { max: 40 })) ?? refuse('not_found', 'Exam not found.', 404);
  if (!bool(body.consent, 'consent')) refuse('consent_required', 'Agree to the exam rules and monitoring first.', 400);
  const name = cleanDisplayName(body.display_name) ?? cleanDisplayName(await nameOf(ctx, e.userId)) ?? refuse('name_required', 'Enter the name to print on the certificate.', 422);
  const open = (await e.b.repo.sittings(e.userId)).find((row) => isLive(row, e.now));
  if (open) refuse('sitting_in_progress', 'You already have an exam in progress.', 409, { sitting: open.id });
  const available = await availableSittings(e);
  const chosen = available.refs.find((entry) => !entry.examKey || entry.examKey === exam.key);
  const reference = chosen?.ref ?? (available.beta ? `beta:${e.userId}:${exam.key}:${e.now.getTime()}` : null);
  if (!reference) refuse('sitting_required', 'A certificate exam needs a sitting. Buy one on the plans page.', 402, { product: 'certificate_exam', exam: exam.key });
  const { row } = await e.b.repo.createSitting({ userId: e.userId, examKey: exam.key, entitlementRef: reference!, startedAt: e.now.toISOString(), deadlineAt: new Date(e.now.getTime() + exam.minutes * 60_000).toISOString() });
  const named = await e.b.repo.updateSitting(row.id, { responses: { ...row.responses, _display_name: name } }, ['started']);
  await ctx.audit('engage.sitting_started', { exam: exam.key, beta: reference!.startsWith('beta:') }, { type: 'sitting', id: row.id });
  return { sitting: sittingView(named ?? row, exam, e.locale, true) };
}

export async function getSitting(ctx: RequestContext) {
  await ctx.requireFeature('E12');
  const e = await begin(ctx);
  const row = await ownSitting(e, ctx.query.get('id'));
  return { sitting: sittingView(row, examByKey(row.examKey)!, e.locale, row.status === 'started') };
}

export async function saveAnswers(ctx: RequestContext) {
  await ctx.requireFeature('E12');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const row = await ownSitting(e, body.sitting);
  if (row.status !== 'started') refuse('sitting_closed', 'This exam is already submitted.', 409);
  const exam = examByKey(row.examKey)!;
  const raw = jsonObject(body.answers ?? {}, 'answers', 4_000);
  const answers = { ...row.answers };
  for (const item of exam.items) if (typeof raw[item.id] === 'string' && item.options.some((option) => option.id === raw[item.id])) answers[item.id] = raw[item.id] as string;
  const responses = { ...row.responses };
  const writing = jsonObject(body.writing ?? {}, 'writing', 20_000);
  for (const task of exam.tasks.filter((entry) => entry.kind === 'writing')) {
    if (typeof writing[task.id] === 'string') responses[task.id] = { text: String(writing[task.id]).slice(0, 4_000), words: (String(writing[task.id]).match(/[\p{L}\p{N}’'-]+/gu) ?? []).length };
  }
  const next = await e.b.repo.updateSitting(row.id, { answers, responses }, ['started']) ?? refuse('sitting_closed', 'This exam is already submitted.', 409);
  return { saved: true, answered: Object.keys(next.answers).length };
}

export async function uploadTaskAudio(ctx: RequestContext) {
  await ctx.requireFeature('E12');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const row = await ownSitting(e, body.sitting);
  if (row.status !== 'started') refuse('sitting_closed', 'This exam is already submitted.', 409);
  const exam = examByKey(row.examKey)!;
  const task = exam.tasks.find((entry) => entry.id === body.task && entry.kind === 'speaking') ?? refuse('not_found', 'Task not found.', 404);
  const bytes = fromBase64(text(body.audio_base64, 'audio_base64', { max: 3_500_000, trim: false })) ?? refuse('invalid_request', 'audio_base64 is not base64.', 400, { field: 'audio_base64' });
  if (bytes.length > 2_500_000) refuse('payload_too_large', 'The recording is too large.', 413);
  const mime = audioMime(bytes, text(body.mime, 'mime', { max: 60 })) ?? refuse('invalid_request', 'The recording is not audio we can play.', 400, { field: 'audio' });
  const durationMs = integer(body.duration_ms, 'duration_ms', 2_000, ((task.speakSeconds ?? 120) + 30) * 1000);
  const storage = await e.b.storage.put(`schood-ai/engage/certificates/${row.id}/${task.id}.${mime.split('/')[1]}`, bytes, mime);
  const next = await e.b.repo.updateSitting(row.id, { responses: { ...row.responses, [task.id]: { storage, duration_ms: durationMs, mime } } }, ['started']) ?? refuse('sitting_closed', 'This exam is already submitted.', 409);
  return { saved: true, task: task.id, tasks: exam.tasks.map((entry) => ({ id: entry.id, answered: !!next.responses[entry.id] })) };
}

export async function submitSitting(ctx: RequestContext) {
  await ctx.requireFeature('E12');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const row = await ownSitting(e, body.sitting);
  if (row.status !== 'started') return { sitting: sittingView(row, examByKey(row.examKey)!, e.locale, false) };
  const next = await submit(e, row, false) ?? (await e.b.repo.sitting(row.id))!;
  await ctx.audit('engage.sitting_submitted', { exam: row.examKey }, { type: 'sitting', id: row.id });
  return { sitting: sittingView(next, examByKey(next.examKey)!, e.locale, false) };
}

// --- Proctor Lite transport -------------------------------------------------------------------------------
/** CandidateProctorState for packages/proctor-web's ProctorRuntime. */
export async function proctorState(ctx: RequestContext) {
  const e = await begin(ctx, { locale: false });
  const row = await ownSitting(e, ctx.query.get('id'));
  const exam = examByKey(row.examKey)!;
  const signals = await e.b.repo.signals(row.id);
  return {
    session: { id: row.id, state: row.status === 'started' ? 'active' : 'completed', policy_snapshot: exam.policy },
    attempt: { state: row.status === 'started' ? 'in_progress' : 'submitted', deadline_at: row.deadlineAt, section_deadline_at: row.deadlineAt },
    notices: notices(row, signals),
    server_time: e.now.toISOString(),
  };
}

export async function proctorCommand(ctx: RequestContext) {
  const e = await begin(ctx, { locale: false });
  const body = record(await ctx.body());
  const action = oneOf(body.action, 'action', ['session.heartbeat', 'events.append', 'notice.acknowledge'] as const);
  const data = record(body.data ?? {}, 'data');
  const row = await ownSitting(e, data.session_id);
  if (action === 'session.heartbeat') {
    if (row.status === 'started') await e.b.repo.updateSitting(row.id, { lastHeartbeatAt: e.now.toISOString() }, ['started']);
    return { ok: true };
  }
  if (action === 'notice.acknowledge') {
    const ids = Array.isArray(data.notice_ids) ? data.notice_ids.filter((id): id is string => typeof id === 'string' && /^away-[1-5]$/.test(id)) : [];
    const integrity = { ...row.integrity };
    for (const id of ids) integrity[`ack:${id}`] = 1;
    await e.b.repo.updateSitting(row.id, { integrity }, ['started', 'submitted']);
    return { ok: true };
  }
  // events.append: browser signals, stored once per (stream, sequence), as the proctor function does.
  const stream = text(data.stream_id, 'stream_id', { max: 64 });
  if (!/^[0-9a-f-]{36}$/i.test(stream)) refuse('invalid_request', 'stream_id must be an id.', 400, { field: 'stream_id' });
  const events = Array.isArray(data.events) ? data.events.slice(0, 100) : refuse('invalid_request', 'events must be a list.', 400, { field: 'events' });
  const rows: SittingSignal[] = [];
  for (const raw of events) {
    const event = record(raw, 'event');
    const kind = typeof event.kind === 'string' && SIGNALS.has(event.kind) ? event.kind : null;
    const seq = typeof event.sequence === 'number' && Number.isInteger(event.sequence) && event.sequence > 0 && event.sequence < 1_000_000 ? event.sequence : null;
    const at = typeof event.occurred_at === 'string' && Number.isFinite(Date.parse(event.occurred_at)) ? new Date(event.occurred_at).toISOString() : null;
    if (kind && seq && at) rows.push({ sittingId: row.id, stream, seq, kind, at });
  }
  const added = await e.b.repo.addSignals(rows);
  return { ok: true, accepted: added };
}

// --- Review (Schood admins) ------------------------------------------------------------------------------------
export async function reviewQueue(ctx: RequestContext) {
  await requireSchoodAdmin(ctx);
  const e = await begin(ctx);
  const queue = await e.b.repo.reviewQueue(50);
  const out = [];
  for (const row of queue) {
    const exam = examByKey(row.examKey)!;
    const signals = await e.b.repo.signals(row.id);
    const tasks = await Promise.all(exam.tasks.map(async (task) => {
      const response = row.responses[task.id] as { text?: string; words?: number; storage?: { provider: 's3' | 'supabase' | 'memory'; bucket: string; path: string }; duration_ms?: number } | undefined;
      return { id: task.id, kind: task.kind, prompt: task.prompt, min_words: task.minWords ?? null, max_words: task.maxWords ?? null, text: response?.text ?? null, words: response?.words ?? null, duration_ms: response?.duration_ms ?? null, audio_url: response?.storage ? await e.b.storage.url(response.storage, 900) : null };
    }));
    out.push({
      id: row.id, exam: examView(exam, e.locale), submitted_at: row.submittedAt, started_at: row.startedAt, deadline_at: row.deadlineAt, test: row.entitlementRef.startsWith('beta:'),
      auto_score: row.autoScore, auto_total: row.autoTotal, integrity: integritySummary(signals), auto_submitted: (row.integrity.auto_submitted ?? 0) > 0,
      timeline: signals.slice(-200).map((signal) => ({ kind: signal.kind, at: signal.at })), tasks,
      // The reviewer never sees who the candidate is beyond the name to print.
      display_name: String(row.responses._display_name ?? ''), mine: row.userId === e.userId,
    });
  }
  return { queue: out };
}

export async function decideSitting(ctx: RequestContext) {
  await requireSchoodAdmin(ctx);
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const row = await e.b.repo.sitting(uuid(body.sitting, 'sitting')) ?? refuse('not_found', 'Sitting not found.', 404);
  if (row.userId === e.userId) refuse('reviewer_conflict', 'You cannot review your own exam.', 403);
  if (row.status !== 'submitted') refuse('already_decided', 'This sitting is already decided.', 409);
  const exam = examByKey(row.examKey)!;
  const rubricRaw = record(body.rubric, 'rubric');
  const rubric: Record<string, number> = {};
  for (const criterion of exam.rubric) rubric[criterion.id] = integer(rubricRaw[criterion.id], `rubric.${criterion.id}`, 0, criterion.max);
  const integrity = oneOf(body.integrity, 'integrity', ['clear', 'insufficient_evidence', 'confirmed'] as const);
  const note = optionalText(body.note, 'note', { max: 500 });
  const rubricTotal = Object.values(rubric).reduce((sum, value) => sum + value, 0), rubricMax = exam.rubric.reduce((sum, criterion) => sum + criterion.max, 0);
  const itemsOk = (row.autoScore ?? 0) / Math.max(1, row.autoTotal ?? exam.items.length) >= exam.pass.itemsRatio - 1e-9;
  const rubricOk = rubricTotal / rubricMax >= exam.pass.rubricRatio - 1e-9 && Object.values(rubric).every((value) => value >= exam.pass.minEach);
  // Proctor Lite review: a confirmed integrity finding voids the sitting; signals alone never fail anyone.
  const status = integrity === 'confirmed' ? 'voided' : itemsOk && rubricOk ? 'passed' : 'failed';
  const score = Math.round((((row.autoScore ?? 0) / Math.max(1, row.autoTotal ?? 1)) * 0.5 + (rubricTotal / rubricMax) * 0.5) * 100);
  const decided = await e.b.repo.updateSitting(row.id, { status, review: { rubric, rubric_total: rubricTotal, rubric_max: rubricMax, integrity, note, items_ok: itemsOk, rubric_ok: rubricOk }, reviewerId: e.userId, decidedAt: e.now.toISOString() }, ['submitted']);
  if (!decided) refuse('already_decided', 'This sitting is already decided.', 409);
  let certificate = null;
  if (status === 'passed') {
    certificate = await e.b.repo.issueCertificate({ code: generateCertificateCode(), userId: row.userId, examKey: exam.key, level: exam.level, displayName: String(row.responses._display_name ?? 'Schood learner'), score, issuedAt: e.now.toISOString(), sittingId: row.id, test: row.entitlementRef.startsWith('beta:') });
    await e.b.repo.updateSitting(row.id, { certificateId: certificate.id }, ['passed']);
  }
  // The result (pass, fail or void) is ready: one message, inside the person's own budget.
  const candidate = await e.b.repo.profile(row.userId);
  await e.b.repo.enqueue([{ userId: row.userId, channel: 'telegram', kind: 'certificate_ready', priority: PRIORITY.certificate_ready, dedupeKey: `certificate_ready:${row.id}`, payload: { ...message('certificate_ready', candidate.locale, { exam: pick(exam.title, candidate.locale) }), data: { sitting: row.id } }, dueAt: e.now.toISOString(), expiresAt: new Date(e.now.getTime() + 7 * 86_400_000).toISOString() }]);
  await ctx.audit('engage.sitting_decided', { exam: exam.key, status, integrity, rubric_total: rubricTotal }, { type: 'sitting', id: row.id });
  return { status, certificate: certificate ? { code: formatCertificateCode(certificate.code), verify_url: `${SITE}/verify/${formatCertificateCode(certificate.code)}` } : null };
}

export async function revokeCertificate(ctx: RequestContext) {
  await requireSchoodAdmin(ctx);
  const e = await begin(ctx, { locale: false });
  const body = record(await ctx.body());
  const code = normalizeCertificateCode(body.code) ?? refuse('not_found', 'No certificate has this code.', 404);
  const row = await e.b.repo.certificateByCode(code) ?? refuse('not_found', 'No certificate has this code.', 404);
  const reason = text(body.reason, 'reason', { max: 300 });
  if (!(await e.b.repo.revokeCertificate(row.id, e.now.toISOString()))) refuse('already_revoked', 'This certificate is already revoked.', 409);
  await ctx.audit('engage.certificate_revoked', { reason }, { type: 'certificate', id: row.id });
  return { ok: true };
}
