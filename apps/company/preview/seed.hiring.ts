// Preview data for hiring: a "Front desk receptionist" hiring test with candidates
// in every state, a staff placement campaign and a front-office progress check,
// plus AI stubs for writing and speaking grading (feedback in the workspace's
// Russian, as HR would get it). Attempts are played through the real engine so
// reports, levels and flags look the way production does.
import { overallScore, scoreToLevel, type JobRole, type Skill } from '../../../packages/company-core/src/mod.ts';
import { CHOICES, QUESTIONS } from '../../../supabase/functions/company/hiring/bank/index.ts';
import { advance, createSections, type Answers, type Results, type Section } from '../../../supabase/functions/company/hiring/engine.ts';
import type { FakeDb } from '../../../supabase/functions/company/testing.ts';
import type { World } from './boot.ts';

/** Open the candidate test in preview at /t/previewFrontDeskReceptionist2026. */
export const PREVIEW_LINK = 'previewFrontDeskReceptionist2026';
const LINK_HASH = '6f29ce78816d08964b96910e8c5224ad61936f53fa2f93870679d5135a466a57';
const DAY = 86_400_000;
const ALL: Skill[] = ['grammar', 'vocabulary', 'reading', 'listening', 'writing', 'speaking'];

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const WRITING: Record<'strong' | 'mid' | 'weak', string> = {
  strong: 'Dear Mr Lee,\n\nThank you for choosing Silk Road Hotels. I am pleased to confirm your booking of a deluxe double room from 14 to 17 November, three nights in total, with breakfast included.\n\nAs requested, we have arranged an airport transfer on your arrival day; our driver will be waiting at the exit with a sign showing your name. Check-in is from 2 p.m., but if your flight lands early we will do our best to have the room ready.\n\nPlease let me know if you need anything else before your stay. We look forward to welcoming you to Tashkent.\n\nKind regards,\nFront office',
  mid: 'Dear Mr Lee,\n\nThank you for your booking. Your room is booked from 14 November to 17 November, it is double room with breakfast. We can organise taxi from the airport, the price is 15 dollars. Check-in time is 2 pm and check-out is 12.\n\nIf you have questions please write me.\n\nBest regards',
  weak: 'Hello. Your room is ready for 14 November. Breakfast is have. Taxi is possible. Thank you.',
};
const SPEAKING: Record<'strong' | 'mid' | 'weak', string> = {
  strong: 'Good evening and welcome to Silk Road Hotels. I am really sorry you had to wait. Let me check your reservation straight away. I can see your room was booked for tonight, but there was a problem with the cleaning, so I would like to offer you an upgrade to a suite at no extra cost, and a complimentary dinner in our restaurant while it is prepared.',
  mid: 'Good evening, welcome. I am sorry for the waiting. I will check your booking now. Your room is not ready yet because cleaning is late, so please wait maybe twenty minutes in the lobby, we can give you tea or coffee free.',
  weak: 'Hello welcome sorry room not ready please wait we give tea',
};

interface Played { sections: Section[]; answers: Answers; results: Results }

