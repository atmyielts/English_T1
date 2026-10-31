import type { LearningEventKind } from '../../types.ts';
import type { L } from './text.ts';

// E1 Journeys: multi-month programmes with weekly chapters and a graduation,
// authored here and built over the coach packs (B1 IELTS, B2 Speaking Partner,
// B4 Sales, B6 Public Speaking), the learner tools and Schood practice.
//
// A task counts only verified learning events (a scored turn, a passed check, a
// finished drill or mock) that match its feature, kinds and skill prefix, or a
// then-vs-now sample. Skill ids follow `<domain>.<skill>[.<node>]`, the convention
// documented for the coach packs in docs/product/ai-requests/engage.md. Tasks
// without `match` are recommendations (Schood practice apps) and never block a
// chapter.

export interface TaskMatch {
  features: string[];
  kinds?: LearningEventKind[];
  /** Prefix of the event's skill, for example `ielts.speaking`. */
  skill?: string;
  /** A story arc: events whose ref starts with `story:<arc>:`. */
  arc?: string;
  /** A then-vs-now sample of this kind recorded in the window. */
  sample?: 'voice' | 'writing';
}
export interface JourneyTask {
  id: string;
  title: L;
  match?: TaskMatch;
  count: number;
  /** In-app path (`/coach/b1`, `/stories/...`) or an https link to a Schood practice app. */
  link: string;
}
export interface Chapter { week: number; title: L; focus: L; tasks: JourneyTask[] }
export interface Journey {
  key: string;
  title: L;
  lead: L;
  weeks: number;
  /** The lifetime-path goal this journey completes. */
  goalKey: string;
  coach: string;
  level: string;
  chapters: Chapter[];
  graduation: { title: L; lead: L; certificate: string | null };
}

const scored: LearningEventKind[] = ['turn_scored'];
const practice: LearningEventKind[] = ['check_passed', 'drill_finished'];
const mock: LearningEventKind[] = ['mock_finished'];
const any: LearningEventKind[] = ['turn_scored', 'check_passed', 'drill_finished', 'mock_finished'];

const IELTS_PRACTICE = 'https://practice.ielts.schood.online';
const IELTS_SIMULATOR = 'https://ielts.schood.online';

