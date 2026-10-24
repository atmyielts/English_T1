// Real-life role-plays: guided speaking scenarios for learners in Uzbekistan.
//
// The AI plays the other person in short, level-adapted turns and keeps track
// of the learner's goals; at the end it gives goals achieved, up to three
// fixes and phrases worth saving. Scenario content is static and hand-written
// (titles, role cards and goals in English, Russian and Uzbek). Every AI
// output is validated here before it reaches a learner, and every limit
// (turns per session, sessions per day, the free allowance) is decided here so
// hub/roleplay.ts only loads and stores rows.

import { type Cefr, CEFR_ORDER, isCefr } from "./english-today.ts";
import { grammarTopicFor, isGrammarTopic, topicSubskill } from "./english-mistakes.ts";
import { matchL1Notes } from "./english-l1-notes.ts";

export type Locale = "en" | "ru" | "uz";
type Text3 = Record<Locale, string>;

/** Learner turns per session; after this the session must be finished. */
export const ROLEPLAY_MAX_TURNS = 10;
/** Learner turns needed before a session can be finished and scored. */
export const ROLEPLAY_MIN_TURNS = 2;
/** Sessions a learner with Speaking can start per learner day (cost guard). */
export const ROLEPLAY_SESSIONS_PER_DAY = 10;
/** A session left untouched this long can no longer be continued. */
export const ROLEPLAY_SESSION_TTL_MS = 3 * 3_600_000;
export const ROLEPLAY_TEXT_MAX = 500;

export type RoleplayGoal = { id: string; text: Text3 };
export type RoleplayPhrase = { en: string; ru: string; uz: string };

export type RoleplayScenario = {
  id: string;
  /** Suitable level band, lowest to highest. */
  levels: [Cefr, Cefr];
  partner: { name: string; role: string };
  /** What the partner does, for the AI (English). */
  brief: string;
  /** The partner's first line (static, so starting costs nothing). */
  opening: string;
  title: Text3;
  situation: Text3;
  role_card: Text3;
  goals: RoleplayGoal[];
  phrases: RoleplayPhrase[];
};

const g = (id: string, en: string, ru: string, uz: string): RoleplayGoal => ({ id, text: { en, ru, uz } });
const p = (en: string, ru: string, uz: string): RoleplayPhrase => ({ en, ru, uz });

