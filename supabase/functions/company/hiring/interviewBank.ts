// Follow-up interview questions, used when AI is off or over its limit, and as what the AI
// is asked to improve on. Original content. Questions are in English because the interview
// checks English; what to listen for is in the interviewer's language.
import type { JobRole, Skill } from '../../../../packages/company-core/src/mod.ts';
import type { MessageLocale } from './messages.ts';

export type Band = 'basic' | 'deeper';
export interface BankQuestion { question: string; follow_up: string }

/** Questions that probe one skill out loud, at two depths. */
export const SKILL_QUESTIONS: Record<Skill, Record<Band, BankQuestion[]>> = {
  grammar: {
    basic: [
      { question: 'What did you do at work or at your studies yesterday? Tell me step by step.', follow_up: 'And what are you going to do tomorrow?' },
      { question: 'Tell me about your last job. How long did you work there?', follow_up: 'Why did you leave, or why do you want to change?' },
      { question: 'What do you usually do when a customer or colleague is unhappy?', follow_up: 'What did you do the last time this happened?' },
    ],
    deeper: [
      { question: 'If you had started this career five years earlier, what would you have done differently?', follow_up: 'What would be different in your work today?' },
      { question: 'Describe a process at your last job that had been changed by the time you left. What was it like before?', follow_up: 'Who decided on the change, and how was it explained to the team?' },
      { question: 'What should have been done differently on a project that did not go well?', follow_up: 'What will you do next time so that it does not happen again?' },
    ],
  },
  vocabulary: {
    basic: [
      { question: 'What are the main things a person in this job does every day?', follow_up: 'Which of these do you like most, and why?' },
      { question: 'Describe your last workplace: the people, the place and the equipment.', follow_up: 'What would you change there?' },
      { question: 'Explain one thing from your work to someone who has never done it.', follow_up: 'Can you say it in a simpler way?' },
    ],
    deeper: [
      { question: 'Which terms from your field are hardest to explain to clients, and how do you explain them?', follow_up: 'Give me an example with one of those terms.' },
      { question: 'How would you describe the strengths and weaknesses of your last employer to a business partner?', follow_up: 'How would you say the same thing more diplomatically?' },
      { question: 'Tell me about a recent trend in your industry and what it means for companies like ours.', follow_up: 'What risks do you see in it?' },
    ],
  },
  reading: {
    basic: [
      { question: 'I will show you a short work email. Please read it and tell me in your own words what the writer wants.', follow_up: 'What should you do first after reading it?' },
      { question: 'What do you read in English for work or study? How often?', follow_up: 'What do you do when you meet a word you do not know?' },
      { question: 'Look at this short notice and tell me the two most important points.', follow_up: 'Who is it for?' },
    ],
    deeper: [
      { question: 'I will show you a paragraph from a work document. Summarise it in two sentences, then tell me what is missing.', follow_up: 'What question would you ask the author?' },
      { question: 'Tell me about a long English document you have used at work. How did you find what you needed in it?', follow_up: 'Was there anything you misunderstood at first?' },
      { question: 'Read this short policy. What does it allow, and what does it not allow?', follow_up: 'Can you think of a situation it does not cover?' },
    ],
  },
  listening: {
    basic: [
      { question: 'I will say a short phone message once. Please repeat the name, the time and the request.', follow_up: 'What would you do next?' },
      { question: 'If you do not understand a customer on the phone, what exactly do you say?', follow_up: 'Show me: I will speak quickly and you ask me to repeat.' },
      { question: 'I will give you three instructions. Please tell me what they are in the same order.', follow_up: 'Which one would you do first, and why?' },
    ],
    deeper: [
      { question: 'I will describe a client problem for about thirty seconds. Please summarise it and check that you understood correctly.', follow_up: 'What questions do you still have for me?' },
      { question: 'How do you follow a meeting in English when several people speak quickly?', follow_up: 'What do you do afterwards to make sure you caught everything?' },
      { question: 'I will state an opinion. Please tell me what I think, what I am worried about, and what I want you to do.', follow_up: 'How would you answer me?' },
    ],
  },
  writing: {
    basic: [
      { question: 'Please write two or three sentences now: tell a colleague you will be late tomorrow and why.', follow_up: 'How would you change it if it was for your manager?' },
      { question: 'What do you write in English at work? Show me how you start and finish an email.', follow_up: 'How do you ask for something politely in writing?' },
      { question: 'Please write a short message to a client confirming a meeting on Friday at ten.', follow_up: 'What would you add if the client had asked to move the time?' },
    ],
    deeper: [
      { question: 'Please write a short reply to a client who complains about a late delivery. Apologise and offer a next step.', follow_up: 'Which sentence would you make softer, and how?' },
      { question: 'How do you check your own English before you send an important email?', follow_up: 'Tell me about a writing mistake that caused a problem.' },
      { question: 'Please write three lines summarising this conversation for your manager.', follow_up: 'What did you leave out, and why?' },
    ],
  },
  speaking: {
    basic: [
      { question: 'Please introduce yourself and tell me why you want this job.', follow_up: 'What do you know about our company?' },
      { question: 'Tell me about a day when something went wrong at work. What happened?', follow_up: 'How did you feel, and what did you say?' },
      { question: 'Imagine I am a new colleague. Explain how to get to your office from the city centre.', follow_up: 'What if I come by bus?' },
    ],
    deeper: [
      { question: 'Tell me about a disagreement at work and how you handled it.', follow_up: 'What would the other person say about it?' },
      { question: 'Please persuade me in one minute that I should choose your idea over another option.', follow_up: 'I am still not sure. What else can you tell me?' },
      { question: 'Describe your greatest professional achievement, including your own role and the result.', follow_up: 'What did you learn that you still use?' },
    ],
  },
};

