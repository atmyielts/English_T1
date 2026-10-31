import type { ProctorPolicy } from '../../../../../packages/assessment-core/src/mod.ts';
import type { L } from './text.ts';

// E12 Skill Certificates: paid, proctored exams per coach level, verifiable by QR.
// An exam is a set of auto-marked items with checked keys plus speaking or
// writing tasks that a trained reviewer marks against the rubric, the same human
// review that Proctor Lite uses for integrity. No model marks a certificate, so a
// sitting is never charged credits on top of its price. The browser runs Proctor
// Lite's own client (packages/proctor-web: runtime, journal and browser signals)
// against the engage routes, under the policy below.

export interface CertItem { id: string; prompt: string; options: { id: string; text: string }[]; answer: string }
export interface CertTask { id: string; kind: 'speaking' | 'writing'; prompt: string; prepSeconds?: number; speakSeconds?: number; minWords?: number; maxWords?: number }
export interface RubricCriterion { id: string; title: L; max: number }
export interface CertExam {
  key: string;
  title: L;
  lead: L;
  /** What the certificate states, for example `B1` or `Level 1`. */
  level: string;
  coach: string;
  minutes: number;
  items: CertItem[];
  tasks: CertTask[];
  rubric: RubricCriterion[];
  pass: { itemsRatio: number; rubricRatio: number; minEach: number };
  policy: ProctorPolicy;
}

const item = (id: string, prompt: string, options: [string, string][], answer: string): CertItem => ({ id, prompt, options: options.map(([optionId, text]) => ({ id: optionId, text })), answer });

/** Proctor Lite for a certificate: browser signals and human review, no camera stills. */
const policy = (microphone: boolean): ProctorPolicy => ({
  schema_version: 'proctor.policy.v1', mode: 'browser', identity_level: 1, camera: false, microphone, screen: false, second_camera: false,
  recording_retention_days: 90, identity_retention_days: 30, auto_pause: false, recovery_seconds: 10, reviewer_quorum: 1, snapshot_interval_seconds: 0,
});

const SPEAKING_RUBRIC: RubricCriterion[] = [
  { id: 'fluency', title: { en: 'Fluency and coherence', uz: 'Ravonlik va izchillik', ru: 'Беглость и связность' }, max: 5 },
  { id: 'vocabulary', title: { en: 'Range of vocabulary', uz: 'Lug‘at boyligi', ru: 'Словарный запас' }, max: 5 },
  { id: 'grammar', title: { en: 'Grammar range and accuracy', uz: 'Grammatik xilma-xillik va aniqlik', ru: 'Грамматика: разнообразие и точность' }, max: 5 },
  { id: 'pronunciation', title: { en: 'Pronunciation', uz: 'Talaffuz', ru: 'Произношение' }, max: 5 },
];
const SALES_RUBRIC: RubricCriterion[] = [
  { id: 'listening', title: { en: 'Empathy and listening', uz: 'Hamdardlik va tinglash', ru: 'Эмпатия и слушание' }, max: 4 },
  { id: 'discovery', title: { en: 'Discovery questions', uz: 'Ehtiyojni aniqlovchi savollar', ru: 'Вопросы для выявления потребностей' }, max: 4 },
  { id: 'value', title: { en: 'Value in the customer’s terms', uz: 'Mijoz nuqtai nazaridan foyda', ru: 'Ценность на языке клиента' }, max: 4 },
  { id: 'objection', title: { en: 'Objection handling', uz: 'E’tirozlar bilan ishlash', ru: 'Работа с возражениями' }, max: 4 },
  { id: 'next_step', title: { en: 'A concrete next step', uz: 'Aniq keyingi qadam', ru: 'Конкретный следующий шаг' }, max: 4 },
];

