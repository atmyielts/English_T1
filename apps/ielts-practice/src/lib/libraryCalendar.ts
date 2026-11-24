import { buildPracticeCalendar } from '../../../../packages/exam-playbook-web/src/practiceCalendar';
import type { LibrarySet } from './api';

const weeklyPattern = [
  ['reading', 'speaking'],
  ['task2'],
  ['reading', 'speaking'],
  ['task1', 'speaking'],
  ['reading', 'task1'],
] as const;

const checkpoints = [
  { week: 2, pool: 'speaking', slug: 'ielts-eight-week-shared-laundry-space' },
  { week: 4, pool: 'task2', slug: 'ielts-eight-week-default-parcel-lockers' },
  { week: 6, pool: 'reading', slug: 'ielts-eight-week-courtyard-tree-canopies' },
  { week: 6, pool: 'reading', slug: 'ielts-eight-week-sewing-workshop-rules' },
  { week: 8, pool: 'task2', slug: 'ielts-eight-week-new-residents-live-performances' },
] as const;

type Pool = (typeof weeklyPattern)[number][number];

export const libraryCheckpointWeek = (slug: string) => checkpoints.find(set => set.slug === slug)?.week;

function placeCheckpoints(pool: Pool, sets: readonly LibrarySet[]) {
  const perWeek = weeklyPattern.flat().filter(activity => activity === pool).length;
  const reserved = new Map<number, LibrarySet>();
  for (const checkpoint of checkpoints) {
    if (checkpoint.pool !== pool) continue;
    const index = checkpoint.week * perWeek - 1;
    const set = sets.find(candidate => candidate.slug === checkpoint.slug);
    if (set && index < sets.length) reserved.set(index, set);
  }
  const fixed = new Set(reserved.values());
  const regular = sets.filter(set => !fixed.has(set));
  for (const [index, set] of [...reserved].sort(([a], [b]) => a - b)) {
    regular.splice(index, 0, set);
  }
  return regular;
}

export function buildLibraryCalendar(sets: readonly LibrarySet[], track: 'academic' | 'general') {
  const trackSets = sets.filter(set => set.track === track || set.track === 'both');
  return buildPracticeCalendar({
    reading: placeCheckpoints('reading', trackSets.filter(set => set.skill === 'reading')),
    task1: trackSets.filter(set => set.skill === 'writing' && set.minutes === 20),
    task2: placeCheckpoints('task2', trackSets.filter(set => set.skill === 'writing' && set.minutes === 40)),
    speaking: placeCheckpoints('speaking', trackSets.filter(set => set.skill === 'speaking')),
  }, weeklyPattern);
}

export const libraryDayMinutes = (sets: readonly LibrarySet[]) => sets.reduce((total, set) => total + set.minutes, 0)
  + (sets.every(set => set.skill !== 'writing') ? 4 : 0);
