// The free public level check at /check: 15 original workplace questions in the style
// of the real test (ladder from A2 up, a notice and an email to read, a voicemail to
// hear). Questions are English for every visitor; the keys stay on the server, and
// scoring is stateless, so nothing about a person is kept unless they send the form.
import { LEVEL_LABEL, overallScore, scoreToLevel, type Level, type Skill } from '../../../../packages/company-core/src/mod.ts';
import { CompanyError } from '../types.ts';

export type CheckSkill = Extract<Skill, 'grammar' | 'vocabulary' | 'reading' | 'listening'>;
type Band = Extract<Level, 'a2' | 'b1' | 'b2' | 'c1'>;
interface CheckItem { id: string; skill: CheckSkill; level: Band; passage?: string; prompt: string; options: string[]; answer: number }
export interface CheckPassage { id: string; kind: 'notice' | 'email' | 'voicemail'; title: string; lines: { speaker: string; text: string }[] }

export const CHECK_SKILLS: readonly CheckSkill[] = ['grammar', 'vocabulary', 'reading', 'listening'];
/** Plays a listening script at most this many times, like the real test. */
export const CHECK_REPLAYS = 2;
export const CHECK_MINUTES = 8;

const PASSAGES: CheckPassage[] = [
  { id: 'notice', kind: 'notice', title: 'Staff notice', lines: [{ speaker: '', text: 'From Monday the staff car park will be closed for repairs for two weeks. Please use the car park behind the warehouse; your pass works there too. The gate closes at 9:30. If you arrive later, call security on the number printed on your pass and they will open it for you.' }] },
  { id: 'email', kind: 'email', title: 'Email from a supplier', lines: [{ speaker: '', text: 'Dear Ms Karimova, further to our call on Tuesday, I can confirm that we will deliver the remaining 400 units by the end of the month, provided that your deposit reaches us by the 12th. Should it arrive later, we cannot promise this date, as next month’s production schedule is almost full. I would also suggest splitting the order into two shipments. That would lower your storage costs, although transport would be slightly more expensive. Kind regards, Daniel Weber' }] },
  { id: 'voicemail', kind: 'voicemail', title: 'Voicemail', lines: [{ speaker: 'Caller', text: 'Hello, this is Rustam from the freight desk, with a message for Nodira. It is about the shipment that was due on Wednesday. It is now stuck at the border because one customs form has the wrong weight on it. I have sent you a corrected form by email. Could you sign it and send it back before three o’clock today? If we get it by then, the truck should still arrive on Friday morning. If not, it will probably be next Tuesday. Thanks, and call me if anything looks wrong.' }] },
];

const ITEMS: CheckItem[] = [
  { id: 'g1', skill: 'grammar', level: 'a2', prompt: 'Our office ___ at nine o’clock every morning.', options: ['open', 'opens', 'opening', 'is open to'], answer: 1 },
  { id: 'g2', skill: 'grammar', level: 'b1', prompt: 'I ___ the report to the client yesterday, so they should have it now.', options: ['send', 'have sent', 'sent', 'am sending'], answer: 2 },
  { id: 'g3', skill: 'grammar', level: 'b2', prompt: 'If the supplier had confirmed the order earlier, we ___ the delay.', options: ['would avoid', 'will avoid', 'had avoided', 'would have avoided'], answer: 3 },
  { id: 'g4', skill: 'grammar', level: 'c1', prompt: 'Not only ___ the deadline, but they also went over budget.', options: ['they missed', 'did they miss', 'they did miss', 'had missed they'], answer: 1 },
  { id: 'v1', skill: 'vocabulary', level: 'a2', prompt: 'Please write your name on this ___ and give it to the receptionist.', options: ['form', 'shelf', 'route', 'screen'], answer: 0 },
  { id: 'v2', skill: 'vocabulary', level: 'b1', prompt: 'The meeting has been ___ until Thursday because the manager is ill.', options: ['put on', 'put off', 'put up', 'put in'], answer: 1 },
  { id: 'v3', skill: 'vocabulary', level: 'b2', prompt: 'We need to ___ the risks carefully before we sign the contract.', options: ['assist', 'assume', 'assess', 'assign'], answer: 2 },
  { id: 'v4', skill: 'vocabulary', level: 'c1', prompt: 'The new policy was introduced to ___ the impact of rising fuel costs.', options: ['mitigate', 'reiterate', 'stipulate', 'exacerbate'], answer: 0 },
  { id: 'r1', skill: 'reading', level: 'a2', passage: 'notice', prompt: 'How long will the staff car park be closed?', options: ['Until Monday', 'For two weeks', 'Until 9:30', 'For two days'], answer: 1 },
  { id: 'r2', skill: 'reading', level: 'b1', passage: 'notice', prompt: 'You arrive at 10:00 and the gate is closed. What should you do?', options: ['Park at the main entrance', 'Show your pass to the warehouse', 'Phone security', 'Wait until the repairs end'], answer: 2 },
  { id: 'r3', skill: 'reading', level: 'b2', passage: 'email', prompt: 'What must happen for the units to arrive by the end of the month?', options: ['Ms Karimova must call on Tuesday', 'The deposit must arrive by the 12th', 'The order must be split in two', 'The factory must finish next month’s orders'], answer: 1 },
  { id: 'r4', skill: 'reading', level: 'c1', passage: 'email', prompt: 'How does the writer present the idea of two shipments?', options: ['As a condition of delivery', 'As a way to save on transport', 'As an option with a cost and a benefit', 'As a change already decided'], answer: 2 },
  { id: 'l1', skill: 'listening', level: 'a2', passage: 'voicemail', prompt: 'Who is the message for?', options: ['Rustam', 'Nodira', 'The driver', 'The customs officer'], answer: 1 },
  { id: 'l2', skill: 'listening', level: 'b1', passage: 'voicemail', prompt: 'Why is the shipment stuck at the border?', options: ['The truck has broken down', 'The weight on a form is wrong', 'The fee has not been paid', 'The border closes on Wednesday'], answer: 1 },
  { id: 'l3', skill: 'listening', level: 'b2', passage: 'voicemail', prompt: 'What will probably happen if the form comes back after three o’clock?', options: ['The truck will arrive on Friday morning', 'Rustam will sign the form himself', 'The truck will arrive next Tuesday', 'The shipment will go back to the sender'], answer: 2 },
];

