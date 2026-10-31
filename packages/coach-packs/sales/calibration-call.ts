import type { CalibrationRun, CalibrationSample } from '../src/types.ts';

// Calibration for `sales.call`: twelve learner sides of sales calls from L1 to L5, in
// English, Uzbek and Russian (only the learner's lines, one per line, as speech-to-text
// returns them), rated by the author on the five criteria, with three assessor runs per
// sample. Companies, people and figures are invented for practice.
// The runs are authored in the assessor's output shape, not captured from a model:
// they test the scoring pipeline and the thresholds in CI. Replace them with real runs
// from scripts/coach-calibration-live.ts --out once a model route is configured.

type Entry = [score: number, ...evidence: string[]];
const run = (opening: Entry, discovery: Entry, value: Entry, objections: Entry, closing: Entry): CalibrationRun => {
  const entry = ([score, ...evidence]: Entry) => ({ score, evidence });
  return { criteria: { opening: entry(opening), discovery: entry(discovery), value: entry(value), objections: entry(objections), closing: entry(closing) } };
};

const samples: CalibrationSample[] = [
  {
    id: 'c01-pharmacy-l1',
    task: 'Cold call: offering a vitamins range to the owner of a neighbourhood pharmacy (rp.cold-pharmacy). The owner already has a distributor and is busy.',
    response: [
      'Hello, this is Sardor from MedTrade, we are selling vitamins and medicines.',
      'We have very good prices, the best in Tashkent, and many products, like vitamin C, vitamin D, omega three, and also syrups.',
      'So you want to buy?',
      'OK, but our prices are cheaper than your supplier.',
      'OK, sorry. Bye.',
    ].join('\n'),
    metrics: { wpm: 150, longPauses: 1, fillers: 0, seconds: 30 },
    reference: { opening: 1, discovery: 1, value: 1.5, objections: 1, closing: 1 },
    rationale: 'No reason for calling this pharmacy and no permission asked: the product comes first. Not one question about the pharmacy; "So you want to buy?" is the only question. The pitch is a list of products plus an unsupported "best in Tashkent". The competitor objection is met with a claim the seller cannot know, then he gives up and ends with no next step.',
  },
  {
    id: 'c02-kitchen-l1plus',
    task: 'Showroom: a young couple looks at a kitchen set and says it is cheaper at the market (rp.price-furniture).',
    response: [
      'Assalomu alaykum, xush kelibsiz! Mana bu oshxona to‘plami yangi, Turkiya materiali.',
      'Narxi 18 million so‘m.',
      'Yo‘q, qimmat emas, bu sifatli.',
      'Mayli, sizga 2 million chegirma qilaman, 16 million bo‘ladi.',
      'Olasizmi?',
      'Xo‘p, o‘ylab ko‘ring, keyin keling.',
    ].join('\n'),
    reference: { opening: 2, discovery: 1, value: 1.5, objections: 1.5, closing: 1.5 },
    rationale: 'A friendly greeting, but the seller goes straight to one product and its price. No question about the kitchen, the budget or what the couple compares with. Value is one material fact. The price objection gets an argument ("qimmat emas") and then an immediate 2 million discount with nothing in return. "Olasizmi?" is a bare ask, and the call ends with "o‘ylab ko‘ring" and no next step.',
  },
  {
    id: 'c03-fitness-l2',
    task: 'Walk-in at a fitness club: the visitor asks about prices and says "I’ll think about it" (rp.think-fitness).',
    response: [
      'Здравствуйте! Добро пожаловать в наш клуб. Хотите купить абонемент?',
      'У нас есть годовой абонемент за 4 миллиона и полугодовой за 2,5 миллиона.',
      'Там есть бассейн, сауна, тренажёры, групповые занятия, всё есть.',
      'Вы спортом занимались раньше?',
      'Понятно. Ну подумайте, конечно.',
      'Вот мой номер, звоните, если что.',
    ].join('\n'),
    reference: { opening: 2, discovery: 2, value: 2, objections: 1.5, closing: 1.5 },
    rationale: 'A polite welcome that turns straight into "Хотите купить абонемент?". One closed question about past sport; nothing about goals, schedule or what stopped them before. The pitch is a list of facilities. "I’ll think about it" is accepted at once ("Ну подумайте, конечно") with no question, and the close is "звоните, если что".',
  },
  {
    id: 'c04-restaurant-l2plus',
    task: 'Cold call: a food supplier calls a restaurant manager about frozen fries and oil; the manager is happy with the current supplier (rp.cold-restaurant).',
    response: [
      'Good afternoon, is this the manager of the restaurant? My name is Aziz, I’m calling from a food supply company in Tashkent.',
      'We supply frozen fries, cooking oil and sauces to cafes and restaurants, delivery every day.',
      'How many kilos of fries do you use in a week?',
      'And who is your supplier now?',
      'OK, I understand you are happy with them. But we can give a better price, around ten percent less.',
      'Can I send you our price list on Telegram?',
    ].join('\n'),
    reference: { opening: 3, discovery: 2.5, value: 2, objections: 2, closing: 2.5 },
    rationale: 'A clear, polite opening with name and company, but no reason why this restaurant should care. Two useful questions (weekly volume, current supplier) with no follow-up on problems. The value is a list of products and daily delivery. Faced with a happy customer he offers an unspecified 10% cut without knowing their price. The close asks to send a price list: a small next step with no date.',
  },
  {
    id: 'c05-learning-centre-l3',
    task: 'A mother comes to a learning centre about IELTS classes for her daughter and wants to think it over (rp.pitch-learning-centre).',
    response: [
      'Assalomu alaykum, opa, xush kelibsiz. Men Malika, bu yerda o‘quv bo‘limi menejeriman. Kim uchun kurs qidiryapsiz?',
      'Qizingiz hozir qaysi sinfda o‘qiydi va ingliz tili darajasi qanday?',
      'IELTS qachonga kerak? Universitetga topshirish uchunmi?',
      'Bizda IELTS guruhlari haftasiga uch marta, har oy sinov imtihoni bor, natijani ota-onaga yuboramiz.',
      'Tushunaman, o‘ylab ko‘rish kerak. Aynan nimani o‘ylab ko‘rmoqchisiz — narxnimi yoki jadvalnimi?',
      'Unda qizingiz bepul daraja testiga kelsin, shanba kuni soat 10 da bo‘ladimi?',
    ].join('\n'),
    reference: { opening: 3.5, discovery: 3, value: 3, objections: 3, closing: 3.5 },
    rationale: 'A warm, respectful opening with name and role and an open question. Discovery covers grade, level and deadline but not the budget or who decides (the father is not mentioned). The pitch is reasonably relevant (monthly mock, reports to parents) though not tied to the daughter’s deadline. The "think" objection is acknowledged and probed with a good either/or question, but the answer is not used. A concrete next step (free test, Saturday at 10) is proposed.',
  },
  {
    id: 'c06-dealer-l3',
    task: 'Auto dealership: a returning customer says another dealer offers the same crossover two million cheaper (rp.competitor-auto).',
    response: [
      'Добрый день, Рустам. Вы смотрели этот кроссовер на прошлой неделе, правильно?',
      'Скажите, для чего в основном будете использовать машину — город, трасса, семья?',
      'Понимаю, у другого дилера дешевле на два миллиона. А что входит в их цену?',
      'У нас в цене уже есть зимняя резина и первое ТО, плюс тест-драйв можно сегодня.',
      'Это хорошая компания, но у них нет своего сервиса в Ташкенте, у нас сервис рядом.',
      'Давайте я запишу вас на тест-драйв в субботу?',
    ].join('\n'),
    reference: { opening: 3.5, discovery: 3, value: 3.5, objections: 2.5, closing: 3 },
    rationale: 'A personal opening that recalls the last visit. One good open question about use, then the conversation moves to price. The comparison question ("А что входит в их цену?") is the right move and the value (winter tyres, first service) answers it. But the claim that the competitor has no service centre is an unverified attack, which caps objection handling. The test-drive ask is concrete but has no time and does not close on the price gap.',
  },
  {
    id: 'c07-coworking-l3plus',
    task: 'Discovery meeting at a coworking space with a startup founder whose team is growing (rp.discovery-coworking).',
    response: [
      'Hi Kamola, thanks for coming by. Before I show you the space, can I ask a few questions so I show you the right options?',
      'How many people are on your team now, and how many do you expect by the summer?',
      'What is not working in your current office?',
      'So the main problems are the noise and that you can’t host clients there. Did I get that right?',
      'Then our meeting rooms might be the key thing for you: each desk plan includes eight hours of meeting rooms a month.',
      'I hear you, the price is higher than a rented flat. What would it cost you to lose a client meeting because of the noise?',
      'Shall we book a free trial day for the whole team next Tuesday?',
    ].join('\n'),
    reference: { opening: 4, discovery: 4, value: 3.5, objections: 3, closing: 4 },
    rationale: 'Asks permission to ask questions first: a strong opening. Discovery uses open questions about growth and pain and a confirming summary. The pitch links meeting rooms to the client problem, but only one benefit. The price objection is acknowledged and reframed with a cost question, though the comparison with a flat is not explored. A concrete trial day for the whole team with a day is proposed.',
  },
  {
    id: 'c08-solar-l3plus',
    task: 'Visit to a greenhouse farmer about solar panels; electricity cuts stop his water pump, he says there is no budget and decides with his brother (rp.discovery-solar).',
    response: [
      'Assalomu alaykum, Bahodir aka. Men Sherzod, issiqxonalarga quyosh panellari o‘rnatamiz. Qo‘shningiz Akmal aka sizni tavsiya qildi.',
      'Issiqxonada eng ko‘p elektr nimaga ketadi — isitishgami yoki suv nasosigami?',
      'Elektr o‘chsa, sizga qancha zarar bo‘ladi, masalan bir kunda?',
      'Demak, asosiy muammo — kechqurun elektr o‘chishi va nasos to‘xtab qolishi, to‘g‘rimi?',
      'Byudjet hozir yo‘qligini tushunaman. Bo‘lib to‘lash yoki avval faqat nasos uchun kichik tizimdan boshlash variantini ko‘rib chiqsak bo‘ladimi?',
      'Qaror akangiz bilan birga qilinadi dedingiz. Payshanba kuni ikkovingiz bilan birga issiqxonani ko‘rib, hisob-kitob qilib bersam bo‘ladimi?',
    ].join('\n'),
    reference: { opening: 4, discovery: 4, value: 3, objections: 4, closing: 4 },
    rationale: 'A referral opening with name and what he does: specific and respectful. Discovery finds where the power goes, the cost of a cut, and confirms the main pain with a summary. The value is implied rather than stated (no clear outcome for the pump). The budget objection is acknowledged and answered with two fair options (instalments, a smaller start). The decision maker is included in a concrete Thursday visit.',
  },
  {
    id: 'c09-apartment-l4',
    task: 'A couple viewing a flat in a new building wants to think and to ask their parents (rp.think-real-estate).',
    response: [
      'Добрый вечер, Дильноза, Тимур. Спасибо, что приехали. Как вам район, удобно добираться до работы?',
      'Что для вас самое важное в новой квартире — школа рядом, этаж, сроки сдачи?',
      'Вы сказали, что детям нужна школа рядом. Школа в двух кварталах, и окна этой квартиры выходят во двор, а не на дорогу.',
      'Конечно, такое решение нужно обдумать. Скажите честно, что вызывает сомнение — сумма первого взноса, сроки или что-то ещё?',
      'Понимаю, вы хотите посоветоваться с родителями. Может быть, приедете вместе с ними в воскресенье, я покажу им квартиру и отвечу на вопросы?',
      'Тогда я бронирую для вас время на воскресенье, в 11 утра, и пришлю расчёт по рассрочке сегодня вечером.',
    ].join('\n'),
    reference: { opening: 4, discovery: 4, value: 4, objections: 4, closing: 4.5 },
    rationale: 'A warm opening with names and a question about their life, not the flat. Discovery asks what matters most and uses the answer. The pitch ties the school and the quiet windows to what they said. "We need to think" is acknowledged and probed for the real doubt; the parents are brought into the next step instead of being an excuse. The close books a time and promises the instalment calculation tonight.',
  },
  {
    id: 'c10-plasterboard-l4plus',
    task: 'A site foreman says another supplier quoted a lower price for plasterboard (rp.price-construction).',
    response: [
      'Morning, Jasur. You said last time the plasterboard has to be on site by the 15th. Is that still the date?',
      'Before we talk numbers, how many sheets do you need in total for the three blocks, not just this order?',
      'I understand the other supplier quoted lower. Is that for the same thickness, with delivery and unloading included?',
      'Here is what I can do: if you take the full volume for all three blocks and pay thirty percent upfront, I can hold this price for three months. On this single order, the price stays as it is.',
      'What else would you need from us to make this the easy choice for your director?',
      'So we agree: I send the contract for the full volume today, and we deliver the first lot on Monday at eight. Who should sign on your side?',
    ].join('\n'),
    reference: { opening: 4.5, discovery: 4.5, value: 4, objections: 4.5, closing: 5 },
    rationale: 'Opens on the buyer’s own deadline. Discovery widens the deal (total volume for three blocks) before price. The comparison is checked like for like. The concession is traded, not given (full volume plus prepayment for a held price), and the single-order price holds. The value is mostly terms rather than outcomes. The close summarises, fixes the delivery time and asks who signs.',
  },
  {
    id: 'c11-catering-l4plus',
    task: 'Cold call to an office manager about staff lunches; she says "just send me the information" (rp.sendinfo-catering-b2b).',
    response: [
      'Assalomu alaykum, Nodira opa. Sizga ofis tushliklari bo‘yicha qo‘ng‘iroq qilyapman, ikki daqiqa vaqtingiz bormi?',
      'Albatta, ma’lumot yuboraman. To‘g‘ri narsani yuborishim uchun ikkita savol bersam: hozir xodimlaringiz tushlikni qanday hal qilyapti?',
      'Ofisda nechta odam bor va eng ko‘p nimadan noliydi — narxdanmi, vaqtdanmi yoki ovqat sifatidan?',
      'Demak, kechikish va bir xil menyu sizni charchatgan. Biz menyuni har hafta xodimlar ovozi bilan yangilaymiz va soat 12:30 gacha yetkazamiz.',
      'Prezentatsiya o‘rniga, keling, ertaga ofisingizga 10 kishilik bepul sinov tushligi olib kelaylik — xodimlarning o‘zi baho beradi.',
      'Ertaga soat 12 da bo‘ladimi yoki payshanba kuni qulayroqmi? Sinovdan keyin direktoringiz bilan 10 daqiqa gaplashsak.',
    ].join('\n'),
    reference: { opening: 4.5, discovery: 4.5, value: 4.5, objections: 5, closing: 4.5 },
    rationale: 'A short, polite permission opening. "Send me info" is accepted and turned into two questions, which is the textbook move done naturally. Discovery finds the real pains (late delivery, same menu) and summarises them. The value answers exactly those pains. Instead of a brochure, a free trial lunch lets the staff judge, and the close offers a choice of two times and brings in the director.',
  },
  {
    id: 'c12-supermarket-l5',
    task: 'Negotiation with a supermarket chain buyer who asks for an extra 5% off before the category review (rp.negotiation-wholesale).',
    response: [
      'Thanks for making time, Mr Karimov. I know your category review is next month, so I’d like to use these twenty minutes well. Can I start by asking what a good supplier looks like for you this year?',
      'When you say shelf rotation is the problem, which lines are slowing down — the one-litre packs or the multipacks?',
      'That helps. So the real goal is fewer write-offs, not just a lower price. Is that fair?',
      'You asked for an extra five percent off. I can’t do that on the list price, but if we move to weekly deliveries in smaller lots, your write-offs drop and I can cover the merchandising in your twelve stores.',
      'If I offered the extra discount, what would you be able to give us — the second shelf position or a longer contract?',
      'Let’s put it in writing: weekly delivery from the first of the month, merchandising in all twelve stores, prices fixed for six months. I’ll send the draft tonight; can we sign it with your director on Thursday?',
    ].join('\n'),
    reference: { opening: 5, discovery: 5, value: 5, objections: 5, closing: 5 },
    rationale: 'Frames the meeting around the buyer’s calendar and asks what a good supplier looks like. Discovery drills into the exact lines and reframes the goal from price to write-offs, confirmed by the buyer. The value is the buyer’s own problem solved. The discount request is refused on list price and traded for concrete terms, with a conditional question. The close is a precise written summary with a signing date and the director included.',
  },
];

