import type { ExamFormat } from '../format.ts';

// The national university admission test for the 2026/2027 campaign.
// Draft: confirmed so far only from press reports of the ministry's order.
// Before publishing, check the agency's own specification and fill source_url,
// checked_by, effective_from, duration and the wrong-answer rule.
export const UZ_ADMISSION_2026: ExamFormat = {
  exam_code: 'uz-admission',
  version: '2026.1',
  status: 'draft',
  names: {
    uz: 'Oliy ta’limga kirish test sinovi',
    ru: 'Вступительное тестирование в вузы',
    en: 'National university admission test',
  },
  effective_from: null,
  source_url: null,
  checked_at: '2026-10-22',
  checked_by: null,
  sources: [
    {
      url: 'https://www.spot.uz/oz/2026/03/17/admission2026',
      kind: 'secondary',
      note: 'Reports the ministry press service, 17 March 2026: 5 subjects, 90 questions, 189 points; assessment rules unchanged from the previous year.',
    },
    {
      url: 'https://infoedu.uz/test-sinovi-topshiriladigan-fanlar-boyicha-mezonlar-tasdiqlandi',
      kind: 'secondary',
      note: '1.1 points per compulsory-subject question (2024/2025 rules).',
    },
  ],
  duration_minutes: null,
  sections: [
    {
      id: 'compulsory_native',
      names: { uz: 'Ona tili (majburiy)', ru: 'Родной язык (обязательный)', en: 'Native language (compulsory)' },
      subject: 'native_language',
      block: 'compulsory',
      questions: 10,
      points_per_question: 1.1,
      item_types: ['single_choice'],
    },
    {
      id: 'compulsory_math',
      names: { uz: 'Matematika (majburiy)', ru: 'Математика (обязательный)', en: 'Mathematics (compulsory)' },
      subject: 'math',
      block: 'compulsory',
      questions: 10,
      points_per_question: 1.1,
      item_types: ['single_choice'],
    },
    {
      id: 'compulsory_history',
      names: { uz: 'O‘zbekiston tarixi (majburiy)', ru: 'История Узбекистана (обязательный)', en: 'History of Uzbekistan (compulsory)' },
      subject: 'history_uz',
      block: 'compulsory',
      questions: 10,
      points_per_question: 1.1,
      item_types: ['single_choice'],
    },
    {
      id: 'specialised_1',
      names: { uz: '1-mutaxassislik fani', ru: 'Первый профильный предмет', en: 'First specialised subject' },
      subject: 'by_programme',
      block: 'specialised',
      questions: 30,
      points_per_question: 3.1,
      item_types: ['single_choice'],
    },
    {
      id: 'specialised_2',
      names: { uz: '2-mutaxassislik fani', ru: 'Второй профильный предмет', en: 'Second specialised subject' },
      subject: 'by_programme',
      block: 'specialised',
      questions: 30,
      points_per_question: 2.1,
      item_types: ['single_choice'],
    },
  ],
  scoring: { max_score: 189, wrong_answer_penalty: null },
  delivery: { calculator: null, navigation: null },
  verify: [
    'official specification and order number',
    'test duration',
    'wrong-answer rule',
    'question types (assumed four-option single choice)',
    'calculator rule',
    'exam window',
  ],
};
