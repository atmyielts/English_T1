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
import { track as callCentre } from './call_centre.ts';
import { track as retail } from './retail.ts';
import { track as tourism } from './tourism.ts';
import { track as aviation } from './aviation.ts';
import { track as legalCompliance } from './legal_compliance.ts';
import { track as marketingPr } from './marketing_pr.ts';
import { track as humanResources } from './human_resources.ts';
import { track as construction } from './construction.ts';
import { track as pharmaSales } from './pharma_sales.ts';
import { track as education } from './education.ts';
import { track as government } from './government.ts';
import { track as restaurant } from './restaurant.ts';
import { track as procurement } from './procurement.ts';
import { track as accountingAudit } from './accounting_audit.ts';
import { extendTrack } from './_compact.ts';
import { more as generalMore } from './more/general.ts';
import { more as hospitalityMore } from './more/hospitality.ts';
import { more as customerServiceMore } from './more/customer_service.ts';
import { more as salesMore } from './more/sales.ts';
import { more as bankingFinanceMore } from './more/banking_finance.ts';
import { more as officeAdminMore } from './more/office_admin.ts';
import { more as engineeringMore } from './more/engineering.ts';
import { more as itSoftwareMore } from './more/it_software.ts';
import { more as healthcareMore } from './more/healthcare.ts';
import { more as logisticsMore } from './more/logistics.ts';
import { more as managementMore } from './more/management.ts';

const byCode: Record<JobRole, Track> = {
  general: extendTrack(general, generalMore), customer_service: extendTrack(customerService, customerServiceMore), sales: extendTrack(sales, salesMore), hospitality: extendTrack(hospitality, hospitalityMore), banking_finance: extendTrack(bankingFinance, bankingFinanceMore), it_software: extendTrack(itSoftware, itSoftwareMore),
  healthcare: extendTrack(healthcare, healthcareMore), logistics: extendTrack(logistics, logisticsMore), office_admin: extendTrack(officeAdmin, officeAdminMore), management: extendTrack(management, managementMore), engineering: extendTrack(engineering, engineeringMore),
  call_centre: callCentre,
  retail,
  tourism,
  aviation,
  legal_compliance: legalCompliance,
  marketing_pr: marketingPr,
  human_resources: humanResources,
  construction,
  pharma_sales: pharmaSales,
  education,
  government,
  restaurant,
  procurement,
  accounting_audit: accountingAudit,
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
