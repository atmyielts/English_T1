import { T } from '../src/localize.ts';
import type { Activity, DrillItem, Localized } from '../src/types.ts';

// Rapid-fire drills: a buyer's line, three or four possible replies, the best one
// chosen in seconds. One drill per recurring error (and one per objection type), in
// the learner's own language. The explanation says why the best reply works.

type Tri = { en: string; uz: string; ru: string };
const t = (en: string, uz: string, ru: string): Tri => ({ en, uz, ru });
const L = (en: string, uz: string, ru: string): Localized => ({ en, uz, ru });
const item = (id: string, prompt: Tri, options: Tri[], answer: number, explanation: Localized): DrillItem => ({ id, prompt: T(prompt), options: options.map((option) => T(option)), answer, explanation });
const BEST = t('Which reply is best?', 'Qaysi javob eng yaxshi?', 'Какой ответ лучше?');
const say = (en: string, uz: string, ru: string) => t(`Buyer: “${en}” — ${BEST.en}`, `Mijoz: «${uz}» — ${BEST.uz}`, `Клиент: «${ru}» — ${BEST.ru}`);

export const drills: Activity[] = [
  {
    id: 'drill.opening', kind: 'drill', errorTag: 'weak_opening', node: 'prospecting.cold_call', levels: [1, 5], minutes: 4, aiVariants: true,
    title: L('Openings that earn ten more seconds', 'Yana o‘n soniya qozonadigan boshlanishlar', 'Начало, которое даёт ещё десять секунд'),
    explain: L('A good opening has three parts: who you are, why this person (a reason that matters to them), and a short question or a request for a moment. Shop floor and DMs work the same way: a specific, friendly first move, not "Can I help you?".', 'Yaxshi boshlanish uch qismdan iborat: kimsiz, nega aynan shu odam (unga muhim sabab) va qisqa savol yoki bir daqiqa so‘rash. Do‘kon va DM ham xuddi shunday: «Yordam bera olamanmi?» emas, aniq va iliq birinchi qadam.', 'Хорошее начало из трёх частей: кто вы, почему именно этот человек (важная для него причина) и короткий вопрос или просьба о минуте. В зале и в директе так же: конкретный дружелюбный первый шаг, а не «Чем могу помочь?».'),
    items: [
      item('op1', t('A cold call to a café owner. Which opening is best?', 'Kafe egasiga sovuq qo‘ng‘iroq. Qaysi boshlanish eng yaxshi?', 'Холодный звонок владельцу кафе. Какое начало лучше?'), [
        t('Hello, we are the best supplier in Tashkent, we have many products.', 'Assalomu alaykum, biz Toshkentdagi eng yaxshi yetkazib beruvchimiz, mahsulotlarimiz ko‘p.', 'Здравствуйте, мы лучший поставщик в Ташкенте, у нас много продуктов.'),
        t('Hello, this is Aziz from a food supplier. I work with cafés nearby and have one quick question about your fries — do you have a minute?', 'Assalomu alaykum, men Aziz, oziq-ovqat yetkazib beruvchi kompaniyadanman. Yaqin atrofdagi kafelar bilan ishlayman, kartoshkangiz bo‘yicha bitta tez savolim bor — bir daqiqa vaqtingiz bormi?', 'Здравствуйте, это Азиз из компании-поставщика. Работаю с кафе рядом с вами, есть один быстрый вопрос про ваш картофель фри — есть минута?'),
        t('Hello, do you want to buy fries?', 'Assalomu alaykum, kartoshka sotib olasizmi?', 'Здравствуйте, хотите купить картофель фри?'),
      ], 1, L('It says who and why this café, and asks for one minute. The others are a boast or a yes/no sales question.', 'Unda kim ekaningiz va nega aynan shu kafega qo‘ng‘iroq qilayotganingiz aytilgan, bir daqiqa ham so‘ralgan. Qolganlari maqtanish yoki ha/yo‘q savolidir.', 'Здесь сказано, кто вы и почему звоните именно в это кафе, и есть просьба о минуте. Остальные — хвастовство или вопрос «да/нет».')),
      item('op2', say('I’m busy.', 'Bandman.', 'Я занят.'), [
        t('OK, sorry, bye.', 'Mayli, kechirasiz, xayr.', 'Хорошо, извините, до свидания.'),
        t('It will take only ten minutes, please listen.', 'Faqat o‘n daqiqa, iltimos, eshiting.', 'Это займёт всего десять минут, послушайте, пожалуйста.'),
        t('I understand. Is it better if I call back at four, or shall I ask my one question in thirty seconds?', 'Tushunaman. Soat to‘rtda qayta qo‘ng‘iroq qilaymi yoki bitta savolimni o‘ttiz soniyada berib qo‘yaymi?', 'Понимаю. Мне перезвонить в четыре или задать один вопрос прямо сейчас, за тридцать секунд?'),
      ], 2, L('Respect the time and give a choice: a better time or thirty seconds. Giving up or pushing both lose the call.', 'Vaqtni hurmat qiling va tanlov bering: qulayroq vaqt yoki o‘ttiz soniya. Taslim bo‘lish ham, bosim ham qo‘ng‘iroqni yo‘qotadi.', 'Уважайте время и дайте выбор: другое время или тридцать секунд. И сдаться, и давить — значит потерять звонок.')),
      item('op3', t('A customer walks into your phone shop and looks at the display. What do you say?', 'Mijoz telefon do‘koningizga kirib, vitrinani ko‘ryapti. Nima deysiz?', 'Покупатель заходит в ваш магазин телефонов и смотрит на витрину. Что вы скажете?'), [
        t('Can I help you?', 'Yordam bera olamanmi?', 'Чем могу помочь?'),
        t('Good afternoon! Are you looking for a new phone or something for the one you have?', 'Xayrli kun! Yangi telefon qidiryapsizmi yoki hozirgi telefoningizga biror narsa kerakmi?', 'Добрый день! Ищете новый телефон или что-то для своего?'),
        t('This one is our best model, it is on sale today.', 'Bu bizning eng yaxshi modelimiz, bugun chegirmada.', 'Это наша лучшая модель, сегодня со скидкой.'),
      ], 1, L('A friendly, specific question is easy to answer. "Can I help you?" invites "No, just looking", and pushing a model comes too early.', 'Iliq, aniq savolga javob berish oson. «Yordam bera olamanmi?» «Yo‘q, shunchaki ko‘ryapman» javobini chaqiradi, modelni taklif qilish esa juda erta.', 'На дружелюбный конкретный вопрос легко ответить. «Чем могу помочь?» вызывает «Просто смотрю», а навязывать модель слишком рано.')),
      item('op4', t('You call a director who was recommended to you. Which opening is best?', 'Sizga tavsiya qilingan direktorga qo‘ng‘iroq qilyapsiz. Qaysi boshlanish eng yaxshi?', 'Вы звоните директору, которого вам порекомендовали. Какое начало лучше?'), [
        t('Hello, Bekzod aka. Dilnoza from the hotel next door suggested I call you about staff uniforms. Is now a good moment for two minutes?', 'Assalomu alaykum, Bekzod aka. Qo‘shni mehmonxonadagi Dilnoza xodimlar formasi bo‘yicha sizga qo‘ng‘iroq qilishni maslahat berdi. Hozir ikki daqiqaga vaqtingiz bormi?', 'Здравствуйте, Бекзод-ака. Дильноза из соседнего отеля посоветовала позвонить вам насчёт формы для персонала. Вам удобно сейчас уделить две минуты?'),
        t('Hello, I sell uniforms, do you need any?', 'Assalomu alaykum, forma sotaman, kerakmi?', 'Здравствуйте, я продаю форму, вам нужно?'),
        t('Hello, our company was founded in 2010 and has many clients…', 'Assalomu alaykum, kompaniyamiz 2010-yilda tashkil topgan va mijozlarimiz ko‘p…', 'Здравствуйте, наша компания основана в 2010 году, у нас много клиентов…'),
      ], 0, L('A referral is the strongest reason for the call: name it, say the topic and ask for time.', 'Tavsiya — qo‘ng‘iroq uchun eng kuchli sabab: kim tavsiya qilganini va mavzuni ayting, keyin vaqt so‘rang.', 'Рекомендация — самый сильный повод для звонка: скажите, кто вас рекомендовал, назовите тему и попросите время.')),
      item('op5', say('Who gave you my number?', 'Raqamimni kim berdi?', 'Кто дал вам мой номер?'), [
        t('It doesn’t matter. Listen, I have a great offer.', 'Muhim emas. Eshiting, ajoyib taklifim bor.', 'Неважно. Послушайте, у меня отличное предложение.'),
        t('Your number is on your shop’s Instagram page. I’m calling because we deliver to shops in your area — may I ask one question?', 'Raqamingiz do‘koningizning Instagram sahifasida bor. Hududingizdagi do‘konlarga mahsulot yetkazib beramiz, shuning uchun qo‘ng‘iroq qildim — bitta savol bersam maylimi?', 'Ваш номер есть на странице магазина в Instagram. Звоню, потому что мы возим товар в магазины вашего района, — можно один вопрос?'),
        t('Sorry, I will not call again.', 'Kechirasiz, boshqa qo‘ng‘iroq qilmayman.', 'Извините, больше не позвоню.'),
      ], 1, L('Answer honestly and calmly, then give the reason for the call. Hiding the source destroys trust.', 'Halol va xotirjam javob bering, keyin qo‘ng‘iroq sababini ayting. Manbani yashirish ishonchni yo‘qotadi.', 'Ответьте честно и спокойно, затем назовите причину звонка. Скрывать источник — терять доверие.')),
      item('op6', t('A first Telegram message to a bakery owner. Which is best?', 'Novvoyxona egasiga Telegramdagi birinchi xabar. Qaysi biri eng yaxshi?', 'Первое сообщение в Telegram владельцу пекарни. Какое лучше?'), [
        t('Good afternoon! We make apps for business: CRM, delivery, accounting. Let’s work together!', 'Xayrli kun! Biz biznes uchun ilovalar qilamiz: CRM, yetkazib berish, hisob. Hamkorlik qilaylik!', 'Добрый день! Делаем приложения для бизнеса: CRM, доставка, учёт. Давайте сотрудничать!'),
        t('Hi! I saw you opened a third bakery — congratulations. Many bakeries your size lose orders on the phone at rush hour. Is that an issue for you?', 'Assalomu alaykum! Uchinchi novvoyxonangizni ochganingizni ko‘rdim — tabriklayman. Siz kabi novvoyxonalar ko‘pincha gavjum soatda telefondagi buyurtmalarni yo‘qotadi. Sizda ham shunday bo‘ladimi?', 'Здравствуйте! Вижу, вы открыли третью пекарню, — поздравляю. Пекарни вашего размера часто теряют заказы по телефону в час пик. У вас такое бывает?'),
        t('Hello, can you call me back?', 'Salom, menga qo‘ng‘iroq qila olasizmi?', 'Здравствуйте, можете мне перезвонить?'),
      ], 1, L('It shows you looked at their business, names a likely problem and asks a question they can answer in one line.', 'Bu ularning biznesiga qaraganingizni ko‘rsatadi, ehtimoliy muammoni aytadi va bir qatorda javob beriladigan savol beradi.', 'Видно, что вы изучили их бизнес; названа вероятная проблема и задан вопрос, на который легко ответить.')),
      item('op7', t('Your opening ran long and the buyer sighs. What now?', 'Boshlanishingiz cho‘zilib ketdi va mijoz xo‘rsindi. Endi nima qilasiz?', 'Вы затянули начало, клиент вздыхает. Что теперь?'), [
        t('Keep going — there is a lot to tell.', 'Davom eting — aytadigan narsa ko‘p.', 'Продолжать — рассказать нужно много.'),
        t('Stop and ask: “Sorry, I’m talking too much. What matters most to you in a supplier?”', 'To‘xtab so‘rang: «Kechirasiz, ko‘p gapirib yubordim. Yetkazib beruvchida siz uchun eng muhimi nima?»', 'Остановиться и спросить: «Простите, я слишком много говорю. Что для вас главное в поставщике?»'),
        t('Ask: “Are you listening?”', 'So‘rang: «Eshityapsizmi?»', 'Спросить: «Вы меня слушаете?»'),
      ], 1, L('Notice the signal and hand the conversation back with a question about them.', 'Ishorani sezing va suhbatni ular haqidagi savol bilan qaytaring.', 'Заметьте сигнал и верните разговор клиенту вопросом о нём.')),
      item('op8', t('You call a shop at 6 p.m. on a Saturday, their busiest time. Best move?', 'Shanba kuni soat 18:00 da, eng gavjum paytda do‘konga qo‘ng‘iroq qilyapsiz. Eng yaxshi qadam?', 'Вы звоните в магазин в субботу в 18:00, в самый загруженный час. Лучший ход?'), [
        t('Ask: “Is this a bad time? I can call on Monday morning instead.”', 'So‘rang: «Hozir noqulay paytmi? Dushanba ertalab qo‘ng‘iroq qilsam ham bo‘ladi.»', 'Спросить: «Неудобно сейчас? Могу позвонить в понедельник утром».'),
        t('Talk fast to finish quickly.', 'Tezroq tugatish uchun tez gapiring.', 'Говорить быстро, чтобы успеть.'),
        t('Start the full presentation.', 'To‘liq taqdimotni boshlang.', 'Начать полную презентацию.'),
      ], 0, L('Timing is part of the opening. Offering a better time shows respect and gets you a real conversation later.', 'Vaqt ham boshlanishning bir qismi. Qulayroq vaqtni taklif qilish hurmatni ko‘rsatadi va keyinroq haqiqiy suhbatga yo‘l ochadi.', 'Время — часть начала. Предложить другое время — значит проявить уважение и получить настоящий разговор позже.')),
    ],
  },
  {
    id: 'drill.discovery', kind: 'drill', errorTag: 'closed_questions', node: 'discovery', levels: [1, 5], minutes: 4, aiVariants: true,
    title: L('Open questions and who decides', 'Ochiq savollar va kim qaror qiladi', 'Открытые вопросы и кто решает'),
    explain: L('Open questions start with what, how, why or "tell me about". They let the buyer explain, and the need, budget and decision maker come out. Closed questions (do you, is it, are you) are for checking a detail at the end.', 'Ochiq savollar «nima», «qanday», «nega» yoki «… haqida gapirib bering» bilan boshlanadi. Ular mijozga tushuntirishga imkon beradi va ehtiyoj, byudjet va qaror qiluvchi aniqlanadi. Yopiq savollar («…mi?») oxirida tafsilotni tekshirish uchun.', 'Открытые вопросы начинаются с «что», «как», «почему» или «расскажите». Они дают клиенту объяснить, и раскрываются потребность, бюджет и тот, кто решает. Закрытые («вам нужно…?») — чтобы уточнить деталь в конце.'),
    items: [
      item('dq1', t('Which question tells you most about a café’s needs?', 'Qaysi savol kafe ehtiyojlari haqida eng ko‘p ma’lumot beradi?', 'Какой вопрос больше всего расскажет о потребностях кафе?'), [
        t('Do you need sauces?', 'Sizga sous kerakmi?', 'Вам нужны соусы?'),
        t('How do you choose your suppliers now, and what would you change?', 'Hozir yetkazib beruvchilarni qanday tanlaysiz va nimani o‘zgartirgan bo‘lardingiz?', 'Как вы сейчас выбираете поставщиков и что хотели бы изменить?'),
        t('Is your supplier good?', 'Yetkazib beruvchingiz yaxshimi?', 'Ваш поставщик хороший?'),
      ], 1, L('It is open and asks about their process and what they would change: the real need comes out.', 'U ochiq va ularning jarayoni hamda nimani o‘zgartirishlari haqida so‘raydi: haqiqiy ehtiyoj ma’lum bo‘ladi.', 'Вопрос открытый и касается их процесса и желаемых изменений — так раскрывается реальная потребность.')),
      item('dq2', t('Turn the closed question into an open one: “Do you have problems with delivery?”', 'Yopiq savolni ochiqqa aylantiring: «Yetkazib berishda muammolaringiz bormi?»', 'Сделайте закрытый вопрос открытым: «У вас есть проблемы с доставкой?»'), [
        t('Do you have big problems with delivery?', 'Yetkazib berishda katta muammolaringiz bormi?', 'У вас большие проблемы с доставкой?'),
        t('Delivery is fine, right?', 'Yetkazib berish yaxshi, shundaymi?', 'С доставкой всё нормально, да?'),
        t('How does delivery work for you now, and what goes wrong most often?', 'Hozir yetkazib berish qanday yo‘lga qo‘yilgan va ko‘pincha qanday muammo chiqadi?', 'Как у вас сейчас устроена доставка и что чаще всего идёт не так?'),
      ], 2, L('"How" and "what" invite a story; the other two can be answered with yes or no.', '«Qanday» va «nima» hikoyaga undaydi; qolgan ikkitasiga «ha» yoki «yo‘q» deb javob berish mumkin.', '«Как» и «что» приглашают рассказать; на остальные можно ответить «да» или «нет».')),
      item('dq3', t('The buyer says: “We lose some orders.” Best follow-up?', 'Mijoz: «Ba’zi buyurtmalarni yo‘qotamiz» dedi. Eng yaxshi davomi?', 'Клиент: «Мы теряем часть заказов». Лучший следующий вопрос?'), [
        t('Our system will fix that.', 'Bizning tizim buni tuzatadi.', 'Наша система это исправит.'),
        t('How many, roughly, in a normal week — and what happens to those customers?', 'Oddiy haftada taxminan nechta — va o‘sha mijozlar bilan nima bo‘ladi?', 'Сколько примерно за обычную неделю — и что происходит с этими клиентами?'),
        t('OK. Next question: do you have a website?', 'Yaxshi. Keyingi savol: saytingiz bormi?', 'Понятно. Следующий вопрос: у вас есть сайт?'),
      ], 1, L('Dig into the most important answer: size and cost of the problem. Jumping to the pitch or the next checklist item wastes it.', 'Eng muhim javobni chuqurroq o‘rganing: muammoning hajmi va zarari. Darhol taqdimotga yoki ro‘yxatdagi keyingi savolga o‘tish uni boy beradi.', 'Углубитесь в самый важный ответ: масштаб и цена проблемы. Если сразу перейти к презентации или к следующему пункту списка, вы его упустите.')),
      item('dq4', t('How do you find out who else decides, politely?', 'Yana kim qaror qilishini qanday odob bilan bilib olasiz?', 'Как вежливо узнать, кто ещё принимает решение?'), [
        t('Are you the boss or not?', 'Siz rahbarmisiz yo yo‘q?', 'Вы начальник или нет?'),
        t('Apart from you, who else will be part of this decision?', 'Sizdan tashqari bu qarorda yana kim ishtirok etadi?', 'Кроме вас, кто ещё будет участвовать в этом решении?'),
        t('Can you decide today?', 'Bugun qaror qila olasizmi?', 'Вы можете решить сегодня?'),
      ], 1, L('It is respectful and opens the door to partners, family or a director without embarrassing anyone.', 'U mijozga hurmat bilan qaraydi va hech kimni noqulay ahvolga solmasdan sherik, oila a’zosi yoki direktorni ham suhbatga qo‘shishga yo‘l ochadi.', 'Вопрос уважителен и открывает дверь к партнёрам, семье или директору, никого не ставя в неловкое положение.')),
      item('dq5', say('My husband handles the money.', 'Pul masalasiga erim qaraydi.', 'Деньгами занимается муж.'), [
        t('Then let’s make it simple for both of you: would he like to come with you on Saturday, or shall I prepare a short summary for him?', 'Unda ikkalangizga ham qulay qilaylik: turmush o‘rtog‘ingiz shanba kuni siz bilan kela oladimi yoki unga qisqacha ma’lumot tayyorlab beraymi?', 'Тогда сделаем удобно для вас обоих: он сможет прийти с вами в субботу или мне подготовить для него короткую справку?'),
        t('But you can decide yourself, right?', 'Lekin o‘zingiz ham qaror qila olasiz-ku?', 'Но вы же можете решить сами?'),
        t('OK, ask him and call me.', 'Mayli, undan so‘rang va menga qo‘ng‘iroq qiling.', 'Хорошо, спросите его и позвоните мне.'),
      ], 0, L('Include the decision maker in the next step instead of going around them or leaving it to chance.', 'Qaror qiluvchini chetlab o‘tmang yoki tasodifga qoldirmang — uni keyingi qadamga qo‘shing.', 'Не обходите того, кто решает, и не пускайте на самотёк — включите его в следующий шаг.')),
      item('dq6', t('Which question finds the budget without being rude?', 'Qaysi savol qo‘pol bo‘lmasdan byudjetni aniqlaydi?', 'Какой вопрос вежливо выясняет бюджет?'), [
        t('How much money do you have?', 'Qancha pulingiz bor?', 'Сколько у вас денег?'),
        t('To suggest the right option, which range would you like to stay within?', 'Sizga mos variantni taklif qilishim uchun aytsangiz: qaysi narx oralig‘i sizga qulay?', 'Чтобы предложить подходящий вариант, подскажите: в каком диапазоне цен вам было бы удобно?'),
        t('You can afford our premium model, can’t you?', 'Premium modelimizga pulingiz yetadi, to‘g‘rimi?', 'Вы же можете позволить себе премиум-модель?'),
      ], 1, L('It explains why you ask and lets the buyer give a range. The others are blunt or presumptuous.', 'U nega so‘rayotganingizni tushuntiradi va mijozga narx doirasini aytish imkonini beradi. Qolganlari qo‘pol yoki takabbur.', 'Объясняет, зачем вы спрашиваете, и даёт клиенту назвать диапазон. Остальные грубы или самонадеянны.')),
      item('dq7', t('After three answers, what do you do before pitching?', 'Uchta javobdan keyin, taqdimotdan oldin nima qilasiz?', 'Клиент ответил на три вопроса. Что сделать перед презентацией?'), [
        t('Summarise: “So the main problem is late deliveries on Fridays — is that right?”', 'Xulosa qiling: «Demak, asosiy muammo — juma kunlari yetkazib berish kechikadi, shundaymi?»', 'Подвести итог: «Значит, главная проблема в том, что по пятницам поставки опаздывают, верно?»'),
        t('Start the presentation slides.', 'Taqdimot slaydlarini boshlang.', 'Начать показывать слайды.'),
        t('Ask about their competitors’ prices.', 'Raqobatchilarining narxlarini so‘rang.', 'Спросить о ценах их конкурентов.'),
      ], 0, L('A short summary shows you listened and lets the buyer correct you before you pitch the wrong thing.', 'Qisqa xulosa tinglaganingizni ko‘rsatadi va noto‘g‘ri narsani taklif qilishingizdan oldin mijozga sizni to‘g‘rilash imkonini beradi.', 'Краткое резюме показывает, что вы слушали, и даёт клиенту поправить вас, пока вы не начали предлагать не то.')),
      item('dq8', t('Which question reveals the cost of doing nothing?', 'Qaysi savol hech narsa qilmaslikning zararini ochadi?', 'Какой вопрос показывает цену бездействия?'), [
        t('Do you like our product?', 'Mahsulotimiz yoqdimi?', 'Вам нравится наш продукт?'),
        t('What happens to the business if this problem continues until summer?', 'Agar bu muammo yozgacha davom etsa, biznesga nima bo‘ladi?', 'Что будет с бизнесом, если эта проблема продлится до лета?'),
        t('When can you pay?', 'Qachon to‘lay olasiz?', 'Когда сможете оплатить?'),
      ], 1, L('When the buyer says the cost aloud, the value of solving it becomes their own idea.', 'Mijoz zararni o‘zi aytganda, muammoni hal qilish qiymati uning o‘z fikriga aylanadi.', 'Когда клиент сам называет цену проблемы, ценность решения становится его собственной мыслью.')),
    ],
  },
  {
    id: 'drill.value', kind: 'drill', errorTag: 'feature_dump', node: 'value', levels: [1, 5], minutes: 4, aiVariants: true,
    title: L('From features to value', 'Xususiyatlardan qiymatga', 'От характеристик к ценности'),
    explain: L('A feature is what it is; value is what it changes for this buyer. Use their words: "You said… so…". Two or three relevant points beat ten features, and a question at the end checks they matter.', 'Xususiyat — bu narsa nimaligi; qiymat — u shu mijoz uchun nimani o‘zgartirishi. Uning so‘zlaridan foydalaning: «Siz … dedingiz, shuning uchun …». Ikki-uchta mos jihat o‘nta xususiyatdan yaxshi, oxiridagi savol esa muhimligini tekshiradi.', 'Характеристика — что это; ценность — что это меняет для этого клиента. Используйте его слова: «Вы сказали… поэтому…». Два-три уместных пункта лучше десяти характеристик, а вопрос в конце проверяет, важно ли это.'),
    items: [
      item('vl1', t('The buyer said deliveries are often late. Best pitch line?', 'Mijoz yetkazib berish ko‘pincha kechikishini aytdi. Eng yaxshi taqdimot jumlasi?', 'Клиент сказал, что поставки часто опаздывают. Лучшая фраза?'), [
        t('We have 40 trucks and a modern warehouse.', 'Bizda 40 ta yuk mashinasi va zamonaviy ombor bor.', 'У нас 40 грузовиков и современный склад.'),
        t('You said late deliveries stop your kitchen — we deliver before 9 a.m., and you get a message if anything changes.', 'Kechikkan yetkazib berish oshxonangizni to‘xtatadi dedingiz — biz soat 9 gacha olib kelamiz va biror narsa o‘zgarsa xabar olasiz.', 'Вы сказали, что опоздания останавливают кухню, — мы привозим до 9 утра и предупреждаем, если что-то меняется.'),
        t('We are the number one company.', 'Biz birinchi raqamli kompaniyamiz.', 'Мы компания номер один.'),
      ], 1, L('It repeats the buyer’s problem and shows exactly how it is solved. Fleet size and "number one" are about you, not them.', 'U mijozning muammosini takrorlaydi va qanday hal qilinishini aniq ko‘rsatadi. Mashinalar soni va «birinchi raqam» siz haqingizda, ular haqida emas.', 'Она повторяет проблему клиента и показывает, как именно она решается. Число машин и «номер один» — о вас, а не о нём.')),
      item('vl2', t('Turn this feature into value for a busy mother: “The course has an online platform.”', 'Bu xususiyatni band ona uchun qiymatga aylantiring: «Kursda onlayn platforma bor.»', 'Превратите характеристику в ценность для занятой мамы: «У курса есть онлайн-платформа».'), [
        t('The platform is modern and fast.', 'Platforma zamonaviy va tez.', 'Платформа современная и быстрая.'),
        t('You can see your daughter’s homework and test results on your phone every week, without coming to the centre.', 'Qizingizning uy vazifasi va test natijalarini har hafta markazga kelmasdan telefoningizda ko‘rasiz.', 'Вы каждую неделю видите домашние задания и результаты тестов дочери в телефоне, не приезжая в центр.'),
        t('Many students use the platform.', 'Ko‘p o‘quvchilar platformadan foydalanadi.', 'Платформой пользуются многие ученики.'),
      ], 1, L('Value is what she gets in her life: seeing progress without travelling.', 'Qiymat — uning hayotida nima olishi: yo‘l yurmasdan natijani ko‘rish.', 'Ценность — то, что она получает в жизни: видеть прогресс, не приезжая.')),
      item('vl3', t('You have spoken for two minutes without a pause. What should you do?', 'Ikki daqiqa to‘xtamasdan gapirdingiz. Nima qilish kerak?', 'Вы говорите две минуты без паузы. Что делать?'), [
        t('Ask: “Which of these matters most for your shop?”', 'So‘rang: «Bularning qaysi biri do‘koningiz uchun eng muhim?»', 'Спросить: «Что из этого важнее всего для вашего магазина?»'),
        t('Add more features so nothing is missed.', 'Hech narsa qolmasligi uchun ko‘proq xususiyat qo‘shing.', 'Добавить характеристик, чтобы ничего не упустить.'),
        t('Repeat the price.', 'Narxni takrorlang.', 'Повторить цену.'),
      ], 0, L('Hand the conversation back. The buyer tells you what to focus on.', 'Suhbatni qaytaring. Mijoz nimaga e’tibor qaratishni aytadi.', 'Верните разговор клиенту. Он скажет, на чём сосредоточиться.')),
      item('vl4', t('Which claim is the strongest and still honest?', 'Qaysi da’vo eng kuchli va halol?', 'Какое утверждение самое сильное и при этом честное?'), [
        t('Everybody says we are the best.', 'Hamma bizni eng yaxshi deydi.', 'Все говорят, что мы лучшие.'),
        t('Try it for a week in one shop; if sales do not move, you stop with no charge.', 'Bir hafta bitta do‘konda sinab ko‘ring; savdo o‘zgarmasa, hech qanday to‘lovsiz to‘xtatasiz.', 'Попробуйте неделю в одном магазине; если продажи не изменятся, прекратите без оплаты.'),
        t('Our quality is 100% guaranteed forever.', 'Sifatimiz abadiy 100% kafolatlangan.', 'Наше качество гарантировано на 100% навсегда.'),
      ], 1, L('A concrete, low-risk offer the seller can really keep beats vague praise and impossible promises. (Offer a trial only if you really can.)', 'Sotuvchi haqiqatan bajara oladigan, mijoz uchun xavfi kam aniq taklif mavhum maqtov va imkonsiz va’dadan yaxshi. (Sinovni faqat haqiqatan qila olsangiz taklif qiling.)', 'Конкретное безрисковое предложение, которое продавец реально выполнит, лучше расплывчатой похвалы и невыполнимых обещаний. (Предлагайте пробный период, только если он у вас есть.)')),
      item('vl5', t('You sell solar panels. A farmer worries that his water pump stops when the power goes off. Which feature do you lead with?', 'Siz quyosh panellari sotasiz. Fermer elektr o‘chganda suv nasosi to‘xtab qolishidan xavotirda. Qaysi xususiyatdan boshlaysiz?', 'Вы продаёте солнечные панели. Фермера волнует, что насос останавливается, когда отключают свет. С какой характеристики начать?'), [
        t('The panels’ modern design.', 'Panellarning zamonaviy dizayni.', 'Современный дизайн панелей.'),
        t('The battery that keeps the pump running in the evening when power goes off.', 'Kechqurun elektr o‘chganda nasosni ishlatib turadigan akkumulyator.', 'Аккумулятор, который держит насос вечером, когда отключают свет.'),
        t('The company’s awards.', 'Kompaniyaning mukofotlari.', 'Награды компании.'),
      ], 1, L('Lead with the feature that solves the pain he named.', 'U aytgan muammoni hal qiladigan xususiyatdan boshlang.', 'Начинайте с того, что решает названную им проблему.')),
      item('vl6', t('How do you end a short pitch?', 'Qisqa taqdimotni qanday tugatasiz?', 'Как закончить короткую презентацию?'), [
        t('“That’s all.”', '«Bo‘ldi, shu.»', '«Вот и всё».'),
        t('“How would that work in your kitchen?”', '«Bu sizning oshxonangizda qanday ishlaydi deb o‘ylaysiz?»', '«Как это сработает на вашей кухне?»'),
        t('“So, buy now?”', '«Xo‘sh, hozir olasizmi?»', '«Ну что, покупаете?»'),
      ], 1, L('A checking question invites the buyer to picture it and tells you whether the value landed.', 'Tekshiruvchi savol mijozni tasavvur qilishga undaydi va qiymat yetib borganini bildiradi.', 'Проверочный вопрос помогает клиенту представить результат и показывает, дошла ли ценность.')),
      item('vl7', t('The buyer asks: “What makes you different?” Best answer?', 'Mijoz so‘raydi: «Sizning farqingiz nima?» Eng yaxshi javob?', 'Клиент спрашивает: «Чем вы отличаетесь?» Лучший ответ?'), [
        t('Everything — quality, price, service, experience…', 'Hamma narsa — sifat, narx, xizmat, tajriba…', 'Всем — качеством, ценой, сервисом, опытом…'),
        t('For a hotel like yours, the main difference is that we set up the Wi-Fi room by room and test it before guests arrive. What matters most to you?', 'Sizniki kabi mehmonxonalar uchun asosiy farqimiz shuki, Wi-Fi’ni har bir xonada sozlab, mehmonlar kelishidan oldin tekshirib chiqamiz. Siz uchun eng muhimi nima?', 'Для такого отеля, как ваш, главное отличие в том, что мы настраиваем Wi-Fi в каждом номере и проверяем его до заезда гостей. Что для вас важнее всего?'),
        t('We are not different, but we are cheaper.', 'Farqimiz yo‘q, lekin arzonroqmiz.', 'Ничем, но мы дешевле.'),
      ], 1, L('One relevant difference for this buyer, then a question. "Everything" means nothing.', 'Shu mijoz uchun bitta mos farq, keyin savol. «Hamma narsa» hech narsani anglatmaydi.', 'Одно уместное для этого клиента отличие и вопрос. «Всем» — значит ничем.')),
      item('vl8', t('Which line puts the price in context best?', 'Qaysi jumla narxni eng to‘g‘ri solishtirib ko‘rsatadi?', 'Какая фраза лучше всего показывает цену в сравнении?'), [
        t('It is 1.2 million a month, which is cheap.', 'Oyiga 1,2 million, bu arzon.', 'Это 1,2 миллиона в месяц, это дёшево.'),
        t('It is 1.2 million a month — about what you said one lost wedding order costs you.', 'Oyiga 1,2 million — siz aytgan bitta yo‘qotilgan to‘y buyurtmasi zarari bilan deyarli teng.', 'Это 1,2 миллиона в месяц — примерно столько, сколько, по вашим словам, стоит один потерянный свадебный заказ.'),
        t('The price is the price.', 'Narx — narx-da.', 'Цена есть цена.'),
      ], 1, L('Compare the price with the buyer’s own number for the problem, not with your opinion that it is cheap.', 'Narxni «arzon» degan fikringiz bilan emas, mijozning muammo bo‘yicha o‘z raqami bilan solishtiring.', 'Сравнивайте цену с собственной цифрой клиента о проблеме, а не со своим мнением «дёшево».')),
    ],
  },
  {
    id: 'drill.price', kind: 'drill', errorTag: 'early_discount', node: 'objections.price', levels: [1, 5], minutes: 4, aiVariants: true,
    title: L('"It’s too expensive"', '«Qimmat ekan»', '«Дорого»'),
    explain: L('"Expensive" is a feeling, not a fact. Ask what they compare with and what matters to them, then show the value or a different option. If you give something, trade it for something: a bigger order, prepayment, a longer contract.', '«Qimmat» — bu fakt emas, his. Nima bilan solishtirayotganini va unga nima muhimligini so‘rang, keyin qiymatni yoki boshqa variantni ko‘rsating. Nimadir bersangiz, evaziga nimadir oling: kattaroq buyurtma, oldindan to‘lov, uzoqroq shartnoma.', '«Дорого» — это ощущение, а не факт. Спросите, с чем сравнивают и что для них важно, затем покажите ценность или другой вариант. Если уступаете, то в обмен на что-то: больший заказ, предоплату, более долгий срок договора.'),
    items: [
      item('pr1', say('It’s too expensive.', 'Qimmat ekan.', 'Дорого.'), [
        t('OK, I can give you ten percent off.', 'Mayli, o‘n foiz chegirma qilaman.', 'Хорошо, дам скидку десять процентов.'),
        t('I understand. Expensive compared with what — another offer, or what you planned to spend?', 'Tushunaman. Nimaga nisbatan qimmat — boshqa taklifgami yoki rejalashtirgan summangizgami?', 'Понимаю. Дорого по сравнению с чем — с другим предложением или с тем, что планировали потратить?'),
        t('No, it is not expensive, it is a fair price.', 'Yo‘q, qimmat emas, adolatli narx.', 'Нет, это не дорого, это честная цена.'),
      ], 1, L('Find out what "expensive" means before you answer. A quick discount teaches the buyer to push; arguing makes them defensive.', 'Javob berishdan oldin «qimmat» nimani anglatishini bilib oling. Tez chegirma mijozni bosim o‘tkazishga o‘rgatadi; bahs esa uni o‘zini himoya qilishga majbur qiladi.', 'Узнайте, что значит «дорого», прежде чем отвечать. Быстрая скидка учит клиента давить, спор заставляет защищаться.')),
      item('pr2', say('At the market it is cheaper.', 'Bozorda arzonroq.', 'На рынке дешевле.'), [
        t('Market goods are bad quality.', 'Bozor mollari sifatsiz.', 'На рынке товар плохого качества.'),
        t('That’s possible. To compare fairly — does the market price include delivery, installation and a warranty?', 'Bo‘lishi mumkin. Adolatli solishtirish uchun — bozor narxiga yetkazib berish, o‘rnatish va kafolat kiradimi?', 'Возможно. Чтобы сравнить честно: в рыночную цену входят доставка, установка и гарантия?'),
        t('Then buy at the market.', 'Unda bozordan oling.', 'Тогда покупайте на рынке.'),
      ], 1, L('Compare like for like with a calm question; let the buyer discover the difference.', 'Xotirjam savol bilan teng sharoitda solishtiring; farqni mijozning o‘zi topsin.', 'Спокойным вопросом сравните сопоставимое; пусть клиент сам увидит разницу.')),
      item('pr3', say('Give me a discount and I’ll buy.', 'Chegirma qiling, olaman.', 'Сделайте скидку — и я куплю.'), [
        t('If you take the set of three today and pay now, I can include free delivery.', 'Agar uchtalik to‘plamni bugun olib, hozir to‘lasangiz, yetkazib berishni bepul qilaman.', 'Если возьмёте комплект из трёх сегодня и оплатите сейчас, доставка будет бесплатной.'),
        t('OK, five percent off.', 'Mayli, besh foiz chegirma.', 'Хорошо, пять процентов скидки.'),
        t('No discounts, sorry.', 'Chegirma yo‘q, kechirasiz.', 'Скидок нет, извините.'),
      ], 0, L('Trade, don’t give: a concession for something in return, and preferably not on the price itself.', 'Shunchaki bermang, almashing: yon bering, lekin faqat nimadir evaziga va iloji bo‘lsa narxning o‘zida emas.', 'Не дарите, а меняйтесь: уступка — в обмен на что-то, и лучше не в самой цене.')),
      item('pr4', say('I don’t see why it costs this much.', 'Nega bunchalik qimmatligini tushunmayapman.', 'Не понимаю, почему это столько стоит.'), [
        t('Because our costs are high.', 'Chunki xarajatlarimiz katta.', 'Потому что у нас высокие затраты.'),
        t('Fair question. What matters most to you here — durability, the look or the after-sales service?', 'Yaxshi savol. Bu yerda siz uchun eng muhimi nima — chidamlilikmi, ko‘rinishmi yoki sotuvdan keyingi xizmatmi?', 'Справедливый вопрос. Что для вас здесь главное — долговечность, внешний вид или сервис после покупки?'),
        t('You will understand later.', 'Keyin tushunasiz.', 'Потом поймёте.'),
      ], 1, L('Ask what matters, then explain the price through that. Your costs are not the buyer’s problem.', 'Nima muhimligini so‘rang, keyin narxni shu orqali tushuntiring. Xarajatlaringiz mijozning muammosi emas.', 'Спросите, что важно, и объясните цену через это. Ваши затраты — не проблема клиента.')),
      item('pr5', t('The buyer has a real budget limit. Which option is fair?', 'Mijozning haqiqiy byudjet chegarasi bor. Qaysi variant adolatli?', 'У клиента реальный лимит бюджета. Какой вариант честный?'), [
        t('Offer a smaller package that fits the limit and can grow later.', 'Byudjetga mos, keyinchalik kengaytirsa bo‘ladigan kichikroq paket taklif qiling.', 'Предложить пакет поменьше, который укладывается в лимит и который можно расширить позже.'),
        t('Push the full package anyway.', 'Baribir to‘liq paketni olishga majburlang.', 'Всё равно продавливать полный пакет.'),
        t('Cut the full package’s price by half.', 'To‘liq paket narxini ikki baravar tushiring.', 'Снизить цену полного пакета вдвое.'),
      ], 0, L('Change the offer, not the price: a smaller start keeps your price honest and the buyer comfortable.', 'Narxni emas, taklifni o‘zgartiring: kichikroq boshlash narxingizni halol saqlaydi, mijoz ham o‘zini erkin his qiladi.', 'Меняйте предложение, а не цену: меньший старт сохраняет честную цену и комфорт клиента.')),
      item('pr6', say('Your competitor gives 15% off.', 'Raqobatchingiz 15% chegirma beradi.', 'Конкурент даёт скидку 15%.'), [
        t('We give 20% then.', 'Unda biz 20% beramiz.', 'Тогда мы дадим 20%.'),
        t('Discount from which price? Let’s compare the final amount and what’s included.', 'Qaysi narxdan chegirma? Yakuniy summani va nima kirishini solishtiraylik.', 'Скидка от какой цены? Давайте сравним итоговую сумму и что в неё входит.'),
        t('They are lying.', 'Ular yolg‘on gapiryapti.', 'Они врут.'),
      ], 1, L('A percentage means nothing without the base price. Compare final amounts and contents.', 'Asosiy narxsiz foiz hech narsani anglatmaydi. Yakuniy summa va tarkibni solishtiring.', 'Процент без базовой цены ничего не значит. Сравнивайте итоговые суммы и состав.')),
      item('pr7', t('After you explain the value, the buyer still hesitates on price. Next?', 'Qiymatni tushuntirganingizdan keyin ham mijoz narx bo‘yicha ikkilanyapti. Keyin nima?', 'После объяснения ценности клиент всё равно сомневается из-за цены. Что дальше?'), [
        t('Ask: “Apart from the price, is there anything else stopping you?”', 'So‘rang: «Narxdan tashqari sizni yana biror narsa to‘xtatyaptimi?»', 'Спросить: «Кроме цены, вас что-то ещё останавливает?»'),
        t('Say “final offer” and wait.', '«Oxirgi taklif» deng va kuting.', 'Сказать «последнее предложение» и ждать.'),
        t('Explain everything again from the start.', 'Hammasini boshidan qayta tushuntiring.', 'Объяснить всё сначала.'),
      ], 0, L('Isolate the objection: if price is the only issue, you can work on it; often something else is behind it.', 'E’tirozni ajrating: agar gap faqat narxda bo‘lsa, u bilan ishlash mumkin; ko‘pincha ortida boshqa narsa bo‘ladi.', 'Изолируйте возражение: если дело только в цене, с этим можно работать; часто за ним стоит другое.')),
      item('pr8', say('Can you do it cheaper if I pay cash?', 'Naqd to‘lasam arzonroq qila olasizmi?', 'А если наличными, будет дешевле?'), [
        t('Yes, cash is cheaper, no receipt needed.', 'Ha, naqd arzonroq, chek kerak emas.', 'Да, за наличные дешевле, чек не нужен.'),
        t('Our price is the same for cash and card, with a receipt. What I can offer is free delivery with a full prepayment.', 'Naqd ham, karta ham — narx bir xil va chek bilan. Lekin to‘liq oldindan to‘lasangiz, yetkazib berishni bepul qila olaman.', 'Цена одинаковая — наличными или картой, и всегда с чеком. Могу предложить бесплатную доставку при полной предоплате.'),
        t('I don’t know.', 'Bilmayman.', 'Не знаю.'),
      ], 1, L('Stay honest and within the rules; offer a legitimate trade instead of an off-the-books deal.', 'Halol va qoidalar doirasida qoling; norasmiy kelishuv o‘rniga qonuniy imtiyozni taklif qiling.', 'Оставайтесь честными и в рамках правил; предложите законный обмен вместо сделки «мимо кассы».')),
    ],
  },
  {
    id: 'drill.think', kind: 'drill', errorTag: 'no_question_back', node: 'objections.think', levels: [1, 5], minutes: 4, aiVariants: true,
    title: L('"I’ll think about it"', '«O‘ylab ko‘raman»', '«Я подумаю»'),
    explain: L('"I’ll think about it" usually hides a concrete doubt: the price, the timing, a partner, trust. Agree that it is an important decision, then ask gently what exactly they want to think over, and answer that. Then agree when you will speak next.', '«O‘ylab ko‘raman» odatda aniq xavotirni yashiradi: narx, vaqt, sherik, ishonch. Bu muhim qaror ekaniga rozi bo‘ling, keyin aynan nimani o‘ylab ko‘rmoqchiligini muloyimlik bilan so‘rang va shunga javob bering. So‘ng keyingi gaplashish vaqtini kelishib oling.', '«Я подумаю» обычно скрывает конкретное сомнение: цена, сроки, партнёр, доверие. Согласитесь, что решение важное, мягко спросите, что именно хочется обдумать, и ответьте на это. Затем договоритесь, когда поговорите снова.'),
    items: [
      item('th1', say('I’ll think about it.', 'O‘ylab ko‘raman.', 'Я подумаю.'), [
        t('OK, think about it and call me.', 'Mayli, o‘ylab ko‘rib qo‘ng‘iroq qiling.', 'Хорошо, подумайте и позвоните.'),
        t('Of course, it’s an important decision. What exactly would you like to think over — the price, the timing or something else?', 'Albatta, bu muhim qaror. Aynan nimani o‘ylab ko‘rmoqchisiz — narxnimi, vaqtnimi yoki boshqa narsanimi?', 'Конечно, решение важное. Что именно хотите обдумать — цену, сроки или что-то ещё?'),
        t('There is nothing to think about, it’s a great offer.', 'O‘ylaydigan narsa yo‘q, ajoyib taklif.', 'Тут нечего думать, отличное предложение.'),
      ], 1, L('Respect the decision and find the real doubt with a choice question.', 'Qarorni hurmat qiling va tanlovli savol bilan asl xavotirni toping.', 'Уважайте решение и найдите настоящее сомнение вопросом с вариантами.')),
      item('th2', t('The buyer answers: “Mostly whether it will really work for us.” Next?', 'Mijoz javob beradi: «Asosan, bu bizda haqiqatan ishlaydimi-yo‘qmi.» Keyin nima?', 'Клиент отвечает: «В основном — сработает ли это у нас». Что дальше?'), [
        t('It works everywhere, don’t worry.', 'Hamma joyda ishlaydi, xavotir olmang.', 'Это работает везде, не волнуйтесь.'),
        t('What would you need to see to be sure — a trial in one shop, or talking to a client like you?', 'Ishonch hosil qilish uchun nimani ko‘rishingiz kerak — bitta do‘konda sinovnimi yoki sizga o‘xshash mijoz bilan gaplashishnimi?', 'Что вам нужно увидеть, чтобы убедиться, — пробный запуск в одном магазине или разговор с похожим клиентом?'),
        t('Then think about it longer.', 'Unda uzoqroq o‘ylang.', 'Тогда подумайте подольше.'),
      ], 1, L('Ask what proof they need and offer a concrete way to get it.', 'Qanday dalil kerakligini so‘rang va uni olishning aniq yo‘lini taklif qiling.', 'Спросите, какое доказательство нужно, и предложите конкретный способ его получить.')),
      item('th3', say('I need to talk to my wife first.', 'Avval xotinim bilan gaplashishim kerak.', 'Сначала мне нужно поговорить с женой.'), [
        t('Of course. What do you think will matter most to her? Maybe you could come together on Saturday?', 'Albatta. Sizningcha, rafiqangiz uchun eng muhimi nima bo‘ladi? Balki shanba kuni birga kelarsizlar?', 'Конечно. Как думаете, что для неё будет важнее всего? Может, придёте вместе в субботу?'),
        t('You are the man, you decide.', 'Siz erkaksiz, o‘zingiz hal qilasiz.', 'Вы же мужчина, вы и решаете.'),
        t('OK, bye.', 'Mayli, xayr.', 'Хорошо, до свидания.'),
      ], 0, L('Include the other decision maker: ask what matters to her and invite her into the next step.', 'Boshqa qaror qiluvchini qo‘shing: u uchun nima muhimligini so‘rang va keyingi qadamga taklif qiling.', 'Включите второго принимающего решение: спросите, что важно для неё, и пригласите в следующий шаг.')),
      item('th4', t('You found the real doubt and answered it. The buyer still wants time. Best close?', 'Asl xavotirni topib, javob berdingiz. Mijoz hali ham vaqt so‘rayapti. Eng yaxshi yakun?', 'Вы нашли настоящее сомнение и ответили на него. Клиент всё равно просит время. Как лучше завершить?'), [
        t('“Fine. Shall I call you on Thursday at 11, after you’ve discussed it?”', '«Yaxshi. Muhokama qilganingizdan keyin payshanba kuni soat 11 da qo‘ng‘iroq qilaymi?»', '«Хорошо. Давайте я позвоню вам в четверг в 11, когда вы всё обсудите?»'),
        t('“Call me when you are ready.”', '«Tayyor bo‘lganingizda qo‘ng‘iroq qiling.»', '«Звоните, когда будете готовы».'),
        t('“This offer ends tonight.”', '«Bu taklif bugun kechqurun tugaydi.»', '«Предложение заканчивается сегодня вечером».'),
      ], 0, L('Give the time they need, but fix the next contact. Fake deadlines destroy trust.', 'Kerakli vaqtni bering, lekin keyingi aloqani belgilang. Soxta muddatlar ishonchni yo‘qotadi.', 'Дайте нужное время, но зафиксируйте следующий контакт. Фальшивые дедлайны разрушают доверие.')),
      item('th5', t('Which question finds the real doubt best?', 'Qaysi savol asl xavotirni eng yaxshi topadi?', 'Какой вопрос лучше всего находит настоящее сомнение?'), [
        t('Why don’t you want to buy?', 'Nega sotib olishni xohlamaysiz?', 'Почему вы не хотите покупать?'),
        t('On a scale of one to ten, how ready are you — and what would make it a ten?', 'Birdan o‘ngacha baholasangiz, qanchalik tayyorsiz — o‘n bo‘lishi uchun nima yetishmayapti?', 'По шкале от одного до десяти, насколько вы готовы — и чего не хватает до десяти?'),
        t('Is it the price?', 'Narx sababmi?', 'Дело в цене?'),
      ], 1, L('The scale question is easy to answer and the second half tells you exactly what is missing.', 'Shkala savoliga javob berish oson, ikkinchi qismi esa aynan nima yetishmayotganini aytadi.', 'На вопрос со шкалой легко ответить, а вторая часть показывает, чего именно не хватает.')),
      item('th6', say('Let me think and I’ll get back to you next month.', 'O‘ylab ko‘rib, keyingi oy sizga javob beraman.', 'Дайте подумать, отвечу вам в следующем месяце.'), [
        t('Sure. So that I can prepare the right thing, what will change by next month?', 'Albatta. Sizga kerakli narsani tayyorlab qo‘yishim uchun aytsangiz: keyingi oyga kelib nima o‘zgaradi?', 'Конечно. Подскажите, что изменится к следующему месяцу? Так я подготовлю именно то, что нужно.'),
        t('Next month prices go up.', 'Keyingi oy narxlar oshadi.', 'В следующем месяце цены вырастут.'),
        t('OK, see you next month.', 'Mayli, keyingi oyda gaplashamiz.', 'Хорошо, до следующего месяца.'),
      ], 0, L('A delay often has a reason (budget date, a decision maker away). Ask what changes, so the follow-up has a purpose.', 'Kechiktirishning ko‘pincha sababi bor (byudjet ajratiladigan sana, qaror qiluvchi joyida yo‘q). Nima o‘zgarishini so‘rang, shunda keyingi aloqa maqsadli bo‘ladi.', 'У отсрочки часто есть причина (дата утверждения бюджета, того, кто принимает решение, нет на месте). Спросите, что изменится, — тогда следующий контакт будет со смыслом.')),
      item('th7', say('I always think before buying.', 'Sotib olishdan oldin doim o‘ylayman.', 'Я всегда думаю перед покупкой.'), [
        t('That’s wise. Which questions are still open for you, so I can answer them now?', 'Bu to‘g‘ri yondashuv. Qaysi savollaringizga hali javob olmadingiz? Hozir javob bera olaman.', 'Это разумно. Какие вопросы у вас ещё остались? Я отвечу на них прямо сейчас.'),
        t('Smart people decide quickly.', 'Aqlli odamlar tez qaror qiladi.', 'Умные люди решают быстро.'),
        t('Then I will call you every day.', 'Unda sizga har kuni qo‘ng‘iroq qilaman.', 'Тогда я буду звонить вам каждый день.'),
      ], 0, L('Praise the habit and help with the thinking by answering open questions now.', 'Odatni maqtang va ochiq savollarga hozir javob berib, o‘ylashga yordam bering.', 'Похвалите привычку и помогите подумать, ответив на открытые вопросы сейчас.')),
      item('th8', t('What is the biggest mistake after “I’ll think about it”?', 'Mijoz «O‘ylab ko‘raman» deganidan keyingi eng katta xato nima?', 'Какая главная ошибка после «я подумаю»?'), [
        t('Asking a gentle question about the doubt.', 'Xavotir haqida muloyim savol berish.', 'Мягко спросить о сомнении.'),
        t('Ending the call with no question and no agreed next contact.', 'Qo‘ng‘iroqni savolsiz va keyingi aloqani kelishmasdan tugatish.', 'Закончить разговор без вопроса и без договорённости о следующем контакте.'),
        t('Thanking the buyer for their time.', 'Mijozga vaqti uchun rahmat aytish.', 'Поблагодарить клиента за время.'),
      ], 1, L('No question and no next contact means the deal quietly dies.', 'Savol ham, keyingi aloqa ham bo‘lmasa, bitim jimgina barbod bo‘ladi.', 'Без вопроса и без следующего контакта сделка тихо умирает.')),
    ],
  },
  {
    id: 'drill.competitor', kind: 'drill', errorTag: 'arguing', node: 'objections.competitor', levels: [1, 5], minutes: 4, aiVariants: true,
    title: L('"We already work with someone"', '«Biz boshqa kompaniya bilan ishlaymiz»', '«Мы уже работаем с другими»'),
    explain: L('Never attack a competitor: the buyer chose them, so you attack the buyer. Agree with what is true, ask what they would improve or what they compare, and show one relevant difference. A small, low-risk first step lets them compare in practice.', 'Raqobatchiga hech qachon hujum qilmang: ularni mijoz tanlagan, demak siz mijozga hujum qilasiz. To‘g‘ri gapga qo‘shiling, nimani yaxshilashni yoki nimani solishtirishni so‘rang va bitta mos farqni ko‘rsating. Xavfi kam kichik birinchi qadam amalda solishtirishga imkon beradi.', 'Никогда не нападайте на конкурента: его выбрал клиент, значит, вы нападаете на клиента. Согласитесь с правдой, спросите, что бы он улучшил или с чем сравнивает, и покажите одно уместное отличие. Небольшой безрисковый шаг даст сравнить на практике.'),
    items: [
      item('cp1', say('We already have a supplier.', 'Bizning yetkazib beruvchimiz bor.', 'У нас уже есть поставщик.'), [
        t('Our prices are lower than theirs.', 'Narxlarimiz ularnikidan past.', 'У нас цены ниже, чем у них.'),
        t('That’s good to hear. What do you like about them — and if you could change one thing, what would it be?', 'Bu yaxshi. Ularning nimasi sizga yoqadi? Agar bitta narsani o‘zgartirish mumkin bo‘lsa, nimani o‘zgartirardingiz?', 'Это хорошо. Что вам в них нравится — и если бы можно было изменить что-то одно, что бы это было?'),
        t('Then sorry for disturbing you.', 'Unda bezovta qilganim uchun uzr.', 'Тогда извините за беспокойство.'),
      ], 1, L('Respect the choice and ask what they would improve: that is where your opportunity is.', 'Tanlovni hurmat qiling va nimani yaxshilashni so‘rang: imkoniyatingiz aynan shunda.', 'Уважайте выбор и спросите, что бы они улучшили: там и ваша возможность.')),
      item('cp2', say('The other company is cheaper.', 'Boshqa kompaniya arzonroq.', 'Другая компания дешевле.'), [
        t('They are cheap because their quality is bad.', 'Ular sifatsiz bo‘lgani uchun arzon.', 'Они дешевле, потому что у них плохое качество.'),
        t('They may well be. What does their price include, so we compare the same thing?', 'Bo‘lishi mumkin. Bir xil narsani solishtirishimiz uchun ularning narxiga nima kiradi?', 'Вполне возможно. Что входит в их цену, чтобы сравнить одно и то же?'),
        t('I will make it even cheaper.', 'Men undan ham arzon qilaman.', 'Я сделаю ещё дешевле.'),
      ], 1, L('Ask, don’t accuse. Compare like for like and let the facts speak.', 'Ayblamang, so‘rang. Teng sharoitda solishtiring, faktlar o‘zi gapirsin.', 'Спрашивайте, а не обвиняйте. Сравнивайте сопоставимое — пусть говорят факты.')),
      item('cp3', say('They have been with us for ten years.', 'Ular biz bilan o‘n yildan beri ishlaydi.', 'Они с нами уже десять лет.'), [
        t('Ten years is a long time — a relationship like that matters. Would it be useful to have a second supplier for busy months, just in case?', 'O‘n yil — uzoq muddat, bunday munosabat muhim. Ish ko‘p bo‘ladigan oylarda ehtiyot uchun ikkinchi yetkazib beruvchi bo‘lsa, foydali bo‘lmaydimi?', 'Десять лет — это долго, такие отношения важны. Может, будет полезен второй поставщик на загруженные месяцы — на всякий случай?'),
        t('Ten years is too long, time to change.', 'O‘n yil juda ko‘p, o‘zgartirish vaqti keldi.', 'Десять лет — слишком долго, пора менять.'),
        t('They are probably overcharging you.', 'Ular sizdan ortiqcha pul olayotgandir.', 'Наверное, они берут с вас лишнее.'),
      ], 0, L('Don’t ask them to leave a long partner; offer a small role alongside them.', 'Uzoq yillik hamkorni tashlashni so‘ramang; ularning yonida o‘zingizga kichik rol taklif qiling.', 'Не просите бросить давнего партнёра — предложите небольшую роль рядом с ним.')),
      item('cp4', t('The buyer mentions a competitor you know had problems. What do you say?', 'Mijoz raqobatchini tilga oldi; bilasizki, unda muammolar bo‘lgan. Nima deysiz?', 'Клиент упоминает конкурента, у которого, как вы знаете, были проблемы. Что скажете?'), [
        t('Tell the story of their problems in detail.', 'Ularning muammolarini batafsil aytib bering.', 'Подробно рассказать об их проблемах.'),
        t('Say nothing about them; ask what matters most and show how you handle that.', 'Ular haqida hech narsa demang; eng muhimini so‘rang va buni qanday hal qilishingizni ko‘rsating.', 'Ничего о них не говорить; спросить, что важнее всего, и показать, как с этим справляетесь вы.'),
        t('Hint that you heard bad things.', 'Yomon gaplar eshitganingizga ishora qiling.', 'Намекнуть, что слышали плохое.'),
      ], 1, L('Gossip makes you look unprofessional and may be wrong. Talk about the buyer’s needs and your own strengths.', 'G‘iybat sizni noprofessional ko‘rsatadi va noto‘g‘ri bo‘lishi mumkin. Mijozning ehtiyojlari va o‘z kuchli tomonlaringiz haqida gapiring.', 'Сплетни выглядят непрофессионально и могут быть неправдой. Говорите о потребностях клиента и своих сильных сторонах.')),
      item('cp5', say('Why should I switch?', 'Nega o‘zgartirishim kerak?', 'Зачем мне переходить?'), [
        t('Maybe you shouldn’t switch everything. What would have to be true for a test with us to be worth it?', 'Balki hammasini o‘zgartirish shart emasdir. Qanday shart bo‘lsa, biz bilan sinab ko‘rishga arziydi deb o‘ylaysiz?', 'Возможно, менять всё и не нужно. При каком условии вам было бы интересно попробовать с нами?'),
        t('Because we are better.', 'Chunki biz yaxshiroqmiz.', 'Потому что мы лучше.'),
        t('Because everyone is switching to us.', 'Chunki hamma bizga o‘tyapti.', 'Потому что все переходят к нам.'),
      ], 0, L('Lower the risk: ask for a test, not a full switch, and let the buyer set the condition.', 'Xavfni kamaytiring: to‘liq o‘tishni emas, sinab ko‘rishni so‘rang va shartni mijoz qo‘ysin.', 'Снизьте риск: просите тест, а не полный переход, и пусть условие задаст клиент.')),
      item('cp6', say('Brand X has a nicer showroom.', 'X brendining ko‘rgazma zali chiroyliroq.', 'У бренда X салон красивее.'), [
        t('Showrooms don’t matter.', 'Ko‘rgazma zali muhim emas.', 'Салоны не важны.'),
        t('It does look great. When you think about owning the car for five years, what will matter most to you?', 'Haqiqatan ham chiroyli. Mashinani besh yil ishlatishni o‘ylasangiz, siz uchun eng muhimi nima bo‘ladi?', 'Он действительно красивый. Если представить, что вы будете ездить на этой машине пять лет, что для вас будет важнее всего?'),
        t('Our showroom will be renovated next year.', 'Bizning zal keyingi yil ta’mirlanadi.', 'Наш салон отремонтируют в следующем году.'),
      ], 1, L('Agree, then move the comparison to what matters over time.', 'Qo‘shiling, keyin solishtirishni vaqt o‘tishi bilan muhim bo‘ladigan narsaga o‘tkazing.', 'Согласитесь и переведите сравнение на то, что важно со временем.')),
      item('cp7', t('The buyer says the other company offers a free extra. You can’t match it. Best move?', 'Mijoz boshqa kompaniya bepul qo‘shimcha berishini aytdi. Siz bera olmaysiz. Eng yaxshi qadam?', 'Клиент говорит, что другая компания даёт бесплатный бонус. Вы такого предложить не можете. Лучший ход?'), [
        t('Say you’ll match it and hope nobody checks.', 'Siz ham berasiz deb ayting va hech kim tekshirmaydi deb umid qiling.', 'Сказать, что дадите так же, и надеяться, что никто не проверит.'),
        t('Be honest: you can’t, and show what you offer that matters more for them.', 'Halol ayting: bera olmaysiz; keyin ular uchun muhimroq bo‘lgan taklifingizni ko‘rsating.', 'Честно сказать, что не можете, и показать, что вы предлагаете такого, что для них важнее.'),
        t('Say the extra is useless.', 'Qo‘shimcha foydasiz deng.', 'Сказать, что бонус бесполезен.'),
      ], 1, L('Honesty about what you can’t do makes the rest of what you say believable.', 'Qila olmaydigan narsangiz haqidagi halollik qolgan gaplaringizni ishonchli qiladi.', 'Если честно сказать, чего вы не можете, остальным вашим словам поверят.')),
      item('cp8', t('The buyer is happy with the competitor. What small step can you ask for?', 'Mijoz raqobatchidan mamnun. Qanday kichik qadamni so‘rashingiz mumkin?', 'Клиент доволен конкурентом. О каком маленьком шаге можно попросить?'), [
        t('To cancel their contract now.', 'Shartnomasini hozir bekor qilishni.', 'Расторгнуть их договор прямо сейчас.'),
        t('A trial order or a quote to compare at their next review.', 'Keyingi ko‘rib chiqishda solishtirish uchun sinov buyurtmasi yoki narx taklifini.', 'Пробный заказ или коммерческое предложение для сравнения при следующем пересмотре.'),
        t('Nothing; call again in a year.', 'Hech narsa; bir yildan keyin qayta qo‘ng‘iroq qiling.', 'Ничего; позвонить через год.'),
      ], 1, L('A small, safe step keeps you in the game until the next decision point.', 'Kichik, xavfsiz qadam sizni keyingi qaror vaqtigacha o‘yinda saqlaydi.', 'Маленький безопасный шаг держит вас в игре до следующего момента решения.')),
    ],
  },
  {
    id: 'drill.budget', kind: 'drill', errorTag: 'no_question_back', node: 'objections.budget', levels: [1.5, 5], minutes: 4, aiVariants: true,
    title: L('"We have no budget"', '«Byudjetimiz yo‘q»', '«У нас нет бюджета»'),
    explain: L('"No budget" can mean no money now, no money for this, or no reason yet. Ask when budgets are planned, who decides, and what the problem costs them. Then offer a fitting step: a smaller start, payment in parts, or preparing for the next budget.', '«Byudjet yo‘q» hozir pul yo‘q, bunga pul yo‘q yoki hali sabab yo‘q degani bo‘lishi mumkin. Byudjet qachon rejalashtirilishi, kim qaror qilishi va muammo ularga qanchaga tushishini so‘rang. Keyin mos qadamni taklif qiling: kichik boshlash, bo‘lib to‘lash yoki keyingi byudjetga tayyorlanish.', '«Нет бюджета» может значить: нет денег сейчас, нет денег на это или пока нет причины. Спросите, когда планируют бюджет, кто решает и во что обходится проблема. Затем предложите подходящий шаг: меньший старт, оплату частями или подготовку к следующему бюджету.'),
    items: [
      item('bd1', say('We have no budget for this.', 'Bunga byudjetimiz yo‘q.', 'На это у нас нет бюджета.'), [
        t('I understand. When do you plan next year’s budget, and who is involved?', 'Tushunaman. Keyingi yilgi byudjetni qachon rejalashtirasiz va unda kim ishtirok etadi?', 'Понимаю. Когда вы планируете бюджет на следующий год и кто в этом участвует?'),
        t('Everyone has a budget if they want.', 'Xohlasa, hammaning byudjeti bor.', 'Бюджет есть у всех, если захотеть.'),
        t('Then there’s no point talking.', 'Unda gaplashishning ma’nosi yo‘q.', 'Тогда нет смысла говорить.'),
      ], 0, L('Find the budget cycle and the people in it, so you can be part of the next plan.', 'Byudjet qachon va kim tomonidan tuzilishini bilib oling, shunda keyingi rejaga kira olasiz.', 'Узнайте цикл бюджета и участников, чтобы попасть в следующий план.')),
      item('bd2', say('Maybe next year.', 'Balki keyingi yil.', 'Может, в следующем году.'), [
        t('OK, I will call next year.', 'Mayli, keyingi yil qo‘ng‘iroq qilaman.', 'Хорошо, позвоню в следующем году.'),
        t('Makes sense. What would you need from me before then so it’s an easy decision — a pilot result, figures for your director?', 'Mantiqan to‘g‘ri. Qaror oson bo‘lishi uchun undan oldin mendan nima kerak bo‘ladi — sinov natijasimi, direktoringiz uchun raqamlarmi?', 'Логично. Что вам нужно от меня до этого, чтобы решение было лёгким, — результат пилота, цифры для директора?'),
        t('Next year it will cost more.', 'Keyingi yil qimmatroq bo‘ladi.', 'В следующем году будет дороже.'),
      ], 1, L('Turn "later" into preparation: what will they need to decide quickly then?', '«Keyin»ni tayyorgarlikka aylantiring: o‘shanda tez qaror qilish uchun nima kerak bo‘ladi?', 'Превратите «потом» в подготовку: что понадобится, чтобы тогда решить быстро?')),
      item('bd3', t('A salon owner wants the device but has little cash now. Which offer is fair (if you have it)?', 'Salon egasi apparatni xohlaydi, lekin hozir puli kam. Qaysi taklif adolatli (agar sizda bo‘lsa)?', 'Владелица салона хочет аппарат, но денег сейчас мало. Какое предложение честное (если оно у вас есть)?'), [
        t('A loan with hidden fees.', 'Yashirin to‘lovli kredit.', 'Кредит со скрытыми комиссиями.'),
        t('Payment in parts with the full amount stated clearly up front.', 'To‘liq summasi oldindan aniq aytilgan holda bo‘lib to‘lash.', 'Оплата частями, причём полная сумма заранее названа чётко.'),
        t('A big discount if she signs today.', 'Bugun imzolasa katta chegirma.', 'Большая скидка, если подпишет сегодня.'),
      ], 1, L('Offer only honest options and state the full cost clearly.', 'Faqat halol variantlarni taklif qiling va to‘liq narxni aniq ayting.', 'Предлагайте только честные варианты и чётко называйте полную стоимость.')),
      item('bd4', say('There is no money right now.', 'Hozir pul yo‘q.', 'Сейчас денег нет.'), [
        t('If the problem costs you money every month, how much is it costing you now?', 'Agar bu muammo har oy sizga zarar keltirayotgan bo‘lsa, hozir u oyiga qanchaga tushyapti?', 'Если эта проблема каждый месяц обходится вам в деньги, во сколько она обходится сейчас?'),
        t('Borrow from friends.', 'Do‘stlardan qarz oling.', 'Займите у друзей.'),
        t('Call me when you have money.', 'Pulingiz bo‘lganda qo‘ng‘iroq qiling.', 'Позвоните, когда будут деньги.'),
      ], 0, L('If the problem has a cost, waiting is not free. Let the buyer see that with their own numbers.', 'Agar muammoning zarari bo‘lsa, kutish ham bepul emas. Buni mijoz o‘z raqamlari bilan ko‘rsin.', 'Если у проблемы есть цена, ожидание тоже не бесплатно. Пусть клиент увидит это по своим цифрам.')),
      item('bd5', t('The director likes the idea but the founder controls money. Best step?', 'Direktorga g‘oya yoqdi, lekin pulni ta’sischi boshqaradi. Eng yaxshi qadam?', 'Директору идея нравится, но деньгами распоряжается учредитель. Лучший шаг?'), [
        t('Ask the director to pay from his own budget anyway.', 'Direktordan baribir o‘z byudjetidan to‘lashni so‘rang.', 'Попросить директора всё равно заплатить из своего бюджета.'),
        t('Offer to prepare a one-page case and join a short meeting with the founder.', 'Bir sahifalik asoslash tayyorlab, ta’sischi bilan qisqa uchrashuvda qatnashishni taklif qiling.', 'Предложить подготовить одностраничное обоснование и присоединиться к короткой встрече с учредителем.'),
        t('Go to the founder directly without telling the director.', 'Direktorga aytmasdan to‘g‘ridan-to‘g‘ri ta’sischiga boring.', 'Пойти к учредителю напрямую, не говоря директору.'),
      ], 1, L('Help your contact sell inside, and get in front of the decision maker together.', 'Hamkoringizga kompaniya ichida g‘oyani himoya qilishga yordam bering va qaror qiluvchi bilan birga uchrashing.', 'Помогите контакту «продать» внутри и вместе выйдите на того, кто решает.')),
      item('bd6', say('Our budget is only half of your price.', 'Byudjetimiz narxingizning atigi yarmiga yetadi.', 'Наш бюджет — только половина вашей цены.'), [
        t('Then I will halve the price.', 'Unda narxni yarmiga tushiraman.', 'Тогда я снижу цену вдвое.'),
        t('Thanks for telling me. Let’s see what we can do within that — which part matters most to start with?', 'Aytganingiz uchun rahmat. Shu doirada nima qila olishimizni ko‘raylik — boshlash uchun qaysi qismi eng muhim?', 'Спасибо, что сказали. Посмотрим, что можно сделать в этих рамках, — с какой части важнее начать?'),
        t('That’s not enough, sorry.', 'Bu yetmaydi, kechirasiz.', 'Этого мало, извините.'),
      ], 1, L('Shape the offer to the budget instead of cutting your price.', 'Narxni tushirish o‘rniga taklifni byudjetga moslang.', 'Подстройте предложение под бюджет, а не режьте цену.')),
      item('bd7', t('When is "no budget" a sign to stop?', '«Byudjet yo‘q» qachon to‘xtash belgisi?', 'Когда «нет бюджета» — сигнал остановиться?'), [
        t('Never; always push.', 'Hech qachon; doim bosim o‘tkazing.', 'Никогда; всегда давить.'),
        t('When there is no real problem to solve and no future budget — then thank them and leave the door open.', 'Hal qiladigan haqiqiy muammo ham, kelajakdagi byudjet ham bo‘lmasa — rahmat aytib, eshikni ochiq qoldiring.', 'Когда нет ни реальной проблемы, ни бюджета в будущем, — поблагодарить и оставить дверь открытой.'),
        t('Immediately after hearing it.', 'Eshitishingiz bilanoq.', 'Сразу, как услышали.'),
      ], 1, L('When there is no fit, a good seller honestly steps back and keeps the relationship.', 'Yaxshi sotuvchi mos kelmasa halol to‘xtaydi va munosabatni saqlaydi.', 'Если потребности нет, хороший продавец честно отступает и сохраняет отношения.')),
      item('bd8', say('We spent everything on renovation.', 'Hammasini ta’mirga sarfladik.', 'Всё потратили на ремонт.'), [
        t('Renovation is a big step, congratulations. When you reopen, what do you want guests to notice first?', 'Ta’mir — katta qadam, tabriklayman. Qayta ochilganingizda mehmonlar birinchi nimani sezishini xohlaysiz?', 'Ремонт — большой шаг, поздравляю. Когда откроетесь, что гости должны заметить в первую очередь?'),
        t('That was a mistake.', 'Bu xato bo‘lgan.', 'Это была ошибка.'),
        t('Then you can’t afford us.', 'Unda bizga pulingiz yetmaydi.', 'Тогда мы вам не по карману.'),
      ], 0, L('Connect with their plans; the budget conversation can come back when the value is clear.', 'Ularning rejalariga qiziqing; qiymat aniq bo‘lganda byudjet haqidagi suhbatga qaytish mumkin.', 'Свяжитесь с их планами: к бюджету можно вернуться, когда ценность станет ясна.')),
    ],
  },
  {
    id: 'drill.send_info', kind: 'drill', errorTag: 'no_next_step', node: 'objections.send_info', levels: [1, 5], minutes: 4, aiVariants: true,
    title: L('"Send me some information"', '«Ma’lumot yuboring»', '«Пришлите информацию»'),
    explain: L('"Send me info" is often a polite way to end the call. Agree, then ask two short questions so you send the right thing, and agree when you will talk about it. Better still, offer something they can try instead of a brochure.', '«Ma’lumot yuboring» ko‘pincha qo‘ng‘iroqni odob bilan tugatish usuli. Rozi bo‘ling, keyin to‘g‘ri narsani yuborish uchun ikkita qisqa savol bering va u haqda qachon gaplashishni kelishib oling. Yanada yaxshisi — buklet o‘rniga sinab ko‘radigan narsa taklif qiling.', '«Пришлите информацию» часто — вежливый способ закончить разговор. Согласитесь, задайте два коротких вопроса, чтобы отправить нужное, и договоритесь, когда обсудите. Ещё лучше — предложите попробовать вместо буклета.'),
    items: [
      item('si1', say('Just send me your information.', 'Shunchaki ma’lumotingizni yuboring.', 'Просто пришлите информацию.'), [
        t('Sure, I’ll send everything now.', 'Albatta, hozir hammasini yuboraman.', 'Конечно, сейчас всё пришлю.'),
        t('Happy to. So that I send what is useful, may I ask two quick questions?', 'Mamnuniyat bilan. Foydali narsani yuborishim uchun ikkita qisqa savol bersam bo‘ladimi?', 'С удовольствием. Чтобы прислать то, что вам пригодится, можно задать два коротких вопроса?'),
        t('Information won’t help, let’s meet.', 'Ma’lumot yordam bermaydi, uchrashaylik.', 'Информация не поможет, давайте встретимся.'),
      ], 1, L('Agree, but keep the conversation going with permission for two questions.', 'Rozi bo‘ling, lekin ikkita savolga ruxsat so‘rab suhbatni davom ettiring.', 'Согласитесь, но продолжите разговор, попросив разрешения на два вопроса.')),
      item('si2', t('You’ve asked your questions. How do you end?', 'Savollaringizni berdingiz. Qanday yakunlaysiz?', 'Вы задали вопросы. Как закончить?'), [
        t('“I’ll send it. Bye.”', '«Yuboraman. Xayr.»', '«Отправлю. До свидания».'),
        t('“I’ll send the two options that fit your office today. Can we look at them together on Thursday at 10 for ten minutes?”', '«Ofisingizga mos ikkita variantni bugun yuboraman. Payshanba kuni soat 10:00 da ularni birga o‘n daqiqa ko‘rib chiqsak bo‘ladimi?»', '«Сегодня отправлю два варианта, которые подходят вашему офису. Давайте посмотрим их вместе в четверг в 10:00? Это займёт минут десять».'),
        t('“Read it and call me.”', '«O‘qib, menga qo‘ng‘iroq qiling.»', '«Почитайте и позвоните мне».'),
      ], 1, L('Send something specific and fix a time to discuss it; otherwise the file is never opened.', 'Aniq narsa yuboring va muhokama vaqtini belgilang; aks holda fayl ochilmay qoladi.', 'Отправьте конкретное и назначьте время обсуждения, иначе файл не откроют.')),
      item('si3', say('Send me a presentation by e-mail.', 'Taqdimotni e-mailga yuboring.', 'Пришлите презентацию на почту.'), [
        t('Instead of slides, could we bring a free trial lunch for ten people, so your team can judge for themselves?', 'Slaydlar o‘rniga, jamoangiz o‘zi baho berishi uchun 10 kishilik bepul sinov tushligini olib kelsak bo‘ladimi?', 'Вместо слайдов можем привезти бесплатный пробный обед на десять человек, чтобы команда оценила сама?'),
        t('Our presentation has 40 slides.', 'Taqdimotimizda 40 ta slayd bor.', 'В нашей презентации 40 слайдов.'),
        t('Presentations are boring.', 'Taqdimotlar zerikarli.', 'Презентации скучные.'),
      ], 0, L('A real experience beats any document. Offer it only if you can really deliver it.', 'Haqiqiy tajriba har qanday hujjatdan yaxshi. Uni faqat haqiqatan bajara olsangiz taklif qiling.', 'Реальный опыт лучше любого документа. Предлагайте, только если действительно можете.')),
      item('si4', t('Which question makes the information you send relevant?', 'Qaysi savol yuboradigan ma’lumotingizni mos qiladi?', 'Какой вопрос делает отправляемую информацию уместной?'), [
        t('What is your e-mail?', 'E-mailingiz qanday?', 'Какая у вас почта?'),
        t('What’s the main thing you’d want this to fix for you?', 'Bu siz uchun birinchi navbatda nimani hal qilishini xohlardingiz?', 'Какую главную задачу вы хотели бы этим решить?'),
        t('Do you read e-mails?', 'E-mail o‘qiysizmi?', 'Вы читаете почту?'),
      ], 1, L('Know their main problem, then send only what speaks to it.', 'Avval asosiy muammosini bilib oling, keyin faqat shunga oid narsani yuboring.', 'Узнайте главную проблему и отправляйте только то, что к ней относится.')),
      item('si5', t('You sent the information yesterday as agreed. What do you do today?', 'Kelishilganidek, kecha ma’lumot yubordingiz. Bugun nima qilasiz?', 'Вчера вы отправили информацию, как договорились. Что сегодня?'), [
        t('Nothing; wait for them.', 'Hech narsa; ularni kuting.', 'Ничего, ждать их.'),
        t('Call at the agreed time and ask which option looked closest to what they need.', 'Kelishilgan vaqtda qo‘ng‘iroq qilib, qaysi variant ularga eng yaqin ekanini so‘rang.', 'Позвонить в оговорённое время и спросить, какой вариант ближе к тому, что им нужно.'),
        t('Send it again.', 'Yana yuboring.', 'Отправить ещё раз.'),
      ], 1, L('Follow up when agreed, with a question that moves to a choice.', 'Kelishilgan vaqtda bog‘laning va tanlovga olib boradigan savol bering.', 'Свяжитесь в оговорённое время с вопросом, ведущим к выбору.')),
      item('si6', say('Send it on Telegram and I’ll look when I have time.', 'Telegramga yuboring, vaqtim bo‘lganda ko‘raman.', 'Скиньте в Telegram, посмотрю, когда будет время.'), [
        t('Of course. I’ll keep it to one page. When is a good moment for me to call you about it — tomorrow evening or Saturday morning?', 'Albatta. Bir sahifadan oshirmayman. Bu haqda qachon qo‘ng‘iroq qilsam qulay — ertaga kechqurunmi yoki shanba ertalabmi?', 'Конечно. Уложусь в одну страницу. Когда удобно мне позвонить по этому поводу — завтра вечером или в субботу утром?'),
        t('You won’t have time, let’s decide now.', 'Vaqtingiz bo‘lmaydi, hozir hal qilaylik.', 'Времени у вас не будет, давайте решим сейчас.'),
        t('OK.', 'Mayli.', 'Хорошо.'),
      ], 0, L('Make it light (one page) and offer a choice of two times.', 'Materialni ixcham qiling (bir sahifa) va tanlash uchun ikki vaqtni taklif qiling.', 'Сделайте материал коротким (одна страница) и предложите на выбор два варианта времени.')),
      item('si7', t('What should the information you send contain?', 'Yuboradigan ma’lumotingizda nima bo‘lishi kerak?', 'Что должна содержать отправляемая информация?'), [
        t('Everything about the company.', 'Kompaniya haqida hamma narsa.', 'Всё о компании.'),
        t('Their problem in their words, two fitting options, one example and the next step.', 'Ularning muammosi — o‘z so‘zlari bilan, ikkita mos variant, bitta misol va keyingi qadam.', 'Их проблему их словами, два подходящих варианта, один пример и следующий шаг.'),
        t('Only the price list.', 'Faqat narxlar ro‘yxati.', 'Только прайс-лист.'),
      ], 1, L('Short and tailored: it should read like a continuation of your conversation.', 'Qisqa va moslashtirilgan: u suhbatingizning davomidek o‘qilishi kerak.', 'Коротко и под клиента: текст должен читаться как продолжение вашего разговора.')),
      item('si8', t('The buyer won’t answer any question and repeats “just send it”. Best move?', 'Mijoz hech qanday savolga javob bermay, «shunchaki yuboring»ni takrorlayapti. Eng yaxshi qadam?', 'Клиент не отвечает на вопросы и повторяет «просто пришлите». Лучший ход?'), [
        t('Insist on the questions.', 'Savollarda turib oling.', 'Настаивать на вопросах.'),
        t('Send a short, useful message and agree one moment to check if it helped.', 'Qisqa, foydali xabar yuboring va foydali bo‘lgan-bo‘lmaganini bilish uchun bitta vaqtni kelishib oling.', 'Отправить короткое полезное сообщение и договориться о времени, когда вы узнаете, помогло ли оно.'),
        t('Never call again.', 'Boshqa hech qachon qo‘ng‘iroq qilmang.', 'Больше никогда не звонить.'),
      ], 1, L('Respect a firm no to questions, but still leave with a small agreed next contact.', 'Mijoz savollarga javob berishdan qat’iy bosh tortsa, buni hurmat qiling, lekin baribir keyingi qisqa aloqani kelishib oling.', 'Уважайте твёрдый отказ отвечать на вопросы, но всё равно договоритесь о небольшом следующем контакте.')),
    ],
  },
  {
    id: 'drill.closing', kind: 'drill', errorTag: 'no_next_step', node: 'closing', levels: [1, 5], minutes: 4, aiVariants: true,
    title: L('Asking for the order and the next step', 'Buyurtma va keyingi qadamni so‘rash', 'Просить заказ и следующий шаг'),
    explain: L('Every conversation should end with one concrete step: the order, a meeting, a trial, a call with the decision maker, with a day and time. Summarise what you agreed, then ask. Asking is not pressure; leaving it vague is a lost sale.', 'Har bir suhbat bitta aniq qadam bilan tugashi kerak: buyurtma, uchrashuv, sinab ko‘rish, qaror qiluvchi bilan qo‘ng‘iroq — kun va vaqti bilan. Kelishilgan narsalarni xulosa qiling, keyin so‘rang. So‘rash bosim emas; noaniq qoldirish — yo‘qotilgan savdo.', 'Каждый разговор должен заканчиваться одним конкретным шагом: заказ, встреча, проба, звонок с тем, кто принимает решение, — с днём и временем. Подведите итог и спросите. Просить — не давить; оставить всё размытым — потерять продажу.'),
    items: [
      item('cl1', t('The buyer liked everything. How do you close?', 'Mijozga hammasi yoqdi. Qanday yakunlaysiz?', 'Клиенту всё понравилось. Как закрыть сделку?'), [
        t('“So, what do you think?”', '«Xo‘sh, nima deysiz?»', '«Ну, что думаете?»'),
        t('“Then let’s start with the first order of 20 boxes — shall we deliver on Tuesday or Wednesday?”', '«Unda 20 qutilik birinchi buyurtmadan boshlaylik — seshanba kuni olib kelaylikmi yoki chorshanbami?»', '«Тогда начнём с первого заказа на 20 коробок — привезти во вторник или в среду?»'),
        t('“Call me when you decide.”', '«Qaror qilganingizda qo‘ng‘iroq qiling.»', '«Позвоните, когда решите».'),
      ], 1, L('A clear proposal with a choice of two days makes saying yes easy.', 'Ikki kun tanlovi bilan aniq taklif «ha» deyishni osonlashtiradi.', 'Чёткое предложение с выбором из двух дней упрощает «да».')),
      item('cl2', t('Which next step is the strongest?', 'Qaysi keyingi qadam eng kuchli?', 'Какой следующий шаг самый сильный?'), [
        t('“Let’s keep in touch.”', '«Aloqada bo‘laylik.»', '«Будем на связи».'),
        t('“I’ll call next week.”', '«Keyingi hafta qo‘ng‘iroq qilaman.»', '«Позвоню на следующей неделе».'),
        t('“Demo at your office on Thursday at 3 p.m., with your partner. I’ll send a calendar invite now.”', '«Payshanba kuni soat 15:00 da ofisingizda sherigingiz bilan namoyish. Hozir kalendarga taklifnoma yuboraman.»', '«Демо у вас в офисе в четверг в 15:00 вместе с партнёром. Сейчас пришлю приглашение в календарь».'),
      ], 2, L('Specific day, time, place and people, confirmed in writing.', 'Aniq kun, vaqt, joy va odamlar, yozma tasdiq bilan.', 'Конкретные день, время, место и люди, с письменным подтверждением.')),
      item('cl3', say('OK, I think we’ll take it.', 'Mayli, menimcha, olamiz.', 'Хорошо, думаю, возьмём.'), [
        t('Great! Let me also tell you about our other ten products…', 'Ajoyib! Endi boshqa o‘nta mahsulotimiz haqida ham aytib beray…', 'Отлично! Давайте я ещё расскажу о десяти других продуктах…'),
        t('Excellent. Let’s confirm: 30 sets, delivery on Monday by 9, payment on delivery. Who will receive it?', 'Ajoyib. Tasdiqlaylik: 30 to‘plam, dushanba kuni soat 9 gacha yetkazib berish, yetkazilganda to‘lov. Kim qabul qiladi?', 'Отлично. Подтвердим: 30 комплектов, доставка в понедельник до 9, оплата при получении. Кто примет?'),
        t('Are you sure?', 'Ishonchingiz komilmi?', 'Вы уверены?'),
      ], 1, L('When they say yes, stop selling and confirm the details.', '«Ha» deyishsa, sotishni to‘xtating va tafsilotlarni tasdiqlang.', 'Когда говорят «да», прекратите продавать и подтвердите детали.')),
      item('cl4', t('Is it pressure to ask for the order?', 'Buyurtmani so‘rash bosimmi?', 'Просить заказ — это давление?'), [
        t('Yes, never ask; wait until the buyer offers.', 'Ha, hech qachon so‘ramang; mijoz o‘zi taklif qilguncha kuting.', 'Да, никогда не просить; ждать, пока клиент сам предложит.'),
        t('No — asking clearly when the buyer is ready is good service; pressure is pushing when they are not.', 'Yo‘q — mijoz tayyor bo‘lganda aniq so‘rash yaxshi xizmat; bosim — tayyor bo‘lmaganda qistash.', 'Нет — чётко попросить, когда клиент готов, это хороший сервис; давление — дожимать, когда он не готов.'),
        t('Only if the buyer is young.', 'Faqat mijoz yosh bo‘lsa.', 'Только если клиент молодой.'),
      ], 1, L('Buyers expect you to propose the next step; the timing and tone make it service, not pressure.', 'Mijozlar keyingi qadamni sizdan kutadi; to‘g‘ri vaqt va ohang uni bosim emas, xizmatga aylantiradi.', 'Клиенты ждут, что вы предложите следующий шаг; время и тон делают это сервисом, а не давлением.')),
      item('cl5', t('The buyer isn’t ready to buy. What is a good close?', 'Mijoz sotib olishga tayyor emas. Yaxshi yakun qanday?', 'Клиент не готов покупать. Как лучше завершить разговор?'), [
        t('A smaller commitment: a trial, a sample or a meeting with a date.', 'Kichikroq majburiyat: sinab ko‘rish, namuna yoki sanasi belgilangan uchrashuv.', 'Меньшее обязательство: проба, образец или встреча с датой.'),
        t('Ask for the order three more times.', 'Buyurtmani yana uch marta so‘rang.', 'Попросить заказ ещё три раза.'),
        t('Say goodbye and hope.', 'Xayrlashib, umid qiling.', 'Попрощаться и надеяться.'),
      ], 0, L('Close on the next step, not only on the sale.', 'Suhbatni faqat sotuv bilan emas, keyingi qadam bilan ham yakunlang.', 'Закрывайте на следующий шаг, а не только на продажу.')),
      item('cl6', t('Which summary before the close is best?', 'Yakundan oldingi qaysi xulosa eng yaxshi?', 'Какое резюме перед закрытием лучше?'), [
        t('“So: you need delivery before 9, two sizes, and invoices for your accountant. We do all three. Shall we start Monday?”', '«Demak: sizga soat 9 gacha yetkazib berish, ikkita o‘lcham va buxgalteringiz uchun hisob-faktura kerak. Biz uchalasini ham qilamiz. Dushanbadan boshlaymizmi?»', '«Итак: вам нужна доставка до 9, два размера и счета-фактуры для бухгалтера. Мы делаем все три. Начнём с понедельника?»'),
        t('“We talked a lot today.”', '«Bugun ko‘p gaplashdik.»', '«Мы сегодня много поговорили».'),
        t('“Our company is great, as you heard.”', '«Eshitganingizdek, kompaniyamiz ajoyib.»', '«Как вы слышали, наша компания отличная».'),
      ], 0, L('Summarise their needs, show they are met, then ask.', 'Ehtiyojlarini xulosa qiling, ularni qondira olishingizni ko‘rsating, keyin so‘rang.', 'Подытожьте их потребности, покажите, что можете выполнить каждую, и спросите.')),
      item('cl7', say('Let’s talk again sometime.', 'Qachondir yana gaplashamiz.', 'Как-нибудь ещё поговорим.'), [
        t('Sure, anytime.', 'Albatta, istalgan vaqt.', 'Конечно, в любое время.'),
        t('Gladly. Shall I put us down for Friday at 11, or is next Monday better?', 'Mamnuniyat bilan. Juma kuni soat 11 ga yozib qo‘yaymi yoki keyingi dushanba qulayroqmi?', 'С удовольствием. Записать нас на пятницу в 11 или удобнее в понедельник?'),
        t('Why not now?', 'Nega hozir emas?', 'А почему не сейчас?'),
      ], 1, L('Turn "sometime" into a specific time.', '«Qachondir»ni aniq vaqtga aylantiring.', 'Превратите «как-нибудь» в конкретное время.')),
      item('cl8', t('After the call, what confirms the next step best?', 'Qo‘ng‘iroqdan keyin keyingi qadamni nima eng yaxshi tasdiqlaydi?', 'Что после звонка лучше всего подтверждает следующий шаг?'), [
        t('Nothing; they will remember.', 'Hech narsa; ular eslab qoladi.', 'Ничего, они запомнят.'),
        t('A short message the same day with what was agreed, the date and time.', 'O‘sha kuniyoq nima kelishilgani, sana va vaqt yozilgan qisqa xabar.', 'Короткое сообщение в тот же день: о чём договорились, дата и время.'),
        t('Calling every day until the meeting.', 'Uchrashuvgacha har kuni qo‘ng‘iroq qilish.', 'Звонить каждый день до встречи.'),
      ], 1, L('A written confirmation the same day prevents misunderstandings and shows you are reliable.', 'O‘sha kungi yozma tasdiq tushunmovchilikning oldini oladi va ishonchli ekaningizni ko‘rsatadi.', 'Письменное подтверждение в тот же день предотвращает недопонимание и показывает, что на вас можно положиться.')),
    ],
  },
  {
    id: 'drill.follow_up', kind: 'drill', errorTag: 'slow_follow_up', node: 'follow_up', levels: [1, 5], minutes: 4, aiVariants: true,
    title: L('Follow-up that people answer', 'Javob beriladigan follow-up', 'Follow-up, на который отвечают'),
    explain: L('Follow up when you promised, refer to the last conversation, and bring something new: an answer, an example, a short summary, a useful idea. End with an easy question. "Just checking in" with nothing new is easy to ignore.', 'Va’da qilgan vaqtda bog‘laning, oxirgi suhbatni eslating va yangi narsa olib keling: javob, misol, qisqa xulosa, foydali g‘oya. Oson savol bilan yakunlang. Yangi narsasiz «shunchaki so‘ramoqchi edim»ni e’tiborsiz qoldirish oson.', 'Связывайтесь, когда обещали, ссылайтесь на прошлый разговор и приносите новое: ответ, пример, краткое резюме, полезную идею. Заканчивайте лёгким вопросом. Пустое «просто уточняю» легко проигнорировать.'),
    items: [
      item('fu1', t('Which follow-up message is best?', 'Qaysi follow-up xabar eng yaxshi?', 'Какое follow-up-сообщение лучше?'), [
        t('Hi, just checking in. Any news?', 'Salom, shunchaki so‘ramoqchi edim. Yangilik bormi?', 'Здравствуйте, просто уточняю. Есть новости?'),
        t('Hi Sanjar, as promised, here is how another parts shop set up its stock list in one afternoon. Want me to do the same with you on Thursday?', 'Assalomu alaykum, Sanjar! Va’da qilganimdek, boshqa bir ehtiyot qismlar do‘koni tovarlar ro‘yxatini yarim kunda qanday tartibga solganini yuboryapman. Payshanba kuni siz bilan ham shunday qilaylikmi?', 'Здравствуйте, Санжар! Как и договаривались, вот как другой магазин запчастей за полдня навёл порядок в списке товаров. Сделаем так же с вами в четверг?'),
        t('Why don’t you answer?', 'Nega javob bermayapsiz?', 'Почему вы не отвечаете?'),
      ], 1, L('Personal, keeps a promise, brings something useful and proposes a concrete step.', 'Shaxsiy, va’dani bajaradi, foydali narsa olib keladi va aniq qadam taklif qiladi.', 'Личное сообщение: выполняет обещание, приносит пользу и предлагает конкретный шаг.')),
      item('fu2', t('When should you send the summary after a meeting?', 'Uchrashuvdan keyin xulosani qachon yuborish kerak?', 'Когда отправлять резюме после встречи?'), [
        t('The same day.', 'O‘sha kuni.', 'В тот же день.'),
        t('After a week.', 'Bir haftadan keyin.', 'Через неделю.'),
        t('Only if they ask.', 'Faqat so‘rashsa.', 'Только если попросят.'),
      ], 0, L('The same day, while the conversation is fresh and you look reliable.', 'O‘sha kuni, suhbat hali esdan chiqmagan paytda — bu sizni ishonchli ko‘rsatadi.', 'В тот же день, пока разговор свеж и вы выглядите надёжно.')),
      item('fu3', t('A buyer hasn’t replied for two weeks. Best next message?', 'Mijoz ikki haftadan beri javob bermayapti. Eng yaxshi keyingi xabar?', 'Клиент не отвечает две недели. Лучшее следующее сообщение?'), [
        t('Another “just checking in”.', 'Yana bir «shunchaki so‘ramoqchi edim».', 'Ещё одно «просто уточняю».'),
        t('A short, useful message tied to their problem, with an easy yes/no question.', 'Ularning muammosiga bog‘liq qisqa, foydali xabar va oson ha/yo‘q savoli.', 'Короткое полезное сообщение по их проблеме с лёгким вопросом «да/нет».'),
        t('A message saying the offer will expire tonight.', 'Taklif bugun kechqurun tugaydi degan xabar.', 'Сообщение, что предложение истекает сегодня вечером.'),
      ], 1, L('Give them a reason to reply and make replying easy. Fake deadlines damage trust.', 'Javob berishga sabab bering va javobni osonlashtiring. Soxta muddatlar ishonchni buzadi.', 'Дайте повод ответить и упростите ответ. Фальшивые сроки подрывают доверие.')),
      item('fu4', say('Not now, call me in a month.', 'Hozir emas, bir oydan keyin qo‘ng‘iroq qiling.', 'Не сейчас, позвоните через месяц.'), [
        t('OK.', 'Mayli.', 'Хорошо.'),
        t('Sure. So that the call is useful, what will be different in a month?', 'Albatta. Qo‘ng‘iroq foydali bo‘lishi uchun bilib olsam: bir oyda nima o‘zgaradi?', 'Конечно. Чтобы звонок был полезным: что изменится через месяц?'),
        t('A month is too long.', 'Bir oy juda uzoq.', 'Месяц — это слишком долго.'),
      ], 1, L('Find the reason for the delay; it often reveals the real obstacle you can help with.', 'Kechiktirish sababini toping; u ko‘pincha siz yordam bera oladigan asl to‘siqni ko‘rsatadi.', 'Узнайте причину отсрочки: часто она раскрывает реальное препятствие, с которым можно помочь.')),
      item('fu5', t('How often should you follow up with a quiet lead?', 'Jim qolgan mijoz bilan qanchalik tez-tez bog‘lanish kerak?', 'Как часто связываться с молчащим клиентом?'), [
        t('Every day until they answer.', 'Javob berguncha har kuni.', 'Каждый день, пока не ответит.'),
        t('A few times, spaced out, each with something new — then stop politely and leave the door open.', 'Bir necha marta, oraliq bilan, har safar yangi narsa bilan — keyin odob bilan to‘xtab, eshikni ochiq qoldiring.', 'Несколько раз, с интервалами, каждый раз с новым — затем вежливо остановиться и оставить дверь открытой.'),
        t('Once only.', 'Faqat bir marta.', 'Только один раз.'),
      ], 1, L('Persistent but respectful: spaced, valuable messages, then a polite close.', 'Qat’iyatli, lekin hurmat bilan: vaqt oralatib yuborilgan foydali xabarlar, keyin odobli yakun.', 'Настойчиво, но уважительно: редкие полезные сообщения, затем вежливое завершение.')),
      item('fu6', t('What should a follow-up call open with?', 'Follow-up qo‘ng‘iroq nima bilan boshlanishi kerak?', 'С чего начинать повторный звонок?'), [
        t('The whole presentation again.', 'Butun taqdimot qaytadan.', 'Снова со всей презентации.'),
        t('A reminder of what they said last time and why you are calling now.', 'Ular oxirgi marta nima deganini eslatish va nega hozir qo‘ng‘iroq qilayotganingizni aytish.', 'Напоминание о том, что они сказали в прошлый раз, и о том, почему вы звоните сейчас.'),
        t('Asking why they didn’t call you.', 'Nega sizga qo‘ng‘iroq qilmaganini so‘rash.', 'Вопрос, почему они не перезвонили.'),
      ], 1, L('Pick up the thread from their words and give a reason for the call today.', 'Suhbatni ularning o‘tgan safargi so‘zlaridan davom ettiring va bugungi qo‘ng‘iroq sababini ayting.', 'Подхватите разговор с их же слов и назовите повод сегодняшнего звонка.')),
      item('fu7', t('You promised a calculation by Tuesday but it isn’t ready. What do you do?', 'Seshanbagacha hisob-kitob va’da qilgandingiz, lekin tayyor emas. Nima qilasiz?', 'Вы обещали расчёт к вторнику, но он не готов. Что делать?'), [
        t('Say nothing and send it when ready.', 'Hech narsa demay, tayyor bo‘lganda yuboring.', 'Ничего не говорить и отправить, когда будет готов.'),
        t('Message on Tuesday morning: it will come on Wednesday by noon, and why.', 'Seshanba ertalab yozing: hisob-kitob chorshanba tushgacha bo‘ladi, sababini ham ayting.', 'Написать во вторник утром, что расчёт будет в среду до обеда, и объяснить почему.'),
        t('Send an unfinished calculation.', 'Tugallanmagan hisobni yuboring.', 'Отправить недоделанный расчёт.'),
      ], 1, L('Reliability is part of the value. If a promise moves, say so before the deadline.', 'Ishonchlilik qiymatning bir qismi. Va’dani bajarish kechiksa, muddatdan oldin ayting.', 'Надёжность — часть ценности. Если срок сдвигается, предупредите заранее.')),
      item('fu8', t('Which subject line or first line gets a follow-up opened?', 'Qaysi xat mavzusi yoki birinchi qator follow-up xabarni ochishga undaydi?', 'Какая тема или первая строка побудит открыть follow-up-сообщение?'), [
        t('“Following up”', '«Eslatma»', '«Напоминаю о себе»'),
        t('“Your question about delivery on weekends — answer inside”', '«Dam olish kunlari yetkazib berish haqidagi savolingiz — javobi ichida»', '«Ваш вопрос о доставке в выходные — ответ внутри»'),
        t('“URGENT!!!”', '«SHOSHILINCH!!!»', '«СРОЧНО!!!»'),
      ], 1, L('Refer to their own question; it promises value, not noise.', 'Ularning o‘z savolini tilga oling: bu shovqin emas, foyda va’da qiladi.', 'Ссылайтесь на их собственный вопрос — это обещает пользу, а не шум.')),
    ],
  },
  {
    id: 'drill.negotiation', kind: 'drill', errorTag: 'early_discount', node: 'negotiation', levels: [2.5, 5], minutes: 5, aiVariants: true,
    title: L('Negotiation: trade, don’t give', 'Muzokara: bermang, almashing', 'Переговоры: меняйтесь, а не дарите'),
    explain: L('In a negotiation every concession is traded: "If you…, then I…". Find what the other side really needs besides price, know your lowest acceptable point before you start, and don’t accept their first number or split the difference by reflex. Put the result in writing.', 'Muzokarada har bir yon berish evaziga nimadir olinadi: «Agar siz…, unda men…». Narxdan tashqari ularga nima kerakligini toping, boshlashdan oldin eng past maqbul chegarangizni biling, ularning birinchi raqamini qabul qilmang va o‘ylamay turib farqni teng bo‘lib qo‘ymang. Natijani yozma qayd eting.', 'В переговорах каждая уступка — обмен: «Если вы…, то я…». Узнайте, что другой стороне нужно кроме цены, знайте свою нижнюю границу до начала, не принимайте их первую цифру и не делите разницу пополам по привычке. Фиксируйте итог письменно.'),
    items: [
      item('ng1', say('I need 30% off, or I go elsewhere.', '30% chegirma kerak, bo‘lmasa boshqa joyga ketaman.', 'Мне нужна скидка 30%, иначе уйду к другим.'), [
        t('OK, 30%.', 'Mayli, 30%.', 'Хорошо, 30%.'),
        t('Let’s split it: 15%.', 'O‘rtasini olaylik: 15%.', 'Давайте пополам: 15%.'),
        t('I hear you. Besides the price, what would make us the right partner for you?', 'Tushunaman. Narxdan tashqari, biz siz uchun mos hamkor bo‘lishimiz uchun yana nima muhim?', 'Понимаю. А кроме цены, что сделает нас подходящим партнёром для вас?'),
      ], 2, L('Don’t react to the anchor; find the other needs you can trade on.', 'Birinchi aytilgan talabga (yakorga) darrov javob qaytarmang; almashish mumkin bo‘lgan boshqa ehtiyojlarni toping.', 'Не реагируйте на якорь — найдите другие потребности, которыми можно меняться.')),
      item('ng2', t('Which sentence trades a concession correctly?', 'Qaysi jumlada yon berish to‘g‘ri evazga almashtirilgan?', 'В какой фразе уступка правильно обменивается на что-то взамен?'), [
        t('“I’ll give you 5% because I like you.”', '«Sizni yoqtirganim uchun 5% beraman.»', '«Дам 5%, потому что вы мне симпатичны».'),
        t('“If you sign for twelve months and pay monthly in advance, I can fix the price for the year.”', '«Agar o‘n ikki oyga imzolab, har oy oldindan to‘lasangiz, narxni bir yilga qotirib qo‘yaman.»', '«Если подпишете на двенадцать месяцев и будете платить помесячно вперёд, зафиксирую цену на год».'),
        t('“Fine, whatever you want.”', '«Mayli, nima xohlasangiz.»', '«Ладно, как хотите».'),
      ], 1, L('"If you…, then I…": the concession has a price.', '«Agar siz…, unda men…»: yon berishning ham narxi bor.', '«Если вы…, то я…»: у уступки есть цена.')),
      item('ng3', t('Before a negotiation, what must you know?', 'Muzokaradan oldin nimani bilishingiz shart?', 'Что нужно знать до переговоров?'), [
        t('Your lowest acceptable terms and what you can trade.', 'Eng past maqbul shartlaringiz va nima bilan almashish mumkinligi.', 'Свои минимально допустимые условия и то, чем можно меняться.'),
        t('Only your list price.', 'Faqat prays-listdagi narxingiz.', 'Только свой прайс-лист.'),
        t('The buyer’s salary.', 'Mijozning maoshi.', 'Зарплату клиента.'),
      ], 0, L('Without a floor and a list of tradeables you will give too much under pressure.', 'Pastki chegara va evaziga beriladigan narsalar ro‘yxatisiz bosim ostida ortiqcha berib yuborasiz.', 'Без нижней границы и списка того, чем можно меняться, под давлением вы отдадите слишком много.')),
      item('ng4', say('Other brands offered more. What will you do?', 'Boshqa brendlar ko‘proq taklif qildi. Siz nima qilasiz?', 'Другие бренды предложили больше. Что сделаете вы?'), [
        t('What exactly did they offer, and what problem would that solve for you?', 'Aynan nima taklif qilishdi va bu siz uchun qaysi muammoni hal qiladi?', 'Что именно они предложили и какую вашу проблему это решит?'),
        t('We will give more than them.', 'Biz ulardan ko‘proq beramiz.', 'Мы дадим больше, чем они.'),
        t('That’s impossible.', 'Bunday bo‘lishi mumkin emas.', 'Это невозможно.'),
      ], 0, L('Understand the competing offer and the problem behind it before you respond.', 'Javob berishdan oldin raqobatchi taklifni va uning ortidagi muammoni tushuning.', 'Поймите конкурирующее предложение и проблему за ним, прежде чем отвечать.')),
      item('ng5', t('You made a concession. What should you get?', 'Siz yon berdingiz. Nima olishingiz kerak?', 'Вы уступили. Что вы должны получить?'), [
        t('Nothing; it’s goodwill.', 'Hech narsa; bu xayrixohlik.', 'Ничего — это жест доброй воли.'),
        t('Something of value to you: volume, prepayment, a longer contract or a better shelf position.', 'Siz uchun qimmatli narsa: hajm, oldindan to‘lov, uzoqroq shartnoma yoki yaxshiroq javon joyi.', 'Что-то ценное для вас: объём, предоплату, более долгий договор или лучшее место на полке.'),
        t('A thank-you.', 'Rahmat.', 'Спасибо.'),
      ], 1, L('A free concession invites the next request; a traded one closes the topic.', 'Bepul yon berish yangi talabni chaqiradi; evaziga berilgani esa mavzuni yopadi.', 'Бесплатная уступка провоцирует новую просьбу, обменная — закрывает тему.')),
      item('ng6', t('The buyer asks for something below your floor. Best answer?', 'Mijoz pastki chegarangizdan pastroq narsa so‘rayapti. Eng yaxshi javob?', 'Клиент просит ниже вашей нижней границы. Лучший ответ?'), [
        t('Agree to keep the client.', 'Mijozni saqlab qolish uchun rozi bo‘ling.', 'Согласиться, чтобы сохранить клиента.'),
        t('Say calmly you can’t go there, explain why briefly, and offer a different package.', 'Bunchalik tusha olmasligingizni xotirjam ayting, qisqacha sababini tushuntiring va boshqa paket taklif qiling.', 'Спокойно сказать, что на это пойти не можете, кратко объяснить почему и предложить другой пакет.'),
        t('End the meeting angrily.', 'Uchrashuvni jahl bilan tugating.', 'Сердито закончить встречу.'),
      ], 1, L('A calm "no" with a reason and an alternative keeps respect on both sides.', 'Sababi va muqobil varianti bilan aytilgan xotirjam «yo‘q» ikki tomonning hurmatini saqlaydi.', 'Спокойное «нет» с причиной и альтернативой сохраняет взаимное уважение.')),
      item('ng7', t('You have agreed terms in the meeting. What next?', 'Uchrashuvda shartlar kelishildi. Keyin nima?', 'В ходе встречи договорились об условиях. Что дальше?'), [
        t('Shake hands and leave it at that.', 'Qo‘l berib ko‘rishing va shu bilan cheklaning.', 'Пожать руки и на этом всё.'),
        t('Read back the terms and send them in writing the same day, with a signing date.', 'Shartlarni ovoz chiqarib takrorlang va o‘sha kuniyoq ularni imzolash sanasi bilan yozma yuboring.', 'Проговорить условия вслух и в тот же день отправить их письменно с датой подписания.'),
        t('Wait for them to write.', 'Ular yozishini kuting.', 'Ждать, пока напишут они.'),
      ], 1, L('Memories differ; a written summary protects the deal.', 'Har kim har xil eslab qoladi; yozma xulosa kelishuvni himoya qiladi.', 'Каждый запоминает по-своему; письменное подтверждение защищает сделку.')),
      item('ng8', t('The other side goes silent after your offer. What do you do?', 'Taklifingizdan keyin ikkinchi tomon jim qoldi. Nima qilasiz?', 'После вашего предложения другая сторона молчит. Что делать?'), [
        t('Lower the offer quickly to fill the silence.', 'Jimlikni to‘ldirish uchun taklifni tezda pasaytiring.', 'Быстро снизить предложение, чтобы заполнить паузу.'),
        t('Wait calmly, then ask: “How does that sound to you?”', 'Xotirjam kuting, keyin so‘rang: «Bu sizga qanday tuyuladi?»', 'Спокойно подождать, затем спросить: «Как вам такой вариант?»'),
        t('Start talking about the weather.', 'Ob-havo haqida gapira boshlang.', 'Заговорить о погоде.'),
      ], 1, L('Silence is a test; don’t negotiate against yourself.', 'Jimlik — sinov; o‘zingiz bilan o‘zingiz savdolashmang.', 'Молчание — проверка: не торгуйтесь сами с собой.')),
    ],
  },
  {
    id: 'drill.ethics', kind: 'drill', errorTag: 'pressure', node: 'closing', levels: [1, 5], minutes: 4, aiVariants: true,
    title: L('Selling honestly: no pressure, no invented claims', 'Halol sotish: bosimsiz, o‘ylab topilgan da’volarsiz', 'Честные продажи: без давления и выдуманных фактов'),
    explain: L('Long-term sales come from trust. Say only what is true, make real offers, and let people decide in their own time. Fake urgency, invented numbers and promises you cannot keep may win today and lose the customer, the referrals and your name.', 'Uzoq muddatli savdo ishonchdan keladi. Faqat haqiqatni ayting, haqiqiy takliflar qiling va odamlarga shoshilmasdan qaror qilish imkonini bering. Soxta shoshilinchlik, o‘ylab topilgan raqamlar va bajarib bo‘lmaydigan va’dalar bugun foyda keltirishi mumkin, lekin buning evaziga mijozni, tavsiyalarni va obro‘ingizni yo‘qotasiz.', 'Долгосрочные отношения с клиентами строятся на доверии. Говорите только правду, делайте реальные предложения и давайте людям решать в своё время. Фальшивая срочность, выдуманные цифры и невыполнимые обещания могут помочь сегодня, но вы потеряете клиента, рекомендации и репутацию.'),
    items: [
      item('et1', t('Which line is honest urgency?', 'Qaysi jumlada shoshilinchlik halol?', 'Какая фраза — честная срочность?'), [
        t('“Only today! Tomorrow the price doubles!” (not true)', '«Faqat bugun! Ertaga narx ikki baravar oshadi!» (haqiqat emas)', '«Только сегодня! Завтра цена удвоится!» (неправда)'),
        t('“The April dates for halls fill up by January; if April matters, it’s worth deciding this month.” (true)', '«Zallarning aprel oyidagi sanalari yanvargacha band bo‘lib ketadi; aprel siz uchun muhim bo‘lsa, shu oy qaror qilgan ma’qul.» (haqiqat)', '«Апрельские даты залов разбирают к январю; если важен апрель, стоит решить в этом месяце». (правда)'),
        t('“Everyone is buying, you will be the last.”', '«Hamma sotib olyapti, siz oxirgi bo‘lasiz.»', '«Все покупают, вы будете последним».'),
      ], 1, L('Real urgency is a true fact tied to the buyer’s own goal.', 'Haqiqiy shoshilinchlik — mijozning o‘z maqsadiga bog‘liq haqiqiy fakt.', 'Настоящая срочность — правдивый факт, связанный с целью клиента.')),
      item('et2', say('Is it guaranteed to work?', 'Ishlashi kafolatlanganmi?', 'Это гарантированно сработает?'), [
        t('Yes, 100%, for everyone.', 'Ha, 100%, hamma uchun.', 'Да, на 100%, у всех.'),
        t('Here is exactly what our guarantee covers, and here is what it depends on.', 'Kafolatimiz aynan nimani qamrab olishini va natija nimaga bog‘liqligini aytib beray.', 'Вот что именно покрывает наша гарантия и от чего зависит результат.'),
        t('Don’t worry about it.', 'Bu haqda xavotir olmang.', 'Не беспокойтесь об этом.'),
      ], 1, L('State the real guarantee and its limits. Over-promising creates angry customers.', 'Haqiqiy kafolat va uning chegaralarini ayting. Ortiqcha va’da berish mijozlarni norozi qiladi.', 'Называйте реальную гарантию и её границы. Обещания сверх меры порождают недовольных клиентов.')),
      item('et3', t('The buyer asks for a statistic you don’t have. What do you say?', 'Mijoz sizda yo‘q statistikani so‘rayapti. Nima deysiz?', 'Клиент просит статистику, которой у вас нет. Что сказать?'), [
        t('Make up a believable number.', 'Ishonarli raqam o‘ylab toping.', 'Придумать правдоподобную цифру.'),
        t('“I don’t have that figure; I can find out and send it by Friday, or give you a client to ask.”', '«Menda bu raqam yo‘q; aniqlab, jumagacha yuboraman yoki mijozlarimizdan biri bilan bog‘lab qo‘yaman — o‘zingiz so‘rab ko‘rasiz.»', '«У меня нет этой цифры; узнаю и пришлю к пятнице или дам контакт клиента, у которого можно спросить».'),
        t('Change the subject.', 'Mavzuni o‘zgartiring.', 'Сменить тему.'),
      ], 1, L('Saying "I don’t know, I’ll find out" builds more trust than any invented number.', '«Bilmayman, aniqlayman» deyish o‘ylab topilgan har qanday raqamdan ko‘proq ishonch uyg‘otadi.', '«Не знаю, уточню» вызывает больше доверия, чем любая выдуманная цифра.')),
      item('et4', t('The product doesn’t fit what the buyer needs. Best move?', 'Mahsulot mijozning ehtiyojiga mos kelmaydi. Eng yaxshi qadam?', 'Продукт не подходит под потребность клиента. Лучший ход?'), [
        t('Sell it anyway.', 'Baribir soting.', 'Всё равно продать.'),
        t('Say so honestly and, if you can, point them to what would fit.', 'Halol ayting va iloji bo‘lsa, mos keladigan narsani ko‘rsating.', 'Честно сказать и, если можете, подсказать, что подойдёт.'),
        t('Hide the limitation.', 'Kamchilikni yashiring.', 'Скрыть ограничение.'),
      ], 1, L('An honest "this isn’t right for you" earns referrals and future sales.', 'Halol «bu sizga mos emas» tavsiyalar va kelajakdagi savdolarni olib keladi.', 'Честное «вам это не подходит» приносит рекомендации и будущие продажи.')),
      item('et5', t('A customer is under 18 and wants to buy on credit. What do you do?', 'Mijoz 18 yoshga to‘lmagan va nasiyaga olmoqchi. Nima qilasiz?', 'Покупателю нет 18, и он хочет купить в кредит. Что делать?'), [
        t('Sell quickly before parents find out.', 'Ota-onasi bilib qolmasidan tez soting.', 'Быстро продать, пока родители не узнали.'),
        t('Follow the shop’s rules for age and ask him to come with a parent.', 'Do‘konning yosh bo‘yicha qoidalariga amal qiling va ota-onasi bilan kelishini so‘rang.', 'Следовать правилам магазина о возрасте и попросить прийти с родителем.'),
        t('Ask him to lie about his age.', 'Undan yoshi haqida yolg‘on gapirishni so‘rang.', 'Попросить его соврать о возрасте.'),
      ], 1, L('Follow the rules and protect young customers; it protects you and the shop too.', 'Qoidalarga amal qiling va yosh mijozlarni himoya qiling; bu sizni va do‘konni ham himoya qiladi.', 'Соблюдайте правила и защищайте юных покупателей — это защищает и вас, и магазин.')),
      item('et6', t('Which is fair persuasion?', 'Qaysi biri adolatli ishontirish?', 'Что из этого — честное убеждение?'), [
        t('Using the buyer’s own goals and true facts.', 'Mijozning o‘z maqsadlari va haqiqiy faktlardan foydalanish.', 'Опираться на цели клиента и правдивые факты.'),
        t('Making the buyer feel stupid for waiting.', 'Ikkilangani uchun mijozni o‘zini ahmoqdek his qildirish.', 'Давать клиенту почувствовать себя глупо из-за того, что он не спешит.'),
        t('Hiding the full price until the end.', 'To‘liq narxni oxirigacha yashirish.', 'Скрывать полную цену до конца.'),
      ], 0, L('Persuasion helps the buyer see true value; manipulation works against them.', 'Ishontirish mijozga haqiqiy qiymatni ko‘rishga yordam beradi; manipulyatsiya unga qarshi ishlaydi.', 'Убеждение помогает увидеть настоящую ценность; манипуляция работает против клиента.')),
      item('et7', say('Can you write a higher price on the invoice so I can claim it back?', 'Hisob-fakturaga narxni oshirib yozib bera olasizmi? Keyin kompaniyamdan qaytarib olaman.', 'Можете указать в счёте сумму побольше? Мне потом компания возместит.'), [
        t('Sure, no problem.', 'Albatta, muammo yo‘q.', 'Конечно, без проблем.'),
        t('I can’t do that, but I can give you a clear invoice and explain each item for your company.', 'Buni qila olmayman, lekin aniq hisob-faktura berib, kompaniyangiz uchun har bir bandni tushuntirib beraman.', 'Так не могу, но могу дать понятный счёт и расписать каждую позицию для вашей компании.'),
        t('Only for a bonus.', 'Faqat bonus evaziga.', 'Только за бонус.'),
      ], 1, L('Refuse politely and offer the honest help you can give.', 'Muloyimlik bilan rad eting va berishingiz mumkin bo‘lgan halol yordamni taklif qiling.', 'Вежливо откажите и предложите честную помощь, которую можете дать.')),
      item('et8', t('You made a mistake in a quote that the customer accepted. What now?', 'Mijoz qabul qilgan narx taklifida xato qildingiz. Endi nima qilasiz?', 'Вы ошиблись в коммерческом предложении, которое клиент уже принял. Что теперь?'), [
        t('Hope they don’t notice.', 'Sezmaydi deb umid qiling.', 'Надеяться, что не заметят.'),
        t('Tell them quickly, explain, and offer a fair fix.', 'Tezda ayting, tushuntiring va adolatli yechim taklif qiling.', 'Быстро сообщить, объяснить и предложить честное решение.'),
        t('Blame the accountant.', 'Buxgalterni ayblang.', 'Свалить на бухгалтера.'),
      ], 1, L('Owning mistakes quickly is what makes customers trust you with the next order.', 'Xatolarni tez tan olish mijozlarning keyingi buyurtmada sizga ishonishiga sabab bo‘ladi.', 'Если быстро признавать ошибки, клиенты доверят вам и следующий заказ.')),
    ],
  },
  {
    id: 'drill.dm', kind: 'drill', errorTag: 'price_only_reply', node: 'dm', levels: [1, 4], minutes: 4, aiVariants: true,
    title: L('Telegram and Instagram replies that sell', 'Sotadigan Telegram va Instagram javoblari', 'Ответы в Telegram и Instagram, которые продают'),
    explain: L('In DMs: reply fast, answer the question first (yes, the price), add one line of value, and end with an easy question. Short lines, no walls of text, no "write if interested".', 'DMda: tez javob bering, avval savolning o‘ziga javob bering (ha, narxni ham ayting), bitta qiymat jumlasini qo‘shing va oson savol bilan yakunlang. Qisqa qatorlar, uzun matn yo‘q, «qiziqsangiz yozing» yo‘q.', 'В директе: отвечайте быстро, сначала на сам вопрос (да, называйте цену), добавьте одну строку ценности и закончите лёгким вопросом. Короткие строки, без простыней и «пишите, если интересно».'),
    items: [
      item('dm1', t('A buyer writes “price?” under a post with a dress. Best reply?', 'Mijoz ko‘ylak posti ostida «narxi?» deb yozdi. Eng yaxshi javob?', 'Под постом с платьем пишут «цена?». Лучший ответ?'), [
        t('350,000.', '350 000.', '350 000.'),
        t('Hello! 350,000 UZS, free length alterations. Which size do you need?', 'Assalomu alaykum! 350 000 so‘m, uzunligini bepul to‘g‘rilab beramiz. Qaysi o‘lcham kerak?', 'Здравствуйте! 350 000 сумов, длину подгоним бесплатно. Какой размер нужен?'),
        t('Price in DM.', 'Narxi DMda.', 'Цена в директе.'),
      ], 1, L('Answer the price, add one real benefit, ask an easy question.', 'Narxni ayting, bitta haqiqiy foydani qo‘shing, oson savol bering.', 'Назовите цену, добавьте реальную выгоду и задайте лёгкий вопрос.')),
      item('dm2', t('How fast should you reply to a new DM?', 'Yangi DMga qanchalik tez javob berish kerak?', 'Как быстро отвечать на новое сообщение?'), [
        t('Within minutes during working hours, or with an honest auto-reply saying when.', 'Ish vaqtida bir necha daqiqa ichida yoki qachon javob berishni aytadigan halol avtojavob bilan.', 'В течение нескольких минут в рабочее время — или честным автоответом с указанием, когда ответите.'),
        t('The next day is fine.', 'Ertasi kun ham bo‘ladi.', 'На следующий день нормально.'),
        t('Only if they write twice.', 'Faqat ikki marta yozishsa.', 'Только если напишут дважды.'),
      ], 0, L('DM buyers often ask several shops at once; speed wins.', 'DM mijozlari ko‘pincha bir vaqtda bir nechta do‘kondan so‘raydi; tezlik yutadi.', 'В директе клиент часто спрашивает несколько магазинов сразу — побеждает скорость.')),
      item('dm3', say('expensive', 'qimmat', 'дорого'), [
        t('It’s not expensive.', 'Qimmat emas.', 'Это не дорого.'),
        t('I understand. It’s silk, and we deliver to your city in two days. If you prefer, there’s a cotton version for 220,000 — shall I send a photo?', 'Tushunaman. Bu ipak, shahringizga ikki kunda yetkazib beramiz. Xohlasangiz, 220 000 so‘mlik paxta varianti bor — rasmini yuboraymi?', 'Понимаю. Это шёлк, и доставим в ваш город за два дня. Если хотите, есть хлопковый вариант за 220 000 — прислать фото?'),
        t('OK, 300,000 then.', 'Mayli, unda 300 000.', 'Ладно, тогда 300 000.'),
      ], 1, L('Explain the value briefly and offer a real alternative, without an instant discount.', 'Qiymatni qisqa tushuntiring va darhol chegirma bermasdan, haqiqiy muqobil variant taklif qiling.', 'Коротко объясните ценность и предложите реальную альтернативу без моментальной скидки.')),
      item('dm4', t('Which DM is easiest to read on a phone?', 'Qaysi DM telefonda o‘qish uchun eng qulay?', 'Какое сообщение проще читать с телефона?'), [
        t('One long paragraph with every detail.', 'Har bir tafsilot yozilgan bitta uzun xatboshi.', 'Один длинный абзац со всеми деталями.'),
        t('Three short lines: price, what’s included, a question.', 'Uchta qisqa qator: narx, nima kiradi, savol.', 'Три коротких строки: цена, что входит, вопрос.'),
        t('Just a voice message of five minutes.', 'Shunchaki besh daqiqalik ovozli xabar.', 'Просто голосовое на пять минут.'),
      ], 1, L('Short, scannable lines get read and answered.', 'Qisqa, ko‘z yugurtirsa bo‘ladigan qatorlar o‘qiladi va ularga javob beriladi.', 'Короткие, легко просматриваемые строки читают и на них отвечают.')),
      item('dm5', t('The buyer stops replying after your price. Best follow-up the next day?', 'Narxdan keyin mijoz javob bermay qo‘ydi. Ertasi kuni qaysi follow-up xabar eng yaxshi?', 'После цены клиент пропал. Какое сообщение лучше отправить на следующий день?'), [
        t('“??”', '«??»', '«??»'),
        t('“Hi! Yesterday you asked about the green dress — size M is still available. Shall I keep it for you until Friday?”', '«Assalomu alaykum! Kecha yashil ko‘ylak haqida so‘ragan edingiz — M o‘lchami hali bor. Jumagacha siz uchun saqlab qo‘yaymi?»', '«Здравствуйте! Вчера вы спрашивали о зелёном платье — размер M ещё есть. Отложить для вас до пятницы?»'),
        t('“Last chance!!!”', '«Oxirgi imkoniyat!!!»', '«Последний шанс!!!»'),
      ], 1, L('Remind them what they wanted and offer a small, helpful step.', 'Nima xohlaganlarini eslating va kichik, foydali qadam taklif qiling.', 'Напомните, что они хотели, и предложите небольшой полезный шаг.')),
      item('dm6', say('Do you deliver to Andijan?', 'Andijonga yetkazib berasizmi?', 'Доставляете в Андижан?'), [
        t('Yes.', 'Ha.', 'Да.'),
        t('Yes! To Andijan it takes 2–3 days and costs 30,000 UZS. Which item would you like?', 'Ha! Andijonga 2–3 kunda yetkazib beramiz, narxi 30 000 so‘m. Qaysi mahsulot sizni qiziqtiryapti?', 'Да! До Андижана 2–3 дня, доставка стоит 30 000 сумов. Какой товар вас интересует?'),
        t('Read the delivery rules on our page.', 'Sahifamizdagi yetkazib berish shartlarini o‘qing.', 'Прочитайте правила доставки на нашей странице.'),
      ], 1, L('A full answer plus a question moves the buyer to the next step.', 'To‘liq javob va savol mijozni keyingi qadamga olib boradi.', 'Полный ответ и вопрос двигают клиента к следующему шагу.')),
      item('dm7', t('How do you end a DM conversation that is going well?', 'Yaxshi ketayotgan DM suhbatini qanday yakunlaysiz?', 'Как закончить удачный диалог в директе?'), [
        t('“Write if interested.”', '«Qiziqsangiz yozing.»', '«Пишите, если интересно».'),
        t('“Shall I place the order? I’ll just need your name, phone and address.”', '«Buyurtmani rasmiylashtiraymi? Faqat ismingiz, telefon raqamingiz va manzilingiz kerak.»', '«Оформить заказ? Нужны только имя, телефон и адрес».'),
        t('“OK, bye.”', '«Mayli, xayr.»', '«Ладно, пока».'),
      ], 1, L('Ask for the order and say exactly what you need from them.', 'Buyurtmani so‘rang va ulardan aynan nima kerakligini ayting.', 'Попросите заказ и скажите, что именно от них нужно.')),
      item('dm8', t('Someone leaves an angry comment under your post. What first?', 'Kimdir postingiz ostida g‘azabli izoh qoldirdi. Avval nima?', 'Под постом оставили гневный комментарий. Что сначала?'), [
        t('Delete it.', 'O‘chiring.', 'Удалить.'),
        t('Reply politely in public that you’re sorry and will solve it in DM, then message them.', 'Izohga ochiq va muloyim javob bering: uzr so‘rang, masalani DMda hal qilishingizni ayting, keyin ularga yozing.', 'Публично и вежливо ответить, что сожалеете и решите вопрос в личных сообщениях, затем написать им.'),
        t('Argue in the comments.', 'Izohlarda bahslashing.', 'Спорить в комментариях.'),
      ], 1, L('Others watch how you react; a calm public reply and a private fix win trust.', 'Boshqalar qanday munosabat bildirishingizni kuzatadi; xotirjam ochiq javob va masalani shaxsiy yozishmada hal qilish ishonch qozonadi.', 'Другие смотрят, как вы реагируете; спокойный публичный ответ и решение в личке завоёвывают доверие.')),
    ],
  },
];
