import { T } from '../src/localize.ts';
import type { Diagnostic, DiagnosticItem } from '../src/types.ts';

// A seven-minute, auto-scored placement for selling: "best move" questions from L1 to
// L5 across the skill tree, and can-do statements about real selling situations. No
// AI. It gives a starting level; the first scored calls refine it.

type Tri = { en: string; uz: string; ru: string };
const t = (en: string, uz: string, ru: string): Tri => ({ en, uz, ru });
const q = (id: string, skill: string, level: number, prompt: Tri, options: Tri[], answer: number): DiagnosticItem => ({ id, skill, level, kind: 'question', prompt: T(prompt), options: options.map((option) => T(option)), answer });
const can = (id: string, skill: string, level: number, en: string, uz: string, ru: string): DiagnosticItem => ({ id, skill, level, kind: 'can_do', prompt: { en, uz, ru } });

export const diagnostic: Diagnostic = {
  intro: {
    en: 'A quick level check: about 7 minutes, 24 questions about real selling moments and what you already do. No AI, nothing recorded — just tap your answers. You get a starting level from L1 to L5; your first scored calls make it more precise.',
    uz: 'Darajani tez aniqlash: taxminan 7 daqiqa, haqiqiy savdo vaziyatlari va siz allaqachon qilayotgan ishlar haqida 24 ta savol. AI ishlatilmaydi, hech narsa yozib olinmaydi — shunchaki javoblarni tanlang. L1 dan L5 gacha boshlang‘ich darajani olasiz; birinchi baholangan qo‘ng‘iroqlaringiz uni aniqlashtiradi.',
    ru: 'Быстрая проверка уровня: около 7 минут, 24 вопроса о реальных ситуациях продаж и о том, что вы уже делаете. Без ИИ и без записи — просто выбирайте ответы. Вы получите стартовый уровень от L1 до L5; первые оценённые звонки его уточнят.',
  },
  minutes: 7,
  passRatio: 0.6,
  items: [
    // Level 1–2: the basics.
    q('o1', 'prospecting.cold_call', 1, t('A cold call. What should the first sentence do?', 'Sovuq qo‘ng‘iroq. Birinchi gap nima qilishi kerak?', 'Холодный звонок. Что должна сделать первая фраза?'), [
      t('Say who you are and why you are calling this person', 'Kimligingizni va nega aynan unga qo‘ng‘iroq qilayotganingizni aytish', 'Сказать, кто вы и почему звоните именно ему'),
      t('List all your products', 'Barcha mahsulotlarni sanab o‘tish', 'Перечислить все продукты'),
      t('Give the price', 'Narxni aytish', 'Назвать цену'),
    ], 0),
    q('d1', 'discovery', 1, t('Which is an open question?', 'Qaysi biri ochiq savol?', 'Какой вопрос открытый?'), [
      t('Do you need delivery?', 'Yetkazib berish kerakmi?', 'Вам нужна доставка?'),
      t('How do you get your stock now?', 'Hozir tovarni qanday olasiz?', 'Как вы сейчас получаете товар?'),
      t('Is the price OK?', 'Narx to‘g‘ri keladimi?', 'Цена устраивает?'),
    ], 1),
    q('p1', 'objections.price', 1, t('The buyer says “Too expensive”. Your first move?', 'Mijoz «Qimmat» deydi. Birinchi qadamingiz?', 'Клиент говорит «Дорого». Ваш первый ход?'), [
      t('Give a discount at once', 'Darhol chegirma berish', 'Сразу дать скидку'),
      t('Ask what they compare it with', 'Nima bilan solishtirayotganini so‘rash', 'Спросить, с чем сравнивают'),
      t('Say it is not expensive', 'Qimmat emas deyish', 'Сказать, что это не дорого'),
    ], 1),
    q('c1', 'closing', 1, t('The buyer liked everything. How do you end?', 'Mijozga hammasi yoqdi. Qanday yakunlaysiz?', 'Клиенту всё понравилось. Как закончить?'), [
      t('“Call me if you need anything.”', '«Kerak bo‘lsa qo‘ng‘iroq qiling.»', '«Звоните, если что-то нужно».'),
      t('Ask for the order or a concrete next step', 'Buyurtmani yoki aniq keyingi qadamni so‘rash', 'Попросить заказ или конкретный следующий шаг'),
      t('Wait for them to offer', 'Ular taklif qilishini kutish', 'Ждать, пока предложат сами'),
    ], 1),
    q('m1', 'dm', 1, t('Someone writes “price?” in Instagram. Best reply?', 'Instagramda kimdir «narxi?» deb yozdi. Eng yaxshi javob?', 'В Instagram пишут «цена?». Лучший ответ?'), [
      t('Only the number', 'Faqat raqam', 'Только цифра'),
      t('The price, one benefit and a question', 'Narx, bitta foyda va savol', 'Цена, одна выгода и вопрос'),
      t('“Price in DM”', '«Narxi direktda»', '«Цена в директе»'),
    ], 1),
    // Level 2.
    q('t2', 'objections.think', 2, t('“I’ll think about it.” Best reply?', '«O‘ylab ko‘raman.» Eng yaxshi javob?', '«Я подумаю». Лучший ответ?'), [
      t('“OK, think about it.”', '«Mayli, o‘ylab ko‘ring.»', '«Хорошо, подумайте».'),
      t('“What exactly would you like to think over?”', '«Aynan nimani o‘ylab ko‘rmoqchisiz?»', '«Что именно хотите обдумать?»'),
      t('“The offer ends today.”', '«Taklif bugun tugaydi.»', '«Предложение заканчивается сегодня».'),
    ], 1),
    q('v2', 'value', 2, t('Which is a benefit, not a feature?', 'Qaysi biri xususiyat emas, foyda?', 'Что из этого — выгода, а не характеристика?'), [
      t('“Delivery before 9, so your kitchen doesn’t have to wait.”', '«Soat 9 gacha yetkazamiz — oshxonangiz kutib qolmaydi.»', '«Доставка до 9 — вашей кухне не придётся ждать».'),
      t('“We have 40 trucks.”', '«Bizda 40 ta yuk mashinasi bor.»', '«У нас 40 грузовиков».'),
      t('“Our warehouse is 5,000 m².”', '«Omborimiz maydoni 5 000 m².»', '«Наш склад — 5 000 м²».'),
    ], 0),
    q('s2', 'shop_floor', 2, t('A customer enters your shop. Best opening?', 'Mijoz do‘koningizga kirdi. Eng yaxshi boshlanish?', 'Покупатель заходит в магазин. Лучшее начало?'), [
      t('“Can I help you?”', '«Yordam bera olamanmi?»', '«Чем могу помочь?»'),
      t('“Looking for something for yourself or a gift?”', '«O‘zingiz uchunmi yoki sovg‘a qidiryapsizmi?»', '«Ищете что-то для себя или подарок?»'),
      t('Say nothing until they ask', 'Ular so‘ramaguncha jim turish', 'Молчать, пока не спросят'),
    ], 1),
    q('f2', 'follow_up', 2, t('When do you send a summary after a meeting?', 'Uchrashuvdan keyin xulosani qachon yuborasiz?', 'Когда отправить резюме после встречи?'), [
      t('The same day', 'O‘sha kuni', 'В тот же день'),
      t('In a week', 'Bir haftadan keyin', 'Через неделю'),
      t('Only if asked', 'Faqat so‘ralsa', 'Только если попросят'),
    ], 0),
    // Level 3.
    q('k3', 'objections.competitor', 3, t('“We already work with another company.” Best reply?', '«Biz boshqa kompaniya bilan ishlaymiz.» Eng yaxshi javob?', '«Мы уже работаем с другой компанией». Лучший ответ?'), [
      t('“They are expensive and slow.”', '«Ular qimmat va sekin.»', '«Они дорогие и медленные».'),
      t('“What do you like about them, and what would you improve?”', '«Ularning nimasi yoqadi va nimani yaxshilagan bo‘lardingiz?»', '«Что вам в них нравится и что бы вы улучшили?»'),
      t('“Then sorry to bother you.”', '«Unda bezovta qilganim uchun uzr.»', '«Тогда извините за беспокойство».'),
    ], 1),
    q('q3', 'prospecting.qualifying', 3, t('Which matters most to know early in a B2B deal?', 'B2B kelishuvda erta bilish uchun eng muhimi qaysi?', 'Что важнее всего узнать в начале B2B-сделки?'), [
      t('Who else takes part in the decision', 'Qarorda yana kim ishtirok etishi', 'Кто ещё участвует в решении'),
      t('Their office address', 'Ofis manzili', 'Адрес их офиса'),
      t('Their favourite colour', 'Sevimli rangi', 'Их любимый цвет'),
    ], 0),
    q('b3', 'objections.budget', 3, t('“No budget this year.” Most useful question?', '«Bu yil byudjet yo‘q.» Eng foydali savol?', '«В этом году нет бюджета». Самый полезный вопрос?'), [
      t('“Can you borrow?”', '«Qarz ola olasizmi?»', '«Можете занять?»'),
      t('“When is next year’s budget planned, and who decides?”', '«Keyingi yil byudjeti qachon rejalashtiriladi va kim qaror qiladi?»', '«Когда планируют бюджет на следующий год и кто решает?»'),
      t('“Why not?”', '«Nega yo‘q?»', '«Почему нет?»'),
    ], 1),
    q('i3', 'objections.send_info', 3, t('“Send me some information.” Best move?', '«Ma’lumot yuboring.» Eng yaxshi qadam?', '«Пришлите информацию». Лучший ход?'), [
      t('Send the catalogue and wait', 'Katalogni yuborib, kutish', 'Отправить каталог и ждать'),
      t('Agree, ask two questions, and set a time to discuss', 'Rozi bo‘lish, ikki savol berish va muhokama vaqtini belgilash', 'Согласиться, задать два вопроса и назначить время обсуждения'),
      t('Refuse to send anything', 'Hech narsa yubormaslik', 'Отказаться что-либо отправлять'),
    ], 1),
    // Level 4.
    q('d4', 'discovery', 4, t('After discovery, what do you do before you pitch?', 'Ehtiyojni aniqlagach, taqdimotdan oldin nima qilasiz?', 'Что сделать после выявления потребностей, перед презентацией?'), [
      t('Summarise their need and check you got it right', 'Ehtiyojini xulosa qilib, to‘g‘ri tushunganingizni tekshirish', 'Подытожить потребность и проверить, что поняли верно'),
      t('Start with the company history', 'Kompaniya tarixidan boshlash', 'Начать с истории компании'),
      t('Ask for the order', 'Buyurtma so‘rash', 'Попросить заказ'),
    ], 0),
    q('n4', 'negotiation', 4, t('Which sentence trades a concession well?', 'Qaysi jumlada yon berish evaziga to‘g‘ri shart qo‘yilgan?', 'В какой фразе уступка грамотно дана в обмен?'), [
      t('“OK, 10% off.”', '«Mayli, 10% chegirma.»', '«Ладно, минус 10%».'),
      t('“If you sign for a year and prepay, I can fix the price.”', '«Agar bir yillik shartnoma imzolab, oldindan to‘lasangiz, narxni o‘zgarmas qilib qo‘yaman.»', '«Если подпишете на год с предоплатой, зафиксирую цену».'),
      t('“Let’s split the difference.”', '«O‘rtasini olaylik.»', '«Давайте разделим разницу пополам».'),
    ], 1),
    q('e4', 'closing', 4, t('Which is honest urgency?', 'Qaysi biri halol shoshilinchlik?', 'Что из этого — честная срочность?'), [
      t('“Only today!” (not true)', '«Faqat bugun!» (haqiqat emas)', '«Только сегодня!» (неправда)'),
      t('A true fact linked to their own deadline', 'Ularning o‘z muddatiga bog‘liq haqiqiy fakt', 'Правдивый факт, связанный с их собственным сроком'),
      t('“Everyone is buying it.”', '«Hamma sotib olyapti.»', '«Все покупают».'),
    ], 1),
    // Level 5.
    q('n5', 'negotiation', 5, t('A buyer anchors at 30% off; your floor is 15%. First move?', 'Mijoz 30% chegirmadan boshladi; pastki chegarangiz 15%. Birinchi qadam?', 'Клиент начинает с 30% скидки; ваша граница — 15%. Первый ход?'), [
      t('Offer 22% to meet halfway', 'O‘rtasi deb 22% taklif qilish', 'Предложить 22%, «посередине»'),
      t('Ask what matters to them besides price', 'Narxdan tashqari ularga nima muhimligini so‘rash', 'Спросить, что для них важно кроме цены'),
      t('Accept, to keep the client', 'Mijozni saqlab qolish uchun rozi bo‘lish', 'Согласиться, чтобы удержать клиента'),
    ], 1),
    q('x5', 'objections', 5, t('The buyer raises three objections at once. Best approach?', 'Mijoz bir vaqtda uchta e’tiroz bildirdi. Eng yaxshi yondashuv?', 'Клиент выдвинул три возражения сразу. Лучший подход?'), [
      t('Answer all three in one long speech', 'Uchalasiga bitta uzun nutqda javob berish', 'Ответить на все три одной длинной речью'),
      t('Acknowledge, ask which matters most, and take them one at a time', 'Tushunganingizni bildirish, qaysi biri eng muhimligini so‘rash va ularni bittadan hal qilish', 'Признать, спросить, что важнее, и разбирать по одному'),
      t('Ignore them and push for the close', 'E’tibor bermasdan, bitim uchun bosim o‘tkazish', 'Игнорировать и давить на закрытие'),
    ], 1),
    // Can-do: the learner's own practice.
    can('cd1', 'prospecting.cold_call', 2, 'I can make a cold call and keep the buyer talking past the first 30 seconds.', 'Sovuq qo‘ng‘iroq qilib, mijozni birinchi 30 soniyadan keyin ham suhbatda ushlab tura olaman.', 'Я могу сделать холодный звонок и удержать клиента дольше первых 30 секунд.'),
    can('cd2', 'discovery', 3, 'In a sales conversation I ask more questions than I make statements.', 'Savdo suhbatida fikr bildirganimdan ko‘ra ko‘proq savol beraman.', 'В продающем разговоре я задаю больше вопросов, чем утверждаю.'),
    can('cd3', 'objections', 3, 'When a buyer objects, I stay calm and find the real reason before I answer.', 'Mijoz e’tiroz bildirsa, xotirjam qolaman va javob berishdan oldin asl sababni topaman.', 'Когда клиент возражает, я сохраняю спокойствие и нахожу настоящую причину, прежде чем ответить.'),
    can('cd4', 'closing', 3, 'I end most conversations with a concrete next step and a date.', 'Suhbatlarning ko‘pchiligini aniq keyingi qadam va sana bilan yakunlayman.', 'Большинство разговоров я заканчиваю конкретным следующим шагом и датой.'),
    can('cd5', 'negotiation', 4, 'I negotiate without giving discounts for nothing in return.', 'Muzokarada evaziga hech narsa olmasdan chegirma bermayman.', 'Я веду переговоры, не давая скидок без встречной уступки.'),
    can('cd6', 'value', 5, 'I can lead a complex B2B sale with several decision makers from first call to signed contract.', 'Bir nechta qaror qabul qiluvchi shaxs ishtirokidagi murakkab B2B savdoni birinchi qo‘ng‘iroqdan imzolangan shartnomagacha olib bora olaman.', 'Я могу провести сложную B2B-сделку с несколькими ЛПР от первого звонка до подписанного договора.'),
  ],
};