export const ROLEPLAY_SCENARIOS: readonly RoleplayScenario[] = [
  {
    id: "visa-interview",
    levels: ["B1", "B2"],
    partner: { name: "Officer Miller", role: "consular officer at the US Embassy in Tashkent" },
    brief: "A short, polite but businesslike student/tourist visa interview. Ask one question at a time: purpose of the trip, length of stay, who pays, ties to Uzbekistan (job, study, family), plans after the trip. Do not decide or promise any visa outcome; at the end just say thank you and that the decision will be communicated.",
    opening: "Good morning. Please pass me your passport. What is the purpose of your trip to the United States?",
    title: { en: "US visa interview in Tashkent", ru: "Собеседование на визу США в Ташкенте", uz: "Toshkentda AQSh vizasi uchun suhbat" },
    situation: {
      en: "You are at the US Embassy window. The officer asks quick questions about your trip.",
      ru: "Вы у окна в посольстве США. Сотрудник быстро задаёт вопросы о поездке.",
      uz: "Siz AQSh elchixonasi oynasi oldidasiz. Xodim safaringiz haqida tez-tez savol beradi.",
    },
    role_card: {
      en: "Answer clearly and honestly in full sentences. Practice only: this is not visa advice.",
      ru: "Отвечайте чётко, честно и полными предложениями. Это только тренировка, а не консультация по визе.",
      uz: "Aniq, rostgoʻy va toʻliq gaplar bilan javob bering. Bu faqat mashq, viza boʻyicha maslahat emas.",
    },
    goals: [
      g("purpose", "Explain the purpose of your trip", "Объясните цель поездки", "Safar maqsadini tushuntiring"),
      g("duration", "Say how long you will stay and where", "Скажите, на сколько и где остановитесь", "Qancha muddat va qayerda turishingizni ayting"),
      g("funding", "Say who will pay for the trip", "Скажите, кто оплачивает поездку", "Safar xarajatini kim toʻlashini ayting"),
      g("ties", "Show why you will come back home", "Покажите, почему вы вернётесь домой", "Nima uchun uyga qaytishingizni koʻrsating"),
    ],
    phrases: [
      p("The purpose of my trip is…", "Цель моей поездки —…", "Safarimning maqsadi —…"),
      p("I'm planning to stay for two weeks.", "Я планирую пробыть две недели.", "Ikki hafta qolishni rejalashtiryapman."),
      p("My parents are paying for the trip.", "Поездку оплачивают мои родители.", "Safar xarajatini ota-onam toʻlaydi."),
      p("I have a job to come back to.", "Мне есть куда вернуться на работу.", "Qaytib boradigan ishim bor."),
      p("Here is my invitation letter.", "Вот моё письмо-приглашение.", "Mana taklifnomam."),
    ],
  },
  {
    id: "job-interview",
    levels: ["B1", "B2"],
    partner: { name: "Ms Karimova", role: "HR manager at an international company in Tashkent" },
    brief: "A friendly first-round job interview in English. Ask about the candidate's background, one strength with an example, why they want this job, and invite their questions at the end.",
    opening: "Hello, thank you for coming. Please, have a seat. Could you tell me a little about yourself?",
    title: { en: "Job interview", ru: "Собеседование на работу", uz: "Ishga kirish suhbati" },
    situation: {
      en: "An international company is interviewing you for a job in English.",
      ru: "Международная компания проводит с вами собеседование на английском.",
      uz: "Xalqaro kompaniya siz bilan ingliz tilida ish suhbatini oʻtkazmoqda.",
    },
    role_card: {
      en: "Present yourself, give a real example and ask one question about the job.",
      ru: "Представьте себя, приведите реальный пример и задайте один вопрос о работе.",
      uz: "Oʻzingizni tanishtiring, haqiqiy misol keltiring va ish haqida bitta savol bering.",
    },
    goals: [
      g("background", "Describe your education and experience", "Расскажите об образовании и опыте", "Taʼlimingiz va tajribangiz haqida gapiring"),
      g("strength", "Give one strength with an example", "Назовите одну сильную сторону с примером", "Bitta kuchli tomoningizni misol bilan ayting"),
      g("motivation", "Explain why you want this job", "Объясните, почему хотите эту работу", "Nima uchun bu ishni xohlashingizni tushuntiring"),
      g("question", "Ask the interviewer a question", "Задайте вопрос интервьюеру", "Suhbatdoshga savol bering"),
    ],
    phrases: [
      p("I graduated from … with a degree in …", "Я окончил(а) … по специальности …", "… ni … mutaxassisligi boʻyicha tamomlaganman"),
      p("In my previous job, I was responsible for…", "На прошлой работе я отвечал(а) за…", "Oldingi ishimda … uchun javobgar edim"),
      p("One of my strengths is…", "Одна из моих сильных сторон —…", "Kuchli tomonlarimdan biri —…"),
      p("I'm really interested in this position because…", "Меня очень интересует эта должность, потому что…", "Bu lavozim menga juda qiziq, chunki…"),
      p("Could you tell me more about the team?", "Расскажите, пожалуйста, подробнее о команде?", "Jamoa haqida batafsilroq aytib bera olasizmi?"),
    ],
  },
  {
    id: "university-interview",
    levels: ["B1", "C1"],
    partner: { name: "Dr Evans", role: "admissions tutor at a university abroad" },
    brief: "A university admission interview on a video call. Ask why this subject and university, about a project or book that inspired the applicant, their future plans, and how they handle difficulties.",
    opening: "Hello, can you hear me well? Great. So, why have you chosen to study this subject at our university?",
    title: { en: "University admission interview", ru: "Собеседование при поступлении в университет", uz: "Universitetga kirish suhbati" },
    situation: {
      en: "A university abroad interviews you online about your application.",
      ru: "Зарубежный университет проводит с вами онлайн-собеседование по заявке.",
      uz: "Chet eldagi universitet arizangiz boʻyicha siz bilan onlayn suhbat oʻtkazmoqda.",
    },
    role_card: {
      en: "Show real interest in your subject and talk about your plans.",
      ru: "Покажите настоящий интерес к предмету и расскажите о планах.",
      uz: "Fanga chinakam qiziqishingizni koʻrsating va rejalaringiz haqida gapiring.",
    },
    goals: [
      g("why-subject", "Explain why you chose this subject", "Объясните, почему выбрали этот предмет", "Bu fanni nima uchun tanlaganingizni tushuntiring"),
      g("experience", "Describe a project, book or experience that inspired you", "Опишите проект, книгу или опыт, который вас вдохновил", "Sizni ilhomlantirgan loyiha, kitob yoki tajribani tasvirlang"),
      g("future", "Talk about your future plans", "Расскажите о планах на будущее", "Kelajakdagi rejalaringiz haqida gapiring"),
    ],
    phrases: [
      p("I've always been fascinated by…", "Меня всегда увлекал(а)…", "Meni doim … qiziqtirgan"),
      p("What really inspired me was…", "Больше всего меня вдохновило…", "Meni eng koʻp ilhomlantirgan narsa…"),
      p("Your programme stands out because…", "Ваша программа выделяется тем, что…", "Sizning dasturingiz … bilan ajralib turadi"),
      p("In the long term, I'd like to…", "В долгосрочной перспективе я хотел(а) бы…", "Uzoq muddatda … istardim"),
      p("That's a good question. Let me think.", "Хороший вопрос. Дайте подумать.", "Yaxshi savol. Oʻylab koʻray."),
    ],
  },
  {
    id: "hotel-check-in",
    levels: ["A2", "B1"],
    partner: { name: "Anna", role: "hotel receptionist abroad" },
    brief: "Hotel check-in. Ask for the booking name, passport, number of nights; mention breakfast times and Wi-Fi. If the guest asks for something (quiet room, late checkout), answer helpfully.",
    opening: "Good evening and welcome to the Park Hotel. Do you have a reservation?",
    title: { en: "Hotel check-in abroad", ru: "Заселение в отель за границей", uz: "Chet elda mehmonxonaga joylashish" },
    situation: {
      en: "You arrive at a hotel in another country and check in.",
      ru: "Вы приезжаете в отель в другой стране и заселяетесь.",
      uz: "Boshqa mamlakatdagi mehmonxonaga yetib keldingiz va joylashyapsiz.",
    },
    role_card: {
      en: "Give your booking details, ask about breakfast and make one request.",
      ru: "Назовите данные бронирования, спросите про завтрак и сделайте одну просьбу.",
      uz: "Bron maʼlumotlarini ayting, nonushta haqida soʻrang va bitta iltimos qiling.",
    },
    goals: [
      g("booking", "Say your name and booking details", "Назовите имя и данные брони", "Ismingiz va bron maʼlumotlarini ayting"),
      g("breakfast", "Ask about breakfast or Wi-Fi", "Спросите про завтрак или Wi-Fi", "Nonushta yoki Wi-Fi haqida soʻrang"),
      g("request", "Make a polite request", "Вежливо о чём-нибудь попросите", "Muloyimlik bilan biror narsa soʻrang"),
    ],
    phrases: [
      p("I have a reservation under the name…", "У меня бронь на имя…", "… nomiga bron qilinganman"),
      p("It's for three nights.", "На три ночи.", "Uch kechaga."),
      p("What time is breakfast?", "Во сколько завтрак?", "Nonushta soat nechada?"),
      p("Could I have a quiet room, please?", "Можно, пожалуйста, тихий номер?", "Iltimos, tinch xona bersangiz boʻladimi?"),
      p("Is it possible to check out late?", "Можно выехать попозже?", "Kechroq chiqib ketish mumkinmi?"),
    ],
  },
  {
    id: "airport-immigration",
    levels: ["A2", "B1"],
    partner: { name: "Officer Lee", role: "immigration officer at an airport abroad" },
    brief: "Passport control at arrival. Ask the purpose of the visit, how long, where the traveller is staying, and whether it is the first visit. Short and neutral; finish by wishing a nice stay.",
    opening: "Next, please. Passport and arrival card. What brings you here today?",
    title: { en: "Airport passport control", ru: "Паспортный контроль в аэропорту", uz: "Aeroportda pasport nazorati" },
    situation: {
      en: "You land abroad and answer the immigration officer's questions.",
      ru: "Вы прилетели за границу и отвечаете на вопросы пограничника.",
      uz: "Chet elga uchib keldingiz va chegarachining savollariga javob beryapsiz.",
    },
    role_card: {
      en: "Answer short and clearly: why you came, how long, where you stay.",
      ru: "Отвечайте коротко и ясно: зачем приехали, надолго ли, где живёте.",
      uz: "Qisqa va aniq javob bering: nima uchun kelgansiz, qancha muddatga, qayerda turasiz.",
    },
    goals: [
      g("purpose", "Say why you are visiting", "Скажите, зачем приехали", "Nima uchun kelganingizni ayting"),
      g("length", "Say how long you will stay", "Скажите, сколько пробудете", "Qancha qolishingizni ayting"),
      g("address", "Say where you are staying", "Скажите, где остановитесь", "Qayerda turishingizni ayting"),
    ],
    phrases: [
      p("I'm here on holiday.", "Я здесь в отпуске.", "Bu yerga dam olishga keldim."),
      p("I'm here for a conference.", "Я приехал(а) на конференцию.", "Konferensiyaga keldim."),
      p("I'll be staying for ten days.", "Я пробуду десять дней.", "Oʻn kun qolaman."),
      p("I'm staying at a hotel in the city centre.", "Я живу в отеле в центре города.", "Shahar markazidagi mehmonxonada turaman."),
      p("This is my first visit.", "Я здесь впервые.", "Bu yerga birinchi marta kelishim."),
    ],
  },
  {
    id: "doctor-visit",
    levels: ["A2", "B1"],
    partner: { name: "Dr Brown", role: "family doctor abroad" },
    brief: "A non-urgent visit to a doctor about a cold, headache or stomach ache. Ask what the problem is, since when, how bad, any allergies; give simple advice. Never give real diagnoses or medicine doses; suggest seeing a doctor in real life for real problems.",
    opening: "Hello, come in. What seems to be the problem today?",
    title: { en: "At the doctor's", ru: "На приёме у врача", uz: "Shifokor qabulida" },
    situation: {
      en: "You feel unwell while abroad and visit a doctor.",
      ru: "Вы плохо себя чувствуете за границей и идёте к врачу.",
      uz: "Chet elda oʻzingizni yomon his qilyapsiz va shifokorga bordingiz.",
    },
    role_card: {
      en: "Describe your symptoms, say since when and ask what to do.",
      ru: "Опишите симптомы, скажите, с какого времени, и спросите, что делать.",
      uz: "Alomatlarni tasvirlang, qachondan beri ekanini ayting va nima qilish kerakligini soʻrang.",
    },
    goals: [
      g("symptoms", "Describe how you feel", "Опишите, как вы себя чувствуете", "Oʻzingizni qanday his qilayotganingizni tasvirlang"),
      g("since", "Say how long you have had it", "Скажите, как давно это началось", "Bu qachondan beri ekanini ayting"),
      g("advice", "Ask what you should do", "Спросите, что вам делать", "Nima qilishingiz kerakligini soʻrang"),
    ],
    phrases: [
      p("I've had a headache since yesterday.", "У меня болит голова со вчерашнего дня.", "Kechadan beri boshim ogʻriyapti."),
      p("I've got a sore throat.", "У меня болит горло.", "Tomogʻim ogʻriyapti."),
      p("I feel tired all the time.", "Я всё время чувствую усталость.", "Doim charchoq his qilaman."),
      p("I'm allergic to…", "У меня аллергия на…", "Menda … ga allergiya bor"),
      p("How often should I take it?", "Как часто это принимать?", "Buni qanchalik tez-tez ichishim kerak?"),
    ],
  },
  {
    id: "market-shopping",
    levels: ["A1", "A2"],
    partner: { name: "Jamie", role: "seller at a street market abroad" },
    brief: "Buying fruit and vegetables at a market. Greet, offer products, say prices in simple numbers, react to a request for a discount in a friendly way (a small one is fine).",
    opening: "Hi there! Fresh fruit today. What would you like?",
    title: { en: "Shopping at a market", ru: "Покупки на рынке", uz: "Bozorda xarid qilish" },
    situation: {
      en: "You buy fruit and vegetables at a market abroad.",
      ru: "Вы покупаете фрукты и овощи на рынке за границей.",
      uz: "Chet eldagi bozorda meva va sabzavot sotib olyapsiz.",
    },
    role_card: {
      en: "Ask for what you want, ask the price and try to get a small discount.",
      ru: "Попросите то, что нужно, спросите цену и попробуйте получить скидку.",
      uz: "Kerakli narsani soʻrang, narxini biling va ozgina chegirma olishga harakat qiling.",
    },
    goals: [
      g("ask", "Say what you want to buy and how much", "Скажите, что и сколько хотите купить", "Nima va qancha olmoqchi ekaningizni ayting"),
      g("price", "Ask the price", "Спросите цену", "Narxini soʻrang"),
      g("discount", "Ask for a discount politely", "Вежливо попросите скидку", "Muloyimlik bilan chegirma soʻrang"),
    ],
    phrases: [
      p("Can I have a kilo of apples, please?", "Можно килограмм яблок, пожалуйста?", "Bir kilo olma bersangiz?"),
      p("How much is it?", "Сколько это стоит?", "Bu qancha turadi?"),
      p("That's a bit expensive.", "Это немного дороговато.", "Bu biroz qimmat."),
      p("Can you give me a discount?", "Можете сделать скидку?", "Chegirma qila olasizmi?"),
      p("I'll take it, thanks.", "Беру, спасибо.", "Olaman, rahmat."),
    ],
  },
  {
    id: "cafe-order",
    levels: ["A1", "A2"],
    partner: { name: "Sam", role: "barista in a café abroad" },
    brief: "Ordering in a café. Take the order, ask about size, milk, to stay or take away, say the total, ask how they will pay.",
    opening: "Hi! What can I get for you today?",
    title: { en: "Ordering in a café", ru: "Заказ в кафе", uz: "Kafeda buyurtma berish" },
    situation: {
      en: "You order a drink and something to eat in a café.",
      ru: "Вы заказываете напиток и что-нибудь поесть в кафе.",
      uz: "Kafeda ichimlik va yegulik buyurtma qilyapsiz.",
    },
    role_card: {
      en: "Order politely, answer the barista's questions and pay.",
      ru: "Вежливо закажите, ответьте на вопросы бариста и заплатите.",
      uz: "Muloyimlik bilan buyurtma bering, baristaning savollariga javob bering va toʻlang.",
    },
    goals: [
      g("order", "Order a drink and food", "Закажите напиток и еду", "Ichimlik va ovqat buyurtma qiling"),
      g("details", "Answer about size or milk", "Ответьте про размер или молоко", "Hajm yoki sut haqida javob bering"),
      g("pay", "Ask the price and pay", "Узнайте цену и заплатите", "Narxini biling va toʻlang"),
    ],
    phrases: [
      p("Could I have a cappuccino, please?", "Можно капучино, пожалуйста?", "Bitta kapuchino bersangiz?"),
      p("A large one, please.", "Большой, пожалуйста.", "Kattasini, iltimos."),
      p("To take away, please.", "С собой, пожалуйста.", "Olib ketaman, iltimos."),
      p("Can I pay by card?", "Можно оплатить картой?", "Karta bilan toʻlasam boʻladimi?"),
      p("That's all, thank you.", "Это всё, спасибо.", "Shu, rahmat."),
    ],
  },
  {
    id: "landlord-call",
    levels: ["B1", "B1"],
    partner: { name: "Mr Davis", role: "landlord of a flat the learner rents abroad" },
    brief: "A phone call from a tenant. Something in the flat is broken (heating, washing machine or a leak). Ask what happened and since when, be a little busy, and agree a time for a repair person to come.",
    opening: "Hello, Davis speaking.",
    title: { en: "Calling your landlord", ru: "Звонок арендодателю", uz: "Uy egasiga qoʻngʻiroq" },
    situation: {
      en: "Something is broken in the flat you rent. You call the landlord.",
      ru: "В съёмной квартире что-то сломалось. Вы звоните хозяину.",
      uz: "Ijaradagi kvartirada nimadir buzildi. Uy egasiga qoʻngʻiroq qilyapsiz.",
    },
    role_card: {
      en: "Introduce yourself, explain the problem and arrange a repair time.",
      ru: "Представьтесь, объясните проблему и договоритесь о времени ремонта.",
      uz: "Oʻzingizni tanishtiring, muammoni tushuntiring va taʼmirlash vaqtini kelishib oling.",
    },
    goals: [
      g("introduce", "Say who you are and which flat", "Скажите, кто вы и из какой квартиры", "Kimligingiz va qaysi kvartiradan ekaningizni ayting"),
      g("problem", "Explain what is broken and since when", "Объясните, что сломалось и когда", "Nima buzilgani va qachondan beri ekanini tushuntiring"),
      g("arrange", "Agree a day and time for the repair", "Договоритесь о дне и времени ремонта", "Taʼmirlash kuni va vaqtini kelishib oling"),
    ],
    phrases: [
      p("Hi, this is … from flat 12.", "Здравствуйте, это … из квартиры 12.", "Salom, bu 12-kvartiradan …"),
      p("I'm calling about the heating.", "Я звоню насчёт отопления.", "Isitish tizimi haqida qoʻngʻiroq qilyapman."),
      p("It stopped working two days ago.", "Оно перестало работать два дня назад.", "Ikki kun oldin ishlamay qoldi."),
      p("Could someone come and have a look?", "Может кто-нибудь прийти посмотреть?", "Kimdir kelib koʻrib bera oladimi?"),
      p("Would Thursday morning suit you?", "Вам удобно в четверг утром?", "Payshanba ertalab sizga qulaymi?"),
    ],
  },
  {
    id: "new-colleague",
    levels: ["A2", "B1"],
    partner: { name: "Chris", role: "friendly new colleague from another country" },
    brief: "Small talk with a new foreign colleague at the office kitchen. Introduce yourself, ask about their role, where they are from, and suggest lunch together. Keep it light and friendly.",
    opening: "Hi! I don't think we've met. I'm Chris, I just joined the marketing team.",
    title: { en: "Meeting a new colleague", ru: "Знакомство с новым коллегой", uz: "Yangi hamkasb bilan tanishuv" },
    situation: {
      en: "A new colleague from abroad starts a conversation in the office kitchen.",
      ru: "Новый коллега из другой страны заговаривает с вами на офисной кухне.",
      uz: "Chet ellik yangi hamkasb ofis oshxonasida siz bilan suhbat boshlaydi.",
    },
    role_card: {
      en: "Introduce yourself, find out about them and suggest meeting again.",
      ru: "Представьтесь, узнайте о нём и предложите встретиться ещё.",
      uz: "Oʻzingizni tanishtiring, u haqida bilib oling va yana uchrashishni taklif qiling.",
    },
    goals: [
      g("introduce", "Introduce yourself and your job", "Представьтесь и расскажите о работе", "Oʻzingiz va ishingizni tanishtiring"),
      g("ask", "Ask two questions about them", "Задайте ему два вопроса", "Unga ikkita savol bering"),
      g("invite", "Suggest lunch or coffee together", "Предложите вместе пообедать или выпить кофе", "Birga tushlik yoki qahva ichishni taklif qiling"),
    ],
    phrases: [
      p("Nice to meet you. I'm … from the finance team.", "Приятно познакомиться. Я … из финансового отдела.", "Tanishganimdan xursandman. Men moliya boʻlimidanman, ismim …"),
      p("How are you finding it so far?", "Как вам у нас пока?", "Hozircha sizga qanday?"),
      p("Where are you from originally?", "Откуда вы родом?", "Asli qayerliksiz?"),
      p("Would you like to grab lunch together?", "Не хотите вместе пообедать?", "Birga tushlik qilmaymizmi?"),
      p("Let me know if you need any help.", "Скажите, если нужна помощь.", "Yordam kerak boʻlsa, ayting."),
    ],
  },
  {
    id: "ielts-part1",
    levels: ["A2", "C1"],
    partner: { name: "The examiner", role: "IELTS Speaking examiner in Part 1" },
    brief: "An IELTS Speaking Part 1 warm-up. Ask short personal questions on two familiar topics (home town, work or study, free time, food). One question at a time, neutral examiner style, no feedback during the talk.",
    opening: "Good afternoon. My name is Sarah. Can you tell me your full name, please? … Thank you. Do you work or are you a student?",
    title: { en: "IELTS Part 1 warm-up", ru: "Разминка: IELTS Part 1", uz: "Qizishish: IELTS Part 1" },
    situation: {
      en: "An examiner asks you short questions about yourself, like IELTS Speaking Part 1.",
      ru: "Экзаменатор задаёт короткие вопросы о вас, как в IELTS Speaking Part 1.",
      uz: "Imtihon oluvchi IELTS Speaking Part 1 dagi kabi oʻzingiz haqingizda qisqa savollar beradi.",
    },
    role_card: {
      en: "Give answers of 2–3 sentences: answer, reason, example.",
      ru: "Отвечайте в 2–3 предложениях: ответ, причина, пример.",
      uz: "2–3 gap bilan javob bering: javob, sabab, misol.",
    },
    goals: [
      g("extend", "Extend answers with a reason", "Расширяйте ответы причиной", "Javoblarni sabab bilan kengaytiring"),
      g("example", "Give a personal example", "Приведите личный пример", "Shaxsiy misol keltiring"),
      g("range", "Use a phrase to give your opinion", "Используйте фразу, чтобы выразить мнение", "Fikr bildirish uchun ibora ishlating"),
    ],
    phrases: [
      p("Actually, I'm currently studying…", "Вообще-то сейчас я учусь…", "Aslida hozir … da oʻqiyapman"),
      p("The main reason is that…", "Главная причина в том, что…", "Asosiy sababi shundaki…"),
      p("For example, last weekend I…", "Например, в прошлые выходные я…", "Masalan, oʻtgan dam olish kunlari men…"),
      p("To be honest, I'm not really into…", "Честно говоря, я не очень увлекаюсь…", "Rostini aytsam, … ga unchalik qiziqmayman"),
      p("It depends on the situation.", "Зависит от ситуации.", "Vaziyatga bogʻliq."),
    ],
  },
  {
    id: "complaint",
    levels: ["B1", "B2"],
    partner: { name: "Taylor", role: "customer service agent of an online shop" },
    brief: "A customer calls about an order: wrong item, late delivery or broken product. Apologise, ask for the order number and details, offer a solution (replacement, refund or discount) and confirm next steps.",
    opening: "Thank you for calling Smart Shop customer service, this is Taylor. How can I help you?",
    title: { en: "Complaint to customer service", ru: "Жалоба в службу поддержки", uz: "Mijozlarni qoʻllab-quvvatlash xizmatiga shikoyat" },
    situation: {
      en: "Your online order arrived broken. You call customer service.",
      ru: "Ваш заказ из интернет-магазина пришёл сломанным. Вы звоните в поддержку.",
      uz: "Internet-doʻkondan buyurtmangiz siniq holda keldi. Qoʻllab-quvvatlash xizmatiga qoʻngʻiroq qilyapsiz.",
    },
    role_card: {
      en: "Explain the problem politely but firmly and agree a solution.",
      ru: "Объясните проблему вежливо, но твёрдо, и договоритесь о решении.",
      uz: "Muammoni muloyim, lekin qatʼiy tushuntiring va yechim boʻyicha kelishing.",
    },
    goals: [
      g("explain", "Explain what is wrong with the order", "Объясните, что не так с заказом", "Buyurtmada nima muammo borligini tushuntiring"),
      g("details", "Give the order number and date", "Назовите номер и дату заказа", "Buyurtma raqami va sanasini ayting"),
      g("solution", "Ask for a refund or replacement", "Попросите возврат денег или замену", "Pulni qaytarish yoki almashtirishni soʻrang"),
      g("confirm", "Confirm what happens next", "Уточните, что будет дальше", "Keyin nima boʻlishini aniqlang"),
    ],
    phrases: [
      p("I'm calling to complain about my order.", "Я звоню с жалобой на заказ.", "Buyurtmam yuzasidan shikoyat bilan qoʻngʻiroq qilyapman."),
      p("The item arrived damaged.", "Товар пришёл повреждённым.", "Mahsulot shikastlangan holda keldi."),
      p("My order number is…", "Номер моего заказа —…", "Buyurtma raqamim —…"),
      p("I'd like a full refund, please.", "Я бы хотел(а) полный возврат денег.", "Pulimni toʻliq qaytarishingizni xohlayman."),
      p("How long will that take?", "Сколько это займёт времени?", "Bu qancha vaqt oladi?"),
    ],
  },
];

