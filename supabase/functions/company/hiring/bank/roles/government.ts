// Bank items for government and diplomatic staff. Original Schood content; agencies are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'government';
export const bank: RoleBank = {
  grammar: grammar(role, 'gov', [
    ['a2', 'The delegation ___ in Tashkent yesterday evening.', ['arrive', 'arrives', 'arriving', 'arrived'], 3],
    ['b1', 'The ambassador ___ meet the minister next Tuesday.', ['going to', 'will', 'is', 'has'], 1],
    ['b1', 'All visitors must show their passports ___ they enter the building.', ['during', 'despite', 'before', 'since'], 2],
    ['b2', 'A new agreement ___ by the two countries at the end of the talks.', ['was signed', 'signed', 'was sign', 'has sign'], 0],
    ['b2', 'The minister said that the talks ___ productive.', ['has been', 'had been', 'have been', 'be'], 1],
    ['c1', 'It is essential that the report ___ before the committee meets.', ['is circulate', 'be circulated', 'circulated', 'has circulate'], 1],
  ]),
  vocabulary: vocabulary(role, 'gov', [
    ['a2', 'You need a ___ to enter some countries.', ['visa', 'license plate', 'ticket price', 'pass mark'], 0],
    ['a2', 'A ___ translates what people say at a meeting.', ['guide', 'driver', 'secretary', 'interpreter'], 3],
    ['b1', 'The ___ represents his country in Uzbekistan.', ['ambassador', 'audience', 'assistant', 'accountant'], 0],
    ['b1', 'Please send the ___ for the meeting, so everyone knows the topics.', ['agenda', 'address', 'advert', 'answer'], 0],
    ['b1', 'Their temporary permit will ___ next week, so they must renew it.', ['expire', 'export', 'explain', 'expand'], 0],
    ['b2', 'Both countries signed a memorandum of ___ about energy.', ['understanding', 'underlying', 'undertaking', 'underwriting'], 0],
    ['b2', 'A meeting between the officials of two countries is a ___ meeting.', ['bilingual', 'biannual', 'bilateral', 'biography'], 2],
    ['c1', 'It was difficult to reach ___ among all twelve delegations.', ['consensus', 'census', 'sense', 'consent form'], 0],
  ]),
  reading: [
    reading('r-gov-01', role, 'c1', 'report', 'Report on a Regional Trade Visit', `The delegation visited three industrial zones during its two-day stay and held talks with regional officials and local companies. Participants described the discussions as open and practical, though several questions remain unresolved.

Both sides recognised the potential for cooperation in textile machinery and food processing. However, the visiting companies raised concerns over the time needed to obtain permits and over the limited number of direct flights. Officials acknowledged these difficulties, while pointing to a recently opened help desk for investors.

It was agreed that a joint working group would meet within three months to prepare specific proposals. No financial commitments were made at this stage, and any future agreement will depend on the outcome of technical studies. A short public statement will be issued once both sides have approved its wording.`, [
      ['What is the overall tone of the visit, according to the report?', ['Hostile and unproductive', 'Open and practical, with unresolved questions', 'Fully successful with a signed deal', 'Mainly ceremonial'], 1],
      ['What did the visiting companies complain about?', ['Local food', 'The help desk', 'Permit times and few direct flights', 'The working group'], 2],
      ['What can we conclude about money?', ['Nothing was committed at this stage', 'Large sums were promised', 'Taxes will rise', 'Flights will be paid for'], 0],
    ]),
  ],
  listening: [
    listening('l-gov-01', role, 'b1', 'call', 'Arranging a Visit', [
      ['Officer', 'Good morning, this is Rustam from the Regional Agency. I’m calling about the visit of your delegation.'],
      ['Assistant', 'Good morning, Rustam. Yes, we are planning to arrive on the fourteenth of May.'],
      ['Officer', 'Very good. How many people will there be, and will you need an interpreter?'],
      ['Assistant', 'There will be six people, and yes, please, we would like an interpreter for the meetings.'],
      ['Officer', 'No problem. The first meeting is at ten o’clock on the fifteenth, with the deputy head.'],
      ['Assistant', 'That’s fine, but our director must leave by two o’clock on the sixteenth. Is that all right?'],
      ['Officer', 'Yes, I will change the programme and send a new one tomorrow. Could you send me the passport copies, please?'],
      ['Assistant', 'Of course. I’ll send them today.'],
    ], [
      ['How many people are in the delegation?', ['Four', 'Five', 'Six', 'Fourteen'], 2],
      ['What will the officer send tomorrow?', ['Passport copies', 'A new programme', 'An interpreter', 'A plane ticket'], 1],
      ['What does the assistant promise to send today?', ['Passport copies', 'The programme', 'A list of topics', 'A letter from the director'], 0],
    ]),
  ],
  writing: writing(role, 'gov', [
    ['b1', 'A foreign visitor has emailed to ask how to register a temporary address. Write a clear, polite reply with the steps.', ['Thank them for writing', 'Explain the steps in order', 'Say what documents to bring and where', 'Say how to get more help'], 90],
    ['b2', 'A visiting delegation wants to set up a joint programme with your organisation. Write a short briefing for your director: the opportunity, one risk and your recommendation.', ['Summarise the proposal', 'Explain the benefit', 'State one risk', 'Recommend next steps'], 160],
  ]),
  speaking: speaking(role, 'gov', [
    ['a2', 'Tell a foreign visitor about your city or region. What should they see?', ['Where it is', 'What to see', 'One practical tip'], 45],
    ['b1', 'A foreign visitor has gone to the wrong office and is upset. Explain clearly what they should do next.', ['Show understanding', 'Say where to go and when', 'Say what to bring'], 60],
    ['b2', 'A partner organisation wants a public report that your organisation can’t give yet. Explain your position diplomatically and suggest an alternative.', ['Acknowledge their interest', 'State your difficulty politely', 'Offer a realistic alternative'], 90],
  ]),
};