export const JOURNEYS: Journey[] = [
  {
    key: 'ielts_55_70',
    title: { en: 'Towards IELTS 7.0: a 16-week programme', uz: 'IELTS 7.0 sari: 16 haftalik dastur', ru: 'К IELTS 7.0: программа на 16 недель' },
    lead: {
      en: 'For learners at about band 5.5 aiming for 7.0: sixteen weekly chapters with the IELTS Coach, every skill, three mocks on the way and a final mock in week 16.',
      uz: 'Hozir taxminan 5.5 ball olib, 7.0 ballni maqsad qilganlar uchun: IELTS murabbiyi bilan har hafta bir bob, jami o‘n olti bob; barcha ko‘nikmalar, yo‘l davomida uchta sinov imtihoni va 16-haftada yakuniy sinov.',
      ru: 'Для тех, у кого сейчас около 5.5 и цель — 7.0: шестнадцать недельных глав с IELTS-коучем, все навыки, три пробных экзамена по пути и финальный на 16-й неделе.',
    },
    weeks: 16, goalKey: 'ielts', coach: 'B1', level: 'B1',
    chapters: [
      { week: 1, title: { en: 'Where you start', uz: 'Qayerdan boshlaysiz', ru: 'С чего вы начинаете' }, focus: { en: 'A diagnostic and your day-1 voice, so you have something to compare with later.', uz: 'Diagnostika va birinchi kundagi ovozingiz: keyin solishtirish uchun.', ru: 'Диагностика и ваш голос в первый день, чтобы потом было с чем сравнить.' }, tasks: [
        { id: 'diagnostic', title: { en: 'Take the IELTS Coach diagnostic', uz: 'IELTS murabbiyi diagnostikasidan o‘ting', ru: 'Пройдите диагностику у IELTS-коуча' }, match: { features: ['B1'], kinds: ['drill_finished', 'mock_finished'] }, count: 1, link: '/coach/b1' },
        { id: 'voice', title: { en: 'Record your day-1 speaking sample', uz: 'Birinchi kundagi nutq namunangizni yozib oling', ru: 'Запишите образец речи первого дня' }, match: { features: [], sample: 'voice' }, count: 1, link: '/then-vs-now' },
        { id: 'p1', title: { en: 'Two Speaking Part 1 answers, scored', uz: 'Speaking Part 1 bo‘yicha ikkita baholangan javob', ru: 'Два оценённых ответа Speaking Part 1' }, match: { features: ['B1'], kinds: scored, skill: 'ielts.speaking' }, count: 2, link: '/coach/b1' },
      ] },
      { week: 2, title: { en: 'Listening, Parts 1 and 2', uz: 'Listening: 1- va 2-qismlar', ru: 'Listening: части 1 и 2' }, focus: { en: 'Forms, numbers and spelling: the marks people lose for no reason.', uz: 'Anketalar, raqamlar va imlo: bekorga yo‘qotiladigan ballar.', ru: 'Анкеты, числа и орфография: баллы, которые теряют зря.' }, tasks: [
        { id: 'listen', title: { en: 'Three timed listening sets', uz: 'Vaqt cheklangan uchta listening to‘plami', ru: 'Три listening-сета на время' }, match: { features: ['B1'], kinds: practice, skill: 'ielts.listening' }, count: 3, link: '/coach/b1' },
        { id: 'story', title: { en: 'Two Tashkent Lights episodes (listening)', uz: 'Tashkent Lights’dan ikkita qism (tinglash)', ru: 'Два эпизода Tashkent Lights (аудирование)' }, match: { features: ['E8'], kinds: ['check_passed'], arc: 'tashkent_lights' }, count: 2, link: '/stories/tashkent_lights' },
        { id: 'practice', title: { en: 'A Listening test in Schood IELTS Practice', uz: 'Schood IELTS Practice’da Listening testi', ru: 'Тест Listening в Schood IELTS Practice' }, count: 1, link: IELTS_PRACTICE },
      ] },
      { week: 3, title: { en: 'Reading: True, False, Not Given', uz: 'Reading: True, False, Not Given', ru: 'Reading: True, False, Not Given' }, focus: { en: 'What the text says, what it does not say, and the difference.', uz: 'Matn nima deydi, nima demaydi va ularning farqi.', ru: 'Что сказано в тексте, чего в нём нет, и в чём разница.' }, tasks: [
        { id: 'tfng', title: { en: 'Three reading sets with checked keys', uz: 'Javoblari tekshirilgan uchta reading to‘plami', ru: 'Три reading-сета с проверенными ключами' }, match: { features: ['B1'], kinds: practice, skill: 'ielts.reading' }, count: 3, link: '/coach/b1' },
        { id: 'vocab', title: { en: 'One topic vocabulary quiz', uz: 'Bitta mavzuli lug‘at testi', ru: 'Один тематический словарный тест' }, match: { features: ['B1'], kinds: practice, skill: 'ielts.vocabulary' }, count: 1, link: '/coach/b1' },
      ] },
      { week: 4, title: { en: 'Mock 1', uz: '1-sinov imtihoni', ru: 'Пробный экзамен 1' }, focus: { en: 'Your first full mock: an estimated band to improve on.', uz: 'Birinchi to‘liq sinov: keyin oshirib boradigan taxminiy ballingiz.', ru: 'Первый полный пробный экзамен: примерный балл, который вы будете улучшать.' }, tasks: [
        { id: 'mock', title: { en: 'A weekly mock with the IELTS Coach', uz: 'IELTS murabbiyi bilan haftalik sinov', ru: 'Еженедельный пробный экзамен с IELTS-коучем' }, match: { features: ['B1'], kinds: mock }, count: 1, link: '/coach/b1' },
        { id: 'p1', title: { en: 'Three Part 1 answers, re-recorded after feedback', uz: 'Fikr-mulohazadan keyin qayta yozib olingan uchta Part 1 javobi', ru: 'Три ответа Part 1, перезаписанные после обратной связи' }, match: { features: ['B1'], kinds: scored, skill: 'ielts.speaking' }, count: 3, link: '/coach/b1' },
        { id: 'sim', title: { en: 'Or a full test in the Schood IELTS simulator', uz: 'Yoki Schood IELTS simulyatorida to‘liq test', ru: 'Или полный тест в симуляторе Schood IELTS' }, count: 1, link: IELTS_SIMULATOR },
      ] },
      { week: 5, title: { en: 'Writing Task 1', uz: 'Writing Task 1', ru: 'Writing Task 1' }, focus: { en: 'An overview sentence and the right comparisons.', uz: 'Umumiy tavsif (overview) jumlasi va to‘g‘ri taqqoslashlar.', ru: 'Обзорное предложение и правильные сравнения.' }, tasks: [
        { id: 'task1', title: { en: 'Two Task 1 reports with a band per criterion', uz: 'Har bir mezon bo‘yicha balli ikkita Task 1 hisoboti', ru: 'Два отчёта Task 1 с баллом по каждому критерию' }, match: { features: ['B1', 'L3'], kinds: ['turn_scored', 'drill_finished'], skill: 'ielts.writing' }, count: 2, link: '/coach/b1' },
        { id: 'writing', title: { en: 'Save your first piece of writing as a then-vs-now sample', uz: 'Birinchi yozma ishingizni «oldin va hozir» namunasi sifatida saqlang', ru: 'Сохраните первую письменную работу как образец «тогда и сейчас»' }, match: { features: [], sample: 'writing' }, count: 1, link: '/then-vs-now' },
      ] },
      { week: 6, title: { en: 'Writing Task 2: structure', uz: 'Writing Task 2: tuzilma', ru: 'Writing Task 2: структура' }, focus: { en: 'A clear position, two developed ideas, a real conclusion.', uz: 'Aniq pozitsiya, ikkita to‘liq ochilgan g‘oya va to‘laqonli xulosa.', ru: 'Чёткая позиция, две развёрнутые идеи и полноценный вывод.' }, tasks: [
        { id: 'task2', title: { en: 'Two Task 2 essays, scored', uz: 'Ikkita baholangan Task 2 inshosi', ru: 'Два оценённых эссе Task 2' }, match: { features: ['B1', 'L3'], kinds: ['turn_scored', 'drill_finished'], skill: 'ielts.writing' }, count: 2, link: '/coach/b1' },
        { id: 'errors', title: { en: 'Drills on your recurring errors', uz: 'Takrorlanadigan xatolaringiz bo‘yicha mashqlar', ru: 'Упражнения на ваши повторяющиеся ошибки' }, match: { features: ['B1'], kinds: practice, skill: 'ielts.grammar' }, count: 2, link: '/coach/b1' },
      ] },
      { week: 7, title: { en: 'Speaking Part 2: the cue card', uz: 'Speaking Part 2: mavzu kartochkasi', ru: 'Speaking Part 2: карточка с темой' }, focus: { en: 'One minute to plan, two minutes to talk, without running dry.', uz: 'Rejalash uchun bir daqiqa, gapirish uchun ikki daqiqa, to‘xtab qolmasdan.', ru: 'Минута на план, две минуты на речь, не замолкая.' }, tasks: [
        { id: 'p2', title: { en: 'Four timed cue-card talks, scored', uz: 'Mavzu kartochkasi bo‘yicha to‘rtta baholangan nutq, vaqt cheklangan', ru: 'Четыре оценённых монолога по карточке на время' }, match: { features: ['B1'], kinds: scored, skill: 'ielts.speaking' }, count: 4, link: '/coach/b1' },
      ] },
      { week: 8, title: { en: 'Mock 2 and topic words', uz: '2-sinov imtihoni va mavzu so‘zlari', ru: 'Пробный экзамен 2 и тематическая лексика' }, focus: { en: 'Halfway: compare with mock 1.', uz: 'Yarim yo‘l: 1-sinov bilan solishtiring.', ru: 'Половина пути: сравните с первым пробным экзаменом.' }, tasks: [
        { id: 'mock', title: { en: 'Weekly mock', uz: 'Haftalik sinov', ru: 'Еженедельный пробный экзамен' }, match: { features: ['B1'], kinds: mock }, count: 1, link: '/coach/b1' },
        { id: 'vocab', title: { en: 'Three topic vocabulary quizzes', uz: 'Uchta mavzuli lug‘at testi', ru: 'Три тематических словарных теста' }, match: { features: ['B1'], kinds: practice, skill: 'ielts.vocabulary' }, count: 3, link: '/coach/b1' },
      ] },
      { week: 9, title: { en: 'Listening, Parts 3 and 4', uz: 'Listening: 3- va 4-qismlar', ru: 'Listening: части 3 и 4' }, focus: { en: 'Discussions and lectures: follow the argument, not every word.', uz: 'Muhokama va ma’ruzalar: har bir so‘zni emas, fikrni kuzating.', ru: 'Дискуссии и лекции: следите за мыслью, а не за каждым словом.' }, tasks: [
        { id: 'listen', title: { en: 'Three timed listening sets', uz: 'Vaqt cheklangan uchta listening to‘plami', ru: 'Три listening-сета на время' }, match: { features: ['B1'], kinds: practice, skill: 'ielts.listening' }, count: 3, link: '/coach/b1' },
        { id: 'story', title: { en: 'Two Tashkent Lights episodes at B1 or above', uz: 'Tashkent Lights’dan B1 va undan yuqori darajadagi ikkita qism', ru: 'Два эпизода Tashkent Lights уровня B1 и выше' }, match: { features: ['E8'], kinds: ['check_passed'], arc: 'tashkent_lights' }, count: 2, link: '/stories/tashkent_lights' },
      ] },
      { week: 10, title: { en: 'Reading: matching and completion', uz: 'Reading: moslashtirish va to‘ldirish', ru: 'Reading: сопоставление и заполнение' }, focus: { en: 'Headings, features and summaries under time.', uz: 'Sarlavhalar va xususiyatlarni moslashtirish, qisqacha mazmunni to‘ldirish, vaqt cheklangan holda.', ru: 'Заголовки, сопоставление признаков и заполнение краткого содержания на время.' }, tasks: [
        { id: 'reading', title: { en: 'Three reading sets', uz: 'Uchta reading to‘plami', ru: 'Три reading-сета' }, match: { features: ['B1'], kinds: practice, skill: 'ielts.reading' }, count: 3, link: '/coach/b1' },
        { id: 'practice', title: { en: 'A Reading test in Schood IELTS Practice', uz: 'Schood IELTS Practice’da Reading testi', ru: 'Тест Reading в Schood IELTS Practice' }, count: 1, link: IELTS_PRACTICE },
      ] },
      { week: 11, title: { en: 'Speaking Part 3: discussion', uz: 'Speaking Part 3: muhokama', ru: 'Speaking Part 3: обсуждение' }, focus: { en: 'Opinions with reasons and examples, at length.', uz: 'Sabab va misollar bilan keng ochilgan fikrlar.', ru: 'Развёрнутые мнения с причинами и примерами.' }, tasks: [
        { id: 'p3', title: { en: 'Four Part 3 answers, scored', uz: 'To‘rtta baholangan Part 3 javobi', ru: 'Четыре оценённых ответа Part 3' }, match: { features: ['B1'], kinds: scored, skill: 'ielts.speaking' }, count: 4, link: '/coach/b1' },
      ] },
      { week: 12, title: { en: 'Mock 3', uz: '3-sinov imtihoni', ru: 'Пробный экзамен 3' }, focus: { en: 'Your estimated band, checked again.', uz: 'Taxminiy ballingiz yana tekshiriladi.', ru: 'Ваш примерный балл, проверенный ещё раз.' }, tasks: [
        { id: 'mock', title: { en: 'Weekly mock', uz: 'Haftalik sinov', ru: 'Еженедельный пробный экзамен' }, match: { features: ['B1'], kinds: mock }, count: 1, link: '/coach/b1' },
        { id: 'ladder', title: { en: 'One essay ladder (bands 6, 7 and 8 side by side)', uz: 'Bitta insho zinapoyasi (6, 7, 8 ball yonma-yon)', ru: 'Одна «лестница» эссе (баллы 6, 7 и 8 рядом)' }, match: { features: ['L11', 'B1'], kinds: ['turn_scored', 'drill_finished'], skill: 'ielts.writing' }, count: 1, link: '/write' },
      ] },
      { week: 13, title: { en: 'Writing under time', uz: 'Vaqt cheklangan holda yozish', ru: 'Письмо на время' }, focus: { en: 'Forty minutes, one essay, no panic.', uz: 'Qirq daqiqa, bitta insho, vahimasiz.', ru: 'Сорок минут, одно эссе, без паники.' }, tasks: [
        { id: 'task2', title: { en: 'Two timed Task 2 essays', uz: 'Vaqt cheklangan ikkita Task 2 inshosi', ru: 'Два эссе Task 2 на время' }, match: { features: ['B1', 'L3'], kinds: ['turn_scored', 'drill_finished'], skill: 'ielts.writing' }, count: 2, link: '/coach/b1' },
      ] },
      { week: 14, title: { en: 'Your weak spots', uz: 'Zaif joylaringiz', ru: 'Ваши слабые места' }, focus: { en: 'Six checks wherever the coach saw you lose marks.', uz: 'Murabbiy ball yo‘qotayotganingizni ko‘rgan joylar bo‘yicha oltita tekshiruv.', ru: 'Шесть проверок там, где коуч заметил, что вы теряете баллы.' }, tasks: [
        { id: 'mixed', title: { en: 'Six passed checks or scored answers', uz: 'Oltita muvaffaqiyatli tekshiruv yoki baholangan javob', ru: 'Шесть пройденных проверок или оценённых ответов' }, match: { features: ['B1'], kinds: any }, count: 6, link: '/coach/b1' },
      ] },
      { week: 15, title: { en: 'Full speaking mocks', uz: 'To‘liq speaking sinovlari', ru: 'Полные пробные экзамены по Speaking' }, focus: { en: 'Parts 1 to 3 in one sitting, twice.', uz: '1–3-qismlar bir o‘tirishda, ikki marta.', ru: 'Части 1–3 за один раз, дважды.' }, tasks: [
        { id: 'speaking_mock', title: { en: 'Two full speaking mocks', uz: 'Ikkita to‘liq speaking sinovi', ru: 'Два полных пробных экзамена по Speaking' }, match: { features: ['B1'], kinds: mock, skill: 'ielts.speaking' }, count: 2, link: '/coach/b1' },
      ] },
      { week: 16, title: { en: 'Final mock and then vs now', uz: 'Yakuniy sinov va «oldin va hozir»', ru: 'Финальный пробный экзамен и «тогда и сейчас»' }, focus: { en: 'The final mock, and your voice today next to day 1.', uz: 'Yakuniy sinov va bugungi ovozingiz birinchi kundagisi bilan yonma-yon.', ru: 'Финальный пробный экзамен и ваш сегодняшний голос рядом с голосом первого дня.' }, tasks: [
        { id: 'final', title: { en: 'Final mock', uz: 'Yakuniy sinov', ru: 'Финальный пробный экзамен' }, match: { features: ['B1'], kinds: mock }, count: 1, link: '/coach/b1' },
        { id: 'voice', title: { en: 'Record today’s speaking sample', uz: 'Bugungi nutq namunangizni yozib oling', ru: 'Запишите сегодняшний образец речи' }, match: { features: [], sample: 'voice' }, count: 1, link: '/then-vs-now' },
      ] },
    ],
    graduation: {
      title: { en: 'IELTS journey complete', uz: 'IELTS dasturi yakunlandi', ru: 'Программа IELTS пройдена' },
      lead: { en: 'Sixteen chapters of verified practice. Book the official exam, add its date to "What the coach remembers", then aim for the next goal.', uz: 'O‘n olti bob davomida tasdiqlangan mashqlar. Rasmiy imtihonga yoziling, uning sanasini «Murabbiy nimani eslab qoladi» bo‘limiga kiriting va keyingi maqsadga o‘ting.', ru: 'Шестнадцать глав подтверждённой практики. Запишитесь на официальный экзамен, добавьте его дату в раздел «Что помнит коуч» и переходите к следующей цели.' },
      certificate: 'speaking_b2',
    },
  },
  {
    key: 'sales_90',
    title: { en: 'Sales: your first 90 days', uz: 'Savdo: dastlabki 90 kuningiz', ru: 'Продажи: ваши первые 90 дней' },
    lead: {
      en: 'Thirteen weekly chapters with the Sales Coach, from your own script to negotiation, with voice role-plays and scorecards.',
      uz: 'Savdo murabbiyi bilan har hafta bir bob, jami o‘n uch bob: o‘z skriptingizdan muzokaragacha, ovozli rolli o‘yinlar va natija kartalari bilan.',
      ru: 'Тринадцать недельных глав с коучем по продажам: от вашего скрипта до переговоров, с голосовыми ролевыми играми и картами результата.',
    },
    weeks: 13, goalKey: 'sales', coach: 'B4', level: 'B1',
    chapters: [
      { week: 1, title: { en: 'Your product, your script', uz: 'Mahsulotingiz, skriptingiz', ru: 'Ваш продукт, ваш скрипт' }, focus: { en: 'Build the script for what you sell and record your first pitch.', uz: 'Sotayotgan narsangiz uchun skript tuzing va birinchi taqdimotingizni yozib oling.', ru: 'Соберите скрипт для того, что продаёте, и запишите первую презентацию.' }, tasks: [
        { id: 'script', title: { en: 'Build your script with the Sales Coach', uz: 'Savdo murabbiyi bilan skript tuzing', ru: 'Соберите скрипт с коучем по продажам' }, match: { features: ['B4'], kinds: ['drill_finished', 'turn_scored'], skill: 'sales.script' }, count: 1, link: '/coach/b4' },
        { id: 'voice', title: { en: 'Record your day-1 pitch', uz: 'Birinchi kundagi taqdimotingizni yozib oling', ru: 'Запишите презентацию первого дня' }, match: { features: [], sample: 'voice' }, count: 1, link: '/then-vs-now' },
        { id: 'story', title: { en: 'Day 1 of “First Month on the Floor”', uz: '«First Month on the Floor» hikoyasining 1-kuni', ru: 'День 1 истории «First Month on the Floor»' }, match: { features: ['E8'], kinds: ['check_passed'], arc: 'first_month_sales' }, count: 1, link: '/stories/first_month_sales' },
      ] },
      { week: 2, title: { en: 'Prospecting', uz: 'Mijoz qidirish', ru: 'Поиск клиентов' }, focus: { en: 'Who to call, and why they would care.', uz: 'Kimga qo‘ng‘iroq qilish kerak va bu ularga nega qiziq bo‘ladi.', ru: 'Кому звонить и почему им это важно.' }, tasks: [
        { id: 'prospect', title: { en: 'Three prospecting drills', uz: 'Uchta mijoz qidirish mashqi', ru: 'Три упражнения на поиск клиентов' }, match: { features: ['B4'], kinds: any, skill: 'sales.prospecting' }, count: 3, link: '/coach/b4' },
      ] },
      { week: 3, title: { en: 'Cold-call openings', uz: 'Sovuq qo‘ng‘iroqni boshlash', ru: 'Начало холодного звонка' }, focus: { en: 'The first fifteen seconds and getting past the gatekeeper.', uz: 'Birinchi o‘n besh soniya va kotibdan o‘tish.', ru: 'Первые пятнадцать секунд и как пройти секретаря.' }, tasks: [
        { id: 'cold', title: { en: 'Four voice role-plays, scored', uz: 'To‘rtta baholangan ovozli rolli o‘yin', ru: 'Четыре оценённые голосовые ролевые игры' }, match: { features: ['B4'], kinds: scored, skill: 'sales.cold_call' }, count: 4, link: '/coach/b4' },
      ] },
      { week: 4, title: { en: 'Discovery questions', uz: 'Ehtiyojni aniqlovchi savollar', ru: 'Вопросы для выявления потребностей' }, focus: { en: 'Ask more, talk less: find the pain before the pitch.', uz: 'Ko‘proq so‘rang, kamroq gapiring: taqdimotdan oldin muammoni toping.', ru: 'Спрашивайте больше, говорите меньше: найдите боль до презентации.' }, tasks: [
        { id: 'discovery', title: { en: 'Four discovery role-plays', uz: 'Ehtiyojni aniqlash bo‘yicha to‘rtta rolli o‘yin', ru: 'Четыре ролевые игры на выявление потребностей' }, match: { features: ['B4'], kinds: scored, skill: 'sales.discovery' }, count: 4, link: '/coach/b4' },
        { id: 'story', title: { en: 'Days 2–4 of the sales story', uz: 'Savdo hikoyasining 2–4-kunlari', ru: 'Дни 2–4 истории о продажах' }, match: { features: ['E8'], kinds: ['check_passed'], arc: 'first_month_sales' }, count: 3, link: '/stories/first_month_sales' },
      ] },
      { week: 5, title: { en: 'The value pitch', uz: 'Foydani ko‘rsatadigan taqdimot', ru: 'Презентация ценности' }, focus: { en: 'Their problem, your answer, in their words.', uz: 'Ularning muammosi, sizning javobingiz, ularning so‘zlari bilan.', ru: 'Их проблема, ваш ответ, их словами.' }, tasks: [
        { id: 'pitch', title: { en: 'Three pitches, scored', uz: 'Uchta baholangan taqdimot', ru: 'Три оценённые презентации' }, match: { features: ['B4'], kinds: scored, skill: 'sales.pitch' }, count: 3, link: '/coach/b4' },
      ] },
      { week: 6, title: { en: 'Objection: the price', uz: 'E’tiroz: narx', ru: 'Возражение: цена' }, focus: { en: 'Never defend the price: show what it buys.', uz: 'Narxni himoya qilmang: u nimani berishini ko‘rsating.', ru: 'Не защищайте цену: покажите, что за неё получают.' }, tasks: [
        { id: 'price', title: { en: 'Four price objections handled', uz: 'Narx bo‘yicha to‘rtta e’tirozga javob', ru: 'Четыре отработанных возражения о цене' }, match: { features: ['B4'], kinds: any, skill: 'sales.objection' }, count: 4, link: '/coach/b4' },
      ] },
      { week: 7, title: { en: '“I’ll think about it” and the competitor', uz: '«O‘ylab ko‘raman» va raqobatchi', ru: '«Я подумаю» и конкурент' }, focus: { en: 'Find what is really behind the delay.', uz: 'Kechikish ortida aslida nima borligini toping.', ru: 'Найдите, что на самом деле стоит за отсрочкой.' }, tasks: [
        { id: 'think', title: { en: 'Four objection drills', uz: 'To‘rtta e’tiroz mashqi', ru: 'Четыре упражнения на возражения' }, match: { features: ['B4'], kinds: any, skill: 'sales.objection' }, count: 4, link: '/coach/b4' },
        { id: 'story', title: { en: 'Days 5–7 of the sales story', uz: 'Savdo hikoyasining 5–7-kunlari', ru: 'Дни 5–7 истории о продажах' }, match: { features: ['E8'], kinds: ['check_passed'], arc: 'first_month_sales' }, count: 3, link: '/stories/first_month_sales' },
      ] },
      { week: 8, title: { en: 'No budget, “send me info”', uz: 'Byudjet yo‘q, «ma’lumot yuboring»', ru: 'Нет бюджета, «пришлите информацию»' }, focus: { en: 'Keep the conversation alive and secure a next step.', uz: 'Suhbatni davom ettiring va keyingi qadamni belgilang.', ru: 'Сохраните разговор и договоритесь о следующем шаге.' }, tasks: [
        { id: 'budget', title: { en: 'Four objection role-plays', uz: 'To‘rtta e’tiroz rolli o‘yini', ru: 'Четыре ролевые игры с возражениями' }, match: { features: ['B4'], kinds: scored, skill: 'sales.objection' }, count: 4, link: '/coach/b4' },
      ] },
      { week: 9, title: { en: 'Closing', uz: 'Bitim tuzish', ru: 'Закрытие сделки' }, focus: { en: 'Ask for the decision, clearly and calmly.', uz: 'Qarorni aniq va xotirjam so‘rang.', ru: 'Попросите о решении чётко и спокойно.' }, tasks: [
        { id: 'close', title: { en: 'Four closing role-plays', uz: 'Bitim tuzish bo‘yicha to‘rtta rolli o‘yin', ru: 'Четыре ролевые игры на закрытие' }, match: { features: ['B4'], kinds: scored, skill: 'sales.closing' }, count: 4, link: '/coach/b4' },
      ] },
      { week: 10, title: { en: 'Follow-up and DM selling', uz: 'Keyingi aloqa (follow-up) va shaxsiy xabarlarda sotish', ru: 'Повторный контакт и продажи в личке' }, focus: { en: 'Telegram and Instagram messages that get answers.', uz: 'Javob keladigan Telegram va Instagram xabarlari.', ru: 'Сообщения в Telegram и Instagram, на которые отвечают.' }, tasks: [
        { id: 'follow', title: { en: 'Two follow-up drills', uz: 'Keyingi aloqa bo‘yicha ikkita mashq', ru: 'Два упражнения на повторный контакт' }, match: { features: ['B4'], kinds: any, skill: 'sales.follow' }, count: 2, link: '/coach/b4' },
        { id: 'dm', title: { en: 'Two DM conversations, scored', uz: 'Shaxsiy xabarlarda ikkita baholangan yozishma', ru: 'Две оценённые переписки в личке' }, match: { features: ['B4'], kinds: any, skill: 'sales.dm' }, count: 2, link: '/coach/b4' },
      ] },
      { week: 11, title: { en: 'Negotiation', uz: 'Muzokara', ru: 'Переговоры' }, focus: { en: 'Trade, never give: every discount buys something.', uz: 'Faqat evaziga yon bering: har bir chegirma uchun nimadir oling.', ru: 'Уступайте только в обмен: за каждую скидку вы что-то получаете.' }, tasks: [
        { id: 'negotiate', title: { en: 'Three negotiation role-plays', uz: 'Uchta muzokara rolli o‘yini', ru: 'Три ролевые игры на переговоры' }, match: { features: ['B4'], kinds: scored, skill: 'sales.negotiation' }, count: 3, link: '/coach/b4' },
      ] },
      { week: 12, title: { en: 'Full calls with a scorecard', uz: 'Natija kartasi bilan to‘liq qo‘ng‘iroqlar', ru: 'Полные звонки с картой результата' }, focus: { en: 'Talk ratio, questions, objections, next step: all at once.', uz: 'Gapirish ulushi, savollar, e’tirozlar, keyingi qadam: hammasi birga.', ru: 'Доля речи, вопросы, возражения, следующий шаг: всё сразу.' }, tasks: [
        { id: 'calls', title: { en: 'Three full role-play calls with a scorecard', uz: 'Natija kartasi bilan uchta to‘liq qo‘ng‘iroq', ru: 'Три полных звонка с картой результата' }, match: { features: ['B4'], kinds: ['mock_finished', 'turn_scored'] }, count: 3, link: '/coach/b4' },
      ] },
      { week: 13, title: { en: 'Graduation call', uz: 'Bitiruv qo‘ng‘irog‘i', ru: 'Выпускной звонок' }, focus: { en: 'One last full call, and your pitch next to day 1.', uz: 'Oxirgi to‘liq qo‘ng‘iroq va taqdimotingiz birinchi kundagisi bilan yonma-yon.', ru: 'Последний полный звонок и ваша презентация рядом с первым днём.' }, tasks: [
        { id: 'final', title: { en: 'A full call with a scorecard', uz: 'Natija kartasi bilan to‘liq qo‘ng‘iroq', ru: 'Полный звонок с картой результата' }, match: { features: ['B4'], kinds: ['mock_finished'] }, count: 1, link: '/coach/b4' },
        { id: 'voice', title: { en: 'Record today’s pitch', uz: 'Bugungi taqdimotingizni yozib oling', ru: 'Запишите сегодняшнюю презентацию' }, match: { features: [], sample: 'voice' }, count: 1, link: '/then-vs-now' },
      ] },
    ],
    graduation: {
      title: { en: 'Your first 90 days, done', uz: 'Dastlabki 90 kuningiz yakunlandi', ru: 'Ваши первые 90 дней пройдены' },
      lead: { en: 'Thirteen chapters of scored calls. The Sales Level 1 certificate exam is the next proof you can show an employer.', uz: 'O‘n uch bob davomida baholangan qo‘ng‘iroqlar. Ish beruvchiga ko‘rsatish mumkin bo‘lgan keyingi dalil — «Savdo, 1-daraja» sertifikat imtihoni.', ru: 'Тринадцать глав оценённых звонков. Экзамен на сертификат «Продажи, уровень 1» — следующее подтверждение, которое можно показать работодателю.' },
      certificate: 'sales_l1',
    },
  },
  {
    key: 'speaking_60',
    title: { en: 'Speaking confidence: a 60-day programme', uz: 'Gapirishga ishonch: 60 kunlik dastur', ru: 'Уверенная речь: программа на 60 дней' },
    lead: {
      en: 'Nine weekly chapters with the Speaking Partner and the Public Speaking Coach: role-plays, shadowing, impromptu talks and your voice on day 1 and day 60.',
      uz: 'Ingliz tili suhbatdoshi va Notiqlik murabbiyi bilan har hafta bir bob, jami to‘qqiz bob: rolli o‘yinlar, shadowing (takrorlash mashqi), tayyorgarliksiz nutqlar va 1- hamda 60-kundagi ovozingiz.',
      ru: 'Девять недельных глав с разговорным партнёром по английскому и коучем публичных выступлений: ролевые игры, шэдоуинг, импровизация и ваш голос в 1-й и 60-й день.',
    },
    weeks: 9, goalKey: 'speaking_confidence', coach: 'B2', level: 'A2',
    chapters: [
      { week: 1, title: { en: 'Day 1', uz: '1-kun', ru: 'День 1' }, focus: { en: 'Record your voice today. In 60 days you will play it next to the new one.', uz: 'Bugun ovozingizni yozib oling. 60 kundan keyin uni yangi yozuv bilan solishtirasiz.', ru: 'Запишите голос сегодня. Через 60 дней вы сравните его с новым.' }, tasks: [
        { id: 'voice', title: { en: 'Record your day-1 voice', uz: 'Birinchi kundagi ovozingizni yozib oling', ru: 'Запишите голос первого дня' }, match: { features: [], sample: 'voice' }, count: 1, link: '/then-vs-now' },
        { id: 'roleplay', title: { en: 'Your first two role-plays with the Speaking Partner', uz: 'Ingliz tili suhbatdoshi bilan dastlabki ikkita rolli o‘yin', ru: 'Две первые ролевые игры с разговорным партнёром' }, match: { features: ['B2'], kinds: scored }, count: 2, link: '/coach/b2' },
      ] },
      { week: 2, title: { en: 'Small talk', uz: 'Yengil suhbat', ru: 'Светская беседа' }, focus: { en: 'Greetings, weather, weekends: easy conversations that open doors.', uz: 'Salomlashish, ob-havo, dam olish kunlari: eshik ochadigan oson suhbatlar.', ru: 'Приветствия, погода, выходные: лёгкие разговоры, открывающие двери.' }, tasks: [
        { id: 'small', title: { en: 'Four small-talk role-plays', uz: 'Yengil suhbat bo‘yicha to‘rtta rolli o‘yin', ru: 'Четыре ролевые игры на светскую беседу' }, match: { features: ['B2'], kinds: scored, skill: 'speaking.roleplay' }, count: 4, link: '/coach/b2' },
        { id: 'story', title: { en: 'Two Tashkent Lights episodes', uz: 'Tashkent Lights’dan ikkita qism', ru: 'Два эпизода Tashkent Lights' }, match: { features: ['E8'], kinds: ['check_passed'], arc: 'tashkent_lights' }, count: 2, link: '/stories/tashkent_lights' },
      ] },
      { week: 3, title: { en: 'Shadowing', uz: 'Shadowing (takrorlash mashqi)', ru: 'Шэдоуинг' }, focus: { en: 'Copy the rhythm of natural English, sentence by sentence.', uz: 'Tabiiy ingliz nutqining ritmini gapma-gap takrorlang.', ru: 'Повторяйте ритм естественной речи, фраза за фразой.' }, tasks: [
        { id: 'shadow', title: { en: 'Five shadowing drills', uz: 'Beshta shadowing mashqi', ru: 'Пять упражнений на шэдоуинг' }, match: { features: ['B2', 'L13'], kinds: any, skill: 'speaking.pronunciation' }, count: 5, link: '/coach/b2' },
      ] },
      { week: 4, title: { en: 'Travel and shops', uz: 'Sayohat va do‘konlar', ru: 'Путешествия и магазины' }, focus: { en: 'Hotels, taxis, returns and complaints.', uz: 'Mehmonxona, taksi, tovarni qaytarish va shikoyatlar.', ru: 'Отели, такси, возвраты и жалобы.' }, tasks: [
        { id: 'travel', title: { en: 'Four travel role-plays', uz: 'To‘rtta sayohat rolli o‘yini', ru: 'Четыре ролевые игры о путешествиях' }, match: { features: ['B2'], kinds: scored, skill: 'speaking.roleplay' }, count: 4, link: '/coach/b2' },
      ] },
      { week: 5, title: { en: 'One minute, no notes', uz: 'Bir daqiqa, qog‘ozsiz', ru: 'Одна минута без бумажки' }, focus: { en: 'Impromptu topics with the Public Speaking Coach.', uz: 'Notiqlik murabbiyi bilan tayyorgarliksiz nutq mavzulari.', ru: 'Импровизация на заданные темы с коучем публичных выступлений.' }, tasks: [
        { id: 'impromptu', title: { en: 'Four impromptu talks, scored', uz: 'To‘rtta baholangan tayyorgarliksiz nutq', ru: 'Четыре оценённые импровизации' }, match: { features: ['B6'], kinds: scored, skill: 'speaking.public' }, count: 4, link: '/coach/b6' },
      ] },
      { week: 6, title: { en: 'At work', uz: 'Ishda', ru: 'На работе' }, focus: { en: 'Meetings, updates and asking for help.', uz: 'Yig‘ilishlar, hisobotlar va yordam so‘rash.', ru: 'Совещания, отчёты и просьбы о помощи.' }, tasks: [
        { id: 'work', title: { en: 'Four work role-plays', uz: 'To‘rtta ish rolli o‘yini', ru: 'Четыре рабочие ролевые игры' }, match: { features: ['B2'], kinds: scored, skill: 'speaking.roleplay' }, count: 4, link: '/coach/b2' },
      ] },
      { week: 7, title: { en: 'Tell a story', uz: 'Hikoya aytib bering', ru: 'Расскажите историю' }, focus: { en: 'A beginning, a problem, an ending: people remember stories.', uz: 'Boshlanish, muammo, yakun: odamlar hikoyalarni eslab qoladi.', ru: 'Начало, проблема, развязка: люди запоминают истории.' }, tasks: [
        { id: 'story_talk', title: { en: 'Three storytelling drills', uz: 'Uchta hikoya mashqi', ru: 'Три упражнения на рассказ' }, match: { features: ['B6'], kinds: any, skill: 'speaking.public' }, count: 3, link: '/coach/b6' },
      ] },
      { week: 8, title: { en: 'Strict mode', uz: 'Qat’iy rejim', ru: 'Строгий режим' }, focus: { en: 'Switch the Speaking Partner to strict correction for a week.', uz: 'Ingliz tili suhbatdoshini bir haftaga qat’iy tuzatish rejimiga o‘tkazing.', ru: 'Включите у разговорного партнёра строгий режим исправлений на неделю.' }, tasks: [
        { id: 'strict', title: { en: 'Five role-plays in strict mode', uz: 'Qat’iy rejimda beshta rolli o‘yin', ru: 'Пять ролевых игр в строгом режиме' }, match: { features: ['B2'], kinds: scored }, count: 5, link: '/coach/b2' },
      ] },
      { week: 9, title: { en: 'Day 60', uz: '60-kun', ru: 'День 60' }, focus: { en: 'Record your voice again and play it next to day 1.', uz: 'Ovozingizni yana yozib oling va birinchi kundagi yozuv bilan solishtiring.', ru: 'Запишите голос снова и сравните с первым днём.' }, tasks: [
        { id: 'final', title: { en: 'A final role-play', uz: 'Yakuniy rolli o‘yin', ru: 'Финальная ролевая игра' }, match: { features: ['B2', 'B6'], kinds: scored }, count: 1, link: '/coach/b2' },
        { id: 'voice', title: { en: 'Record your day-60 voice', uz: '60-kundagi ovozingizni yozib oling', ru: 'Запишите голос 60-го дня' }, match: { features: [], sample: 'voice' }, count: 1, link: '/then-vs-now' },
      ] },
    ],
    graduation: {
      title: { en: 'Sixty days of speaking', uz: 'Oltmish kunlik nutq', ru: 'Шестьдесят дней речи' },
      lead: { en: 'Play day 1 next to day 60. To show your level to others, the next step is the English Speaking B1 certificate exam.', uz: '1-kun va 60-kun yozuvlarini yonma-yon eshiting. Darajangizni boshqalarga ko‘rsatish uchun keyingi qadam — «Ingliz tili nutqi B1» sertifikat imtihoni.', ru: 'Сравните первый день с шестидесятым. Чтобы показать свой уровень другим, следующий шаг — экзамен на сертификат «Разговорный английский B1».' },
      certificate: 'speaking_b1',
    },
  },
];