export const roleplayScenario = (id: unknown): RoleplayScenario | null =>
  ROLEPLAY_SCENARIOS.find((scenario) => scenario.id === id) ?? null;

export const asLocale = (value: unknown): Locale => (value === "ru" || value === "uz" ? value : "en");

/** Level the partner speaks at: the learner's level kept inside the scenario's band. */
export const partnerLevel = (scenario: RoleplayScenario, learner: unknown): Cefr => {
  const [low, high] = scenario.levels;
  if (!isCefr(learner)) return low;
  const index = CEFR_ORDER.indexOf(learner);
  return CEFR_ORDER[Math.min(Math.max(index, CEFR_ORDER.indexOf(low)), CEFR_ORDER.indexOf(high))] ?? low;
};

export type ScenarioProgress = { goals_met: number; goals_total: number; finished_at: string };

/** A scenario as sent to the learner, in their UI language (phrases keep English + their translation). */
export const publicScenario = (scenario: RoleplayScenario, locale: Locale, progress: ScenarioProgress | null = null) => ({
  id: scenario.id,
  levels: scenario.levels,
  partner: scenario.partner.name,
  opening: scenario.opening,
  title: scenario.title[locale],
  situation: scenario.situation[locale],
  role_card: scenario.role_card[locale],
  goals: scenario.goals.map((goal) => ({ id: goal.id, text: goal.text[locale] })),
  phrases: scenario.phrases.map((phrase) => ({ en: phrase.en, meaning: locale === "en" ? null : phrase[locale] })),
  best: progress,
});

