// Authoring helper for applied professional workshops. All language, dialogue,
// definitions, comprehension questions and procedures are authored per lesson;
// this only turns those into the four existing exercise types.
import { choice, gap, match, order, type LessonRow, type Tr, type WordRow } from '../_compact.ts';

export interface Workshop {
  id: string; level: 'b2'; title: Tr; goal: Tr; setting: Tr;
  words: WordRow[]; phrases: Tr[]; who: readonly [string, string]; lines: string[];
  questions: [string, string[], number][]; procedure: string[];
  mission: LessonRow['mission'];
}

export function workshop(row: Workshop): LessonRow {
  const terms = row.words.slice(0, 3).map((word) => word[0]);
  const gaps = terms.map((term, index): [string, string] => {
    const sentence = row.phrases[index][0];
    if (!sentence.includes(term)) throw new Error(`${row.id}: phrase ${index + 1} must practise ${term}`);
    return [sentence.replace(term, '___'), term];
  });
  const pairs = row.words.slice(0, 4).map(([term, , , definition]): [string, string] => {
    if (!definition) throw new Error(`${row.id}: a meaning is needed for ${term}`);
    return [term, definition];
  });
  return {
    ...row,
    ex: [choice(...row.questions), gap(terms, ...gaps), order('Put the workplace procedure in order.', ...row.procedure), match('Match the term to its meaning.', ...pairs)],
  };
}
