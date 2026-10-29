// Original Schood workplace listening scripts (A2–C1), written to be read aloud by browser text-to-speech.
import type { ListeningScript } from './types.ts';

export const LISTENING: ListeningScript[] = [
  // ---------------------------------------------------------------- A2
  {
    id: 'l-a2-01',
    skill: 'listening',
    level: 'a2',
    job_role: 'hospitality',
    genre: 'call',
    title: 'Booking a Hotel Room in Bukhara',
    lines: [
      { speaker: 'Receptionist', text: "Good afternoon, Old Gate Hotel, Bukhara. This is Malika. How can I help you?" },
      { speaker: 'Guest', text: "Hello. I'd like to book a room for two nights, please. From Friday." },
      { speaker: 'Receptionist', text: 'Of course. A single room or a double room?' },
      { speaker: 'Guest', text: "A double, please. It's for me and my wife." },
      { speaker: 'Receptionist', text: 'No problem. A double room is sixty-five dollars a night, with breakfast.' },
      { speaker: 'Guest', text: 'Great. Is there a car park?' },
      { speaker: 'Receptionist', text: "Yes, and it's free for guests. Can I have your name, please?" },
      { speaker: 'Guest', text: "Yes, it's Kim. K, I, M." },
      { speaker: 'Receptionist', text: 'Thank you, Mister Kim. See you on Friday.' },
    ],
    questions: [
      {
        id: 'l-a2-01-q1',
        prompt: 'How many nights does the guest want to stay?',
        options: ['One', 'Two', 'Three', 'Five'],
        answer: 1,
      },
      {
        id: 'l-a2-01-q2',
        prompt: 'How much is the room per night?',
        options: ['Fifty-five dollars', 'Sixty dollars', 'Sixty-five dollars', 'Seventy-five dollars'],
        answer: 2,
      },
      {
        id: 'l-a2-01-q3',
        prompt: 'What does the guest ask about?',
        options: ['Breakfast', 'Wi-Fi', 'The airport bus', 'Parking'],
        answer: 3,
      },
    ],
  },
  {
    id: 'l-a2-02',
    skill: 'listening',
    level: 'a2',
    job_role: 'general',
    genre: 'announcement',
    title: 'Two Messages for the Office',
    lines: [
      {
        speaker: 'Aziza',
        text:
          "Good morning, everyone. This is Aziza from the front office. I have two short messages. First, the lift isn't working today. A technician is coming at eleven o'clock, so please use the stairs this morning. Second, our team lunch is on Thursday, not Wednesday. It starts at one o'clock, at the restaurant next to the bank. Please tell me by tomorrow if you're coming. Thank you, and have a good day.",
      },
    ],
    questions: [
      {
        id: 'l-a2-02-q1',
        prompt: 'What is the problem today?',
        options: ["The lift isn't working.", 'The lights are off.', 'The kitchen is closed.', 'The internet is slow.'],
        answer: 0,
      },
      {
        id: 'l-a2-02-q2',
        prompt: 'When is the team lunch?',
        options: ['On Tuesday', 'On Wednesday', 'On Thursday', 'On Friday'],
        answer: 2,
      },
      {
        id: 'l-a2-02-q3',
        prompt: 'What should people do by tomorrow?',
        options: [
          'Call the technician',
          "Tell Aziza if they're coming to lunch",
          'Book a table at the restaurant',
          'Pay for the lunch',
        ],
        answer: 1,
      },
    ],
  },
  {
    id: 'l-a2-03',
    skill: 'listening',
    level: 'a2',
    job_role: 'general',
    genre: 'voicemail',
    title: 'A New Time for the Client Meeting',
    lines: [
      {
        speaker: 'Rustam',
        text:
          "Hi Olga, it's Rustam. I'm calling about our meeting with the new client tomorrow. They called me this morning, and they can't come at ten. They want to come at two thirty in the afternoon. Is that OK for you? The meeting is still in room four. Also, can you bring the price list, please? I don't have a copy. Call me back on my mobile before six. Thanks, bye.",
      },
    ],
    questions: [
      {
        id: 'l-a2-03-q1',
        prompt: 'What is the new time for the meeting?',
        options: ["Two o'clock", "Ten o'clock", "Six o'clock", 'Two thirty'],
        answer: 3,
      },
      {
        id: 'l-a2-03-q2',
        prompt: 'What does Rustam want Olga to bring?',
        options: ['A laptop', 'The price list', 'The contract', 'Some coffee'],
        answer: 1,
      },
      {
        id: 'l-a2-03-q3',
        prompt: 'Where is the meeting?',
        options: ['In room four', "In Rustam's office", "At the client's office", 'In room two'],
        answer: 0,
      },
    ],
  },

  // ---------------------------------------------------------------- B1
  {
    id: 'l-b1-01',
    skill: 'listening',
    level: 'b1',
    job_role: 'general',
    genre: 'meeting',
    title: 'Planning the Navruz Party',
    lines: [
      { speaker: 'Dilnoza', text: "OK, let's talk about the Navruz party. It's on the twentieth of March, so we've got about three weeks." },
      {
        speaker: 'Jasur',
        text: "I've called two places. The restaurant in the city centre can take sixty people, but it's quite expensive. About two hundred thousand sums per person.",
      },
      { speaker: 'Malika', text: "That's a lot. How many people are coming?" },
      { speaker: 'Dilnoza', text: 'Around fifty, I think. What about the second place?' },
      {
        speaker: 'Jasur',
        text: "That's the garden café near the park. It's cheaper, a hundred and twenty thousand per person. But if it rains, there isn't much space inside.",
      },
      { speaker: 'Malika', text: 'Hmm. The weather in March can be really unpredictable.' },
      {
        speaker: 'Dilnoza',
        text: "True. Let's not take the risk. Jasur, can you ask the restaurant for a group discount? And Malika, could you send everyone a short form, so we know exactly who's coming?",
      },
      { speaker: 'Malika', text: "Sure. I'll do it this afternoon." },
    ],
    questions: [
      {
        id: 'l-b1-01-q1',
        prompt: 'How many people do they expect at the party?',
        options: ['About forty', 'About sixty', 'About a hundred and twenty', 'About fifty'],
        answer: 3,
      },
      {
        id: 'l-b1-01-q2',
        prompt: 'What is the problem with the garden café?',
        options: [
          "It's too expensive.",
          "It's too far from the office.",
          "There isn't much room inside if it rains.",
          "It's closed in March.",
        ],
        answer: 2,
      },
      {
        id: 'l-b1-01-q3',
        prompt: 'What will Malika do this afternoon?',
        options: ['Send a form to all the staff', 'Call the restaurant', 'Visit the garden café', 'Ask for a group discount'],
        answer: 0,
      },
    ],
  },
  {
    id: 'l-b1-02',
    skill: 'listening',
    level: 'b1',
    job_role: 'healthcare',
    genre: 'voicemail',
    title: 'A Message from the Clinic',
    lines: [
      {
        speaker: 'Clinic Receptionist',
        text:
          "Good morning, this is a message for Mister Aliev. My name's Aziza, and I'm calling from the family clinic on Navoi Street. I'm afraid Doctor Usmanova is ill this week, so we need to change your appointment on Wednesday at nine fifteen. We can offer you Thursday at the same time with Doctor Karimov, or you can wait until next Monday at eleven to see Doctor Usmanova. Please call us back to tell us which you prefer. If neither of those times is convenient, just let us know and we'll find another day. And just a reminder: please don't eat anything for eight hours before your blood test. Thank you, goodbye.",
      },
    ],
    questions: [
      {
        id: 'l-b1-02-q1',
        prompt: 'Why is the clinic calling?',
        options: [
          'To cancel the blood test',
          'To change an appointment because the doctor is ill',
          'To ask for a payment',
          'To give him his test results',
        ],
        answer: 1,
      },
      {
        id: 'l-b1-02-q2',
        prompt: 'When can Mister Aliev see Doctor Usmanova?',
        options: ['Wednesday at nine fifteen', 'Thursday at nine fifteen', 'Monday at eleven', 'Monday at nine fifteen'],
        answer: 2,
      },
      {
        id: 'l-b1-02-q3',
        prompt: 'What must he remember before the blood test?',
        options: [
          'To bring his passport',
          'To arrive fifteen minutes early',
          'To drink plenty of water',
          'Not to eat for eight hours',
        ],
        answer: 3,
      },
    ],
  },
  {
    id: 'l-b1-03',
    skill: 'listening',
    level: 'b1',
    job_role: 'logistics',
    genre: 'call',
    title: 'A Delivery from Almaty',
    lines: [
      { speaker: 'Bekzod', text: "Hello, Aigerim? It's Bekzod from the Fergana warehouse. I'm calling about the order of glass bottles." },
      { speaker: 'Aigerim', text: 'Hi, Bekzod. Yes, the truck left Almaty this morning.' },
      { speaker: 'Bekzod', text: "Great. When do you think it'll arrive?" },
      { speaker: 'Aigerim', text: "If there aren't any delays at the border, on Thursday afternoon, at around four." },
      {
        speaker: 'Bekzod',
        text: 'Hmm, our warehouse closes at five on Thursdays. Could the driver call us when he is about an hour away?',
      },
      {
        speaker: 'Aigerim',
        text: "Of course. I'll give him your number. By the way, the order is a bit smaller than planned. We could only send eighteen pallets, not twenty. The last two will come next week.",
      },
      { speaker: 'Bekzod', text: "OK, that's fine. But please send me a new invoice for the eighteen." },
      { speaker: 'Aigerim', text: "No problem. I'll email it to you today." },
    ],
    questions: [
      {
        id: 'l-b1-03-q1',
        prompt: 'When should the truck arrive?',
        options: ['On Thursday at about four', 'On Wednesday morning', 'On Thursday at five', 'On Friday afternoon'],
        answer: 0,
      },
      {
        id: 'l-b1-03-q2',
        prompt: 'How many pallets are on the truck?',
        options: ['Two', 'Eight', 'Eighteen', 'Twenty'],
        answer: 2,
      },
      {
        id: 'l-b1-03-q3',
        prompt: 'What does Bekzod ask Aigerim to send?',
        options: ["The driver's photo", 'A new invoice', 'The rest of the order today', 'A delivery contract'],
        answer: 1,
      },
    ],
  },

  // ---------------------------------------------------------------- B2
  {
    id: 'l-b2-01',
    skill: 'listening',
    level: 'b2',
    job_role: 'engineering',
    genre: 'announcement',
    title: 'Testing the New Packaging Line',
    lines: [
      {
        speaker: 'Timur',
        text:
          "Attention, please, all staff on the morning shift. This is Timur, the shift supervisor. As you know, the new packaging line in Hall B is being tested today. From ten o'clock until about two, the area around the line will be closed off, and only the engineers from the German supplier and our own maintenance team are allowed inside the yellow barrier.",
      },
      {
        speaker: 'Timur',
        text:
          "If your usual route to the canteen goes through Hall B, please use the side corridor next to the loading bay instead. It takes a couple of minutes longer, so plan your break accordingly.",
      },
      {
        speaker: 'Timur',
        text:
          "There's one more thing, and it's important. During the test, you may hear the alarm go off once or twice. This is part of the test, and you don't need to leave the building. However, if you hear three long alarms in a row, that's a real evacuation, and everyone must go to the meeting point in the car park as usual.",
      },
      {
        speaker: 'Timur',
        text:
          "Finally, a big thank you to the night shift, who stayed late yesterday to clear the area. If you have any questions, come and find me in the control room. Thanks, everyone.",
      },
    ],
    questions: [
      {
        id: 'l-b2-01-q1',
        prompt: 'Who is allowed inside the yellow barrier during the test?',
        options: [
          'All staff on the morning shift',
          "The supplier's engineers and the maintenance team",
          'The night shift',
          'Only the shift supervisor',
        ],
        answer: 1,
      },
      {
        id: 'l-b2-01-q2',
        prompt: 'Why should some staff use the side corridor?',
        options: [
          "It's quicker than the usual route.",
          'The canteen has moved.',
          'Their usual route through Hall B is closed.',
          'The loading bay is being cleaned.',
        ],
        answer: 2,
      },
      {
        id: 'l-b2-01-q3',
        prompt: 'What should staff do if they hear the alarm once?',
        options: [
          'Leave the building immediately',
          'Go to the control room',
          'Go to the car park',
          "Stay inside, because it's part of the test",
        ],
        answer: 3,
      },
      {
        id: 'l-b2-01-q4',
        prompt: 'Why does Timur thank the night shift?',
        options: [
          'They stayed late to clear the area.',
          'They tested the new line.',
          'They repaired the alarm system.',
          'They worked on a public holiday.',
        ],
        answer: 0,
      },
    ],
  },
  {
    id: 'l-b2-02',
    skill: 'listening',
    level: 'b2',
    job_role: 'sales',
    genre: 'meeting',
    title: 'Air Conditioner Sales Review',
    lines: [
      { speaker: 'Malika', text: "Right, let's look at last month. Jasur, how did the Samarkand stores do?" },
      {
        speaker: 'Jasur',
        text: "Better than expected, actually. Sales of the new air conditioners were up about thirty percent, mostly because of the heatwave. The problem is, we've nearly run out of the smaller models.",
      },
      { speaker: 'Malika', text: "When's the next delivery from the supplier in Korea?" },
      { speaker: 'Jasur', text: "Not until the end of the month. That's almost three weeks away." },
      {
        speaker: 'Olga',
        text: "Could we move some stock from Tashkent? Our stores there aren't selling the small models as quickly. I think we've got about forty units sitting in the warehouse.",
      },
      { speaker: 'Malika', text: "That makes sense. But won't the transport eat into the profit?" },
      {
        speaker: 'Olga',
        text: "Not really. We've got a truck going to Samarkand on Friday anyway, with the fridges. There's plenty of space on it.",
      },
      {
        speaker: 'Malika',
        text: "Perfect, let's do that. Olga, can you arrange it with the warehouse? And Jasur, I'd like your team to offer the installation service with every unit. Customers keep asking for it, and the margin is much better.",
      },
      { speaker: 'Jasur', text: "Will do. I'll brief the store managers tomorrow morning." },
    ],
    questions: [
      {
        id: 'l-b2-02-q1',
        prompt: 'Why were sales in Samarkand so high?',
        options: ['A new store opened.', 'There was a heatwave.', 'Prices were reduced.', 'A competitor closed.'],
        answer: 1,
      },
      {
        id: 'l-b2-02-q2',
        prompt: 'What is the problem in Samarkand?',
        options: [
          'They have too many large models.',
          'The delivery from Korea was damaged.',
          'Customers are returning units.',
          "They've almost run out of the smaller models.",
        ],
        answer: 3,
      },
      {
        id: 'l-b2-02-q3',
        prompt: "Why does Olga think moving the stock won't cost much?",
        options: [
          'A truck is already going there on Friday.',
          'The warehouse is in Samarkand.',
          'The supplier will pay for transport.',
          'The units are very light.',
        ],
        answer: 0,
      },
      {
        id: 'l-b2-02-q4',
        prompt: "What does Malika want Jasur's team to do?",
        options: [
          'Visit the stores in Tashkent',
          'Sell more fridges',
          'Offer installation with every air conditioner',
          'Reduce the price of the large models',
        ],
        answer: 2,
      },
    ],
  },
  {
    id: 'l-b2-03',
    skill: 'listening',
    level: 'b2',
    job_role: 'customer_service',
    genre: 'voicemail',
    title: 'A Customer Complaint about the Internet',
    lines: [
      {
        speaker: 'Customer',
        text:
          "Hello, this is Rustam Khodjaev. The account is in my wife's name, Malika Khodjaeva, in case you need to look it up. I'm calling for the third time this week about my internet connection, and frankly, I'm starting to lose patience. It keeps cutting out every evening between about seven and ten, which is exactly when my children need it for their homework. Your technician came on Monday, said he'd replaced the router, and told me everything would be fine. It wasn't. When I last phoned, I was promised a call back within twenty-four hours, and that was on Tuesday. Nobody has called, and nobody has answered my emails either. I'm not asking for anything unreasonable. I just want someone to actually come and find out what the problem is, and I think I should get some money back for the days the service hasn't worked. If I don't hear from you by Friday, I'll have no choice but to switch to another provider. Thank you.",
      },
    ],
    questions: [
      {
        id: 'l-b2-03-q1',
        prompt: 'How does the caller feel?',
        options: ['Frustrated and losing patience', 'Mildly curious', 'Apologetic', 'Satisfied but confused'],
        answer: 0,
      },
      {
        id: 'l-b2-03-q2',
        prompt: 'When does the problem usually happen?',
        options: ['In the morning', 'At lunchtime', 'In the evening', 'All day'],
        answer: 2,
      },
      {
        id: 'l-b2-03-q3',
        prompt: 'What happened after his last call?',
        options: ['A technician visited.', 'Nobody called him back.', 'He got a refund.', 'He was given a new router.'],
        answer: 1,
      },
      {
        id: 'l-b2-03-q4',
        prompt: 'What will the caller probably do if nobody contacts him by Friday?',
        options: [
          'Visit the office in person',
          'Buy a new router himself',
          'Write a review online',
          'Change to another internet provider',
        ],
        answer: 3,
      },
    ],
  },

  // ---------------------------------------------------------------- C1
  {
    id: 'l-c1-01',
    skill: 'listening',
    level: 'c1',
    job_role: 'banking_finance',
    genre: 'call',
    title: 'News about a Credit Line',
    lines: [
      {
        speaker: 'Olga',
        text: "Jasur, good morning, it's Olga from the corporate banking team. Have you got a few minutes? It's about your credit line application.",
      },
      { speaker: 'Jasur', text: 'Morning, Olga. Yes, go ahead. I was hoping to hear from you this week.' },
      {
        speaker: 'Olga',
        text: "Well, the good news is that the credit committee looked at it yesterday, and they're broadly positive. The less good news is that they're not comfortable with the full amount at this stage.",
      },
      { speaker: 'Jasur', text: 'I see. How much are we talking about?' },
      {
        speaker: 'Olga',
        text: "They'd approve three hundred thousand dollars, rather than the five hundred thousand you asked for. Their concern is that most of your revenue still comes from a single customer in Kazakhstan. If that contract fell through, repayments could become difficult.",
      },
      { speaker: 'Jasur', text: "That's a fair point, I suppose. Although we've just signed two new buyers in Turkey." },
      {
        speaker: 'Olga',
        text: "That's exactly what I wanted to hear. If you can send me the signed contracts, along with your latest accounts, I can go back to the committee and make the case for an increase. I can't promise anything, but it would certainly strengthen the application.",
      },
      { speaker: 'Jasur', text: 'And if we accept the three hundred thousand now, does that close the door on the rest?' },
      { speaker: 'Olga', text: "Not at all. We'd simply review the limit in six months, based on how the new contracts perform." },
      { speaker: 'Jasur', text: "Right. Let me talk it over with my finance director, and I'll get back to you by Thursday." },
    ],
    questions: [
      {
        id: 'l-c1-01-q1',
        prompt: "What is the main purpose of Olga's call?",
        options: [
          'To reject the application completely',
          'To report a partial approval and discuss the next steps',
          'To offer a new savings product',
          'To ask about late repayments',
        ],
        answer: 1,
      },
      {
        id: 'l-c1-01-q2',
        prompt: 'Why is the credit committee cautious?',
        options: [
          'The company has missed repayments before.',
          'The company has too many small customers.',
          "Most of the company's income comes from one customer.",
          'The company is planning to move to Turkey.',
        ],
        answer: 2,
      },
      {
        id: 'l-c1-01-q3',
        prompt: 'How does Olga react to the news about the buyers in Turkey?',
        options: [
          'She sees it as a way to strengthen the application.',
          'She thinks it makes the loan riskier.',
          "She says it's too late to change the decision.",
          'She is not interested in it.',
        ],
        answer: 0,
      },
      {
        id: 'l-c1-01-q4',
        prompt: 'What will Jasur probably do next?',
        options: [
          'Accept the offer on the spot',
          'Cancel the contracts in Turkey',
          'Apply to a different bank',
          'Discuss the offer with his finance director',
        ],
        answer: 3,
      },
    ],
  },
  {
    id: 'l-c1-02',
    skill: 'listening',
    level: 'c1',
    job_role: 'management',
    genre: 'meeting',
    title: 'Opening the Navoi Branch',
    lines: [
      {
        speaker: 'Malika',
        text: "So, the question is whether we open the Navoi branch in the spring, as planned, or hold off until the autumn. Bekzod, you've looked at the numbers.",
      },
      {
        speaker: 'Bekzod',
        text: "I have. On paper, Navoi looks attractive. There's very little competition, and the new industrial zone is bringing in a lot of young professionals. But the fit-out has gone over budget by about fifteen percent, mainly because of the electrical work.",
      },
      {
        speaker: 'Timur',
        text: "Can I come in here? My worry isn't really the budget, it's people. We still haven't found a branch manager, and I'd rather delay than put someone in charge who isn't ready.",
      },
      { speaker: 'Malika', text: "That's a fair concern. Could we move someone from Samarkand on a temporary basis?" },
      {
        speaker: 'Timur',
        text: "Possibly Aziza. She's ready for a step up. But Samarkand is our busiest branch, and pulling her out in the spring would leave them short.",
      },
      {
        speaker: 'Bekzod',
        text: "What if we did a soft opening? We open in May with limited hours and a smaller team, and go to full operation in September, once we've recruited properly.",
      },
      {
        speaker: 'Malika',
        text: "I like that. It keeps us ahead of any competitors without overstretching anyone. Timur, could you sound Aziza out, informally, without making any promises? And Bekzod, I'll need a revised budget for the soft opening by next Friday.",
      },
    ],
    questions: [
      {
        id: 'l-c1-02-q1',
        prompt: 'What is the main decision the managers are discussing?',
        options: [
          'Whether to close the Samarkand branch',
          'When to open the new branch in Navoi',
          'How to reduce electricity costs',
          'Whether to promote Bekzod',
        ],
        answer: 1,
      },
      {
        id: 'l-c1-02-q2',
        prompt: "What is Timur's main concern?",
        options: [
          'Finding the right person to run the branch',
          'The rising building costs',
          'Competition in Navoi',
          'Delays to the electrical work',
        ],
        answer: 0,
      },
      {
        id: 'l-c1-02-q3',
        prompt: 'What does Bekzod suggest?',
        options: [
          'Cancelling the project completely',
          'Moving the whole Samarkand team to Navoi',
          'Opening in May with shorter hours and fewer staff',
          'Waiting until next year',
        ],
        answer: 2,
      },
      {
        id: 'l-c1-02-q4',
        prompt: 'What does Malika mean when she asks Timur to "sound Aziza out"?',
        options: [
          'Formally offer her the job',
          'Tell her she has to move to Navoi',
          'Ask her to train a new manager',
          'Find out informally whether she might be interested',
        ],
        answer: 3,
      },
    ],
  },
  {
    id: 'l-c1-03',
    skill: 'listening',
    level: 'c1',
    job_role: 'general',
    genre: 'announcement',
    title: 'Programme Changes at a Business Forum',
    lines: [
      {
        speaker: 'Conference Host',
        text:
          "Good morning, ladies and gentlemen, and welcome to the second day of the Central Asia Trade Forum. Before we begin, there are a few changes to the programme that I'd like to draw your attention to.",
      },
      {
        speaker: 'Conference Host',
        text:
          "First, the panel on online retail, which was due to start at eleven, has been moved to the afternoon, at a quarter past two. One of our speakers from Seoul has been held up by a delayed connecting flight, and rather than run the session without her, we've decided to swap it with the workshop on warehouse automation. So that workshop will now take place this morning, at eleven, in Hall C.",
      },
      {
        speaker: 'Conference Host',
        text:
          "Second, a number of you mentioned yesterday that the main hall was overcrowded during the opening talk. We've taken that on board, and this afternoon's closing session will also be shown live in Hall B, so there'll be plenty of seats for everyone.",
      },
      {
        speaker: 'Conference Host',
        text:
          "Finally, a gentle reminder that you'll need your badge for the networking lunch. If you've lost yours, the registration desk can print a new one, but please allow ten minutes or so, as there tends to be a queue around midday. Thank you, and I hope you enjoy today's sessions.",
      },
    ],
    questions: [
      {
        id: 'l-c1-03-q1',
        prompt: 'Why has the panel on online retail been moved?',
        options: [
          'The hall was too small.',
          'A speaker has been delayed by a late flight.',
          'The workshop was cancelled.',
          'Too few people registered for it.',
        ],
        answer: 1,
      },
      {
        id: 'l-c1-03-q2',
        prompt: "What will now happen at eleven o'clock?",
        options: [
          'The panel on online retail',
          'The closing session',
          'The workshop on warehouse automation',
          'The networking lunch',
        ],
        answer: 2,
      },
      {
        id: 'l-c1-03-q3',
        prompt: 'Why will the closing session also be shown in Hall B?',
        options: [
          'The main hall is closed for repairs.',
          'The speakers requested it.',
          'Hall C is not available.',
          'People said the main hall was too crowded.',
        ],
        answer: 3,
      },
      {
        id: 'l-c1-03-q4',
        prompt: 'What does the host suggest about getting a new badge?',
        options: [
          'It could take a while around lunchtime.',
          'It costs extra.',
          'It can only be done online.',
          'It has to be done before eleven.',
        ],
        answer: 0,
      },
    ],
  },
];