// --- Access ---------------------------------------------------------------

export type RoleplayStartDecision =
  | { allowed: true; basis: "entitled" | "admin" | "free" }
  | { allowed: false; code: "english_free_limit_reached" | "roleplay_daily_limit_reached" };

/**
 * May the learner start a new session? Learners with Speaking (or admins) up
 * to ROLEPLAY_SESSIONS_PER_DAY a day; everyone else on today's shared free
 * activity, and only one free session a day (an abandoned session still counts).
 */
export const decideRoleplayStart = (input: {
  admin: boolean;
  entitled: boolean;
  freeLeft: number;
  sessionsToday: number;
  freeSessionsToday: number;
}): RoleplayStartDecision => {
  if (input.admin || input.entitled) {
    return input.sessionsToday < ROLEPLAY_SESSIONS_PER_DAY
      ? { allowed: true, basis: input.admin ? "admin" : "entitled" }
      : { allowed: false, code: "roleplay_daily_limit_reached" };
  }
  return input.freeLeft > 0 && input.freeSessionsToday === 0
    ? { allowed: true, basis: "free" }
    : { allowed: false, code: "english_free_limit_reached" };
};

// --- Messages and learner input -------------------------------------------

export type RoleplayMessage = { role: "partner" | "learner"; text: string };
export type RoleplayTip = { said: string; better: string };

