// More bank items for the original job roles: role-specific grammar, extra vocabulary and
// the reading and listening texts those roles were missing. Original Schood content; companies are fictional.
import { grammar, listening, reading, vocabulary, type RoleBank } from './_compact.ts';

export const bank: RoleBank = {
  grammar: [
    ...grammar('customer_service', 'cs', [
      ['a2', 'I ___ your order number now. Please wait a moment.', ['check', 'am checking', 'checked', 'checks'], 1],
      ['b1', 'If you ___ the receipt, we can exchange the item today.', ['have', 'will have', 'had had', 'having'], 0],
      ['b1', 'The customer asked me ___ the order would arrive.', ['what', 'when', 'that', 'who'], 1],
      ['b2', 'Your refund ___ within five working days.', ['processes', 'will process', 'will be processed', 'is process'], 2],
      ['b2', 'I would suggest ___ your password first.', ['to changing', 'change', 'changed', 'changing'], 3],
      ['c1', 'Had we known about the fault earlier, we ___ you sooner.', ['would have contacted', 'will contact', 'contacted', 'had contacted'], 0],
    ]),
    ...grammar('sales', 'sal', [
      ['a2', 'This model is ___ than the old one.', ['cheap', 'more cheap', 'cheaper', 'the cheapest'], 2],
      ['b1', 'We ___ to Kazakhstan and Russia since 2020.', ['export', 'have exported', 'are export', 'exporting'], 1],
      ['b1', 'If you order today, you ___ a ten percent discount.', ['will get', 'got', 'would have got', 'getting'], 0],
      ['b2', 'Provided that you order fifty units, we ___ delivery free of charge.', ['offered', 'would offered', 'can offer', 'have offering'], 2],
      ['b2', 'The buyer asked us ___ our price by five percent.', ['reduce', 'reducing', 'to reduce', 'reduced'], 2],
      ['c1', 'Not only ___ our product cheaper, but it also lasts longer.', ['is', 'does', 'has', 'do'], 0],
    ]),
    ...grammar('hospitality', 'hos', [
      ['a2', 'Would you like ___ a room with a view?', ['book', 'booking', 'to book', 'booked'], 2],
      ['b1', 'Breakfast ___ from seven to ten every morning.', ['serves', 'is served', 'serving', 'has serve'], 1],
      ['b1', 'The guest asked if she ___ check out late.', ['can', 'could', 'may be', 'shall to'], 1],
      ['b2', 'Your room ___ by the time you return from dinner.', ['will have been cleaned', 'has cleaned', 'will clean', 'cleaning'], 0],
      ['b2', 'We apologise for the noise, ___ was caused by repairs on the roof.', ['that', 'what', 'which', 'who'], 2],
      ['c1', 'Should you require any further assistance, please ___ hesitate to call reception.', ['not', 'do not', 'no', 'don’t to'], 1],
    ]),
    ...grammar('banking_finance', 'bank', [
      ['a2', 'You ___ your passport to open an account.', ['needs', 'need', 'are need', 'needing'], 1],
      ['b1', 'Interest ___ on the last day of each month.', ['pays', 'is paid', 'paying', 'has pay'], 1],
      ['b1', 'If you miss a payment, the bank ___ you a late fee.', ['will charge', 'charged', 'charging', 'would charged'], 0],
      ['b2', 'The loan ___ only after the documents have been checked.', ['will approve', 'approved', 'will be approved', 'is approving'], 2],
      ['b2', 'Customers must not share their PIN, ___ the person says they work for the bank.', ['since', 'even if', 'so that', 'because'], 1],
      ['c1', 'Rarely ___ such a large transfer been made from this account.', ['has', 'did', 'was', 'is'], 0],
    ]),
    ...grammar('it_software', 'it', [
      ['a2', 'The server ___ down at the moment.', ['are', 'be', 'is', 'am'], 2],
      ['b1', 'We ___ the new version last night, and it works well.', ['deploy', 'deployed', 'are deploy', 'deploying'], 1],
      ['b1', 'The bug appears when a user ___ the wrong date.', ['enters', 'enter', 'entering', 'has enter'], 0],
      ['b2', 'By Friday, we ___ all the critical issues.', ['fix', 'are fix', 'will have fixed', 'fixing'], 2],
      ['b2', 'The report crashed because the data ___ correctly.', ['hadn’t been saved', 'didn’t saved', 'hasn’t save', 'not saved'], 0],
      ['c1', 'Were the database to fail, the system ___ to the backup automatically.', ['switches', 'would switch', 'has switched', 'switched'], 1],
    ]),
    ...grammar('healthcare', 'hc', [
      ['a2', 'How long ___ you had this pain?', ['do', 'are', 'did', 'have'], 3],
      ['b1', 'You ___ take this medicine after meals, as the doctor said.', ['should', 'should to', 'are', 'have'], 0],
      ['b1', 'The patient ___ a fever since yesterday morning.', ['has', 'has had', 'have', 'is having'], 1],
      ['b2', 'Blood tests ___ before the operation takes place.', ['must do', 'must be done', 'must doing', 'must done'], 1],
      ['b2', 'If she had come to the clinic earlier, the infection ___ so serious.', ['would not be', 'will not be', 'would not have been', 'had not been'], 2],
      ['c1', 'Under no circumstances ___ patient records be shared without consent.', ['should', 'do', 'are', 'have'], 0],
    ]),
    ...grammar('logistics', 'log', [
      ['a2', 'The truck ___ at the warehouse at nine this morning.', ['arrive', 'arrived', 'arrives to', 'arriving'], 1],
      ['b1', 'The goods ___ by rail from Tashkent to Riga.', ['carry', 'are carried', 'carrying', 'have carry'], 1],
      ['b1', 'If customs ___ the documents today, the truck can leave.', ['approve', 'will approves', 'approved', 'approving'], 0],
      ['b2', 'The cargo ___ at the border when we called the driver.', ['is checking', 'checked', 'was being checked', 'has checked'], 2],
      ['b2', 'We need to know how much the shipment weighs ___ we can book the truck.', ['before', 'during', 'despite', 'until to'], 0],
      ['c1', 'No sooner had the container left the port ___ the schedule changed.', ['that', 'when', 'than', 'as'], 2],
    ]),
    ...grammar('office_admin', 'off', [
      ['a2', 'Could you ___ these documents, please?', ['copying', 'to copy', 'copied', 'copy'], 3],
      ['b1', 'The meeting ___ to Thursday at two o’clock.', ['has been moved', 'has moved it', 'moved it', 'is move'], 0],
      ['b1', 'Please call me if you ___ any problems with the booking.', ['have', 'will have', 'had had', 'having'], 0],
      ['b2', 'She asked me ___ the invitations before lunch.', ['send', 'sending', 'to send', 'sent'], 2],
      ['b2', 'The room ___ by the time the guests arrive.', ['will have prepared', 'will have been prepared', 'prepared', 'has prepare'], 1],
      ['c1', 'I would appreciate it if you ___ me know by the end of the day.', ['let', 'could let', 'to let', 'letting'], 1],
    ]),
    ...grammar('management', 'mgmt', [
      ['a2', 'Our team ___ a meeting every Monday morning.', ['have', 'has', 'having', 'is have'], 1],
      ['b1', 'I’d like you ___ the report by Friday.', ['finish', 'finishing', 'to finish', 'finished'], 2],
      ['b1', 'Sales ___ by ten percent this quarter.', ['have increased', 'increases', 'has increased', 'increasing'], 0],
      ['b2', 'If we had hired more staff, we ___ the deadline.', ['will meet', 'would meet', 'met', 'would have met'], 3],
      ['b2', 'The director insisted ___ a clear plan before approving the budget.', ['to see', 'on seeing', 'seeing', 'in see'], 1],
      ['c1', 'It is high time we ___ our approach to staff training.', ['reviewed', 'review', 'are reviewing', 'will review'], 0],
    ]),
    ...grammar('engineering', 'eng', [
      ['a2', 'The machine ___ working yesterday afternoon.', ['stops', 'stop', 'stopped', 'stopping'], 2],
      ['b1', 'The parts ___ in Germany and shipped to Navoi.', ['make', 'are made', 'making', 'has made'], 1],
      ['b1', 'If the pressure is too high, the valve ___ automatically.', ['opens', 'opened', 'opening', 'would opened'], 0],
      ['b2', 'The system should ___ before anyone begins the repair.', ['shut down', 'be shut down', 'shutting down', 'shuts down'], 1],
      ['b2', 'The motor has been overheating, ___ suggests a problem with the cooling system.', ['that', 'what', 'which', 'who'], 2],
      ['c1', 'But for regular maintenance, the machine ___ long before now.', ['would have failed', 'would fail', 'failed', 'has failed'], 0],
    ]),
  ],
  vocabulary: [
    ...vocabulary('customer_service', 'cs', [
      ['a2', 'I’m sorry about the problem. How can I ___ you?', ['help', 'hold', 'hear', 'hire'], 0],
      ['b1', 'We sent the customer a ___ after the mistake with her order.', ['refund', 'review', 'request', 'report'], 0],
    ], 4),
    ...vocabulary('sales', 'sal', [
      ['a2', 'We give a ten percent ___ on large orders.', ['discount', 'distance', 'dispute', 'display'], 0],
      ['b1', 'A new ___ visited our stand and asked about our prices.', ['client', 'clerk', 'colleague', 'climate'], 0],
    ], 4),
    ...vocabulary('hospitality', 'hos', [
      ['a2', 'Please leave your key at ___ when you go out.', ['reception', 'recipe', 'recreation', 'receipt'], 0],
      ['b1', 'Guests must ___ of their rooms by noon.', ['check in', 'check out', 'check up', 'check on'], 1],
    ], 4),
    ...vocabulary('banking_finance', 'bank', [
      ['a2', 'I want to ___ some money from my account.', ['borrow', 'lend', 'deliver', 'withdraw'], 3],
      ['b1', 'The ___ on this loan is eighteen percent a year.', ['profit', 'interest', 'income', 'tax'], 1],
    ], 4),
    ...vocabulary('it_software', 'it', [
      ['a2', 'Please enter your username and ___ to log in.', ['passport', 'pass mark', 'password', 'passage'], 2],
      ['b1', 'The developers found and fixed a ___ in the new code.', ['bug', 'bag', 'big', 'bog'], 0],
    ], 4),
    ...vocabulary('healthcare', 'hc', [
      ['a2', 'The nurse measured the patient’s blood ___.', ['weight', 'speed', 'heat', 'pressure'], 3],
      ['b1', 'This medicine can cause side ___ such as a headache.', ['effects', 'affects', 'items', 'issues'], 0],
    ], 4),
    ...vocabulary('logistics', 'log', [
      ['a2', 'All the boxes are stored in the ___.', ['warehouse', 'workshop', 'waiting room', 'window'], 0],
      ['b1', 'The driver must show the ___ note when he delivers the goods.', ['delivery', 'delicious', 'deliver', 'delay'], 0],
    ], 4),
    ...vocabulary('office_admin', 'off', [
      ['a2', 'I need to ___ a meeting room for Thursday.', ['book', 'cook', 'look', 'take off'], 0],
      ['b1', 'Please find the report in the ___ to this email.', ['attachment', 'appointment', 'apartment', 'advertisement'], 0],
    ], 4),
    ...vocabulary('management', 'mgmt', [
      ['a2', 'Our ___ asked us to finish the work by Friday.', ['manager', 'meaning', 'machine', 'mistake'], 0],
      ['b1', 'A good leader knows how to ___ tasks to the team.', ['delegate', 'delete', 'deliver', 'decline'], 0],
    ], 4),
    ...vocabulary('engineering', 'eng', [
      ['a2', 'Please wear your safety ___ when you enter the factory.', ['helmet', 'hammer', 'handle', 'heater'], 0],
      ['b1', 'The machine needs regular ___ to work well.', ['maintenance', 'management', 'measurement', 'mixture'], 0],
    ], 4),
  ],
  reading: [
    reading('r-eng-01', 'engineering', 'b1', 'notice', 'Maintenance on Line 2', `To all production staff,

Production Line 2 will stop on Saturday from 8:00 to 16:00 for planned maintenance. The engineering team will replace the main drive belt and check the safety sensors.

Line 1 will continue to work as usual. Staff who usually work on Line 2 should come to the training room at 8:00 for a safety refresher, which will finish at 12:00. They may then go home and will be paid for the whole shift.

During the work, no one may enter the Line 2 area without a permit from the shift engineer. Warning signs and barriers will be in place. If you have tools or materials near the line, please move them before Friday evening.

Line 2 is expected to start again on Sunday at 6:00.

Rustam Aliev, Chief Engineer`, [
      ['Why will Line 2 stop on Saturday?', ['A breakdown', 'Planned maintenance', 'A holiday', 'New staff training only'], 1],
      ['What must Line 2 staff do at 8:00?', ['Work on Line 1', 'Replace the belt', 'Go to a safety refresher', 'Stay at home'], 2],
      ['What must people do before Friday evening?', ['Move tools and materials from near the line', 'Get a permit', 'Check the sensors', 'Sign the rota'], 0],
    ]),
    reading('r-hc-01', 'healthcare', 'b2', 'policy', 'Visiting Hours and Patient Privacy', `Our private clinic welcomes visitors, as family support helps recovery. However, the comfort and privacy of all patients must come first.

Visiting hours are from 14:00 to 19:00 every day. Patients may have no more than two visitors at a time, and children under twelve must be with an adult. In the intensive care unit, only close family may visit, after speaking to the nurse in charge.

Staff must not give medical information to visitors, including family members, unless the patient has agreed in writing. If a relative phones to ask about a patient, staff should politely explain this rule and offer to pass on a message.

If you have concerns about the care of a patient, please speak to the head nurse. We take all concerns seriously, and we will respond within two working days.`, [
      ['How many visitors can a patient usually have at one time?', ['One', 'Two', 'Three', 'As many as the family wants'], 1],
      ['When can staff give medical details to a relative?', ['Whenever the relative asks', 'Only in visiting hours', 'If the patient has agreed in writing', 'Only by phone'], 2],
      ['What should a person with concerns about care do?', ['Speak to the head nurse', 'Phone the police', 'Write to a newspaper', 'Move the patient'], 0],
    ]),
    reading('r-gen-01', 'general', 'b1', 'email', 'Moving to the New Office', `Dear colleagues,

Our company will move to its new office on 25 Mirzo Ulugbek Street next month. The last working day at the old office will be Friday 15 March. Everyone will start at the new office on Monday 18 March.

Please pack your personal things in the boxes provided by Friday lunchtime, and write your name and floor number on each box. The moving company will take the boxes and computers on Saturday. Do not pack company documents; the office manager will organise these separately.

The new office has a bigger kitchen, two meeting rooms and a free car park for staff. It is ten minutes on foot from the metro station. Your new pass will be on your desk on Monday.

If you have any questions, please contact Malika in the office team.

Best regards,
Timur Ganiev, Director`, [
      ['When will employees start at the new office?', ['Friday 15 March', 'Saturday 16 March', 'Monday 18 March', 'At the end of the month'], 2],
      ['What should people NOT pack?', ['Personal things', 'Company documents', 'Their cups', 'Their books'], 1],
      ['How far is the office from the metro station?', ['Ten minutes on foot', 'Five minutes by car', 'One hour on foot', 'It is next to the station'], 0],
    ]),
    reading('r-sal-01', 'sales', 'c1', 'report', 'Why We Are Losing Repeat Customers', `An analysis of last year’s orders suggests that our sales problem is one of retention rather than acquisition. While the number of new customers grew by 18 percent, only 41 percent of them placed a second order within twelve months, down from 55 percent the previous year.

Exit surveys point to two causes. First, customers complained of inconsistent delivery times, particularly during the export season, when domestic orders were given lower priority. Second, many felt neglected after their first purchase: account managers, rewarded largely for new business, had little incentive to stay in contact.

We therefore propose revising the sales bonus so that a third of it depends on repeat orders, and assigning each customer a named contact for at least a year. Although the change will cost an estimated 3 percent of the bonus budget, even a modest rise in retention should more than cover this.`, [
      ['What is the main sales problem, according to the report?', ['Too few new customers', 'Keeping customers, not finding them', 'Low prices', 'Too many products'], 1],
      ['Why did account managers stay out of touch?', ['They were on holiday', 'Their bonuses rewarded mainly new business', 'They had too many export clients', 'Customers asked them to'], 1],
      ['What does the writer expect the bonus change to do?', ['Pay for itself through better retention', 'Lower delivery times immediately', 'Raise prices by 3 percent', 'Reduce new customers'], 0],
    ]),
  ],
  listening: [
    listening('l-it-01', 'it_software', 'b1', 'meeting', 'The Morning Stand-up', [
      ['Team lead', 'Good morning, everyone. Let’s keep this short. Bobur, how’s the payment page?'],
      ['Developer', 'I finished the design yesterday. Today I’m connecting it to the test server. I should finish by tomorrow.'],
      ['Team lead', 'Good. Any problems?'],
      ['Developer', 'Yes, the test server is very slow. I can’t test properly.'],
      ['Team lead', 'I’ll ask Sevara from the infrastructure team to look at it this morning. Nodira, what about you?'],
      ['Tester', 'I found two bugs in the login page. One is serious: users can’t log in on their phones.'],
      ['Team lead', 'That’s our top priority, then. Bobur, can you help Nodira after lunch? We must fix it before Friday’s release.'],
    ], [
      ['What is Bobur doing today?', ['Designing the page', 'Connecting the page to the test server', 'Writing a report', 'Testing the login page'], 1],
      ['What is the serious bug?', ['Users can’t log in on phones', 'The payment page is slow', 'The server is down', 'The design is wrong'], 0],
      ['When is the release?', ['Today', 'Tomorrow', 'After lunch', 'On Friday'], 3],
    ]),
    listening('l-off-01', 'office_admin', 'a2', 'voicemail', 'A Change to Tomorrow’s Meeting', [
      ['Assistant', 'Hello, Malika, this is Dilnoza from the director’s office. I’m calling about tomorrow’s meeting with the visitors from Almaty.'],
      ['Assistant', 'The meeting was at ten o’clock, but now it is at eleven, because their flight is late.'],
      ['Assistant', 'Please book the big meeting room on the third floor. The small room isn’t free.'],
      ['Assistant', 'There are six visitors, so we need tea and water for ten people.'],
      ['Assistant', 'Please call me back this afternoon if there’s a problem. Thank you. Goodbye.'],
    ], [
      ['What time is the meeting now?', ['At ten o’clock', 'At eleven o’clock', 'At twelve o’clock', 'This afternoon'], 1],
      ['Why has the time changed?', ['The room is not free', 'The director is busy', 'The visitors’ flight is late', 'There is no tea'], 2],
      ['How many people need tea and water?', ['Three', 'Six', 'Eight', 'Ten'], 3],
    ]),
    listening('l-gen-01', 'general', 'b2', 'meeting', 'Working from Home on Fridays', [
      ['Manager', 'Thanks for coming. As you know, several of you have asked about working from home. I’d like to hear what you think before I speak to the director.'],
      ['Employee', 'I think it would really help. My journey takes more than an hour each way, and on Fridays there aren’t many meetings.'],
      ['Manager', 'That’s true, but we have to make sure customers can always reach someone. How would that work?'],
      ['Employee', 'We could take turns. Half the team at home one Friday, and the other half the next week.'],
      ['Manager', 'That sounds fair. How would we check that the work gets done?'],
      ['Employee', 'We already use the task board, so you can see what everybody is doing. We could also have a short online meeting at nine.'],
      ['Manager', 'Good. Let’s suggest a three-month trial, and then look at the results. I’ll write it up today.'],
    ], [
      ['Why does the employee support the idea?', ['The office is too noisy', 'The journey is long and Fridays are quiet', 'Customers asked for it', 'The director suggested it'], 1],
      ['How would they keep customers served?', ['By hiring new staff', 'By closing on Fridays', 'By taking turns at home', 'By calling customers on Mondays'], 2],
      ['What will the manager propose?', ['A three-month trial', 'A permanent change', 'A new task board', 'A longer working day'], 0],
    ]),
    listening('l-mgmt-01', 'management', 'c1', 'meeting', 'Rethinking the Regional Expansion', [
      ['Director', 'Before we commit to opening two more branches, I’d like to look again at whether the assumptions behind last year’s plan still hold.'],
      ['Manager', 'Frankly, I doubt that they do. We assumed the new Samarkand branch would break even within a year, and we’re now projecting closer to two.'],
      ['Director', 'Is that a temporary issue, or does it tell us something about the market?'],
      ['Manager', 'A bit of both. Demand is there, but we underestimated how long it takes to build trust with local customers, and staff turnover has been higher than expected.'],
      ['Director', 'So rather than opening two at once, you’d stagger it?'],
      ['Manager', 'Exactly. I’d open one, using what we’ve learned, and set clear milestones before releasing the money for the second. It costs us time, but it limits our exposure considerably.'],
      ['Director', 'I can support that, as long as we can show the board a realistic timetable.'],
    ], [
      ['What is the director questioning?', ['The choice of staff', 'The assumptions behind the plan', 'The cost of the Samarkand building', 'The board’s members'], 1],
      ['What took longer than expected in Samarkand?', ['Building trust with local customers', 'Finding a building', 'Getting permits', 'Delivering goods'], 0],
      ['What does the manager recommend?', ['Closing the branch', 'Opening two branches at once', 'Opening one branch, with milestones', 'Cancelling the expansion'], 2],
    ]),
  ],
  writing: [],
  speaking: [],
};
