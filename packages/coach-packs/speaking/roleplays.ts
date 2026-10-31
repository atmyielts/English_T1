import type { Activity } from '../src/types.ts';

// Sixteen voice role-plays. Each persona has hidden state that moves with what the
// learner says (politeness, clarity, the right question, the right detail), so the
// same scene can end well or badly. `levelNotes` tell the persona how to pitch its
// language; the review reveals the hidden state marked `revealInReview`.

const CORE = ['talk_ratio', 'questions_asked', 'average_turn_words'] as const;
const WITH_PACE = ['talk_ratio', 'questions_asked', 'average_turn_words', 'pace'] as const;

export const roleplays: Activity[] = [
  // --- Small talk and social life ------------------------------------------------------------------
  {
    id: 'rp.new-neighbour', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.social', levels: [2, 4], minutes: 6,
    title: { en: 'Meeting a new neighbour', uz: 'Yangi qo‘shni bilan tanishuv', ru: 'Знакомство с соседкой' },
    setting: {
      en: 'The stairwell of a quiet apartment building in an English-speaking city, on a Saturday morning. You moved in last week. Your neighbour from the flat opposite is coming down with her shopping bag.',
      uz: 'Ingliz tilida so‘zlashadigan shahardagi tinch ko‘p qavatli uyning zinapoyasi, shanba kuni ertalab. Siz bu yerga o‘tgan hafta ko‘chib kelgansiz. Ro‘paradagi kvartiradan qo‘shningiz xarid sumkasi bilan pastga tushib kelyapti.',
      ru: 'Лестничная клетка тихого многоквартирного дома в англоязычном городе, субботнее утро. Вы переехали сюда на прошлой неделе. Соседка из квартиры напротив спускается с сумкой для покупок.',
    },
    learnerRole: {
      en: 'You are the new tenant in flat 6. You have a car and are not sure about the parking rules.',
      uz: 'Siz 6-kvartiraning yangi ijarachisisiz. Mashinangiz bor, lekin to‘xtash joyi qoidalarini yaxshi bilmaysiz.',
      ru: 'Вы новый жилец квартиры 6. У вас есть машина, и вы не уверены в правилах парковки.',
    },
    goal: {
      en: 'Introduce yourself, make a friendly first connection, and find out something useful about living in the building.',
      uz: 'O‘zingizni tanishtiring, iliq munosabat o‘rnating va binoda yashash haqida foydali narsa bilib oling.',
      ru: 'Представьтесь, наладьте дружеский контакт и узнайте что-нибудь полезное о жизни в этом доме.',
    },
    persona: {
      name: 'Helen',
      role: 'A retired history teacher in her late sixties who has lived in flat 5 for twenty years and knows everyone in the building.',
      style: 'Warm, chatty and curious, but a little reserved with people who only answer in one word. Speaks clearly, likes to tell small stories about the building, and asks where people are from and what brought them here. Says “dear” now and then. Never lectures; if the learner struggles, she helps with simpler yes/no questions.',
      opening: 'Oh, hello! You must be the new person in number six. I saw the boxes last week — how are you settling in?',
    },
    hiddenState: {
      fields: [
        { id: 'warmth', kind: 'number', min: 0, max: 10, description: 'How friendly and open Helen feels towards the learner.', revealInReview: true },
        { id: 'building_tip', kind: 'enum', values: ['parking_permit', 'recycling_day', 'quiet_after_ten'], description: 'The useful local rule Helen shares when the learner asks about the building or the area, or mentions a car, rubbish or noise.', revealInReview: true },
        { id: 'invites_for_tea', kind: 'boolean', description: 'Whether Helen invites the learner for tea at the weekend before saying goodbye.', revealInReview: true },
      ],
      initial: { warmth: 5, building_tip: 'parking_permit', invites_for_tea: false },
      rules: 'Warmth starts at 5. +1 when the learner says their name; +1 for each question about Helen herself (how long she has lived here, what she did before retiring, her family); +1 for a reaction to what she says (Really? That sounds lovely); +1 for sharing a detail about themselves beyond one word. −1 for each one-word answer with no question back; −1 if the learner says they must go within the first two turns. Helen shares the building tip only when the learner asks about the building or the area or mentions their car: for parking_permit she explains residents need a free permit from the council website, otherwise the car gets a ticket. If warmth is 8 or more at the closing, invites_for_tea becomes true and she invites them for tea on Sunday afternoon. If warmth falls to 3 or less, Helen politely ends the chat early (“Well, I mustn’t keep you”) without giving the tip.',
    },
    goals: [
      {
        id: 'introduce',
        text: { en: 'Introduce yourself with your name and one detail', uz: 'O‘zingizni ismingiz va bitta tafsilot bilan tanishtiring', ru: 'Представьтесь: имя и одна деталь о себе' },
        check: 'The learner says their name and at least one personal detail such as their home town, job or when they moved in.',
      },
      {
        id: 'ask_two',
        text: { en: 'Ask Helen at least two questions about herself or the building', uz: 'Helenga o‘zi yoki bino haqida kamida ikkita savol bering', ru: 'Задайте Хелен хотя бы два вопроса о ней или о доме' },
        check: 'At least two genuine questions from the learner, such as how long she has lived here, what she did before, or what the area is like.',
      },
      {
        id: 'get_tip',
        text: { en: 'Find out a useful rule or tip about the building', uz: 'Bino haqida foydali qoida yoki maslahatni bilib oling', ru: 'Узнайте полезное правило или совет о доме' },
        check: 'The learner asks about the building, parking, rubbish or the area, and the conversation reaches the tip (the parking permit).',
      },
      {
        id: 'close',
        text: { en: 'End the conversation warmly', uz: 'Suhbatni iliq yakunlang', ru: 'Тепло завершите разговор' },
        check: 'The learner closes politely with a phrase such as Nice to meet you or See you around, or by accepting or making an invitation.',
      },
    ],
    scorecard: [...CORE],
    minTurns: 4, maxTurns: 10,
    levelNotes: [
      [2.5, 'Short sentences, everyday words and one question at a time. Offer choices (Are you here for work or for study?). Repeat key words once if the learner hesitates, and give the parking tip in two simple sentences.'],
      [3.5, 'Friendly normal pace with small stories about the building. Ask open questions (What brought you here?) and wait. Use common phrasal verbs (settle in, move in) and explain them only if the learner asks.'],
      [5, 'Chatty and natural: small digressions about the neighbours, a light joke about the weather, questions that invite longer answers. Mention the parking rule only in passing, so the learner has to pick it up and ask.'],
      [6, 'Fully natural British small talk with idioms (it’s a bit of a palaver), understatement and quick topic changes. Expect the learner to keep up, banter back and steer the conversation.'],
    ],
    phrases: ['ph.greetings.we-havent-met', 'ph.greetings.where-from', 'ph.greetings.been-here-long', 'ph.greetings.sounds-fun', 'ph.greetings.got-to-run'],
  },
  {
    id: 'rp.colleague-lunch', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.social', levels: [2, 4], minutes: 6,
    title: { en: 'Lunch with a colleague', uz: 'Hamkasb bilan tushlik', ru: 'Обед с коллегой' },
    setting: {
      en: 'The office canteen at lunchtime. The only free seat is next to James from the IT department. You have said hello in the lift before, but you have never really talked.',
      uz: 'Tushlik vaqtidagi ofis oshxonasi. Yagona bo‘sh joy IT bo‘limidagi Jeymsning yonida. Liftda salomlashgansiz, lekin hech qachon chinakamiga gaplashmagansiz.',
      ru: 'Офисная столовая в обеденное время. Единственное свободное место — рядом с Джеймсом из IT-отдела. Вы здоровались в лифте, но толком никогда не разговаривали.',
    },
    learnerRole: {
      en: 'You work in the sales team and joined the company two months ago.',
      uz: 'Siz savdo bo‘limida ishlaysiz va kompaniyaga ikki oy oldin kelgansiz.',
      ru: 'Вы работаете в отделе продаж и пришли в компанию два месяца назад.',
    },
    goal: {
      en: 'Start a natural conversation, find something you have in common, and leave the door open to talk again.',
      uz: 'Tabiiy suhbat boshlang, umumiy qiziqishni toping va yana gaplashish uchun imkon qoldiring.',
      ru: 'Начните естественный разговор, найдите что-то общее и оставьте возможность пообщаться снова.',
    },
    persona: {
      name: 'James',
      role: 'A systems engineer in his thirties in the IT department, eating a sandwich and scrolling his phone.',
      style: 'Polite but quiet at first: short answers and few questions until something interests him. Becomes lively and funny when the conversation reaches his hobby. Uses relaxed office English (pretty busy, not too bad, to be fair). Has to leave when his lunch break ends.',
      opening: 'Oh — hi. Yeah, sure, have a seat. Busy morning?',
    },
    hiddenState: {
      fields: [
        { id: 'interest', kind: 'number', min: 0, max: 10, description: 'How engaged James is in the conversation.', revealInReview: true },
        { id: 'shared_hobby', kind: 'enum', values: ['hiking', 'cooking', 'football'], description: 'The hobby James loves and shares with the learner. He talks about it only if the learner asks about weekends, free time or hobbies, or mentions it first.', revealInReview: true },
        { id: 'minutes_left', kind: 'number', min: 0, max: 20, description: 'Minutes left of James’s lunch break; each learner turn uses about two.', revealInReview: false },
      ],
      initial: { interest: 4, shared_hobby: 'hiking', minutes_left: 14 },
      rules: 'Interest starts at 4. +1 for an open question (What do you do at the weekend? How long have you been here?); +1 for a personal detail with a reason or example; +2 when the learner discovers the shared hobby; +1 for a natural reaction to what James says. −1 for a closed question that gets a one-word answer with no follow-up; −1 for talking only about work problems. Below 5, James answers briefly and asks nothing back; at 5–7 he asks one question back per turn; at 8 or more he tells a short funny story about getting lost on a mountain and mentions a hiking group that meets on Saturdays. Minutes_left drops by 2 after each learner turn; at 2 or less James says he has to get back and ends the chat, so the learner must close in time.',
    },
    goals: [
      {
        id: 'open',
        text: { en: 'Start the conversation naturally', uz: 'Suhbatni tabiiy boshlang', ru: 'Естественно начните разговор' },
        check: 'The learner opens with a greeting plus a comment or question (about the morning, the food, the week), not a bare “Hello”.',
      },
      {
        id: 'common',
        text: { en: 'Find the hobby you share with James', uz: 'Jeyms bilan umumiy qiziqishingizni toping', ru: 'Найдите увлечение, общее с Джеймсом' },
        check: 'The learner asks about free time, weekends or hobbies and the conversation reaches hiking as something both enjoy.',
      },
      {
        id: 'detail',
        text: { en: 'Share something about yourself with a reason or an example', uz: 'O‘zingiz haqingizda sabab yoki misol bilan gapirib bering', ru: 'Расскажите о себе с причиной или примером' },
        check: 'At least one learner turn gives a personal detail plus why or an example (I love hiking because…, Last month I went to…).',
      },
      {
        id: 'door_open',
        text: { en: 'Close with a plan or an offer to talk again', uz: 'Reja yoki yana gaplashish taklifi bilan yakunlang', ru: 'Завершите планом или предложением пообщаться снова' },
        check: 'Before James leaves, the learner suggests meeting or talking again (We should…, Let me know if…, See you at…).',
      },
    ],
    scorecard: [...CORE],
    minTurns: 4, maxTurns: 8,
    levelNotes: [
      [2.5, 'Slow, clear and short: one idea per sentence and common words (weekend, sport, food). When the learner is stuck, ask either/or questions (Do you like sport or films?). Name the hobby clearly once the learner asks.'],
      [3.5, 'Relaxed office English, natural but unhurried. Short answers until interest rises, then longer ones with an example. Use a few casual phrases (to be fair, not too bad) and rephrase if the learner looks lost.'],
      [5, 'Natural colleague talk with understatement and dry humour. Do not lead: make the learner work to find common ground, and react with real curiosity once they do.'],
      [6, 'Fast, informal and witty, with idioms and references to weekend life. Interrupt yourself, joke, and expect the learner to keep the rhythm and close the chat before the break ends.'],
    ],
    phrases: ['ph.greetings.how-is-it-going', 'ph.greetings.what-do-you-do', 'ph.greetings.sounds-fun', 'ph.greetings.no-way', 'ph.greetings.catch-up-soon'],
  },
  {
    id: 'rp.friends-party', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.social', levels: [2.5, 5], minutes: 7,
    title: { en: 'At a friend’s party', uz: 'Do‘stning bazmida', ru: 'На вечеринке у подруги' },
    setting: {
      en: 'Kamila’s birthday party in her flat on a Friday evening: music, snacks and about twenty guests. You only know Kamila, and she is busy in the kitchen. A guest is standing alone by the window with a drink.',
      uz: 'Juma oqshomi, Kamilaning kvartirasidagi tug‘ilgan kun bazmi: musiqa, yengil taomlar va yigirmaga yaqin mehmon. Siz faqat Kamilani taniysiz, u esa oshxonada band. Deraza yonida bir mehmon qo‘lida ichimlik bilan yolg‘iz turibdi.',
      ru: 'День рождения Камилы у неё в квартире, вечер пятницы: музыка, закуски, около двадцати гостей. Вы знаете только Камилу, а она занята на кухне. У окна в одиночестве стоит гостья с бокалом.',
    },
    learnerRole: {
      en: 'You are a friend of Kamila’s from work or university (you decide). You want to meet new people.',
      uz: 'Siz Kamilaning ish yoki o‘qishdagi do‘stisiz (o‘zingiz tanlang). Yangi odamlar bilan tanishmoqchisiz.',
      ru: 'Вы друг или подруга Камилы по работе или учёбе (решите сами). Вам хочется познакомиться с новыми людьми.',
    },
    goal: {
      en: 'Start a conversation with a stranger, keep it going with good questions, and leave it on a friendly note.',
      uz: 'Notanish odam bilan suhbat boshlang, uni yaxshi savollar bilan davom ettiring va do‘stona yakunlang.',
      ru: 'Заговорите с незнакомым человеком, поддержите беседу хорошими вопросами и закончите её на дружеской ноте.',
    },
    persona: {
      name: 'Olivia',
      role: 'Kamila’s cousin, in her late twenties, who moved abroad two years ago, works in data analysis, and is home for a week.',
      style: 'A little shy at first: polite, smiling, short answers. Opens up and becomes funny and talkative when the learner asks open questions and shares things too. Loves talking about life abroad and her family’s cooking. Does not like being interviewed with a list of quick questions.',
      opening: 'Hi! Sorry, I don’t really know anyone here except Kamila. Great music, though, isn’t it?',
    },
    hiddenState: {
      fields: [
        { id: 'comfort', kind: 'number', min: 0, max: 10, description: 'How relaxed Olivia feels; low comfort means short, careful answers.', revealInReview: true },
        { id: 'connection', kind: 'enum', values: ['cousin', 'university_friend', 'neighbour'], description: 'How Olivia knows the host. She says it only when asked.', revealInReview: true },
        { id: 'job_lead', kind: 'boolean', description: 'Olivia’s team is hiring. She mentions it only if the learner talks about their own work or studies in some detail.', revealInReview: true },
      ],
      initial: { comfort: 3, connection: 'cousin', job_lead: true },
      rules: 'Comfort starts at 3. +1 for an open question (How do you…, What made you…, What is it like…); +1 when the learner shares something personal in return; +1 for a natural reaction (No way!, That must be…); +1 for humour that lands. −1 for three quick closed questions in a row; −1 for very personal questions too early (salary, age, marriage); −1 for a long monologue that ignores her. With comfort below 4 Olivia answers in one sentence; at 4–6 she adds a detail and asks one question back; at 7 or more she tells a story about moving abroad and asks the learner real questions. She says she is Kamila’s cousin only when asked how she knows Kamila. If the learner describes their work or studies with some detail and comfort is 6 or more, she mentions her team is hiring and offers to connect them. When the learner leaves (to get a drink, to say hello to someone), Olivia responds warmly if comfort is 5 or more, otherwise with a short “Nice to meet you”.',
    },
    goals: [
      {
        id: 'introduce_connect',
        text: { en: 'Introduce yourself and find out how Olivia knows Kamila', uz: 'O‘zingizni tanishtiring va Oliviya Kamilani qayerdan tanishini bilib oling', ru: 'Представьтесь и узнайте, откуда Оливия знает Камилу' },
        check: 'The learner gives their name and asks how Olivia knows the host (or an equivalent question), and “cousin” comes up.',
      },
      {
        id: 'open_questions',
        text: { en: 'Keep the conversation going with at least two open questions', uz: 'Kamida ikkita ochiq savol bilan suhbatni davom ettiring', ru: 'Поддержите разговор хотя бы двумя открытыми вопросами' },
        check: 'Two or more questions with what, how, why or where that invite a longer answer, not yes or no.',
      },
      {
        id: 'react',
        text: { en: 'React naturally to Olivia’s news', uz: 'Oliviyaning yangiliklariga tabiiy munosabat bildiring', ru: 'Естественно отреагируйте на рассказ Оливии' },
        check: 'At least one natural reaction (Really?, No way!, That must have been…, That sounds…) followed by a related comment or question.',
      },
      {
        id: 'leave_well',
        text: { en: 'Leave the conversation politely', uz: 'Suhbatdan xushmuomalalik bilan chiqing', ru: 'Вежливо выйдите из разговора' },
        check: 'The learner ends with a polite reason or offer (I’m going to grab a drink — can I get you one?, It was lovely to meet you) rather than simply stopping.',
      },
    ],
    scorecard: [...WITH_PACE],
    minTurns: 5, maxTurns: 12,
    levelNotes: [
      [2.5, 'Speak slowly in short, friendly sentences with simple words (family, work, city, food). Ask easy questions back (Do you like the music?). When the learner pauses, help with a yes/no question.'],
      [3.5, 'Natural party pace but clear. Start shy with short answers, then add details when the learner asks open questions. Use common party phrases (help yourself, no way, how do you know…).'],
      [5, 'Real party English: quick jokes and a slightly ironic tone about family and life abroad. Do not carry the conversation; let short silences happen so the learner has to keep it going.'],
      [6, 'Fast and idiomatic, with teasing, humour and cultural references. Change topic suddenly and use understatement; expect the learner to banter and exit gracefully.'],
    ],
    phrases: ['ph.greetings.we-havent-met', 'ph.greetings.how-do-you-know', 'ph.greetings.what-do-you-do', 'ph.greetings.no-way', 'ph.greetings.catch-up-soon'],
  },

  // --- Travel -------------------------------------------------------------------------------------
  {
    id: 'rp.airport-checkin', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.travel', levels: [2, 4], minutes: 6,
    title: { en: 'Airport check-in: a heavy bag', uz: 'Aeroportda ro‘yxatdan o‘tish: og‘ir chamadon', ru: 'Регистрация в аэропорту: перевес' },
    setting: {
      en: 'The check-in desk at a busy international airport at 6 a.m. Your flight to London leaves in ninety minutes. The queue behind you is long, and your suitcase is on the scale.',
      uz: 'Ertalab soat 6, gavjum xalqaro aeroportdagi ro‘yxatdan o‘tish peshtaxtasi. Londonga reysingiz to‘qson daqiqadan keyin uchadi. Orqangizda uzun navbat, chamadoningiz esa tarozida turibdi.',
      ru: 'Стойка регистрации в загруженном международном аэропорту, 6 утра. Ваш рейс в Лондон вылетает через девяносто минут. За вами длинная очередь, а ваш чемодан стоит на весах.',
    },
    learnerRole: {
      en: 'You are a passenger with one suitcase and a small backpack. The suitcase has gifts and some heavy books in it.',
      uz: 'Siz bitta chamadon va kichik ryukzakli yo‘lovchisiz. Chamadoningizda sovg‘alar va bir nechta og‘ir kitob bor.',
      ru: 'Вы пассажир с одним чемоданом и небольшим рюкзаком. В чемодане подарки и несколько тяжёлых книг.',
    },
    goal: {
      en: 'Check in, solve the overweight bag without paying more than you need to, and get your seat and boarding details.',
      uz: 'Ro‘yxatdan o‘ting, ortiqcha vazn muammosini keragidan ortiq to‘lamasdan hal qiling va o‘rindiq hamda bortga chiqish ma’lumotlarini oling.',
      ru: 'Пройдите регистрацию, решите проблему перевеса, не переплачивая, и узнайте место и данные о посадке.',
    },
    persona: {
      name: 'Daniel',
      role: 'A check-in agent for an international airline, working the early shift.',
      style: 'Professional, fast and a little tired. Uses standard airline phrases (Any bags to check in?, Did you pack the bag yourself?). Stays polite but gets shorter when the learner is unclear or slow and the queue grows. Respects people who stay calm and suggest solutions, and will bend a small rule for them.',
      opening: 'Good morning. Passport and booking reference, please. Are you checking in this suitcase?',
    },
    hiddenState: {
      fields: [
        { id: 'excess_kg', kind: 'number', min: 0, max: 10, description: 'How many kilograms the suitcase is over the 23 kg limit. Moving items into the backpack lowers it.', revealInReview: true },
        { id: 'patience', kind: 'number', min: 0, max: 10, description: 'How patient Daniel is while the queue grows behind the learner.', revealInReview: true },
        { id: 'can_let_go', kind: 'boolean', description: 'Whether Daniel will ignore a last small excess (1 kg or less) as a favour.', revealInReview: true },
      ],
      initial: { excess_kg: 4, patience: 6, can_let_go: true },
      rules: 'The suitcase is 4 kg over and the fee is 15 per extra kilo. If the learner asks the price or what they can do, Daniel explains and suggests moving things into hand luggage. Each time the learner says what they will move (the books, a jacket, the gifts), excess_kg drops by 1 or 2 as he weighs it again. Patience starts at 6: +1 for a polite, clear request or an apology for the delay; −1 for an unclear or very slow turn; −2 for arguing that the scale is wrong or demanding (Give me…, I don’t pay). If patience reaches 2 or less, can_let_go becomes false, Daniel insists on the full fee and stops helping. If excess_kg falls to 1 or less while patience is 5 or more, he lets the last kilo go (“I’ll let that one go”); otherwise he charges for what is left. He gives the seat, gate and boarding time slowly if the learner asks, or reads them quickly once if not.',
    },
    goals: [
      {
        id: 'ask_cost',
        text: { en: 'Ask how much the extra weight costs', uz: 'Ortiqcha vazn qancha turishini so‘rang', ru: 'Спросите, сколько стоит перевес' },
        check: 'The learner asks about the price or fee for the extra weight (How much is it for the extra weight?, How much do I have to pay?).',
      },
      {
        id: 'solve',
        text: { en: 'Find a solution to the heavy bag', uz: 'Og‘ir chamadon muammosiga yechim toping', ru: 'Найдите решение проблемы с тяжёлым чемоданом' },
        check: 'The learner offers to move items into hand luggage or chooses to pay, and the excess is resolved.',
      },
      {
        id: 'seat_gate',
        text: { en: 'Ask for a seat or check the gate and boarding time', uz: 'O‘rindiq so‘rang yoki chiqish yo‘lagi va bortga chiqish vaqtini aniqlang', ru: 'Попросите место или уточните выход и время посадки' },
        check: 'The learner asks for a window or aisle seat, or asks about or checks the gate number or boarding time.',
      },
      {
        id: 'stay_polite',
        text: { en: 'Stay polite under time pressure', uz: 'Vaqt tig‘izligida ham xushmuomala bo‘ling', ru: 'Сохраняйте вежливость, несмотря на спешку' },
        check: 'No bare commands or arguing; the learner uses please, sorry or soft forms (Could I…, Is it possible…) at least twice.',
      },
    ],
    scorecard: [...CORE],
    minTurns: 4, maxTurns: 9,
    levelNotes: [
      [2.5, 'Speak slowly, one question at a time, and say numbers clearly (four kilos, fifteen per kilo). If the learner is stuck, suggest the solution directly: “You can put some things in your backpack.”'],
      [3.5, 'Normal airline speed with standard phrases. Give information once and repeat only if asked. Let the learner suggest the solution before you offer it.'],
      [5, 'Fast and routine, combining questions (Window or aisle — and did you pack it yourself?). Mention the fee and the hand-luggage limit in one breath and sigh slightly about the queue.'],
      [6, 'Rushed early-shift English with airline terms (excess baggage, hold luggage, cabin allowance) and little patience for vagueness. Expect the learner to negotiate quickly and confidently.'],
    ],
    phrases: ['ph.travel.extra-weight', 'ph.travel.window-seat', 'ph.travel.delayed', 'ph.help.say-again-slowly', 'ph.ordering.by-card'],
  },
  {
    id: 'rp.hotel-room-problem', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.travel', levels: [2, 4.5], minutes: 6,
    title: { en: 'A problem with your hotel room', uz: 'Mehmonxona xonasidagi muammo', ru: 'Проблема с номером в отеле' },
    setting: {
      en: 'A city-centre hotel at 11 p.m. You have just got back after a long day. The air conditioning is not working, the room is hot, and every few minutes you hear the lift next door. You call reception.',
      uz: 'Shahar markazidagi mehmonxona, kechki soat 11. Uzoq kundan keyin xonangizga endi qaytdingiz. Konditsioner ishlamayapti, xona issiq, har bir necha daqiqada yoningizdagi lift shovqini eshitiladi. Siz qabulxonaga qo‘ng‘iroq qilasiz.',
      ru: 'Отель в центре города, 23:00. Вы только что вернулись после долгого дня. Кондиционер не работает, в номере жарко, и каждые несколько минут слышно лифт за стеной. Вы звоните на ресепшн.',
    },
    learnerRole: {
      en: 'You are the guest in room 412, staying two more nights. You need to sleep well: you have an important meeting tomorrow.',
      uz: 'Siz 412-xonadagi mehmonsiz va yana ikki kecha qolasiz. Yaxshi uxlashingiz kerak: ertaga muhim uchrashuvingiz bor.',
      ru: 'Вы гость в номере 412, живёте ещё две ночи. Вам нужно выспаться: завтра важная встреча.',
    },
    goal: {
      en: 'Explain the problem clearly and politely and get a solution tonight.',
      uz: 'Muammoni aniq va muloyim tushuntiring hamda bugun kechasiyoq yechim oling.',
      ru: 'Чётко и вежливо объясните проблему и добейтесь решения сегодня же.',
    },
    persona: {
      name: 'Sophie',
      role: 'The night receptionist at a mid-size city hotel, alone at the desk.',
      style: 'Calm, apologetic and professional, but she cannot do everything: the engineer only works from 7 a.m. Responds well to clear facts (room number, what exactly is wrong, since when) and polite flexibility; becomes careful and formal if the guest shouts or blames her. Offers solutions step by step, starting with the cheapest.',
      opening: 'Good evening, reception, Sophie speaking. How can I help you?',
    },
    hiddenState: {
      fields: [
        { id: 'goodwill', kind: 'number', min: 0, max: 10, description: 'How far Sophie is willing to go out of her way for this guest.', revealInReview: true },
        { id: 'free_rooms', kind: 'enum', values: ['none', 'smaller_room', 'upgrade'], description: 'What is actually free tonight: a quiet upgraded room on the 6th floor. Sophie offers a room only if the learner asks to move.', revealInReview: true },
        { id: 'engineer_tonight', kind: 'boolean', description: 'Whether anyone can repair the air conditioning tonight (no: the engineer starts at 7 a.m.).', revealInReview: true },
      ],
      initial: { goodwill: 5, free_rooms: 'upgrade', engineer_tonight: false },
      rules: 'Goodwill starts at 5. +1 for giving the room number; +1 for describing the problem clearly (what does not work, what the guest tried); +1 for polite language (I’m sorry to call so late, Would it be possible…); +1 for flexibility (I don’t mind a smaller room). −2 for blaming or shouting (This hotel is terrible); −1 for vague complaints (Everything is bad). Sophie first offers a fan. If the learner asks for someone to repair it, she explains the engineer starts at 7 a.m. If the learner asks to change rooms: with goodwill 7 or more she offers the quiet upgrade at no charge; with goodwill 4–6 she offers a smaller room on another floor; with 3 or less she says she can only note the complaint and bring a fan. If the learner mentions the meeting or the two remaining nights and goodwill is 7 or more, she also offers a late breakfast or a note for the manager about a discount.',
    },
    goals: [
      {
        id: 'explain',
        text: { en: 'Explain the problem clearly with your room number', uz: 'Muammoni xona raqamingiz bilan aniq tushuntiring', ru: 'Чётко объясните проблему, назвав номер комнаты' },
        check: 'The learner gives the room number and says what is wrong (the air conditioning does not work, the lift is noisy) in a way Sophie can act on.',
      },
      {
        id: 'ask_solution',
        text: { en: 'Ask for a specific solution', uz: 'Aniq yechim so‘rang', ru: 'Попросите конкретное решение' },
        check: 'The learner asks for something concrete: someone to repair it, another room, or a fan.',
      },
      {
        id: 'outcome',
        text: { en: 'Get a clear result for tonight', uz: 'Bugun kechasi uchun aniq natijaga erishing', ru: 'Добейтесь понятного результата на сегодня' },
        check: 'By the end the learner knows what will happen and when (the new room, when to come down, what the engineer will do in the morning).',
      },
      {
        id: 'thank_confirm',
        text: { en: 'Thank Sophie and confirm the details', uz: 'Sofiga rahmat ayting va tafsilotlarni tasdiqlang', ru: 'Поблагодарите Софи и подтвердите детали' },
        check: 'The learner thanks her and repeats or checks one detail (room number, time, key card).',
      },
    ],
    scorecard: [...CORE],
    minTurns: 4, maxTurns: 9,
    levelNotes: [
      [2.5, 'Slow, short sentences and simple hotel words (room, hot, fix, change, fan). Offer clear choices: “I can bring a fan, or you can change room. Which is better?” Repeat the room number back.'],
      [3.5, 'Normal receptionist pace with polite set phrases (I’m sorry to hear that, Let me check). Give one solution at a time and wait for the guest to ask for more.'],
      [5, 'Professional, slightly formal hotel English with hedging (I’m afraid, I’ll see what I can do). Make the learner ask to change rooms; do not volunteer it.'],
      [6, 'Polished front-desk English at full speed, with tactful refusals and conditional offers (If you wouldn’t mind moving, I could…). Expect the learner to negotiate gracefully and confirm details.'],
    ],
    phrases: ['ph.travel.problem-room', 'ph.travel.send-someone', 'ph.travel.another-room', 'ph.travel.breakfast-time', 'ph.help.really-helpful'],
  },
  {
    id: 'rp.directions', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.travel', levels: [2, 3.5], minutes: 5,
    title: { en: 'Asking for directions', uz: 'Yo‘l so‘rash', ru: 'Как пройти?' },
    setting: {
      en: 'The old town of a city you are visiting, on a sunny afternoon. You are looking for the Central Library, but your map shows an empty building. A local man is walking his dog nearby.',
      uz: 'Siz mehmon bo‘lib kelgan shaharning eski qismi, quyoshli kunduzi. Siz Markaziy kutubxonani qidiryapsiz, lekin xaritangizda bo‘sh bino ko‘rsatilgan. Yaqin atrofda bir mahalliy kishi itini sayr qildiryapti.',
      ru: 'Старый город, в котором вы гостите, солнечный день. Вы ищете Центральную библиотеку, но на карте пустое здание. Неподалёку местный житель выгуливает собаку.',
    },
    learnerRole: {
      en: 'You are a visitor who must return a book and print some documents at the library before it closes at 5 p.m.',
      uz: 'Siz kutubxona soat 17:00 da yopilishidan oldin kitob qaytarib, hujjatlarni chop etishingiz kerak bo‘lgan mehmonsiz.',
      ru: 'Вы приезжий, которому нужно до 17:00, пока библиотека не закрылась, вернуть книгу и распечатать документы.',
    },
    goal: {
      en: 'Find out where the library is now, understand the route, and know how long it takes.',
      uz: 'Kutubxona hozir qayerdaligini, unga qanday borishni va qancha vaqt ketishini bilib oling.',
      ru: 'Узнайте, где сейчас библиотека, разберитесь в маршруте и выясните, сколько туда идти.',
    },
    persona: {
      name: 'Peter',
      role: 'A retired engineer who has lived in the old town all his life, out with his dog, Biscuit.',
      style: 'Kind and keen to help, but talks fast and gives directions full of landmarks (the bakery with the blue door, the old clock). Forgets that visitors do not know the area. Slows down happily when asked and enjoys being thanked. Interrupts himself to calm the dog.',
      opening: 'You look a bit lost there — can I help you find something?',
    },
    hiddenState: {
      fields: [
        { id: 'library_status', kind: 'enum', values: ['moved', 'open', 'closed_today'], description: 'The library moved to a new building by the river last year; Peter remembers this only when the learner names the place clearly.', revealInReview: true },
        { id: 'speed', kind: 'number', min: 1, max: 5, description: 'How fast Peter talks (5 = very fast with many landmarks).', revealInReview: false },
        { id: 'walks_with_you', kind: 'boolean', description: 'Whether Peter offers to walk part of the way, because he is going in that direction.', revealInReview: true },
      ],
      initial: { library_status: 'moved', speed: 4, walks_with_you: false },
      rules: 'Peter starts at speed 4. Each time the learner asks him to repeat or slow down, speed drops by 1 (minimum 1) and he uses fewer landmarks. If the learner names the place (the Central Library), Peter remembers it moved to the riverside and says so; if the learner only says “the library”, he first asks which one. If the learner checks the route back (So I go straight and turn left at…?), Peter confirms and adds the one detail they missed. If the learner asks whether it is within walking distance or how long it takes, he says about fifteen minutes on foot. If the learner has been polite and checked understanding at least once, walks_with_you becomes true and he offers to walk with them as far as the bridge. If the learner just says OK to everything without checking, Peter assumes they understood and leaves them with the fast version.',
    },
    goals: [
      {
        id: 'ask_clearly',
        text: { en: 'Ask how to get to the Central Library, naming it', uz: 'Markaziy kutubxonaga qanday borishni nomini aytib so‘rang', ru: 'Спросите дорогу, назвав Центральную библиотеку' },
        check: 'The learner asks for directions and names the Central Library.',
      },
      {
        id: 'slow_or_check',
        text: { en: 'Ask Peter to slow down or repeat, or check the route back', uz: 'Piterdan sekinroq gapirishni yoki qaytarishni so‘rang, yoki yo‘lni qaytarib tekshiring', ru: 'Попросите Питера говорить медленнее или повторить, либо повторите маршрут' },
        check: 'At least once the learner asks for repetition or slower speech, or repeats the route to check it.',
      },
      {
        id: 'distance',
        text: { en: 'Find out how far it is or how long it takes', uz: 'Qancha uzoqligini yoki qancha vaqt ketishini bilib oling', ru: 'Узнайте, далеко ли это и сколько идти' },
        check: 'The learner asks if it is far, within walking distance, or how long it takes.',
      },
      {
        id: 'thank',
        text: { en: 'Thank him warmly', uz: 'Unga samimiy rahmat ayting', ru: 'Тепло поблагодарите его' },
        check: 'The learner thanks Peter with more than one word (Thanks so much, you’ve been really helpful).',
      },
    ],
    scorecard: [...CORE],
    minTurns: 4, maxTurns: 8,
    levelNotes: [
      [2.5, 'Even at speed 4, use short sentences and very common direction words (straight, left, right, next to, opposite). One step per sentence and only two landmarks in total. Point to things in words: “the big church — you can see it there”.'],
      [3.5, 'Natural local speech with landmarks and phrases like go past, take the second left, you can’t miss it. Give the route in two or three chunks and wait for the learner to check.'],
      [5, 'Fast, chatty local English with digressions about the old town and the dog. Give the whole route in one long turn so the learner must slow you down or check it.'],
      [6, 'Very natural and idiomatic, with local nicknames for places and a joke or two. Expect the learner to manage you politely, summarise the route and ask smart questions.'],
    ],
    phrases: ['ph.help.excuse-me', 'ph.help.how-do-i-get', 'ph.help.say-again-slowly', 'ph.help.so-i-go', 'ph.help.walking-distance', 'ph.help.really-helpful'],
  },
  {
    id: 'rp.train-ticket-change', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.travel', levels: [2.5, 4.5], minutes: 6,
    title: { en: 'Changing a train ticket', uz: 'Poyezd chiptasini almashtirish', ru: 'Обмен билета на поезд' },
    setting: {
      en: 'The ticket office at a busy railway station at 14:20. Your connecting train arrived forty minutes late, so you have just missed the 14:10 to Manchester.',
      uz: 'Gavjum temir yo‘l vokzalidagi chipta kassasi, soat 14:20. Ulanadigan poyezdingiz qirq daqiqa kechikib keldi va siz Manchesterga ketadigan 14:10 dagi poyezdga ulgurmadingiz.',
      ru: 'Билетная касса на оживлённом вокзале, 14:20. Ваш пересадочный поезд опоздал на сорок минут, и вы только что пропустили поезд в Манчестер в 14:10.',
    },
    learnerRole: {
      en: 'You are a traveller with an advance ticket for the 14:10. You need to be in Manchester tonight for a family dinner at eight.',
      uz: 'Siz 14:10 dagi poyezdga oldindan olingan chiptasi bor yo‘lovchisiz. Bugun soat sakkizdagi oilaviy kechki ovqatga Manchesterda bo‘lishingiz kerak.',
      ru: 'Вы пассажир с заранее купленным билетом на 14:10. Вам нужно сегодня быть в Манчестере к семейному ужину в восемь.',
    },
    goal: {
      en: 'Change your ticket to a later train today for as little money as possible, and be sure of the new time and platform.',
      uz: 'Chiptangizni bugungi keyingi poyezdga iloji boricha kam pul to‘lab almashtiring va yangi vaqt hamda platformani aniq bilib oling.',
      ru: 'Поменяйте билет на более поздний поезд сегодня, заплатив как можно меньше, и точно узнайте новое время и платформу.',
    },
    persona: {
      name: 'Rachel',
      role: 'An experienced ticket office clerk at the station.',
      style: 'Efficient and fair: follows the rules but explains them clearly. Uses railway words (advance ticket, change fee, off-peak, platform). Becomes noticeably more helpful when the passenger explains the reason calmly and has the details ready; becomes strictly by-the-book with passengers who demand.',
      opening: 'Hi there, next please. Where are you travelling today?',
    },
    hiddenState: {
      fields: [
        { id: 'ticket_type', kind: 'enum', values: ['advance', 'off_peak', 'anytime'], description: 'The kind of ticket the learner holds; advance tickets normally need a change fee.', revealInReview: true },
        { id: 'fee_waived', kind: 'boolean', description: 'Whether Rachel waives the 10-pound change fee because the connecting train was late.', revealInReview: true },
        { id: 'seats_1610', kind: 'number', min: 0, max: 4, description: 'Seats left on the 16:10, which arrives at 18:45; the next train is the 18:40, arriving at 21:15.', revealInReview: true },
      ],
      initial: { ticket_type: 'advance', fee_waived: false, seats_1610: 2 },
      rules: 'Rachel first says advance tickets can be changed for a 10-pound fee plus any difference in price. If the learner explains that the connecting train was late (and mentions or shows the delayed train), fee_waived becomes true: delays caused by the railway allow a free change. If the learner only says “I missed my train” without the reason, she charges the fee. Seats_1610 starts at 2 and drops to 0 if the learner takes more than three turns to decide or argues; Rachel then offers only the 18:40, which arrives too late for dinner. If the learner asks for a seat reservation or a quiet coach, she reserves one on the 16:10. She gives the platform only if asked; otherwise she says “check the boards”.',
    },
    goals: [
      {
        id: 'explain',
        text: { en: 'Explain what happened and what you need', uz: 'Nima bo‘lganini va sizga nima kerakligini tushuntiring', ru: 'Объясните, что случилось и что вам нужно' },
        check: 'The learner says they missed the 14:10 because the connecting train was late and asks to change to a later train.',
      },
      {
        id: 'ask_cost',
        text: { en: 'Ask about the cost of changing', uz: 'Almashtirish narxini so‘rang', ru: 'Спросите, сколько стоит обмен' },
        check: 'The learner asks if there is a fee or how much the change costs.',
      },
      {
        id: 'choose_train',
        text: { en: 'Choose a train that gets you there in time', uz: 'Vaqtida yetkazadigan poyezdni tanlang', ru: 'Выберите поезд, который довезёт вас вовремя' },
        check: 'The learner asks about times or arrival and chooses the 16:10, or checks the arrival time before choosing.',
      },
      {
        id: 'confirm',
        text: { en: 'Confirm the new time and platform', uz: 'Yangi vaqt va platformani tasdiqlang', ru: 'Уточните новое время и платформу' },
        check: 'Before leaving, the learner repeats or asks for the departure time and the platform.',
      },
    ],
    scorecard: [...CORE],
    minTurns: 4, maxTurns: 9,
    levelNotes: [
      [2.5, 'Slow and clear, saying times twice in two ways (four ten — sixteen ten). Use simple words: change, later train, pay, free, platform. Help with yes/no questions: “Was your first train late?”'],
      [3.5, 'Normal station pace; explain railway terms once (an advance ticket is for one train only). Let the learner give the reason without prompting.'],
      [5, 'Efficient, natural clerk English with rules stated briefly and conditionally (If the delay was on our side, I can…). Do not prompt the reason for the delay; the learner must bring it up.'],
      [6, 'Fast, procedural English with terms like compensation, reservation and off-peak restrictions. Expect the learner to argue the case precisely and politely.'],
    ],
    phrases: ['ph.travel.change-ticket', 'ph.travel.return-ticket', 'ph.ordering.by-card', 'ph.help.say-again-slowly', 'ph.help.write-it-down'],
  },

  // --- Shops and services --------------------------------------------------------------------------
  {
    id: 'rp.cafe-order', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.shopping', levels: [2, 3.5], minutes: 5,
    title: { en: 'Ordering at a café', uz: 'Kafeda buyurtma berish', ru: 'Заказ в кафе' },
    setting: {
      en: 'A busy café near your work at 8:30 in the morning: a queue, music and the noise of the coffee machine. You are at the counter.',
      uz: 'Ertalab 8:30, ish joyingiz yaqinidagi gavjum kafe: navbat, musiqa va qahva mashinasining shovqini. Siz peshtaxta oldidasiz.',
      ru: 'Оживлённое кафе рядом с работой, 8:30 утра: очередь, музыка, шум кофемашины. Вы у стойки.',
    },
    learnerRole: {
      en: 'You want a hot drink and something to eat before work. You prefer oat milk.',
      uz: 'Ishdan oldin issiq ichimlik va biror yegulik olmoqchisiz. Suli sutini afzal ko‘rasiz.',
      ru: 'Вы хотите горячий напиток и что-нибудь поесть перед работой. Вы предпочитаете овсяное молоко.',
    },
    goal: {
      en: 'Order politely, answer the barista’s questions, deal with what is not available, and pay.',
      uz: 'Muloyim buyurtma bering, baristaning savollariga javob bering, yo‘q narsaning o‘rniga boshqasini tanlang va to‘lang.',
      ru: 'Вежливо сделайте заказ, ответьте на вопросы бариста, решите вопрос с тем, чего нет, и оплатите.',
    },
    persona: {
      name: 'Ben',
      role: 'A barista in his twenties at a busy independent café.',
      style: 'Friendly, quick and upbeat; asks short routine questions (What can I get you?, What size?, Any milk?, Eat in or take away?). Speeds up when the queue is long. Likes customers who are clear and polite and chats a little with them. If a customer gives a bare command, he serves them but stops being chatty.',
      opening: 'Morning! What can I get you?',
    },
    hiddenState: {
      fields: [
        { id: 'out_of_stock', kind: 'enum', values: ['oat_milk', 'croissants', 'nothing'], description: 'What has run out this morning.', revealInReview: true },
        { id: 'queue_pressure', kind: 'number', min: 0, max: 10, description: 'How long the queue is and how much Ben needs to hurry.', revealInReview: false },
        { id: 'offer_mentioned', kind: 'boolean', description: 'Whether Ben tells the learner about today’s offer: a free cookie with any large drink.', revealInReview: true },
      ],
      initial: { out_of_stock: 'oat_milk', queue_pressure: 6, offer_mentioned: false },
      rules: 'Oat milk has run out: when the learner asks for it, Ben apologises and offers almond or soy milk. Queue_pressure starts at 6 and rises by 1 for each turn where the learner is unclear or silent; above 8 Ben asks several things at once (Size, milk, here or takeaway?). Ben gets chattier (one small-talk line per turn) when the learner says please or thanks, uses Could I… or I’d like…, or makes a friendly comment. If the learner asks about offers, deals or what is good today, or is friendly and orders a large drink, offer_mentioned becomes true and Ben adds the free cookie. If the learner orders with a bare command (Give me…), he stays polite but brief and does not mention the offer. He says the total clearly and asks card or cash.',
    },
    goals: [
      {
        id: 'order_politely',
        text: { en: 'Order politely', uz: 'Muloyim buyurtma bering', ru: 'Сделайте заказ вежливо' },
        check: 'The learner orders with a polite form such as Could I get…, Can I have… or I’d like…, with please.',
      },
      {
        id: 'answer',
        text: { en: 'Answer Ben’s questions about size, milk and eating in or taking away', uz: 'Benning o‘lcham, sut va shu yerda yoki olib ketish haqidagi savollariga javob bering', ru: 'Ответьте на вопросы Бена о размере, молоке и о том, здесь или с собой' },
        check: 'The learner answers at least two of Ben’s questions clearly (size, milk, here or take away).',
      },
      {
        id: 'handle_change',
        text: { en: 'Choose another option when something is not available', uz: 'Biror narsa bo‘lmasa, boshqa variantni tanlang', ru: 'Выберите замену, если чего-то нет' },
        check: 'When oat milk is unavailable, the learner chooses an alternative or asks what else there is.',
      },
      {
        id: 'pay',
        text: { en: 'Pay and check the total', uz: 'To‘lang va umumiy summani tekshiring', ru: 'Оплатите и уточните сумму' },
        check: 'The learner asks or confirms the price and pays by card or cash, ending with thanks.',
      },
    ],
    scorecard: [...CORE],
    minTurns: 4, maxTurns: 8,
    levelNotes: [
      [2.5, 'Short questions, one at a time, with the choices given: “Small, medium or large?” “Here or take away?” Say prices slowly and repeat them once. Use only common food and drink words.'],
      [3.5, 'Normal café pace with routine phrases (Anything else?, That’s four eighty). Combine two questions now and then; if the learner hesitates, split them again.'],
      [5, 'Fast, friendly barista English with small talk (Busy day ahead?) and the oat milk news given casually. Mention the offer only if the learner asks or chats.'],
      [6, 'Very fast and casual, with café slang (flat white, a splash of milk, we’re all out of oat) and jokes. Expect quick, natural replies and banter.'],
    ],
    phrases: ['ph.ordering.could-i-get', 'ph.ordering.take-away', 'ph.ordering.by-card', 'ph.ordering.thats-all', 'ph.ordering.allergic-nuts'],
  },
  {
    id: 'rp.shoes-return', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.shopping', levels: [2.5, 4.5], minutes: 7,
    title: { en: 'Returning faulty shoes without a receipt', uz: 'Nuqsonli poyabzalni cheksiz qaytarish', ru: 'Возврат бракованной обуви без чека' },
    setting: {
      en: 'A shoe shop in a shopping centre on a Saturday afternoon. Two weeks ago you bought a pair of leather shoes here. The sole of the left shoe is coming off, and you cannot find the receipt.',
      uz: 'Shanba kuni tushdan keyin savdo markazidagi poyabzal do‘koni. Ikki hafta oldin shu yerdan charm poyabzal sotib olgansiz. Chap poyabzalning tagi ko‘chib ketyapti, chekni esa topa olmayapsiz.',
      ru: 'Обувной магазин в торговом центре, субботний день. Две недели назад вы купили здесь кожаные туфли. У левой туфли отклеивается подошва, а чек вы найти не можете.',
    },
    learnerRole: {
      en: 'You are the customer. You paid 45 pounds by card on 12 March and have your bank app on your phone.',
      uz: 'Siz xaridorsiz. 12-mart kuni karta orqali 45 funt to‘lagansiz va telefoningizda bank ilovasi bor.',
      ru: 'Вы покупатель. 12 марта вы заплатили 45 фунтов картой, и у вас на телефоне банковское приложение.',
    },
    goal: {
      en: 'Get a fair solution — ideally your money back — even without the receipt.',
      uz: 'Chek bo‘lmasa ham adolatli yechimga — eng yaxshisi pulingizni qaytarib olishga — erishing.',
      ru: 'Добейтесь справедливого решения — лучше всего возврата денег — даже без чека.',
    },
    persona: {
      name: 'Laura',
      role: 'A shop assistant who has worked at the shoe shop for three years.',
      style: 'Polite and sympathetic but careful with the rules: no receipt, no refund is shop policy. Asks practical questions (When did you buy them? How did you pay?). Warms to customers who stay calm and give facts; stiffens and quotes the policy when customers are rude. Can call the manager, but prefers to solve things herself.',
      opening: 'Hi there, are you OK? Can I help you with anything?',
    },
    hiddenState: {
      fields: [
        { id: 'goodwill', kind: 'number', min: 0, max: 10, description: 'How much Laura wants to find a way to help.', revealInReview: true },
        { id: 'record_found', kind: 'boolean', description: 'Whether Laura has found the card payment in the till system, so she can refund to the card.', revealInReview: true },
        { id: 'fault_accepted', kind: 'boolean', description: 'Whether Laura accepts the fault is a manufacturing defect and not wear and tear.', revealInReview: true },
      ],
      initial: { goodwill: 5, record_found: false, fault_accepted: false },
      rules: 'Goodwill starts at 5. +1 for a polite opening; +1 for showing the fault clearly (the sole is coming off after only a few wears); +1 for giving the date and the amount; +1 for acknowledging the policy before arguing (I understand you have rules, but…). −2 for raising the voice, threats or insults; −1 for vague statements (They are bad). Fault_accepted becomes true when the learner explains how little the shoes were worn and what exactly is wrong. Without a receipt Laura first offers only an exchange. If the learner mentions paying by card and gives the date, or offers to show the bank app, she searches the till; record_found becomes true when goodwill is 5 or more and the date and amount are given. With record_found and fault_accepted she offers a full refund to the card (3–5 working days). If goodwill is 6 or more but there is no record, she offers store credit or the manager. If goodwill falls to 3 or less, she only offers to send the shoes for repair (two weeks).',
    },
    goals: [
      {
        id: 'explain_fault',
        text: { en: 'Explain the fault and when you bought the shoes', uz: 'Nuqson va poyabzalni qachon sotib olganingizni tushuntiring', ru: 'Объясните, в чём дефект и когда вы купили туфли' },
        check: 'The learner describes what is wrong (the sole is coming off) and says when they bought them.',
      },
      {
        id: 'proof',
        text: { en: 'Say there is no receipt and offer other proof', uz: 'Chek yo‘qligini ayting va boshqa dalil taklif qiling', ru: 'Скажите, что чека нет, и предложите другое подтверждение' },
        check: 'The learner says they have no receipt and offers proof of payment (paid by card, the bank app, the date and amount).',
      },
      {
        id: 'options',
        text: { en: 'Ask about your options', uz: 'Qanday imkoniyatlar borligini so‘rang', ru: 'Спросите, какие есть варианты' },
        check: 'The learner asks what is possible (refund, exchange, repair) or proposes an alternative.',
      },
      {
        id: 'agree',
        text: { en: 'Agree on a solution and its details', uz: 'Yechim va uning tafsilotlari bo‘yicha kelishing', ru: 'Договоритесь о решении и уточните детали' },
        check: 'The conversation ends with a clear solution the learner accepts, and the learner checks a detail (how long the refund takes, which card).',
      },
    ],
    scorecard: [...WITH_PACE],
    minTurns: 5, maxTurns: 10,
    levelNotes: [
      [2.5, 'Short, slow sentences with simple shop words (receipt, card, money back, change, broken). Ask one question at a time (When did you buy them?) and offer clear choices (change or repair).'],
      [3.5, 'Normal shop pace with polite policy language (I’m afraid we can’t… without a receipt). Ask the practical questions and let the learner bring up the card payment.'],
      [5, 'Natural, careful customer-service English with hedging and conditions (If you paid by card, I might be able to…). Hold the policy line until the learner gives facts and acknowledges the rules.'],
      [6, 'Polished, quick retail English with consumer vocabulary (proof of purchase, faulty goods, store credit). Expect the learner to argue precisely and stay courteous.'],
    ],
    phrases: ['ph.shopping.return', 'ph.shopping.problem-with-it', 'ph.shopping.no-receipt', 'ph.shopping.exchange', 'ph.shopping.my-options', 'ph.shopping.speak-to-manager'],
  },
  {
    id: 'rp.bank-card-blocked', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.shopping', levels: [3, 5], minutes: 7,
    title: { en: 'Calling the bank: card blocked', uz: 'Bankka qo‘ng‘iroq: karta bloklangan', ru: 'Звонок в банк: карта заблокирована' },
    setting: {
      en: 'You are abroad on a business trip. This morning your bank card was declined at a supermarket, and your banking app says the card is blocked. You call the bank’s customer service line.',
      uz: 'Siz xizmat safari bilan chet eldasiz. Bugun ertalab supermarketda bank kartangiz qabul qilinmadi, bank ilovangiz esa karta bloklanganini ko‘rsatyapti. Siz bankning mijozlarga xizmat ko‘rsatish liniyasiga qo‘ng‘iroq qilasiz.',
      ru: 'Вы в командировке за границей. Сегодня утром вашу карту отклонили в супермаркете, а банковское приложение показывает, что карта заблокирована. Вы звоните в службу поддержки банка.',
    },
    learnerRole: {
      en: 'You are the cardholder. Last night you paid at the hotel restaurant; you did not make any other payments.',
      uz: 'Siz karta egasisiz. Kecha kechqurun mehmonxona restoranida to‘lov qilgansiz; boshqa hech qanday to‘lov qilmagansiz.',
      ru: 'Вы владелец карты. Вчера вечером вы заплатили в ресторане отеля; других платежей вы не совершали.',
    },
    goal: {
      en: 'Pass the security checks, find out why the card was blocked, and agree what happens next so you can pay again.',
      uz: 'Xavfsizlik tekshiruvidan o‘ting, karta nega bloklanganini bilib oling va yana to‘lay olishingiz uchun keyingi qadamlarni kelishib oling.',
      ru: 'Пройдите проверку, выясните, почему заблокировали карту, и договоритесь о дальнейших шагах, чтобы снова платить.',
    },
    persona: {
      name: 'Michael',
      role: 'A customer service adviser in the bank’s card security team, on the phone.',
      style: 'Calm, polite and procedural. Asks security questions in a set order and will not skip them. Explains clearly but uses some banking words (transaction, flagged, verify, replacement card). Patient with customers who listen and answer precisely; repeats himself formally with customers who get angry.',
      opening: 'Good morning, you’re through to card services, this is Michael. How can I help you today?',
    },
    hiddenState: {
      fields: [
        { id: 'verified', kind: 'boolean', description: 'Whether the learner has passed security: full name, date of birth and one recent payment they made.', revealInReview: true },
        { id: 'block_reason', kind: 'enum', values: ['suspicious_payment', 'wrong_pin', 'expired'], description: 'Why the card was blocked: a payment of 380 euros to an electronics website at 2 a.m. was flagged.', revealInReview: true },
        { id: 'outcome', kind: 'enum', values: ['undecided', 'unblock', 'replace'], description: 'What Michael does at the end: unblock the card, or cancel it and send a new one.', revealInReview: true },
      ],
      initial: { verified: false, block_reason: 'suspicious_payment', outcome: 'undecided' },
      rules: 'Michael cannot discuss the account until verified is true: the learner must give their full name (spelling it if asked), date of birth, and one recent payment (the hotel restaurant last night). If the learner refuses or gets angry, he repeats that he must verify first. Once verified, he explains that a payment was flagged (380 euros, an electronics website, 2 a.m.) and asks whether the learner made it. If the learner clearly says it was not them, outcome becomes replace: he cancels the card and orders a new one in 5–7 days. He mentions the emergency card (delivered to the hotel in 2 days) only when the learner explains they are abroad and asks how they can pay meanwhile. If the learner is unclear, he asks once more; if they confirm a payment they did not make, outcome becomes unblock, and the review shows the risk.',
    },
    goals: [
      {
        id: 'explain',
        text: { en: 'Explain the problem clearly', uz: 'Muammoni aniq tushuntiring', ru: 'Чётко объясните проблему' },
        check: 'The learner says the card was declined or blocked, and when and where.',
      },
      {
        id: 'security',
        text: { en: 'Complete the security checks', uz: 'Xavfsizlik tekshiruvidan o‘ting', ru: 'Пройдите проверку безопасности' },
        check: 'The learner gives their name, date of birth and a recent payment, spelling or repeating details when asked.',
      },
      {
        id: 'reason',
        text: { en: 'Find out why and say whether the payment was yours', uz: 'Sababini bilib oling va to‘lov sizniki bo‘lgan-bo‘lmaganini ayting', ru: 'Узнайте причину и скажите, ваш ли это платёж' },
        check: 'The learner asks why the card was blocked and clearly says the 380-euro payment was not theirs.',
      },
      {
        id: 'next_steps',
        text: { en: 'Agree the next steps and how you can pay meanwhile', uz: 'Keyingi qadamlarni va hozircha qanday to‘lashingizni kelishib oling', ru: 'Договоритесь о дальнейших шагах и о том, как платить пока' },
        check: 'The learner confirms what happens next (new card, when, where) and asks how they can pay while abroad.',
      },
    ],
    scorecard: [...WITH_PACE],
    minTurns: 5, maxTurns: 12,
    levelNotes: [
      [3.5, 'Clear phone English at a measured pace, one security question at a time. Explain banking words simply the first time (flagged — the system stopped it). Repeat numbers and dates slowly.'],
      [4.5, 'Natural call-centre English with standard formulas (For security reasons, I’ll need to…, Bear with me). Give the facts about the flagged payment once and let the learner ask for repetition.'],
      [5, 'Fast, procedural and formal, with banking vocabulary used without explanation (transaction, verify, replacement card, emergency card). Make the learner ask the right questions about paying while abroad.'],
      [6, 'Fully natural, rapid adviser speech with conditionals and cautious wording, and a poor line now and then. Expect the learner to stay precise and manage the call.'],
    ],
    phrases: ['ph.phone.calling-about', 'ph.phone.spell-that', 'ph.phone.confirm-number', 'ph.phone.breaking-up', 'ph.phone.thanks-good-day', 'ph.help.say-again-slowly'],
  },

  // --- Health ---------------------------------------------------------------------------------------
  {
    id: 'rp.gp-appointment', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.health', levels: [2.5, 4.5], minutes: 7,
    title: { en: 'Seeing a doctor about your symptoms', uz: 'Alomatlar bilan shifokor qabulida', ru: 'Приём у врача: симптомы' },
    setting: {
      en: 'An appointment with a GP (family doctor) at a local health centre. You have had a headache for a week, and painkillers are not helping much. You have ten minutes with the doctor.',
      uz: 'Mahalliy poliklinikada umumiy amaliyot (oilaviy) shifokori qabuli. Bir haftadan beri boshingiz og‘riyapti, og‘riq qoldiruvchi dorilar deyarli yordam bermayapti. Shifokor bilan o‘n daqiqa vaqtingiz bor.',
      ru: 'Приём у врача общей практики (семейного врача) в местной поликлинике. У вас неделю болит голова, обезболивающие почти не помогают. У вас десять минут с врачом.',
    },
    learnerRole: {
      en: 'You are the patient. You had a cold two weeks ago and your nose is still blocked; the pain is around your eyes and worse when you bend down; you are allergic to penicillin.',
      uz: 'Siz bemorsiz. Ikki hafta oldin shamollagansiz va burningiz hali ham bitgan; og‘riq ko‘zlaringiz atrofida va engashganda kuchayadi; penitsillinga allergiyangiz bor.',
      ru: 'Вы пациент. Две недели назад вы простудились, и нос до сих пор заложен; боль вокруг глаз и усиливается при наклоне; у вас аллергия на пенициллин.',
    },
    goal: {
      en: 'Describe your symptoms well enough for the doctor to find the cause, and leave knowing what to do.',
      uz: 'Shifokor sababni topishi uchun alomatlaringizni yetarlicha aniq tasvirlang va nima qilish kerakligini bilib chiqing.',
      ru: 'Опишите симптомы так, чтобы врач нашёл причину, и уйдите, понимая, что делать.',
    },
    persona: {
      name: 'Sarah',
      role: 'A GP in her forties at a local health centre, with a full afternoon of patients.',
      style: 'Kind, focused and efficient. Asks open questions first (What brings you in today?), then specific ones (Where exactly? What kind of pain? Does anything make it worse?). Summarises what she heard. Does not guess: she needs details before deciding. Explains treatment in plain language and checks the patient understood.',
      opening: 'Hello, come in, have a seat. So, what brings you in today?',
    },
    hiddenState: {
      fields: [
        { id: 'details', kind: 'number', min: 0, max: 10, description: 'How much useful information the doctor has: duration, location, kind of pain, triggers, other symptoms, medicines, allergies.', revealInReview: true },
        { id: 'real_cause', kind: 'enum', values: ['sinus_infection', 'tension_headache', 'eye_strain'], description: 'What is really causing the headache. The doctor can identify it only with enough details.', revealInReview: true },
        { id: 'allergy_known', kind: 'boolean', description: 'Whether the doctor knows about the penicillin allergy before choosing a medicine.', revealInReview: true },
      ],
      initial: { details: 1, real_cause: 'sinus_infection', allergy_known: false },
      rules: 'Details starts at 1. +2 for how long the headache has lasted; +2 for where the pain is (around the eyes, the forehead); +1 for the kind of pain (pressure, a dull ache); +2 for what makes it worse (bending down, mornings); +2 for the recent cold or blocked nose; +1 for medicine already taken. Allergy_known becomes true when the learner mentions the penicillin allergy. When details reach 7, Sarah concludes it is probably a sinus infection and explains the treatment: if allergy_known is still false, she says she will prescribe amoxicillin, a penicillin-type antibiotic, and changes it only if the learner mentions the allergy then; the review shows the risk. If details stay below 7, she can only suggest rest, painkillers and coming back in a week. She answers questions about how to take the medicine, side effects or a note for work when asked.',
    },
    goals: [
      {
        id: 'main_symptom',
        text: { en: 'Describe your main symptom and how long you have had it', uz: 'Asosiy alomat va u qancha vaqtdan beri borligini ayting', ru: 'Опишите основной симптом и как давно он у вас' },
        check: 'The learner says they have a headache and gives the duration (about a week).',
      },
      {
        id: 'pain_details',
        text: { en: 'Answer the questions about the pain: where, what kind, what makes it worse', uz: 'Og‘riq haqidagi savollarga javob bering: qayerda, qanday, nima kuchaytiradi', ru: 'Ответьте на вопросы о боли: где, какая, что её усиливает' },
        check: 'The learner gives at least two of: location, kind of pain, what makes it worse; plus the recent cold or blocked nose.',
      },
      {
        id: 'allergy',
        text: { en: 'Mention your allergy and the medicine you have taken', uz: 'Allergiyangiz va ichgan dorilaringiz haqida ayting', ru: 'Сообщите об аллергии и о лекарствах, которые уже принимали' },
        check: 'The learner says they are allergic to penicillin and what they have already taken.',
      },
      {
        id: 'next',
        text: { en: 'Ask what to do next', uz: 'Endi nima qilish kerakligini so‘rang', ru: 'Спросите, что делать дальше' },
        check: 'The learner asks at least one question about treatment: how to take it, for how long, side effects, or a note for work.',
      },
    ],
    scorecard: [...CORE],
    minTurns: 5, maxTurns: 10,
    levelNotes: [
      [2.5, 'Speak slowly with simple body and illness words (head, eyes, nose, pain, medicine). Ask closed questions when needed (Is the pain here? Is it worse in the morning?).'],
      [3.5, 'Normal consultation pace: open questions first, then simple follow-ups. Explain any medical word you use (an infection in your sinuses — the spaces behind your nose).'],
      [5, 'Natural GP English: open questions, quick summaries (So it’s been about a week, mainly around the eyes…), plain explanations of treatment. Do not prompt the allergy; wait for the learner.'],
      [6, 'Brisk, natural medical conversation with terms like congestion, a course of antibiotics and contraindication, used without explanation. Expect precise answers and questions.'],
    ],
    phrases: ['ph.health.been-feeling', 'ph.health.hurts-when', 'ph.health.sharp-or-dull', 'ph.health.allergic-to', 'ph.health.no-other-medicine', 'ph.health.note-for-work'],
  },
  {
    id: 'rp.pharmacy', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.health', levels: [2, 4], minutes: 5,
    title: { en: 'At the pharmacy', uz: 'Dorixonada', ru: 'В аптеке' },
    setting: {
      en: 'A high-street pharmacy in the evening. You have had a cough and a sore throat for three days, and you want something that helps you sleep and get to work.',
      uz: 'Kechqurun, katta ko‘chadagi dorixona. Uch kundan beri yo‘talyapsiz va tomog‘ingiz og‘riyapti; uxlash va ishga borishga yordam beradigan biror narsa kerak.',
      ru: 'Аптека на центральной улице, вечер. У вас три дня кашель и болит горло; вам нужно что-то, чтобы спать и ходить на работу.',
    },
    learnerRole: {
      en: 'You are the customer. You drive to work every morning and you are not taking any other medicine.',
      uz: 'Siz xaridorsiz. Har kuni ertalab ishga mashinada borasiz va boshqa dori ichmayapsiz.',
      ru: 'Вы покупатель. Каждое утро вы ездите на работу на машине и других лекарств не принимаете.',
    },
    goal: {
      en: 'Get the right medicine and understand how to take it safely.',
      uz: 'To‘g‘ri dori oling va uni qanday xavfsiz ichish kerakligini tushunib oling.',
      ru: 'Получите подходящее лекарство и поймите, как безопасно его принимать.',
    },
    persona: {
      name: 'Emma',
      role: 'A pharmacist at a high-street pharmacy.',
      style: 'Friendly, careful and practical. Always asks a few safety questions before recommending anything (Who is it for? How long have you had it? Any other medicines? Any allergies?). Explains doses simply and checks understanding. If the symptoms sound serious, she recommends seeing a doctor.',
      opening: 'Hi there, how can I help you this evening?',
    },
    hiddenState: {
      fields: [
        { id: 'safety_answers', kind: 'number', min: 0, max: 4, description: 'How many of Emma’s safety questions the learner has answered (who it is for, how long, other medicines, allergies).', revealInReview: true },
        { id: 'recommendation', kind: 'enum', values: ['night_syrup', 'lozenges', 'see_doctor'], description: 'What Emma recommends: a night-time cough syrup, unless a symptom means a doctor is needed.', revealInReview: true },
        { id: 'drowsy_warning_given', kind: 'boolean', description: 'Whether Emma has clearly explained that the night syrup makes you sleepy and you must not drive after taking it.', revealInReview: true },
      ],
      initial: { safety_answers: 0, recommendation: 'night_syrup', drowsy_warning_given: false },
      rules: 'Emma asks her safety questions one by one; safety_answers rises by 1 for each clear answer. She recommends nothing until safety_answers is at least 3. If the learner mentions a high temperature for more than three days, difficulty breathing, or that the medicine is for a baby, recommendation becomes see_doctor. Otherwise she recommends a night-time cough syrup plus throat lozenges for the day and explains the dose once (10 ml at bedtime). If the learner asks about side effects, mentions driving, or asks whether it is safe for work, drowsy_warning_given becomes true and she explains clearly: it can make you sleepy, so take it only at night and never before driving. If the learner never asks, she mentions it only quickly while handing it over, and the review marks the warning as easy to miss.',
    },
    goals: [
      {
        id: 'ask',
        text: { en: 'Ask for something for your symptoms', uz: 'Alomatlaringiz uchun biror dori so‘rang', ru: 'Попросите что-нибудь от ваших симптомов' },
        check: 'The learner politely asks for something for a cough and a sore throat (Have you got something for…?).',
      },
      {
        id: 'answer_safety',
        text: { en: 'Answer Emma’s safety questions', uz: 'Emmaning xavfsizlik savollariga javob bering', ru: 'Ответьте на вопросы Эммы о безопасности' },
        check: 'The learner answers at least three: who it is for, how long, other medicines, allergies.',
      },
      {
        id: 'how_to_take',
        text: { en: 'Ask how often or how much to take', uz: 'Necha mahal yoki qancha ichish kerakligini so‘rang', ru: 'Спросите, как часто или сколько принимать' },
        check: 'The learner asks about the dose or how often to take it.',
      },
      {
        id: 'side_effects',
        text: { en: 'Check side effects or whether it is safe with driving', uz: 'Nojo‘ya ta’sirlarni yoki mashina haydash xavfsizligini aniqlang', ru: 'Уточните побочные эффекты или можно ли садиться за руль' },
        check: 'The learner asks about side effects, or mentions driving to work and asks if it is safe.',
      },
    ],
    scorecard: [...CORE],
    minTurns: 4, maxTurns: 9,
    levelNotes: [
      [2.5, 'Slow, simple and kind. One question at a time with yes/no options (Is it for you? Do you take other medicine?). Explain the dose in simple words: “ten millilitres — two small spoons — at night”.'],
      [3.5, 'Normal pharmacy pace with clear questions and simple explanations. Use the words cough, sore throat, syrup, lozenges and side effects, and explain lozenges if needed.'],
      [5, 'Natural pharmacist English with quick safety checks and a confident recommendation. Mention the drowsiness only briefly unless the learner asks about it.'],
      [6, 'Brisk, natural English with pharmacy terms (non-drowsy, active ingredient, maximum daily dose). Expect the learner to ask informed questions.'],
    ],
    phrases: ['ph.health.something-for', 'ph.health.how-often', 'ph.health.side-effects', 'ph.health.need-prescription', 'ph.health.no-other-medicine'],
  },

  // --- Work -------------------------------------------------------------------------------------------
  {
    id: 'rp.job-interview', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.work', levels: [3, 5], minutes: 8,
    title: { en: 'Job interview', uz: 'Ish suhbati', ru: 'Собеседование' },
    setting: {
      en: 'A video interview for a team leader role in the customer support department of an international online travel company. The interviewer is the head of support, and the interview is in English.',
      uz: 'Xalqaro onlayn sayohat kompaniyasining mijozlarni qo‘llab-quvvatlash bo‘limida jamoa rahbari lavozimiga video suhbat. Suhbatni bo‘lim boshlig‘i ingliz tilida olib boradi.',
      ru: 'Видеособеседование на должность тимлида в отделе поддержки клиентов международной онлайн-турфирмы. Его проводит руководитель поддержки, на английском.',
    },
    learnerRole: {
      en: 'You are a candidate with four years in customer support. You have trained new colleagues but have never had the official title of team leader.',
      uz: 'Siz mijozlarni qo‘llab-quvvatlashda to‘rt yillik tajribaga ega nomzodsiz. Yangi hamkasblarni o‘qitgansiz, lekin rasman jamoa rahbari bo‘lmagansiz.',
      ru: 'Вы кандидат с четырьмя годами опыта в поддержке клиентов. Вы обучали новых коллег, но официально тимлидом не были.',
    },
    goal: {
      en: 'Show your experience with concrete examples, deal with the interviewer’s doubt, and leave a strong impression.',
      uz: 'Tajribangizni aniq misollar bilan ko‘rsating, suhbatdoshning shubhasini yo‘qoting va kuchli taassurot qoldiring.',
      ru: 'Покажите опыт на конкретных примерах, снимите сомнения интервьюера и оставьте сильное впечатление.',
    },
    persona: {
      name: 'Andrew',
      role: 'Head of customer support at an international online travel company, interviewing for a team leader.',
      style: 'Friendly but probing. Starts with an easy question, then asks for specific examples (Can you give me an example of…?, What happened next?). Nods, takes notes, and follows up on vague answers. Does not state his concern directly at first; he hints at it (Have you ever been responsible for other people’s results?). Values honesty and structure; is unimpressed by memorised phrases.',
      opening: 'Hi, thanks for joining. Can you hear me OK? Great. So, to start with, could you tell me a little about yourself and your experience?',
    },
    hiddenState: {
      fields: [
        { id: 'impression', kind: 'number', min: 0, max: 10, description: 'Andrew’s overall impression of the candidate.', revealInReview: true },
        { id: 'main_concern', kind: 'enum', values: ['no_leadership_title', 'short_jobs', 'phone_english'], description: 'Andrew’s hidden worry about this candidate: they have never officially led a team.', revealInReview: true },
        { id: 'second_interview', kind: 'boolean', description: 'Whether Andrew invites the candidate to the next round at the end.', revealInReview: true },
      ],
      initial: { impression: 5, main_concern: 'no_leadership_title', second_interview: false },
      rules: 'Impression starts at 5. +1 for a clear, structured introduction (current role, years, key responsibility); +2 for a concrete example with situation, action and result (numbers count); +2 when the learner directly addresses never having been a team leader (training colleagues, covering for a manager); +1 for a thoughtful question about the team or the role; +1 for honest reflection on what they learned. −1 for vague or memorised answers without examples (I am hard-working and a team player); −1 for answering a different question; −2 for criticising a former employer. Andrew hints at his concern in his second or third question; if the learner gives no example of leading people, he asks once more, directly. At the end, second_interview becomes true if impression is 8 or more; otherwise he thanks them warmly and says HR will be in touch.',
    },
    goals: [
      {
        id: 'background',
        text: { en: 'Introduce your background in a clear structure', uz: 'Tajribangizni aniq tartibda tanishtiring', ru: 'Чётко и по порядку расскажите о своём опыте' },
        check: 'The learner describes their experience in a clear order (current role, years, main responsibilities) in at least two connected sentences.',
      },
      {
        id: 'example',
        text: { en: 'Give a concrete example with what you did and the result', uz: 'Nima qilganingiz va natijasi bilan aniq misol keltiring', ru: 'Приведите конкретный пример: что вы сделали и каков результат' },
        check: 'The learner tells one specific story with the situation, their action and a result, ideally with a number.',
      },
      {
        id: 'concern',
        text: { en: 'Deal with the interviewer’s concern about leadership', uz: 'Suhbatdoshning rahbarlik haqidagi xavotiriga javob bering', ru: 'Ответьте на сомнение интервьюера насчёт опыта руководства' },
        check: 'The learner admits they have not had the title and gives evidence of leading or training people.',
      },
      {
        id: 'question',
        text: { en: 'Ask a thoughtful question about the role or the team', uz: 'Lavozim yoki jamoa haqida mazmunli savol bering', ru: 'Задайте содержательный вопрос о роли или команде' },
        check: 'The learner asks a relevant question (how the team is measured, the main challenge, what success looks like after six months), not only about salary.',
      },
    ],
    scorecard: [...WITH_PACE],
    minTurns: 5, maxTurns: 12,
    levelNotes: [
      [3.5, 'Clear, steady interview English. Ask one question at a time and rephrase once if the learner hesitates. Use common interview words (experience, responsible for, example, team) and avoid idioms.'],
      [4.5, 'Natural professional pace with follow-up probes (What exactly did you do? What was the result?). Hint at the concern indirectly and let the learner pick it up.'],
      [5, 'Realistic senior-manager interview English: concise questions, polite pressure and one hypothetical scenario (Imagine one of your team…). Expect structured answers with evidence.'],
      [6, 'Fully natural, fast and nuanced, with indirect questions and some challenge (I’m not sure that’s quite the same as managing people, though?). Expect the learner to handle pushback with poise.'],
    ],
    phrases: ['ph.meetings.way-i-see-it', 'ph.meetings.to-be-honest', 'ph.meetings.just-to-clarify', 'ph.meetings.good-point', 'ph.help.say-again-slowly'],
  },
  {
    id: 'rp.day-off-request', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.work', levels: [2.5, 4.5], minutes: 6,
    title: { en: 'Asking your manager for a day off', uz: 'Rahbardan dam olish kuni so‘rash', ru: 'Попросить выходной у руководителя' },
    setting: {
      en: 'Your manager’s desk on a Monday afternoon in a busy week: the team has a project deadline next Monday. You need next Friday off for your sister’s wedding in another city.',
      uz: 'Dushanba kuni tushdan keyin, rahbaringizning stoli oldida. Hafta juda band: jamoaning loyiha muddati keyingi dushanba. Sizga keyingi juma kuni boshqa shahardagi singlingizning to‘yi uchun dam olish kerak.',
      ru: 'Понедельник, вторая половина дня, стол вашей руководительницы. Неделя напряжённая: у команды дедлайн по проекту в следующий понедельник. Вам нужен выходной в следующую пятницу — свадьба сестры в другом городе.',
    },
    learnerRole: {
      en: 'You are a team member. Your main task this week is a client report. A colleague, Dilshod, knows your project.',
      uz: 'Siz jamoa a’zosisiz. Bu haftadagi asosiy vazifangiz — mijoz uchun hisobot. Hamkasbingiz Dilshod loyihangizni yaxshi biladi.',
      ru: 'Вы член команды. Ваша главная задача на этой неделе — отчёт для клиента. Коллега Дильшод знает ваш проект.',
    },
    goal: {
      en: 'Get the day off without damaging the project or your relationship with your manager.',
      uz: 'Loyihaga ham, rahbar bilan munosabatingizga ham zarar yetkazmasdan dam olish kunini oling.',
      ru: 'Получите выходной, не навредив ни проекту, ни отношениям с руководителем.',
    },
    persona: {
      name: 'Rebecca',
      role: 'Your team manager, responsible for the project deadline next Monday.',
      style: 'Fair and friendly but stressed this week. Answers first with the problem (It’s a really bad week for it…), then listens. Responds well to people who bring a plan; becomes firm with people who simply announce what they will do. Thinks aloud about who can cover, and likes written confirmation.',
      opening: 'Hi — yes, come in. I’ve got about five minutes before my next call. What’s up?',
    },
    hiddenState: {
      fields: [
        { id: 'workload', kind: 'number', min: 0, max: 10, description: 'How overloaded Rebecca feels this week.', revealInReview: true },
        { id: 'cover_plan', kind: 'boolean', description: 'Whether there is a credible plan for the learner’s work while they are away.', revealInReview: true },
        { id: 'decision', kind: 'enum', values: ['no', 'maybe', 'yes'], description: 'Rebecca’s current answer to the request.', revealInReview: true },
      ],
      initial: { workload: 8, cover_plan: false, decision: 'maybe' },
      rules: 'Decision starts at maybe. A bare demand or announcement (I need Friday off, I will not come) moves it to no and workload rises by 1. A real reason (the wedding) keeps it at maybe and earns sympathy. Cover_plan becomes true when the learner explains how the client report will be finished before Friday and who will handle urgent emails (Dilshod). With cover_plan true and a polite request, decision becomes yes. If the learner also offers flexibility (being reachable by phone, a half day, finishing on Thursday evening), workload drops by 1 and Rebecca says yes more warmly. If decision is no, the learner can recover by apologising and bringing a plan (back to maybe). Rebecca has about five minutes: after eight learner turns she must join her call and asks the learner to email the details.',
    },
    goals: [
      {
        id: 'request',
        text: { en: 'Ask politely for a specific day and give the reason', uz: 'Aniq kunni muloyim so‘rang va sababini ayting', ru: 'Вежливо попросите конкретный день и назовите причину' },
        check: 'The learner asks for next Friday with a polite form (Would it be possible…, Could I…) and mentions the wedding.',
      },
      {
        id: 'cover',
        text: { en: 'Explain how your work will be covered', uz: 'Ishingiz qanday bajarilishini tushuntiring', ru: 'Объясните, как будет прикрыта ваша работа' },
        check: 'The learner says when the report will be finished and who will cover urgent tasks.',
      },
      {
        id: 'respond',
        text: { en: 'Answer the manager’s concern with an offer or a compromise', uz: 'Rahbarning xavotiriga taklif yoki murosa bilan javob bering', ru: 'Ответьте на опасение руководителя предложением или компромиссом' },
        check: 'After Rebecca raises a concern, the learner offers something (to be reachable, a half day, to finish early).',
      },
      {
        id: 'confirm',
        text: { en: 'Confirm the agreement', uz: 'Kelishuvni tasdiqlang', ru: 'Подтвердите договорённость' },
        check: 'The learner thanks Rebecca and confirms the next step (I’ll send you an email, I’ll brief Dilshod).',
      },
    ],
    scorecard: [...CORE],
    minTurns: 4, maxTurns: 8,
    levelNotes: [
      [2.5, 'Short, clear sentences and common work words (day off, report, finish, help, email). State the problem simply (This week is very busy) and ask one direct question (Who can do your work?).'],
      [3.5, 'Natural office English at a steady pace. Show stress politely, think aloud about the deadline, and give the learner space to suggest a plan.'],
      [5, 'Realistic manager English with hedging and conditions (I could live with that if…, Let me think about who…). Do not offer the solution; wait for the learner to propose cover.'],
      [6, 'Fast, natural, slightly distracted manager speech with idioms (it’s all hands on deck, we’re stretched thin). Expect the learner to negotiate tactfully and close quickly.'],
    ],
    phrases: ['ph.meetings.meet-halfway', 'ph.meetings.just-to-clarify', 'ph.meetings.send-summary', 'ph.phone.good-time', 'ph.phone.send-by-email'],
  },
  {
    id: 'rp.meeting-disagree', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.work', levels: [3, 5], minutes: 8,
    title: { en: 'Disagreeing politely in a meeting', uz: 'Yig‘ilishda odob bilan e’tiroz bildirish', ru: 'Вежливое несогласие на совещании' },
    setting: {
      en: 'A weekly project meeting on a video call. The project lead has just proposed launching the product two weeks earlier by cutting the testing phase from three weeks to one. You are responsible for quality.',
      uz: 'Video qo‘ng‘iroq orqali haftalik loyiha yig‘ilishi. Loyiha rahbari hozirgina sinov bosqichini uch haftadan bir haftaga qisqartirib, mahsulotni ikki hafta oldin chiqarishni taklif qildi. Sifat uchun siz mas’ulsiz.',
      ru: 'Еженедельное совещание по проекту по видеосвязи. Руководитель проекта только что предложил выпустить продукт на две недели раньше, сократив тестирование с трёх недель до одной. Вы отвечаете за качество.',
    },
    learnerRole: {
      en: 'You are the quality lead. Last year a shortened test phase on another app led to three urgent fixes and many complaints.',
      uz: 'Siz sifat bo‘yicha mas’ul rahbarsiz. O‘tgan yili boshqa ilovada qisqartirilgan sinov bosqichi uchta shoshilinch tuzatish va ko‘plab shikoyatlarga sabab bo‘lgan.',
      ru: 'Вы руководите контролем качества. В прошлом году сокращённое тестирование другого приложения привело к трём срочным исправлениям и множеству жалоб.',
    },
    goal: {
      en: 'Disagree without damaging the relationship, understand the pressure behind the plan, and reach a compromise.',
      uz: 'Munosabatlarga putur yetkazmasdan e’tiroz bildiring, reja ortidagi bosimni tushuning va murosaga keling.',
      ru: 'Возразите, не испортив отношения, поймите, что стоит за планом, и придите к компромиссу.',
    },
    persona: {
      name: 'Chris',
      role: 'The project lead chairing the meeting, under pressure from senior management.',
      style: 'Energetic and persuasive; likes quick decisions and does not enjoy being slowed down. Defends the plan at first (We can fix things after launch). Respects data and concrete examples; gets defensive if criticised personally or told the idea is simply bad. Reveals the real reason only when asked directly and respectfully.',
      opening: 'Right, so that’s the idea: we launch on the first instead of the fifteenth, and we squeeze testing into one week. I think it’s doable. Any thoughts?',
    },
    hiddenState: {
      fields: [
        { id: 'openness', kind: 'number', min: 0, max: 10, description: 'How open Chris is to changing the plan.', revealInReview: true },
        { id: 'real_pressure', kind: 'enum', values: ['director_target', 'client_deadline', 'competitor_launch'], description: 'Why Chris really wants the earlier date: the director promised the board an earlier launch. He says it only if asked about the reason.', revealInReview: true },
        { id: 'accepts_compromise', kind: 'boolean', description: 'Whether Chris agrees to a compromise, such as a smaller first release.', revealInReview: true },
      ],
      initial: { openness: 4, real_pressure: 'director_target', accepts_compromise: false },
      rules: 'Openness starts at 4. +1 for softened disagreement (I see why…, but; I’m not sure that…); +2 for a concrete reason with a consequence or a past example; +1 for a question about the reason behind the date; +1 for acknowledging a good point he makes. −2 for blunt or personal criticism (That’s a bad idea, You always rush); −1 for disagreeing without any reason. When asked respectfully why the date matters, Chris admits the director promised the board an earlier launch. If openness reaches 7 and the learner proposes an alternative that still meets the director’s date (a smaller first release, more testers, testing the riskiest parts first), accepts_compromise becomes true and Chris asks the learner to send a short plan. If openness falls to 2 or less, Chris closes the topic and says they will go with his plan.',
    },
    goals: [
      {
        id: 'disagree_softly',
        text: { en: 'Disagree politely', uz: 'Odob bilan e’tiroz bildiring', ru: 'Вежливо выразите несогласие' },
        check: 'The learner disagrees with softening language (I see your point, but…; I’m not convinced…; I’m worried that…) rather than a blunt no.',
      },
      {
        id: 'reason',
        text: { en: 'Give a clear reason with a consequence or an example', uz: 'Oqibat yoki misol bilan aniq sabab keltiring', ru: 'Приведите ясную причину с последствием или примером' },
        check: 'The learner supports the disagreement with a concrete risk, a past example or numbers.',
      },
      {
        id: 'understand',
        text: { en: 'Ask a question to understand the other side', uz: 'Qarshi tomonni tushunish uchun savol bering', ru: 'Задайте вопрос, чтобы понять другую сторону' },
        check: 'The learner asks why the earlier date matters or what is driving it.',
      },
      {
        id: 'compromise',
        text: { en: 'Propose a compromise or a next step', uz: 'Murosa yoki keyingi qadamni taklif qiling', ru: 'Предложите компромисс или следующий шаг' },
        check: 'The learner suggests an alternative that serves both sides (a smaller first release, more testers) or offers a concrete next step.',
      },
    ],
    scorecard: [...WITH_PACE],
    minTurns: 5, maxTurns: 10,
    levelNotes: [
      [3.5, 'Clear meeting English at a steady pace. State the plan in short sentences and react simply (OK, but why?). Avoid idioms; if the learner struggles, ask a direct question (What is the risk?).'],
      [4.5, 'Natural, energetic meeting talk with some business phrases (doable, after launch, the board). Push back once on each argument and wait for the learner to respond.'],
      [5, 'Persuasive, quick and a little impatient, with hedged pressure (I hear you, but realistically…). Make the learner ask for the real reason and earn the compromise.'],
      [6, 'Fast, idiomatic and political, with interruptions and rhetorical questions (Are we really going to let a week of testing hold us back?). Expect the learner to stay calm, precise and diplomatic.'],
    ],
    phrases: ['ph.meetings.see-your-point', 'ph.meetings.to-be-honest', 'ph.meetings.meet-halfway', 'ph.meetings.just-to-clarify', 'ph.meetings.sorry-to-interrupt', 'ph.meetings.same-page'],
  },
  {
    id: 'rp.late-delivery-call', kind: 'roleplay', rubric: 'speaking.conversation', node: 'situations.work', levels: [3, 5], minutes: 8,
    title: { en: 'Phoning a client about a late delivery', uz: 'Kechikkan yetkazib berish haqida mijozga qo‘ng‘iroq', ru: 'Звонок клиенту о задержке поставки' },
    setting: {
      en: 'You work for a furniture supplier. A client’s order of 120 office chairs is held at customs because of a missing certificate — your company’s mistake — and will arrive five days late. You call the client before she hears it from someone else.',
      uz: 'Siz mebel yetkazib beruvchi kompaniyada ishlaysiz. Mijozning 120 ta ofis kreslosidan iborat buyurtmasi sertifikat yetishmagani sababli bojxonada ushlanib qoldi — bu sizning kompaniyangiz xatosi — va besh kun kechikib keladi. Mijoz buni boshqalardan eshitmasidan oldin unga qo‘ng‘iroq qilasiz.',
      ru: 'Вы работаете у поставщика мебели. Заказ клиента — 120 офисных кресел — задержан на таможне из-за отсутствующего сертификата (ошибка вашей компании) и придёт на пять дней позже. Вы звоните клиентке, пока она не узнала об этом от других.',
    },
    learnerRole: {
      en: 'You are the account manager. You may offer about 40 chairs from the local warehouse by Thursday, free delivery for both shipments, or 5% off — nothing more without your director.',
      uz: 'Siz mijozlar bilan ishlash menejerisiz. Payshanbagacha mahalliy ombordan 40 ga yaqin kreslo, ikkala jo‘natma uchun bepul yetkazib berish yoki 5% chegirma taklif qila olasiz — bundan ortig‘i faqat direktor ruxsati bilan.',
      ru: 'Вы менеджер по работе с клиентами. Можно предложить около 40 кресел с местного склада к четвергу, бесплатную доставку обеих партий или скидку 5% — большее только с разрешения директора.',
    },
    goal: {
      en: 'Give the bad news honestly, understand what the delay means for the client, and agree a solution that keeps her as a customer.',
      uz: 'Yomon xabarni halol yetkazing, kechikish mijoz uchun nimani anglatishini tushuning va uni mijoz sifatida saqlab qoladigan yechimga kelishing.',
      ru: 'Честно сообщите плохую новость, поймите, чем задержка грозит клиенту, и договоритесь о решении, которое сохранит её как клиента.',
    },
    persona: {
      name: 'Linda',
      role: 'The purchasing manager of a growing chain of furniture showrooms, a client for three years.',
      style: 'Direct, busy and already frustrated, because an earlier order was late too. Interrupts when she hears excuses and asks hard questions (Why am I only hearing this now? Can you guarantee the new date?). Calms down when the caller is honest, takes responsibility and asks about her situation. Values solutions over apologies, and written confirmation.',
      opening: 'Linda speaking. I’ve got two minutes — is this about the chairs?',
    },
    hiddenState: {
      fields: [
        { id: 'frustration', kind: 'number', min: 0, max: 10, description: 'How annoyed Linda is.', revealInReview: true },
        { id: 'real_deadline', kind: 'enum', values: ['store_opening_saturday', 'no_fixed_date', 'staff_training_monday'], description: 'What the chairs are really needed for. Linda says it only when the caller asks how the delay affects her.', revealInReview: true },
        { id: 'partial_ok', kind: 'boolean', description: 'Whether Linda accepts a partial delivery as part of the solution.', revealInReview: true },
      ],
      initial: { frustration: 7, real_deadline: 'store_opening_saturday', partial_ok: false },
      rules: 'Frustration starts at 7. −1 for a clear apology that takes responsibility; −1 for a clear reason for the delay; −2 for asking how the delay affects her; −1 for a realistic date without overpromising; −1 for a concrete offer. +2 for blaming customs or other people; +1 for vague dates (soon, as fast as possible); +2 for promising something impossible (all the chairs by Friday). When asked about the impact, Linda reveals her new showroom opens on Saturday. If the caller then offers the 40 chairs from the local warehouse by Thursday, partial_ok becomes true. At some point Linda tests the caller by asking for 20% off: a learner who promises it without the director is flagged in the review. If frustration falls to 3 or less, Linda accepts the plan and asks for it in writing; if it reaches 10, she says she will speak to the caller’s director and ends the call.',
    },
    goals: [
      {
        id: 'honest_news',
        text: { en: 'Apologise and explain the reason for the delay clearly', uz: 'Uzr so‘rang va kechikish sababini aniq tushuntiring', ru: 'Извинитесь и ясно объясните причину задержки' },
        check: 'The learner apologises, takes responsibility, and explains the customs problem and the new date.',
      },
      {
        id: 'realistic',
        text: { en: 'Give a realistic new date without overpromising', uz: 'Ortiqcha va’da bermasdan real yangi sanani ayting', ru: 'Назовите реальную новую дату, не обещая лишнего' },
        check: 'The learner gives a specific realistic date (next Wednesday) and does not promise what they cannot deliver, including the 20% discount.',
      },
      {
        id: 'impact',
        text: { en: 'Ask how the delay affects the client', uz: 'Kechikish mijozga qanday ta’sir qilishini so‘rang', ru: 'Спросите, как задержка повлияет на клиента' },
        check: 'The learner asks about the impact or the deadline, and the store opening on Saturday comes up.',
      },
      {
        id: 'solution',
        text: { en: 'Offer a concrete solution and agree a follow-up', uz: 'Aniq yechim taklif qiling va keyingi qadamni kelishib oling', ru: 'Предложите конкретное решение и договоритесь о следующем шаге' },
        check: 'The learner offers the partial delivery or another allowed option and confirms a next step (an email, a call on Thursday).',
      },
    ],
    scorecard: [...WITH_PACE],
    minTurns: 5, maxTurns: 12,
    levelNotes: [
      [3.5, 'Clear, firm business English at a moderate pace. Show frustration in simple sentences (This is the second time. I need the chairs.). Ask one hard question at a time.'],
      [4.5, 'Natural, brisk client English with pressure (So what are you going to do about it?) and short interruptions when you hear excuses. Reveal the store opening only when asked.'],
      [5, 'Fast, direct and demanding, with business idioms (I can’t afford another hiccup, that’s not good enough). Test the caller with the unreasonable discount request.'],
      [6, 'Fully natural, sharp negotiation English with irony and interruptions. Expect the learner to stay composed, empathetic and precise, and to steer the call to a written agreement.'],
    ],
    phrases: ['ph.phone.this-is', 'ph.phone.good-time', 'ph.phone.sorry-for-delay', 'ph.phone.send-by-email', 'ph.meetings.send-summary', 'ph.phone.thanks-good-day'],
  },
];