/** Situations from the job itself, asked whatever the weak skills are. */
export const ROLE_QUESTIONS: Partial<Record<JobRole, BankQuestion[]>> & { general: BankQuestion[] } = {
  general: [
    { question: 'Imagine a foreign visitor comes to our office and nobody is free to meet them. What do you say and do?', follow_up: 'What if they are angry about waiting?' },
    { question: 'A colleague from another country sends you a message you do not fully understand. What do you do?', follow_up: 'Write or say your reply.' },
    { question: 'Tell me how you would explain what our company does to a visitor, in English.', follow_up: 'What would you say about your own role?' },
    { question: 'You need to ask your manager for a day off next week. Say it to me as if I am your manager.', follow_up: 'I say it is a busy week. What do you answer?' },
  ],
  customer_service: [
    { question: 'I am a customer. My order arrived broken and I have already called twice. Please help me.', follow_up: 'I want my money back today. What can you do?' },
    { question: 'How do you calm an angry customer in the first thirty seconds of a call? Show me what you say.', follow_up: 'And if they interrupt you?' },
    { question: 'A customer asks for something you are not allowed to do. How do you say no politely?', follow_up: 'What can you offer instead?' },
    { question: 'You cannot solve my problem now and need to call me back. Tell me that, and confirm my details.', follow_up: 'What if I say I need it within the hour?' },
  ],
  sales: [
    { question: 'Please sell me your current or last product in one minute.', follow_up: 'I think it is too expensive. What do you say?' },
    { question: 'I am a new client and I already use a competitor. Why should I talk to you?', follow_up: 'Ask me three questions to find out what I need.' },
    { question: 'A client has not answered your proposal for two weeks. What do you write or say?', follow_up: 'They now say the budget is frozen. What next?' },
    { question: 'Tell me about your best deal. How did you close it?', follow_up: 'What nearly went wrong?' },
  ],
  call_centre: [
    { question: 'I am calling for the third time about the same problem. Answer my call as you would at work.', follow_up: 'I want to speak to your manager. What do you say?' },
    { question: 'Please spell my name back to me, and confirm my account number and date of birth.', follow_up: 'I gave you the wrong number. How do you correct it?' },
    { question: 'I cannot hear you well and the line is bad. What exactly do you say?', follow_up: 'The call drops. What do you do next?' },
    { question: 'You must put me on hold for two minutes. Tell me politely, then come back to me.', follow_up: 'It took five minutes. How do you apologise?' },
  ],
  retail: [
    { question: 'I am a tourist in your shop and I am looking for a gift. Please help me.', follow_up: 'I think it costs too much. What else can you show me?' },
    { question: 'I bought this yesterday and it does not work. I have no receipt. What do you say?', follow_up: 'I am getting angry. How do you respond?' },
    { question: 'Tell me the price, ask how I will pay, and offer me a bag.', follow_up: 'My card does not work. What now?' },
    { question: 'We do not have my size in stock. What can you offer me instead?', follow_up: 'When will it arrive, and how will I know?' },
  ],
  tourism: [
    { question: 'Please welcome a tour group and tell them the plan for the day.', follow_up: 'Someone asks if the museum is open on Monday. What do you say?' },
    { question: 'A tourist has lost their passport during your tour. What do you tell them, and what do you do?', follow_up: 'They do not speak much English. How do you make it simple?' },
    { question: 'Tell me the history of one famous place in your city in about a minute.', follow_up: 'A child in the group asks why it is famous. What do you answer?' },
    { question: 'The bus has broken down and the group is getting impatient. What do you say to them?', follow_up: 'One guest asks for their money back. How do you respond?' },
  ],
  aviation: [
    { question: 'A flight is delayed by three hours. Make the announcement to passengers.', follow_up: 'A passenger will miss their connection. What do you tell them?' },
    { question: 'A passenger refuses to put their bag under the seat before take-off. What do you say?', follow_up: 'They still refuse. What do you do next?' },
    { question: 'A passenger feels unwell during the flight. What questions do you ask?', follow_up: 'How do you tell your colleagues what is happening?' },
    { question: 'Check me in: ask for my documents, ask about my luggage and tell me my gate.', follow_up: 'My bag is five kilos over the limit. What do you say?' },
  ],
  legal_compliance: [
    { question: 'Explain to a foreign partner why you need documents showing who owns their company.', follow_up: 'They say this is confidential. How do you answer?' },
    { question: 'Please summarise, in plain English, what one clause of a contract requires each side to do.', follow_up: 'What happens if one side does not do it?' },
    { question: 'A colleague wants to skip a required check because a client is in a hurry. What do you say?', follow_up: 'Your manager asks you to allow it this one time. How do you respond?' },
    { question: 'Tell me about a rule in your field that people find hard to follow, and how you explain it.', follow_up: 'What is the risk to the company if it is ignored?' },
  ],
  hospitality: [
    { question: 'I am a guest. My room is noisy, and the hotel is full tonight. What do you tell me?', follow_up: 'I want a discount. How do you respond?' },
    { question: 'A guest arrives at midnight and their booking cannot be found. Please talk to me as that guest.', follow_up: 'I booked online and paid. What do you do now?' },
    { question: 'Recommend three things to do in your city for a family with children.', follow_up: 'How can we get there, and how much will it cost?' },
    { question: 'Please check me in: greet me, ask for what you need and explain breakfast and wifi.', follow_up: 'I also need a late check-out. What do you say?' },
  ],
  banking_finance: [
    { question: 'I am a foreign client and I want to open an account. Explain what I need to bring.', follow_up: 'Why do you need so many documents?' },
    { question: 'My card was blocked while I was travelling. Please help me and check who I am.', follow_up: 'I am in a hurry. Can you skip the questions?' },
    { question: 'Explain the difference between a fixed and a floating interest rate in simple English.', follow_up: 'Which is better for me if I am borrowing for ten years?' },
    { question: 'A client says a fee is unfair. How do you explain it without losing the client?', follow_up: 'They ask you to remove the fee. What do you say?' },
  ],
  it_software: [
    { question: 'Explain to a non-technical manager why a release has to be delayed.', follow_up: 'They ask what the risk is if you release anyway. What do you say?' },
    { question: 'Describe the most difficult bug you have fixed: what happened, how you found it, and how you fixed it.', follow_up: 'How did you stop it from happening again?' },
    { question: 'Please give a short status update as if you are in a daily stand-up with a foreign team.', follow_up: 'Someone disagrees with your approach. How do you respond?' },
    { question: 'How do you ask for help in English when you are stuck? Show me a message you would post.', follow_up: 'What details would you include?' },
  ],
  healthcare: [
    { question: 'A foreign patient comes in with a stomach ache. What questions do you ask first?', follow_up: 'They are frightened. What do you say to calm them?' },
    { question: 'Explain to a patient how to take a medicine three times a day after meals.', follow_up: 'What should they do if they forget a dose?' },
    { question: 'A patient wants an appointment today, but the doctor is fully booked. What do you say?', follow_up: 'The patient says it is urgent. What do you do?' },
    { question: 'Explain a simple procedure before you start it, so that the patient knows what will happen.', follow_up: 'They ask if it will hurt. What do you answer?' },
  ],
  logistics: [
    { question: 'A shipment is stuck at customs and the client is calling you. What do you tell them?', follow_up: 'They ask who pays for the delay. What do you say?' },
    { question: 'Explain to a new client how a delivery from China to Tashkent works, step by step.', follow_up: 'What documents will they need?' },
    { question: 'A driver reports that some goods are damaged. Write or say what you send to the client.', follow_up: 'What information do you need from the driver?' },
    { question: 'Please confirm a pickup with a foreign supplier: date, address, weight and contact person.', follow_up: 'The supplier wants to change the date. How do you respond?' },
  ],
  office_admin: [
    { question: 'Your director has a foreign guest tomorrow. What do you arrange, and what do you write to the guest?', follow_up: 'The flight is delayed by three hours. What changes?' },
    { question: 'Take a phone message from me: I am a partner, I need to speak to your director about a contract.', follow_up: 'Read the message back to me.' },
    { question: 'Please write a short notice to all staff about an office move next Monday.', follow_up: 'People are asking about parking. What do you add?' },
    { question: 'How do you say no to someone who wants a meeting with your director today?', follow_up: 'They insist. What do you do?' },
  ],
  management: [
    { question: 'Tell me how you give difficult feedback to a good employee. Show me what you would say.', follow_up: 'They become defensive. How do you continue?' },
    { question: 'Please present your department\'s results to a foreign board in one minute.', follow_up: 'A board member asks why one number is down. What do you answer?' },
    { question: 'Your team has to take on a change it does not like. How do you announce it?', follow_up: 'What do you say to the person who objects most?' },
    { question: 'Describe a decision you made with too little information.', follow_up: 'What would you do differently today?' },
  ],
  engineering: [
    { question: 'A machine has stopped on the line. Explain to a foreign engineer on the phone what you see.', follow_up: 'They ask what you have already checked. What do you say?' },
    { question: 'Describe how your department checks quality, as if I am an auditor from abroad.', follow_up: 'What happens when a part fails the check?' },
    { question: 'Read this part of a manual and tell me the safety steps in your own words.', follow_up: 'What happens if a step is skipped?' },
    { question: 'Tell me about a technical problem you solved at work.', follow_up: 'How did you explain the solution to people who are not engineers?' },
  ],
};

