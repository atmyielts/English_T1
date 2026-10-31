import { T } from '../src/localize.ts';
import type { Activity, Localized, Roleplay } from '../src/types.ts';

// Q&A after a talk: the learner has just finished speaking and one person from the
// audience asks questions. Each questioner has a hidden state (scepticism, patience,
// whether they press again, what really worries them) that reacts to the answers. The
// review scores only the learner's answers (speech.qa), ticks the goals with quotes and
// reveals what the questioner was thinking. People and organisations are invented.

type Tri = [en: string, uz: string, ru: string];
const L = ([en, uz, ru]: Tri): Localized => ({ en, uz, ru });

const CARD: Roleplay['scorecard'] = ['talk_ratio', 'questions_asked', 'average_turn_words', 'pace'];
const NOTES = (focus: string): [number, string][] => [
  [2, `Ask one short, clear question at a time and accept a simple answer; if the learner freezes, rephrase the question more simply once. ${focus}`],
  [3.5, `Ask natural questions, press once when an answer is vague, and react to good answers with a short "I see". ${focus}`],
  [5, `Ask sharp, realistic questions, follow up on every vague claim, interrupt politely if an answer rambles, and only accept specifics. ${focus}`],
];

/** Goals every Q&A practises; the scenario adds its own. */
const direct = { id: 'answer_direct', text: L(['Answer the first question directly in your first sentence', 'Birinchi savolga birinchi gapingizdayoq to‘g‘ridan-to‘g‘ri javob bering', 'Ответьте на первый вопрос прямо в первой же фразе']), check: 'The learner’s first answer starts with a direct answer to the question asked (yes, no, a number, a name, a plan), not with background.' };
const honest = { id: 'honest_limit', text: L(['When you do not know, say so and promise to follow up', 'Bilmasangiz, shuni ayting va keyin javob berishni va’da qiling', 'Если не знаете, так и скажите и пообещайте вернуться с ответом']), check: 'At least once the learner admits a limit honestly (I do not know yet, I will check and send it) instead of inventing a fact or number. Also met if every answer is supported and nothing is invented.' };
const bridge = { id: 'bridge_back', text: L(['Bridge back to your main message at the end', 'Oxirida nutqingizning asosiy fikriga qayting', 'В конце вернитесь к главной мысли выступления']), check: 'In a later answer the learner links back to the main message or call to action of their talk.' };

interface Spec {
  id: string; title: Tri; setting: Tri; role: Tri; goal: Tri; levels: [number, number];
  persona: { name: string; role: string; style: string; opening: Tri; voice?: string };
  concern: string[]; initial: { scepticism: number; patience: number; concern: string };
  extra: string; rules: string; goals: Roleplay['goals']; focus: string;
}

const qa = (spec: Spec): Roleplay => ({
  id: spec.id, kind: 'roleplay', rubric: 'speech.qa', node: 'interaction.qa', levels: spec.levels, minutes: 6,
  title: L(spec.title), setting: L(spec.setting), learnerRole: L(spec.role), goal: L(spec.goal),
  persona: { name: spec.persona.name, role: spec.persona.role, style: spec.persona.style, opening: T({ en: spec.persona.opening[0], uz: spec.persona.opening[1], ru: spec.persona.opening[2] }), ...(spec.persona.voice ? { voice: spec.persona.voice } : {}) },
  hiddenState: {
    fields: [
      { id: 'scepticism', kind: 'number', min: 0, max: 10, description: 'How unconvinced the questioner is. It falls with direct, specific, honest answers and rises with dodging, vague claims or invented numbers.', revealInReview: true },
      { id: 'patience', kind: 'number', min: 0, max: 10, description: 'How long the questioner will keep listening. Long or rambling answers use it up; short focused ones keep it.', revealInReview: true },
      { id: 'real_concern', kind: 'enum', values: spec.concern, description: spec.extra, revealInReview: true },
      { id: 'will_press', kind: 'boolean', description: 'Whether the questioner will ask the same thing again because the last answer did not answer it.', revealInReview: false },
      { id: 'won_over', kind: 'boolean', description: 'Whether the questioner ends up supporting the speaker’s proposal or message.', revealInReview: true },
    ],
    initial: { scepticism: spec.initial.scepticism, patience: spec.initial.patience, real_concern: spec.initial.concern, will_press: false, won_over: false },
    rules: `General: scepticism −1 for a direct answer in the first sentence, −1 for a concrete reason, example or figure that fits, −1 when the speaker honestly admits a limit and offers to follow up; +1 for dodging or answering a different question, +2 for an invented or impossible figure, +1 for a defensive or dismissive tone. Patience −1 for each answer over about five sentences or with no clear point; +1 for a crisp answer. will_press becomes true whenever an answer does not answer the question, and then the next question repeats it more sharply. When patience reaches 2 or less, the questioner thanks the speaker coolly and ends. won_over becomes true when scepticism is 3 or less and the real concern has been answered. ${spec.rules}`,
  },
  goals: [direct, ...spec.goals, honest, bridge],
  scorecard: CARD,
  minTurns: 3, maxTurns: 8,
  levelNotes: NOTES(spec.focus),
});

