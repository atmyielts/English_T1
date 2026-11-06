// Bank items for retail and shop floor staff. Original Schood content; companies are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'retail';
export const bank: RoleBank = {
  grammar: grammar(role, 'ret', [
    ['a1', 'The fitting rooms ___ at the back of the shop.', ['is', 'are', 'be', 'am'], 1],
    ['a2', 'We ___ any blue scarves left. They sold out yesterday.', ["don't have", "doesn't have", "not have", "aren't have"], 0],
    ['b1', 'This coat is ___ expensive than the one in the window.', ['much', 'most', 'as', 'more'], 3],
    ['b1', 'You can return it ___ you keep the receipt.', ['as long as', 'unless', 'despite', 'even'], 0],
    ['b2', 'The shelves ___ by the time the first customers arrived.', ['filled', 'have filled', 'had been filled', 'are being filled'], 2],
    ['c1', 'Not until the stocktake ___ the shortage become clear.', ['does', 'did', 'has', 'was'], 1],
  ]),
  vocabulary: vocabulary(role, 'ret', [
    ['a2', 'The cashier gave me my ___ and a receipt.', ['change', 'charge', 'exchange', 'chance'], 0],
    ['a2', 'You can try this jacket on in the ___ room.', ['sitting', 'fitting', 'meeting', 'waiting'], 1],
    ['a2', 'All winter boots are on ___ this week: thirty percent off.', ['sell', 'sale', 'sold', 'seller'], 1],
    ['b1', 'I am sorry, this size is out of ___ at the moment.', ['store', 'supply', 'stock', 'shelf'], 2],
    ['b1', 'Please keep the ___ in case you want to return the item.', ['recipe', 'receipt', 'reception', 'record'], 1],
    ['b1', 'The customer asked for a ___ because the toaster was faulty.', ['refund', 'rebate', 'return ticket', 'repay'], 0],
    ['b2', 'The company tested a ___ card that gives regular shoppers extra points.', ['loyalty', 'honesty', 'security', 'credit limit'], 0],
    ['b2', 'Too many items were lost to ___ last month, so we added cameras near the exit.', ['shoplifting', 'lifting', 'overselling', 'discounting'], 0],
  ]),
  reading: [
    reading('r-ret-01', role, 'a2', 'notice', 'Return Rules at Our Shop', `Dear customers,

You can return or exchange most items within 14 days. Please bring the item with its label and your receipt. If you paid by card, we can also find your payment on our system.

We cannot take back underwear, swimwear or items that have been worn. Sale items can be exchanged but not refunded.

If a product is faulty, please come back as soon as possible. We will repair it, replace it or give you your money back.

For help, please ask at the service desk on the first floor. It is open from 10:00 to 21:00.

Thank you for shopping with us.
Chorsu Style`, [
      ['How long do customers have to return most items?', ['7 days', '14 days', '21 days', '30 days'], 1],
      ['What can happen with a sale item?', ['It can only be exchanged', 'It can be refunded', 'It cannot be exchanged', 'It must be repaired'], 0],
      ['Where is the service desk?', ['Next to the exit', 'On the ground floor', 'On the first floor', 'In the car park'], 2],
    ]),
  ],
  listening: [
    listening('l-ret-01', role, 'a2', 'announcement', 'A Message for Shoppers', [
      ['Announcer', 'Good evening, shoppers, and welcome to Bahor Market. We hope you are enjoying your visit.'],
      ['Announcer', 'Today only, all fresh bread is half price after seven o’clock. You can find it near the entrance.'],
      ['Announcer', 'Our fruit and vegetables are on sale until Sunday. Buy two kilos of apples and get one kilo free.'],
      ['Announcer', 'Please note that we close at ten o’clock tonight. Tills four and five will close at nine thirty.'],
      ['Announcer', 'If you need help, please ask any member of staff in a green jacket. Thank you for shopping with us.'],
    ], [
      ['When is bread half price?', ['All day', 'After seven o’clock', 'Before ten o’clock', 'On Sunday'], 1],
      ['What is the offer on apples?', ['Half price', 'Two kilos free', 'Buy two kilos, get one free', 'Ten percent off'], 2],
      ['What are staff wearing?', ['Green jackets', 'Blue shirts', 'Red hats', 'Black jackets'], 0],
    ]),
  ],
  writing: writing(role, 'ret', [
    ['b1', 'A customer emailed to say a kettle she bought at your shop stopped working after one week. Write a reply explaining what she can do.', ['Apologise and thank her for writing', 'Explain repair, replacement or refund', 'Say what to bring and where', 'Offer further help'], 90],
    ['b2', 'Sales fell last month at your branch, while returns went up. Write a short report for the area manager with reasons and two suggestions.', ['Describe the change in sales and returns', 'Give likely reasons', 'Make two practical suggestions', 'Say what support you need'], 160],
  ]),
  speaking: speaking(role, 'ret', [
    ['a2', 'Describe the shop where you work or would like to work. What does it sell and what do staff do every day?', ['What the shop sells', 'Two or three daily tasks', 'What customers often ask for'], 45],
    ['b1', 'A customer wants to return shoes without a receipt. Say what you tell them.', ['Show you want to help', 'Explain the rule', 'Suggest a solution'], 60],
    ['b2', 'A customer cannot decide between a cheaper product and a better one. Compare them and give advice without pushing.', ['Ask about their needs', 'Compare the two honestly', 'Recommend and leave the choice to them'], 90],
  ]),
};
