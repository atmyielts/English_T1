import type { CalibrationRun, CalibrationSample } from '../src/types.ts';

// Calibration for `speech.talk` and `speech.qa`: twelve talks and twelve Q&A sessions
// from L1 to L5, in English, Uzbek and Russian, as speech-to-text returns them (talks
// carry the measured numbers), rated by the author on every model-scored criterion with
// a rationale a reviewer can disagree with. Three assessor runs per sample: one at the
// reference with full evidence, two that each move one criterion by half a level, as a
// real assessor drifts. Every quote is copied from the response word for word.
// The runs are authored in the assessor's output shape, not captured from a model:
// they test the scoring pipeline and the thresholds in CI. Replace them with real runs
// from scripts/coach-calibration-live.ts --out once a model route is configured.
// People, schools and companies are invented for practice.

type Five = [number, number, number, number, number];
interface Spec {
  id: string;
  task: string;
  lines: string[];
  metrics?: CalibrationSample['metrics'];
  ref: Five;
  why: string;
  /** Quotes per criterion, in the rubric's criterion order. */
  ev: [string[], string[], string[], string[], string[]];
}

function build(ids: string[], specs: Spec[]) {
  const samples: CalibrationSample[] = [];
  const runs: Record<string, CalibrationRun[]> = {};
  specs.forEach((spec, index) => {
    const response = spec.lines.join('\n');
    samples.push({ id: spec.id, task: spec.task, response, ...(spec.metrics ? { metrics: spec.metrics } : {}), reference: Object.fromEntries(ids.map((id, i) => [id, spec.ref[i]])), rationale: spec.why });
    const up = index % ids.length, down = (index + 2) % ids.length;
    const shifted = (at: number, by: number) => spec.ref.map((value, i) => (i === at ? Math.min(5, Math.max(1, value + (value + by > 5 || value + by < 1 ? -by : by))) : value));
    const run = (scores: number[], pick: (quotes: string[]) => string[]): CalibrationRun => ({ criteria: Object.fromEntries(ids.map((id, i) => [id, { score: scores[i], evidence: pick(spec.ev[i]) }])) });
    runs[spec.id] = [
      run(spec.ref, (quotes) => quotes),
      run(shifted(up, 0.5), (quotes) => quotes.slice(0, 1)),
      run(shifted(down, -0.5), (quotes) => quotes.slice(-1)),
    ];
  });
  return { samples, runs };
}

