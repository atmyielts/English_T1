import { T } from '../src/localize.ts';
import type { Activity, Localized } from '../src/types.ts';

// CVs, profiles, letters and emails: CVs and profiles on career.cv, letters and
// emails on career.letter. The learner writes in Uzbek, Russian or English (or sends a
// photo of a printed draft). Employers, people and figures are invented for practice;
// the assessor never invents the learner's experience.

type Tri = { en: string; uz: string; ru: string };
const L = (en: string, uz: string, ru: string): Localized => ({ en, uz, ru });

interface Def { id: string; rubric: 'career.cv' | 'career.letter'; node: string; levels: [number, number]; minutes: number; title: Localized; prompt: Tri; minWords: number; notes: string; ladder?: number[] }
const task = (def: Def): Activity => ({
  id: def.id, kind: 'writing', rubric: def.rubric, node: def.node, levels: def.levels, minutes: def.minutes, title: def.title,
  prompt: T(def.prompt), minWords: def.minWords, recommendedMinutes: Math.max(5, def.minutes), assessorNotes: def.notes, ...(def.ladder ? { ladder: def.ladder } : {}),
});

export const writing: Activity[] = [
  task({
    id: 'w.cv-rewrite', rubric: 'career.cv', node: 'materials.cv', levels: [1.5, 4.5], minutes: 15, minWords: 40,
    title: L('Rewrite a weak CV section', 'Zaif rezyume bo‘limini qayta yozing', 'Перепишите слабый раздел резюме'),
    prompt: {
      en: 'Rewrite this experience section so a recruiter for a "Senior sales consultant, home appliances" role wants to call. Keep the facts; make them achievements. Practice facts you may use: 2021–2025, a home appliance store in Samarkand; served about 40 customers a day; was the top seller in the store for 5 of the last 12 months; trained 2 new consultants; ran the store\'s Instagram stories for a sale week.\n\nThe weak version:\n"Sales consultant. I worked in a shop. Responsible for selling, talking with customers, arranging goods, helping new workers, Instagram sometimes."',
      uz: '«Katta sotuv maslahatchisi, maishiy texnika» lavozimi bo‘yicha rekruter sizga qo‘ng‘iroq qilishni xohlashi uchun ushbu tajriba bo‘limini qayta yozing. Faktlarni saqlang, ularni yutuqlarga aylantiring. Foydalanishingiz mumkin bo‘lgan mashq faktlari: 2021–2025, Samarqanddagi maishiy texnika do‘koni; kuniga taxminan 40 mijozga xizmat ko‘rsatgan; so‘nggi 12 oyning 5 tasida do‘konning eng yaxshi sotuvchisi bo‘lgan; 2 yangi maslahatchini o‘qitgan; chegirmalar haftasida do‘kon Instagram storislarini yuritgan.\n\nZaif varianti:\n«Sotuv maslahatchisi. Do‘konda ishladim. Sotish, mijozlar bilan gaplashish, tovarlarni terish, yangi ishchilarga yordam berish, ba’zan Instagram uchun mas’ul edim.»',
      ru: 'Перепишите раздел опыта так, чтобы рекрутеру, который закрывает вакансию «Старший консультант по продажам, бытовая техника», захотелось вам позвонить. Сохраните факты, превратите их в достижения. Учебные факты, которые можно использовать: 2021–2025, магазин бытовой техники в Самарканде; около 40 покупателей в день; лучший продавец магазина в 5 из последних 12 месяцев; обучение 2 новых консультантов; ведение Instagram-сторис магазина в неделю распродажи.\n\nСлабая версия:\n«Консультант по продажам. Работал в магазине. Отвечал за продажи, общение с покупателями, выкладку товара, помощь новым работникам, иногда Instagram».',
    },
    notes: 'A strong rewrite gives a clear title, store and dates on one line, then 3–5 bullets that start with action verbs and use the given facts as results (top seller 5 of 12 months, about 40 customers a day, trained 2 consultants, sale-week stories). It is aimed at a senior consultant role (mentoring, results). It must not invent figures beyond the practice facts. Consistent past tense, one bullet style.',
  }),
  task({
    id: 'w.cv-student', rubric: 'career.cv', node: 'materials.cv', levels: [1.5, 4], minutes: 15, minWords: 60,
    title: L('A first CV as a student', 'Talaba sifatida birinchi rezyume', 'Первое резюме студента'),
    prompt: {
      en: 'Write the profile, education, experience and skills sections of a one-page CV for a summer internship in a bank\'s marketing department, using your own real study, projects, volunteering or part-time work. If you prefer practice details: a third-year economics student; a group project surveying 150 students about mobile banking; volunteer at a city charity run (registration desk, 300 runners); part-time shop assistant at weekends; Excel, Canva, English B2.',
      uz: 'Bankning marketing bo‘limida yozgi amaliyot uchun bir sahifalik rezyumening profil, ta’lim, tajriba va ko‘nikmalar bo‘limlarini o‘zingizning haqiqiy o‘qishingiz, loyihalaringiz, ko‘ngillilik faoliyatingiz yoki yarim kunlik ishingiz asosida yozing. Agar mashq ma’lumotlari bilan ishlamoqchi bo‘lsangiz: iqtisodiyot yo‘nalishi 3-kurs talabasi; mobil banking bo‘yicha 150 talaba o‘rtasida so‘rovnoma o‘tkazgan guruh loyihasi; shahar xayriya yugurishida ko‘ngilli (ro‘yxatga olish stoli, 300 yuguruvchi); dam olish kunlari do‘konda yordamchi sotuvchi; Excel, Canva, ingliz tili B2.',
      ru: 'Напишите разделы «Профиль», «Образование», «Опыт» и «Навыки» одностраничного резюме на летнюю стажировку в отделе маркетинга банка, используя свою настоящую учёбу, проекты, волонтёрство или подработку. Если удобнее работать с учебными данными: студент 3 курса экономического факультета; групповой проект — опрос 150 студентов о мобильном банкинге; волонтёр на городском благотворительном забеге (стойка регистрации, 300 бегунов); подработка продавцом по выходным; Excel, Canva, английский B2.',
    },
    notes: 'Strong: a two-line profile aimed at bank marketing, education with relevant coursework or projects, experience framed as achievements (the survey of 150 students, registering 300 runners), skills grouped and specific. No invented awards or grades. Student experience counts as evidence.',
  }),
  task({
    id: 'w.cv-career-change', rubric: 'career.cv', node: 'materials.cv', levels: [2.5, 5], minutes: 12, minWords: 50,
    title: L('A career-change CV summary', 'Kasb o‘zgartirishda rezyume: «O‘zim haqimda» bloki', 'Резюме при смене профессии: блок «О себе»'),
    prompt: {
      en: 'You are moving from one field to another (for example from teaching to corporate training, from a call centre to QA, or from accounting to data analysis). Write the summary (4–6 lines) and a "Relevant experience" section with 3–4 bullets that translate your past work into the new role. Name your target role at the top.',
      uz: 'Siz bir sohadan boshqasiga o‘tyapsiz (masalan, o‘qituvchilikdan korporativ trenerlikka, call-markazdan testlash (QA) sohasiga yoki buxgalteriyadan ma’lumotlar tahliliga). Rezyumening «O‘zim haqimda» blokini (4–6 qator) va o‘tgan ishingizni yangi lavozim tiliga o‘giradigan 3–4 punktli «Tegishli tajriba» bo‘limini yozing. Eng yuqorida maqsadli lavozimingizni yozing.',
      ru: 'Вы переходите из одной сферы в другую (например, из преподавания в корпоративное обучение, из колл-центра в QA или из бухгалтерии в анализ данных). Напишите блок «О себе» (4–6 строк) и раздел «Релевантный опыт» из 3–4 пунктов, которые переводят ваш прошлый опыт на язык новой роли. Вверху укажите целевую должность.',
    },
    notes: 'Strong: names the target role, shows transferable skills with evidence (not just claims), uses the new field\'s vocabulary, and mentions training or projects done for the switch. Weak: apologises for the change, lists old duties unchanged, or is generic.',
  }),
  task({
    id: 'w.cv-bullets', rubric: 'career.cv', node: 'materials.cv', levels: [1.5, 4.5], minutes: 10, minWords: 30,
    title: L('Duties into achievements: five bullets', 'Vazifalarni yutuqlarga aylantirish: beshta punkt', 'Обязанности в достижения: пять пунктов'),
    prompt: {
      en: 'Take five lines from your own CV that describe duties ("responsible for…", "worked with…") and rewrite each as an achievement: an action verb, what you did and the result. Use only real numbers from your work; where you do not know a number, write [number] so you can check it. If you have no CV yet, use these practice lines from an office administrator: "responsible for ordering office supplies", "worked with visitors", "managed the director\'s calendar", "prepared documents", "organised events".',
      uz: 'O‘z rezyumengizdan vazifalarni tasvirlaydigan beshta qatorni oling («…uchun mas’ul», «…bilan ishladim») va har birini yutuq sifatida qayta yozing: harakat fe’li, nima qilganingiz va natija. Faqat ishingizdagi haqiqiy raqamlardan foydalaning; raqamni bilmasangiz, tekshirib olish uchun [raqam] deb yozing. Rezyumengiz hali bo‘lmasa, ofis administratorining mashq qatorlaridan foydalaning: «kanselyariya tovarlarini buyurtma qilish uchun mas’ul», «tashrif buyuruvchilar bilan ishladim», «direktorning ish jadvalini yuritdim», «hujjatlar tayyorladim», «tadbirlar tashkil qildim».',
      ru: 'Возьмите из своего резюме пять строк с обязанностями («отвечал(а) за…», «работал(а) с…») и перепишите каждую как достижение: глагол действия, что вы сделали и результат. Используйте только реальные цифры; если цифру не знаете, напишите [число], чтобы потом проверить. Если резюме пока нет, используйте учебные строки офис-администратора: «отвечала за заказ канцтоваров», «работала с посетителями», «вела календарь директора», «готовила документы», «организовывала мероприятия».',
    },
    notes: 'Each rewritten line should start with an action verb and show a result or scope. Placeholders like [number] are good practice, not a fault. Penalise invented, implausible figures. Judge consistency of tense and style across the five lines.',
  }),
  task({
    id: 'w.linkedin-about', rubric: 'career.cv', node: 'materials.linkedin', levels: [2, 5], minutes: 12, minWords: 60,
    title: L('Your LinkedIn About section', 'LinkedIn «About» bo‘limingiz', 'Раздел About в LinkedIn'),
    prompt: {
      en: 'Write the About section of your LinkedIn profile (120–250 words) for the kind of role you want next. Start with who you are professionally, show two or three achievements with evidence, mention the problems you like to solve, and end with what you are looking for or how to contact you.',
      uz: 'Keyingi istagan lavozimingiz uchun LinkedIn profilingizning «About» bo‘limini yozing (120–250 so‘z). Kasbiy jihatdan kim ekaningizdan boshlang, ikki-uchta yutuqni dalillar bilan ko‘rsating, qanday muammolarni hal qilishni yoqtirishingizni ayting va nimani izlayotganingiz yoki siz bilan qanday bog‘lanish mumkinligi bilan yakunlang.',
      ru: 'Напишите раздел About своего профиля LinkedIn (120–250 слов) под роль, которую хотите получить. Начните с того, кто вы как специалист, покажите два-три достижения с доказательствами, упомяните задачи, которые вам нравится решать, и закончите тем, что вы ищете или как с вами связаться.',
    },
    notes: 'Strong: a clear professional headline sentence, evidence instead of adjectives, a focus that matches the target role, a human voice (first person is fine on LinkedIn), and a closing line with what they want. Weak: a list of adjectives or a copy of the CV.',
  }),
  task({
    id: 'w.hh-profile', rubric: 'career.cv', node: 'materials.hh_profile', levels: [1.5, 4.5], minutes: 12, minWords: 50,
    title: L('hh.uz resume: "About me" and key skills', 'hh.uz rezyumesi: «O‘zim haqimda» va asosiy ko‘nikmalar', 'Резюме на hh.uz: «О себе» и ключевые навыки'),
    prompt: {
      en: 'Write the "About me" block (60–120 words) and a list of 8–12 key skills for your resume on hh.uz, for a specific vacancy title you would search for (write the title first). Use words an employer would type into a search, and back the "About me" with facts.',
      uz: 'Siz qidiradigan aniq vakansiya nomini tanlang va avval uni yozing. So‘ng hh.uz’dagi rezyumengiz uchun shu vakansiyaga mos «O‘zim haqimda» blokini (60–120 so‘z) va 8–12 ta asosiy ko‘nikma ro‘yxatini yozing. Ish beruvchi qidiruvga yozadigan so‘zlardan foydalaning va «O‘zim haqimda»ni faktlar bilan asoslang.',
      ru: 'Напишите блок «О себе» (60–120 слов) и список из 8–12 ключевых навыков для резюме на hh.uz под конкретное название вакансии, которое вы бы искали (сначала напишите название). Используйте слова, которые работодатель вводит в поиск, и подкрепите «О себе» фактами.',
    },
    notes: 'Strong: the target title is clear; skills are specific and searchable (tools, methods, domains) rather than "communicative"; the About block gives years, scope and one or two results. Weak: generic qualities, unrelated skills, or a block of clichés.',
  }),
  task({
    id: 'w.cover-letter', rubric: 'career.letter', node: 'materials.cover_letter', levels: [2, 5], minutes: 20, minWords: 120, ladder: [3, 4, 5],
    title: L('A cover letter for a posting', 'E’lon uchun motivatsion xat', 'Сопроводительное письмо к вакансии'),
    prompt: {
      en: 'Write a cover letter (180–300 words) for this practice posting: "Customer Success Manager at a company that sells online booking software to clinics and beauty salons in Uzbekistan. You will onboard new clients, train their staff, reduce cancellations and find upsell opportunities. Requirements: 2+ years with clients, clear communication in Uzbek and Russian, confidence with software, a results mindset." Use your own experience; name the role, and answer at least two requirements with evidence.',
      uz: 'Ushbu mashq e’loni uchun motivatsion xat yozing (180–300 so‘z): «O‘zbekistondagi klinika va go‘zallik salonlariga onlayn bron qilish dasturini sotadigan kompaniyada Customer Success menejeri. Yangi mijozlarni ulaysiz, ularning xodimlarini o‘qitasiz, bekor qilishlarni kamaytirasiz va qo‘shimcha savdo imkoniyatlarini topasiz. Talablar: mijozlar bilan 2+ yil tajriba, o‘zbek va rus tillarida aniq muloqot, dasturlar bilan ishonchli ishlash, natijaga yo‘naltirilganlik.» O‘z tajribangizdan foydalaning; lavozimni nomlang va kamida ikkita talabga dalil bilan javob bering.',
      ru: 'Напишите сопроводительное письмо (180–300 слов) к учебной вакансии: «Customer Success Manager в компании, которая продаёт сервис онлайн-записи для клиник и салонов красоты в Узбекистане. Вы будете подключать новых клиентов, обучать их сотрудников, снижать отмены и находить возможности допродаж. Требования: 2+ года работы с клиентами, умение ясно общаться на узбекском и русском, уверенная работа с программами, ориентация на результат». Используйте свой опыт; назовите позицию и ответьте минимум на два требования с доказательствами.',
    },
    notes: 'Strong: names the role and the company type, matches at least two requirements (client experience, bilingual communication, software, results) with concrete examples, shows understanding of clinics or salons as clients, and ends with a clear interview offer. 180–300 words. Never invent the learner\'s experience in corrections; suggest where a real figure would help.',
  }),
  task({
    id: 'w.motivation-internship', rubric: 'career.letter', node: 'materials.cover_letter', levels: [1.5, 4.5], minutes: 20, minWords: 100, ladder: [3, 4, 5],
    title: L('A motivation letter for an internship', 'Amaliyot uchun motivatsion xat', 'Мотивационное письмо на стажировку'),
    prompt: {
      en: 'Write a motivation letter (150–250 words) for a three-month internship at an organisation you would really like to join (a company, a hospital, a ministry, an NGO or a start-up). Say why this organisation, what you can already do (study projects, part-time work, volunteering) and what you want to learn. End with your availability.',
      uz: 'Haqiqatan ham qo‘shilishni istagan tashkilotda (kompaniya, shifoxona, vazirlik, NNT yoki startap) uch oylik amaliyot uchun motivatsion xat yozing (150–250 so‘z). Nega aynan shu tashkilot, hozir nimalarni qila olishingiz (o‘quv loyihalari, yarim kunlik ish, ko‘ngillilik) va nimani o‘rganmoqchi ekaningizni ayting. Qachondan ish boshlay olishingizni aytib, xatni yakunlang.',
      ru: 'Напишите мотивационное письмо (150–250 слов) на трёхмесячную стажировку в организации, куда вам действительно хочется попасть (компания, больница, министерство, НКО или стартап). Объясните, почему именно эта организация, что вы уже умеете (учебные проекты, подработка, волонтёрство) и чему хотите научиться. Закончите тем, когда вы готовы начать.',
    },
    notes: 'Strong: a specific reason for this organisation (its work, a project, its clients), student evidence turned into skills, a learning goal that fits the internship, and dates of availability. Weak: dream and passion language with nothing specific.',
  }),
  task({
    id: 'w.thank-you', rubric: 'career.letter', node: 'job_search.applications', levels: [1.5, 4.5], minutes: 8, minWords: 50,
    title: L('A thank-you email after an interview', 'Suhbatdan keyin minnatdorchilik xati', 'Письмо-благодарность после собеседования'),
    prompt: {
      en: 'Write a thank-you email to the person who interviewed you yesterday (use a real interview of yours or this practice one: a logistics coordinator interview with Bahodir, the operations manager, who said their biggest problem is late morning deliveries). Mention one thing from the conversation, add one sentence that strengthens your case, and close with a next step. Include a subject line.',
      uz: 'Kecha siz bilan suhbat o‘tkazgan odamga minnatdorchilik xati yozing (o‘zingizning haqiqiy suhbatingizdan yoki ushbu mashq suhbatidan foydalaning: operatsiyalar menejeri Bahodir bilan logistika koordinatori lavozimi bo‘yicha suhbat, u eng katta muammo — ertalabki yetkazib berishlarning kechikishi ekanini aytgan). Suhbatdan bitta narsani eslang, nomzodligingizni kuchaytiradigan bitta gap qo‘shing va keyingi qadam bilan yakunlang. Mavzu qatorini ham yozing.',
      ru: 'Напишите письмо-благодарность человеку, который вчера проводил с вами собеседование (возьмите своё настоящее собеседование или учебное: собеседование на должность координатора по логистике с операционным менеджером Баходиром, который сказал, что главная проблема — опоздания утренних доставок). Упомяните одну деталь из разговора, добавьте одно предложение, усиливающее вашу кандидатуру, и закончите следующим шагом. Добавьте тему письма.',
    },
    notes: 'Strong: a clear subject, thanks in one line, a specific reference to the conversation (late morning deliveries), one relevant idea or piece of evidence, and a polite next step. Under 150 words. Weak: generic thanks with nothing from the interview.',
  }),
  task({
    id: 'w.follow-up', rubric: 'career.letter', node: 'job_search.applications', levels: [2, 4.5], minutes: 8, minWords: 40,
    title: L('A follow-up when there is no reply', 'Javob bo‘lmaganda eslatma xat', 'Напоминание, когда не отвечают'),
    prompt: {
      en: 'Two weeks ago you applied for a job and had a short phone call; since then there has been no reply. Write a short, polite follow-up email or Telegram message to the recruiter. Remind them who you are and which role, add one new useful thing (a certificate you finished, a relevant result, availability), and ask a clear question.',
      uz: 'Ikki hafta oldin ishga ariza topshirib, qisqa telefon suhbatidan o‘tdingiz; shundan beri javob yo‘q. Rekruterga qisqa va muloyim eslatma xat yoki Telegram xabarini yozing. Kim ekaningizni va qaysi lavozimga ariza berganingizni eslating, bitta yangi foydali ma’lumot qo‘shing (yangi olgan sertifikatingiz, tegishli natija, qachon ishlay olishingiz) va aniq savol bering.',
      ru: 'Две недели назад вы откликнулись на вакансию и поговорили по телефону; с тех пор ответа нет. Напишите рекрутеру короткое вежливое письмо или сообщение в Telegram. Напомните, кто вы и на какую позицию, добавьте одну новую полезную деталь (полученный сертификат, релевантный результат, дату, с которой готовы выйти) и задайте понятный вопрос.',
    },
    notes: 'Strong: short, friendly, specific about the role and the call, adds new value, ends with an easy question (is there an update, the next step or timeline). Weak: guilt, pressure, or a long repeat of the CV.',
  }),
  task({
    id: 'w.counter-offer', rubric: 'career.letter', node: 'interviews.salary_negotiation', levels: [2.5, 5], minutes: 12, minWords: 60,
    title: L('A counter-offer email', 'Qarshi taklif xati', 'Письмо со встречным предложением'),
    prompt: {
      en: 'You received a written offer for a marketing specialist role: 8 million UZS a month, start on the 1st, a performance review after 12 months (practice figures). You want the job but hoped for 9.5 million because you will also run the company\'s Telegram bot ads, which was not in the original job description. Write a counter-offer email: thank them, confirm interest, give your reason, make your request (salary and/or an earlier review), and propose how to confirm.',
      uz: 'Marketing mutaxassisi lavozimiga yozma taklif oldingiz: oyiga 8 million so‘m, ish oyning 1-sanasidan boshlanadi, 12 oydan keyin natijalar bo‘yicha baholash (mashq uchun raqamlar). Ishni xohlaysiz, lekin 9,5 million kutgan edingiz, chunki dastlabki vazifalar ro‘yxatida bo‘lmagan kompaniyaning Telegram bot reklamalarini ham yuritasiz. Qarshi taklif xatini yozing: rahmat ayting, qiziqishingizni tasdiqlang, sababingizni tushuntiring, so‘rovingizni ayting (maosh va/yoki ertaroq baholash) va kelishuvni qanday rasmiylashtirishni taklif qiling.',
      ru: 'Вы получили письменный оффер на позицию маркетолога: 8 млн сумов в месяц, выход с 1-го числа, пересмотр по итогам 12 месяцев (учебные цифры). Вы хотите эту работу, но рассчитывали на 9,5 млн, так как будете вести ещё и рекламу Telegram-бота компании, которой не было в исходном описании. Напишите письмо со встречным предложением: поблагодарите, подтвердите интерес, объясните причину, сформулируйте просьбу (оклад и/или более ранний пересмотр) и предложите, как зафиксировать договорённость.',
    },
    notes: 'Strong: warm thanks and clear interest first; the reason tied to the added scope; a specific request (a figure, or an earlier review such as after 6 months) with a fallback; a polite proposal to confirm in writing. Judge negotiation shape and tone, not the figure. No ultimatums or market statistics.',
  }),
];