/** What the interviewer should listen for in each skill. */
export const LISTEN_FOR: Record<Skill, Record<MessageLocale, string>> = {
  grammar: {
    en: 'Correct past and future forms, questions formed properly, and whether errors get in the way of understanding.',
    ru: 'Правильные формы прошедшего и будущего времени, построение вопросов, мешают ли ошибки пониманию.',
    uz: 'O‘tgan va kelasi zamon shakllari, savollarning to‘g‘ri tuzilishi, xatolar tushunishga xalaqit beradimi.',
  },
  vocabulary: {
    en: 'Precise words for the job, ways of explaining a word they do not know, and little repetition.',
    ru: 'Точные слова по профессии, умение объяснить незнакомое слово, мало повторов.',
    uz: 'Kasbga oid aniq so‘zlar, notanish so‘zni tushuntira olish, kam takrorlash.',
  },
  reading: {
    en: 'Finds the main point and the action needed, without translating word by word.',
    ru: 'Находит главную мысль и нужное действие, не переводя дословно.',
    uz: 'Asosiy fikr va kerakli harakatni topadi, so‘zma-so‘z tarjima qilmaydi.',
  },
  listening: {
    en: 'Catches names, numbers and the request, and checks understanding instead of guessing.',
    ru: 'Улавливает имена, цифры и просьбу, уточняет, а не угадывает.',
    uz: 'Ismlar, raqamlar va iltimosni ilg‘aydi, taxmin qilmay aniqlashtiradi.',
  },
  writing: {
    en: 'A clear structure, the right tone for the reader, and the main point stated early.',
    ru: 'Понятная структура, тон по адресату, главная мысль в начале.',
    uz: 'Aniq tuzilma, o‘quvchiga mos ohang, asosiy fikr boshida.',
  },
  speaking: {
    en: 'Keeps going without long pauses, is easy to understand, and answers the actual question.',
    ru: 'Говорит без долгих пауз, его легко понять, отвечает именно на вопрос.',
    uz: 'Uzoq pauzalarsiz gapiradi, oson tushuniladi, aynan savolga javob beradi.',
  },
};

export const ROLE_LISTEN_FOR: Record<MessageLocale, string> = {
  en: 'Handles the situation in English as they would on the job: polite, clear, and with a next step.',
  ru: 'Справляется с ситуацией на английском как на работе: вежливо, понятно, со следующим шагом.',
  uz: 'Vaziyatni ishdagidek ingliz tilida hal qiladi: xushmuomala, aniq, keyingi qadam bilan.',
};
