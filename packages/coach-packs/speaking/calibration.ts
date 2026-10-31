import type { CalibrationRun, CalibrationSample } from '../src/types.ts';

// Calibration for `speaking.conversation`: twelve learner transcripts from A2 to C1
// (only the learner's turns, one turn per line, as speech-to-text returns them),
// rated by the author on the four model-scored criteria, and three assessor runs per
// sample. A few quotes in the runs are deliberately slightly wrong (the assessor
// "corrected" the learner's words), so the evidence check stays honest.
// The runs are authored in the assessor's output shape, not captured from a model:
// they test the scoring pipeline and the thresholds in CI. Replace them with real runs
// from scripts/coach-calibration-live.ts --out once a model route is configured.

type Entry = [score: number, ...evidence: string[]];
const run = (range: Entry, accuracy: Entry, fluency: Entry, interaction: Entry): CalibrationRun => {
  const entry = ([score, ...evidence]: Entry) => ({ score, evidence });
  return { criteria: { range: entry(range), accuracy: entry(accuracy), fluency: entry(fluency), interaction: entry(interaction) } };
};

const samples: CalibrationSample[] = [
  {
    id: 's01-cafe-a2',
    task: 'Role-play: ordering at a café (rp.cafe-order). The barista asks what you would like, the size, the milk and whether it is for here or to take away; oat milk has run out today.',
    response: [
      'Hello. Give me coffee, please.',
      'Cappuccino. Big one.',
      'With oat milk, please.',
      'Ee... no oat milk? Hmm. OK, normal milk is OK. No problem.',
      'Here. I sit here, near window. Is very cold today, I want hot drink.',
      'And one cake also. Chocolate cake. How much it is?',
      'Sorry, again please? Seven pounds?',
      'I pay with card. Card is OK?',
      'OK. Thank you. Thank you very much. Bye.',
    ].join('\n'),
    metrics: { wpm: 58, longPauses: 7, fillers: 4, seconds: 75 },
    reference: { range: 2, accuracy: 2, fluency: 2, interaction: 2 },
    rationale: 'Turns are mostly one to three words from a small everyday stock (Cappuccino. Big one. Chocolate cake). Systematic basic errors: the missing subject in “Is very cold today”, article drops (near window, hot drink), statement order in “How much it is?”. The order opens with a bare command (Give me coffee); the learner copes with the missing oat milk and asks for repetition, but the barista carries the exchange. Pace 58 wpm with seven long pauses. Solid A2 on every criterion.',
  },
  {
    id: 's02-directions-a2',
    task: 'Role-play: asking a local for directions to the Central Library (rp.directions). The library has moved to a new building and the local speaks quickly.',
    response: [
      'Excuse me. Excuse me, sir. Where is library? Central Library.',
      'Sorry, I don’t understand. Slowly, please.',
      'Ah, library is not there? It is new place now? OK.',
      'Go straight, then... left? Left on the bank?',
      'Bank, OK. And after bank I go... right.',
      'It is far? I go with foot or with bus?',
      'Fifteen minutes. OK, is good. I like walk.',
      'Thank you, thank you. You are very kind man. Have a nice day.',
    ].join('\n'),
    metrics: { wpm: 62, longPauses: 6, fillers: 3, seconds: 78 },
    reference: { range: 2, accuracy: 2, fluency: 2, interaction: 2.5 },
    rationale: 'Vocabulary is basic and sometimes calqued (with foot, I like walk). Articles are missing throughout (Where is library?, new place, very kind man) and questions rely on intonation (It is far?). Turns are fragments with pauses mid-route. Interaction is a little stronger than the rest: the learner asks the local to slow down, checks two steps of the route back (Left on the bank?) and catches that the library has moved, so A2+ there and A2 elsewhere.',
  },
  {
    id: 's03-pharmacy-a2plus',
    task: 'Role-play: at a pharmacy, asking for something for a cough and a sore throat (rp.pharmacy). The pharmacist asks who it is for, how long, and about other medicines.',
    response: [
      'Good afternoon. I need something for cough, please. And my throat is very sore.',
      'It is for me. I am ill three days. Since Saturday.',
      'No, I don’t have temperature. Only cough, and at night is worse.',
      'No, I don’t take other medicine. Only tea with lemon.',
      'OK, syrup. How often I must take it?',
      'Two times in day, after food. OK.',
      'Is it make me sleepy? Because I drive car to work every day.',
      'Ah, OK, so better in evening. Thank you. How much is it?',
      'Can I pay by card?',
    ].join('\n'),
    metrics: { wpm: 76, longPauses: 5, fillers: 5, seconds: 70 },
    reference: { range: 2.5, accuracy: 2.5, fluency: 2.5, interaction: 3 },
    rationale: 'Enough words for the transaction (something for cough, my throat is very sore, after food) with gaps covered simply. Present simple is mostly right, but errors recur in each longer sentence: “I am ill three days”, “at night is worse”, “How often I must take it?”, “Is it make me sleepy?”, articles dropped. Short turns of one or two sentences. Interaction reaches B1: the learner answers every question, asks how often to take the syrup and, unprompted, asks about sleepiness with a reason (driving), then pays politely.',
  },
  {
    id: 's04-hotel-b1',
    task: 'Role-play: calling hotel reception at night (rp.hotel-room-problem). The air conditioning in the room is not working and the room is next to the noisy lift; the engineer only works in the morning.',
    response: [
      'Hello, good evening. I’m calling from room 412. I’m sorry, but there’s a problem with my room.',
      'The air conditioner is not working. I was try the remote control many times, but it only makes a noise and the air is still hot. It’s really difficult to sleep.',
      'And also my room is next to the lift, so every few minutes I hear it.',
      'Is it possible to send somebody to repair it tonight?',
      'Oh, the engineer comes only in morning? Hmm. Then could I move to another room, maybe on other floor?',
      'I understand. I don’t mind if it is smaller, it’s only for two nights.',
      'Yes, I can come down to the reception in ten minutes. Should I bring my key card?',
      'Great, thank you so much for your help. You saved my night.',
    ].join('\n'),
    metrics: { wpm: 98, longPauses: 4, fillers: 5, seconds: 95 },
    reference: { range: 3, accuracy: 3, fluency: 3, interaction: 3.5 },
    rationale: 'Vocabulary is enough to explain the problem clearly (remote control, it only makes a noise, next to the lift) with one nice personal touch (You saved my night). Errors are frequent but never block meaning: “I was try”, “only in morning”, “on other floor”. Turns are connected with but, so, and also; some planning pauses. Interaction is B1+: a polite opening with the room number, a clear request, a quick switch to a second solution when the first is refused, flexibility (I don’t mind if it is smaller) and a practical check (Should I bring my key card?).',
  },
  {
    id: 's05-neighbour-b1',
    task: 'Role-play: meeting a new neighbour, a retired teacher, in the stairwell (rp.new-neighbour). She knows a useful rule about parking in the building.',
    response: [
      'Hi! I don’t think we met before. I’m Jasur, I moved to flat 6 last week.',
      'I’m from Uzbekistan, from Fergana. I came here for work, I’m working in a logistics company.',
      'Yes, it is my first time in England. Everything is new for me, especially the weather!',
      'Really? You were teacher of history? That’s very interesting. How long are you living in this building?',
      'Wow, twenty years. So you know everybody here.',
      'Actually, I have a question. I have a car and I don’t know where I can park it. Yesterday somebody put a paper on my car.',
      'Ah, I need a permit from the council. Where I can get it?',
      'Online, OK. Thank you, that’s very useful. My wife will be happy, she was worried about it.',
      'Nice to meet you, Helen. See you soon!',
    ].join('\n'),
    metrics: { wpm: 104, longPauses: 4, fillers: 6, seconds: 85 },
    reference: { range: 3, accuracy: 2.5, fluency: 3, interaction: 3 },
    rationale: 'Range fits a friendly B1 chat (especially the weather, logistics company) but paraphrases “a parking ticket” as “a paper on my car”. Accuracy is A2+: tense errors in “I don’t think we met before” and “How long are you living”, article drop in “You were teacher of history”, and question order in “Where I can get it?”. Turns are linked simply and keep going. Interaction is B1: an introduction with name and flat, reactions (Really? That’s very interesting), a follow-up question, raising the parking problem, and a warm close.',
  },
  {
    id: 's06-shoes-b1plus',
    task: 'Role-play: returning shoes whose sole came off after two weeks (rp.shoes-return). The learner has no receipt but paid by card; the shop’s policy is no refund without proof of purchase.',
    response: [
      'Hi, I’d like to return these shoes, please. I bought them here about two weeks before, and look, the sole is already coming off from the left one.',
      'I’m afraid I don’t have the receipt. I think I threw it away with the box, but I paid by card, so it should be in your system. I can show you the payment in my bank app.',
      'It was in twelfth of March, around six o’clock in the evening. Forty-five pounds.',
      'I understand you have rules, but I only wore them maybe five or six times, so I don’t think it’s normal.',
      'What are my options? If you can’t give money back, could I exchange them for the same model in a different colour?',
      'Oh, that’s great, so you can refund it to my card. How long it usually takes?',
      'Perfect. Thank you for being so patient with me.',
    ].join('\n'),
    metrics: { wpm: 112, longPauses: 3, fillers: 4, seconds: 88 },
    reference: { range: 3.5, accuracy: 3, fluency: 3.5, interaction: 3.5 },
    rationale: 'Good situational vocabulary (the sole is coming off, I threw it away with the box, refund it to my card, same model in a different colour). Accuracy stays at B1: “two weeks before” for ago, “in twelfth of March”, “coming off from”, and question order in “How long it usually takes?”. Turns are several connected sentences with few hesitations. Interaction is B1+: offers proof of payment without being asked, gives date and amount, acknowledges the rules while arguing, and asks for options with a fallback.',
  },
  {
    id: 's07-dayoff-b1plus',
    task: 'Role-play: asking the manager for a day off next Friday in a busy week before a deadline (rp.day-off-request).',
    response: [
      'Hi Rebecca, have you got a minute? I wanted to ask you something.',
      'I know this week is very busy, but would it be possible to take next Friday off? My sister is getting married on Saturday and the family is travelling to Samarkand on Friday morning.',
      'I already thought about my tasks. I can finish the client report until Thursday evening, and Dilshod said he can answer my emails on Friday. He knows the project good.',
      'Yes, I understand that the deadline is on Monday. If something urgent happens, I can check my phone in the train.',
      'Or maybe I can work half day on Friday, in the morning, and leave at twelve? Would that work better for you?',
      'Great, thank you so much. I’ll send you an email today with everything, so it’s clear for the team.',
    ].join('\n'),
    metrics: { wpm: 116, longPauses: 3, fillers: 5, seconds: 80 },
    reference: { range: 3.5, accuracy: 3, fluency: 3.5, interaction: 4 },
    rationale: 'Vocabulary is right for the workplace (take next Friday off, the client report, if something urgent happens). Grammar errors are typical B1: “until Thursday evening” for by, “knows the project good”, “in the train”, “work half day”, and the present perfect avoided in “I already thought”. Fluent, connected turns. Interaction is B2: checks the manager is free, acknowledges the busy week, gives a reason and a cover plan before being asked, offers a compromise and promises written follow-up.',
  },
  {
    id: 's08-interview-b2',
    task: 'Role-play: job interview for a team leader role in customer support (rp.job-interview). The interviewer’s hidden concern is that the candidate has never officially managed people.',
    response: [
      'Thank you for inviting me. So, I’ve been working in customer support for almost four years, first in a call centre in Tashkent and, for the last two years, at an online travel company, where I handle mostly complicated cases — refunds, cancelled flights, that kind of thing.',
      'That’s a fair question. I haven’t had the official title of team leader, but last year my manager was on maternity leave for four months, and I was responsible for training three new colleagues. I made a short guide with the most common problems, and we met every morning for ten minutes. After two months, their average handling time went down by around twenty percent.',
      'What I learned is that people need clear examples more than long rules.',
      'Could I ask you something? How is the team measured at the moment — is it more about speed or customer satisfaction?',
      'I see. That makes sense. Honestly, I think both are important, but if the customers are not satisfied, the speed doesn’t help much.',
    ].join('\n'),
    metrics: { wpm: 134, longPauses: 2, fillers: 4, seconds: 92 },
    reference: { range: 4, accuracy: 4, fluency: 4, interaction: 4 },
    rationale: 'A good professional range (handling time, responsible for training, that kind of thing) without much idiom. Grammar is controlled across present perfect continuous, past simple narrative and a cleft (What I learned is…); only minor slips (adverb position in “I handle mostly”, “the speed” for speed). Long, well-structured turns with an even pace. Interaction is B2: acknowledges the concern, answers it with a concrete example and result, then asks a relevant question and responds to the answer.',
  },
  {
    id: 's09-gp-b2',
    task: 'Role-play: seeing a GP about a headache that has lasted a week (rp.gp-appointment). The doctor needs details (where, what kind, what makes it worse, other symptoms, medicines, allergies) to find a sinus infection.',
    response: [
      'Good morning. I’ve had a really bad headache for about a week now, and painkillers only help for a couple of hours.',
      'It’s mostly here, around my eyes and in the forehead. It’s not a sharp pain, more like pressure, like my head is heavy.',
      'Actually, yes — it gets worse when I bend down, for example when I tie my shoes. And in the morning it’s the worst.',
      'I had a cold two weeks ago, and my nose is still a bit blocked, especially on the left side.',
      'I am taking paracetamol since Monday, two tablets three times a day, but I’m a bit worried because I don’t want to take too much.',
      'Oh, and I should mention I’m allergic to penicillin. I had a rash once when I was a child.',
      'So what do you think it is? And if you give me antibiotics, how long I should take them before I feel better?',
    ].join('\n'),
    metrics: { wpm: 126, longPauses: 2, fillers: 3, seconds: 84 },
    reference: { range: 4, accuracy: 3.5, fluency: 4, interaction: 4 },
    rationale: 'Precise symptom vocabulary (more like pressure, a bit blocked, I had a rash once) used to describe the pain exactly. Mostly accurate, but two B1+ errors that a B2 speaker usually avoids: “I am taking paracetamol since Monday” and statement order in the question “how long I should take them”, plus “in the forehead”. Fluent, developed turns. Interaction is B2: volunteers the key details (worse when bending, the cold, the allergy) and asks what it is and how long the treatment lasts.',
  },
  {
    id: 's10-disagree-b2plus',
    task: 'Role-play: a project meeting where the team lead proposes moving the launch two weeks earlier by cutting the testing phase (rp.meeting-disagree).',
    response: [
      'Can I just come in here? I see why an earlier launch is attractive, but to be honest, I’m not convinced that cutting testing is the right way to get there.',
      'The last time we shortened the testing phase, on the booking app, we had to release three fixes in the first week, and the support team got over two hundred complaints. That cost us more time than we have saved.',
      'Can I ask what’s driving the new date? Is it coming from client, or is it more of an internal target?',
      'Right, that’s helpful to know. In that case, maybe there’s a middle ground. What if we launch on the earlier date with a smaller set of features — the ones that have already been tested — and release the rest two weeks later, as planned?',
      'That way we’d still hit the target, and we wouldn’t be taking a risk with the parts that haven’t been checked properly.',
      'I’m happy to put together a quick comparison of both options by tomorrow, if that would help.',
    ].join('\n'),
    metrics: { wpm: 140, longPauses: 1, fillers: 3, seconds: 88 },
    reference: { range: 4.5, accuracy: 4, fluency: 4.5, interaction: 4.5 },
    rationale: 'Idiomatic, well-judged meeting language (come in here, a middle ground, what’s driving the new date, hit the target). Grammar is wide (passive perfect, second conditional, What if…) with two slips: “more time than we have saved” and “coming from client”, so B2 rather than B2+. Long, clearly organised turns at a natural pace. Interaction is B2+: interrupts politely, disagrees with evidence, asks about the other side’s pressure, proposes a compromise and offers a next step.',
  },
  {
    id: 's11-delivery-c1',
    task: 'Role-play: phoning a frustrated client to say her order of office chairs will be five days late because of a customs hold-up (rp.late-delivery-call). Her new store opens on Saturday.',
    response: [
      'Hello Linda, it’s Kamola from the account team. Is now a good time? I’m afraid I’m calling with some news you won’t like, so I wanted you to hear it from me directly rather than through an automatic email.',
      'Your chairs have been held up at customs — there was a problem with one of the certificates, which is on our side, not yours, and I’m genuinely sorry about that.',
      'Realistically, we’re looking at next Wednesday rather than this Friday. I’d rather give you a date I’m confident in than promise something I can’t deliver.',
      'Can I ask how this affects you? Is there anything specific planned for the end of the week?',
      'I see — that’s a real problem, then, with the store opening on Saturday. Let me suggest something: we have about forty of the same model in our local warehouse. We could get those to you by Thursday, so the showroom is at least furnished for the opening, and the rest would follow on Wednesday.',
      'And of course we’ll cover the delivery costs for both shipments. I’ll put all of this in writing within the hour.',
    ].join('\n'),
    metrics: { wpm: 150, longPauses: 0, fillers: 2, seconds: 86 },
    reference: { range: 5, accuracy: 5, fluency: 5, interaction: 5 },
    rationale: 'Broad, precise and tactful language (held up at customs, I’d rather give you a date I’m confident in than…, within the hour). No grammar errors across a wide range (present perfect passive, would rather… than, conditionals). Effortless, well-organised turns. Interaction is C1: checks it is a good time, delivers bad news directly and takes responsibility, asks about the impact, then builds a concrete solution around the client’s deadline and confirms follow-up in writing.',
  },
  {
    id: 's12-party-c1',
    task: 'Role-play: small talk at a friend’s birthday party with a guest you have never met (rp.friends-party). She is the host’s cousin and a little shy at first.',
    response: [
      'Hi, I don’t think we’ve met — I’m Timur. I’m a friend of Kamila’s from her old job. How do you two know each other?',
      'Her cousin? No way! She’s mentioned you loads of times — you’re the one who moved to Lisbon, right?',
      'That must have been quite a change. What made you to decide to go? I’ve always wondered whether I’d have the nerve to just pack up and leave like that.',
      'Honestly, I’m jealous. I’ve been talking about working abroad for years, but there’s always a reason to stay — a project, a promotion, my mum’s cooking.',
      'Ha, exactly, the food is the hardest part. So what do you actually do over there, if you don’t mind me asking?',
      'Oh, really? Funnily enough, I’m in user research too, though on the design side rather than data. We should definitely swap notes at some point.',
      'Anyway, I’m going to grab another drink — can I get you something? Then you have to tell me what Kamila was like as a teenager.',
    ].join('\n'),
    metrics: { wpm: 156, longPauses: 0, fillers: 3, seconds: 74 },
    reference: { range: 5, accuracy: 4.5, fluency: 5, interaction: 5 },
    rationale: 'Natural, idiomatic social English (loads of times, have the nerve to pack up and leave, swap notes, funnily enough). Grammar is wide and almost error-free (must have been, whether I’d have…), with one fossilised error typical of Uzbek and Russian speakers: “What made you to decide”, so B2+ for accuracy. Spontaneous rhythm and humour. Interaction is C1: draws a shy partner out with open questions, reacts, finds common ground and closes gracefully with an offer and a hook for the next chat.',
  },
];

