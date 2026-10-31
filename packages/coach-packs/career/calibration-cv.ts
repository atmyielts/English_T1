import { calibrationSet, type Authored } from './calibration-kit.ts';

// Calibration for `career.cv`: twelve CV sections and profile texts from L1 to L5 in
// Uzbek, Russian and English, as the learner pastes them (one line per bullet).
// Criteria order: impact, tailoring, structure, accuracy. People, employers and
// figures are invented.

const authored: Authored[] = [
  {
    id: 'c01-cashier-uz-l1',
    task: 'CV experience section for a supermarket cashier vacancy.',
    response: [
      'Ish tajribasi',
      'men 2023 dan beri do‘konda ishlayapman kassada turaman pul sanayman mijozlarga xizmat qilaman tovarlarni teraman va hamma ishni qilaman',
      'oldin ham ishlagan edim bozorda akam bilan',
    ].join('\n'),
    scores: [1, 1.5, 1, 1], drift: [[0, 0, 0.5], [0.5]],
    rationale: 'A run-on line of duties with no shop name or clear dates, then a vague line about earlier market work; first person, no punctuation, nothing achieved. The cashier duties are vaguely relevant to the target but not presented for it. L1.',
  },
  {
    id: 'c02-it-ru-l1plus',
    task: 'CV summary and skills for a junior web developer role.',
    response: [
      'О себе: ответственный, коммуникабельный, стрессоустойчивый, быстро обучаюсь.',
      'Навыки: Word, Excel, интернет, HTML немного, люблю компьютеры с детства.',
      'Цель: найти хорошую работу с хорошей зарплатой и дружным коллективом.',
    ].join('\n'),
    scores: [1, 1.5, 2, 2], drift: [[0, 0.5], [0, 0, 0, 0.5]],
    rationale: 'Clichés instead of evidence; skills list mixes office basics with "HTML немного"; the goal is about what the candidate wants, not the role. Sections exist and are readable; the Russian is correct, but the style is informal and uneven for a CV ("HTML немного", "люблю компьютеры с детства", "интернет" as a skill).',
  },
  {
    id: 'c03-teacher-en-l2',
    task: 'CV experience section for an English teacher at a private learning centre.',
    response: [
      'English Teacher, Bright Future learning centre, Fergana, 2022 – present',
      'Responsible for teaching English to children and adults.',
      'Preparing lessons and homeworks, checking tests.',
      'Working with parents and attending meetings.',
    ].join('\n'),
    scores: [1.5, 2.5, 3, 2.5], drift: [[0, 0, 0.5], [0, 0.5]],
    rationale: 'Clear title, employer and dates in a standard layout, but every bullet is a duty ("Responsible for…") with no results such as student outcomes or class sizes. Relevant to the target, not tailored. The bullets mix forms (Responsible…, Preparing…, Working…), and "homeworks" is an error.',
  },
  {
    id: 'c04-sales-uz-l2',
    task: 'CV experience section for a sales representative at a home-appliance retailer.',
    response: [
      'Sotuv maslahatchisi, maishiy texnika do‘koni, Samarqand, 2021–2024',
      'Mijozlarga mahsulotlar haqida maslahat berdim.',
      'Ko‘p sotuvlar qildim va rejani bajardim.',
      'Kassa va hujjatlar bilan ishladim.',
    ].join('\n'),
    scores: [2, 2.5, 3, 3], drift: [[0, 0.5], [0, 0, 0, 0.5]],
    rationale: 'Consistent past tense and a clean format; the plan line hints at results but gives no figure ("Ko‘p sotuvlar"). Relevant retail experience, not shaped for the new role.',
  },
  {
    id: 'c05-accountant-ru-l2plus',
    task: 'CV experience section for an accountant at a construction company.',
    response: [
      'Бухгалтер, ООО «Стройснаб-Ташкент» (учебный пример), 03.2021 – по наст. время',
      'Веду первичную документацию и банковские выписки, около 300 операций в месяц.',
      'Готовлю отчётность по НДС и налогу на прибыль.',
      'Сверяю расчёты с поставщиками строительных материалов.',
      'Внедрила шаблон сверки в Excel, что ускорило закрытие месяца.',
    ].join('\n'),
    scores: [2.5, 3, 3, 3.5], drift: [[0, 0, 0.5], [0.5]],
    rationale: 'Scope appears (300 operations a month) and one achievement (an Excel template) with an unmeasured result; the rest are duties. Construction-supplier reconciliation is relevant. Accurate, consistent present tense for the current job.',
  },
  {
    id: 'c06-hospitality-en-l3',
    task: 'CV experience section for a hotel front-office supervisor role.',
    response: [
      'Front Desk Agent, Registan View Hotel (practice example), Samarkand, 2022 – 2025',
      'Checked in up to 60 guests a day in English, Russian and Uzbek during the peak season.',
      'Trained three new receptionists on the booking system and room-change procedures.',
      'Resolved guest complaints at the desk; online review score rose during my shifts.',
      'Covered night audit twice a week.',
    ].join('\n'),
    scores: [3, 3.5, 3.5, 3.5], drift: [[0, 0.5], [0, 0, 0, 0.5]],
    rationale: 'Several achievement lines with scope (60 guests a day, three receptionists trained), and the training line fits a supervisor target. The review-score claim has no figure. Clean and consistent.',
  },
  {
    id: 'c07-linkedin-uz-l3',
    task: 'LinkedIn About section for a junior data analyst.',
    response: [
      'Men ma’lumotlar tahlili bo‘yicha boshlovchi mutaxassisman.',
      'Axborot texnologiyalari universitetini tugatdim va bitiruv ishimda savdo ma’lumotlari asosida talabni bashorat qilish modelini qurdim.',
      'Python, SQL va Power BI bilan ishlayman, bitta o‘quv loyihada kichik kafe tarmog‘i uchun haftalik savdo paneli yasadim.',
      'Chakana savdo yoki fintech sohasida tahlilchi sifatida ishlashni xohlayman.',
    ].join('\n'),
    scores: [3, 3.5, 3, 3.5], drift: [[0, 0, 0.5], [0.5]],
    rationale: 'A clear target and two concrete projects with tools, but no outcome of either project. Readable four-sentence About; the opening line is weak. Accurate Uzbek.',
  },
  {
    id: 'c08-hh-ru-l3plus',
    task: 'hh.uz resume: "About me" and key skills for a logistics coordinator.',
    response: [
      'Координатор логистики с опытом 3 года в дистрибуции бытовой химии по Ташкентской области.',
      'Планирую маршруты для 12 машин ежедневно, сократил пустые пробеги примерно на 15% за счёт перестройки графика.',
      'Работаю в 1С и Google Sheets, веду переписку с поставщиками из Казахстана и Турции.',
      'Ключевые навыки: планирование маршрутов, 1С: Управление торговлей, складской учёт, деловая переписка, английский B1.',
    ].join('\n'),
    scores: [4, 3.5, 3.5, 3.5], drift: [[0, 0.5], [0, 0, 0, 0.5]],
    rationale: 'Strong impact line (12 vehicles daily, about 15% fewer empty runs) and keyword-rich skills for hh.uz search. Tailoring is good though the target employer type is not named. Clear and accurate.',
  },
  {
    id: 'c09-marketing-en-l4',
    task: 'CV summary and experience for a digital marketing manager at an online retailer.',
    response: [
      'Digital marketer with four years in e-commerce, focused on paid social and conversion for fashion and home goods.',
      'Marketing Specialist, an online fashion shop (practice example), Tashkent, 2022 – present',
      'Grew Instagram-driven orders from about 300 to 1,100 a month in 18 months by testing creatives weekly and moving budget to the best performers.',
      'Cut cost per order by 28% after rebuilding the Telegram bot checkout with the developer team.',
      'Launched a referral programme that brought 2,400 new customers in its first six months.',
    ].join('\n'),
    scores: [4.5, 4, 4, 4], drift: [[0, 0, 0.5], [0, 0.5]],
    rationale: 'Each bullet pairs an action with a quantified result and method; the summary names the niche. Clearly aimed at e-commerce marketing, though not at a specific employer. Tight and consistent.',
  },
  {
    id: 'c10-career-change-uz-l4',
    task: 'CV summary for a career change from school teacher to corporate trainer at a bank.',
    response: [
      'Sakkiz yillik tajribaga ega o‘qituvchi, endi bank xodimlarini o‘qitish bo‘yicha trener sifatida ishlamoqchiman.',
      'Maktabda 30 kishilik sinflar uchun 200 dan ortiq interaktiv dars ishlab chiqdim va tumanda o‘qituvchilar uchun 6 ta seminar o‘tkazdim.',
      'Seminarlardan keyingi so‘rovnomada qatnashchilarning 90 foizi mashg‘ulotlarni amaliy deb baholadi.',
      'Moodle va Google Classroom’da onlayn kurs yaratganman, katta auditoriya oldida bemalol gapiraman.',
    ].join('\n'),
    scores: [4, 4.5, 4, 4], drift: [[0, 0.5], [0, 0, 0, 0.5]],
    rationale: 'Translates teaching into trainer evidence: lessons designed, teacher seminars, a participant survey result and e-learning tools. The target is explicit and every line serves it. Clean Uzbek.',
  },
  {
    id: 'c11-finance-ru-l4plus',
    task: 'CV experience section for a financial controller at a manufacturing company.',
    response: [
      'Финансовый аналитик → старший аналитик, производитель упаковки (учебный пример), Ташкент, 2019 – по наст. время',
      'Построил ежемесячную модель себестоимости по 140 позициям; выявил убыточные заказы и пересмотрел цены, валовая маржа выросла с 18% до 23% за год.',
      'Сократил закрытие месяца с 9 до 5 рабочих дней, автоматизировав сверки в Power Query.',
      'Руководил переходом на МСФО-отчётность для двух банков-кредиторов, без замечаний аудитора.',
      'Руковожу двумя аналитиками; оба получили повышение.',
    ].join('\n'),
    scores: [5, 4.5, 4.5, 4.5], drift: [[0, 0, 0.5], [0, 0.5]],
    rationale: 'Outstanding impact: margin from 18% to 23%, closing from 9 to 5 days, IFRS reporting with a clean audit, people development. Strongly aligned with a controller role. Very clean structure and language.',
  },
  {
    id: 'c12-pm-en-l5',
    task: 'CV summary and top experience for a product manager at a fintech company.',
    response: [
      'Product manager with six years in payments, leading teams of up to nine engineers and designers from discovery to launch.',
      'Senior Product Manager, a payments app (practice example), Tashkent, 2021 – present',
      'Led the launch of instalment payments for 1,800 partner shops, reaching 210,000 active users in the first year.',
      'Reduced failed card top-ups from 7.4% to 2.1% by redesigning the retry flow with the bank integration team.',
      'Introduced fortnightly user interviews and a public roadmap, raising app-store rating from 3.9 to 4.6.',
      'Skills: product discovery, SQL, A/B testing, payment regulation basics, Uzbek, Russian, English (C1).',
    ].join('\n'),
    scores: [5, 5, 5, 5], drift: [[0, 0, 0, -0.5], [0, -0.5]],
    rationale: 'Every line shows scope and a precise result tied to the payments domain; perfectly targeted to fintech product roles; scannable and error-free. L5.',
  },
];

export const cvCalibration = calibrationSet(['impact', 'tailoring', 'structure', 'accuracy'], authored, { min: 1, max: 5 });
