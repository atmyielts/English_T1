import { ContractError, object, text, uuid } from "./mod.ts";
export interface WorkloadCursor {
  created_at: string;
  id: string;
}
export interface WorkloadFilters {
  state: string;
  assignment: string;
  window_id: string | null;
  candidate_id: string | null;
  limit: number;
  after: WorkloadCursor | null;
}
export interface WorkloadSession {
  id: string;
  candidate_id: string;
  candidate_name: string;
  window_id: string;
  window_title: string;
  state: string;
  monitoring_mode: string;
  created_at: string;
  assignment_revision: number;
  observers: { user_id: string; name: string }[];
  can_observe: boolean;
  loss_since: string | null;
  last_heartbeat_at: string | null;
}
export interface WorkloadPage {
  rows: WorkloadSession[];
  next: WorkloadCursor | null;
  server_time: string;
  manager: boolean;
}
export interface WorkloadStaff {
  user_id: string;
  name: string;
  active_assignments: number;
  eligible: boolean;
}
export function workloadFilters(value: unknown): WorkloadFilters {
  const d = object(value),
    state = d.state ?? "all",
    assignment = d.assignment ?? "all",
    limit = d.limit ?? 25;
  if (
    !["all", "preparing", "active", "paused", "completed"].includes(
      String(state),
    ) || !["all", "mine", "unassigned"].includes(String(assignment))
  ) {
    throw new ContractError(
      "invalid_workload_filter",
      "Choose a supported state and assignment filter.",
    );
  }
  if (
    typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 ||
    limit > 50
  ) throw new ContractError("invalid_workload_limit", "Request 1–50 sessions.");
  let after: WorkloadCursor | null = null;
  if (d.after != null) {
    const cursor = object(d.after),
      stamp = text(cursor.created_at, "Page timestamp", 40);
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/
        .test(stamp) ||
      !Number.isFinite(Date.parse(stamp))
    ) {
      throw new ContractError(
        "invalid_workload_cursor",
        "Refresh the session list to restart paging.",
      );
    }
    after = { created_at: stamp, id: uuid(cursor.id) };
  }
  return {
    state: String(state),
    assignment: String(assignment),
    window_id: d.window_id ? uuid(d.window_id) : null,
    candidate_id: d.candidate_id ? uuid(d.candidate_id) : null,
    limit,
    after,
  };
}
export function workloadAssignment(action: string, value: unknown) {
  if (!["assignment.set", "assignment.remove"].includes(action)) {
    throw new ContractError(
      "invalid_workload_action",
      "Choose assign or remove assignment.",
    );
  }
  const d = object(value);
  if (!["observer", "reviewer"].includes(String(d.role))) {
    throw new ContractError(
      "invalid_assignment_role",
      "Choose observer or reviewer.",
    );
  }
  if (!Array.isArray(d.targets) || !d.targets.length || d.targets.length > 50) {
    throw new ContractError(
      "invalid_assignment_targets",
      "Review 1–50 sessions.",
    );
  }
  const targets = d.targets.map((value) => {
    const row = object(value);
    if (
      typeof row.expected_revision !== "number" ||
      !Number.isSafeInteger(row.expected_revision) || row.expected_revision < 0
    ) {
      throw new ContractError(
        "invalid_assignment_revision",
        "Refresh before reviewing assignments.",
      );
    }
    return {
      session_id: uuid(row.session_id),
      expected_revision: row.expected_revision,
    };
  }).sort((a, b) => a.session_id.localeCompare(b.session_id));
  if (new Set(targets.map((row) => row.session_id)).size !== targets.length) {
    throw new ContractError(
      "duplicate_assignment_target",
      "Review each session only once.",
    );
  }
  const reason = text(d.reason, "Assignment reason", 2000);
  if (reason.length < 10) {
    throw new ContractError(
      "assignment_reason_required",
      "Explain the assignment change in at least 10 characters.",
    );
  }
  return { user_id: uuid(d.user_id), role: String(d.role), reason, targets };
}
