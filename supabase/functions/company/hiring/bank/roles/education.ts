// Bank items for teachers and education staff. Original Schood content; schools are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'education';
export const bank: RoleBank = {
  grammar: grammar(role, 'edu', [
    ['a1', 'There ___ twenty students in my class.', ['is', 'are', 'am', 'has'], 1],
    ['a2', 'Please ___ your homework by Friday.', ['to give', 'giving', 'give', 'gave'], 2],
    ['b1', 'Madina ___ English for three years, and she speaks it well.', ['studies', 'is studying', 'studied', 'has studied'], 3],
    ['b1', 'If students arrive late, they ___ to the school office first.', ['go', 'went', 'would go', 'gone'], 0],
    ['b2', 'The results were much better than the teacher ___.', ['is expecting', 'had expected', 'expects', 'will expect'], 1],
    ['c1', 'The principal insisted that every student ___ the safety rules.', ['follow', 'follows', 'following', 'is followed'], 0],
  ]),
  vocabulary: vocabulary(role, 'edu', [
    ['a2', 'The teacher wrote the new words on the ___.', ['board', 'floor', 'bag', 'door'], 0],
    ['a2', 'Please do exercises one and two for your ___.', ['homework', 'housework', 'network', 'teamwork'], 0],
    ['b1', 'Please ___ your essay by the end of the week.', ['hand in', 'hand on', 'hand out', 'hand up'], 0],
    ['b1', 'New students take a ___ test to find the right class.', ['position', 'placement', 'practice', 'payment'], 1],
    ['b1', 'The ___ evening is a chance to talk with the teachers.', ['parents’', 'pupils’', 'neighbours’', 'players’'], 0],
    ['b2', 'Copying from the internet without saying so is ___.', ['paragraph', 'plagiarism', 'publicity', 'punishment'], 1],
    ['b2', 'The new ___ includes more science and computer skills.', ['carriage', 'currency', 'curriculum', 'calendar'], 2],
    ['c1', 'The school’s ___ policy protects children from harm and abuse.', ['safeguarding', 'safekeeping', 'saving', 'standardising'], 0],
  ]),
  reading: [
    reading('r-edu-01', role, 'b1', 'notice', 'New Rules for Mobile Phones at School', `Dear parents and students,

From Monday 4 November, students may not use mobile phones during the school day, including at break and lunchtime. Phones must be turned off and kept in school bags.

We are making this change because teachers have noticed that students talk less with each other at break, and some unkind messages have been sent during the day. We hope this will help students focus and spend more time with friends.

If a parent needs to contact a child during the day, please call the school office, and we will pass on your message. Students can also use the office phone if they need to call home.

Teachers may allow phones in class for a planned activity. If a phone is used without permission, it will be kept at the office until the end of the day.

Yulduz International School`, [
      ['When can students use phones according to the new rule?', ['At lunchtime', 'At break', 'When a teacher plans an activity', 'Whenever they want'], 2],
      ['How can parents reach their child during the day?', ['By text message', 'By calling the school office', 'By email to the class', 'By coming to the classroom'], 1],
      ['What happens if a phone is used without permission?', ['It is kept at the office until the end of the day', 'It is sent home by post', 'The student loses a mark', 'The student must pay a fine'], 0],
    ]),
  ],
  listening: [
    listening('l-edu-01', role, 'b2', 'meeting', 'Planning a Reading Week', [
      ['Head', 'I want to talk about reading week. Last year some classes loved it, and others hardly took part. What can we do differently?'],
      ['Teacher', 'I think the problem was the choice of books. The older students thought they were too easy.'],
      ['Head', 'That makes sense. So should each class choose its own books?'],
      ['Teacher', 'Partly. What if each class chooses from a list that the librarian prepares? Then we still know the books are suitable.'],
      ['Head', 'I like that. Could we also ask parents to read with younger children for ten minutes each evening?'],
      ['Teacher', 'Yes, but not all parents read English. They could read in Uzbek or Russian, and that’s still valuable.'],
      ['Head', 'Good point. Let’s try that. Can you speak to the librarian this week and send me the list by Friday?'],
    ], [
      ['What was the problem last year?', ['Too few books', 'Some books were too easy for older students', 'Parents complained', 'The library closed'], 1],
      ['What does the teacher suggest?', ['Each class chooses from the librarian’s list', 'The head chooses the books', 'Only younger classes take part', 'Students write their own books'], 0],
      ['What does the teacher say about parents reading?', ['They must read in English', 'It should be thirty minutes', 'They can read in any language', 'They should visit the school'], 2],
    ]),
  ],
  writing: writing(role, 'edu', [
    ['b1', 'A parent has written to say that their child finds the homework too hard. Write a helpful reply.', ['Thank the parent for writing', 'Say what you’ve noticed in class', 'Suggest one or two ways to help', 'Offer to meet'], 90],
    ['b2', 'Your school wants to teach more subjects in English. Write a short proposal for the principal explaining how to begin, what teachers need and how to check it’s working.', ['Suggest where to begin', 'Describe teachers’ training needs', 'Explain how to measure results', 'Mention possible problems'], 160],
  ]),
  speaking: speaking(role, 'edu', [
    ['a2', 'Describe your school, college or a place where you have studied.', ['Where it is', 'What the classes are like', 'What you like about it'], 45],
    ['b1', 'A student has often been late for class. Say what you would say to the student.', ['Stay calm and describe the problem', 'Ask the reason', 'Agree on what will change'], 60],
    ['b2', 'A parent believes their child’s grade is unfair. Talk to the parent and explain how you’d handle it.', ['Listen and show understanding', 'Explain how the work was marked', 'Offer a clear next step'], 90],
  ]),
};
