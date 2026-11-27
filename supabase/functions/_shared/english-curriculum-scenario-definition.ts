import type { ProjectDay, ProjectDef, ProjectPoint } from './english-immersion-depth.ts';

type ScenarioDay = Omit<ProjectDay, 'day' | 'estimated_minutes' | 'preparation'> & {
  estimated_minutes: number;
  preparation: [string, string];
};

export const point = (label: string, ...any: string[]): ProjectPoint => ({ label, any });
export const scenario = (project: Omit<ProjectDef, 'days'>, days: ScenarioDay[]): ProjectDef => ({
  ...project,
  days: days.map((day, index) => ({ ...day, day: index + 1 })),
});
