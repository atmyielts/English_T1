import { T } from '../src/localize.ts';
import type { Activity, Localized } from '../src/types.ts';

// Written selling, scored on sales.message: DM replies, follow-ups, recaps, cold
// messages, counter-offers. The learner writes in their own language (or sends a
// photo of a draft). Shops, people and prices are invented for practice.

type Tri = { en: string; uz: string; ru: string };
const L = (en: string, uz: string, ru: string): Localized => ({ en, uz, ru });

interface Def { id: string; node: string; levels: [number, number]; minutes: number; title: Localized; prompt: Tri; minWords: number; notes: string }
const task = (def: Def): Activity => ({
  id: def.id, kind: 'writing', rubric: 'sales.message', node: def.node, levels: def.levels, minutes: def.minutes, title: def.title,
  prompt: T(def.prompt), minWords: def.minWords, recommendedMinutes: Math.max(5, def.minutes), assessorNotes: def.notes,
});

export const writing: Activity[] = [
  task({
    id: 'w.dm-price', node: 'dm', levels: [1, 4], minutes: 6, minWords: 20,
    title: L('Reply to "price?" on Instagram', 'Instagramda «narxi?»ga javob', 'Ответ на «цена?» в Instagram'),
    prompt: {
      en: 'You sell women’s winter coats through an Instagram shop in Tashkent. Under a post with a grey wool coat (520,000 UZS, sizes 42–50, delivery across Uzbekistan in 2–4 days, free exchange of size within 7 days — practice details), a woman writes: "price?". Write your DM reply.',
      uz: 'Siz Toshkentdagi Instagram do‘koni orqali ayollar qishki paltolarini sotasiz. Kulrang jun palto posti ostida (520 000 so‘m, 42–50 o‘lchamlar, O‘zbekiston bo‘ylab 2–4 kunda yetkazish, 7 kun ichida o‘lchamni bepul almashtirish — mashq uchun ma’lumotlar) bir ayol «narxi?» deb yozdi. DM javobingizni yozing.',
      ru: 'Вы продаёте женские зимние пальто через Instagram-магазин в Ташкенте. Под постом с серым шерстяным пальто (520 000 сумов, размеры 42–50, доставка по Узбекистану за 2–4 дня, бесплатный обмен размера в течение 7 дней — учебные данные) женщина пишет: «цена?». Напишите ответ в директ.',
    },
    notes: 'A strong reply gives the price at once, adds one or two of the real details (sizes, delivery time, free exchange), and ends with an easy question (size, city). It does not invent extras such as discounts or "only today". Two to five short lines is ideal.',
  }),
  task({
    id: 'w.followup-call', node: 'follow_up', levels: [1.5, 5], minutes: 8, minWords: 40,
    title: L('Telegram follow-up after a call', 'Qo‘ng‘iroqdan keyingi Telegram follow-up', 'Follow-up в Telegram после звонка'),
    prompt: {
      en: 'Yesterday you called Gulnora, the manager of a 40-room hotel in Samarkand, about your laundry service. She said bed linen sometimes comes back late before weekend groups, and asked for a monthly price. Your offer (practice figures): washing and ironing bed linen, collected and returned every other day, 6.8 million UZS a month for 40 rooms; a weekly report of items collected and returned. Write the Telegram follow-up.',
      uz: 'Kecha Samarqanddagi 40 xonali mehmonxona menejeri Gulnoraga kir yuvish xizmatingiz bo‘yicha qo‘ng‘iroq qildingiz. U dam olish kunlaridagi guruhlar oldidan choyshablar ba’zan kech qaytishini aytdi va oylik narxni so‘radi. Taklifingiz (mashq uchun raqamlar): choyshablarni yuvish va dazmollash, kunora olib ketib qaytarish, 40 xona uchun oyiga 6,8 million so‘m; olingan va qaytarilgan buyumlar bo‘yicha haftalik hisobot. Telegram follow-up yozing.',
      ru: 'Вчера вы звонили Гульноре, менеджеру отеля на 40 номеров в Самарканде, насчёт услуг прачечной. Она сказала, что бельё иногда возвращают поздно перед группами на выходные, и попросила месячную цену. Ваше предложение (учебные цифры): стирка и глажка постельного белья, забор и возврат через день, 6,8 млн сумов в месяц за 40 номеров; еженедельный отчёт о сданных и возвращённых вещах. Напишите follow-up в Telegram.',
    },
    notes: 'Strong: refers to the call and her concern (late linen before weekend groups), keeps the promise (the monthly figure), links the every-other-day schedule and the weekly report to that concern, and ends with a specific next step (a choice of times to discuss or a start date). Short paragraphs. No invented discounts or claims.',
  }),
  task({
    id: 'w.reengage', node: 'follow_up', levels: [2.5, 5], minutes: 8, minWords: 40,
    title: L('Re-engage a buyer who went quiet', 'Jim qolgan mijozni qayta jalb qilish', 'Вернуть клиента, который пропал'),
    prompt: {
      en: 'A month ago Rustam, who owns a gym in Tashkent, asked about commercial treadmills for his club, said his old ones break down most in January when new members come, and then stopped replying. You can lend one treadmill free for a week so his trainers can test it (a practice offer). Write a Telegram message to restart the conversation.',
      uz: 'Bir oy oldin Toshkentda sport zali egasi Rustam klubi uchun tijorat yugurish yo‘lakchalari haqida so‘ragan, eski yo‘lakchalari ko‘pincha yanvarda, yangi a’zolar kelganda buzilishini aytgan, keyin javob bermay qo‘ygan edi. Murabbiylari sinab ko‘rishi uchun bitta yo‘lakchani bir haftaga bepul berib turishingiz mumkin (mashq uchun taklif). Suhbatni qayta boshlash uchun Telegram xabarini yozing.',
      ru: 'Месяц назад Рустам, владелец спортзала в Ташкенте, спрашивал о коммерческих беговых дорожках, сказал, что старые чаще всего ломаются в январе, когда приходят новые клиенты, и пропал. Вы можете бесплатно дать одну дорожку на неделю, чтобы тренеры её проверили (учебное предложение). Напишите сообщение в Telegram, чтобы возобновить разговор.',
    },
    notes: 'Strong: opens with his own words (January breakdowns), gives a fresh, honest reason to reply (the free trial week), and ends with an easy choice. Weak: "Just checking in", guilt, fake deadlines, invented statistics or testimonials.',
  }),
  task({
    id: 'w.cold-b2b', node: 'prospecting.cold_call', levels: [2, 5], minutes: 8, minWords: 30,
    title: L('A first message to a B2B buyer', 'B2B xaridorga birinchi xabar', 'Первое сообщение B2B-клиенту'),
    prompt: {
      en: 'You sell a simple app that tracks courier deliveries for small businesses. You found the Telegram contact of the owner of a bakery chain with three shops in Tashkent; their page says they deliver cakes to order. Write the first message (no one has spoken to them before).',
      uz: 'Siz kichik bizneslar uchun kuryer yetkazishlarini kuzatadigan oddiy ilova sotasiz. Toshkentda uchta do‘koni bor novvoyxona tarmog‘i egasining Telegram kontaktini topdingiz; sahifasida buyurtma bo‘yicha tort yetkazishlari yozilgan. Birinchi xabarni yozing (ular bilan hali hech kim gaplashmagan).',
      ru: 'Вы продаёте простое приложение для отслеживания курьерских доставок для малого бизнеса. Вы нашли Telegram владельца сети из трёх пекарен в Ташкенте; на их странице написано, что они доставляют торты на заказ. Напишите первое сообщение (с ними ещё никто не говорил).',
    },
    notes: 'Strong: short, shows it was written for this bakery (three shops, cake deliveries), names a likely problem as a question rather than a claim, and asks for a small, easy reply. Weak: a generic company introduction, a list of products, a request for a long call from a stranger, or invented results.',
  }),
  task({
    id: 'w.send-info', node: 'objections.send_info', levels: [1.5, 5], minutes: 8, minWords: 40,
    title: L('After "send me information"', '«Ma’lumot yuboring»dan keyin', 'После «пришлите информацию»'),
    prompt: {
      en: 'On a call, Nodira, the office manager of a 60-person company, asked you to send information about your office cleaning. She mentioned only that the kitchen and meeting rooms get messy and that cleaners now come once a week. Your offer (practice details): cleaning every weekday evening, kitchen and meeting rooms twice a day, 9 million UZS a month; a free first week. Write the e-mail.',
      uz: 'Qo‘ng‘iroqda 60 kishilik kompaniyaning ofis menejeri Nodira ofis tozalash xizmatingiz haqida ma’lumot yuborishni so‘radi. U faqat oshxona va majlis xonalari tez ifloslanishini va hozir farroshlar haftada bir marta kelishini aytdi. Taklifingiz (mashq uchun ma’lumotlar): har ish kuni kechqurun tozalash, oshxona va majlis xonalari kuniga ikki marta, oyiga 9 million so‘m; birinchi hafta bepul. E-mail yozing.',
      ru: 'По телефону Нодира, офис-менеджер компании на 60 человек, попросила прислать информацию о вашей уборке офисов. Она сказала лишь, что кухня и переговорные быстро грязнятся и что сейчас уборщики приходят раз в неделю. Ваше предложение (учебные данные): уборка каждый будний вечер, кухня и переговорные дважды в день, 9 млн сумов в месяц; первая неделя бесплатно. Напишите письмо.',
    },
    notes: 'Strong: short and tailored to what she said (kitchen, meeting rooms, once a week), only the relevant offer, the free first week as an easy step, and a proposed time to talk or start. Weak: a full company brochure in one block, every service listed, "call us for details".',
  }),
  task({
    id: 'w.recap', node: 'closing', levels: [2.5, 5], minutes: 10, minWords: 60,
    title: L('Recap after a meeting, with the next step', 'Uchrashuvdan keyingi xulosa va keyingi qadam', 'Резюме встречи со следующим шагом'),
    prompt: {
      en: 'You met Timur, operations manager of a logistics company with 25 trucks, about GPS trackers. Agreed in the meeting: his goals are fewer fuel losses and fewer calls to drivers; your proposal is trackers on all 25 trucks and fuel sensors on the 8 long-haul trucks; first a free two-week trial on 3 trucks, installed Monday at 9:00 at his depot. Open question: whether his accountant needs reports in Excel or 1C. Write the recap e-mail.',
      uz: '25 ta yuk mashinasi bor logistika kompaniyasining operatsion menejeri Timur bilan GPS-trekerlar bo‘yicha uchrashdingiz. Uchrashuvda kelishildi: uning maqsadlari — yoqilg‘i yo‘qotishini va haydovchilarga qo‘ng‘iroqlarni kamaytirish; taklifingiz — 25 ta mashinaning hammasiga treker va 8 ta uzoq qatnovli mashinaga yoqilg‘i datchigi; avval 3 ta mashinada ikki haftalik bepul sinov, dushanba soat 9:00 da omborida o‘rnatiladi. Ochiq savol: buxgalteriga hisobot Excelda kerakmi yoki 1C da. Xulosa e-mailini yozing.',
      ru: 'Вы встретились с Тимуром, операционным менеджером логистической компании с 25 грузовиками, по поводу GPS-трекеров. На встрече договорились: его цели — меньше потерь топлива и меньше звонков водителям; ваше предложение — трекеры на все 25 машин и датчики топлива на 8 машин дальних рейсов; сначала бесплатный двухнедельный тест на 3 машинах, установка в понедельник в 9:00 на его базе. Открытый вопрос: нужны ли бухгалтеру отчёты в Excel или в 1С. Напишите письмо-резюме.',
    },
    notes: 'Strong: thanks briefly, lists his goals in his terms, the proposal, the open question and the confirmed next step (date, time, place), and asks one small thing (who will meet the technician). Easy to scan (short lines or bullets). No new promises that were not agreed.',
  }),
  task({
    id: 'w.counter-offer', node: 'negotiation', levels: [3, 5], minutes: 10, minWords: 50,
    title: L('A counter-offer in writing', 'Yozma qarshi taklif', 'Встречное предложение письменно'),
    prompt: {
      en: 'Aziz, who owns two restaurants, asked for 15% off a year’s supply of cooking oil. You cannot go below your cost, but you can (practice terms): fix the price for 12 months if he pays each month in advance, and deliver free to both restaurants. Write your Telegram reply.',
      uz: 'Ikki restoran egasi Aziz bir yillik o‘simlik yog‘i yetkazib berishga 15% chegirma so‘radi. Siz tannarxdan pastga tusha olmaysiz, lekin (mashq uchun shartlar): har oy oldindan to‘lasa, narxni 12 oyga qotirib, ikkala restoranga bepul yetkazib bera olasiz. Telegramdagi javobingizni yozing.',
      ru: 'Азиз, владелец двух ресторанов, попросил скидку 15% на годовую поставку масла. Ниже себестоимости вы не можете, но можете (учебные условия): зафиксировать цену на 12 месяцев при ежемесячной предоплате и бесплатно возить в оба ресторана. Напишите ответ в Telegram.',
    },
    notes: 'Strong: thanks him, refuses the 15% respectfully with a short reason, offers the traded terms as a benefit for both sides, and ends with a clear yes/no question and a next step (a contract by a date). Weak: an apologetic "sorry, can\'t" with nothing else, a lower discount given for nothing, or pressure.',
  }),
  task({
    id: 'w.complaint', node: 'dm', levels: [2.5, 5], minutes: 10, minWords: 40,
    title: L('Turn a complaint into trust (and a sale)', 'Shikoyatni ishonchga (va savdoga) aylantirish', 'Превратить жалобу в доверие (и продажу)'),
    prompt: {
      en: 'Dilfuza bought a sofa from your furniture shop for guests arriving on Saturday; it arrived on Monday. She writes on Instagram that she wants compensation. You can (practice terms): refund the 150,000 UZS delivery fee today, and deliver the matching cushions she had looked at free of charge if she orders them. Write your DM reply.',
      uz: 'Dilfuza shanba kuni keladigan mehmonlar uchun mebel do‘koningizdan divan sotib oldi; u dushanba kuni keldi. U Instagramda kompensatsiya talab qilib yozdi. Siz (mashq uchun shartlar): 150 000 so‘mlik yetkazish to‘lovini bugun qaytara olasiz va u ko‘rgan mos yostiqlarni buyurtma qilsa bepul yetkazib bera olasiz. DM javobingizni yozing.',
      ru: 'Дильфуза купила в вашем магазине диван к приезду гостей в субботу; его привезли в понедельник. Она пишет в Instagram, что хочет компенсацию. Вы можете (учебные условия): сегодня вернуть 150 000 сумов за доставку и бесплатно привезти подходящие подушки, которые она смотрела, если она их закажет. Напишите ответ в директ.',
    },
    notes: 'Strong: a sincere apology that names her situation (the guests), no excuses, the concrete fix with a time, and only then a gentle, honest mention of the cushions with an easy next step. Weak: blaming the courier, a generic apology, or selling before fixing.',
  }),
  task({
    id: 'w.dm-course', node: 'dm', levels: [1, 4], minutes: 6, minWords: 25,
    title: L('A teenager asks about a coding course', 'O‘smir dasturlash kursi haqida so‘rayapti', 'Подросток спрашивает о курсе программирования'),
    prompt: {
      en: 'A 17-year-old writes to your programming school on Telegram: "how much is frontend and how long?". Practice details: 6 months, 900,000 UZS a month, three evening classes a week, students build three projects for a portfolio, a free trial lesson every Saturday at 11. Write your reply.',
      uz: '17 yoshli yigit dasturlash maktabingizga Telegramda yozdi: «frontend necha pul va qancha davom etadi?». Mashq uchun ma’lumotlar: 6 oy, oyiga 900 000 so‘m, haftasiga uch marta kechki dars, o‘quvchilar portfolio uchun uchta loyiha qiladi, har shanba soat 11 da bepul sinov darsi. Javobingizni yozing.',
      ru: '17-летний парень пишет вашей школе программирования в Telegram: «сколько стоит frontend и сколько длится?». Учебные данные: 6 месяцев, 900 000 сумов в месяц, три вечерних занятия в неделю, ученики делают три проекта для портфолио, бесплатный пробный урок каждую субботу в 11. Напишите ответ.',
    },
    notes: 'Strong: answers price and length first, one line on the outcome (portfolio projects), a friendly question about his goal or school, and an easy invitation to the Saturday trial. Suitable tone for a teenager; parents can be mentioned for payment. No pressure.',
  }),
  task({
    id: 'w.dm-tour', node: 'dm', levels: [2, 5], minutes: 8, minWords: 30,
    title: L('"Send me all your tours": ask first', '«Barcha turlaringizni yuboring»: avval so‘rang', '«Пришлите все туры»: сначала спросите'),
    prompt: {
      en: 'A father of two writes to your travel agency on Instagram: "send me all your summer tours for a family". You have many options. Write the reply that gets you what you need to offer the right two.',
      uz: 'Ikki farzandli ota turagentligingizga Instagramda yozdi: «oilaviy yozgi turlaringizni hammasini yuboring». Variantlaringiz ko‘p. To‘g‘ri ikkita variantni taklif qilish uchun kerakli ma’lumotni oladigan javob yozing.',
      ru: 'Отец двоих детей пишет вашему турагентству в Instagram: «скиньте все летние туры для семьи». Вариантов много. Напишите ответ, который даст вам нужное, чтобы предложить два подходящих.',
    },
    notes: 'Strong: agrees warmly, asks two or three short questions (dates, children\'s ages, budget range or what matters, such as a pool or a short transfer), and promises two tailored options by a time. Weak: a list of every tour, a long questionnaire, or ignoring the request.',
  }),
];
