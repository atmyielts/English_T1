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
  /** Departments managers look after beyond their own (HR only). */
  manager_departments?: Record<string, string[]>;
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
/** A link that cannot be used says only that, with the company's name. */
export interface JoinClosed {
  state: Exclude<InviteState, 'open'> | 'closed' | 'paused' | 'ended';
  org: { name: string };
  signed_in: boolean;
}
export interface JoinUsable {
  state: 'open' | 'joined';
  kind: 'personal' | 'link';
  org: { id: string; name: string; industry: string; city: string | null };
  role: string; department: string | null; job_role: string; full_name: string | null; email_hint: string | null;
  expires_at: string; signed_in: boolean; home: string | null;
}
export type JoinPreview = JoinClosed | JoinUsable;
/** What routes that change English access add when the sync failed. */
export interface AccessSynced { access_sync_failed?: boolean }
export interface SettingsData { org: Org; usage: Usage; admins: Member[]; member: Member | null; pilot_tests: number }
export interface SearchResults {
  q: string;
  people: { id: string; name: string | null; email: string | null; role: string; status: string; department_id: string | null }[];
  departments: { id: string; name: string }[];
  tests: { id: string; title: string; kind: string; status: string }[];
  courses: { track: string; lesson: string | null; title: string; level: string | null }[];
}
export interface ChecklistItem { key: string; done: boolean; count: number; applies: boolean }
export interface ChecklistState { items: ChecklistItem[]; done: number; total: number; complete: boolean; dismissed_at: string | null }
export interface MemberRequest {
  id: string; member_id: string; kind: 'seat' | 'job_role'; job_role: string | null; note: string | null; status: 'pending' | 'approved' | 'declined' | 'withdrawn';
  decided_at: string | null; created_at: string; person?: string | null; current_job_role?: string | null; seat?: boolean;
}
export interface SavedFilter { id: string; name: string; filters: Record<string, string> }
export interface BulkRow { id: string; name: string | null; ok: boolean; code?: string; unchanged?: boolean; access_sync_failed?: boolean; email?: string | null; link?: string }
export interface IdleSeats { idle: { id: string; name: string | null; department_id: string | null }[]; not_joined: { id: string; name: string | null }[]; not_sharing: number; seats_used: number }
export interface BulkResponse { action: string; results: BulkRow[]; changed: number; failed: number; access_sync_failed: boolean }
export interface PartyDetails {
  legal_name?: string | null; tax_id?: string | null; vat_code?: string | null; bank_name?: string | null; mfo?: string | null; account?: string | null;
  address?: string | null; phone?: string | null; email?: string | null; director?: string | null;
}
export interface InvoiceLine { description: string; quantity: number; unit_price: number }
export interface InvoiceSummary {
  id: string; org_id: string; contract_id: string | null; number: string; act_number: string | null; act_date: string | null; issue_date: string; due_date: string | null;
  status: 'issued' | 'partial' | 'paid' | 'void'; subtotal: number; vat_percent: number; vat_amount: number; total: number; paid_amount: number; paid_on: string | null;
  activated_at: string | null; balance: number; overdue: boolean; days_overdue: number;
}
export interface InvoiceDetail extends InvoiceSummary { lines: InvoiceLine[]; seller: PartyDetails; buyer: PartyDetails; notes: string | null }
export interface ContractView {
  id: string; org_id: string; title: string; status: 'quote' | 'sent' | 'negotiating' | 'signed' | 'lost' | 'ended'; seats: number; tests: number | null; price_per_seat: number; tests_fee: number;
  term_months: number; currency: string; start_date: string | null; end_date: string | null; renewal_date: string | null; signed_at: string | null; notes?: string | null;
  renewed_from: string | null; total: number; monthly: number;
}
export interface PlanData {
  org: { id: string; name: string; status: Org['status']; seats_limit: number; tests_limit: number | null; tests_used: number; contract_ends_at: string | null };
  seats_used: number; contract: ContractView | null; invoices: InvoiceSummary[]; buyer: PartyDetails;
  contact: { email: unknown; phone: unknown }; seats_requested_at: string | null;
}
export interface ProfileData {
  member: Member; email: string | null; locale: string | null; department: string | null; requests: MemberRequest[]; last_owner: boolean; seats_available_here: boolean;
}
export interface LeadForm { pilot_tests: number; self_serve: boolean; interests: string[] }
