// Bank items for construction and site staff. Original Schood content; companies are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'construction';
export const bank: RoleBank = {
  grammar: grammar(role, 'con', [
    ['a1', 'There ___ twenty workers on the site today.', ['is', 'are', 'am', 'be'], 1],
    ['a2', 'You ___ wear a helmet here. It is the rule.', ['must', 'might', 'can', 'would'], 0],
    ['b1', 'We ___ the second floor by the end of this week.', ['finish', 'have finish', 'finishing', 'will have finished'], 3],
    ['b1', 'The concrete has to dry ___ you can walk on it.', ['during', 'before', 'while', 'since'], 1],
    ['b2', 'The wall ___ again because the first one did not meet the specification.', ['had to build', 'had to be built', 'must built', 'should build'], 1],
    ['c1', 'But for the quick action of the foreman, the injury ___ far worse.', ['would be', 'had been', 'would have been', 'will have been'], 2],
  ]),
  vocabulary: vocabulary(role, 'con', [
    ['a2', 'Wear your ___ to protect your head on site.', ['boots', 'gloves', 'helmet', 'vest'], 2],
    ['a2', 'We use a ___ to climb up to the roof.', ['ladder', 'hammer', 'pipe', 'wheel'], 0],
    ['b1', 'The workers stand on a ___ to paint the outside of a building.', ['scaffold', 'column', 'trench', 'beam'], 0],
    ['b1', 'The engineer found a mistake in the ___, so the door was in the wrong place.', ['painting', 'drawing', 'writing', 'report card'], 1],
    ['b1', 'We are two days behind ___ because of the rain.', ['timing', 'calendar', 'schedule', 'scheme'], 2],
    ['b2', 'Before handover, we fix every item on the ___ list.', ['snag', 'shopping', 'stock', 'side'], 0],
    ['b2', 'A worker almost fell. Nobody was hurt, but it counts as a near ___.', ['fall', 'miss', 'loss', 'risk'], 1],
    ['c1', 'The client approved a ___ order for the extra walls, with added cost.', ['deviation', 'variation', 'version', 'vacation'], 1],
  ]),
  reading: [
    reading('r-con-01', role, 'b1', 'notice', 'Site Rules for Hot Weather', `To all site workers and subcontractors,

Because of the very hot weather this month, the following rules apply until further notice.

Work on roofs and outside walls will stop between 12:30 and 15:00. Work starts one hour earlier, at 7:00, and may continue until 18:00. Everyone must drink water regularly; there are water stations on every floor and near the gate.

Tell your foreman at once if you or a colleague feel dizzy, sick or confused. Do not wait. There is a first aid room next to the site office, and a nurse is on site every day until 17:00.

Helmets and boots must still be worn at all times. Subcontractors are responsible for making sure their own teams follow these rules.

Site Safety Team`, [
      ['When does outside work stop during the day?', ['Between 7:00 and 12:30', 'Between 12:30 and 15:00', 'After 15:00', 'At 18:00'], 1],
      ['What should you do if a colleague feels dizzy?', ['Wait until the shift ends', 'Give them a helmet', 'Tell the foreman at once', 'Take them home'], 2],
      ['Who must make sure subcontractors follow these rules?', ['The subcontractors themselves', 'The nurse', 'The Site Safety Team only', 'The gate guard'], 0],
    ]),
  ],
  listening: [
    listening('l-con-01', role, 'b1', 'call', 'A Problem with the Delivery', [
      ['Foreman', 'Hello, this is Sardor from the Yangi Shahar site. Your truck has just arrived with the steel, but something is wrong.'],
      ['Supplier', 'Oh, I’m sorry to hear that. What’s the problem?'],
      ['Foreman', 'We ordered six metre bars, but these are all four metres long. We can’t use them for the columns.'],
      ['Supplier', 'Let me check the order. Yes, I see. It’s our mistake. I’m very sorry.'],
      ['Foreman', 'When can you bring the right ones? We need to start the columns on Thursday.'],
      ['Supplier', 'We can deliver them tomorrow afternoon. Should the driver take these back?'],
      ['Foreman', 'Yes, please. And please send me a new delivery note today, so I can tell the engineer.'],
      ['Supplier', 'Of course. I’ll send it by email within an hour.'],
    ], [
      ['What is wrong with the delivery?', ['The steel is too long', 'The bars are the wrong length', 'The truck is late', 'The steel is damaged'], 1],
      ['When will the right bars arrive?', ['This morning', 'Tomorrow afternoon', 'On Thursday', 'Next week'], 1],
      ['What does the foreman ask the supplier to send?', ['A new delivery note', 'A discount', 'A photo', 'An engineer'], 0],
    ]),
  ],
  writing: writing(role, 'con', [
    ['b1', 'Materials arrived damaged on site this morning. Write an email to the supplier to explain the problem and ask for a replacement.', ['Give the order and what was delivered', 'Describe the damage', 'Ask for replacement with a date', 'Mention attached photos'], 90],
    ['b2', 'Your project is one week behind schedule. Write a short report for the client explaining why and what you plan to do.', ['State the status against the schedule', 'Explain the causes', 'Describe the recovery plan', 'Say what you need from the client'], 160],
  ]),
  speaking: speaking(role, 'con', [
    ['a2', 'Describe the safety equipment people wear on a construction site and why.', ['Name three items', 'Say what each one protects', 'Say what happens if someone forgets'], 45],
    ['b1', 'Explain to a new worker what to do in the morning before starting work at height.', ['Say what to wear', 'Say what to check', 'Say who to tell if there is a problem'], 60],
    ['b2', 'A foreign client wants the project finished earlier, but you think it isn’t safe. Explain your view and suggest an alternative.', ['Say why it isn’t safe', 'Explain the effect on quality and people', 'Suggest a realistic alternative'], 90],
  ]),
};
