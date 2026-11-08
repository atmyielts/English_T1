// The workplace mission at the end of a lesson, as the player shows it. Built-in
// lessons point at a track's role-play or writing task; company lessons may also
// point at the company's own role-play, or simply ask for something to do at work.
import type { Localized, Mission } from './content.ts';
import type { CustomMission } from './custom.ts';
import { findScenario, findTemplate } from './tracks/index.ts';

export interface MissionView { kind: 'roleplay' | 'writing' | 'task'; code: string | null; title: Localized | null; brief: Localized }
const EMPTY: Localized = { en: '', ru: '', uz: '' };

export function missionView(mission: Mission | CustomMission | null | undefined, customTitle: Localized | null = null): MissionView {
  if (!mission) return { kind: 'task', code: null, title: null, brief: EMPTY };
  if (mission.kind === 'roleplay') return { kind: 'roleplay', code: mission.scenario, title: customTitle ?? findScenario(mission.scenario)?.scenario.title ?? null, brief: mission.brief };
  if (mission.kind === 'writing') return { kind: 'writing', code: mission.template, title: mission.template ? findTemplate(mission.template)?.template.title ?? null : null, brief: mission.brief };
  return { kind: 'task', code: null, title: null, brief: mission.brief };
}
