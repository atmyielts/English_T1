import type { Role } from '../types.ts';

// The centre area's own storage (migration 20261030400000_schood_ai_centre.sql).
// Rows of the centre's tables keep their column names (snake_case), so the same
// shapes come from Postgres and from the memory store used by tests and the dev
// stack. Simple tables go through one generic Table; anything that must be atomic
// (creating a centre, joining with an invite, public counters, staff links) is a
// SQL function, mirrored by the memory store.

export type Row = Record<string, unknown>;
export interface ListOptions<R> {
  order?: keyof R & string;
  desc?: boolean;
  limit?: number;
  /** Column value is one of these. */
  in?: Partial<Record<keyof R & string, unknown[]>>;
  /** Column is before (lt) or at/after (gte) the value (timestamps, dates, numbers). */
  lt?: Partial<Record<keyof R & string, string | number>>;
  gte?: Partial<Record<keyof R & string, string | number>>;
}
export interface Table<R extends Row> {
  list(filter?: Partial<R>, options?: ListOptions<R>): Promise<R[]>;
  get(filter: Partial<R>): Promise<R | null>;
  insert(row: Partial<R>): Promise<R>;
  /** Updates the rows matching the filter (and `in`); returns them. */
  update(filter: Partial<R>, patch: Partial<R>, options?: Pick<ListOptions<R>, 'in'>): Promise<R[]>;
  remove(filter: Partial<R>, options?: Pick<ListOptions<R>, 'in' | 'lt'>): Promise<number>;
  upsert(row: Partial<R>, conflict: (keyof R & string)[]): Promise<R>;
}

// --- Rows -------------------------------------------------------------------------------

