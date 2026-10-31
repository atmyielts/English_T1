import type { Sample } from '../src/types.ts';

// Static examples shown to people who have not started yet. Each one is clearly
// labelled as an example and follows a fictional learner, Malika (B1, target B1+).

export const samples: Sample[] = [
  {
    id: 'sample.review-hotel',
    kind: 'roleplay_review',
    title: {
      en: 'Example: role-play review — a problem with your hotel room',
      uz: 'Namuna: rolli suhbat tahlili — mehmonxona xonasidagi muammo',
      ru: 'Пример: разбор ролевого диалога — проблема с номером в отеле',
    },
    preview: {
      en: 'An example review for a fictional learner, Malika, after calling hotel reception about a broken air conditioner. She met 3 of 4 goals and got a new room. Overall B1. Fix next: past simple for finished time, question word order, and closing the call warmly.',
      uz: 'Uydirma o‘quvchi Malika uchun namunaviy tahlil: u buzilgan konditsioner haqida mehmonxona qabulxonasiga qo‘ng‘iroq qildi. 4 ta maqsaddan 3 tasiga erishdi va yangi xona oldi. Umumiy daraja B1. Keyingi qadam: tugagan vaqt uchun past simple, savoldagi so‘z tartibi va qo‘ng‘iroqni iliq yakunlash.',
      ru: 'Пример разбора для вымышленной ученицы Малики после звонка на ресепшн из-за сломанного кондиционера. Она выполнила 3 цели из 4 и получила другой номер. Общий уровень B1. Что исправить: past simple для законченного времени, порядок слов в вопросе и тёплое завершение звонка.',
    },
    body: {
      scenario: 'A problem with your hotel room: calling reception at 11 p.m. about a broken air conditioner and a noisy lift (example).',
      goals: [
        {
          text: { en: 'Explain the problem clearly with your room number', uz: 'Muammoni xona raqamingiz bilan aniq tushuntiring', ru: 'Чётко объясните проблему, назвав номер комнаты' },
          met: true,
          quote: 'Hello, I’m calling from room 305. The air conditioning is not working and the room is very hot.',
        },
        {
          text: { en: 'Ask for a specific solution', uz: 'Aniq yechim so‘rang', ru: 'Попросите конкретное решение' },
          met: true,
          quote: 'Is it possible to change my room?',
        },
        {
          text: { en: 'Get a clear result for tonight', uz: 'Bugun kechasi uchun aniq natijaga erishing', ru: 'Добейтесь понятного результата на сегодня' },
          met: true,
          quote: 'So I go to room 612 now, yes?',
        },
        {
          text: { en: 'Thank Sophie and confirm the details', uz: 'Sofiga rahmat ayting va tafsilotlarni tasdiqlang', ru: 'Поблагодарите Софи и подтвердите детали' },
          met: false,
          quote: null,
        },
      ],
      criteria: [
        {
          id: 'range', score: 3,
          evidence: ['The air conditioning is not working and the room is very hot', 'Smaller room is no problem'],
          note: {
            en: 'Enough words to explain the problem clearly. Next step: phrases like “It’s far too hot to sleep” or “The lift keeps waking me up”.',
            uz: 'Muammoni aniq tushuntirish uchun so‘z yetarli. Keyingi qadam: «It’s far too hot to sleep» yoki «The lift keeps waking me up» kabi iboralar.',
            ru: 'Слов достаточно, чтобы ясно объяснить проблему. Следующий шаг — фразы вроде «It’s far too hot to sleep» или «The lift keeps waking me up».',
          },
        },
        {
          id: 'accuracy', score: 2.5,
          evidence: ['Yesterday I am sleep very bad', 'Which floor it is?'],
          note: {
            en: 'Two patterns to fix: the past simple for finished time (I didn’t sleep well) and question order (Which floor is it?). The verb tense and question drills target exactly these.',
            uz: 'Ikki narsani tuzatish kerak: tugagan vaqt uchun past simple (I didn’t sleep well) va savoldagi tartib (Which floor is it?). Fe’l zamonlari va savol tuzish mashqlari aynan shularga qaratilgan.',
            ru: 'Две модели для исправления: past simple для законченного времени (I didn’t sleep well) и порядок слов в вопросе (Which floor is it?). Тренажёры по временам и вопросам нацелены именно на это.',
          },
        },
        {
          id: 'fluency', score: 3,
          evidence: ['Also every ten minutes the lift is making noise'],
          note: {
            en: 'You kept going in full sentences with few long pauses (104 words per minute). Link ideas with because and so to make longer turns.',
            uz: 'Siz to‘liq gaplar bilan, kam to‘xtab gapirdingiz (daqiqasiga 104 so‘z). Uzunroq javoblar uchun fikrlarni because va so bilan bog‘lang.',
            ru: 'Вы говорили полными предложениями, почти без долгих пауз (104 слова в минуту). Связывайте мысли с помощью because и so, чтобы реплики были длиннее.',
          },
        },
        {
          id: 'interaction', score: 3,
          evidence: ['Is it possible to change my room?', 'So I go to room 612 now, yes?'],
          note: {
            en: 'A clear request and a good check of the room number. The ending was too short: thank the receptionist and confirm the next step.',
            uz: 'Iltimos aniq, xona raqamini tekshirib olish ham yaxshi. Yakun juda qisqa bo‘ldi: qabulxona xodimiga rahmat ayting va keyingi qadamni tasdiqlang.',
            ru: 'Чёткая просьба и хорошая проверка номера комнаты. Концовка слишком короткая: поблагодарите администратора и подтвердите следующий шаг.',
          },
        },
        {
          id: 'pronunciation', score: null,
          evidence: [],
          note: {
            en: 'Not scored from a transcript. A shadowing set gives you feedback on how you sound.',
            uz: 'Matn bo‘yicha baholanmaydi. Talaffuzingiz haqida fikr olish uchun shadowing mashqini bajaring.',
            ru: 'По расшифровке не оценивается. Чтобы получить отзыв о произношении, пройдите шэдоуинг.',
          },
        },
      ],
      scorecard: { talkRatio: 0.46, questionsAsked: 3, averageTurnWords: 10 },
      betterLines: [
        {
          said: 'Yesterday I am sleep very bad.',
          better: 'I didn’t sleep well last night.',
          why: {
            en: 'A finished time (last night) needs the past simple, and “sleep well” is the natural phrase.',
            uz: 'Tugagan vaqt (last night) past simple talab qiladi, «sleep well» esa tabiiy ibora.',
            ru: 'Законченное время (last night) требует past simple, а «sleep well» — естественное сочетание.',
          },
        },
        {
          said: 'Is it possible to change my room?',
          better: 'Would it be possible to move to another room tonight?',
          why: {
            en: '“Would it be possible” is softer, and “tonight” makes clear what you need.',
            uz: '«Would it be possible» yumshoqroq, «tonight» esa nima kerakligini aniq ko‘rsatadi.',
            ru: '«Would it be possible» звучит мягче, а «tonight» ясно показывает, что вам нужно.',
          },
        },
        {
          said: 'OK. Bye.',
          better: 'Thank you so much — room 612. I’ll come down for the key now.',
          why: {
            en: 'Thanking her and repeating the room number closes the call warmly and checks the detail.',
            uz: 'Rahmat aytib, xona raqamini takrorlash qo‘ng‘iroqni iliq yakunlaydi va tafsilotni tekshiradi.',
            ru: 'Благодарность и повтор номера комнаты тепло завершают звонок и помогают проверить детали.',
          },
        },
      ],
    },
  },
  {
    id: 'sample.weekly',
    kind: 'weekly_report',
    title: {
      en: 'Example: weekly fluency report',
      uz: 'Namuna: haftalik ravonlik hisoboti',
      ru: 'Пример: еженедельный отчёт о беглости',
    },
    preview: {
      en: 'An example week for a fictional learner, Malika: 112 minutes over 6 days. Pace up from 92 to 104 words per minute, fillers down from 5.2 to 3.6 a minute, errors down from 9.1 to 6.8 per 100 words.',
      uz: 'Uydirma o‘quvchi Malikaning namunaviy haftasi: 6 kunda 112 daqiqa. Nutq sur’ati daqiqasiga 92 so‘zdan 104 taga oshdi, to‘ldiruvchi so‘zlar daqiqasiga 5,2 dan 3,6 taga, xatolar har 100 so‘zga 9,1 dan 6,8 taga kamaydi.',
      ru: 'Пример недели вымышленной ученицы Малики: 112 минут за 6 дней. Темп вырос с 92 до 104 слов в минуту, слов-паразитов стало меньше — с 5,2 до 3,6 в минуту, ошибок — с 9,1 до 6,8 на 100 слов.',
    },
    body: {
      rows: [
        { label: { en: 'Words per minute', uz: 'Daqiqadagi so‘zlar', ru: 'Слов в минуту' }, before: 92, after: 104, unit: 'wpm' },
        { label: { en: 'Fillers per minute', uz: 'Daqiqadagi to‘ldiruvchi so‘zlar', ru: 'Слов-паразитов в минуту' }, before: 5.2, after: 3.6, unit: '/min', lowerIsBetter: true },
        { label: { en: 'Long pauses per role-play', uz: 'Har bir rolli suhbatdagi uzoq pauzalar', ru: 'Долгих пауз за диалог' }, before: 6, after: 4, lowerIsBetter: true },
        { label: { en: 'Distinct words used', uz: 'Ishlatilgan turli so‘zlar', ru: 'Разных слов' }, before: 186, after: 241 },
        { label: { en: 'Errors per 100 words', uz: 'Har 100 so‘zdagi xatolar', ru: 'Ошибок на 100 слов' }, before: 9.1, after: 6.8, lowerIsBetter: true },
        { label: { en: 'Role-play goals met', uz: 'Bajarilgan suhbat maqsadlari', ru: 'Выполненные цели диалогов' }, before: 58, after: 75, unit: '%' },
      ],
      minutes: 112,
      streak: 6,
      focus: [
        {
          en: 'Past simple for finished time: “I didn’t sleep well last night”, not “I am sleep bad”.',
          uz: 'Tugagan vaqt uchun past simple: «I am sleep bad» emas, «I didn’t sleep well last night».',
          ru: 'Past simple для законченного времени: «I didn’t sleep well last night», а не «I am sleep bad».',
        },
        {
          en: 'Question order: “Which floor is it?”, not “Which floor it is?”.',
          uz: 'Savoldagi tartib: «Which floor it is?» emas, «Which floor is it?».',
          ru: 'Порядок слов в вопросе: «Which floor is it?», а не «Which floor it is?».',
        },
        {
          en: 'Closing a conversation: thank the person and repeat the key detail.',
          uz: 'Suhbatni yakunlash: suhbatdoshga rahmat ayting va asosiy tafsilotni takrorlang.',
          ru: 'Завершение разговора: поблагодарите собеседника и повторите главную деталь.',
        },
      ],
    },
  },
  {
    id: 'sample.plan',
    kind: 'plan',
    title: {
      en: 'Example: a week of the 12-week plan to B1+',
      uz: 'Namuna: B1+ ga 12 haftalik rejaning bir haftasi',
      ru: 'Пример: неделя из 12-недельного плана до B1+',
    },
    preview: {
      en: 'An example first week for a fictional learner, Malika, at B1 with a B1+ target and 15 minutes a day: a role-play every day, short phrase reviews, two shadowing sessions and drills for her own errors.',
      uz: 'Uydirma o‘quvchi Malika uchun namunaviy birinchi hafta: darajasi B1, maqsadi B1+, kuniga 15 daqiqa. Har kuni rolli suhbat, qisqa iboralar takrori, ikki marta shadowing va o‘z xatolari bo‘yicha mashqlar.',
      ru: 'Пример первой недели для вымышленной ученицы Малики: уровень B1, цель B1+, 15 минут в день. Каждый день ролевой диалог, короткое повторение фраз, два шэдоуинга и тренажёры по её собственным ошибкам.',
    },
    body: {
      target: 3.5,
      weeks: 12,
      days: [
        {
          day: { en: 'Monday', uz: 'Dushanba', ru: 'Понедельник' },
          tasks: [
            { en: 'Role-play: Ordering at a café (5 min)', uz: 'Rolli suhbat: Kafeda buyurtma berish (5 daq.)', ru: 'Ролевой диалог: Заказ в кафе (5 мин)' },
            { en: 'Phrase bank: Ordering and paying, 10 cards (5 min)', uz: 'Iboralar banki: Buyurtma va to‘lov, 10 ta karta (5 daq.)', ru: 'Банк фраз: Заказ и оплата, 10 карточек (5 мин)' },
            { en: 'Drill: Don’t forget “be” (5 min)', uz: 'Mashq: «Be»ni unutmang (5 daq.)', ru: 'Тренажёр: Не забывайте «be» (5 мин)' },
          ],
        },
        {
          day: { en: 'Tuesday', uz: 'Seshanba', ru: 'Вторник' },
          tasks: [
            { en: 'Shadowing B1: 6 sentences (5 min)', uz: 'Shadowing B1: 6 ta gap (5 daq.)', ru: 'Шэдоуинг B1: 6 предложений (5 мин)' },
            { en: 'Role-play: Asking for directions (5 min)', uz: 'Rolli suhbat: Yo‘l so‘rash (5 daq.)', ru: 'Ролевой диалог: Как пройти? (5 мин)' },
            { en: 'Phrase bank: Asking for help and directions (5 min)', uz: 'Iboralar banki: Yordam va yo‘l so‘rash (5 daq.)', ru: 'Банк фраз: Просьба о помощи и дорога (5 мин)' },
          ],
        },
        {
          day: { en: 'Wednesday', uz: 'Chorshanba', ru: 'Среда' },
          tasks: [
            { en: 'Role-play: Meeting a new neighbour (6 min)', uz: 'Rolli suhbat: Yangi qo‘shni bilan tanishuv (6 daq.)', ru: 'Ролевой диалог: Знакомство с соседкой (6 мин)' },
            { en: 'Drill: Asking questions correctly (5 min)', uz: 'Mashq: Savollarni to‘g‘ri tuzish (5 daq.)', ru: 'Тренажёр: Правильные вопросы (5 мин)' },
            { en: 'Phrase bank: review the cards due today (4 min)', uz: 'Iboralar banki: bugun takrorlanadigan kartalar (4 daq.)', ru: 'Банк фраз: карточки на сегодня (4 мин)' },
          ],
        },
        {
          day: { en: 'Thursday', uz: 'Payshanba', ru: 'Четверг' },
          tasks: [
            { en: 'Shadowing B1: the other 6 sentences (5 min)', uz: 'Shadowing B1: qolgan 6 ta gap (5 daq.)', ru: 'Шэдоуинг B1: остальные 6 предложений (5 мин)' },
            { en: 'Role-play: A problem with your hotel room (6 min)', uz: 'Rolli suhbat: Mehmonxona xonasidagi muammo (6 daq.)', ru: 'Ролевой диалог: Проблема с номером в отеле (6 мин)' },
            { en: 'Phrase bank: Travel and hotels (4 min)', uz: 'Iboralar banki: Sayohat va mehmonxona (4 daq.)', ru: 'Банк фраз: Путешествия и отели (4 мин)' },
          ],
        },
        {
          day: { en: 'Friday', uz: 'Juma', ru: 'Пятница' },
          tasks: [
            { en: 'Role-play: At the pharmacy (5 min)', uz: 'Rolli suhbat: Dorixonada (5 daq.)', ru: 'Ролевой диалог: В аптеке (5 мин)' },
            { en: 'Drill: Verb tenses in conversation (5 min)', uz: 'Mashq: Suhbatda fe’l zamonlari (5 daq.)', ru: 'Тренажёр: Времена глаголов в разговоре (5 мин)' },
            { en: 'Phrase bank: At the doctor and the pharmacy (5 min)', uz: 'Iboralar banki: Shifokor va dorixonada (5 daq.)', ru: 'Банк фраз: У врача и в аптеке (5 мин)' },
          ],
        },
        {
          day: { en: 'Saturday', uz: 'Shanba', ru: 'Суббота' },
          tasks: [
            { en: 'Role-play: Lunch with a colleague (6 min)', uz: 'Rolli suhbat: Hamkasb bilan tushlik (6 daq.)', ru: 'Ролевой диалог: Обед с коллегой (6 мин)' },
            { en: 'Shadowing: your three hardest sentences again (5 min)', uz: 'Shadowing: eng qiyin uchta gapingizni qayta takrorlang (5 daq.)', ru: 'Шэдоуинг: ещё раз три самых трудных предложения (5 мин)' },
            { en: 'Phrase bank: review the cards due today (4 min)', uz: 'Iboralar banki: bugun takrorlanadigan kartalar (4 daq.)', ru: 'Банк фраз: карточки на сегодня (4 мин)' },
          ],
        },
        {
          day: { en: 'Sunday', uz: 'Yakshanba', ru: 'Воскресенье' },
          tasks: [
            { en: 'Rest, or one role-play of your choice', uz: 'Dam olish yoki o‘zingiz tanlagan bitta rolli suhbat', ru: 'Отдых или один ролевой диалог на ваш выбор' },
            { en: 'Read your weekly fluency report (3 min)', uz: 'Haftalik ravonlik hisobotingizni o‘qing (3 daq.)', ru: 'Прочитайте еженедельный отчёт о беглости (3 мин)' },
          ],
        },
      ],
    },
  },
];
