// Preview data for the training area: lesson progress, assignments, the hotel's
// own glossary, one finished role-play and one writing check for the employee,
// plus canned replies for the company-roleplay and company-writing-check AI. Second release:
// the hotel's own lessons, course and role-play, paths, certificates, an overdue assignment
// and canned replies for company-lesson-draft.
import type { FakeDb } from '../../../supabase/functions/company/testing.ts';
import { findScenario, findTrack } from '../../../supabase/functions/company/training/tracks/index.ts';
import type { World } from './boot.ts';

const DAY = 86_400_000;
type Row = Record<string, unknown>;

export function seed(db: FakeDb, world: World) {
  const { orgId, now, departments } = world;
  const at = (daysBack: number, hours = 0) => new Date(now.getTime() - daysBack * DAY - hours * 3_600_000).toISOString();
  const members = db.rows('company_members') as Row[];
  const byUser = (id: string) => members.find((row) => row.user_id === id)!;
  const employee = byUser(world.personas.employee.id);
  const manager = byUser(world.personas.manager.id);
  const hr = byUser(world.personas.hr.id);

  // Lesson progress: the employee finished three hospitality lessons and is in the fourth.
  const hospitality = findTrack('hospitality')!.lessons;
  const progress = (member: Row, code: string, track: string, status: 'started' | 'completed', score: number | null, daysBack: number, step = 'results') => db.rows('company_lesson_progress').push({
    id: crypto.randomUUID(), org_id: orgId, member_id: member.id, user_id: member.user_id, track_code: track, lesson_code: code, status, score,
    minutes: 14 + (score ?? 0) % 9, attempts: status === 'completed' ? 1 + (daysBack % 2) : 1, data: { step },
    completed_at: status === 'completed' ? at(daysBack) : null, created_at: at(daysBack + 1), updated_at: at(daysBack),
  });
  progress(employee, hospitality[0].code, 'hospitality', 'completed', 92, 12);
  progress(employee, hospitality[1].code, 'hospitality', 'completed', 80, 6);
  progress(employee, hospitality[2].code, 'hospitality', 'completed', 74, 1);
  progress(employee, hospitality[3].code, 'hospitality', 'started', null, 0, 'dialogue');
  hospitality.slice(0, 6).forEach((lesson, index) => progress(manager, lesson.code, 'hospitality', 'completed', 85 + index, 20 - index * 3));
  // Some colleagues with learning seats have progress too, so completion numbers look real.
  // The seed relies on an active agreement: a seat works only there. Owner and HR have no seat, which shows
  // the locked pages (reason no_seat). The pilot, paused and ended copy shows when staff change the workspace.
  members.filter((row) => row.role === 'employee' && row.user_id && row.seat && row !== employee).forEach((member, index) => {
    const track = findTrack(String(member.job_role)) ?? findTrack('general')!;
    track.lessons.slice(0, index % 5).forEach((lesson, step) => progress(member, lesson.code, track.code, 'completed', 65 + ((index + step) * 7) % 30, 30 - index - step * 2));
  });

  // Assignments from HR.
  const assignment = (row: Row) => db.rows('company_assignments').push({
    id: crypto.randomUUID(), org_id: orgId, track_code: null, target_level: null, due_date: null, department_id: null, member_id: null, note: null,
    status: 'active', created_by: hr.user_id, created_at: at(20), updated_at: at(20), ...row,
  });
  const date = (daysAhead: number) => new Date(now.getTime() + daysAhead * DAY).toISOString().slice(0, 10);
  assignment({ track_code: 'hospitality', target_level: 'b1', due_date: date(45), department_id: departments.front, note: 'Before the spring tourist season, please finish the hotel track.' });
  assignment({ track_code: 'sales', target_level: 'b2', due_date: date(60), department_id: departments.sales });
  assignment({ track_code: 'banking_finance', target_level: null, due_date: date(-3), department_id: departments.finance, note: 'Billing and payments in English.' });
  assignment({ track_code: null, target_level: 'b1', due_date: date(120), note: 'Everyone in the hotel reaches B1 this year.' });
  assignment({ track_code: 'general', status: 'done', created_at: at(40), updated_at: at(10) });

  // The hotel's own glossary.
  const term = (text: string, meaning: string, ru: string, uz: string, example: string | null, department: string | null) => db.rows('company_glossary_terms').push({
    id: crypto.randomUUID(), org_id: orgId, term: text, meaning, ru, uz, example, department_id: department, created_by: hr.user_id, created_at: at(25), updated_at: at(25),
  });
  term('Rack rate', 'The full published price of a room before any discount.', 'Базовый тариф', 'Asosiy tarif', 'Our rack rate for a deluxe room is 120 dollars.', null);
  term('Late check-out', 'Leaving the room after 12:00, usually for an extra fee.', 'Поздний выезд', 'Kech chiqish', 'Late check-out until 16:00 costs half of the room rate.', departments.front);
  term('Early check-in', 'Arriving in the room before 14:00.', 'Ранний заезд', 'Erta joylashish', 'Early check-in depends on availability.', departments.front);
  term('No-show', 'A guest with a booking who does not arrive and does not cancel.', 'Неявка', 'Kelmay qolish', 'No-shows are charged for the first night.', null);
  term('Walk-in', 'A guest who arrives without a booking.', 'Гость без брони', 'Bronsiz kelgan mehmon', 'We had three walk-ins last night.', departments.front);
  term('Upgrade', 'Moving a guest to a better room, free or for a fee.', 'Повышение категории номера', 'Xona toifasini oshirish', 'I can offer you an upgrade to a suite.', departments.front);
  term('Occupancy rate', 'The share of rooms that are sold on a given night.', 'Загрузка отеля', 'Mehmonxona bandligi', 'Occupancy in October was very high.', departments.sales);
  term('Group block', 'A number of rooms held for one group at an agreed rate.', 'Блок номеров для группы', 'Guruh uchun ajratilgan xonalar', 'The tour operator released ten rooms from the group block.', departments.sales);
  term('Folio', 'The guest’s bill with all charges during the stay.', 'Счёт гостя (фолио)', 'Mehmon hisobi', 'Please check your folio before you pay.', departments.finance);
  term('Deposit', 'Money paid in advance to guarantee a booking.', 'Предоплата, депозит', 'Oldindan to‘lov', 'A one-night deposit is required for groups.', null);
  term('Turndown service', 'Preparing the room for the night in the evening.', 'Вечерняя подготовка номера', 'Kechki xona tayyorlash', 'Turndown service is from 19:00 to 21:00.', null);
  term('Amenities', 'Extra things and services for guests, such as a pool or free water.', 'Удобства для гостей', 'Mehmonlar uchun qulayliklar', 'All rooms have free amenities.', null);

  seedOwnContent(db, world, { employee, hr, at, date });

  // One finished role-play and one writing check for the employee.
  const scenario = findScenario('hospitality-rp-room-not-ready')?.scenario;
  if (scenario) db.rows('company_roleplay_sessions').push({
    id: crypto.randomUUID(), org_id: orgId, member_id: employee.id, user_id: employee.user_id, scenario_code: scenario.code, track_code: 'hospitality', status: 'ended',
    turns: [
      { role: 'ai', text: scenario.opening, at: at(3) },
      { role: 'learner', text: 'Good morning, Mr. Hoffmann. Sorry, your room is not ready. Check-in is at two o’clock.', at: at(3), mode: 'typed', tip: 'Скажите мягче: “I’m afraid your room isn’t ready yet.”' },
      { role: 'ai', text: 'Two o’clock? I have a meeting at three. What am I supposed to do until then?', at: at(3) },
      { role: 'learner', text: 'You can leave your luggage with us and have breakfast. I will call you when the room is ready.', at: at(3), mode: 'voice' },
      { role: 'ai', text: 'Breakfast would help. Will I have to pay for early check-in?', at: at(3) },
      { role: 'learner', text: 'No, it is free for you today. I think the room will be ready at twelve thirty.', at: at(3), mode: 'typed' },
      { role: 'ai', text: 'All right, that sounds fair. Thank you.', at: at(3) },
    ],
    learner_turns: 3, locale: 'ru', score: 76, minutes: 9, created_at: at(3), updated_at: at(3), ended_at: at(3),
    feedback: {
      score: 76, goal_met: true, locale: 'ru',
      summary: 'Вы успокоили гостя, предложили варианты и назвали время. Начало было слишком прямым: сначала извинитесь и объясните причину.',
      good_phrases: ['You can leave your luggage with us', 'I will call you when the room is ready'],
      better_phrases: [
        { said: 'Sorry, your room is not ready.', better: 'I’m so sorry, Mr. Hoffmann, I’m afraid your room isn’t ready yet.', why: '«I’m afraid» смягчает плохую новость.' },
        { said: 'I think the room will be ready at twelve thirty.', better: 'Your room should be ready by twelve thirty at the latest.', why: 'Звучит увереннее и даёт гостю чёткий срок.' },
      ],
      checklist: [{ item: 'Apologises and explains the reason', done: false }, { item: 'Offers at least two practical options', done: true }, { item: 'Gives a realistic time', done: true }],
      next_step: 'Повторите ситуацию и объясните, почему номер не готов (поздний выезд прошлого гостя).',
    },
  });
  db.rows('company_writing_checks').push({
    id: crypto.randomUUID(), org_id: orgId, member_id: employee.id, user_id: employee.user_id, template_code: 'hospitality-wr-online-review', locale: 'ru', score: 68, created_at: at(5),
    draft: 'Dear guest,\n\nThank you for you review. We are sorry that the breakfast was cold. We talk with our kitchen and now it will be better.\n\nBest regards,\nBekzod',
    result: {
      corrected: 'Dear Ms. Laurent,\n\nThank you for your review. We are very sorry that your breakfast was cold. We have spoken to our kitchen team, and from now on hot dishes will be kept warm until 10:30.\n\nWe hope to welcome you again.\n\nKind regards,\nBekzod Tursunov\nFront Office, Silk Road Hotel',
      score: 68, locale: 'ru',
      summary: 'Ответ вежливый и по делу. Исправьте грамматику и пообещайте конкретное действие.',
      tone: 'Тон дружелюбный, но немного общий.', tone_notes: ['Обращайтесь к гостю по имени.', 'Добавьте приглашение приехать снова.'],
      changes: [
        { original: 'Thank you for you review', corrected: 'Thank you for your review', why: 'Нужно притяжательное «your».' },
        { original: 'We talk with our kitchen', corrected: 'We have spoken to our kitchen team', why: 'Действие уже сделано — Present Perfect.' },
        { original: 'now it will be better', corrected: 'from now on hot dishes will be kept warm until 10:30', why: 'Конкретное обещание звучит убедительнее.' },
      ],
      checklist: [{ item: 'Thanks the guest and apologises', done: true }, { item: 'Explains what the hotel has done', done: false }],
    },
  });
}

