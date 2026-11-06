// Ready-made vacancies: sensible skills, per-skill minimum levels and a time limit, so a
// company can create a test in one click. Levels are starting points HR can change, on the
// Schood scale; they are not an official requirement of any profession. The display name
// of each template is in the app's i18n files as hiring.role.<code>.
import { SKILLS, type Industry, type JobRole, type Level, type Skill } from '../../../../packages/company-core/src/mod.ts';
import { suggestedMinutes } from './shared.ts';

export interface RoleTemplate {
  code: string;
  /** English title, used when the page sends none. */
  name: string;
  job_role: JobRole;
  industries: Industry[];
  min_level: Level;
  /** Skills measured and the level each needs. */
  minimums: Partial<Record<Skill, Level>>;
}

const T = (code: string, name: string, job_role: JobRole, industries: Industry[], min_level: Level, minimums: Partial<Record<Skill, Level>>): RoleTemplate =>
  ({ code, name, job_role, industries, min_level, minimums });

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  // Hospitality and travel
  T('front_desk', 'Front desk receptionist', 'hospitality', ['hospitality'], 'b1', { grammar: 'a2', vocabulary: 'b1', reading: 'a2', listening: 'b1', writing: 'a2', speaking: 'b1' }),
  T('concierge', 'Hotel concierge', 'hospitality', ['hospitality'], 'b2', { vocabulary: 'b1', listening: 'b2', reading: 'b1', speaking: 'b2' }),
  T('reservations_agent', 'Reservations agent', 'hospitality', ['hospitality'], 'b1', { grammar: 'b1', vocabulary: 'b1', reading: 'b1', listening: 'b1', writing: 'b1' }),
  T('waiter', 'Restaurant waiter', 'hospitality', ['hospitality'], 'a2', { vocabulary: 'a2', listening: 'a2', speaking: 'a2' }),
  T('tour_guide', 'Tour guide', 'tourism', ['hospitality'], 'b2', { vocabulary: 'b1', listening: 'b2', speaking: 'b2' }),
  T('flight_attendant', 'Flight attendant', 'aviation', ['hospitality', 'logistics'], 'b1', { grammar: 'b1', vocabulary: 'b1', listening: 'b2', reading: 'b1', speaking: 'b1' }),
  // Call centre and customer service
  T('call_centre_agent', 'Call centre agent', 'call_centre', ['telecom', 'banking', 'retail', 'other'], 'b1', { vocabulary: 'b1', listening: 'b2', writing: 'a2', speaking: 'b1' }),
  T('support_chat_agent', 'Customer support agent (chat and email)', 'customer_service', ['telecom', 'it', 'retail', 'other'], 'b1', { grammar: 'b1', vocabulary: 'b1', reading: 'b1', writing: 'b1' }),
  T('customer_success', 'Customer success manager', 'customer_service', ['it', 'telecom', 'other'], 'b2', { grammar: 'b1', vocabulary: 'b1', listening: 'b2', writing: 'b1', speaking: 'b2' }),
  // Banking and finance
  T('bank_teller', 'Bank teller', 'banking_finance', ['banking'], 'a2', { vocabulary: 'b1', listening: 'a2', reading: 'a2', speaking: 'a2' }),
  T('relationship_manager', 'Corporate relationship manager', 'banking_finance', ['banking'], 'b2', { grammar: 'b1', vocabulary: 'b2', reading: 'b2', listening: 'b1', writing: 'b1', speaking: 'b2' }),
  T('compliance_officer', 'Compliance officer', 'legal_compliance', ['banking', 'government'], 'b2', { grammar: 'b2', vocabulary: 'b2', reading: 'b2', writing: 'b2' }),
  T('accountant', 'Accountant', 'banking_finance', ['banking', 'manufacturing', 'other'], 'b1', { grammar: 'a2', vocabulary: 'b1', reading: 'b1', writing: 'a2' }),
  T('financial_analyst', 'Financial analyst', 'banking_finance', ['banking', 'it', 'other'], 'b2', { grammar: 'b1', vocabulary: 'b2', reading: 'b2', writing: 'b2' }),
  // Sales and retail
  T('sales_manager', 'Sales manager', 'sales', ['retail', 'telecom', 'it', 'manufacturing', 'other'], 'b2', { grammar: 'b1', vocabulary: 'b1', listening: 'b1', writing: 'b1', speaking: 'b2' }),
  T('export_manager', 'Export manager', 'sales', ['manufacturing', 'logistics'], 'b2', { grammar: 'b1', vocabulary: 'b2', reading: 'b2', listening: 'b1', writing: 'b2', speaking: 'b2' }),
  T('retail_assistant', 'Shop assistant', 'retail', ['retail'], 'a2', { vocabulary: 'a2', listening: 'a2', speaking: 'a2' }),
  T('marketing_specialist', 'Marketing specialist', 'sales', ['retail', 'it', 'other'], 'b2', { grammar: 'b2', vocabulary: 'b1', reading: 'b1', writing: 'b2' }),
  // IT
  T('software_developer', 'Software developer', 'it_software', ['it'], 'b1', { vocabulary: 'b1', reading: 'b2', listening: 'b1', writing: 'b1' }),
  T('qa_engineer', 'QA engineer', 'it_software', ['it'], 'b1', { grammar: 'b1', vocabulary: 'b1', reading: 'b1', writing: 'b1' }),
  T('it_helpdesk', 'IT helpdesk specialist', 'it_software', ['it', 'telecom', 'banking'], 'b1', { vocabulary: 'b1', reading: 'b1', listening: 'b1', speaking: 'b1' }),
  T('product_manager', 'Product manager', 'it_software', ['it'], 'b2', { grammar: 'b1', vocabulary: 'b1', reading: 'b2', listening: 'b2', writing: 'b2', speaking: 'b2' }),
  // Healthcare
  T('nurse', 'Nurse at a private clinic', 'healthcare', ['healthcare'], 'b1', { vocabulary: 'b1', reading: 'a2', listening: 'b1', speaking: 'b1' }),
  T('clinic_receptionist', 'Clinic receptionist', 'healthcare', ['healthcare'], 'a2', { vocabulary: 'a2', listening: 'b1', speaking: 'a2' }),
  T('pharma_representative', 'Pharmaceutical representative', 'healthcare', ['healthcare'], 'b2', { vocabulary: 'b2', reading: 'b2', listening: 'b1', speaking: 'b2' }),
  // Logistics
  T('freight_forwarder', 'Freight forwarder', 'logistics', ['logistics'], 'b1', { grammar: 'a2', vocabulary: 'b1', reading: 'b1', listening: 'b1', writing: 'b1', speaking: 'b1' }),
  T('warehouse_supervisor', 'Warehouse supervisor', 'logistics', ['logistics', 'manufacturing', 'retail'], 'a2', { vocabulary: 'a2', reading: 'a2', listening: 'a2', speaking: 'a2' }),
  T('dispatcher', 'Transport dispatcher', 'logistics', ['logistics'], 'b1', { vocabulary: 'b1', listening: 'b1', writing: 'a2', speaking: 'b1' }),
  // Office and management
  T('office_manager', 'Office manager', 'office_admin', ['other', 'education', 'government', 'it'], 'b1', { grammar: 'b1', vocabulary: 'b1', reading: 'b1', listening: 'b1', writing: 'b1' }),
  T('executive_assistant', 'Executive assistant', 'office_admin', ['banking', 'it', 'government', 'other'], 'b2', { grammar: 'b2', vocabulary: 'b1', reading: 'b2', listening: 'b2', writing: 'b2', speaking: 'b2' }),
  T('hr_specialist', 'HR specialist', 'office_admin', ['other', 'banking', 'it', 'manufacturing'], 'b1', { grammar: 'b1', vocabulary: 'b1', reading: 'b1', writing: 'b1', speaking: 'b1' }),
  T('department_head', 'Head of department', 'management', ['other', 'manufacturing', 'banking', 'it', 'retail'], 'b2', { grammar: 'b1', vocabulary: 'b2', reading: 'b2', listening: 'b2', writing: 'b2', speaking: 'b2' }),
  T('international_relations', 'International relations officer', 'management', ['government', 'education'], 'c1', { grammar: 'b2', vocabulary: 'c1', reading: 'c1', listening: 'b2', writing: 'c1', speaking: 'b2' }),
  // Engineering and manufacturing
  T('production_engineer', 'Production engineer', 'engineering', ['manufacturing'], 'b1', { vocabulary: 'b1', reading: 'b1', listening: 'a2', writing: 'a2' }),
  T('quality_inspector', 'Quality inspector', 'engineering', ['manufacturing'], 'a2', { vocabulary: 'a2', reading: 'b1', writing: 'a2' }),
  T('maintenance_technician', 'Maintenance technician', 'engineering', ['manufacturing', 'logistics'], 'a2', { vocabulary: 'a2', reading: 'a2', listening: 'a2' }),
  // Any company
  T('general_office', 'General office English check', 'general', ['other', 'education', 'government'], 'a2', { grammar: 'a2', vocabulary: 'a2', reading: 'a2', listening: 'a2' }),
];

export const roleTemplate = (code: string) => ROLE_TEMPLATES.find((template) => template.code === code) ?? null;
export const templateSkills = (template: RoleTemplate): Skill[] => SKILLS.filter((skill) => template.minimums[skill]);

/** What the page shows for a template, and what creating a test from it stores. */
export const templateView = (template: RoleTemplate) => {
  const skills = templateSkills(template);
  return { code: template.code, job_role: template.job_role, industries: template.industries, min_level: template.min_level, skills, skill_minimums: template.minimums, time_limit_minutes: suggestedMinutes(skills) };
};
