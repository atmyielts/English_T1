import { T } from '../src/localize.ts';
import type { Sample } from '../src/types.ts';

// Static examples for people who have not started yet, clearly labelled as examples.
// They follow a fictional learner, Javohir, a junior sales rep at a food supplier
// (L2+, target L3.5). Practice text (his words, the better lines) exists in all three
// languages, so each person reads the example in theirs.

export const samples: Sample[] = [
  {
    id: 'sample.review-cold-call',
    kind: 'roleplay_review',
    title: {
      en: 'Example: call review — a cold call to a family restaurant',
      uz: 'Namuna: qo‘ng‘iroq tahlili — oilaviy restoranga sovuq qo‘ng‘iroq',
      ru: 'Пример: разбор звонка — холодный звонок в семейный ресторан',
    },
    preview: {
      en: 'An example review for a fictional learner, Javohir, after a cold call to a restaurant manager who said "send me your price list". Overall L2+. He met 2 of 4 goals: a clear opening and good questions, but he accepted "send me the price list" without a next step. Scorecard: he spoke 58% of the words, asked 4 questions. Fix next: turn "send info" into a question and a dated sample delivery.',
      uz: 'Uydirma o‘quvchi Javohir uchun namunaviy tahlil: u «narxlar ro‘yxatini yuboring» degan restoran menejeriga sovuq qo‘ng‘iroq qildi. Umumiy daraja L2+. 4 ta maqsaddan 2 tasiga erishdi: aniq boshlanish va yaxshi savollar, lekin «narxlarni yuboring»ni keyingi qadamsiz qabul qildi. Natija kartasi: so‘zlarning 58% ini u aytdi, 4 ta savol berdi. Keyingi qadam: «ma’lumot yuboring»ni savolga va sanasi belgilangan namunaviy yetkazishga aylantirish.',
      ru: 'Пример разбора для вымышленного ученика Жавохира после холодного звонка менеджеру ресторана, которая сказала «пришлите прайс». Общий уровень L2+. Выполнено 2 цели из 4: чёткое начало и хорошие вопросы, но «пришлите прайс» он принял без следующего шага. Карта: его доля слов 58%, задал 4 вопроса. Что исправить: превращать «пришлите информацию» в вопрос и пробную поставку с датой.',
    },
    body: {
      scenario: T({
        en: 'Cold call: a family restaurant in Samarkand; the manager asks for a price list on Telegram (example).',
        uz: 'Sovuq qo‘ng‘iroq: Samarqanddagi oilaviy restoran; menejer Telegramga narxlar ro‘yxatini so‘raydi (namuna).',
        ru: 'Холодный звонок: семейный ресторан в Самарканде; менеджер просит прайс в Telegram (пример).',
      }),
      goals: [
        {
          text: { en: 'Open well: who you are, why this buyer, a question', uz: 'Yaxshi boshlang: kimsiz, nega aynan shu mijoz, savol', ru: 'Хорошо начните: кто вы, почему этот клиент, вопрос' },
          met: true,
          quote: T({ en: 'This is Javohir from a food supplier, we work with cafés in Samarkand. Do you have two minutes?', uz: 'Men Javohir, oziq-ovqat yetkazib beruvchidanman, Samarqanddagi kafelar bilan ishlaymiz. Ikki daqiqa vaqtingiz bormi?', ru: 'Это Жавохир из компании-поставщика, мы работаем с кафе в Самарканде. У вас есть две минуты?' }),
        },
        {
          text: { en: 'Handle "send me your price list" with a question', uz: '«Narxlar ro‘yxatini yuboring»ga savol bilan javob bering', ru: 'Ответьте на «пришлите прайс» вопросом' },
          met: false,
          quote: null,
        },
        {
          text: { en: 'Ask open questions to find the real need', uz: 'Haqiqiy ehtiyojni ochiq savollar bilan aniqlang', ru: 'Выясните настоящую потребность открытыми вопросами' },
          met: true,
          quote: T({ en: 'How do the fries hold up on your busiest nights?', uz: 'Eng gavjum kechalarda kartoshkangiz qanday bo‘ladi?', ru: 'Как ведёт себя картофель фри в самые загруженные вечера?' }),
        },
        {
          text: { en: 'Agree a sample delivery with a day', uz: 'Kun bilan namunaviy yetkazib berishni kelishing', ru: 'Договоритесь о пробной поставке с конкретным днём' },
          met: false,
          quote: null,
        },
      ],
      criteria: [
        { id: 'opening', score: 3, evidence: [T({ en: 'we work with cafés in Samarkand. Do you have two minutes?', uz: 'Samarqanddagi kafelar bilan ishlaymiz. Ikki daqiqa vaqtingiz bormi?', ru: 'мы работаем с кафе в Самарканде. У вас есть две минуты?' })], note: { en: 'Clear and polite with a permission question; the reason for this restaurant could be sharper.', uz: 'Aniq va xushmuomala, ruxsat so‘raydigan savol bor; aynan shu restoran uchun sabab aniqroq bo‘lishi mumkin edi.', ru: 'Чётко и вежливо, есть вопрос-разрешение; причина именно для этого ресторана могла быть острее.' } },
        { id: 'discovery', score: 3, evidence: [T({ en: 'How do the fries hold up on your busiest nights?', uz: 'Eng gavjum kechalarda kartoshkangiz qanday bo‘ladi?', ru: 'Как ведёт себя картофель фри в самые загруженные вечера?' })], note: { en: 'A good open question that found the soggy-fries problem, but no follow-up on how often it happens.', uz: 'Yaxshi ochiq savol, «yumshab qolgan kartoshka» muammosini topdi, lekin qanchalik tez-tez bo‘lishi so‘ralmadi.', ru: 'Хороший открытый вопрос, нашёл проблему размокающего картофеля, но без уточнения, как часто это бывает.' } },
        { id: 'value', score: 2.5, evidence: [T({ en: 'We have frozen fries, oil, sauces, everything.', uz: 'Bizda muzlatilgan kartoshka, yog‘, souslar, hammasi bor.', ru: 'У нас есть замороженный фри, масло, соусы, всё есть.' })], note: { en: 'A list of products; the crisp fries were never linked to her problem.', uz: 'Mahsulotlar ro‘yxati; qarsillagan kartoshka uning muammosi bilan bog‘lanmadi.', ru: 'Список продуктов; хрустящий фри так и не связан с её проблемой.' } },
        { id: 'objections', score: 2, evidence: [T({ en: 'OK, I will send the price list on Telegram.', uz: 'Mayli, narxlar ro‘yxatini Telegramga yuboraman.', ru: 'Хорошо, я пришлю прайс в Telegram.' })], note: { en: 'Accepted "send me the price list" straight away instead of asking what she needs.', uz: '«Narxlarni yuboring»ni ehtiyojini so‘ramasdan darhol qabul qildi.', ru: 'Сразу принял «пришлите прайс», не спросив, что ей нужно.' } },
        { id: 'closing', score: 2, evidence: [T({ en: 'Write to me if you are interested.', uz: 'Qiziqsangiz, menga yozing.', ru: 'Пишите, если будет интересно.' })], note: { en: 'No next step: the decision is left to her.', uz: 'Keyingi qadam yo‘q: qaror unga qoldirildi.', ru: 'Нет следующего шага: решение оставлено ей.' } },
      ],
      scorecard: { talkRatio: 58, questionsAsked: 4, averageTurnWords: 19 },
      betterLines: [
        {
          said: T({ en: 'OK, I will send the price list on Telegram.', uz: 'Mayli, narxlar ro‘yxatini Telegramga yuboraman.', ru: 'Хорошо, я пришлю прайс в Telegram.' }),
          better: T({ en: 'Of course. So I send what is useful: which matters more to you right now — the fries on busy nights or the oil price?', uz: 'Albatta. Foydali narsani yuborishim uchun: hozir siz uchun qaysi biri muhimroq — gavjum kechalardagi kartoshkami yoki yog‘ narximi?', ru: 'Конечно. Чтобы прислать полезное: что для вас сейчас важнее — фри в загруженные вечера или цена масла?' }),
          why: { en: 'Agree, then ask, so the conversation keeps going.', uz: 'Rozi bo‘ling, keyin so‘rang — suhbat davom etadi.', ru: 'Согласитесь и спросите — разговор продолжится.' },
        },
        {
          said: T({ en: 'We have frozen fries, oil, sauces, everything.', uz: 'Bizda muzlatilgan kartoshka, yog‘, souslar, hammasi bor.', ru: 'У нас есть замороженный фри, масло, соусы, всё есть.' }),
          better: T({ en: 'You said the fries go soft on Friday nights — let’s send you two boxes of our thicker cut for this weekend, free, and you judge.', uz: 'Juma kechalari kartoshka yumshab qoladi dedingiz — shu dam olish kunlari uchun qalinroq kesilgan kartoshkamizdan ikki qutini bepul yuboraylik, o‘zingiz baho bering.', ru: 'Вы сказали, что по пятницам фри размокает, — давайте пришлём на эти выходные две коробки нашего толстого реза бесплатно, оцените сами.' }),
          why: { en: 'Tie the offer to her problem and make the next step easy (a practice offer in this example).', uz: 'Taklifni uning muammosiga bog‘lang va keyingi qadamni osonlashtiring (bu namunada mashq uchun taklif).', ru: 'Свяжите предложение с её проблемой и упростите шаг (в примере — учебное предложение).' },
        },
      ],
    },
  },
  {
    id: 'sample.week',
    kind: 'weekly_report',
    title: { en: 'Example: a weekly sales report', uz: 'Namuna: haftalik savdo hisoboti', ru: 'Пример: недельный отчёт по продажам' },
    preview: {
      en: 'An example week for Javohir: 6 active days, 74 minutes, 7 scored calls. His call level went from L2+ to L3, he now asks 6 questions per call instead of 3, and his share of the words fell from 64% to 49%. Focus next week: next steps with a date, and price objections without a quick discount.',
      uz: 'Javohir uchun namunaviy hafta: 6 faol kun, 74 daqiqa, 7 ta baholangan qo‘ng‘iroq. Qo‘ng‘iroq darajasi L2+ dan L3 ga ko‘tarildi, endi har qo‘ng‘iroqda 3 o‘rniga 6 ta savol beradi, so‘zlardagi ulushi 64% dan 49% ga tushdi. Keyingi hafta: sanasi bilan keyingi qadam va tez chegirmasiz narx e’tirozlari.',
      ru: 'Пример недели Жавохира: 6 активных дней, 74 минуты, 7 оценённых звонков. Уровень звонков вырос с L2+ до L3, вопросов за звонок теперь 6 вместо 3, доля его слов снизилась с 64% до 49%. Фокус на неделю: следующий шаг с датой и возражение о цене без быстрой скидки.',
    },
    body: {
      rows: [
        { label: { en: 'Sales conversation level', uz: 'Savdo suhbati darajasi', ru: 'Уровень продающего разговора' }, before: 2.5, after: 3 },
        { label: { en: 'Questions asked per call', uz: 'Har qo‘ng‘iroqdagi savollar', ru: 'Вопросов за звонок' }, before: 3, after: 6 },
        { label: { en: 'Your share of the words', uz: 'So‘zlardagi ulushingiz', ru: 'Ваша доля слов' }, before: 64, after: 49, unit: '%', lowerIsBetter: true },
        { label: { en: 'Calls with a dated next step', uz: 'Sanasi belgilangan keyingi qadamli qo‘ng‘iroqlar', ru: 'Звонков с датированным шагом' }, before: 1, after: 4 },
        { label: { en: 'Objection drills right', uz: 'To‘g‘ri yechilgan e’tiroz mashqlari', ru: 'Верных ответов в тренажёре' }, before: 61, after: 82, unit: '%' },
        { label: { en: 'Fillers per 100 words', uz: '100 so‘zga to‘ldiruvchilar', ru: 'Слов-паразитов на 100 слов' }, before: 7, after: 4, lowerIsBetter: true },
      ],
      minutes: 74,
      streak: 6,
      focus: [
        { en: 'End every call with one concrete step and a date (“Thursday at 11?”).', uz: 'Har qo‘ng‘iroqni bitta aniq qadam va sana bilan yakunlang («Payshanba soat 11 dami?»).', ru: 'Заканчивайте каждый звонок одним конкретным шагом и датой («В четверг в 11?»).' },
        { en: 'On “too expensive”, ask “compared with what?” before anything else.', uz: '«Qimmat» deyishsa, hammasidan oldin «nimaga nisbatan?» deb so‘rang.', ru: 'На «дорого» сначала спрашивайте «по сравнению с чем?».' },
      ],
    },
  },
  {
    id: 'sample.plan',
    kind: 'plan',
    title: { en: 'Example: a first week of the 90-day sales plan', uz: 'Namuna: 90 kunlik savdo rejasining birinchi haftasi', ru: 'Пример: первая неделя 90-дневного плана продаж' },
    preview: {
      en: 'An example plan for Javohir (L2+, target L3.5, 15 minutes a day): openings and discovery first, one objection type a day, a written follow-up twice a week, and the Friday tough-buyer call.',
      uz: 'Javohir uchun namunaviy reja (L2+, maqsad L3.5, kuniga 15 daqiqa): avval boshlanish va ehtiyojni aniqlash, kuniga bitta e’tiroz turi, haftasiga ikki marta yozma follow-up va jumadagi qiyin mijoz bilan qo‘ng‘iroq.',
      ru: 'Пример плана Жавохира (L2+, цель L3.5, 15 минут в день): сначала начало звонка и выявление, по одному типу возражений в день, письменный follow-up дважды в неделю и пятничный звонок сложному клиенту.',
    },
    body: {
      target: 3.5,
      weeks: 12,
      days: [
        { day: { en: 'Monday', uz: 'Dushanba', ru: 'Понедельник' }, tasks: [{ en: 'Lesson: the 20-second opening', uz: 'Dars: 20 soniyalik boshlanish', ru: 'Урок: начало за 20 секунд' }, { en: 'Call: a family pharmacy', uz: 'Qo‘ng‘iroq: oilaviy dorixona', ru: 'Звонок: семейная аптека' }] },
        { day: { en: 'Tuesday', uz: 'Seshanba', ru: 'Вторник' }, tasks: [{ en: 'Drill: open questions', uz: 'Mashq: ochiq savollar', ru: 'Тренажёр: открытые вопросы' }, { en: 'Call: a startup founder looking for space', uz: 'Qo‘ng‘iroq: joy qidirayotgan startap asoschisi', ru: 'Звонок: основательница стартапа ищет офис' }] },
        { day: { en: 'Wednesday', uz: 'Chorshanba', ru: 'Среда' }, tasks: [{ en: 'Writing: reply to "price?" on Instagram', uz: 'Yozma: Instagramda «narxi?»ga javob', ru: 'Письмо: ответ на «цена?» в Instagram' }, { en: 'Drill: "too expensive"', uz: 'Mashq: «qimmat»', ru: 'Тренажёр: «дорого»' }] },
        { day: { en: 'Thursday', uz: 'Payshanba', ru: 'Четверг' }, tasks: [{ en: 'Call: "I’ll think about it" at a fitness club', uz: 'Qo‘ng‘iroq: fitnes klubda «o‘ylab ko‘raman»', ru: 'Звонок: «я подумаю» в фитнес-клубе' }] },
        { day: { en: 'Friday', uz: 'Juma', ru: 'Пятница' }, tasks: [{ en: 'Tough buyer: three objections in one call', uz: 'Qiyin mijoz: bitta qo‘ng‘iroqda uchta e’tiroz', ru: 'Сложный клиент: три возражения за звонок' }] },
        { day: { en: 'Saturday', uz: 'Shanba', ru: 'Суббота' }, tasks: [{ en: 'Writing: follow-up after a call', uz: 'Yozma: qo‘ng‘iroqdan keyingi follow-up', ru: 'Письмо: follow-up после звонка' }, { en: 'Drill: closing and next steps', uz: 'Mashq: yakun va keyingi qadam', ru: 'Тренажёр: закрытие и следующий шаг' }] },
      ],
    },
  },
  {
    id: 'sample.dm-report',
    kind: 'writing_report',
    title: { en: 'Example: feedback on an Instagram reply', uz: 'Namuna: Instagram javobi bo‘yicha fikr', ru: 'Пример: разбор ответа в Instagram' },
    preview: {
      en: 'An example for Javohir’s colleague Sabina, who answered "price?" under a coat post with "520 000. Write if you want." Overall L1+. The better version gives the price, two real details and a question about the size.',
      uz: 'Javohirning hamkasbi Sabina uchun namuna: u palto posti ostidagi «narxi?»ga «520 000. Xohlasangiz yozing» deb javob berdi. Umumiy daraja L1+. Yaxshiroq varianti narx, ikkita haqiqiy tafsilot va o‘lcham haqidagi savolni beradi.',
      ru: 'Пример для коллеги Жавохира — Сабины, которая ответила на «цена?» под постом с пальто: «520 000. Пишите, если хотите». Общий уровень L1+. Лучший вариант даёт цену, две реальные детали и вопрос о размере.',
    },
    body: {
      task: T({ en: 'Instagram DM: reply to "price?" under a post with a grey wool coat (example).', uz: 'Instagram DM: kulrang jun palto posti ostidagi «narxi?»ga javob (namuna).', ru: 'Instagram: ответ на «цена?» под постом с серым шерстяным пальто (пример).' }),
      overall: 1.5,
      criteria: [
        { id: 'personal', score: 1, evidence: [T({ en: 'Write if you want', uz: 'Xohlasangiz yozing', ru: 'Пишите, если хотите' })], note: { en: 'Nothing for this buyer: no size, colour or city.', uz: 'Shu mijoz uchun hech narsa yo‘q: o‘lcham, rang yoki shahar yo‘q.', ru: 'Ничего для этого клиента: ни размера, ни цвета, ни города.' } },
        { id: 'value', score: 1, evidence: [T({ en: '520 000', uz: '520 000', ru: '520 000' })], note: { en: 'A bare number; the free size exchange and delivery time were not mentioned.', uz: 'Faqat raqam; o‘lchamni bepul almashtirish va yetkazish muddati aytilmadi.', ru: 'Голая цифра; бесплатный обмен размера и срок доставки не упомянуты.' } },
        { id: 'clarity', score: 2.5, evidence: [T({ en: '520 000. Write if you want.', uz: '520 000. Xohlasangiz yozing.', ru: '520 000. Пишите, если хотите.' })], note: { en: 'Clear, but too short to be useful.', uz: 'Aniq, lekin foydali bo‘lishi uchun juda qisqa.', ru: 'Понятно, но слишком коротко, чтобы быть полезным.' } },
        { id: 'next_step', score: 1, evidence: [T({ en: 'Write if you want', uz: 'Xohlasangiz yozing', ru: 'Пишите, если хотите' })], note: { en: 'The next step is left to the buyer.', uz: 'Keyingi qadam mijozga qoldirilgan.', ru: 'Следующий шаг оставлен клиенту.' } },
        { id: 'tone', score: 2, evidence: [T({ en: 'Write if you want.', uz: 'Xohlasangiz yozing.', ru: 'Пишите, если хотите.' })], note: { en: 'Not rude, but cold for a first contact.', uz: 'Qo‘pol emas, lekin birinchi aloqa uchun sovuq.', ru: 'Не грубо, но холодно для первого контакта.' } },
      ],
      corrections: [
        {
          original: T({ en: '520 000. Write if you want.', uz: '520 000. Xohlasangiz yozing.', ru: '520 000. Пишите, если хотите.' }),
          corrected: T({ en: 'Hello! 520,000 UZS, sizes 42–50, delivery in 2–4 days and a free size exchange within 7 days. Which size do you wear?', uz: 'Salom! 520 000 so‘m, 42–50 o‘lchamlar, 2–4 kunda yetkazish va 7 kun ichida o‘lchamni bepul almashtirish. Qaysi o‘lcham kiyasiz?', ru: 'Здравствуйте! 520 000 сумов, размеры 42–50, доставка за 2–4 дня и бесплатный обмен размера в течение 7 дней. Какой размер вы носите?' }),
          tag: 'price_only_reply',
          why: { en: 'Price, real value and an easy question keep the conversation going.', uz: 'Narx, haqiqiy qiymat va oson savol suhbatni davom ettiradi.', ru: 'Цена, реальная ценность и лёгкий вопрос продолжают разговор.' },
        },
      ],
    },
  },
];