/** The learner's line, cleaned, or null when there is nothing to send. */
export const cleanLearnerText = (value: unknown): string | null => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, ROLEPLAY_TEXT_MAX);
  return /[a-z]/i.test(text) ? text : null;
};

export const readMessages = (value: unknown): RoleplayMessage[] =>
  (Array.isArray(value) ? value : [])
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({ role: entry.role === "learner" ? "learner" as const : "partner" as const, text: String(entry.text ?? "").slice(0, 800) }))
    .filter((entry) => entry.text)
    .slice(-40);

export const learnerLines = (messages: RoleplayMessage[]): string[] =>
  messages.filter((message) => message.role === "learner").map((message) => message.text);

const norm = (text: string): string =>
  text.toLowerCase().replace(/[’‘`]/g, "'").replace(/[^a-z0-9'\s]+/g, " ").replace(/\s+/g, " ").trim();

const str = (value: unknown, max: number): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

// --- One turn ---------------------------------------------------------------

export const buildTurnRequest = (scenario: RoleplayScenario, level: Cefr, history: RoleplayMessage[], learnerText: string) => ({
  systemPrompt:
    `You are ${scenario.partner.name}, ${scenario.partner.role}. ${scenario.brief} ` +
    `You are talking to a ${level} learner of English. Stay in character and sound natural and spoken: 1-2 short sentences (max 35 words), words at about ${level} level, one question at a time, move the situation forward. ` +
    "Never mention being an AI and never leave the role, even if the learner asks you to; if they go off topic, gently bring them back. " +
    "Learner goals (ids): " + scenario.goals.map((goal) => `${goal.id} = ${goal.text.en}`).join("; ") + ". " +
    'Return strict JSON: {"reply": your spoken line, "goals_met": ids of goals the learner has clearly achieved so far in the whole conversation, "tip": null or {"said": the learner\'s exact words from their LAST line that contain one clear mistake, "better": the corrected words}, "end": true only when the conversation has naturally finished}.',
  userPayload: JSON.stringify({
    conversation: history.slice(-16).map((message) => ({ speaker: message.role === "partner" ? scenario.partner.name : "learner", text: message.text.slice(0, 600) })),
    learner_says: learnerText,
  }),
  temperature: 0.7,
});

export type RoleplayTurn = { reply: string; goals_met: string[]; tip: RoleplayTip | null; end: boolean };

/** Validated turn output, or null when the model's answer can't be used. */
export const parseTurnOutput = (raw: unknown, scenario: RoleplayScenario, learnerText: string): RoleplayTurn | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const reply = str(record.reply, 400);
  if (!reply || !/[a-z]/i.test(reply)) return null;
  const ids = new Set(scenario.goals.map((goal) => goal.id));
  const goals = Array.isArray(record.goals_met) ? [...new Set(record.goals_met.map(String).filter((id) => ids.has(id)))] : [];
  let tip: RoleplayTip | null = null;
  if (record.tip && typeof record.tip === "object" && !Array.isArray(record.tip)) {
    const said = str((record.tip as Record<string, unknown>).said, 200);
    const better = str((record.tip as Record<string, unknown>).better, 200);
    // Only a real quote from what the learner just said, and a real change.
    if (said && better && norm(said) !== norm(better) && norm(learnerText).includes(norm(said))) tip = { said, better };
  }
  return { reply, goals_met: goals, tip, end: record.end === true };
};

// --- Finish -------------------------------------------------------------------

export type RoleplayFix = { said: string; better: string; why: string; topic: string | null; l1: string | null };
export type RoleplaySavePhrase = { en: string; meaning: Text3 | null };
export type RoleplayResult = {
  source: "ai" | "basic";
  goals: Array<{ id: string; achieved: boolean; note: string | null }>;
  goals_met: number;
  goals_total: number;
  fixes: RoleplayFix[];
  phrases: RoleplaySavePhrase[];
  summary: string | null;
  score: number;
};

export const buildFinishRequest = (scenario: RoleplayScenario, level: Cefr, history: RoleplayMessage[]) => ({
  systemPrompt:
    `You review a short English role-play by a ${level} learner (situation: ${scenario.title.en}; the learner's partner was ${scenario.partner.role}). ` +
    "Judge only the learner's lines. Return strict JSON: " +
    '{"goals": [{"id": goal id, "achieved": true|false, "note": one short sentence}], ' +
    '"fixes": up to 3 [{"said": the learner\'s exact words with a real mistake, "better": corrected words, "why": one short simple sentence}], ' +
    '"phrases": up to 3 natural English phrases the learner could use next time in this situation (each under 12 words), ' +
    '"summary": 1-2 encouraging sentences with one thing to try next, "score": 0-100 for how well they communicated}. ' +
    "Goals: " + scenario.goals.map((goal) => `${goal.id} = ${goal.text.en}`).join("; ") + ". Do not invent mistakes; if there are none, return an empty fixes list.",
  userPayload: JSON.stringify({
    conversation: history.slice(-24).map((message) => ({ speaker: message.role === "partner" ? "partner" : "learner", text: message.text.slice(0, 600) })),
  }),
  temperature: 0.2,
});

const attachTopic = (said: string, better: string, why: string): RoleplayFix => {
  const topic = grammarTopicFor({ original: said, corrected: better, explanation: why });
  return { said, better, why, topic, l1: matchL1Notes({ original: said, corrected: better, explanation: why, topic })[0]?.id ?? null };
};

/** Scenario phrases the learner didn't say, to fill the list of phrases worth saving. */
const unusedPhrases = (scenario: RoleplayScenario, learnerText: string): RoleplaySavePhrase[] => {
  const said = norm(learnerText);
  return scenario.phrases
    .filter((phrase) => !said.includes(norm(phrase.en.replace(/…/g, "")).slice(0, 18)))
    .map((phrase) => ({ en: phrase.en, meaning: { en: phrase.en, ru: phrase.ru, uz: phrase.uz } }));
};

const mergePhrases = (first: RoleplaySavePhrase[], rest: RoleplaySavePhrase[], max = 5): RoleplaySavePhrase[] => {
  const seen = new Set<string>();
  const out: RoleplaySavePhrase[] = [];
  for (const phrase of [...first, ...rest]) {
    const key = norm(phrase.en);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length >= max) break;
  }
  return out;
};

