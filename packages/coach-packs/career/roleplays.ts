import { T } from '../src/localize.ts';
import type { Activity, HiddenField, Localized, Roleplay } from '../src/types.ts';
import { UK_DOCUMENT_FACTS, UK_VISA_FACTS, US_VISA_FACTS } from './facts.ts';

// Interview role-plays, scored on career.interview: HR screening calls, behavioural
// panels, role-specific interviews, salary negotiations (goals with `kind` feed the
// scorecard), student-visa interview practice for the US and the UK (only the dated
// facts in facts.ts) and a scholarship panel. Each interviewer has a hidden interest
// and concerns that move with what the learner says. Employers, people and figures are
// invented for practice; salary figures are practice numbers, never market data. The
// learner answers in Uzbek, Russian or English and the interviewer uses the same language.

const CORE: Roleplay['scorecard'] = ['talk_ratio', 'questions_asked', 'average_turn_words', 'pace'];
const L = (en: string, uz: string, ru: string): Localized => ({ en, uz, ru });
/** A name: the same in Latin script, its Cyrillic spelling for Russian. */
const nm = (latin: string, cyrillic: string) => T({ en: latin, uz: latin, ru: cyrillic });
const num = (id: string, min: number, max: number, description: string, reveal = true): HiddenField => ({ id, kind: 'number', min, max, description, revealInReview: reveal });
const pick = (id: string, values: string[], description: string, reveal = true): HiddenField => ({ id, kind: 'enum', values, description, revealInReview: reveal });
const flag = (id: string, description: string, reveal = true): HiddenField => ({ id, kind: 'boolean', description, revealInReview: reveal });
const g = (id: string, text: Localized, check: string, kind?: 'objection' | 'next_step'): Roleplay['goals'][number] => ({ id, text, check, ...(kind ? { kind } : {}) });

const INTERVIEWER = 'General rules for every answer: interest +1 for a direct answer followed by a specific example from the candidate\'s own experience, +1 when the candidate links their experience to this role or employer, +1 for a thoughtful question back; −1 for an answer that rambles past about six sentences or never answers the question, −1 for self-praise with no proof (I am hard-working, responsible), −2 for criticising a former employer or colleague. Never invent facts about the market, salaries or laws; figures in this practice are invented and only those stated in the scenario or by the candidate exist. Scenario rules: ';

const NOTES: [number, string][] = [
  [2, 'Speak slowly in short, simple sentences in the candidate\'s language. Ask one clear question at a time, rephrase it once if the candidate is lost, and react kindly to any real example so they see what works.'],
  [3.5, 'A normal professional pace. Ask the scenario\'s questions in your own words, follow up on vague answers once ("Can you give me an example?"), and share information only when asked.'],
  [5, 'A demanding, experienced interviewer: probe every claim ("What exactly did you do? What was the result?"), interrupt answers that run long, and combine questions. Agree to a next step only after strong evidence.'],
];

interface Def {
  id: string; node: string; levels: [number, number]; minutes: number;
  title: Localized; setting: Localized; learnerRole: Localized; goal: Localized;
  persona: Roleplay['persona'];
  interest: number;
  fields: [HiddenField, number | string | boolean][];
  rules: string;
  goals: Roleplay['goals'];
  facts?: string[];
  notes?: [number, string][];
  turns?: [number, number];
  general?: string;
}

function rp(def: Def): Roleplay {
  const fields: HiddenField[] = [num('interest', 0, 10, 'How interested the interviewer is in the candidate: 0 ends the conversation politely, 10 is ready to move them forward. At 2 or below the interviewer closes the conversation politely.'), ...def.fields.map(([field]) => field)];
  const initial: Record<string, number | string | boolean> = { interest: def.interest };
  for (const [field, value] of def.fields) initial[field.id] = value;
  const [minTurns, maxTurns] = def.turns ?? [4, 12];
  return {
    id: def.id, kind: 'roleplay', rubric: 'career.interview', node: def.node, levels: def.levels, minutes: def.minutes,
    title: def.title, setting: def.setting, learnerRole: def.learnerRole, goal: def.goal, persona: def.persona,
    hiddenState: { fields, initial, rules: `${def.general ?? INTERVIEWER}${def.rules}` },
    goals: def.goals, scorecard: [...CORE], minTurns, maxTurns, levelNotes: def.notes ?? NOTES,
    ...(def.facts ? { facts: def.facts } : {}),
  };
}

// Goals worded once.
const INTRO = g('intro', L('Introduce yourself in about a minute: now, past, why this job', 'O‘zingizni bir daqiqada tanishtiring: hozir, o‘tmish, nega bu ish', 'Представьтесь примерно за минуту: сейчас, прошлое, почему эта работа'), 'The candidate says what they do now, one or two relevant achievements, and why this job is their next step, without telling their whole life story.');
const EXAMPLE = g('example', L('Back a claim with a real example and a result', 'Da’voni real misol va natija bilan isbotlang', 'Подкрепите утверждение реальным примером с результатом'), 'At least one answer gives a specific situation from the candidate\'s experience, what they did, and a concrete result.');
const ASK = g('ask', L('Ask the interviewer a thoughtful question', 'Suhbatdoshga mazmunli savol bering', 'Задайте интервьюеру содержательный вопрос'), 'The candidate asks at least one genuine question about the work, the team, expectations or how success is measured (not only about holidays or salary).');
const NEXT = g('next', L('Agree a clear next step', 'Aniq keyingi qadamni kelishing', 'Договоритесь о понятном следующем шаге'), 'The conversation ends with an agreed next step: an interview time, a second round, a test task or when the candidate will hear back.');

