import { buildPracticeCalendar } from '../../../../packages/exam-playbook-web/src/practiceCalendar';
import type { LibrarySet } from './api';

const weeklyPattern = [
  ['reading', 'speaking'],
  ['task2'],
  ['reading', 'speaking'],
  ['task1', 'speaking'],
  ['reading', 'task1'],
] as const;

export function buildLibraryCalendar(sets: readonly LibrarySet[], track: 'academic' | 'general') {
  const trackSets = sets.filter(set => set.track === track || set.track === 'both');
  return buildPracticeCalendar({
    reading: trackSets.filter(set => set.skill === 'reading'),
    task1: trackSets.filter(set => set.skill === 'writing' && set.minutes === 20),
    task2: trackSets.filter(set => set.skill === 'writing' && set.minutes === 40),
    speaking: trackSets.filter(set => set.skill === 'speaking'),
  }, weeklyPattern);
}

export const libraryDayMinutes = (sets: readonly LibrarySet[]) => sets.reduce((total, set) => total + set.minutes, 0)
  + (sets.every(set => set.skill !== 'writing') ? 4 : 0);