/**
 * Points by level, so climbing the ladder lands on the same floors as the real score
 * scale (LEVEL_FLOORS): an A2 question alone reaches A2, adding B1 reaches B1, and so
 * on up to C1. A short check cannot show C2, so the top is 85.
 */
const POINTS: Record<Band, number> = { a2: 32, b1: 16, b2: 17, c1: 20 };

export const checkItems = (): readonly CheckItem[] => ITEMS;
export const checkPassages = (): readonly CheckPassage[] => PASSAGES;

/** What the page shows: questions without keys. */
export function publicCheck() {
  return {
    minutes: CHECK_MINUTES,
    replays: CHECK_REPLAYS,
    skills: CHECK_SKILLS,
    passages: PASSAGES,
    items: ITEMS.map(({ answer: _answer, ...item }) => item),
  };
}

export interface CheckResult {
  estimate: true;
  answered: number;
  total: number;
  overall: { score: number; level: Level; label: string };
  skills: Record<CheckSkill, { score: number; level: Level; label: string; correct: number; total: number }>;
  review: { id: string; correct: boolean; answer: number }[];
}

/** Reads `{ itemId: optionIndex }`; an unknown question or option is the client's bug, not a wrong answer. */
export function readAnswers(value: unknown): Map<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CompanyError('invalid_field', 'answers must be an object.', 400, { field: 'answers' });
  const out = new Map<string, number>();
  for (const [id, chosen] of Object.entries(value as Record<string, unknown>)) {
    const item = ITEMS.find((candidate) => candidate.id === id);
    if (!item || !Number.isInteger(chosen) || (chosen as number) < 0 || (chosen as number) >= item.options.length) throw new CompanyError('invalid_field', 'answers has an unknown question or option.', 400, { field: 'answers' });
    out.set(id, chosen as number);
  }
  return out;
}

export function scoreCheck(answers: Map<string, number>): CheckResult {
  const skills = {} as CheckResult['skills'];
  const scores: Partial<Record<Skill, number>> = {};
  for (const skill of CHECK_SKILLS) {
    const items = ITEMS.filter((item) => item.skill === skill);
    let points = 0, correct = 0;
    for (const item of items) {
      if (answers.get(item.id) !== item.answer) continue;
      correct++;
      points += POINTS[item.level] / items.filter((other) => other.level === item.level).length;
    }
    const score = Math.round(points);
    const level = scoreToLevel(score);
    scores[skill] = score;
    skills[skill] = { score, level, label: LEVEL_LABEL[level], correct, total: items.length };
  }
  const score = overallScore(scores) ?? 0;
  const level = scoreToLevel(score);
  return {
    estimate: true,
    answered: answers.size,
    total: ITEMS.length,
    overall: { score, level, label: LEVEL_LABEL[level] },
    skills,
    review: ITEMS.map((item) => ({ id: item.id, correct: answers.get(item.id) === item.answer, answer: item.answer })),
  };
}
