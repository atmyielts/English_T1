// Original workplace writing tasks: two per job role (b1 email/note, b2 report/proposal).
import type { ProductionTask } from './types.ts';

export const WRITING: ProductionTask[] = [
  // general
  {
    id: 'w-gen-1',
    skill: 'writing',
    level: 'b1',
    job_role: 'general',
    prompt:
      'You started a new job last week. Your manager, Malika, has asked you to write a short email to the whole team to introduce yourself.',
    points: [
      'Say what your role is and when you started',
      'Describe your experience or main skills',
      'Tell colleagues how they can contact you and how you can help them',
    ],
    target: 90,
  },
  {
    id: 'w-gen-2',
    skill: 'writing',
    level: 'b2',
    job_role: 'general',
    prompt:
      'Your company plans to change from fixed working hours (9:00 to 18:00) to flexible hours. Your manager has asked every employee to send an email with their opinion before a final decision is made.',
    points: [
      'Give your opinion with at least two reasons',
      'Describe one possible problem with the change',
      'Suggest how the company could test or introduce the change',
    ],
    target: 140,
  },

  // customer_service
  {
    id: 'w-cs-1',
    skill: 'writing',
    level: 'b1',
    job_role: 'customer_service',
    prompt:
      'You work in customer service for an online shop. A customer, Mr Rustam Karimov, emailed to say that his order arrived three days late and the box was damaged. Write a reply to him.',
    points: [
      'Apologise and thank him for telling you',
      'Explain what you will do now',
      'Offer something to make up for the problem',
    ],
    target: 90,
  },
  {
    id: 'w-cs-2',
    skill: 'writing',
    level: 'b2',
    job_role: 'customer_service',
    prompt:
      'A customer has sent an angry message through your company website. She says she called the help line four times about a wrong charge on her bill and nobody called her back. Write a reply to her as a customer service supervisor.',
    points: [
      'Accept that her experience was not good enough, without blaming colleagues',
      'Explain clearly what is happening with her case and the next steps, with dates',
      'Describe what your team will change so this does not happen again',
    ],
    target: 140,
  },

  // sales
  {
    id: 'w-sal-1',
    skill: 'writing',
    level: 'b1',
    job_role: 'sales',
    prompt:
      'Yesterday at a trade fair in Tashkent you met Aziza Yusupova, the owner of three small cafes. She was interested in the coffee machines your company sells. Write a follow-up email to her.',
    points: [
      'Thank her for the conversation and remind her who you are',
      'Give two main benefits of your coffee machines for her cafes',
      'Suggest a next step, such as a demonstration or a phone call',
    ],
    target: 90,
  },
  {
    id: 'w-sal-2',
    skill: 'writing',
    level: 'b2',
    job_role: 'sales',
    prompt:
      'A hotel in Samarkand has bought cleaning supplies from your company for three years. Their purchasing manager says another supplier has offered prices 15% lower and they may change supplier. Write an email to the purchasing manager.',
    points: [
      'Show that you value the relationship with the hotel',
      'Explain what your company offers that a lower price may not include',
      'Make a clear offer to keep the client, such as better terms or extra service',
    ],
    target: 150,
  },

  // hospitality
  {
    id: 'w-hos-1',
    skill: 'writing',
    level: 'b1',
    job_role: 'hospitality',
    prompt:
      'You work at the front desk of a hotel in Samarkand. A guest from Korea, Ms Kim, booked a double room for 12 to 15 May at $70 per night. She has emailed to ask you to confirm the booking and to ask if the hotel can collect her from the airport.',
    points: [
      'Confirm her dates, room type and total price',
      'Answer her question about the airport transfer',
      'Give the check-in time and one other useful piece of information',
    ],
    target: 90,
  },
  {
    id: 'w-hos-2',
    skill: 'writing',
    level: 'b2',
    job_role: 'hospitality',
    prompt:
      'Last night a water pipe broke on the third floor of the hotel in Bukhara where you are duty manager. Three rooms were affected and two guests had to move to new rooms at midnight. Write an incident report for the general manager.',
    points: [
      'Describe what happened and when',
      'Explain what staff did to help the guests and fix the problem',
      'Recommend actions to prevent a similar incident',
    ],
    target: 140,
  },

  // banking_finance
  {
    id: 'w-bank-1',
    skill: 'writing',
    level: 'b1',
    job_role: 'banking_finance',
    prompt:
      'You are a bank officer. A client, Dilnoza Rakhimova, is opening a small shop and has emailed to ask how to open a business account at your bank. Write a reply to her.',
    points: [
      'List the documents she needs to bring',
      'Explain how long it takes to open the account',
      'Invite her to book an appointment and explain how to do it',
    ],
    target: 90,
  },
  {
    id: 'w-bank-2',
    skill: 'writing',
    level: 'b2',
    job_role: 'banking_finance',
    prompt:
      'Since a security update last month, many clients have complained that the bank mobile app logs them out too often. Your manager has asked you to write a short summary of the situation for the management team.',
    points: [
      'Summarise the complaints and how they affect clients',
      'Explain why the security change was introduced',
      'Suggest one or two ways to keep the app safe but easier to use',
    ],
    target: 140,
  },

  // it_software
  {
    id: 'w-it-1',
    skill: 'writing',
    level: 'b1',
    job_role: 'it_software',
    prompt:
      'You work in the IT team. Tomorrow morning the company document system will be unavailable for two hours while your team installs an update. Write an email to all staff.',
    points: [
      'Say when the system will be unavailable and for how long',
      'Explain briefly why the update is needed',
      'Tell staff what to do before and during the update',
    ],
    target: 90,
  },
  {
    id: 'w-it-2',
    skill: 'writing',
    level: 'b2',
    job_role: 'it_software',
    prompt:
      'Your team is building a mobile app for a client in Germany. The next release will be two weeks later than planned. Write an email to the client project manager, Mr Weber, to explain the situation.',
    points: [
      'Explain the delay honestly, including its main cause',
      'Give a new plan with dates',
      'Describe what you will do to reduce the risk of more delays',
    ],
    target: 150,
  },

  // healthcare
  {
    id: 'w-hc-1',
    skill: 'writing',
    level: 'b1',
    job_role: 'healthcare',
    prompt:
      'You work at the reception of a private clinic in Tashkent. A patient emailed to ask if he can move his dentist appointment from Monday to later in the week. Write a reply to him.',
    points: [
      'Offer a new day and time and ask him to confirm',
      'Remind him what to bring to the appointment',
      'Explain the clinic rule for late cancellations',
    ],
    target: 90,
  },
  {
    id: 'w-hc-2',
    skill: 'writing',
    level: 'b2',
    job_role: 'healthcare',
    prompt:
      'You are a senior nurse and your night shift on a hospital ward is ending. The day nurse, Malika, will arrive late, so you cannot speak to her in person. Write a handover note for her.',
    points: [
      'Summarise the main events of the night on the ward',
      'List the tasks that must be done in the morning, in order of priority',
      'Mention any problems with equipment or supplies and what you have reported',
    ],
    target: 140,
  },

  // logistics
  {
    id: 'w-log-1',
    skill: 'writing',
    level: 'b1',
    job_role: 'logistics',
    prompt:
      'A delivery of 200 boxes for a supermarket in Samarkand will arrive one day late because the truck broke down near Jizzakh. Write an email to the store manager.',
    points: [
      'Explain the reason for the delay',
      'Give the new delivery day and time',
      'Apologise and tell the manager how to contact you or the driver',
    ],
    target: 90,
  },
  {
    id: 'w-log-2',
    skill: 'writing',
    level: 'b2',
    job_role: 'logistics',
    prompt:
      'Your company needs a new transport partner for regular deliveries between Tashkent and Almaty, Kazakhstan. Write an email to a transport company asking them to send an offer.',
    points: [
      'Describe what you need: type of goods, amount and how often',
      'Ask about prices, delivery times and help with customs',
      'Explain how you will choose a partner and by what date',
    ],
    target: 140,
  },

  // office_admin
  {
    id: 'w-off-1',
    skill: 'writing',
    level: 'b1',
    job_role: 'office_admin',
    prompt:
      'You are an office administrator. Five visitors from a partner company in Turkey will come to your office next Tuesday. Write an email to your colleagues about the visit.',
    points: [
      'Give the date, time and purpose of the visit',
      'Explain what colleagues need to prepare',
      'Tell them about any changes, such as meeting room bookings or parking',
    ],
    target: 90,
  },
  {
    id: 'w-off-2',
    skill: 'writing',
    level: 'b2',
    job_role: 'office_admin',
    prompt:
      'This year your office has spent 30% more on paper and printer ink than last year. Your manager, Rustam, has asked you to write a short proposal to reduce these costs.',
    points: [
      'Describe the current problem and its main causes',
      'Suggest at least two practical changes',
      'Explain how you will inform staff and check the results',
    ],
    target: 140,
  },

  // management
  {
    id: 'w-mgmt-1',
    skill: 'writing',
    level: 'b1',
    job_role: 'management',
    prompt:
      'You are a team leader. This morning you held a team meeting about the work schedule for next month, but two team members were absent. Write a summary email to the whole team.',
    points: [
      'Summarise the main decisions from the meeting',
      'Say who is responsible for each task and the deadlines',
      'Tell the team when and how they can ask questions',
    ],
    target: 100,
  },
  {
    id: 'w-mgmt-2',
    skill: 'writing',
    level: 'b2',
    job_role: 'management',
    prompt:
      'Your department must choose one of two options for next year: hiring one more experienced specialist, or training three current employees in new skills. Write a short proposal to the director, Jasur Aliev, recommending one option.',
    points: [
      'Compare the two options, including cost and time',
      'Recommend one option and give clear reasons',
      'Explain the main risk of your choice and how you will manage it',
    ],
    target: 150,
  },

  // engineering
  {
    id: 'w-eng-1',
    skill: 'writing',
    level: 'b1',
    job_role: 'engineering',
    prompt:
      'You are a maintenance engineer at a factory. One of the packing machines stopped working this afternoon. Write a short report to the production manager.',
    points: [
      'Describe what happened and when',
      'Explain what you have done so far',
      'Say what you need to repair it, such as parts, time or help',
    ],
    target: 90,
  },
  {
    id: 'w-eng-2',
    skill: 'writing',
    level: 'b2',
    job_role: 'engineering',
    prompt:
      'A supplier in Germany has sent a batch of 2,000 steel parts to your factory. Your quality checks found that about 10% of them are the wrong size. Write an email to the supplier.',
    points: [
      'Describe the problem with clear details',
      'Explain how it affects your production',
      'Ask for a specific solution and a reply by a certain date',
    ],
    target: 150,
  },
];
