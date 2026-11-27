import {
  intensiveLevels, intensiveSkills, sessionMinutes, type IntensiveLevel, type IntensiveSkill, type Unit,
} from '../../supabase/functions/_shared/english-intensive.ts';
import { hasRecordedListening } from '../../supabase/functions/_shared/english-recorded-listening.ts';
import { PROJECTS, projectDayMinutes } from '../../supabase/functions/_shared/english-immersion-depth.ts';
import { curriculumOutcomes } from '../../supabase/functions/_shared/english-curriculum.ts';
import { playableMissionSteps } from '../../supabase/functions/immersion-missions/recorded.ts';

const root = new URL('../../supabase/content/english/', import.meta.url);
const targetMinutes = 72 * 60;
const levels = new Set<string>(intensiveLevels);
type StudioItem = {
  slug: string;
  level: IntensiveLevel;
  status?: string;
  read_time_minutes?: number;
  target_duration_seconds?: number;
  duration_seconds?: number;
  audio_url?: string | null;
};
type MissionStep = { kind?: string; step_type?: string; estimated_minutes?: number; metadata?: unknown };
type StudioRecord = { item: StudioItem; children?: MissionStep[] };

const readFiles = <T>(dir: URL): T[] =>
  Array.from(Deno.readDirSync(dir))
    .filter((entry) => entry.isFile && entry.name.endsWith('.json'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name }) => JSON.parse(Deno.readTextFileSync(new URL(name, dir)).replace(/^\uFEFF/, '')) as T);

const areas = Object.fromEntries(intensiveSkills.map((skill) => [skill,
  { distinct: 0, playable: 0, estimated_minutes: 0 },
])) as Record<IntensiveSkill, { distinct: number; playable: number; estimated_minutes: number }>;
const inventory = Object.fromEntries(intensiveLevels.map((level) => [level, structuredClone(areas)])) as Record<IntensiveLevel, typeof areas>;
const families = new Map<string, IntensiveLevel>();
const add = (level: IntensiveLevel, area: IntensiveSkill, family: string, minutes: number | null) => {
  if (!levels.has(level)) throw new Error(`Unknown level for ${family}`);
  if (families.has(family)) throw new Error(`Duplicate practice family ${family}`);
  families.set(family, level);
  const entry = inventory[level][area];
  entry.distinct += 1;
  if (minutes !== null) {
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`Invalid study estimate for ${family}`);
    entry.playable += 1;
    entry.estimated_minutes += minutes;
  }
};

for (const level of intensiveLevels) {
  const units = readFiles<Unit>(new URL(`intensive/${level}/`, root));
  for (const unit of units) {
    if (unit.level !== level) throw new Error(`Folder mismatch for ${unit.slug}`);
    const listeningReady = unit.recordings.length >= 2
      && unit.recordings.every((recording) => hasRecordedListening(recording.audio_url));
    for (const area of intensiveSkills) {
      add(level, area, `intensive/${unit.slug}/${area}`,
        area === 'listening' && !listeningReady ? null : sessionMinutes(area));
    }
  }
}

// The native estimates match the service activities. Pending audio contributes
// no study minutes while the rest of the mission stays available.
const nativeMinutes = (area: IntensiveSkill, { item, children = [] }: StudioRecord): number | null => {
  switch (area) {
    case 'reading': return item.read_time_minutes ?? 6;
    case 'writing': return item.level.startsWith('A') ? 8 : item.level.startsWith('C') ? 25 : 15;
    case 'grammar': return 8;
    case 'speaking': return Math.ceil((item.target_duration_seconds ?? 90) / 60) + 4;
    case 'vocabulary': return 6;
    case 'listening': return hasRecordedListening(item.audio_url) ? Math.ceil((item.duration_seconds ?? 60) / 60) : null;
    case 'immersion': {
      const ready = playableMissionSteps(children.map((step) => ({ ...step, step_type: step.kind ?? step.step_type })));
      return ready.length ? ready.reduce((sum, step) => sum + Math.max(1, step.estimated_minutes ?? 3), 0) : null;
    }
  }
};

for (const area of intensiveSkills) {
  for (const data of readFiles<StudioRecord>(new URL(`${area}/`, root))) {
    if (data.item.status && data.item.status !== 'published') continue;
    add(data.item.level, area, `${area}/${data.item.slug}`, nativeMinutes(area, data));
  }
}

for (const project of PROJECTS) {
  for (const day of project.days) {
    add(project.level, 'immersion', `project/${project.key}/${day.day}`, projectDayMinutes(day));
  }
}

for (const level of intensiveLevels) {
  const outcomes = curriculumOutcomes[level];
  if (outcomes.length !== 4 || new Set(outcomes.map((entry) => entry.mode)).size !== 4) {
    throw new Error(`Incomplete outcome map for ${level}`);
  }
  for (const outcome of outcomes) {
    if (families.get(`intensive/${outcome.unit}/${outcome.skill}`) !== level) {
      throw new Error(`Missing ${level} practice for ${outcome.mode}`);
    }
  }
}

const report = intensiveLevels.map((level) => {
  const minutes = Object.values(inventory[level]).reduce((sum, item) => sum + item.estimated_minutes, 0);
  return { level, minutes, gap_minutes: Math.max(0, targetMinutes - minutes), skills: inventory[level] };
});

const format = (minutes: number) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
if (Deno.args.includes('--json')) {
  console.log(JSON.stringify({ target_minutes: targetMinutes, levels: report }, null, 2));
} else {
  console.log('Level | Distinct playable practice (est.) | Gap to 72h | Listening ready/total');
  for (const { level, minutes, gap_minutes, skills } of report) {
    console.log(`${level} | ${format(minutes)} | ${format(gap_minutes)} | ${skills.listening.playable}/${skills.listening.distinct}`);
  }
}
