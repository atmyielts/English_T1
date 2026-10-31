import type { Diagnostic } from '../src/types.ts';

// A six-minute, auto-scored placement: grammar and phrase questions from A2 to C1,
// two "most natural reply" questions, and can-do statements for fluency and
// interaction (which a multiple-choice test cannot measure on its own). It gives a
// starting estimate; the first scored role-plays refine it.

export const diagnostic: Diagnostic = {
  intro: {
    en: 'A quick level check: about 6 minutes, 24 short questions and statements about what you can do. No AI and no recording — just tap your answers. The result is an estimate of your speaking level; your first role-plays will make it precise.',
    uz: 'Darajani tez aniqlash: taxminan 6 daqiqa, 24 ta qisqa savol va nimalarni qila olishingiz haqidagi fikrlar. Sun’iy intellekt ham, ovoz yozish ham yo‘q — shunchaki javoblarni tanlang. Natija nutq darajangizning taxminiy bahosi; birinchi rolli suhbatlaringiz uni aniqlashtiradi.',
    ru: 'Быстрая проверка уровня: около 6 минут, 24 коротких вопроса и утверждения о том, что вы умеете. Без ИИ и без записи голоса — просто выбирайте ответы. Результат — примерная оценка вашего разговорного уровня; первые ролевые диалоги её уточнят.',
  },
  minutes: 6,
  passRatio: 0.6,
  items: [
    // Grammar accuracy, A2 → C1.
    { id: 'g1', skill: 'conversation.accuracy', level: 2, kind: 'question', prompt: 'Choose the correct sentence.', options: ['I am a student.', 'I student.', 'I am student.'], answer: 0 },
    { id: 'g2', skill: 'conversation.accuracy', level: 2, kind: 'question', prompt: 'Choose the right word: My sister ___ in a bank.', options: ['work', 'works', 'working'], answer: 1 },
    { id: 'g3', skill: 'conversation.accuracy', level: 3, kind: 'question', prompt: 'Choose the right words: I ___ to Samarkand three times.', options: ['have been', 'was been', 'have went', 'am being'], answer: 0 },
    { id: 'g4', skill: 'conversation.accuracy', level: 3, kind: 'question', prompt: 'Choose the right words: Excuse me, where ___ a bus ticket?', options: ['I can buy', 'can I buy', 'I buy can', 'can buy I'], answer: 1 },
    { id: 'g5', skill: 'conversation.accuracy', level: 4, kind: 'question', prompt: 'Choose the right word: If I ___ more time, I’d learn to drive.', options: ['have', 'had', 'would have', 'will have'], answer: 1 },
    { id: 'g6', skill: 'conversation.accuracy', level: 4, kind: 'question', prompt: 'Choose the right words: The meeting ___ because the manager was ill.', options: ['was cancelled', 'cancelled itself', 'has cancel', 'was cancel'], answer: 0 },
    { id: 'g7', skill: 'conversation.accuracy', level: 5, kind: 'question', prompt: 'Choose the right words: I wish I ___ the tickets earlier — now they’re sold out.', options: ['bought', 'had bought', 'would buy', 'have bought'], answer: 1 },
    { id: 'g8', skill: 'conversation.accuracy', level: 5, kind: 'question', prompt: 'Choose the right words: Hardly ___ the station when the train left.', options: ['I had reached', 'had I reached', 'I reached', 'did I reached'], answer: 1 },

    // Vocabulary and phrase range, A2 → C1.
    { id: 'v1', skill: 'conversation.range', level: 2, kind: 'question', prompt: 'Choose the best word: Can I pay by ___?', options: ['card', 'map', 'key'], answer: 0 },
    { id: 'v2', skill: 'conversation.range', level: 3, kind: 'question', prompt: 'Choose the best word: I’d like to ___ an appointment with the doctor.', options: ['make', 'do', 'take', 'give'], answer: 0 },
    { id: 'v3', skill: 'conversation.range', level: 3, kind: 'question', prompt: 'Your new shoes broke after a week, and you want your money back. What do you ask for?', options: ['A refund.', 'A receipt.', 'A recipe.', 'A reward.'], answer: 0 },
    { id: 'v4', skill: 'conversation.range', level: 4, kind: 'question', prompt: 'Choose the best word: Our flight was ___ because of fog, so we waited for five hours.', options: ['delayed', 'late-arrived', 'slowed', 'postponed for'], answer: 0 },
    { id: 'v5', skill: 'conversation.range', level: 4, kind: 'question', prompt: 'Choose the best word: If we lose two people, I’m not sure we can ___ the deadline.', options: ['meet', 'reach to', 'catch', 'arrive'], answer: 0 },
    { id: 'v6', skill: 'conversation.range', level: 5, kind: 'question', prompt: 'Choose the best word: It was expensive, but we had to bite the ___ and buy a new laptop.', options: ['bullet', 'apple', 'money', 'price'], answer: 0 },

    // Interaction: the most natural reply.
    {
      id: 'i1', skill: 'conversation.interaction', level: 3, kind: 'question', prompt: 'What is the most natural reply?',
      passage: 'Barista: I’m afraid we’ve run out of oat milk today.',
      options: ['Oh, OK. Could I have it with normal milk, then?', 'Why not? Bring oat milk.', 'Yes, I am agree.'], answer: 0,
    },
    {
      id: 'i2', skill: 'conversation.interaction', level: 4, kind: 'question', prompt: 'What is the most natural reply?',
      passage: 'Manager: I’m not sure about Friday off — it’s a really busy week for us.',
      options: ['I understand. What if I finish the report on Thursday and Dilshod covers my emails?', 'OK, but I will not come on Friday anyway.', 'It’s not my problem that the week is busy.', 'Fine. Then give me Monday.'], answer: 0,
    },

    // Can-do statements: fluency and interaction, A2 → C1.
    {
      id: 'c1', skill: 'conversation.fluency', level: 2, kind: 'can_do',
      prompt: {
        en: 'I can answer simple questions about myself — my name, work, family — in short sentences, without long stops.',
        uz: 'Men o‘zim haqimdagi oddiy savollarga — ismim, ishim, oilam — qisqa gaplar bilan, uzoq to‘xtamasdan javob bera olaman.',
        ru: 'Я могу коротко отвечать на простые вопросы о себе — имя, работа, семья — без долгих пауз.',
      },
    },
    {
      id: 'c2', skill: 'conversation.interaction', level: 2, kind: 'can_do',
      prompt: {
        en: 'I can order food or buy a ticket with phrases like “Could I have…?” and understand the simple questions I am asked.',
        uz: 'Men «Could I have…?» kabi iboralar bilan ovqat buyurtma qila yoki chipta ola olaman va menga beriladigan oddiy savollarni tushunaman.',
        ru: 'Я могу заказать еду или купить билет с помощью фраз вроде «Could I have…?» и понимаю простые вопросы, которые мне задают.',
      },
    },
    {
      id: 'c3', skill: 'conversation.fluency', level: 3, kind: 'can_do',
      prompt: {
        en: 'I can tell a short story about something that happened to me (a trip, a problem) in several connected sentences.',
        uz: 'Men boshimdan o‘tgan voqea (sayohat, muammo) haqida bir nechta bog‘langan gap bilan qisqa hikoya qilib bera olaman.',
        ru: 'Я могу коротко рассказать о том, что со мной случилось (поездка, проблема), несколькими связанными предложениями.',
      },
    },
    {
      id: 'c4', skill: 'conversation.interaction', level: 3, kind: 'can_do',
      prompt: {
        en: 'I can explain a simple problem in a shop or a hotel and ask for a solution.',
        uz: 'Men do‘kon yoki mehmonxonada oddiy muammoni tushuntirib, yechim so‘ray olaman.',
        ru: 'Я могу объяснить простую проблему в магазине или отеле и попросить её решить.',
      },
    },
    {
      id: 'c5', skill: 'conversation.fluency', level: 4, kind: 'can_do',
      prompt: {
        en: 'I can talk for a minute or two about a familiar topic, giving reasons and examples, without many long pauses.',
        uz: 'Men tanish mavzuda bir-ikki daqiqa davomida sabab va misollar keltirib, ko‘p to‘xtamasdan gapira olaman.',
        ru: 'Я могу минуту-две говорить на знакомую тему, приводя причины и примеры, без частых долгих пауз.',
      },
    },
    {
      id: 'c6', skill: 'conversation.interaction', level: 4, kind: 'can_do',
      prompt: {
        en: 'I can disagree politely in a discussion, explain why, and suggest another option.',
        uz: 'Men muhokamada odob bilan e’tiroz bildira, sababini tushuntira va boshqa variant taklif qila olaman.',
        ru: 'Я могу вежливо не согласиться в обсуждении, объяснить почему и предложить другой вариант.',
      },
    },
    {
      id: 'c7', skill: 'conversation.fluency', level: 5, kind: 'can_do',
      prompt: {
        en: 'I can speak naturally and quickly even about unexpected topics, and I rarely have to search for words.',
        uz: 'Men kutilmagan mavzularda ham tabiiy va tez gapira olaman, so‘z qidirib qolishim kamdan-kam bo‘ladi.',
        ru: 'Я могу говорить естественно и быстро даже на неожиданные темы и редко подбираю слова.',
      },
    },
    {
      id: 'c8', skill: 'conversation.interaction', level: 5, kind: 'can_do',
      prompt: {
        en: 'I can handle a delicate conversation — bad news, a complaint, a negotiation — tactfully and keep a good relationship.',
        uz: 'Men nozik suhbatni — yomon xabar, shikoyat, muzokara — odob bilan olib borib, yaxshi munosabatni saqlay olaman.',
        ru: 'Я могу тактично провести деликатный разговор — плохая новость, жалоба, переговоры — и сохранить хорошие отношения.',
      },
    },
  ],
};
