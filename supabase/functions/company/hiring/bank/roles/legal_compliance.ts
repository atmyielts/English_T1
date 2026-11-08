// Bank items for legal and compliance staff. Original Schood content; companies are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'legal_compliance';
export const bank: RoleBank = {
  grammar: grammar(role, 'leg', [
    ['a2', 'We ___ this contract last Friday.', ['sign', 'signs', 'signed', 'signing'], 2],
    ['b1', 'The contract ___ by both parties before work can begin.', ['must be signed', 'must sign', 'must signing', 'must to sign'], 0],
    ['b1', 'If the supplier delivers late, we ___ the right to end the contract.', ['had', 'have', 'would had', 'having'], 1],
    ['b2', 'Neither party may transfer its rights ___ the written consent of the other.', ['besides', 'unless', 'without', 'except'], 2],
    ['b2', 'The director denied ___ any gifts from the supplier.', ['to receive', 'receiving', 'receive', 'received'], 1],
    ['c1', 'Should either party ___ this clause, the other may terminate the agreement.', ['breached', 'breaching', 'to breach', 'breach'], 3],
  ]),
  vocabulary: vocabulary(role, 'leg', [
    ['a2', 'Please write your ___ at the bottom of the page.', ['signature', 'single', 'sign up', 'signal'], 0],
    ['a2', 'Both companies are ___ to this agreement.', ['persons', 'parties', 'groups', 'partners'], 1],
    ['b1', 'Each section of a contract is usually called a ___.', ['claim', 'cause', 'clause', 'close'], 2],
    ['b1', 'Our lawyer sent back the ___ with some changes.', ['draft', 'drift', 'draw', 'graft'], 0],
    ['b1', 'A payment made to influence a tender decision is a ___.', ['bonus', 'bribe', 'bid', 'budget'], 1],
    ['b2', 'A personal link to a supplier can be a conflict of ___.', ['interest', 'rights', 'duty', 'influence'], 0],
    ['b2', 'Before working with a new distributor, we carry out due ___.', ['duty', 'dilemma', 'decision', 'diligence'], 3],
    ['c1', 'The parties agreed to settle disputes by ___ rather than going to court.', ['arrangement', 'arbitration', 'argument', 'assessment'], 1],
  ]),
  reading: [
    reading('r-leg-01', role, 'b2', 'policy', 'Gifts and Hospitality: Staff Policy', `Navbahor Group expects every employee to act honestly and to avoid situations where personal benefit could influence a business decision.

Small gifts of low value, such as a calendar or a box of sweets, may be accepted if they are given openly and not in connection with a decision. Any gift or hospitality above the value set each year by the Compliance Team must be recorded on the declaration form within five working days.

No gift of any value may be accepted from a supplier taking part in a current tender. Gifts of cash, or anything that can easily be exchanged for cash, are never allowed.

If you are not sure, ask the Compliance Team before accepting. You will never be criticised for asking. Reports of possible breaches can be made in confidence, and no one will be punished for reporting honestly.`, [
      ['When must a gift above the set value be recorded?', ['On the same day', 'Within five working days', 'Within one month', 'At the end of the year'], 1],
      ['Which gift can never be accepted?', ['A calendar', 'A box of sweets given openly', 'A gift from a supplier in a current tender', 'A low-value item unrelated to a decision'], 2],
      ['What does the policy say about asking the Compliance Team?', ['You will never be criticised for asking', 'You must ask in writing', 'Only managers can ask', 'It may affect your bonus'], 0],
    ]),
  ],
  listening: [
    listening('l-leg-01', role, 'b2', 'meeting', 'Reviewing a Supplier Contract', [
      ['Lawyer', 'Thanks for coming, Oybek. I have read the supply contract, and I see three points we should change before signing.'],
      ['Manager', 'Is it serious? The supplier wants an answer by Friday, and we need these materials.'],
      ['Lawyer', 'Two points are simple. The payment period is only fifteen days, and our finance team needs thirty.'],
      ['Manager', 'That should be fine. They have accepted thirty before. And the second one?'],
      ['Lawyer', 'They can change the delivery date with only three days’ notice. I suggest asking for ten.'],
      ['Manager', 'Agreed. What about the third point?'],
      ['Lawyer', 'That one matters more. Our liability has no limit, but theirs does. I would not sign until it is the same for both sides.'],
      ['Manager', 'All right. I’ll call them today. Can you send me the wording?'],
      ['Lawyer', 'Yes, you will have it within the hour.'],
    ], [
      ['How long does the finance team need to pay?', ['Three days', 'Ten days', 'Fifteen days', 'Thirty days'], 3],
      ['Which point does the lawyer think is most important?', ['The payment period', 'The delivery date notice', 'The liability limit', 'The Friday deadline'], 2],
      ['What will the manager do today?', ['Sign the contract', 'Call the supplier', 'Find a new supplier', 'Talk to finance'], 1],
    ]),
  ],
  writing: writing(role, 'leg', [
    ['b1', 'A sales colleague has asked what to do with a confidential file from a former employer. Write a short email with clear advice.', ['Say what they should not do', 'Explain the risk simply', 'Say what to do next', 'Offer to discuss'], 90],
    ['b2', 'Your company wants to start selling in a new Central Asian market. Write a short memo for management listing the main legal and compliance points to check first.', ['State the purpose of the memo', 'List three or four main risks', 'Recommend next steps and who does them', 'Mention getting local legal advice'], 160],
  ]),
  speaking: speaking(role, 'leg', [
    ['a2', 'Describe what a legal or compliance team does in a company.', ['Name two or three tasks', 'Say who they help', 'Say why it is useful'], 45],
    ['b1', 'A colleague wants to sign a contract today without reading it. Explain why this is a problem and what you suggest.', ['Explain the risk simply', 'Suggest a quick next step', 'Stay friendly'], 60],
    ['b2', 'A senior manager wants to use a supplier owned by his relative. Raise the concern with him respectfully and explain what should happen.', ['State the concern without accusing', 'Explain the policy reason', 'Propose a fair process'], 90],
  ]),
};
