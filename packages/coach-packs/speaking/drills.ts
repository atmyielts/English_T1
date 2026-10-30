import type { Activity } from '../src/types.ts';

// One drill per error tag in the manifest. Items are short "choose the natural
// sentence" questions set in the situations the role-plays use, plus a few gap items.
// A2 learners read `explain` and the explanations in Uzbek or Russian.

export const drills: Activity[] = [
  {
    id: 'drill.verb_tense', kind: 'drill', errorTag: 'verb_tense', node: 'conversation.accuracy', levels: [2, 5], minutes: 5, aiVariants: true,
    title: { en: 'Verb tenses in conversation', uz: 'Suhbatda fe’l zamonlari', ru: 'Времена глаголов в разговоре' },
    explain: {
      en: 'The tense tells the listener when. A finished time (yesterday, last week, in 2022) → past simple: I went. Experience or a result now, with no time given → present perfect: I have been to Dubai. Something that started in the past and is still true → present perfect with for (a period) or since (a start): I have lived here for two years. Plans you have arranged → present continuous: I’m meeting him tomorrow.',
      uz: 'Zamon tinglovchiga voqea qachon bo‘lganini aytadi. Tugagan vaqt (yesterday, last week, in 2022) → past simple: I went. Tajriba yoki hozirgi natija, vaqt aytilmasa → present perfect: I have been to Dubai. O‘tmishda boshlanib, hozir ham davom etayotgan narsa → present perfect + for (muddat) yoki since (boshlanish nuqtasi): I have lived here for two years. «I live here since two years» deyilmaydi. Kelishilgan rejalar → present continuous: I’m meeting him tomorrow.',
      ru: 'Время подсказывает слушателю, когда это было. Законченное время (yesterday, last week, in 2022) → past simple: I went. Опыт или результат сейчас, без указания времени → present perfect: I have been to Dubai. То, что началось в прошлом и продолжается сейчас, → present perfect + for (срок) или since (начало): I have lived here for two years. Нельзя «I live here since two years». Договорённые планы → present continuous: I’m meeting him tomorrow.',
    },
    items: [
      {
        id: 'vt1', prompt: 'You are telling a new colleague how long you have lived in the city. Choose the correct sentence.',
        options: ['I live here since two years.', 'I have lived here for two years.', 'I am living here since two years.'], answer: 1,
        explanation: {
          en: 'It started in the past and is still true, so use the present perfect: have lived. Use for with a period (two years) and since with a starting point (since 2023).',
          uz: 'Bu o‘tmishda boshlangan va hozir ham davom etyapti, shuning uchun present perfect: have lived. Muddat bilan for (two years), boshlanish nuqtasi bilan since (since 2023).',
          ru: 'Это началось в прошлом и продолжается сейчас, поэтому present perfect: have lived. С периодом — for (two years), с начальной точкой — since (since 2023).',
        },
      },
      {
        id: 'vt2', prompt: 'You are talking about last weekend. Choose the correct sentence.',
        options: ['I have gone to the mountains last weekend.', 'I go to the mountains last weekend.', 'I went to the mountains last weekend.'], answer: 2,
        explanation: {
          en: '“Last weekend” is a finished time, so use the past simple: went. The present perfect does not go with finished time words.',
          uz: '«Last weekend» — tugagan vaqt, shuning uchun past simple: went. Present perfect tugagan vaqtni bildiruvchi so‘zlar bilan ishlatilmaydi.',
          ru: '«Last weekend» — законченное время, поэтому past simple: went. Present perfect не употребляется со словами законченного времени.',
        },
      },
      {
        id: 'vt3', prompt: 'You want to know about a friend’s travel experience. Choose the correct question.',
        options: ['Have you ever been to London?', 'Did you ever be in London?', 'Were you ever been to London?'], answer: 0,
        explanation: {
          en: 'For life experience with no time given, use the present perfect: Have you ever been…? “Been to” means you went there and came back.',
          uz: 'Vaqt ko‘rsatilmagan hayotiy tajriba uchun present perfect: Have you ever been…? «Been to» — u yerga borib, qaytib kelganingizni bildiradi.',
          ru: 'Для жизненного опыта без указания времени — present perfect: Have you ever been…? «Been to» значит, что вы там были и вернулись.',
        },
      },
      {
        id: 'vt4', prompt: 'Complete with the right form of “miss”: Sorry I’m late — I ___ the bus.',
        answer: ['missed', 'have missed'],
        explanation: {
          en: 'A short finished event that explains why you are late: the past simple “missed” is the most natural. “I’ve missed” is also possible.',
          uz: 'Kechikish sababini tushuntiradigan qisqa, tugagan voqea: eng tabiiysi past simple — «missed». «I’ve missed» ham mumkin.',
          ru: 'Короткое законченное событие, объясняющее опоздание: естественнее всего past simple — «missed». «I’ve missed» тоже возможно.',
        },
      },
      {
        id: 'vt5', prompt: 'You have already booked a doctor’s appointment for tomorrow. Choose the most natural sentence.',
        options: ['I meet the doctor tomorrow at ten.', 'I’m meeting the doctor tomorrow at ten.', 'I will meeting the doctor tomorrow at ten.'], answer: 1,
        explanation: {
          en: 'For a plan you have already arranged, use the present continuous: I’m meeting… “Will meeting” is not possible.',
          uz: 'Oldindan kelishilgan reja uchun present continuous: I’m meeting… «Will meeting» shakli yo‘q.',
          ru: 'Для заранее договорённых планов — present continuous: I’m meeting… Формы «will meeting» не существует.',
        },
      },
      {
        id: 'vt6', prompt: 'You are telling a story about your morning. Choose the correct sentence.',
        options: ['I was waiting for the bus when it started to rain.', 'I waited for the bus when it was starting to rain.', 'I am waiting for the bus when it started to rain.'], answer: 0,
        explanation: {
          en: 'The longer background action uses the past continuous (was waiting); the short action that interrupts it uses the past simple (started).',
          uz: 'Uzoqroq davom etgan fon harakat past continuous bilan (was waiting), uni bo‘lgan qisqa harakat past simple bilan (started).',
          ru: 'Длительное фоновое действие — past continuous (was waiting), короткое действие, которое его прервало, — past simple (started).',
        },
      },
      {
        id: 'vt7', prompt: 'Complete with one word: How long ___ you worked here?',
        answer: ['have'],
        explanation: {
          en: '“How long” with an action that is still going on → present perfect: How long have you worked here?',
          uz: '«How long» + hozir ham davom etayotgan harakat → present perfect: How long have you worked here?',
          ru: '«How long» + действие, которое продолжается сейчас, → present perfect: How long have you worked here?',
        },
      },
      {
        id: 'vt8', prompt: 'At the doctor’s. Choose the correct sentence.',
        options: ['I feel bad since Monday.', 'I’ve been feeling bad since Monday.', 'I am feeling bad from Monday.'], answer: 1,
        explanation: {
          en: 'A state that started on Monday and continues now needs the present perfect (continuous) with since. Uzbek and Russian use the present here; English does not.',
          uz: 'Dushanbada boshlanib, hozir ham davom etayotgan holat: present perfect (continuous) + since. O‘zbek va rus tilida bu yerda hozirgi zamon ishlatiladi, ingliz tilida esa yo‘q.',
          ru: 'Состояние, начавшееся в понедельник и продолжающееся сейчас: present perfect (continuous) + since. В русском здесь настоящее время, в английском — нет.',
        },
      },
    ],
  },
  {
    id: 'drill.missing_be', kind: 'drill', errorTag: 'missing_be', node: 'conversation.accuracy', levels: [2, 5], minutes: 5, aiVariants: true,
    title: { en: 'Don’t forget “be”', uz: '«Be»ni unutmang', ru: 'Не забывайте «be»' },
    explain: {
      en: 'Every English sentence needs a verb. When there is no action verb, use be: I am, he/she/it is, we/you/they are. Uzbek and Russian often have no verb here, so it is easy to forget: say I am a student, She is at work, It is cold today. In questions, be comes first: Are you ready? Is it far? Before -ing, be is needed too: I am waiting.',
      uz: 'Ingliz tilida har bir gapda fe’l bo‘lishi kerak. Harakat fe’li bo‘lmasa, be ishlatiladi: I am, he/she/it is, we/you/they are. O‘zbek tilida bu yerda fe’l yo‘q («Men talabaman», «Havo sovuq»), shuning uchun uni unutish oson. To‘g‘risi: I am a student, She is at work, It is cold today. Savolda be oldinga chiqadi: Are you ready? Is it far? -ing dan oldin ham be kerak: I am waiting.',
      ru: 'В каждом английском предложении нужен глагол. Если действия нет, используйте be: I am, he/she/it is, we/you/they are. В русском здесь глагола нет («Я студент», «Холодно»), поэтому его легко забыть. Правильно: I am a student, She is at work, It is cold today. В вопросе be выходит вперёд: Are you ready? Is it far? Перед -ing тоже нужен be: I am waiting.',
    },
    items: [
      {
        id: 'mb1', prompt: 'You are introducing yourself. Choose the correct sentence.',
        options: ['I student at the university.', 'I am student at the university.', 'I am a student at the university.'], answer: 2,
        explanation: {
          en: 'You need “am” after “I”, and “a” before a job or role: I am a student.',
          uz: '«I»dan keyin «am» kerak, kasb yoki maqom oldidan esa «a»: I am a student.',
          ru: 'После «I» нужен «am», а перед профессией или ролью — «a»: I am a student.',
        },
      },
      {
        id: 'mb2', prompt: 'Talking about the weather. Choose the correct sentence.',
        options: ['Is very cold today.', 'It is very cold today.', 'Very cold today it is.'], answer: 1,
        explanation: {
          en: 'An English sentence needs a subject. For weather, time and distance the subject is “it”: It is cold. It is far.',
          uz: 'Inglizcha gapda ega bo‘lishi shart. Ob-havo, vaqt va masofa haqida ega — «it»: It is cold. It is far.',
          ru: 'В английском предложении обязательно подлежащее. Для погоды, времени и расстояния это «it»: It is cold. It is far.',
        },
      },
      {
        id: 'mb3', prompt: 'Complete with one word: My brother ___ a doctor in Tashkent.',
        answer: ['is'],
        explanation: {
          en: 'My brother = he, so the verb is “is”: My brother is a doctor.',
          uz: 'My brother = he, shuning uchun fe’l «is»: My brother is a doctor.',
          ru: 'My brother = he, поэтому глагол «is»: My brother is a doctor.',
        },
      },
      {
        id: 'mb4', prompt: 'Asking about distance. Choose the correct question.',
        options: ['It far from here?', 'Is it far from here?', 'It is far from here?'], answer: 1,
        explanation: {
          en: 'In a question, “is” goes before “it”: Is it far? Without “is” it is not a sentence, and rising intonation alone sounds unsure.',
          uz: 'Savolda «is» «it»dan oldin keladi: Is it far? «Is» bo‘lmasa, bu gap emas, faqat ohang bilan so‘rash esa ishonchsiz eshitiladi.',
          ru: 'В вопросе «is» стоит перед «it»: Is it far? Без «is» это не предложение, а вопрос одной интонацией звучит неуверенно.',
        },
      },
      {
        id: 'mb5', prompt: 'Calling hotel reception. Choose the correct sentence.',
        options: ['The room very noisy.', 'The room is very noisy.', 'The room it is very noisy.'], answer: 1,
        explanation: {
          en: 'Use “is” between the subject and the adjective: The room is noisy. Do not repeat the subject with “it”.',
          uz: 'Ega va sifat orasida «is» ishlating: The room is noisy. Egani «it» bilan takrorlamang.',
          ru: 'Между подлежащим и прилагательным нужен «is»: The room is noisy. Не повторяйте подлежащее с помощью «it».',
        },
      },
      {
        id: 'mb6', prompt: 'Complete with one word: We ___ from Uzbekistan.',
        answer: ['are'],
        explanation: {
          en: 'With we, you and they, use “are”: We are from Uzbekistan. In speech: We’re from Uzbekistan.',
          uz: 'We, you va they bilan «are»: We are from Uzbekistan. Og‘zaki nutqda: We’re from Uzbekistan.',
          ru: 'С we, you и they — «are»: We are from Uzbekistan. В речи: We’re from Uzbekistan.',
        },
      },
      {
        id: 'mb7', prompt: 'Describing your sister. Choose the correct sentence.',
        options: ['My sister is very kind.', 'My sister very kind.', 'My sister she very kind.'], answer: 0,
        explanation: {
          en: 'An adjective needs “is” before it: My sister is kind. Do not add “she” after the noun.',
          uz: 'Sifatdan oldin «is» kerak: My sister is kind. Otdan keyin «she» qo‘shmang.',
          ru: 'Перед прилагательным нужен «is»: My sister is kind. Не добавляйте «she» после существительного.',
        },
      },
      {
        id: 'mb8', prompt: 'You are outside, waiting for a friend. Choose the correct sentence.',
        options: ['I waiting for you outside.', 'I am waiting for you outside.', 'I am wait for you outside.'], answer: 1,
        explanation: {
          en: 'For an action happening now, use am/is/are + verb-ing: I am waiting. Both parts are needed.',
          uz: 'Hozir bo‘layotgan harakat uchun am/is/are + fe’l-ing: I am waiting. Ikkala qism ham kerak.',
          ru: 'Для действия, происходящего сейчас: am/is/are + глагол-ing: I am waiting. Нужны обе части.',
        },
      },
    ],
  },
  {
    id: 'drill.pronouns_gender', kind: 'drill', errorTag: 'pronouns_gender', node: 'conversation.accuracy', levels: [2, 5], minutes: 5, aiVariants: true,
    title: { en: 'He, she or it', uz: 'He, she yoki it', ru: 'He, she или it' },
    explain: {
      en: 'Uzbek uses one word, u, for a man, a woman and a thing, and Russian calls many things “he” or “she”. English has three: he for a man or boy, she for a woman or girl, it for any thing, a place or an animal you do not know. The same goes for his/her/its and him/her. Decide once and keep it all through the story: My sister is a nurse. She works at night. Her hospital is big.',
      uz: 'O‘zbek tilida erkak, ayol va narsa uchun bitta so‘z bor — «u». Ingliz tilida esa uchta: erkak yoki o‘g‘il bola uchun he, ayol yoki qiz uchun she, narsa, joy yoki notanish hayvon uchun it. His/her/its va him/her ham shunday. Bir marta tanlang va hikoya oxirigacha o‘zgartirmang: My sister is a nurse. She works at night. Her hospital is big.',
      ru: 'В английском he — мужчина или мальчик, she — женщина или девочка, it — предмет, место или незнакомое животное. Предметы всегда it, даже если по-русски они «он» или «она»: стол — it, книга — it. То же с his/her/its и him/her. Выберите один раз и не меняйте до конца рассказа: My sister is a nurse. She works at night. Her hospital is big.',
    },
    items: [
      {
        id: 'pg1', prompt: 'About your sister. Choose the correct sentences.',
        options: ['My sister is a nurse. He works at night.', 'My sister is a nurse. She works at night.', 'My sister is a nurse. It works at night.'], answer: 1,
        explanation: { en: 'A sister is a woman, so use she.', uz: 'Opa yoki singil — ayol, shuning uchun she.', ru: 'Сестра — женщина, поэтому she.' },
      },
      {
        id: 'pg2', prompt: 'About your father. Choose the correct sentences.',
        options: ['My father loves football. She watches every match.', 'My father loves football. He watches every match.', 'My father loves football. His watches every match.'], answer: 1,
        explanation: {
          en: 'A father is a man, so the subject is he. “His” means “belonging to him” and cannot be the subject.',
          uz: 'Ota — erkak, shuning uchun ega he. «His» — «uning (erkakning)» degani, u ega bo‘la olmaydi.',
          ru: 'Отец — мужчина, поэтому подлежащее he. «His» значит «его» (принадлежность) и не может быть подлежащим.',
        },
      },
      {
        id: 'pg3', prompt: 'Complete with one word: This is my manager, Rebecca. ___ is very helpful.',
        answer: ['she'],
        explanation: { en: 'Rebecca is a woman’s name, so use she.', uz: 'Rebekka — ayol ismi, shuning uchun she.', ru: 'Ребекка — женское имя, поэтому she.' },
      },
      {
        id: 'pg4', prompt: 'Your friend Dilshod sold his car. Choose the correct sentence.',
        options: ['Dilshod sold her car last week.', 'Dilshod sold his car last week.', 'Dilshod sold he car last week.'], answer: 1,
        explanation: {
          en: 'Dilshod is a man, so the car is “his car”. “He” cannot go before a noun.',
          uz: 'Dilshod — erkak, shuning uchun «his car». «He» otdan oldin kelmaydi.',
          ru: 'Дильшод — мужчина, поэтому «his car». «He» не ставится перед существительным.',
        },
      },
      {
        id: 'pg5', prompt: 'About your new phone. Choose the correct sentence.',
        options: ['I bought a new phone, but she is very slow.', 'I bought a new phone, but he is very slow.', 'I bought a new phone, but it is very slow.'], answer: 2,
        explanation: { en: 'A phone is a thing, so use it.', uz: 'Telefon — narsa, shuning uchun it.', ru: 'Телефон — предмет, поэтому it (хотя по-русски мы скажем «он»).' },
      },
      {
        id: 'pg6', prompt: 'Complete with one word: I called my mum and told ___ the news.',
        answer: ['her'],
        explanation: {
          en: 'After a verb, a woman is “her”: told her. For a man it would be “him”.',
          uz: 'Fe’ldan keyin ayol — «her»: told her. Erkak bo‘lsa — «him».',
          ru: 'После глагола женщина — «her»: told her. Мужчина — «him».',
        },
      },
      {
        id: 'pg7', prompt: 'About your grandmother. Choose the correct sentences.',
        options: ['My grandmother lives with us. I help him with the shopping.', 'My grandmother lives with us. I help her with the shopping.', 'My grandmother lives with us. I help she with the shopping.'], answer: 1,
        explanation: {
          en: 'A grandmother is a woman, and after “help” we need the object form: her.',
          uz: 'Buvi — ayol, «help»dan keyin esa obyekt shakli kerak: her.',
          ru: 'Бабушка — женщина, а после «help» нужна объектная форма: her.',
        },
      },
      {
        id: 'pg8', prompt: 'About a new male colleague, Aziz. Choose the correct sentences.',
        options: ['Aziz is new. Her desk is next to mine.', 'Aziz is new. His desk is next to mine.', 'Aziz is new. He desk is next to mine.'], answer: 1,
        explanation: { en: 'Aziz is a man, so “his desk”.', uz: 'Aziz — erkak, shuning uchun «his desk».', ru: 'Азиз — мужчина, поэтому «his desk».' },
      },
    ],
  },
  {
    id: 'drill.articles', kind: 'drill', errorTag: 'articles', node: 'conversation.accuracy', levels: [2, 5], minutes: 5, aiVariants: true,
    title: { en: 'A, an and the', uz: 'A, an va the', ru: 'A, an и the' },
    explain: {
      en: 'Use a or an with one countable thing when you mention it for the first time or say what something is: I have a car. She’s an engineer. Use the when the listener knows which one: The car is outside. The station is closed. Use no article with plurals and uncountable nouns in general: I like dogs. Coffee is expensive here. Use an before a vowel sound: an hour, an apple.',
      uz: 'Bitta sanaladigan narsani birinchi marta aytganda yoki nima ekanini aytganda a/an ishlating: I have a car. She’s an engineer. Tinglovchi qaysi biri ekanini bilsa — the: The car is outside. The station is closed. Umumiy ko‘plik va sanalmaydigan otlar oldida artikl kerak emas: I like dogs. Coffee is expensive here. Unli tovush oldida an: an hour, an apple. O‘zbek tilida artikl yo‘q, shuning uchun ularni ongli ravishda qo‘shishga odatlaning.',
      ru: 'A/an — с одним исчисляемым предметом, когда упоминаете его впервые или говорите, что это такое: I have a car. She’s an engineer. The — когда слушатель знает, о чём речь: The car is outside. The station is closed. Без артикля — общие множественные и неисчисляемые: I like dogs. Coffee is expensive here. Перед гласным звуком — an: an hour, an apple. В русском артиклей нет, поэтому их нужно добавлять сознательно.',
    },
    items: [
      {
        id: 'ar1', prompt: 'Talking about your job. Choose the correct sentence.',
        options: ['I am engineer.', 'I am an engineer.', 'I am the engineer.'], answer: 1,
        explanation: {
          en: 'Jobs need a/an: I am an engineer. It is “an” because “engineer” starts with a vowel sound.',
          uz: 'Kasb oldida a/an kerak: I am an engineer. «Engineer» unli tovush bilan boshlangani uchun «an».',
          ru: 'Перед профессией нужен a/an: I am an engineer. «An», потому что «engineer» начинается с гласного звука.',
        },
      },
      {
        id: 'ar2', prompt: 'Calling hotel reception. Choose the correct sentence.',
        options: ['There is a problem with the shower in my room.', 'There is problem with shower in my room.', 'There is the problem with a shower in my room.'], answer: 0,
        explanation: {
          en: 'A problem you mention for the first time → a problem. The shower in your room is a specific one → the shower.',
          uz: 'Birinchi marta aytilayotgan muammo → a problem. Xonangizdagi dush — aniq bitta → the shower.',
          ru: 'Впервые упомянутая проблема → a problem. Душ в вашем номере — конкретный → the shower.',
        },
      },
      {
        id: 'ar3', prompt: 'Complete with a, an or the: I bought ___ umbrella yesterday.',
        answer: ['an'],
        explanation: {
          en: 'One umbrella, mentioned for the first time, and “umbrella” starts with a vowel sound, so “an”.',
          uz: 'Bitta soyabon, birinchi marta aytilmoqda, «umbrella» esa unli tovush bilan boshlanadi — «an».',
          ru: 'Один зонт, упомянут впервые, и «umbrella» начинается с гласного звука — «an».',
        },
      },
      {
        id: 'ar4', prompt: 'Complete with a, an or the: I bought a jacket and a hat. ___ jacket was cheap.',
        answer: ['the'],
        explanation: {
          en: 'Now the listener knows which jacket — the one you just mentioned — so use “the”.',
          uz: 'Endi tinglovchi qaysi kurtka ekanini biladi — hozirgina aytilgani — shuning uchun «the».',
          ru: 'Теперь слушатель знает, какая куртка — та, о которой вы только что сказали, — поэтому «the».',
        },
      },
      {
        id: 'ar5', prompt: 'Talking about animals in general. Choose the correct sentence.',
        options: ['I like the dogs, but I’m scared of the cats.', 'I like dogs, but I’m scared of cats.', 'I like a dogs, but I’m scared of a cats.'], answer: 1,
        explanation: {
          en: 'For plurals in general (all dogs, all cats), use no article. “A” never goes with a plural.',
          uz: 'Umumiy ma’nodagi ko‘plik (hamma itlar, hamma mushuklar) oldida artikl ishlatilmaydi. «A» ko‘plik bilan hech qachon kelmaydi.',
          ru: 'С множественным числом в общем смысле (все собаки, все кошки) артикль не нужен. «A» с множественным числом не употребляется.',
        },
      },
      {
        id: 'ar6', prompt: 'Asking for directions. Choose the correct question.',
        options: ['Where is the nearest pharmacy?', 'Where is nearest pharmacy?', 'Where is a nearest pharmacy?'], answer: 0,
        explanation: {
          en: 'Superlatives (the nearest, the best, the cheapest) always take “the”.',
          uz: 'Orttirma daraja (the nearest, the best, the cheapest) doim «the» bilan keladi.',
          ru: 'Превосходная степень (the nearest, the best, the cheapest) всегда с «the».',
        },
      },
      {
        id: 'ar7', prompt: 'At a café. Choose the correct request.',
        options: ['Could I have a glass of water?', 'Could I have glass of water?', 'Could I have the glass of a water?'], answer: 0,
        explanation: {
          en: 'One glass → a glass. Water is uncountable, so it has no article: a glass of water.',
          uz: 'Bitta stakan → a glass. Water sanalmaydi, artikl kerak emas: a glass of water.',
          ru: 'Один стакан → a glass. Water — неисчисляемое, без артикля: a glass of water.',
        },
      },
      {
        id: 'ar8', prompt: 'Talking about your country. Choose the correct sentence.',
        options: ['The Tashkent is the capital of Uzbekistan.', 'Tashkent is the capital of Uzbekistan.', 'Tashkent is capital of the Uzbekistan.'], answer: 1,
        explanation: {
          en: 'Most city and country names have no article. There is only one capital, so it is “the capital”.',
          uz: 'Ko‘pchilik shahar va davlat nomlari artiklsiz. Poytaxt yagona, shuning uchun «the capital».',
          ru: 'Большинство названий городов и стран без артикля. Столица одна, поэтому «the capital».',
        },
      },
    ],
  },
  {
    id: 'drill.question_forms', kind: 'drill', errorTag: 'question_forms', node: 'conversation.interaction', levels: [2, 5], minutes: 5, aiVariants: true,
    title: { en: 'Asking questions correctly', uz: 'Savollarni to‘g‘ri tuzish', ru: 'Правильные вопросы' },
    explain: {
      en: 'In English questions the helper verb comes before the subject: Do you have a room? What time does it open? Where can I buy tickets? With be, move be to the front: Are you free? Is it far? After where, what or how, keep this order — not “Where I can buy…?”. In polite indirect questions (Do you know where…?, Could you tell me what time…?) the normal order comes back: Could you tell me where the station is?',
      uz: 'Inglizcha savolda yordamchi fe’l egadan oldin keladi: Do you have a room? What time does it open? Where can I buy tickets? Be bo‘lsa, uni oldinga chiqaring: Are you free? Is it far? Where, what, how dan keyin ham shu tartib — «Where I can buy…?» emas. Muloyim bilvosita savollarda (Do you know where…?, Could you tell me what time…?) oddiy tartib qaytadi: Could you tell me where the station is?',
      ru: 'В английском вопросе вспомогательный глагол стоит перед подлежащим: Do you have a room? What time does it open? Where can I buy tickets? Глагол be выходит вперёд: Are you free? Is it far? После where, what, how порядок тот же — не «Where I can buy…?». В вежливых косвенных вопросах (Do you know where…?, Could you tell me what time…?) возвращается прямой порядок: Could you tell me where the station is?',
    },
    items: [
      {
        id: 'qf1', prompt: 'At the station. Choose the correct question.',
        options: ['Where I can buy a ticket?', 'Where can I buy a ticket?', 'Where buy I a ticket?'], answer: 1,
        explanation: {
          en: 'Question word + helper verb + subject + verb: Where can I buy…?',
          uz: 'So‘roq so‘zi + yordamchi fe’l + ega + fe’l: Where can I buy…?',
          ru: 'Вопросительное слово + вспомогательный глагол + подлежащее + глагол: Where can I buy…?',
        },
      },
      {
        id: 'qf2', prompt: 'In a shop. Choose the correct question.',
        options: ['How much it costs?', 'How much does it cost?', 'How much costs it?'], answer: 1,
        explanation: {
          en: 'Present simple questions need do/does: How much does it cost? After “does” the verb has no -s.',
          uz: 'Present simple savollarida do/does kerak: How much does it cost? «Does»dan keyin fe’lga -s qo‘shilmaydi.',
          ru: 'В вопросах present simple нужен do/does: How much does it cost? После «does» у глагола нет -s.',
        },
      },
      {
        id: 'qf3', prompt: 'At a hotel. Choose the most natural question.',
        options: ['Do you have a room for tonight?', 'You have a room for tonight?', 'Have you a room for tonight?'], answer: 0,
        explanation: {
          en: 'Use do: Do you have…? A statement with rising intonation sounds unsure, and “Have you a room?” is old-fashioned.',
          uz: 'Do ishlating: Do you have…? Faqat ohang bilan so‘ralgan darak gap ishonchsiz eshitiladi, «Have you a room?» esa eskirgan shakl.',
          ru: 'Используйте do: Do you have…? Утверждение с вопросительной интонацией звучит неуверенно, а «Have you a room?» — устаревшая форма.',
        },
      },
      {
        id: 'qf4', prompt: 'Complete with one word: What time ___ the museum open?',
        answer: ['does'],
        explanation: {
          en: 'The museum = it, so use “does”: What time does the museum open?',
          uz: 'The museum = it, shuning uchun «does»: What time does the museum open?',
          ru: 'The museum = it, поэтому «does»: What time does the museum open?',
        },
      },
      {
        id: 'qf5', prompt: 'Asking a stranger politely. Choose the correct question.',
        options: ['Could you tell me where is the bank?', 'Could you tell me where the bank is?', 'Could you tell me where does the bank is?'], answer: 1,
        explanation: {
          en: 'After “Could you tell me…”, use normal statement order: where the bank is.',
          uz: '«Could you tell me…»dan keyin darak gap tartibi: where the bank is.',
          ru: 'После «Could you tell me…» — прямой порядок слов: where the bank is.',
        },
      },
      {
        id: 'qf6', prompt: 'Asking about the past. Choose the correct question.',
        options: ['When did you arrive?', 'When you arrived?', 'When did you arrived?'], answer: 0,
        explanation: {
          en: 'Past questions use did + the base verb: When did you arrive? Not “arrived” after did.',
          uz: 'O‘tgan zamon savoli: did + fe’lning asosiy shakli: When did you arrive? Did dan keyin «arrived» emas.',
          ru: 'Вопрос в прошедшем: did + начальная форма глагола: When did you arrive? После did не «arrived».',
        },
      },
      {
        id: 'qf7', prompt: 'Complete with one word: ___ you ever tried plov?',
        answer: ['have'],
        explanation: {
          en: 'Questions about experience use the present perfect: Have you ever tried…?',
          uz: 'Tajriba haqidagi savollar present perfect bilan: Have you ever tried…?',
          ru: 'Вопросы об опыте — в present perfect: Have you ever tried…?',
        },
      },
      {
        id: 'qf8', prompt: 'Asking a colleague. Choose the correct question.',
        options: ['Why you didn’t come to the meeting?', 'Why didn’t you come to the meeting?', 'Why didn’t you came to the meeting?'], answer: 1,
        explanation: {
          en: 'Negative questions: Why + didn’t + subject + base verb: Why didn’t you come?',
          uz: 'Inkor savol: Why + didn’t + ega + fe’lning asosiy shakli: Why didn’t you come?',
          ru: 'Отрицательный вопрос: Why + didn’t + подлежащее + начальная форма: Why didn’t you come?',
        },
      },
    ],
  },
  {
    id: 'drill.prepositions', kind: 'drill', errorTag: 'prepositions', node: 'conversation.accuracy', levels: [2, 5], minutes: 5, aiVariants: true,
    title: { en: 'At, on and in', uz: 'At, on va in', ru: 'At, on и in' },
    explain: {
      en: 'Time: at for clock times and night (at 7, at night), on for days and dates (on Monday, on 5 May), in for months, years and parts of the day (in May, in 2025, in the morning). Place: at for a point (at the bus stop, at work), in for inside a space (in the car, in Tashkent), on for surfaces and for buses, trains and planes (on the table, on the bus). Some verbs have their own preposition: wait for, listen to, arrive at or in.',
      uz: 'Vaqt: soat va tun uchun at (at 7, at night), kun va sana uchun on (on Monday, on 5 May), oy, yil va kun qismlari uchun in (in May, in 2025, in the morning). Joy: nuqta uchun at (at the bus stop, at work), ichkari uchun in (in the car, in Tashkent), sirt hamda avtobus, poyezd, samolyot uchun on (on the table, on the bus). Ba’zi fe’llarning o‘z predlogi bor: wait for, listen to, arrive at yoki in.',
      ru: 'Время: at — часы и ночь (at 7, at night), on — дни и даты (on Monday, on 5 May), in — месяцы, годы и части дня (in May, in 2025, in the morning). Место: at — точка (at the bus stop, at work), in — внутри (in the car, in Tashkent), on — поверхность, а также автобус, поезд, самолёт (on the table, on the bus). У некоторых глаголов свой предлог: wait for, listen to, arrive at или in.',
    },
    items: [
      {
        id: 'pr1', prompt: 'Making an appointment. Choose the correct sentence.',
        options: ['See you in Monday at 10.', 'See you on Monday at 10.', 'See you at Monday in 10.'], answer: 1,
        explanation: { en: 'Days take on (on Monday); clock times take at (at 10).', uz: 'Kunlar bilan on (on Monday), soat bilan at (at 10).', ru: 'С днями — on (on Monday), с часами — at (at 10).' },
      },
      {
        id: 'pr2', prompt: 'Complete with at, on or in: My birthday is ___ June.',
        answer: ['in'],
        explanation: { en: 'Months take in: in June. A date takes on: on 12 June.', uz: 'Oylar bilan in: in June. Aniq sana bilan on: on 12 June.', ru: 'С месяцами — in: in June. С датой — on: on 12 June.' },
      },
      {
        id: 'pr3', prompt: 'On the phone, saying where you are. Choose the correct sentence.',
        options: ['I’m in the bus, I’ll be there soon.', 'I’m on the bus, I’ll be there soon.', 'I’m at the bus, I’ll be there soon.'], answer: 1,
        explanation: {
          en: 'For buses, trains and planes English says on: on the bus. For a car or a taxi, in: in the car.',
          uz: 'Avtobus, poyezd va samolyot uchun on: on the bus. Mashina yoki taksi uchun in: in the car.',
          ru: 'Об автобусе, поезде и самолёте говорят on: on the bus. О машине или такси — in: in the car.',
        },
      },
      {
        id: 'pr4', prompt: 'Waiting for a friend. Choose the correct sentence.',
        options: ['I’m waiting at the bus stop.', 'I’m waiting on the bus stop.', 'I’m waiting in the bus stop.'], answer: 0,
        explanation: {
          en: 'A bus stop is a point, so use at: at the bus stop, at the entrance, at the station.',
          uz: 'Bekat — nuqta, shuning uchun at: at the bus stop, at the entrance, at the station.',
          ru: 'Остановка — это точка, поэтому at: at the bus stop, at the entrance, at the station.',
        },
      },
      {
        id: 'pr5', prompt: 'Complete with at, on or in: The shop closes ___ 9 p.m.',
        answer: ['at'],
        explanation: { en: 'Clock times take at: at 9 p.m.', uz: 'Soat bilan at: at 9 p.m.', ru: 'С временем по часам — at: at 9 p.m.' },
      },
      {
        id: 'pr6', prompt: 'Talking about your routine. Choose the correct sentence.',
        options: ['I usually run on the morning.', 'I usually run in the morning.', 'I usually run at the morning.'], answer: 1,
        explanation: {
          en: 'Parts of the day take in: in the morning, in the afternoon, in the evening. But: at night.',
          uz: 'Kun qismlari bilan in: in the morning, in the afternoon, in the evening. Lekin: at night.',
          ru: 'С частями дня — in: in the morning, in the afternoon, in the evening. Но: at night.',
        },
      },
      {
        id: 'pr7', prompt: 'At the clinic. Choose the correct sentence.',
        options: ['I’m waiting for the doctor.', 'I’m waiting the doctor.', 'I’m waiting to the doctor.'], answer: 0,
        explanation: {
          en: '“Wait” needs “for” before the person or thing: wait for the doctor, wait for the bus.',
          uz: '«Wait»dan keyin odam yoki narsa oldidan «for» kerak: wait for the doctor, wait for the bus.',
          ru: 'После «wait» перед человеком или предметом нужен «for»: wait for the doctor, wait for the bus.',
        },
      },
      {
        id: 'pr8', prompt: 'Telling a travel story. Choose the correct sentence.',
        options: ['We arrived to the hotel at midnight.', 'We arrived at the hotel at midnight.', 'We arrived in the hotel on midnight.'], answer: 1,
        explanation: {
          en: 'Arrive at a building or point (at the hotel, at the airport); arrive in a city or country (in London). Never “arrive to”.',
          uz: 'Bino yoki nuqtaga arrive at (at the hotel, at the airport); shahar yoki davlatga arrive in (in London). «Arrive to» deyilmaydi.',
          ru: 'В здание или точку — arrive at (at the hotel, at the airport); в город или страну — arrive in (in London). «Arrive to» не говорят.',
        },
      },
    ],
  },
  {
    id: 'drill.plurals', kind: 'drill', errorTag: 'plurals', node: 'conversation.accuracy', levels: [2, 5], minutes: 5, aiVariants: true,
    title: { en: 'Plurals and uncountable nouns', uz: 'Ko‘plik va sanalmaydigan otlar', ru: 'Множественное число и неисчисляемые' },
    explain: {
      en: 'After numbers above one and words like many, a few and several, use the plural: two tickets, many people, a few days. Some plurals are irregular: people, children, men, women, feet, teeth. Some nouns are uncountable and have no plural: advice, information, luggage, money, furniture, news. Say some advice, a piece of advice, a lot of luggage — never advices or luggages.',
      uz: 'Birdan katta sonlar va many, a few, several so‘zlaridan keyin ko‘plik ishlatiladi: two tickets, many people, a few days. O‘zbek tilida sondan keyin birlik keladi (ikki chipta), ingliz tilida esa ko‘plik kerak (two tickets). Ba’zi ko‘pliklar boshqacha yasaladi: people, children, men, women, feet, teeth. Ba’zi otlar sanalmaydi va ko‘plikda kelmaydi: advice, information, luggage, money, furniture, news. Some advice, a piece of advice, a lot of luggage deng — advices yoki luggages emas.',
      ru: 'После чисел больше одного и слов many, a few, several нужно множественное число: two tickets, many people, a few days. Некоторые формы неправильные: people, children, men, women, feet, teeth. Некоторые существительные неисчисляемые и не имеют множественного числа: advice, information, luggage, money, furniture, news (хотя по-русски «советы», «новости» — во множественном). Говорите some advice, a piece of advice, a lot of luggage — не advices и не luggages.',
    },
    items: [
      {
        id: 'pl1', prompt: 'At check-in. Choose the correct sentence.',
        options: ['I have two luggages.', 'I have two bags.', 'I have two luggage.'], answer: 1,
        explanation: {
          en: '“Luggage” is uncountable, so you cannot count it. Count bags or suitcases instead: two bags.',
          uz: '«Luggage» sanalmaydi. O‘rniga sumka yoki chamadonlarni sanang: two bags.',
          ru: '«Luggage» неисчисляемое, его нельзя посчитать. Считайте сумки или чемоданы: two bags.',
        },
      },
      {
        id: 'pl2', prompt: 'At the information desk. Choose the correct request.',
        options: ['Can you give me some informations?', 'Can you give me an information?', 'Can you give me some information?'], answer: 2,
        explanation: {
          en: '“Information” is uncountable: no -s and no “an”. Say some information or a piece of information.',
          uz: '«Information» sanalmaydi: -s ham, «an» ham qo‘shilmaydi. Some information yoki a piece of information deng.',
          ru: '«Information» неисчисляемое: без -s и без «an». Говорите some information или a piece of information.',
        },
      },
      {
        id: 'pl3', prompt: 'Complete with the right form of “ticket”: I need three ___ for the train, please.',
        answer: ['tickets'],
        explanation: { en: 'After a number above one, use the plural: three tickets.', uz: 'Birdan katta sondan keyin ko‘plik: three tickets.', ru: 'После числа больше одного — множественное число: three tickets.' },
      },
      {
        id: 'pl4', prompt: 'Describing a party. Choose the correct sentence.',
        options: ['There were many peoples at the party.', 'There were many people at the party.', 'There was many person at the party.'], answer: 1,
        explanation: {
          en: '“People” is already plural (one person, two people). “Peoples” means nations.',
          uz: '«People» allaqachon ko‘plik (one person, two people). «Peoples» esa xalqlar degani.',
          ru: '«People» — уже множественное число (one person, two people). «Peoples» значит «народы».',
        },
      },
      {
        id: 'pl5', prompt: 'Talking about a friend’s help. Choose the correct sentence.',
        options: ['She gave me a good advice.', 'She gave me some good advice.', 'She gave me good advices.'], answer: 1,
        explanation: { en: '“Advice” is uncountable: some advice, a piece of advice.', uz: '«Advice» sanalmaydi: some advice, a piece of advice.', ru: '«Advice» неисчисляемое: some advice, a piece of advice.' },
      },
      {
        id: 'pl6', prompt: 'Complete with the plural of “foot”: My ___ hurt after the long walk.',
        answer: ['feet'],
        explanation: {
          en: '“Foot” has an irregular plural: feet. The same pattern: tooth → teeth.',
          uz: '«Foot»ning ko‘pligi boshqacha yasaladi: feet. Xuddi shunday: tooth → teeth.',
          ru: 'У «foot» неправильное множественное число: feet. Так же: tooth → teeth.',
        },
      },
      {
        id: 'pl7', prompt: 'Ordering drinks at a café. Choose the natural order.',
        options: ['Two coffee, please.', 'Two coffees, please.', 'Two of coffee, please.'], answer: 1,
        explanation: {
          en: 'When you order drinks you count cups, so “coffee” becomes countable: two coffees, three teas.',
          uz: 'Ichimlik buyurtma qilganda piyolalar sanaladi, shuning uchun «coffee» sanaladigan bo‘ladi: two coffees, three teas.',
          ru: 'Когда заказываете напитки, вы считаете чашки, поэтому «coffee» становится исчисляемым: two coffees, three teas.',
        },
      },
      {
        id: 'pl8', prompt: 'Talking about your family. Choose the correct sentence.',
        options: ['I have two childs.', 'I have two children.', 'I have two childrens.'], answer: 1,
        explanation: {
          en: '“Child” has an irregular plural: children. Do not add -s to it.',
          uz: '«Child»ning ko‘pligi boshqacha yasaladi: children. Unga -s qo‘shilmaydi.',
          ru: 'У «child» неправильное множественное число: children. К нему не добавляют -s.',
        },
      },
    ],
  },
  {
    id: 'drill.politeness', kind: 'drill', errorTag: 'politeness', node: 'conversation.interaction', levels: [2, 5], minutes: 5, aiVariants: true,
    title: { en: 'Polite requests', uz: 'Muloyim iltimoslar', ru: 'Вежливые просьбы' },
    explain: {
      en: 'In English, a request without softening words sounds like an order, even with a smile. Instead of Give me… or I want…, say Could I have…?, Can I get…?, I’d like… or Would you mind (+ -ing)…? Add please, and thank people. When you say no or complain, soften it: No, thanks — I’m fine. I’m afraid… I’m sorry, but… Would it be possible to…?',
      uz: 'Ingliz tilida yumshatuvchi so‘zlarsiz iltimos tabassum bilan aytilsa ham buyruqdek eshitiladi. «Give me…» yoki «I want…» o‘rniga Could I have…?, Can I get…?, I’d like… yoki Would you mind (+ -ing)…? deng. Please qo‘shing va rahmat ayting. Rad etayotganda yoki shikoyat qilayotganda gapni yumshating: No, thanks — I’m fine. I’m afraid… I’m sorry, but… Would it be possible to…?',
      ru: 'По-английски просьба без смягчающих слов звучит как приказ, даже с улыбкой. Вместо «Give me…» или «I want…» говорите Could I have…?, Can I get…?, I’d like… или Would you mind (+ -ing)…? Добавляйте please и благодарите. Отказываясь или жалуясь, смягчайте: No, thanks — I’m fine. I’m afraid… I’m sorry, but… Would it be possible to…?',
    },
    items: [
      {
        id: 'po1', prompt: 'At a café counter. Choose the polite order.',
        options: ['Give me a black coffee.', 'Could I have a black coffee, please?', 'I want black coffee now.'], answer: 1,
        explanation: {
          en: '“Give me” and “I want” sound like orders. “Could I have…, please?” is the normal polite way.',
          uz: '«Give me» va «I want» buyruqdek eshitiladi. «Could I have…, please?» — odatiy muloyim shakl.',
          ru: '«Give me» и «I want» звучат как приказ. «Could I have…, please?» — обычная вежливая форма.',
        },
      },
      {
        id: 'po2', prompt: 'Asking a stranger the way. Choose the most polite question.',
        options: ['Hey, where is the metro?', 'Excuse me, could you tell me where the metro is?', 'Tell me where the metro is.'], answer: 1,
        explanation: {
          en: 'Start with “Excuse me” to get attention, then use an indirect question: could you tell me where… is?',
          uz: 'E’tiborni tortish uchun «Excuse me» bilan boshlang, so‘ng bilvosita savol bering: could you tell me where… is?',
          ru: 'Начните с «Excuse me», чтобы привлечь внимание, затем задайте косвенный вопрос: could you tell me where… is?',
        },
      },
      {
        id: 'po3', prompt: 'Asking a colleague for help. Choose the polite request.',
        options: ['Would you mind helping me with this report?', 'You must help me with this report.', 'Help me with this report, I have no time.'], answer: 0,
        explanation: {
          en: '“Would you mind + -ing” is a soft, polite request. “You must” sounds like an order.',
          uz: '«Would you mind + -ing» — yumshoq, muloyim iltimos. «You must» buyruqdek eshitiladi.',
          ru: '«Would you mind + -ing» — мягкая вежливая просьба. «You must» звучит как приказ.',
        },
      },
      {
        id: 'po4', prompt: 'Your host offers you more food, but you are full. Choose the polite answer.',
        options: ['No.', 'I don’t want it.', 'No, thanks — I’m fine.'], answer: 2,
        explanation: {
          en: 'A bare “No” or “I don’t want it” sounds rude. Add thanks and a friendly reason: No, thanks — I’m fine.',
          uz: 'Faqat «No» yoki «I don’t want it» qo‘pol eshitiladi. Rahmat va do‘stona izoh qo‘shing: No, thanks — I’m fine.',
          ru: 'Голое «No» или «I don’t want it» звучит грубо. Добавьте спасибо и дружелюбное пояснение: No, thanks — I’m fine.',
        },
      },
      {
        id: 'po5', prompt: 'Complaining at a hotel. Choose the best way to say it.',
        options: ['Your room is dirty. Clean it.', 'I’m sorry, but the room hasn’t been cleaned. Could someone have a look?', 'Why is the room dirty? It is your job.'], answer: 1,
        explanation: {
          en: 'Start with “I’m sorry, but…”, describe the fact, then make a soft request. You will get help faster.',
          uz: '«I’m sorry, but…» bilan boshlang, faktni ayting, so‘ng yumshoq iltimos qiling. Shunda yordam tezroq keladi.',
          ru: 'Начните с «I’m sorry, but…», опишите факт, затем мягко попросите. Так вам помогут быстрее.',
        },
      },
      {
        id: 'po6', prompt: 'Complete with one word: Would you ___ opening the window?',
        answer: ['mind'],
        explanation: {
          en: '“Would you mind + -ing?” is a very polite request. To say yes, people answer “Not at all” or “No problem”.',
          uz: '«Would you mind + -ing?» — juda muloyim iltimos. Rozi bo‘lsa, «Not at all» yoki «No problem» deb javob beriladi.',
          ru: '«Would you mind + -ing?» — очень вежливая просьба. Соглашаясь, отвечают «Not at all» или «No problem».',
        },
      },
      {
        id: 'po7', prompt: 'Asking your manager for a day off. Choose the best request.',
        options: ['I need Friday off.', 'Would it be possible to take Friday off?', 'Give me Friday off, please.'], answer: 1,
        explanation: {
          en: '“Would it be possible to…?” is polite and right for a manager. “Please” does not make “Give me” polite enough.',
          uz: '«Would it be possible to…?» — muloyim va rahbar uchun mos. «Please» ham «Give me»ni yetarlicha muloyim qilmaydi.',
          ru: '«Would it be possible to…?» — вежливо и подходит для руководителя. Даже с «please» «Give me» недостаточно вежливо.',
        },
      },
      {
        id: 'po8', prompt: 'In a meeting, you need to interrupt. Choose the polite way.',
        options: ['Sorry to interrupt, but could I ask something?', 'Stop, I have a question.', 'Wait, wait, listen to me.'], answer: 0,
        explanation: {
          en: 'Apologise first, then ask: Sorry to interrupt, but…',
          uz: 'Avval uzr so‘rang, keyin so‘rang: Sorry to interrupt, but…',
          ru: 'Сначала извинитесь, затем спросите: Sorry to interrupt, but…',
        },
      },
    ],
  },
  {
    id: 'drill.false_friends', kind: 'drill', errorTag: 'false_friends', node: 'conversation.range', levels: [2, 5], minutes: 5, aiVariants: true,
    title: { en: 'False friends', uz: 'Aldamchi so‘zlar', ru: 'Ложные друзья переводчика' },
    explain: {
      en: 'Some English words look like Russian or Uzbek words but mean something else. Magazine is a journal — a shop is a shop or store. Recipe is for cooking — the doctor gives a prescription. Familiya is your surname — family means your relatives. Accurate means exact — a person who keeps things in order is tidy. Sympathetic means caring — a good-looking person is attractive. Decade is ten years, fabric is cloth (a factory makes things), and angina is a heart problem — say a sore throat.',
      uz: 'Ba’zi inglizcha so‘zlar o‘zbekcha yoki ruscha so‘zlarga o‘xshaydi, lekin boshqa ma’noni beradi. Magazine — jurnal, do‘kon esa shop yoki store. Recipe — taom retsepti, shifokor esa prescription yozadi. Familiya — surname, family esa oila. Accurate — aniq, ozoda va tartibli odam esa tidy. Sympathetic — hamdard, chiroyli odam esa attractive. Decade — o‘n yil, fabric — mato (zavod — factory), angina — yurak kasalligi; tomoq og‘rig‘i — a sore throat.',
      ru: 'Некоторые английские слова похожи на русские, но значат другое. Magazine — журнал, а магазин — shop или store. Recipe — кулинарный рецепт, а врач выписывает prescription. Фамилия — surname, а family — это семья. Accurate — точный, а аккуратный — tidy. Sympathetic — сочувствующий, а симпатичный — attractive. Decade — десять лет (не декада), fabric — ткань (фабрика — factory), angina — болезнь сердца, а ангина — a sore throat.',
    },
    items: [
      {
        id: 'ff1', prompt: 'You need to buy bread. Choose the correct question.',
        options: ['Is there a magazine near here? I need bread.', 'Is there a shop near here? I need bread.', 'Is there a fabric near here? I need bread.'], answer: 1,
        explanation: {
          en: 'A magazine is a journal you read. A place that sells things is a shop.',
          uz: 'Magazine — o‘qiladigan jurnal. Narsa sotiladigan joy — shop.',
          ru: 'Magazine — журнал, который читают. Место, где продают, — shop.',
        },
      },
      {
        id: 'ff2', prompt: 'At the pharmacy. Choose the correct sentence.',
        options: ['Here is my recipe from the doctor.', 'Here is my prescription from the doctor.', 'Here is my receipt from the doctor.'], answer: 1,
        explanation: {
          en: 'The doctor’s note for medicine is a prescription. A recipe is for cooking; a receipt is the paper you get after paying.',
          uz: 'Shifokorning dori uchun yozgani — prescription. Recipe — taom tayyorlash uchun; receipt — to‘lovdan keyin beriladigan chek.',
          ru: 'Рецепт врача на лекарство — prescription. Recipe — кулинарный рецепт; receipt — чек после оплаты.',
        },
      },
      {
        id: 'ff3', prompt: 'Filling in a form, you want to know someone’s last name. Choose the correct question.',
        options: ['What’s your family?', 'What’s your surname?', 'What’s your familiar name?'], answer: 1,
        explanation: {
          en: 'Familiya is a surname (or last name). “Family” means your relatives.',
          uz: 'Familiya — surname (yoki last name). «Family» — oila, qarindoshlar.',
          ru: 'Фамилия — surname (или last name). «Family» — это семья, родственники.',
        },
      },
      {
        id: 'ff4', prompt: 'You want to say your new colleague is nice-looking. Choose the correct sentence.',
        options: ['He’s very sympathetic.', 'He’s very good-looking.', 'He’s very sympathy.'], answer: 1,
        explanation: {
          en: '“Sympathetic” means kind and understanding when someone has a problem. For appearance, say good-looking or attractive.',
          uz: '«Sympathetic» — birov qiynalganda unga hamdardlik bildiradigan odam. Tashqi ko‘rinish uchun good-looking yoki attractive deng.',
          ru: '«Sympathetic» — сочувствующий, понимающий. О внешности говорят good-looking или attractive (симпатичный).',
        },
      },
      {
        id: 'ff5', prompt: 'At the doctor’s, your throat really hurts. Choose the correct sentence.',
        options: ['I have angina — my throat really hurts.', 'I have a bad sore throat — it really hurts.', 'I have a throat angina.'], answer: 1,
        explanation: {
          en: 'In English “angina” is chest pain caused by the heart. For an infected, painful throat say a sore throat (or tonsillitis).',
          uz: 'Ingliz tilida «angina» — yurak sababli ko‘krak og‘rig‘i. Yallig‘langan, og‘riyotgan tomoq uchun a sore throat (yoki tonsillitis) deng.',
          ru: 'По-английски «angina» — боль в груди из-за сердца (стенокардия). Об ангине говорят a sore throat (или tonsillitis).',
        },
      },
      {
        id: 'ff6', prompt: 'You mean a period of ten days. Choose the correct sentence.',
        options: ['The festival lasts a decade.', 'The festival lasts ten days.', 'The festival lasts a decada.'], answer: 1,
        explanation: {
          en: 'In English a decade is ten years, not ten days. Just say ten days.',
          uz: 'Ingliz tilida decade — o‘n yil, o‘n kun emas. Shunchaki ten days deng.',
          ru: 'По-английски decade — десять лет, а не десять дней. Просто скажите ten days.',
        },
      },
      {
        id: 'ff7', prompt: 'Your flatmate always keeps the kitchen clean and in order. Choose the correct sentence.',
        options: ['She’s very accurate.', 'She’s very tidy.', 'She’s very exactly.'], answer: 1,
        explanation: {
          en: '“Accurate” means exact or correct (accurate numbers). A person who keeps things clean and in order is tidy or neat.',
          uz: '«Accurate» — aniq, to‘g‘ri (accurate numbers). Narsalarni toza va tartibli saqlaydigan odam — tidy yoki neat.',
          ru: '«Accurate» — точный (accurate numbers). Аккуратный человек, у которого всё чисто и на местах, — tidy или neat.',
        },
      },
      {
        id: 'ff8', prompt: 'Complete with one word (not “fabric”): My uncle works in a car ___ — they make engines there.',
        answer: ['factory', 'plant'],
        explanation: {
          en: 'A place where things are made is a factory (or a plant). “Fabric” is cloth, like cotton or silk.',
          uz: 'Narsa ishlab chiqariladigan joy — factory (yoki plant). «Fabric» — mato, masalan, paxta yoki ipak mato.',
          ru: 'Место, где что-то производят, — factory (или plant). «Fabric» — ткань, например хлопок или шёлк.',
        },
      },
    ],
  },
  {
    id: 'drill.word_order', kind: 'drill', errorTag: 'word_order', node: 'conversation.accuracy', levels: [2, 5], minutes: 5, aiVariants: true,
    title: { en: 'Word order', uz: 'So‘z tartibi', ru: 'Порядок слов' },
    explain: {
      en: 'English sentences follow subject – verb – object: I really like this city (not This city I really like). Words like always, often and never go before the main verb but after be: I always drink tea; She is never late. Put the object right after the verb (I like this city very much, not I like very much this city), place before time (I’ll go to the office early tomorrow), and size before colour (a big black bag).',
      uz: 'Inglizcha gap tartibi: ega – fe’l – to‘ldiruvchi: I really like this city («This city I really like» emas). O‘zbek tilida fe’l oxirida keladi, ingliz tilida esa egadan keyin. Always, often, never kabi so‘zlar asosiy fe’ldan oldin, lekin be dan keyin keladi: I always drink tea; She is never late. To‘ldiruvchini fe’ldan keyin darhol qo‘ying (I like this city very much), joyni vaqtdan oldin ayting (I’ll go to the office early tomorrow), o‘lchamni rangdan oldin (a big black bag).',
      ru: 'В английском порядок «подлежащее – глагол – дополнение»: I really like this city (а не «This city I really like»). В русском порядок свободный, в английском — нет. Always, often, never стоят перед основным глаголом, но после be: I always drink tea; She is never late. Дополнение — сразу после глагола (I like this city very much, а не I like very much this city), место — перед временем (I’ll go to the office early tomorrow), размер — перед цветом (a big black bag).',
    },
    items: [
      {
        id: 'wo1', prompt: 'Talking about your habits. Choose the correct sentence.',
        options: ['I drink always tea in the morning.', 'I always drink tea in the morning.', 'Always I drink tea in the morning.'], answer: 1,
        explanation: { en: '“Always” goes before the main verb: I always drink.', uz: '«Always» asosiy fe’ldan oldin keladi: I always drink.', ru: '«Always» стоит перед основным глаголом: I always drink.' },
      },
      {
        id: 'wo2', prompt: 'Talking about a colleague. Choose the correct sentence.',
        options: ['She is often late on Mondays.', 'She often is late on Mondays.', 'Often late she is on Mondays.'], answer: 0,
        explanation: { en: 'With “be”, frequency words go after it: She is often late.', uz: '«Be» bilan takroriylik so‘zlari undan keyin keladi: She is often late.', ru: 'С «be» слова частоты ставятся после него: She is often late.' },
      },
      {
        id: 'wo3', prompt: 'Saying what you like. Choose the correct sentence.',
        options: ['This city I like very much.', 'I like very much this city.', 'I like this city very much.'], answer: 2,
        explanation: {
          en: 'Do not put words between the verb and its object: like this city, then very much at the end.',
          uz: 'Fe’l va to‘ldiruvchi orasiga so‘z qo‘ymang: like this city, very much esa oxirida.',
          ru: 'Не ставьте слова между глаголом и дополнением: like this city, а very much — в конце.',
        },
      },
      {
        id: 'wo4', prompt: 'Talking about tomorrow. Choose the most natural sentence.',
        options: ['I will go tomorrow to the office early.', 'I will go to the office early tomorrow.', 'To the office I will go tomorrow early.'], answer: 1,
        explanation: {
          en: 'The usual order is verb + place + time: go to the office early tomorrow.',
          uz: 'Odatiy tartib: fe’l + joy + vaqt: go to the office early tomorrow.',
          ru: 'Обычный порядок: глагол + место + время: go to the office early tomorrow.',
        },
      },
      {
        id: 'wo5', prompt: 'Put “never” in the right place and write the sentence: I have been to Bukhara.',
        answer: ['I have never been to Bukhara', 'I’ve never been to Bukhara'],
        explanation: {
          en: '“Never” goes between have and the past participle: I have never been…',
          uz: '«Never» have va fe’lning uchinchi shakli orasiga qo‘yiladi: I have never been…',
          ru: '«Never» ставится между have и третьей формой: I have never been…',
        },
      },
      {
        id: 'wo6', prompt: 'Describing the bag you lost. Choose the correct sentence.',
        options: ['I lost a black big bag.', 'I lost a big black bag.', 'I lost a bag big black.'], answer: 1,
        explanation: {
          en: 'Adjectives go before the noun, and size comes before colour: a big black bag.',
          uz: 'Sifatlar otdan oldin keladi, o‘lcham rangdan oldin: a big black bag.',
          ru: 'Прилагательные стоят перед существительным, размер — перед цветом: a big black bag.',
        },
      },
      {
        id: 'wo7', prompt: 'Telling news. Choose the correct sentence.',
        options: ['Yesterday I saw at the market your brother.', 'I saw your brother at the market yesterday.', 'I saw yesterday your brother at the market.'], answer: 1,
        explanation: {
          en: 'Subject + verb + object, then place, then time: I saw your brother at the market yesterday.',
          uz: 'Ega + fe’l + to‘ldiruvchi, keyin joy, keyin vaqt: I saw your brother at the market yesterday.',
          ru: 'Подлежащее + глагол + дополнение, затем место, затем время: I saw your brother at the market yesterday.',
        },
      },
      {
        id: 'wo8', prompt: 'Put “never” in the right place and write the sentence: She is late for work.',
        answer: ['She is never late for work', 'She’s never late for work'],
        explanation: { en: 'With “be”, “never” goes after it: She is never late.', uz: '«Be» bilan «never» undan keyin keladi: She is never late.', ru: 'С «be» слово «never» ставится после него: She is never late.' },
      },
    ],
  },
];
