// A branch is request intent, never authorization. The server intersects it with
// the actor's current grants. Storage is actor/academy bound and contains no token.
let workspaceActor = '';
export const setWorkspaceActor = (actor: string) => { workspaceActor = actor; };
export const getWorkspaceActor = () => workspaceActor;
const slot = (academy: string, actor: string) => `schood.branch.v1:${JSON.stringify([actor, academy])}`;
export function selectedWorkspaceBranch(academy: string, actor = workspaceActor): string | null {
  if (!academy || !actor) return null;
  try { return sessionStorage.getItem(slot(academy, actor)) || null; } catch { return null; }
}
export function selectWorkspaceBranch(academy: string, actor: string, branch: string | null) {
  if (branch) sessionStorage.setItem(slot(academy, actor), branch);
  else sessionStorage.removeItem(slot(academy, actor));
}
export function captureWorkspaceBranch(payload: Record<string, unknown>, academy: string, actor = workspaceActor) {
  return Object.prototype.hasOwnProperty.call(payload, '_scope_branch_id') ? payload
    : { ...payload, _scope_branch_id: selectedWorkspaceBranch(academy, actor) };
}
