import type { Rubric } from '../src/types.ts';
import { callCalibration } from './calibration-call.ts';
import { messageCalibration } from './calibration-message.ts';
import { SALES_SCALE } from './manifest.ts';

// Two rubrics, both on the sales level scale (L1–L5 in half steps):
//   sales.call     every spoken role-play: the learner's own lines in the call;
//   sales.message  written selling: Telegram/Instagram DMs, follow-ups, recaps.
// The descriptors are Schood's own wording. They describe observable selling
// behaviour in what the learner said or wrote, in any of the three languages.

const thresholds = { exact: 0.6, adjacent: 0.95, maxMae: 0.35, maxSpread: 0.5, evidenceValid: 0.9 };

export const rubrics: Rubric[] = [
  {
    id: 'sales.call',
    name: { en: 'Sales conversation', uz: 'Savdo suhbati', ru: 'Продающий разговор' },
    scale: SALES_SCALE,
    overall: { round: 'step' },
    evidence: { min: 1, max: 3 },
    assessorNotes: 'Score only what the learner says; the buyer\'s lines are context. The learner may speak Uzbek, Russian or English (or mix them): judge selling, not grammar, and quote in the language they used. A conversation that never reached a stage (no objection was raised, for example) is scored on what happened, and the comment says so; never invent moments that did not happen. Pressure tactics, invented facts, fake urgency or criticism of competitors pull objection handling and closing down to at most 2.5 however fluent the speaker is. Talk ratio and questions asked in <schood_data> are measured facts: use them for discovery and for the whole picture (a learner who spoke 80% of the words rarely discovered much). Better lines keep the learner\'s product, offer and facts; never add prices, discounts or claims they did not make.',
    criteria: [
      {
        id: 'opening', name: { en: 'Opening and rapport', uz: 'Boshlanish va iliq aloqa', ru: 'Начало и контакт' }, short: 'Opening', source: 'model', node: 'prospecting.cold_call', weight: 0.8,
        focus: 'The first lines: does the learner greet properly for the setting, say who they are and why they are calling or approaching this person, earn permission or interest (a reason that matters to the buyer, a respectful question), and match the buyer\'s mood and pace? In Uzbek and Russian, notice polite forms (siz, Вы, aka/opa where natural). A walk-in or DM opening is judged the same way: a specific, friendly first move, not "Can I help you?" or a price sheet.',
        descriptors: [
          { score: 1, text: 'No real opening: jumps straight into the product or the price, or a vague greeting with no reason for the call. The buyer has no idea why they should listen.' },
          { score: 2, text: 'Greets and names the company, but the reason for the call is generic ("we offer quality products") or a long monologue about the company. Little attempt to connect with this buyer.' },
          { score: 3, text: 'Clear and polite: who, why this buyer, and a question that invites a reply. The reason is a bit general, or the learner rushes past the buyer\'s first reaction.' },
          { score: 4, text: 'A specific reason that fits the buyer (their type of business, a problem common to it, a referral) and a permission question; adapts to the buyer\'s tone and handles "I\'m busy" by offering a short version or a better time.' },
          { score: 5, text: 'Natural and confident: a relevant, honest hook in one or two sentences, real rapport through listening and a light personal touch, and smooth handling of the first brush-off. The buyer chooses to keep talking.' },
        ],
      },
      {
        id: 'discovery', name: { en: 'Discovery', uz: 'Ehtiyojni aniqlash', ru: 'Выявление потребностей' }, short: 'Discovery', source: 'model', node: 'discovery', weight: 1.3,
        focus: 'The questions the learner asks before and while proposing: open questions about the situation, the problem and its cost, what has been tried, the timing, the budget range and who decides; follow-up questions that dig into an answer; summarising what the buyer said. Count the questions (the measured number is in <schood_data>), but judge their quality: a string of closed questions or a checklist read aloud is weaker than three good open questions with follow-ups.',
        descriptors: [
          { score: 1, text: 'Asks no real questions about the buyer, or only "Do you want it?". Proposes without knowing anything about the situation.' },
          { score: 2, text: 'A few questions, mostly closed (yes/no) or about the product, not about the buyer\'s problem. Does not follow up on what the buyer reveals.' },
          { score: 3, text: 'Several relevant questions, some open, covering the basic situation and need. Misses one important area (who decides, timing or budget) or does not dig into the most useful answer.' },
          { score: 4, text: 'Open questions about the problem and its impact, follow-up questions on key answers, and checks of who decides and when. Summarises the need before proposing.' },
          { score: 5, text: 'Discovery that feels like a conversation: layered questions that uncover the real pain, its cost and the decision process, with short summaries the buyer agrees with. The learner speaks less than the buyer.' },
        ],
      },
      {
        id: 'value', name: { en: 'Value and pitch', uz: 'Qiymat va taqdimot', ru: 'Ценность и презентация' }, short: 'Value', source: 'model', node: 'value', weight: 1,
        focus: 'How the learner presents the offer: linked to what the buyer said (you mentioned… so…), outcomes before features, concrete and believable (a clear example, a trial, a guarantee the learner actually stated), short enough to listen to, and checked with a question. Penalise long feature lists, jargon, vague superlatives (the best, number one) and any claim that sounds invented.',
        descriptors: [
          { score: 1, text: 'No pitch beyond the product name or price, or a pitch that has nothing to do with this buyer.' },
          { score: 2, text: 'Lists features or company merits at length; benefits are general ("high quality", "best prices") and not tied to the buyer\'s situation.' },
          { score: 3, text: 'Connects the offer to the buyer\'s need in places, with at least one concrete benefit. Still some feature-listing or a pitch that runs long without checking interest.' },
          { score: 4, text: 'A short, tailored pitch: two or three benefits tied to what the buyer said, one concrete proof or example, and a check ("Would that work for your shop?").' },
          { score: 5, text: 'The value is the buyer\'s own problem solved, in their words, with a vivid and honest example and the cost of doing nothing made clear. Brief, confident and easy to repeat to a partner.' },
        ],
      },
      {
        id: 'objections', name: { en: 'Objection handling', uz: 'E’tirozlar bilan ishlash', ru: 'Работа с возражениями' }, short: 'Objections', source: 'model', node: 'objections', weight: 1.3,
        focus: 'Every objection the buyer raised (price, "I\'ll think about it", a competitor, no budget, "send me info", timing, authority): does the learner acknowledge it calmly, ask a question to find the real concern, answer that concern with value or options, and check that it is resolved? Penalise arguing, ignoring the objection, immediate discounts, pressure and criticism of competitors. If no objection came up, score how the learner handled hesitation and doubts.',
        descriptors: [
          { score: 1, text: 'Ignores or argues with objections, gives in at once ("OK, sorry"), or answers with pressure or a discount straight away.' },
          { score: 2, text: 'Answers objections with a defence or a repeated pitch, without asking what lies behind them. A discount or "it\'s not expensive" is the main tool.' },
          { score: 3, text: 'Acknowledges the objection and gives a reasonable answer; asks a question in some cases. The real concern is sometimes guessed instead of found.' },
          { score: 4, text: 'Acknowledges, asks, answers the real concern with value or a fair option (a smaller start, a trial, terms), and checks it is resolved. Stays calm and respectful.' },
          { score: 5, text: 'Turns objections into discovery: isolates the real issue, reframes it around the buyer\'s goals, trades rather than concedes, and leaves the buyer feeling understood. Handles several objections without losing the thread.' },
        ],
      },
      {
        id: 'closing', name: { en: 'Closing and next step', uz: 'Yakun va keyingi qadam', ru: 'Закрытие и следующий шаг' }, short: 'Closing', source: 'model', node: 'closing', weight: 1.2,
        focus: 'How the learner moves to a decision: does they ask for the order or for a concrete next step (a meeting, a demo, a trial, a call with the decision maker) with a day and time, at the right moment, without pressure? Do they confirm what was agreed? An honest "not now" with a clear follow-up date is better than a vague promise.',
        descriptors: [
          { score: 1, text: 'The call ends with no ask at all, or with "call me if you need" / "думайте" / "o‘ylab ko‘ring".' },
          { score: 2, text: 'A weak or very late ask ("so... maybe you want?"), or pushes for an order before the buyer is ready. No time or date for any next step.' },
          { score: 3, text: 'Asks for a next step or the order at a sensible moment; the step is somewhat vague (call next week) or not confirmed.' },
          { score: 4, text: 'A clear, timely ask for the order or a concrete next step with a date and time, confirmed back, including the right people.' },
          { score: 5, text: 'The close follows naturally from the conversation: the buyer agrees to a specific step that moves the sale forward, the learner summarises it and sets expectations, with no pressure and no loose ends.' },
        ],
      },
    ],
    calibration: { thresholds, samples: callCalibration.samples, runs: callCalibration.runs },
  },
  {
    id: 'sales.message',
    name: { en: 'Selling message', uz: 'Sotuvchi xabar', ru: 'Продающее сообщение' },
    scale: SALES_SCALE,
    overall: { round: 'step' },
    evidence: { min: 1, max: 2 },
    assessorNotes: 'A written message for Telegram, Instagram, e-mail or a messenger: judge it as the buyer would read it on a phone. The learner may write in Uzbek, Russian or English; judge selling and clarity, not spelling, unless errors make it look careless. Length matters: a DM wall of text loses the reader, and a bare price or "ok" loses the sale. Never reward invented facts, fake urgency or pressure; a message that uses them gets at most 2.5 on tone. Better versions keep the learner\'s own product, prices and facts.',
    criteria: [
      {
        id: 'personal', name: { en: 'Relevance to this buyer', uz: 'Shu mijozga moslik', ru: 'Под этого клиента' }, short: 'Personal', source: 'model', node: 'dm', weight: 1,
        focus: 'Does the message answer what this buyer asked or care about, use what is known about them (their question, their business, what was said on the call), and sound written for one person rather than copied for everyone?',
        descriptors: [
          { score: 1, text: 'A generic template or a bare reply that ignores what the buyer asked.' },
          { score: 2, text: 'Answers the question but could be sent to anyone; nothing about this buyer\'s situation.' },
          { score: 3, text: 'Clearly answers this buyer and mentions one detail of their situation.' },
          { score: 4, text: 'Tailored throughout: refers to what the buyer said or needs, and the offer fits them.' },
          { score: 5, text: 'Feels personal and attentive in a natural way; the buyer would feel listened to.' },
        ],
      },
      {
        id: 'value', name: { en: 'Value', uz: 'Qiymat', ru: 'Ценность' }, short: 'Value', source: 'model', node: 'value', weight: 1.1,
        focus: 'Does the message give a reason to buy or to reply: the benefit for this buyer, what is included, an honest proof (a guarantee or example the learner actually offers), and the price framed with what the buyer gets?',
        descriptors: [
          { score: 1, text: 'No reason to buy: only a price, a product name or "available".' },
          { score: 2, text: 'Vague claims (best quality, cheap) or a list of features without what they mean for the buyer.' },
          { score: 3, text: 'One or two concrete benefits or inclusions; the price is put in some context.' },
          { score: 4, text: 'Clear benefits for this buyer, an honest proof or option, and the price framed with value.' },
          { score: 5, text: 'Compelling and specific value in few words; the buyer can see exactly why this is worth it for them.' },
        ],
      },
      {
        id: 'clarity', name: { en: 'Clarity and length', uz: 'Aniqlik va hajm', ru: 'Ясность и объём' }, short: 'Clarity', source: 'model', node: 'dm', weight: 0.9,
        focus: 'Is it easy to read on a phone: short paragraphs or lines, the key information first, numbers and terms stated plainly, no jargon or walls of text, no confusing mix of offers?',
        descriptors: [
          { score: 1, text: 'Confusing: missing key information, or a long unbroken block that is hard to follow.' },
          { score: 2, text: 'Understandable but cluttered, too long or too short to be useful; key details are buried.' },
          { score: 3, text: 'Clear overall, with a few unnecessary words or one detail missing.' },
          { score: 4, text: 'Well organised, the right length, key details easy to find.' },
          { score: 5, text: 'Effortless to read: every line earns its place and the next action is obvious.' },
        ],
      },
      {
        id: 'next_step', name: { en: 'Call to action', uz: 'Harakatga chaqiriq', ru: 'Призыв к действию' }, short: 'Next step', source: 'model', node: 'follow_up', weight: 1.2,
        focus: 'Does the message end with an easy, specific next step for the buyer: a question they can answer in a word, a proposed time, a link or a choice of two options? Is it the right step for where the buyer is?',
        descriptors: [
          { score: 1, text: 'No next step at all; the conversation can only die.' },
          { score: 2, text: 'A vague ending ("write if interested", "думайте").' },
          { score: 3, text: 'A clear question or request, though it asks a lot of the buyer or is not tied to a time.' },
          { score: 4, text: 'An easy, specific next step (a choice of two, a proposed time) that fits the stage.' },
          { score: 5, text: 'A next step the buyer would naturally take, phrased so replying feels effortless.' },
        ],
      },
      {
        id: 'tone', name: { en: 'Tone and trust', uz: 'Ohang va ishonch', ru: 'Тон и доверие' }, short: 'Tone', source: 'model', node: 'dm', weight: 0.8,
        focus: 'Is the tone polite, warm and professional for the channel and the culture (siz/Вы where expected), confident without pressure, honest (no fake urgency, no invented claims)? Do emojis and style fit the brand and the buyer?',
        descriptors: [
          { score: 1, text: 'Rude, pushy or careless; or misleading claims and fake urgency.' },
          { score: 2, text: 'Too cold, too familiar or slightly pushy for this buyer; some overstatement.' },
          { score: 3, text: 'Polite and acceptable, if a little flat or formulaic.' },
          { score: 4, text: 'Warm, respectful and confident; builds trust.' },
          { score: 5, text: 'Exactly the right voice for this buyer and channel; honest and inviting.' },
        ],
      },
    ],
    calibration: { thresholds, samples: messageCalibration.samples, runs: messageCalibration.runs },
  },
];