export const roleplays: Activity[] = [
  // --- HR screening calls ----------------------------------------------------------------------------
  rp({
    id: 'rp.hr-bank', node: 'interviews.hr', levels: [1.5, 4], minutes: 7,
    title: L('HR screening call: a bank', 'Dastlabki HR qo‘ng‘irog‘i: bank', 'Первичный HR-звонок: банк'),
    setting: L('You applied online for a customer service officer job at a commercial bank\'s branch in Tashkent. A recruiter calls you for a ten-minute screening before inviting candidates to the branch.', 'Siz Toshkentdagi tijorat banki filialida mijozlarga xizmat ko‘rsatish bo‘yicha mutaxassis lavozimiga onlayn ariza topshirdingiz. Nomzodlarni filialga taklif qilishdan oldin rekruter o‘n daqiqalik dastlabki suhbat uchun qo‘ng‘iroq qilyapti.', 'Вы откликнулись на вакансию специалиста по обслуживанию клиентов в отделении коммерческого банка в Ташкенте. Рекрутер звонит на десятиминутный скрининг перед приглашением кандидатов в отделение.'),
    learnerRole: L('A candidate with two years of retail cashier experience and no bank experience yet.', 'Ikki yillik chakana savdo kassiri tajribasi bor, bankda hali ishlamagan nomzod.', 'Кандидат с двумя годами опыта кассира в рознице, без опыта в банке.'),
    goal: L('Show you fit the role despite no bank experience and get invited to the branch interview.', 'Bankda tajribangiz bo‘lmasa ham lavozimga mosligingizni ko‘rsating va filialdagi suhbatga taklif oling.', 'Покажите, что подходите на роль даже без опыта в банке, и получите приглашение на интервью в отделении.'),
    persona: {
      name: nm('Malika', 'Малика'),
      role: 'A recruiter at the bank\'s HR department who screens about twenty candidates a day for branch roles.',
      style: 'Friendly but fast: she has a checklist and little time. Starts with "tell me about yourself", then asks why a bank, how the candidate deals with an upset customer, and whether they can work Saturdays. Her hidden worry is that people without bank experience leave in three months. Warms up to concrete examples of accuracy with cash and calm customer service.',
      opening: T({ en: 'Hello, this is Malika from the bank\'s HR team, about your application for customer service officer. Do you have ten minutes? Great. Please tell me a little about yourself.', uz: 'Assalomu alaykum, men bankning HR bo‘limidan Malikaman, mijozlarga xizmat ko‘rsatish bo‘yicha mutaxassis lavozimiga arizangiz yuzasidan. O‘n daqiqa vaqtingiz bormi? Yaxshi. O‘zingiz haqingizda qisqacha gapirib bering.', ru: 'Здравствуйте, это Малика из HR-отдела банка, по вашему отклику на вакансию специалиста по обслуживанию клиентов. У вас есть десять минут? Отлично. Расскажите, пожалуйста, немного о себе.' }),
    },
    interest: 5,
    fields: [
      [pick('concern', ['none', 'leaves_soon', 'no_bank_experience', 'saturdays'], 'Malika\'s main doubt about the candidate. It starts as leaves_soon (people from retail leave quickly); it becomes none when the candidate gives a credible reason for choosing a bank career.'), 'leaves_soon'],
      [flag('saturdays_ok', 'Whether the candidate confirmed they can work two Saturdays a month.'), false],
      [flag('invited', 'Whether Malika invited the candidate to the branch interview with a day and time.'), false],
    ],
    rules: 'If "tell me about yourself" becomes a life story, interest −1 and she interrupts politely. +2 when the candidate links cashier accuracy or handling queues to bank work with an example (cash differences, a difficult customer). She asks "why a bank?" — a vague answer (stable, prestigious) leaves concern at leaves_soon; a reason tied to growth in banking, customers or finance changes concern to none. She asks about Saturdays; saying yes sets saturdays_ok. At interest 8 or more and concern none she invites the candidate to the branch on Thursday at 10; if they confirm, invited becomes true.',
    goals: [INTRO, g('why_bank', L('Give a credible reason for choosing a bank', 'Bankni tanlashning ishonarli sababini ayting', 'Назовите убедительную причину выбора банка'), 'The candidate explains why a bank career, beyond salary or stability, in a way linked to their experience or plans.'), EXAMPLE, ASK, NEXT],
  }),
  rp({
    id: 'rp.hr-it', node: 'interviews.hr', levels: [2, 4.5], minutes: 7,
    title: L('HR screening: a junior QA role at an IT company', 'HR suhbati: IT kompaniyada boshlovchi QA', 'HR-скрининг: младший тестировщик в IT-компании'),
    setting: L('An outsourcing company in Tashkent that builds apps for European clients is hiring junior QA engineers. You finished a testing course and have one freelance project. The recruiter calls on a video link.', 'Yevropalik mijozlar uchun ilovalar yaratadigan Toshkentdagi autsorsing kompaniyasi boshlovchi QA muhandislarini yollamoqda. Siz testlash kursini tugatgansiz va bitta frilans loyihangiz bor. Rekruter video orqali qo‘ng‘iroq qilyapti.', 'Аутсорсинговая компания в Ташкенте, делающая приложения для европейских клиентов, набирает младших тестировщиков. Вы окончили курс по тестированию, у вас один фриланс-проект. Рекрутер звонит по видеосвязи.'),
    learnerRole: L('A career changer who worked in a call centre and finished a QA course.', 'Call-markazda ishlagan va QA kursini tugatgan, kasbini o‘zgartirayotgan nomzod.', 'Кандидат, меняющий профессию: работал в колл-центре и окончил курс QA.'),
    goal: L('Turn your call-centre background into a strength and get the technical interview.', 'Call-markazdagi tajribangizni kuchli tomonga aylantiring va texnik suhbatga taklif oling.', 'Превратите опыт колл-центра в преимущество и получите техническое собеседование.'),
    persona: {
      name: nm('Timur', 'Тимур'),
      role: 'An IT recruiter who hires for several client teams and checks attitude, English basics and learning speed before the technical round.',
      style: 'Relaxed and direct, uses some IT words. Asks why QA, what the candidate tested on the freelance project, how they learn, and whether they can read English task descriptions. Doubts career changers stay motivated through boring regression testing. Likes candidates who mention real bugs they found.',
      opening: T({ en: 'Hi! I\'m Timur, I recruit for our QA teams. I saw you moved from a call centre into testing — that\'s interesting. What made you choose QA?', uz: 'Salom! Men Timurman, QA jamoalarimiz uchun nomzod tanlayman. Call-markazdan testlashga o‘tganingizni ko‘rdim — qiziq. Nega aynan QA ni tanladingiz?', ru: 'Привет! Я Тимур, подбираю людей в наши QA-команды. Вижу, вы перешли из колл-центра в тестирование — интересно. Почему вы выбрали QA?' }),
    },
    interest: 5,
    fields: [
      [pick('concern', ['none', 'motivation', 'technical_depth', 'english'], 'Timur\'s main doubt. Starts as motivation (career changers give up); becomes technical_depth after a good motivation answer, and none after a concrete example of a bug found and reported.'), 'motivation'],
      [num('english_check', 0, 3, 'How many short English questions Timur has asked to check the candidate can read task descriptions (he asks one or two).', false), 0],
      [flag('tech_round', 'Whether Timur booked the technical interview.'), false],
    ],
    rules: 'A reason for QA linked to the call centre (understanding user complaints, attention to detail) moves concern from motivation to technical_depth and interest +1. A concrete bug example (what, how found, how reported, severity) moves concern to none and interest +2. Once, he switches to a simple English question ("How do you write a bug report?"); any understandable answer is fine. If the candidate only says "I like computers", interest −1. At interest 8 and concern none he books the technical interview for Monday; tech_round becomes true when the candidate agrees.',
    goals: [g('why_qa', L('Explain why QA and why now', 'Nega QA va nega hozir ekanini tushuntiring', 'Объясните, почему QA и почему сейчас'), 'The candidate gives a specific reason for moving into QA connected to their past experience.'), g('bug_example', L('Describe a real bug you found and reported', 'Topgan va xabar bergan haqiqiy xatongizni tasvirlang', 'Опишите реальный баг, который вы нашли и описали'), 'The candidate describes a concrete defect: what it was, how they found it and how they reported it.'), ASK, NEXT],
  }),
  rp({
    id: 'rp.hr-retail', node: 'interviews.hr', levels: [2, 4.5], minutes: 7,
    title: L('Interview: store supervisor at a retail chain', 'Suhbat: chakana tarmoq do‘kon supervayzeri', 'Собеседование: супервайзер магазина в торговой сети'),
    setting: L('A national supermarket chain is opening a new store in Namangan. The area manager interviews candidates for shift supervisor in the back office of a nearby store.', 'Respublika supermarketlar tarmog‘i Namanganda yangi do‘kon ochmoqda. Hududiy menejer smena supervayzeri lavozimiga nomzodlarni yaqin atrofdagi do‘konning ofisida suhbatdan o‘tkazmoqda.', 'Национальная сеть супермаркетов открывает новый магазин в Намангане. Территориальный менеджер проводит собеседования на должность супервайзера смены в подсобке соседнего магазина.'),
    learnerRole: L('A senior cashier with three years at another supermarket who has never formally managed people.', 'Boshqa supermarketda uch yil ishlagan, rasman hech kimni boshqarmagan katta kassir.', 'Старший кассир с трёхлетним стажем в другом супермаркете, официально никем не руководивший.'),
    goal: L('Prove you can lead a shift without the title, and handle the question about your current employer well.', 'Lavozimsiz ham smenani boshqara olishingizni isbotlang va hozirgi ish beruvchingiz haqidagi savolga to‘g‘ri javob bering.', 'Докажите, что сможете руководить сменой без опыта в должности, и правильно ответьте на вопрос о текущем работодателе.'),
    persona: {
      name: nm('Shoira opa', 'Шоира-опа'),
      role: 'An area manager responsible for six stores, practical and experienced, who started as a cashier herself.',
      style: 'Warm but tests people. Asks for a time the candidate solved a problem on shift, how they would handle a cashier who is always late, and why they want to leave their current store. Notices immediately if someone complains about their boss. Respects honesty about gaps.',
      opening: T({ en: 'Come in, sit down. I\'m Shoira, I manage the stores in this area. You\'re a senior cashier now — why do you want to become a supervisor?', uz: 'Kiring, o‘tiring. Men Shoiraman, shu hududdagi do‘konlarni boshqaraman. Hozir katta kassirsiz — nega supervayzer bo‘lmoqchisiz?', ru: 'Проходите, садитесь. Я Шоира, руковожу магазинами в этом районе. Сейчас вы старший кассир — почему хотите стать супервайзером?' }),
    },
    interest: 5,
    fields: [
      [pick('concern', ['none', 'no_leadership', 'complainer', 'cannot_discipline'], 'Shoira\'s main doubt. Starts as no_leadership; becomes complainer if the candidate criticises their current store; becomes cannot_discipline if they say they would just ask the late cashier nicely; none after a credible example of leading informally plus a firm, fair plan for the late cashier.'), 'no_leadership'],
      [flag('trial_shift', 'Whether Shoira offered a paid trial shift at the new store.'), false],
    ],
    rules: 'An example of informal leadership (training a new cashier, organising a stocktake, handling a queue crisis) with a result: interest +2. Criticising the current manager or store: interest −2 and concern becomes complainer. For the late cashier, a plan that is both firm and fair (a private talk, the reason, a clear rule, follow-up) raises interest; only being nice or only punishing does not. At interest 8 and concern none she offers a paid trial shift next week; trial_shift becomes true when accepted.',
    goals: [EXAMPLE, g('late_cashier', L('Give a firm, fair plan for a late team member', 'Kechikadigan xodim uchun qat’iy va adolatli reja bering', 'Предложите твёрдый и справедливый план для опаздывающего сотрудника'), 'The candidate describes a private conversation, the expectation, and a follow-up or consequence.'), g('positive', L('Explain why you are leaving without criticising your employer', 'Ish beruvchingizni tanqid qilmasdan nega ketayotganingizni tushuntiring', 'Объясните причину ухода, не критикуя работодателя'), 'Asked why they want to leave, the candidate talks about growth and this opportunity, not about problems with their current boss.'), NEXT],
  }),
  rp({
    id: 'rp.hr-hotel', node: 'interviews.hr', levels: [1.5, 4], minutes: 6,
    title: L('Interview: front desk at a Samarkand hotel', 'Suhbat: Samarqanddagi mehmonxona qabulxonasi', 'Собеседование: ресепшен отеля в Самарканде'),
    setting: L('A 60-room hotel near the old city of Samarkand is hiring front desk agents before the tourist season. The HR manager interviews you in the lobby café.', 'Samarqandning eski shahri yaqinidagi 60 xonali mehmonxona turistik mavsum oldidan qabulxona xodimlarini yollamoqda. HR menejer siz bilan foyedagi kafeda suhbatlashmoqda.', 'Отель на 60 номеров рядом со старым городом Самарканда набирает администраторов ресепшен перед туристическим сезоном. HR-менеджер беседует с вами в кафе в лобби.'),
    learnerRole: L('A tourism student who worked one summer as a guide\'s assistant and speaks some English.', 'Bir yoz gid yordamchisi bo‘lib ishlagan, biroz ingliz tilini biladigan turizm talabasi.', 'Студент направления «туризм», одно лето работавший помощником гида и немного говорящий по-английски.'),
    goal: L('Show you can serve guests well and agree to the shift pattern honestly.', 'Mehmonlarga yaxshi xizmat qila olishingizni ko‘rsating va smena tartibiga halol javob bering.', 'Покажите, что сможете хорошо обслуживать гостей, и честно обсудите график смен.'),
    persona: {
      name: nm('Kamila', 'Камила'),
      role: 'The hotel\'s HR manager, formerly a front office manager, who cares about languages, patience and reliability on night shifts.',
      style: 'Kind and observant. Asks about the guide job, how the candidate would handle a guest whose room is not ready, which languages they speak and how well, and whether they can do night shifts. Values honesty about language level more than exaggeration.',
      opening: T({ en: 'Thank you for coming. I\'m Kamila from HR. I see you\'re studying tourism. Tell me about your summer working with tourists.', uz: 'Kelganingiz uchun rahmat. Men HR bo‘limidan Kamilaman. Turizm bo‘yicha o‘qiyotganingizni ko‘rdim. Sayyohlar bilan ishlagan yozingiz haqida gapirib bering.', ru: 'Спасибо, что пришли. Я Камила из HR. Вижу, вы учитесь на туризме. Расскажите о лете, когда вы работали с туристами.' }),
    },
    interest: 5,
    fields: [
      [pick('concern', ['none', 'language_level', 'night_shifts', 'no_experience'], 'Kamila\'s main doubt. Starts as no_experience; after a concrete story from the guide job it becomes language_level; honest, specific description of language level (what they can and cannot do) makes it none. Overclaiming ("fluent") without proof keeps it at language_level.'), 'no_experience'],
      [flag('nights_ok', 'Whether the candidate agreed to night shifts, honestly stating any limits.'), false],
      [flag('second_round', 'Whether Kamila invited the candidate to a trial morning at the desk.'), false],
    ],
    rules: 'A concrete story from the guide job (a lost tourist, a schedule change) with what the candidate did: interest +2. For the room-not-ready guest, offering luggage storage, a drink, a time estimate and following up raises interest. Saying "fluent" in three languages with no detail: −1. She asks about night shifts; an honest answer (even with a limit like exams) is fine and sets nights_ok. At interest 8 and concern none she invites the candidate for a trial morning at the desk.',
    goals: [EXAMPLE, g('room_not_ready', L('Handle the "room not ready" question with concrete steps', '«Xona tayyor emas» savoliga aniq qadamlar bilan javob bering', 'Ответьте на вопрос «номер не готов» конкретными шагами'), 'The candidate gives a practical sequence: apologise, offer something now, give a time, follow up.'), g('honest_languages', L('Describe your language level honestly and specifically', 'Til darajangizni halol va aniq tasvirlang', 'Честно и конкретно опишите уровень языков'), 'The candidate explains what they can do in each language instead of only saying "fluent".'), NEXT],
  }),
  rp({
    id: 'rp.hr-ngo', node: 'interviews.hr', levels: [2.5, 5], minutes: 8,
    title: L('Interview: project assistant at a development organisation', 'Suhbat: rivojlanish tashkilotida loyiha yordamchisi', 'Собеседование: ассистент проекта в организации развития'),
    setting: L('An international development organisation runs a two-year project on women\'s entrepreneurship in the Fergana valley and needs a project assistant in its Tashkent office. A programme officer interviews you by video.', 'Xalqaro rivojlanish tashkiloti Farg‘ona vodiysida ayollar tadbirkorligi bo‘yicha ikki yillik loyihani amalga oshirmoqda va Toshkent ofisiga loyiha yordamchisi kerak. Dastur xodimi siz bilan video orqali suhbatlashmoqda.', 'Международная организация развития ведёт двухлетний проект по женскому предпринимательству в Ферганской долине, и её ташкентскому офису нужен ассистент проекта. Программный специалист проводит интервью по видео.'),
    learnerRole: L('A graduate who volunteered for two years at a local youth centre and organised training events.', 'Ikki yil mahalliy yoshlar markazida ko‘ngilli bo‘lib, treninglar tashkil qilgan bitiruvchi.', 'Выпускник, два года волонтёривший в местном молодёжном центре и организовывавший тренинги.'),
    goal: L('Show organisation, reporting and community skills with evidence.', 'Tashkilotchilik, hisobot va jamoat bilan ishlash ko‘nikmalarini dalil bilan ko‘rsating.', 'Покажите организаторские навыки, умение отчитываться и работать с сообществами — с доказательствами.'),
    persona: {
      name: nm('Sara', 'Сара'),
      role: 'A programme officer from abroad who has worked in Central Asia for six years and speaks the candidate\'s language well; she needs someone reliable with logistics, numbers and reports.',
      style: 'Structured and polite, asks competency questions: organising an event with limited resources, keeping accurate records of participants, dealing with a partner who misses deadlines, and writing a short report. Pushes gently for numbers ("how many participants?").',
      opening: T({ en: 'Hello, thank you for joining. I\'m Sara, the programme officer. Could you start by telling me about a training event you organised from start to finish?', uz: 'Salom, qo‘shilganingiz uchun rahmat. Men dastur xodimi Saraman. Boshidan oxirigacha o‘zingiz tashkil qilgan bitta trening haqida gapirib berishdan boshlasangiz.', ru: 'Здравствуйте, спасибо, что подключились. Я Сара, программный специалист. Начнём с того, что вы расскажете о тренинге, который организовали от начала до конца.' }),
    },
    interest: 5,
    fields: [
      [pick('concern', ['none', 'reporting', 'reliability', 'community_access'], 'Sara\'s main doubt. Starts as reporting (volunteers often skip records); a concrete account of participant lists, attendance or a report written makes it reliability; an example of handling a missed deadline makes it none.'), 'reporting'],
      [flag('test_task', 'Whether Sara offered a short written test task (a two-page event report).'), false],
    ],
    rules: 'An event story with numbers (participants, budget, dates) and records kept: interest +2 and concern moves on. Vague "we did many trainings": −1, and she asks "how many, and how did you know who came?". For the partner who misses deadlines, a calm plan (check in early, written agreement, escalate) raises interest. At interest 8 and concern none she offers a short written test task due Friday; test_task becomes true when accepted.',
    goals: [EXAMPLE, g('records', L('Show how you keep accurate records and report', 'Aniq hisob yuritish va hisobot berishni ko‘rsating', 'Покажите, как вы ведёте учёт и отчитываетесь'), 'The candidate explains how they tracked participants, budget or results and reported them.'), ASK, NEXT],
  }),
  rp({
    id: 'rp.hr-logistics', node: 'interviews.hr', levels: [2, 4.5], minutes: 7,
    title: L('Interview: dispatcher at a logistics company', 'Suhbat: logistika kompaniyasida dispetcher', 'Собеседование: диспетчер в логистической компании'),
    setting: L('A logistics company delivering building materials around Tashkent region needs a dispatcher for 15 trucks. The operations manager interviews you in a busy office with phones ringing.', 'Toshkent viloyati bo‘ylab qurilish materiallarini yetkazib beradigan logistika kompaniyasiga 15 ta yuk mashinasi uchun dispetcher kerak. Operatsiyalar menejeri telefonlar jiringlab turgan ofisda siz bilan suhbatlashmoqda.', 'Логистической компании, доставляющей стройматериалы по Ташкентской области, нужен диспетчер на 15 грузовиков. Операционный менеджер проводит собеседование в шумном офисе, где звонят телефоны.'),
    learnerRole: L('An administrator from a small taxi company who coordinated drivers by phone and Telegram.', 'Telefon va Telegram orqali haydovchilarni muvofiqlashtirgan kichik taksi kompaniyasi administratori.', 'Администратор небольшой таксомоторной компании, координировавший водителей по телефону и в Telegram.'),
    goal: L('Show you can stay calm and organised under pressure, with examples.', 'Bosim ostida xotirjam va tartibli qola olishingizni misollar bilan ko‘rsating.', 'Покажите на примерах, что сохраняете спокойствие и порядок под давлением.'),
    persona: {
      name: nm('Bahodir', 'Баходир'),
      role: 'The operations manager, a former driver who built the dispatch team himself; impatient with theory.',
      style: 'Blunt and practical, asks scenario questions: a truck breaks down with an urgent load, two customers want delivery at the same hour, a driver refuses a route. Checks whether the candidate uses spreadsheets. Interrupts long answers with "so what would you do first?".',
      opening: T({ en: 'Sit, sit. I\'m Bahodir. No long stories, okay? A driver calls: his truck broke down on the ring road, and the cement must be on site by noon. What do you do?', uz: 'O‘tiring. Men Bahodirman. Uzun hikoyalarsiz, xo‘pmi? Haydovchi qo‘ng‘iroq qildi: mashinasi halqa yo‘lida buzildi, sement esa tushgacha obyektda bo‘lishi kerak. Nima qilasiz?', ru: 'Садитесь. Я Баходир. Без долгих историй, хорошо? Звонит водитель: грузовик сломался на кольцевой, а цемент должен быть на объекте к обеду. Что вы делаете?' }),
    },
    interest: 5,
    fields: [
      [pick('concern', ['none', 'panics', 'no_system', 'too_slow'], 'Bahodir\'s main doubt. Starts as panics; a clear first action and priority order makes it no_system; mentioning a tracking sheet or routine makes it none. Rambling makes it too_slow.'), 'panics'],
      [num('scenarios', 0, 4, 'How many scenarios Bahodir has tested (he tests three).', false), 0],
      [flag('trial_day', 'Whether Bahodir offered a trial day on the dispatch desk.'), false],
    ],
    rules: 'For each scenario, a first action within the first sentence (call the customer, send the nearest truck, inform the manager) and a sensible order: interest +1. Answers longer than about five sentences: −1 and concern too_slow. Mentioning a sheet, map or checklist used in the taxi job with an example: +2 and concern none. After three scenarios, at interest 7 or more and concern none, he offers a trial day; trial_day becomes true when accepted.',
    goals: [g('first_action', L('Say your first action straight away', 'Birinchi harakatingizni darhol ayting', 'Сразу назовите первое действие'), 'In the breakdown scenario the candidate gives a concrete first step in the first sentence.'), EXAMPLE, g('concise', L('Keep each answer short and practical', 'Har bir javobni qisqa va amaliy saqlang', 'Отвечайте коротко и по делу'), 'Most of the candidate\'s answers are a few sentences and focused on actions.'), NEXT],
    turns: [4, 10],
  }),

  // --- Behavioural panels -----------------------------------------------------------------------------
  rp({
    id: 'rp.panel-telecom', node: 'interviews.behavioural_star', levels: [2.5, 5], minutes: 9,
    title: L('Panel interview: a telecom graduate programme', 'Panel suhbat: telekom bitiruvchilar dasturi', 'Панельное интервью: программа для выпускников в телекоме'),
    setting: L('A mobile operator runs a one-year graduate programme with rotations in sales, network and finance. You reached the final round: a panel of an HR partner and a department head asks behavioural questions.', 'Mobil aloqa operatori savdo, tarmoq va moliya bo‘limlarida rotatsiyali bir yillik bitiruvchilar dasturini o‘tkazadi. Siz final bosqichga chiqdingiz: HR hamkor va bo‘lim boshlig‘idan iborat panel xulq-atvor savollarini beradi.', 'Мобильный оператор проводит годовую программу для выпускников с ротациями в продажах, сети и финансах. Вы дошли до финала: панель из HR-партнёра и руководителя департамента задаёт поведенческие вопросы.'),
    learnerRole: L('A final-year student with a part-time job, a student club role and one group project you can talk about.', 'Yarim stavka ishi, talabalar klubidagi vazifasi va gapirib bera oladigan bitta guruh loyihasi bor bitiruvchi kurs talabasi.', 'Студент выпускного курса с подработкой, ролью в студенческом клубе и одним групповым проектом, о котором можно рассказать.'),
    goal: L('Answer three behavioural questions with full STAR answers that end in results.', 'Uchta xulq-atvor savoliga natija bilan tugaydigan to‘liq STAR javoblarini bering.', 'Ответьте на три поведенческих вопроса полными STAR-ответами с результатами.'),
    persona: {
      name: nm('Nilufar', 'Нилуфар'),
      role: 'The HR business partner chairing the panel, speaking for herself and passing on questions from the head of sales sitting next to her.',
      style: 'Professional and neutral, takes notes. Asks: a time you worked in a team that struggled; a time you failed; a time you persuaded someone. Follows every answer with one probe: "What exactly did you do?" or "What was the result?". Says "the head of sales would like to ask…" for the third question.',
      opening: T({ en: 'Welcome to the final round. I\'m Nilufar from HR, and next to me is our head of sales. We will ask about real situations. First: tell us about a time you worked in a team that was struggling.', uz: 'Final bosqichga xush kelibsiz. Men HR bo‘limidan Nilufarman, yonimda savdo bo‘limi boshlig‘imiz. Real vaziyatlar haqida so‘raymiz. Birinchi savol: qiynalayotgan jamoada ishlagan holatingiz haqida gapirib bering.', ru: 'Добро пожаловать в финальный раунд. Я Нилуфар из HR, рядом со мной — руководитель отдела продаж. Мы спросим о реальных ситуациях. Первое: расскажите о случае, когда вы работали в команде, у которой не получалось.' }),
    },
    interest: 5,
    fields: [
      [num('star_complete', 0, 3, 'How many answers so far had all four STAR parts with a result.'), 0],
      [pick('concern', ['none', 'we_not_i', 'no_results', 'too_long'], 'The panel\'s main doubt so far: we_not_i (the candidate hides behind "we"), no_results, too_long; none when answers are complete and personal.'), 'we_not_i'],
      [flag('offer_stage', 'Whether the panel says the candidate will move to the offer stage.'), false],
    ],
    rules: 'Each answer with a situation, a task, actions in the first person and a stated result: star_complete +1 and interest +1. An answer told only with "we": concern we_not_i and the probe "What did you do personally?". An answer with no result: concern no_results and the probe "So what happened in the end?". Over about seven sentences: concern too_long. After three questions, if star_complete is 2 or more and interest 7 or more, Nilufar says HR will call about the offer stage this week; offer_stage becomes true.',
    goals: [g('star1', L('Give a complete STAR answer about a struggling team', 'Qiynalgan jamoa haqida to‘liq STAR javob bering', 'Дайте полный STAR-ответ о команде, у которой не получалось'), 'The first answer has situation, task, personal actions and a result.'), g('failure', L('Talk about a failure honestly and show what you learned', 'Muvaffaqiyatsizlik haqida halol gapiring va saboqni ko‘rsating', 'Честно расскажите о неудаче и покажите, чему научились'), 'The candidate names a real failure, their part in it, and what they changed afterwards.'), g('persuade', L('Show how you persuaded someone, with the outcome', 'Kimnidir qanday ko‘ndirganingizni natija bilan ko‘rsating', 'Покажите, как вы кого-то убедили, и чем это кончилось'), 'The candidate describes the person, their arguments or evidence, and the result.'), NEXT],
    turns: [4, 12],
  }),
  rp({
    id: 'rp.panel-pharma', node: 'interviews.behavioural_star', levels: [3, 5], minutes: 9,
    title: L('Panel interview: area sales manager, pharma distribution', 'Panel suhbat: farmatsevtika distributsiyasida hududiy savdo menejeri', 'Панельное интервью: региональный менеджер продаж, фармдистрибуция'),
    setting: L('A pharmaceutical distributor is hiring an area sales manager for Samarkand and Bukhara regions, leading six medical representatives. You meet the commercial director and the regional HR lead.', 'Farmatsevtika distributori Samarqand va Buxoro viloyatlari uchun oltita tibbiy vakilni boshqaradigan hududiy savdo menejerini yollamoqda. Siz tijorat direktori va hududiy HR rahbari bilan uchrashasiz.', 'Фармдистрибьютор нанимает регионального менеджера продаж по Самаркандской и Бухарской областям, руководящего шестью медпредставителями. Вы встречаетесь с коммерческим директором и региональным HR.'),
    learnerRole: L('A senior medical representative with five years in the field who has coached new colleagues but never managed a team.', 'Besh yillik tajribaga ega, yangi hamkasblarni o‘qitgan, lekin jamoani boshqarmagan katta tibbiy vakil.', 'Старший медпредставитель с пятилетним стажем, обучавший новичков, но не руководивший командой.'),
    goal: L('Convince the panel you can lead and grow a team, with results.', 'Jamoani boshqara olishingiz va rivojlantira olishingizga panelni natijalar bilan ishontiring.', 'Убедите панель результатами, что сможете руководить командой и развивать её.'),
    persona: {
      name: nm('Akmal Rustamovich', 'Акмаль Рустамович'),
      role: 'The commercial director, numbers-driven and sceptical of first-time managers, with the regional HR lead beside him.',
      style: 'Formal and fast. Asks: your best result and how you got it; a time you coached a weak performer; how you would handle a rep who falsifies visit reports; how you would plan the first 90 days. Pushes for figures and personal actions; dislikes vague answers about "motivation".',
      opening: T({ en: 'Good afternoon. Let\'s be practical. You\'ve been a medical rep for five years. Tell me about your best result in the field and exactly how you achieved it.', uz: 'Xayrli kun. Amaliy gaplashaylik. Besh yildan beri tibbiy vakilsiz. Sohadagi eng yaxshi natijangiz va unga aynan qanday erishganingiz haqida gapiring.', ru: 'Добрый день. Давайте по делу. Вы пять лет медпредставитель. Расскажите о своём лучшем результате и о том, как именно вы его добились.' }),
    },
    interest: 4,
    fields: [
      [pick('concern', ['none', 'not_a_leader', 'soft_on_ethics', 'no_plan'], 'The director\'s doubt: starts as not_a_leader; a coaching example with a measurable improvement makes it soft_on_ethics until the falsified-reports answer is firm and fair; a structured 90-day plan makes it none.'), 'not_a_leader'],
      [num('figures', 0, 5, 'How many concrete figures the candidate has given (sales growth, visits, coverage).', false), 0],
      [flag('final_case', 'Whether the panel invites the candidate to present a written 90-day plan next week.'), false],
    ],
    rules: 'Each concrete figure raises figures and interest +1 (up to +3 overall). A coaching story with what the candidate did and the rep\'s improvement: +2. For falsified visit reports, an answer that checks the facts, talks privately, applies company policy and fixes the cause raises interest; ignoring it or firing at once without facts lowers it. A 90-day plan with listening first, field visits, priorities and metrics: concern none. At interest 8 and concern none they invite a written 90-day plan presentation; final_case becomes true when accepted.',
    goals: [EXAMPLE, g('coaching', L('Show how you improved a weaker colleague', 'Zaifroq hamkasbni qanday rivojlantirganingizni ko‘rsating', 'Покажите, как вы помогли слабому коллеге вырасти'), 'The candidate gives a coaching example with their actions and a measurable change.'), g('ethics', L('Handle the falsified reports question firmly and fairly', 'Soxta hisobotlar savoliga qat’iy va adolatli javob bering', 'Твёрдо и справедливо ответьте про фальсификацию отчётов'), 'The candidate checks facts, speaks privately, follows policy and addresses the cause.'), NEXT],
    turns: [4, 12],
  }),

  // --- Role-specific interviews -----------------------------------------------------------------------
  rp({
    id: 'rp.role-accountant', node: 'interviews.role_specific', levels: [2.5, 5], minutes: 8,
    title: L('Technical interview: accountant', 'Texnik suhbat: buxgalter', 'Техническое интервью: бухгалтер'),
    setting: L('A furniture manufacturer with 200 employees is hiring an accountant. The chief accountant asks practical questions about your daily work.', '200 xodimli mebel ishlab chiqaruvchi korxona buxgalter yollamoqda. Bosh buxgalter kundalik ishingiz haqida amaliy savollar beradi.', 'Мебельное производство на 200 сотрудников ищет бухгалтера. Главный бухгалтер задаёт практические вопросы о вашей ежедневной работе.'),
    learnerRole: L('An accountant with three years at a trading company, working with primary documents, bank statements and supplier reconciliations.', 'Savdo kompaniyasida uch yil ishlagan, birlamchi hujjatlar, bank ko‘chirmalari va yetkazib beruvchilar bilan solishtirma ishlarini yuritgan buxgalter.', 'Бухгалтер с трёхлетним опытом в торговой компании: первичка, банковские выписки, сверки с поставщиками.'),
    goal: L('Show precise, practical knowledge of your work and how you avoid errors.', 'Ishingiz bo‘yicha aniq, amaliy bilim va xatolarning oldini qanday olishingizni ko‘rsating.', 'Покажите точное практическое знание своей работы и то, как вы избегаете ошибок.'),
    persona: {
      name: nm('Gulchehra opa', 'Гульчехра-опа'),
      role: 'The chief accountant, meticulous and calm, who has run the department for twelve years.',
      style: 'Asks about method, not definitions: how the candidate organises month end, what they do when a reconciliation does not match, how they handle a missing invoice, which software they use and how fast they learn a new one, and what they would do if a manager asked them to post something incorrectly. Never states tax rules herself; if the candidate asks about a specific rule, she says they would check the current law together.',
      opening: T({ en: 'Good morning. I\'m Gulchehra, the chief accountant. Let\'s talk about real work. How do you organise your month-end closing?', uz: 'Xayrli tong. Men bosh buxgalter Gulchehraman. Real ish haqida gaplashaylik. Oy yakunini yopishni qanday tashkil qilasiz?', ru: 'Доброе утро. Я Гульчехра, главный бухгалтер. Поговорим о реальной работе. Как вы организуете закрытие месяца?' }),
    },
    interest: 5,
    fields: [
      [pick('concern', ['none', 'no_method', 'careless', 'integrity'], 'Gulchehra\'s doubt: starts as no_method; a step-by-step month-end routine makes it careless until the candidate explains how they check and reconcile; a principled answer to the incorrect-posting question makes it none.'), 'no_method'],
      [flag('test_task', 'Whether she offered a short practical test with sample documents.'), false],
    ],
    rules: 'A month-end routine in steps (documents, bank, reconciliations, checks, reports) with timing: interest +2. A mismatch story with how the cause was found: +1. For the incorrect-posting request, a polite but firm refusal with an alternative (document properly, ask the chief accountant) raises interest; agreeing lowers it by 3 and concern becomes integrity. At interest 8 and concern none she offers a test with sample documents next Tuesday; test_task becomes true when accepted.',
    goals: [g('method', L('Describe your month-end routine step by step', 'Oy yakunini yopish tartibingizni bosqichma-bosqich tasvirlang', 'Опишите процедуру закрытия месяца по шагам'), 'The candidate lists concrete steps in a sensible order.'), EXAMPLE, g('integrity', L('Refuse an incorrect posting politely and firmly', 'Noto‘g‘ri yozuvni muloyim va qat’iy rad eting', 'Вежливо и твёрдо откажитесь от некорректной проводки'), 'The candidate declines and offers a correct alternative.'), NEXT],
  }),
  rp({
    id: 'rp.role-teacher', node: 'interviews.role_specific', levels: [2, 4.5], minutes: 8,
    title: L('After a demo lesson: English teacher', 'Namunaviy darsdan keyin: ingliz tili o‘qituvchisi', 'После пробного урока: преподаватель английского'),
    setting: L('You have just given a 20-minute demo lesson to a group of teenagers at a private learning centre. The academic director asks you to reflect on it and answers your questions.', 'Siz xususiy o‘quv markazida o‘smirlar guruhiga 20 daqiqalik namunaviy dars o‘tdingiz. O‘quv ishlari bo‘yicha direktor dars haqida mulohaza qilishingizni so‘rayapti.', 'Вы только что провели 20-минутный пробный урок для группы подростков в частном учебном центре. Академический директор просит вас проанализировать урок.'),
    learnerRole: L('A teacher with two years of experience; in the demo, two students at the back did not speak at all.', 'Ikki yillik tajribaga ega o‘qituvchi; namunaviy darsda orqada o‘tirgan ikki o‘quvchi umuman gapirmadi.', 'Преподаватель с двухлетним опытом; на пробном уроке два ученика в конце класса вообще не говорили.'),
    goal: L('Reflect honestly on the lesson, show how you would improve it, and prove results from past groups.', 'Dars haqida halol mulohaza qiling, uni qanday yaxshilashni va oldingi guruhlardagi natijalaringizni ko‘rsating.', 'Честно проанализируйте урок, покажите, как улучшите его, и подтвердите результаты прошлых групп.'),
    persona: {
      name: nm('Dildora', 'Дильдора'),
      role: 'The academic director, an experienced teacher trainer who values reflection over perfect lessons.',
      style: 'Supportive but probing. Asks what went well and what the candidate would change, why the two students did not speak, how they track progress, and how they would talk to a parent who says their child is bored. Appreciates specific student results (exam scores, levels moved) and honest self-assessment.',
      opening: T({ en: 'Thank you, that was lively. Before I give my feedback — how do you think it went? What would you change if you taught it again tomorrow?', uz: 'Rahmat, dars jonli o‘tdi. Fikrimni aytishdan oldin — o‘zingizcha qanday o‘tdi? Ertaga qayta o‘tsangiz, nimani o‘zgartirgan bo‘lardingiz?', ru: 'Спасибо, урок получился живым. Прежде чем я дам обратную связь — как вам самим? Что бы вы изменили, если бы вели этот урок завтра?' }),
    },
    interest: 5,
    fields: [
      [pick('concern', ['none', 'no_reflection', 'quiet_students', 'no_results'], 'Dildora\'s doubt: starts as no_reflection; an honest, specific self-assessment makes it quiet_students; a concrete plan to involve the two students (pair work, roles, wait time) makes it no_results; evidence of past students\' progress makes it none.'), 'no_reflection'],
      [flag('trial_group', 'Whether Dildora offers a trial month with one group.'), false],
    ],
    rules: '"Everything went well" or blaming the students: −1. Naming one strength and one change with a reason: +2. A plan for the quiet students: +1. Progress evidence (levels, test results, a student who passed an exam) given honestly: +2. For the bored child, a respectful plan (listen, adjust tasks, follow up with the parent) raises interest. At interest 8 and concern none she offers a trial month with one group from next week.',
    goals: [g('reflect', L('Name a strength and a specific change', 'Bitta kuchli tomon va aniq o‘zgarishni ayting', 'Назовите сильную сторону и конкретное изменение'), 'The candidate evaluates the lesson honestly with at least one concrete improvement.'), g('quiet', L('Give a plan for the quiet students', 'Jim o‘quvchilar uchun reja bering', 'Предложите план для молчаливых учеников'), 'The candidate suggests concrete techniques to involve them.'), EXAMPLE, NEXT],
  }),
  rp({
    id: 'rp.role-marketing', node: 'interviews.role_specific', levels: [2.5, 5], minutes: 9,
    title: L('Case interview: launching a product online', 'Keys suhbati: mahsulotni onlayn chiqarish', 'Кейс-интервью: онлайн-запуск продукта'),
    setting: L('A family company that makes dried fruit gift boxes in Fergana wants to sell online in Tashkent. The head of marketing gives you a mini case: plan the first month of the launch with a small budget.', 'Farg‘onada quritilgan meva sovg‘a qutilarini ishlab chiqaradigan oilaviy kompaniya Toshkentda onlayn sotmoqchi. Marketing rahbari kichik keys beradi: kichik byudjet bilan birinchi oylik reja tuzing.', 'Семейная компания из Ферганы, которая делает подарочные наборы сухофруктов, хочет продавать онлайн в Ташкенте. Руководитель маркетинга даёт мини-кейс: спланируйте первый месяц запуска с небольшим бюджетом.'),
    learnerRole: L('A marketing specialist with two years running social media for a café chain.', 'Ikki yil kafe tarmog‘i ijtimoiy tarmoqlarini yuritgan marketing mutaxassisi.', 'Маркетолог с двухлетним опытом ведения соцсетей сети кафе.'),
    goal: L('Ask clarifying questions, give a structured plan with metrics, and defend it.', 'Aniqlashtiruvchi savollar bering, ko‘rsatkichli tuzilgan reja taklif qiling va uni himoya qiling.', 'Задайте уточняющие вопросы, предложите структурированный план с метриками и защитите его.'),
    persona: {
      name: nm('Rustam', 'Рустам'),
      role: 'The head of marketing, analytical and curious, who wants to see how the candidate thinks, not a perfect answer.',
      style: 'Gives the case in two sentences and waits. If asked, shares (practice figures): budget 15 million UZS for the month, gift boxes priced 180,000–350,000 UZS, delivery in Tashkent in one day, the main season is before holidays. Challenges one assumption ("why Instagram and not Telegram?") and asks which numbers they would check after a week.',
      opening: T({ en: 'Here\'s a small case. A family company from Fergana makes dried fruit gift boxes and wants to start selling online in Tashkent next month. How would you plan the first month?', uz: 'Kichik keys. Farg‘onalik oilaviy kompaniya quritilgan meva sovg‘a qutilarini tayyorlaydi va keyingi oydan Toshkentda onlayn sotishni boshlamoqchi. Birinchi oyni qanday rejalashtirasiz?', ru: 'Небольшой кейс. Семейная компания из Ферганы делает подарочные наборы сухофруктов и хочет со следующего месяца продавать онлайн в Ташкенте. Как бы вы спланировали первый месяц?' }),
    },
    interest: 5,
    fields: [
      [num('clarifying', 0, 5, 'How many clarifying questions the candidate asked before planning (budget, price, audience, delivery, season).'), 0],
      [pick('concern', ['none', 'jumps_in', 'no_metrics', 'no_structure'], 'Rustam\'s doubt: jumps_in if the candidate plans with no questions; no_structure if the plan is a list of ideas; no_metrics if there is no way to measure; none for a structured plan with metrics.'), 'jumps_in'],
      [flag('next_round', 'Whether Rustam invites the candidate to meet the owner.'), false],
    ],
    rules: 'Each clarifying question: clarifying +1, interest +1 (up to +2); he answers only with the practice figures in his style. Planning with no questions keeps concern at jumps_in. A plan in steps (audience, channels, offer, content, budget split, timeline) moves concern to no_metrics; naming metrics (orders, cost per order, conversion, repeat buyers) moves it to none and interest +2. Defending the channel choice with a reason, or changing it with a reason, both raise interest. At interest 8 and concern none he invites them to meet the owner.',
    goals: [g('clarify', L('Ask clarifying questions before planning', 'Rejalashdan oldin aniqlashtiruvchi savollar bering', 'Задайте уточняющие вопросы до планирования'), 'At least two questions about budget, price, audience or logistics before the plan.'), g('plan', L('Give a structured plan with clear metrics', 'Aniq ko‘rsatkichli tuzilgan reja bering', 'Дайте структурированный план с понятными метриками'), 'The plan has steps and the numbers that would show success.'), g('defend', L('Defend or adjust a choice with a reason', 'Tanlovingizni asos bilan himoya qiling yoki o‘zgartiring', 'Обоснованно защитите или скорректируйте выбор'), 'When challenged, the candidate gives a reason for the channel choice or changes it with a reason.'), NEXT],
    turns: [4, 12],
  }),

  // --- Salary negotiation (scorecard: objections handled, next step secured) --------------------------------
  rp({
    id: 'rp.salary-it-offer', node: 'interviews.salary_negotiation', levels: [2.5, 5], minutes: 7,
    title: L('Salary negotiation: an IT job offer', 'Maosh muzokarasi: IT ish taklifi', 'Переговоры о зарплате: оффер в IT'),
    setting: L('After three rounds, an IT outsourcing company calls with an offer for a junior QA engineer: 9 million UZS a month gross, a three-month probation (practice figures). You hoped for more because you can also write automated tests.', 'Uch bosqichdan so‘ng IT autsorsing kompaniyasi boshlovchi QA muhandisi lavozimiga taklif bilan qo‘ng‘iroq qildi: oyiga 9 million so‘m (soliqlar ushlanmasdan oldin), uch oylik sinov muddati (mashq uchun raqamlar). Avtomatlashtirilgan testlarni ham yoza olganingiz uchun ko‘proq kutgan edingiz.', 'После трёх этапов аутсорсинговая IT-компания звонит с оффером на позицию младшего тестировщика: 9 млн сумов в месяц до вычета налогов, испытательный срок три месяца (учебные цифры). Вы рассчитывали на большее, ведь умеете писать автотесты.'),
    learnerRole: L('The candidate who has the offer. Your own minimum for this practice: 10 million UZS.', 'Taklif olgan nomzod. Bu mashq uchun o‘z minimal talabingiz: 10 million so‘m.', 'Кандидат с оффером. Ваш минимум в этой практике — 10 млн сумов.'),
    goal: L('Thank them, counter with a reason, handle "this is our range", and agree terms in writing.', 'Rahmat ayting, asos bilan qarshi taklif bering, «bu bizning diapazonimiz» e’tiroziga javob bering va shartlarni yozma kelishing.', 'Поблагодарите, сделайте встречное предложение с обоснованием, отработайте «это наша вилка» и закрепите условия письменно.'),
    persona: {
      name: nm('Shahzoda', 'Шахзода'),
      role: 'The HR manager making the offer, who has some room in the budget but must justify any increase to the team lead.',
      style: 'Positive and professional. Presents the offer and says "this is our standard range for juniors" the first time the candidate asks for more. Responds well to reasons linked to the role (automation skills, faster ramp-up) and to flexible packages (review after probation, training budget, a sign-on bonus). Does not reveal the maximum. Never names market salary data; if the candidate quotes "the market", she asks where the figure comes from.',
      opening: T({ en: 'Hi, it\'s Shahzoda from HR with good news: the team would like to offer you the junior QA position. The salary is nine million som a month gross, with a three-month probation. What do you think?', uz: 'Salom, HR dan Shahzoda, yaxshi xabar bilan: jamoa sizga boshlovchi QA lavozimini taklif qilmoqchi. Maosh oyiga to‘qqiz million so‘m, soliqlar ushlanmasdan oldin, uch oylik sinov muddati bilan. Nima deysiz?', ru: 'Здравствуйте, это Шахзода из HR с хорошей новостью: команда хочет предложить вам позицию младшего тестировщика. Зарплата — девять миллионов сумов в месяц до вычета налогов, испытательный срок три месяца. Что скажете?' }),
    },
    interest: 6,
    fields: [
      [num('offer', 9, 12, 'The monthly salary on the table, in million UZS gross (practice figure).'), 9],
      [num('budget_max', 9, 12, 'The most HR can approve for this role, in million UZS (practice figure); never said aloud.', true), 10.5],
      [pick('flexibility', ['fixed', 'some', 'high'], 'How flexible HR is willing to be: fixed after a rude or demanding counter, some by default, high after a reasoned counter.'), 'some'],
      [flag('in_writing', 'Whether HR agreed to send the final terms in writing.'), false],
    ],
    general: 'General rules: interest +1 for thanks and a clear statement that the candidate wants the job; +1 for a reason tied to the role (skills, results, scope); −2 for ultimatums or comparing with friends\' salaries; −1 for accepting or refusing in the first reply without discussion. Figures are practice numbers; never cite market data. Scenario rules: ',
    rules: 'The first time the candidate asks for more, she says "this is our standard range" (the objection). A calm counter with a reason makes flexibility high; she can then raise offer in steps of 0.5 up to budget_max, or add a salary review after probation or a training budget. A figure with no reason gets only a review after probation. An immediate yes leaves offer at 9. If the candidate asks for the terms in writing or proposes a decision date, in_writing becomes true.',
    goals: [
      g('thanks', L('Thank them and show you want the job', 'Rahmat ayting va ishni xohlayotganingizni ko‘rsating', 'Поблагодарите и покажите, что хотите эту работу'), 'The candidate thanks HR and says they are interested before negotiating.'),
      g('counter', L('Counter with a figure and a reason', 'Raqam va asos bilan qarshi taklif bering', 'Назовите встречную цифру с обоснованием'), 'The candidate names a figure or range and gives a reason linked to the role.'),
      g('obj_range', L('Handle "this is our standard range"', '«Bu bizning standart diapazonimiz» e’tiroziga javob bering', 'Отработайте «это наша стандартная вилка»'), 'After the objection, the candidate stays calm and proposes an alternative (a review after probation, another package item) or restates the reason, without giving up or getting aggressive.', 'objection'),
      g('terms', L('Agree the terms in writing or a decision date', 'Shartlarni yozma ravishda yoki qaror sanasini kelishing', 'Закрепите условия письменно или договоритесь о сроке решения'), 'The conversation ends with written terms requested or a clear decision date.', 'next_step'),
    ],
    turns: [3, 10],
  }),
  rp({
    id: 'rp.salary-raise', node: 'interviews.salary_negotiation', levels: [3, 5], minutes: 7,
    title: L('Asking your manager for a raise', 'Rahbardan maoshni oshirishni so‘rash', 'Просьба о повышении зарплаты у руководителя'),
    setting: L('You have worked for two years as a sales coordinator at a furniture importer. This year you took over the company\'s two biggest corporate clients. You booked a meeting with your manager to discuss your salary.', 'Siz ikki yildan beri mebel import qiluvchi kompaniyada savdo koordinatori bo‘lib ishlaysiz. Bu yil kompaniyaning eng yirik ikki korporativ mijozini o‘zingiz yuritib boshladingiz. Maosh masalasini muhokama qilish uchun rahbaringiz bilan uchrashuv belgiladingiz.', 'Вы два года работаете координатором продаж у импортёра мебели. В этом году вы взяли на себя двух крупнейших корпоративных клиентов компании. Вы назначили встречу с руководителем, чтобы обсудить зарплату.'),
    learnerRole: L('A sales coordinator asking for a raise with evidence of the extra responsibility.', 'Qo‘shimcha mas’uliyat dalillari bilan maosh oshirishni so‘rayotgan savdo koordinatori.', 'Координатор продаж, который просит повышения, опираясь на доказательства возросшей ответственности.'),
    goal: L('Make the case with results, handle "the budget is closed until next year", and leave with a concrete next step.', 'Natijalar bilan dalillang, «byudjet keyingi yilgacha yopiq» e’tiroziga javob bering va aniq keyingi qadam bilan chiqing.', 'Обоснуйте результатами, отработайте «бюджет закрыт до следующего года» и уйдите с конкретным следующим шагом.'),
    persona: {
      name: nm('Farhod aka', 'Фарход-ака'),
      role: 'The commercial manager, fair but under pressure from the owner to keep costs down.',
      style: 'Friendly, busy. Listens, then says "the budget is closed until next year". Moves when the employee shows numbers (what the two clients ordered, problems solved) and offers options: a review date, a title change, a bonus tied to results. Respects calm persistence; reacts badly to threats to leave.',
      opening: T({ en: 'Come in, I have about fifteen minutes. You wanted to talk about something important?', uz: 'Kiring, o‘n besh daqiqacha vaqtim bor. Muhim narsa haqida gaplashmoqchi edingizmi?', ru: 'Заходите, у меня минут пятнадцать. Вы хотели поговорить о чём-то важном?' }),
    },
    interest: 5,
    fields: [
      [pick('outcome', ['nothing', 'review_date', 'bonus', 'raise'], 'What the manager is willing to agree to now: nothing by default; review_date after a reasoned case; bonus or raise after strong evidence and a calm answer to the budget objection.'), 'nothing'],
      [num('evidence', 0, 5, 'How many concrete results the employee has given (orders, clients kept, problems solved).', false), 0],
      [flag('agreed_in_writing', 'Whether the manager agreed to put the outcome or review date in writing (an email).'), false],
    ],
    general: 'General rules: interest +1 for a clear request at the start, +1 for each concrete result, −2 for a threat to leave or comparing colleagues\' salaries, −1 for apologising for asking. Figures are practice numbers; never cite market data. Scenario rules: ',
    rules: 'He raises the objection "the budget is closed until next year" after the first request. Evidence of 2 or more results plus a calm response (understanding, then an alternative such as a review in three months or a results bonus) moves outcome to review_date or bonus; 4 results and a well-argued case can reach raise. If the employee asks for the agreement in an email, agreed_in_writing becomes true.',
    goals: [
      g('case', L('Make your case with concrete results', 'Talabingizni aniq natijalar bilan asoslang', 'Обоснуйте просьбу конкретными результатами'), 'The employee gives at least two specific results or responsibilities added.'),
      g('obj_budget', L('Handle "the budget is closed until next year"', '«Byudjet keyingi yilgacha yopiq» e’tiroziga javob bering', 'Отработайте «бюджет закрыт до следующего года»'), 'The employee acknowledges the constraint and proposes an alternative (a review date, a bonus, a title change) without giving up or threatening.', 'objection'),
      g('next', L('Leave with a concrete agreement in writing', 'Yozma aniq kelishuv bilan chiqing', 'Уйдите с конкретной письменной договорённостью'), 'The meeting ends with a specific outcome or review date and an agreement to confirm it by email.', 'next_step'),
    ],
    turns: [3, 10],
  }),
  rp({
    id: 'rp.salary-hotel-package', node: 'interviews.salary_negotiation', levels: [2, 4.5], minutes: 7,
    title: L('Negotiating the whole package: hotel supervisor', 'Butun shartlar bo‘yicha muzokara: mehmonxona supervayzeri', 'Переговоры о всём пакете: супервайзер отеля'),
    setting: L('A Bukhara hotel offers you the front office supervisor job: 7 million UZS a month, start in one week, rotating shifts (practice figures). You need two weeks\' notice at your current job and you live 40 minutes away.', 'Buxorodagi mehmonxona sizga qabulxona supervayzeri lavozimini taklif qilmoqda: oyiga 7 million so‘m, bir haftadan keyin ishga chiqish, almashinuvchi smenalar (mashq uchun raqamlar). Hozirgi ishingizda ikki hafta oldin ogohlantirishingiz kerak, uyingiz esa 40 daqiqalik masofada.', 'Отель в Бухаре предлагает вам должность супервайзера ресепшен: 7 млн сумов в месяц, выход через неделю, сменный график (учебные цифры). На текущей работе нужно отработать две недели, а живёте вы в 40 минутах езды.'),
    learnerRole: L('A receptionist who wants the job but needs a later start date and help with late-shift transport.', 'Ishni xohlaydigan, lekin kechroq boshlash va kechki smenada transport yordami kerak bo‘lgan qabulxona xodimi.', 'Администратор, который хочет эту работу, но ему нужны более поздний выход и помощь с транспортом после поздних смен.'),
    goal: L('Negotiate start date, transport and salary together, handle "we need someone now", and confirm the terms.', 'Boshlash sanasi, transport va maoshni birga muhokama qiling, «bizga hozir odam kerak» e’tiroziga javob bering va shartlarni tasdiqlang.', 'Обсудите вместе дату выхода, транспорт и зарплату, отработайте «нам нужен человек сейчас» и подтвердите условия.'),
    persona: {
      name: nm('Javlon', 'Жавлон'),
      role: 'The hotel general manager, hiring fast before the season, with little room on salary but some on schedule and benefits.',
      style: 'Direct and in a hurry: "we need someone now". Can move the start date if given a reason and a plan (a few handover days), and can add taxi money for late shifts or staff meals; salary can rise only a little and only for a reason. Respects people who keep commitments to their current employer.',
      opening: T({ en: 'So, we\'d like you to start as supervisor next Monday. Seven million a month, rotating shifts. Can you start Monday?', uz: 'Xullas, keyingi dushanbadan supervayzer bo‘lib ishlashingizni xohlaymiz. Oyiga yetti million, almashinuvchi smenalar. Dushanbadan boshlay olasizmi?', ru: 'Итак, мы хотим, чтобы вы вышли супервайзером со следующего понедельника. Семь миллионов в месяц, сменный график. Сможете выйти в понедельник?' }),
    },
    interest: 6,
    fields: [
      [num('start_in_days', 7, 21, 'The start date agreed so far, in days from now.'), 7],
      [num('salary', 7, 8.5, 'The monthly salary on the table, in million UZS (practice figure).'), 7],
      [flag('transport', 'Whether the manager agreed to taxi money or a lift after late shifts.'), false],
      [flag('confirmed', 'Whether the terms will be confirmed in writing.'), false],
    ],
    general: 'General rules: interest +1 for enthusiasm and for each reason the candidate gives, −2 for leaving the current employer without notice or for ultimatums. Figures are practice numbers; never cite market data. Scenario rules: ',
    rules: 'When the candidate asks for a later start, he objects "we need someone now". A reason (two weeks\' notice) plus an offer (come in for two evenings of handover, or start in 14 days) moves start_in_days to 14. Explaining the late-shift transport problem gets transport true. Salary moves to 7.5 only with a reason (supervisor experience, languages) and never above 8.5. Asking for the agreed terms in writing sets confirmed.',
    goals: [
      g('package', L('Raise more than salary: start date and transport', 'Maoshdan tashqari masalalarni ham ko‘taring: boshlash sanasi va transport', 'Обсудите не только зарплату: дату выхода и транспорт'), 'The candidate raises at least two parts of the package besides salary.'),
      g('obj_now', L('Handle "we need someone now"', '«Bizga hozir odam kerak» e’tiroziga javob bering', 'Отработайте «нам нужен человек сейчас»'), 'The candidate explains the notice period and proposes a solution (handover days, a specific start date).', 'objection'),
      g('confirm', L('Confirm the agreed terms in writing', 'Kelishilgan shartlarni yozma tasdiqlang', 'Подтвердите договорённости письменно'), 'The conversation ends with the terms summarised and a written confirmation requested.', 'next_step'),
    ],
    turns: [3, 10],
  }),

  // --- Student-visa interview practice (facts only from facts.ts) ---------------------------------------------
  rp({
    id: 'rp.visa-us-undergrad', node: 'interviews.student_visa', levels: [2, 5], minutes: 6, facts: US_VISA_FACTS,
    title: L('US student visa practice: undergraduate', 'AQSh talabalik vizasi mashqi: bakalavriat', 'Практика визы в США: бакалавриат'),
    setting: L('Practice for a US student visa interview at a consular window. You were admitted to a four-year business degree at a US university. This is practice: the coach is not a consular officer and nothing here is a real decision.', 'AQSh talabalik vizasi suhbati mashqi (konsullik darchasi). Siz AQSh universitetining to‘rt yillik biznes yo‘nalishiga qabul qilingansiz. Bu mashq: murabbiy konsul xodimi emas va bu yerdagi hech narsa haqiqiy qaror emas.', 'Практика собеседования на студенческую визу США у консульского окна. Вас приняли на четырёхлетнюю программу по бизнесу в американском университете. Это тренировка: коуч не консульский сотрудник, и здесь ничего не является реальным решением.'),
    learnerRole: L('An 18-year-old school graduate from Tashkent; your parents pay for your studies.', 'Toshkentlik 18 yoshli maktab bitiruvchisi; o‘qishingizni ota-onangiz to‘laydi.', 'Выпускник школы из Ташкента, 18 лет; учёбу оплачивают родители.'),
    goal: L('Answer briefly, truthfully and consistently: why this programme, who pays, your plans after study.', 'Qisqa, rost va izchil javob bering: nega shu dastur, kim to‘laydi, o‘qishdan keyingi rejalaringiz.', 'Отвечайте коротко, честно и последовательно: почему эта программа, кто платит, планы после учёбы.'),
    persona: {
      name: T({ en: 'The consular officer', uz: 'Konsullik xodimi', ru: 'Консульский сотрудник' }),
      role: 'A consular officer in a practice interview, played by the coach.',
      style: 'Brief, neutral and quick: one short question at a time (which university, why this programme, who pays and what they do, what you will do after graduating, have you travelled abroad). Speaks the learner\'s language in this practice. Never states any rule, document requirement, fee or date unless it is in the facts provided, and then only as written there with its check date; if asked about anything else, says to check the official site. Never announces a real approval or refusal: at the end says "Thank you, that is all for today" and that this was practice. If an answer sounds memorised, asks a follow-up in different words.',
      opening: T({ en: 'Good morning. Passport and Form I-20, please. Thank you. Which university are you going to, and what will you study?', uz: 'Xayrli tong. Pasport va I-20 shaklini bering, iltimos. Rahmat. Qaysi universitetga borasiz va nima o‘qiysiz?', ru: 'Доброе утро. Паспорт и форму I-20, пожалуйста. Спасибо. В какой университет вы едете и что будете изучать?' }),
    },
    interest: 5,
    fields: [
      [num('credibility', 0, 10, 'How clear and credible the applicant\'s answers sound to the officer in this practice.'), 5],
      [pick('concern', ['none', 'study_plan', 'funding', 'after_study', 'consistency'], 'What the officer would probe next: study_plan if the programme reason is vague, funding if the sponsor is unclear, after_study if plans after graduation are vague, consistency if answers contradict each other; none when all are clear.'), 'study_plan'],
      [flag('memorised', 'Whether an answer sounded recited rather than the applicant\'s own words.'), false],
    ],
    general: 'General rules for this practice: credibility +1 for a short, specific, truthful-sounding answer in the applicant\'s own words; −1 for a long speech; −1 and memorised true when an answer sounds recited (then ask the same thing in different words); −2 for an answer that contradicts an earlier one. Interest moves with credibility. The officer states facts only from the facts block. Scenario rules: ',
    rules: 'Ask about the programme first: a specific reason (a course, a skill, a career link) moves concern from study_plan to funding. Ask who pays and what the sponsor does: a clear answer moves concern to after_study. Ask about plans after graduation: a concrete plan moves concern to none. Contradictions set concern to consistency. End after about six questions with a neutral closing line, saying this was practice.',
    goals: [
      g('why_programme', L('Explain why this programme and university specifically', 'Nega aynan shu dastur va universitet ekanini aniq tushuntiring', 'Конкретно объясните, почему эта программа и этот университет'), 'The applicant gives a specific, personal reason for the programme and university.'),
      g('funding', L('Explain clearly who pays and how', 'Kim va qanday to‘lashini aniq tushuntiring', 'Чётко объясните, кто и как платит'), 'The applicant names the sponsor and what they do in one or two clear sentences.'),
      g('plans', L('Describe your plans after graduation', 'O‘qishdan keyingi rejalaringizni tasvirlang', 'Опишите планы после окончания учёбы'), 'The applicant gives a concrete plan for after the programme.'),
      g('brief', L('Keep answers short, truthful and consistent', 'Javoblarni qisqa, rost va izchil saqlang', 'Отвечайте коротко, честно и последовательно'), 'Answers are a few sentences each, in the applicant\'s own words, with no contradictions.'),
    ],
    turns: [4, 9],
  }),
  rp({
    id: 'rp.visa-us-masters', node: 'interviews.student_visa', levels: [3, 5], minutes: 7, facts: US_VISA_FACTS,
    title: L('US student visa practice: a master\'s with a gap', 'AQSh talabalik vizasi mashqi: tanaffusdan keyingi magistratura', 'Практика визы в США: магистратура после перерыва'),
    setting: L('Practice for a US student visa interview. You were admitted to a master\'s in data analytics. You graduated three years ago, worked in a bank, and your uncle\'s company is your main sponsor. This is practice, not a real decision.', 'AQSh talabalik vizasi suhbati mashqi. Siz ma’lumotlar tahlili bo‘yicha magistraturaga qabul qilingansiz. Uch yil oldin bitirgansiz, bankda ishlagansiz, asosiy homiyingiz amakingizning kompaniyasi. Bu mashq, haqiqiy qaror emas.', 'Практика собеседования на студенческую визу США. Вас приняли в магистратуру по аналитике данных. Вы окончили вуз три года назад, работали в банке, а основной спонсор — компания вашего дяди. Это тренировка, а не реальное решение.'),
    learnerRole: L('A 25-year-old bank analyst going back to study, with an uncle as sponsor.', 'O‘qishga qaytayotgan 25 yoshli bank tahlilchisi, homiysi — amakisi.', 'Банковский аналитик 25 лет, возвращающийся к учёбе; спонсор — дядя.'),
    goal: L('Explain the career logic of the gap, the sponsor and your return plan clearly and consistently.', 'Tanaffusning karyera mantig‘i, homiy va qaytish rejangizni aniq va izchil tushuntiring.', 'Ясно и последовательно объясните карьерную логику перерыва, спонсора и план возвращения.'),
    persona: {
      name: T({ en: 'The consular officer', uz: 'Konsullik xodimi', ru: 'Консульский сотрудник' }),
      role: 'A consular officer in a practice interview, played by the coach.',
      style: 'Brief, neutral, slightly more probing: why study now after three years of work, why an uncle and not parents, what the uncle\'s company does, what job you expect after returning. Speaks the learner\'s language in this practice. Never states any rule, document requirement, fee or date unless it is in the facts provided, and then only as written with its check date; otherwise says to check the official site. Never announces a real decision; ends with "Thank you, that is all for today" and that this was practice.',
      opening: T({ en: 'Good afternoon. You finished university three years ago. Why do you want to study again now?', uz: 'Xayrli kun. Universitetni uch yil oldin bitirgansiz. Nega endi yana o‘qimoqchisiz?', ru: 'Добрый день. Вы окончили университет три года назад. Почему вы хотите снова учиться именно сейчас?' }),
    },
    interest: 5,
    fields: [
      [num('credibility', 0, 10, 'How clear and credible the applicant\'s answers sound to the officer in this practice.'), 5],
      [pick('concern', ['none', 'why_now', 'sponsor', 'return_plan', 'consistency'], 'What the officer would probe next: why_now, sponsor, return_plan, consistency; none when all are clear.'), 'why_now'],
      [flag('memorised', 'Whether an answer sounded recited.'), false],
    ],
    general: 'General rules for this practice: credibility +1 for a short, specific, truthful-sounding answer in the applicant\'s own words; −1 for a long speech; −1 and memorised true for a recited answer (then rephrase the question); −2 for a contradiction. Interest moves with credibility. The officer states facts only from the facts block. Scenario rules: ',
    rules: 'A career reason for the master\'s that uses the bank experience (moving into analytics) moves concern to sponsor. A clear explanation of the uncle\'s support and his business moves it to return_plan. A concrete plan after the degree (a role, an employer type, the family or bank connection) moves it to none. End after about six questions with a neutral practice closing.',
    goals: [
      g('why_now', L('Explain why now, using your work experience', 'Ish tajribangiz orqali nega hozir ekanini tushuntiring', 'Объясните, почему сейчас, опираясь на опыт работы'), 'The applicant links three years of work to the decision to study analytics now.'),
      g('sponsor', L('Explain the sponsor simply and clearly', 'Homiyni sodda va aniq tushuntiring', 'Просто и ясно объясните, кто спонсор'), 'The applicant explains who the uncle is, what the company does and why he supports them.'),
      g('return', L('Give a concrete plan after the degree', 'Darajadan keyingi aniq reja bering', 'Дайте конкретный план после получения степени'), 'The applicant describes the job or path they expect afterwards.'),
      g('brief', L('Keep answers short, truthful and consistent', 'Javoblarni qisqa, rost va izchil saqlang', 'Отвечайте коротко, честно и последовательно'), 'Answers are short and consistent, in the applicant\'s own words.'),
    ],
    turns: [4, 9],
  }),
  rp({
    id: 'rp.visa-uk-study', node: 'interviews.student_visa', levels: [2.5, 5], minutes: 7, facts: UK_VISA_FACTS,
    title: L('UK study plans interview practice', 'Buyuk Britaniyada o‘qish rejalari suhbati mashqi', 'Практика интервью о планах учёбы в Великобритании'),
    setting: L('Practice for a short online interview about your study plans with an officer from your UK university\'s international office, before your application. You were offered a one-year master\'s in international business outside London. This is practice, not a real decision.', 'Ariza berishdan oldin Buyuk Britaniyadagi universitetingiz xalqaro bo‘limi xodimi bilan o‘qish rejalaringiz haqidagi qisqa onlayn suhbat mashqi. Sizga Londondan tashqarida xalqaro biznes bo‘yicha bir yillik magistratura taklif qilingan. Bu mashq, haqiqiy qaror emas.', 'Практика короткого онлайн-интервью о планах учёбы с сотрудником международного отдела вашего британского университета перед подачей документов. Вам предложили годичную магистратуру по международному бизнесу вне Лондона. Это тренировка, а не реальное решение.'),
    learnerRole: L('A 23-year-old marketing graduate from Samarkand who will pay with family savings.', 'Oilaviy jamg‘arma hisobiga to‘laydigan, marketing bo‘yicha bitirgan 23 yoshli samarqandlik.', 'Выпускник-маркетолог из Самарканда, 23 года; платить будет из семейных сбережений.'),
    goal: L('Show you know your course, your money plan and your English, and what you will do after the course.', 'Kursingizni, mablag‘ rejangizni, ingliz tilingizni va kursdan keyin nima qilishingizni bilishingizni ko‘rsating.', 'Покажите, что знаете свой курс, финансовый план, уровень английского и что будете делать после курса.'),
    persona: {
      name: nm('Emma', 'Эмма'),
      role: 'An officer from the university\'s international office in a practice interview, played by the coach.',
      style: 'Polite and structured: asks why this course and this university, which modules interest you, how you will pay for the course and living costs, how your English was assessed, and your plans after the course. Speaks the learner\'s language in this practice. Never states any rule, amount, document or date unless it is in the facts provided, and then only as written with its check date; otherwise says to check GOV.UK. Never announces a real decision.',
      opening: T({ en: 'Hello, thanks for joining. I\'m Emma from the international office. This is a short conversation about your plans. First, why did you choose this master\'s and our university?', uz: 'Salom, qo‘shilganingiz uchun rahmat. Men xalqaro bo‘limdan Emmaman. Bu rejalaringiz haqida qisqa suhbat. Avvalo, nega aynan shu magistratura va bizning universitetni tanladingiz?', ru: 'Здравствуйте, спасибо, что подключились. Я Эмма из международного отдела. Это короткий разговор о ваших планах. Для начала: почему вы выбрали эту магистратуру и наш университет?' }),
    },
    interest: 5,
    fields: [
      [num('credibility', 0, 10, 'How clear and credible the applicant\'s answers sound in this practice.'), 5],
      [pick('concern', ['none', 'course_knowledge', 'money', 'english', 'after_course'], 'What the officer would ask about next: course_knowledge, money, english, after_course; none when all are clear.'), 'course_knowledge'],
    ],
    general: 'General rules for this practice: credibility +1 for a short, specific answer in the applicant\'s own words; −1 for vague or recited answers; −2 for contradictions. Interest moves with credibility. The officer states rules and amounts only from the facts block, with the check date. Scenario rules: ',
    rules: 'Naming specific modules or a career reason moves concern from course_knowledge to money. Explaining who holds the savings and that the money is planned (without inventing rules) moves it to english. Explaining how their English was assessed moves it to after_course; a concrete plan moves it to none. If the applicant asks how much money is needed, answer only with the facts, the check date and GOV.UK. End after about six questions.',
    goals: [
      g('course', L('Show you know your course and why it fits', 'Kursingizni va u nega mos ekanini bilishingizni ko‘rsating', 'Покажите, что знаете свой курс и почему он вам подходит'), 'The applicant names modules or content and links them to their goals.'),
      g('money', L('Explain your money plan clearly', 'Mablag‘ rejangizni aniq tushuntiring', 'Ясно объясните финансовый план'), 'The applicant explains who pays and how, without vague answers.'),
      g('english', L('Explain how your English was assessed', 'Ingliz tilingiz qanday baholanganini tushuntiring', 'Объясните, как оценили ваш английский'), 'The applicant says how their English level was assessed.'),
      g('after', L('Describe what you will do after the course', 'Kursdan keyin nima qilishingizni tasvirlang', 'Опишите, что будете делать после курса'), 'The applicant gives a concrete plan for after the course.'),
    ],
    turns: [4, 9],
  }),
  rp({
    id: 'rp.visa-uk-documents', node: 'interviews.student_visa', levels: [2, 5], minutes: 7, facts: UK_DOCUMENT_FACTS,
    title: L('UK Student visa: document check with an adviser', 'Buyuk Britaniya talabalik vizasi: maslahatchi bilan hujjatlarni tekshirish', 'Студенческая виза Великобритании: проверка документов с консультантом'),
    setting: L('A practice call with a student adviser who helps you check that your UK Student visa application is ready. You were offered a two-year course in London and you have lived in Uzbekistan all your life. This is practice; the adviser uses only dated official facts.', 'Buyuk Britaniya talabalik vizasi arizangiz tayyorligini tekshirishga yordam beradigan talabalar maslahatchisi bilan mashq qo‘ng‘irog‘i. Sizga Londonda ikki yillik kurs taklif qilingan va butun umringiz O‘zbekistonda yashagansiz. Bu mashq; maslahatchi faqat sanasi ko‘rsatilgan rasmiy ma’lumotlardan foydalanadi.', 'Тренировочный звонок со студенческим консультантом, который помогает проверить готовность заявления на Student visa. Вам предложили двухлетний курс в Лондоне, всю жизнь вы прожили в Узбекистане. Это практика; консультант опирается только на датированные официальные факты.'),
    learnerRole: L('An applicant who must explain their own documents and plan: CAS, money, TB test, health surcharge.', 'O‘z hujjatlari va rejasini tushuntirishi kerak bo‘lgan ariza beruvchi: CAS, mablag‘, sil testi, tibbiy yig‘im.', 'Заявитель, который должен объяснить свои документы и план: CAS, средства, тест на туберкулёз, медицинский сбор.'),
    goal: L('Explain your document plan clearly, ask the right questions, and agree what you will do next.', 'Hujjatlar rejangizni aniq tushuntiring, to‘g‘ri savollar bering va keyingi qadamni kelishing.', 'Ясно объясните план по документам, задайте правильные вопросы и договоритесь о следующих шагах.'),
    persona: {
      name: nm('Kate', 'Кейт'),
      role: 'A student adviser in a practice call, played by the coach.',
      style: 'Helpful and precise. Asks the applicant to walk through their documents: passport, CAS, money and how long it has been held, TB test, and budget for the health surcharge. Corrects or confirms only with the facts provided, always mentioning the check date and that the applicant must check GOV.UK before applying. If asked something not in the facts, says she does not have that fact and points to GOV.UK. Never promises a visa.',
      opening: T({ en: 'Hi, I\'m Kate. Let\'s check your application plan together, step by step. Which documents do you already have ready?', uz: 'Salom, men Keytman. Ariza rejangizni birga, bosqichma-bosqich tekshiraylik. Qaysi hujjatlaringiz allaqachon tayyor?', ru: 'Здравствуйте, я Кейт. Давайте вместе, шаг за шагом проверим план вашего заявления. Какие документы у вас уже готовы?' }),
    },
    interest: 5,
    fields: [
      [num('readiness', 0, 10, 'How ready and clear the applicant\'s plan is in this practice.'), 4],
      [pick('gap', ['none', 'money_timing', 'tb_test', 'surcharge', 'cas'], 'The next gap the adviser points to: money_timing (how long the money is held), tb_test, surcharge, cas; none when the applicant has covered them.'), 'money_timing'],
      [flag('checklist', 'Whether the applicant summarised a checklist of next steps.'), false],
    ],
    general: 'General rules for this practice: readiness +1 for each document the applicant explains clearly and correctly; +1 for a good question; −1 for a guess stated as a rule. The adviser states rules and amounts only from the facts block, with the check date, and sends the applicant to GOV.UK. Interest moves with readiness. Scenario rules: ',
    rules: 'Go through the gaps in order: money_timing, tb_test, surcharge, cas. Each gap closes when the applicant explains their plan or asks the right question and hears the fact. If the applicant summarises their next steps at the end, checklist becomes true. End when all gaps are covered or after about eight turns.',
    goals: [
      g('documents', L('Explain which documents you have and which you still need', 'Qaysi hujjatlar bor va qaysilari hali kerakligini tushuntiring', 'Объясните, какие документы есть, а какие ещё нужны'), 'The applicant lists their documents and what is missing.'),
      g('questions', L('Ask about anything you are unsure of', 'Ishonchingiz komil bo‘lmagan narsalarni so‘rang', 'Спросите обо всём, в чём не уверены'), 'The applicant asks at least two relevant questions instead of guessing.'),
      g('checklist', L('Summarise your next steps', 'Keyingi qadamlaringizni xulosa qiling', 'Подведите итог: ваши следующие шаги'), 'The applicant ends with a short list of what they will do next.'),
    ],
    turns: [4, 10],
  }),

  // --- Scholarship panel ----------------------------------------------------------------------------------------
  rp({
    id: 'rp.scholarship-panel', node: 'interviews.behavioural_star', levels: [3, 5], minutes: 9,
    title: L('Scholarship panel: a master\'s abroad', 'Stipendiya paneli: chet elda magistratura', 'Стипендиальная комиссия: магистратура за рубежом'),
    setting: L('A private foundation (invented for practice) funds ten master\'s scholarships a year for young professionals from Uzbekistan who commit to work at home after graduating. Your final interview is with a panel of three.', 'Xususiy jamg‘arma (mashq uchun o‘ylab topilgan) har yili bitirgandan keyin vatanida ishlashga va’da beradigan o‘zbekistonlik yosh mutaxassislar uchun o‘nta magistratura stipendiyasini moliyalaydi. Final suhbatingiz uch kishilik panel bilan.', 'Частный фонд (придуман для практики) ежегодно финансирует десять стипендий на магистратуру для молодых специалистов из Узбекистана, которые обязуются после выпуска работать на родине. Ваше финальное интервью — с комиссией из трёх человек.'),
    learnerRole: L('A 26-year-old civil engineer applying for a master\'s in urban planning.', 'Shaharsozlik bo‘yicha magistraturaga hujjat topshirayotgan 26 yoshli qurilish muhandisi.', 'Инженер-строитель 26 лет, поступающий в магистратуру по градостроительству.'),
    goal: L('Show leadership, a clear study plan and the impact you will have at home, with evidence.', 'Yetakchilik, aniq o‘qish rejasi va vataningizda qiladigan ta’siringizni dalillar bilan ko‘rsating.', 'Покажите лидерство, чёткий план учёбы и то, какую пользу принесёте дома, с доказательствами.'),
    persona: {
      name: nm('Professor Saidova', 'Профессор Саидова'),
      role: 'The panel chair, a retired university professor, with two other panel members whose questions she passes on.',
      style: 'Calm and serious. Asks: a time you led without authority; why urban planning and why abroad; a problem in your city you want to solve; what you will do if you cannot find a job in your field after returning; and one surprise question ("What would you do with this scholarship if it were half the amount?"). Values honesty, specifics and humility.',
      opening: T({ en: 'Welcome. We have read your application with interest. Let us begin with a simple question: what problem in your city made you want to study urban planning?', uz: 'Xush kelibsiz. Arizangizni qiziqish bilan o‘qib chiqdik. Oddiy savoldan boshlaylik: shahringizdagi qaysi muammo sizni shaharsozlikni o‘rganishga undadi?', ru: 'Добро пожаловать. Мы с интересом прочитали вашу заявку. Начнём с простого вопроса: какая проблема вашего города заставила вас захотеть изучать градостроительство?' }),
    },
    interest: 5,
    fields: [
      [pick('concern', ['none', 'vague_impact', 'no_leadership', 'not_returning'], 'The panel\'s doubt: vague_impact until the candidate names a specific problem and how the degree helps solve it; then no_leadership until a concrete example; then not_returning until a credible plan for working at home; none after all three.'), 'vague_impact'],
      [num('evidence', 0, 5, 'How many concrete examples or figures the candidate has given.', false), 0],
      [flag('shortlisted', 'Whether the chair says the candidate will be shortlisted for the final decision.'), false],
    ],
    rules: 'A specific city problem (flooded underpasses, no shade on bus stops, traffic around schools) with the candidate\'s own observation: interest +2 and concern moves to no_leadership. A leadership example with a result moves it to not_returning. A plan to work at home with a fallback (a related field, a municipality, a design firm) moves it to none. The surprise question rewards honest priorities. At interest 8 and concern none the chair says the candidate is shortlisted.',
    goals: [
      g('problem', L('Name a specific problem and how your study helps', 'Aniq muammo va o‘qishingiz qanday yordam berishini ayting', 'Назовите конкретную проблему и как учёба поможет её решить'), 'The candidate describes a concrete local problem and links the degree to solving it.'),
      EXAMPLE,
      g('home', L('Give a credible plan for working at home after the degree', 'Darajadan keyin vatanda ishlash bo‘yicha ishonchli reja bering', 'Дайте убедительный план работы на родине после учёбы'), 'The candidate explains where they will work and a fallback option.'),
      ASK,
    ],
    turns: [4, 12],
  }),
];
