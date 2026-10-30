import { cleanDisplayName, generateCertificateCode } from '../../_shared/english-certificate.ts';
import {
  levelLabel, overallScale, reachedMilestones, updateMastery,
  type Assessment, type MasteryState, type Rubric,
} from '../../../../packages/coach-packs/src/mod.ts';
import type { LearningEventKind } from '../types.ts';
import type { Bot } from './bot.ts';
import type { Certificate, ScoreRow, Session, Turn } from './store.ts';
import { addDays } from './time.ts';

// Recording results: scores with their evidence, the learner model, verified
// learning events, streaks and minutes, and level-up certificates. Everything here
// runs after a real learning act (a scored answer, a checked set, a reviewed card).

export function scoreRows(bot: Bot, session: Session, turn: Turn | null, assessment: Assessment, source: ScoreRow['source'] = 'model'): ScoreRow[] {
  const base = { sessionId: session.id, turnId: turn?.id ?? null, userId: bot.enrollment.userId, pack: bot.pack.manifest.id, rubric: assessment.rubric, source };
  return [
    ...assessment.criteria.map((criterion): ScoreRow => ({ ...base, criterion: criterion.id, score: criterion.status === 'scored' ? criterion.score : null, status: criterion.status, evidence: criterion.evidence })),
    { ...base, criterion: 'overall', score: assessment.overall, status: assessment.overall === null ? 'insufficient_evidence' : 'scored', evidence: [] },
  ];
}

/** Moves the learner model: each scored criterion moves its node; errors count against their tag's node. */
export async function learnFrom(bot: Bot, rubric: Rubric, assessment: Assessment): Promise<void> {
  const rows = await bot.mastery(), now = bot.ctx.now(), changed = new Map<string, MasteryState>();
  for (const criterion of rubric.criteria) {
    const result = assessment.criteria.find((entry) => entry.id === criterion.id);
    if (!result || result.score === null) continue;
    changed.set(criterion.node, updateMastery(changed.get(criterion.node) ?? rows.get(criterion.node) ?? null, criterion.node, { score: result.score, scale: rubric.scale, at: now }));
  }
  const byNode = new Map<string, string[]>();
  for (const error of assessment.errors) {
    const node = bot.pack.errorById.get(error.tag)?.node;
    if (node) byNode.set(node, [...(byNode.get(node) ?? []), error.tag]);
  }
  for (const [node, tags] of byNode) changed.set(node, updateMastery(changed.get(node) ?? rows.get(node) ?? null, node, { scale: bot.pack.manifest.scale, at: now, errors: tags }));
  await bot.store.saveMastery(bot.enrollment.userId, bot.pack.manifest.id, [...changed.values()]);
}

/** An accuracy result (a set, a drill, shadowing) for a node. */
export async function learnAccuracy(bot: Bot, node: string, accuracy: number, relieve?: { tag: string; correct: number }): Promise<void> {
  const rows = await bot.mastery();
  let state = updateMastery(rows.get(node) ?? null, node, { accuracy, scale: bot.pack.manifest.scale, at: bot.ctx.now() });
  if (relieve && state.errors[relieve.tag]) {
    // Fixing an error in a drill eases its weight, so the plan moves on to the next one.
    state = { ...state, errors: { ...state.errors, [relieve.tag]: { ...state.errors[relieve.tag], weight: Math.max(0, state.errors[relieve.tag].weight * (1 - 0.12 * relieve.correct)) } } };
  }
  const errorNode = relieve ? bot.pack.errorById.get(relieve.tag)?.node : undefined;
  const extra: MasteryState[] = [];
  if (errorNode && errorNode !== node && rows.get(errorNode)?.errors[relieve!.tag]) {
    const other = rows.get(errorNode)!;
    extra.push({ ...other, errors: { ...other.errors, [relieve!.tag]: { ...other.errors[relieve!.tag], weight: Math.max(0, other.errors[relieve!.tag].weight * (1 - 0.12 * relieve!.correct)) } } });
  }
  await bot.store.saveMastery(bot.enrollment.userId, bot.pack.manifest.id, [state, ...extra]);
}

/** Minutes of verified practice and the daily streak, in the learner's local days. */
export function recordPractice(bot: Bot, minutes: number): void {
  const today = bot.local().day, last = bot.enrollment.lastActiveDay;
  let streak = bot.enrollment.streakCurrent;
  if (last !== today) streak = last === addDays(today, -1) ? streak + 1 : 1;
  bot.update({
    lastActiveDay: today, streakCurrent: streak, streakBest: Math.max(bot.enrollment.streakBest, streak),
    verifiedMinutes: bot.enrollment.verifiedMinutes + Math.max(0, Math.round(minutes)),
  });
}

export function emit(bot: Bot, kind: LearningEventKind, input: { node: string; minutes?: number; score?: number | null; outcome?: string; ref: string }): void {
  const verified = ['turn_scored', 'check_passed', 'drill_finished', 'mock_finished', 'outcome_recorded'].includes(kind);
  bot.ctx.events.emit({
    kind, area: 'coach', feature: bot.feature, skill: `${bot.pack.manifest.id}.${input.node}`,
    verified_minutes: verified ? Math.min(240, Math.max(0, Math.round(input.minutes ?? 0))) : 0,
    ...(typeof input.score === 'number' && Number.isFinite(input.score) ? { score: Math.round(input.score * 100) / 100 } : {}),
    ...(input.outcome ? { outcome: input.outcome } : {}),
    ref: input.ref,
  });
}

