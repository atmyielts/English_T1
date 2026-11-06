// Original Schood workplace vocabulary items: general workplace words plus job-role terms, one gap each.
import type { ChoiceItem } from './types.ts';

export const VOCABULARY: ChoiceItem[] = [
  // General workplace vocabulary (30)
  { id: 'v-gen-01', skill: 'vocabulary', level: 'a1', job_role: 'general', prompt: 'Please write your name and phone ___ on this form.', options: ['number', 'address', 'street', 'code'], answer: 0 },
  { id: 'v-gen-02', skill: 'vocabulary', level: 'a1', job_role: 'general', prompt: 'I start work at nine and finish at six. My lunch ___ is one hour.', options: ['stop', 'break', 'rest', 'pause'], answer: 1 },
  { id: 'v-gen-03', skill: 'vocabulary', level: 'a1', job_role: 'general', prompt: 'Our office is on the third ___ of the building, next to the lift.', options: ['stair', 'stage', 'floor', 'room'], answer: 2 },
  { id: 'v-gen-04', skill: 'vocabulary', level: 'a1', job_role: 'general', prompt: 'Can I ___ a question about my work schedule?', options: ['say', 'tell', 'speak', 'ask'], answer: 3 },
  { id: 'v-gen-05', skill: 'vocabulary', level: 'a1', job_role: 'general', prompt: 'The office is ___ on Sundays. It opens again on Monday morning.', options: ['closed', 'open', 'busy', 'free'], answer: 0 },
  { id: 'v-gen-06', skill: 'vocabulary', level: 'a2', job_role: 'general', prompt: 'I\'m sorry, Mr Karimov is in a meeting. Can I take a ___?', options: ['paper', 'message', 'letter', 'word'], answer: 1 },
  { id: 'v-gen-07', skill: 'vocabulary', level: 'a2', job_role: 'general', prompt: 'Please ___ the form and give it to the receptionist.', options: ['fill up', 'full in', 'fill in', 'fill on'], answer: 2 },
  { id: 'v-gen-08', skill: 'vocabulary', level: 'a2', job_role: 'general', prompt: 'I\'d like to ___ an appointment with the bank manager for Thursday.', options: ['do', 'take', 'put', 'make'], answer: 3 },
  { id: 'v-gen-09', skill: 'vocabulary', level: 'a2', job_role: 'general', prompt: 'Malika got a ___ last month; she is now head of the sales team.', options: ['promotion', 'vacation', 'direction', 'reception'], answer: 0 },
  { id: 'v-gen-10', skill: 'vocabulary', level: 'a2', job_role: 'general', prompt: 'Please ___ me know if you need any help with the new software.', options: ['make', 'tell', 'let', 'give'], answer: 2 },
  { id: 'v-gen-11', skill: 'vocabulary', level: 'b1', job_role: 'general', prompt: 'We must ___ the deadline, or the client will cancel the contract.', options: ['catch', 'meet', 'win', 'pass'], answer: 1 },
  { id: 'v-gen-12', skill: 'vocabulary', level: 'b1', job_role: 'general', prompt: 'Could you ___ the meeting until next Thursday? I\'m in Samarkand on Tuesday.', options: ['put out', 'put up', 'put on', 'put off'], answer: 3 },
  { id: 'v-gen-13', skill: 'vocabulary', level: 'b1', job_role: 'general', prompt: 'Rustam is ___ for training all new staff in the warehouse.', options: ['charged', 'capable', 'responsible', 'in charge'], answer: 2 },
  { id: 'v-gen-14', skill: 'vocabulary', level: 'b1', job_role: 'general', prompt: 'Please find the updated price list ___ to this email.', options: ['attached', 'included', 'enclosed', 'joined'], answer: 0 },
  { id: 'v-gen-15', skill: 'vocabulary', level: 'b1', job_role: 'general', prompt: 'I\'m calling to ___ my reservation for Friday evening.', options: ['conform', 'confirm', 'affirm', 'assure'], answer: 1 },
  { id: 'v-gen-16', skill: 'vocabulary', level: 'b1', job_role: 'general', prompt: 'The new manager made a good ___ on the team at her first meeting.', options: ['expression', 'opinion', 'effect', 'impression'], answer: 3 },
  { id: 'v-gen-17', skill: 'vocabulary', level: 'b2', job_role: 'general', prompt: 'Our team leader asked us to ___ ideas for reducing paper use in the office.', options: ['come down with', 'come across', 'come up with', 'come out'], answer: 2 },
  { id: 'v-gen-18', skill: 'vocabulary', level: 'b2', job_role: 'general', prompt: 'The two departments need to share plans to avoid ___ of effort.', options: ['repetition', 'duplication', 'copying', 'doubling'], answer: 1 },
  { id: 'v-gen-19', skill: 'vocabulary', level: 'b2', job_role: 'general', prompt: 'Due to rising costs, the company has ___ a freeze on hiring until next year.', options: ['composed', 'exposed', 'disposed', 'imposed'], answer: 3 },
  { id: 'v-gen-20', skill: 'vocabulary', level: 'b2', job_role: 'general', prompt: 'The audit found several ___ between the invoices and the bank statements.', options: ['discrepancies', 'disagreements', 'discussions', 'distinctions'], answer: 0 },
  { id: 'v-gen-21', skill: 'vocabulary', level: 'b2', job_role: 'general', prompt: 'We need to ___ the pros and cons before choosing a new supplier.', options: ['weigh down', 'weigh up', 'weigh in', 'weigh out'], answer: 1 },
  { id: 'v-gen-22', skill: 'vocabulary', level: 'b2', job_role: 'general', prompt: 'The project ran ___ budget because of unexpected repair costs.', options: ['above', 'beyond', 'over', 'out'], answer: 2 },
  { id: 'v-gen-23', skill: 'vocabulary', level: 'c1', job_role: 'general', prompt: 'The new leave policy will come into ___ on 1 January.', options: ['affect', 'power', 'action', 'effect'], answer: 3 },
  { id: 'v-gen-24', skill: 'vocabulary', level: 'c1', job_role: 'general', prompt: 'The merger is still subject to ___ approval from the central bank.', options: ['regular', 'regulatory', 'regulated', 'regulating'], answer: 1 },
  { id: 'v-gen-25', skill: 'vocabulary', level: 'c1', job_role: 'general', prompt: 'Let\'s not ___ conclusions before we see the full report.', options: ['jump at', 'jump on', 'jump to', 'jump into'], answer: 2 },
  { id: 'v-gen-26', skill: 'vocabulary', level: 'c1', job_role: 'general', prompt: 'The director\'s speech was deliberately ___, leaving staff unsure whether jobs were at risk.', options: ['ambitious', 'anonymous', 'amicable', 'ambiguous'], answer: 3 },
  { id: 'v-gen-27', skill: 'vocabulary', level: 'c1', job_role: 'general', prompt: 'Customers who pay late will ___ a fee of 2% per month.', options: ['incur', 'occur', 'recur', 'concur'], answer: 0 },
  { id: 'v-gen-28', skill: 'vocabulary', level: 'c1', job_role: 'general', prompt: 'Her proposal received ___ support from the board; every member voted for it.', options: ['anonymous', 'unanimous', 'unilateral', 'uniform'], answer: 1 },
  { id: 'v-gen-29', skill: 'vocabulary', level: 'c2', job_role: 'general', prompt: 'The negotiations reached an ___, with neither side willing to compromise.', options: ['impulse', 'impetus', 'impasse', 'impact'], answer: 2 },
  { id: 'v-gen-30', skill: 'vocabulary', level: 'c2', job_role: 'general', prompt: 'The new director\'s arrival acted as a ___ for long-overdue change in the department.', options: ['catalogue', 'category', 'cataract', 'catalyst'], answer: 3 },

  // Customer service
  { id: 'v-cs-01', skill: 'vocabulary', level: 'a2', job_role: 'customer_service', prompt: 'If you are not happy with the product, we will give you a full ___.', options: ['return', 'refund', 'repay', 'receipt'], answer: 1 },
  { id: 'v-cs-02', skill: 'vocabulary', level: 'b1', job_role: 'customer_service', prompt: 'Thank you for your patience. Please ___ while I check your account details.', options: ['hold up', 'hold out', 'hold on', 'hold off'], answer: 2 },
  { id: 'v-cs-03', skill: 'vocabulary', level: 'b1', job_role: 'customer_service', prompt: 'I\'m very sorry for the ___ this delay has caused you.', options: ['inconvenient', 'convenience', 'inconveniently', 'inconvenience'], answer: 3 },
  { id: 'v-cs-04', skill: 'vocabulary', level: 'b2', job_role: 'customer_service', prompt: 'We aim to solve every query on the first call, so first-call ___ is a key target for the team.', options: ['resolution', 'solution', 'resolve', 'dissolution'], answer: 0 },

  // Sales
  { id: 'v-sal-01', skill: 'vocabulary', level: 'a2', job_role: 'sales', prompt: 'The customer wants to ___ an order for 200 notebooks.', options: ['do', 'put', 'place', 'give'], answer: 2 },
  { id: 'v-sal-02', skill: 'vocabulary', level: 'b1', job_role: 'sales', prompt: 'If you buy more than 50 units, we can offer you a 10% ___.', options: ['discharge', 'deduction', 'discourse', 'discount'], answer: 3 },
  { id: 'v-sal-03', skill: 'vocabulary', level: 'b1', job_role: 'sales', prompt: 'Our sales ___ for this quarter is 500 new contracts, and we have already signed 320.', options: ['aim', 'target', 'object', 'point'], answer: 1 },
  { id: 'v-sal-04', skill: 'vocabulary', level: 'b2', job_role: 'sales', prompt: 'The client is interested, but we still need to ___ the deal before the end of the month.', options: ['close', 'shut', 'finish', 'end'], answer: 0 },

  // Hospitality
  { id: 'v-hos-01', skill: 'vocabulary', level: 'a2', job_role: 'hospitality', prompt: 'Guests can ___ from 2 p.m. and must leave their rooms by 12 noon.', options: ['check out', 'check in', 'check up', 'check on'], answer: 1 },
  { id: 'v-hos-02', skill: 'vocabulary', level: 'b1', job_role: 'hospitality', prompt: 'I\'m afraid the hotel is fully ___ for the Navruz holiday.', options: ['ordered', 'paid', 'booked', 'filled'], answer: 2 },
  { id: 'v-hos-03', skill: 'vocabulary', level: 'b1', job_role: 'hospitality', prompt: 'Would you like us to arrange an airport ___ for your arrival tomorrow?', options: ['transit', 'transition', 'transform', 'transfer'], answer: 3 },
  { id: 'v-hos-04', skill: 'vocabulary', level: 'b2', job_role: 'hospitality', prompt: 'All rooms come with complimentary ___, including toiletries, slippers and bottled water.', options: ['amenities', 'amendments', 'amusements', 'ammunition'], answer: 0 },

  // Banking and finance
  { id: 'v-bank-01', skill: 'vocabulary', level: 'b1', job_role: 'banking_finance', prompt: 'If you spend more money than you have in your account, you will have an ___.', options: ['overtime', 'overdraft', 'overcharge', 'overload'], answer: 1 },
  { id: 'v-bank-02', skill: 'vocabulary', level: 'b1', job_role: 'banking_finance', prompt: 'The customer wants to ___ 2 million soums from her savings account.', options: ['withhold', 'withstand', 'withdraw', 'retire'], answer: 2 },
  { id: 'v-bank-03', skill: 'vocabulary', level: 'b2', job_role: 'banking_finance', prompt: 'The bank charges 18% annual ___ on personal loans.', options: ['profit', 'income', 'interests', 'interest'], answer: 3 },
  { id: 'v-bank-04', skill: 'vocabulary', level: 'c1', job_role: 'banking_finance', prompt: 'The borrower offered his apartment as ___ for the business loan.', options: ['collateral', 'collaboration', 'colleague', 'collection'], answer: 0 },

  // IT and software
  { id: 'v-it-01', skill: 'vocabulary', level: 'b1', job_role: 'it_software', prompt: 'The app crashes when users upload large files; the developers are trying to fix the ___.', options: ['insect', 'bug', 'virus', 'worm'], answer: 1 },
  { id: 'v-it-02', skill: 'vocabulary', level: 'b1', job_role: 'it_software', prompt: 'Remember to ___ up your files to the cloud every evening.', options: ['save', 'store', 'back', 'copy'], answer: 2 },
  { id: 'v-it-03', skill: 'vocabulary', level: 'b2', job_role: 'it_software', prompt: 'We plan to ___ the new version to production on Friday night, when traffic is low.', options: ['employ', 'deplore', 'display', 'deploy'], answer: 3 },
  { id: 'v-it-04', skill: 'vocabulary', level: 'c1', job_role: 'it_software', prompt: 'The platform is highly ___, so it can handle ten times more users without major changes.', options: ['scalable', 'scaly', 'measurable', 'sizeable'], answer: 0 },

  // Healthcare
  { id: 'v-hc-01', skill: 'vocabulary', level: 'a2', job_role: 'healthcare', prompt: 'The doctor wrote a ___ for antibiotics, and the patient took it to the pharmacy.', options: ['description', 'prescription', 'receipt', 'subscription'], answer: 1 },
  { id: 'v-hc-02', skill: 'vocabulary', level: 'b1', job_role: 'healthcare', prompt: 'The nurse checked the patient\'s blood ___ and temperature.', options: ['press', 'force', 'pressure', 'pressing'], answer: 2 },
  { id: 'v-hc-03', skill: 'vocabulary', level: 'b1', job_role: 'healthcare', prompt: 'Mr Yusupov has an ___ with Dr Aliyeva at 10:30 tomorrow morning.', options: ['engagement', 'date', 'arrangement', 'appointment'], answer: 3 },
  { id: 'v-hc-04', skill: 'vocabulary', level: 'b2', job_role: 'healthcare', prompt: 'The patient was ___ from hospital after three days and told to rest at home.', options: ['discharged', 'dismissed', 'fired', 'resigned'], answer: 0 },

  // Logistics
  { id: 'v-log-01', skill: 'vocabulary', level: 'a2', job_role: 'logistics', prompt: 'The driver will ___ the goods to the warehouse on Monday morning.', options: ['receive', 'deliver', 'order', 'borrow'], answer: 1 },
  { id: 'v-log-02', skill: 'vocabulary', level: 'b1', job_role: 'logistics', prompt: 'You can follow your parcel online using the ___ number in the email.', options: ['trucking', 'training', 'tracking', 'trading'], answer: 2 },
  { id: 'v-log-03', skill: 'vocabulary', level: 'b1', job_role: 'logistics', prompt: 'The goods are still waiting for customs ___ at the Tashkent terminal.', options: ['cleaning', 'clearness', 'clarity', 'clearance'], answer: 3 },
  { id: 'v-log-04', skill: 'vocabulary', level: 'b2', job_role: 'logistics', prompt: 'Check each delivery against the ___ list to make sure no boxes are missing.', options: ['packing', 'packaging', 'package', 'packet'], answer: 0 },

  // Office administration
  { id: 'v-off-01', skill: 'vocabulary', level: 'a2', job_role: 'office_admin', prompt: 'Can you ___ ten copies of this document for the meeting?', options: ['do', 'make', 'take', 'write'], answer: 1 },
  { id: 'v-off-02', skill: 'vocabulary', level: 'b1', job_role: 'office_admin', prompt: 'Malika took the ___ of the meeting and emailed them to everyone afterwards.', options: ['hours', 'seconds', 'minutes', 'moments'], answer: 2 },
  { id: 'v-off-03', skill: 'vocabulary', level: 'b1', job_role: 'office_admin', prompt: 'Please ___ these contracts in the cabinet in alphabetical order.', options: ['fill', 'feel', 'fold', 'file'], answer: 3 },
  { id: 'v-off-04', skill: 'vocabulary', level: 'b2', job_role: 'office_admin', prompt: 'All orders for stationery must be ___ by your line manager before purchase.', options: ['approved', 'approached', 'applied', 'appealed'], answer: 0 },

  // Management
  { id: 'v-mgmt-01', skill: 'vocabulary', level: 'b1', job_role: 'management', prompt: 'Every Monday our manager ___ tasks to each member of the team.', options: ['assumes', 'assigns', 'assists', 'assures'], answer: 1 },
  { id: 'v-mgmt-02', skill: 'vocabulary', level: 'b1', job_role: 'management', prompt: 'The team leader gave Aziza useful ___ on her presentation.', options: ['feed', 'comeback', 'feedback', 'backfeed'], answer: 2 },
  { id: 'v-mgmt-03', skill: 'vocabulary', level: 'b2', job_role: 'management', prompt: 'We measure performance against clear ___, such as response time and sales per employee.', options: ['IOUs', 'FAQs', 'CVs', 'KPIs'], answer: 3 },
  { id: 'v-mgmt-04', skill: 'vocabulary', level: 'c1', job_role: 'management', prompt: 'Good managers ___ authority so that team members can make decisions on their own.', options: ['delegate', 'relegate', 'designate', 'deviate'], answer: 0 },

  // Engineering
  { id: 'v-eng-01', skill: 'vocabulary', level: 'b1', job_role: 'engineering', prompt: 'The production line is switched off every Sunday for routine ___.', options: ['maintaining', 'maintenance', 'maintained', 'maintainer'], answer: 1 },
  { id: 'v-eng-02', skill: 'vocabulary', level: 'b1', job_role: 'engineering', prompt: 'Wear safety ___ to protect your eyes when using the cutting machine.', options: ['gloves', 'boots', 'goggles', 'helmets'], answer: 2 },
  { id: 'v-eng-03', skill: 'vocabulary', level: 'b2', job_role: 'engineering', prompt: 'The part must be 50 mm long, with a ___ of plus or minus 0.1 mm.', options: ['toleration', 'tolerant', 'tolerating', 'tolerance'], answer: 3 },
  { id: 'v-eng-04', skill: 'vocabulary', level: 'c1', job_role: 'engineering', prompt: 'The bridge design was rejected because it did not ___ with the new safety regulations.', options: ['comply', 'complete', 'compile', 'compete'], answer: 0 },
];
