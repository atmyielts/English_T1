// Bank items for pharma and medical sales staff. Original Schood content; companies and products are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'pharma_sales';
export const bank: RoleBank = {
  grammar: grammar(role, 'pha', [
    ['a2', 'The pharmacy ___ ten boxes of this vitamin every week.', ['sell', 'sells', 'selling', 'is sell'], 1],
    ['b1', 'This medicine ___ be kept in a fridge after opening.', ['must', 'is', 'has', 'does'], 0],
    ['b1', 'We ___ your order yesterday, and it will arrive tomorrow.', ['have sent', 'send', 'sent', 'are send'], 2],
    ['b2', 'The study showed that blood pressure ___ more than expected.', ['was fallen', 'had fallen', 'has falling', 'fell of'], 1],
    ['b2', 'All side effects must be reported, ___ they seem minor.', ['even if', 'unless', 'in order to', 'so that'], 0],
    ['c1', 'The doctor asked to see the data on which the claim ___.', ['based', 'was based', 'bases', 'basing'], 1],
  ]),
  vocabulary: vocabulary(role, 'pha', [
    ['a2', 'This medicine comes as small ___, and there are thirty in a box.', ['bottles', 'tablets', 'tickets', 'tables'], 1],
    ['a2', 'You need a doctor’s ___ to buy this medicine.', ['receipt', 'prescription', 'recipe', 'description'], 1],
    ['b1', 'Check the ___ date before you sell this product.', ['expiry', 'express', 'export', 'extra'], 0],
    ['b1', 'A headache can be a ___ effect of this medicine.', ['back', 'side', 'bad', 'next'], 1],
    ['b1', 'Keep vaccines in the cold ___ from the factory to the clinic.', ['line', 'link', 'chain', 'road'], 2],
    ['b2', 'A ___ is cheaper because it copies a medicine after the patent ends.', ['generic', 'general', 'genuine', 'genetic'], 0],
    ['b2', 'Each ___ of the medicine has a number, so problems can be traced.', ['batch', 'bunch', 'branch', 'bench'], 0],
    ['c1', 'A representative must not promote a medicine for ___ uses.', ['over-the-counter', 'off-label', 'on-call', 'out-of-date'], 1],
  ]),
  reading: [
    reading('r-pha-01', role, 'b2', 'policy', 'Reporting Side Effects: Guidance for Field Staff', `All employees of Nova Lifesciences must report any side effect they hear about within 24 hours, however small it seems and whether or not they think the medicine caused it.

A report needs four basic items: someone who reported the event, a patient, a medicine and something that happened. Even if you know little, send the report. The safety team will contact the reporter for more details, if the reporter agrees.

Do not give medical advice. If a patient or customer asks whether they should stop taking a medicine, tell them to speak to their doctor or pharmacist without delay.

Do not decide yourself that the event is not important. Failing to report is a serious breach of company policy. If you are not sure, report it anyway and speak to your manager.`, [
      ['How soon must a side effect be reported?', ['Within 24 hours', 'Within a week', 'Only if it is serious', 'At the next meeting'], 0],
      ['What should staff do if they know little about the case?', ['Wait for more information', 'Send the report anyway', 'Ask the patient for documents', 'Call the patient’s doctor'], 1],
      ['What should staff say if a patient asks about stopping a medicine?', ['Stop immediately', 'Continue for a week', 'Speak to a doctor or pharmacist', 'Change to another medicine'], 2],
    ]),
  ],
  listening: [
    listening('l-pha-01', role, 'b1', 'voicemail', 'A Message from a Pharmacy', [
      ['Pharmacist', 'Hello, Farrukh, this is Lola from the pharmacy on Registan Street. I’m calling about my order from Monday.'],
      ['Pharmacist', 'The delivery came this morning, but there are only forty boxes of Vitafort D. I ordered sixty. The invoice says sixty too.'],
      ['Pharmacist', 'Also, two boxes of the flu vaccine arrived warm. I’m not sure they stayed in the cold box, so I have not put them on the shelf.'],
      ['Pharmacist', 'Please could you call me back before five o’clock? After that I am at a meeting until tomorrow.'],
      ['Pharmacist', 'If you can, please send the other twenty boxes this week, and tell me what to do with the vaccine. Thank you. Goodbye.'],
    ], [
      ['How many boxes of Vitafort D arrived?', ['Twenty', 'Forty', 'Sixty', 'Eighty'], 1],
      ['What is the problem with the vaccine?', ['The boxes were warm', 'It is the wrong vaccine', 'There are too many', 'It is out of date'], 0],
      ['When should Farrukh call back?', ['Tomorrow morning', 'After five o’clock', 'Before five o’clock', 'Next week'], 2],
    ]),
  ],
  writing: writing(role, 'pha', [
    ['b1', 'A pharmacy has complained that a medicine delivery was incomplete. Write an email to apologise and explain what you will do.', ['Apologise and state the facts', 'Say when the rest will come', 'Explain any change to the invoice', 'Offer direct contact'], 90],
    ['b2', 'Your company wants to launch a new fictional vitamin product in Uzbekistan. Write a short plan for your manager: who to visit first, what materials you need and how to measure results.', ['Name your target customers and why', 'Say what you need', 'Mention following approved claims only', 'Give measures of success'], 160],
  ]),
  speaking: speaking(role, 'pha', [
    ['a2', 'Describe a usual working day for a person who sells medicines to pharmacies or clinics.', ['Who they visit', 'What they do during a visit', 'What they do after visits'], 45],
    ['b1', 'A pharmacist asks why your medicine is more expensive than another. Answer without criticising the other company.', ['Show you understand', 'Explain your value', 'Offer a next step'], 60],
    ['b2', 'A doctor asks you to give him a gift in return for prescribing your product. Respond politely and explain why you can’t.', ['Decline clearly and respectfully', 'Explain the rule', 'Keep the relationship positive'], 90],
  ]),
};
