import { ROLEPLAY_SCENARIOS, type RoleplayScenario } from '../../../_shared/english-roleplay.ts';
import type { SpeakingPaper } from '../../../_shared/english-exam.ts';

// Original practice content for the speaking partner (L4), interview simulator
// (L12) and pronunciation coach (L13). Role-plays reuse Schood English's own
// scenarios (_shared/english-roleplay.ts). Nothing here states an official rule:
// interview prompts are practice, and visa or admission facts are never given.

type Text3 = { en: string; uz: string; ru: string };
const t = (en: string, uz: string, ru: string): Text3 => ({ en, uz, ru });
const goal = (id: string, en: string, uz: string, ru: string) => ({ id, text: { en, ru, uz } });

export const INTERVIEW_KINDS = ['us_visa', 'uk_visa', 'university', 'scholarship', 'job'] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

/** Interviewers built in the role-play shape, so the same turn and review rules apply. */
export const INTERVIEWS: Record<InterviewKind, RoleplayScenario & { practiceNote: Text3 }> = {
  us_visa: {
    ...ROLEPLAY_SCENARIOS.find((scenario) => scenario.id === 'visa-interview')!,
    id: 'interview-us-visa',
    practiceNote: t('Practice only. Visa rules change: check the official US embassy website.', 'Faqat mashq. Viza qoidalari o‘zgaradi: AQSh elchixonasining rasmiy saytini tekshiring.', 'Только тренировка. Визовые правила меняются: проверьте официальный сайт посольства США.'),
  },
  uk_visa: {
    id: 'interview-uk-visa', levels: ['B1', 'C1'],
    partner: { name: 'Ms Clarke', role: 'interviewer doing a student credibility interview for a UK university application' },
    brief: 'A calm, structured credibility interview. Ask one question at a time about: why this course, why this university, why the UK, how the course fits the student\'s past study, who pays, and plans after graduating. Ask a short follow-up when an answer is vague. Never give advice about visa rules.',
    opening: 'Good afternoon. Thank you for joining. To start, could you tell me which course you have applied for and why you chose it?',
    title: { en: 'UK student credibility interview', uz: 'Buyuk Britaniya universiteti: ishonchlilik suhbati', ru: 'Собеседование в британский вуз: проверка намерений' },
    situation: { en: 'A university staff member checks that you are a genuine student.', uz: 'Universitet xodimi rostdan ham o‘qish uchun borayotganingizni tekshiradi.', ru: 'Сотрудник университета проверяет, что вы действительно едете учиться.' },
    role_card: { en: 'Give specific, honest answers about your course and plans.', uz: 'Kurs va rejalaringiz haqida aniq va rostgo‘y javob bering.', ru: 'Отвечайте конкретно и честно о курсе и планах.' },
    goals: [
      goal('course', 'Explain why you chose this course', 'Bu kursni nega tanlaganingizni tushuntiring', 'Объясните, почему выбрали этот курс'),
      goal('university', 'Explain why this university and the UK', 'Nega aynan shu universitet va Britaniyani tanlaganingizni ayting', 'Объясните, почему этот вуз и Великобритания'),
      goal('funding', 'Say how your studies are paid for', 'O‘qish qanday to‘lanishini ayting', 'Скажите, как оплачивается учёба'),
      goal('plans', 'Describe your plans after the course', 'Kursdan keyingi rejalaringizni ayting', 'Расскажите о планах после курса'),
    ],
    phrases: [{ en: 'What attracted me to this course is…', ru: 'Этот курс привлёк меня тем, что…', uz: 'Bu kursning meni o‘ziga tortgan tomoni — …' }],
    practiceNote: t('Practice only. Check requirements on the official GOV.UK and university websites.', 'Faqat mashq. Talablarni rasmiy GOV.UK va universitet saytlarida tekshiring.', 'Только тренировка. Требования проверяйте на официальных сайтах GOV.UK и университета.'),
  },
  university: {
    id: 'interview-university', levels: ['B1', 'C1'],
    partner: { name: 'Dr Rahimova', role: 'admissions tutor interviewing an applicant' },
    brief: 'A friendly but probing admissions interview. Ask one question at a time: motivation for the subject, something the applicant read or did beyond school, a short problem or opinion question about the subject, strengths and weaknesses, and questions for the panel. Follow up on vague answers.',
    opening: 'Hello, and welcome. What first made you interested in the subject you want to study?',
    title: { en: 'University admission interview', uz: 'Universitetga qabul suhbati', ru: 'Собеседование при поступлении в вуз' },
    situation: { en: 'An admissions tutor wants to see how you think about your subject.', uz: 'Qabul komissiyasi a’zosi fan haqida qanday fikrlashingizni bilmoqchi.', ru: 'Член приёмной комиссии хочет понять, как вы думаете о предмете.' },
    role_card: { en: 'Show curiosity and give real examples from your own experience.', uz: 'Qiziqishingizni ko‘rsating va o‘z tajribangizdan misol keltiring.', ru: 'Проявите интерес и приведите примеры из своего опыта.' },
    goals: [
      goal('motivation', 'Explain your motivation with an example', 'Motivatsiyangizni misol bilan tushuntiring', 'Объясните мотивацию на примере'),
      goal('beyond', 'Talk about learning beyond school', 'Maktabdan tashqari o‘rganganlaringiz haqida gapiring', 'Расскажите об учёбе вне школы'),
      goal('reasoning', 'Reason through a subject question', 'Fan bo‘yicha savol ustida mulohaza yuriting', 'Порассуждайте над вопросом по предмету'),
      goal('questions', 'Ask the panel a good question', 'Komissiyaga yaxshi savol bering', 'Задайте комиссии хороший вопрос'),
    ],
    phrases: [{ en: 'One thing that really made me think was…', ru: 'Одна вещь, которая заставила меня задуматься…', uz: 'Meni chuqur o‘ylantirgan narsa…' }],
    practiceNote: t('Practice only. Each university runs its own interviews.', 'Faqat mashq. Har bir universitet o‘z suhbatini o‘tkazadi.', 'Только тренировка. Каждый вуз проводит собеседования по-своему.'),
  },
  scholarship: {
    id: 'interview-scholarship', levels: ['B2', 'C1'],
    partner: { name: 'Mr Davies', role: 'member of a scholarship selection panel' },
    brief: 'A formal scholarship panel. Ask one question at a time: the applicant\'s goals, leadership or community impact with a concrete example, why they deserve the award, how they handle a setback, and how they will give back. Press gently for specifics and results.',
    opening: 'Good morning, and thank you for coming. Please tell us briefly about yourself and what you hope to achieve with this scholarship.',
    title: { en: 'Scholarship panel', uz: 'Grant komissiyasi', ru: 'Стипендиальная комиссия' },
    situation: { en: 'A panel decides who receives a scholarship.', uz: 'Komissiya grant kimga berilishini hal qiladi.', ru: 'Комиссия решает, кто получит стипендию.' },
    role_card: { en: 'Use the STAR method: situation, task, action, result.', uz: 'STAR usulidan foydalaning: vaziyat, vazifa, harakat, natija.', ru: 'Используйте метод STAR: ситуация, задача, действие, результат.' },
    goals: [
      goal('goals', 'State clear goals', 'Aniq maqsadlarni ayting', 'Чётко назовите цели'),
      goal('impact', 'Give a real example of leadership or impact', 'Yetakchilik yoki ta’sirdan real misol keltiring', 'Приведите реальный пример лидерства или влияния'),
      goal('setback', 'Describe how you handled a setback', 'Muvaffaqiyatsizlikni qanday yengganingizni ayting', 'Расскажите, как справились с неудачей'),
      goal('giveback', 'Explain how you will give back', 'Jamiyatga qanday hissa qo‘shishingizni tushuntiring', 'Объясните, какой вклад вы внесёте в общество'),
    ],
    phrases: [{ en: 'The result was that…', ru: 'В результате…', uz: 'Natijada…' }],
    practiceNote: t('Practice only. Check each scholarship\'s official rules.', 'Faqat mashq. Har bir grantning rasmiy qoidalarini tekshiring.', 'Только тренировка. Проверяйте официальные правила каждой стипендии.'),
  },
  job: {
    id: 'interview-job', levels: ['B1', 'C1'],
    partner: { name: 'Ms Karimova', role: 'hiring manager at an international company in Tashkent' },
    brief: 'A first-round job interview in English. Ask one question at a time: tell me about yourself, why this role, a behavioural question (a conflict or a deadline), a strength and a weakness, salary expectations in general terms, and their questions. Follow up when answers are vague.',
    opening: 'Hi, thanks for coming in today. Could you start by telling me a little about yourself?',
    title: { en: 'Job interview in English', uz: 'Ingliz tilida ish suhbati', ru: 'Собеседование на работу на английском' },
    situation: { en: 'A hiring manager interviews you for a role you want.', uz: 'Ish beruvchi siz istagan lavozim uchun suhbat o‘tkazadi.', ru: 'Менеджер по найму проводит с вами собеседование на желаемую должность.' },
    role_card: { en: 'Be concise; give examples with results.', uz: 'Qisqa gapiring; natijali misollar keltiring.', ru: 'Говорите кратко; приводите примеры с результатами.' },
    goals: [
      goal('intro', 'Introduce yourself clearly', 'O‘zingizni aniq tanishtiring', 'Чётко представьтесь'),
      goal('fit', 'Explain why you fit the role', 'Lavozimga nega mos ekaningizni tushuntiring', 'Объясните, почему подходите на должность'),
      goal('example', 'Answer a behavioural question with an example', 'Xulq-atvor savoliga misol bilan javob bering', 'Ответьте на поведенческий вопрос примером'),
      goal('questions', 'Ask a thoughtful question', 'Puxta o‘ylangan savol bering', 'Задайте продуманный вопрос'),
    ],
    phrases: [{ en: 'In my last project, I was responsible for…', ru: 'В последнем проекте я отвечал(а) за…', uz: 'Oxirgi loyihamda men … uchun mas’ul edim' }],
    practiceNote: t('Practice only.', 'Faqat mashq.', 'Только тренировка.'),
  },
};

