import type { Diagnostic } from '../src/types.ts';

// The non-AI placement test: 27 auto-scored items (grammar, vocabulary, two short
// reading texts) plus can-do statements for the skills a quiz cannot measure.
// Items climb from band 4 to band 8 so the result places the learner on the
// pack scale; passRatio decides whether a level counts as reached.

const BIKE_SHARING =
  'Bike-sharing schemes now operate in many cities. Users unlock a bicycle with a phone app, ride it across town and leave it at another station. Supporters say the schemes reduce short car journeys and encourage exercise. However, early schemes often struggled. Bicycles were stolen or damaged, and in some cities the stations in the centre were always empty in the morning, while those in the suburbs were full. Operators now use vans to move bicycles to where they are needed, and some charge lower prices for journeys that end at a station that is running short of bicycles. Surveys suggest that most users are commuters rather than tourists, although tourists make more journeys at weekends.';

const PLANNING_FALLACY =
  'Most people underestimate how long their own tasks will take, even when they know that similar tasks have overrun in the past. Psychologists call this the planning fallacy. Interestingly, people are far more accurate when they predict how long a task will take someone else. One explanation is that, when we plan our own work, we imagine a single, smooth sequence of steps and ignore the interruptions and setbacks that experience should lead us to expect. When we judge others, by contrast, we tend to rely on how long such tasks usually take. Simply asking people to recall past delays does little to improve their forecasts; what helps more is breaking a project into small parts and estimating each one separately, or deliberately comparing it with similar projects completed before.';