/** Plays a whole test through the engine, answering each objective question right with probability `accuracy`. */
function play(skills: Skill[], jobRole: JobRole, accuracy: number, seed: number, tier: 'strong' | 'mid' | 'weak', now: Date, stopAfter = 99): Played {
  const rng = seeded(seed), coin = seeded(seed * 7 + 1);
  const options = { jobRole, rng, now: now.toISOString(), fallback: 'b1' as const };
  let sections = createSections(skills, options), results: Results = {}, answers: Answers = {};
  for (let step = 0; step < 40 && step < stopAfter; step++) {
    const active = sections.find((section) => section.status === 'active');
    if (!active) break;
    const pick = (id: string, served: string[]) => {
      const item = CHOICES.get(id) ?? QUESTIONS.get(id)!.question;
      const key = served.indexOf(item.options[item.answer]);
      return coin() < accuracy ? key : (key + 1 + Math.floor(coin() * (served.length - 1))) % served.length;
    };
    for (const stage of active.stages ?? []) for (const item of stage.items) answers[item.id] ??= pick(item.id, item.options);
    for (const passage of active.passages ?? []) for (const question of passage.questions) answers[question.id] ??= pick(question.id, question.options);
    for (const task of active.tasks ?? []) answers[task.id] = active.skill === 'writing' ? WRITING[tier] : { transcript: SPEAKING[tier], mode: tier === 'weak' ? 'typed' : 'speech' };
    const moved = advance(sections, answers, results, options);
    sections = moved.sections;
    results = moved.results;
    if (moved.finished) break;
  }
  return { sections, answers, results };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** A fixed, valid certificate code for seeded rows (same alphabet as readableCode). */
const code = (prefix: string, n: number) => (prefix + Array.from({ length: 10 }, (_, index) => CODE_ALPHABET[(n * 7 + index * 13 + n * index) % CODE_ALPHABET.length]).join('')).slice(0, 10);

const words = (text: string) => (text.trim().match(/[\p{L}\p{N}'’-]+/gu) ?? []).length;

/** A plausible rubric reply from the length and variety of the answers (the preview has no real AI). */
function grade(payload: unknown, speaking: boolean) {
  const tasks = ((payload as { tasks?: { answer: string; suggested_words?: number; suggested_seconds?: number }[] }).tasks ?? []);
  const text = tasks.map((task) => task.answer).join(' ');
  const count = words(text);
  const target = tasks.reduce((sum, task) => sum + (speaking ? Math.round((task.suggested_seconds ?? 60) * 1.1) : task.suggested_words ?? 100), 0) || 1;
  const unique = new Set(text.toLowerCase().match(/[a-z']+/g) ?? []).size;
  const variety = count ? unique / count : 0;
  const base = Math.max(8, Math.min(90, Math.round(18 + 42 * Math.min(1, count / target) + 30 * variety + (/\b(would|could|which|although|arranged|complimentary)\b/i.test(text) ? 8 : 0))));
  const criteria: Record<string, number> = { task: base + 4, organisation: base - 2, grammar: base - 4, vocabulary: base + 2 };
  if (speaking) Object.assign(criteria, { fluency: base, pronunciation: base - 3 });
  for (const key of Object.keys(criteria)) criteria[key] = Math.max(0, Math.min(100, criteria[key]));
  const band = base >= 65 ? 'high' : base >= 45 ? 'mid' : 'low';
  const feedback = {
    high: {
      strengths: ['Вежливый деловой тон, уместный для гостя отеля', 'Все пункты задания раскрыты, ответ хорошо структурирован', 'Точная лексика: «complimentary», «arranged», «upgrade»'],
      improvements: ['Можно чуть короче вступление', 'Следить за артиклями перед названиями услуг'],
      summary: 'Уверенный рабочий английский: кандидат справится с перепиской и разговором с гостями самостоятельно.',
    },
    mid: {
      strengths: ['Основные пункты задания раскрыты', 'Понятная структура: приветствие, суть, прощание'],
      improvements: ['Пропуски артиклей («it is double room»)', 'Мало связующих слов; предложения короткие и однотипные', 'Стоит расширить словарь сервиса: «arrange», «complimentary», «I would be happy to»'],
      summary: 'Рабочий уровень для типовых ситуаций; в сложных разговорах понадобится поддержка и обучение.',
    },
    low: {
      strengths: ['Понятна основная мысль', 'Есть вежливое приветствие'],
      improvements: ['Грамматика глагола: «Breakfast is have» → «Breakfast is included»', 'Ответ слишком короткий, пункты задания не раскрыты', 'Нужны базовые фразы для общения с гостями'],
      summary: 'Пока недостаточно для самостоятельной работы с иностранными гостями.',
    },
  }[band];
  return { criteria, ...feedback };
}

export const ai: Record<string, (payload: unknown) => unknown> = {
  'company-writing-grade': (payload) => grade(payload, false),
  'company-speaking-grade': (payload) => grade(payload, true),
};

/** Fills writing and speaking results the way the grading module would. */
function gradeProduction(played: Played, at: string) {
  const feedback: Record<string, unknown> = { pending: [], reason: null, tried_at: at };
  for (const skill of ['writing', 'speaking'] as const) {
    const section = played.sections.find((entry) => entry.skill === skill);
    if (!section?.tasks) continue;
    const reply = grade({ tasks: section.tasks.map((task) => ({ answer: typeof played.answers[task.id] === 'string' ? played.answers[task.id] : (played.answers[task.id] as { transcript: string }).transcript, suggested_words: task.target, suggested_seconds: task.target })) }, skill === 'speaking');
    const values = Object.values(reply.criteria);
    const score = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10;
    played.results[skill] = { score, level: scoreToLevel(score), source: 'ai', at, ...(skill === 'speaking' ? { transcript_based: true } : {}) };
    const typed = skill === 'speaking' && section.tasks.every((task) => (played.answers[task.id] as { mode?: string })?.mode === 'typed');
    if (typed) delete (reply.criteria as Record<string, number>).pronunciation;
    feedback[skill] = { ...reply, locale: 'ru', ...(skill === 'speaking' ? { typed_only: typed } : {}) };
  }
  return feedback;
}

function overall(results: Results, sections: Section[]) {
  const score = overallScore(Object.fromEntries(sections.map((section) => [section.skill, results[section.skill]?.score ?? 0]))) ?? 0;
  return { overall_score: score, overall_level: scoreToLevel(score) };
}

export function seed(db: FakeDb, world: World) {
  const now = world.now.getTime();
  const at = (daysAgo: number, minutes = 0) => new Date(now - daysAgo * DAY + minutes * 60_000).toISOString();
  const hr = world.personas.hr.id;

  // ----- Hiring test: Front desk receptionist -----
  const testId = '00000000-0000-4000-8000-00000000f001';
  db.rows('company_assessments').push({
    id: testId, org_id: world.orgId, kind: 'hiring', title: 'Front desk receptionist', job_role: 'hospitality', skills: ALL, min_level: 'b1',
    time_limit_minutes: 59, status: 'open', link_token_hash: LINK_HASH, max_attempts: 100, closes_at: at(-21), settings: { show_level: true },
    created_by: hr, created_at: at(9), updated_at: at(9),
  });
  try { localStorage.setItem(`company-hiring-link:${testId}`, `${location.origin}/t/${PREVIEW_LINK}`); } catch { /* preview only */ }

  const candidates: { name: string; email: string; phone: string; accuracy: number; tier: 'strong' | 'mid' | 'weak'; state: 'graded' | 'pending' | 'started' | 'expired'; decision?: string; notes?: string; days: number; integrity?: Record<string, unknown>; code?: string }[] = [
    { name: 'Madina Yuldasheva', email: 'madina.yu@mail.uz', phone: '+998 90 412 33 18', accuracy: 0.93, tier: 'strong', state: 'graded', decision: 'shortlist', notes: 'Сильная устная часть. Пригласить на интервью в четверг.', days: 6, code: 'SRH7K2M9QX', integrity: { tab_hidden: 0, paste: 0, copy: 0, fullscreen_exit: 0 } },
    { name: 'Javohir Rasulov', email: 'javohir.r@gmail.com', phone: '+998 93 551 07 42', accuracy: 0.72, tier: 'mid', state: 'graded', decision: 'hold', notes: 'Хорошо по чтению, письмо слабее. Рассмотреть на ночную смену.', days: 5, code: 'SRH4T8N2WP', integrity: { tab_hidden: 3, paste: 1, copy: 0, fullscreen_exit: 1, ip_hash: 'preview-net-a' } },
    { name: 'Dilshod Ergashev', email: 'dilshod.erg@mail.ru', phone: '+998 97 300 64 11', accuracy: 0.38, tier: 'weak', state: 'graded', decision: 'reject', days: 4, code: 'SRH9C3L6ZD', integrity: { tab_hidden: 9, paste: 0, copy: 2, fullscreen_exit: 0, ip_hash: 'preview-net-a' } },
    { name: 'Sevara Normatova', email: 'sevara.n@inbox.uz', phone: '+998 99 870 15 26', accuracy: 0.97, tier: 'strong', state: 'graded', days: 2, code: 'SRH2V5H8JM', integrity: { tab_hidden: 1 } },
    { name: 'Akmal Toshpulatov', email: 'akmal.t@gmail.com', phone: '+998 91 233 48 90', accuracy: 0.66, tier: 'mid', state: 'pending', days: 1, integrity: { tab_hidden: 2 } },
    { name: 'Nigora Sobirova', email: 'nigora.s@mail.uz', phone: '+998 95 640 72 03', accuracy: 0.8, tier: 'mid', state: 'started', days: 0 },
    { name: 'Rustam Khamidov', email: 'rustam.kh@mail.uz', phone: '', accuracy: 0.5, tier: 'weak', state: 'expired', days: 3 },
  ];
  candidates.forEach((candidate, index) => {
    const started = new Date(now - candidate.days * DAY - (index + 2) * 3_600_000);
    const startedIso = started.toISOString();
    const id = `00000000-0000-4000-8000-00000000f1${String(index).padStart(2, '0')}`;
    const base = { id, org_id: world.orgId, assessment_id: testId, member_id: null, user_id: null, candidate_name: candidate.name, candidate_email: candidate.email, candidate_phone: candidate.phone || null, access_token_hash: null, started_at: startedIso, created_at: startedIso, decision: candidate.decision ?? null, decision_by: candidate.decision ? hr : null, notes: candidate.notes ?? null };
    if (candidate.state === 'expired') {
      const sections = createSections(ALL, { jobRole: 'hospitality', rng: seeded(90 + index), now: startedIso, fallback: 'b1' }).map((section) => ({ ...section, status: 'done' as const }));
      db.rows('company_attempts').push({ ...base, status: 'expired', deadline_at: new Date(started.getTime() + 59 * 60_000).toISOString(), submitted_at: new Date(started.getTime() + 62 * 60_000).toISOString(), graded_at: null, items: sections, answers: {}, overall_level: null, overall_score: null, skill_results: Object.fromEntries(ALL.map((skill) => [skill, { score: 0, level: 'pre_a1', source: 'skipped' }])), ai_feedback: {}, integrity: { auto_submitted: true }, certificate_code: null, updated_at: startedIso });
      return;
    }
    if (candidate.state === 'started') {
      const played = play(ALL, 'hospitality', candidate.accuracy, 40 + index, candidate.tier, started, 4);
      const live = new Date(now - 12 * 60_000);
      db.rows('company_attempts').push({ ...base, started_at: live.toISOString(), created_at: live.toISOString(), status: 'started', deadline_at: new Date(live.getTime() + 59 * 60_000).toISOString(), submitted_at: null, graded_at: null, items: played.sections, answers: played.answers, overall_level: null, overall_score: null, skill_results: played.results, ai_feedback: {}, integrity: { tab_hidden: 1, section_seconds: { grammar: 260, vocabulary: 240 } }, certificate_code: null, updated_at: live.toISOString() });
      return;
    }
    const played = play(ALL, 'hospitality', candidate.accuracy, 40 + index, candidate.tier, started);
    const submitted = new Date(started.getTime() + (41 + index * 3) * 60_000).toISOString();
    const seconds = { grammar: 380 + index * 20, vocabulary: 340, reading: 690, listening: 560, writing: 820 - index * 40, speaking: 300 };
    const integrity = { ...candidate.integrity, section_seconds: seconds, user_agent: 'Mozilla/5.0 (preview)' };
    if (candidate.state === 'pending') {
      db.rows('company_attempts').push({ ...base, status: 'submitted', deadline_at: new Date(started.getTime() + 59 * 60_000).toISOString(), submitted_at: submitted, graded_at: null, items: played.sections, answers: played.answers, overall_level: null, overall_score: null, skill_results: played.results, ai_feedback: { pending: ['writing', 'speaking'], reason: 'ai_unavailable', tried_at: submitted }, integrity, certificate_code: null, updated_at: submitted });
      return;
    }
    const feedback = gradeProduction(played, submitted);
    db.rows('company_attempts').push({ ...base, status: 'graded', deadline_at: new Date(started.getTime() + 59 * 60_000).toISOString(), submitted_at: submitted, graded_at: submitted, items: played.sections, answers: played.answers, ...overall(played.results, played.sections), skill_results: played.results, ai_feedback: feedback, integrity, certificate_code: candidate.code ?? null, updated_at: submitted });
  });

  // ----- Staff placement campaign for everyone, and a front-office progress check -----
  const placementId = '00000000-0000-4000-8000-00000000f002';
  const progressId = '00000000-0000-4000-8000-00000000f003';
  const staffSkills: Skill[] = ['grammar', 'vocabulary', 'reading', 'listening'];
  db.rows('company_assessments').push(
    { id: placementId, org_id: world.orgId, kind: 'placement', title: 'Autumn placement — all staff', job_role: 'general', skills: staffSkills, min_level: null, time_limit_minutes: 36, status: 'open', link_token_hash: null, max_attempts: null, closes_at: at(-14), settings: { show_level: true, audience: { type: 'all', ids: [] }, retest_days: 90, member_role: true }, created_by: hr, created_at: at(42), updated_at: at(42) },
    { id: progressId, org_id: world.orgId, kind: 'progress', title: 'Front office progress check', job_role: 'general', skills: [...staffSkills, 'speaking'], min_level: null, time_limit_minutes: 44, status: 'open', link_token_hash: null, max_attempts: null, closes_at: at(-30), settings: { show_level: true, audience: { type: 'departments', ids: [world.departments.front] }, retest_days: 60, member_role: true }, created_by: hr, created_at: at(3), updated_at: at(3) },
  );
  const members = db.rows('company_members').filter((row) => row.user_id && row.status === 'active' && row.role !== 'owner' && row.role !== 'admin');
  let activityId = db.rows('company_activity').length + 1000;
  members.forEach((member, index) => {
    // The employee persona has not taken the placement yet, so the preview can walk through it.
    if (member.user_id === world.personas.employee.id || index % 5 === 4) return;
    const accuracy = Math.max(0.2, Math.min(0.97, Number(member.level_score ?? 45) / 100 + 0.12));
    const started = new Date(now - (38 - index) * DAY);
    const played = play(staffSkills, String(member.job_role) as JobRole, accuracy, 200 + index, 'mid', started);
    const submitted = new Date(started.getTime() + (26 + index) * 60_000).toISOString();
    const result = overall(played.results, played.sections);
    const id = `00000000-0000-4000-8000-00000000f2${String(index).padStart(2, '0')}`;
    db.rows('company_attempts').push({
      id, org_id: world.orgId, assessment_id: placementId, member_id: member.id, user_id: member.user_id, candidate_name: member.full_name, candidate_email: null, candidate_phone: null, access_token_hash: null,
      status: 'graded', started_at: started.toISOString(), deadline_at: new Date(started.getTime() + 36 * 60_000).toISOString(), submitted_at: submitted, graded_at: submitted,
      items: played.sections, answers: played.answers, ...result, skill_results: played.results, ai_feedback: { pending: [], reason: null },
      integrity: { tab_hidden: index % 4 === 0 ? 3 : 0, section_seconds: { grammar: 400, vocabulary: 360, reading: 700, listening: 520 } },
      decision: null, decision_by: null, notes: null, certificate_code: code('SRS', index + 1), created_at: started.toISOString(), updated_at: submitted,
    });
    Object.assign(member, { level: result.overall_level, level_score: result.overall_score, level_source: 'placement', level_at: submitted });
    db.rows('company_activity').push({ id: activityId++, org_id: world.orgId, member_id: member.id, user_id: member.user_id, kind: 'test', minutes: 26 + index, points: 50, ref: id, created_at: submitted });
  });
  // Two front-office people already took the progress check; one is half way through.
  const front = members.filter((member) => member.department_id === world.departments.front && member.user_id !== world.personas.employee.id && member.role === 'employee');
  front.slice(0, 3).forEach((member, index) => {
    const started = new Date(now - (2 - index * 0.5) * DAY);
    const finished = index < 2;
    const played = play([...staffSkills, 'speaking'], String(member.job_role) as JobRole, Math.min(0.97, Number(member.level_score ?? 45) / 100 + 0.2), 300 + index, index === 0 ? 'strong' : 'mid', started, finished ? 99 : 3);
    const submitted = new Date(started.getTime() + 38 * 60_000).toISOString();
    const id = `00000000-0000-4000-8000-00000000f3${String(index).padStart(2, '0')}`;
    if (!finished) {
      const live = new Date(now - 8 * 60_000);
      db.rows('company_attempts').push({ id, org_id: world.orgId, assessment_id: progressId, member_id: member.id, user_id: member.user_id, candidate_name: member.full_name, candidate_email: null, candidate_phone: null, access_token_hash: null, status: 'started', started_at: live.toISOString(), deadline_at: new Date(live.getTime() + 44 * 60_000).toISOString(), submitted_at: null, graded_at: null, items: played.sections, answers: played.answers, overall_level: null, overall_score: null, skill_results: played.results, ai_feedback: {}, integrity: {}, decision: null, decision_by: null, notes: null, certificate_code: null, created_at: live.toISOString(), updated_at: live.toISOString() });
      return;
    }
    const feedback = gradeProduction(played, submitted);
    const result = overall(played.results, played.sections);
    db.rows('company_attempts').push({ id, org_id: world.orgId, assessment_id: progressId, member_id: member.id, user_id: member.user_id, candidate_name: member.full_name, candidate_email: null, candidate_phone: null, access_token_hash: null, status: 'graded', started_at: started.toISOString(), deadline_at: new Date(started.getTime() + 44 * 60_000).toISOString(), submitted_at: submitted, graded_at: submitted, items: played.sections, answers: played.answers, ...result, skill_results: played.results, ai_feedback: feedback, integrity: { section_seconds: { grammar: 380, vocabulary: 330, reading: 650, listening: 540, speaking: 260 } }, decision: null, decision_by: null, notes: null, certificate_code: code('SRP', index + 31), created_at: started.toISOString(), updated_at: submitted });
    Object.assign(member, { level: result.overall_level, level_score: result.overall_score, level_source: 'progress', level_at: submitted });
    db.rows('company_activity').push({ id: activityId++, org_id: world.orgId, member_id: member.id, user_id: member.user_id, kind: 'test', minutes: 38, points: 50, ref: id, created_at: submitted });
  });

  const org = db.rows('company_orgs').find((row) => row.id === world.orgId);
  if (org) org.tests_used = Math.max(Number(org.tests_used ?? 0), db.rows('company_attempts').filter((row) => row.org_id === world.orgId).length);
}
