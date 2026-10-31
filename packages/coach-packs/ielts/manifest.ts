import type { PackManifest } from '../src/types.ts';

// B1 IELTS Coach. Skill nodes and error tags here are referenced by every other file
// in this pack: rubric criteria move the criterion nodes, question types move the
// reading and listening nodes, and each error tag has its drill in drills.ts.

export const manifest: PackManifest = {
  id: 'ielts',
  feature: 'B1',
  version: '1.0.0',
  name: { en: 'IELTS Coach', uz: 'IELTS murabbiyi', ru: 'IELTS-коуч' },
  tagline: {
    en: 'An examiner-style IELTS coach in Telegram: estimated bands backed by evidence and a plan to your exam date.',
    uz: 'Telegramda imtihonchi kabi baholaydigan IELTS murabbiyi: dalilli taxminiy ballar va imtihon kuningizgacha reja.',
    ru: 'IELTS-коуч в Telegram, который оценивает как экзаменатор: примерные баллы с цитатами и план до даты экзамена.',
  },
  description: {
    en: 'Speaking Parts 1–3 over voice messages with real timing: an estimated band per criterion backed by quotes from your own words, fluency numbers and "say it better" upgrades you re-record. Writing Task 1 and 2 by photo or text with an essay ladder and drills on your recurring errors. Daily timed Reading and Listening mini-sets with strategy by question type, topic vocabulary with spaced repetition, and a weekly mock.',
    uz: 'Speaking 1–3-qismlar ovozli xabarlar orqali, imtihondagidek vaqt bilan: har bir mezon bo‘yicha taxminiy ball va o‘z gaplaringizdan iqtiboslar, ravonlik ko‘rsatkichlari va qayta yozib olinadigan «yaxshiroq ayting» variantlari. Writing Task 1 va 2 surat yoki matn orqali, insho zinapoyasi va takrorlanuvchi xatolaringiz bo‘yicha mashqlar. Har kuni vaqt belgilangan Reading va Listening mini-to‘plamlari, savol turi bo‘yicha strategiya, oraliq takrorlash bilan mavzuli lug‘at va haftalik sinov imtihoni.',
    ru: 'Speaking, части 1–3, голосовыми сообщениями с таймингом, как на экзамене: примерный балл по каждому критерию с цитатами из ваших же слов, показатели беглости и варианты «Как сказать лучше», которые можно перезаписать. Writing Task 1 и 2 фото или текстом, «лестница» эссе и упражнения на ваши повторяющиеся ошибки. Ежедневные мини-наборы Reading и Listening на время со стратегией по типу вопроса, тематическая лексика с интервальным повторением и еженедельный пробный экзамен.',
  },
  uiLanguages: ['uz', 'ru', 'en'],
  practiceLanguage: 'en',
  audience: {
    description: {
      en: 'Learners preparing for IELTS Academic or General Training, from band 4.5 to 8.0.',
      uz: 'IELTS Academic yoki General Training’ga tayyorlanayotganlar, 4.5 balldan 8.0 ballgacha.',
      ru: 'Те, кто готовится к IELTS Academic или General Training, с балла 4.5 до 8.0.',
    },
    minAge: 14,
    levels: [4, 8.5],
  },
  scale: { id: 'ielts_band', min: 1, max: 9, step: 0.5, decimals: 1 },
  skills: [
    { id: 'speaking', name: { en: 'Speaking', uz: 'Speaking', ru: 'Speaking' }, weight: 1 },
    { id: 'speaking.fluency_coherence', parent: 'speaking', name: { en: 'Fluency and coherence', uz: 'Ravonlik va izchillik', ru: 'Беглость и связность' } },
    { id: 'speaking.lexical_resource', parent: 'speaking', name: { en: 'Speaking vocabulary', uz: 'Nutqdagi lug‘at', ru: 'Лексика в речи' } },
    { id: 'speaking.grammar', parent: 'speaking', name: { en: 'Speaking grammar', uz: 'Nutqdagi grammatika', ru: 'Грамматика в речи' } },
    { id: 'speaking.pronunciation', parent: 'speaking', name: { en: 'Pronunciation', uz: 'Talaffuz', ru: 'Произношение' } },
    { id: 'writing', name: { en: 'Writing', uz: 'Writing', ru: 'Writing' }, weight: 1 },
    { id: 'writing.task1', parent: 'writing', name: { en: 'Task 1', uz: 'Task 1', ru: 'Task 1' } },
    { id: 'writing.task2', parent: 'writing', name: { en: 'Task 2', uz: 'Task 2', ru: 'Task 2' } },
    { id: 'writing.task_fulfilment', parent: 'writing', name: { en: 'Answering the task', uz: 'Topshiriqqa javob', ru: 'Выполнение задания' } },
    { id: 'writing.coherence', parent: 'writing', name: { en: 'Organisation and linking', uz: 'Tuzilish va bog‘lanish', ru: 'Структура и связность' } },
    { id: 'writing.lexical_resource', parent: 'writing', name: { en: 'Writing vocabulary', uz: 'Yozuvdagi lug‘at', ru: 'Лексика в письме' } },
    { id: 'writing.grammar', parent: 'writing', name: { en: 'Writing grammar', uz: 'Yozuvdagi grammatika', ru: 'Грамматика в письме' } },
    { id: 'reading', name: { en: 'Reading', uz: 'Reading', ru: 'Reading' }, weight: 1 },
    { id: 'reading.tfng', parent: 'reading', name: { en: 'True / False / Not Given', uz: 'True / False / Not Given', ru: 'True / False / Not Given' } },
    { id: 'reading.matching', parent: 'reading', name: { en: 'Matching headings and information', uz: 'Sarlavha va ma’lumotni moslash', ru: 'Сопоставление заголовков и информации' } },
    { id: 'reading.completion', parent: 'reading', name: { en: 'Completion questions', uz: 'To‘ldirish savollari', ru: 'Вопросы на заполнение' } },
    { id: 'reading.choice', parent: 'reading', name: { en: 'Multiple choice', uz: 'Ko‘p tanlovli savollar', ru: 'Множественный выбор' } },
    { id: 'listening', name: { en: 'Listening', uz: 'Listening', ru: 'Listening' }, weight: 1 },
    { id: 'listening.form', parent: 'listening', name: { en: 'Form and note completion', uz: 'Shakl va qaydlarni to‘ldirish', ru: 'Заполнение форм и заметок' } },
    { id: 'listening.choice', parent: 'listening', name: { en: 'Multiple choice', uz: 'Ko‘p tanlovli savollar', ru: 'Множественный выбор' } },
    { id: 'listening.matching', parent: 'listening', name: { en: 'Matching', uz: 'Moslashtirish', ru: 'Сопоставление' } },
    { id: 'vocabulary', name: { en: 'Topic vocabulary', uz: 'Mavzuli lug‘at', ru: 'Тематическая лексика' }, weight: 0.6 },
    { id: 'grammar', name: { en: 'Grammar accuracy', uz: 'Grammatik aniqlik', ru: 'Грамматическая точность' }, weight: 0.6 },
  ],
  errorTags: [
    {
      id: 'articles', node: 'grammar', drill: 'drill.articles',
      name: { en: 'Articles (a, an, the)', uz: 'Artikllar (a, an, the)', ru: 'Артикли (a, an, the)' },
      explain: {
        en: 'Use a/an the first time you mention one countable thing, the when both of you know which one, and no article for general plurals and uncountables (Pollution affects cities).',
        uz: 'Bitta sanaladigan narsani birinchi marta aytganda a/an, ikkalangiz ham qaysi biri ekanini bilganda the ishlating. Umumiy ma’nodagi ko‘plik va sanalmaydigan otlar oldida artikl kerak emas (Pollution affects cities).',
        ru: 'A/an — когда впервые упоминаете один исчисляемый предмет, the — когда обоим понятно, о каком идёт речь. Перед множественным числом и неисчисляемыми существительными в общем значении артикль не нужен (Pollution affects cities).',
      },
    },
    {
      id: 'subject_verb_agreement', node: 'grammar', drill: 'drill.subject_verb_agreement',
      name: { en: 'Subject–verb agreement', uz: 'Ega va kesim moslashuvi', ru: 'Согласование подлежащего и сказуемого' },
      explain: {
        en: 'A singular subject takes a singular verb (The number of cars is rising), even when a plural noun sits between them.',
        uz: 'Birlikdagi ega birlikdagi kesim bilan keladi (The number of cars is rising), orada ko‘plikdagi ot turgan bo‘lsa ham.',
        ru: 'Подлежащее в единственном числе требует глагола в единственном числе (The number of cars is rising), даже если между ними стоит существительное во множественном числе.',
      },
    },
    {
      id: 'verb_tense', node: 'grammar', drill: 'drill.verb_tense',
      name: { en: 'Verb tenses', uz: 'Fe’l zamonlari', ru: 'Времена глаголов' },
      explain: {
        en: 'Stick to one time frame: past simple for finished times (in 2010), present perfect for experience up to now, present simple for facts and habits.',
        uz: 'Bir zamon doirasidan chiqmang: tugagan vaqt uchun past simple (in 2010), hozirgacha bo‘lgan tajriba uchun present perfect, faktlar va odatlar uchun present simple.',
        ru: 'Держите одну временную рамку: past simple для завершённого времени (in 2010), present perfect для опыта до настоящего момента, present simple для фактов и привычек.',
      },
    },
    {
      id: 'prepositions', node: 'grammar', drill: 'drill.prepositions',
      name: { en: 'Prepositions', uz: 'Predloglar', ru: 'Предлоги' },
      explain: {
        en: 'Many prepositions are fixed with the word before them: rise by 10%, rise to 40%, interested in, depend on, at the weekend / on weekdays.',
        uz: 'Ko‘p predloglar oldidagi so‘zga bog‘liq, shuning uchun ularni birga yodlang: rise by 10%, rise to 40%, interested in, depend on, at the weekend / on weekdays.',
        ru: 'Многие предлоги закреплены за словом перед ними: rise by 10%, rise to 40%, interested in, depend on, at the weekend / on weekdays.',
      },
    },
    {
      id: 'word_form', node: 'writing.lexical_resource', drill: 'drill.word_form',
      name: { en: 'Word forms', uz: 'So‘z shakllari', ru: 'Формы слов' },
      explain: {
        en: 'Pick the right part of speech for the slot: an adjective before a noun (economic growth), an adverb with a verb (grew rapidly), a noun after an article (the importance).',
        uz: 'Joyga mos so‘z turkumini tanlang: ot oldida sifat (economic growth), fe’l bilan ravish (grew rapidly), artikldan keyin ot (the importance).',
        ru: 'Выбирайте нужную часть речи: прилагательное перед существительным (economic growth), наречие с глаголом (grew rapidly), существительное после артикля (the importance).',
      },
    },
    {
      id: 'countable_nouns', node: 'grammar', drill: 'drill.countable_nouns',
      name: { en: 'Countable and uncountable nouns', uz: 'Sanaladigan va sanalmaydigan otlar', ru: 'Исчисляемые и неисчисляемые существительные' },
      explain: {
        en: 'Information, advice, research, equipment and evidence have no plural: say much information, a piece of advice, less traffic, fewer cars.',
        uz: 'Information, advice, research, equipment va evidence ko‘plik shakliga ega emas: much information, a piece of advice, less traffic, fewer cars deng.',
        ru: 'У information, advice, research, equipment и evidence нет множественного числа: much information, a piece of advice, less traffic, fewer cars.',
      },
    },
    {
      id: 'sentence_boundaries', node: 'writing.grammar', drill: 'drill.sentence_boundaries',
      name: { en: 'Run-on sentences and fragments', uz: 'Qo‘shilib ketgan va chala gaplar', ru: 'Слитные и незаконченные предложения' },
      explain: {
        en: 'Two full sentences need a full stop, a semicolon or a linking word between them, not just a comma. A clause starting with because or which cannot stand alone.',
        uz: 'Ikki to‘liq gap orasida faqat vergul emas, nuqta, nuqtali vergul yoki bog‘lovchi bo‘lishi kerak. Because yoki which bilan boshlanuvchi qism alohida gap bo‘la olmaydi.',
        ru: 'Между двумя полными предложениями нужна точка, точка с запятой или союз, а не просто запятая. Часть, начинающаяся с because или which, не может стоять отдельно.',
      },
    },
    {
      id: 'linking_words', node: 'writing.coherence', drill: 'drill.linking_words',
      name: { en: 'Linking words', uz: 'Bog‘lovchi so‘zlar', ru: 'Слова-связки' },
      explain: {
        en: 'Use a linker only when it fits the logic (however = contrast, therefore = result) and do not start every sentence with one; referencing words (this, such, these changes) link ideas more naturally.',
        uz: 'Bog‘lovchini faqat mantiqqa mos kelganda ishlating (however = qarama-qarshilik, therefore = natija) va har gapni u bilan boshlamang; this, such, these changes kabi so‘zlar g‘oyalarni tabiiyroq bog‘laydi.',
        ru: 'Связку ставьте, только когда она соответствует логике (however — противопоставление, therefore — следствие), и не начинайте с неё каждое предложение; слова this, such, these changes связывают мысли естественнее.',
      },
    },
    {
      id: 'collocations', node: 'writing.lexical_resource', drill: 'drill.collocations',
      name: { en: 'Word partners (collocations)', uz: 'So‘z birikmalari (kollokatsiyalar)', ru: 'Сочетаемость слов (коллокации)' },
      explain: {
        en: 'Some words simply go together: make a decision, do research, heavy rain, a sharp rise, pay attention. Translating word by word often breaks these pairs.',
        uz: 'Ba’zi so‘zlar doim birga keladi: make a decision, do research, heavy rain, a sharp rise, pay attention. So‘zma-so‘z tarjima ko‘pincha bu juftlarni buzadi.',
        ru: 'Некоторые слова просто сочетаются: make a decision, do research, heavy rain, a sharp rise, pay attention. Дословный перевод часто ломает эти пары.',
      },
    },
    {
      id: 'register', node: 'writing.lexical_resource', drill: 'drill.register',
      name: { en: 'Formal and informal style', uz: 'Rasmiy va norasmiy uslub', ru: 'Формальный и неформальный стиль' },
      explain: {
        en: 'Academic writing avoids contractions (don’t), informal words (kids, a lot of stuff) and direct questions to the reader; speaking can be more relaxed but should stay clear.',
        uz: 'Akademik yozuvda qisqartmalar (don’t), so‘zlashuv so‘zlari (kids, a lot of stuff) va o‘qiyotgan kishiga to‘g‘ridan-to‘g‘ri savollar ishlatilmaydi; og‘zaki nutq erkinroq bo‘lishi mumkin, lekin aniq bo‘lsin.',
        ru: 'В академическом письме нет сокращений (don’t), разговорных слов (kids, a lot of stuff) и прямых вопросов читателю; устная речь может быть свободнее, но должна оставаться ясной.',
      },
    },
    {
      id: 'underdeveloped_answers', node: 'speaking.fluency_coherence', drill: 'drill.underdeveloped_answers',
      name: { en: 'Short, undeveloped answers', uz: 'Qisqa, rivojlantirilmagan javoblar', ru: 'Короткие неразвёрнутые ответы' },
      explain: {
        en: 'Answer, then add a reason and an example or a contrast (Answer → Because → For example). In Part 1 aim for two or three sentences; in Part 3 develop and compare.',
        uz: 'Javob bering, keyin sabab va misol yoki qarama-qarshilik qo‘shing (Javob → Chunki → Masalan). 1-qismda ikki-uch gap ayting, 3-qismda esa fikrni rivojlantiring va solishtiring.',
        ru: 'Ответьте, затем добавьте причину и пример или контраст (Ответ → Потому что → Например). В части 1 — два-три предложения, в части 3 — развивайте мысль и сравнивайте.',
      },
    },
  ],
  menu: [
    { action: 'today', emoji: '📅', label: { en: 'Today’s plan', uz: 'Bugungi reja', ru: 'План на сегодня' } },
    { action: 'mock', emoji: '🎙', label: { en: 'Speaking mock', uz: 'Speaking sinovi', ru: 'Пробный Speaking' } },
    { action: 'speaking', emoji: '🗣', label: { en: 'Speaking practice', uz: 'Speaking mashqi', ru: 'Практика Speaking' } },
    { action: 'writing', emoji: '✍️', label: { en: 'Writing', uz: 'Writing', ru: 'Writing' } },
    { action: 'reading', emoji: '📖', label: { en: 'Reading set', uz: 'Reading to‘plami', ru: 'Набор Reading' } },
    { action: 'listening', emoji: '🎧', label: { en: 'Listening set', uz: 'Listening to‘plami', ru: 'Набор Listening' } },
    { action: 'vocab', emoji: '🧠', label: { en: 'Vocabulary quiz', uz: 'Lug‘at testi', ru: 'Тест по лексике' } },
    { action: 'drill', emoji: '🎯', label: { en: 'Fix my errors', uz: 'Xatolarimni tuzatish', ru: 'Работа над ошибками' } },
    { action: 'progress', emoji: '📈', label: { en: 'My progress', uz: 'Natijalarim', ru: 'Мой прогресс' } },
    { action: 'report', emoji: '🗓', label: { en: 'Weekly report', uz: 'Haftalik hisobot', ru: 'Еженедельный отчёт' } },
    { action: 'plan', emoji: '🧭', label: { en: 'Goal and plan', uz: 'Maqsad va reja', ru: 'Цель и план' } },
    { action: 'settings', emoji: '⚙️', label: { en: 'Settings', uz: 'Sozlamalar', ru: 'Настройки' } },
    { action: 'help', emoji: '❓', label: { en: 'Help', uz: 'Yordam', ru: 'Помощь' } },
  ],
  commands: [
    { command: 'start', description: { en: 'Start or restart the coach', uz: 'Murabbiyni boshlash', ru: 'Запустить коуча' } },
    { command: 'today', description: { en: 'Today’s plan', uz: 'Bugungi reja', ru: 'План на сегодня' } },
    { command: 'mock', description: { en: 'Full speaking mock (Parts 1–3)', uz: 'To‘liq Speaking sinovi (1–3-qismlar)', ru: 'Полный пробный Speaking (части 1–3)' } },
    { command: 'speaking', description: { en: 'Practise one speaking part', uz: 'Bitta Speaking qismini mashq qilish', ru: 'Практика одной части Speaking' } },
    { command: 'writing', description: { en: 'Get a writing task scored', uz: 'Writing topshirig‘ini baholatish', ru: 'Проверить письменную работу' } },
    { command: 'reading', description: { en: 'Timed reading mini-set', uz: 'Vaqtli Reading mini-to‘plami', ru: 'Мини-набор Reading на время' } },
    { command: 'listening', description: { en: 'Timed listening mini-set', uz: 'Vaqtli Listening mini-to‘plami', ru: 'Мини-набор Listening на время' } },
    { command: 'vocab', description: { en: 'Vocabulary quiz', uz: 'Lug‘at testi', ru: 'Тест по лексике' } },
    { command: 'progress', description: { en: 'Bands, mastery and streak', uz: 'Ballar, o‘zlashtirish va seriya', ru: 'Баллы, прогресс и серия' } },
    { command: 'settings', description: { en: 'Language, reminders, goal', uz: 'Til, eslatmalar, maqsad', ru: 'Язык, напоминания, цель' } },
    { command: 'help', description: { en: 'How the coach works', uz: 'Murabbiy qanday ishlaydi', ru: 'Как работает коуч' } },
  ],
  accent: '#1d4ed8',
};
