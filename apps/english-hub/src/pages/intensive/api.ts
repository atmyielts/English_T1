import { edge } from '../../lib/api';
import type { IntensiveSkill, Progress, SaveAction, StudyMaterial, UnitOverview } from '../../../../../supabase/functions/_shared/english-intensive';

export type Library = {
  units: UnitOverview[];
  progress: Array<{ unit_slug: string; skill: IntensiveSkill; completed: boolean }>;
  core_unit_minutes: number;
  available_skills: IntensiveSkill[];
  paused_skills: IntensiveSkill[];
};
export type Session = { unit: UnitOverview; material: StudyMaterial; guide: string | null; progress: Progress };

export const getIntensive = (signal: AbortSignal) => edge<Library>('english-intensive', '', { signal });
export const getIntensiveAvailability = (signal: AbortSignal) =>
  edge<{ ready: boolean }>('english-intensive', '/availability', { signal });
export const loadIntensiveSession = (slug: string, skill: IntensiveSkill, signal: AbortSignal) =>
  edge<Session>('english-intensive', `/${encodeURIComponent(slug)}/${skill}`, { signal });
export const saveIntensive = (slug: string, skill: IntensiveSkill, action: SaveAction, progress: Progress) =>
  edge<{ progress: Progress }>('english-intensive', `/${encodeURIComponent(slug)}/${skill}`, {
    body: { action, revision: progress.revision, answers: progress.answers, work: progress.work },
  });