export interface SettingsRow extends Row {
  workspace_id: string; created_via: 'academy' | 'admin'; created_by: string | null; public_key: string; embed_domains: string[];
  widgets: Record<string, unknown>; white_label: Record<string, unknown>; retention_days: number; extra_teacher_seats: number; extra_students: number; limits: Record<string, unknown>;
  budget_defaults: Record<string, unknown>; observation_standards: unknown[]; brief: Record<string, unknown>; byok_fee: Record<string, unknown>;
  updated_by: string | null; created_at: string; updated_at: string;
}
export type HintPolicy = 'during_homework' | 'always' | 'off';
/** The learner homework helper's rule (L7): hints only, may explain, or off. */
export type HomeworkRule = 'hints_only' | 'explain' | 'off';
export interface GroupRow extends Row {
  id: string; workspace_id: string; academy_classroom_id: string | null; name: string; level: string | null; teacher_ids: string[];
  hint_policy: HintPolicy; focus_topics: string[]; homework_rule: HomeworkRule | null; note: string | null; archived: boolean; created_by: string | null; created_at: string; updated_at: string;
}
export interface GroupMemberRow extends Row { group_id: string; workspace_id: string; user_id: string; added_at: string }
export interface AssignmentRuleRow extends Row { group_id: string; workspace_id: string; assignment_id: string; rule: HomeworkRule; title: string | null; set_by: string | null; updated_at: string }
export interface InviteRow extends Row {
  id: string; workspace_id: string; role: Exclude<Role, 'owner'>; code_hash: string; label: string | null; max_uses: number; uses: number;
  expires_at: string; created_by: string | null; revoked_at: string | null; created_at: string;
}
export interface ResultRow extends Row {
  id: string; workspace_id: string; student_name: string; exam: string; score: string; result_date: string | null; source: 'entered' | 'academy' | 'schood';
  verified: boolean; verified_by: string | null; verified_at: string | null; evidence_note: string | null; consent: boolean; created_by: string | null; created_at: string;
}
export type AttemptStatus = 'in_progress' | 'submitted' | 'marked' | 'reviewed';
export interface AttemptRow extends Row {
  id: string; workspace_id: string; test_page_id: string | null; test_revision: number | null; taker_user_id: string | null; prospect: Record<string, unknown>;
  channel: 'web' | 'widget' | 'telegram' | 'staff'; thread_id: string | null; status: AttemptStatus; answers: Record<string, unknown>;
  objective: Record<string, unknown> | null; ai_marks: Record<string, unknown> | null; level: string | null; report: Record<string, unknown> | null;
  reviewed_by: string | null; reviewed_at: string | null; submitted_at: string | null; created_at: string; updated_at: string;
}
export type CurriculumStatus = 'draft' | 'generating' | 'review' | 'approved' | 'published' | 'failed';
export interface CurriculumRow extends Row {
  id: string; workspace_id: string; title: string; brief: Record<string, unknown>; status: CurriculumStatus; outline: Record<string, unknown> | null;
  created_by: string | null; reviewer_id: string | null; published_at: string | null; publish_action_id: string | null; created_at: string; updated_at: string;
}
export type UnitStatus = 'pending' | 'generating' | 'ready' | 'changes_requested' | 'approved' | 'failed';
export interface UnitRow extends Row {
  id: string; curriculum_id: string; workspace_id: string; position: number; level: string; title: string; status: UnitStatus; generation_id: string | null;
  content: Record<string, unknown> | null; review_notes: string | null; reviewed_by: string | null; reviewed_at: string | null; page_ids: string[]; attempts: number;
  created_at: string; updated_at: string;
}
export interface InsightRow extends Row { workspace_id: string; group_id: string; period: string; topic: string; questions: number; students: number; group_size: number; computed_at: string }
export type SecretPurpose = 'telegram_bot' | 'byok';
export interface SecretRow extends Row {
  id: string; workspace_id: string; purpose: SecretPurpose; label: string; sealed: string; hint: string; fingerprint: string; config: Record<string, unknown>;
  created_by: string | null; created_at: string; revoked_at: string | null;
}
export interface AdmissionsRow extends Row {
  workspace_id: string; enabled: boolean; bot_ref: string | null; bot_username: string | null; bot_id: number | null; webhook_secret_hash: string | null;
  faq: unknown[]; prices: unknown[]; booking: Record<string, unknown>; handover: Record<string, unknown>; greeting: Record<string, unknown>;
  placement_page_id: string | null; updated_by: string | null; created_at: string; updated_at: string;
}
export type ThreadStatus = 'open' | 'handed_over' | 'booked' | 'closed';
export interface ThreadRow extends Row {
  id: string; workspace_id: string; channel: 'telegram' | 'widget'; external_id: string; contact: Record<string, unknown>; language: 'uz' | 'ru' | 'en';
  status: ThreadStatus; placement: Record<string, unknown> | null; academy_lead_id: string | null; turns_day: string | null; turns: number;
  last_message_at: string; created_at: string; updated_at: string;
}
export interface AdmissionsMessageRow extends Row {
  id: number; thread_id: string; workspace_id: string; role: 'prospect' | 'agent' | 'staff' | 'system'; content: string; author_id: string | null; flags: Record<string, unknown>; created_at: string;
}
export type BookingStatus = 'requested' | 'confirmed' | 'synced' | 'cancelled';
export interface BookingRow extends Row {
  id: string; workspace_id: string; thread_id: string | null; starts_at: string; ends_at: string; status: BookingStatus; mode: 'auto' | 'approve' | 'staff';
  contact: Record<string, unknown>; action_id: string | null; academy_lead_id: string | null; academy_trial_id: string | null; created_at: string; updated_at: string;
}
export interface TgUpdateRow extends Row { workspace_id: string; update_id: number; received_at: string }
export interface StaffChatRow extends Row { workspace_id: string; user_id: string; chat_id: string; linked_at: string }
export interface StaffCodeRow extends Row { code_hash: string; workspace_id: string; user_id: string; expires_at: string; used_at: string | null }
export interface ResellRow extends Row {
  workspace_id: string; enabled: boolean; price_uzs: number | null; period_days: number; gate_access: boolean; student_budget: number | null; note: string | null;
  wholesale_rate_uzs: number; updated_by: string | null; updated_at: string;
}
export interface ResellPeriodRow extends Row { id: string; workspace_id: string; /** Null once the student's account was closed. */ user_id: string | null; started_at: string; ended_at: string | null; paid_until: string | null; note: string | null; created_by: string | null }
export type LedgerStatus = 'open' | 'invoiced' | 'paid' | 'void';
export interface WholesaleRow extends Row {
  id: string; workspace_id: string; period: string; active_students: number; rate_uzs: number; amount_uzs: number; status: LedgerStatus; invoice_ref: string | null; computed_at: string; updated_by: string | null;
}
export interface BriefRow extends Row {
  id: string; workspace_id: string; week: string; status: 'ready' | 'sent' | 'partial' | 'failed'; source: 'live' | 'snapshot' | 'none'; snapshot_at: string | null;
  data: Record<string, unknown>; text: string; suggestions: unknown[]; deliveries: unknown[]; created_by: string | null; created_at: string; updated_at: string;
}
export interface SnapshotRow extends Row { id: string; workspace_id: string; captured_by: string | null; captured_at: string; data: Record<string, unknown> }
export interface KnowledgeDocRow extends Row {
  id: string; workspace_id: string; title: string; filename: string | null; mime: string | null; pages: number; chars: number; storage: Record<string, unknown> | null; created_by: string | null; created_at: string;
}
export interface KnowledgeChunkRow extends Row { id: number; doc_id: string; workspace_id: string; page: number; chunk: number; content: string }
export interface ByokFeeRow extends Row {
  id: string; workspace_id: string; period: string; calls: number; input_tokens: number; output_tokens: number; rate_uzs_per_1000: number | null; fee_uzs: number | null; status: LedgerStatus; computed_at: string;
}
export interface ObservationRow extends Row {
  id: string; workspace_id: string; teacher_id: string; observer_id: string | null; group_id: string | null; lesson_date: string; term: string; source: 'notes' | 'plan';
  input: string; feedback: Record<string, unknown> | null; status: 'draft' | 'shared' | 'acknowledged'; teacher_comment: string | null;
  shared_at: string | null; acknowledged_at: string | null; created_at: string; updated_at: string;
}
export interface CampaignRow extends Row {
  id: string; workspace_id: string; kind: 'winback' | 'renewal'; status: 'draft' | 'proposed' | 'done'; audience: unknown[]; action_ids: string[]; created_by: string | null; created_at: string; updated_at: string;
}
export interface AuditRow { id: number; actor_id: string | null; event: string; target_type: string | null; target_id: string | null; details: Record<string, unknown>; created_at: string }

