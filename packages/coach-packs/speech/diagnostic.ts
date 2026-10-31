import { T } from '../src/localize.ts';
import type { Diagnostic, DiagnosticItem, Localized } from '../src/types.ts';

// The free placement test: no AI, about six minutes, open to everyone. Questions on
// speaking craft (which opening, which answer, which pace) and can-do statements, for
// the four skill roots, from L2 to L5. A level counts as reached at 60%.

type Tri = [en: string, uz: string, ru: string];
const P = ([en, uz, ru]: Tri) => T({ en, uz, ru });
const L = ([en, uz, ru]: Tri): Localized => ({ en, uz, ru });
const q = (id: string, skill: string, level: number, prompt: Tri, options: Tri[], answer: number): DiagnosticItem => ({ id, skill, level, kind: 'question', prompt: P(prompt), options: options.map(P), answer });
const can = (id: string, skill: string, level: number, prompt: Tri): DiagnosticItem => ({ id, skill, level, kind: 'can_do', prompt: L(prompt) });

export const diagnostic: Diagnostic = {
  intro: {
    en: '🎤 <b>Free placement test</b> · about 6 minutes, 22 questions\nQuestions about speaking situations and a few "can you do this?" statements. There are no trick questions: answer as you really would. Your level and a plan follow.',
    uz: '🎤 <b>Bepul daraja testi</b> · taxminan 6 daqiqa, 22 ta savol\nNutq vaziyatlari haqida savollar va bir nechta «buni qila olasizmi?» degan gaplar. Chalg‘ituvchi savollar yo‘q: haqiqatda qanday qilsangiz, shunday javob bering. Keyin darajangiz va rejangizni ko‘rasiz.',
    ru: '🎤 <b>Бесплатный тест уровня</b> · около 6 минут, 22 вопроса\nВопросы о ситуациях на выступлении и несколько утверждений «умеете ли вы это?». Подвохов нет: отвечайте, как поступили бы на самом деле. Затем — ваш уровень и план.',
  },
  minutes: 6,
  passRatio: 0.6,
  items: [
    // Structure
    can('st-cd2', 'structure', 2, ['I can give a short talk with a beginning, a middle and an end.', 'Boshi, o‘rtasi va oxiri bor qisqa nutq so‘zlay olaman.', 'Я могу произнести короткую речь с началом, серединой и концом.']),
    q('st-q2', 'structure', 2, ['Which is the best way to start a talk about saving water?', 'Suvni tejash haqidagi nutqni qanday boshlagan ma’qul?', 'Как лучше начать речь об экономии воды?'], [
      ['Sorry, I am not a good speaker.', 'Kechirasiz, men yaxshi notiq emasman.', 'Извините, я плохой оратор.'],
      ['How much water did you use this morning?', 'Bugun ertalab qancha suv ishlatdingiz?', 'Сколько воды вы потратили сегодня утром?'],
      ['My topic is water.', 'Mavzuim — suv.', 'Моя тема — вода.'],
    ], 1),
    q('st-q3', 'structure', 3, ['You have three minutes. How many main points?', 'Sizda uch daqiqa bor. Nechta asosiy fikr bo‘lgani ma’qul?', 'У вас три минуты. Сколько главных тезисов?'], [
      ['Two or three.', 'Ikki yoki uchta.', 'Два-три.'],
      ['Seven.', 'Yettita.', 'Семь.'],
      ['As many as I know.', 'Bilganimning hammasi.', 'Сколько знаю.'],
    ], 0),
    q('st-q4', 'structure', 4, ['Which close is strongest?', 'Qaysi yakun eng kuchli?', 'Какой финал сильнее всего?'], [
      ['That’s all, thank you.', 'Bo‘ldi, shu, rahmat.', 'Вот и всё, спасибо.'],
      ['Any questions?', 'Savollar bormi?', 'Есть вопросы?'],
      ['One route, one semester, one honest count: let’s start on Monday.', 'Bitta yo‘nalish, bitta semestr, bitta halol hisob: dushanbadan boshlaylik.', 'Один маршрут, один семестр, один честный подсчёт — начнём в понедельник.'],
    ], 2),
    can('st-cd4', 'structure', 4, ['I can announce my points, number them as I speak and end with a clear request.', 'Fikrlarimni e’lon qilib, gapirayotganda sanab, aniq iltimos bilan yakunlay olaman.', 'Я могу объявить тезисы, нумеровать их по ходу и закончить ясной просьбой.']),
    q('st-q5', 'structure', 5, ['Your opening story is about a girl at a bus stop. What does an expert close do?', 'Kirish hikoyangiz bekatdagi qiz haqida. Mohir notiqning yakuni nima qiladi?', 'Ваша вступительная история — о девушке на остановке. Что делает финал мастера?'], [
      ['Tells a new, different story.', 'Yangi, boshqa hikoya aytadi.', 'Рассказывает новую, другую историю.'],
      ['Returns to the girl and shows what changes for her if they say yes.', 'Qizga qaytadi va «ha» desalar, uning hayotida nima o‘zgarishini ko‘rsatadi.', 'Возвращается к девушке и показывает, что изменится для неё, если скажут «да».'],
      ['Lists all the facts again.', 'Barcha faktlarni qayta sanaydi.', 'Снова перечисляет все факты.'],
    ], 1),
    // Delivery
    can('de-cd2', 'delivery', 2, ['I can speak for one minute without stopping to search for words.', 'So‘z qidirib to‘xtamasdan bir daqiqa gapira olaman.', 'Я могу говорить минуту, не останавливаясь в поиске слов.']),
    q('de-q2', 'delivery', 2, ['You forget your next word. What is best?', 'Keyingi so‘zni unutdingiz. Eng yaxshisi nima?', 'Вы забыли следующее слово. Что лучше?'], [
      ['Say "ee… um…" until it comes.', 'Eslaguncha «ee… aa…» deyish.', 'Говорить «эээ… ну…», пока не вспомните.'],
      ['Apologise to the audience.', 'Tinglovchilardan uzr so‘rash.', 'Извиниться перед залом.'],
      ['Pause silently for a second, then go on.', 'Bir soniya jim to‘xtab, keyin davom etish.', 'Секунду помолчать и продолжить.'],
    ], 2),
    q('de-q3', 'delivery', 3, ['Which pace is comfortable for most listeners?', 'Ko‘pchilik tinglovchilar uchun qaysi sur’at qulay?', 'Какой темп удобен большинству слушателей?'], [
      ['About 60 words a minute.', 'Daqiqasiga taxminan 60 so‘z.', 'Около 60 слов в минуту.'],
      ['About 140 words a minute.', 'Daqiqasiga taxminan 140 so‘z.', 'Около 140 слов в минуту.'],
      ['About 220 words a minute.', 'Daqiqasiga taxminan 220 so‘z.', 'Около 220 слов в минуту.'],
    ], 1),
    q('de-q4', 'delivery', 4, ['Which sentence is clearest for a general audience?', 'Oddiy auditoriya uchun qaysi gap eng aniq?', 'Какая фраза понятнее широкой аудитории?'], [
      ['The app turns homework into short games, so children do it more often.', 'Ilova uy vazifasini qisqa o‘yinlarga aylantiradi, shuning uchun bolalar uni tez-tez bajaradi.', 'Приложение превращает домашнее задание в короткие игры, поэтому дети делают его чаще.'],
      ['The platform optimises engagement metrics through gamification.', 'Platforma geymifikatsiya orqali jalb qilish ko‘rsatkichlarini optimallashtiradi.', 'Платформа оптимизирует метрики вовлечённости через геймификацию.'],
      ['It is an innovative educational solution.', 'Bu innovatsion ta’lim yechimi.', 'Это инновационное образовательное решение.'],
    ], 0),
    can('de-cd4', 'delivery', 4, ['I can slow down and pause on purpose before my key sentence.', 'Asosiy gapimdan oldin ataylab sekinlashib, pauza qila olaman.', 'Я умею намеренно замедлиться и сделать паузу перед главной фразой.']),
    q('de-q5', 'delivery', 5, ['You must say "Our results grew by 37 percent". How does an expert say it?', '«Natijalarimiz 37 foizga o‘sdi» deyishingiz kerak. Mohir notiq buni qanday aytadi?', 'Нужно сказать «Наши результаты выросли на 37 процентов». Как скажет мастер?'], [
      ['Slowly, with a pause before the number, and what it means for the listener.', 'Sekin, raqamdan oldin pauza bilan va bu tinglovchi uchun nimani anglatishini aytib.', 'Медленно, с паузой перед цифрой и с тем, что это значит для слушателя.'],
      ['Quickly, inside a long sentence.', 'Tez, uzun gap ichida.', 'Быстро, внутри длинной фразы.'],
      ['Only on a slide, without saying it.', 'Aytmasdan, faqat slaydda.', 'Только на слайде, не произнося.'],
    ], 0),
    // Content
    can('co-cd2', 'content', 2, ['I can give one example to explain what I mean.', 'Fikrimni tushuntirish uchun bitta misol keltira olaman.', 'Я могу привести один пример, чтобы объяснить мысль.']),
    q('co-q3', 'content', 3, ['"Reading is useful." Which support is strongest?', '«Kitob o‘qish foydali.» Qaysi dalil eng kuchli?', '«Чтение полезно». Какой довод сильнее?'], [
      ['Everybody knows it.', 'Buni hamma biladi.', 'Это все знают.'],
      ['My brother read twenty pages a day for a year and his grades rose.', 'Akam bir yil kuniga yigirma sahifa o‘qidi va baholari ko‘tarildi.', 'Мой брат год читал по двадцать страниц в день, и оценки выросли.'],
      ['Reading is very, very useful.', 'O‘qish juda-juda foydali.', 'Чтение очень-очень полезно.'],
    ], 1),
    q('co-q4', 'content', 4, ['Where should you slow down when telling a story?', 'Hikoya qilayotganda qayerda sekinlashish kerak?', 'Где замедлиться, рассказывая историю?'], [
      ['At the turning point, with one detail people can see.', 'Burilish lahzasida, odamlar ko‘z oldiga keltira oladigan bitta tafsilot bilan.', 'В момент поворота, с одной деталью, которую можно увидеть.'],
      ['At the date and place.', 'Sana va joyda.', 'На дате и месте.'],
      ['Nowhere; stories must be fast.', 'Hech qayerda; hikoya tez bo‘lishi kerak.', 'Нигде: истории должны быть быстрыми.'],
    ], 0),
    can('co-cd4', 'content', 4, ['I can tell a short true story that makes a point people remember.', 'Fikri esda qoladigan qisqa haqiqiy hikoyani so‘zlab bera olaman.', 'Я могу рассказать короткую правдивую историю, мысль которой запомнят.']),
    q('co-q5', 'content', 5, ['You have no statistic to support your point. What does a strong speaker do?', 'Fikringizni quvvatlaydigan statistika yo‘q. Kuchli notiq nima qiladi?', 'У вас нет статистики для тезиса. Что делает сильный оратор?'], [
      ['Invents a believable number.', 'Ishonarli raqam o‘ylab topadi.', 'Придумывает правдоподобную цифру.'],
      ['Drops the point.', 'Fikrdan voz kechadi.', 'Отказывается от тезиса.'],
      ['Uses one true, specific moment they saw themselves and says so.', 'O‘zi ko‘rgan bitta haqiqiy, aniq lahzani ishlatadi va shuni aytadi.', 'Приводит один правдивый конкретный эпизод, который видел сам, и говорит об этом.'],
    ], 2),
    // Interaction
    can('in-cd2', 'interaction', 2, ['I can answer a simple question from the audience after my talk.', 'Nutqimdan keyin auditoriyadan kelgan oddiy savolga javob bera olaman.', 'Я могу ответить на простой вопрос зала после выступления.']),
    q('in-q3', 'interaction', 3, ['Someone asks "How much will it cost?" Which answer is best?', 'Kimdir «Bu qanchaga tushadi?» deb so‘radi. Qaysi javob eng yaxshi?', 'Вас спрашивают: «Сколько это стоит?» Какой ответ лучше?'], [
      ['It depends on many things…', 'Bu ko‘p narsaga bog‘liq…', 'Это зависит от многого…'],
      ['Money is not important.', 'Pul muhim emas.', 'Деньги неважны.'],
      ['About two million sum for the first term; most of it is equipment.', 'Birinchi chorak uchun taxminan ikki million so‘m; ko‘p qismi jihozlarga.', 'Около двух миллионов сумов на первую четверть, в основном оборудование.'],
    ], 2),
    q('in-q4', 'interaction', 4, ['You do not know the answer to a question. What do you say?', 'Savolga javobni bilmaysiz. Nima deysiz?', 'Вы не знаете ответа на вопрос. Что скажете?'], [
      ['"I don’t know yet; I will check and send it to you today."', '«Hozircha bilmayman; tekshirib, bugun sizga yuboraman.»', '«Пока не знаю; проверю и пришлю вам сегодня».'],
      ['A number that sounds right.', 'To‘g‘ri eshitiladigan raqam.', 'Цифру, которая звучит правдоподобно.'],
      ['"That is not a good question."', '«Bu yaxshi savol emas.»', '«Это плохой вопрос».'],
    ], 0),
    q('in-q5', 'interaction', 5, ['An opponent says "Your idea treats us like children." Expert reply?', 'Raqib: «G‘oyangiz bizni yosh bola o‘rnida ko‘radi». Mohir notiq qanday javob beradi?', 'Оппонент: «Ваша идея обращается с нами как с детьми». Как ответит мастер?'], [
      ['"That is not true, you are wrong."', '«Bu rost emas, siz noto‘g‘risiz.»', '«Это неправда, вы не правы».'],
      ['"You’re right that we are not children — that is why I trust us to agree to this rule."', '«To‘g‘ri, biz bola emasmiz — aynan shuning uchun bu qoidaga kelisha olamiz deb ishonaman.»', '«Вы правы, мы не дети — поэтому я верю, что мы договоримся об этом правиле».'],
      ['"OK, maybe it is a bad idea."', '«Xo‘p, balki bu yomon g‘oyadir.»', '«Ладно, может, идея и плохая».'],
    ], 1),
    can('in-cd5', 'interaction', 5, ['I can stay calm with a hostile question and turn it into support for my message.', 'Dushmanona savolda xotirjam qolib, uni xabarimni qo‘llab-quvvatlashga aylantira olaman.', 'Я могу сохранить спокойствие при враждебном вопросе и обратить его в поддержку своей мысли.']),
  ],
};
