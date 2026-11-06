// Bank items for marketing and PR staff. Original Schood content; companies are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'marketing_pr';
export const bank: RoleBank = {
  grammar: grammar(role, 'mkt', [
    ['a2', 'We ___ a new advert on Instagram every week.', ['posts', 'post', 'posting', 'to post'], 1],
    ['b1', 'The campaign ___ more people than we expected.', ['has reached', 'reach', 'is reach', 'reaching'], 0],
    ['b1', 'Video adverts work ___ than photos on our page.', ['good', 'well', 'better', 'best'], 2],
    ['b2', 'Sales rose sharply ___ the launch of the new package.', ['following', 'during to', 'since of', 'while'], 0],
    ['b2', 'The press release, ___ was sent on Monday, led to five articles.', ['that', 'what', 'who', 'which'], 3],
    ['c1', 'Had we tested the message first, we ___ so much of the budget.', ['would not waste', 'would not have wasted', 'did not waste', 'will not have wasted'], 1],
  ]),
  vocabulary: vocabulary(role, 'mkt', [
    ['a2', 'People can ___ our post with their friends.', ['share', 'shape', 'sharp', 'shore'], 0],
    ['a2', 'Our company ___ is a green leaf on a yellow circle.', ['logo', 'title', 'label price', 'address'], 0],
    ['b1', 'Our target ___ is women aged twenty-five to forty.', ['group chat', 'audience', 'attendance', 'reader'], 1],
    ['b1', 'We will ___ the new product at an event in April.', ['launch', 'lunch', 'lift', 'land'], 0],
    ['b1', 'The agency sent a ___ with a plan and a price.', ['promise', 'proposal', 'purpose', 'property'], 1],
    ['b2', 'The conversion ___ shows how many visitors actually buy.', ['speed', 'level', 'rate', 'fee'], 2],
    ['b2', 'The story about our factory got wide media ___ last week.', ['cover letter', 'covering', 'coverage', 'coverings'], 2],
    ['c1', 'A clumsy reply on social media can seriously damage a company’s ___.', ['repetition', 'resolution', 'reputation', 'regulation'], 2],
  ]),
  reading: [
    reading('r-mkt-01', role, 'b1', 'report', 'Snack Box Campaign: First Month', `Our first month of the Snack Box campaign has given us useful results.

Our adverts reached about 400,000 people on Instagram and Telegram. Videos were watched far more than photos, and our recipe video with a local chef received the most comments. The website had 18,000 visits, but only 300 boxes were sold. Many customers told us that the delivery cost was too high for a small order.

Next month we plan to offer free delivery on orders of two boxes or more. We will also put more of the budget into video and less into photos. We will not change the price of the box, because our customers say it is fair.

We will report the results at the next meeting on 5 May.`, [
      ['Which advert received the most comments?', ['A photo of the box', 'A recipe video with a chef', 'An advert on the website', 'A Telegram message'], 1],
      ['Why did many customers not buy?', ['The box was too small', 'The website was slow', 'The delivery cost was too high', 'The video was too long'], 2],
      ['What will NOT change next month?', ['The price of the box', 'The delivery offer', 'The money spent on video', 'The money spent on photos'], 0],
    ]),
  ],
  listening: [
    listening('l-mkt-01', role, 'b1', 'meeting', 'Planning a Launch Event', [
      ['Manager', 'Let’s check the plan for the launch event. Is the venue confirmed?'],
      ['Assistant', 'Yes, the hotel has confirmed the room for the fifth of April. It holds eighty people.'],
      ['Manager', 'Good. How many guests have replied?'],
      ['Assistant', 'About fifty, but I think more will reply this week. Ten of them are journalists.'],
      ['Manager', 'That’s useful. Do we have the press pack ready?'],
      ['Assistant', 'Not yet. The photos come on Tuesday, so I can finish it on Wednesday.'],
      ['Manager', 'All right. Please send it to me before you send it to the journalists. And who’s speaking?'],
      ['Assistant', 'The director will speak first, for five minutes. Then the chef will show a recipe with our fruit.'],
    ], [
      ['How many people can the room hold?', ['Fifty', 'Sixty', 'Eighty', 'One hundred'], 2],
      ['Why isn’t the press pack ready?', ['The photos have not arrived', 'The journalists have not replied', 'The director is away', 'The venue changed'], 0],
      ['What will the chef do?', ['Welcome the journalists', 'Speak first', 'Show a recipe', 'Take photos'], 2],
    ]),
  ],
  writing: writing(role, 'mkt', [
    ['b1', 'A customer posted an angry comment that her order is two weeks late. Write the public reply and a short private message to her.', ['Apologise publicly and briefly', 'Ask for the order number privately', 'Say what you will do and when', 'Keep a friendly tone'], 90],
    ['b2', 'Your company wants to reach customers aged 18–25. Write a short proposal for the director: which channels, what message, and how you will measure results.', ['Describe the audience', 'Recommend channels and a message', 'Give a rough timeline', 'Explain how success will be measured'], 160],
  ]),
  speaking: speaking(role, 'mkt', [
    ['a2', 'Describe a brand or advert you like. What is it and why do you like it?', ['Name the brand or advert', 'Describe what it shows', 'Say why you like it'], 45],
    ['b1', 'Explain to your manager how a post performed and what you would do differently next time.', ['Give one or two numbers', 'Say why it did well or badly', 'Suggest one change'], 60],
    ['b2', 'A negative story about your company has appeared online. Explain to the director what you recommend doing in the next 24 hours.', ['Say what you would check first', 'Recommend the first statement', 'Explain who should speak and when'], 90],
  ]),
};
