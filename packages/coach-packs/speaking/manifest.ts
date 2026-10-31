import type { PackManifest } from '../src/types.ts';

// B2 English Speaking Partner. Everyday fluency from A2 to C1 through role-plays
// that adapt to the learner's level. Skill nodes and error tags are referenced by
// every other file in this pack.

export const CEFR_SCALE = {
  id: 'cefr', min: 1, max: 6, step: 0.5,
  labels: [
    { value: 1, label: 'A1' }, { value: 1.5, label: 'A1+' }, { value: 2, label: 'A2' }, { value: 2.5, label: 'A2+' },
    { value: 3, label: 'B1' }, { value: 3.5, label: 'B1+' }, { value: 4, label: 'B2' }, { value: 4.5, label: 'B2+' },
    { value: 5, label: 'C1' }, { value: 5.5, label: 'C1+' }, { value: 6, label: 'C2' },
  ],
};

export const manifest: PackManifest = {
  id: 'speaking',
  feature: 'B2',
  version: '1.0.0',
  name: { en: 'English Speaking Partner', uz: 'Ingliz tili suhbatdoshi', ru: 'Разговорный партнёр по английскому' },
  tagline: {
    en: 'Real conversations by voice, at your level: work, travel, shops, the doctor and small talk.',
    uz: 'Darajangizga mos ovozli suhbatlar: ish, sayohat, do‘kon, shifokor va oddiy gurung.',
    ru: 'Живые голосовые разговоры на вашем уровне: работа, путешествия, магазины, врач и small talk.',
  },
  description: {
    en: 'Voice role-plays with people who react to what you say, from A2 to C1. Choose gentle or strict correction. Shadow sentences to work on how you sound, build a phrase bank with spaced repetition, and get a weekly fluency report: words per minute, filler rate, vocabulary range and the error types you are fixing. Beginners get explanations in Uzbek or Russian.',
    uz: 'A2 dan C1 gacha — aytganlaringizga munosabat bildiradigan suhbatdoshlar bilan ovozli rolli o‘yinlar. Yumshoq yoki qat’iy tuzatishni tanlang. Talaffuz uchun gaplarni takrorlang (shadowing), oraliq takrorlash bilan iboralar bankini yarating va haftalik ravonlik hisobotini oling: daqiqadagi so‘zlar, to‘ldiruvchi so‘zlar ulushi, lug‘at boyligi va tuzatayotgan xato turlaringiz. Boshlovchilarga tushuntirishlar o‘zbek yoki rus tilida.',
    ru: 'Голосовые ролевые диалоги с собеседниками, которые реагируют на ваши слова, от A2 до C1. Выберите мягкую или строгую коррекцию. Повторяйте фразы за диктором (shadowing), собирайте банк фраз с интервальным повторением и получайте еженедельный отчёт о беглости: слова в минуту, доля слов-паразитов, словарный запас и типы ошибок, над которыми вы работаете. Начинающим — объяснения на узбекском или русском.',
  },
  uiLanguages: ['uz', 'ru', 'en'],
  practiceLanguage: 'en',
  audience: {
    description: {
      en: 'Adults and teenagers who want to speak English with confidence, from A2 to C1.',
      uz: 'Ingliz tilida ishonch bilan gapirmoqchi bo‘lgan kattalar va o‘smirlar, A2 dan C1 gacha.',
      ru: 'Взрослые и подростки, которые хотят уверенно говорить по-английски, от A2 до C1.',
    },
    minAge: 13,
    levels: [2, 5],
  },
  scale: CEFR_SCALE,
  skills: [
    { id: 'conversation', name: { en: 'Conversation', uz: 'Suhbat', ru: 'Разговор' } },
    { id: 'conversation.fluency', parent: 'conversation', name: { en: 'Fluency', uz: 'Ravonlik', ru: 'Беглость' }, weight: 1.2 },
    { id: 'conversation.range', parent: 'conversation', name: { en: 'Vocabulary range', uz: 'Lug‘at boyligi', ru: 'Словарный запас' } },
    { id: 'conversation.accuracy', parent: 'conversation', name: { en: 'Grammar accuracy', uz: 'Grammatik aniqlik', ru: 'Грамматическая точность' } },
    { id: 'conversation.interaction', parent: 'conversation', name: { en: 'Interaction', uz: 'Muloqot', ru: 'Взаимодействие' } },
    { id: 'conversation.pronunciation', parent: 'conversation', name: { en: 'Pronunciation', uz: 'Talaffuz', ru: 'Произношение' } },
    { id: 'situations', name: { en: 'Everyday situations', uz: 'Kundalik vaziyatlar', ru: 'Повседневные ситуации' } },
    { id: 'situations.social', parent: 'situations', name: { en: 'Small talk and social life', uz: 'Gurung va ijtimoiy hayot', ru: 'Small talk и общение' } },
    { id: 'situations.travel', parent: 'situations', name: { en: 'Travel', uz: 'Sayohat', ru: 'Путешествия' } },
    { id: 'situations.shopping', parent: 'situations', name: { en: 'Shops and services', uz: 'Do‘kon va xizmatlar', ru: 'Магазины и услуги' } },
    { id: 'situations.health', parent: 'situations', name: { en: 'Health and the doctor', uz: 'Sog‘liq va shifokor', ru: 'Здоровье и врач' } },
    { id: 'situations.work', parent: 'situations', name: { en: 'Work', uz: 'Ish', ru: 'Работа' } },
    { id: 'phrases', name: { en: 'Phrase bank', uz: 'Iboralar banki', ru: 'Банк фраз' }, weight: 0.7 },
  ],
  errorTags: [
    {
      id: 'verb_tense', node: 'conversation.accuracy', drill: 'drill.verb_tense',
      name: { en: 'Verb tenses', uz: 'Fe’l zamonlari', ru: 'Времена глаголов' },
      explain: {
        en: 'Talk about finished times with the past simple (I went yesterday), about experience with the present perfect (I have been to Dubai), and about plans with going to or the present continuous (I am meeting him tomorrow).',
        uz: 'Tugagan vaqt haqida past simple bilan (I went yesterday), tajriba haqida present perfect bilan (I have been to Dubai), rejalar haqida going to yoki present continuous bilan gapiring (I am meeting him tomorrow).',
        ru: 'О завершённом времени — past simple (I went yesterday), об опыте — present perfect (I have been to Dubai), о планах — going to или present continuous (I am meeting him tomorrow).',
      },
    },
    {
      id: 'missing_be', node: 'conversation.accuracy', drill: 'drill.missing_be',
      name: { en: 'Missing "be"', uz: '«Be» fe’lining tushib qolishi', ru: 'Пропуск глагола «be»' },
      explain: {
        en: 'English needs a verb in every sentence. In Uzbek and Russian you can say "I student", but in English it is "I am a student", "She is tired", "They are at home".',
        uz: 'Ingliz tilida har bir gapda fe’l bo‘lishi shart. O‘zbek tilida «Men talabaman» deyiladi, inglizchada esa «I am a student», «She is tired», «They are at home».',
        ru: 'В английском в каждом предложении нужен глагол. По-русски можно сказать «Я студент», а по-английски — «I am a student», «She is tired», «They are at home».',
      },
    },
    {
      id: 'pronouns_gender', node: 'conversation.accuracy', drill: 'drill.pronouns_gender',
      name: { en: 'He or she', uz: 'He yoki she', ru: 'He или she' },
      explain: {
        en: 'Uzbek has one word, "u", for he, she and it. In English choose he for a man, she for a woman and it for a thing, and keep the same one through the story.',
        uz: 'O‘zbek tilida «u» bitta so‘z — ham erkak, ham ayol, ham narsa uchun. Ingliz tilida erkak uchun he, ayol uchun she, narsa uchun it ishlating va hikoya davomida o‘zgartirmang.',
        ru: 'В узбекском одно слово «u» для «он», «она» и «оно». В английском выбирайте he для мужчины, she для женщины и it для предмета и не меняйте по ходу рассказа.',
      },
    },
    {
      id: 'articles', node: 'conversation.accuracy', drill: 'drill.articles',
      name: { en: 'Articles (a, an, the)', uz: 'Artikllar (a, an, the)', ru: 'Артикли (a, an, the)' },
      explain: {
        en: 'Say a or an before one thing you mention for the first time (I bought a jacket), the when it is clear which one (The jacket is too small), and nothing before general plurals (I like dogs).',
        uz: 'Birinchi marta aytilgan bitta narsa oldida a yoki an deng (I bought a jacket), qaysi biri aniq bo‘lsa the (The jacket is too small), umumiy ko‘plik oldida hech narsa (I like dogs).',
        ru: 'A или an — перед одним предметом, который упоминаете впервые (I bought a jacket), the — когда понятно, какой именно (The jacket is too small), ничего — перед общим множественным (I like dogs).',
      },
    },
    {
      id: 'question_forms', node: 'conversation.interaction', drill: 'drill.question_forms',
      name: { en: 'Asking questions', uz: 'Savol berish', ru: 'Построение вопросов' },
      explain: {
        en: 'Put the helper verb before the subject: Do you have…? Where is the station? What time does it open? Rising intonation alone ("You have a room?") sounds unsure in most situations.',
        uz: 'Yordamchi fe’lni egadan oldin qo‘ying: Do you have…? Where is the station? What time does it open? Faqat ohang bilan so‘rash («You have a room?») ko‘p vaziyatda ishonchsiz eshitiladi.',
        ru: 'Вспомогательный глагол ставится перед подлежащим: Do you have…? Where is the station? What time does it open? Вопрос только интонацией («You have a room?») в большинстве ситуаций звучит неуверенно.',
      },
    },
    {
      id: 'prepositions', node: 'conversation.accuracy', drill: 'drill.prepositions',
      name: { en: 'Prepositions of time and place', uz: 'Vaqt va joy predloglari', ru: 'Предлоги времени и места' },
      explain: {
        en: 'At for clock times and points (at 7, at the station), on for days and surfaces (on Monday, on the table), in for months, years and inside spaces (in May, in the car).',
        uz: 'Soat va nuqta uchun at (at 7, at the station), kunlar va sirt uchun on (on Monday, on the table), oy, yil va ichki joy uchun in (in May, in the car).',
        ru: 'At — для времени по часам и точек (at 7, at the station), on — для дней и поверхностей (on Monday, on the table), in — для месяцев, лет и внутренних пространств (in May, in the car).',
      },
    },
    {
      id: 'plurals', node: 'conversation.accuracy', drill: 'drill.plurals',
      name: { en: 'Plurals and countable nouns', uz: 'Ko‘plik va sanaladigan otlar', ru: 'Множественное число и исчисляемость' },
      explain: {
        en: 'After numbers and many use the plural (two tickets, many people). Some nouns are uncountable: advice, information, luggage, money — say some luggage, not luggages.',
        uz: 'Sonlar va many dan keyin ko‘plik ishlatiladi (two tickets, many people). Ba’zi otlar sanalmaydi: advice, information, luggage, money — some luggage deng, luggages emas.',
        ru: 'После чисел и many — множественное число (two tickets, many people). Некоторые существительные неисчисляемые: advice, information, luggage, money — some luggage, а не luggages.',
      },
    },
    {
      id: 'politeness', node: 'conversation.interaction', drill: 'drill.politeness',
      name: { en: 'Polite requests', uz: 'Muloyim iltimoslar', ru: 'Вежливые просьбы' },
      explain: {
        en: '"Give me a coffee" sounds rude in English even with a smile. Use Could I have…, Would you mind…, I’d like…, and add please and thanks.',
        uz: '«Give me a coffee» ingliz tilida tabassum bilan ham qo‘pol eshitiladi. Could I have…, Would you mind…, I’d like… ishlating va please hamda thanks qo‘shing.',
        ru: '«Give me a coffee» по-английски звучит грубо даже с улыбкой. Говорите Could I have…, Would you mind…, I’d like… и добавляйте please и thanks.',
      },
    },
    {
      id: 'false_friends', node: 'conversation.range', drill: 'drill.false_friends',
      name: { en: 'False friends', uz: 'Soxta do‘stlar (aldamchi so‘zlar)', ru: 'Ложные друзья переводчика' },
      explain: {
        en: 'Some English words look like Russian or Uzbek words but mean something else: magazine is a journal, not a shop; accurate means exact, not tidy; sympathetic means caring, not attractive.',
        uz: 'Ba’zi inglizcha so‘zlar ruscha yoki o‘zbekcha so‘zlarga o‘xshaydi, lekin boshqa ma’noni beradi: magazine — jurnal, do‘kon emas; accurate — aniq, ozoda emas; sympathetic — hamdard, yoqimtoy emas.',
        ru: 'Некоторые английские слова похожи на русские, но значат другое: magazine — журнал, а не магазин; accurate — точный, а не аккуратный; sympathetic — сочувствующий, а не симпатичный.',
      },
    },
    {
      id: 'word_order', node: 'conversation.accuracy', drill: 'drill.word_order',
      name: { en: 'Word order', uz: 'So‘z tartibi', ru: 'Порядок слов' },
      explain: {
        en: 'English keeps subject – verb – object: I really like this city, not "This city I really like". Adverbs like always and often go before the main verb: I always drink tea.',
        uz: 'Ingliz tilida tartib ega – fe’l – to‘ldiruvchi: I really like this city, «This city I really like» emas. Always, often kabi ravishlar asosiy fe’ldan oldin keladi: I always drink tea.',
        ru: 'В английском порядок «подлежащее – глагол – дополнение»: I really like this city, а не «This city I really like». Наречия always и often стоят перед основным глаголом: I always drink tea.',
      },
    },
  ],
  menu: [
    { action: 'today', emoji: '📅', label: { en: 'Today’s plan', uz: 'Bugungi reja', ru: 'План на сегодня' } },
    { action: 'roleplay', emoji: '🗣', label: { en: 'Role-play', uz: 'Rolli suhbat', ru: 'Ролевой диалог' } },
    { action: 'shadowing', emoji: '🔁', label: { en: 'Shadowing', uz: 'Takrorlash (shadowing)', ru: 'Шэдоуинг' } },
    { action: 'phrases', emoji: '🧠', label: { en: 'Phrase bank', uz: 'Iboralar banki', ru: 'Банк фраз' } },
    { action: 'drill', emoji: '🎯', label: { en: 'Fix my errors', uz: 'Xatolarimni tuzatish', ru: 'Работа над ошибками' } },
    { action: 'progress', emoji: '📈', label: { en: 'My progress', uz: 'Natijalarim', ru: 'Мой прогресс' } },
    { action: 'report', emoji: '🗓', label: { en: 'Fluency report', uz: 'Ravonlik hisoboti', ru: 'Отчёт о беглости' } },
    { action: 'plan', emoji: '🧭', label: { en: 'Goal and plan', uz: 'Maqsad va reja', ru: 'Цель и план' } },
    { action: 'settings', emoji: '⚙️', label: { en: 'Settings', uz: 'Sozlamalar', ru: 'Настройки' } },
    { action: 'help', emoji: '❓', label: { en: 'Help', uz: 'Yordam', ru: 'Помощь' } },
  ],
  commands: [
    { command: 'start', description: { en: 'Start or restart', uz: 'Boshlash', ru: 'Начать' } },
    { command: 'today', description: { en: 'Today’s plan', uz: 'Bugungi reja', ru: 'План на сегодня' } },
    { command: 'roleplay', description: { en: 'Start a role-play', uz: 'Rolli suhbatni boshlash', ru: 'Начать ролевой диалог' } },
    { command: 'shadowing', description: { en: 'Pronunciation shadowing', uz: 'Talaffuz mashqi', ru: 'Тренировка произношения' } },
    { command: 'phrases', description: { en: 'Review your phrase bank', uz: 'Iboralarni takrorlash', ru: 'Повторить фразы' } },
    { command: 'progress', description: { en: 'Level, fluency and streak', uz: 'Daraja, ravonlik, seriya', ru: 'Уровень, беглость, серия' } },
    { command: 'settings', description: { en: 'Language, correction mode, reminders', uz: 'Til, tuzatish rejimi, eslatmalar', ru: 'Язык, режим исправлений, напоминания' } },
    { command: 'help', description: { en: 'How it works', uz: 'Qanday ishlaydi', ru: 'Как это работает' } },
  ],
  explainInUiLanguageBelow: 3,
  correctionModes: ['gentle', 'strict'],
  accent: '#0f766e',
};
