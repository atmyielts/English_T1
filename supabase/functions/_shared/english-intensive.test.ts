import { deepStrictEqual, ok } from 'node:assert/strict';
import { coreUnitMinutes, gradeIntensive, intensiveSkills, materialFor, workFields, type Question, type Unit } from './english-intensive.ts';
import { hasRecordedListening } from './english-recorded-listening.ts';

const question: Question = { prompt: 'Which door?', options: ['A', 'B', 'C', 'D'], answer: 1, explanation: 'The notice says to use door B.' };

Deno.test('keys are absent in all intensive input materials until grading', () => {
  const unit = { documents: [], recordings: [], reading: [question], listening: [question], grammar: { questions: [question] } } as unknown as Unit;
  for (const skill of ['reading', 'listening', 'grammar'] as const) {
    const material = materialFor(unit, skill);
    ok('questions' in material);
    deepStrictEqual(material.questions, [{ prompt: question.prompt, options: question.options }]);
  }
  deepStrictEqual(gradeIntensive([question, question], [1, 0]), [
    { answer: 1, explanation: question.explanation, correct: true },
    { answer: 1, explanation: question.explanation, correct: false },
  ]);
});

Deno.test('the active intensive path excludes upcoming Listening minutes', () => {
  deepStrictEqual(coreUnitMinutes, 284);
  ok(intensiveSkills.every((skill) => workFields[skill].length === 3 && new Set(workFields[skill]).size === 3));
  ok(hasRecordedListening('https://example.invalid/audio/lesson.mp3'));
  for (const missing of [null, '', 'browser', 'http://example.invalid/audio.mp3']) ok(!hasRecordedListening(missing));
});