export const diagnostic: Diagnostic = {
  intro: {
    en: 'This placement test takes about 8 minutes: grammar, vocabulary, two short reading texts and a few questions about what you can already do in Speaking, Writing and Listening. It is scored automatically, without AI. The result is an estimate of your current level to start your plan, not an official IELTS score, and the coach updates it as you practise.',
    uz: 'Bu daraja testi taxminan 8 daqiqa davom etadi: grammatika, lug‘at, o‘qish uchun ikkita qisqa matn va Speaking, Writing hamda Listening bo‘yicha hozir nimalarni qila olishingiz haqida bir nechta savol. Test AI ishtirokisiz, avtomatik baholanadi. Natija — rejangizni boshlash uchun hozirgi darajangizning taxminiy bahosi, rasmiy IELTS balli emas; murabbiy uni mashq qilganingiz sari yangilab boradi.',
    ru: 'Этот тест уровня займёт около 8 минут: грамматика, лексика, два коротких текста для чтения и несколько вопросов о том, что вы уже умеете в Speaking, Writing и Listening. Он оценивается автоматически, без ИИ. Результат — примерная оценка вашего текущего уровня для старта плана, а не официальный балл IELTS; коуч будет уточнять его по мере ваших занятий.',
  },
  minutes: 8,
  passRatio: 0.6,
  items: [
    // --- Grammar (9) ---------------------------------------------------------------------------
    {
      id: 'g1', skill: 'grammar', level: 4, kind: 'question',
      prompt: 'My brother ____ in a bank in the city centre.',
      options: ['work', 'works', 'is work', 'working'],
      answer: 1,
    },
    {
      id: 'g2', skill: 'grammar', level: 4, kind: 'question',
      prompt: 'She wants to become ____ engineer after university.',
      options: ['a', 'an', 'the', 'no article'],
      answer: 1,
    },
    {
      id: 'g3', skill: 'grammar', level: 5, kind: 'question',
      prompt: 'I ____ in this city since 2019.',
      options: ['live', 'am living', 'have lived', 'lived'],
      answer: 2,
    },
    {
      id: 'g4', skill: 'grammar', level: 5, kind: 'question',
      prompt: 'If it ____ tomorrow, we will cancel the trip.',
      options: ['will rain', 'rains', 'rained', 'would rain'],
      answer: 1,
    },
    {
      id: 'g5', skill: 'grammar', level: 6, kind: 'question',
      prompt: 'The number of students who study abroad ____ every year.',
      options: ['increase', 'are increasing', 'increases', 'have increased'],
      answer: 2,
    },
    {
      id: 'g6', skill: 'grammar', level: 6, kind: 'question',
      prompt: 'The new bridge, ____ opened last year, has reduced traffic in the centre.',
      options: ['that', 'which', 'what', 'who'],
      answer: 1,
    },
    {
      id: 'g7', skill: 'grammar', level: 7, kind: 'question',
      prompt: 'If the city ____ in public transport twenty years ago, it would not have such serious traffic problems today.',
      options: ['invested', 'had invested', 'would invest', 'has invested'],
      answer: 1,
    },
    {
      id: 'g8', skill: 'grammar', level: 7, kind: 'question',
      prompt: 'Not only ____ the cost of living, but it has also reduced the quality of housing.',
      options: ['the policy has raised', 'has the policy raised', 'the policy raised', 'did the policy raised'],
      answer: 1,
    },
    {
      id: 'g9', skill: 'grammar', level: 8, kind: 'question',
      prompt: 'Had the warning ____ more seriously, far fewer homes would have been damaged.',
      options: ['taken', 'been taken', 'be taken', 'was taken'],
      answer: 1,
    },

    // --- Vocabulary (6) ------------------------------------------------------------------------
    {
      id: 'v1', skill: 'vocabulary', level: 4, kind: 'question',
      prompt: 'I usually ____ my homework after dinner.',
      options: ['make', 'do', 'take', 'have'],
      answer: 1,
    },
    {
      id: 'v2', skill: 'vocabulary', level: 5, kind: 'question',
      prompt: 'Air pollution has a serious ____ on people’s health.',
      options: ['affect', 'effect', 'result', 'reason'],
      answer: 1,
    },
    {
      id: 'v3', skill: 'vocabulary', level: 6, kind: 'question',
      prompt: 'A ____ lifestyle, with very little physical activity, increases the risk of heart disease.',
      options: ['sedentary', 'stationary', 'static', 'settled'],
      answer: 0,
    },
    {
      id: 'v4', skill: 'vocabulary', level: 6, kind: 'question',
      prompt: 'Many young parents find it hard to ____ a balance between work and family life.',
      options: ['make', 'strike', 'put', 'take'],
      answer: 1,
    },
    {
      id: 'v5', skill: 'vocabulary', level: 7, kind: 'question',
      prompt: 'Rather than solving the housing shortage, the scheme merely ____ it by encouraging property speculation.',
      options: ['exacerbated', 'alleviated', 'deteriorated', 'eradicated'],
      answer: 0,
    },
    {
      id: 'v6', skill: 'vocabulary', level: 8, kind: 'question',
      prompt: 'The minister’s statement was deliberately ____, so that both sides could claim she supported them.',
      options: ['ambivalent', 'ambiguous', 'ambitious', 'unanimous'],
      answer: 1,
    },

    // --- Reading (6, two passages) -------------------------------------------------------------
    {
      id: 'r1', skill: 'reading', level: 5, kind: 'question', passage: BIKE_SHARING,
      prompt: 'What do users need in order to unlock a bicycle?',
      options: ['A key from the station', 'A phone app', 'A ticket from a van driver', 'A membership card'],
      answer: 1,
    },
    {
      id: 'r2', skill: 'reading', level: 6, kind: 'question', passage: BIKE_SHARING,
      prompt: 'Why do some operators charge less for certain journeys?',
      options: [
        'To attract more tourists at weekends',
        'To get bicycles returned to stations that need them',
        'To reduce the number of stolen bicycles',
        'To encourage people to exercise more',
      ],
      answer: 1,
    },
    {
      id: 'r3', skill: 'reading', level: 6, kind: 'question', passage: BIKE_SHARING,
      prompt: 'Which statement agrees with the text?',
      options: [
        'Most users of the schemes are tourists.',
        'Early schemes had problems with theft and with where bicycles ended up.',
        'Suburban stations were usually empty in the morning.',
        'Bike-sharing has ended short car journeys in these cities.',
      ],
      answer: 1,
    },
    {
      id: 'r4', skill: 'reading', level: 7, kind: 'question', passage: PLANNING_FALLACY,
      prompt: 'What does the writer find interesting about the planning fallacy?',
      options: [
        'People predict other people’s tasks better than their own.',
        'People forget that similar tasks have overrun before.',
        'Experts make the same mistakes as everyone else.',
        'Most tasks take less time than people expect.',
      ],
      answer: 0,
    },
    {
      id: 'r5', skill: 'reading', level: 7, kind: 'question', passage: PLANNING_FALLACY,
      prompt: 'According to one explanation, why do people misjudge their own tasks?',
      options: [
        'They rely too much on how long such tasks usually take.',
        'They picture an ideal sequence of steps with no problems.',
        'They are unwilling to admit their past mistakes.',
        'They try to plan too many tasks at the same time.',
      ],
      answer: 1,
    },
    {
      id: 'r6', skill: 'reading', level: 8, kind: 'question', passage: PLANNING_FALLACY,
      prompt: 'Which method does the text suggest is LEAST effective at improving forecasts?',
      options: [
        'Dividing a project into smaller parts',
        'Comparing a project with similar earlier ones',
        'Remembering delays from previous projects',
        'Estimating each stage separately',
      ],
      answer: 2,
    },

    // --- Can-do self-assessment (6) --------------------------------------------------------------
    {
      id: 'c1', skill: 'speaking', level: 5, kind: 'can_do',
      prompt: {
        en: 'I can answer simple questions about my home, studies or work with a reason or an example, not just one word.',
        uz: 'Uyim, o‘qishim yoki ishim haqidagi oddiy savollarga bir so‘z bilan emas, sabab yoki misol keltirib javob bera olaman.',
        ru: 'Я могу ответить на простые вопросы о доме, учёбе или работе не одним словом, а с причиной или примером.',
      },
    },
    {
      id: 'c2', skill: 'speaking', level: 6, kind: 'can_do',
      prompt: {
        en: 'I can talk for two minutes about a familiar topic without long pauses.',
        uz: 'Tanish mavzuda uzoq pauzalarsiz ikki daqiqa gapira olaman.',
        ru: 'Я могу две минуты говорить на знакомую тему без долгих пауз.',
      },
    },
    {
      id: 'c3', skill: 'speaking', level: 7, kind: 'can_do',
      prompt: {
        en: 'I can discuss abstract questions, such as how technology changes society, compare different views and justify my own.',
        uz: 'Texnologiya jamiyatni qanday o‘zgartirishi kabi mavhum savollarni muhokama qila, turli qarashlarni solishtira va o‘z fikrimni asoslay olaman.',
        ru: 'Я могу обсуждать абстрактные вопросы, например, как технологии меняют общество, сравнивать разные точки зрения и обосновывать свою.',
      },
    },
    {
      id: 'c4', skill: 'writing', level: 6, kind: 'can_do',
      prompt: {
        en: 'I can write a 250-word essay in 40 minutes with a clear opinion and paragraphs that each develop one main idea.',
        uz: '40 daqiqada aniq fikr bildirilgan va har bir paragraf bitta asosiy g‘oyani rivojlantiradigan 250 so‘zlik insho yoza olaman.',
        ru: 'Я могу за 40 минут написать эссе на 250 слов с ясной позицией и абзацами, каждый из которых развивает одну главную мысль.',
      },
    },
    {
      id: 'c5', skill: 'writing', level: 7, kind: 'can_do',
      prompt: {
        en: 'I can support every idea in an essay with explanation and examples, using varied vocabulary and complex sentences with only occasional errors.',
        uz: 'Inshodagi har bir g‘oyani tushuntirish va misollar bilan asoslay olaman, bunda xilma-xil lug‘at va murakkab gaplardan kamdan-kam xato bilan foydalanaman.',
        ru: 'Я могу подкрепить каждую мысль в эссе объяснением и примерами, используя разнообразную лексику и сложные предложения лишь с редкими ошибками.',
      },
    },
    {
      id: 'c6', skill: 'listening', level: 6, kind: 'can_do',
      prompt: {
        en: 'I can follow a short talk or lecture in English and note down its main points and key details.',
        uz: 'Ingliz tilidagi qisqa nutq yoki ma’ruzani tushunib, uning asosiy fikrlari va muhim tafsilotlarini yozib ola olaman.',
        ru: 'Я могу понять короткое выступление или лекцию на английском и записать основные мысли и ключевые детали.',
      },
    },
  ],
};
