// The bank content added role by role. Each role's file stays complete on its own; the
// bank index merges them after the original items, whose ids and order never change.
import type { RoleBank } from './_compact.ts';
import { bank as existingRoles } from './existing_roles.ts';
import { bank as accountingAudit } from './accounting_audit.ts';
import { bank as procurement } from './procurement.ts';
import { bank as restaurant } from './restaurant.ts';
import { bank as government } from './government.ts';
import { bank as education } from './education.ts';
import { bank as pharmaSales } from './pharma_sales.ts';
import { bank as construction } from './construction.ts';
import { bank as humanResources } from './human_resources.ts';
import { bank as marketingPr } from './marketing_pr.ts';
import { bank as legalCompliance } from './legal_compliance.ts';
import { bank as aviation } from './aviation.ts';
import { bank as tourism } from './tourism.ts';
import { bank as retail } from './retail.ts';
import { bank as callCentre } from './call_centre.ts';

export const ROLE_BANKS: RoleBank[] = [
  existingRoles,
  callCentre,
  retail,
  tourism,
  aviation,
  legalCompliance,
  marketingPr,
  humanResources,
  construction,
  pharmaSales,
  education,
  government,
  restaurant,
  procurement,
  accountingAudit,
];
