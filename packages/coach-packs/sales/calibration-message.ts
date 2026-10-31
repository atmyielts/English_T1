import type { CalibrationRun, CalibrationSample } from '../src/types.ts';

// Calibration for `sales.message`: twelve written selling messages (Telegram and
// Instagram DMs, follow-ups, recaps) from L1 to L5 in English, Uzbek and Russian,
// rated by the author, with three assessor runs per sample in the model's output
// shape. Shops, people and prices are invented for practice. The runs are authored,
// not captured from a model; replace them with real runs from
// scripts/coach-calibration-live.ts --out once a model route is configured.

type Entry = [score: number, ...evidence: string[]];
const run = (personal: Entry, value: Entry, clarity: Entry, nextStep: Entry, tone: Entry): CalibrationRun => {
  const entry = ([score, ...evidence]: Entry) => ({ score, evidence });
  return { criteria: { personal: entry(personal), value: entry(value), clarity: entry(clarity), next_step: entry(nextStep), tone: entry(tone) } };
};

const samples: CalibrationSample[] = [
  {
    id: 'm01-price-uz-l1',
    task: 'Instagram DM: a buyer writes "Narxi qancha?" under a post with a women’s winter coat (task w.dm-price).',
    response: 'Narxi 350 000 so‘m. Olsangiz yozing.',
    reference: { personal: 1, value: 1, clarity: 1.5, next_step: 1, tone: 1.5 },
    rationale: 'A bare price and "write if you buy". Nothing about this buyer (size, colour), no reason to buy, and the next step puts all the work on the buyer. Short and clear, but curt.',
  },
  {
    id: 'm02-urgency-ru-l1',
    task: 'Telegram: reply to a buyer who asked about a washing machine model (task w.dm-price).',
    response: 'Здравствуйте. Цена 2 400 000. Это лучшая цена в городе, только сегодня! Пишите быстрее, осталось мало!!!',
    reference: { personal: 1, value: 1.5, clarity: 2, next_step: 1.5, tone: 1 },
    rationale: 'The price plus an unverifiable "best price in town" and fake urgency ("только сегодня", "осталось мало"). Nothing about the model the buyer asked for. The push to "write faster" is pressure, not a next step. Pressure and invented claims cap tone at the bottom.',
  },
  {
    id: 'm03-checkin-en-l2',
    task: 'Telegram follow-up three days after a call with a café owner about a coffee machine lease (task w.followup-call).',
    response: 'Hi, just checking in. Did you think about our offer? Let me know. Thanks.',
    reference: { personal: 1.5, value: 1, clarity: 3, next_step: 2, tone: 3 },
    rationale: 'Polite and easy to read, but it could go to anyone: nothing from the call, no reason to reply and no new value. "Let me know" is a vague ending.',
  },
  {
    id: 'm04-wall-uz-l2',
    task: 'E-mail after a buyer said "send me information" about office cleaning (task w.send-info).',
    response: 'Assalomu alaykum. Bizning kompaniya 2015-yildan beri ishlaydi, bizda 40 dan ortiq xodim bor, biz ofislar, uylar, restoranlar, do‘konlar, omborlarni tozalaymiz, gilam yuvamiz, deraza yuvamiz, ta’mirdan keyin tozalaymiz, dezinfeksiya qilamiz, hamma narsani professional uskunalar bilan qilamiz, narxlarimiz ham qulay, chegirmalar ham bor. Batafsil ma’lumot uchun qo‘ng‘iroq qiling.',
    reference: { personal: 1.5, value: 2, clarity: 1.5, next_step: 2, tone: 2.5 },
    rationale: 'A long single block listing every service, while the buyer only needs office cleaning. Company facts instead of value for this office. Hard to read on a phone. "Qo‘ng‘iroq qiling" puts the next step on the buyer. Polite, if impersonal.',
  },
  {
    id: 'm05-template-ru-l2plus',
    task: 'A first Telegram message to the owner of a chain of three bakeries about a delivery-tracking app (task w.cold-b2b).',
    response: 'Добрый день! Меня зовут Бекзод, я представляю IT-компанию. Мы разрабатываем программы для бизнеса: CRM, учёт, доставка, мобильные приложения. Наши решения помогают увеличить продажи и сократить расходы. Будем рады сотрудничеству! Когда вам удобно созвониться?',
    reference: { personal: 1.5, value: 2, clarity: 3, next_step: 3, tone: 3 },
    rationale: 'Polite and well formed, with a clear question at the end, but a template: nothing about bakeries, three shops or delivery. The value is generic ("увеличить продажи и сократить расходы"). The call request is clear but asks a lot from a stranger.',
  },
  {
    id: 'm06-dress-en-l3',
    task: 'Instagram DM: "price?" under a post with an evening dress from a small online boutique (task w.dm-price).',
    response: 'Hello! This dress is 690,000 UZS, and alterations of the length are free. We have it in sizes S, M and L, in green and burgundy. Which size and colour would you like?',
    reference: { personal: 3, value: 3, clarity: 3.5, next_step: 3.5, tone: 3.5 },
    rationale: 'Answers the price at once, adds a real inclusion (free length alterations) and the options, and ends with an easy question. It does not use anything about this buyer (an occasion, a date), so it is good but generic.',
  },
  {
    id: 'm07-course-uz-l3',
    task: 'Telegram: a 17-year-old asks how much a programming course costs (task w.dm-course).',
    response: 'Assalomu alaykum! Frontend kursimiz 6 oy davom etadi, oyiga 900 000 so‘m. Darslar haftasiga 3 marta, kechki 18:00 dan. Kurs oxirida portfolio uchun 3 ta loyiha qilasiz. Hozir maktabdamisiz yoki ishlayapsizmi? Shunga qarab qulay guruhni tavsiya qilaman.',
    reference: { personal: 3, value: 3.5, clarity: 3.5, next_step: 3, tone: 3.5 },
    rationale: 'Clear price, length and schedule, and a concrete outcome (three portfolio projects). The closing question starts discovery, which suits the stage, though it does not propose a trial lesson or time. Friendly and correct for a teenager.',
  },
  {
    id: 'm08-followup-ru-l3plus',
    task: 'Telegram follow-up after a call with a hotel manager about laundry services (task w.followup-call).',
    response: 'Добрый день, Гульнора! Спасибо за разговор во вторник. Как обещал, отправляю расчёт для ваших 40 номеров: стирка постельного белья с доставкой через день — 6,8 млн сум в месяц. Отдельно приложил пример отчёта, который вы будете получать каждую неделю. Удобно обсудить детали в четверг в 15:00 или в пятницу утром?',
    reference: { personal: 4, value: 3.5, clarity: 4, next_step: 4, tone: 4 },
    rationale: 'Personal (name, the call on Tuesday, her 40 rooms), keeps a promise and gives the exact figure. The weekly report example is real value, though the benefit of delivery every other day is not spelled out. A choice of two times makes replying easy.',
  },
  {
    id: 'm09-recap-en-l4',
    task: 'E-mail recap after a meeting with a logistics company’s operations manager about GPS trackers for 25 trucks (task w.recap).',
    response: 'Hi Timur,\n\nThanks for the meeting today. A short summary so we are on the same page:\n\n• Your goal: fewer fuel losses and fewer calls to drivers asking where they are.\n• Our proposal: trackers for all 25 trucks, a fuel-level sensor on the 8 long-haul ones, and a two-week trial on 3 trucks first.\n• Open question: whether your accountant needs the fuel report in Excel or in 1C.\n\nNext step: I will install the 3 trial trackers on Monday at 9:00 at your depot, as agreed. Could you confirm who will meet our technician?\n\nBest regards,\nLola',
    reference: { personal: 4, value: 4, clarity: 4.5, next_step: 4, tone: 4 },
    rationale: 'Built around the buyer’s own goals, with a fitting proposal and an honest low-risk trial. Very easy to scan. The next step is concrete and confirmed, with a small, easy request. The value could quantify less, but every line is relevant.',
  },
  {
    id: 'm10-complaint-uz-l4',
    task: 'Instagram DM: a customer complains that the sofa delivery was two days late and asks for compensation (task w.complaint).',
    response: 'Assalomu alaykum, Dilfuza opa. Kechikish uchun chin dildan uzr so‘raymiz — siz bu kunga mehmon kutayotgan edingiz, bu juda noqulay bo‘lgani aniq. Yetkazib berish narxini (150 000 so‘m) sizga qaytaramiz, pulni bugun kartangizga o‘tkazamiz. Divan bilan birga dekorativ yostiqlarni ham ko‘rmoqchi edingiz — xohlasangiz, ularni bepul yetkazib beramiz. Qaysi rang sizga yoqqanini yozib yuborsangiz, ertaga olib boramiz.',
    reference: { personal: 4.5, value: 4, clarity: 4, next_step: 4, tone: 4.5 },
    rationale: 'A sincere, specific apology that shows they remember her situation (guests), a concrete fix with a date, and a gentle, relevant offer on the cushions she wanted. The upsell is honest and easy to accept. Slightly long for a DM.',
  },
  {
    id: 'm11-counter-ru-l4plus',
    task: 'Telegram: a negotiation reply to a restaurant owner who asked for 15% off a year’s supply of cooking oil (task w.counter-offer).',
    response: 'Азиз, спасибо, что честно сказали о бюджете. Скидку 15% на годовой объём я дать не могу — это ниже нашей себестоимости. Могу предложить другое: если вы оплачиваете поставку за месяц вперёд, цена фиксируется на 12 месяцев, даже если масло подорожает, плюс бесплатная доставка в оба ваших филиала. Для вас это защита от роста цен, для нас — предсказуемость. Подходит такой вариант? Если да, я подготовлю договор к пятнице.',
    reference: { personal: 4.5, value: 4.5, clarity: 4.5, next_step: 4.5, tone: 4.5 },
    rationale: 'Respectful refusal with a reason, then a traded concession (prepayment for a fixed price and free delivery to both branches) framed as a benefit for both sides. Clear structure, a yes/no question and a dated next step. Honest and confident.',
  },
  {
    id: 'm12-reengage-en-l5',
    task: 'Telegram: a re-engagement message to a gym owner who went quiet a month ago after asking about new treadmills (task w.reengage).',
    response: 'Hi Rustam, it’s Nigora from the fitness equipment showroom. Last month you mentioned the treadmills break down most in January, when new members arrive. Two of our clubs in Yunusabad switched to the commercial model before New Year, and the owner told us he had no breakdowns this season. If January is still the worry, I can bring one treadmill to your club for a week, free, so your trainers can test it with members. Would next Monday or Wednesday suit you?',
    reference: { personal: 5, value: 5, clarity: 5, next_step: 5, tone: 5 },
    rationale: 'Re-opens on the buyer’s own words and his seasonal worry, brings new and relevant proof from a similar club (stated as what the owner told them, not as a statistic), and offers a no-risk trial. Short, warm and easy to say yes to with a choice of two days.',
  },
];

