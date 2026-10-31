import type { Activity } from '../src/types.ts';

// One drill per error tag in manifest.ts (`drill.<tag>`). The engine counts each
// learner's recurring errors from speaking and writing scores and offers the drill
// for the tag that keeps coming back. Items mirror the errors Uzbek and Russian
// speakers actually make in IELTS answers; when they run out, AI variants are made.

export const drills: Activity[] = [
  // --- articles ------------------------------------------------------------------------------
  {
    id: 'drill.articles',
    kind: 'drill',
    errorTag: 'articles',
    node: 'grammar',
    levels: [4, 8],
    minutes: 5,
    aiVariants: true,
    title: { en: 'Articles: a, an, the', uz: 'Artikllar: a, an, the', ru: 'Артикли: a, an, the' },
    explain: {
      en: 'Uzbek and Russian have no articles, so they are easy to drop or to overuse. Use a/an with one countable noun you mention for the first time (a new bridge) and with jobs (She is an engineer). Use the when the reader knows which one: it was mentioned before, it is unique (the internet, the government), it is a superlative (the highest), or an of-phrase defines it (the number of cars). Use no article with plurals and uncountables in a general sense (Pollution harms children), with meals, and with most cities and countries. An goes before a vowel sound: an hour, but a university.',
      uz: 'O‘zbek va rus tillarida artikl yo‘q, shuning uchun uni tushirib qoldirish yoki ortiqcha qo‘yish oson. A/an birinchi marta tilga olingan bitta sanaladigan ot oldida (a new bridge) va kasblar bilan (She is an engineer) ishlatiladi. The esa o‘quvchi qaysi biri ekanini bilganda qo‘yiladi: oldin aytilgan, yagona narsa (the internet, the government), orttirma daraja (the highest) yoki of bilan aniqlangan ot (the number of cars). Umumiy ma’nodagi ko‘plik va sanalmaydigan otlar (Pollution harms children), ovqatlanish nomlari, ko‘pchilik shahar va davlat nomlari oldida artikl qo‘yilmaydi. An unli tovush oldidan keladi: an hour, lekin a university.',
      ru: 'В узбекском и русском нет артиклей, поэтому их легко пропустить или поставить лишний. A/an — с одним исчисляемым существительным, которое упоминается впервые (a new bridge), и с профессиями (She is an engineer). The — когда читателю понятно, о чём речь: это уже упоминалось, это единственное в своём роде (the internet, the government), превосходная степень (the highest) или уточнение с of (the number of cars). Без артикля — множественное и неисчисляемое в общем смысле (Pollution harms children), приёмы пищи, большинство городов и стран. An ставится перед гласным звуком: an hour, но a university.',
    },
    items: [
      {
        id: 'a1',
        prompt: 'Choose the correct sentence.',
        options: [
          'The pollution is a serious problem in big cities.',
          'Pollution is a serious problem in big cities.',
          'A pollution is a serious problem in big cities.',
          'Pollution is serious problem in big cities.',
        ],
        answer: 1,
        explanation: {
          en: '“Pollution” means pollution in general and is uncountable, so it takes no article. “Problem” is one countable noun, so it needs “a serious problem”. “The pollution” would mean one particular pollution the reader already knows about, and the last option drops the a that “problem” needs.',
          uz: '«Pollution» bu yerda umuman ifloslanish ma’nosida va sanalmaydi, shuning uchun artiklsiz keladi. «Problem» esa bitta sanaladigan ot, demak «a serious problem» bo‘lishi kerak. «The pollution» o‘quvchi allaqachon biladigan aniq bir ifloslanishni bildiradi, oxirgi variantda esa «problem» oldidagi a tushib qolgan.',
          ru: '«Pollution» здесь — загрязнение вообще, оно неисчисляемое, поэтому без артикля. «Problem» — одно исчисляемое существительное, значит, нужно «a serious problem». «The pollution» означало бы конкретное загрязнение, уже известное читателю, а в последнем варианте пропущен a перед «problem».',
        },
      },
      {
        id: 'a2',
        prompt: 'Choose the correct sentence about a line graph.',
        options: [
          'Number of tourists rose sharply after 2015.',
          'The number of the tourists rose sharply after 2015.',
          'The number of tourists rose sharply after 2015.',
          'A number of tourists rose sharply after 2015.',
        ],
        answer: 2,
        explanation: {
          en: '“The number of + plural noun” is a fixed Task 1 phrase: it is one specific figure on the graph, so it takes the. “A number of tourists” means “several tourists”, which is not what the graph measures. “The tourists” is wrong because tourists in general take no article, and the first option drops the before “number”.',
          uz: '«The number of + ko‘plikdagi ot» Task 1 uchun turg‘un ibora: grafikdagi aniq bir ko‘rsatkich, shuning uchun the oladi. «A number of tourists» «bir qancha sayyohlar» degani, grafik esa buni o‘lchamaydi. «The tourists» noto‘g‘ri, chunki umuman sayyohlar haqida gap ketganda artikl qo‘yilmaydi; birinchi variantda «number» oldidagi the tushib qolgan.',
          ru: '«The number of + существительное во множественном» — устойчивая фраза для Task 1: это конкретный показатель на графике, поэтому the. «A number of tourists» значит «несколько туристов», а график измеряет не это. «The tourists» неверно: туристы вообще идут без артикля, а в первом варианте пропущен the перед «number».',
        },
      },
      {
        id: 'a3',
        prompt: 'Write one word: In 2020, the car was ____ most common way to travel to work in the city.',
        answer: ['the'],
        explanation: {
          en: 'Superlatives (the most common, the highest, the largest) always take the, because there is only one “most common” way. Learners often write “was most common way”, which drops the article that every superlative needs.',
          uz: 'Orttirma daraja (the most common, the highest, the largest) doim the bilan keladi, chunki «eng keng tarqalgan» yo‘l bitta. Ko‘pincha «was most common way» deb yoziladi, bu esa har bir orttirma daraja talab qiladigan artiklni tushirib qoldiradi.',
          ru: 'Превосходная степень (the most common, the highest, the largest) всегда с the: «самый распространённый» способ только один. Частая ошибка — «was most common way», где пропущен артикль, обязательный при превосходной степени.',
        },
      },
      {
        id: 'a4',
        prompt: 'Choose the correct sentence.',
        options: [
          'In recent years the internet has changed the way people shop.',
          'In recent years internet has changed the way people shop.',
          'In recent years an internet has changed the way people shop.',
          'In recent years the internet has changed way people shop.',
        ],
        answer: 0,
        explanation: {
          en: 'There is only one internet, so it is “the internet” (like the government, the environment, the sun). “The way people shop” also needs the, because the clause after it says exactly which way. Dropping either the is a typical error for speakers of languages without articles.',
          uz: 'Internet bitta, shuning uchun «the internet» (the government, the environment, the sun kabi). «The way people shop» ham the talab qiladi, chunki undan keyingi qism aynan qaysi usul ekanini aytadi. Ikki the’dan birini tushirib qoldirish artiklsiz tillarda so‘zlashuvchilarning odatiy xatosi.',
          ru: 'Интернет один, поэтому «the internet» (как the government, the environment, the sun). «The way people shop» тоже с the: придаточное уточняет, какой именно способ. Пропуск любого из этих the — типичная ошибка носителей языков без артиклей.',
        },
      },
      {
        id: 'a5',
        prompt: 'Write one word: My brother wants to become ____ engineer.',
        answer: ['an'],
        explanation: {
          en: 'Jobs need a/an in English: I am a teacher, she wants to be a doctor. “Engineer” begins with a vowel sound, so it is an. In Russian and Uzbek you say the job with no article, which is why it is so often missing in Part 1 answers.',
          uz: 'Ingliz tilida kasb oldida a/an kerak: I am a teacher, she wants to be a doctor. «Engineer» unli tovush bilan boshlanadi, shuning uchun an. O‘zbek va rus tillarida kasb artiklsiz aytiladi, shu sabab 1-qism javoblarida artikl ko‘pincha tushib qoladi.',
          ru: 'Перед профессией в английском нужен a/an: I am a teacher, she wants to be a doctor. «Engineer» начинается с гласного звука, поэтому an. По-русски говорят «хочу быть инженером» без артикля, поэтому в ответах части 1 его часто теряют.',
        },
      },
      {
        id: 'a6',
        prompt: 'Choose the correct sentence.',
        options: [
          'I usually have the breakfast at seven.',
          'I usually have a breakfast at seven.',
          'I usually have breakfast at seven.',
        ],
        answer: 2,
        explanation: {
          en: 'Meals (breakfast, lunch, dinner) take no article when you talk about them in general: have breakfast, after lunch. Use an article only with a description, “a big breakfast”, or for a particular meal, “the dinner we had at the wedding”.',
          uz: 'Ovqatlanish nomlari (breakfast, lunch, dinner) umumiy ma’noda artiklsiz keladi: have breakfast, after lunch. Artikl faqat sifat bilan («a big breakfast») yoki aniq bir ovqat haqida gapirganda («the dinner we had at the wedding») qo‘yiladi.',
          ru: 'Приёмы пищи (breakfast, lunch, dinner) в общем смысле идут без артикля: have breakfast, after lunch. Артикль нужен только с описанием («a big breakfast») или для конкретного случая («the dinner we had at the wedding»).',
        },
      },
      {
        id: 'a7',
        prompt: 'Choose the correct sentence.',
        options: [
          'Government should invest more money in the public transport.',
          'A government should invest more money in a public transport.',
          'The government should invest more money in the public transports.',
          'The government should invest more money in public transport.',
        ],
        answer: 3,
        explanation: {
          en: 'In an essay “the government” means the government of the country you are discussing, which the reader knows, so it takes the. “Public transport” is uncountable and general here, so it has no article and no plural. The other options drop the before “government” or add articles and a plural to “transport”.',
          uz: 'Inshoda «the government» muhokama qilinayotgan mamlakat hukumati, o‘quvchi uni biladi, shuning uchun the. «Public transport» bu yerda umumiy va sanalmaydigan ot, artikl ham, ko‘plik ham olmaydi. Boshqa variantlarda «government» oldidagi the tushib qolgan yoki «transport»ga artikl va ko‘plik qo‘shilgan.',
          ru: 'В эссе «the government» — правительство обсуждаемой страны, читателю оно известно, поэтому the. «Public transport» здесь в общем смысле и неисчисляемое: без артикля и без множественного числа. В остальных вариантах пропущен the перед «government» или к «transport» добавлены артикль и окончание множественного числа.',
        },
      },
      {
        id: 'a8',
        prompt: 'Write one word: A new park opened near my house in 2019. ____ park now attracts hundreds of visitors every weekend.',
        answer: ['the', 'this', 'that'],
        explanation: {
          en: 'The first mention of the park uses a (a new park); the second uses the, because the reader now knows which park. “This” or “that” also works here. Repeating “A park” would sound like a different park, and a singular countable noun cannot stand with no article at all.',
          uz: 'Bog‘ birinchi marta tilga olinganda a (a new park), ikkinchi marta esa the ishlatiladi, chunki endi o‘quvchi qaysi bog‘ ekanini biladi. Bu yerda «this» yoki «that» ham to‘g‘ri. Yana «A park» deyilsa, boshqa bog‘dek tuyuladi, birlikdagi sanaladigan ot esa umuman artiklsiz kela olmaydi.',
          ru: 'При первом упоминании парка — a (a new park), при втором — the, потому что читатель уже знает, о каком парке речь. Здесь подойдёт и «this» или «that». Повторное «A park» прозвучит как другой парк, а исчисляемое существительное в единственном числе не может стоять совсем без артикля.',
        },
      },
    ],
  },

  // --- subject–verb agreement ------------------------------------------------------------------
  {
    id: 'drill.subject_verb_agreement',
    kind: 'drill',
    errorTag: 'subject_verb_agreement',
    node: 'grammar',
    levels: [4, 8],
    minutes: 5,
    aiVariants: true,
    title: { en: 'Subject–verb agreement', uz: 'Ega va kesim moslashuvi', ru: 'Согласование подлежащего и сказуемого' },
    explain: {
      en: 'The verb agrees with the main noun of the subject, not with the nearest noun: The number of cars is rising; One of the reasons is cost; The quality of schools varies. Uncountables (information, money, research), -ing subjects (Living in cities is…) and everyone, each and every take a singular verb. In the present simple, add -s/-es after he, she, it and any singular noun (My father works). Russian and Uzbek verbs change differently, so this -s is easy to forget in fast speech. After there is / there are, the noun that follows decides the verb.',
      uz: 'Kesim eng yaqin ot bilan emas, eganing asosiy oti bilan moslashadi: The number of cars is rising; One of the reasons is cost; The quality of schools varies. Sanalmaydigan otlar (information, money, research), -ing bilan boshlangan ega (Living in cities is…) hamda everyone, each, every birlikdagi kesim oladi. Present simple’da he, she, it va har qanday birlikdagi otdan keyin fe’lga -s/-es qo‘shiladi (My father works). O‘zbek va rus tillarida fe’l boshqacha o‘zgaradi, shu sabab tez nutqda bu -s oson unutiladi. There is / there are’dan keyin keladigan ot kesimni belgilaydi.',
      ru: 'Сказуемое согласуется с главным существительным подлежащего, а не с ближайшим: The number of cars is rising; One of the reasons is cost; The quality of schools varies. Неисчисляемые (information, money, research), подлежащее с -ing (Living in cities is…), а также everyone, each, every требуют единственного числа. В present simple после he, she, it и любого существительного в единственном числе добавляется -s/-es (My father works). В русском и узбекском глагол изменяется иначе, поэтому в быстрой речи это -s легко забыть. После there is / there are форму глагола определяет существительное, которое идёт следом.',
    },
    items: [
      {
        id: 'b1',
        prompt: 'Choose the correct sentence.',
        options: [
          'The number of students who study abroad are increasing every year.',
          'The number of students who study abroad is increasing every year.',
          'The number of students who study abroad increasing every year.',
        ],
        answer: 1,
        explanation: {
          en: 'The subject is “the number”, which is singular, so the verb is “is increasing”. “Students” is only part of the of-phrase and does not control the verb. The last option has no auxiliary verb at all, so it is not a full sentence.',
          uz: 'Ega «the number» — birlikda, shuning uchun kesim «is increasing». «Students» faqat of bilan birikmaning bir qismi, kesimni u boshqarmaydi. Oxirgi variantda yordamchi fe’l umuman yo‘q, demak u to‘liq gap emas.',
          ru: 'Подлежащее — «the number», оно в единственном числе, поэтому «is increasing». «Students» — лишь часть оборота с of и не управляет глаголом. В последнем варианте вообще нет вспомогательного глагола, это не полное предложение.',
        },
      },
      {
        id: 'b2',
        prompt: 'Write one word: One of the main reasons for traffic jams ____ the lack of good public transport.',
        answer: ['is', 'was'],
        explanation: {
          en: 'The subject is “one” (one of the reasons), so the verb is singular: is. Learners often write “are” because “reasons” and “jams” are plural and close to the gap, but neither of them is the subject.',
          uz: 'Ega «one» (one of the reasons), shuning uchun kesim birlikda: is. Ko‘pincha «are» deb yoziladi, chunki bo‘sh joy yonida ko‘plikdagi «reasons» va «jams» turibdi, lekin ularning hech biri ega emas.',
          ru: 'Подлежащее — «one» (one of the reasons), поэтому глагол в единственном числе: is. Часто пишут «are», потому что рядом стоят «reasons» и «jams» во множественном, но подлежащее не они.',
        },
      },
      {
        id: 'b3',
        prompt: 'Choose the correct sentence.',
        options: [
          'My father work in a bank and he like his job.',
          'My father working in a bank and he liking his job.',
          'My father works in a bank and he like his job.',
          'My father works in a bank and he likes his job.',
        ],
        answer: 3,
        explanation: {
          en: 'In the present simple, a singular subject (my father, he) needs -s on the verb: works, likes. The third option fixes the first verb but forgets the second, which is exactly what happens in fast Part 1 answers. “Working” and “liking” without am/is are not complete verbs.',
          uz: 'Present simple’da birlikdagi egadan (my father, he) keyin fe’lga -s qo‘shiladi: works, likes. Uchinchi variantda birinchi fe’l to‘g‘ri, ikkinchisi esa -s’siz qolgan — 1-qismdagi tez javoblarda aynan shunday bo‘ladi. Am/is’siz «working» va «liking» to‘liq kesim emas.',
          ru: 'В present simple при подлежащем в единственном числе (my father, he) у глагола -s: works, likes. В третьем варианте первый глагол исправлен, а второй забыт — именно так бывает в быстрых ответах части 1. «Working» и «liking» без am/is не являются полным сказуемым.',
        },
      },
      {
        id: 'b4',
        prompt: 'Choose the word that fits: “The information in these reports ____ out of date.”',
        options: ['are', 'were', 'is', 'have been'],
        answer: 2,
        explanation: {
          en: '“Information” is uncountable, so it always takes a singular verb: the information is. “Reports” is plural but it sits inside the phrase “in these reports” and is not the subject. Are, were and have been are all plural forms.',
          uz: '«Information» sanalmaydigan ot, shuning uchun doim birlikdagi kesim oladi: the information is. «Reports» ko‘plikda, lekin u «in these reports» birikmasi ichida turibdi va ega emas. Are, were va have been — ko‘plik shakllari.',
          ru: '«Information» — неисчисляемое, поэтому глагол всегда в единственном числе: the information is. «Reports» во множественном, но стоит внутри оборота «in these reports» и подлежащим не является. Are, were и have been — формы множественного числа.',
        },
      },
      {
        id: 'b5',
        prompt: 'Choose the correct sentence.',
        options: [
          'Living in big cities has many advantages.',
          'Living in big cities have many advantages.',
          'Living in big cities are having many advantages.',
        ],
        answer: 0,
        explanation: {
          en: 'An -ing subject (living in big cities) is one activity, so it takes a singular verb: has. The plural “cities” tempts you to write “have”, but the subject is “living”. “Have” in the sense of “own” is also not used in the continuous.',
          uz: '-ing bilan boshlangan ega (living in big cities) bitta harakat, shuning uchun birlikdagi kesim oladi: has. Ko‘plikdagi «cities» «have» deb yozishga undaydi, lekin ega — «living». «Ega bo‘lmoq» ma’nosidagi «have» davomli zamonda ham ishlatilmaydi.',
          ru: 'Подлежащее с -ing (living in big cities) — одно действие, поэтому глагол в единственном числе: has. «Cities» во множественном подталкивает к «have», но подлежащее — «living». «Have» в значении «иметь» не употребляется и в continuous.',
        },
      },
      {
        id: 'b6',
        prompt: 'Write one word: There ____ many reasons why young people leave their villages.',
        answer: ['are', 'were'],
        explanation: {
          en: 'After “there”, the verb agrees with the noun that follows: “many reasons” is plural, so “there are”. “There is many reasons” is a frequent spoken error; use “there is” only before a singular or uncountable noun (there is a reason, there is little money).',
          uz: '«There»dan keyin kesim undan keyingi ot bilan moslashadi: «many reasons» ko‘plikda, shuning uchun «there are». «There is many reasons» nutqda tez-tez uchraydigan xato; «there is» faqat birlikdagi yoki sanalmaydigan otdan oldin keladi (there is a reason, there is little money).',
          ru: 'После «there» глагол согласуется с существительным, которое идёт следом: «many reasons» — множественное, поэтому «there are». «There is many reasons» — частая ошибка в речи; «there is» ставится только перед единственным числом или неисчисляемым (there is a reason, there is little money).',
        },
      },
      {
        id: 'b7',
        prompt: 'Choose the correct sentence.',
        options: [
          'Everyone in my family enjoy cooking.',
          'Everyone in my family are enjoying cooking.',
          'Everyone in my family enjoys cooking.',
          'Everyone in my family enjoying cooking.',
        ],
        answer: 2,
        explanation: {
          en: '“Everyone”, “everybody”, “each” and “every” take a singular verb, even though they refer to many people: everyone enjoys. In Russian “все” is plural, which is why “everyone enjoy” or “everyone are” feels natural but is wrong in English.',
          uz: '«Everyone», «everybody», «each» va «every» ko‘p odamni bildirsa ham, birlikdagi kesim oladi: everyone enjoys. Rus tilidagi «все» ko‘plikda bo‘lgani uchun «everyone enjoy» yoki «everyone are» tabiiy tuyuladi, lekin ingliz tilida bu xato.',
          ru: '«Everyone», «everybody», «each» и «every» требуют глагола в единственном числе, хотя обозначают многих людей: everyone enjoys. В русском «все» — множественное число, поэтому «everyone enjoy» или «everyone are» кажутся естественными, но в английском это ошибка.',
        },
      },
      {
        id: 'b8',
        prompt: 'Choose the word that fits: “Between 2000 and 2020, the percentage of households with a car ____ from 40% to 65%.”',
        options: ['rise', 'have risen', 'were rising', 'rose'],
        answer: 3,
        explanation: {
          en: 'The subject is “the percentage”, which is singular, and the period is finished, so the past simple “rose” is correct. “Rise” and “have risen” agree with “households” by mistake and do not fit a finished period, and “were rising” is plural too.',
          uz: 'Ega «the percentage» birlikda, davr esa tugagan, shuning uchun past simple «rose» to‘g‘ri. «Rise» va «have risen» xato bilan «households»ga moslashtirilgan va tugagan davrga mos kelmaydi, «were rising» ham ko‘plikda.',
          ru: 'Подлежащее «the percentage» в единственном числе, период завершён, поэтому верно past simple «rose». «Rise» и «have risen» ошибочно согласованы с «households» и не подходят для завершённого периода, а «were rising» тоже во множественном числе.',
        },
      },
    ],
  },

  // --- verb tenses ----------------------------------------------------------------------------
  {
    id: 'drill.verb_tense',
    kind: 'drill',
    errorTag: 'verb_tense',
    node: 'grammar',
    levels: [4, 8],
    minutes: 5,
    aiVariants: true,
    title: { en: 'Verb tenses', uz: 'Fe’l zamonlari', ru: 'Времена глаголов' },
    explain: {
      en: 'Match the tense to the time. Past simple for a finished time (in 2010, last year, when I was a child). Present perfect for a period that reaches now (since 2015, for three years, so far, recently): I have lived here since 2015. Russian and Uzbek use the present tense here, so learners say “I live here since 2015”, which is wrong in English. Use the present simple for habits and facts (I usually cook), not the continuous. In Task 1, describe past years in the past simple and forecasts with will or is expected to.',
      uz: 'Zamonni vaqtga moslang. Tugagan vaqt uchun past simple (in 2010, last year, when I was a child). Hozirgacha davom etayotgan davr uchun present perfect (since 2015, for three years, so far, recently): I have lived here since 2015. O‘zbek va rus tillarida bu yerda hozirgi zamon ishlatiladi, shuning uchun «I live here since 2015» deyiladi — ingliz tilida bu xato. Odat va faktlar uchun davomli zamon emas, present simple ishlating (I usually cook). Task 1’da o‘tgan yillarni past simple’da, prognozlarni will yoki is expected to bilan yozing.',
      ru: 'Подбирайте время под период. Past simple — для завершённого времени (in 2010, last year, when I was a child). Present perfect — для периода, который длится до сих пор (since 2015, for three years, so far, recently): I have lived here since 2015. В русском и узбекском здесь настоящее время, поэтому говорят «I live here since 2015», а в английском это ошибка. Для привычек и фактов — present simple (I usually cook), а не continuous. В Task 1 прошлые годы описывайте в past simple, прогнозы — через will или is expected to.',
    },
    items: [
      {
        id: 'c1',
        prompt: 'Choose the correct sentence.',
        options: [
          'I am living in Tashkent since 2015.',
          'I live in Tashkent since 2015.',
          'I have lived in Tashkent since 2015.',
          'I lived in Tashkent since 2015.',
        ],
        answer: 2,
        explanation: {
          en: '“Since 2015” describes a period that started in the past and continues now, so English needs the present perfect: I have lived (or I have been living). The present tense is a direct translation from Russian or Uzbek, and the past simple “lived” would mean you no longer live there, which clashes with “since”.',
          uz: '«Since 2015» o‘tmishda boshlanib, hozir ham davom etayotgan davrni bildiradi, shuning uchun ingliz tilida present perfect kerak: I have lived (yoki I have been living). Hozirgi zamon — o‘zbek yoki rus tilidan to‘g‘ridan-to‘g‘ri tarjima, past simple «lived» esa u yerda endi yashamasligingizni bildiradi va «since» bilan to‘qnashadi.',
          ru: '«Since 2015» — период, который начался в прошлом и продолжается сейчас, поэтому нужен present perfect: I have lived (или I have been living). Настоящее время — дословный перевод с русского или узбекского, а past simple «lived» значило бы, что вы там больше не живёте, и противоречит «since».',
        },
      },
      {
        id: 'c2',
        prompt: 'Choose the correct sentence for a chart showing 1990–2020.',
        options: [
          'In 1990, about 20% of people have used public transport.',
          'In 1990, about 20% of people used public transport.',
          'In 1990, about 20% of people use public transport.',
        ],
        answer: 1,
        explanation: {
          en: '“In 1990” is a finished time, so the past simple “used” is correct. The present perfect cannot be used with a finished past date, and the present simple “use” describes now, not 1990. Most Task 1 charts about past years are written in the past simple.',
          uz: '«In 1990» tugagan vaqt, shuning uchun past simple «used» to‘g‘ri. Present perfect tugagan o‘tmish sanasi bilan ishlatilmaydi, present simple «use» esa 1990-yilni emas, hozirni bildiradi. O‘tgan yillar haqidagi Task 1 grafiklarining aksariyati past simple’da yoziladi.',
          ru: '«In 1990» — завершённое время, поэтому верно past simple «used». Present perfect не сочетается с конкретной прошедшей датой, а present simple «use» описывает настоящее, а не 1990 год. Большинство графиков Task 1 о прошлых годах описываются в past simple.',
        },
      },
      {
        id: 'c3',
        prompt: 'Write two words: I ____ (visit) Samarkand three times, and I would love to go again.',
        answer: ['have visited'],
        explanation: {
          en: 'Life experience with no finished time (three times, so far, ever) takes the present perfect: I have visited. If you add a finished time, switch to the past simple: I visited Samarkand last summer.',
          uz: 'Tugagan vaqt aytilmagan hayotiy tajriba (three times, so far, ever) present perfect bilan ifodalanadi: I have visited. Agar tugagan vaqt qo‘shilsa, past simple’ga o‘ting: I visited Samarkand last summer.',
          ru: 'Жизненный опыт без указания завершённого времени (three times, so far, ever) — present perfect: I have visited. Если добавить завершённое время, нужно past simple: I visited Samarkand last summer.',
        },
      },
      {
        id: 'c4',
        prompt: 'Choose the words that fit: “The forecast suggests that by 2040 the number of electric cars ____.”',
        options: ['tripled', 'will triple', 'has tripled', 'triples'],
        answer: 1,
        explanation: {
          en: '“By 2040” is in the future, so a forecast needs will (or is expected to / is likely to): will triple. “Tripled” and “has tripled” describe something that has already happened, and the present simple “triples” is not used for a forecast like this.',
          uz: '«By 2040» kelajak, shuning uchun prognoz will (yoki is expected to / is likely to) bilan beriladi: will triple. «Tripled» va «has tripled» allaqachon sodir bo‘lgan narsani bildiradi, present simple «triples» esa bunday prognozda ishlatilmaydi.',
          ru: '«By 2040» — будущее, поэтому прогноз выражается через will (или is expected to / is likely to): will triple. «Tripled» и «has tripled» описывают то, что уже произошло, а present simple «triples» для такого прогноза не используется.',
        },
      },
      {
        id: 'c5',
        prompt: 'Part 1: “What do you usually do at the weekend?” Choose the best answer.',
        options: [
          'I usually meet my friends and we play football in the park.',
          'I am usually meeting my friends and we are playing football in the park.',
          'I usually met my friends and we played football in the park.',
        ],
        answer: 0,
        explanation: {
          en: 'Habits and routines take the present simple: I usually meet, we play. Russian and Uzbek speakers often use the continuous for repeated actions, but “am usually meeting” sounds like a temporary arrangement. The past simple talks about the past, not your usual weekend.',
          uz: 'Odat va kundalik ishlar present simple bilan aytiladi: I usually meet, we play. O‘zbek va rus tillarida so‘zlashuvchilar takrorlanuvchi harakatlar uchun ko‘pincha davomli zamonni ishlatadi, lekin «am usually meeting» vaqtinchalik kelishuvdek eshitiladi. Past simple odatiy dam olish kuningizni emas, o‘tmishni bildiradi.',
          ru: 'Привычки и распорядок — present simple: I usually meet, we play. Носители русского и узбекского часто ставят continuous для повторяющихся действий, но «am usually meeting» звучит как временная договорённость. Past simple говорит о прошлом, а не о ваших обычных выходных.',
        },
      },
      {
        id: 'c6',
        prompt: 'Choose the correct sentence.',
        options: [
          'When I was a child, I have read a lot of comics.',
          'When I was a child, I am reading a lot of comics.',
          'When I was a child, I read a lot of comics.',
        ],
        answer: 2,
        explanation: {
          en: '“When I was a child” is a finished period, so the main verb is past simple: I read (or I used to read). The present perfect does not go with a finished time in English, and the present continuous breaks the time frame of the sentence.',
          uz: '«When I was a child» tugagan davr, shuning uchun asosiy fe’l past simple’da: I read (yoki I used to read). Ingliz tilida present perfect tugagan vaqt bilan ishlatilmaydi, present continuous esa gapning vaqt doirasini buzadi.',
          ru: '«When I was a child» — завершённый период, поэтому основной глагол в past simple: I read (или I used to read). Present perfect в английском не сочетается с завершённым временем, а present continuous ломает временную рамку предложения.',
        },
      },
      {
        id: 'c7',
        prompt: 'Write two words: Since the new metro line opened, traffic in the city centre ____ (fall) by a third.',
        answer: ['has fallen'],
        explanation: {
          en: '“Since the line opened” links a past event to now, so the main clause needs the present perfect: has fallen. “Fell” would cut the result off from the present, and “is falling” misses the completed change.',
          uz: '«Since the line opened» o‘tmishdagi voqeani hozirgi payt bilan bog‘laydi, shuning uchun bosh gapda present perfect kerak: has fallen. «Fell» natijani hozirdan uzib qo‘yadi, «is falling» esa yakunlangan o‘zgarishni ifodalamaydi.',
          ru: '«Since the line opened» связывает событие в прошлом с настоящим, поэтому в главном предложении нужен present perfect: has fallen. «Fell» отрывает результат от настоящего, а «is falling» не передаёт уже произошедшее изменение.',
        },
      },
      {
        id: 'c8',
        prompt: 'Choose the correct sentence.',
        options: [
          'Last year the government has built three new hospitals.',
          'Last year the government was built three new hospitals.',
          'Last year the government builds three new hospitals.',
          'Last year the government built three new hospitals.',
        ],
        answer: 3,
        explanation: {
          en: '“Last year” is a finished time, so the past simple “built” is correct. The present perfect cannot be used with “last year”, “was built” is a passive form that makes the government the thing that was built, and “builds” is present.',
          uz: '«Last year» tugagan vaqt, shuning uchun past simple «built» to‘g‘ri. Present perfect «last year» bilan ishlatilmaydi, «was built» majhul nisbat bo‘lib, hukumatning o‘zi qurilgandek ma’no beradi, «builds» esa hozirgi zamon.',
          ru: '«Last year» — завершённое время, поэтому верно past simple «built». Present perfect с «last year» не употребляется, «was built» — пассив, и получается, что построили само правительство, а «builds» — настоящее время.',
        },
      },
    ],
  },

  // --- prepositions ----------------------------------------------------------------------------
  {
    id: 'drill.prepositions',
    kind: 'drill',
    errorTag: 'prepositions',
    node: 'grammar',
    levels: [4, 8],
    minutes: 5,
    aiVariants: true,
    title: { en: 'Prepositions', uz: 'Predloglar', ru: 'Предлоги' },
    explain: {
      en: 'Many prepositions belong to the word before them and must be learnt as a pair, because the Russian or Uzbek equivalent leads you astray: depend on (not from), consist of, interested in, good at, the reason for, an effect on. Some verbs take no preposition at all: discuss a problem, reach a decision, enter a room, contact someone. In Task 1, rise to 40% gives the end point and rise by 10% gives the size of the change; also from 5% to 15%, between 2000 and 2010. For time: at 7 o’clock, on Monday, in May, in 2020.',
      uz: 'Ko‘p predloglar oldidagi so‘zga tegishli va juft holda yodlanishi kerak, chunki o‘zbek yoki rus tilidagi muqobili adashtiradi: depend on (from emas), consist of, interested in, good at, the reason for, an effect on. Ba’zi fe’llar umuman predlogsiz keladi: discuss a problem, reach a decision, enter a room, contact someone. Task 1’da rise to 40% oxirgi nuqtani, rise by 10% esa o‘zgarish hajmini bildiradi; shuningdek from 5% to 15%, between 2000 and 2010. Vaqt uchun: at 7 o’clock, on Monday, in May, in 2020.',
      ru: 'Многие предлоги закреплены за словом перед ними, и их нужно учить парой: русский или узбекский эквивалент сбивает с толку — depend on (а не from), consist of, interested in, good at, the reason for, an effect on. Некоторые глаголы вообще без предлога: discuss a problem, reach a decision, enter a room, contact someone. В Task 1 rise to 40% — конечная точка, rise by 10% — величина изменения; а также from 5% to 15%, between 2000 and 2010. Время: at 7 o’clock, on Monday, in May, in 2020.',
    },
    items: [
      {
        id: 'd1',
        prompt: 'Choose the correct sentence.',
        options: [
          'In this essay I will discuss about the advantages of online learning.',
          'In this essay I will discuss on the advantages of online learning.',
          'In this essay I will discuss the advantages of online learning.',
        ],
        answer: 2,
        explanation: {
          en: '“Discuss” takes a direct object with no preposition: discuss the advantages. “Discuss about” comes from Russian “говорить о” and Uzbek “haqida gaplashmoq”. If you want a preposition, use a different verb: talk about, write about.',
          uz: '«Discuss» predlogsiz to‘g‘ridan-to‘g‘ri to‘ldiruvchi oladi: discuss the advantages. «Discuss about» o‘zbekcha «haqida gaplashmoq» va ruscha «говорить о»dan kelib chiqqan. Predlog kerak bo‘lsa, boshqa fe’l ishlating: talk about, write about.',
          ru: '«Discuss» требует прямого дополнения без предлога: discuss the advantages. «Discuss about» — калька с «говорить о». Если хочется предлога, возьмите другой глагол: talk about, write about.',
        },
      },
      {
        id: 'd2',
        prompt: 'Write one word: The price of a ticket depends ____ the distance you travel.',
        answer: ['on', 'upon'],
        explanation: {
          en: 'The verb is always “depend on” (or the more formal “depend upon”). “Depend from” is a word-for-word translation of Russian “зависеть от” and a very common error in essays. The adjective takes the same preposition: dependent on.',
          uz: 'Fe’l doim «depend on» (rasmiyroq «depend upon»). «Depend from» ruscha «зависеть от» iborasining so‘zma-so‘z tarjimasi va inshoda juda keng tarqalgan xato. Sifatda ham shu predlog: dependent on.',
          ru: 'Глагол всегда «depend on» (или более формально «depend upon»). «Depend from» — дословный перевод «зависеть от», очень частая ошибка в эссе. С прилагательным тот же предлог: dependent on.',
        },
      },
      {
        id: 'd3',
        prompt: 'Choose the words that fit: “Between 2005 and 2015, unemployment fell ____ 12% ____ 8%.”',
        options: ['at … by', 'from … to', 'by … until', 'since … till'],
        answer: 1,
        explanation: {
          en: 'To give the start and the end of a change, use “from … to”: fell from 12% to 8%. “By” gives the size of the change (fell by 4 percentage points), and “since … till” is for time, not for figures.',
          uz: 'O‘zgarishning boshi va oxirini berish uchun «from … to» ishlatiladi: fell from 12% to 8%. «By» o‘zgarish hajmini bildiradi (fell by 4 percentage points), «since … till» esa raqamlar uchun emas, vaqt uchun.',
          ru: 'Начало и конец изменения задаются через «from … to»: fell from 12% to 8%. «By» показывает величину изменения (fell by 4 percentage points), а «since … till» относится ко времени, а не к цифрам.',
        },
      },
      {
        id: 'd4',
        prompt: 'Choose the word that fits: “Online sales rose ____ 5 percentage points, from 20% to 25%.”',
        options: ['to', 'on', 'by', 'with'],
        answer: 2,
        explanation: {
          en: '“By” gives the size of the change: rose by 5 points. “To” gives the end point, so “rose to 5 points” would mean the final figure was 5. “On” is a word-for-word translation of Russian “вырос на”, and “with” is not used for changes.',
          uz: '«By» o‘zgarish hajmini bildiradi: rose by 5 points. «To» oxirgi nuqtani bildiradi, demak «rose to 5 points» yakuniy ko‘rsatkich 5 bo‘lgan degani. «On» ruscha «вырос на»dan so‘zma-so‘z tarjima, «with» esa o‘zgarishlar uchun ishlatilmaydi. O‘zbekcha «5 foizga oshdi» ham «rose to» emas, «rose by» bo‘ladi.',
          ru: '«By» показывает величину изменения: rose by 5 points. «To» — конечная точка, «rose to 5 points» значило бы, что итоговая цифра равна 5. «On» — калька с «вырос на», а «with» для изменений не используется.',
        },
      },
      {
        id: 'd5',
        prompt: 'Choose the correct sentence.',
        options: [
          'Many teenagers are interested in computer games.',
          'Many teenagers are interested on computer games.',
          'Many teenagers are interested with computer games.',
          'Many teenagers are interested about computer games.',
        ],
        answer: 0,
        explanation: {
          en: 'The adjective “interested” always takes “in”: interested in games, an interest in science. “With” comes from Russian “интересоваться чем”, and “about” and “on” are guesses. Learn the pair as one unit.',
          uz: '«Interested» sifati doim «in» bilan keladi: interested in games, an interest in science. «With» ruscha «интересоваться чем»dan kelib chiqqan, «about» va «on» esa taxmin. Juftlikni bir butun sifatida yodlang.',
          ru: 'Прилагательное «interested» всегда с «in»: interested in games, an interest in science. «With» появляется из-за «интересоваться чем» (творительный падеж), а «about» и «on» — догадки. Запоминайте пару целиком.',
        },
      },
      {
        id: 'd6',
        prompt: 'Write one word: Social media can have a negative effect ____ teenagers’ sleep.',
        answer: ['on', 'upon'],
        explanation: {
          en: 'The noun “effect” takes “on”: an effect on sleep, an impact on health, an influence on children. Learners often write “effect to” or “effect for”. Remember that the verb “affect” takes no preposition: it affects sleep.',
          uz: '«Effect» oti «on» bilan keladi: an effect on sleep, an impact on health, an influence on children. Ko‘pincha «effect to» yoki «effect for» deb yoziladi. «Affect» fe’li esa predlogsiz keladi: it affects sleep.',
          ru: 'Существительное «effect» требует «on»: an effect on sleep, an impact on health, an influence on children. Часто пишут «effect to» или «effect for». А глагол «affect» вообще без предлога: it affects sleep.',
        },
      },
      {
        id: 'd7',
        prompt: 'Choose the correct sentence.',
        options: [
          'I have English classes at Mondays and Wednesdays.',
          'I have English classes in Mondays and Wednesdays.',
          'I have English classes on Mondays and Wednesdays.',
        ],
        answer: 2,
        explanation: {
          en: 'Days and dates take “on”: on Monday, on Mondays, on 5 May. Months, years and parts of the day take “in” (in May, in 2020, in the morning), and clock times take “at” (at 7 o’clock). Russian “в понедельник” and Uzbek “dushanba kuni” both hide this choice.',
          uz: 'Hafta kunlari va sanalar «on» bilan keladi: on Monday, on Mondays, on 5 May. Oylar, yillar va kun qismlari «in» bilan (in May, in 2020, in the morning), soat esa «at» bilan (at 7 o’clock). «Dushanba kuni» va «в понедельник» bu tanlovni ko‘rsatmaydi.',
          ru: 'Дни недели и даты — с «on»: on Monday, on Mondays, on 5 May. Месяцы, годы и части дня — с «in» (in May, in 2020, in the morning), часы — с «at» (at 7 o’clock). Русское «в понедельник» этот выбор скрывает.',
        },
      },
      {
        id: 'd8',
        prompt: 'Choose the correct sentence.',
        options: [
          'The population of the city reached to two million in 2010.',
          'The population of the city reached two million in 2010.',
          'The population of the city reached at two million in 2010.',
        ],
        answer: 1,
        explanation: {
          en: '“Reach” takes a direct object with no preposition: reached two million, reach a peak, reach a decision. “Reached to” mixes it with “rose to”. If you want a preposition, change the verb: rose to two million.',
          uz: '«Reach» predlogsiz to‘ldiruvchi oladi: reached two million, reach a peak, reach a decision. «Reached to» «rose to» bilan aralashtirilgan. Predlog kerak bo‘lsa, fe’lni o‘zgartiring: rose to two million.',
          ru: '«Reach» требует дополнения без предлога: reached two million, reach a peak, reach a decision. «Reached to» — смешение с «rose to». Если нужен предлог, смените глагол: rose to two million.',
        },
      },
    ],
  },

  // --- word forms ------------------------------------------------------------------------------
  {
    id: 'drill.word_form',
    kind: 'drill',
    errorTag: 'word_form',
    node: 'writing.lexical_resource',
    levels: [4, 8],
    minutes: 5,
    aiVariants: true,
    title: { en: 'Word forms', uz: 'So‘z shakllari', ru: 'Формы слов' },
    explain: {
      en: 'Every slot in a sentence needs a particular part of speech. Before a noun use an adjective (a significant rise, economic growth); with a verb use an adverb (rose significantly, changed dramatically); after an article, a possessive or a preposition use a noun (the importance of, their success); after to or a modal use a base verb (to succeed, can benefit). Watch common pairs: economic (of the economy) / economical (saves money), effect (noun) / affect (verb), success / successful / succeed, benefit / beneficial. Look at the words before and after the gap to decide.',
      uz: 'Gapdagi har bir o‘rin ma’lum so‘z turkumini talab qiladi. Ot oldida sifat (a significant rise, economic growth); fe’l bilan ravish (rose significantly, changed dramatically); artikl, egalik so‘zi yoki predlogdan keyin ot (the importance of, their success); to yoki modal fe’ldan keyin fe’lning asosiy shakli (to succeed, can benefit). Tez-tez adashtiriladigan juftlarga e’tibor bering: economic (iqtisodiyotga oid) / economical (tejamkor), effect (ot) / affect (fe’l), success / successful / succeed, benefit / beneficial. Bo‘sh joydan oldingi va keyingi so‘zlarga qarab tanlang.',
      ru: 'Каждое место в предложении требует определённой части речи. Перед существительным — прилагательное (a significant rise, economic growth); с глаголом — наречие (rose significantly, changed dramatically); после артикля, притяжательного слова или предлога — существительное (the importance of, their success); после to или модального глагола — начальная форма (to succeed, can benefit). Следите за парами: economic (экономический) / economical (экономный), effect (существительное) / affect (глагол), success / successful / succeed, benefit / beneficial. Смотрите на слова до и после пропуска.',
    },
    items: [
      {
        id: 'e1',
        prompt: 'Choose the word that fits: “Unemployment fell ____ between 2010 and 2015.”',
        options: ['significant', 'significantly', 'significance', 'signify'],
        answer: 1,
        explanation: {
          en: 'The word describes how unemployment fell, so it modifies a verb and must be an adverb: fell significantly. “Significant” is the adjective (a significant fall), “significance” is the noun and “signify” is a verb.',
          uz: 'So‘z ishsizlik qanday kamayganini tasvirlaydi, ya’ni fe’lga bog‘lanadi, shuning uchun ravish bo‘lishi kerak: fell significantly. «Significant» sifat (a significant fall), «significance» ot, «signify» esa fe’l.',
          ru: 'Слово описывает, как упала безработица, то есть относится к глаголу, значит, нужно наречие: fell significantly. «Significant» — прилагательное (a significant fall), «significance» — существительное, «signify» — глагол.',
        },
      },
      {
        id: 'e2',
        prompt: 'Choose the correct sentence.',
        options: [
          'Education plays a key role in the economical development of a country.',
          'Education plays a key role in the economy development of a country.',
          'Education plays a key role in the economic development of a country.',
        ],
        answer: 2,
        explanation: {
          en: '“Economic” means “connected with the economy”: economic development, economic growth. “Economical” means “saving money” (an economical car). “Economy” is a noun and cannot describe “development” here.',
          uz: '«Economic» «iqtisodiyotga oid» degani: economic development, economic growth. «Economical» «tejamkor» ma’nosida (an economical car). «Economy» ot, bu yerda «development»ni tasvirlay olmaydi.',
          ru: '«Economic» — «связанный с экономикой»: economic development, economic growth. «Economical» — «экономный» (an economical car). «Economy» — существительное и здесь не может определять «development».',
        },
      },
      {
        id: 'e3',
        prompt: 'Write one word: Many people underestimate the ____ (important) of sleep.',
        answer: ['importance'],
        explanation: {
          en: 'After “the” and before “of” you need a noun: the importance of sleep. “The important of” is a very common error because the adjective is the form learners remember first.',
          uz: '«The»dan keyin va «of»dan oldin ot kerak: the importance of sleep. «The important of» juda keng tarqalgan xato, chunki odatda sifat shakli birinchi esga keladi.',
          ru: 'После «the» и перед «of» нужно существительное: the importance of sleep. «The important of» — очень частая ошибка, потому что прилагательное запоминается первым.',
        },
      },
      {
        id: 'e4',
        prompt: 'Choose the correct sentence.',
        options: [
          'Smartphones have a negative affect on children’s concentration.',
          'Smartphones have a negative effect on children’s concentration.',
          'Smartphones have a negative effective on children’s concentration.',
        ],
        answer: 1,
        explanation: {
          en: 'After “a negative” you need a noun, and the noun is “effect”. “Affect” is the verb (Smartphones affect concentration), and “effective” is an adjective meaning “working well”.',
          uz: '«A negative»dan keyin ot kerak, ot esa «effect». «Affect» fe’l (Smartphones affect concentration), «effective» esa «samarali» ma’nosidagi sifat.',
          ru: 'После «a negative» нужно существительное, это «effect». «Affect» — глагол (Smartphones affect concentration), а «effective» — прилагательное «эффективный».',
        },
      },
      {
        id: 'e5',
        prompt: 'Choose the word that fits: “Regular exercise is ____ for both the body and the mind.”',
        options: ['benefit', 'beneficially', 'benefited', 'beneficial'],
        answer: 3,
        explanation: {
          en: 'After “is” and before “for”, the slot describes exercise, so it needs an adjective: beneficial for. “Benefit” is a noun or a verb (a benefit, it benefits us), “beneficially” is an adverb and “benefited” is a past verb.',
          uz: '«Is»dan keyin va «for»dan oldin mashqni tasvirlovchi sifat kerak: beneficial for. «Benefit» ot yoki fe’l (a benefit, it benefits us), «beneficially» ravish, «benefited» esa o‘tgan zamondagi fe’l.',
          ru: 'После «is» и перед «for» нужно прилагательное, описывающее упражнения: beneficial for. «Benefit» — существительное или глагол (a benefit, it benefits us), «beneficially» — наречие, «benefited» — глагол в прошедшем.',
        },
      },
      {
        id: 'e6',
        prompt: 'Write one word: Young people need practical skills to ____ (success) in their careers.',
        answer: ['succeed'],
        explanation: {
          en: 'After “to” you need a base verb: to succeed. “Success” is the noun (career success) and “successful” is the adjective (a successful career). Writing “to success” is a typical mix-up of these three forms.',
          uz: '«To»dan keyin fe’lning asosiy shakli kerak: to succeed. «Success» ot (career success), «successful» sifat (a successful career). «To success» deb yozish bu uch shaklni adashtirishning odatiy holati.',
          ru: 'После «to» нужна начальная форма глагола: to succeed. «Success» — существительное (career success), «successful» — прилагательное (a successful career). «To success» — типичная путаница этих трёх форм.',
        },
      },
      {
        id: 'e7',
        prompt: 'Choose the correct sentence.',
        options: [
          'There was a dramatic increase in online shopping.',
          'There was a dramatically increase in online shopping.',
          'There was a dramatical increase in online shopping.',
          'There was a drama increase in online shopping.',
        ],
        answer: 0,
        explanation: {
          en: 'Before the noun “increase” you need an adjective: a dramatic increase. Use the adverb with a verb instead: online shopping increased dramatically. “Dramatical” is not a word, and “drama” is a noun.',
          uz: '«Increase» oti oldida sifat kerak: a dramatic increase. Ravish esa fe’l bilan ishlatiladi: online shopping increased dramatically. «Dramatical» degan so‘z yo‘q, «drama» esa ot.',
          ru: 'Перед существительным «increase» нужно прилагательное: a dramatic increase. Наречие ставится с глаголом: online shopping increased dramatically. Слова «dramatical» не существует, а «drama» — существительное.',
        },
      },
      {
        id: 'e8',
        prompt: 'Choose the word that fits: “The rapid ____ of technology has changed the way we work.”',
        options: ['develop', 'developed', 'development', 'developing'],
        answer: 2,
        explanation: {
          en: 'After “the rapid” and before “of” you need a noun: the rapid development of technology. “Develop” is a verb, “developed” is a past form or an adjective (developed countries), and “developing” cannot follow “the rapid” here.',
          uz: '«The rapid»dan keyin va «of»dan oldin ot kerak: the rapid development of technology. «Develop» fe’l, «developed» o‘tgan zamon shakli yoki sifat (developed countries), «developing» esa bu yerda «the rapid»dan keyin kelmaydi.',
          ru: 'После «the rapid» и перед «of» нужно существительное: the rapid development of technology. «Develop» — глагол, «developed» — прошедшая форма или прилагательное (developed countries), а «developing» здесь после «the rapid» не употребляется.',
        },
      },
    ],
  },

  // --- countable and uncountable nouns -----------------------------------------------------------
  {
    id: 'drill.countable_nouns',
    kind: 'drill',
    errorTag: 'countable_nouns',
    node: 'grammar',
    levels: [4, 8],
    minutes: 5,
    aiVariants: true,
    title: { en: 'Countable and uncountable nouns', uz: 'Sanaladigan va sanalmaydigan otlar', ru: 'Исчисляемые и неисчисляемые' },
    explain: {
      en: 'Some nouns that can be counted in Russian or Uzbek are uncountable in English: information, advice, research, equipment, evidence, knowledge, furniture, homework, news, traffic, transport, luggage. They have no -s, no a/an, and take a singular verb (The news is…). Use much, little, less or a lot of with them, or count them with a unit word: a piece of advice, an item of equipment. Countable plurals use many, few, fewer and a number of: fewer cars, many people. In Task 1: less traffic, but fewer vehicles.',
      uz: 'O‘zbek yoki rus tilida sanaladigan ba’zi otlar ingliz tilida sanalmaydi: information, advice, research, equipment, evidence, knowledge, furniture, homework, news, traffic, transport, luggage. Ular -s, a/an olmaydi va birlikdagi kesim bilan keladi (The news is…). Ular bilan much, little, less yoki a lot of ishlating yoki birlik so‘zi bilan sanang: a piece of advice, an item of equipment. Sanaladigan ko‘plik otlar bilan many, few, fewer va a number of: fewer cars, many people. Task 1’da: less traffic, lekin fewer vehicles.',
      ru: 'Некоторые существительные, которые в русском или узбекском исчисляемые, в английском неисчисляемые: information, advice, research, equipment, evidence, knowledge, furniture, homework, news, traffic, transport, luggage. У них нет -s и a/an, глагол — в единственном числе (The news is…). С ними — much, little, less или a lot of, а для счёта — слово-единица: a piece of advice, an item of equipment. С исчисляемыми во множественном — many, few, fewer и a number of: fewer cars, many people. В Task 1: less traffic, но fewer vehicles.',
    },
    items: [
      {
        id: 'f1',
        prompt: 'Choose the correct sentence.',
        options: [
          'The internet gives us a lot of useful informations.',
          'The internet gives us many useful information.',
          'The internet gives us a lot of useful information.',
          'The internet gives us an useful information.',
        ],
        answer: 2,
        explanation: {
          en: '“Information” is uncountable: no -s, no a/an and not “many”. Use “a lot of”, “much” or “a piece of”: a lot of useful information. Uzbek “ma’lumotlar” and Russian “сведения” are plural, which is why “informations” appears so often.',
          uz: '«Information» sanalmaydi: -s, a/an va «many» olmaydi. «A lot of», «much» yoki «a piece of» ishlating: a lot of useful information. O‘zbek tilida «ma’lumotlar» ko‘plikda bo‘lgani uchun «informations» juda ko‘p uchraydi.',
          ru: '«Information» — неисчисляемое: без -s, без a/an и без «many». Используйте «a lot of», «much» или «a piece of»: a lot of useful information. «Informations» появляется под влиянием русского «сведения» и узбекского «ma’lumotlar» во множественном числе.',
        },
      },
      {
        id: 'f2',
        prompt: 'Choose the correct sentence.',
        options: [
          'My teacher gave me an advice about the exam.',
          'My teacher gave me a useful piece of advice about the exam.',
          'My teacher gave me some advices about the exam.',
        ],
        answer: 1,
        explanation: {
          en: '“Advice” is uncountable, so it cannot take “an” or “-s”. To talk about one, say “a piece of advice”; for more, “some advice” or “a lot of advice”. The verb is spelt differently: to advise.',
          uz: '«Advice» sanalmaydi, shuning uchun «an» yoki «-s» olmaydi. Bitta maslahat haqida «a piece of advice», ko‘prog‘i haqida «some advice» yoki «a lot of advice» deyiladi. Fe’l shakli boshqacha yoziladi: to advise.',
          ru: '«Advice» — неисчисляемое, поэтому без «an» и без «-s». Об одном совете говорят «a piece of advice», о нескольких — «some advice» или «a lot of advice». Глагол пишется иначе: to advise.',
        },
      },
      {
        id: 'f3',
        prompt: 'Write one word: If more people cycled to work, there would be ____ traffic in the city centre than there is now.',
        answer: ['less'],
        explanation: {
          en: '“Traffic” is uncountable, so the comparative is “less traffic”. “Fewer” goes with countable plurals: fewer cars, fewer buses. Learners often write “fewer traffic” or “less cars”; in an essay both cost marks.',
          uz: '«Traffic» sanalmaydi, shuning uchun qiyosiy daraja «less traffic». «Fewer» sanaladigan ko‘plik otlar bilan keladi: fewer cars, fewer buses. Ko‘pincha «fewer traffic» yoki «less cars» deb yoziladi; inshoda ikkalasi ham ball kamaytiradi.',
          ru: '«Traffic» — неисчисляемое, поэтому сравнительная форма — «less traffic». «Fewer» — с исчисляемыми во множественном: fewer cars, fewer buses. Часто пишут «fewer traffic» или «less cars»; в эссе и то и другое снижает балл.',
        },
      },
      {
        id: 'f4',
        prompt: 'Choose the word that fits: “At night there are ____ cars on the roads, so the air is cleaner.”',
        options: ['less', 'much', 'fewer', 'little'],
        answer: 2,
        explanation: {
          en: '“Cars” is a countable plural, so it takes “fewer” (or “not many”). “Less”, “much” and “little” go with uncountable nouns such as traffic, pollution or noise.',
          uz: '«Cars» sanaladigan ko‘plik ot, shuning uchun «fewer» (yoki «not many») oladi. «Less», «much» va «little» traffic, pollution yoki noise kabi sanalmaydigan otlar bilan keladi.',
          ru: '«Cars» — исчисляемое во множественном числе, поэтому «fewer» (или «not many»). «Less», «much» и «little» используются с неисчисляемыми: traffic, pollution, noise.',
        },
      },
      {
        id: 'f5',
        prompt: 'Choose the correct sentence.',
        options: [
          'Scientists have done a lot of research on climate change.',
          'Scientists have done many researches on climate change.',
          'Scientists have done a research on climate change.',
          'Scientists have made many research on climate change.',
        ],
        answer: 0,
        explanation: {
          en: '“Research” is uncountable in academic English: a lot of research, much research; to count, say a study, several studies. “Researches” and “a research” are common errors, and the verb partner is “do” or “carry out”, not “make”.',
          uz: 'Akademik ingliz tilida «research» sanalmaydi: a lot of research, much research; sanash kerak bo‘lsa — a study, several studies. «Researches» va «a research» keng tarqalgan xatolar, fe’l esa «make» emas, «do» yoki «carry out».',
          ru: 'В академическом английском «research» — неисчисляемое: a lot of research, much research; для счёта — a study, several studies. «Researches» и «a research» — частые ошибки, а глагол — «do» или «carry out», а не «make».',
        },
      },
      {
        id: 'f6',
        prompt: 'Write one word: How ____ homework do students in your country usually get?',
        answer: ['much'],
        explanation: {
          en: '“Homework” is uncountable, so the question is “how much homework”. “How many homeworks” is a direct translation; if you want to count, say “how many tasks” or “how many assignments”.',
          uz: '«Homework» sanalmaydi, shuning uchun savol «how much homework». «How many homeworks» to‘g‘ridan-to‘g‘ri tarjima; sanamoqchi bo‘lsangiz, «how many tasks» yoki «how many assignments» deng.',
          ru: '«Homework» — неисчисляемое, поэтому «how much homework». «How many homeworks» — дословный перевод; если нужно посчитать, скажите «how many tasks» или «how many assignments».',
        },
      },
      {
        id: 'f7',
        prompt: 'Choose the correct sentence.',
        options: [
          'The hospital bought new equipments last year.',
          'The hospital bought a new equipment last year.',
          'The hospital bought new equipment last year.',
        ],
        answer: 2,
        explanation: {
          en: '“Equipment” is uncountable: no -s and no a/an. To count it, say “a piece of equipment” or name the items: three new scanners. The same is true of furniture, luggage and machinery.',
          uz: '«Equipment» sanalmaydi: -s ham, a/an ham olmaydi. Sanash uchun «a piece of equipment» deng yoki buyumlarni nomlang: three new scanners. Furniture, luggage va machinery ham shunday.',
          ru: '«Equipment» — неисчисляемое: без -s и без a/an. Для счёта — «a piece of equipment» или назовите предметы: three new scanners. То же с furniture, luggage и machinery.',
        },
      },
      {
        id: 'f8',
        prompt: 'Choose the correct sentence.',
        options: [
          'The news are very depressing these days.',
          'The news is very depressing these days.',
          'The newses are very depressing these days.',
        ],
        answer: 1,
        explanation: {
          en: '“News” looks plural but is uncountable and takes a singular verb: the news is. For one item, say “a piece of news” or “a news story”. Russian “новости” is plural, which is why “the news are” feels right.',
          uz: '«News» ko‘plikka o‘xshasa ham, sanalmaydi va birlikdagi kesim oladi: the news is. Bitta xabar uchun «a piece of news» yoki «a news story» deng. Ruscha «новости» ko‘plikda bo‘lgani uchun «the news are» to‘g‘ri tuyuladi.',
          ru: '«News» похоже на множественное число, но это неисчисляемое существительное с глаголом в единственном: the news is. Об одной новости — «a piece of news» или «a news story». Русское «новости» — множественное, поэтому «the news are» кажется правильным.',
        },
      },
    ],
  },

  // --- sentence boundaries -----------------------------------------------------------------------
  {
    id: 'drill.sentence_boundaries',
    kind: 'drill',
    errorTag: 'sentence_boundaries',
    node: 'writing.grammar',
    levels: [4, 8],
    minutes: 5,
    aiVariants: true,
    title: { en: 'Run-on sentences and fragments', uz: 'Qo‘shilib ketgan va chala gaplar', ru: 'Слитные и незаконченные предложения' },
    explain: {
      en: 'A full sentence has a subject and a verb and can stand alone. Two full sentences cannot be joined by a comma only (a comma splice): “Cities are growing, this causes traffic.” Fix it with a full stop (…growing. This causes…), a semicolon, or a linking word (…growing, and this causes… / …growing, which causes…). Russian and Uzbek punctuation allows long chains of clauses with commas, so learners carry the habit into English. The opposite error is a fragment: a because-, which- or for example-part written as a sentence on its own (“Because it is cheap.”). Attach it to the main clause.',
      uz: 'To‘liq gapda ega va kesim bo‘ladi va u mustaqil tura oladi. Ikki to‘liq gapni faqat vergul bilan bog‘lab bo‘lmaydi (comma splice): «Cities are growing, this causes traffic.» Buni nuqta (…growing. This causes…), nuqtali vergul yoki bog‘lovchi bilan tuzating (…growing, and this causes… / …growing, which causes…). O‘zbek va rus tillaridagi tinish belgilari qoidalari vergul bilan uzun gap zanjirlariga yo‘l qo‘yadi, shuning uchun bu odat ingliz tiliga ham o‘tadi. Teskari xato — chala gap: because, which yoki for example bilan boshlangan qism alohida gap qilib yoziladi («Because it is cheap.»). Uni bosh gapga qo‘shing.',
      ru: 'Полное предложение имеет подлежащее и сказуемое и может стоять отдельно. Два полных предложения нельзя соединить одной запятой (comma splice): «Cities are growing, this causes traffic.» Исправьте точкой (…growing. This causes…), точкой с запятой или союзом (…growing, and this causes… / …growing, which causes…). Русская и узбекская пунктуация допускает длинные цепочки предложений через запятую, и эта привычка переходит в английский. Обратная ошибка — незаконченное предложение: часть с because, which или for example записана как отдельное предложение («Because it is cheap.»). Присоедините её к главному предложению.',
    },
    items: [
      {
        id: 'g1',
        prompt: 'Choose the correctly punctuated sentence.',
        options: [
          'Many young people move to the capital, they want better jobs.',
          'Many young people move to the capital. Because they want better jobs.',
          'Many young people move to the capital because they want better jobs.',
        ],
        answer: 2,
        explanation: {
          en: 'The third option joins the two ideas with “because” in one sentence. The first is a comma splice: two full sentences with only a comma between them. The second turns “Because they want better jobs” into a fragment, which cannot stand alone.',
          uz: 'Uchinchi variant ikki fikrni «because» bilan bitta gapda bog‘laydi. Birinchisi comma splice: ikki to‘liq gap orasida faqat vergul bor. Ikkinchisida «Because they want better jobs» chala gapga aylangan, u mustaqil tura olmaydi.',
          ru: 'Третий вариант соединяет две мысли через «because» в одном предложении. Первый — comma splice: между двумя полными предложениями только запятая. Во втором «Because they want better jobs» стало незаконченным предложением, которое не может стоять отдельно.',
        },
      },
      {
        id: 'g2',
        prompt: 'Choose the correctly punctuated version.',
        options: [
          'Public transport is cheap; however, it is often crowded.',
          'Public transport is cheap, however, it is often crowded.',
          'Public transport is cheap however it is often crowded.',
        ],
        answer: 0,
        explanation: {
          en: '“However” is not a conjunction like “but”, so it cannot join two sentences with commas. Put a semicolon or a full stop before it and a comma after it: …cheap; however, it… Alternatively use “but”: Public transport is cheap, but it is often crowded.',
          uz: '«However» «but» kabi bog‘lovchi emas, shuning uchun ikki gapni vergullar bilan bog‘lay olmaydi. Undan oldin nuqtali vergul yoki nuqta, keyin vergul qo‘ying: …cheap; however, it… Yoki «but» ishlating: Public transport is cheap, but it is often crowded.',
          ru: '«However» — не союз, как «but», поэтому не может связывать два предложения через запятые. Перед ним ставьте точку с запятой или точку, после — запятую: …cheap; however, it… Или используйте «but»: Public transport is cheap, but it is often crowded.',
        },
      },
      {
        id: 'g3',
        prompt: 'Which of these is a complete sentence?',
        options: [
          'For example, the new library in the city centre.',
          'Which is why many families prefer the suburbs.',
          'Because rents in the centre are very high.',
          'For example, the city opened a new library in 2021.',
        ],
        answer: 3,
        explanation: {
          en: 'Only the last option has a subject and a main verb (the city opened) and can stand alone. The first has no verb, and the “which” and “because” options are dependent clauses that must be attached to a main clause.',
          uz: 'Faqat oxirgi variantda ega va asosiy kesim bor (the city opened) va u mustaqil tura oladi. Birinchisida kesim yo‘q, «which» va «because» bilan boshlangan variantlar esa bosh gapga qo‘shilishi kerak bo‘lgan ergash gaplar.',
          ru: 'Только в последнем варианте есть подлежащее и сказуемое (the city opened), и он может стоять отдельно. В первом нет глагола, а варианты с «which» и «because» — придаточные, которые нужно присоединить к главному предложению.',
        },
      },
      {
        id: 'g4',
        prompt: 'Choose the correctly punctuated version.',
        options: [
          'Online courses are flexible, students can study at any time.',
          'Online courses are flexible, so students can study at any time.',
          'Online courses are flexible so, students can study at any time.',
        ],
        answer: 1,
        explanation: {
          en: 'A comma alone cannot join two full sentences, but a comma plus a conjunction (and, but, so, or) can: …flexible, so students can… The first option is a comma splice, and in the third the comma is on the wrong side of “so”.',
          uz: 'Ikki to‘liq gapni faqat vergul bilan bog‘lab bo‘lmaydi, vergul va bog‘lovchi (and, but, so, or) bilan esa mumkin: …flexible, so students can… Birinchi variant comma splice, uchinchisida esa vergul «so»ning noto‘g‘ri tomonida.',
          ru: 'Одна запятая не может соединить два полных предложения, а запятая плюс союз (and, but, so, or) — может: …flexible, so students can… Первый вариант — comma splice, в третьем запятая стоит не с той стороны от «so».',
        },
      },
      {
        id: 'g5',
        prompt: 'Write one linking word to fix the comma splice: Fast food is cheap, ____ many families eat it several times a week.',
        answer: ['so', 'and'],
        explanation: {
          en: 'Adding a conjunction after the comma turns two sentences into one correct sentence: …cheap, so many families… “So” shows the result most clearly; “and” is also correct. Words like “therefore” or “however” would still need a semicolon or a full stop before them.',
          uz: 'Verguldan keyin bog‘lovchi qo‘shilsa, ikki gap bitta to‘g‘ri gapga aylanadi: …cheap, so many families… «So» natijani eng aniq ko‘rsatadi; «and» ham to‘g‘ri. «Therefore» yoki «however» kabi so‘zlardan oldin baribir nuqtali vergul yoki nuqta kerak bo‘ladi.',
          ru: 'Союз после запятой превращает два предложения в одно правильное: …cheap, so many families… «So» яснее всего показывает следствие; «and» тоже верно. Перед словами вроде «therefore» или «however» всё равно понадобились бы точка с запятой или точка.',
        },
      },
      {
        id: 'g6',
        prompt: 'Choose the correctly punctuated version.',
        options: [
          'The graph shows car ownership. Which rose steadily over the period.',
          'The graph shows car ownership, it rose steadily over the period.',
          'The graph shows car ownership, which rose steadily over the period.',
        ],
        answer: 2,
        explanation: {
          en: 'A “which” clause gives extra information about the noun before it and must stay in the same sentence, after a comma. Starting a new sentence with “Which” creates a fragment, and “…, it rose” is a comma splice.',
          uz: '«Which» bilan boshlanadigan qism oldingi ot haqida qo‘shimcha ma’lumot beradi va verguldan keyin o‘sha gap ichida qolishi kerak. Yangi gapni «Which» bilan boshlash chala gap hosil qiladi, «…, it rose» esa comma splice.',
          ru: 'Придаточное с «which» добавляет сведения о предыдущем существительном и должно оставаться в том же предложении после запятой. Новое предложение с «Which» — это незаконченное предложение, а «…, it rose» — comma splice.',
        },
      },
      {
        id: 'g7',
        prompt: 'Choose the best version for an essay.',
        options: [
          'There are many benefits of city life, for example, there are more jobs, hospitals are better, transport is faster.',
          'There are many benefits of city life. For example, there are more jobs, better hospitals and faster transport.',
          'There are many benefits of city life for example there are more jobs and better hospitals and faster transport.',
        ],
        answer: 1,
        explanation: {
          en: 'The second version ends the first sentence with a full stop, starts the example as a new sentence and gives a clean list. The first chains four full clauses with commas, and the third has no punctuation at all, so the reader cannot see where ideas begin and end.',
          uz: 'Ikkinchi variantda birinchi gap nuqta bilan tugaydi, misol yangi gapdan boshlanadi va ro‘yxat aniq. Birinchisida to‘rtta to‘liq gap vergul bilan zanjir qilingan, uchinchisida esa umuman tinish belgisi yo‘q, shuning uchun o‘quvchi fikrlar qayerda boshlanib, qayerda tugashini ko‘rmaydi.',
          ru: 'Во втором варианте первое предложение заканчивается точкой, пример начинается с нового предложения, а перечисление чёткое. В первом четыре полных предложения связаны запятыми, в третьем нет пунктуации вовсе, и читатель не видит, где начинается и заканчивается мысль.',
        },
      },
      {
        id: 'g8',
        prompt: 'Write one word that joins the two clauses and shows the contrast: Some students prefer to study alone, ____ others learn better in groups.',
        answer: ['but', 'while', 'whereas', 'yet'],
        explanation: {
          en: 'The two clauses contrast, so a contrast conjunction is needed after the comma: but, while, whereas or yet. Without it the sentence is a comma splice. “However” would not work here unless the comma became a semicolon.',
          uz: 'Ikki qism bir-biriga zid, shuning uchun verguldan keyin qarama-qarshilik bog‘lovchisi kerak: but, while, whereas yoki yet. Usiz gap comma splice bo‘lib qoladi. «However» bu yerda vergul nuqtali vergulga almashtirilmasa ishlamaydi.',
          ru: 'Части противопоставлены, поэтому после запятой нужен союз контраста: but, while, whereas или yet. Без него получится comma splice. «However» здесь не подойдёт, если не заменить запятую на точку с запятой.',
        },
      },
    ],
  },

  // --- linking words ----------------------------------------------------------------------------
  {
    id: 'drill.linking_words',
    kind: 'drill',
    errorTag: 'linking_words',
    node: 'writing.coherence',
    levels: [4, 8],
    minutes: 5,
    aiVariants: true,
    title: { en: 'Linking words', uz: 'Bog‘lovchi so‘zlar', ru: 'Слова-связки' },
    explain: {
      en: 'A linker must match the logic between two ideas. Contrast: however, whereas, although, on the other hand (only for the other side of the same question). Result: therefore, as a result, consequently. Addition: moreover, in addition, also. Example: for example, for instance, such as. Typical errors are “On the other hand” used to add a point, “Moreover” before a contrasting idea, and “Although…, but…” (one contrast word is enough). Do not start every sentence with a linker: reference words (this, these changes, such policies) often connect ideas more naturally and score better for cohesion.',
      uz: 'Bog‘lovchi ikki fikr orasidagi mantiqqa mos bo‘lishi kerak. Qarama-qarshilik: however, whereas, although, on the other hand (faqat o‘sha masalaning boshqa tomoni uchun). Natija: therefore, as a result, consequently. Qo‘shimcha: moreover, in addition, also. Misol: for example, for instance, such as. Odatiy xatolar: fikr qo‘shish uchun «On the other hand», zid fikrdan oldin «Moreover» va «Although…, but…» (bitta qarama-qarshilik so‘zi yetarli). Har bir gapni bog‘lovchi bilan boshlamang: this, these changes, such policies kabi ko‘rsatish so‘zlari fikrlarni tabiiyroq bog‘laydi va izchillik uchun yuqoriroq baholanadi.',
      ru: 'Связка должна соответствовать логике между мыслями. Контраст: however, whereas, although, on the other hand (только для другой стороны того же вопроса). Следствие: therefore, as a result, consequently. Добавление: moreover, in addition, also. Пример: for example, for instance, such as. Типичные ошибки — «On the other hand» для добавления мысли, «Moreover» перед противоположной идеей и «Although…, but…» (достаточно одного слова контраста). Не начинайте каждое предложение со связки: слова this, these changes, such policies часто связывают мысли естественнее и ценятся выше за связность.',
    },
    items: [
      {
        id: 'h1',
        prompt: 'Choose the linker that fits: “Cars are convenient. ____, they are a major source of air pollution.”',
        options: ['Moreover', 'However', 'Therefore', 'For example'],
        answer: 1,
        explanation: {
          en: 'The second sentence contrasts with the first (convenient vs polluting), so a contrast linker is needed: However. “Moreover” adds a similar point, “Therefore” shows a result, and “For example” introduces an illustration of the same idea.',
          uz: 'Ikkinchi gap birinchisiga zid (qulay va ifloslantiruvchi), shuning uchun qarama-qarshilik bog‘lovchisi kerak: However. «Moreover» o‘xshash fikr qo‘shadi, «Therefore» natijani ko‘rsatadi, «For example» esa o‘sha fikrga misol keltiradi.',
          ru: 'Второе предложение противопоставлено первому (удобно, но загрязняет), поэтому нужна связка контраста: However. «Moreover» добавляет похожую мысль, «Therefore» показывает следствие, а «For example» вводит пример той же мысли.',
        },
      },
      {
        id: 'h2',
        prompt: 'Choose the correct sentence.',
        options: [
          'Although the course is expensive, but many students take it.',
          'Although the course is expensive, however many students take it.',
          'Although the course is expensive, many students take it.',
        ],
        answer: 2,
        explanation: {
          en: '“Although” already shows the contrast, so the second clause needs no “but” or “however”. “Although…, but…” copies Russian “хотя…, но…” and Uzbek “…bo‘lsa-da, lekin…”. Use one or the other: The course is expensive, but many students take it.',
          uz: '«Although» qarama-qarshilikni allaqachon ko‘rsatadi, shuning uchun ikkinchi qismga «but» yoki «however» kerak emas. «Although…, but…» o‘zbekcha «…bo‘lsa-da, lekin…» va ruscha «хотя…, но…» qolipidan ko‘chirilgan. Ulardan bittasini ishlating: The course is expensive, but many students take it.',
          ru: '«Although» уже выражает контраст, поэтому во второй части не нужны «but» или «however». «Although…, but…» — калька с «хотя…, но…». Используйте что-то одно: The course is expensive, but many students take it.',
        },
      },
      {
        id: 'h3',
        prompt: 'Choose the linker that fits: “The factory closed in 2015. ____, hundreds of people lost their jobs.”',
        options: ['On the other hand', 'In contrast', 'Similarly', 'As a result'],
        answer: 3,
        explanation: {
          en: 'Losing jobs is a consequence of the factory closing, so the linker must show a result: As a result (or Consequently). “On the other hand” and “In contrast” introduce an opposite idea, and “Similarly” introduces a comparable one.',
          uz: 'Ishdan ayrilish zavod yopilishining oqibati, shuning uchun bog‘lovchi natijani ko‘rsatishi kerak: As a result (yoki Consequently). «On the other hand» va «In contrast» zid fikrni, «Similarly» esa o‘xshash fikrni kiritadi.',
          ru: 'Потеря работы — следствие закрытия завода, поэтому нужна связка следствия: As a result (или Consequently). «On the other hand» и «In contrast» вводят противоположную мысль, а «Similarly» — похожую.',
        },
      },
      {
        id: 'h4',
        prompt: 'Which sentence uses “On the other hand” correctly?',
        options: [
          'City life gives access to good jobs. On the other hand, it offers more entertainment.',
          'City life gives access to good jobs. On the other hand, the cost of living is much higher.',
          'City life gives access to good jobs. On the other hand, this is why many people move there.',
        ],
        answer: 1,
        explanation: {
          en: '“On the other hand” introduces the other side of the same question: a benefit, then a drawback. More entertainment is another benefit (use “Moreover”), and the third option shows a result (use “That is why”).',
          uz: '«On the other hand» o‘sha masalaning ikkinchi tomonini kiritadi: avval afzallik, keyin kamchilik. Ko‘proq ko‘ngilochar imkoniyatlar — yana bir afzallik («Moreover» ishlating), uchinchi variant esa natijani ko‘rsatadi («That is why» ishlating).',
          ru: '«On the other hand» вводит другую сторону того же вопроса: сначала плюс, затем минус. Больше развлечений — это ещё один плюс (нужно «Moreover»), а третий вариант выражает следствие (нужно «That is why»).',
        },
      },
      {
        id: 'h5',
        prompt: 'Write one word: Many teenagers spend hours online every day. ____ example, some spend more time on social media than on homework.',
        answer: ['for'],
        explanation: {
          en: 'The fixed phrase is “For example” (or “For instance”). Learners sometimes write “By example” or “As example”, which do not exist in English. Use “such as” only inside a sentence, before a noun: subjects such as art and music.',
          uz: 'Turg‘un ibora — «For example» (yoki «For instance»). Ba’zan «By example» yoki «As example» deb yoziladi, ingliz tilida bunday ibora yo‘q. «Such as» faqat gap ichida, ot oldidan ishlatiladi: subjects such as art and music.',
          ru: 'Устойчивое выражение — «For example» (или «For instance»). Иногда пишут «By example» или «As example» — таких выражений в английском нет. «Such as» ставится только внутри предложения перед существительным: subjects such as art and music.',
        },
      },
      {
        id: 'h6',
        prompt: 'Choose the linker that fits: “Rural areas have cleaner air, ____ cities offer better access to healthcare.”',
        options: ['whereas', 'because', 'so', 'moreover'],
        answer: 0,
        explanation: {
          en: 'The sentence compares two different places, so “whereas” (or “while”) is right: it joins two contrasting clauses after a comma. “Because” and “so” show cause and result, and “moreover” adds a point and cannot join clauses after a comma.',
          uz: 'Gap ikki xil joyni solishtiradi, shuning uchun «whereas» (yoki «while») to‘g‘ri: u verguldan keyin ikki zid qismni bog‘laydi. «Because» va «so» sabab va natijani bildiradi, «moreover» esa fikr qo‘shadi va verguldan keyin gaplarni bog‘lay olmaydi.',
          ru: 'В предложении сравниваются два разных места, поэтому верно «whereas» (или «while»): оно соединяет противопоставленные части после запятой. «Because» и «so» выражают причину и следствие, а «moreover» добавляет мысль и не может соединять части после запятой.',
        },
      },
      {
        id: 'h7',
        prompt: 'Choose the best version for an essay.',
        options: [
          'Firstly, tourism creates jobs. Secondly, moreover, it brings money to local businesses. Furthermore, in addition, it supports culture.',
          'Tourism creates jobs. However, it brings money to local businesses. Therefore, it supports culture.',
          'Tourism creates jobs and brings money to local businesses. This income often helps to protect local culture.',
        ],
        answer: 2,
        explanation: {
          en: 'The third version links ideas with “and” and the reference phrase “This income”, which is natural and clear. The first stacks two linkers before each idea, and the second uses “However” and “Therefore” where there is no contrast or result.',
          uz: 'Uchinchi variant fikrlarni «and» va «This income» ko‘rsatish iborasi bilan bog‘laydi — bu tabiiy va aniq. Birinchisida har bir fikr oldida ikkitadan bog‘lovchi bor, ikkinchisida esa qarama-qarshilik yoki natija yo‘q joyda «However» va «Therefore» ishlatilgan.',
          ru: 'Третий вариант связывает мысли через «and» и указательное «This income» — естественно и ясно. В первом перед каждой мыслью по две связки, а во втором «However» и «Therefore» стоят там, где нет ни контраста, ни следствия.',
        },
      },
      {
        id: 'h8',
        prompt: 'Write one word: Fuel prices rose sharply in the spring. ____, more people started using public transport.',
        answer: ['therefore', 'consequently', 'hence', 'thus'],
        explanation: {
          en: 'More people using public transport is a result of higher fuel prices, so a result linker fits: Therefore, Consequently or Thus. “However” would signal a contrast, and “Moreover” would add an unrelated point.',
          uz: 'Ko‘proq odam jamoat transportidan foydalana boshlagani yoqilg‘i narxi oshganining natijasi, shuning uchun natija bog‘lovchisi mos: Therefore, Consequently yoki Thus. «However» qarama-qarshilikni, «Moreover» esa bog‘liq bo‘lmagan qo‘shimcha fikrni bildiradi.',
          ru: 'То, что больше людей пересели на общественный транспорт, — следствие роста цен на топливо, поэтому подходит связка следствия: Therefore, Consequently или Thus. «However» указывал бы на контраст, а «Moreover» добавил бы постороннюю мысль.',
        },
      },
    ],
  },

  // --- collocations ----------------------------------------------------------------------------
  {
    id: 'drill.collocations',
    kind: 'drill',
    errorTag: 'collocations',
    node: 'writing.lexical_resource',
    levels: [4, 8],
    minutes: 5,
    aiVariants: true,
    title: { en: 'Word partners (collocations)', uz: 'So‘z birikmalari (kollokatsiyalar)', ru: 'Сочетаемость слов (коллокации)' },
    explain: {
      en: 'Collocations are word partners that simply go together, and translating from Russian or Uzbek word by word breaks them. English says do or carry out research (not make), make a decision, make progress, take an exam, pay attention, commit a crime, raise awareness, heavy traffic, heavy rain, a high price (not an expensive price), a sharp rise, a slight fall. When you learn a new noun, learn the verb and the adjective that go with it. In Task 1, pair rise, increase and fall with sharp, steady, slight or significant.',
      uz: 'Kollokatsiyalar — doim birga keladigan so‘z juftlari, o‘zbek yoki rus tilidan so‘zma-so‘z tarjima ularni buzadi. Ingliz tilida do yoki carry out research (make emas), make a decision, make progress, take an exam, pay attention, commit a crime, raise awareness, heavy traffic, heavy rain, a high price (an expensive price emas), a sharp rise, a slight fall deyiladi. Yangi otni o‘rganganda u bilan keladigan fe’l va sifatni ham yodlang. Task 1’da rise, increase va fall so‘zlarini sharp, steady, slight yoki significant bilan juftlang.',
      ru: 'Коллокации — пары слов, которые просто сочетаются друг с другом; дословный перевод с русского или узбекского их ломает. По-английски говорят do или carry out research (а не make), make a decision, make progress, take an exam, pay attention, commit a crime, raise awareness, heavy traffic, heavy rain, a high price (а не an expensive price), a sharp rise, a slight fall. Изучая новое существительное, запоминайте глагол и прилагательное, которые с ним сочетаются. В Task 1 сочетайте rise, increase и fall с sharp, steady, slight или significant.',
    },
    items: [
      {
        id: 'i1',
        prompt: 'Choose the correct sentence.',
        options: [
          'Scientists made a research into sleep and memory.',
          'Scientists produced a research into sleep and memory.',
          'Scientists carried out research into sleep and memory.',
        ],
        answer: 2,
        explanation: {
          en: 'Research is “done” or “carried out”, never “made”, and it takes no article because it is uncountable. “Make a research” comes from Russian “сделать исследование” and Uzbek “tadqiqot qilmoq”. You can also say “conducted a study”.',
          uz: 'Research «do» yoki «carry out» qilinadi, hech qachon «make» emas, va u sanalmagani uchun artikl olmaydi. «Make a research» o‘zbekcha «tadqiqot qilmoq» va ruscha «сделать исследование»dan kelib chiqqan. «Conducted a study» deyish ham mumkin.',
          ru: 'Research «do» или «carry out», но никогда не «make», и без артикля, потому что слово неисчисляемое. «Make a research» — калька с «сделать исследование». Можно также сказать «conducted a study».',
        },
      },
      {
        id: 'i2',
        prompt: 'Choose the word that fits: “Every morning there is ____ traffic on the main road into the city.”',
        options: ['strong', 'hard', 'heavy', 'big'],
        answer: 2,
        explanation: {
          en: 'English says “heavy traffic” (also heavy rain, heavy snow, a heavy smoker). “Big traffic” and “strong traffic” are translations of Russian “сильные пробки” and Uzbek “katta tirbandlik”. The opposite is “light traffic”.',
          uz: 'Ingliz tilida «heavy traffic» deyiladi (heavy rain, heavy snow, a heavy smoker ham). «Big traffic» va «strong traffic» o‘zbekcha «katta tirbandlik» yoki ruscha «сильные пробки»dan tarjima. Teskarisi — «light traffic».',
          ru: 'По-английски «heavy traffic» (а также heavy rain, heavy snow, a heavy smoker). «Big traffic» и «strong traffic» — кальки с «большое движение» и «сильные пробки». Противоположное — «light traffic».',
        },
      },
      {
        id: 'i3',
        prompt: 'Write one word: Before you ____ a decision about your university, talk to current students.',
        answer: ['make', 'take'],
        explanation: {
          en: 'The usual partner is “make a decision” (“take a decision” is also used in British English). “Do a decision” or “accept a decision” in this sense come from translating Russian “принять решение” and Uzbek “qaror qabul qilmoq” word by word.',
          uz: 'Odatiy jufti — «make a decision» (Britaniya ingliz tilida «take a decision» ham ishlatiladi). Bu ma’noda «do a decision» yoki «accept a decision» xato, ular «qaror qabul qilmoq» va «принять решение»ning so‘zma-so‘z tarjimasidan kelib chiqadi.',
          ru: 'Обычная пара — «make a decision» (в британском английском встречается и «take a decision»). «Do a decision» или «accept a decision» в этом значении — ошибки от дословного перевода «принять решение».',
        },
      },
      {
        id: 'i4',
        prompt: 'Choose the correct sentence about a chart.',
        options: [
          'There was a sharp rise in house prices in 2008.',
          'There was a high rise in house prices in 2008.',
          'There was a hard rise in house prices in 2008.',
        ],
        answer: 0,
        explanation: {
          en: 'In Task 1 “rise” and “fall” pair with sharp, steep, steady, slight, significant or dramatic. “A high-rise” is a tall building, and “a hard rise” is not used. Learn the set: a sharp rise, a steady increase, a slight drop.',
          uz: 'Task 1’da «rise» va «fall» sharp, steep, steady, slight, significant yoki dramatic bilan keladi. «A high-rise» — ko‘p qavatli bino, «a hard rise» esa ishlatilmaydi. To‘plamni yodlang: a sharp rise, a steady increase, a slight drop.',
          ru: 'В Task 1 «rise» и «fall» сочетаются с sharp, steep, steady, slight, significant или dramatic. «A high-rise» — высотное здание, а «a hard rise» не употребляется. Запомните набор: a sharp rise, a steady increase, a slight drop.',
        },
      },
      {
        id: 'i5',
        prompt: 'Choose the correct sentence.',
        options: [
          'The prices of flats in the city centre are very expensive.',
          'The prices of flats in the city centre are very high.',
          'The prices of flats in the city centre are very big.',
        ],
        answer: 1,
        explanation: {
          en: 'Things are expensive; prices are high or low. “Expensive prices” is a common error from Russian “дорогие цены”. Say “flats in the centre are very expensive” or “the prices are very high”, but do not mix the two.',
          uz: 'Narsalar expensive bo‘ladi, narxlar esa high yoki low. «Expensive prices» keng tarqalgan xato. «Flats in the centre are very expensive» yoki «the prices are very high» deng, lekin ikkalasini aralashtirmang.',
          ru: 'Дорогими (expensive) бывают вещи, а цены — high или low. «Expensive prices» — частая ошибка из-за «дорогие цены». Говорите «flats in the centre are very expensive» или «the prices are very high», но не смешивайте.',
        },
      },
      {
        id: 'i6',
        prompt: 'Write one word: Teachers often complain that students do not ____ attention in class.',
        answer: ['pay'],
        explanation: {
          en: 'The fixed partner is “pay attention (to)”. In this sentence “give attention” and “turn attention” are wrong: they translate Russian “обращать внимание” and Uzbek “e’tibor bermoq” word by word. In an essay you can also “draw attention to” a problem.',
          uz: 'Turg‘un jufti — «pay attention (to)». Bu gapda «give attention» va «turn attention» xato: ular o‘zbekcha «e’tibor bermoq» va ruscha «обращать внимание»ning so‘zma-so‘z tarjimasi. Inshoda muammoga «draw attention to» deyish ham mumkin.',
          ru: 'Устойчивая пара — «pay attention (to)». В этом предложении «give attention» и «turn attention» — ошибки, кальки с «обращать внимание». В эссе можно также «draw attention to» проблему.',
        },
      },
      {
        id: 'i7',
        prompt: 'Choose the word that fits: “Governments should run campaigns to ____ awareness of healthy eating.”',
        options: ['rise', 'raise', 'grow', 'lift'],
        answer: 1,
        explanation: {
          en: 'The collocation is “raise awareness (of)”. “Raise” takes an object (raise awareness, raise money), while “rise” has no object (prices rise). “Grow awareness” and “lift awareness” are not standard in academic writing.',
          uz: 'Kollokatsiya — «raise awareness (of)». «Raise» to‘ldiruvchi oladi (raise awareness, raise money), «rise» esa olmaydi (prices rise). «Grow awareness» va «lift awareness» akademik yozuvda me’yoriy emas.',
          ru: 'Коллокация — «raise awareness (of)». «Raise» требует дополнения (raise awareness, raise money), а «rise» — нет (prices rise). «Grow awareness» и «lift awareness» не являются нормой в академическом письме.',
        },
      },
      {
        id: 'i8',
        prompt: 'Choose the correct sentence.',
        options: [
          'Young people who make crimes often come from poor areas.',
          'Young people who do crimes often come from poor areas.',
          'Young people who commit crimes often come from poor areas.',
        ],
        answer: 2,
        explanation: {
          en: 'Crimes are “committed”: commit a crime, commit an offence. “Make a crime” and “do a crime” are direct translations of Russian “совершать преступление” and Uzbek “jinoyat qilmoq”. This collocation appears in almost every crime essay.',
          uz: 'Jinoyat «commit» qilinadi: commit a crime, commit an offence. «Make a crime» va «do a crime» «jinoyat qilmoq» va «совершать преступление»ning to‘g‘ridan-to‘g‘ri tarjimasi. Bu kollokatsiya jinoyat haqidagi deyarli har bir inshoda uchraydi.',
          ru: 'Преступление «commit»: commit a crime, commit an offence. «Make a crime» и «do a crime» — дословный перевод «совершать преступление». Эта коллокация встречается почти в каждом эссе о преступности.',
        },
      },
    ],
  },

  // --- register --------------------------------------------------------------------------------
  {
    id: 'drill.register',
    kind: 'drill',
    errorTag: 'register',
    node: 'writing.lexical_resource',
    levels: [4, 8],
    minutes: 5,
    aiVariants: true,
    title: { en: 'Formal and informal style', uz: 'Rasmiy va norasmiy uslub', ru: 'Формальный и неформальный стиль' },
    explain: {
      en: 'Writing Task 2 and Academic Task 1 need a neutral, formal style. Avoid contractions (don’t → do not), slang and vague words (kids → children; stuff, things → factors, aspects; a lot of → many, a large number of; gonna → going to), direct questions to the reader (What do you think?) and exclamation marks. Prefer a precise single verb to an informal phrasal verb: go up → increase, get better → improve, cut down on → reduce. Speaking is the opposite: natural, personal and relaxed, so essay phrases like “In conclusion” sound odd there. In General Training, a letter to a friend is informal, but a letter to a manager or a company is formal.',
      uz: 'Writing Task 2 va Academic Task 1 neytral, rasmiy uslubni talab qiladi. Qisqartmalar (don’t → do not), jargon va noaniq so‘zlar (kids → children; stuff, things → factors, aspects; a lot of → many, a large number of; gonna → going to), o‘quvchiga to‘g‘ridan-to‘g‘ri savollar (What do you think?) va undov belgilaridan qoching. Norasmiy frazali fe’l o‘rniga aniq bitta fe’l tanlang: go up → increase, get better → improve, cut down on → reduce. Speaking esa aksincha: tabiiy, shaxsiy va erkin, shuning uchun «In conclusion» kabi insho iboralari u yerda g‘alati eshitiladi. General Training’da do‘stga xat norasmiy, menejer yoki kompaniyaga xat esa rasmiy bo‘ladi.',
      ru: 'Writing Task 2 и Academic Task 1 требуют нейтрального формального стиля. Избегайте сокращений (don’t → do not), сленга и расплывчатых слов (kids → children; stuff, things → factors, aspects; a lot of → many, a large number of; gonna → going to), прямых вопросов читателю (What do you think?) и восклицательных знаков. Вместо разговорного фразового глагола выбирайте точный однословный: go up → increase, get better → improve, cut down on → reduce. В Speaking наоборот: естественно, лично и непринуждённо, поэтому фразы из эссе вроде «In conclusion» там звучат странно. В General Training письмо другу неформальное, а письмо менеджеру или компании — формальное.',
    },
    items: [
      {
        id: 'j1',
        prompt: 'Which sentence suits an IELTS Task 2 essay?',
        options: [
          'Kids today spend way too much time on their phones.',
          'Children today spend an excessive amount of time on their phones.',
          'Kids today spend loads of time on their phones, right?',
        ],
        answer: 1,
        explanation: {
          en: 'The second sentence uses formal vocabulary (children, an excessive amount of time). “Kids”, “way too much” and “loads of” are conversational, and a tag question like “right?” speaks to the reader as if in a chat.',
          uz: 'Ikkinchi gapda rasmiy lug‘at ishlatilgan (children, an excessive amount of time). «Kids», «way too much» va «loads of» so‘zlashuv uslubiga xos, «right?» kabi savol esa o‘quvchiga suhbatdagidek murojaat qiladi.',
          ru: 'Во втором предложении формальная лексика (children, an excessive amount of time). «Kids», «way too much» и «loads of» — разговорные, а вопрос-хвостик «right?» обращается к читателю как в чате.',
        },
      },
      {
        id: 'j2',
        prompt: 'Choose the most suitable sentence for an academic essay.',
        options: [
          'There are lots of things that make city life hard.',
          'Loads of stuff makes city life tough.',
          'Several factors make city life difficult.',
        ],
        answer: 2,
        explanation: {
          en: '“Several factors” and “difficult” are precise and formal. “Lots of things”, “stuff” and “tough” are vague or informal, and examiners read them as limited vocabulary for an essay.',
          uz: '«Several factors» va «difficult» aniq va rasmiy. «Lots of things», «stuff» va «tough» noaniq yoki norasmiy, imtihonchi ularni insho uchun cheklangan lug‘at deb biladi.',
          ru: '«Several factors» и «difficult» — точные и формальные. «Lots of things», «stuff» и «tough» — расплывчатые или разговорные, и экзаменатор воспримет их как ограниченный словарный запас для эссе.',
        },
      },
      {
        id: 'j3',
        prompt: 'Write one word to make it formal: “Prices went up a lot.” → “Prices ____ significantly.”',
        answer: ['increased', 'rose'],
        explanation: {
          en: 'A single precise verb is more formal than a phrasal verb: increased or rose instead of “went up”, and “significantly” instead of “a lot”. This swap is one of the quickest ways to make Task 1 sound academic.',
          uz: 'Bitta aniq fe’l frazali fe’ldan rasmiyroq: «went up» o‘rniga increased yoki rose, «a lot» o‘rniga «significantly». Bu almashtirish Task 1’ni akademik qilishning eng tez yo‘llaridan biri.',
          ru: 'Один точный глагол формальнее фразового: increased или rose вместо «went up», «significantly» вместо «a lot». Такая замена — один из самых быстрых способов сделать Task 1 академичным.',
        },
      },
      {
        id: 'j4',
        prompt: 'Which sentence suits Academic Task 1?',
        options: [
          'The number of visitors fell slightly in 2012.',
          'The number of visitors went down a bit in 2012.',
          'The number of visitors kinda dropped in 2012.',
        ],
        answer: 0,
        explanation: {
          en: '“Fell slightly” is precise and formal. “Went down a bit” is conversational, and “kinda” is spoken slang that should never appear in an IELTS essay or report.',
          uz: '«Fell slightly» aniq va rasmiy. «Went down a bit» so‘zlashuv uslubi, «kinda» esa og‘zaki jargon, u IELTS insho yoki hisobotida hech qachon bo‘lmasligi kerak.',
          ru: '«Fell slightly» — точно и формально. «Went down a bit» — разговорно, а «kinda» — устный сленг, которому не место в эссе или отчёте IELTS.',
        },
      },
      {
        id: 'j5',
        prompt: 'Choose the best opening for a Task 2 conclusion.',
        options: [
          'So yeah, that’s why I think it’s a good idea!',
          'In conclusion, I believe the benefits of this policy outweigh its drawbacks.',
          'To sum up, what do you think? Is it good or bad?',
        ],
        answer: 1,
        explanation: {
          en: 'A conclusion restates your position clearly and formally. The first option uses slang (“So yeah”), contractions and an exclamation mark; the third asks the reader questions instead of giving your answer, which also leaves the task unfinished.',
          uz: 'Xulosa pozitsiyangizni aniq va rasmiy tarzda takrorlaydi. Birinchi variantda jargon («So yeah»), qisqartmalar va undov belgisi bor; uchinchisida esa javob berish o‘rniga o‘quvchiga savol beriladi, bu topshiriqni ham tugallanmagan holda qoldiradi.',
          ru: 'Заключение чётко и формально повторяет вашу позицию. В первом варианте сленг («So yeah»), сокращения и восклицательный знак; в третьем вместо ответа читателю задаются вопросы, и задание остаётся невыполненным.',
        },
      },
      {
        id: 'j6',
        prompt: 'Which sentence is written in a suitable style for an essay?',
        options: [
          'Governments shouldn’t ignore youth unemployment.',
          'Governments gotta stop ignoring youth unemployment.',
          'Governments should not ignore youth unemployment.',
        ],
        answer: 2,
        explanation: {
          en: 'Essays use full forms: should not, do not, it is. “Shouldn’t” is a contraction, which is fine in speaking but too informal for Task 2, and “gotta” is spoken slang.',
          uz: 'Inshoda to‘liq shakllar ishlatiladi: should not, do not, it is. «Shouldn’t» qisqartma — nutqda mumkin, lekin Task 2 uchun juda norasmiy, «gotta» esa og‘zaki jargon.',
          ru: 'В эссе используются полные формы: should not, do not, it is. «Shouldn’t» — сокращение, нормальное в речи, но слишком неформальное для Task 2, а «gotta» — устный сленг.',
        },
      },
      {
        id: 'j7',
        prompt: 'Write one word for a formal General Training letter: “I am writing to ____ about the delay to my order.”',
        answer: ['complain', 'enquire', 'inquire'],
        explanation: {
          en: '“I am writing to complain / enquire about…” is the standard formal opening that states your purpose at once. Avoid informal openings such as “I wanna tell you about…” in a letter to a company.',
          uz: '«I am writing to complain / enquire about…» — maqsadni darhol bildiradigan standart rasmiy kirish. Kompaniyaga yozilgan xatda «I wanna tell you about…» kabi norasmiy kirishdan qoching.',
          ru: '«I am writing to complain / enquire about…» — стандартное формальное начало, которое сразу называет цель письма. В письме компании избегайте неформального «I wanna tell you about…».',
        },
      },
      {
        id: 'j8',
        prompt: 'Speaking Part 1: “Do you like cooking?” Which answer has the right style for speaking?',
        options: [
          'Yes, I really do. I cook most evenings, usually simple dishes like plov or soup, because it helps me relax after work.',
          'Furthermore, cooking constitutes a significant aspect of my daily existence.',
          'In conclusion, I would argue that cooking is beneficial for society as a whole.',
        ],
        answer: 0,
        explanation: {
          en: 'Speaking should sound natural and personal: a direct answer, a detail and a reason. The other two use essay language (“Furthermore”, “In conclusion”, “constitutes”) that sounds memorised in a conversation and says nothing about you.',
          uz: 'Nutq tabiiy va shaxsiy eshitilishi kerak: to‘g‘ridan-to‘g‘ri javob, tafsilot va sabab. Qolgan ikkitasida insho tili («Furthermore», «In conclusion», «constitutes») ishlatilgan, suhbatda bu yodlangandek eshitiladi va siz haqingizda hech narsa demaydi.',
          ru: 'Речь должна звучать естественно и лично: прямой ответ, деталь и причина. В двух других вариантах язык эссе («Furthermore», «In conclusion», «constitutes»), который в разговоре звучит заученно и ничего не говорит о вас.',
        },
      },
    ],
  },

  // --- underdeveloped answers ---------------------------------------------------------------------
  {
    id: 'drill.underdeveloped_answers',
    kind: 'drill',
    errorTag: 'underdeveloped_answers',
    node: 'speaking.fluency_coherence',
    levels: [4, 8],
    minutes: 5,
    aiVariants: true,
    title: { en: 'Developing your answers', uz: 'Javoblarni rivojlantirish', ru: 'Развёрнутые ответы' },
    explain: {
      en: 'Examiners can only score what you say, and a one-word or one-sentence answer gives almost no evidence of fluency, vocabulary or grammar. Use a simple pattern: Answer, then a Reason, then an Example or detail (A-R-E). In Part 1, aim for two or three sentences (about 15–25 seconds). In Part 2, cover every point on the card and keep talking until the examiner stops you: a short story with a time, a place and a feeling helps. In Part 3, give an opinion, explain why, add an example or a contrast (but some people…), and finish with a short conclusion. Do not recite memorised speeches; extend with real details.',
      uz: 'Imtihonchi faqat siz aytgan narsani baholay oladi, bir so‘zli yoki bir gapli javob esa ravonlik, lug‘at va grammatika haqida deyarli hech qanday dalil bermaydi. Oddiy qolipdan foydalaning: Javob, keyin Sabab, keyin Misol yoki tafsilot (A-R-E). 1-qismda ikki-uch gap (taxminan 15–25 soniya). 2-qismda kartochkadagi har bir bandni yoritib, imtihonchi to‘xtatguncha gapiring: vaqt, joy va his-tuyg‘u bilan qisqa hikoya yordam beradi. 3-qismda fikr bildiring, sababini tushuntiring, misol yoki qarama-qarshilik qo‘shing (but some people…) va qisqa xulosa bilan yakunlang. Yodlangan nutqni aytmang; javobni haqiqiy tafsilotlar bilan kengaytiring.',
      ru: 'Экзаменатор оценивает только то, что вы сказали, а ответ из одного слова или предложения почти не даёт доказательств беглости, лексики и грамматики. Используйте простую схему: Ответ, затем Причина, затем Пример или деталь (A-R-E). В части 1 — два-три предложения (около 15–25 секунд). В части 2 раскройте все пункты карточки и говорите, пока экзаменатор вас не остановит: помогает короткая история со временем, местом и чувствами. В части 3 выскажите мнение, объясните почему, добавьте пример или контраст (but some people…) и завершите коротким выводом. Не пересказывайте заученные тексты; развивайте ответ реальными деталями.',
    },
    items: [
      {
        id: 'k1',
        prompt: 'Part 1: “Do you like reading?” Which answer is best developed?',
        options: [
          'Yes.',
          'Reading is a very important activity for every person in modern society.',
          'Yes, I do, especially novels. I usually read before bed because it helps me switch off after a busy day.',
          'Yes, I like reading. I like it.',
        ],
        answer: 2,
        explanation: {
          en: 'The third answer follows A-R-E: a direct answer, a detail (novels, before bed) and a reason. “Yes.” gives the examiner nothing to score, the fourth just repeats itself, and the second is a general statement that avoids talking about you.',
          uz: 'Uchinchi javob A-R-E qolipiga mos: to‘g‘ridan-to‘g‘ri javob, tafsilot (romanlar, uxlashdan oldin) va sabab. «Yes.» imtihonchiga baholash uchun hech narsa bermaydi, to‘rtinchisi o‘zini takrorlaydi, ikkinchisi esa siz haqingizda gapirmasdan umumiy fikr aytadi.',
          ru: 'Третий ответ построен по A-R-E: прямой ответ, деталь (романы, перед сном) и причина. «Yes.» не даёт экзаменатору ничего для оценки, четвёртый повторяет сам себя, а второй — общее утверждение, которое уходит от рассказа о себе.',
        },
      },
      {
        id: 'k2',
        prompt: 'Part 1: “What do you do in your free time?” Which answer is best developed?',
        options: [
          'I play football with friends on Saturdays, mainly because it’s the only time we’re all free, and it keeps me fit after a week at my desk.',
          'Football.',
          'In my free time I do many things, many different things, a lot of things.',
        ],
        answer: 0,
        explanation: {
          en: 'The first answer names the activity, adds when and with whom, and gives two reasons, all in about 20 seconds. A one-word answer shows no language, and the third fills time with repetition instead of content.',
          uz: 'Birinchi javob mashg‘ulotni nomlaydi, qachon va kim bilan ekanini qo‘shadi va ikkita sabab keltiradi — hammasi taxminan 20 soniyada. Bir so‘zli javob tilni ko‘rsatmaydi, uchinchisi esa vaqtni mazmun o‘rniga takrorlash bilan to‘ldiradi.',
          ru: 'Первый ответ называет занятие, добавляет когда и с кем и даёт две причины — примерно за 20 секунд. Ответ из одного слова не показывает язык, а третий заполняет время повторами вместо содержания.',
        },
      },
      {
        id: 'k3',
        prompt: 'Part 3: “Why do many young people move to big cities?” Which answer is best developed?',
        options: [
          'Because of jobs.',
          'Mainly for work. Big cities have far more jobs, especially in IT and finance, and salaries are usually higher. Two of my cousins moved to the capital after university for exactly that reason. That said, some young people now return home because rents are so high.',
          'Young people move to big cities. Big cities are big. There are many people in big cities.',
        ],
        answer: 1,
        explanation: {
          en: 'The second answer gives a reason, develops it (types of jobs, salaries), supports it with an example and adds a contrast with “That said”. That is the depth Part 3 needs. The first is too short, and the third repeats the question without explaining anything.',
          uz: 'Ikkinchi javob sabab keltiradi, uni rivojlantiradi (ish turlari, maosh), misol bilan quvvatlaydi va «That said» bilan qarama-qarshilik qo‘shadi. 3-qism aynan shunday chuqurlikni talab qiladi. Birinchisi juda qisqa, uchinchisi esa hech narsani tushuntirmasdan savolni takrorlaydi.',
          ru: 'Второй ответ называет причину, развивает её (виды работы, зарплаты), подкрепляет примером и добавляет контраст через «That said». Именно такая глубина нужна в части 3. Первый слишком короткий, а третий повторяет вопрос, ничего не объясняя.',
        },
      },
      {
        id: 'k4',
        prompt: 'You said: “I prefer tea to coffee.” Which sentence best extends the answer with a reason?',
        options: [
          'Coffee is a drink.',
          'I prefer tea to coffee, tea to coffee.',
          'Tea is popular in many countries.',
          'That’s because coffee makes me nervous, while tea keeps me calm but alert.',
        ],
        answer: 3,
        explanation: {
          en: 'The last option gives a personal reason and a contrast (nervous vs calm but alert), which also shows vocabulary range. The others add no reason: one states the obvious, one repeats the answer, and one is a general fact unrelated to your preference.',
          uz: 'Oxirgi variant shaxsiy sabab va qarama-qarshilik (asabiylashish va xotirjam, lekin hushyor) beradi, bu lug‘at boyligini ham ko‘rsatadi. Qolganlari sabab qo‘shmaydi: biri o‘z-o‘zidan ma’lum narsani aytadi, biri javobni takrorlaydi, biri esa sizning tanlovingizga aloqasi yo‘q umumiy fakt.',
          ru: 'Последний вариант даёт личную причину и контраст (nervous против calm but alert), что заодно показывает словарный запас. Остальные причины не добавляют: один констатирует очевидное, другой повторяет ответ, третий — общий факт, не связанный с вашим выбором.',
        },
      },
      {
        id: 'k5',
        prompt: 'Part 2: you have spoken for 50 seconds and have covered every point on the card. What should you do?',
        options: [
          'Stop and wait for the examiner’s next question.',
          'Add detail: describe a specific moment, how you felt and why it still matters to you, until the examiner stops you.',
          'Read the points on the card aloud again in the same words.',
          'Ask the examiner whether that is enough.',
        ],
        answer: 1,
        explanation: {
          en: 'The long turn lasts up to two minutes, and stopping early gives less evidence for every criterion. Extend with a specific moment, your feelings and the reason it matters. Repeating the card or asking the examiner wastes time without adding language.',
          uz: 'Uzun javob ikki daqiqagacha davom etadi, erta to‘xtash esa har bir mezon uchun kamroq dalil beradi. Aniq bir lahza, his-tuyg‘ularingiz va buning nega muhimligi bilan kengaytiring. Kartochkani takrorlash yoki imtihonchidan so‘rash til qo‘shmasdan vaqtni sarflaydi.',
          ru: 'Монолог длится до двух минут, и ранняя остановка даёт меньше доказательств по каждому критерию. Расширяйте ответ конкретным моментом, своими чувствами и тем, почему это важно. Повтор пунктов карточки или вопрос экзаменатору тратят время, не добавляя языка.',
        },
      },
      {
        id: 'k6',
        prompt: 'Part 3: “Is it better to study alone or in a group?” Which answer shows Answer, Reason, Example?',
        options: [
          'It depends.',
          'Studying in a group is studying with other people, and studying alone is studying without other people.',
          'I think it depends on the subject. For memorising facts, studying alone is better because you can focus; I learn vocabulary on my own, for instance. But for solving problems, a group helps because people explain things in different ways.',
        ],
        answer: 2,
        explanation: {
          en: 'The third answer gives a position, reasons for both sides and a personal example, so “it depends” is actually explained. On its own, “It depends.” is undeveloped, and the second answer only defines the words in the question.',
          uz: 'Uchinchi javob pozitsiya, ikkala tomon uchun sabablar va shaxsiy misol beradi, shuning uchun «it depends» haqiqatan tushuntirilgan. Yolg‘iz «It depends.» rivojlantirilmagan, ikkinchi javob esa faqat savoldagi so‘zlarni ta’riflaydi.',
          ru: 'Третий ответ даёт позицию, причины для обеих сторон и личный пример, поэтому «it depends» действительно объяснено. Само по себе «It depends.» — неразвёрнутый ответ, а второй лишь определяет слова из вопроса.',
        },
      },
      {
        id: 'k7',
        prompt: 'Write one word to add a contrast in Part 3: “Online shopping saves a lot of time. ____, some people still enjoy going to the shops with friends.”',
        answer: ['however', 'still', 'nevertheless', 'nonetheless', 'yet'],
        explanation: {
          en: 'Adding the other side with “However” (or “Nevertheless”) turns a single point into a balanced Part 3 answer. Linking the contrast clearly is part of what examiners call coherence.',
          uz: 'Ikkinchi tomonni «However» (yoki «Nevertheless») bilan qo‘shish bitta fikrni muvozanatli 3-qism javobiga aylantiradi. Qarama-qarshilikni aniq bog‘lash imtihonchilar izchillik deb ataydigan narsaning bir qismi.',
          ru: 'Добавление другой стороны через «However» (или «Nevertheless») превращает одну мысль в сбалансированный ответ для части 3. Чёткая связка контраста — часть того, что экзаменаторы называют связностью.',
        },
      },
      {
        id: 'k8',
        prompt: 'Write one word to add a reason in Part 1: “I don’t watch much TV ____ I prefer watching videos on my phone.”',
        answer: ['because', 'as', 'since'],
        explanation: {
          en: '“Because” (or “as” / “since”) adds the reason step of A-R-E without starting a new sentence. In Part 1, one reason and one detail are usually enough for a well-developed answer.',
          uz: '«Because» (yoki «as» / «since») yangi gap boshlamasdan A-R-E’ning sabab qismini qo‘shadi. 1-qismda yaxshi rivojlangan javob uchun odatda bitta sabab va bitta tafsilot yetarli.',
          ru: '«Because» (или «as» / «since») добавляет шаг «причина» схемы A-R-E без нового предложения. В части 1 обычно достаточно одной причины и одной детали, чтобы ответ был развёрнутым.',
        },
      },
    ],
  },
];