export interface TableMap {
  settings: SettingsRow; groups: GroupRow; group_members: GroupMemberRow; assignment_rules: AssignmentRuleRow; invites: InviteRow; results: ResultRow; attempts: AttemptRow;
  curricula: CurriculumRow; units: UnitRow; insights: InsightRow; secrets: SecretRow; admissions: AdmissionsRow; threads: ThreadRow;
  admissions_messages: AdmissionsMessageRow; bookings: BookingRow; tg_updates: TgUpdateRow; staff_chats: StaffChatRow; staff_codes: StaffCodeRow;
  resell: ResellRow; resell_periods: ResellPeriodRow; wholesale: WholesaleRow; briefs: BriefRow; snapshots: SnapshotRow;
  knowledge_docs: KnowledgeDocRow; knowledge_chunks: KnowledgeChunkRow; byok_fees: ByokFeeRow; observations: ObservationRow; campaigns: CampaignRow;
}
export type TableName = keyof TableMap;
export const TABLES: Record<TableName, string> = {
  settings: 'ai_centre_settings', groups: 'ai_centre_groups', group_members: 'ai_centre_group_members', assignment_rules: 'ai_centre_assignment_rules', invites: 'ai_workspace_invites',
  results: 'ai_centre_results', attempts: 'ai_centre_placement_attempts', curricula: 'ai_centre_curricula', units: 'ai_centre_curriculum_units',
  insights: 'ai_centre_insights', secrets: 'ai_centre_secrets', admissions: 'ai_centre_admissions', threads: 'ai_centre_admissions_threads',
  admissions_messages: 'ai_centre_admissions_messages', bookings: 'ai_centre_bookings', tg_updates: 'ai_centre_tg_updates', staff_chats: 'ai_centre_staff_chats',
  staff_codes: 'ai_centre_staff_codes', resell: 'ai_centre_resell', resell_periods: 'ai_centre_resell_periods', wholesale: 'ai_centre_wholesale',
  briefs: 'ai_centre_briefs', snapshots: 'ai_centre_academy_snapshots', knowledge_docs: 'ai_centre_knowledge_docs', knowledge_chunks: 'ai_centre_knowledge_chunks',
  byok_fees: 'ai_centre_byok_fees', observations: 'ai_centre_observations', campaigns: 'ai_centre_campaigns',
};

// --- Atomic operations ------------------------------------------------------------------------

export interface CreateCentreInput { name: string; ownerId: string; academyTenantId: string | null; contractPlan: 'enterprise' | null; contractUntil: string | null; via: 'academy' | 'admin'; createdBy: string; publicKey: string }
export type AcceptInviteResult =
  | { ok: true; already: boolean; workspaceId: string; role: Role; status: 'active' | 'suspended' }
  | { ok: false; code: 'invite_invalid' | 'invite_revoked' | 'invite_expired' | 'invite_used_up' | 'seats_full' | 'students_full'; limit?: number };
export interface MemberInfo { userId: string; role: Role; status: 'active' | 'suspended'; creditBudget: number | null; budgetPeriod: string | null; budgetUsed: number; joinedAt: string; name: string | null }
export interface KnowledgeHit { chunkId: number; docId: string; title: string; page: number; content: string; rank: number }
export interface UsageReport {
  features: { key: string; credits: number; charges: number }[];
  members: { user_id: string; credits: number }[];
  days: { day: string; credits: number }[];
  cost: { usd: number; calls: number; failed: number };
  byok: { calls: number; input_tokens: number; output_tokens: number };
}

export interface CentreStore {
  table<N extends TableName>(name: N): Table<TableMap[N]>;
  createCentre(input: CreateCentreInput): Promise<{ created: boolean; workspaceId: string }>;
  acceptInvite(input: { codeHash: string; userId: string; teacherSeats: number | null; studentSeats: number | null; budgets: Record<string, number>; now: Date }): Promise<AcceptInviteResult>;
  members(workspaceId: string): Promise<MemberInfo[]>;
  /** Role, status or monthly budget of a member (never the owner's role). */
  updateMember(workspaceId: string, userId: string, patch: { role?: Role; status?: 'active' | 'suspended'; creditBudget?: number | null }): Promise<boolean>;
  removeMember(workspaceId: string, userId: string): Promise<boolean>;
  workspaceIdByTenant(tenantId: string): Promise<string | null>;
  takePublic(workspaceId: string, bucket: string, day: string, cap: number): Promise<boolean>;
  claimStaffCode(workspaceId: string, codeHash: string, chatId: string, now: Date): Promise<string | null>;
  /** `query` is a tsquery built from letters and digits only. */
  searchKnowledge(workspaceId: string, query: string, limit: number): Promise<KnowledgeHit[]>;
  usage(workspaceId: string, since: Date): Promise<UsageReport>;
  auditEvents(workspaceId: string, options: { limit: number; before?: number }): Promise<AuditRow[]>;
}
