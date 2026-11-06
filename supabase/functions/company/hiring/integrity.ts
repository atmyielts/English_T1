// Integrity signals the test page reports (tab hidden, paste, copy, fullscreen
// exits, seconds per section, listening plays) plus what the server knows (late or
// automatic submit, the same network starting several attempts). They become
// flags for HR to look at — never a reason to reject a candidate automatically.
import { SKILLS, type Skill } from '../../../../packages/company-core/src/mod.ts';
import type { Section } from './engine.ts';

export interface Integrity {
  tab_hidden?: number;
  paste?: number;
  copy?: number;
  fullscreen_exit?: number;
  section_seconds?: Partial<Record<Skill, number>>;
  /** Listening script id → times played (the player allows 2). */
  plays?: Record<string, number>;
  late?: boolean;
  auto_submitted?: boolean;
  /** Day-salted hash of the starting address; never shown, only compared. */
  ip_hash?: string;
  user_agent?: string;
}

export interface Flag { code: string; severity: 'info' | 'warn'; value?: number | string }

const counter = (value: unknown, cap = 10_000) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(cap, Math.floor(number)) : 0;
};

/** Merges what the page reports; counters never go down, so a reload cannot wipe them. */
export function mergeIntegrity(current: Integrity, input: unknown): Integrity {
  const out: Integrity = { ...current };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const raw = input as Record<string, unknown>;
  for (const key of ['tab_hidden', 'paste', 'copy', 'fullscreen_exit'] as const) {
    const value = counter(raw[key]);
    if (value > (out[key] ?? 0)) out[key] = value;
  }
  if (raw.section_seconds && typeof raw.section_seconds === 'object') {
    const seconds = { ...(out.section_seconds ?? {}) };
    for (const skill of SKILLS) {
      const value = counter((raw.section_seconds as Record<string, unknown>)[skill], 4 * 3600);
      if (value > (seconds[skill] ?? 0)) seconds[skill] = value;
    }
    out.section_seconds = seconds;
  }
  if (raw.plays && typeof raw.plays === 'object') {
    const plays = { ...(out.plays ?? {}) };
    for (const [id, value] of Object.entries(raw.plays as Record<string, unknown>).slice(0, 40)) {
      if (!/^l-[a-z0-9-]{1,30}$/.test(id)) continue;
      const count = counter(value, 99);
      if (count > (plays[id] ?? 0)) plays[id] = count;
    }
    out.plays = plays;
  }
  return out;
}

/** Seconds below which a finished objective section looks rushed (about 4 s per question). */
function rushed(section: Section, seconds: number | undefined): boolean {
  if (seconds === undefined || section.status !== 'done') return false;
  const questions = (section.stages ?? []).reduce((sum, stage) => sum + stage.items.length, 0)
    + (section.passages ?? []).reduce((sum, passage) => sum + passage.questions.length, 0);
  return questions > 0 && seconds < questions * 4;
}

/** Flags HR sees on the candidate list and report. `sameNetwork` = other attempts on this test from the same address today. */
export function integrityFlags(integrity: Integrity, sections: Section[], sameNetwork = 0): Flag[] {
  const flags: Flag[] = [];
  const hidden = integrity.tab_hidden ?? 0;
  if (hidden >= 3) flags.push({ code: 'tab_hidden', severity: hidden >= 8 ? 'warn' : 'info', value: hidden });
  if ((integrity.paste ?? 0) > 0) flags.push({ code: 'paste', severity: 'warn', value: integrity.paste });
  if ((integrity.copy ?? 0) >= 2) flags.push({ code: 'copy', severity: 'info', value: integrity.copy });
  if ((integrity.fullscreen_exit ?? 0) >= 2) flags.push({ code: 'fullscreen_exit', severity: 'info', value: integrity.fullscreen_exit });
  for (const section of sections) {
    if (rushed(section, integrity.section_seconds?.[section.skill])) flags.push({ code: 'rushed', severity: 'info', value: section.skill });
  }
  const replays = Object.values(integrity.plays ?? {}).filter((count) => count > 2).length;
  if (replays) flags.push({ code: 'extra_plays', severity: 'info', value: replays });
  if (integrity.late) flags.push({ code: 'late', severity: 'info' });
  if (integrity.auto_submitted) flags.push({ code: 'auto_submitted', severity: 'info' });
  if (sameNetwork > 0) flags.push({ code: 'same_network', severity: 'info', value: sameNetwork });
  return flags;
}

/** What HR may see of the raw signals (the address hash stays private). */
export function integrityView(integrity: Integrity) {
  const { ip_hash: _hash, ...rest } = integrity;
  return rest;
}
