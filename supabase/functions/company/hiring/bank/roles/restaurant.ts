// Bank items for restaurant and kitchen staff. Original Schood content; restaurants are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'restaurant';
export const bank: RoleBank = {
  grammar: grammar(role, 'rst', [
    ['a1', 'Would you ___ some green tea?', ['like', 'likes', 'liking', 'to like'], 0],
    ['a2', 'How ___ water do you need for this soup?', ['many', 'few', 'much', 'lot'], 2],
    ['a2', 'The chef ___ plov right now. It will be ready soon.', ['makes', 'is making', 'made', 'make'], 1],
    ['b1', 'If a guest has an allergy, the waiter ___ tell the chef.', ['must', 'could', 'may', 'would'], 0],
    ['b2', 'By the time the guests arrived, the tables ___ set.', ['were being', 'had been', 'have been', 'are'], 1],
    ['c1', 'Hardly had we opened ___ the first guests came in.', ['than', 'when', 'as soon', 'that'], 1],
  ]),
  vocabulary: vocabulary(role, 'rst', [
    ['a2', 'Could we have the ___, please? We would like to pay.', ['bill', 'bell', 'ball', 'book'], 0],
    ['a2', 'Do you have a ___ for two people tonight?', ['seat', 'chair', 'table', 'room'], 2],
    ['b1', 'The first small dish of a meal is the ___.', ['dessert', 'starter', 'side', 'snack'], 1],
    ['b1', 'Please cut the onions into small pieces. In other words, ___ them.', ['boil', 'chop', 'fry', 'bake'], 1],
    ['b1', 'This dish contains ___, so it isn’t safe for someone with an allergy to them.', ['carrots', 'nuts', 'knives', 'noodles'], 1],
    ['b2', 'Keep raw meat away from cooked food to avoid cross-___.', ['cooking', 'cutting', 'contamination', 'competition'], 2],
    ['b2', 'A guest who is very happy may leave the waiter a ___.', ['tip', 'tap', 'top', 'type'], 0],
    ['c1', 'All food must be thrown away after its ___ date.', ['take-off', 'use-by', 'sell-out', 'send-by'], 1],
  ]),
  reading: [
    reading('r-rst-01', role, 'a2', 'chat', 'A Busy Friday: Team Chat', `Manager: Good morning, team. We have 90 bookings tonight, and a group of 25 from a company at 19:00. All staff please come at 15:00, not 16:00.

Dilshod: OK. Do we have enough lamb? Last Friday we ran out.

Chef Olim: I ordered more yesterday. It arrives at 14:00. Please check the fridge when it comes.

Madina: The company group, do they want plov or shashlik?

Manager: Plov for 20 and vegetarian samsa and salad for 5. They have paid already, so no bill at the end.

Dilshod: Who is at the door tonight?

Manager: Madina. Dilshod and Aziz take the big group. Thanks, everyone!`, [
      ['What time should staff come today?', ['At 14:00', 'At 15:00', 'At 16:00', 'At 19:00'], 1],
      ['Who should check the fridge when the lamb arrives?', ['The manager only', 'Madina only', 'The team', 'A customer'], 2],
      ['What do we know about the company group?', ['They have already paid', 'They all want shashlik', 'There are 90 people', 'They will arrive at 15:00'], 0],
    ]),
  ],
  listening: [
    listening('l-rst-01', role, 'a2', 'call', 'Booking a Table', [
      ['Staff', 'Good afternoon, Chinor restaurant. This is Aziz. How can I help you?'],
      ['Caller', 'Hello. I’d like to book a table for tomorrow evening, please.'],
      ['Staff', 'Of course. For how many people, and what time?'],
      ['Caller', 'For six people, at seven o’clock. Is it possible to sit outside?'],
      ['Staff', 'I’m sorry, the outside tables are all booked at seven. We have one at eight, or a table inside at seven.'],
      ['Caller', 'Inside at seven is fine. And one of my friends doesn’t eat meat. Is that a problem?'],
      ['Staff', 'No problem at all. We have good vegetarian dishes. May I have your name?'],
      ['Caller', 'Yes, it’s Brown. B, R, O, W, N.'],
    ], [
      ['How many people is the table for?', ['Four', 'Six', 'Seven', 'Eight'], 1],
      ['Where will they sit?', ['Outside at seven', 'Outside at eight', 'Inside at seven', 'Inside at eight'], 2],
      ['What does the caller say about his friend?', ['She doesn’t eat meat', 'She has a nut allergy', 'She will be late', 'She wants a dessert'], 0],
    ]),
  ],
  writing: writing(role, 'rst', [
    ['b1', 'A guest emailed that she left a scarf at your restaurant. It has been found. Write a friendly reply saying how she can collect it.', ['Say that you found it', 'Say where and when to collect it', 'Ask how to identify it', 'Invite her to visit again'], 90],
    ['b2', 'Your restaurant’s online reviews often mention slow service on weekends. Write a short report to the owner with the likely causes and two proposals.', ['Describe what reviews say', 'Give likely causes', 'Propose two changes', 'Say how to measure improvement'], 160],
  ]),
  speaking: speaking(role, 'rst', [
    ['a2', 'Tell a foreign guest about a popular dish in your country.', ['Name the dish', 'Say what’s in it', 'Say why people like it'], 45],
    ['b1', 'A guest says the food has taken too long. Say what you would do and say.', ['Apologise', 'Say what you’re doing about it', 'Offer something'], 60],
    ['b2', 'Your owner wants to cut staff to save money. Explain the risk to service and suggest another way to reduce costs.', ['Describe the risk', 'Suggest alternatives', 'Support them with reasons'], 90],
  ]),
};
