// Shapes the gtm API returns (supabase/functions/company/people/*, site.ts, staff.ts).
import type { Member, Org, Usage } from '../../api.ts';

export type InviteState = 'open' | 'expired' | 'revoked' | 'used_up';
export interface Department { id: string; name: string }
export interface PersonRow extends Member {
  invited_at?: string;
  removed_at?: string | null;
  invite: { id: string; expires_at: string; state: InviteState } | null;
}
export interface TeamLink {
  id: string; kind: 'link' | 'personal'; role: 'admin' | 'manager' | 'employee'; department_id: string | null; job_role: string;
  max_uses: number | null; uses: number; expires_at: string; revoked_at: string | null; created_at: string; state: InviteState;
}
export interface PeopleList {
  members: PersonRow[];
  departments: Department[];
  links: TeamLink[];
  usage: Usage | null;
  status: Org['status'];
  scope: 'all' | 'department';
  can_edit: boolean;
}
export interface ImportPreviewRow {
  line: number; name: string; email: string | null; department: string | null; department_new?: boolean;
  job_role: string | null; role: string | null; error: null | 'name' | 'email' | 'duplicate' | 'exists' | 'job_role' | 'role' | 'department';
}
export interface ImportResult {
  header: boolean; total: number; valid: number; invalid: number; new_departments: string[];
  rows?: ImportPreviewRow[];
  created?: { line: number; member_id: string; name: string; email: string | null; department: string | null; job_role: string; role: string; link: string }[];
  expires_at?: string;
}
export interface DepartmentStats extends Department { created_at: string | null; people: number; invited: number; seats: number }
export interface JoinPreview {
  state: InviteState | 'joined' | 'closed' | 'paused';
  kind: 'personal' | 'link';
  org: { id: string; name: string; industry: string; city: string | null };
  role: string; department: string | null; job_role: string; full_name: string | null; email_hint: string | null;
  expires_at: string; signed_in: boolean; home: string | null;
}
export interface SettingsData { org: Org; usage: Usage; admins: Member[]; member: Member | null; pilot_tests: number }
export interface LeadForm { pilot_tests: number; self_serve: boolean; interests: string[] }