/** A free conversation on a topic, in the role-play shape. */
export function conversationScenario(topic: string): RoleplayScenario {
  const clean = topic.replace(/\s+/g, ' ').trim().slice(0, 80) || 'everyday life';
  return {
    id: 'conversation', levels: ['A2', 'C1'],
    partner: { name: 'Sam', role: 'friendly conversation partner who speaks clear English' },
    brief: `Have a relaxed conversation about this topic chosen by the learner: "${clean.replace(/"/g, "'")}". Ask open questions, share a short opinion of your own, and keep the learner talking more than you.`,
    opening: 'Hi! I am glad we can talk. So, what would you like to tell me about it first?',
    title: { en: clean, uz: clean, ru: clean },
    situation: { en: clean, uz: clean, ru: clean },
    role_card: { en: 'Talk freely and try new words.', uz: 'Erkin gapiring va yangi so‘zlarni sinab ko‘ring.', ru: 'Говорите свободно и пробуйте новые слова.' },
    goals: [
      goal('details', 'Give details and examples', 'Tafsilot va misollar keltiring', 'Приводите детали и примеры'),
      goal('opinion', 'Give and explain an opinion', 'Fikr bildiring va asoslang', 'Выскажите и объясните мнение'),
      goal('question', 'Ask your partner a question', 'Suhbatdoshingizga savol bering', 'Задайте вопрос собеседнику'),
    ],
    phrases: [],
  };
}

