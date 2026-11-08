// Preview data for the coach: a deck with due and new cards, weeks of reviews and two
// graded tests for the then-versus-now view, an opt-in team feed, and canned AI replies.
import { ALL_PHRASES } from '../../../supabase/functions/company/coach/phrasebook/index.ts';
import type { FakeDb } from '../../../supabase/functions/company/testing.ts';
import type { World } from './boot.ts';

const DAY = 86_400_000;
type Row = Record<string, unknown>;
const tashkent = (at: Date) => new Date(at.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);

export function seed(db: FakeDb, world: World) {
  const { orgId, now } = world;
  const members = db.rows('company_members') as Row[];
  const byUser = (id: string) => members.find((row) => row.user_id === id)!;
  const employee = byUser(world.personas.employee.id);
  const manager = byUser(world.personas.manager.id);
  const today = tashkent(now);
  const dayAt = (daysAhead: number) => tashkent(new Date(now.getTime() + daysAhead * DAY));
  const at = (daysBack: number) => new Date(now.getTime() - daysBack * DAY).toISOString();

  db.rows('company_coach_settings').push(
    { member_id: employee.id, org_id: orgId, user_id: employee.user_id, weekly_goal: 4, daily_minutes: 10, rest_days: [0], leave: [], kudos_opt_in: true, sync_key: null },
    { member_id: manager.id, org_id: orgId, user_id: manager.user_id, weekly_goal: 3, daily_minutes: 10, rest_days: [0, 6], leave: [], kudos_opt_in: true, sync_key: null },
  );

  // Due, later and new cards from the phrasebook, so every screen of the review has something on it.
  const phrases = ALL_PHRASES.filter((phrase) => phrase.situation === 'complaint' || phrase.situation === 'small_talk');
  phrases.slice(0, 26).forEach((phrase, index) => {
    const reviewed = index < 14;
    db.rows('company_coach_cards').push({
      id: crypto.randomUUID(), org_id: orgId, member_id: employee.id, user_id: employee.user_id, source: index % 5 === 0 ? 'finder' : 'phrasebook', source_ref: phrase.id,
      front: phrase.en, front_key: phrase.en.toLowerCase().replace(/[.!?]+$/, ''), ru: phrase.ru, uz: phrase.uz, note: null,
      state: reviewed ? 'review' : 'new', stability: reviewed ? 2 + index * 2 : 0, difficulty: 5, reps: reviewed ? 1 + index % 5 : 0, lapses: 0,
      due_on: reviewed ? dayAt(index < 6 ? 0 : index) : null, last_reviewed_at: reviewed ? at(3) : null, suspended: false, created_at: at(20 - index % 10),
    });
  });

  // Past practice in the log, for the review and shadowing badges.
  for (let back = 30; back >= 1; back--) {
    if (back % 3 === 0) continue;
    const day = dayAt(-back);
    for (let n = 0; n < 8; n++) db.rows('company_coach_log').push({ id: db.rows('company_coach_log').length + 1, org_id: orgId, member_id: employee.id, user_id: employee.user_id, day, kind: 'review', ref: `seed:${back}:${n}`, score: 75, created_at: at(back) });
    if (back % 2) db.rows('company_coach_log').push({ id: db.rows('company_coach_log').length + 1, org_id: orgId, member_id: employee.id, user_id: employee.user_id, day, kind: 'shadow', ref: `p:seed-${back}`, score: 80, created_at: at(back) });
    if (back % 4 === 1) db.rows('company_coach_log').push({ id: db.rows('company_coach_log').length + 1, org_id: orgId, member_id: employee.id, user_id: employee.user_id, day, kind: 'plan_done', ref: day, score: null, created_at: at(back) });
  }

  // Two graded company tests, for then and now.
  const assessment = (title: string, kind: string) => {
    const id = crypto.randomUUID();
    db.rows('company_assessments').push({ id, org_id: orgId, title, kind, status: 'closed', created_at: at(60) });
    return id;
  };
  const skills = (reading: number, listening: number, grammar: number, speaking: number) => ({
    reading: { score: reading, level: 'a2' }, listening: { score: listening, level: 'a2' }, grammar: { score: grammar, level: 'a2' }, speaking: { score: speaking, level: 'a2' },
  });
  db.rows('company_attempts').push(
    { id: crypto.randomUUID(), org_id: orgId, assessment_id: assessment('Staff placement test', 'placement'), member_id: employee.id, user_id: employee.user_id, status: 'graded', overall_level: 'a2', overall_score: 34, skill_results: skills(38, 30, 36, 24), started_at: at(45), graded_at: at(45), certificate_code: 'PREVCOACH1' },
    { id: crypto.randomUUID(), org_id: orgId, assessment_id: assessment('Autumn progress test', 'progress'), member_id: employee.id, user_id: employee.user_id, status: 'graded', overall_level: 'b1', overall_score: 49, skill_results: skills(55, 47, 50, 36), started_at: at(6), graded_at: at(6), certificate_code: 'PREVCOACH2' },
  );

  // A little team feed. Two people opted in, and one shared a badge herself.
  db.rows('company_coach_kudos').push(
    { id: crypto.randomUUID(), org_id: orgId, from_member: manager.id, to_member: employee.id, kind: 'kudos', message: 'great_call', note: 'The guest from Berlin was very happy.', badge: null, day: dayAt(-2), created_at: at(2) },
    { id: crypto.randomUUID(), org_id: orgId, from_member: employee.id, to_member: manager.id, kind: 'kudos', message: 'helped_me', note: null, badge: null, day: dayAt(-1), created_at: at(1) },
    { id: crypto.randomUUID(), org_id: orgId, from_member: manager.id, to_member: null, kind: 'badge', message: null, note: null, badge: 'plans_10', day: today, created_at: at(0) },
  );
}

export const ai = {
  'company-phrase-finder': (payload: unknown) => {
    const { tone } = payload as { tone?: string };
    return {
      options: [
        { english: tone === 'friendly' ? 'Hi, just checking when you can settle the invoice?' : 'Could you let me know when you expect to pay this invoice?', note: 'Вежливо и прямо: подходит для письма или звонка клиенту.', back: 'Не могли бы вы сообщить, когда планируете оплатить этот счёт?' },
        { english: 'I wanted to check the payment date for this invoice.', note: 'Мягче: хорошо для первого напоминания.', back: 'Я хотел уточнить дату оплаты этого счёта.' },
      ],
    };
  },
};