/** 0-100: goals carry most of the weight; the model's view of communication the rest. */
export const roleplayScore = (goalsMet: number, goalsTotal: number, aiScore: number | null): number => {
  const goalPart = goalsTotal > 0 ? goalsMet / goalsTotal : 0;
  const value = aiScore === null ? goalPart : goalPart * 0.6 + (aiScore / 100) * 0.4;
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
};

/** The result without AI: tracked goals, the tips given during the talk and the scenario's phrases. */
export const basicFinish = (scenario: RoleplayScenario, tracked: string[], tips: RoleplayTip[], learnerText: string): RoleplayResult => {
  const met = new Set(tracked);
  const goals = scenario.goals.map((goal) => ({ id: goal.id, achieved: met.has(goal.id), note: null }));
  const goalsMet = goals.filter((goal) => goal.achieved).length;
  return {
    source: "basic",
    goals,
    goals_met: goalsMet,
    goals_total: goals.length,
    fixes: tips.slice(-3).map((tip) => attachTopic(tip.said, tip.better, "")),
    phrases: unusedPhrases(scenario, learnerText).slice(0, 5),
    summary: null,
    score: roleplayScore(goalsMet, goals.length, null),
  };
};

/**
 * Validated end-of-session review, or null when unusable. Goals already met
 * during the talk stay met; fixes must quote the learner's own words.
 */