// --- Multilevel speaking sets (2024 format: Q1–Q3, Q4–Q6 on two pictures, Q7, Q8) ---
// Original practice sets; the pictures are described in words.
export const MULTILEVEL_SETS: readonly (SpeakingPaper & { id: string })[] = [
  {
    id: 'ml-home-food',
    part11: ['Where do you live, and what do you like about it?', 'What do you usually do at the weekend?', 'Do you prefer to study in the morning or in the evening? Why?'],
    part12: { scene: 'Picture A: a family cooking dinner together in a small kitchen. Picture B: young people eating burgers in a busy fast-food café.', questions: ['Describe what you see in the two pictures.', 'Which way of eating do you prefer, and why?', 'How are eating habits changing among young people in your country?'] },
    part2: { scene: 'A young person studying with a laptop and headphones in a library.', questions: ['Tell me about a skill you learned on your own.', 'How did you learn it, and what was difficult?', 'Do you think people learn better alone or with a teacher? Why?'] },
    part3: { statement: 'Students should be allowed to use mobile phones in class.', for: ['Phones help students find information quickly', 'Learning apps can make lessons more active'], against: ['Phones distract students from the lesson', 'Not every student has a good phone, which is unfair'] },
  },
  {
    id: 'ml-city-travel',
    part11: ['How do you usually travel to school or work?', 'What is your favourite place in your town?', 'Do you like trying new kinds of food? Why or why not?'],
    part12: { scene: 'Picture A: a crowded city street with cars and buses at rush hour. Picture B: a quiet village road with people walking and riding bicycles.', questions: ['Describe and compare the two places.', 'Where would you rather live, and why?', 'What problems do big cities have with transport?'] },
    part2: { scene: 'Tourists taking photos in front of a historic building in Samarkand.', questions: ['Tell me about a trip that you remember well.', 'What made it special?', 'How does tourism change a city, for better or for worse?'] },
    part3: { statement: 'Cars should be banned from city centres.', for: ['The air would be cleaner and healthier', 'Streets would be safer for people walking'], against: ['Shops in the centre may lose customers', 'Older people may find it hard to get around'] },
  },
  {
    id: 'ml-work-tech',
    part11: ['What do you do in your free time?', 'Who is the person you talk to most every day?', 'What kind of music do you like?'],
    part12: { scene: 'Picture A: an office where people work at computers. Picture B: a farmer working in a field with a tractor.', questions: ['Describe what the people in the pictures are doing.', 'Which job looks more interesting to you, and why?', 'How is technology changing the way people work?'] },
    part2: { scene: 'A teenager presenting a project in front of a class.', questions: ['Describe a time when you spoke in front of other people.', 'How did you feel, and how did you prepare?', 'Why do some people find public speaking so difficult?'] },
    part3: { statement: 'Robots and computers will take most people\'s jobs.', for: ['Machines are faster and cheaper for many tasks', 'Factories already use robots for repeated work'], against: ['New technology also creates new jobs', 'Many jobs need human care, creativity and judgement'] },
  },
];

