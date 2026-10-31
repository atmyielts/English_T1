import type { ScriptBuilder } from '../src/types.ts';

// The script builder: three answers about the learner's own product become a call
// script, an objection map, closing lines, a DM version and a follow-up, saved and
// practised with the own-product role-play (rp.own-product).

export const scriptBuilder: ScriptBuilder = {
  questions: [
    {
      id: 'product',
      prompt: {
        en: 'What do you sell, and what is your offer? Say what is included, the price or price range, and any guarantee or trial you really give.',
        uz: 'Nima sotasiz va taklifingiz qanday? Nima kirishini, narx yoki narx oralig‘ini va haqiqatan beradigan kafolat yoki sinovni ayting.',
        ru: 'Что вы продаёте и какое у вас предложение? Что входит, цена или диапазон цен и какие гарантия или проба реально есть.',
      },
      example: {
        en: 'Home water filters with installation, 1.9–3.5 million UZS; free filter change in the first year; a 14-day money-back trial.',
        uz: 'O‘rnatish bilan uy suv filtrlari, 1,9–3,5 million so‘m; birinchi yili filtrni bepul almashtirish; 14 kunlik pulni qaytarish sinovi.',
        ru: 'Бытовые фильтры для воды с установкой, 1,9–3,5 млн сумов; бесплатная замена картриджа в первый год; 14 дней на возврат денег.',
      },
      maxChars: 800,
    },
    {
      id: 'buyers',
      prompt: {
        en: 'Who buys it, and where do you find them? Who makes the decision, and what do they care about most?',
        uz: 'Kim sotib oladi va ularni qayerdan topasiz? Qarorni kim qabul qiladi va ular uchun eng muhimi nima?',
        ru: 'Кто покупает и где вы их находите? Кто принимает решение и что для них важнее всего?',
      },
      example: {
        en: 'Families in new apartment blocks in Tashkent, found through Instagram ads and building chats. Usually the wife chooses, the husband pays. They care about children’s health and the taste of tea.',
        uz: 'Toshkentdagi yangi uylarda yashovchi oilalar, Instagram reklamasi va uy chatlari orqali topiladi. Odatda xotin tanlaydi, er to‘laydi. Ular uchun bolalar salomatligi va choy ta’mi muhim.',
        ru: 'Семьи в новостройках Ташкента, находим через рекламу в Instagram и чаты домов. Обычно выбирает жена, платит муж. Им важны здоровье детей и вкус чая.',
      },
      maxChars: 800,
    },
    {
      id: 'objections',
      prompt: {
        en: 'What do buyers usually say to say no, and who are your competitors? Add anything about price you often hear.',
        uz: 'Mijozlar odatda «yo‘q» deyish uchun nima deydi va raqobatchilaringiz kim? Narx haqida tez-tez eshitadigan gaplaringizni ham qo‘shing.',
        ru: 'Что клиенты обычно говорят, отказываясь, и кто ваши конкуренты? Добавьте, что часто слышите о цене.',
      },
      example: {
        en: '"We buy bottled water", "too expensive", "I need to ask my husband", "the market sells filters for 600,000". Competitors: bottled water delivery and cheap filters at the bazaar.',
        uz: '«Biz baklashka suv olamiz», «qimmat», «erim bilan maslahatlashishim kerak», «bozorda filtr 600 ming». Raqobatchilar: suv yetkazib berish va bozordagi arzon filtrlar.',
        ru: '«Мы покупаем воду в бутылях», «дорого», «надо спросить мужа», «на рынке фильтр за 600 тысяч». Конкуренты: доставка воды и дешёвые фильтры на базаре.',
      },
      maxChars: 800,
    },
  ],
  objectionTypes: [
    { id: 'price', name: { en: 'Price', uz: 'Narx', ru: 'Цена' } },
    { id: 'think', name: { en: '"I’ll think about it"', uz: '«O‘ylab ko‘raman»', ru: '«Я подумаю»' } },
    { id: 'competitor', name: { en: 'A competitor', uz: 'Raqobatchi', ru: 'Конкурент' } },
    { id: 'no_budget', name: { en: 'No budget', uz: 'Byudjet yo‘q', ru: 'Нет бюджета' } },
    { id: 'send_info', name: { en: '"Send me info"', uz: '«Ma’lumot yuboring»', ru: '«Пришлите информацию»' } },
    { id: 'no_need', name: { en: '"We don’t need it"', uz: '«Bizga kerak emas»', ru: '«Нам не нужно»' } },
    { id: 'timing', name: { en: '"Not now"', uz: '«Hozir emas»', ru: '«Не сейчас»' } },
    { id: 'authority', name: { en: '"I have to ask…"', uz: '«…dan so‘rashim kerak»', ru: '«Мне нужно спросить…»' } },
  ],
  roleplay: 'rp.own-product',
  instructions: [
    'Build a practical, ethical call script for selling in Uzbekistan, from the learner\'s own answers only.',
    '- opening: a 15–20 second phone opening: who the seller is, why this buyer (a reason that matters to them), and a permission question. Polite forms (siz, Вы) and natural greetings for the language.',
    '- discovery: 5–8 open questions in a sensible order: situation, problem, its cost, what they have tried, timing, who decides, budget range asked tactfully.',
    '- pitch: a short value pitch built around the buyer\'s likely problem, outcomes before features, one honest proof the learner actually offers, ending with a checking question.',
    '- objections: for each objection the learner mentioned (and the most likely others for this buyer), a response that acknowledges, asks a question to find the real concern, then answers with value or a fair option; never argue, never criticise a competitor, never discount for nothing — trade concessions.',
    '- closes and next_steps: natural ways to ask for the order or a concrete next step with a day and time, including the decision maker.',
    '- dm: a short Telegram/Instagram reply to a "price?" message: the price as the learner gave it, one line of value, an easy question.',
    '- follow_up: a follow-up message for the day after a call that brings something useful and proposes a time.',
    '- buyer: who the buyer is, their likely pains, who decides and the budget as the learner described them; buyer_opening is how that buyer answers a cold call.',
    '- Keep the learner\'s product, prices and terms exactly as given. If something the script needs is missing (a price, a guarantee, delivery time), write a [placeholder] and list it in watch_outs. Never invent results, statistics, awards, customer names or legal claims.',
  ].join('\n'),
  maxScripts: 10,
};