const runs: Record<string, CalibrationRun[]> = {
  's01-cafe-a2': [
    run([2, 'Cappuccino. Big one', 'And one cake also. Chocolate cake'], [2, 'How much it is?', 'Is very cold today'], [2, 'Here. I sit here, near window'], [2, 'Give me coffee, please', 'Sorry, again please?']),
    run([2, 'Big one', 'normal milk is OK'], [2.5, 'I sit here, near window', 'How much it is?'], [2, 'Cappuccino. Big one.', 'Ee... no oat milk? Hmm.'], [2, 'Give me coffee, please', 'Card is OK?']),
    run([2, 'Chocolate cake', 'I want hot drink'], [2.5, 'Is very cold today, I want hot drink', 'How much it is?'], [2, 'Cappuccino. Big one.'], [2.5, 'Sorry, again please? Seven pounds?', 'OK, normal milk is fine. No problem.']),
  ],
  's02-directions-a2': [
    run([2, 'I go with foot or with bus?', 'is good'], [2, 'Where is library?', 'It is new place now?'], [2, 'And after bank I go... right'], [2, 'Excuse me, sir. Where is library?', 'Left on the bank?']),
    run([2, 'I like walk', 'You are very kind man'], [2, 'library is not there?', 'I go with foot'], [2, 'Go straight, then... left?'], [2.5, 'Slowly, please', 'It is far?']),
    run([2.5, 'Have a nice day', 'You are very kind man'], [2, 'Where is library?', 'I like walk'], [2.5, 'Fifteen minutes. OK, is good. I like walk.'], [2.5, 'Sorry, I don’t understand. Slowly, please.', 'Left on the bank?']),
  ],
  's03-pharmacy-a2plus': [
    run([2.5, 'I need something for cough', 'my throat is very sore'], [2.5, 'I am ill three days', 'How often I must take it?'], [2.5, 'Only cough, and at night is worse'], [3, 'Is it make me sleepy? Because I drive car to work every day.', 'Can I pay by card?']),
    run([2.5, 'Only tea with lemon', 'after food'], [2, 'Is it make me sleepy?', 'I am ill three days', 'at night is worse'], [2.5, 'It is for me. I am ill three days. Since Saturday.'], [3, 'How often I must take it?', 'Because I drive car to work every day']),
    run([2.5, 'my throat is very sore', 'Two times in day'], [2.5, 'Two times in day', 'Is it make me sleepy?'], [2.5, 'OK, syrup.'], [2.5, 'I need something for cough, please', 'Can I pay by card?']),
  ],
  's04-hotel-b1': [
    run([3, 'the air is still hot', 'I don’t mind if it is smaller'], [3, 'I was try the remote control many times', 'maybe on other floor?'], [3, 'I was try the remote control many times, but it only makes a noise and the air is still hot'], [3.5, 'Is it possible to send somebody to repair it tonight?', 'Then could I move to another room, maybe on other floor?']),
    run([3.5, 'every few minutes I hear it', 'You saved my night'], [3, 'the engineer comes only in morning?', 'I was try the remote control'], [3.5, 'And also my room is next to the lift, so every few minutes I hear it.'], [3.5, 'I’m sorry, but there’s a problem with my room', 'Should I bring my key card?']),
    run([3, 'the remote control', 'You saved my night'], [3, 'I tried the remote control many times', 'maybe on other floor?'], [3, 'Hmm. Then could I move to another room'], [3.5, 'I understand. I don’t mind if it is smaller', 'Is it possible to send somebody to repair it tonight?']),
  ],
  's05-neighbour-b1': [
    run([3, 'Everything is new for me, especially the weather!', 'I need a permit from the council'], [2.5, 'I don’t think we met before', 'How long are you living in this building?', 'Where I can get it?'], [3, 'I have a car and I don’t know where I can park it'], [3, 'How long are you living in this building?', 'Actually, I have a question.']),
    run([3, 'somebody put a paper on my car', 'that’s very useful'], [2.5, 'You were teacher of history?', 'Where I can get it?'], [3, 'I came here for work, I am working in a logistics company'], [3.5, 'Really? You were teacher of history? That’s very interesting.', 'Where I can get it?']),
    run([3.5, 'especially the weather', 'I need a permit from the council'], [3, 'I moved to flat 6 last week', 'How long are you living in this building?'], [3, 'Yesterday somebody put a paper on my car'], [3, 'Nice to meet you, Helen. See you soon!', 'Actually, I have a question.']),
  ],
  's06-shoes-b1plus': [
    run([3.5, 'the sole is already coming off', 'I threw it away with the box'], [3, 'about two weeks before', 'It was in twelfth of March'], [3.5, 'I think I threw it away with the box, but I paid by card, so it should be in your system'], [3.5, 'What are my options?', 'I understand you have rules, but I only wore them maybe five or six times']),
    run([3.5, 'refund it to my card', 'could I exchange them for the same model in a different colour?'], [3, 'How long it usually takes?', 'coming off from the left one'], [3.5, 'I can show you the payment in my bank app'], [4, 'I’m afraid I don’t have the receipt', 'What are my options? If you can’t give money back, could I exchange them']),
    run([3.5, 'Thank you for being so patient with me', 'the sole is already coming off'], [3.5, 'I’m afraid I don’t have the receipt', 'It was on twelfth of March'], [3.5, 'I understand you have rules'], [4, 'Thank you for being so patient with me', 'I can show you the payment in my bank app']),
  ],
  's07-dayoff-b1plus': [
    run([3.5, 'would it be possible to take next Friday off?', 'My sister is getting married on Saturday'], [3, 'I can finish the client report until Thursday evening', 'He knows the project good'], [3.5, 'I already thought about my tasks'], [4, 'Would that work better for you?', 'have you got a minute?']),
    run([3.5, 'If something urgent happens', 'the deadline is on Monday'], [3, 'I can check my phone on the train', 'work half day on Friday'], [3, 'Or maybe I can work half day on Friday, in the morning, and leave at twelve?'], [4, 'Dilshod said he can answer my emails on Friday', 'Or maybe I can work half day on Friday']),
    run([3.5, 'so it’s clear for the team', 'I wanted to ask you something'], [3, 'He knows the project good', 'I already thought about my tasks'], [3, 'Yes, I understand that the deadline is on Monday'], [3.5, 'I know this week is very busy, but would it be possible to take next Friday off?', 'I’ll send you an email today with everything']),
  ],
  's08-interview-b2': [
    run([4, 'that kind of thing', 'their average handling time went down by around twenty percent'], [4, 'I haven’t had the official title of team leader', 'the speed doesn’t help much'], [4, 'I made a short guide with the most common problems, and we met every morning for ten minutes'], [4, 'That’s a fair question.', 'Could I ask you something?']),
    run([4, 'I was responsible for training three new colleagues', 'people need clear examples more than long rules'], [3.5, 'What I learned is that people need clear examples', 'I handle mostly complicated cases'], [4, 'So, I’ve been working in customer support for almost four years'], [4, 'How is the team measured at the moment', 'I see. That makes sense.']),
    run([4.5, 'that kind of thing', 'That’s a fair question'], [4, 'I’ve been working in customer support for almost four years', 'if the customers are not satisfied'], [4, 'After two months, the average handling time went down'], [4.5, 'is it more about speed or customer satisfaction?', 'That’s a fair question.']),
  ],
  's09-gp-b2': [
    run([4, 'painkillers only help for a couple of hours', 'my nose is still a bit blocked'], [3.5, 'I am taking paracetamol since Monday', 'how long I should take them'], [4, 'Actually, yes — it gets worse when I bend down, for example when I tie my shoes'], [4, 'So what do you think it is?', 'Oh, and I should mention that I’m allergic to penicillin']),
    run([4, 'It’s not a sharp pain, more like pressure', 'I had a rash once'], [3.5, 'how long I should take them before I feel better?', 'in the forehead'], [4, 'I had a cold two weeks ago, and my nose is still a bit blocked, especially on the left side'], [4, 'I should mention I’m allergic to penicillin', 'what do you think it is?']),
    run([4, 'more like pressure', 'when I tie my shoes'], [4, 'I’ve had a really bad headache for about a week now', 'I am taking paracetamol since Monday'], [4.5, 'I’ve had a really bad headache for about a week now, and painkillers only help for a couple of hours'], [4, 'Actually, yes', 'So what do you think it is?']),
  ],
  's10-disagree-b2plus': [
    run([4.5, 'maybe there’s a middle ground', 'what’s driving the new date?'], [4, 'That cost us more time than we have saved', 'Is it coming from client'], [4.5, 'What if we launch on the earlier date with a smaller set of features'], [4.5, 'Can I just come in here?', 'I’m happy to put together a quick comparison of both options by tomorrow']),
    run([4, 'we’d still hit the target', 'I’m not convinced that cutting testing is the right way to get there'], [4, 'Is it coming from client, or is it more of an internal target?', 'the parts that haven’t been checked properly'], [4.5, 'The last time we shortened the testing phase, on the booking app, we had to release three fixes in the first week'], [4.5, 'Right, that’s really helpful to know.', 'Can I ask what’s driving the new date?']),
    run([4.5, 'more of an internal target', 'put together a quick comparison'], [4.5, 'the ones that have already been tested', 'we wouldn’t be taking a risk'], [4.5, 'That way we’d still hit the target'], [5, 'I see why an earlier launch is attractive, but to be honest', 'In that case, maybe there’s a middle ground.']),
  ],
  's11-delivery-c1': [
    run([5, 'Your chairs have been held up at customs', 'I’d rather give you a date I’m confident in than promise something I can’t deliver'], [5, 'so I wanted you to hear it from me directly rather than through an automatic email', 'We could get those to you by Thursday, so the showroom is at least furnished for the opening'], [5, 'Realistically, we’re looking at next Wednesday rather than this Friday'], [5, 'Can I ask how this affects you?', 'that’s a real problem, then, with the store opening on Saturday']),
    run([5, 'I’m genuinely sorry about that', 'the showroom is at least furnished for the opening'], [4.5, 'which is on our side, not yours', 'the rest would follow on Wednesday'], [5, 'Let me suggest something: we have about forty of the same model in our local warehouse'], [5, 'Is now a good time?', 'we’ll cover the delivery costs for both shipments']),
    run([4.5, 'held up at customs', 'within the hour'], [5, 'I’d rather give you a date I’m confident in', 'Your chairs have been held up at customs'], [5, 'I’ll put all of this in writing within the hour'], [5, 'I wanted you to hear it from me directly', 'Is there anything specific planned for the end of the week?']),
  ],
  's12-party-c1': [
    run([5, 'whether I’d have the nerve to just pack up and leave like that', 'We should definitely swap notes at some point'], [4.5, 'What made you to decide to go?', 'That must have been quite a change'], [5, 'I’ve been talking about working abroad for years, but there’s always a reason to stay'], [5, 'if you don’t mind me asking?', 'can I get you something?']),
    run([5, 'loads of times', 'Funny enough'], [4.5, 'What made you to decide to go?', 'I’ve always wondered whether I’d have the nerve'], [5, 'Anyway, I’m going to grab another drink'], [5, 'How do you two know each other?', 'Then you have to tell me what Kamila was like as a teenager']),
    run([5, 'pack up and leave', 'my mum’s cooking'], [5, 'you’re the one who moved to Lisbon, right?', 'though on the design side rather than data'], [4.5, 'Honestly, I’m jealous.'], [5, 'Her cousin? No way!', 'So what do you actually do over there']),
  ],
};

export const conversationCalibration: { samples: CalibrationSample[]; runs: Record<string, CalibrationRun[]> } = { samples, runs };