// --- Pronunciation sentences (L13) ------------------------------------------------------
// Grouped by focus; each sentence is short enough to read in one breath.
export interface DrillSentence { id: string; level: 'A2' | 'B1' | 'B2' | 'C1'; focus: 'th' | 'v_w' | 'endings' | 'stress' | 'vowels' | 'linking'; text: string }
const drill = (id: string, level: DrillSentence['level'], focus: DrillSentence['focus'], text: string): DrillSentence => ({ id, level, focus, text });
export const DRILL_SENTENCES: readonly DrillSentence[] = [
  drill('th-1', 'A2', 'th', 'I think three of them are here this Thursday.'),
  drill('th-2', 'B1', 'th', 'Their brother thought the weather was better than that.'),
  drill('th-3', 'B2', 'th', 'Nothing is worth more than the truth to the author.'),
  drill('th-4', 'C1', 'th', 'Theoretically, the method works, though nobody has tested it thoroughly.'),
  drill('vw-1', 'A2', 'v_w', 'We visit our village very often in winter.'),
  drill('vw-2', 'B1', 'v_w', 'Victor went west with a very warm view of the world.'),
  drill('vw-3', 'B2', 'v_w', 'The vivid video was viewed widely within a week.'),
  drill('vw-4', 'C1', 'v_w', 'Volunteers voiced valid worries about the new water law.'),
  drill('end-1', 'A2', 'endings', 'She walked to school and played games with friends.'),
  drill('end-2', 'B1', 'endings', 'He asked for the facts and helped his parents.'),
  drill('end-3', 'B2', 'endings', 'The scientists tested the texts and checked the results.'),
  drill('end-4', 'C1', 'endings', 'She acknowledged the risks and adjusted the budgets twice.'),
  drill('str-1', 'A2', 'stress', 'My brother is a teacher at a big school.'),
  drill('str-2', 'B1', 'stress', 'The photographer took a photograph of the city.'),
  drill('str-3', 'B2', 'stress', 'Economic development depends on a stable economy.'),
  drill('str-4', 'C1', 'stress', 'Her analysis was careful and analytical, but her conclusion was controversial.'),
  drill('vow-1', 'A2', 'vowels', 'Please sit on this seat and keep it clean.'),
  drill('vow-2', 'B1', 'vowels', 'The full moon looked good from the pool.'),
  drill('vow-3', 'B2', 'vowels', 'Her first word at work was a bird\'s name.'),
  drill('vow-4', 'C1', 'vowels', 'In autumn I thought the cat had caught a cold.'),
  drill('lnk-1', 'A2', 'linking', 'Turn it off and put it on the table.'),
  drill('lnk-2', 'B1', 'linking', 'Not at all, I am happy to pick it up.'),
  drill('lnk-3', 'B2', 'linking', 'What are you going to do about it after all?'),
  drill('lnk-4', 'C1', 'linking', 'An important event is held in each of our cities.'),
];
export const DRILL_PER_DAY = 5;
