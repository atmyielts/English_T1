import type { LevelScale, PackManifest } from '../src/types.ts';

// B4 Sales Coach. A mixed pack: people practise selling in their own language
// (Uzbek, Russian or English), and every practice text is written in all three with
// T() (src/localize.ts). Skill nodes and error tags are referenced by every other file.
//
// The level scale: L1 (first weeks in sales) to L5 (a senior seller who handles any
// buyer), in half steps. It measures selling conversations, not any outside certificate.

export const SALES_SCALE: LevelScale = {
  id: 'sales_level', min: 1, max: 5, step: 0.5,
  labels: [
    { value: 1, label: 'L1' }, { value: 1.5, label: 'L1+' }, { value: 2, label: 'L2' }, { value: 2.5, label: 'L2+' },
    { value: 3, label: 'L3' }, { value: 3.5, label: 'L3+' }, { value: 4, label: 'L4' }, { value: 4.5, label: 'L4+' }, { value: 5, label: 'L5' },
  ],
};

export const manifest: PackManifest = {
  id: 'sales',
  feature: 'B4',
  version: '1.0.0',
  name: { en: 'Sales Coach', uz: 'Savdo murabbiyi', ru: 'Коуч по продажам' },
  tagline: {
    en: 'Sell better by voice: cold calls, discovery, objections, closing and DM selling, scored after every call.',
    uz: 'Ovozli mashq bilan yaxshiroq soting: sovuq qo‘ng‘iroq, ehtiyojni aniqlash, e’tirozlar, bitim tuzish va DM savdosi.',
    ru: 'Голосовая практика продаж: холодные звонки, выявление потребностей, возражения, закрытие сделки, продажи в директе.',
  },
  description: {
    en: 'Role-play with buyers from the Uzbek market — shops, B2B, real estate, cars, education — who have a hidden budget, pain, decision power and mood that react to what you say. After every call: a scorecard (talk ratio, questions, objections handled, next step) and a replay with better lines. Rapid-fire objection drills, a script builder for your own product, and team mode for sales managers.',
    uz: 'O‘zbek bozori mijozlari — do‘konlar, B2B, ko‘chmas mulk, avtomobil, ta’lim — bilan rolli o‘yin. Ularning yashirin byudjeti, muammosi, qaror vakolati va kayfiyati gapingizga qarab o‘zgaradi. Har qo‘ng‘iroqdan keyin: natija kartasi (gap ulushi, savollar, hal qilingan e’tirozlar, keyingi qadam) va yaxshiroq iboralar bilan suhbat tahlili. Tezkor e’tiroz mashqlari, o‘z mahsulotingiz uchun skript konstruktori va savdo rahbarlari uchun jamoa rejimi.',
    ru: 'Ролевые игры с клиентами узбекского рынка — магазины, B2B, недвижимость, авто, образование — со скрытым бюджетом, болью, правом решения и настроением, которые меняются от ваших слов. После каждого звонка: оценочная карта (доля речи, вопросы, отработанные возражения, следующий шаг) и разбор с более удачными фразами. Быстрые тренировки возражений, конструктор скриптов для вашего продукта и командный режим для руководителей продаж.',
  },
  uiLanguages: ['uz', 'ru', 'en'],
  practiceLanguage: 'mixed',
  contentLanguage: 'en',
  audience: {
    description: {
      en: 'Sales reps, shop assistants, business owners, call-centre staff and anyone who sells a product or service in Uzbekistan, from their first weeks (L1) to senior sellers (L5).',
      uz: 'Savdo vakillari, do‘kon sotuvchilari, biznes egalari, call-markaz xodimlari va O‘zbekistonda mahsulot yoki xizmat sotadigan har kim — dastlabki haftalardan (L1) tajribali sotuvchilargacha (L5).',
      ru: 'Менеджеры по продажам, продавцы-консультанты, владельцы бизнеса, сотрудники колл-центров и все, кто продаёт товар или услугу в Узбекистане, — от первых недель (L1) до опытных продавцов (L5).',
    },
    minAge: 16,
    levels: [1, 5],
  },
  scale: SALES_SCALE,
  skills: [
    { id: 'prospecting', name: { en: 'Prospecting', uz: 'Mijoz qidirish', ru: 'Поиск клиентов' }, weight: 0.8 },
    { id: 'prospecting.cold_call', parent: 'prospecting', name: { en: 'Cold-call openings', uz: 'Sovuq qo‘ng‘iroq boshlanishi', ru: 'Начало холодного звонка' }, weight: 1.2 },
    { id: 'prospecting.qualifying', parent: 'prospecting', name: { en: 'Qualifying buyers', uz: 'Mijozni saralash', ru: 'Квалификация клиента' } },
    { id: 'discovery', name: { en: 'Discovery questions', uz: 'Ehtiyojni aniqlovchi savollar', ru: 'Выявление потребностей' }, weight: 1.3 },
    { id: 'value', name: { en: 'Value pitch', uz: 'Qiymat taqdimoti', ru: 'Презентация ценности' }, weight: 1.1 },
    { id: 'objections', name: { en: 'Objection handling', uz: 'E’tirozlar bilan ishlash', ru: 'Работа с возражениями' }, weight: 1.3 },
    { id: 'objections.price', parent: 'objections', name: { en: 'Price: "It’s too expensive"', uz: 'Narx: «Qimmat ekan»', ru: 'Цена: «Дорого»' } },
    { id: 'objections.think', parent: 'objections', name: { en: '"I’ll think about it"', uz: '«O‘ylab ko‘raman»', ru: '«Я подумаю»' } },
    { id: 'objections.competitor', parent: 'objections', name: { en: 'A competitor', uz: 'Raqobatchi', ru: 'Конкурент' } },
    { id: 'objections.budget', parent: 'objections', name: { en: 'No budget', uz: 'Byudjet yo‘q', ru: 'Нет бюджета' } },
    { id: 'objections.send_info', parent: 'objections', name: { en: '"Send me info"', uz: '«Ma’lumot yuboring»', ru: '«Пришлите информацию»' } },
    { id: 'closing', name: { en: 'Closing and next steps', uz: 'Bitim tuzish va keyingi qadam', ru: 'Закрытие сделки и следующий шаг' }, weight: 1.2 },
    { id: 'follow_up', name: { en: 'Follow-up', uz: 'Keyingi aloqa (follow-up)', ru: 'Повторный контакт' }, weight: 0.9 },
    { id: 'negotiation', name: { en: 'Negotiation', uz: 'Muzokara', ru: 'Переговоры' } },
    { id: 'shop_floor', name: { en: 'Shop-floor selling', uz: 'Do‘konda sotish', ru: 'Продажи в торговом зале' } },
    { id: 'dm', name: { en: 'Telegram and Instagram DM selling', uz: 'Telegram va Instagram DM orqali sotish', ru: 'Продажи в Telegram и Instagram' } },
  ],
  errorTags: [
    {
      id: 'weak_opening', node: 'prospecting.cold_call', drill: 'drill.opening',
      name: { en: 'Weak or generic opening', uz: 'Zaif yoki umumiy boshlanish', ru: 'Слабое или шаблонное начало' },
      explain: {
        en: 'The first 20 seconds often decide whether the buyer keeps listening. Say who you are, why you are calling this person in particular, and ask permission for one short question. "Can I help you?" or a long company history loses them.',
        uz: 'Birinchi 20 soniya ko‘pincha mijoz tinglashda davom etadimi-yo‘qmi, shuni hal qiladi. Kimligingizni, nega aynan unga qo‘ng‘iroq qilayotganingizni ayting va bitta qisqa savol uchun ruxsat so‘rang. «Yordam bera olamanmi?» yoki kompaniya tarixini uzoq so‘zlash mijozni yo‘qotadi.',
        ru: 'Первые 20 секунд часто решают, будет ли клиент слушать дальше. Скажите, кто вы, почему звоните именно ему, и попросите разрешения задать один короткий вопрос. «Чем могу помочь?» или длинный рассказ о компании — и клиент потерян.',
      },
    },
    {
      id: 'closed_questions', node: 'discovery', drill: 'drill.discovery',
      name: { en: 'Closed questions only', uz: 'Faqat yopiq savollar', ru: 'Только закрытые вопросы' },
      explain: {
        en: 'Yes/no questions ("Do you need delivery?") give you one word. Open questions (what, how, why, tell me about…) let the buyer explain their situation, and that is where the real need and budget come out.',
        uz: '«Ha/yo‘q» savollari («Yetkazib berish kerakmi?») sizga bitta so‘z beradi. Ochiq savollar (nima, qanday, nega, … haqida gapirib bering) mijozga vaziyatini tushuntirishga imkon beradi — haqiqiy ehtiyoj va byudjet aynan shunda chiqadi.',
        ru: 'Вопросы «да/нет» («Вам нужна доставка?») дают одно слово. Открытые вопросы (что, как, почему, расскажите о…) позволяют клиенту описать ситуацию — именно там раскрываются настоящая потребность и бюджет.',
      },
    },
    {
      id: 'ignore_decider', node: 'prospecting.qualifying', drill: 'drill.discovery',
      name: { en: 'Ignoring who decides', uz: 'Qaror qiluvchini e’tiborsiz qoldirish', ru: 'Игнорирование того, кто решает' },
      explain: {
        en: 'Many buyers in Uzbekistan decide with a partner, a parent, the owner or a director. Ask early and politely: "Who else will be part of this decision?" Then plan the next step so that person is included.',
        uz: 'O‘zbekistonda ko‘p mijozlar sherigi, ota-onasi, egasi yoki direktori bilan birga qaror qiladi. Erta va xushmuomalalik bilan so‘rang: «Bu qarorda yana kim ishtirok etadi?» Keyin keyingi qadamni o‘sha odam ham qatnashadigan qilib rejalashtiring.',
        ru: 'Многие клиенты в Узбекистане решают вместе с партнёром, родителями, владельцем или директором. Спросите рано и вежливо: «Кто ещё участвует в этом решении?» И спланируйте следующий шаг так, чтобы в нём участвовал этот человек.',
      },
    },
    {
      id: 'feature_dump', node: 'value', drill: 'drill.value',
      name: { en: 'Talking too much, listing features', uz: 'Ko‘p gapirish, xususiyatlarni sanab o‘tish', ru: 'Много слов, перечисление характеристик' },
      explain: {
        en: 'A list of features before you know the buyer’s problem sounds like a brochure. Speak less than half the time, and link each feature to something the buyer told you: "You said deliveries are late — that is why we deliver by 9 a.m."',
        uz: 'Mijozning muammosini bilmasdan xususiyatlarni sanash buklet o‘qishdek eshitiladi. Vaqtning yarmidan kamini gapiring va har bir xususiyatni mijoz aytgan narsa bilan bog‘lang: «Yetkazib berish kechikadi dedingiz — shuning uchun biz soat 9 gacha olib kelamiz.»',
        ru: 'Список характеристик до того, как вы узнали проблему клиента, звучит как буклет. Говорите меньше половины времени и связывайте каждую характеристику с тем, что сказал клиент: «Вы говорили, что поставки опаздывают, — поэтому мы привозим до 9 утра».',
      },
    },
    {
      id: 'early_discount', node: 'objections.price', drill: 'drill.price',
      name: { en: 'Discounting too early', uz: 'Chegirmani juda erta berish', ru: 'Слишком ранняя скидка' },
      explain: {
        en: 'A discount offered the moment the buyer says "expensive" tells them your price was not real, and they will ask for more. First find out what they compare with and what matters to them; trade any concession for something (a bigger order, prepayment, a longer contract).',
        uz: 'Mijoz «qimmat» deyishi bilan berilgan chegirma narxingiz haqiqiy emasligini bildiradi va u yana so‘raydi. Avval nima bilan solishtirayotganini va unga nima muhimligini bilib oling; har qanday yon berishni nimadir evaziga bering (kattaroq buyurtma, oldindan to‘lov, uzoqroq shartnoma).',
        ru: 'Скидка сразу после слова «дорого» говорит клиенту, что цена была ненастоящей, и он попросит ещё. Сначала узнайте, с чем он сравнивает и что для него важно; любую уступку давайте только в обмен на что-то (больший заказ, предоплату, более длинный договор).',
      },
    },
    {
      id: 'no_question_back', node: 'objections', drill: 'drill.think',
      name: { en: 'No question after an objection', uz: 'E’tirozdan keyin savol bermaslik', ru: 'Нет вопроса после возражения' },
      explain: {
        en: 'An objection is usually a short version of a real concern. Do not answer it straight away: acknowledge it, then ask a question to find the real reason ("What exactly would you like to think over — the price, the timing or something else?").',
        uz: 'E’tiroz odatda haqiqiy xavotirning qisqa shaklidir. Darhol javob bermang: uni tan oling, keyin asl sababni topish uchun savol bering («Aynan nimani o‘ylab ko‘rmoqchisiz — narxnimi, muddatnimi yoki boshqa narsanimi?»).',
        ru: 'Возражение обычно — краткая форма настоящего сомнения. Не отвечайте сразу: признайте его и задайте вопрос, чтобы найти настоящую причину («Что именно хотите обдумать — цену, сроки или что-то другое?»).',
      },
    },
    {
      id: 'arguing', node: 'objections.competitor', drill: 'drill.competitor',
      name: { en: 'Arguing with the buyer', uz: 'Mijoz bilan bahslashish', ru: 'Спор с клиентом' },
      explain: {
        en: 'Telling a buyer they are wrong, or criticising a competitor, makes them defend their choice. Agree with what is true ("They are a solid company"), then ask what they would improve, and show the difference calmly.',
        uz: 'Mijozga noto‘g‘ri ekanini aytish yoki raqobatchini yomonlash uni o‘z tanlovini himoya qilishga majbur qiladi. To‘g‘ri gapga qo‘shiling («Bu jiddiy kompaniya»), keyin nimani yaxshilashni xohlashini so‘rang va farqni xotirjam ko‘rsating.',
        ru: 'Если сказать клиенту, что он неправ, или ругать конкурента, он начнёт защищать свой выбор. Согласитесь с тем, что правда («Это серьёзная компания»), спросите, что бы он улучшил, и спокойно покажите разницу.',
      },
    },
    {
      id: 'no_next_step', node: 'closing', drill: 'drill.closing',
      name: { en: 'No clear next step', uz: 'Aniq keyingi qadam yo‘q', ru: 'Нет чёткого следующего шага' },
      explain: {
        en: 'A call that ends with "OK, call me sometime" is lost. Before you hang up, agree on one concrete step with a day and time: a meeting, a demo, a trial order, a call with the decision maker.',
        uz: '«Mayli, qachondir qo‘ng‘iroq qiling» bilan tugagan qo‘ng‘iroq yo‘qotilgan hisoblanadi. Go‘shakni qo‘yishdan oldin kun va vaqti bilan bitta aniq qadamni kelishib oling: uchrashuv, namoyish, sinov buyurtmasi, qaror qiluvchi bilan qo‘ng‘iroq.',
        ru: 'Звонок, который заканчивается «Ладно, позвоните как-нибудь», потерян. До того как положить трубку, договоритесь об одном конкретном шаге, назначив день и время: встреча, демонстрация, пробный заказ, звонок с тем, кто решает.',
      },
    },
    {
      id: 'pressure', node: 'closing', drill: 'drill.ethics',
      name: { en: 'Pressure or misleading claims', uz: 'Bosim yoki chalg‘ituvchi da’volar', ru: 'Давление или вводящие в заблуждение обещания' },
      explain: {
        en: 'Fake urgency ("only today"), promises you cannot keep, or numbers you invented may win one sale and lose the customer and your name. Say only what is true, make honest offers, and let the buyer decide.',
        uz: 'Soxta shoshilinchlik («faqat bugun»), bajara olmaydigan va’dalar yoki o‘ylab topilgan raqamlar bitta savdoni yutib, mijoz va obro‘ingizni yo‘qotishi mumkin. Faqat haqiqatni ayting, halol taklif qiling va qarorni mijozga qoldiring.',
        ru: 'Фальшивая срочность («только сегодня»), невыполнимые обещания или выдуманные цифры могут принести одну продажу и потерять клиента и репутацию. Говорите только правду, делайте честные предложения и оставляйте решение клиенту.',
      },
    },
    {
      id: 'slow_follow_up', node: 'follow_up', drill: 'drill.follow_up',
      name: { en: 'Slow or empty follow-up', uz: 'Kech yoki mazmunsiz follow-up', ru: 'Медленный или пустой повторный контакт' },
      explain: {
        en: 'Follow up when you promised, and bring something useful each time: the answer to their question, a relevant example, a short summary of what you agreed. "Just checking in" with nothing new gets ignored.',
        uz: 'Va’da qilgan vaqtingizda bog‘laning va har safar foydali narsa olib keling: savoliga javob, mos misol, kelishilgan narsalarning qisqa xulosasi. Yangi narsasiz «shunchaki bilmoqchi edim» degan xabarga javob berilmaydi.',
        ru: 'Связывайтесь тогда, когда обещали, и каждый раз приносите пользу: ответ на вопрос клиента, подходящий пример, короткое резюме договорённостей. Пустое «просто уточняю» игнорируют.',
      },
    },
    {
      id: 'price_only_reply', node: 'dm', drill: 'drill.dm',
      name: { en: 'Price-only reply in DMs', uz: 'DMda faqat narx bilan javob', ru: 'Ответ в директе только ценой' },
      explain: {
        en: 'When someone writes "price?", a bare number ends the conversation. Answer the price honestly, add one line of value, and finish with an easy question that keeps them talking ("Which size do you need?").',
        uz: 'Kimdir «narxi?» deb yozsa, faqat raqam yozish suhbatni tugatadi. Narxni halol ayting, mahsulot foydasi haqida bitta jumla qo‘shing va suhbatni davom ettiradigan oson savol bilan yakunlang («Qaysi o‘lcham kerak?»).',
        ru: 'Когда пишут «цена?», голая цифра заканчивает разговор. Честно назовите цену, добавьте одну фразу о ценности и закончите лёгким вопросом, который продолжит диалог («Какой размер вам нужен?»).',
      },
    },
  ],
  menu: [
    { action: 'today', emoji: '📅', label: { en: 'Today', uz: 'Bugun', ru: 'Сегодня' } },
    { action: 'roleplay', emoji: '📞', label: { en: 'Sales calls', uz: 'Savdo qo‘ng‘iroqlari', ru: 'Звонки' } },
    { action: 'mock', emoji: '🔥', label: { en: 'Mock call', uz: 'Sinov qo‘ng‘irog‘i', ru: 'Пробный звонок' } },
    { action: 'drill', emoji: '⚡', label: { en: 'Objection drills', uz: 'E’tiroz mashqlari', ru: 'Тренажёр возражений' } },
    { action: 'writing', emoji: '💬', label: { en: 'DM and follow-up', uz: 'DM va follow-up', ru: 'Директ и follow-up' } },
    { action: 'script', emoji: '🛠', label: { en: 'My script', uz: 'Mening skriptim', ru: 'Мой скрипт' } },
    { action: 'lesson', emoji: '📘', label: { en: 'Micro-lesson', uz: 'Mini dars', ru: 'Мини-урок' } },
    { action: 'progress', emoji: '📈', label: { en: 'Progress', uz: 'Natijalar', ru: 'Прогресс' } },
    { action: 'report', emoji: '🗓', label: { en: 'Weekly report', uz: 'Haftalik hisobot', ru: 'Еженедельный отчёт' } },
    { action: 'plan', emoji: '🎯', label: { en: 'My plan', uz: 'Rejam', ru: 'Мой план' } },
    { action: 'settings', emoji: '⚙️', label: { en: 'Settings', uz: 'Sozlamalar', ru: 'Настройки' } },
    { action: 'help', emoji: '❓', label: { en: 'Help', uz: 'Yordam', ru: 'Помощь' } },
  ],
  commands: [
    { command: 'today', description: { en: 'Today’s practice plan', uz: 'Bugungi mashq rejasi', ru: 'План практики на сегодня' } },
    { command: 'roleplay', description: { en: 'A sales call with a buyer', uz: 'Mijoz bilan savdo qo‘ng‘irog‘i', ru: 'Звонок клиенту' } },
    { command: 'mock', description: { en: 'A scored mock sales call', uz: 'Baholanadigan sinov savdo qo‘ng‘irog‘i', ru: 'Пробный звонок с оценкой' } },
    { command: 'drill', description: { en: 'Rapid-fire objection drills', uz: 'Tezkor e’tiroz mashqlari', ru: 'Быстрые тренировки возражений' } },
    { command: 'writing', description: { en: 'DM and follow-up messages', uz: 'DM va follow-up xabarlari', ru: 'Сообщения в директ и follow-up' } },
    { command: 'script', description: { en: 'Build a script for your product', uz: 'Mahsulotingiz uchun skript', ru: 'Скрипт для вашего продукта' } },
    { command: 'lesson', description: { en: 'A two-minute sales lesson', uz: 'Ikki daqiqalik savdo darsi', ru: 'Двухминутный урок продаж' } },
    { command: 'progress', description: { en: 'Your level and progress', uz: 'Darajangiz va natijalar', ru: 'Ваш уровень и прогресс' } },
    { command: 'report', description: { en: 'This week vs last week', uz: 'Bu hafta va o‘tgan hafta', ru: 'Эта неделя в сравнении с прошлой' } },
    { command: 'plan', description: { en: 'Your goal and plan', uz: 'Maqsad va reja', ru: 'Цель и план' } },
    { command: 'settings', description: { en: 'Language, reminders, corrections', uz: 'Til, eslatmalar, tuzatishlar', ru: 'Язык, напоминания, исправления' } },
    { command: 'help', description: { en: 'How this coach works', uz: 'Murabbiy qanday ishlaydi', ru: 'Как работает коуч' } },
  ],
  correctionModes: ['gentle', 'strict'],
  accent: '#c2410c',
};
