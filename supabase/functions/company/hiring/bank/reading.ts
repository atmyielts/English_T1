// Original Schood workplace reading texts (A2–C1) with multiple-choice questions.
import type { ReadingText } from './types.ts';

export const READING: ReadingText[] = [
  // ---------------------------------------------------------------- A2
  {
    id: 'r-a2-01',
    skill: 'reading',
    level: 'a2',
    job_role: 'hospitality',
    genre: 'notice',
    title: 'Guest Notice: Swimming Pool and Fitness Room',
    text: `Dear guests,

From Monday 3 June, the swimming pool on the ground floor will be closed for cleaning. It will open again on Thursday 6 June at 7:00.

During this time, you can use the fitness room on the second floor. It is open every day from 6:00 to 22:00. Towels and water are free. Please bring your room key card to open the door.

Children under 14 can use the fitness room only with an adult.

If you have any questions, please call reception or visit the front desk.

Thank you,
Hotel Management, Samarkand`,
    questions: [
      {
        id: 'r-a2-01-q1',
        prompt: 'Why is the swimming pool closed?',
        options: ['It is being repaired.', 'It is too cold.', 'It is booked for a private event.', 'It is being cleaned.'],
        answer: 3,
      },
      {
        id: 'r-a2-01-q2',
        prompt: 'Where is the fitness room?',
        options: ['On the ground floor', 'Next to reception', 'On the second floor', 'In the garden'],
        answer: 2,
      },
      {
        id: 'r-a2-01-q3',
        prompt: 'What do guests need to open the fitness room door?',
        options: ['Their room key card', 'A ticket from reception', 'Their passport', 'A towel'],
        answer: 0,
      },
    ],
  },
  {
    id: 'r-a2-02',
    skill: 'reading',
    level: 'a2',
    job_role: 'general',
    genre: 'email',
    title: 'Your First Day at the Office',
    text: `Hi Jasur,

Welcome to the team! We are very happy that you are joining us on Monday.

Please come to the office at 8:45. Our address is 15 Amir Temur Street, Tashkent, fourth floor. Bring your passport with you, because the security desk needs it to make your pass.

At 9:00 you will meet Malika from HR. She will show you the office and give you your laptop. After lunch, you will have a short meeting with me about your work for the first week.

Lunch is at 13:00 in the kitchen on our floor. On Mondays, the company pays for lunch.

See you soon,
Aziza Karimova
Office Manager`,
    questions: [
      {
        id: 'r-a2-02-q1',
        prompt: 'What time should Jasur arrive on Monday?',
        options: ['8:30', '9:00', '8:45', '13:00'],
        answer: 2,
      },
      {
        id: 'r-a2-02-q2',
        prompt: 'Why does Jasur need his passport?',
        options: ['To open a bank account', 'To get a security pass', 'To sign his contract', 'To get a laptop'],
        answer: 1,
      },
      {
        id: 'r-a2-02-q3',
        prompt: 'Who will Jasur meet after lunch?',
        options: ['Aziza, the office manager', 'Malika from HR', 'The security team', 'The company director'],
        answer: 0,
      },
    ],
  },
  {
    id: 'r-a2-03',
    skill: 'reading',
    level: 'a2',
    job_role: 'logistics',
    genre: 'chat',
    title: 'Team Chat: The Truck from Almaty',
    text: `Bekzod (08:05): Good morning, Olga. The truck from Almaty is late. The driver called me ten minutes ago.

Olga (08:07): Oh no. What happened?

Bekzod (08:08): There was a very long queue at the border. He thinks he will arrive at about 14:00, not 10:00.

Olga (08:10): OK. The warehouse team has lunch at 13:00. Can they unload the truck at 14:00?

Bekzod (08:12): Yes, I asked Timur. His team can do it. But we need to tell the shop in Chilanzar. They are waiting for the boxes this morning.

Olga (08:13): I will call the shop now and tell them the delivery is this evening.

Bekzod (08:14): Great, thanks!`,
    questions: [
      {
        id: 'r-a2-03-q1',
        prompt: 'Why is the truck late?',
        options: ['It broke down.', 'The driver was ill.', 'The weather was bad.', 'There was a long queue at the border.'],
        answer: 3,
      },
      {
        id: 'r-a2-03-q2',
        prompt: 'What time will the truck probably arrive?',
        options: ['10:00', '13:00', '14:00', '18:00'],
        answer: 2,
      },
      {
        id: 'r-a2-03-q3',
        prompt: 'What will Olga do next?',
        options: ['Call the shop', 'Call the driver', 'Talk to Timur', 'Unload the boxes'],
        answer: 0,
      },
    ],
  },

  // ---------------------------------------------------------------- B1
  {
    id: 'r-b1-01',
    skill: 'reading',
    level: 'b1',
    job_role: 'general',
    genre: 'notice',
    title: 'Planned Electricity Shutdown on Saturday',
    text: `NOTICE TO ALL STAFF

This weekend the building management company will replace the main electrical panel in our business centre. Because of this work, there will be no electricity in the whole building on Saturday from 8:00 until about 18:00. The lifts, internet and air conditioning will also be off.

Before you leave on Friday, please do the following:

- Save your work and shut down your computer completely. Do not leave it in sleep mode.
- Unplug kettles, printers and other small equipment in the kitchen and meeting rooms.
- Take home any food you want to keep from the shared fridge. It will be emptied and cleaned on Friday at 17:30.

The IT team will check the servers on Sunday morning, so all internal systems should work as normal on Monday.

Staff who planned to work in the office on Saturday should work from home instead. If this is not possible, please speak to your line manager by Thursday.

Facilities Team`,
    questions: [
      {
        id: 'r-b1-01-q1',
        prompt: 'What is the main purpose of the notice?',
        options: [
          'To announce new office opening hours',
          'To tell staff about a power cut and how to prepare for it',
          'To ask staff to come in on Saturday',
          'To introduce the new IT team',
        ],
        answer: 1,
      },
      {
        id: 'r-b1-01-q2',
        prompt: 'What should staff do with their computers on Friday?',
        options: ['Leave them in sleep mode', 'Give them to the IT team', 'Turn them off completely', 'Take them home'],
        answer: 2,
      },
      {
        id: 'r-b1-01-q3',
        prompt: 'What will happen to the shared fridge?',
        options: [
          'It will be replaced with a new one.',
          'It will be moved to another floor.',
          'It will be used to store IT equipment.',
          'It will be emptied and cleaned on Friday.',
        ],
        answer: 3,
      },
      {
        id: 'r-b1-01-q4',
        prompt: 'In the notice, the word "unplug" means',
        options: ['disconnect from the electricity', 'switch on', 'clean carefully', 'move to another room'],
        answer: 0,
      },
    ],
  },
  {
    id: 'r-b1-02',
    skill: 'reading',
    level: 'b1',
    job_role: 'customer_service',
    genre: 'email',
    title: 'Re: Late Delivery of Your Washing Machine',
    text: `Dear Mr Yusupov,

Thank you for your email of 2 October, and I am sorry for the problem with your order. You ordered a washing machine on 25 September, and we promised to deliver it within three working days. Instead, it arrived on 1 October, and our driver did not call you before he came.

I have checked what happened. Our warehouse in Tashkent received the machine late from the supplier, and the driver was given an old phone number for you. This is not the level of service we want to offer, and I apologise.

To say sorry, we will return the delivery fee of 60,000 sums to your card within five working days. We have also added one extra year to the warranty for your machine. You do not need to do anything: the new warranty certificate is attached to this email.

If you have any other questions, please reply to this email or call me directly.

Kind regards,
Dilnoza Rakhimova
Customer Care Team`,
    questions: [
      {
        id: 'r-b1-02-q1',
        prompt: 'Why is Dilnoza writing to Mr Yusupov?',
        options: [
          'To ask him to pay the delivery fee',
          'To reply to his complaint and offer compensation',
          'To confirm a new order',
          'To change his delivery date',
        ],
        answer: 1,
      },
      {
        id: 'r-b1-02-q2',
        prompt: 'What was one reason for the problem?',
        options: [
          'The driver had the wrong phone number.',
          'Mr Yusupov was not at home.',
          'The machine was damaged.',
          'The address on the order was incorrect.',
        ],
        answer: 0,
      },
      {
        id: 'r-b1-02-q3',
        prompt: 'How will the company return the delivery fee?',
        options: ['In cash from the driver', 'As a discount on his next order', 'Back to his card', 'As a voucher by post'],
        answer: 2,
      },
      {
        id: 'r-b1-02-q4',
        prompt: 'What does Mr Yusupov need to do to get the longer warranty?',
        options: ['Visit the shop', 'Send a copy of his receipt', 'Call the customer care team', 'Nothing'],
        answer: 3,
      },
    ],
  },
  {
    id: 'r-b1-03',
    skill: 'reading',
    level: 'b1',
    job_role: 'office_admin',
    genre: 'policy',
    title: 'Meeting Room Booking Rules',
    text: `These rules apply to all three meeting rooms on the fifth floor: Navoi, Bukhara and Fergana.

1. Book rooms through the company calendar only. Bookings made by phone or in the office chat will not be accepted.

2. You can book a room for a maximum of two hours. For longer events, such as training days or visits from partners, contact the office administrator at least three days before.

3. If you do not arrive within 15 minutes of the start of your booking, the room becomes free and other staff may use it.

4. Cancel your booking as soon as you know you do not need the room.

5. Leave the room as you found it. Clean the whiteboard, take away cups and switch off the screen and lights.

6. The Navoi room has video equipment for online meetings. Please give priority to colleagues who need to call partners abroad.

Questions about these rules should go to Malika Tursunova, Office Administrator.`,
    questions: [
      {
        id: 'r-b1-03-q1',
        prompt: 'How should staff normally book a meeting room?',
        options: ['By phone', 'In the office chat', 'Through the company calendar', 'By visiting the fifth floor'],
        answer: 2,
      },
      {
        id: 'r-b1-03-q2',
        prompt: 'What happens if you are 20 minutes late for your booking?',
        options: [
          'You must book again for the next day.',
          'Other people may use the room.',
          'The administrator will call you.',
          'Your booking is made longer.',
        ],
        answer: 1,
      },
      {
        id: 'r-b1-03-q3',
        prompt: 'Who should contact the office administrator?',
        options: [
          'Someone who needs a room for a full-day training',
          'Someone who wants to cancel a booking',
          'Someone who needs to clean the whiteboard',
          'Someone who is 15 minutes late',
        ],
        answer: 0,
      },
      {
        id: 'r-b1-03-q4',
        prompt: 'What is special about the Navoi room?',
        options: [
          'It is the largest room.',
          'It is on a different floor.',
          'It can be booked by phone.',
          'It has equipment for video calls.',
        ],
        answer: 3,
      },
    ],
  },

  // ---------------------------------------------------------------- B2
  {
    id: 'r-b2-01',
    skill: 'reading',
    level: 'b2',
    job_role: 'banking_finance',
    genre: 'report',
    title: 'Samarkand Branch: Quarterly Summary',
    text: `Samarkand Branch: Quarterly Summary, July to September

Overall, the branch had a strong quarter. The number of new current accounts rose by 18% compared with the previous quarter, mainly because of the small-business package we launched in July. Most of the new customers were shop owners and family guesthouses that serve the growing number of tourists in the city.

Lending results were more mixed. Consumer loans grew steadily, but applications for car loans fell by almost a quarter after interest rates went up in August. We expect this trend to continue until the end of the year, so the sales plan for car loans should be reviewed.

The main weakness this quarter was waiting time. On busy days, customers waited an average of 22 minutes to see a teller, against our target of ten. Two experienced tellers left in August, and their replacements are still in training. Customer complaints about queues doubled.

Recommendations:

- Move one consultant from the business desk to the teller counters on Mondays and Fridays, our busiest days.
- Encourage customers to use the mobile app for simple transfers and bill payments.
- Complete training for the new tellers by the end of October.

Prepared by Timur Abdullaev, Branch Operations Manager`,
    questions: [
      {
        id: 'r-b2-01-q1',
        prompt: 'What was the main reason for the increase in new accounts?',
        options: [
          'A new package for small businesses',
          'Tourists opening personal accounts',
          'Lower fees for students',
          'The launch of a mobile app',
        ],
        answer: 0,
      },
      {
        id: 'r-b2-01-q2',
        prompt: 'According to the report, why did car loan applications fall?',
        options: [
          'The branch stopped offering them.',
          'Interest rates increased.',
          'Car prices went up.',
          'The sales team was too small.',
        ],
        answer: 1,
      },
      {
        id: 'r-b2-01-q3',
        prompt: 'What can be inferred about the new tellers?',
        options: [
          'They receive more complaints than other staff.',
          'They will move to the business desk.',
          'They are not yet as fast as the experienced tellers who left.',
          'They were transferred from another branch.',
        ],
        answer: 2,
      },
      {
        id: 'r-b2-01-q4',
        prompt: 'The word "mixed" in the second paragraph is closest in meaning to',
        options: ['very disappointing', 'difficult to measure', 'better than expected', 'partly good and partly bad'],
        answer: 3,
      },
    ],
  },
  {
    id: 'r-b2-02',
    skill: 'reading',
    level: 'b2',
    job_role: 'general',
    genre: 'chat',
    title: 'Team Chat: Change to the Partner Visit',
    text: `Aziza (10:02): Quick update, everyone. The delegation from Hamburg has changed their flights. They're now arriving in Tashkent on Tuesday evening instead of Wednesday morning, so the site visit moves to Wednesday at 9:30.

Rustam (10:05): That's a problem for me. I'm presenting at the conference in Navoi on Wednesday morning, and I can't really pull out now.

Aziza (10:06): Understood. Could Jasur cover the technical part of the tour? He knows the new production line better than anyone.

Jasur (10:09): Happy to, but I'll need the slides by Monday so I can go through them properly. Rustam, could you send me your notes as well? I don't want to contradict anything you told them last month.

Rustam (10:11): Sure, I'll send everything tonight. One thing to watch out for: they'll definitely ask about delivery times to Europe. Don't promise anything under six weeks.

Aziza (10:13): Good point. Also, the hotel booking needs changing. Olga, can you take care of that, and check whether the restaurant can do dinner on Tuesday instead?

Olga (10:20): On it. The hotel is fine, but the restaurant is fully booked on Tuesday. Shall I try the place near Amir Temur Square?

Aziza (10:21): Yes, please. And let's all meet briefly on Monday at 4 to run through the final plan.`,
    questions: [
      {
        id: 'r-b2-02-q1',
        prompt: 'Why has the site visit been moved?',
        options: [
          'The production line is not ready.',
          'The visitors changed their travel plans.',
          'Rustam is busy on Wednesday.',
          'The restaurant is fully booked.',
        ],
        answer: 1,
      },
      {
        id: 'r-b2-02-q2',
        prompt: "Why does Jasur ask for Rustam's notes?",
        options: [
          'He has never seen the production line.',
          'He needs to translate them into German.',
          'He wants to be consistent with what the visitors were told before.',
          'He is presenting at the conference in Navoi.',
        ],
        answer: 2,
      },
      {
        id: 'r-b2-02-q3',
        prompt: 'What does Rustam advise about delivery times?',
        options: [
          'They should not be discussed at all.',
          'Delivery to Europe now takes less than six weeks.',
          'The visitors are not interested in them.',
          'Jasur should not promise less than six weeks.',
        ],
        answer: 3,
      },
      {
        id: 'r-b2-02-q4',
        prompt: 'The phrase "pull out" in Rustam\'s first message is closest in meaning to',
        options: ['withdraw', 'arrive late', 'give a presentation', 'get ready'],
        answer: 0,
      },
      {
        id: 'r-b2-02-q5',
        prompt: 'What will Olga probably do next?',
        options: [
          'Cancel the hotel booking',
          'Contact a different restaurant',
          'Book flights to Hamburg',
          'Prepare the slides for Jasur',
        ],
        answer: 1,
      },
    ],
  },
  {
    id: 'r-b2-03',
    skill: 'reading',
    level: 'b2',
    job_role: 'it_software',
    genre: 'policy',
    title: 'Remote Access and Device Security Policy',
    text: `Purpose: This policy explains how employees may connect to company systems from outside the office. It applies to all staff, contractors and interns who have a company account.

1. Approved devices. Remote access is allowed only from company laptops, or from personal devices that the IT department has registered and checked. Registration takes about two working days, so plan ahead before business trips.

2. Connecting safely. Always connect through the company VPN. Public Wi-Fi in cafés, airports and hotels may be used only while the VPN is switched on. Never save your password in a browser on a shared or public computer.

3. Two-step login. All accounts must use two-step login with the authenticator app. Codes sent by text message will no longer be accepted after 1 March, because they can be intercepted more easily.

4. Lost or stolen devices. Report a lost laptop or phone to the IT help desk immediately, at any time of day or night. The IT team can lock the device remotely and remove company data. Delays in reporting may lead to disciplinary action.

5. Exceptions. Managers may request a temporary exception, for example for a partner working on a short project. Requests must be sent in writing to the Head of IT and are valid for a maximum of 30 days.`,
    questions: [
      {
        id: 'r-b2-03-q1',
        prompt: 'What must an employee do before using a personal laptop to work remotely?',
        options: [
          'Install the VPN without help',
          'Have it registered by the IT department',
          'Ask their manager for an exception',
          'Save their password in the browser',
        ],
        answer: 1,
      },
      {
        id: 'r-b2-03-q2',
        prompt: 'Why will text-message codes stop being accepted?',
        options: [
          'They are too expensive.',
          'The authenticator app is faster.',
          'Staff often forget them.',
          'They are easier for someone else to steal.',
        ],
        answer: 3,
      },
      {
        id: 'r-b2-03-q3',
        prompt: 'The word "intercepted" in section 3 is closest in meaning to',
        options: ['forgotten', 'delayed', 'caught by someone else on the way', 'sent twice'],
        answer: 2,
      },
      {
        id: 'r-b2-03-q4',
        prompt: 'Which word best describes the tone of section 4?',
        options: ['Serious', 'Relaxed', 'Apologetic', 'Uncertain'],
        answer: 0,
      },
    ],
  },

  // ---------------------------------------------------------------- C1
  {
    id: 'r-c1-01',
    skill: 'reading',
    level: 'c1',
    job_role: 'management',
    genre: 'report',
    title: 'Review of Staff Turnover at the Tashkent Contact Centre',
    text: `Summary: Over the past twelve months, 41% of our front-line agents left the company, compared with a regional industry average of roughly 25%. Each departure costs us an estimated 9 million sums in recruitment and training, not counting the less visible cost of inexperienced agents handling complex calls. This review sets out what we found and what we propose.

Findings: Exit interviews point less to pay than we had assumed. Salaries are broadly in line with competitors, and only one in five leavers named money as the main reason. Far more frequently cited were rigid shift patterns, which give agents little say over when they work, and a sense that there is no visible route to promotion. Several leavers described team leaders as "measuring us, not managing us", a remark that reflects how much of their time is spent monitoring call statistics rather than coaching.

Turnover is also unevenly spread. It is highest among agents in their first six months and on the Russian-language line, where call volumes have risen sharply since the launch of our service for Kazakhstan.

Recommendations: First, we propose piloting a shift-swap system that allows agents to exchange shifts without a supervisor's approval, provided minimum staffing levels are met. Second, a clear career path, from agent to senior agent to team leader, should be published with transparent criteria. Third, team leaders' targets should be rebalanced so that at least a third of their time is ring-fenced for coaching.

None of these measures is costly in itself; the greater risk lies in doing nothing while competitors recruit our best people.

Malika Saidova, Head of Operations`,
    questions: [
      {
        id: 'r-c1-01-q1',
        prompt: 'What did the review find about pay?',
        options: [
          'It was the main reason most agents left.',
          'It is roughly the same as at competing companies.',
          'It is much lower than the regional average.',
          'It was not discussed in exit interviews.',
        ],
        answer: 1,
      },
      {
        id: 'r-c1-01-q2',
        prompt: 'What does the remark "measuring us, not managing us" suggest?',
        options: [
          'Team leaders focus on statistics more than on supporting agents.',
          'Agents want their performance to be measured more often.',
          'Team leaders are too strict about breaks.',
          'Agents do not understand their targets.',
        ],
        answer: 0,
      },
      {
        id: 'r-c1-01-q3',
        prompt: 'Which agents are most likely to leave?',
        options: [
          'Agents with more than five years of experience',
          'Team leaders on the English-language line',
          'New agents and those on the Russian-language line',
          'Agents who work only morning shifts',
        ],
        answer: 2,
      },
      {
        id: 'r-c1-01-q4',
        prompt: 'In the recommendations, the term "ring-fenced" most nearly means',
        options: ['reduced', 'shared with other teams', 'measured carefully', 'protected for one purpose only'],
        answer: 3,
      },
      {
        id: 'r-c1-01-q5',
        prompt: "What is the writer's main point in the final paragraph?",
        options: [
          'The proposals are cheap compared with the cost of inaction.',
          'Competitors pay their agents more.',
          'The company should hire more team leaders.',
          'The changes should wait until next year.',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'r-c1-02',
    skill: 'reading',
    level: 'c1',
    job_role: 'general',
    genre: 'email',
    title: 'Office Relocation and New Working Arrangements',
    text: `Dear colleagues,

As many of you have heard informally, the management board has approved our move from the current building on Mirabad Street to new premises in Yunusabad. I want to set out the facts clearly, because a number of rumours have been circulating, not all of them accurate.

The move will take place in stages over the first two weeks of March. The new office is smaller, but it has been designed around shared desks, more meeting rooms and quiet zones for focused work. This is deliberate: our own data shows that, on an average day, fewer than 60% of desks are currently occupied.

Let me address the main concern directly. Nobody is being made redundant as a result of this move. What we are proposing is a hybrid pattern in which each team agrees which two days a week its members will work from home. Teams whose work genuinely requires them to be on site, such as reception and the archive, will be exempt.

I recognise that Yunusabad is a longer journey for some of you, particularly colleagues living in Sergeli. We are therefore looking into a company shuttle from the metro, and we will cover parking costs for anyone whose commute increases by more than 40 minutes.

Before anything is finalised, each department will hold a consultation session in January. Please use it to raise practical problems; your feedback will shape the final arrangements.

Best regards,
Bekzod Nazarov
Chief Operating Officer`,
    questions: [
      {
        id: 'r-c1-02-q1',
        prompt: 'What is the main purpose of the email?',
        options: [
          'To announce job cuts linked to the move',
          'To give accurate information about the move and invite feedback',
          'To ask staff to vote on the new location',
          'To explain why the old building is being sold',
        ],
        answer: 1,
      },
      {
        id: 'r-c1-02-q2',
        prompt: 'Why does the writer mention that fewer than 60% of desks are occupied?',
        options: [
          'To justify a smaller office with shared desks',
          'To criticise staff who work from home',
          'To show that the company is growing',
          'To explain why the rent has increased',
        ],
        answer: 0,
      },
      {
        id: 'r-c1-02-q3',
        prompt: 'Which statement about hybrid working is true?',
        options: [
          'Every employee will choose their own home-working days.',
          'Reception staff will work from home on Mondays.',
          'Each team will agree on its own home-working days.',
          'Hybrid working will begin in January.',
        ],
        answer: 2,
      },
      {
        id: 'r-c1-02-q4',
        prompt: 'What can be inferred about colleagues who live in Sergeli?',
        options: [
          'They will be moved to a different branch.',
          'They requested the move to Yunusabad.',
          'They will not be affected by the move.',
          'Their journey to work is likely to be longer.',
        ],
        answer: 3,
      },
      {
        id: 'r-c1-02-q5',
        prompt: 'How would you describe the tone of the email?',
        options: ['Angry and defensive', 'Vague and uncertain', 'Humorous and informal', 'Reassuring and direct'],
        answer: 3,
      },
    ],
  },
  {
    id: 'r-c1-03',
    skill: 'reading',
    level: 'c1',
    job_role: 'sales',
    genre: 'chat',
    title: 'Team Chat: Payment Terms for the Izmir Distributor',
    text: `Timur (14:02): Just got off the call with the distributor in Izmir. They're ready to sign for the Kazakhstan market, but they're now asking for 90-day payment terms rather than the 45 we discussed.

Aziza (14:04): That's a big jump. What are they offering in return?

Timur (14:06): A minimum order of 20,000 units in the first year, which is about double what we'd pencilled in. Honestly, the volume is tempting.

Aziza (14:07): Tempting, yes, but 90 days would put real pressure on our cash flow, especially in spring when we're paying for raw cotton. I'd want finance to look at it before we say anything.

Dilnoza (14:15): Finance here. I've run some rough numbers. At 90 days we'd need to extend our credit line by roughly $400,000 for most of the year. It's doable, but the interest would wipe out a good chunk of the margin on the extra volume.

Timur (14:17): So is that a no?

Dilnoza (14:19): Not necessarily. What about meeting them halfway: 60 days, with a 2% discount if they pay within 30? That way we reward early payment rather than simply absorbing the cost.

Aziza (14:20): I like that. It would also tell us early on whether they're a reliable payer.

Timur (14:22): They might push back, but I think it's worth a try. Their sales director mentioned they're under pressure to launch before the autumn season, so they need this deal as much as we do.

Aziza (14:24): Then we're in a stronger position than it looks. Timur, put the 60/30 proposal in writing today, but don't send it until Dilnoza has checked the figures.

Timur (14:25): Will do.`,
    questions: [
      {
        id: 'r-c1-03-q1',
        prompt: 'What is the main issue the team is discussing?',
        options: [
          'Whether to accept a request for longer payment terms',
          'How to reduce the price of their products',
          'Which country to enter next',
          'Who should travel to Izmir',
        ],
        answer: 0,
      },
      {
        id: 'r-c1-03-q2',
        prompt: 'What concern does Aziza raise about the 90-day terms?',
        options: [
          'The minimum order is too small.',
          'They could cause cash-flow problems.',
          'The distributor might never pay.',
          'The cotton supplier will raise prices.',
        ],
        answer: 1,
      },
      {
        id: 'r-c1-03-q3',
        prompt: 'According to Dilnoza, what is the main drawback of extending the credit line?',
        options: [
          'The bank would probably refuse it.',
          'It would take too long to arrange.',
          'Interest costs would eat into the profit from the extra sales.',
          'The distributor would ask for even longer terms.',
        ],
        answer: 2,
      },
      {
        id: 'r-c1-03-q4',
        prompt: 'Why does Aziza think the company is "in a stronger position than it looks"?',
        options: [
          'The distributor has offered to pay in advance.',
          'Finance has approved the 90-day terms.',
          'Other distributors have shown interest.',
          'The distributor also needs the deal urgently.',
        ],
        answer: 3,
      },
      {
        id: 'r-c1-03-q5',
        prompt: 'The phrase "pencilled in" in Timur\'s message at 14:06 most nearly means',
        options: ['signed officially', 'planned provisionally', 'rejected outright', 'calculated precisely'],
        answer: 1,
      },
    ],
  },
];