const runs: Record<string, CalibrationRun[]> = {
  'c01-pharmacy-l1': [
    run([1, 'this is Sardor from MedTrade, we are selling vitamins and medicines'], [1, 'So you want to buy?'], [1.5, 'the best in Tashkent', 'like vitamin C, vitamin D, omega three'], [1, 'our prices are cheaper than your supplier'], [1, 'OK, sorry. Bye.']),
    run([1, 'Hello, this is Sardor from MedTrade'], [1, 'So you want to buy?'], [1, 'We have very good prices, the best in Tashkent'], [1, 'OK, but our prices are cheaper than your supplier.'], [1, 'OK, sorry. Bye']),
    run([1.5, 'we are selling vitamins and medicines'], [1, 'So you want to buy'], [1.5, 'many products, like vitamin C'], [1, 'cheaper than your supplier'], [1, 'sorry. Bye.']),
  ],
  'c02-kitchen-l1plus': [
    run([2, 'Assalomu alaykum, xush kelibsiz!'], [1, 'Narxi 18 million so‘m.'], [1.5, 'Turkiya materiali'], [1.5, 'Yo‘q, qimmat emas, bu sifatli.', 'sizga 2 million chegirma qilaman'], [1.5, 'Olasizmi?', 'o‘ylab ko‘ring, keyin keling']),
    run([2, 'Mana bu oshxona to‘plami yangi'], [1, 'Narxi 18 million so‘m'], [1.5, 'bu oshxona to‘plami yangi, Turkiya materiali'], [1, 'Mayli, sizga 2 million chegirma qilaman, 16 million bo‘ladi.'], [1.5, 'Xo‘p, o‘ylab ko‘ring, keyin keling.']),
    run([2, 'xush kelibsiz! Mana bu oshxona to‘plami yangi'], [1.5, 'Olasizmi?'], [1.5, 'Turkiya materiali'], [1.5, 'qimmat emas, bu sifatli'], [1.5, 'Olasizmi']),
  ],
  'c03-fitness-l2': [
    run([2, 'Добро пожаловать в наш клуб. Хотите купить абонемент?'], [2, 'Вы спортом занимались раньше?'], [2, 'Там есть бассейн, сауна, тренажёры, групповые занятия, всё есть.'], [1.5, 'Понятно. Ну подумайте, конечно.'], [1.5, 'Вот мой номер, звоните, если что.']),
    run([2, 'Здравствуйте! Добро пожаловать в наш клуб.'], [1.5, 'Вы спортом занимались раньше?'], [2, 'годовой абонемент за 4 миллиона'], [1.5, 'Ну подумайте, конечно'], [1.5, 'звоните, если что']),
    run([2, 'Хотите купить абонемент?'], [2, 'Вы спортом занимались раньше'], [2, 'бассейн, сауна, тренажёры'], [1.5, 'Понятно. Ну подумайте'], [1, 'Вот мой номер, звоните, если что']),
  ],
  'c04-restaurant-l2plus': [
    run([3, 'My name is Aziz, I’m calling from a food supply company in Tashkent.'], [2.5, 'How many kilos of fries do you use in a week?', 'And who is your supplier now?'], [2, 'We supply frozen fries, cooking oil and sauces to cafes and restaurants, delivery every day.'], [2, 'But we can give a better price, around ten percent less.'], [2.5, 'Can I send you our price list on Telegram?']),
    run([3, 'is this the manager of the restaurant?'], [2.5, 'How many kilos of fries do you use in a week?'], [2, 'delivery every day'], [2, 'I understand you are happy with them. But we can give a better price'], [2.5, 'Can I send you our price list on Telegram']),
    run([3, 'Good afternoon, is this the manager of the restaurant?'], [2.5, 'who is your supplier now?'], [2.5, 'frozen fries, cooking oil and sauces'], [2, 'around ten percent less'], [2, 'send you our price list']),
  ],
  'c05-learning-centre-l3': [
    run([3.5, 'Men Malika, bu yerda o‘quv bo‘limi menejeriman. Kim uchun kurs qidiryapsiz?'], [3, 'Qizingiz hozir qaysi sinfda o‘qiydi va ingliz tili darajasi qanday?', 'IELTS qachonga kerak?'], [3, 'har oy sinov imtihoni bor, natijani ota-onaga yuboramiz'], [3, 'Aynan nimani o‘ylab ko‘rmoqchisiz — narxnimi yoki jadvalnimi?'], [3.5, 'shanba kuni soat 10 da bo‘ladimi?']),
    run([3.5, 'Assalomu alaykum, opa, xush kelibsiz.'], [3, 'Universitetga topshirish uchunmi?'], [3, 'Bizda IELTS guruhlari haftasiga uch marta'], [3, 'Tushunaman, o‘ylab ko‘rish kerak.'], [3.5, 'Unda qizingiz bepul daraja testiga kelsin']),
    run([3.5, 'Kim uchun kurs qidiryapsiz?'], [3, 'ingliz tili darajasi qanday?'], [3.5, 'natijani ota-onaga yuboramiz'], [3, 'narxnimi yoki jadvalnimi'], [3.5, 'bepul daraja testiga kelsin, shanba kuni soat 10 da bo‘ladimi?']),
  ],
  'c06-dealer-l3': [
    run([3.5, 'Вы смотрели этот кроссовер на прошлой неделе, правильно?'], [3, 'для чего в основном будете использовать машину — город, трасса, семья?'], [3.5, 'У нас в цене уже есть зимняя резина и первое ТО'], [2.5, 'А что входит в их цену?', 'у них нет своего сервиса в Ташкенте'], [3, 'Давайте я запишу вас на тест-драйв в субботу?']),
    run([3.5, 'Добрый день, Рустам.'], [3, 'Скажите, для чего в основном будете использовать машину'], [3.5, 'зимняя резина и первое ТО, плюс тест-драйв можно сегодня'], [2.5, 'Это хорошая компания, но у них нет своего сервиса в Ташкенте'], [3, 'запишу вас на тест-драйв в субботу']),
    run([3.5, 'Вы смотрели этот кроссовер на прошлой неделе'], [3, 'город, трасса, семья'], [3, 'У нас в цене уже есть зимняя резина'], [2.5, 'у другого дилера дешевле на два миллиона. А что входит в их цену?'], [3, 'Давайте я запишу вас на тест-драйв']),
  ],
  'c07-coworking-l3plus': [
    run([4, 'Before I show you the space, can I ask a few questions so I show you the right options?'], [4, 'How many people are on your team now, and how many do you expect by the summer?', 'Did I get that right?'], [3.5, 'each desk plan includes eight hours of meeting rooms a month'], [3, 'What would it cost you to lose a client meeting because of the noise?'], [4, 'Shall we book a free trial day for the whole team next Tuesday?']),
    run([4, 'thanks for coming by'], [4, 'What is not working in your current office?'], [3.5, 'our meeting rooms might be the key thing for you'], [3, 'I hear you, the price is higher than a rented flat.'], [4, 'book a free trial day for the whole team next Tuesday']),
    run([4, 'can I ask a few questions so I show you the right options?'], [4, 'So the main problems are the noise and that you can’t host clients there.'], [3.5, 'Then our meeting rooms might be the key thing for you'], [3.5, 'the price is higher than a rented flat. What would it cost you to lose a client meeting'], [4, 'Shall we book a free trial day']),
  ],
  'c08-solar-l3plus': [
    run([4, 'Qo‘shningiz Akmal aka sizni tavsiya qildi.'], [4, 'Elektr o‘chsa, sizga qancha zarar bo‘ladi, masalan bir kunda?', 'Demak, asosiy muammo — kechqurun elektr o‘chishi va nasos to‘xtab qolishi, to‘g‘rimi?'], [3, 'avval faqat nasos uchun kichik tizimdan boshlash'], [4, 'Byudjet hozir yo‘qligini tushunaman.', 'Bo‘lib to‘lash yoki avval faqat nasos uchun kichik tizimdan boshlash variantini ko‘rib chiqsak bo‘ladimi?'], [4, 'Payshanba kuni ikkovingiz bilan birga issiqxonani ko‘rib, hisob-kitob qilib bersam bo‘ladimi?']),
    run([4, 'Men Sherzod, issiqxonalarga quyosh panellari o‘rnatamiz.'], [4, 'Issiqxonada eng ko‘p elektr nimaga ketadi — isitishgami yoki suv nasosigami?'], [3, 'issiqxonalarga quyosh panellari o‘rnatamiz'], [4, 'Bo‘lib to‘lash yoki avval faqat nasos uchun kichik tizimdan boshlash'], [4, 'Qaror akangiz bilan birga qilinadi dedingiz.']),
    run([4, 'Assalomu alaykum, Bahodir aka.'], [4, 'sizga qancha zarar bo‘ladi'], [3.5, 'kichik tizimdan boshlash variantini'], [4, 'Byudjet hozir yo‘qligini tushunaman'], [4, 'ikkovingiz bilan birga issiqxonani ko‘rib']),
  ],
  'c09-apartment-l4': [
    run([4, 'Спасибо, что приехали. Как вам район, удобно добираться до работы?'], [4, 'Что для вас самое важное в новой квартире — школа рядом, этаж, сроки сдачи?'], [4, 'Школа в двух кварталах, и окна этой квартиры выходят во двор, а не на дорогу.'], [4, 'Скажите честно, что вызывает сомнение — сумма первого взноса, сроки или что-то ещё?'], [4.5, 'Тогда я бронирую для вас время на воскресенье, в 11 утра, и пришлю расчёт по рассрочке сегодня вечером.']),
    run([4, 'Добрый вечер, Дильноза, Тимур.'], [4, 'Вы сказали, что детям нужна школа рядом.'], [4, 'окна этой квартиры выходят во двор'], [4, 'Может быть, приедете вместе с ними в воскресенье'], [4.5, 'я бронирую для вас время на воскресенье, в 11 утра']),
    run([4, 'Как вам район, удобно добираться до работы?'], [4, 'школа рядом, этаж, сроки сдачи'], [4, 'Вы сказали, что детям нужна школа рядом. Школа в двух кварталах'], [4.5, 'Понимаю, вы хотите посоветоваться с родителями.'], [4.5, 'пришлю расчёт по рассрочке сегодня вечером']),
  ],
  'c10-plasterboard-l4plus': [
    run([4.5, 'You said last time the plasterboard has to be on site by the 15th. Is that still the date?'], [4.5, 'how many sheets do you need in total for the three blocks, not just this order?'], [4, 'I can hold this price for three months'], [4.5, 'Is that for the same thickness, with delivery and unloading included?', 'On this single order, the price stays as it is.'], [5, 'we deliver the first lot on Monday at eight. Who should sign on your side?']),
    run([4.5, 'Morning, Jasur.'], [4.5, 'Before we talk numbers'], [4, 'What else would you need from us to make this the easy choice for your director?'], [4.5, 'if you take the full volume for all three blocks and pay thirty percent upfront'], [5, 'So we agree: I send the contract for the full volume today']),
    run([4.5, 'the plasterboard has to be on site by the 15th'], [4.5, 'how many sheets do you need in total'], [4, 'make this the easy choice for your director'], [4, 'I understand the other supplier quoted lower.'], [5, 'Who should sign on your side?']),
  ],
  'c11-catering-l4plus': [
    run([4.5, 'Sizga ofis tushliklari bo‘yicha qo‘ng‘iroq qilyapman, ikki daqiqa vaqtingiz bormi?'], [4.5, 'hozir xodimlaringiz tushlikni qanday hal qilyapti?', 'eng ko‘p nimadan noliydi — narxdanmi, vaqtdanmi yoki ovqat sifatidan?'], [4.5, 'Biz menyuni har hafta xodimlar ovozi bilan yangilaymiz va soat 12:30 gacha yetkazamiz.'], [5, 'Albatta, ma’lumot yuboraman. To‘g‘ri narsani yuborishim uchun ikkita savol bersam'], [4.5, 'Ertaga soat 12 da bo‘ladimi yoki payshanba kuni qulayroqmi?']),
    run([4.5, 'Assalomu alaykum, Nodira opa.'], [4.5, 'Demak, kechikish va bir xil menyu sizni charchatgan.'], [4.5, 'soat 12:30 gacha yetkazamiz'], [5, 'Prezentatsiya o‘rniga, keling, ertaga ofisingizga 10 kishilik bepul sinov tushligi olib kelaylik'], [4.5, 'Sinovdan keyin direktoringiz bilan 10 daqiqa gaplashsak.']),
    run([4.5, 'ikki daqiqa vaqtingiz bormi?'], [4.5, 'Ofisda nechta odam bor'], [4.5, 'menyuni har hafta xodimlar ovozi bilan yangilaymiz'], [4.5, 'To‘g‘ri narsani yuborishim uchun ikkita savol bersam'], [4.5, 'payshanba kuni qulayroqmi']),
  ],
  'c12-supermarket-l5': [
    run([5, 'I know your category review is next month, so I’d like to use these twenty minutes well.'], [5, 'which lines are slowing down — the one-litre packs or the multipacks?', 'So the real goal is fewer write-offs, not just a lower price. Is that fair?'], [5, 'if we move to weekly deliveries in smaller lots, your write-offs drop'], [5, 'I can’t do that on the list price', 'what would you be able to give us — the second shelf position or a longer contract?'], [5, 'I’ll send the draft tonight; can we sign it with your director on Thursday?']),
    run([5, 'Can I start by asking what a good supplier looks like for you this year?'], [5, 'When you say shelf rotation is the problem'], [5, 'I can cover the merchandising in your twelve stores'], [5, 'If I offered the extra discount, what would you be able to give us'], [5, 'Let’s put it in writing: weekly delivery from the first of the month']),
    run([5, 'Thanks for making time, Mr Karimov.'], [5, 'So the real goal is fewer write-offs, not just a lower price.'], [4.5, 'your write-offs drop'], [5, 'You asked for an extra five percent off.'], [5, 'prices fixed for six months']),
  ],
};

export const callCalibration: { samples: CalibrationSample[]; runs: Record<string, CalibrationRun[]> } = { samples, runs };