// --- Talks ---------------------------------------------------------------------------------------------
const TALK = ['structure', 'clarity', 'flow', 'engagement', 'language'];
export const talkCalibration = build(TALK, [
  {
    id: 't01-school-start-l1',
    task: 'Impromptu (formats.impromptu): "Should school start one hour later?" One minute to answer.',
    lines: [
      'Ee sorry, I am not good speaker.',
      'Um so, school start later. I think yes.',
      'Because, um, students sleep. Um, they are tired.',
      'Yes. Um, so that’s all.',
    ],
    metrics: { wpm: 64, longPauses: 6, fillers: 6, seconds: 28 },
    ref: [1, 1.5, 1, 1, 1.5],
    why: 'Opens by apologising and ends with "that’s all": no hook, one undeveloped reason, no close. The position (yes) is understandable but thin. Six fillers in about thirty words and six long pauses at 64 wpm. No example at all. Basic errors (I am not good speaker, school start) but the meaning gets through.',
    ev: [['Ee sorry, I am not good speaker', 'so that’s all'], ['school start later. I think yes'], ['Um, they are tired', 'Ee sorry'], ['Because, um, students sleep'], ['I am not good speaker', 'school start later']],
  },
  {
    id: 't02-jobfair-pitch-l1plus',
    task: 'Elevator pitch (formats.elevator_pitch): introduce yourself to a recruiter at a job fair in under a minute.',
    lines: [
      'Ee assalomu alaykum. Men ee Jasurman.',
      'Haligi men universitetni bitirdim, ee iqtisodchiman.',
      'Anu ish qidiryapman. Xullas, sizlarda ish bormi?',
      'Ee rahmat.',
    ],
    metrics: { wpm: 70, longPauses: 4, fillers: 6, seconds: 22 },
    ref: [1.5, 2, 1, 1, 2],
    why: 'Who he is comes through (name, graduate, economist) but there is nothing about what he is good at or why this company, and the "ask" is a bare "do you have a job?". Six fillers in about twenty words. No detail a recruiter would remember. Polite, accurate Uzbek.',
    ev: [['Men ee Jasurman', 'sizlarda ish bormi?'], ['men universitetni bitirdim, ee iqtisodchiman'], ['Haligi men', 'Anu ish qidiryapman'], ['Xullas, sizlarda ish bormi?'], ['Ee assalomu alaykum', 'Ee rahmat']],
  },
  {
    id: 't03-olympiad-story-l2',
    task: 'Story (formats.storytelling_talk): "Tell us about a time you failed and what you learned." Up to two minutes.',
    lines: [
      'Ну, это было в десятом классе.',
      'Типа у нас была олимпиада по математике, и я, короче, не подготовился.',
      'Я думал, что я и так знаю. И я, ну, получил плохой результат.',
      'Это было обидно. Ну и вот, после этого я стал больше заниматься.',
      'Всё.',
    ],
    metrics: { wpm: 96, longPauses: 3, fillers: 6, seconds: 34 },
    ref: [2, 2.5, 2, 2, 2.5],
    why: 'There is a situation, a failure and a lesson, so the bones of a story are there, but it is told as a summary with no scene, no feelings beyond "обидно" and a one-word ending ("Всё."). Clear enough to follow. Six fillers (ну, типа, короче) in about fifty words. Plain correct Russian.',
    ev: [['Ну, это было в десятом классе', 'Всё.'], ['у нас была олимпиада по математике', 'после этого я стал больше заниматься'], ['Типа у нас была', 'и я, короче, не подготовился'], ['Это было обидно'], ['Я думал, что я и так знаю']],
  },
  {
    id: 't04-recycling-l2plus',
    task: 'Presentation rehearsal (formats.presentation): "Our school needs a recycling programme" for the school council, two minutes.',
    lines: [
      'Today I will talk about recycling in our school.',
      'Recycling is very important for the environment and for the future, as we know.',
      'In our school we have a lot of plastic bottles, and paper, and also, um, cans from the canteen, and they all go to the same bin, which is not good, because then nothing can be recycled and it all goes to the landfill outside the city.',
      'We can put three bins in the corridor. Also we can make posters. Also students can help.',
      'So I think we should do it. Thank you.',
    ],
    metrics: { wpm: 128, longPauses: 2, fillers: 2, seconds: 50 },
    ref: [2.5, 2.5, 3, 2, 3],
    why: 'Opens with the title ("Today I will talk about"), then a generic claim; the problem is described in one long sentence. Three ideas are listed with "Also… Also…" and no signposts, and the close is a vague "we should do it" with no specific request to the council. Flow is fine (128 wpm, few fillers). Only one concrete detail (one bin for everything).',
    ev: [['Today I will talk about recycling in our school', 'So I think we should do it'], ['and they all go to the same bin, which is not good', 'We can put three bins in the corridor'], ['and also, um, cans from the canteen'], ['Recycling is very important for the environment and for the future, as we know'], ['which is not good, because then nothing can be recycled']],
  },
  {
    id: 't05-social-media-l3',
    task: 'Impromptu (formats.impromptu): "Ijtimoiy tarmoqlar yoshlarga foydami yoki zararmi?" One to two minutes.',
    lines: [
      'Menimcha, ijtimoiy tarmoqlar ham foydali, ham zararli, lekin to‘g‘ri ishlatilsa foydasi ko‘proq.',
      'Birinchidan, ular orqali yoshlar yangi narsalarni o‘rganadi, masalan, ingliz tili darslari yoki dasturlash.',
      'Ikkinchidan, ee, zarari ham bor: ko‘p vaqt ketadi, odam kechasi uxlamay telefon ko‘radi.',
      'Shuning uchun, xulosa qilib aytganda, vaqtni nazorat qilish kerak.',
    ],
    metrics: { wpm: 118, longPauses: 2, fillers: 2, seconds: 45 },
    ref: [3, 3, 3, 2.5, 3],
    why: 'A clear position, two numbered points (birinchidan, ikkinchidan) and a summary: a simple but clear shape. The opening states the position rather than hooking, and the close is a general "control your time" with no specific request. Examples are named but generic. Pace 118 wpm with two fillers.',
    ev: [['Birinchidan, ular orqali yoshlar yangi narsalarni o‘rganadi', 'xulosa qilib aytganda, vaqtni nazorat qilish kerak'], ['to‘g‘ri ishlatilsa foydasi ko‘proq'], ['Ikkinchidan, ee, zarari ham bor'], ['masalan, ingliz tili darslari yoki dasturlash', 'odam kechasi uxlamay telefon ko‘radi'], ['ham foydali, ham zararli']],
  },
  {
    id: 't06-farm-app-pitch-l3',
    task: 'Elevator pitch (formats.elevator_pitch): a startup idea for a jury of local business people, one minute. Typed, no timing.',
    lines: [
      'Добрый день. Меня зовут Камила, я студентка второго курса.',
      'Наша идея — приложение, через которое фермеры с рынка могут продавать овощи сразу в кафе и рестораны, без перекупщиков.',
      'Сейчас фермер теряет часть цены на посредниках, а кафе не всегда знает, где взять свежие продукты рано утром.',
      'Мы уже поговорили с пятью фермерами на Алайском базаре, и трое готовы попробовать.',
      'Мы ищем наставника и небольшой грант на тестирование. Спасибо.',
    ],
    ref: [3, 3.5, 3, 3, 3],
    why: 'Who, what, the problem and a clear ask are all there in under a minute, which is the right shape, but the opening is a plain introduction and the ask is not tied to a next step. Clear, plain Russian; the problem is explained well. One real detail (five farmers, three ready). Typed, so flow is judged only from the text: no fillers, but nothing to show control of pace.',
    ev: [['Добрый день. Меня зовут Камила', 'Мы ищем наставника и небольшой грант на тестирование'], ['фермеры с рынка могут продавать овощи сразу в кафе и рестораны, без перекупщиков'], ['Сейчас фермер теряет часть цены на посредниках'], ['Мы уже поговорили с пятью фермерами на Алайском базаре, и трое готовы попробовать'], ['я студентка второго курса']],
  },
  {
    id: 't07-advice-story-l3plus',
    task: 'Story (formats.storytelling_talk): "The best advice you ever got." Up to two minutes.',
    lines: [
      'The best advice I ever got was six words long: "Ask the question nobody else asks."',
      'My grandfather said it when I was twelve. We were at the bazaar in Fergana, and he asked the seller where the apricots were really from.',
      'Everyone else just paid. The seller laughed and admitted they were from the next town, and the price dropped.',
      'Since then, um, I ask. In my first job interview I asked what the team found hardest, and they told me later that question got me the job.',
      'So my advice to you: ask the question nobody else asks.',
    ],
    metrics: { wpm: 142, longPauses: 2, fillers: 1, seconds: 58 },
    ref: [3.5, 3.5, 3.5, 4, 3.5],
    why: 'A strong hook (the six-word advice), a vivid scene at the bazaar and a second example from an interview, ending by repeating the line as advice to the audience. The middle runs together a little, and the transition to the interview is abrupt ("Since then"). Good, unhurried pace with one filler. Story details make it memorable.',
    ev: [['The best advice I ever got was six words long', 'So my advice to you: ask the question nobody else asks'], ['he asked the seller where the apricots were really from'], ['Since then, um, I ask'], ['We were at the bazaar in Fergana', 'that question got me the job'], ['Everyone else just paid']],
  },
  {
    id: 't08-library-l4',
    task: 'Presentation rehearsal (formats.presentation): "Kutubxonaga raqamli bo‘lim kerak" for the district education department, two to three minutes.',
    lines: [
      'O‘tgan oy maktabimiz kutubxonasiga necha o‘quvchi kelganini taxmin qila olasizmi? Atigi o‘n ikki nafar — sakkiz yuz o‘quvchidan.',
      'Bugun men sizga uchta narsani aytaman: nega o‘quvchilar kelmayapti, raqamli bo‘lim nimani o‘zgartiradi va bu qancha turadi.',
      'Birinchidan, sabab. Biz sorovnoma o‘tkazdik: o‘quvchilarning ko‘pi kitoblarni eski va kerakli kitoblar yo‘q deb javob berdi.',
      'Ikkinchidan, yechim: to‘rtta kompyuter va elektron kutubxonaga obuna. Shunda bitta kitobni bir vaqtda o‘ttiz kishi o‘qiy oladi.',
      'Uchinchidan, narx. Ota-onalar qo‘mitasi kompyuterlarning yarmini to‘lashga tayyor.',
      'Shuning uchun sizdan iltimos: keyingi oyda sinov tariqasida bitta xonani ajratishga ruxsat bering.',
    ],
    metrics: { wpm: 132, longPauses: 3, fillers: 1, seconds: 95 },
    ref: [4, 4, 4, 4, 4],
    why: 'A question hook with a striking number, a road map of three points, each signposted and supported, and a specific request (one room as a pilot next month). Clear Uzbek and well-chosen register for officials; a small spelling slip in the transcript (sorovnoma) is speech-to-text. Pace and pauses well controlled. The cost point is thin, which keeps it at 4 rather than 5.',
    ev: [['O‘tgan oy maktabimiz kutubxonasiga necha o‘quvchi kelganini taxmin qila olasizmi?', 'keyingi oyda sinov tariqasida bitta xonani ajratishga ruxsat bering'], ['Bugun men sizga uchta narsani aytaman'], ['Birinchidan, sabab'], ['Atigi o‘n ikki nafar — sakkiz yuz o‘quvchidan', 'bitta kitobni bir vaqtda o‘ttiz kishi o‘qiy oladi'], ['Shuning uchun sizdan iltimos']],
  },
  {
    id: 't09-coding-l4',
    task: 'Impromptu (formats.impromptu): "Нужно ли учить детей программированию с начальной школы?" Up to two minutes.',
    lines: [
      'Представьте ребёнка, который в восемь лет сделал свою первую игру — простую, с одним котиком. Что он узнал? Не только код.',
      'Я считаю, что да, учить нужно, но не как отдельный сложный предмет, а как игру. И вот две причины.',
      'Первая: программирование учит разбивать большую задачу на маленькие шаги. Это нужно и в математике, и в жизни.',
      'Вторая: ребёнок, который сам что-то создал, перестаёт бояться ошибок, ведь ошибка — это просто баг, который можно исправить.',
      'Поэтому мой ответ: да, с начальной школы, по часу в неделю, через игру.',
    ],
    metrics: { wpm: 150, longPauses: 1, fillers: 0, seconds: 70 },
    ref: [4, 4, 3.5, 4, 4],
    why: 'An image hook (the eight-year-old’s first game), a position with two announced reasons, each explained, and a precise answer to close (yes, an hour a week, through play). Pace 150 wpm is inside the comfortable range but brisk, with only one pause, so the key lines are not given room: flow 3.5. Strong, natural Russian.',
    ev: [['Представьте ребёнка, который в восемь лет сделал свою первую игру', 'Поэтому мой ответ: да, с начальной школы, по часу в неделю, через игру'], ['программирование учит разбивать большую задачу на маленькие шаги'], ['И вот две причины'], ['ошибка — это просто баг, который можно исправить'], ['не как отдельный сложный предмет, а как игру']],
  },
  {
    id: 't10-tutoring-pitch-l4plus',
    task: 'Elevator pitch (formats.elevator_pitch): pitch a peer-tutoring club to the school director in one minute.',
    lines: [
      'Last term, thirty of our ninth graders failed the maths test. Twenty of them told us the same thing: they were too shy to ask the teacher.',
      'I’m Malika from 11-B, and I want to start a peer-tutoring club: older students helping younger ones, twice a week, after lessons.',
      'Students ask a classmate what they won’t ask a teacher. And tutors learn twice: once when they study, once when they explain.',
      'We have twelve volunteers ready and Ms Saidova has offered her classroom.',
      'All I need from you today is a yes for a six-week trial. Can we start next Monday?',
    ],
    metrics: { wpm: 138, longPauses: 4, fillers: 0, seconds: 55 },
    ref: [4.5, 4.5, 4.5, 4.5, 4.5],
    why: 'Opens with a problem in two numbers, then who she is and the idea, two crisp reasons (the second a memorable line), proof of readiness and a precise ask with a date. Deliberate pauses, no fillers. To reach 5 the "why now" could be sharper and the reasons connected back to the failed test.',
    ev: [['Last term, thirty of our ninth graders failed the maths test', 'All I need from you today is a yes for a six-week trial'], ['older students helping younger ones, twice a week, after lessons'], ['Can we start next Monday?'], ['they were too shy to ask the teacher', 'once when they study, once when they explain'], ['Students ask a classmate what they won’t ask a teacher']],
  },
  {
    id: 't11-first-salary-story-l5',
    task: 'Story (formats.storytelling_talk): "A moment that changed how you see money." Up to two minutes.',
    lines: [
      'Birinchi maoshimni olgan kunim konvertni uch marta sanadim. Bir million ikki yuz ming so‘m. O‘sha paytda bu menga butun dunyodek tuyuldi.',
      'Uyga borgunimcha uni qanday sarflashni rejaladim: yangi krossovka, do‘stlar bilan kafe, telefon uchun g‘ilof.',
      'Eshikni ochdim — onam oshxonada, kechki ovqat ustida, charchagan holda o‘tirgan ekan. Stol ustida esa elektr to‘lovi kvitansiyasi.',
      'Men jim turib qoldim. Keyin konvertdan pul chiqarib, kvitansiya ustiga qo‘ydim.',
      'Onam hech narsa demadi. Faqat kulib qo‘ydi. Shu kulgi menga krossovkadan qimmatroq bo‘ldi.',
      'O‘sha kuni bildimki, pul nima sotib olishing emas, kimga yelka tutishing bilan o‘lchanadi.',
    ],
    metrics: { wpm: 124, longPauses: 5, fillers: 0, seconds: 80 },
    ref: [5, 5, 4.5, 5, 5],
    why: 'A complete story arc: the hook of counting the envelope three times, a vivid turning point at the kitchen door, the gesture, the mother’s smile, and a meaning that lands in one line. Concrete, true-to-life details throughout and precise, natural Uzbek. Pauses are used for effect; pace is a little slow in the middle, so flow is 4.5.',
    ev: [['Birinchi maoshimni olgan kunim konvertni uch marta sanadim', 'pul nima sotib olishing emas, kimga yelka tutishing bilan o‘lchanadi'], ['Keyin konvertdan pul chiqarib, kvitansiya ustiga qo‘ydim'], ['Men jim turib qoldim'], ['Stol ustida esa elektr to‘lovi kvitansiyasi', 'Shu kulgi menga krossovkadan qimmatroq bo‘ldi'], ['O‘sha paytda bu menga butun dunyodek tuyuldi']],
  },
  {
    id: 't12-bus-stop-l5',
    task: 'Presentation rehearsal (formats.presentation): "Why our city should test free buses for students" for a city youth forum, three minutes (the close).',
    lines: [
      'So let’s go back to Dilnoza, waiting at the bus stop at seven in the morning with her last two thousand sum.',
      'We have seen three things today. First, students like her spend almost a fifth of their pocket money on travel. Second, every free seat we offer is a car that stays at home. Third, the cities that tried it did not stop at one year.',
      'I am not asking you to change the whole system. I am asking for one route, one semester, and an honest count at the end.',
      'If the numbers are wrong, we stop. If they are right, Dilnoza keeps her two thousand sum — and you keep a student who gets to class on time.',
      'One route. One semester. Let’s count. Thank you.',
    ],
    metrics: { wpm: 134, longPauses: 6, fillers: 0, seconds: 75 },
    ref: [5, 5, 5, 5, 5],
    why: 'A close that returns to the opening character, recaps three numbered points in one breath each, narrows the ask to something easy to say yes to, handles the obvious objection ("if the numbers are wrong, we stop") and ends with a rhythmic three-part line. Six deliberate pauses, no fillers, controlled pace. Every sentence does a job.',
    ev: [['So let’s go back to Dilnoza, waiting at the bus stop', 'One route. One semester. Let’s count.'], ['I am asking for one route, one semester, and an honest count at the end'], ['If the numbers are wrong, we stop'], ['Dilnoza keeps her two thousand sum', 'every free seat we offer is a car that stays at home'], ['I am not asking you to change the whole system']],
  },
]);