const LATE_CHECK_OUT = {
  title: { en: 'Our late check-out rule', ru: 'Наше правило позднего выезда', uz: 'Kech chiqish qoidamiz' },
  goal: { en: 'Explain late check-out and its fee clearly to a guest.', ru: 'Понятно объяснить гостю поздний выезд и его стоимость.', uz: 'Kech chiqish va uning narxini mehmonga aniq tushuntirish.' },
  level: 'a2',
  phrases: [
    { en: 'Check-out is at twelve o’clock.', ru: 'Выезд в двенадцать часов.', uz: 'Chiqish soat o‘n ikkida.' },
    { en: 'You can stay until four for half the room rate.', ru: 'Можно остаться до четырёх за половину стоимости номера.', uz: 'Xona narxining yarmiga soat to‘rtgacha qolishingiz mumkin.' },
    { en: 'Let me check if the room is free this afternoon.', ru: 'Позвольте проверить, свободен ли номер сегодня днём.', uz: 'Bugun tushdan keyin xona bo‘shligini tekshirib ko‘ray.' },
    { en: 'We can keep your luggage at the desk for free.', ru: 'Мы можем бесплатно оставить ваш багаж на стойке.', uz: 'Yukingizni qabulxonada bepul saqlab turishimiz mumkin.' },
  ],
  words: [
    { en: 'late check-out', ru: 'поздний выезд', uz: 'kech chiqish', note: 'noun' },
    { en: 'room rate', ru: 'стоимость номера', uz: 'xona narxi', note: 'noun' },
    { en: 'fee', ru: 'плата', uz: 'to‘lov', note: 'noun' },
  ],
  dialogue: {
    setting: { en: 'A guest at reception on the last morning of a stay.', ru: 'Гость на стойке регистрации в последнее утро.', uz: 'Mehmon oxirgi kuni ertalab qabulxonada.' },
    lines: [
      { speaker: 'Guest', text: 'My flight is at nine tonight. Can I keep the room longer?' },
      { speaker: 'Receptionist', text: 'Check-out is at twelve, but you can stay until four for half the room rate.' },
      { speaker: 'Guest', text: 'And after four?' },
      { speaker: 'Receptionist', text: 'We can keep your luggage at the desk for free until you leave.' },
    ],
  },
  exercises: [
    { id: 'e1', kind: 'choice', prompt: 'Choose the right answer.', items: [
      { q: 'When is the normal check-out?', options: ['At twelve', 'At four', 'At nine'], answer: 0 },
      { q: 'How much is a stay until four?', options: ['Free', 'Half the room rate', 'The full room rate'], answer: 1 },
    ] },
    { id: 'e2', kind: 'gap', prompt: 'Fill the gap.', items: [
      { text: 'We can keep your ___ at the desk for free.', answers: ['luggage', 'bags'] },
      { text: 'You can stay until four for half the room ___.', answers: ['rate'] },
    ] },
    { id: 'e3', kind: 'match', prompt: 'Match the two sides.', pairs: [['late check-out', 'leaving after twelve'], ['room rate', 'the price of a room'], ['fee', 'money you pay for a service']] },
  ],
  mission: { kind: 'roleplay', scenario: '', brief: { en: 'Practise this with a guest who wants to stay longer.', ru: 'Потренируйтесь с гостем, который хочет остаться подольше.', uz: 'Ko‘proq qolmoqchi bo‘lgan mehmon bilan mashq qiling.' } },
};

