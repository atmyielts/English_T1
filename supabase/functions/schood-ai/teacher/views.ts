import type { ActionView } from '../types.ts';

/** An action as core/actions returns it, so the app's ApproveRunCard shows it at once. */
export function actionView(action: ActionView, userId: string) {
  return {
    id: action.id, kind: action.kind, summary: action.summary, display: action.display, status: action.interrupted ? 'interrupted' : action.status,
    can_approve: action.canApprove, retry_safe: action.retrySafe, result: action.status === 'done' ? action.result : null, error_code: action.errorCode,
    proposed_by_me: action.proposedBy === userId, created_at: action.createdAt, decided_at: action.decidedAt, finished_at: action.finishedAt, expires_at: action.expiresAt,
  };
}