// --- Q&A after a talk ------------------------------------------------------------------------------------
const QA = ['answer', 'brevity', 'evidence', 'composure', 'respect'];
export const qaCalibration = build(QA, [
  {
    id: 'q01-investor-l1',
    task: 'Q&A role-play (rp.qa-investor): a sceptical investor asks how many users the app has, why people would pay, and what happens if a big company copies it.',
    lines: [
      'I don’t know. Maybe yes.',
      'It is good product, everybody will buy.',
      'Why you ask this? I already said in my talk.',
    ],
    ref: [1, 1.5, 1, 1, 1],
    why: 'No question is actually answered: "maybe yes" to a question about numbers, "everybody will buy" with no reason, and an irritated "I already said". Answers are short but empty. No evidence. Defensive and dismissive toward the questioner.',
    ev: [['I don’t know. Maybe yes'], ['It is good product, everybody will buy'], ['everybody will buy'], ['Why you ask this?'], ['I already said in my talk']],
  },
  {
    id: 'q02-director-l1plus',
    task: 'Q&A role-play (rp.qa-director): the school director asks who will pay for the robotics club, who will supervise it, and whether it will hurt exam results.',
    lines: [
      'Ee, bilmadim, aniq aytolmayman.',
      'Hamma maktablarda bor-ku, bizda ham bo‘lsin.',
      'Xo‘p, kechirasiz, kechirasiz. Mayli, kerak bo‘lmasa, kerak emas.',
    ],
    ref: [1.5, 2, 1, 1.5, 2],
    why: 'The money question gets "I can’t say", the second answer is "every school has one" (not true as stated, and no reason), and under the exam question the speaker gives up the whole idea. Short answers, polite words, but over-apologising and collapsing under pressure.',
    ev: [['Ee, bilmadim, aniq aytolmayman'], ['Hamma maktablarda bor-ku, bizda ham bo‘lsin'], ['Hamma maktablarda bor-ku'], ['Xo‘p, kechirasiz, kechirasiz', 'kerak bo‘lmasa, kerak emas'], ['Xo‘p, kechirasiz']],
  },
  {
    id: 'q03-journalist-l2',
    task: 'Q&A role-play (rp.qa-journalist): a local journalist asks why the volunteer project needs city money and whether the results are real.',
    lines: [
      'Ну, смотрите, это очень хороший вопрос, и я хочу начать с того, что наш проект вообще начался два года назад, когда мы с друзьями решили, что нужно что-то делать, потому что в нашем районе много пожилых людей, и мы начали ходить, помогать, и потом к нам присоединились ещё ребята, и в общем это большая работа.',
      'Результаты, ну, есть, конечно. Люди довольны. Нам говорят спасибо.',
      'Деньги нужны, потому что, ну, всё стоит денег.',
    ],
    ref: [2, 1.5, 2, 2, 2.5],
    why: 'The first answer never reaches the question (why city money) after a long history of the project. "Results… people are happy" offers no number or example a journalist could print. "Everything costs money" is not a reason. Polite and not defensive, but rambling and vague.',
    ev: [['Деньги нужны, потому что, ну, всё стоит денег'], ['и я хочу начать с того, что наш проект вообще начался два года назад', 'и в общем это большая работа'], ['Люди довольны. Нам говорят спасибо'], ['Результаты, ну, есть, конечно'], ['это очень хороший вопрос']],
  },
  {
    id: 'q04-parents-l2plus',
    task: 'Q&A role-play (rp.qa-parents): at a parents’ meeting after a talk about a new homework app, a parent asks about screen time, cost and data safety.',
    lines: [
      'Thank you for the question. Screen time is a real worry for all of us.',
      'The app is maybe fifteen minutes a day, I think, but it depends on the child, some children use it more, some less, and also the teacher can decide how much.',
      'About cost, it is free for parents, the school pays.',
      'About data, I am not sure exactly, but I think it is safe, it is a big company.',
    ],
    ref: [2.5, 2.5, 2, 2.5, 3],
    why: 'Thanks the parent and acknowledges the worry, and the cost answer is direct. The screen-time answer hedges and wanders; the data answer guesses ("I think it is safe, it is a big company") instead of saying "I will find out". Respectful throughout.',
    ev: [['About cost, it is free for parents, the school pays'], ['but it depends on the child, some children use it more, some less'], ['I am not sure exactly, but I think it is safe, it is a big company'], ['The app is maybe fifteen minutes a day, I think'], ['Thank you for the question. Screen time is a real worry for all of us']],
  },
  {
    id: 'q05-mahalla-l3',
    task: 'Q&A role-play (rp.qa-mahalla): at a mahalla meeting about a weekend clean-up of the canal bank, elders ask who is responsible for tools, safety for children, and why not ask the khokimiyat.',
    lines: [
      'Rahmat, Karim aka, savolingiz o‘rinli. Asboblarni biz o‘zimiz olib kelamiz: yigirmata qop va o‘nta qo‘lqop yig‘ib qo‘yganmiz.',
      'Bolalar faqat kattalar bilan birga ishlaydi, suv bo‘yiga yaqinlashmaydi.',
      'Hokimiyatga ham murojaat qildik, javob kutyapmiz, lekin kutib o‘tirmasdan o‘zimiz boshlasak bo‘ladi deb o‘ylaymiz.',
    ],
    ref: [3, 3, 3, 3, 3.5],
    why: 'Each question gets a direct answer with one concrete detail (twenty bags, ten pairs of gloves; children only with adults). The khokimiyat answer is honest but could bridge back to the purpose of the clean-up. Respectful address to the elder ("Karim aka, savolingiz o‘rinli").',
    ev: [['Asboblarni biz o‘zimiz olib kelamiz'], ['Bolalar faqat kattalar bilan birga ishlaydi, suv bo‘yiga yaqinlashmaydi'], ['yigirmata qop va o‘nta qo‘lqop yig‘ib qo‘yganmiz'], ['lekin kutib o‘tirmasdan o‘zimiz boshlasak bo‘ladi deb o‘ylaymiz'], ['Rahmat, Karim aka, savolingiz o‘rinli']],
  },
  {
    id: 'q06-manager-l3',
    task: 'Q&A role-play (rp.qa-manager): after a project update, the department head asks why the launch slipped two weeks, what it costs, and whether the new date is safe. Typed answers.',
    lines: [
      'Задержка из-за того, что поставщик прислал оборудование на десять дней позже.',
      'Дополнительных расходов нет, кроме сверхурочных для двух инженеров.',
      'Новая дата реальная, если поставщик больше не подведёт. Я думаю, что не подведёт.',
    ],
    ref: [3, 3.5, 3, 3, 3],
    why: 'Short, direct answers to the first two questions with a concrete reason and cost. The third answer rests on "I think they won’t let us down", which is hope rather than evidence, and there is no plan B. Neutral, correct tone without any acknowledgement of the manager’s concern.',
    ev: [['Задержка из-за того, что поставщик прислал оборудование на десять дней позже'], ['Дополнительных расходов нет, кроме сверхурочных для двух инженеров'], ['Я думаю, что не подведёт'], ['Новая дата реальная, если поставщик больше не подведёт'], ['Дополнительных расходов нет']],
  },
  {
    id: 'q07-conference-l3plus',
    task: 'Q&A role-play (rp.qa-conference): after a talk on teaching vocabulary with games, a teacher in the audience asks whether games waste lesson time and how to use them with forty students.',
    lines: [
      'That’s the question I hear most, so thank you. No — if the game has one clear language goal, it saves time, because students repeat the words far more than in a drill.',
      'With forty students, play in teams of five. Each team has one captain who checks answers, so you only check eight captains, not forty students.',
      'And if a game doesn’t have a clear goal, I agree with you: skip it.',
    ],
    ref: [3.5, 3.5, 3.5, 3.5, 4],
    why: 'Direct answers ("No —", "play in teams of five") with a reason and a practical method; agreeing with the fair part of the concern is a good bridge. The time-saving claim is asserted rather than shown with an example or figure. Warm and respectful.',
    ev: [['No — if the game has one clear language goal, it saves time'], ['With forty students, play in teams of five'], ['so you only check eight captains, not forty students'], ['And if a game doesn’t have a clear goal, I agree with you: skip it'], ['That’s the question I hear most, so thank you']],
  },
  {
    id: 'q08-university-panel-l4',
    task: 'Q&A role-play (rp.qa-university): after a research presentation, the university panel asks about the small sample, a different explanation, and next steps.',
    lines: [
      'Yes, sixty students is a small sample, and I say that in my limits slide. That is why I call it a pilot, not proof.',
      'Another explanation is possible: the students who joined may already have been more motivated. To check that, next term we will compare groups with the same starting scores.',
      'The next step is two more schools in Samarkand. One has already agreed.',
    ],
    ref: [4, 4, 4, 4, 4],
    why: 'Concedes the limitation calmly and reframes it (a pilot, not proof), takes the alternative explanation seriously and names how to test it, and gives a concrete next step. Every answer is short. To reach 5, thank the panel and check whether the answer met their concern.',
    ev: [['Yes, sixty students is a small sample'], ['That is why I call it a pilot, not proof'], ['next term we will compare groups with the same starting scores', 'One has already agreed'], ['Another explanation is possible: the students who joined may already have been more motivated'], ['and I say that in my limits slide']],
  },
  {
    id: 'q09-hostile-customer-l4',
    task: 'Q&A role-play (rp.qa-customer): at a product demo of a home water filter, an angry customer says his last filter broke in a month and accuses the company of lying.',
    lines: [
      'Понимаю ваше раздражение — когда фильтр ломается через месяц, это неприятно, и вы имеете право на ответ.',
      'Я не знаю, какой у вас был фильтр, но у нашего на корпус гарантия два года, и замена по гарантии занимает три дня.',
      'Давайте после демонстрации я запишу ваш номер и сам посмотрю, что случилось с вашим прошлым фильтром.',
    ],
    ref: [4, 4, 3.5, 4.5, 4],
    why: 'Stays calm, acknowledges the anger without accepting the accusation, answers with specific terms (two-year warranty, three-day replacement) and offers a personal follow-up: composure is excellent. Not knowing about the old filter is said honestly. The warranty terms are stated without saying where they are written down, so evidence is 3.5.',
    ev: [['у нашего на корпус гарантия два года'], ['Давайте после демонстрации я запишу ваш номер'], ['замена по гарантии занимает три дня'], ['Понимаю ваше раздражение', 'Я не знаю, какой у вас был фильтр'], ['и вы имеете право на ответ']],
  },
  {
    id: 'q10-debate-l4plus',
    task: 'Q&A role-play (rp.qa-debate): in a student union debate on banning phones in class, an opponent says the ban treats students like children and asks what happens in emergencies.',
    lines: [
      'You’re right that we’re not children, and that is exactly why I trust us to agree to a rule for forty-five minutes.',
      'In an emergency, parents call the school office, as they did before phones. And the phones stay in the classroom, in a box by the door, not locked away.',
      'So the question isn’t whether we’re adults. It’s whether we want our attention back. I think we do.',
    ],
    ref: [4.5, 4.5, 4.5, 4.5, 4.5],
    why: 'Takes the opponent’s point and turns it into support, answers the emergency question practically, and bridges back to the core message with a crisp reframe. Short and controlled. To be a 5, the "attention" claim could rest on one example from their own school.',
    ev: [['In an emergency, parents call the school office'], ['the phones stay in the classroom, in a box by the door, not locked away'], ['as they did before phones'], ['You’re right that we’re not children', 'It’s whether we want our attention back'], ['You’re right that we’re not children']],
  },
  {
    id: 'q11-investor-l5',
    task: 'Q&A role-play (rp.qa-investor): the sceptical investor asks about competition from a big marketplace, the real cost of getting a customer, and why this team.',
    lines: [
      'Если маркетплейс зайдёт в нашу нишу, это будет значить, что рынок настоящий. Но им не выгодно возить по сорок килограммов овощей в одно кафе в шесть утра — это нам выгодно, и это наше преимущество.',
      'Привлечение клиента сейчас стоит нам около ста пятидесяти тысяч сумов: это одна поездка и одна дегустация. Через три месяца я покажу вам эту цифру на ста клиентах, а не на двенадцати.',
      'Почему мы? Потому что двое из нас выросли в семьях, которые торгуют на этом базаре. Нам открывают двери, которые закрыты для всех остальных.',
    ],
    ref: [5, 5, 4.5, 5, 5],
    why: 'Each answer starts with the point, reframes the threat into an advantage, gives an honest figure with its basis and the limit of the evidence (twelve customers so far), and ends with a memorable reason for the team. The customer-cost figure is stated on a small base, which the speaker admits, so evidence is 4.5. Confident, respectful Russian.',
    ev: [['Если маркетплейс зайдёт в нашу нишу, это будет значить, что рынок настоящий'], ['Почему мы? Потому что двое из нас выросли в семьях, которые торгуют на этом базаре'], ['Привлечение клиента сейчас стоит нам около ста пятидесяти тысяч сумов', 'на ста клиентах, а не на двенадцати'], ['это нам выгодно, и это наше преимущество'], ['Через три месяца я покажу вам эту цифру']],
  },
  {
    id: 'q12-director-l5',
    task: 'Q&A role-play (rp.qa-director): the school director (a woman in this sample, addressed as "opa") asks who pays for the robotics club, who supervises it, and whether it will hurt exam results.',
    lines: [
      'Maktab byudjetidan bir so‘m ham so‘ramaymiz: to‘plamlarni ota-onalar qo‘mitasi va bitta mahalliy korxona homiyligida olamiz, shartnoma loyihasi mana shu papkada.',
      'Har darsda fizika o‘qituvchimiz Anvar aka bo‘ladi, u rozi, jadvalini ham ko‘rib chiqdik.',
      'Imtihonlar haqida xavotiringiz to‘g‘ri, opa. Shuning uchun to‘garak faqat shanba kuni, darsdan keyin. Va biz har chorakda qatnashchilarning matematika baholarini sizga ko‘rsatamiz — agar pasaysa, to‘xtatamiz.',
    ],
    ref: [5, 4.5, 5, 5, 5],
    why: 'Every concern is answered first and specifically (no school money, the sponsor, the draft agreement in hand, the named supervisor), the exam worry is acknowledged as fair and met with a measurable safeguard and a stop rule. Very respectful register for the director. The last answer is a little long, so brevity is 4.5.',
    ev: [['Maktab byudjetidan bir so‘m ham so‘ramaymiz'], ['Har darsda fizika o‘qituvchimiz Anvar aka bo‘ladi'], ['shartnoma loyihasi mana shu papkada', 'agar pasaysa, to‘xtatamiz'], ['Imtihonlar haqida xavotiringiz to‘g‘ri, opa'], ['xavotiringiz to‘g‘ri, opa']],
  },
]);
