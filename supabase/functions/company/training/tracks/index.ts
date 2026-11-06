// Every job-role track, in the order of JOB_ROLES, plus lookups by code.
import { JOB_ROLES, type JobRole } from '../../../../../packages/company-core/src/mod.ts';
import type { Lesson, Scenario, Track, WritingTemplate } from '../content.ts';
import { track as general } from './general.ts';
import { track as customerService } from './customer_service.ts';
import { track as sales } from './sales.ts';
import { track as hospitality } from './hospitality.ts';
import { track as bankingFinance } from './banking_finance.ts';
import { track as itSoftware } from './it_software.ts';
import { track as healthcare } from './healthcare.ts';
import { track as logistics } from './logistics.ts';
import { track as officeAdmin } from './office_admin.ts';
import { track as management } from './management.ts';
import { track as engineering } from './engineering.ts';

const byCode: Record<JobRole, Track> = {
  general, customer_service: customerService, sales, hospitality, banking_finance: bankingFinance, it_software: itSoftware,
  healthcare, logistics, office_admin: officeAdmin, management, engineering,
};
export const TRACKS: Track[] = JOB_ROLES.map((code) => byCode[code]);

const lessons = new Map<string, { track: Track; lesson: Lesson; index: number }>();
const scenarios = new Map<string, { track: Track; scenario: Scenario }>();
const templates = new Map<string, { track: Track; template: WritingTemplate }>();
for (const track of TRACKS) {
  track.lessons.forEach((lesson, index) => lessons.set(lesson.code, { track, lesson, index }));
  for (const scenario of track.scenarios) scenarios.set(scenario.code, { track, scenario });
  for (const template of track.templates) templates.set(template.code, { track, template });
}

export const findTrack = (code: string): Track | undefined => (JOB_ROLES as readonly string[]).includes(code) ? byCode[code as JobRole] : undefined;
export const findLesson = (code: string) => lessons.get(code);
export const findScenario = (code: string) => scenarios.get(code);
export const findTemplate = (code: string) => templates.get(code);
