import { T } from '../src/localize.ts';
import type { Activity, Localized, Shadowing } from '../src/types.ts';

// Pace and pause practice: listen to a model line, then say it the same way, with the
// pause and the stressed word the focus asks for. The engine checks the words heard in
// order from the transcript; the pause and stress are practised, not scored (they need
// the sound itself). Lines are original and work as openings, signposts and closes.

type Tri = [en: string, uz: string, ru: string];
const L = ([en, uz, ru]: Tri): Localized => ({ en, uz, ru });
const line = (id: string, text: Tri, focus: Tri) => ({ id, text: T({ en: text[0], uz: text[1], ru: text[2] }), focus: L(focus) });
const set = (id: string, title: Tri, node: string, levels: [number, number], sentences: ReturnType<typeof line>[]): Shadowing => ({ id, kind: 'shadowing', title: L(title), node, levels, minutes: 5, sentences });

const PAUSE: Tri = ['Pause for one second at the comma, then slow down on the last three words.', 'Vergulda bir soniya to‘xtang, keyin oxirgi uch so‘zni sekinroq ayting.', 'Сделайте паузу в секунду на запятой и замедлитесь на последних трёх словах.'];
const STRESS: Tri = ['Stress the key word and keep the rest of the line calm and steady.', 'Kalit so‘zga urg‘u bering, gapning qolgan qismini xotirjam va bir maromda ayting.', 'Выделите ключевое слово, а остальную фразу произнесите спокойно и ровно.'];
const QUESTION: Tri = ['Let your voice rise on the question, then wait two seconds before you go on.', 'Savolda ovozingizni ko‘taring, keyin davom etishdan oldin ikki soniya kuting.', 'Повысьте голос на вопросе и подождите две секунды, прежде чем продолжить.'];
const SLOW: Tri = ['Say it slower than feels natural: this is the line people must remember.', 'Odatdagidan sekinroq ayting: odamlar aynan shu gapni eslab qolishi kerak.', 'Скажите медленнее, чем кажется естественным: эту фразу должны запомнить.'];
const THREE: Tri = ['Three parts: pause briefly after each one and make the last one the strongest.', 'Uch qism: har biridan keyin qisqa to‘xtang, oxirgisini eng kuchli qiling.', 'Три части: короткая пауза после каждой, последняя — самая сильная.'];