function seedOwnContent(db: FakeDb, world: World, { employee, hr, at, date }: { employee: Row; hr: Row; at: (daysBack: number, hours?: number) => string; date: (daysAhead: number) => string }) {
  const { orgId, departments } = world;
  // A custom role-play the hotel wrote itself.
  const scenarioId = crypto.randomUUID();
  db.rows('company_scenarios').push({
    id: scenarioId, org_id: orgId, status: 'published', difficulty: 'medium', created_by: hr.user_id, created_at: at(18), updated_at: at(18),
    title: { en: 'A guest asks to stay longer', ru: 'Гость просит продлить выезд', uz: 'Mehmon ko‘proq qolishni so‘raydi' },
    goal: { en: 'Explain the rule and the fee, and offer the luggage room.', ru: 'Объяснить правило и плату и предложить камеру хранения.', uz: 'Qoida va to‘lovni tushuntirish, yuk saqlashni taklif qilish.' },
    persona: 'Ms Laurent, a polite French guest with an evening flight. She hopes the late stay is free and asks twice.',
    learner_role: 'A receptionist at Silk Road Hotel.', setting: 'Hotel reception at eleven in the morning, the last day of her stay.',
    opening: 'Good morning. My flight is only at nine tonight. May I keep my room until the evening?',
    checklist: ['Greets the guest and listens', 'States the check-out time and the fee clearly', 'Offers to keep the luggage at the desk'],
  });
  const scenarioCode = `cs-${scenarioId}`;

  // Two published lessons in a course, and one AI draft still waiting for approval.
  const lesson = (id: string, content: Record<string, unknown>, extra: Row = {}) => db.rows('company_lessons').push({
    id, org_id: orgId, title: content.title, level: content.level, draft: content, published: content, status: 'published', revision: 2, published_version: 1, published_revision: 2,
    published_at: at(15), source: 'manual', approved_at: null, created_by: hr.user_id, created_at: at(20), updated_at: at(15), ...extra,
  });
  const first = crypto.randomUUID(), second = crypto.randomUUID(), draft = crypto.randomUUID();
  const lateCheckOut = { ...LATE_CHECK_OUT, mission: { ...LATE_CHECK_OUT.mission, scenario: scenarioCode } };
  lesson(first, lateCheckOut);
  const breakfast = {
    ...LATE_CHECK_OUT,
    title: { en: 'Our breakfast hours', ru: 'Часы завтрака', uz: 'Nonushta vaqti' },
    goal: { en: 'Tell a guest when and where breakfast is served.', ru: 'Сообщить гостю, когда и где подают завтрак.', uz: 'Mehmonga nonushta qachon va qayerda berilishini aytish.' },
    phrases: [
      { en: 'Breakfast is from seven to ten thirty.', ru: 'Завтрак с семи до половины одиннадцатого.', uz: 'Nonushta yettidan o‘n yarimgacha.' },
      { en: 'The restaurant is on the first floor.', ru: 'Ресторан на первом этаже.', uz: 'Restoran birinchi qavatda.' },
    ],
    words: [{ en: 'buffet', ru: 'шведский стол', uz: 'shved stoli', note: 'noun' }],
    exercises: [{ id: 'e1', kind: 'gap', prompt: 'Fill the gap.', items: [{ text: 'Breakfast is from seven to ten ___.', answers: ['thirty'] }, { text: 'The restaurant is on the first ___.', answers: ['floor'] }] }],
    mission: { kind: 'task', brief: { en: 'Tell three guests the breakfast hours today.', ru: 'Сегодня сообщите часы завтрака трём гостям.', uz: 'Bugun uchta mehmonga nonushta vaqtini ayting.' } },
  };
  lesson(second, breakfast);
  const copy = (id: string, content: Record<string, unknown>) => db.rows('company_lesson_versions').push({ id: crypto.randomUUID(), org_id: orgId, lesson_id: id, version: 1, content, published_by: hr.user_id, created_at: at(15) });
  copy(first, lateCheckOut);
  copy(second, breakfast);
  const pending = { ...LATE_CHECK_OUT, title: { en: 'Our pool rules', ru: 'Правила бассейна', uz: 'Basseyn qoidalari' }, mission: { kind: 'task', brief: { en: 'Explain the pool rules to a family.', ru: 'Объясните правила бассейна семье.', uz: 'Oilaga basseyn qoidalarini tushuntiring.' } } };
  lesson(draft, pending, { published: null, status: 'draft', revision: 1, published_version: 0, published_revision: 0, published_at: null, source: 'ai', updated_at: at(1) });

  const courseId = crypto.randomUUID();
  const courseTitle = { en: 'Welcome to Silk Road Hotels', ru: 'Добро пожаловать в Silk Road Hotels', uz: 'Silk Road Hotels ga xush kelibsiz' };
  const courseSummary = { en: 'Our own rules and services, in the English you need with guests.', ru: 'Наши правила и услуги на английском, который нужен с гостями.', uz: 'Mehmonlar bilan kerak bo‘ladigan inglizchada o‘z qoidalarimiz va xizmatlarimiz.' };
  db.rows('company_courses').push({
    id: courseId, org_id: orgId, title: courseTitle, summary: courseSummary, job_role: 'hospitality', lesson_ids: [first, second], status: 'published', revision: 2, published_version: 1, published_revision: 2,
    published: { title: courseTitle, summary: courseSummary, job_role: 'hospitality', lesson_ids: [first, second] }, published_at: at(14), created_by: hr.user_id, created_at: at(20), updated_at: at(14),
  });
  const courseCode = `c-${courseId}`;

  // The employee finished the course's first lesson; the course is assigned to the front office and is overdue.
  db.rows('company_lesson_progress').push({
    id: crypto.randomUUID(), org_id: orgId, member_id: employee.id, user_id: employee.user_id, track_code: courseCode, lesson_code: `co-${first}`, status: 'completed', score: 88,
    minutes: 12, attempts: 1, data: { step: 'results', version: 1 }, completed_at: at(9), created_at: at(10), updated_at: at(9),
  });
  db.rows('company_assignments').push({
    id: crypto.randomUUID(), org_id: orgId, track_code: courseCode, target_level: null, due_date: date(-2), department_id: departments.front, member_id: null,
    note: 'New rules for this season.', status: 'active', created_by: hr.user_id, created_at: at(14), updated_at: at(14),
  });

  // Paths: Sales follows a department path; the employee has their own, with a date.
  db.rows('company_learning_paths').push(
    { id: crypto.randomUUID(), org_id: orgId, member_id: null, department_id: departments.sales, target_level: 'b2', due_date: date(120), steps: [{ kind: 'track', code: 'sales', stage: 'foundation' }, { kind: 'course', code: courseCode }, { kind: 'track', code: 'sales', stage: 'professional' }], status: 'active', created_by: hr.user_id, created_at: at(12), updated_at: at(12) },
    { id: crypto.randomUUID(), org_id: orgId, member_id: employee.id, department_id: null, target_level: 'b1', due_date: date(90), steps: [{ kind: 'track', code: 'hospitality', stage: 'foundation' }, { kind: 'course', code: courseCode }, { kind: 'track', code: 'hospitality', stage: 'professional' }], status: 'active', created_by: hr.user_id, created_at: at(12), updated_at: at(12) },
  );

  // A certificate someone has already earned, and saved writing templates for the employee.
  db.rows('company_training_certificates').push({
    id: crypto.randomUUID(), org_id: orgId, member_id: employee.id, user_id: employee.user_id, kind: 'course', ref_code: 'c-demo', title: { en: 'Fire safety in English', ru: 'Пожарная безопасность на английском', uz: 'Yong‘in xavfsizligi inglizcha' },
    holder_name: employee.full_name, lessons: 4, score: 91, code: 'SR7K2M9QPL', issued_at: at(21), revoked_at: null, created_at: at(21),
  });
  db.rows('company_writing_snippets').push(
    { id: crypto.randomUUID(), org_id: orgId, member_id: employee.id, user_id: employee.user_id, title: 'Booking confirmed', body: 'Dear [name],\n\nThank you for your booking. We look forward to welcoming you on [date].\n\nKind regards,\nBekzod Tursunov', tone: 'formal', created_at: at(8), updated_at: at(8) },
    { id: crypto.randomUUID(), org_id: orgId, member_id: employee.id, user_id: employee.user_id, title: 'Airport transfer', body: 'Hello [name],\n\nOur driver will meet you at arrivals with a sign with your name.\n\nBest wishes,\nBekzod', tone: 'friendly', created_at: at(6), updated_at: at(6) },
  );
}