export const roleplays: Activity[] = [
  qa({
    id: 'rp.qa-investor', levels: [2.5, 5],
    title: ['Q&A: the sceptical investor', 'Savol-javob: shubhali investor', 'Вопросы: скептичный инвестор'],
    setting: ['A startup evening at a Tashkent business hub. You have just pitched your app that connects market farmers with cafés. An investor in the front row raises her hand.', 'Toshkentdagi biznes markazda startaplar kechasi. Siz bozordagi fermerlarni kafelar bilan bog‘laydigan ilovangizni hozirgina taqdim etdingiz. Old qatordagi investor qo‘l ko‘tardi.', 'Вечер стартапов в бизнес-хабе Ташкента. Вы только что представили приложение, которое связывает кафе с фермерами, торгующими на рынке. Инвестор в первом ряду поднимает руку.'],
    role: ['You are the founder who just gave the pitch.', 'Siz hozirgina taqdimot qilgan asoschisiz.', 'Вы — основатель стартапа, и вы только что выступили с питчем.'],
    goal: ['Answer her questions so that she wants a follow-up meeting.', 'Uning savollariga shunday javob beringki, u keyingi uchrashuvni xohlasin.', 'Ответьте на её вопросы так, чтобы она захотела встретиться ещё раз.'],
    persona: { name: 'Nigora Rashidova', role: 'An angel investor who has backed four local start-ups and lost money on two of them.', style: 'Polite, quick and numbers-minded. Smiles little, writes notes, and asks "how do you know?" after every claim. Respects honesty more than confidence; hates invented market sizes.', opening: ['Thank you, interesting idea. My first question: how many cafés are actually paying you today — not interested, paying?', 'Rahmat, qiziq g‘oya. Birinchi savolim: bugun nechta kafe sizga haqiqatan pul to‘layapti — qiziqqan emas, to‘layotgan?', 'Спасибо, интересная идея. Первый вопрос: сколько кафе реально платят вам сегодня — не интересуются, а платят?'] },
    concern: ['traction', 'competition', 'team'], initial: { scepticism: 7, patience: 6, concern: 'traction' },
    extra: 'What the investor really needs to hear before she would meet again: proof people pay (traction), why a big marketplace will not crush them (competition), or why this team can do it (team).',
    rules: 'She asks about paying customers first, then about a big competitor, then about the team. If the speaker gives an honest small number with what they learned from it, scepticism −2. An invented big number makes her ask how it was measured and scepticism +2.',
    goals: [{ id: 'traction_honest', text: L(['Give an honest number for paying customers, however small', 'To‘layotgan mijozlar sonini, kichik bo‘lsa ham, halol ayting', 'Честно назовите число платящих клиентов, даже если оно маленькое']), check: 'The learner states a specific number of paying customers or honestly says there are none yet, without inflating it.' }],
    focus: 'You care about evidence, competition from a big marketplace, and the team.',
  }),
  qa({
    id: 'rp.qa-director', levels: [1.5, 4.5],
    title: ['Q&A: the school director', 'Savol-javob: maktab direktori', 'Вопросы: директор школы'],
    setting: ['The teachers’ room after a short talk in which you proposed a robotics club. The director listened with arms folded.', 'Robototexnika to‘garagini taklif qilgan qisqa nutqingizdan keyin o‘qituvchilar xonasi. Direktor qo‘llarini qovushtirib tingladi.', 'Учительская после короткого выступления, в котором вы предложили клуб робототехники. Директор слушал, скрестив руки.'],
    role: ['You are the student who proposed the club.', 'Siz to‘garakni taklif qilgan o‘quvchisiz.', 'Вы учитесь в этой школе, и клуб предложили вы.'],
    goal: ['Win the director’s permission for a trial term.', 'Direktordan sinov choragi uchun ruxsat oling.', 'Получите разрешение директора на пробную четверть.'],
    persona: { name: 'Bahodir Usmonov', role: 'The director of a large state school, in his fifties, responsible for exam results and the budget.', style: 'Formal and fatherly, uses the speaker’s first name, expects respectful address (in Uzbek "domla" or "ustoz", in Russian his first name and patronymic are welcome but not required). Worried about money, safety and exam results. Softens when he sees a concrete plan and a responsible adult.', opening: ['Good, I listened. Now tell me: who is going to pay for these robot kits?', 'Yaxshi, eshitdim. Endi ayting-chi: bu robot to‘plamlari uchun kim pul to‘laydi?', 'Хорошо, я выслушал. Теперь скажи: кто будет платить за эти наборы для робототехники?'] },
    concern: ['money', 'supervision', 'exam_results'], initial: { scepticism: 7, patience: 6, concern: 'exam_results' },
    extra: 'What the director really fears: spending school money, nobody responsible for the students, or worse exam results.',
    rules: 'He asks about money, then supervision, then exam results. Scepticism −2 if the speaker names a specific sponsor or plan for the kits, −2 if a named teacher has agreed to supervise, −2 if the exam worry is met with a safeguard (e.g. only on Saturdays, results checked each term). Disrespectful tone: patience −2.',
    goals: [{ id: 'safeguard', text: L(['Answer the exam-results worry with a concrete safeguard', 'Imtihon natijalari haqidagi xavotirga aniq ehtiyot chorasi bilan javob bering', 'Ответьте на тревогу об экзаменах конкретной мерой предосторожности']), check: 'The learner offers a concrete safeguard for exam results, such as timing outside lessons or checking members’ grades each term.' }],
    focus: 'You care about the budget, who supervises, and exam results.',
  }),
  qa({
    id: 'rp.qa-journalist', levels: [2.5, 5],
    title: ['Q&A: the local journalist', 'Savol-javob: mahalliy jurnalist', 'Вопросы: местный журналист'],
    setting: ['A press event for a volunteer project that helps older people in your district. After your short talk a journalist with a recorder steps forward.', 'Tumaningizdagi keksalarga yordam beradigan ko‘ngillilar loyihasining matbuot tadbiri. Qisqa nutqingizdan so‘ng diktofonli jurnalist oldinga chiqdi.', 'Пресс-мероприятие волонтёрского проекта помощи пожилым в вашем районе. После вашего короткого выступления вперёд выходит журналист с диктофоном.'],
    role: ['You lead the volunteer project.', 'Siz ko‘ngillilar loyihasi rahbarisiz.', 'Вы руководите волонтёрским проектом.'],
    goal: ['Give answers that are quotable, accurate and fair.', 'Iqtibos qilsa bo‘ladigan, aniq va adolatli javoblar bering.', 'Дайте ответы, которые можно цитировать, — точные и честные.'],
    persona: { name: 'Sardor Qodirov', role: 'A reporter for a regional online news site who needs one good quote and one hard question answered.', style: 'Friendly but persistent, asks short questions, repeats a question if the answer is vague, and looks for numbers he can check. Never hostile, but will print exactly what is said.', opening: ['Thanks. Readers will ask: why does a volunteer project need money from the city at all?', 'Rahmat. O‘quvchilar so‘raydi: ko‘ngillilar loyihasiga umuman shahar pulining nima keragi bor?', 'Спасибо. Читатели спросят: зачем волонтёрскому проекту вообще деньги города?'] },
    concern: ['money', 'proof_of_results', 'who_benefits'], initial: { scepticism: 6, patience: 7, concern: 'proof_of_results' },
    extra: 'What the reporter needs for a fair story: why public money (money), what has actually changed (proof_of_results), or who exactly benefits (who_benefits).',
    rules: 'He asks about money, then results, then for one sentence readers should remember. A clear number he could check: scepticism −2. A long history of the project before answering: patience −2 and will_press true.',
    goals: [{ id: 'quotable', text: L(['Give one short sentence the journalist can quote', 'Jurnalist iqtibos qiladigan bitta qisqa gap ayting', 'Дайте одну короткую фразу, которую журналист сможет процитировать']), check: 'The learner says one short, memorable sentence that sums up the project (under about 20 words).' }],
    focus: 'You need checkable facts and one quotable line.',
  }),
  qa({
    id: 'rp.qa-conference', levels: [2.5, 5],
    title: ['Q&A: a teacher at a conference', 'Savol-javob: konferensiyadagi o‘qituvchi', 'Вопросы: учитель на конференции'],
    setting: ['A teachers’ conference in Samarkand. You gave a fifteen-minute talk on teaching vocabulary with games. An experienced teacher takes the microphone.', 'Samarqanddagi o‘qituvchilar konferensiyasi. Siz o‘yinlar orqali lug‘at o‘rgatish haqida o‘n besh daqiqalik nutq so‘zladingiz. Tajribali o‘qituvchi mikrofonni oldi.', 'Конференция учителей в Самарканде. Вы выступили с пятнадцатиминутным докладом о том, как учить лексику с помощью игр. Опытная учительница берёт микрофон.'],
    role: ['You are the teacher who gave the talk.', 'Siz nutq so‘zlagan o‘qituvchisiz.', 'Вы — учитель, это ваше выступление.'],
    goal: ['Answer so that the room trusts the method.', 'Zaldagilar usulga ishonadigan qilib javob bering.', 'Ответьте так, чтобы зал поверил в метод.'],
    persona: { name: 'Zulfiya Ergasheva', role: 'A teacher with twenty-five years of experience who teaches classes of forty students.', style: 'Warm but direct, slightly tired of new methods that do not work in big classes. Asks practical questions. Respects a speaker who agrees with fair points.', opening: ['Thank you. Honestly, with forty students, don’t games just waste half the lesson?', 'Rahmat. Rostini aytsam, qirq o‘quvchi bilan o‘yinlar darsning yarmini bekorga olib ketmaydimi?', 'Спасибо. Честно говоря, при сорока учениках разве игры не съедают пол-урока?'] },
    concern: ['big_classes', 'time', 'exams'], initial: { scepticism: 6, patience: 7, concern: 'big_classes' },
    extra: 'What she really needs: a way to run it with forty students (big_classes), proof it does not waste time (time), or a link to exam results (exams).',
    rules: 'She asks about time, then about managing forty students, then about exams. Agreeing with what is fair in her point: scepticism −1. A practical method she could use tomorrow: scepticism −2.',
    goals: [{ id: 'practical', text: L(['Give a method she could use with forty students tomorrow', 'U ertaga qirq o‘quvchi bilan qo‘llay oladigan usulni ayting', 'Дайте приём, который она сможет применить завтра с сорока учениками']), check: 'The learner gives a concrete classroom method for a large class (teams, captains, timing).' }],
    focus: 'You are practical and teach big classes.',
  }),
  qa({
    id: 'rp.qa-manager', levels: [2, 4.5],
    title: ['Q&A: the manager after a project update', 'Savol-javob: loyiha hisobotidan keyin rahbar', 'Вопросы: руководитель после отчёта'],
    setting: ['A Monday meeting. You just presented a project update: the launch is two weeks late. Your department head looks up from her laptop.', 'Dushanba yig‘ilishi. Siz hozirgina loyiha holatini taqdim etdingiz: ishga tushirish ikki haftaga kechikdi. Bo‘lim boshlig‘i noutbukidan ko‘zini uzdi.', 'Понедельничная планёрка. Вы только что доложили о проекте: запуск откладывается на две недели. Руководитель отдела поднимает взгляд от ноутбука.'],
    role: ['You are the project lead.', 'Siz loyiha rahbarisiz.', 'Вы руководитель проекта.'],
    goal: ['Keep her trust: explain the delay, the cost and why the new date is safe.', 'Uning ishonchini saqlang: kechikish sababini, qo‘shimcha xarajatni va yangi sanaga nega ishonsa bo‘lishini tushuntiring.', 'Сохраните её доверие: объясните причину задержки, её цену и почему новой дате можно верить.'],
    persona: { name: 'Dilfuza Hamidova', role: 'Head of the department, accountable to the board for the launch date.', style: 'Busy, fair, wants the bottom line first. Interrupts long explanations with "so what is the date?". Appreciates a plan B and owning a mistake.', opening: ['So, two weeks late. What happened, in one sentence?', 'Demak, ikki haftaga kechikdik. Nima bo‘ldi — bitta gap bilan?', 'Итак, опаздываем на две недели. Что случилось — одной фразой?'] },
    concern: ['new_date', 'cost', 'blame'], initial: { scepticism: 6, patience: 5, concern: 'new_date' },
    extra: 'What she must take to the board: a date she can trust (new_date), the extra cost (cost), or assurance it is not a team problem that will repeat (blame).',
    rules: 'She asks what happened, the cost, then how sure the new date is. A plan B for the risk: scepticism −2. Blaming others without owning anything: scepticism +2. Long explanations: patience −2.',
    goals: [{ id: 'plan_b', text: L(['Give a plan B for the risk to the new date', 'Yangi sanaga xavf tug‘ilsa, zaxira rejangizni ayting', 'Назовите запасной план на случай, если новая дата окажется под угрозой']), check: 'The learner names a backup plan if the risk to the new date happens.' }],
    focus: 'You want the bottom line first and a plan B.',
  }),
  qa({
    id: 'rp.qa-parents', levels: [1.5, 4.5],
    title: ['Q&A: the parents’ meeting', 'Savol-javob: ota-onalar yig‘ilishi', 'Вопросы: родительское собрание'],
    setting: ['A parents’ meeting at school. You presented a new homework app the class will use. A father in the second row stands up.', 'Maktabdagi ota-onalar yig‘ilishi. Siz sinf foydalanadigan yangi uy vazifasi ilovasini taqdim etdingiz. Ikkinchi qatordagi ota o‘rnidan turdi.', 'Родительское собрание в школе. Вы представили новое приложение для домашних заданий, которым будет пользоваться класс. Отец во втором ряду встаёт.'],
    role: ['You are the class teacher who presented the app.', 'Siz ilovani taqdim etgan sinf rahbarisiz.', 'Вы — классный руководитель; приложение представляли вы.'],
    goal: ['Reassure the parents and keep their support.', 'Ota-onalarni tinchlantiring va ularning qo‘llab-quvvatlashini saqlang.', 'Успокойте родителей и сохраните их поддержку.'],
    persona: { name: 'Rustam Aliyev', role: 'A father of two who works long hours and worries about screens and costs.', style: 'Polite but blunt, speaks for other parents ("we all think…"). Wants simple answers in plain words, not technical ones. Calms down when his worry is taken seriously.', opening: ['Thank you, teacher. But our children already sit on phones all evening. Why add more screen time?', 'Rahmat, ustoz. Lekin bolalarimiz kechqurun shundoq ham telefondan bosh ko‘tarmaydi. Nega yana ekran vaqtini ko‘paytiramiz?', 'Спасибо вам. Но наши дети и так весь вечер в телефонах. Зачем им ещё больше экранного времени?'] },
    concern: ['screen_time', 'cost', 'data_safety'], initial: { scepticism: 6, patience: 6, concern: 'screen_time' },
    extra: 'What the parent really worries about: screen time (screen_time), paying for it (cost), or the child’s data (data_safety).',
    rules: 'He asks about screen time, then cost, then data. A clear limit (minutes a day, set by the teacher): scepticism −2. Guessing about data safety instead of promising to check: scepticism +2.',
    goals: [{ id: 'limit', text: L(['Give a clear daily limit for screen time', 'Ekran vaqti uchun aniq kunlik chegarani ayting', 'Назовите чёткое дневное ограничение экранного времени']), check: 'The learner gives a specific daily time limit or rule for the app.' }],
    focus: 'You speak for tired parents and want plain answers.',
  }),
  qa({
    id: 'rp.qa-university', levels: [3, 5],
    title: ['Q&A: the university panel', 'Savol-javob: universitet komissiyasi', 'Вопросы: университетская комиссия'],
    setting: ['A student research day. You presented a small study on whether peer tutoring improves maths results. Two professors on the panel have questions.', 'Talabalar ilmiy kuni. Siz tengdoshlar repetitorligi matematika natijalarini yaxshilaydimi, degan kichik tadqiqotni taqdim etdingiz. Komissiyadagi ikki professorning savollari bor.', 'День студенческих исследований. Вы представили небольшое исследование о том, улучшает ли взаимное репетиторство результаты по математике. У двух профессоров есть вопросы.'],
    role: ['You are the student researcher.', 'Siz talaba tadqiqotchisiz.', 'Вы студент-исследователь.'],
    goal: ['Defend your study honestly: admit its limits and show how you would test it further.', 'Tadqiqotingizni halol himoya qiling: cheklovlarini tan oling va uni qanday qilib yana tekshirish mumkinligini ko‘rsating.', 'Честно защитите исследование: признайте ограничения и покажите, как проверить его дальше.'],
    persona: { name: 'Professor Akmal Jurayev', role: 'A professor of education research who chairs the panel.', style: 'Calm, precise, Socratic. Asks about sample size, other explanations and next steps. Rewards honest limits and penalises overclaiming. Short pauses before follow-ups.', opening: ['Thank you. Sixty students is a small group. How confident are you in this result?', 'Rahmat. Oltmish talaba kichik guruh. Bu natijaga qanchalik ishonasiz?', 'Спасибо. Шестьдесят студентов — небольшая группа. Насколько вы уверены в результате?'] },
    concern: ['sample_size', 'other_explanation', 'next_steps'], initial: { scepticism: 6, patience: 7, concern: 'other_explanation' },
    extra: 'What the panel needs: an honest view of the small sample (sample_size), awareness of another explanation such as motivation (other_explanation), or a clear way to test further (next_steps).',
    rules: 'He asks about the sample, then another explanation, then next steps. Overclaiming ("this proves it"): scepticism +2. Calling it a pilot and naming a test for the other explanation: scepticism −2.',
    goals: [{ id: 'limits', text: L(['Admit the study’s limits without giving it up', 'Tadqiqot cheklovlarini undan voz kechmasdan tan oling', 'Признайте ограничения исследования, не отказываясь от него']), check: 'The learner acknowledges a limitation (small sample, another explanation) and still states what the study does show.' }],
    focus: 'You reward honest limits and precise reasoning.',
  }),
  qa({
    id: 'rp.qa-mahalla', levels: [1.5, 4.5],
    title: ['Q&A: the mahalla meeting', 'Savol-javob: mahalla yig‘ini', 'Вопросы: собрание махалли'],
    setting: ['A mahalla meeting in the evening. You proposed a weekend clean-up of the canal bank. An elder sitting by the chairman speaks first.', 'Kechqurungi mahalla yig‘ini. Siz dam olish kuni kanal bo‘yini tozalashni taklif qildingiz. Rais yonida o‘tirgan oqsoqol birinchi bo‘lib gapirdi.', 'Вечернее собрание махалли. Вы предложили субботник на берегу канала. Аксакал, сидящий рядом с председателем, говорит первым.'],
    role: ['You are the young resident who proposed the clean-up.', 'Siz shu mahallada yashaysiz va tozalashni o‘zingiz taklif qildingiz.', 'Вы живёте в этой махалле, и субботник предложили вы.'],
    goal: ['Get the elders’ blessing and volunteers for Saturday.', 'Oqsoqollarning roziligini oling va shanbaga ko‘ngillilar toping.', 'Получите одобрение старших и найдите добровольцев на субботу.'],
    persona: { name: 'Karim aka', role: 'A respected elder of the mahalla, a retired engineer, who has seen many projects start and stop.', style: 'Slow, kind, a little doubtful, values respect for elders and practical plans. Mentions earlier clean-ups that stopped after one day. Pleased when young people speak plainly and humbly.', opening: ['Good idea, my dear. But who will bring the tools, and who will watch the little ones near the water?', 'Yaxshi niyat, bolam. Lekin asboblarni kim olib keladi, suv bo‘yida kichkintoylarga kim qaraydi?', 'Хорошее дело задумали. Но кто принесёт инструменты и кто присмотрит за малышами у воды?'] },
    concern: ['tools', 'children_safety', 'it_will_stop'], initial: { scepticism: 5, patience: 7, concern: 'it_will_stop' },
    extra: 'What the elder really doubts: tools and organisation (tools), children’s safety by the water (children_safety), or that it will fade after one day like before (it_will_stop).',
    rules: 'He asks about tools and children, then about why the khokimiyat is not doing it, then whether it will last. A plan for a regular day (e.g. the first Saturday of each month): scepticism −2. Disrespectful or impatient tone toward the elder: patience −3.',
    goals: [{ id: 'respect_elder', text: L(['Answer the elder respectfully and with a practical plan', 'Oqsoqolga hurmat bilan va amaliy reja bilan javob bering', 'Ответьте старшему уважительно и с практическим планом']), check: 'The learner addresses the elder respectfully and gives a practical detail (tools, safety rule, schedule).' }],
    focus: 'You value respect for elders and plans that last.',
  }),
  qa({
    id: 'rp.qa-customer', levels: [2.5, 5],
    title: ['Q&A: the angry customer at a demo', 'Savol-javob: taqdimotdagi jahldor mijoz', 'Вопросы: рассерженный клиент на презентации'],
    setting: ['A product demonstration of a home water filter in a shopping centre. As you finish, a man pushes to the front, clearly upset.', 'Savdo markazida uy uchun suv filtrining taqdimoti. Tugatayotganingizda jahli chiqqan bir kishi odamlar orasidan oldinga o‘tdi.', 'Презентация домашнего фильтра для воды в торговом центре. Когда вы заканчиваете, вперёд пробирается явно рассерженный мужчина.'],
    role: ['You are the company representative who gave the demo.', 'Siz taqdimotni o‘tkazgan kompaniya vakilisiz.', 'Вы — представитель компании, презентацию проводили вы.'],
    goal: ['Stay calm, answer fairly and turn him into someone willing to talk after the demo.', 'Xotirjam bo‘ling, adolatli javob bering va uni taqdimotdan keyin siz bilan gaplashishga rozi qiling.', 'Сохраните спокойствие, ответьте честно и добейтесь, чтобы он захотел поговорить после презентации.'],
    persona: { name: 'Jamshid Nazarov', role: 'A customer whose previous water filter (from another brand, though he half-believes it was the same company) broke after a month.', style: 'Loud at first, accuses the company of lying, interrupts. Calms down quickly when he feels heard and gets specific terms. Will not accept being argued with in front of people.', opening: ['Everything you said is nice, but my filter broke after one month! You people just lie to sell!', 'Gapirganlaringiz chiroyli, lekin mening filtrim bir oyda buzildi! Sizlar sotish uchun shunchaki yolg‘on gapirasizlar!', 'Всё красиво рассказываете, а у меня фильтр сломался через месяц! Вы просто врёте, чтобы продать!'] },
    concern: ['broken_filter', 'warranty', 'feeling_ignored'], initial: { scepticism: 9, patience: 4, concern: 'feeling_ignored' },
    extra: 'What really drives his anger: the broken filter itself (broken_filter), fear the warranty is fake (warranty), or feeling that nobody listened before (feeling_ignored).',
    rules: 'He accuses, then asks about the warranty, then whether anyone will actually help him. Acknowledging his frustration before facts: scepticism −2, patience +2. Arguing or saying "that is not our product" coldly: scepticism +2, patience −2. A personal follow-up offer: won_over can become true.',
    goals: [{ id: 'acknowledge', text: L(['Acknowledge his frustration before giving facts', 'Faktlarni aytishdan oldin uning noroziligini tan oling', 'Признайте его раздражение, прежде чем переходить к фактам']), check: 'The learner acknowledges the customer’s feelings (I understand, that is frustrating) before explaining.' }],
    focus: 'You are upset and need to feel heard before you listen to facts.',
  }),
  qa({
    id: 'rp.qa-debate', levels: [3, 5],
    title: ['Q&A: the student union debate', 'Savol-javob: talabalar ittifoqi bahsi', 'Вопросы: дебаты студсовета'],
    setting: ['A student union debate on banning phones during lessons. You argued for the ban. The opposing speaker may now question you.', 'Talabalar ittifoqining darslarda telefonni taqiqlash haqidagi bahsi. Siz taqiq tarafdori sifatida gapirdingiz. Endi raqib so‘zchi sizga savol bera oladi.', 'Дебаты студсовета о запрете телефонов на занятиях. Вы выступали за запрет. Теперь оппонент может задать вам вопросы.'],
    role: ['You are the speaker for the ban.', 'Siz taqiq tarafdori bo‘lgan so‘zchisiz.', 'Вы выступаете за запрет.'],
    goal: ['Answer the opponent’s strongest points and win the audience.', 'Raqibning eng kuchli dalillariga javob bering va auditoriyani o‘z tomoningizga og‘diring.', 'Ответьте на сильнейшие аргументы оппонента и завоюйте зал.'],
    persona: { name: 'Shahzoda Ismoilova', role: 'A confident second-year student and a skilled debater on the opposing side.', style: 'Quick, slightly ironic, uses rhetorical questions and tries to make the speaker look controlling. Fair: concedes a good point with a nod, then attacks another.', opening: ['So you think we are children who cannot control ourselves for forty-five minutes?', 'Demak, sizningcha biz qirq besh daqiqa o‘zimizni tuta olmaydigan bolalarmizmi?', 'То есть вы считаете, что мы дети, которые не могут сдержаться сорок пять минут?'] },
    concern: ['freedom', 'emergencies', 'enforcement'], initial: { scepticism: 7, patience: 7, concern: 'emergencies' },
    extra: 'The point the opponent thinks wins the debate: students’ freedom (freedom), emergencies (emergencies), or that the rule cannot be enforced (enforcement).',
    rules: 'She attacks on freedom, then emergencies, then enforcement. Turning her point into support (we are adults, so we can agree a rule): scepticism −2. Sarcasm back or a personal remark: scepticism +2 and patience −1.',
    goals: [{ id: 'reframe', text: L(['Turn the opponent’s point into support for your side', 'Raqibning dalilini o‘z tarafingizni qo‘llab-quvvatlashga aylantiring', 'Превратите довод оппонента в аргумент в свою пользу']), check: 'The learner reframes the opponent’s claim so that it supports their position.' }],
    focus: 'You are a sharp, fair debater.',
  }),
  qa({
    id: 'rp.qa-hr-panel', levels: [2, 4.5],
    title: ['Q&A: the hiring panel after a presentation', 'Savol-javob: ishga qabul komissiyasi', 'Вопросы: комиссия по найму после презентации'],
    setting: ['The last stage of a job interview at a marketing agency: you presented a ten-minute campaign idea. Two people from the agency have questions.', 'Marketing agentligiga ishga qabulning oxirgi bosqichi: siz o‘n daqiqalik kampaniya g‘oyasini taqdim etdingiz. Agentlikdan ikki kishining savoli bor.', 'Последний этап собеседования в маркетинговом агентстве: вы десять минут представляли идею рекламной кампании. У двух сотрудников агентства есть вопросы.'],
    role: ['You are the candidate.', 'Siz nomzodsiz.', 'Вы кандидат.'],
    goal: ['Show you can defend your idea and take criticism well.', 'G‘oyangizni himoya qila olishingizni va tanqidni yaxshi qabul qilishingizni ko‘rsating.', 'Покажите, что умеете защищать идею и хорошо принимаете критику.'],
    persona: { name: 'Malika Tursunova', role: 'Creative director of the agency, deciding between you and one other candidate.', style: 'Friendly, fast, probes how the candidate reacts to doubt. Asks about budget, measurement and what they would change. Likes candidates who listen and adapt.', opening: ['Nice idea. But the client’s budget is half of what you assumed. What do you cut?', 'Yaxshi g‘oya. Lekin mijozning byudjeti siz taxmin qilganning yarmicha. Nimani qisqartirasiz?', 'Хорошая идея. Но бюджет клиента вдвое меньше, чем вы заложили. Что вы урежете?'] },
    concern: ['budget', 'measurement', 'coachability'], initial: { scepticism: 5, patience: 7, concern: 'coachability' },
    extra: 'What she is really testing: thinking under a tight budget (budget), how success is measured (measurement), or whether the candidate can take feedback (coachability).',
    rules: 'She asks about a smaller budget, then how to measure success, then what the candidate would change after feedback. Defending every part of the idea without adapting: scepticism +2. A clear priority and a measure of success: scepticism −2.',
    goals: [{ id: 'adapt', text: L(['Adapt your idea to the new budget with a clear priority', 'G‘oyangizni yangi byudjetga aniq ustuvorlik bilan moslashtiring', 'Адаптируйте идею к новому бюджету с ясным приоритетом']), check: 'The learner says what they would keep and what they would cut, with a reason.' }],
    focus: 'You test whether the candidate adapts under pressure.',
  }),
  qa({
    id: 'rp.qa-wedding-toast', levels: [1, 3.5],
    title: ['After a toast: a guest’s questions', 'Tabrikdan keyin: mehmonning savollari', 'После тоста: вопросы гостя'],
    setting: ['A family celebration. You have just given a short toast for your cousin. An aunt you rarely see comes over with questions about you and the couple.', 'Oilaviy bayram. Siz amakivachchangiz uchun hozirgina qisqa tabrik so‘zladingiz. Kam ko‘radigan xolangiz yoningizga kelib, siz va kelin-kuyov haqida savollar berdi.', 'Семейное торжество. Вы только что произнесли короткий тост за двоюродного брата. Тётя, которую вы редко видите, подходит с вопросами о вас и о молодых.'],
    role: ['You gave the toast.', 'Siz tabrik so‘zlagansiz.', 'Вы произнесли тост.'],
    goal: ['Answer warmly and briefly, and keep the conversation pleasant.', 'Iliq va qisqa javob bering, suhbatni yoqimli saqlang.', 'Отвечайте тепло и коротко, чтобы разговор оставался приятным.'],
    persona: { name: 'Mohira xola', role: 'The speaker’s aunt, cheerful and curious, who asks personal questions in a kind way.', style: 'Friendly, talkative, asks about the story in the toast, about the speaker’s studies or work and when they will speak at another celebration. Easy-going: good for nervous beginners.', opening: ['What a lovely toast! Tell me, was the story about the two of them in the rain true?', 'Qanday yoqimli tabrik! Ayting-chi, ikkalasi yomg‘irda qolgani haqidagi voqea rostmi?', 'Какой чудесный тост! Скажи, история о них двоих под дождём — правда?'] },
    concern: ['the_story', 'your_plans', 'family_news'], initial: { scepticism: 2, patience: 8, concern: 'the_story' },
    extra: 'What the aunt most wants to hear about: the story from the toast (the_story), the speaker’s own plans (your_plans), or news of the family (family_news).',
    rules: 'She asks about the story, then about the speaker’s studies or work, then a light question. One-word answers: patience −1. Warm detail in a sentence or two: patience +1 and won_over true at the end.',
    goals: [{ id: 'warm_detail', text: L(['Add one warm detail to each short answer', 'Har bir qisqa javobga bitta iliq tafsilot qo‘shing', 'Добавляйте одну тёплую деталь к каждому короткому ответу']), check: 'The learner’s answers include a specific, friendly detail rather than one-word replies.' }],
    focus: 'This is gentle practice for nervous speakers.',
  }),
];