export const parseFinishOutput = (
  raw: unknown,
  scenario: RoleplayScenario,
  learnerText: string,
  tracked: string[],
): RoleplayResult | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.goals)) return null;
  const said = norm(learnerText);
  const fromModel = new Map<string, { achieved: boolean; note: string | null }>();
  for (const entry of record.goals) {
    if (!entry || typeof entry !== "object") continue;
    const goal = entry as Record<string, unknown>;
    fromModel.set(String(goal.id ?? ""), { achieved: goal.achieved === true, note: str(goal.note, 200) || null });
  }
  const met = new Set(tracked);
  const goals = scenario.goals.map((goal) => {
    const model = fromModel.get(goal.id);
    return { id: goal.id, achieved: met.has(goal.id) || model?.achieved === true, note: model?.note ?? null };
  });
  const fixes = (Array.isArray(record.fixes) ? record.fixes : [])
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({ said: str(entry.said, 200), better: str(entry.better, 200), why: str(entry.why, 240) }))
    .filter((fix) => fix.said && fix.better && norm(fix.said) !== norm(fix.better) && said.includes(norm(fix.said)))
    .slice(0, 3)
    .map((fix) => attachTopic(fix.said, fix.better, fix.why));
  const modelPhrases = (Array.isArray(record.phrases) ? record.phrases : [])
    .map((entry) => str(typeof entry === "object" && entry ? (entry as Record<string, unknown>).phrase : entry, 90))
    .filter((phrase) => phrase.split(" ").length <= 14 && /^[A-Za-z0-9 ,.'’?!…-]+$/.test(phrase))
    .slice(0, 3)
    .map((phrase) => ({ en: phrase, meaning: null }));
  const aiScoreRaw = Number(record.score);
  const aiScore = Number.isFinite(aiScoreRaw) ? Math.max(0, Math.min(100, Math.round(aiScoreRaw))) : null;
  const goalsMet = goals.filter((goal) => goal.achieved).length;
  return {
    source: "ai",
    goals,
    goals_met: goalsMet,
    goals_total: goals.length,
    fixes,
    phrases: mergePhrases(modelPhrases, unusedPhrases(scenario, learnerText)),
    summary: str(record.summary, 400) || null,
    score: roleplayScore(goalsMet, goals.length, aiScore),
  };
};

/** Mistake rows for learning_attempt_feedback / learner_language_errors (same shape as speaking feedback). */
export const issuesFromRoleplay = (result: RoleplayResult, scenarioId: string): Array<Record<string, unknown>> => {
  const issues: Array<Record<string, unknown>> = result.fixes.map((fix) => ({
    category: "grammar",
    subskill_key: isGrammarTopic(fix.topic) ? topicSubskill(fix.topic) : "speaking.accuracy",
    location_ref: `roleplay-${scenarioId}`,
    explanation: `"${fix.said}" → "${fix.better}"`.slice(0, 240),
    correction_hint: fix.why || fix.better,
    severity: 0.55,
  }));
  if (result.goals_met < result.goals_total) {
    issues.push({
      category: "speaking",
      subskill_key: "speaking.task_completion",
      location_ref: `roleplay-${scenarioId}`,
      explanation: "Reach every goal in a role-play",
      correction_hint: `Missed: ${result.goals.filter((goal) => !goal.achieved).map((goal) => goal.id).join(", ")}`.slice(0, 240),
      severity: 0.5,
    });
  }
  return issues;
};