export const shadowing: Activity[] = [
  set('sh.pauses', ['Pauses instead of fillers', 'To‘ldiruvchi o‘rniga pauza', 'Паузы вместо паразитов'], 'delivery.pauses', [1, 3], [
    line('p01', ['Good morning, everyone. Thank you for coming today.', 'Hammaga xayrli tong. Bugun kelganingiz uchun rahmat.', 'Доброе утро всем. Спасибо, что пришли сегодня.'], PAUSE),
    line('p02', ['I have one question for you, and I would like an honest answer.', 'Sizga bitta savolim bor va men halol javob kutaman.', 'У меня к вам один вопрос, и я хочу честного ответа.'], PAUSE),
    line('p03', ['Let me think about that for a moment.', 'Bu haqda bir lahza o‘ylab olay.', 'Позвольте мне секунду подумать.'], ['Say it instead of "ee" or "um" when you need time, then pause.', '«Ee» yoki «aa» o‘rniga, vaqt kerak bo‘lganda shuni ayting va to‘xtang.', 'Говорите это вместо «ну» или «эээ», когда нужно время, и делайте паузу.']),
    line('p04', ['That is a good question, and the short answer is yes.', 'Bu yaxshi savol va qisqa javob — ha.', 'Это хороший вопрос, и короткий ответ — да.'], PAUSE),
    line('p05', ['We have ten minutes, so I will keep this short.', 'Bizda o‘n daqiqa bor, shuning uchun qisqa gapiraman.', 'У нас десять минут, поэтому я буду краток.'], PAUSE),
    line('p06', ['Before I start, please put your phones on silent.', 'Boshlashdan oldin, iltimos, telefonlaringizni ovozsiz rejimga qo‘ying.', 'Прежде чем начать, пожалуйста, выключите звук на телефонах.'], STRESS),
    line('p07', ['Here is the number that surprised me most.', 'Meni eng ko‘p hayratlantirgan raqam mana shu.', 'Вот цифра, которая удивила меня больше всего.'], ['Pause after "most" for two seconds before you say the number.', '«Eng ko‘p» so‘zidan keyin raqamni aytishdan oldin ikki soniya to‘xtang.', 'После «больше всего» сделайте паузу в две секунды перед цифрой.']),
    line('p08', ['I am not sure yet, and I will check it for you.', 'Hozircha aniq bilmayman, buni siz uchun tekshirib beraman.', 'Пока не знаю точно, но я проверю это для вас.'], ['Calm and even: not knowing is fine when you say it clearly.', 'Xotirjam va bir maromda: aniq aytsangiz, bilmaslik — normal holat.', 'Спокойно и ровно: не знать — нормально, если сказать это ясно.']),
    line('p09', ['Thank you for listening. I am happy to take your questions.', 'Tinglaganingiz uchun rahmat. Savollaringizga javob berishga tayyorman.', 'Спасибо, что выслушали. Я с радостью отвечу на ваши вопросы.'], PAUSE),
    line('p10', ['Let me say that again, more slowly.', 'Buni yana bir bor, sekinroq aytaman.', 'Позвольте повторить это ещё раз, медленнее.'], SLOW),
  ]),
  set('sh.openings', ['Openings that hook', 'Diqqatni tortuvchi boshlanishlar', 'Начала с зацепкой'], 'structure.hook', [1, 4], [
    line('o01', ['How many of you checked your phone in the last ten minutes?', 'Qaysi biringiz so‘nggi o‘n daqiqada telefoningizga qaradingiz?', 'Кто из вас проверял телефон за последние десять минут?'], QUESTION),
    line('o02', ['Imagine waking up tomorrow and speaking any language you want.', 'Tasavvur qiling, ertaga uyg‘onib, istagan tilingizda gapira olasiz.', 'Представьте, что завтра вы проснётесь и заговорите на любом языке.'], STRESS),
    line('o03', ['Three years ago, I could not say a word in front of my class.', 'Uch yil oldin men sinfdoshlarim oldida bir og‘iz so‘z ayta olmasdim.', 'Три года назад я не мог сказать ни слова перед классом.'], PAUSE),
    line('o04', ['Every morning, my grandmother asked me one question.', 'Har kuni ertalab buvim menga bitta savol berardi.', 'Каждое утро бабушка задавала мне один вопрос.'], ['Slow down at the end and pause: the audience wants to know the question.', 'Oxirida sekinlashing va to‘xtang: tinglovchilar savolni bilmoqchi bo‘ladi.', 'Замедлитесь в конце и сделайте паузу: зал захочет узнать вопрос.']),
    line('o05', ['What if the problem is not money, but time?', 'Agar muammo pulda emas, vaqtda bo‘lsa-chi?', 'А что, если проблема не в деньгах, а во времени?'], QUESTION),
    line('o06', ['This bottle travelled further than most of us ever will.', 'Bu shisha ko‘pchiligimiz hech qachon bormaydigan masofani bosib o‘tgan.', 'Эта бутылка проехала больше, чем многие из нас когда-нибудь проедут.'], STRESS),
    line('o07', ['Raise your hand if you have ever missed a bus by one minute.', 'Hech qachon avtobusga bir daqiqa kechikkan bo‘lsangiz, qo‘l ko‘taring.', 'Поднимите руку, если хоть раз опаздывали на автобус на одну минуту.'], ['Pause and actually wait for hands before you go on.', 'To‘xtang va davom etishdan oldin haqiqatan ham qo‘llarni kuting.', 'Сделайте паузу и правда дождитесь поднятых рук.']),
    line('o08', ['I want to tell you about the worst day of my first job.', 'Sizga birinchi ishimdagi eng yomon kun haqida gapirib bermoqchiman.', 'Хочу рассказать вам о худшем дне на моей первой работе.'], STRESS),
    line('o09', ['One sentence changed how I see my work.', 'Bitta gap ishimga bo‘lgan qarashimni o‘zgartirdi.', 'Одна фраза изменила моё отношение к работе.'], SLOW),
  ]),
  set('sh.signposts', ['Signposts and transitions', 'Yo‘nalish beruvchi o‘tishlar', 'Связки и переходы'], 'structure.points', [2, 5], [
    line('s01', ['I have three reasons, and the third is the most important.', 'Uchta sababim bor, uchinchisi eng muhimi.', 'У меня три причины, и третья — самая важная.'], STRESS),
    line('s02', ['First, let us look at the problem.', 'Birinchidan, keling, muammoni ko‘rib chiqaylik.', 'Во-первых, давайте посмотрим на проблему.'], PAUSE),
    line('s03', ['That brings me to my second point.', 'Bu meni ikkinchi fikrimga olib keladi.', 'Это подводит меня ко второму пункту.'], PAUSE),
    line('s04', ['So far, we have talked about the cost. Now, the benefit.', 'Hozirgacha xarajat haqida gapirdik. Endi — foyda haqida.', 'До сих пор мы говорили о затратах. Теперь — о пользе.'], ['Pause at the full stop and make "now" a fresh start.', 'Nuqtada to‘xtang va «endi» so‘zini yangi boshlanish qiling.', 'Сделайте паузу на точке и начните «теперь» как новую часть.']),
    line('s05', ['Here is a simple example from our own school.', 'Mana o‘z maktabimizdan oddiy misol.', 'Вот простой пример из нашей собственной школы.'], STRESS),
    line('s06', ['But there is another side to this story.', 'Lekin bu voqeaning boshqa tomoni ham bor.', 'Но у этой истории есть и другая сторона.'], ['Stress "another" and pause before you tell it.', '«Boshqa» so‘ziga urg‘u bering va uni aytishdan oldin to‘xtang.', 'Выделите «другая» и сделайте паузу, прежде чем рассказать.']),
    line('s07', ['In other words, small steps every day beat one big effort.', 'Boshqacha aytganda, har kungi kichik qadamlar bitta katta harakatdan ustun.', 'Иными словами, маленькие шаги каждый день лучше одного большого рывка.'], SLOW),
    line('s08', ['Let me show you what this looks like in real life.', 'Keling, bu hayotda qanday ko‘rinishini ko‘rsataman.', 'Давайте покажу, как это выглядит в жизни.'], PAUSE),
    line('s09', ['Finally, and this is the part I care about most.', 'Va nihoyat, men eng ko‘p qayg‘uradigan qism.', 'И наконец — то, что для меня важнее всего.'], PAUSE),
  ]),
  set('sh.closes', ['Closes that land', 'Ta’sirli yakunlar', 'Финалы, которые запоминаются'], 'structure.close', [2, 5], [
    line('c01', ['So here is my one request: try it for one week.', 'Demak, mening bitta iltimosim bor: buni bir hafta sinab ko‘ring.', 'Итак, у меня одна просьба: попробуйте это неделю.'], ['Pause at the colon, then say the request slowly.', 'Ikki nuqtada to‘xtang, keyin iltimosni sekin ayting.', 'Сделайте паузу на двоеточии, затем медленно произнесите просьбу.']),
    line('c02', ['If you remember one thing from today, remember this.', 'Bugundan bitta narsani eslab qolsangiz, shuni eslab qoling.', 'Если запомните сегодня одно, запомните это.'], ['Pause for two seconds at the end before your key line.', 'Asosiy gapingizdan oldin oxirida ikki soniya to‘xtang.', 'В конце сделайте паузу в две секунды перед главной фразой.']),
    line('c03', ['One route, one semester, one honest count.', 'Bitta yo‘nalish, bitta semestr, bitta halol hisob.', 'Один маршрут, один семестр, один честный подсчёт.'], THREE),
    line('c04', ['The question is not whether we can. It is whether we will.', 'Savol qila olamizmi, degani emas. Qilamizmi, degani.', 'Вопрос не в том, сможем ли мы. А в том, сделаем ли.'], ['Two halves: pause between them and stress "will" at the end.', 'Ikki qism: ular orasida to‘xtang va oxirgi so‘zga urg‘u bering.', 'Две половины: пауза между ними и ударение на последнем слове.']),
    line('c05', ['Sign up today, and see you on Saturday at nine.', 'Bugun ro‘yxatdan o‘ting, shanba kuni soat to‘qqizda ko‘rishguncha.', 'Записывайтесь сегодня, увидимся в субботу в девять.'], STRESS),
    line('c06', ['Start small, start today, and start together.', 'Kichikdan boshlang, bugun boshlang va birga boshlang.', 'Начните с малого, начните сегодня и начните вместе.'], THREE),
    line('c07', ['Thank you. I will be glad to hear your questions.', 'Rahmat. Savollaringizni eshitishdan xursand bo‘laman.', 'Спасибо. Буду рад вашим вопросам.'], ['Smile, pause after "thank you", and do not rush to leave.', 'Tabassum qiling, «rahmat»dan keyin to‘xtang va ketishga shoshilmang.', 'Улыбнитесь, сделайте паузу после «спасибо» и не спешите уходить.']),
    line('c08', ['Let us make this the year our library comes back to life.', 'Keling, bu yilni kutubxonamiz qayta jonlangan yil qilaylik.', 'Давайте сделаем этот год годом, когда наша библиотека ожила.'], SLOW),
    line('c09', ['The bus will come either way. The question is who is on it.', 'Avtobus baribir keladi. Savol — unda kim bo‘lishida.', 'Автобус придёт в любом случае. Вопрос — кто в нём будет.'], ['Pause between the two sentences and slow down on the last words.', 'Ikki gap orasida to‘xtang va oxirgi so‘zlarda sekinlashing.', 'Пауза между двумя фразами и замедление на последних словах.']),
  ]),
];
