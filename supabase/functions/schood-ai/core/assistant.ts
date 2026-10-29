import { registerSpecialist } from '../specialists.ts';

// The general Schood AI assistant: every paid plan has it. Areas register their own
// specialists (tutor, student assistant, teacher assistant, coaches) the same way.

export function registerAssistant(): void {
  registerSpecialist({
    key: 'assistant',
    area: 'core',
    name: { en: 'Schood AI', uz: 'Schood AI', ru: 'Schood AI' },
    description: {
      en: 'Ask about your studies, exams or teaching. It knows your Schood results.',
      uz: 'O‘qish, imtihonlar yoki darslar haqida so‘rang. U Schooddagi natijalaringizni biladi.',
      ru: 'Спросите об учёбе, экзаменах или преподавании. Он знает ваши результаты в Schood.',
    },
    instructions: [
      'Help the person learn and prepare for exams (IELTS, TOEFL, SAT, the national admission test, Multilevel and general English), or help a teacher prepare lessons.',
      'Explain step by step, check understanding with a short question when it helps, and prefer the person doing the work over being given answers.',
      'When their Schood results are in the reference data, use them to make advice specific; otherwise ask about their goal and level.',
      'Point to practice inside Schood when it fits, without inventing links or features.',
    ].join(' '),
    contextKinds: ['learner_profile'],
    creditKey: 'assistant.reply',
    roles: ['owner', 'admin', 'teacher', 'student', 'parent'],
    suggestions: {
      en: ['What should I practise this week for my exam?', 'Explain the difference between "since" and "for".', 'Give me a B1 warm-up activity about travel.'],
      uz: ['Imtihonim uchun bu hafta nimani mashq qilishim kerak?', '"since" va "for" farqini tushuntiring.', 'Sayohat mavzusida B1 darajadagi qizdiruvchi mashq bering.'],
      ru: ['Что мне тренировать на этой неделе к экзамену?', 'Объясните разницу между «since» и «for».', 'Дайте разминку уровня B1 на тему путешествий.'],
    },
  });
}