/** Canned AI replies so the preview shows the real flow without a provider. */
const REPLIES = [
  'I see. And how long will that take, exactly?',
  'Hmm, that is not ideal. Is there anything else you can offer me?',
  'All right. Can you write that down for me, please?',
  'Thank you, that is helpful. What do I need to do next?',
  'Fine, that works for me. Thank you for your help.',
];
const TIPS: Record<string, string> = {
  ru: 'Попробуйте вежливее: “Could I suggest…?” вместо “You must…”.',
  uz: 'Muloyimroq aytib ko‘ring: “You must…” o‘rniga “Could I suggest…?”.',
  en: 'Try a softer start: “Could I suggest…?” instead of “You must…”.',
};
const FEEDBACK: Record<string, { summary: string; why: string; next: string }> = {
  ru: { summary: 'Вы вежливо поддерживали разговор и предлагали решения. Добавьте больше конкретики: время, цену, следующий шаг.', why: 'Так звучит профессиональнее и вежливее.', next: 'Повторите ситуацию и в каждой реплике называйте конкретное действие.' },
  uz: { summary: 'Suhbatni muloyim olib bordingiz va yechimlar taklif qildingiz. Ko‘proq aniqlik qo‘shing: vaqt, narx, keyingi qadam.', why: 'Shunday aytish professionalroq va muloyimroq.', next: 'Vaziyatni qaytadan o‘ynang va har bir javobda aniq harakatni ayting.' },
  en: { summary: 'You kept the conversation polite and offered solutions. Add more detail: times, prices and the next step.', why: 'It sounds more professional and polite.', next: 'Repeat the situation and name a concrete action in every reply.' },
};

