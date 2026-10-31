import { T } from '../src/localize.ts';
import type { Localized, Sample } from '../src/types.ts';

// Static examples for people without a plan, clearly labelled as examples of fictional
// learners. Practice text (the task, quotes, better lines) is in all three languages.

type Tri = [en: string, uz: string, ru: string];
const L = ([en, uz, ru]: Tri): Localized => ({ en, uz, ru });
const P = ([en, uz, ru]: Tri) => T({ en, uz, ru });

export const samples: Sample[] = [
  {
    id: 'sample-pitch-report',
    kind: 'speaking_report',
    title: L(['Example: a one-minute pitch, scored', 'Namuna: bir daqiqalik pitch bahosi', 'Пример: оценка минутного питча']),
    preview: L([
      'Malika (fictional), L3: 152 words a minute, 4 fillers, a good opening number but no clear ask. Each score quotes her own words, with three better lines to re-record.',
      'Malika (to‘qima o‘quvchi), L3: daqiqasiga 152 so‘z, 4 ta to‘ldiruvchi, yaxshi raqamli kirish, lekin aniq iltimos yo‘q. Har bir ball uning o‘z so‘zlari bilan asoslangan va qayta yozib olish uchun uchta yaxshiroq gap bor.',
      'Малика (вымышленная ученица), L3: 152 слова в минуту, 4 слова-паразита, хорошее начало с цифрой, но нет ясной просьбы. Каждый балл подкреплён её словами, есть три фразы получше для перезаписи.',
    ]),
    body: {
      task: P(['Elevator pitch: pitch a peer-tutoring club to the school director in one minute.', 'Elevator pitch: tengdoshlar repetitorligi to‘garagini maktab direktoriga bir daqiqada taqdim eting.', 'Elevator pitch: за минуту представьте директору школы клуб взаимного репетиторства.']),
      overall: 3,
      metrics: { wpm: 152, fillersPerMinute: 4, longPauses: 1, seconds: 58 },
      criteria: [
        { id: 'structure', score: 3, evidence: [P(['Thirty students in ninth grade failed the maths test', 'To‘qqizinchi sinfda o‘ttiz o‘quvchi matematika testidan yiqildi', 'Тридцать девятиклассников провалили тест по математике'])], note: L(['A strong opening number, two clear ideas, but it ends with "I hope you like it" instead of a request.', 'Kuchli raqamli kirish, ikkita aniq fikr, lekin iltimos o‘rniga «yoqadi degan umiddaman» bilan tugaydi.', 'Сильное начало с цифрой, две ясные мысли, но финал — «надеюсь, вам понравится», а не просьба.']) },
        { id: 'clarity', score: 3.5, evidence: [P(['older students help younger ones after lessons', 'katta o‘quvchilar darsdan keyin kichiklarga yordam beradi', 'старшие ученики помогают младшим после уроков'])], note: L(['The idea is easy to picture in one hearing.', 'G‘oyani bir eshitishda tasavvur qilish oson.', 'Идею легко представить с первого раза.']) },
        { id: 'flow', score: 3, evidence: [P(['and, um, it will be, like, very good', 'va, ee, bu, haligi, juda yaxshi bo‘ladi', 'и, ну, это будет, типа, очень хорошо'])], note: L(['152 wpm is within the comfortable range, but there is only one pause in the minute and all four fillers came in the second half.', 'Daqiqasiga 152 so‘z — qulay oraliqda, lekin bir daqiqada faqat bitta pauza bor va to‘rtta to‘ldiruvchining hammasi ikkinchi yarmida.', '152 слова в минуту — в пределах комфортного темпа, но за минуту всего одна пауза, а все четыре паразита — во второй половине.']) },
        { id: 'engagement', score: 3, evidence: [P(['they were too shy to ask the teacher', 'ular o‘qituvchidan so‘rashga uyalishgan', 'они стеснялись спросить учителя'])], note: L(['One real reason the director will recognise; no example of the club working yet.', 'Direktor taniydigan bitta haqiqiy sabab; to‘garak ishlashining misoli hali yo‘q.', 'Одна реальная причина, знакомая директору; примера работы клуба пока нет.']) },
        { id: 'language', score: 3, evidence: [P(['I hope you like it', 'yoqadi degan umiddaman', 'надеюсь, вам понравится'])], note: L(['Polite and correct, but hedging weakens the close.', 'Odobli va to‘g‘ri, lekin ikkilanish yakunni zaiflashtiradi.', 'Вежливо и правильно, но неуверенность ослабляет финал.']) },
        { id: 'voice', score: null, evidence: [], note: L(['Voice and intonation need the sound itself; they are never scored from a transcript.', 'Ovoz va ohangni faqat tovushdan baholash mumkin; matndan hech qachon baholanmaydi.', 'Голос и интонацию можно оценить только по звуку; по тексту они не оцениваются.']) },
      ],
      upgrades: [
        { said: P(['I hope you like it.', 'Yoqadi degan umiddaman.', 'Надеюсь, вам понравится.']), better: P(['All I need from you today is a yes for a six-week trial. Can we start on Monday?', 'Bugun sizdan faqat olti haftalik sinovga «ha» kerak. Dushanbadan boshlasak bo‘ladimi?', 'Сегодня мне нужно только «да» на шестинедельную пробу. Можем начать в понедельник?']), why: L(['A small, dated request is easy to say yes to.', 'Kichik, sanasi aniq iltimosga «ha» deyish oson.', 'На маленькую просьбу с датой легко сказать «да».']) },
        { said: P(['and, um, it will be, like, very good', 'va, ee, bu, haligi, juda yaxshi bo‘ladi', 'и, ну, это будет, типа, очень хорошо']), better: P(['Students ask a classmate what they won’t ask a teacher.', 'O‘quvchilar o‘qituvchidan so‘ramaydigan narsani sinfdoshidan so‘raydi.', 'Ученики спросят одноклассника о том, о чём не спросят учителя.']), why: L(['A concrete reason instead of a vague "very good", with no fillers.', '«Juda yaxshi» degan noaniq gap o‘rniga aniq sabab, to‘ldiruvchisiz.', 'Конкретная причина вместо расплывчатого «очень хорошо», без паразитов.']) },
        { said: P(['Thirty students in ninth grade failed the maths test', 'To‘qqizinchi sinfda o‘ttiz o‘quvchi matematika testidan yiqildi', 'Тридцать девятиклассников провалили тест по математике']), better: P(['Last term, thirty of our ninth graders failed the maths test. [pause] Twenty told us the same thing.', 'O‘tgan chorakda to‘qqizinchi sinflarimizdan o‘ttiz nafari matematika testidan o‘ta olmadi. [pauza] Yigirmatasi bir xil narsani aytdi.', 'В прошлой четверти тридцать наших девятиклассников провалили тест по математике. [пауза] Двадцать сказали одно и то же.']), why: L(['A pause after the number lets it land and builds curiosity.', 'Raqamdan keyingi pauza uni yaxshiroq yetkazadi va qiziqish uyg‘otadi.', 'Пауза после цифры даёт ей прозвучать и вызывает интерес.']) },
      ],
    },
  },
  {
    id: 'sample-weekly',
    kind: 'weekly_report',
    title: L(['Example: a weekly progress report', 'Namuna: haftalik natija hisoboti', 'Пример: недельный отчёт о прогрессе']),
    preview: L([
      'Jasur (fictional), week 3: fillers down from 9 to 4 per 100 words, pace from 188 to 151 wpm, talk score from L2+ to L3. Before/after numbers from his own recordings.',
      'Jasur (to‘qima o‘quvchi), 3-hafta: to‘ldiruvchilar 100 so‘zga 9 tadan 4 taga, sur’at daqiqasiga 188 so‘zdan 151 so‘zga, nutq bahosi L2+ darajadan L3 darajaga. Oldin/keyin raqamlari uning o‘z yozuvlaridan.',
      'Жасур (вымышленный ученик), 3-я неделя: паразиты — с 9 до 4 на 100 слов, темп — с 188 до 151 слова в минуту, оценка речи — с L2+ до L3. Цифры «до/после» по его собственным записям.',
    ]),
    body: {
      rows: [
        { label: L(['Talk score', 'Nutq bahosi', 'Оценка речи']), before: 2.5, after: 3 },
        { label: L(['Fillers per 100 words', '100 so‘zga to‘ldiruvchilar', 'Паразиты на 100 слов']), before: 9, after: 4, lowerIsBetter: true },
        { label: L(['Words per minute', 'Daqiqadagi so‘zlar', 'Слов в минуту']), before: 188, after: 151, unit: 'wpm' },
        { label: L(['Long pauses per talk', 'Bir nutqdagi uzun pauzalar', 'Длинных пауз за речь']), before: 1, after: 3 },
        { label: L(['Minutes practised', 'Mashq daqiqalari', 'Минут практики']), before: 41, after: 63 },
        { label: L(['Active days', 'Faol kunlar', 'Активных дней']), before: 4, after: 6 },
      ],
      minutes: 63,
      streak: 9,
      focus: [
        L(['Fillers fell most where you paused at the end of each point. Keep the slash marks in your notes.', 'To‘ldiruvchilar har fikr oxirida pauza qilgan joylaringizda eng ko‘p kamaydi. Eslatmalardagi qiya chiziqlarni (/) saqlang.', 'Больше всего паразитов убавилось там, где вы делали паузу в конце тезиса. Оставьте косые черты в заметках.']),
        L(['Pace is now in the comfortable range; slow down further on numbers.', 'Sur’at endi qulay oraliqda; raqamlarda yana sekinlashing.', 'Темп теперь в комфортном диапазоне; на цифрах замедляйтесь ещё сильнее.']),
        L(['Next week: closes. Two of three talks ended without a request.', 'Keyingi hafta: yakunlar. Uchta nutqdan ikkitasi iltimossiz tugadi.', 'На следующей неделе — финалы: две речи из трёх закончились без просьбы.']),
      ],
    },
  },
  {
    id: 'sample-qa-review',
    kind: 'roleplay_review',
    title: L(['Example: Q&A with a sceptical investor', 'Namuna: shubhali investor bilan savol-javob', 'Пример: вопросы скептичного инвестора']),
    preview: L([
      'Kamila (fictional), L3+: answered the traction question honestly, stayed calm with the competition question, but rambled on the team question. The investor’s hidden doubts are revealed.',
      'Kamila (to‘qima o‘quvchi), L3+: mijozlar soni haqidagi savolga halol javob berdi, raqobat haqidagi savolda xotirjam qoldi, lekin jamoa haqidagi savolda gapni cho‘zib yubordi. Investorning yashirin shubhalari ochib beriladi.',
      'Камила (вымышленная ученица), L3+: честно ответила про клиентов, спокойно — про конкурентов, но слишком затянула ответ о команде. Скрытые сомнения инвестора раскрыты.',
    ]),
    body: {
      scenario: P(['Q&A after a startup pitch: an angel investor asks about paying customers, a big competitor and the team.', 'Startap taqdimotidan keyingi savol-javob: investor to‘layotgan mijozlar, katta raqobatchi va jamoa haqida so‘raydi.', 'Вопросы после питча стартапа: инвестор спрашивает о платящих клиентах, крупном конкуренте и команде.']),
      goals: [
        { text: L(['Answer the first question directly in your first sentence', 'Birinchi savolga birinchi gapingizdayoq to‘g‘ridan-to‘g‘ri javob bering', 'Ответьте на первый вопрос прямо в первой же фразе']), met: true, quote: P(['Twelve cafés are paying today.', 'Bugun o‘n ikkita kafe pul to‘layapti.', 'Сегодня платят двенадцать кафе.']) },
        { text: L(['Give an honest number for paying customers, however small', 'To‘layotgan mijozlar sonini, kichik bo‘lsa ham, halol ayting', 'Честно назовите число платящих клиентов, даже если оно маленькое']), met: true, quote: P(['Twelve cafés are paying today.', 'Bugun o‘n ikkita kafe pul to‘layapti.', 'Сегодня платят двенадцать кафе.']) },
        { text: L(['When you do not know, say so and promise to follow up', 'Bilmasangiz, shuni ayting va keyin javob berishni va’da qiling', 'Если не знаете, так и скажите и пообещайте вернуться с ответом']), met: false, quote: null },
        { text: L(['Bridge back to your main message at the end', 'Oxirida nutqingizning asosiy fikriga qayting', 'В конце вернитесь к главной мысли выступления']), met: true, quote: P(['and that is why the early mornings are our advantage', 'shuning uchun erta tonglar bizning ustunligimiz', 'и поэтому ранние утра — наше преимущество']) },
      ],
      criteria: [
        { id: 'answer', score: 4, evidence: [P(['Twelve cafés are paying today.', 'Bugun o‘n ikkita kafe pul to‘layapti.', 'Сегодня платят двенадцать кафе.'])], note: L(['Direct and honest on the hardest question.', 'Eng qiyin savolga to‘g‘ridan-to‘g‘ri va halol.', 'Прямо и честно на самый трудный вопрос.']) },
        { id: 'brevity', score: 3, evidence: [P(['my co-founder, he studied in Moscow, and before that he worked', 'hammuassisim, u Moskvada o‘qigan, undan oldin ishlagan', 'мой сооснователь, он учился в Москве, а до этого работал'])], note: L(['The team answer ran to nine sentences.', 'Jamoa haqidagi javob to‘qqiz gapga cho‘zildi.', 'Ответ о команде растянулся на девять фраз.']) },
        { id: 'evidence', score: 3.5, evidence: [P(['three of them ordered again this week', 'ulardan uchtasi shu hafta yana buyurtma berdi', 'трое из них заказали снова на этой неделе'])], note: L(['A real repeat-order number; the market size was asserted without a source.', 'Haqiqiy takroriy buyurtma raqami; bozor hajmi esa manbasiz aytildi.', 'Реальная цифра повторных заказов; размер рынка назван без источника.']) },
        { id: 'composure', score: 4, evidence: [P(['If they come, the market is real.', 'Agar ular kelsa, demak bozor haqiqiy.', 'Если они придут, значит, рынок настоящий.'])], note: L(['Calm reframe of the competitor threat.', 'Raqobat tahdidini xotirjam qayta talqin qildi.', 'Спокойно повернула угрозу конкурента в свою пользу.']) },
        { id: 'respect', score: 3.5, evidence: [P(['Thank you, that is the right question.', 'Rahmat, bu to‘g‘ri savol.', 'Спасибо, это правильный вопрос.'])], note: L(['Thanked the investor; could check that the answer helped.', 'Investorga rahmat aytdi; javob yordam berganini so‘rab ko‘rsa bo‘lardi.', 'Поблагодарила инвестора; стоило уточнить, помог ли ответ.']) },
      ],
      scorecard: { talkRatio: 71, questionsAsked: 1, averageTurnWords: 46 },
      betterLines: [
        { said: P(['my co-founder, he studied in Moscow, and before that he worked', 'hammuassisim, u Moskvada o‘qigan, undan oldin ishlagan', 'мой сооснователь, он учился в Москве, а до этого работал']), better: P(['Two of us grew up in families who sell at this bazaar. That opens doors nobody else can open.', 'Ikkimiz shu bozorda savdo qiladigan oilalarda o‘sganmiz. Bu boshqalar ocha olmaydigan eshiklarni ochadi.', 'Двое из нас выросли в семьях, которые торгуют на этом базаре. Это открывает двери, закрытые для других.']), why: L(['One reason that matters to this investor, in two sentences.', 'Bu investor uchun muhim bitta sabab, ikki gapda.', 'Одна важная для инвестора причина — в двух фразах.']) },
        { said: P(['The market is very big, maybe billions.', 'Bozor juda katta, balki milliardlab.', 'Рынок очень большой, может, миллиарды.']), better: P(['I don’t have a reliable market figure yet. I will send you our count of cafés in two districts this week.', 'Hozircha ishonchli bozor raqamim yo‘q. Shu hafta ikki tumandagi kafelar sonini sizga yuboraman.', 'Надёжной цифры рынка у меня пока нет. На этой неделе пришлю вам подсчёт кафе в двух районах.']), why: L(['An honest limit plus a follow-up beats an invented number.', 'Cheklovni halol tan olish va keyinroq javob berish va’dasi to‘qima raqamdan yaxshiroq.', 'Честно признанное ограничение и обещание прислать ответ лучше выдуманной цифры.']) },
      ],
    },
  },
  {
    id: 'sample-plan',
    kind: 'plan',
    title: L(['Example: a week of an eight-week speaking plan', 'Namuna: sakkiz haftalik nutq rejasidan bir hafta', 'Пример: неделя восьминедельного плана выступлений']),
    preview: L([
      'Week 2 of an eight-week plan to L4 for a 15-minute day: a short scored talk every day, pause practice, and the Saturday showcase.',
      'L4 darajasiga yetish uchun sakkiz haftalik rejaning 2-haftasi, kuniga 15 daqiqa: har kuni qisqa baholangan nutq, pauza mashqi va shanba ko‘rigi.',
      'Вторая неделя восьминедельного плана до L4 по 15 минут в день: каждый день короткая речь с оценкой, тренировка пауз и субботнее выступление.',
    ]),
    body: {
      target: 4,
      weeks: 8,
      days: [
        { day: L(['Monday', 'Dushanba', 'Понедельник']), tasks: [L(['Elevator pitch · 4 min', 'Elevator pitch · 4 daqiqa', 'Elevator pitch · 4 мин']), L(['Pauses instead of fillers · 5 min', 'To‘ldiruvchi o‘rniga pauza · 5 daqiqa', 'Паузы вместо паразитов · 5 мин']), L(['Lesson: four hooks · 3 min', 'Dars: to‘rt xil kirish · 3 daqiqa', 'Урок: четыре зацепки · 3 мин'])] },
        { day: L(['Tuesday', 'Seshanba', 'Вторник']), tasks: [L(['Impromptu topic · 4 min', 'Tayyorgarliksiz nutq · 4 daqiqa', 'Импровизация · 4 мин']), L(['Drill: fillers · 4 min', 'Mashq: to‘ldiruvchilar · 4 daqiqa', 'Упражнение: паразиты · 4 мин']), L(['Openings that hook · 5 min', 'Diqqatni tortuvchi boshlanishlar · 5 daqiqa', 'Начала с зацепкой · 5 мин'])] },
        { day: L(['Wednesday', 'Chorshanba', 'Среда']), tasks: [L(['Story · 4 min', 'Hikoya · 4 daqiqa', 'История · 4 мин']), L(['Lesson: a story in four moves · 3 min', 'Dars: to‘rt qadamli hikoya · 3 daqiqa', 'Урок: история в четыре хода · 3 мин']), L(['Drill: examples · 4 min', 'Mashq: misollar · 4 daqiqa', 'Упражнение: примеры · 4 мин'])] },
        { day: L(['Thursday', 'Payshanba', 'Четверг']), tasks: [L(['Presentation rehearsal · 5 min', 'Taqdimot repetitsiyasi · 5 daqiqa', 'Репетиция выступления · 5 мин']), L(['Signposts and transitions · 5 min', 'Yo‘nalish beruvchi o‘tishlar · 5 daqiqa', 'Связки и переходы · 5 мин'])] },
        { day: L(['Friday', 'Juma', 'Пятница']), tasks: [L(['Q&A: the school director · 6 min', 'Savol-javob: maktab direktori · 6 daqiqa', 'Вопросы: директор школы · 6 мин']), L(['Drill: answers to hard questions · 4 min', 'Mashq: qiyin savollarga javob · 4 daqiqa', 'Упражнение: трудные вопросы · 4 мин'])] },
        { day: L(['Saturday', 'Shanba', 'Суббота']), tasks: [L(['Showcase: pitch, impromptu, story, rehearsal and questions · 18 min', 'Ko‘rik: pitch, tayyorgarliksiz nutq, hikoya, repetitsiya va savollar · 18 daqiqa', 'Показательное выступление: питч, импровизация, история, репетиция и вопросы · 18 мин'])] },
        { day: L(['Sunday', 'Yakshanba', 'Воскресенье']), tasks: [L(['Rest, or one elevator pitch to keep the streak · 2 min', 'Dam olish yoki seriyani saqlash uchun bitta elevator pitch · 2 daqiqa', 'Отдых или один elevator pitch, чтобы сохранить серию · 2 мин'])] },
      ],
    },
  },
];