const randomBytes = (bytes: Uint8Array) => crypto.getRandomValues(bytes);

/** After a finished, scored session: issues any milestone newly reached and announces it. */
export async function checkMilestones(bot: Bot, rubricId: string): Promise<Certificate[]> {
  const pack = bot.pack, now = bot.ctx.now();
  const longest = Math.max(1, ...pack.milestones.filter((milestone) => milestone.rule.rubric === rubricId).map((milestone) => milestone.rule.withinDays));
  const sessions = await bot.store.results(bot.enrollment.userId, pack.manifest.id, { rubric: rubricId, since: new Date(now.getTime() - longest * 86_400_000).toISOString(), limit: 100 });
  const results = sessions.map((session) => ({ sessionId: session.id, rubric: session.rubric!, at: session.finishedAt ?? session.startedAt, overall: session.overall, criteria: (session.summary.criteria ?? {}) as Record<string, number | null> }));
  const achieved = new Set((await bot.store.certificates(bot.enrollment.userId, pack.manifest.id)).filter((cert) => !cert.revokedAt).map((cert) => cert.milestone));
  const issued: Certificate[] = [];
  const profile = await bot.ctx.repo.profile(bot.enrollment.userId);
  const name = cleanDisplayName(profile?.name) ?? cleanDisplayName(bot.request?.firstName) ?? 'Schood learner';
  for (const { milestone, results: evidence } of reachedMilestones(pack, results, achieved, now)) {
    if (!milestone.certificate) continue;
    const rubric = pack.rubricById.get(milestone.rule.rubric)!;
    const cert = await bot.store.issueCertificate({
      code: generateCertificateCode(randomBytes), userId: bot.enrollment.userId, pack: pack.manifest.id, packVersion: pack.manifest.version, milestone: milestone.id, rubric: rubric.id,
      level: milestone.level, levelLabel: levelLabel(milestone.rule.metric === 'overall' ? overallScale(rubric) : rubric.scale, milestone.level),
      displayName: name,
      evidence: evidence.map((result) => ({ session_id: result.sessionId, at: result.at, overall: result.overall })),
    });
    issued.push(cert);
    // The qualifying answers are kept past retention: they are the certificate's evidence.
    for (const result of evidence) for (const turn of await bot.store.turns(result.sessionId)) if (turn.role === 'learner') await bot.store.keepTurn(turn.id);
    emit(bot, 'check_passed', { node: rubric.criteria[0].node, minutes: 0, score: milestone.level, outcome: `level_up_${String(milestone.level).replace('.', '_')}`.slice(0, 40), ref: cert.id });
    await bot.ctx.audit('coach.certificate_issued', { pack: pack.manifest.id, milestone: milestone.id, level: milestone.level }, { type: 'coach_certificate', id: cert.id });
    bot.text(bot.t('cert.earned', { name: milestoneName(bot, milestone.id), count: evidence.length }), [[{ text: bot.p('cert.open'), url: `${bot.runtime.config.appUrl}/coach/verify/${cert.code}` }]]);
  }
  return issued;
}
const milestoneName = (bot: Bot, id: string) => {
  const milestone = bot.pack.milestones.find((entry) => entry.id === id);
  return milestone ? (milestone.name[bot.locale] ?? milestone.name.en ?? id) : id;
};

/** Finishes a session with its result, credits the practice and checks level-ups. */
export async function finishSession(bot: Bot, session: Session, result: { overall: number | null; summary: Record<string, unknown>; minutes: number; event: LearningEventKind | null; node: string; score?: number | null; credited?: boolean }): Promise<Session> {
  const finished = (await bot.store.updateSession(session.id, { status: 'finished', overall: result.overall, summary: result.summary, minutes: Math.min(240, Math.max(1, Math.round(result.minutes))), finishedAt: bot.ctx.now().toISOString() }))!;
  if (!result.credited) recordPractice(bot, result.minutes);
  // Practice sets already reported each scored answer; a session event is for mocks, sets and drills.
  if (result.event) emit(bot, result.event, { node: result.node, minutes: result.minutes, score: result.score ?? result.overall, ref: session.id });
  if (finished.rubric && result.overall !== null) await checkMilestones(bot, finished.rubric);
  // The very first scored answer of each kind is kept for "then vs now".
  const earlier = await bot.store.sessions(bot.enrollment.userId, bot.pack.manifest.id, { limit: 2, kind: session.kind, status: 'finished' });
  if (earlier.length === 1) for (const turn of (await bot.store.turns(session.id)).filter((entry) => entry.role === 'learner').slice(0, 1)) await bot.store.keepTurn(turn.id);
  return finished;
}

/** A criterion map of an assessment for session summaries and milestones. */
export const criteriaOf = (assessment: Assessment) => Object.fromEntries(assessment.criteria.map((criterion) => [criterion.id, criterion.score]));