export const ai: Record<string, (payload: unknown) => unknown> = {
  'company-lesson-draft': (payload) => {
    const input = payload as { step?: string; items?: { key: string }[]; source?: string };
    if (input.items) return { items: input.items.map((item) => ({ key: item.key, ru: 'Перевод для просмотра', uz: 'Ko‘rib chiqish uchun tarjima' })) };
    if (!input.step) return {
      title: { en: 'A customer complains', ru: 'Клиент жалуется', uz: 'Mijoz shikoyat qilmoqda' }, goal: { en: 'Calm the customer and agree the next step.', ru: 'Успокоить клиента и договориться о следующем шаге.', uz: 'Mijozni tinchlantirish va keyingi qadamni kelishish.' },
      persona: 'Mr Rahimov, a tired business traveller who wants a clear answer quickly.', learner_role: 'A member of the front desk team.', setting: 'At reception after a long flight.', opening: 'I have been waiting for twenty minutes. What is going on?', difficulty: 'medium',
      checklist: ['Apologises for the wait', 'Explains the reason', 'Agrees the next step'],
    };
    if (input.step === 'practice') return { dialogue: LATE_CHECK_OUT.dialogue, exercises: LATE_CHECK_OUT.exercises };
    return { title: { en: 'From your document', ru: 'По вашему документу', uz: 'Hujjatingiz asosida' }, goal: LATE_CHECK_OUT.goal, phrases: LATE_CHECK_OUT.phrases, words: LATE_CHECK_OUT.words, mission: { brief: { en: 'Use this at work today.', ru: 'Примените это сегодня на работе.', uz: 'Bugun buni ishda qo‘llang.' } } };
  },
  'company-roleplay': (payload) => {
    const input = payload as { learner_says?: string; turn?: number; transcript?: { speaker: string; text: string }[]; locale?: string; hint_for?: string };
    const locale = input.locale && input.locale in FEEDBACK ? input.locale : 'ru';
    if (input.hint_for) return { say: 'I’m very sorry, let me see what I can do for you.', why: FEEDBACK[locale].why };
    if (input.transcript) {
      const said = input.transcript.filter((turn) => turn.speaker === 'learner').map((turn) => turn.text);
      return {
        score: Math.min(88, 52 + said.length * 6), goal_met: said.length >= 3, summary: FEEDBACK[locale].summary,
        good_phrases: said.slice(0, 2),
        better_phrases: said.slice(-1).map((text) => ({ said: text, better: `I'm sorry for the inconvenience. ${text.replace(/^./, (c) => c.toUpperCase())}`, why: FEEDBACK[locale].why })),
        checklist: [{ item: 'Greets and listens', done: true }, { item: 'Offers a concrete solution', done: said.length >= 2 }, { item: 'Confirms the next step', done: said.length >= 3 }],
        next_step: FEEDBACK[locale].next,
      };
    }
    const turn = Math.max(1, input.turn ?? 1);
    const rude = /\bmust\b/i.test(input.learner_says ?? '');
    return { reply: REPLIES[Math.min(REPLIES.length - 1, turn - 1)], done: turn >= REPLIES.length, tip: rude ? TIPS[locale] : '' };
  },
  'company-writing-check': (payload) => {
    const input = payload as { text?: string; locale?: string };
    const locale = input.locale && input.locale in FEEDBACK ? input.locale : 'ru';
    const text = String(input.text ?? '').trim();
    const corrected = text.replace(/\bi\b/g, 'I').replace(/\bthank for\b/gi, 'thank you for').replace(/\byou review\b/gi, 'your review').replace(/\s+([,.!?])/g, '$1');
    const notes = {
      ru: { summary: 'Текст понятен. Мы исправили несколько ошибок и сделали тон вежливее.', tone: 'Вежливо и по делу.', note: 'Закончите письмо фразой «Kind regards» и полным именем.', why: 'Так принято в деловых письмах.' },
      uz: { summary: 'Matn tushunarli. Bir nechta xatoni tuzatdik va ohangni muloyimroq qildik.', tone: 'Muloyim va aniq.', note: 'Xatni «Kind regards» va to‘liq ismingiz bilan yakunlang.', why: 'Ish xatlarida shunday qabul qilingan.' },
      en: { summary: 'The text is clear. We fixed a few mistakes and made the tone more polite.', tone: 'Polite and to the point.', note: 'End with “Kind regards” and your full name.', why: 'This is usual in business emails.' },
    }[locale as 'ru' | 'uz' | 'en'];
    return {
      corrected: /regards/i.test(corrected) ? corrected : `${corrected}\n\nKind regards,`,
      score: Math.min(90, 55 + Math.round(text.split(/\s+/).length / 4)),
      summary: notes.summary, tone: notes.tone, tone_notes: [notes.note],
      changes: [{ original: text.split(/\n/)[0].slice(0, 60), corrected: corrected.split(/\n/)[0].slice(0, 60), why: notes.why }],
      checklist: [],
    };
  },
};