export const journeyByKey = (key: string) => JOURNEYS.find((journey) => journey.key === key) ?? null;

/** Content checks run by tests: chapters numbered 1..weeks, unique task ids, counts positive. */
export function journeyProblems(): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const journey of JOURNEYS) {
    if (keys.has(journey.key)) problems.push(`${journey.key}: duplicate`);
    keys.add(journey.key);
    if (journey.chapters.length !== journey.weeks) problems.push(`${journey.key}: ${journey.chapters.length} chapters for ${journey.weeks} weeks`);
    journey.chapters.forEach((chapter, index) => {
      if (chapter.week !== index + 1) problems.push(`${journey.key}: chapter ${index + 1} is week ${chapter.week}`);
      const ids = new Set<string>();
      if (!chapter.tasks.some((task) => task.match)) problems.push(`${journey.key}/${chapter.week}: no tracked task`);
      for (const task of chapter.tasks) {
        if (ids.has(task.id)) problems.push(`${journey.key}/${chapter.week}: task ${task.id} twice`);
        ids.add(task.id);
        if (!Number.isInteger(task.count) || task.count < 1 || task.count > 20) problems.push(`${journey.key}/${chapter.week}/${task.id}: count`);
        if (!task.link.startsWith('/') && !task.link.startsWith('https://')) problems.push(`${journey.key}/${chapter.week}/${task.id}: link`);
        for (const text of [task.title, chapter.title, chapter.focus]) for (const locale of ['en', 'uz', 'ru'] as const) if (!text[locale]) problems.push(`${journey.key}/${chapter.week}: missing ${locale}`);
      }
    });
  }
  return problems;
}
