import type { AccessDecision, PlanCode, Role, WorkspaceKind } from '../../../../packages/ai-core/src/mod.ts';

// JSON shapes of the schood-ai function (snake_case, as sent).

export interface Branding { logo_url: string | null; primary_color: string | null; accent_color: string | null; assistant_name: string | null }
export interface WorkspaceView { id: string; kind: WorkspaceKind; name: string; role: Role; status: 'active' | 'suspended'; branding: Branding }
export interface BalanceView { plan: number; plan_grant: number; pack: number; total: number; cycle_ends_at: string | null }
export interface BudgetView { limit: number; used: number; left: number }
export interface SpecialistView { key: string; name: string; description: string; credit_key: string; credits: number; available: boolean; suggestions: string[]; custom: boolean }
export interface Me {
  user: { id: string; email: string | null; name: string | null; is_schood_admin: boolean };
  workspace: WorkspaceView;
  workspaces: WorkspaceView[];
  /** launched: the owner's launch switch; before it, only beta testers have AI and nothing is on sale. */
  plan: { plans: PlanCode[]; features: string[]; beta: boolean; grant: number; launched?: boolean };
  credits: BalanceView & { budget: BudgetView | null };
  ai: { enabled: boolean; switches: Record<string, boolean> };
  specialists: SpecialistView[];
  limits: { message_chars: number };
  /** Names of the context sources areas registered (kind → label, in the request language). */
  context_labels?: Record<string, string>;
}
export interface ThreadView { id: string; specialist: string; title: string; pinned: boolean; page_id: string | null; created_at: string; last_message_at: string }
export interface MessageView { id: string; role: 'user' | 'assistant'; content: string; status: 'complete' | 'streaming' | 'failed' | 'stopped'; credits: number; context: string[]; error_code: string | null; created_at: string }
export type ActionStatusView = 'pending' | 'running' | 'done' | 'failed' | 'declined' | 'expired' | 'interrupted';
export interface ActionView {
  id: string; kind: string; summary: string; display: Record<string, string>; status: ActionStatusView; can_approve: boolean; retry_safe: boolean;
  result: Record<string, unknown> | null; error_code: string | null; proposed_by_me: boolean; created_at: string; decided_at: string | null; finished_at: string | null; expires_at: string;
}
export interface GenerationView {
  id: string; feature: string; status: 'requested' | 'generating' | 'ready' | 'approved' | 'rejected' | 'failed'; progress: Record<string, unknown>;
  output: unknown; verification: unknown; error_code: string | null; credits: number; decided_at: string | null; created_at: string; updated_at: string;
}
export interface LedgerView { id: number; kind: string; bucket: 'plan' | 'pack'; delta: number; credit_key: string | null; mine: boolean; created_at: string }
export interface ContextBlockView { kind: string; title: string; data: unknown }
export type { AccessDecision, PlanCode, Role };