export const CERT_EXAMS: CertExam[] = [
  {
    key: 'speaking_b1', level: 'B1', coach: 'B2', minutes: 30,
    title: { en: 'English Speaking B1', uz: 'Ingliz tili nutqi B1', ru: 'Разговорный английский B1' },
    lead: { en: 'Ten everyday-communication questions and three recorded speaking tasks that a trained reviewer marks. A Schood certificate, not an official exam result.', uz: 'Kundalik muloqot bo‘yicha o‘nta savol va uchta yozib olinadigan nutq vazifasi; vazifalarni tayyorlangan tekshiruvchi baholaydi. Bu Schood sertifikati, rasmiy imtihon natijasi emas.', ru: 'Десять вопросов на повседневное общение и три записанных устных задания, которые оценивает подготовленный проверяющий. Это сертификат Schood, а не результат официального экзамена.' },
    items: [
      item('i1', 'Your friend says: "I failed my driving test again." What is the best reply?', [['a', 'Congratulations!'], ['b', 'Oh no, I’m sorry. You’ll pass next time.'], ['c', 'I failed mine too, in 2019.'], ['d', 'Driving is boring.']], 'b'),
      item('i2', 'In a café you did not get what you ordered. Which is the most polite thing to say?', [['a', 'This is wrong. Take it.'], ['b', 'Excuse me, I think I ordered tea, not coffee.'], ['c', 'Why are you so slow?'], ['d', 'Give me tea.']], 'b'),
      item('i3', 'Someone asks: "Would you mind opening the window?" You agree. You say:', [['a', 'Yes, I would.'], ['b', 'Not at all.'], ['c', 'No, I don’t open.'], ['d', 'I mind it.']], 'b'),
      item('i4', 'You did not understand what your colleague said. You say:', [['a', 'What?'], ['b', 'Sorry, could you say that again more slowly?'], ['c', 'You speak badly.'], ['d', 'I understand.']], 'b'),
      item('i5', 'Which sentence gives an opinion with a reason?', [['a', 'I like Tashkent.'], ['b', 'Tashkent is in Uzbekistan.'], ['c', 'I prefer living in Tashkent because there is more work.'], ['d', 'Do you like Tashkent?']], 'c'),
      item('i6', 'You want to suggest a plan to friends. Which is best?', [['a', 'How about going to the cinema on Saturday?'], ['b', 'You go to the cinema.'], ['c', 'Cinema is on Saturday.'], ['d', 'I went to the cinema.']], 'a'),
      item('i7', 'Complete: "I’ve lived here ___ 2019."', [['a', 'for'], ['b', 'since'], ['c', 'from'], ['d', 'at']], 'b'),
      item('i8', 'To keep talking while you think, the most natural phrase is:', [['a', 'Let me think... well,'], ['b', 'Stop.'], ['c', 'I don’t know anything.'], ['d', 'Next question.']], 'a'),
      item('i9', 'Which question is correct?', [['a', 'Where you work?'], ['b', 'Where do you work?'], ['c', 'Where does you work?'], ['d', 'Where working you?']], 'b'),
      item('i10', 'A friend invites you to a party, but you can’t go. The best reply:', [['a', 'No.'], ['b', 'I’d love to, but I’m working that evening. Maybe next time?'], ['c', 'Parties are bad.'], ['d', 'Why?']], 'b'),
    ],
    tasks: [
      { id: 't1', kind: 'speaking', prompt: 'Talk about your hometown: where it is, what people do there and what you like about it.', prepSeconds: 30, speakSeconds: 60 },
      { id: 't2', kind: 'speaking', prompt: 'Describe a time you helped someone. What happened, and how did you feel?', prepSeconds: 60, speakSeconds: 90 },
      { id: 't3', kind: 'speaking', prompt: 'Some people prefer to study alone; others prefer to study in groups. Which do you prefer, and why?', prepSeconds: 30, speakSeconds: 60 },
    ],
    rubric: SPEAKING_RUBRIC, pass: { itemsRatio: 0.7, rubricRatio: 0.6, minEach: 2 }, policy: policy(true),
  },
  {
    key: 'speaking_b2', level: 'B2', coach: 'B2', minutes: 35,
    title: { en: 'English Speaking B2', uz: 'Ingliz tili nutqi B2', ru: 'Разговорный английский B2' },
    lead: { en: 'Ten questions on discussion language and three longer recorded speaking tasks that a trained reviewer marks. A Schood certificate, not an official exam result.', uz: 'Muhokama tili bo‘yicha o‘nta savol va uchta uzunroq, yozib olinadigan nutq vazifasi; vazifalarni tayyorlangan tekshiruvchi baholaydi. Bu Schood sertifikati, rasmiy imtihon natijasi emas.', ru: 'Десять вопросов о языке дискуссии и три более длинных записанных устных задания, которые оценивает подготовленный проверяющий. Это сертификат Schood, а не результат официального экзамена.' },
    items: [
      item('i1', 'Which response best softens disagreement in a meeting?', [['a', 'You’re wrong.'], ['b', 'I see your point, but I’m not sure that would work in our case.'], ['c', 'No way.'], ['d', 'That’s a silly idea.']], 'b'),
      item('i2', 'Complete: "I wish I ___ more time to travel."', [['a', 'have'], ['b', 'had'], ['c', 'will have'], ['d', 'having']], 'b'),
      item('i3', 'Which phrase best introduces a contrasting idea in a spoken argument?', [['a', 'On the other hand,'], ['b', 'For example,'], ['c', 'In addition,'], ['d', 'As a result,']], 'a'),
      item('i4', 'A colleague asks: "How’s the project going?" The most natural and informative answer:', [['a', 'Fine.'], ['b', 'It’s going well overall, although we’re a bit behind on testing.'], ['c', 'Project.'], ['d', 'I don’t care.']], 'b'),
      item('i5', 'Choose the most polite way to interrupt:', [['a', 'Stop talking.'], ['b', 'Sorry to interrupt, but could I just add something?'], ['c', 'Me now.'], ['d', 'Listen to me!']], 'b'),
      item('i6', 'Complete: "If I had known about the traffic, I ___ earlier."', [['a', 'would leave'], ['b', 'would have left'], ['c', 'will leave'], ['d', 'left']], 'b'),
      item('i7', 'Which sentence uses an idiom correctly?', [['a', 'The exam was a piece of cake, so I finished early.'], ['b', 'I ate a piece of cake for the exam to be hard.'], ['c', 'Piece of cake was the exam difficult.'], ['d', 'The cake was a piece of exam.']], 'a'),
      item('i8', 'When you speculate about the future in a discussion, the most natural phrase is:', [['a', 'It’s quite likely that...'], ['b', 'It is fact that...'], ['c', 'Definitely always...'], ['d', 'Never possibly...']], 'a'),
      item('i9', 'Which is the best paraphrase of "The cost of living has risen sharply"?', [['a', 'Things are cheaper now.'], ['b', 'Prices have gone up a lot.'], ['c', 'Living is a cost.'], ['d', 'The rise is cost.']], 'b'),
      item('i10', 'Your listener looks confused. The best strategy is to:', [['a', 'repeat the same sentence louder'], ['b', 'say "Let me put that another way" and rephrase'], ['c', 'change the topic'], ['d', 'stop speaking']], 'b'),
    ],
    tasks: [
      { id: 't1', kind: 'speaking', prompt: 'Describe a decision that changed your life. Explain why you made it and whether you would make it again.', prepSeconds: 60, speakSeconds: 120 },
      { id: 't2', kind: 'speaking', prompt: 'Some people say technology makes us less sociable. To what extent do you agree?', prepSeconds: 30, speakSeconds: 90 },
      { id: 't3', kind: 'speaking', prompt: 'If you could change one thing about education in your country, what would it be, and why?', prepSeconds: 30, speakSeconds: 90 },
    ],
    rubric: SPEAKING_RUBRIC, pass: { itemsRatio: 0.7, rubricRatio: 0.6, minEach: 3 }, policy: policy(true),
  },
  {
    key: 'sales_l1', level: 'Level 1', coach: 'B4', minutes: 30,
    title: { en: 'Sales Level 1', uz: 'Savdo, 1-daraja', ru: 'Продажи, уровень 1' },
    lead: { en: 'Ten call scenarios and one written reply to a price objection that a trained reviewer marks. A Schood certificate, not an official qualification.', uz: 'O‘nta qo‘ng‘iroq vaziyati va narx e’tiroziga bitta yozma javob; javobni tayyorlangan tekshiruvchi baholaydi. Bu Schood sertifikati, rasmiy malaka hujjati emas.', ru: 'Десять сценариев звонков и один письменный ответ на возражение о цене, который оценивает подготовленный проверяющий. Это сертификат Schood, а не официальная квалификация.' },
    items: [
      item('i1', 'A shop owner answers your cold call. What should the first fifteen seconds include?', [['a', 'Every feature of your product'], ['b', 'Who you are, why you are calling, and a question'], ['c', 'Your price'], ['d', 'A request for a meeting with no reason']], 'b'),
      item('i2', 'In discovery, which question is the most useful?', [['a', 'Do you want to buy our app?'], ['b', 'What happens in your shop at the busiest hour?'], ['c', 'Is our app good?'], ['d', 'Can I send a brochure?']], 'b'),
      item('i3', 'The customer says: "It’s too expensive." The best first response is to:', [['a', 'offer a discount immediately'], ['b', 'agree it is a real cost, then ask what the current problem costs them'], ['c', 'say the price is fair and move on'], ['d', 'end the call']], 'b'),
      item('i4', 'The customer says: "I’ll think about it." The best response is:', [['a', '"OK, bye."'], ['b', '"Of course. What would you like to think about: the price, the timing or something else?"'], ['c', '"If you buy today, I’ll give you half price."'], ['d', '"You won’t find better."']], 'b'),
      item('i5', 'A competitor is cheaper. What should you do?', [['a', 'Criticise the competitor'], ['b', 'Ask questions that show what matters to the customer, such as support speed'], ['c', 'Drop your price below theirs'], ['d', 'Ignore it']], 'b'),
      item('i6', 'Which is a clear next step at the end of a call?', [['a', '"Let’s keep in touch."'], ['b', '"I’ll call sometime."'], ['c', '"Shall we do a 20-minute demo in your shop on Thursday at four?"'], ['d', '"Think about it."']], 'c'),
      item('i7', 'What is a "gatekeeper"?', [['a', 'The decision-maker'], ['b', 'A person who controls access to the decision-maker'], ['c', 'A competitor'], ['d', 'Only a security guard']], 'b'),
      item('i8', 'In a discovery call, the talk ratio should usually be:', [['a', 'you talking most of the time'], ['b', 'the customer talking more than you'], ['c', 'mostly silence'], ['d', 'whatever the script says']], 'b'),
      item('i9', 'A customer asks a technical question you cannot answer. The best response is to:', [['a', 'guess confidently'], ['b', 'say you don’t know and promise a written answer by a specific time'], ['c', 'change the subject'], ['d', 'say it isn’t important']], 'b'),
      item('i10', 'Why offer a free trial at the demo rather than in the first call?', [['a', 'It is cheaper.'], ['b', 'In the first call it can sound desperate; at the demo it sounds like confidence.'], ['c', 'Trials are not allowed on calls.'], ['d', 'The customer will not hear it.']], 'b'),
    ],
    tasks: [
      { id: 't1', kind: 'writing', prompt: 'A café owner writes to you on Telegram: "Your app is too expensive. Another company is half the price." Write your reply. Keep the conversation going and aim for a concrete next step.', minWords: 80, maxWords: 150 },
    ],
    rubric: SALES_RUBRIC, pass: { itemsRatio: 0.7, rubricRatio: 0.6, minEach: 1 }, policy: policy(false),
  },
  {
    key: 'sales_l2', level: 'Level 2', coach: 'B4', minutes: 35,
    title: { en: 'Sales Level 2', uz: 'Savdo, 2-daraja', ru: 'Продажи, уровень 2' },
    lead: { en: 'Ten negotiation and account scenarios and one written negotiation reply that a trained reviewer marks. A Schood certificate, not an official qualification.', uz: 'O‘nta muzokara va mijoz bilan ishlash vaziyati hamda muzokaradagi bitta yozma javob; javobni tayyorlangan tekshiruvchi baholaydi. Bu Schood sertifikati, rasmiy malaka hujjati emas.', ru: 'Десять сценариев переговоров и работы с клиентами и один письменный ответ в переговорах, который оценивает подготовленный проверяющий. Это сертификат Schood, а не официальная квалификация.' },
    items: [
      item('i1', 'The customer asks for a 20% discount. The strongest response:', [['a', 'Accept, to close quickly'], ['b', '"We can look at that if you can commit to a 12-month contract."'], ['c', 'Refuse and end the meeting'], ['d', 'Offer 30% instead']], 'b'),
      item('i2', 'Which is a value-based pitch?', [['a', '"Our app has 40 features."'], ['b', '"You said the queue loses about twenty customers a day; this lets one person serve them twice as fast."'], ['c', '"We are number one."'], ['d', '"Everyone uses us."']], 'b'),
      item('i3', 'A deal has four decision-makers. The best approach is to:', [['a', 'talk only to the most senior one'], ['b', 'understand each person’s concern and how they will judge success'], ['c', 'send one email to all four'], ['d', 'wait for them to decide']], 'b'),
      item('i4', 'In negotiation, BATNA means:', [['a', 'the best alternative to a negotiated agreement'], ['b', 'the final price'], ['c', 'the basic agreement terms'], ['d', 'a type of discount']], 'a'),
      item('i5', 'A very happy customer is the best moment to:', [['a', 'raise the price'], ['b', 'ask for a referral or an introduction'], ['c', 'stop contacting them'], ['d', 'offer a new discount']], 'b'),
      item('i6', 'You lost a deal to a competitor. The most useful action is to:', [['a', 'argue with the customer'], ['b', 'ask honestly what made the difference and record it'], ['c', 'offer a bigger discount after they have signed'], ['d', 'never contact them again']], 'b'),
      item('i7', 'A pilot with a supermarket chain should have:', [['a', 'no end date'], ['b', 'clear success criteria agreed before it starts'], ['c', 'free access forever'], ['d', 'only one user']], 'b'),
      item('i8', '"Anchoring" in a negotiation means:', [['a', 'setting the first reference point that shapes the discussion'], ['b', 'refusing to move at all'], ['c', 'ending the talks'], ['d', 'agreeing to everything']], 'a'),
      item('i9', 'In a Telegram or Instagram DM, a good sales message:', [['a', 'is long and lists every feature'], ['b', 'is short and specific and ends with one question'], ['c', 'contains many links'], ['d', 'repeats the price']], 'b'),
      item('i10', 'The customer says: "Send me some information." The best reply:', [['a', 'Send a brochure and wait'], ['b', '"Happy to. So I send the right thing, what matters most to you right now?"'], ['c', '"No."'], ['d', 'Call back in a year']], 'b'),
    ],
    tasks: [
      { id: 't1', kind: 'writing', prompt: 'A supermarket chain manager writes: "We would consider a pilot in one store, but only if you cut the price by 30% for the whole first year." Write your reply: protect the value, trade rather than give, and propose a concrete pilot with success criteria.', minWords: 120, maxWords: 200 },
    ],
    rubric: SALES_RUBRIC, pass: { itemsRatio: 0.7, rubricRatio: 0.6, minEach: 2 }, policy: policy(false),
  },
];
export const examByKey = (key: string) => CERT_EXAMS.find((exam) => exam.key === key) ?? null;

export function examProblems(): string[] {
  const problems: string[] = [];
  for (const exam of CERT_EXAMS) {
    const ids = new Set<string>();
    if (exam.items.length < 8) problems.push(`${exam.key}: too few items`);
    for (const entry of exam.items) {
      if (ids.has(entry.id)) problems.push(`${exam.key}/${entry.id}: twice`);
      ids.add(entry.id);
      const keys = entry.options.filter((option) => option.id === entry.answer);
      if (keys.length !== 1) problems.push(`${exam.key}/${entry.id}: needs exactly one key in the options`);
      if (new Set(entry.options.map((option) => option.text)).size !== entry.options.length) problems.push(`${exam.key}/${entry.id}: duplicate option`);
    }
    if (!exam.tasks.length) problems.push(`${exam.key}: no task for the reviewer`);
    if (!exam.rubric.every((criterion) => exam.pass.minEach <= criterion.max)) problems.push(`${exam.key}: pass floor above a criterion max`);
  }
  return problems;
}
