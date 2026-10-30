// Every kind the Materials Studio makes, and its group, as plain data with no imports,
// so a screen can list or register the kinds without loading the material model, the
// exam formats or the checks. kinds.ts holds the rules; a test keeps the two in step.
// Placement tests (kind placement_test) are not here: the centre owns that library kind.
export const MATERIAL_KIND_CATALOG = {
  worksheet: 'general', reading: 'general', listening: 'general', gap_fill: 'general', vocabulary: 'general', grammar: 'general',
  error_correction: 'general', speaking_cards: 'general', dialogue: 'general', writing_task: 'general', quiz: 'general', homework: 'general', live_quiz: 'general',
  ielts_reading: 'exam', ielts_listening: 'exam', ielts_writing: 'exam', ielts_speaking: 'exam', toefl_2026: 'exam', multilevel: 'exam',
  sat_reading_writing: 'exam', sat_math: 'exam', admission_math: 'exam',
  lesson_plan: 'planning', course_outline: 'planning', slide_outline: 'planning', flashcards: 'planning',
  textbook_lesson: 'textbook',
} as const satisfies Record<string, 'general' | 'exam' | 'planning' | 'textbook'>;
export type MaterialKindId = keyof typeof MATERIAL_KIND_CATALOG;
