import type { LevelScale, PackManifest } from '../src/types.ts';

// B5 Career and Interview Coach. CVs, cover letters, LinkedIn and hh.uz profiles;
// mock interviews (HR, behavioural STAR, role-specific, salary negotiation,
// student-visa practice); a job-search plan. The learner practises in Uzbek, Russian
// or English (practice text is written in all three with T()). Visa facts come only
// from the dated datasets in facts.ts. Skill nodes and error tags are referenced by
// every other file in this pack.

export const CAREER_SCALE: LevelScale = {
  id: 'career_level', min: 1, max: 5, step: 0.5,
  labels: [
    { value: 1, label: 'L1' }, { value: 1.5, label: 'L1+' }, { value: 2, label: 'L2' }, { value: 2.5, label: 'L2+' },
    { value: 3, label: 'L3' }, { value: 3.5, label: 'L3+' }, { value: 4, label: 'L4' }, { value: 4.5, label: 'L4+' }, { value: 5, label: 'L5' },
  ],
};

export const manifest: PackManifest = {
  id: 'career',
  feature: 'B5',
  version: '1.0.0',
  name: { en: 'Career and Interview Coach', uz: 'Karyera va suhbat murabbiyi', ru: 'Коуч по карьере и собеседованиям' },
  tagline: {
    en: 'A stronger CV, interviews you can rehearse by voice, and a step-by-step plan towards the job you want.',
    uz: 'Kuchliroq rezyume, ovozda mashq qilinadigan suhbatlar va kerakli ish sari bosqichma-bosqich reja.',
    ru: 'Более сильное резюме, собеседования с голосовой репетицией и пошаговый план поиска нужной работы.',
  },
  description: {
    en: 'Rewrite your CV and cover letter in Uzbek, Russian or English, and build LinkedIn and hh.uz profiles. Rehearse HR, behavioural (STAR) and role-specific interviews by voice, practise salary negotiation with an employer who pushes back, and get a scored report that quotes your own answers. Student-visa interview practice uses only dated official facts. A weekly job-search plan keeps you moving.',
    uz: 'Rezyume va motivatsion xatni o‘zbek, rus yoki ingliz tilida qayta yozing, LinkedIn va hh.uz profillarini tuzing. HR, xulq-atvor (STAR) va lavozimga oid suhbatlarni ovozda mashq qiling, e’tiroz bildiradigan ish beruvchi bilan maosh muzokarasini o‘rganing va baholar va o‘z javoblaringizdan iqtiboslar bilan hisobot oling. Talabalik vizasi suhbati mashqi faqat sanasi ko‘rsatilgan rasmiy ma’lumotlarga tayanadi. Haftalik ish qidirish rejasi to‘xtab qolmaslikka yordam beradi.',
    ru: 'Перепишите резюме и сопроводительное письмо на узбекском, русском или английском, соберите профили LinkedIn и hh.uz. Репетируйте голосом HR-, поведенческие (STAR) и профильные собеседования, тренируйте переговоры о зарплате с работодателем, который возражает, и получайте отчёт с оценками и цитатами из ваших ответов. Практика собеседования на студенческую визу опирается только на датированные официальные факты. Еженедельный план поиска работы не даёт остановиться.',
  },
  uiLanguages: ['uz', 'ru', 'en'],
  practiceLanguage: 'mixed',
  contentLanguage: 'en',
  audience: {
    description: {
      en: 'Students, graduates and professionals in Uzbekistan applying for jobs, internships, scholarships or a student visa, from a first CV to senior interviews.',
      uz: 'Ishga, amaliyotga, grantga yoki talabalik vizasiga hujjat topshirayotgan O‘zbekistondagi talabalar, bitiruvchilar va mutaxassislar — birinchi rezyumedan yuqori lavozim suhbatlarigacha.',
      ru: 'Студенты, выпускники и специалисты в Узбекистане, которые подают на работу, стажировку, стипендию или студенческую визу: от первого резюме до собеседований на старшие позиции.',
    },
    minAge: 16,
    levels: [1.5, 5],
  },
  scale: CAREER_SCALE,
  skills: [
    { id: 'materials', name: { en: 'Application materials', uz: 'Ariza hujjatlari', ru: 'Документы для отклика' } },
    { id: 'materials.cv', parent: 'materials', weight: 1.4, name: { en: 'CV', uz: 'Rezyume', ru: 'Резюме' } },
    { id: 'materials.cover_letter', parent: 'materials', name: { en: 'Cover and motivation letters', uz: 'Motivatsion va ilova xatlar', ru: 'Сопроводительные и мотивационные письма' } },
    { id: 'materials.linkedin', parent: 'materials', weight: 0.8, name: { en: 'LinkedIn profile', uz: 'LinkedIn profili', ru: 'Профиль LinkedIn' } },
    { id: 'materials.hh_profile', parent: 'materials', weight: 0.8, name: { en: 'hh.uz profile', uz: 'hh.uz profili', ru: 'Профиль hh.uz' } },
    { id: 'interviews', weight: 1.3, name: { en: 'Interviews', uz: 'Suhbatlar', ru: 'Собеседования' } },
    { id: 'interviews.hr', parent: 'interviews', weight: 1.2, name: { en: 'HR and screening interviews', uz: 'HR va dastlabki suhbatlar', ru: 'HR- и первичные собеседования' } },
    { id: 'interviews.behavioural_star', parent: 'interviews', weight: 1.3, name: { en: 'Behavioural answers (STAR)', uz: 'Xulq-atvor savollari (STAR)', ru: 'Поведенческие ответы (STAR)' } },
    { id: 'interviews.role_specific', parent: 'interviews', weight: 1.1, name: { en: 'Role-specific interviews', uz: 'Lavozimga oid suhbatlar', ru: 'Профильные собеседования' } },
    { id: 'interviews.salary_negotiation', parent: 'interviews', weight: 0.9, name: { en: 'Salary negotiation', uz: 'Maosh bo‘yicha muzokara', ru: 'Переговоры о зарплате' } },
    { id: 'interviews.student_visa', parent: 'interviews', weight: 0.8, name: { en: 'Student-visa interview practice', uz: 'Talabalik vizasi suhbati mashqi', ru: 'Практика собеседования на студенческую визу' } },
    { id: 'job_search', weight: 0.8, name: { en: 'Job search', uz: 'Ish qidirish', ru: 'Поиск работы' } },
    { id: 'job_search.plan', parent: 'job_search', name: { en: 'Job-search plan', uz: 'Ish qidirish rejasi', ru: 'План поиска работы' } },
    { id: 'job_search.networking', parent: 'job_search', name: { en: 'Networking', uz: 'Tanishlar tarmog‘i', ru: 'Нетворкинг' } },
    { id: 'job_search.applications', parent: 'job_search', name: { en: 'Applications and follow-up', uz: 'Arizalar va keyingi qadamlar', ru: 'Отклики и follow-up' } },
  ],
  errorTags: [
    {
      id: 'duties_not_achievements', node: 'materials.cv', drill: 'drill.achievements',
      name: { en: 'Duties instead of achievements', uz: 'Yutuqlar o‘rniga vazifalar', ru: 'Обязанности вместо достижений' },
      explain: {
        en: 'A recruiter already knows what a cashier or an accountant does. Show what changed because of you: start with an action verb, then the result ("Cut month-end closing from 6 to 4 days by…").',
        uz: 'Kassir yoki buxgalter nima qilishini rekruter allaqachon biladi. Siz tufayli nima o‘zgarganini ko‘rsating: aniq harakat fe’li va natijani yozing («…orqali oyni yopish muddatini 6 kundan 4 kunga qisqartirdim»).',
        ru: 'Рекрутер и так знает, что делает кассир или бухгалтер. Покажите, что изменилось благодаря вам: начните с глагола действия, затем результат («Сократил(а) срок закрытия месяца с 6 до 4 дней за счёт…»).',
      },
    },
    {
      id: 'no_results', node: 'interviews.behavioural_star', drill: 'drill.numbers',
      name: { en: 'No numbers or concrete results', uz: 'Raqam va aniq natija yo‘q', ru: 'Нет цифр и конкретных результатов' },
      explain: {
        en: 'Vague words (helped, improved, many) are easy to forget. Give a number, a before and after, a time frame or a concrete outcome you can stand behind. Use only real figures from your own work.',
        uz: 'Mavhum so‘zlar (yordam berdim, yaxshiladim, ko‘p) tez unutiladi. Raqam, «oldin va keyin», muddat yoki o‘zingiz tasdiqlay oladigan aniq natijani ayting. Faqat o‘z ishingizdagi haqiqiy raqamlardan foydalaning.',
        ru: 'Размытые слова («помощь», «улучшение», «много») быстро забываются. Назовите цифру, «до и после», срок или конкретный итог, за который вы можете поручиться. Используйте только реальные цифры из своей работы.',
      },
    },
    {
      id: 'rambling', node: 'interviews.hr', drill: 'drill.concise',
      name: { en: 'Rambling answers', uz: 'Cho‘zilib ketgan javoblar', ru: 'Затянутые ответы' },
      explain: {
        en: 'Answer the question first in one sentence, then give one or two supporting details, then stop. About one to two minutes is enough for most questions; the interviewer will ask for more if they want it.',
        uz: 'Avval savolga bitta gap bilan javob bering, keyin bir-ikkita tafsilot keltiring va to‘xtang. Ko‘p savollar uchun bir-ikki daqiqa yetarli; suhbatdosh ko‘proq bilmoqchi bo‘lsa, o‘zi so‘raydi.',
        ru: 'Сначала ответьте на вопрос одним предложением, затем приведите одну-две детали и остановитесь. Для большинства вопросов хватает одной-двух минут; если интервьюеру нужно больше, он спросит.',
      },
    },
    {
      id: 'star_no_result', node: 'interviews.behavioural_star', drill: 'drill.star',
      name: { en: 'STAR without the result', uz: 'Natijasiz STAR', ru: 'STAR без результата' },
      explain: {
        en: 'A behavioural answer has four parts: the Situation, your Task, the Actions you took (say "I", not only "we") and the Result. Most weak answers stop after the actions. End with what happened and what you learned.',
        uz: 'Xulq-atvor savoliga javob to‘rt qismdan iborat: vaziyat (Situation), vazifangiz (Task), qilgan harakatlaringiz (Action; faqat «biz» emas, «men» deng) va natija (Result). Zaif javoblar ko‘pincha harakatlar bilan tugaydi. Nima bo‘lgani va nimani o‘rganganingiz bilan yakunlang.',
        ru: 'Поведенческий ответ состоит из четырёх частей: ситуация (Situation), ваша задача (Task), ваши действия (Action; говорите «я», а не только «мы») и результат (Result). Слабые ответы обычно обрываются на действиях. В конце скажите, чем всё закончилось и чему вы научились.',
      },
    },
    {
      id: 'generic_letter', node: 'materials.cover_letter', drill: 'drill.tailoring',
      name: { en: 'Generic letter or CV', uz: 'Umumiy xat yoki rezyume', ru: 'Шаблонное письмо или резюме' },
      explain: {
        en: 'A letter that could go to any company goes to none. Name the role and the company, pick two or three requirements from the posting and show one piece of evidence for each.',
        uz: 'Har qanday kompaniyaga yuborsa bo‘ladigan xat hech kimni qiziqtirmaydi. Lavozim va kompaniyani nomlang, e’londan ikki-uchta talabni tanlang va har biri uchun bitta dalil keltiring.',
        ru: 'Письмо, которое подходит любой компании, не работает ни в одной. Назовите позицию и компанию, выберите из вакансии два-три требования и для каждого приведите одно доказательство.',
      },
    },
    {
      id: 'negative_past', node: 'interviews.hr', drill: 'drill.positive',
      name: { en: 'Negative talk about a past employer', uz: 'Oldingi ish beruvchi haqida salbiy gap', ru: 'Негатив о прошлом работодателе' },
      explain: {
        en: 'Even when you left for good reasons, criticising a former boss makes the interviewer wonder what you will say about them. Explain why you are moving towards this job, not away from the old one.',
        uz: 'Yaxshi sabab bilan ketgan bo‘lsangiz ham, sobiq rahbarni tanqid qilish suhbatdoshni «bu odam keyin men haqimda nima deydi?» deb o‘ylatadi. Eski ishdan qochayotganingizni emas, bu ishga intilayotganingizni tushuntiring.',
        ru: 'Даже если вы ушли по веским причинам, критика бывшего начальника заставляет интервьюера задуматься, что вы потом скажете о нём самом. Объясняйте, почему идёте к этой работе, а не почему бежите со старой.',
      },
    },
    {
      id: 'weak_intro', node: 'interviews.hr', drill: 'drill.intro',
      name: { en: 'A weak "tell me about yourself"', uz: 'Zaif «o‘zingiz haqingizda gapiring»', ru: 'Слабый ответ «расскажите о себе»' },
      explain: {
        en: 'This is not your life story. Use present, past, future: what you do now, one or two achievements that fit this role, and why this job is your next step. About a minute.',
        uz: 'Bu hayot qissangiz emas. Hozir–o‘tmish–kelajak tartibida gapiring: hozir nima qilasiz, shu lavozimga mos bir-ikki yutuq va nega bu ish keyingi qadamingiz. Taxminan bir daqiqa.',
        ru: 'Это не история вашей жизни. Схема «настоящее — прошлое — будущее»: чем вы занимаетесь сейчас, одно-два достижения, подходящих для этой роли, и почему эта работа — ваш следующий шаг. Около минуты.',
      },
    },
    {
      id: 'no_counter', node: 'interviews.salary_negotiation', drill: 'drill.negotiation',
      name: { en: 'Accepting the first offer without discussion', uz: 'Birinchi taklifni o‘ylamay qabul qilish', ru: 'Согласие на первое предложение без обсуждения' },
      explain: {
        en: 'Thank them, show you want the job, then ask for time or make a calm counter-offer with a reason (your skills, the role\'s scope, your own research). Talk about the whole package, not only the salary, and get the final terms in writing.',
        uz: 'Rahmat ayting, ishni xohlayotganingizni ko‘rsating, so‘ng o‘ylash uchun vaqt so‘rang yoki asos bilan xotirjam qarshi taklif bering (ko‘nikmalaringiz, vazifalar hajmi, bozor bo‘yicha o‘z izlanishingiz). Faqat maosh emas, butun shartlar haqida gapiring va yakuniy shartlarni yozma ravishda oling.',
        ru: 'Поблагодарите, покажите, что хотите эту работу, затем попросите время или спокойно назовите встречное предложение с обоснованием (ваши навыки, объём роли, ваше собственное исследование рынка). Обсуждайте весь пакет, а не только оклад, и закрепите итог письменно.',
      },
    },
    {
      id: 'cv_consistency', node: 'materials.cv', drill: 'drill.cv_language',
      name: { en: 'Typos, mixed tenses and formats in the CV', uz: 'Rezyumedagi imlo xatolari, aralash zamon va formatlar', ru: 'Опечатки, смешанные времена и форматы в резюме' },
      explain: {
        en: 'Use the past tense for past jobs and the present for the current one, one date format, one bullet style, and no "I" at the start of every line. One typo can end the read.',
        uz: 'O‘tgan ishlar uchun o‘tgan zamon, hozirgisi uchun hozirgi zamon, bitta sana formati, bitta ro‘yxat uslubidan foydalaning va har qatorni «men» bilan boshlamang. Bitta xato ham o‘qishni to‘xtatishi mumkin.',
        ru: 'Прошедшее время для прошлых мест работы, настоящее — для текущего, один формат дат, один стиль списков и без «я» в начале каждой строки. Из-за одной опечатки резюме могут отложить.',
      },
    },
    {
      id: 'visa_vague', node: 'interviews.student_visa', drill: 'drill.visa_answers',
      name: { en: 'Vague or memorised visa answers', uz: 'Noaniq yoki yodlangan viza javoblari', ru: 'Размытые или заученные ответы на визовом собеседовании' },
      explain: {
        en: 'Answer in your own words, briefly and truthfully: why this course and this university, who pays and how, and what you plan to do after you finish. Specific, honest details sound like you; recited speeches do not.',
        uz: 'O‘z so‘zlaringiz bilan, qisqa va rost javob bering: nega aynan shu kurs va universitet, kim va qanday to‘laydi, o‘qishni tugatgach nima qilmoqchisiz. Aniq va rost tafsilotlar samimiy eshitiladi, yodlangan nutq esa sun’iy tuyuladi.',
        ru: 'Отвечайте своими словами, коротко и честно: почему этот курс и этот университет, кто и как платит, что вы планируете делать после окончания. Конкретные честные детали звучат естественно, заученная речь — нет.',
      },
    },
    {
      id: 'no_questions_back', node: 'interviews.hr', drill: 'drill.questions',
      name: { en: 'No questions for the interviewer', uz: 'Suhbatdoshga savol yo‘q', ru: 'Нет вопросов к интервьюеру' },
      explain: {
        en: '"Do you have any questions?" is part of the interview. Ask one or two real questions about the work, the team or how success is measured, not only about holidays.',
        uz: '«Savollaringiz bormi?» ham suhbatning bir qismi. Faqat ta’til haqida emas, ish, jamoa yoki muvaffaqiyat qanday o‘lchanishi haqida bir-ikkita haqiqiy savol bering.',
        ru: '«У вас есть вопросы?» — тоже часть собеседования. Задайте один-два настоящих вопроса о работе, команде или о том, как измеряют успех, а не только об отпуске.',
      },
    },
  ],
  menu: [
    { action: 'today', emoji: '📅', label: { en: 'Today', uz: 'Bugun', ru: 'Сегодня' } },
    { action: 'speaking', emoji: '🎙', label: { en: 'Interview practice', uz: 'Suhbat mashqi', ru: 'Тренировка собеседования' } },
    { action: 'mock', emoji: '🧑‍💼', label: { en: 'Full mock interview', uz: 'To‘liq sinov suhbati', ru: 'Пробное собеседование' } },
    { action: 'roleplay', emoji: '🎭', label: { en: 'Interview role-plays', uz: 'Rolli o‘yinlar', ru: 'Ролевые игры' } },
    { action: 'writing', emoji: '📄', label: { en: 'CV and letters', uz: 'Rezyume va xatlar', ru: 'Резюме и письма' } },
    { action: 'drill', emoji: '⚡', label: { en: 'Quick drills', uz: 'Tezkor mashqlar', ru: 'Быстрые упражнения' } },
    { action: 'lesson', emoji: '📘', label: { en: 'Lessons', uz: 'Darslar', ru: 'Уроки' } },
    { action: 'progress', emoji: '📈', label: { en: 'Progress', uz: 'Natijalar', ru: 'Прогресс' } },
    { action: 'report', emoji: '🗓', label: { en: 'Weekly report', uz: 'Haftalik hisobot', ru: 'Еженедельный отчёт' } },
    { action: 'plan', emoji: '🧭', label: { en: 'Job-search plan', uz: 'Ish qidirish rejasi', ru: 'План поиска работы' } },
    { action: 'settings', emoji: '⚙️', label: { en: 'Settings', uz: 'Sozlamalar', ru: 'Настройки' } },
    { action: 'help', emoji: '❓', label: { en: 'Help', uz: 'Yordam', ru: 'Помощь' } },
  ],
  commands: [
    { command: 'today', description: { en: 'Today\'s plan', uz: 'Bugungi reja', ru: 'План на сегодня' } },
    { command: 'speaking', description: { en: 'Practise interview answers by voice', uz: 'Suhbat javoblarini ovozda mashq qilish', ru: 'Тренировать ответы голосом' } },
    { command: 'mock', description: { en: 'A full mock interview with a report', uz: 'Hisobotli to‘liq sinov suhbati', ru: 'Полное пробное собеседование с отчётом' } },
    { command: 'roleplay', description: { en: 'HR, panel, salary and visa role-plays', uz: 'HR, panel, maosh va viza rolli o‘yinlari', ru: 'Ролевые игры: HR, панель, зарплата, виза' } },
    { command: 'writing', description: { en: 'CV, cover letters, profiles', uz: 'Rezyume, xatlar, profillar', ru: 'Резюме, письма, профили' } },
    { command: 'drill', description: { en: 'Quick drills on your errors', uz: 'Xatolaringiz bo‘yicha tezkor mashqlar', ru: 'Быстрые упражнения на ваши ошибки' } },
    { command: 'lesson', description: { en: 'A short lesson', uz: 'Qisqa dars', ru: 'Короткий урок' } },
    { command: 'plan', description: { en: 'Your job-search plan', uz: 'Ish qidirish rejangiz', ru: 'Ваш план поиска работы' } },
    { command: 'progress', description: { en: 'Your progress', uz: 'Natijalaringiz', ru: 'Ваш прогресс' } },
    { command: 'report', description: { en: 'This week\'s report', uz: 'Shu hafta hisoboti', ru: 'Отчёт за эту неделю' } },
    { command: 'settings', description: { en: 'Language, reminders, correction', uz: 'Til, eslatmalar, tuzatish', ru: 'Язык, напоминания, исправления' } },
    { command: 'help', description: { en: 'How this coach works', uz: 'Murabbiy qanday ishlaydi', ru: 'Как работает коуч' } },
  ],
  correctionModes: ['gentle', 'strict'],
  accent: '#1d4ed8',
};
