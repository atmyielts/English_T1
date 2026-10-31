import { T } from '../src/localize.ts';
import type { Activity, Lesson, Localized } from '../src/types.ts';

// Two-minute lessons, one idea each, with an example line to say aloud and one check
// question. The method is Schood's own summary of widely taught speaking craft.

type Tri = [en: string, uz: string, ru: string];
const L = ([en, uz, ru]: Tri): Localized => ({ en, uz, ru });
const P = ([en, uz, ru]: Tri) => T({ en, uz, ru });
const lesson = (id: string, node: string, title: Tri, body: Tri, example: Tri, prompt: Tri, options: Tri[], answer: number, explanation: Tri): Lesson => ({
  id, kind: 'lesson', node, levels: [1, 5], minutes: 3, title: L(title), body: L(body), example: P(example), check: { prompt: P(prompt), options: options.map(P), answer, explanation: L(explanation) },
});

export const lessons: Activity[] = [
  lesson('lesson.hooks', 'structure.hook', ['Four hooks that work', 'Ishlaydigan to‘rt xil kirish', 'Четыре зацепки, которые работают'], [
    'Listeners decide very early whether to keep listening. Four openings work well: a question they answer in their heads (How many of you…?), a true surprising fact with its source, a ten-second story (Last winter, at six in the morning…), or a picture in words (Imagine…). Save your name and the title for the second or third sentence. Never open by apologising or by reading the agenda.',
    'Odamlar tinglash-tinglamaslikni juda tez, dastlabki gaplardanoq hal qiladi. To‘rt xil kirish yaxshi ishlaydi: ular ichida javob beradigan savol (Qaysi biringiz…?), manbasi ko‘rsatilgan haqiqiy qiziq fakt, o‘n soniyalik hikoya (O‘tgan qishda, ertalab soat oltida…) yoki so‘z bilan chizilgan manzara (Tasavvur qiling…). Ismingiz va mavzu nomini ikkinchi yoki uchinchi gapga qoldiring. Hech qachon uzr so‘rab yoki kun tartibini o‘qib boshlamang.',
    'Слушатели очень быстро, по первым фразам, решают, слушать ли вас. Хорошо работают четыре начала: вопрос, на который отвечают про себя («Кто из вас…?»), удивительный правдивый факт с источником, история на десять секунд («Прошлой зимой, в шесть утра…») или картинка словами («Представьте…»). Имя и тему оставьте для второй-третьей фразы. Никогда не начинайте с извинений или чтения плана.',
  ], ['How many of you checked your phone in the last ten minutes?', 'Qaysi biringiz so‘nggi o‘n daqiqada telefoningizga qaradingiz?', 'Кто из вас проверял телефон за последние десять минут?'],
  ['Which is a hook?', 'Qaysi biri diqqatni tortuvchi kirish?', 'Что из этого — зацепка?'], [
    ['Today I will talk about phones.', 'Bugun telefonlar haqida gapiraman.', 'Сегодня я расскажу о телефонах.'],
    ['Imagine one day with no phone at all.', 'Telefonsiz bir kunni tasavvur qiling.', 'Представьте один день совсем без телефона.'],
    ['My topic is phones, as you can see on the slide.', 'Mavzuim — telefonlar, slaydda ko‘rib turganingizdek.', 'Моя тема — телефоны, как видно на слайде.'],
  ], 1, ['"Imagine…" puts a picture in the listener’s head; the others only announce the topic.', '«Tasavvur qiling…» tinglovchi ko‘z oldiga manzara keltiradi; boshqalari faqat mavzuni e’lon qiladi.', '«Представьте…» рисует картинку в голове слушателя; остальные лишь объявляют тему.']),

  lesson('lesson.rule-of-three', 'structure.points', ['The rule of three', 'Uchlik qoidasi', 'Правило трёх'], [
    'Three is easy for listeners to remember and feels complete: three points, three examples, three short phrases in a final line ("Start small, start today, start together"). Two can feel unfinished, and four is harder to hold. Plan any talk as three parts, and when you list things, list three. Say the number out loud: "I have three reasons."',
    'Uchtani tinglovchi oson eslab qoladi va u to‘liq tuyuladi: uchta fikr, uchta misol, yakuniy gapda uchta qisqa ibora («Kichikdan boshlang, bugun boshlang, birga boshlang»). Ikkitasi chala tuyulishi mumkin, to‘rttasini esa eslab qolish qiyinroq. Har qanday nutqni uch qism qilib rejalashtiring, biror narsani sanab o‘tsangiz, uchtasini ayting. Sonni ovoz chiqarib ayting: «Uchta sababim bor.»',
    'Три легко запомнить на слух, и это звучит законченно: три тезиса, три примера, три коротких части в финальной фразе («Начните с малого, начните сегодня, начните вместе»). Два может казаться незавершённым, а четыре удержать в голове труднее. Планируйте любую речь из трёх частей, перечисляйте по три. Называйте число вслух: «У меня три причины».',
  ], ['I have three reasons, and the third is the most important.', 'Uchta sababim bor, uchinchisi eng muhimi.', 'У меня три причины, и третья — самая важная.'],
  ['Why plan a talk in three parts?', 'Nega nutqni uch qismda rejalashtirish kerak?', 'Зачем строить речь из трёх частей?'], [
    ['Because three is easy to remember and feels complete.', 'Chunki uchtani eslab qolish oson va u to‘liq tuyuladi.', 'Потому что три части легко запомнить и речь звучит законченно.'],
    ['Because talks must be exactly three minutes.', 'Chunki nutq aynan uch daqiqa bo‘lishi kerak.', 'Потому что речь должна длиться ровно три минуты.'],
    ['Because nobody can say more than three sentences.', 'Chunki hech kim uchtadan ortiq gap ayta olmaydi.', 'Потому что никто не может сказать больше трёх фраз.'],
  ], 0, ['Three parts are easy to follow and to remember.', 'Uch qismni kuzatish ham, eslab qolish ham oson.', 'За тремя частями легко следить, их легко запомнить.']),

  lesson('lesson.signposts', 'structure.points', ['Signposts: a map for the ear', 'O‘tish iboralari: quloq uchun xarita', 'Связки: карта для слуха'], [
    'Readers see headings; listeners cannot. Signposts are spoken headings. Announce the map ("three things: the problem, the plan, what we need"), mark each part ("First…", "That brings me to…", "Finally…"), and close each one with a one-line summary and a pause. When you go off track, bring people back: "Back to my second point."',
    'O‘quvchi sarlavhalarni ko‘radi, tinglovchi esa ko‘ra olmaydi. O‘tish iboralari — og‘zaki sarlavhalar. Xaritani e’lon qiling («uchta narsa: muammo, reja, bizga nima kerak»), har qismni belgilang («Birinchidan…», «Endi …ga o‘tamiz», «Va nihoyat…») va har birini bir gaplik xulosa va pauza bilan yoping. Chalg‘isangiz, odamlarni qaytaring: «Ikkinchi fikrimga qaytsak».',
    'Читатель видит заголовки, слушатель — нет. Связки — это устные заголовки. Объявите карту («три вещи: проблема, план, что нужно»), отмечайте каждую часть («Во-первых…», «Это подводит нас к…», «И наконец…») и закрывайте каждую итогом в одну фразу и паузой. Ушли в сторону — верните людей: «Вернёмся ко второму тезису».',
  ], ['So far, we have talked about the cost. Now, the benefit.', 'Hozirgacha xarajat haqida gapirdik. Endi — foyda haqida.', 'До сих пор мы говорили о затратах. Теперь — о пользе.'],
  ['What is a signpost?', 'O‘tish iborasi nima?', 'Что такое связка?'], [
    ['A spoken phrase that tells listeners where you are in the talk.', 'Tinglovchilarga nutqning qayerida ekaningizni aytadigan og‘zaki ibora.', 'Устная фраза, которая показывает, где вы находитесь в речи.'],
    ['A picture on a slide.', 'Slayddagi rasm.', 'Картинка на слайде.'],
    ['A gesture with your hands.', 'Qo‘l harakati.', 'Жест руками.'],
  ], 0, ['Signposts are words, so they work even with no slides.', 'O‘tish iboralari so‘zdan iborat, shuning uchun slaydsiz ham ishlaydi.', 'Связки — это слова, они работают и без слайдов.']),

  lesson('lesson.closes', 'structure.close', ['Closes people remember', 'Yodda qoladigan yakun', 'Финал, который помнят'], [
    'The last thing you say is often what people remember. A strong close has two parts: a one-line summary of your message and a clear call to action (what should they think, feel or do, and when?). Go back to your opening story or question if you can: it makes the talk feel complete. Learn your last sentence by heart, say it slowly, then stop and smile. After questions, finish again with that line.',
    'Odamlar ko‘pincha siz oxirida aytgan gapni eslab qoladi. Kuchli yakun ikki qismdan iborat: xabaringizning bir gaplik xulosasi va aniq chaqiriq (ular nima o‘ylashi, his qilishi yoki qilishi kerak va qachon?). Iloji bo‘lsa, kirishdagi hikoya yoki savolga qayting: nutq to‘liq tuyuladi. Oxirgi gapni yod oling, sekin ayting, keyin to‘xtang va tabassum qiling. Savollardan keyin yana shu gap bilan yakunlang.',
    'Последнее, что вы скажете, чаще всего и запоминается. Сильный финал из двух частей: итог в одну фразу и ясный призыв (что людям думать, чувствовать или сделать — и когда?). Если можете, вернитесь к истории или вопросу из начала: речь станет цельной. Выучите последнюю фразу наизусть, скажите её медленно, остановитесь и улыбнитесь. После вопросов закончите ещё раз этой фразой.',
  ], ['So here is my one request: try it for one week.', 'Demak, mening bitta iltimosim bor: buni bir hafta sinab ko‘ring.', 'Итак, у меня одна просьба: попробуйте это неделю.'],
  ['Which is a call to action?', 'Qaysi biri harakatga chaqiriq?', 'Что является призывом к действию?'], [
    ['That is all I wanted to say.', 'Aytmoqchi bo‘lganim shu edi.', 'На этом у меня всё.'],
    ['Sign up at the table by the door before you leave today.', 'Bugun ketishdan oldin eshik yonidagi stolda ro‘yxatdan o‘ting.', 'Сегодня перед уходом запишитесь у стола возле двери.'],
    ['Thank you for your attention.', 'E’tiboringiz uchun rahmat.', 'Спасибо за внимание.'],
  ], 1, ['It says exactly what to do, where and when.', 'U aynan nima, qayerda va qachon qilishni aytadi.', 'Здесь сказано, что именно сделать, где и когда.']),

  lesson('lesson.pausing', 'delivery.pauses', ['The power of the pause', 'Pauzaning kuchi', 'Сила паузы'], [
    'A pause is the cheapest tool in speaking. Before your key line, a pause says "listen now". After a question to the room, it lets people think. Between points, it shows structure. A pause that feels long to you, one to two seconds, sounds calm and confident to the audience. Mark pauses in your notes with a slash (/) and practise them out loud.',
    'Pauza — notiqlikdagi eng arzon vosita. Asosiy gapdan oldingi pauza «hozir quloq soling» deydi. Xonadagilarga savol bergandan keyin u odamlarga o‘ylashga imkon beradi. Fikrlar orasida tuzilmani ko‘rsatadi. Sizga uzun tuyulgan pauza — bir-ikki soniya — tinglovchiga xotirjam va ishonchli eshitiladi. Eslatmalarda pauzalarni qiya chiziq (/) bilan belgilang va ovoz chiqarib mashq qiling.',
    'Пауза — самый дешёвый инструмент оратора. Перед главной фразой она говорит «слушайте сейчас». После вопроса залу — даёт подумать. Между тезисами — показывает структуру. Пауза, которая кажется вам долгой, одна-две секунды, для зала звучит спокойно и уверенно. Отмечайте паузы в заметках косой чертой (/) и тренируйте вслух.',
  ], ['Here is the number that surprised me most. / Twelve.', 'Meni eng ko‘p hayratlantirgan raqam mana shu. / O‘n ikki.', 'Вот цифра, которая удивила меня больше всего. / Двенадцать.'],
  ['Where does a pause help most?', 'Pauza qayerda eng ko‘p yordam beradi?', 'Где пауза помогает больше всего?'], [
    ['Before your most important sentence.', 'Eng muhim gapingizdan oldin.', 'Перед самой важной фразой.'],
    ['In the middle of every word.', 'Har so‘z o‘rtasida.', 'Посреди каждого слова.'],
    ['Never; pauses look nervous.', 'Hech qachon; pauza hayajonli ko‘rinadi.', 'Никогда: паузы выглядят нервно.'],
  ], 0, ['The silence before a key line makes people listen to it.', 'Asosiy gapdan oldingi jimlik odamlarni uni tinglashga majbur qiladi.', 'Тишина перед главной фразой заставляет людей её услышать.']),

  lesson('lesson.fillers', 'delivery.fillers', ['Fewer fillers, day by day', 'Kundan kunga kamroq to‘ldiruvchi', 'Меньше слов-паразитов день за днём'], [
    'Everyone uses fillers ("ee", "um", "типа", "haligi") when they think. They become a problem when listeners start counting them. The fix is not to stop thinking but to think in silence: close your mouth at the end of a phrase, breathe, then speak. Record one minute a day, count your fillers per 100 words in the coach’s report, and try to beat yesterday’s number.',
    'O‘ylayotganda hamma to‘ldiruvchi ishlatadi («ee», «haligi», «anu», «um»). Tinglovchilar ularni sanay boshlaganda muammo bo‘ladi. Yechim — o‘ylashni to‘xtatish emas, jim o‘ylash: ibora oxirida og‘zingizni yuming, nafas oling, keyin gapiring. Har kuni bir daqiqa yozib oling, murabbiy hisobotida 100 so‘zga to‘g‘ri kelgan to‘ldiruvchilarni sanang va kechagi raqamni yengishga harakat qiling.',
    'Все используют слова-паразиты («ну», «типа», «э-э», «um»), когда думают. Проблемой они становятся, когда слушатели начинают их считать. Решение не в том, чтобы перестать думать, а в том, чтобы думать молча: закройте рот в конце фразы, вдохните и говорите. Записывайте минуту в день, смотрите в отчёте коуча, сколько паразитов приходится на 100 слов, и старайтесь побить вчерашнее число.',
  ], ['That is a good question. / The short answer is yes.', 'Bu yaxshi savol. / Qisqa javob — ha.', 'Это хороший вопрос. / Короткий ответ — да.'],
  ['What replaces a filler best?', 'To‘ldiruvchini nima eng yaxshi almashtiradi?', 'Чем лучше всего заменить слово-паразит?'], [
    ['A different filler.', 'Boshqa to‘ldiruvchi.', 'Другим словом-паразитом.'],
    ['A short silent pause.', 'Qisqa jim pauza.', 'Короткой молчаливой паузой.'],
    ['Speaking much faster.', 'Ancha tez gapirish.', 'Гораздо более быстрой речью.'],
  ], 1, ['Silence does the same job as a filler but sounds confident.', 'Jimlik to‘ldiruvchi bilan bir xil vazifani bajaradi, lekin ishonchli eshitiladi.', 'Тишина делает ту же работу, что и паразит, но звучит уверенно.']),

  lesson('lesson.pace', 'delivery.pace', ['Pace: fast is not confident', 'Sur’at: tez — ishonchli degani emas', 'Темп: быстро — не значит уверенно'], [
    'Nerves make many people speak faster. A comfortable talk is roughly 110 to 170 words a minute; the coach measures yours from voice messages. Slow down for numbers, names and the key line; you can go a little faster in a story. If you have too much material, cut a point instead of speeding up: two clear points beat five rushed ones.',
    'Hayajondan ko‘p odamlar tezroq gapira boshlaydi. Qulay nutq daqiqasiga taxminan 110–170 so‘z; murabbiy buni ovozli xabarlaringizdan o‘lchaydi. Raqamlar, ismlar va asosiy gapda sekinlashing; hikoyada biroz tezroq gapirsa bo‘ladi. Material ko‘p bo‘lsa, tezlashish o‘rniga bir fikrni olib tashlang: ikkita aniq fikr beshta shoshilinch fikrdan yaxshi.',
    'От волнения многие начинают говорить быстрее. Комфортный темп — примерно 110–170 слов в минуту; коуч измеряет ваш по голосовым сообщениям. Замедляйтесь на цифрах, именах и главной фразе; в истории можно чуть быстрее. Если материала много, уберите один тезис, а не ускоряйтесь: два ясных тезиса лучше пяти скомканных.',
  ], ['Our sales grew by / thirty-seven percent.', 'Savdomiz / o‘ttiz yetti foizga oshdi.', 'Наши продажи выросли на / тридцать семь процентов.'],
  ['You have too much material for five minutes. What do you do?', 'Besh daqiqa uchun materialingiz ko‘p. Nima qilasiz?', 'Материала больше, чем на пять минут. Что делать?'], [
    ['Speak faster.', 'Tezroq gapiring.', 'Говорить быстрее.'],
    ['Cut to your strongest points.', 'Eng kuchli fikrlaringizni qoldiring.', 'Оставить самые сильные тезисы.'],
    ['Skip the close.', 'Yakunni tashlab keting.', 'Пропустить финал.'],
  ], 1, ['Cut content; do not rush, and never drop the close.', 'Mazmunni qisqartiring: shoshilmang va yakunni hech qachon tashlab ketmang.', 'Сокращайте содержание, но не спешите и никогда не выбрасывайте финал.']),

  lesson('lesson.story-arc', 'content.storytelling', ['A story in four moves', 'To‘rt qadamli hikoya', 'История в четыре хода'], [
    'A short story needs four moves. Scene: when and where, in one sentence (Last winter, at the bus stop, at six in the morning). Problem: what went wrong or what was at stake. Turn: the moment something changed — slow down here and give one detail people can see. Meaning: what it taught you, in one line, linked to your message. Leave out everything else.',
    'Qisqa hikoyaga to‘rt qadam kerak. Manzara: qachon va qayerda, bitta gapda (O‘tgan qishda, bekatda, ertalab soat oltida). Muammo: nima noto‘g‘ri ketdi yoki nima xavf ostida edi. Burilish: biror narsa o‘zgargan lahza — bu yerda sekinlashing va odamlar ko‘z oldiga keltira oladigan bitta tafsilot qo‘shing. Ma’no: bu sizga nimani o‘rgatdi, bitta gapda, xabaringizga bog‘lab. Qolgan hamma narsani olib tashlang.',
    'Короткой истории нужно четыре хода. Сцена: когда и где, одной фразой («Прошлой зимой, на остановке, в шесть утра»). Проблема: что пошло не так или что было на кону. Поворот: момент, когда всё изменилось, — здесь замедлитесь и добавьте одну деталь, которую можно увидеть. Смысл: чему это вас научило — одной фразой, связанной с вашей главной мыслью. Остальное уберите.',
  ], ['Last winter, at six in the morning, our bus did not come.', 'O‘tgan qishda, ertalab soat oltida avtobusimiz kelmadi.', 'Прошлой зимой, в шесть утра, наш автобус не пришёл.'],
  ['Where should you slow down in a story?', 'Hikoyada qayerda sekinlashish kerak?', 'Где в истории нужно замедлиться?'], [
    ['At the turning point.', 'Burilish lahzasida.', 'В момент поворота.'],
    ['At the date and time.', 'Sana va vaqtda.', 'На дате и времени.'],
    ['Nowhere; stories should be fast.', 'Hech qayerda; hikoya tez bo‘lishi kerak.', 'Нигде: истории должны быть быстрыми.'],
  ], 0, ['The turn is the heart of the story; give it time and one vivid detail.', 'Burilish — hikoyaning yuragi; unga vaqt va bitta yorqin tafsilot bering.', 'Поворот — сердце истории; дайте ему время и одну яркую деталь.']),

  lesson('lesson.elevator', 'formats.elevator_pitch', ['The elevator pitch formula', 'Elevator pitch formulasi', 'Формула elevator pitch'], [
    'An elevator pitch is about forty-five seconds. Use four lines: Problem (a pain the listener recognises), You (who you are, in one sentence), Offer (what you do and the one result that matters), Ask (one small, specific next step: a meeting, a trial, a yes). Write it, cut every word you can, then say it aloud until it fits in one breath per line.',
    'Elevator pitch taxminan qirq besh soniya davom etadi. To‘rt qatordan foydalaning: Muammo (tinglovchiga tanish qiyinchilik), Siz (kim ekaningiz, bitta gapda), Taklif (nima qilasiz va muhim bitta natija), Iltimos (bitta kichik, aniq keyingi qadam: uchrashuv, sinov, «ha»). Yozing, qisqartirish mumkin bo‘lgan har bir so‘zni olib tashlang, keyin har bir qator bir nafasda aytilguncha ovoz chiqarib mashq qiling.',
    'Elevator pitch — около сорока пяти секунд. Четыре строки: Проблема (боль, знакомая слушателю), Вы (кто вы, одной фразой), Предложение (что вы делаете и один важный результат), Просьба (один маленький конкретный шаг: встреча, проба, «да»). Напишите, вычеркните всё лишнее и проговаривайте вслух, пока каждая строка не уложится в один вдох.',
  ], ['All I need from you today is a yes for a six-week trial.', 'Bugun sizdan faqat olti haftalik sinovga «ha» kerak.', 'Сегодня мне нужно от вас только «да» на шестинедельную пробу.'],
  ['What should a pitch end with?', 'Pitch nima bilan tugashi kerak?', 'Чем должен заканчиваться питч?'], [
    ['A list of all your skills.', 'Barcha ko‘nikmalaringiz ro‘yxati.', 'Списком всех ваших навыков.'],
    ['One small, specific next step.', 'Bitta kichik, aniq keyingi qadam.', 'Одним маленьким конкретным шагом.'],
    ['Your full life story.', 'To‘liq hayot hikoyangiz.', 'Полной историей вашей жизни.'],
  ], 1, ['A small, clear ask is easy to say yes to.', 'Kichik, aniq iltimosga «ha» deyish oson.', 'На маленькую ясную просьбу легко ответить «да».']),

  lesson('lesson.impromptu', 'formats.impromptu', ['Impromptu: PREP in one minute', 'Tayyorgarliksiz nutq: bir daqiqada PREP', 'Импровизация: PREP за минуту'], [
    'When you must answer on the spot, use PREP: Point (your answer in one sentence), Reason (why), Example (one concrete case), Point again (repeat your answer as a close). Take one silent second before you start; it looks thoughtful, not lost. One reason and one example are enough for a minute.',
    'Darhol javob berish kerak bo‘lsa, PREPdan foydalaning: Point — fikr (javobingiz bitta gapda), Reason — sabab (nega), Example — misol (bitta aniq holat), Point — yana fikr (javobni yakun sifatida takrorlang). Boshlashdan oldin bir soniya jim turing; bu adashgandek emas, o‘ylayotgandek ko‘rinadi. Bir daqiqa uchun bitta sabab va bitta misol yetarli.',
    'Если нужно ответить сразу, используйте PREP: Point — позиция (ответ одной фразой), Reason — причина (почему), Example — пример (один конкретный случай), Point — снова позиция (повторите ответ как финал). Перед началом помолчите секунду — это выглядит вдумчиво, а не растерянно. На минуту хватит одной причины и одного примера.',
  ], ['Yes, I think phones should stay in a box during lessons, because…', 'Ha, menimcha, darsda telefonlar qutida turishi kerak, chunki…', 'Да, я считаю, что на уроках телефоны должны лежать в коробке, потому что…'],
  ['What does the second P in PREP stand for?', 'PREPdagi ikkinchi P nimani anglatadi?', 'Что означает вторая P в PREP?'], [
    ['Your point again, as a close.', 'Yakun sifatida yana fikringiz.', 'Снова ваша позиция — как финал.'],
    ['A new point.', 'Yangi fikr.', 'Новый тезис.'],
    ['A pause.', 'Pauza.', 'Пауза.'],
  ], 0, ['Repeating your point closes the answer cleanly.', 'Fikrni takrorlash javobni aniq yakunlaydi.', 'Повтор позиции аккуратно закрывает ответ.']),

  lesson('lesson.qa', 'interaction.qa', ['Handling questions', 'Savollar bilan ishlash', 'Как отвечать на вопросы'], [
    'Use a simple pattern for every question: listen to the end, pause, answer in your first sentence, give one reason or example, stop. If the question is unclear, repeat it in your words ("So you are asking whether…?"). If it is hostile, thank them, say what is fair in it, and answer the core calmly. If you do not know, say "I don’t know yet; I will check and send it" — never invent. End the Q&A with your key line.',
    'Har bir savol uchun oddiy tartibdan foydalaning: oxirigacha tinglang, pauza qiling, birinchi gapda javob bering, bitta sabab yoki misol keltiring va to‘xtang. Savol noaniq bo‘lsa, o‘z so‘zlaringiz bilan takrorlang («Demak, siz … deb so‘rayapsizmi?»). Savol dushmanona bo‘lsa, rahmat ayting, undagi asosli jihatni tan oling va mohiyatiga xotirjam javob bering. Bilmasangiz, «Hozircha bilmayman, tekshirib yuboraman» deng — hech qachon to‘qimang. Savol-javobni asosiy gapingiz bilan yakunlang.',
    'Простая схема для любого вопроса: дослушайте, сделайте паузу, ответьте в первой фразе, дайте одну причину или пример — и стоп. Неясный вопрос перескажите своими словами («То есть вы спрашиваете, …?»). Враждебный — поблагодарите, признайте то, что в нём справедливо, и спокойно ответьте по сути. Не знаете — скажите: «Пока не знаю, проверю и пришлю»; никогда не выдумывайте. Завершите ответы на вопросы главной фразой.',
  ], ['I don’t know yet. I will check and send it to you today.', 'Hozircha bilmayman. Tekshirib, bugun sizga yuboraman.', 'Пока не знаю. Проверю и пришлю вам сегодня.'],
  ['A question is hostile. What comes first?', 'Savol dushmanona. Avval nima qilasiz?', 'Вопрос враждебный. Что сначала?'], [
    ['Defend yourself strongly.', 'O‘zingizni qattiq himoya qiling.', 'Жёстко защищаться.'],
    ['Stay calm and acknowledge what is fair in it.', 'Xotirjam bo‘ling va undagi asosli jihatni tan oling.', 'Сохранить спокойствие и признать то, что в нём справедливо.'],
    ['Ignore the person.', 'U odamga e’tibor bermang.', 'Игнорировать человека.'],
  ], 1, ['Acknowledging first lowers the heat and lets your answer be heard.', 'Avval tan olish taranglikni pasaytiradi, shunda javobingizni eshitishadi.', 'Признание снижает накал, и ваш ответ услышат.']),

  lesson('lesson.nerves', 'interaction.audience', ['Nerves are fuel', 'Hayajon — yoqilg‘i', 'Волнение — это топливо'], [
    'Almost every speaker is nervous, and the audience sees far less of it than you feel. Use the energy: prepare your first two sentences word for word, breathe out slowly before you start (a long breath out calms the body), find two friendly faces, and speak to them. Do not announce your nerves. With regular practice the fear usually gets smaller; that is why the coach asks for one short talk a day.',
    'Deyarli har bir notiq hayajonlanadi va tinglovchilar siz his qilganingizdan ancha kamini ko‘radi. Bu energiyadan foydalaning: dastlabki ikki gapni so‘zma-so‘z tayyorlang, boshlashdan oldin sekin nafas chiqaring (uzoq nafas chiqarish tanani tinchlantiradi), ikkita xayrixoh chehrani toping va ularga qarab gapiring. Hayajoningizni e’lon qilmang. Muntazam mashq bilan qo‘rquv odatda kamayadi; shuning uchun murabbiy kuniga bitta qisqa nutq so‘raydi.',
    'Волнуются почти все, и зал видит гораздо меньше, чем вы чувствуете. Используйте эту энергию: подготовьте первые две фразы слово в слово, медленно выдохните перед началом (долгий выдох успокаивает тело), найдите два дружелюбных лица и обращайтесь к ним. Не объявляйте о волнении. С регулярной практикой страх обычно ослабевает — поэтому коуч просит одну короткую речь в день.',
  ], ['Good morning, everyone. / Last year, half our class failed the same test.', 'Hammaga xayrli tong. / O‘tgan yili sinfimizning yarmi bir xil testdan o‘ta olmadi.', 'Доброе утро всем. / В прошлом году полкласса провалило один и тот же тест.'],
  ['What calms the body before you speak?', 'Gapirishdan oldin tanani nima tinchlantiradi?', 'Что успокаивает тело перед выступлением?'], [
    ['A slow, long breath out.', 'Sekin, uzoq nafas chiqarish.', 'Медленный долгий выдох.'],
    ['Telling the audience you are nervous.', 'Tinglovchilarga hayajonlanganingizni aytish.', 'Сказать залу, что вы волнуетесь.'],
    ['Drinking three coffees.', 'Uch chashka qahva ichish.', 'Выпить три чашки кофе.'],
  ], 0, ['A long breath out helps slow your heartbeat; announcing nerves only spreads them.', 'Uzoq nafas chiqarish yurak urishini sekinlashtirishga yordam beradi; hayajonni e’lon qilish esa uni yoyadi.', 'Долгий выдох помогает успокоить сердцебиение; объявленное волнение передаётся залу.']),

  lesson('lesson.slides', 'formats.presentation', ['Slides that help, not slides to read', 'O‘qilmaydigan, yordam beradigan slaydlar', 'Слайды, которые помогают, а не читаются'], [
    'Slides are for the audience, not your notes. One idea per slide, a few words or one picture, numbers big and simple. Never read a slide aloud: people read faster than you speak and stop listening. Say the point, then let the slide show it. Plan the talk so it works even if the projector fails — and keep your notes as keywords, not full sentences.',
    'Slaydlar sizning eslatmangiz emas, tinglovchilar uchun. Har slaydda bitta g‘oya, bir necha so‘z yoki bitta rasm, raqamlar katta va sodda. Slaydni hech qachon ovoz chiqarib o‘qimang: odamlar siz gapirgandan tezroq o‘qiydi va tinglashni to‘xtatadi. Fikrni ayting, keyin slayd uni ko‘rsatsin. Proyektor ishlamasa ham ishlaydigan qilib rejalashtiring — eslatmalarni to‘liq gaplar emas, kalit so‘zlar shaklida saqlang.',
    'Слайды — для зала, а не шпаргалка для вас. Одна мысль на слайд, несколько слов или одна картинка, крупные простые цифры. Никогда не читайте слайд вслух: люди читают быстрее, чем вы говорите, и перестают слушать. Скажите мысль, а слайд пусть её покажет. Готовьте речь так, чтобы она работала и без проектора, а заметки пишите ключевыми словами, а не целыми фразами.',
  ], ['Here is the number that matters. / One in five.', 'Mana muhim raqam. / Beshtadan biri.', 'Вот цифра, которая важна. / Каждый пятый.'],
  ['How many ideas should one slide have?', 'Bitta slaydda nechta g‘oya bo‘lishi kerak?', 'Сколько мыслей должно быть на одном слайде?'], [
    ['One.', 'Bitta.', 'Одна.'],
    ['As many as fit.', 'Qancha sig‘sa.', 'Сколько поместится.'],
    ['At least five.', 'Kamida beshta.', 'Не меньше пяти.'],
  ], 0, ['One idea per slide keeps eyes on you and the message clear.', 'Har slaydda bitta g‘oya bo‘lsa, tinglovchilar sizga qaraydi va xabar aniq qoladi.', 'Одна мысль на слайде — и зал смотрит на вас, а главное остаётся ясным.']),

  lesson('lesson.persuade', 'content.persuasion', ['Persuade with problem, proof, picture', 'Muammo, dalil, manzara bilan ishontiring', 'Убеждайте: проблема, доказательство, картинка'], [
    'To change minds, show three things. Problem: why the current situation hurts this audience (their time, money, children, reputation). Proof: one true number or real example that your solution works, with where it comes from. Picture: what life looks like after the change ("Imagine Saturday mornings with a clean canal"). Then make the ask small and specific. Never use fake urgency or invented facts.',
    'Fikrni o‘zgartirish uchun uch narsani ko‘rsating. Muammo: hozirgi vaziyat bu auditoriyaga qanday zarar yetkazadi (vaqti, puli, bolalari, obro‘si). Dalil: yechimingiz ishlashini ko‘rsatuvchi bitta haqiqiy raqam yoki haqiqiy misol, manbasi bilan. Manzara: o‘zgarishdan keyin hayot qanday bo‘ladi («Toza kanal bo‘yidagi shanba tonglarini tasavvur qiling»). Keyin iltimosni kichik va aniq qiling. Hech qachon soxta shoshilinchlik yoki to‘qima faktlardan foydalanmang.',
    'Чтобы изменить мнение, покажите три вещи. Проблема: чем нынешняя ситуация вредит этим людям (время, деньги, дети, репутация). Доказательство: одна правдивая цифра или реальный пример, что решение работает, с источником. Картинка: какой станет жизнь после изменения («Представьте субботнее утро у чистого канала»). Затем сделайте просьбу маленькой и конкретной. Никакой фальшивой срочности и выдуманных фактов.',
  ], ['Imagine Saturday mornings with a clean canal.', 'Toza kanal bo‘yidagi shanba tonglarini tasavvur qiling.', 'Представьте субботнее утро у чистого канала.'],
  ['Which proof is strongest?', 'Qaysi dalil eng kuchli?', 'Какое доказательство сильнее?'], [
    ['Everybody knows it works.', 'Ishlashini hamma biladi.', 'Все знают, что это работает.'],
    ['We tried it in one class for a month and late homework fell from twelve to three.', 'Bir sinfda bir oy sinab ko‘rdik va kechikkan uy vazifalari o‘n ikkitadan uchtaga tushdi.', 'Мы месяц пробовали это в одном классе, и несданных вовремя домашних заданий стало три вместо двенадцати.'],
    ['Experts agree.', 'Mutaxassislar rozi.', 'Эксперты согласны.'],
  ], 1, ['A real test with a before and after beats vague authority.', '«Oldin» va «keyin»ni ko‘rsatgan haqiqiy sinov mavhum obro‘ga tayanishdan kuchliroq.', 'Реальная проверка «до и после» сильнее расплывчатых ссылок на авторитет.']),
];
