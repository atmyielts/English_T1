// Original workplace speaking prompts: three per job role (a2 describe, b1 handle a situation, b2 persuade/compare).
import type { ProductionTask } from './types.ts';

export const SPEAKING: ProductionTask[] = [
  // general
  {
    id: 's-gen-1',
    skill: 'speaking',
    level: 'a2',
    job_role: 'general',
    prompt: 'Tell me about your job or your studies. What do you usually do on a normal day?',
    points: ['Where you work or study', 'Two or three things you do every day', 'What you like about it'],
    target: 45,
  },
  {
    id: 's-gen-2',
    skill: 'speaking',
    level: 'b1',
    job_role: 'general',
    prompt:
      'Imagine a new colleague joins your team and asks you for advice about their first week at work. What would you tell them?',
    points: ['Who they should meet first', 'The most important things to learn', 'One mistake they should avoid'],
    target: 60,
  },
  {
    id: 's-gen-3',
    skill: 'speaking',
    level: 'b2',
    job_role: 'general',
    prompt:
      'Some people prefer to work in an office, and others prefer to work from home. Which do you think is better for a team like yours? Give your opinion and explain why.',
    points: [
      'Compare the two ways of working',
      'Give at least two reasons for your opinion',
      'Say what a company can do to make your choice work well',
    ],
    target: 90,
  },

  // customer_service
  {
    id: 's-cs-1',
    skill: 'speaking',
    level: 'a2',
    job_role: 'customer_service',
    prompt:
      'Describe the work of a customer service worker. You can talk about your own job or a job you know well, for example in a shop or a call centre.',
    points: ['Who the customers are', 'What customers usually ask for', 'How the worker greets and helps them'],
    target: 45,
  },
  {
    id: 's-cs-2',
    skill: 'speaking',
    level: 'b1',
    job_role: 'customer_service',
    prompt:
      'Imagine a customer calls because they forgot the password for their online account and cannot log in. Explain to them, step by step, what they should do.',
    points: [
      'Greet the customer and check the problem',
      'Give clear steps in the right order',
      'Check that they understand and end the call politely',
    ],
    target: 60,
  },
  {
    id: 's-cs-3',
    skill: 'speaking',
    level: 'b2',
    job_role: 'customer_service',
    prompt:
      'Imagine a customer is shouting on the phone because their order was delivered to the wrong address. What would you say to calm them down and solve the problem?',
    points: [
      'Show that you understand how they feel',
      'Explain what you will do and when',
      'Stay polite but firm if they keep shouting',
    ],
    target: 90,
  },

  // sales
  {
    id: 's-sal-1',
    skill: 'speaking',
    level: 'a2',
    job_role: 'sales',
    prompt:
      'Describe a product that you sell at work or a product that you like to buy. Talk about it in a simple way.',
    points: ['What the product is', 'Who usually buys it', 'Why people like it'],
    target: 45,
  },
  {
    id: 's-sal-2',
    skill: 'speaking',
    level: 'b1',
    job_role: 'sales',
    prompt:
      'Imagine a customer comes into your shop to buy a mobile phone but does not know which one to choose. What questions would you ask, and how would you help them decide?',
    points: [
      'Questions about what they need and how much they want to spend',
      'How you would recommend a model',
      'How you would finish the sale',
    ],
    target: 60,
  },
  {
    id: 's-sal-3',
    skill: 'speaking',
    level: 'b2',
    job_role: 'sales',
    prompt:
      'Imagine a business customer tells you that your price is too high and that another company offers the same product for less. How would you persuade them to stay with your company?',
    points: [
      'Ask questions to understand what matters most to them',
      'Explain the value you give beyond the price',
      'Offer a fair solution that still works for your company',
    ],
    target: 90,
  },

  // hospitality
  {
    id: 's-hos-1',
    skill: 'speaking',
    level: 'a2',
    job_role: 'hospitality',
    prompt: 'Describe a hotel, restaurant or cafe that you know well.',
    points: ['Where it is and what it looks like', 'What services or food it offers', 'What guests like about it'],
    target: 45,
  },
  {
    id: 's-hos-2',
    skill: 'speaking',
    level: 'b1',
    job_role: 'hospitality',
    prompt:
      'Imagine you work at a hotel in Samarkand. A guest arrives in the evening and asks what they can see and do in the city tomorrow. What would you tell them?',
    points: ['Two or three places to visit', 'How to get there', 'One useful tip for their day'],
    target: 60,
  },
  {
    id: 's-hos-3',
    skill: 'speaking',
    level: 'b2',
    job_role: 'hospitality',
    prompt:
      'Imagine a guest comes to the front desk and complains that their room is noisy and the air conditioner does not work. The hotel is full tonight. What would you say, and what would you offer?',
    points: [
      'Apologise and show that you take the problem seriously',
      'Explain the options you can offer',
      'Persuade the guest to accept the best solution',
    ],
    target: 90,
  },

  // banking_finance
  {
    id: 's-bank-1',
    skill: 'speaking',
    level: 'a2',
    job_role: 'banking_finance',
    prompt: 'Describe a bank branch or a payment office that you have visited.',
    points: ['Where it is and what it looks like inside', 'What people usually do there', 'How the staff help customers'],
    target: 45,
  },
  {
    id: 's-bank-2',
    skill: 'speaking',
    level: 'b1',
    job_role: 'banking_finance',
    prompt:
      'Imagine an older customer wants to start using the bank mobile app. Explain to them how to set it up and how to use it safely.',
    points: [
      'The steps to install the app and log in',
      'Two things they can do in the app',
      'One safety rule, for example never sharing a code',
    ],
    target: 60,
  },
  {
    id: 's-bank-3',
    skill: 'speaking',
    level: 'b2',
    job_role: 'banking_finance',
    prompt:
      'Imagine a young customer asks you whether they should take a loan to buy a car now or save money for two years and buy it later. What would you say to them?',
    points: [
      'Compare the two options',
      'Explain the costs and risks of each one',
      'Give a balanced recommendation with reasons',
    ],
    target: 90,
  },

  // it_software
  {
    id: 's-it-1',
    skill: 'speaking',
    level: 'a2',
    job_role: 'it_software',
    prompt: 'Tell me about the computer programs or apps you use for work or study.',
    points: ['Which programs or apps you use', 'What you use them for', 'Which one you like most and why'],
    target: 45,
  },
  {
    id: 's-it-2',
    skill: 'speaking',
    level: 'b1',
    job_role: 'it_software',
    prompt:
      'Imagine a colleague who is not good with computers tells you their laptop is very slow. Explain what they can try before they call IT support.',
    points: [
      'Two or three simple things to check',
      'Why each one can help',
      'When they should call IT support',
    ],
    target: 60,
  },
  {
    id: 's-it-3',
    skill: 'speaking',
    level: 'b2',
    job_role: 'it_software',
    prompt:
      'Imagine your company needs a new system to manage customer orders. Your team can build it yourselves or buy a ready-made product. Your manager asks for your opinion. What would you recommend, and why?',
    points: [
      'Compare the cost, time and quality of each option',
      'Mention one risk of each option',
      'Give a clear recommendation',
    ],
    target: 90,
  },

  // healthcare
  {
    id: 's-hc-1',
    skill: 'speaking',
    level: 'a2',
    job_role: 'healthcare',
    prompt: 'Describe a clinic, pharmacy or hospital that you know.',
    points: ['Where it is', 'Who works there', 'What a visitor does when they arrive'],
    target: 45,
  },
  {
    id: 's-hc-2',
    skill: 'speaking',
    level: 'b1',
    job_role: 'healthcare',
    prompt:
      'Imagine you work at the reception of a clinic. A patient arrives for the first time. Explain what they need to do before they see the doctor.',
    points: [
      'How to register and which documents to show',
      'Where to wait and for how long',
      'How to pay and what happens after the visit',
    ],
    target: 60,
  },
  {
    id: 's-hc-3',
    skill: 'speaking',
    level: 'b2',
    job_role: 'healthcare',
    prompt:
      'Imagine a visitor at your clinic is upset because they have waited two hours to see a doctor. What would you say to them?',
    points: [
      'Show that you understand why they are upset',
      'Explain the delay without sharing private information about other patients',
      'Offer realistic options',
    ],
    target: 90,
  },

  // logistics
  {
    id: 's-log-1',
    skill: 'speaking',
    level: 'a2',
    job_role: 'logistics',
    prompt:
      'Talk about a warehouse, a shop storeroom or a delivery service that you know. What happens there every day?',
    points: ['What goods are there', 'What the workers do', 'What vehicles or equipment they use'],
    target: 45,
  },
  {
    id: 's-log-2',
    skill: 'speaking',
    level: 'b1',
    job_role: 'logistics',
    prompt:
      'Imagine a customer calls to ask where their parcel is, because it is two days late. What would you check, and what would you tell them?',
    points: [
      'The information you need from the customer',
      'The reason for the delay',
      'When the parcel will arrive',
    ],
    target: 60,
  },
  {
    id: 's-log-3',
    skill: 'speaking',
    level: 'b2',
    job_role: 'logistics',
    prompt:
      'Imagine your manager asks you to choose how to send regular orders from Tashkent to Istanbul: by truck or by train. Which option would you choose, and why?',
    points: [
      'Compare speed, cost and reliability',
      'Mention one risk of your choice',
      'Give a clear recommendation',
    ],
    target: 90,
  },

  // office_admin
  {
    id: 's-off-1',
    skill: 'speaking',
    level: 'a2',
    job_role: 'office_admin',
    prompt: 'Describe the office or place where you work or study.',
    points: ['What the room looks like', 'What equipment there is', 'What you do there every day'],
    target: 45,
  },
  {
    id: 's-off-2',
    skill: 'speaking',
    level: 'b1',
    job_role: 'office_admin',
    prompt:
      'Imagine a visitor arrives for a meeting with your manager, but your manager is 20 minutes late. What would you say and do?',
    points: [
      'Greet the visitor and explain the delay',
      'Offer something while they wait',
      'Keep the visitor informed',
    ],
    target: 60,
  },
  {
    id: 's-off-3',
    skill: 'speaking',
    level: 'b2',
    job_role: 'office_admin',
    prompt:
      'Imagine two senior colleagues both booked the same meeting room for an important meeting at the same time, and both are angry. How would you deal with the situation?',
    points: [
      'Listen to both sides calmly',
      'Suggest a fair solution',
      'Explain how to avoid the problem in the future',
    ],
    target: 90,
  },

  // management
  {
    id: 's-mgmt-1',
    skill: 'speaking',
    level: 'a2',
    job_role: 'management',
    prompt: 'Describe a good manager, team leader or teacher you have worked or studied with.',
    points: ['Who the person was', 'What they did every day', 'Why you think they were good'],
    target: 45,
  },
  {
    id: 's-mgmt-2',
    skill: 'speaking',
    level: 'b1',
    job_role: 'management',
    prompt:
      'Imagine you are a team leader, and a new team member has made the same mistake in their reports several times. How would you talk to them about it?',
    points: [
      'How you would start the conversation',
      'How you would explain the problem',
      'How you would help them improve',
    ],
    target: 60,
  },
  {
    id: 's-mgmt-3',
    skill: 'speaking',
    level: 'b2',
    job_role: 'management',
    prompt:
      'Imagine your company can give your team either a training programme or new equipment this year, but not both. Which would you choose, and how would you convince the senior managers?',
    points: [
      'Compare the two options',
      'Give reasons with examples',
      'Answer one possible objection',
    ],
    target: 90,
  },

  // engineering
  {
    id: 's-eng-1',
    skill: 'speaking',
    level: 'a2',
    job_role: 'engineering',
    prompt: 'Describe a machine, tool or piece of equipment that you use or know well.',
    points: ['What it is', 'What it does', 'How to use it safely'],
    target: 45,
  },
  {
    id: 's-eng-2',
    skill: 'speaking',
    level: 'b1',
    job_role: 'engineering',
    prompt:
      'Imagine a new worker joins your team at a factory. Explain the safety rules they must follow on the production floor.',
    points: [
      'What protective clothing to wear',
      'What to do if a machine stops suddenly',
      'Who to tell about a problem',
    ],
    target: 60,
  },
  {
    id: 's-eng-3',
    skill: 'speaking',
    level: 'b2',
    job_role: 'engineering',
    prompt:
      'Imagine the plant manager wants to increase production by 20% next month, but you think the machines are not ready and the workers are already tired. What would you say to the plant manager?',
    points: [
      'Explain the risks clearly',
      'Suggest a realistic alternative plan',
      'Disagree politely and respectfully',
    ],
    target: 90,
  },
];
