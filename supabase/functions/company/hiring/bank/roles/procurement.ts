// Bank items for procurement and supply chain staff. Original Schood content; companies are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'procurement';
export const bank: RoleBank = {
  grammar: grammar(role, 'pro', [
    ['a2', 'How ___ boxes do you need?', ['much', 'any', 'many', 'lot'], 2],
    ['b1', 'The supplier ___ us a new price list last week.', ['send', 'sent', 'sends', 'sending'], 1],
    ['b1', 'This supplier is ___ than the other, but its delivery is much faster.', ['expensiver', 'more expensive', 'most expensive', 'expensive'], 1],
    ['b2', 'If the goods arrive late, the supplier ___ pay a penalty.', ['will have to', 'had to', 'would had to', 'has'], 0],
    ['b2', 'We have not received the parts ___ we ordered last month.', ['when', 'what', 'who', 'which'], 3],
    ['c1', 'Provided that the samples ___ our tests, we will place an order next month.', ['pass', 'will have passed', 'would pass', 'are passing'], 0],
  ]),
  vocabulary: vocabulary(role, 'pro', [
    ['a2', 'We need to find a new ___ for our packaging.', ['customer', 'supplier', 'driver', 'cashier'], 1],
    ['a2', 'Can you send a free ___ of the product before we order?', ['simple', 'sample', 'signal', 'symbol'], 1],
    ['b1', 'What is the delivery lead ___ for this product?', ['way', 'hour', 'time', 'date'], 2],
    ['b1', 'Please send a ___ with your price and terms.', ['question', 'quotation', 'quantity', 'quality'], 1],
    ['b1', 'Our standard payment ___ are thirty days after delivery.', ['terms', 'times', 'rules', 'turns'], 0],
    ['b2', 'We keep safety ___ in the warehouse in case of delays.', ['stack', 'stock', 'stick', 'stuck'], 1],
    ['b2', 'Three companies submitted a ___ in this tender.', ['bit', 'bid', 'bill', 'bite'], 1],
    ['c1', 'This single machine is the ___ that slows the whole supply chain.', ['bottleneck', 'backlog', 'breakdown', 'breakthrough'], 0],
  ]),
  reading: [
    reading('r-pro-01', role, 'b2', 'email', 'Delay on Purchase Order 3120', `Dear Ms Wang,

Thank you for your call yesterday. I am writing to confirm our position on purchase order 3120 for 2,000 machine parts.

As you know, the goods were due on 1 March and are now twelve days late. Without them, our production line in Fergana will stop on 28 March. We therefore ask you to send 500 pieces by air by 20 March at your expense, and the rest by truck as soon as possible.

Please also send a written explanation of the cause and how you will prevent it in future. Under clause 9 of our contract, we may claim a penalty for delays over ten days; we would prefer to avoid this, and it will depend on how quickly the problem can be solved.

Kind regards,
Sevara Karimova, Supply Chain Planner`, [
      ['When will the production line stop without the parts?', ['1 March', '12 March', '20 March', '28 March'], 3],
      ['What does the writer ask for by air?', ['All 2,000 pieces', '500 pieces', 'A written explanation', 'The contract'], 1],
      ['What does the writer say about the penalty?', ['It has already been paid', 'It is not in the contract', 'It may depend on how quickly the problem is solved', 'It applies to all delays'], 2],
    ]),
  ],
  listening: [
    listening('l-pro-01', role, 'b1', 'meeting', 'Choosing a New Supplier', [
      ['Manager', 'Let’s decide on the packaging supplier today. What do we have, Sevara?'],
      ['Buyer', 'We have three offers. The company from Turkey is the cheapest, but their delivery time is ten weeks.'],
      ['Manager', 'Ten weeks is too long. We launch in May. What about the others?'],
      ['Buyer', 'The Kazakh company delivers in four weeks, but they are about nine percent more expensive.'],
      ['Manager', 'And the third one?'],
      ['Buyer', 'A local company in Tashkent, four percent more than the Turkish price, delivery in six weeks. We spoke to two of their customers, and both were happy.'],
      ['Manager', 'That sounds like the best balance. Let’s go with the local one, but ask them for a sample first.'],
    ], [
      ['Why doesn’t the manager like the cheapest offer?', ['The quality is poor', 'The delivery takes too long', 'The company is too small', 'The price will rise'], 1],
      ['How much more expensive is the Kazakh company?', ['Four percent', 'Six percent', 'Nine percent', 'Ten percent'], 2],
      ['What will they ask the local company for?', ['A sample', 'A discount', 'A longer contract', 'A faster delivery'], 0],
    ]),
  ],
  writing: writing(role, 'pro', [
    ['b1', 'A supplier sent the wrong item. Write a polite email explaining the mistake and what you’d like them to do.', ['Give the order number', 'Explain what you ordered and received', 'Ask for a correct delivery', 'Ask what to do with the wrong item'], 90],
    ['b2', 'Your company depends on one supplier for a key part. Write a short report to your director about the risks and two ways to reduce them.', ['Describe the risk', 'Give an example of what could go wrong', 'Propose two solutions', 'Compare cost and benefit'], 160],
  ]),
  speaking: speaking(role, 'pro', [
    ['a2', 'Describe something your company or a company you know buys, and from where.', ['What it buys', 'Who it buys from', 'How often'], 45],
    ['b1', 'You need a shipment by Friday, but it’s late. Call the supplier and explain what you need.', ['Refer to your order', 'Say why it’s urgent', 'Ask for a clear date'], 60],
    ['b2', 'A supplier wants a 6 percent price rise. Respond by explaining your position and offering something in return for a smaller rise.', ['Ask for the reason', 'Explain why this is difficult', 'Offer a condition'], 90],
  ]),
};