const runs: Record<string, CalibrationRun[]> = {
  'm01-price-uz-l1': [
    run([1, 'Narxi 350 000 so‘m.'], [1, 'Narxi 350 000 so‘m'], [1.5, 'Narxi 350 000 so‘m. Olsangiz yozing.'], [1, 'Olsangiz yozing.'], [1.5, 'Olsangiz yozing']),
    run([1, 'Narxi 350 000 so‘m'], [1, 'Narxi 350 000 so‘m.'], [1.5, 'Olsangiz yozing'], [1, 'Olsangiz yozing'], [1.5, 'Olsangiz yozing.']),
    run([1, 'Olsangiz yozing'], [1, '350 000 so‘m'], [2, 'Narxi 350 000 so‘m'], [1, 'Olsangiz yozing.'], [1, 'Olsangiz yozing']),
  ],
  'm02-urgency-ru-l1': [
    run([1, 'Цена 2 400 000.'], [1.5, 'Это лучшая цена в городе'], [2, 'Здравствуйте. Цена 2 400 000.'], [1.5, 'Пишите быстрее, осталось мало!!!'], [1, 'только сегодня!', 'Пишите быстрее, осталось мало']),
    run([1, 'Здравствуйте. Цена 2 400 000'], [1.5, 'лучшая цена в городе'], [2, 'Цена 2 400 000'], [1.5, 'Пишите быстрее'], [1, 'Это лучшая цена в городе, только сегодня!']),
    run([1, 'Цена 2 400 000'], [1, 'Это лучшая цена в городе, только сегодня!'], [2, 'Цена 2 400 000.'], [1.5, 'Пишите быстрее, осталось мало'], [1, 'осталось мало']),
  ],
  'm03-checkin-en-l2': [
    run([1.5, 'Hi, just checking in.'], [1, 'Did you think about our offer?'], [3, 'Hi, just checking in. Did you think about our offer?'], [2, 'Let me know.'], [3, 'Let me know. Thanks.']),
    run([1.5, 'just checking in'], [1, 'Did you think about our offer'], [3, 'Did you think about our offer?'], [2, 'Let me know'], [3, 'Hi, just checking in.']),
    run([1.5, 'Did you think about our offer?'], [1, 'just checking in'], [3, 'Let me know. Thanks.'], [2, 'Did you think about our offer?'], [3, 'Thanks.']),
  ],
  'm04-wall-uz-l2': [
    run([1.5, 'biz ofislar, uylar, restoranlar, do‘konlar, omborlarni tozalaymiz'], [2, 'Bizning kompaniya 2015-yildan beri ishlaydi, bizda 40 dan ortiq xodim bor'], [1.5, 'gilam yuvamiz, deraza yuvamiz, ta’mirdan keyin tozalaymiz'], [2, 'Batafsil ma’lumot uchun qo‘ng‘iroq qiling.'], [2.5, 'narxlarimiz ham qulay, chegirmalar ham bor']),
    run([1.5, 'Bizning kompaniya 2015-yildan beri ishlaydi'], [2, 'hamma narsani professional uskunalar bilan qilamiz'], [1.5, 'biz ofislar, uylar, restoranlar, do‘konlar, omborlarni tozalaymiz, gilam yuvamiz'], [2, 'Batafsil ma’lumot uchun qo‘ng‘iroq qiling'], [2.5, 'Assalomu alaykum.']),
    run([1.5, 'ofislar, uylar, restoranlar'], [2, 'narxlarimiz ham qulay'], [1.5, 'dezinfeksiya qilamiz, hamma narsani professional uskunalar bilan qilamiz'], [2, 'qo‘ng‘iroq qiling'], [2, 'chegirmalar ham bor']),
  ],
  'm05-template-ru-l2plus': [
    run([1.5, 'я представляю IT-компанию'], [2, 'Наши решения помогают увеличить продажи и сократить расходы.'], [3, 'Мы разрабатываем программы для бизнеса: CRM, учёт, доставка, мобильные приложения.'], [3, 'Когда вам удобно созвониться?'], [3, 'Будем рады сотрудничеству!']),
    run([1.5, 'Мы разрабатываем программы для бизнеса'], [2, 'помогают увеличить продажи и сократить расходы'], [3, 'Добрый день! Меня зовут Бекзод, я представляю IT-компанию.'], [3, 'Когда вам удобно созвониться'], [3, 'Добрый день! Меня зовут Бекзод']),
    run([2, 'CRM, учёт, доставка, мобильные приложения'], [2, 'увеличить продажи'], [3, 'CRM, учёт, доставка'], [2.5, 'Когда вам удобно созвониться?'], [3, 'Будем рады сотрудничеству']),
  ],
  'm06-dress-en-l3': [
    run([3, 'This dress is 690,000 UZS'], [3, 'alterations of the length are free'], [3.5, 'We have it in sizes S, M and L, in green and burgundy.'], [3.5, 'Which size and colour would you like?'], [3.5, 'Hello!']),
    run([3, 'Which size and colour would you like?'], [3, 'and alterations of the length are free'], [3.5, 'This dress is 690,000 UZS, and alterations of the length are free.'], [3.5, 'Which size and colour would you like'], [3.5, 'Hello! This dress is 690,000 UZS']),
    run([3, 'We have it in sizes S, M and L'], [3.5, 'alterations of the length are free'], [3.5, 'in green and burgundy'], [3, 'Which size and colour would you like?'], [3.5, 'Which size and colour would you like?']),
  ],
  'm07-course-uz-l3': [
    run([3, 'Hozir maktabdamisiz yoki ishlayapsizmi?'], [3.5, 'Kurs oxirida portfolio uchun 3 ta loyiha qilasiz.'], [3.5, 'Frontend kursimiz 6 oy davom etadi, oyiga 900 000 so‘m.'], [3, 'Shunga qarab qulay guruhni tavsiya qilaman.'], [3.5, 'Assalomu alaykum!']),
    run([3, 'Shunga qarab qulay guruhni tavsiya qilaman'], [3.5, 'portfolio uchun 3 ta loyiha qilasiz'], [3.5, 'Darslar haftasiga 3 marta, kechki 18:00 dan.'], [3, 'Hozir maktabdamisiz yoki ishlayapsizmi?'], [3.5, 'Shunga qarab qulay guruhni tavsiya qilaman.']),
    run([3, 'maktabdamisiz yoki ishlayapsizmi'], [3, 'Frontend kursimiz 6 oy davom etadi'], [3.5, 'oyiga 900 000 so‘m'], [3, 'qulay guruhni tavsiya qilaman'], [3.5, 'Assalomu alaykum! Frontend kursimiz 6 oy davom etadi']),
  ],
  'm08-followup-ru-l3plus': [
    run([4, 'Добрый день, Гульнора! Спасибо за разговор во вторник.', 'для ваших 40 номеров'], [3.5, 'Отдельно приложил пример отчёта, который вы будете получать каждую неделю.'], [4, 'стирка постельного белья с доставкой через день — 6,8 млн сум в месяц'], [4, 'Удобно обсудить детали в четверг в 15:00 или в пятницу утром?'], [4, 'Как обещал, отправляю расчёт']),
    run([4, 'Спасибо за разговор во вторник'], [3.5, 'пример отчёта, который вы будете получать каждую неделю'], [4, 'Как обещал, отправляю расчёт для ваших 40 номеров'], [4, 'в четверг в 15:00 или в пятницу утром'], [4, 'Добрый день, Гульнора!']),
    run([4, 'отправляю расчёт для ваших 40 номеров'], [4, 'с доставкой через день — 6,8 млн сум в месяц'], [4, 'Отдельно приложил пример отчёта'], [4, 'Удобно обсудить детали в четверг в 15:00'], [4, 'Спасибо за разговор во вторник.']),
  ],
  'm09-recap-en-l4': [
    run([4, 'Your goal: fewer fuel losses and fewer calls to drivers asking where they are.'], [4, 'a two-week trial on 3 trucks first'], [4.5, 'A short summary so we are on the same page'], [4, 'I will install the 3 trial trackers on Monday at 9:00 at your depot, as agreed.', 'Could you confirm who will meet our technician?'], [4, 'Thanks for the meeting today.']),
    run([4, 'Hi Timur'], [4, 'trackers for all 25 trucks, a fuel-level sensor on the 8 long-haul ones'], [4.5, 'Open question: whether your accountant needs the fuel report in Excel or in 1C.'], [4, 'Next step: I will install the 3 trial trackers on Monday at 9:00'], [4, 'Best regards']),
    run([4, 'fewer calls to drivers asking where they are'], [4, 'Our proposal: trackers for all 25 trucks'], [4.5, 'A short summary so we are on the same page:'], [4.5, 'Could you confirm who will meet our technician?'], [4, 'Thanks for the meeting today']),
  ],
  'm10-complaint-uz-l4': [
    run([4.5, 'siz bu kunga mehmon kutayotgan edingiz'], [4, 'Yetkazib berish narxini (150 000 so‘m) sizga qaytaramiz'], [4, 'pulni bugun kartangizga o‘tkazamiz'], [4, 'Qaysi rang sizga yoqqanini yozib yuborsangiz, ertaga olib boramiz.'], [4.5, 'Kechikish uchun chin dildan uzr so‘raymiz']),
    run([4.5, 'Divan bilan birga dekorativ yostiqlarni ham ko‘rmoqchi edingiz'], [4, 'xohlasangiz, ularni bepul yetkazib beramiz'], [4, 'Yetkazib berish narxini (150 000 so‘m) sizga qaytaramiz, pulni bugun kartangizga o‘tkazamiz.'], [4, 'ertaga olib boramiz'], [4.5, 'Assalomu alaykum, Dilfuza opa.']),
    run([4.5, 'Assalomu alaykum, Dilfuza opa.'], [4, 'ularni bepul yetkazib beramiz'], [3.5, 'Kechikish uchun chin dildan uzr so‘raymiz'], [4, 'Qaysi rang sizga yoqqanini yozib yuborsangiz'], [4.5, 'bu juda noqulay bo‘lgani aniq']),
  ],
  'm11-counter-ru-l4plus': [
    run([4.5, 'Азиз, спасибо, что честно сказали о бюджете.'], [4.5, 'цена фиксируется на 12 месяцев, даже если масло подорожает, плюс бесплатная доставка в оба ваших филиала'], [4.5, 'Скидку 15% на годовой объём я дать не могу — это ниже нашей себестоимости.'], [4.5, 'Подходит такой вариант? Если да, я подготовлю договор к пятнице.'], [4.5, 'Для вас это защита от роста цен, для нас — предсказуемость.']),
    run([4.5, 'в оба ваших филиала'], [4.5, 'Для вас это защита от роста цен'], [4.5, 'Могу предложить другое'], [4.5, 'я подготовлю договор к пятнице'], [4.5, 'спасибо, что честно сказали о бюджете']),
    run([4.5, 'спасибо, что честно сказали о бюджете'], [4, 'если вы оплачиваете поставку за месяц вперёд, цена фиксируется на 12 месяцев'], [4.5, 'это ниже нашей себестоимости'], [4.5, 'Подходит такой вариант?'], [4.5, 'Скидку 15% на годовой объём я дать не могу']),
  ],
  'm12-reengage-en-l5': [
    run([5, 'Last month you mentioned the treadmills break down most in January, when new members arrive.'], [5, 'I can bring one treadmill to your club for a week, free, so your trainers can test it with members'], [5, 'If January is still the worry'], [5, 'Would next Monday or Wednesday suit you?'], [5, 'it’s Nigora from the fitness equipment showroom']),
    run([5, 'If January is still the worry'], [5, 'the owner told us he had no breakdowns this season'], [5, 'Hi Rustam, it’s Nigora from the fitness equipment showroom.'], [5, 'next Monday or Wednesday'], [5, 'Hi Rustam']),
    run([5, 'you mentioned the treadmills break down most in January'], [4.5, 'Two of our clubs in Yunusabad switched to the commercial model before New Year'], [5, 'Would next Monday or Wednesday suit you?'], [5, 'Would next Monday or Wednesday suit you'], [5, 'so your trainers can test it with members']),
  ],
};

export const messageCalibration: { samples: CalibrationSample[]; runs: Record<string, CalibrationRun[]> } = { samples, runs };
