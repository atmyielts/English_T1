import { tashkentMonth } from '../../../../packages/ai-core/src/mod.ts';
import type { ActionView, Balance, GenerationRow, Member, Message, Thread, Workspace, WorkspaceAccess } from '../types.ts';

// What the API returns. Branding is cleaned on the way out so a stored value can
// never inject markup or a script URL into the app or a printout.

const COLOR = /^#[0-9a-f]{6}$/i;
export function brandingView(branding: Record<string, unknown>) {
  const logo = typeof branding.logo_url === 'string' && /^https:\/\/[^\s"'<>]{1,500}$/.test(branding.logo_url) ? branding.logo_url : null;
  const pick = (key: string) => (typeof branding[key] === 'string' && COLOR.test(branding[key] as string) ? branding[key] as string : null);
  const name = typeof branding.assistant_name === 'string' ? branding.assistant_name.trim().slice(0, 60) || null : null;
  return { logo_url: logo, primary_color: pick('primary_color'), accent_color: pick('accent_color'), assistant_name: name };
}
export const workspaceView = (workspace: Workspace, role: string) => ({
  id: workspace.id, kind: workspace.kind, name: workspace.name, role, status: workspace.status, branding: brandingView(workspace.branding),
});
export const balanceJson = (balance: Balance) => ({ plan: balance.plan, plan_grant: balance.planGrant, pack: balance.pack, total: balance.total, cycle_ends_at: balance.cycleEndsAt });
/** A centre member's monthly budget, or null when unlimited or personal. */
export function budgetJson(access: WorkspaceAccess, now: Date) {
  const member: Member = access.member;
  if (access.workspace.kind !== 'centre' || member.creditBudget === null) return null;
  const used = member.budgetPeriod === tashkentMonth(now) ? member.budgetUsed : 0;
  return { limit: member.creditBudget, used, left: Math.max(0, member.creditBudget - used) };
}
export const threadJson = (thread: Thread) => ({ id: thread.id, specialist: thread.specialistKey, title: thread.title, pinned: thread.pinned, page_id: thread.pageId, created_at: thread.createdAt, last_message_at: thread.lastMessageAt });
export const messageJson = (message: Message) => ({
  id: message.id, role: message.role, content: message.content, status: message.status, credits: message.credits,
  context: message.contextKinds, error_code: message.errorCode, created_at: message.createdAt,
});
export const actionJson = (action: ActionView, userId: string) => ({
  id: action.id, kind: action.kind, summary: action.summary, display: action.display, status: action.interrupted ? 'interrupted' : action.status,
  can_approve: action.canApprove, retry_safe: action.retrySafe, result: action.status === 'done' ? action.result : null, error_code: action.errorCode,
  proposed_by_me: action.proposedBy === userId, created_at: action.createdAt, decided_at: action.decidedAt, finished_at: action.finishedAt, expires_at: action.expiresAt,
});
export const generationJson = (row: GenerationRow) => ({
  id: row.id, feature: row.feature, status: row.status, progress: row.progress, output: row.output, verification: row.verification,
  error_code: row.errorCode, credits: row.credits, decided_at: row.decidedAt, created_at: row.createdAt, updated_at: row.updatedAt,
});
