// Bank items for call centre staff. Original Schood content; companies are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'call_centre';
export const bank: RoleBank = {
  grammar: grammar(role, 'cc', [
    ['a2', 'I ___ you back in five minutes, I promise.', ['call', 'will call', 'am call', 'called'], 1],
    ['b1', 'The customer ___ on hold for ten minutes when the line went dead.', ['has been', 'is', 'had been', 'be'], 2],
    ['b1', 'If the router ___ work after the restart, we send a technician.', ["doesn't", "won't", "didn't", "isn't"], 0],
    ['b2', 'The caller asked why her payment ___ yet.', ["hadn't arrived", "didn't arrive", "hasn't it arrived", "not arrived"], 0],
    ['b2', 'All calls ___ for training and quality purposes.', ['record', 'are recording', 'are being recorded', 'have recorded'], 2],
    ['c1', 'Had the agent checked the account first, the complaint ___ avoided.', ['would be', 'could have been', 'will have been', 'was'], 1],
  ]),
  vocabulary: vocabulary(role, 'cc', [
    ['a2', 'Please stay on the ___. An agent will answer soon.', ['line', 'road', 'wire', 'table'], 0],
    ['a2', 'Agents wear a ___ so they can type while they talk.', ['headset', 'helmet', 'badge', 'keyboard'], 0],
    ['b1', 'Could you ___ for a moment while I check your order?', ['stop', 'hold', 'keep', 'stay'], 1],
    ['b1', 'I will ___ your call to the billing department.', ['carry', 'move', 'transfer', 'deliver'], 2],
    ['b1', 'Before sharing the balance, the agent must ___ the caller’s identity.', ['verify', 'advise', 'approve', 'publish'], 0],
    ['b2', 'A high number of ___ calls shows that callers hang up before anyone answers.', ['dropped', 'abandoned', 'empty', 'failed'], 1],
    ['b2', 'The shift lead agreed to ___ the complaint to the customer care manager.', ['escalate', 'increase', 'elevate', 'promote'], 0],
    ['c1', 'Our first-call ___ rate improved after agents were given more authority.', ['solution', 'closure', 'answer', 'resolution'], 3],
  ]),
  reading: [
    reading('r-cc-01', role, 'b1', 'notice', 'New Verification Rules from Monday', `Dear team,

From Monday, every agent must check two details before giving out any account information. Please ask for the caller's full name and date of birth. If a caller gives the wrong answer twice, do not give any information. Politely ask them to visit a TezNet office with their passport.

This change follows two cases last month when another person got information about a customer's bill. No customer lost money, but we want to protect people better.

Shift leads will listen to five calls per agent next week. These calls will not affect your bonus this month. If you are not sure what to do in a call, put the caller on hold and ask your shift lead.

Thank you,
Kamola, Quality Team`, [
      ['How many details must agents check from Monday?', ['One', 'Two', 'Three', 'Five'], 1],
      ['What should an agent do after two wrong answers?', ['Share only the balance', 'End the call without a word', 'Ask the caller to visit an office with a passport', 'Transfer the call to billing'], 2],
      ['Why is the company making this change?', ['Customers lost a lot of money', 'Someone received information about another customer’s bill', 'Calls were too long', 'The law changed last week'], 1],
      ['What is true about next week’s call checks?', ['They will not affect this month’s bonus', 'Agents will lose their bonus', 'Only new agents are checked', 'Customers will listen to the calls'], 0],
    ]),
  ],
  listening: [
    listening('l-cc-01', role, 'b1', 'call', 'A Missing Refund', [
      ['Agent', 'Thank you for calling Bozor twenty-four. This is Nodira. How can I help you?'],
      ['Caller', "Hello. I returned a pair of shoes two weeks ago, but I still don't have my money."],
      ['Agent', "I'm sorry about that. May I have your order number and your date of birth, please?"],
      ['Caller', 'The order is seven seven one three. My birthday is the second of June, nineteen eighty-eight.'],
      ['Agent', 'Thank you, Mister Rakhimov. I can see we received the shoes on the twentieth, but the refund was sent to an old card.'],
      ['Caller', 'That card is closed now. So where is the money?'],
      ['Agent', 'It came back to us. I can send it to your new card today. You should see it within three working days.'],
      ['Caller', 'All right. Please send me a text message to confirm.'],
      ['Agent', "Of course. I'll send it as soon as we finish this call."],
    ], [
      ['Why is the caller phoning?', ['His shoes have not arrived', 'He has not received his refund', 'He wants to change the size', 'His card was stolen'], 1],
      ['What went wrong?', ['The shoes were lost', 'The order number was wrong', 'The money went to an old card', 'The caller did not return the shoes'], 2],
      ['When should the caller see the money?', ['Today', 'Within three working days', 'Within two weeks', 'On the twentieth'], 1],
      ['What does the caller ask for?', ['A text message', 'A manager', 'A new pair of shoes', 'A letter'], 0],
    ]),
  ],
  writing: writing(role, 'cc', [
    ['b1', 'A customer waited forty minutes on the phone and then was cut off. You have looked at her case. Write her a short email.', ['Apologise for the wait and the lost call', 'Explain what you have done about her problem', 'Say what happens next and when', 'Tell her how to reach you directly'], 90],
    ['b2', 'Your call centre’s average wait time has doubled this month. Write a short report to your manager with likely causes and two practical proposals.', ['State the numbers and the change', 'Give likely causes', 'Propose two actions and what they need', 'Say how you will measure improvement'], 160],
  ]),
  speaking: speaking(role, 'cc', [
    ['a2', 'A caller wants to know your opening hours and how to pay a bill. Say what you tell them.', ['Greet the caller and give your name', 'Give the hours clearly', 'Explain one way to pay'], 45],
    ['b1', 'A customer says their internet is slow. Show how you would find out what is wrong and guide them.', ['Ask two or three clear questions', 'Give step-by-step instructions', 'Say what happens if it does not help'], 60],
    ['b2', 'A customer is angry, has called three times and demands a manager. Speak to them as you would on the call.', ['Show you understand without arguing', 'Say clearly what you will do and when', 'Offer the manager option in a positive way'], 90],
  ]),
};
