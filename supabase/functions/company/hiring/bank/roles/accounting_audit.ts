// Bank items for accounting and audit staff. Original Schood content; companies are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'accounting_audit';
export const bank: RoleBank = {
  grammar: grammar(role, 'acc', [
    ['a2', 'We ___ this invoice yesterday.', ['pay', 'paid', 'pays', 'paying'], 1],
    ['b1', 'The invoice ___ yet, so the supplier is calling us.', ['wasn’t paid', 'hasn’t been paid', 'doesn’t paid', 'isn’t pay'], 1],
    ['b1', 'The report must be finished ___ the end of the week.', ['by', 'until', 'since', 'during'], 0],
    ['b2', 'Profit fell ___ the higher transport costs.', ['because', 'although', 'owing to', 'so that'], 2],
    ['b2', 'If we ___ the bank charge last month, the accounts would have balanced.', ['recorded', 'had recorded', 'have recorded', 'would record'], 1],
    ['c1', 'At no point ___ the auditors find any evidence of fraud.', ['have', 'were', 'did', 'was'], 2],
  ]),
  vocabulary: vocabulary(role, 'acc', [
    ['a2', 'Please send the ___ to the accounts department so we can pay.', ['invoice', 'invite', 'interview', 'insurance'], 0],
    ['a2', 'Keep your ___ to show how much you spent.', ['recipe', 'receipt', 'reception', 'report card'], 1],
    ['b1', 'This invoice is thirty days ___, so please pay it now.', ['overtime', 'overdue', 'overhead', 'overall'], 1],
    ['b1', 'The ___ sheet shows what a company owns and owes.', ['balance', 'bank', 'budget', 'bonus'], 0],
    ['b1', 'Sales were five percent above ___ this quarter.', ['budget', 'bucket', 'building', 'bill'], 0],
    ['b2', 'We have to ___ the bank account at the end of every month.', ['recover', 'recommend', 'reconcile', 'refund'], 2],
    ['b2', 'The auditors asked for a ___ of twenty-five sales invoices.', ['simple', 'sample', 'symbol', 'similar'], 1],
    ['c1', 'Having one person prepare and approve payments is a weakness in internal ___.', ['control', 'contact', 'contract', 'content'], 0],
  ]),
  reading: [
    reading('r-acc-01', role, 'c1', 'report', 'Management Letter: Payment Controls', `During our audit, we reviewed a sample of 60 payments made in the second half of the year. We found no evidence of fraud or material misstatement. However, we identified one weakness in internal control that we believe management should address.

At present, a single employee in the accounts team is able to create new supplier records and also approve payments up to 20,000 dollars. Four of the payments in our sample lacked the second signature required by company policy. While the amounts were correct in each case, this arrangement increases the risk of error or abuse going undetected.

We recommend that these duties be separated. If this isn't practical given the size of the team, the finance manager should review a monthly report of all new suppliers and payments and sign it as evidence of review. Management has agreed to introduce the review from the start of next quarter.`, [
      ['What did the auditors conclude about fraud?', ['They found clear evidence of fraud', 'They found no evidence of fraud', 'They did not check for it', 'They need more time'], 1],
      ['What is the weakness?', ['Payments are too small', 'Suppliers were paid twice', 'One person can create suppliers and approve payments', 'The team is too large'], 2],
      ['What has management agreed to do?', ['Start a monthly review next quarter', 'Hire new staff immediately', 'Stop paying suppliers', 'Dismiss the employee'], 0],
    ]),
  ],
  listening: [
    listening('l-acc-01', role, 'b2', 'meeting', 'The Month-End Review', [
      ['Controller', 'Let’s go through the numbers before they go to head office. Sales are above budget. Why is profit down?'],
      ['Accountant', 'Mainly because of the exchange rate. We lost about ninety thousand dollars on supplier invoices in euros.'],
      ['Controller', 'I thought we had agreed to pay those earlier.'],
      ['Accountant', 'We did, but the bank delayed two transfers. Also, transport costs rose by about twelve percent.'],
      ['Controller', 'All right. Is the transport cost in the accounts yet? We haven’t had the December invoices.'],
      ['Accountant', 'I’ve made an accrual based on last month’s numbers, so profit should be fairly accurate.'],
      ['Controller', 'Good. Please write a short note about both points, and I’ll send it with the report on Friday.'],
    ], [
      ['What is the main reason for the fall in profit?', ['Lower sales', 'The exchange rate', 'Staff costs', 'Higher rent'], 1],
      ['Why was the transport cost accrued?', ['It is a one-off', 'The invoices have not arrived', 'The bank asked for it', 'Head office requires it'], 1],
      ['What will the accountant write?', ['A short note about both points', 'A new budget', 'A letter to the bank', 'A contract with a transport company'], 0],
    ]),
  ],
  writing: writing(role, 'acc', [
    ['b1', 'A colleague’s expense claim has no receipts for two items. Write a short, friendly email explaining what they must do.', ['Say which items are missing', 'Explain the rule', 'Say what to send and by when', 'Offer to help'], 90],
    ['b2', 'Your company’s cash is low even though it made a profit. Write a short report for the director explaining why and recommending two actions.', ['Explain the difference between profit and cash', 'Give the main causes', 'Recommend two actions', 'Say what results you expect'], 160],
  ]),
  speaking: speaking(role, 'acc', [
    ['a2', 'Explain what an accountant does during a normal month.', ['Name two or three tasks', 'Say who they work with', 'Say what is due at month-end'], 45],
    ['b1', 'A customer has not paid an invoice for a month. Call the customer and ask for payment politely.', ['Refer to the invoice', 'Ask when you can expect payment', 'Offer to send a copy'], 60],
    ['b2', 'Explain to a non-finance director why sales rose while profit fell, and what you suggest.', ['Explain simply with one example', 'Give the main reasons', 'Recommend next steps'], 90],
  ]),
};
