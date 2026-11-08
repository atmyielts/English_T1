// Bank items for human resources staff. Original Schood content; companies are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'human_resources';
export const bank: RoleBank = {
  grammar: grammar(role, 'hr', [
    ['a2', 'How many people ___ for this job last month?', ['apply', 'applied', 'applies', 'applying'], 1],
    ['b1', 'She ___ in this company since 2021.', ['works', 'worked', 'has worked', 'is work'], 2],
    ['b1', 'New employees must complete the form before they ___ work.', ['start', 'will start', 'started', 'are start'], 0],
    ['b2', 'The candidate asked when she ___ a decision.', ['will receive', 'received', 'would receive', 'had receive'], 2],
    ['b2', 'If he ___ more experience, we would have offered him the job.', ['had', 'has had', 'had had', 'would have'], 2],
    ['c1', 'Not only ___ the candidate lack experience, but she also arrived late.', ['did', 'was', 'had', 'has'], 0],
  ]),
  vocabulary: vocabulary(role, 'hr', [
    ['a2', 'Please send us your ___ with your work experience.', ['CV', 'menu', 'map', 'bill'], 0],
    ['a2', 'I have an ___ at ten tomorrow for the new job.', ['interest', 'interview', 'invoice', 'internet'], 1],
    ['b1', 'New employees have a three-month ___ period.', ['problem', 'promotion', 'probation', 'protection'], 2],
    ['b1', 'I am taking ten days of annual ___ in August.', ['break', 'leave', 'stop', 'free'], 1],
    ['b1', 'Your ___ shows your salary and any deductions.', ['payslip', 'passport', 'printout', 'password'], 0],
    ['b2', 'High staff ___ means we spend too much on hiring.', ['turnaround', 'turnover', 'turning', 'return'], 1],
    ['b2', 'We removed names from CVs to reduce ___ in hiring.', ['bias', 'basis', 'budget', 'balance'], 0],
    ['c1', 'He formally ___ from his position and gave a month’s notice.', ['retired', 'dismissed', 'resigned', 'rejected'], 2],
  ]),
  reading: [
    reading('r-hr-01', role, 'b1', 'email', 'Your First Week at Navbahor Group', `Dear Bekzod,

We are very glad you are joining us on Monday. Here is some useful information for your first week.

Please come to reception at 9:00 and bring your passport and diploma. Kamola from HR will meet you there, take you through the forms and give you your pass. Your manager, Rustam, will then introduce you to the team and explain your first tasks.

From Tuesday to Thursday, you will have a short training session every morning on our systems, safety rules and company values. On Friday you will have a meeting with Rustam to talk about how your first week has gone.

Lunch is from 13:00 to 14:00, and the canteen is on the first floor. If you need anything before Monday, please call me.

Best wishes,
Kamola Rakhimova`, [
      ['What should Bekzod bring on Monday?', ['A laptop', 'His passport and diploma', 'A photo', 'His lunch'], 1],
      ['Who will explain his first tasks?', ['Kamola', 'A trainer', 'Rustam', 'The receptionist'], 2],
      ['What will happen on Friday?', ['A meeting with his manager', 'A safety exam', 'A team lunch', 'A session on systems'], 0],
    ]),
  ],
  listening: [
    listening('l-hr-01', role, 'b2', 'meeting', 'Why Are People Leaving?', [
      ['Director', 'Kamola, I see that thirty people left the call centre this year. That seems very high. What’s going on?'],
      ['HR manager', 'It is high. That’s about a quarter of the team. I’ve read all the exit interviews, and two reasons come up again and again.'],
      ['Director', 'Is it pay? It usually is.'],
      ['HR manager', 'Pay is one reason, but it isn’t the main one. Most people mention night shifts, because they change every week.'],
      ['Director', 'So people can’t plan their lives. What do you suggest?'],
      ['HR manager', 'I suggest fixed shifts for three months at a time. We could try it with one team first, and compare the results.'],
      ['Director', 'What would it cost?'],
      ['HR manager', 'Very little, really. Replacing one person costs far more than changing a rota. I can bring the numbers on Monday.'],
    ], [
      ['What is the main reason people give for leaving?', ['Low pay', 'Shifts that change every week', 'A bad manager', 'A long journey'], 1],
      ['What does the HR manager suggest?', ['Raising pay for everyone', 'Closing at night', 'Trying fixed shifts with one team', 'Hiring thirty people'], 2],
      ['Why does she think the cost would be low?', ['Replacing people costs far more', 'Staff will pay for it', 'The director has a budget', 'No one works at night'], 0],
    ]),
  ],
  writing: writing(role, 'hr', [
    ['b1', 'Write a short internal notice that the office will close early on Friday for a staff event, and explain what staff should do.', ['Give the date and the closing time', 'Explain the event', 'Say what staff must arrange before leaving', 'Say who to contact'], 90],
    ['b2', 'Your company struggles to find English-speaking accountants. Write a short proposal to the CEO with two or three ways to solve this, including training current staff.', ['Describe the hiring problem', 'Suggest specific solutions', 'Compare cost and time', 'Make a clear recommendation'], 160],
  ]),
  speaking: speaking(role, 'hr', [
    ['a2', 'Tell a new employee about the working hours, lunch and who to ask for help.', ['Give the working hours', 'Say where and when lunch is', 'Say who to ask'], 45],
    ['b1', 'Explain to an employee how to take annual leave and what to do if they become ill.', ['Explain the leave request', 'Explain what to do when ill', 'Offer to help'], 60],
    ['b2', 'A manager wants to reject a candidate because of her age. Explain why you disagree and suggest a fairer approach.', ['State your concern respectfully', 'Focus on the job requirements', 'Suggest a fair process'], 90],
  ]),
};
