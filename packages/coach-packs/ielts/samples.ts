import type { Sample } from '../src/types.ts';

// Static examples for people without a plan. Each is labelled as an example; the learner
// and the work are fictional and the numbers are illustrative, not real results.
// Evidence quotes come from the sample's own text (the `said` lines of the upgrades in the
// speaking report, the `original` lines of the corrections in the writing report).

export const samples: Sample[] = [
  {
    id: 'sample.speaking-report',
    kind: 'speaking_report',
    title: { en: 'Example: Speaking report (Part 2)', uz: 'Namuna: Speaking hisoboti (2-qism)', ru: 'Пример: отчёт по Speaking (часть 2)' },
    preview: {
      en: 'An example of the report after a Part 2 talk: a band for each criterion with quotes from the learner’s own words, measured fluency, and four “say it better” upgrades to re-record. The learner is fictional.',
      uz: '2-qismdagi nutqdan keyingi hisobot namunasi: har bir mezon bo‘yicha ball va o‘quvchining o‘z gaplaridan iqtiboslar, o‘lchangan ravonlik ko‘rsatkichlari hamda qayta yozib olish uchun to‘rtta «yaxshiroq ayting» varianti. O‘quvchi to‘qima shaxs.',
      ru: 'Пример отчёта после монолога (часть 2): балл по каждому критерию с цитатами из слов ученика, измеренная беглость и четыре варианта «скажи лучше» для перезаписи. Ученик вымышленный.',
    },
    body: {
      task: 'Speaking Part 2: Describe a place in your country that you would recommend to visitors.',
      overall: 5.5,
      criteria: [
        {
          id: 'fluency_coherence',
          score: 6,
          evidence: ['Um, in winter you can do skiing and, um, in summer'],
          note: {
            en: 'You kept talking for 1 minute 44 seconds and covered every point, but fillers and restarts break the flow. Next step: link ideas with a phrase such as “what I love most is…” instead of pausing.',
            uz: '1 daqiqa 44 soniya gapirdingiz va barcha bandlarni yoritdingiz, lekin «um» va qayta boshlashlar nutq oqimini buzadi. Keyingi qadam: to‘xtab qolish o‘rniga g‘oyalarni «what I love most is…» kabi ibora bilan bog‘lang.',
            ru: 'Вы говорили 1 минуту 44 секунды и раскрыли все пункты, но «um» и перезапуски фраз прерывают речь. Следующий шаг: вместо пауз связывайте мысли фразой вроде «what I love most is…».',
          },
        },
        {
          id: 'lexical_resource',
          score: 6,
          evidence: ['you can do walking in mountains', 'The air is very very clean'],
          note: {
            en: 'You have enough words to describe the place, but “do walking” and “very very clean” are not natural. Next step: precise activity verbs (go hiking) and strong adjectives (stunning, incredibly fresh).',
            uz: 'Joyni tasvirlash uchun so‘zlaringiz yetarli, ammo «do walking» va «very very clean» tabiiy eshitilmaydi. Keyingi qadam: aniq fe’llar (go hiking) va kuchli sifatlar (stunning, incredibly fresh).',
            ru: 'Слов хватает, чтобы описать место, но «do walking» и «very very clean» звучат неестественно. Следующий шаг: точные глаголы действий (go hiking) и сильные прилагательные (stunning, incredibly fresh).',
          },
        },
        {
          id: 'grammatical_range_accuracy',
          score: 5,
          evidence: ['Chimgan is very beautiful place', 'last time I go with my friends'],
          note: {
            en: 'Simple sentences are mostly right, but articles go missing and the past tense slips. Next step: a or an before a singular noun, and the past simple for a finished trip.',
            uz: 'Oddiy gaplar asosan to‘g‘ri, lekin artikllar tushib qoladi va o‘tgan zamon chalkashadi. Keyingi qadam: birlikdagi ot oldida a yoki an, tugagan sayohat uchun past simple.',
            ru: 'Простые предложения в основном верны, но пропадают артикли и сбивается прошедшее время. Следующий шаг: a или an перед существительным в единственном числе и past simple для завершённой поездки.',
          },
        },
        {
          id: 'pronunciation',
          score: null,
          evidence: [],
          note: {
            en: 'Not scored: pronunciation needs analysis of the recording itself, and a transcript cannot show it. The coach never guesses this band.',
            uz: 'Baholanmadi: talaffuz uchun yozuvning o‘zini tahlil qilish kerak, matndan uni aniqlab bo‘lmaydi. Murabbiy bu ballni hech qachon taxmin qilmaydi.',
            ru: 'Не оценено: для произношения нужен анализ самой записи, по расшифровке его не определить. Коуч никогда не угадывает этот балл.',
          },
        },
      ],
      metrics: { wpm: 116, fillersPerMinute: 4.6, longPauses: 3, seconds: 104 },
      upgrades: [
        {
          said: 'Chimgan is very beautiful place in mountains near to Tashkent.',
          better: 'Chimgan is a stunning spot in the mountains, only about an hour’s drive from Tashkent.',
          why: {
            en: 'A singular countable noun needs a or an (a stunning spot). “Near to” becomes “near”, and “an hour’s drive from” tells the listener exactly where it is.',
            uz: 'Birlikdagi sanaladigan ot oldida a yoki an kerak (a stunning spot). «Near to» o‘rniga «near» deyiladi, «an hour’s drive from» esa joyni aniq ko‘rsatadi.',
            ru: 'Перед исчисляемым существительным в единственном числе нужен a или an (a stunning spot). Вместо «near to» — просто «near», а «an hour’s drive from» точно показывает, где это место.',
          },
        },
        {
          said: 'Um, in winter you can do skiing and, um, in summer you can do walking in mountains.',
          better: 'In winter you can go skiing, and in summer you can go hiking along the mountain trails.',
          why: {
            en: 'Sports and activities ending in -ing take “go”: go skiing, go hiking. “Do walking” is a word-for-word translation. Dropping the fillers keeps the sentence moving.',
            uz: '-ing bilan tugaydigan sport va mashg‘ulotlar «go» bilan ishlatiladi: go skiing, go hiking. «Do walking» — so‘zma-so‘z tarjima. «Um»larni olib tashlasangiz, gap ravon chiqadi.',
            ru: 'Виды спорта и занятия на -ing употребляются с «go»: go skiing, go hiking. «Do walking» — дословный перевод. Без «um» фраза звучит увереннее.',
          },
        },
        {
          said: 'The air is very very clean and you feel yourself relax.',
          better: 'The air is incredibly fresh, and you instantly feel more relaxed.',
          why: {
            en: 'Replace “very very” with one strong adverb (incredibly). “Feel yourself relax” copies a pattern from Uzbek and Russian; in English you simply feel relaxed.',
            uz: '«Very very» o‘rniga bitta kuchli ravish ishlating (incredibly). «Feel yourself relax» o‘zbek va rus tilidagi qolipdan ko‘chirilgan; inglizchada shunchaki «feel relaxed» deyiladi.',
            ru: 'Вместо «very very» — одно сильное наречие (incredibly). «Feel yourself relax» — калька с «чувствовать себя»; по-английски просто «feel relaxed».',
          },
        },
        {
          said: 'I was there many times, last time I go with my friends in August.',
          better: 'I’ve been there many times; the last time was in August, when I went with some friends.',
          why: {
            en: 'Use the present perfect for experience up to now (I’ve been there many times) and the past simple for a finished time (in August, I went).',
            uz: 'Hozirgacha bo‘lgan tajriba uchun present perfect (I’ve been there many times), tugagan vaqt uchun esa past simple ishlating (in August, I went).',
            ru: 'Present perfect — для опыта до настоящего момента (I’ve been there many times), past simple — для завершённого времени (in August, I went).',
          },
        },
      ],
    },
  },
  {
    id: 'sample.writing-report',
    kind: 'writing_report',
    title: { en: 'Example: Writing Task 2 report', uz: 'Namuna: Writing Task 2 hisoboti', ru: 'Пример: отчёт по Writing Task 2' },
    preview: {
      en: 'An example of a Task 2 report: a band for each criterion with quotes from the essay, corrections tagged by error type so your drills target them, and one paragraph rewritten at bands 6, 7 and 8. The essay and the learner are fictional.',
      uz: 'Task 2 hisoboti namunasi: har bir mezon bo‘yicha ball va inshodan iqtiboslar, xato turi bo‘yicha belgilangan tuzatishlar (mashqlar aynan shularga qaratiladi) hamda 6, 7 va 8 ballga qayta yozilgan bitta xatboshi. Insho va o‘quvchi to‘qima.',
      ru: 'Пример отчёта по Task 2: балл по каждому критерию с цитатами из эссе, исправления с пометкой типа ошибки (на них нацелены ваши упражнения) и один абзац, переписанный на 6, 7 и 8 баллов. Эссе и ученик вымышленные.',
    },
    body: {
      task: 'Writing Task 2: Doctors in many countries report that teenagers are sleeping much less than they need to. Why is this happening? Who should be responsible for solving this problem: parents, schools or teenagers themselves?',
      overall: 5.5,
      criteria: [
        {
          id: 'task_response',
          score: 6,
          evidence: ['teenagers spends a lot of time on phone', 'parents also responsible'],
          note: {
            en: 'Both questions are answered: the causes (phones, homework, early starts) and who is responsible. The view on responsibility appears only in the last paragraph and is not explained, so the answer is uneven.',
            uz: 'Ikkala savolga ham javob berilgan: sabablar (telefon, uy vazifasi, erta boshlanadigan darslar) va kim mas’ulligi. Ammo mas’uliyat haqidagi fikr faqat oxirgi xatboshida paydo bo‘ladi va asoslanmagan, shuning uchun javob notekis.',
            ru: 'Ответ дан на оба вопроса: причины (телефоны, домашние задания, ранние уроки) и кто должен решать проблему. Но мнение об ответственности появляется только в последнем абзаце и не объяснено, поэтому ответ неравномерный.',
          },
        },
        {
          id: 'coherence_cohesion',
          score: 6,
          evidence: ['In the other hand'],
          note: {
            en: 'Clear paragraphs with one idea each, but the linking is mechanical and one fixed phrase is wrong. Next step: link with referencing (this habit, such pressure) rather than a linker at the start of every sentence.',
            uz: 'Har bir xatboshida bitta g‘oya, tuzilish aniq, lekin bog‘lanish mexanik va bitta turg‘un ibora noto‘g‘ri. Keyingi qadam: har gapni bog‘lovchi bilan boshlash o‘rniga this habit, such pressure kabi ishora so‘zlaridan foydalaning.',
            ru: 'Абзацы чёткие, по одной мысли в каждом, но связки механические, и одно устойчивое выражение употреблено неверно. Следующий шаг: связывайте мысли отсылками (this habit, such pressure), а не связкой в начале каждого предложения.',
          },
        },
        {
          id: 'lexical_resource',
          score: 5,
          evidence: ['it makes a big damage for their health', 'because of the homeworks and tutors'],
          note: {
            en: 'The topic words are there, but collocation and countability errors are frequent. Next step: learn the partners of key nouns (do damage to, heavy workload, private tutoring).',
            uz: 'Mavzuga oid so‘zlar bor, lekin so‘z birikmasi va sanaladigan/sanalmaydigan otlar bo‘yicha xatolar ko‘p. Keyingi qadam: asosiy otlarning juftlarini yodlang (do damage to, heavy workload, private tutoring).',
            ru: 'Тематическая лексика есть, но часты ошибки в сочетаемости и в исчисляемости. Следующий шаг: учите устойчивых «партнёров» ключевых слов (do damage to, heavy workload, private tutoring).',
          },
        },
        {
          id: 'grammatical_range_accuracy',
          score: 5,
          evidence: ['teenagers spends', "Schools start at eight o'clock, students must wake up at six"],
          note: {
            en: 'Complex sentences are attempted, but agreement errors and comma splices recur. Next step: check every plural subject against its verb, and join two full sentences with so, because or a full stop.',
            uz: 'Murakkab gaplar tuzishga harakat bor, lekin ega-kesim moslashuvi xatolari va vergul bilan qo‘shilgan gaplar takrorlanadi. Keyingi qadam: har bir ko‘plikdagi egani kesim bilan tekshiring, ikki to‘liq gapni so, because yoki nuqta bilan ajrating.',
            ru: 'Сложные предложения есть, но повторяются ошибки согласования и предложения, склеенные запятой. Следующий шаг: проверяйте каждое подлежащее во множественном числе со сказуемым и соединяйте два полных предложения через so, because или точку.',
          },
        },
      ],
      corrections: [
        {
          original: 'Nowadays teenagers spends a lot of time on phone at night.',
          corrected: 'Nowadays, teenagers spend a lot of time on their phones at night.',
          tag: 'subject_verb_agreement',
          why: {
            en: 'A plural subject (teenagers) takes a plural verb (spend), and “their phones” names whose phones.',
            uz: 'Ko‘plikdagi ega (teenagers) ko‘plikdagi kesim talab qiladi (spend), «their phones» esa kimning telefoni ekanini bildiradi.',
            ru: 'Подлежащее во множественном числе (teenagers) требует глагола во множественном числе (spend), а «their phones» уточняет, чьи телефоны.',
          },
        },
        {
          original: 'They sleep late because of the homeworks and tutors.',
          corrected: 'They go to bed late because of homework and private tutoring.',
          tag: 'countable_nouns',
          why: {
            en: 'Homework is uncountable: no -s and no “a”. “Private tutoring” names the activity rather than the people.',
            uz: 'Homework sanalmaydigan ot: -s qo‘shilmaydi va «a» ishlatilmaydi. «Private tutoring» odamlarni emas, mashg‘ulotning o‘zini bildiradi.',
            ru: 'Homework — неисчисляемое: без -s и без «a». «Private tutoring» называет само занятие, а не людей.',
          },
        },
        {
          original: 'Lack of sleep it makes a big damage for their health.',
          corrected: 'Lack of sleep does serious damage to their health.',
          tag: 'collocations',
          why: {
            en: 'In English you “do damage to” something; “make damage for” is a word-for-word translation. The extra “it” repeats the subject and must go.',
            uz: 'Inglizchada «do damage to» deyiladi; «make damage for» — so‘zma-so‘z tarjima. Ortiqcha «it» egani takrorlaydi, uni olib tashlash kerak.',
            ru: 'По-английски говорят «do damage to»; «make damage for» — дословный перевод. Лишнее «it» повторяет подлежащее, его нужно убрать.',
          },
        },
        {
          original: "Schools start at eight o'clock, students must wake up at six.",
          corrected: "Schools start at eight o'clock, so students have to wake up at six.",
          tag: 'sentence_boundaries',
          why: {
            en: 'Two full sentences cannot be joined by a comma alone. Add “so” to show the result, or use a full stop.',
            uz: 'Ikki to‘liq gapni faqat vergul bilan qo‘shib bo‘lmaydi. Natijani ko‘rsatish uchun «so» qo‘shing yoki nuqta qo‘ying.',
            ru: 'Два полных предложения нельзя соединить одной запятой. Добавьте «so», чтобы показать следствие, или поставьте точку.',
          },
        },
        {
          original: 'In the other hand, parents also responsible.',
          corrected: 'On the other hand, parents are also responsible.',
          tag: 'linking_words',
          why: {
            en: 'The fixed phrase is “on the other hand”, and it signals a contrast; here you are adding a point, so “Parents are also responsible” works better on its own. The sentence also needs the verb “are”.',
            uz: 'Turg‘un ibora «on the other hand» bo‘ladi va u qarama-qarshilikni bildiradi; bu yerda siz fikr qo‘shyapsiz, shuning uchun «Parents are also responsible» o‘zi yetarli. Gapda «are» fe’li ham bo‘lishi kerak.',
            ru: 'Устойчивое выражение — «on the other hand», и оно вводит противопоставление; здесь вы добавляете мысль, поэтому лучше просто «Parents are also responsible». В предложении также нужен глагол «are».',
          },
        },
      ],
      ladder: [
        {
          level: 6,
          text: 'There are several reasons why teenagers do not sleep enough. Firstly, many of them spend a lot of time on their phones at night, chatting with friends or watching videos, and they do not notice how late it is. Secondly, they have a lot of homework, and many students also go to private tutors after school, so they start their homework late in the evening. Finally, schools start very early, so students have to wake up at six o’clock. As a result, they often sleep only six or seven hours, which is not enough for their age.',
        },
        {
          level: 7,
          text: 'The main reason teenagers sleep so little is the phone that goes to bed with them. Social media and video apps are designed to keep users scrolling, and a teenager who intends to check one message can easily still be awake an hour later. The problem is made worse by their workload: many students attend private tutoring after school and only begin their homework at nine or ten in the evening. Since most schools start at eight, the time left for sleep is often no more than six hours, well below what doctors recommend for this age group.',
        },
        {
          level: 8,
          text: 'The most obvious culprit is the smartphone that so many teenagers take to bed. Apps built to maximise viewing time make it remarkably easy to lose an hour to scrolling, and the bright screen makes it harder to fall asleep even once the phone is put down. Yet blaming phones alone would be unfair, because the school day leaves little room for rest: after lessons, many students head straight to private tutors and only start their homework late in the evening, while the first class still begins at eight. Squeezed between these demands, a sixteen-year-old may manage six hours of sleep a night, far short of what doctors advise for a body that is still developing.',
        },
      ],
    },
  },
  {
    id: 'sample.weekly-report',
    kind: 'weekly_report',
    title: { en: 'Example: Weekly report', uz: 'Namuna: Haftalik hisobot', ru: 'Пример: недельный отчёт' },
    preview: {
      en: 'An example of the weekly report: what changed in bands, fluency, accuracy and reading, the minutes practised, the streak and three focus points for next week. The numbers are illustrative, not real results.',
      uz: 'Haftalik hisobot namunasi: ballar, ravonlik, aniqlik va Reading’dagi o‘zgarishlar, mashq qilingan daqiqalar, seriya va keyingi hafta uchun uchta asosiy yo‘nalish. Raqamlar namuna uchun, haqiqiy natija emas.',
      ru: 'Пример недельного отчёта: что изменилось в баллах, беглости, точности и Reading, сколько минут занятий, серия и три фокуса на следующую неделю. Цифры условные, это не реальные результаты.',
    },
    body: {
      rows: [
        { label: { en: 'Speaking (overall band)', uz: 'Speaking (umumiy ball)', ru: 'Speaking (общий балл)' }, before: 5.5, after: 6 },
        { label: { en: 'Writing Task 2 (overall band)', uz: 'Writing Task 2 (umumiy ball)', ru: 'Writing Task 2 (общий балл)' }, before: 5, after: 5.5 },
        { label: { en: 'Speaking pace', uz: 'Nutq tezligi', ru: 'Темп речи' }, before: 104, after: 116, unit: 'wpm' },
        { label: { en: 'Fillers per minute', uz: 'Daqiqasiga «um»lar', ru: 'Слов-паразитов в минуту' }, before: 7.2, after: 4.8, unit: '/min', lowerIsBetter: true },
        { label: { en: 'Article errors per 100 words', uz: '100 so‘zga artikl xatolari', ru: 'Ошибок в артиклях на 100 слов' }, before: 3.1, after: 1.9, lowerIsBetter: true },
        { label: { en: 'Reading accuracy', uz: 'Reading aniqligi', ru: 'Точность в Reading' }, before: 62, after: 71, unit: '%' },
        { label: { en: 'Vocabulary cards mastered', uz: 'O‘zlashtirilgan lug‘at kartalari', ru: 'Выученные карточки лексики' }, before: 40, after: 95 },
      ],
      minutes: 214,
      streak: 6,
      focus: [
        {
          en: 'Speaking: bring fillers below 4 a minute by using a linking phrase (what I mean is, the thing is) instead of “um”.',
          uz: 'Speaking: «um» o‘rniga bog‘lovchi ibora (what I mean is, the thing is) ishlatib, daqiqasiga 4 tadan kamaytiring.',
          ru: 'Speaking: сократите слова-паразиты до 4 в минуту — вместо «um» используйте связку (what I mean is, the thing is).',
        },
        {
          en: 'Writing: three 10-minute article drills, then one Task 2 body paragraph checked for a, an and the.',
          uz: 'Writing: artikllar bo‘yicha uchta 10 daqiqalik mashq, so‘ng Task 2 uchun bitta asosiy xatboshi yozib, a, an va the’ni tekshiring.',
          ru: 'Writing: три 10-минутных упражнения на артикли, затем один основной абзац Task 2 с проверкой a, an и the.',
        },
        {
          en: 'Reading: in True / False / Not Given, underline the limiting words (all, some, only, never) before you choose.',
          uz: 'Reading: True / False / Not Given savollarida javob tanlashdan oldin cheklovchi so‘zlarni (all, some, only, never) belgilang.',
          ru: 'Reading: в True / False / Not Given подчёркивайте ограничивающие слова (all, some, only, never) до выбора ответа.',
        },
      ],
    },
  },
  {
    id: 'sample.plan',
    kind: 'plan',
    title: { en: 'Example: one week of a plan to band 7.0', uz: 'Namuna: 7.0 ballga reja — bir hafta', ru: 'Пример: неделя плана на 7.0' },
    preview: {
      en: 'An example week from a 10-week plan to band 7.0 at 40 minutes a day: speaking, writing, reading, listening, vocabulary and drills on your own errors, with a full speaking mock at the weekend. The learner is fictional.',
      uz: 'Kuniga 40 daqiqadan 10 haftada 7.0 ballga mo‘ljallangan rejadan bir hafta namunasi: speaking, writing, reading, listening, lug‘at va o‘z xatolaringiz bo‘yicha mashqlar, dam olish kunida to‘liq Speaking sinovi. O‘quvchi to‘qima shaxs.',
      ru: 'Пример недели из 10-недельного плана на 7.0 по 40 минут в день: speaking, writing, reading, listening, лексика и упражнения на собственные ошибки, а в выходные — полный пробный Speaking. Ученик вымышленный.',
    },
    body: {
      target: 7,
      weeks: 10,
      days: [
        {
          day: { en: 'Monday', uz: 'Dushanba', ru: 'Понедельник' },
          tasks: [
            { en: 'Speaking Part 1: two topics, six questions (10 min)', uz: 'Speaking 1-qism: ikki mavzu, oltita savol (10 daq.)', ru: 'Speaking, часть 1: две темы, шесть вопросов (10 мин)' },
            { en: 'Drill: articles (10 min)', uz: 'Mashq: artikllar (10 daq.)', ru: 'Упражнение: артикли (10 мин)' },
            { en: 'Reading: True / False / Not Given mini-set (15 min)', uz: 'Reading: True / False / Not Given mini-to‘plami (15 daq.)', ru: 'Reading: мини-набор True / False / Not Given (15 мин)' },
            { en: 'Vocabulary review: 20 cards (5 min)', uz: 'Lug‘at takrori: 20 ta karta (5 daq.)', ru: 'Повторение лексики: 20 карточек (5 мин)' },
          ],
        },
        {
          day: { en: 'Tuesday', uz: 'Seshanba', ru: 'Вторник' },
          tasks: [
            { en: 'Writing Task 1: line graph report (20 min)', uz: 'Writing Task 1: chiziqli grafik bo‘yicha hisobot (20 daq.)', ru: 'Writing Task 1: отчёт по линейному графику (20 мин)' },
            { en: 'Listening: form completion mini-set (12 min)', uz: 'Listening: shaklni to‘ldirish mini-to‘plami (12 daq.)', ru: 'Listening: мини-набор на заполнение формы (12 мин)' },
            { en: 'Vocabulary review: 20 cards (8 min)', uz: 'Lug‘at takrori: 20 ta karta (8 daq.)', ru: 'Повторение лексики: 20 карточек (8 мин)' },
          ],
        },
        {
          day: { en: 'Wednesday', uz: 'Chorshanba', ru: 'Среда' },
          tasks: [
            { en: 'Speaking Part 2: one cue card, then re-record two upgrades (15 min)', uz: 'Speaking 2-qism: bitta kartochka, so‘ng ikkita yaxshilangan variantni qayta yozing (15 daq.)', ru: 'Speaking, часть 2: одна карточка, затем перезапишите два улучшенных варианта (15 мин)' },
            { en: 'Reading: matching headings (15 min)', uz: 'Reading: sarlavhalarni moslash (15 daq.)', ru: 'Reading: сопоставление заголовков (15 мин)' },
            { en: 'Drill: subject–verb agreement (10 min)', uz: 'Mashq: ega va kesim moslashuvi (10 daq.)', ru: 'Упражнение: согласование подлежащего и сказуемого (10 мин)' },
          ],
        },
        {
          day: { en: 'Thursday', uz: 'Payshanba', ru: 'Четверг' },
          tasks: [
            { en: 'Writing Task 2: plan and write the body paragraphs (30 min)', uz: 'Writing Task 2: reja tuzing va asosiy xatboshilarni yozing (30 daq.)', ru: 'Writing Task 2: план и основные абзацы (30 мин)' },
            { en: 'Vocabulary review: 20 cards (10 min)', uz: 'Lug‘at takrori: 20 ta karta (10 daq.)', ru: 'Повторение лексики: 20 карточек (10 мин)' },
          ],
        },
        {
          day: { en: 'Friday', uz: 'Juma', ru: 'Пятница' },
          tasks: [
            { en: 'Speaking Part 3: four discussion questions (12 min)', uz: 'Speaking 3-qism: to‘rtta muhokama savoli (12 daq.)', ru: 'Speaking, часть 3: четыре вопроса для дискуссии (12 мин)' },
            { en: 'Listening: multiple choice mini-set (15 min)', uz: 'Listening: ko‘p tanlovli savollar mini-to‘plami (15 daq.)', ru: 'Listening: мини-набор с выбором ответа (15 мин)' },
            { en: 'Drill: linking words (8 min)', uz: 'Mashq: bog‘lovchi so‘zlar (8 daq.)', ru: 'Упражнение: слова-связки (8 мин)' },
            { en: 'Vocabulary review: 20 cards (5 min)', uz: 'Lug‘at takrori: 20 ta karta (5 daq.)', ru: 'Повторение лексики: 20 карточек (5 мин)' },
          ],
        },
        {
          day: { en: 'Saturday', uz: 'Shanba', ru: 'Суббота' },
          tasks: [
            { en: 'Writing Task 2: a full timed essay (40 min)', uz: 'Writing Task 2: vaqt bilan to‘liq insho (40 daq.)', ru: 'Writing Task 2: полное эссе на время (40 мин)' },
          ],
        },
        {
          day: { en: 'Sunday', uz: 'Yakshanba', ru: 'Воскресенье' },
          tasks: [
            { en: 'Full speaking mock, Parts 1–3 (15 min)', uz: 'To‘liq Speaking sinovi, 1–3-qismlar (15 daq.)', ru: 'Полный пробный Speaking, части 1–3 (15 мин)' },
            { en: 'Reading: completion questions (20 min)', uz: 'Reading: to‘ldirish savollari (20 daq.)', ru: 'Reading: вопросы на заполнение (20 мин)' },
            { en: 'Weekly report and next week’s focus (5 min)', uz: 'Haftalik hisobot va keyingi hafta yo‘nalishi (5 daq.)', ru: 'Недельный отчёт и фокус на следующую неделю (5 мин)' },
          ],
        },
      ],
    },
  },
];
