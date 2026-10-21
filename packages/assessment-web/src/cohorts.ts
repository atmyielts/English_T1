import { request } from "./client";
import { ResponseJournal } from "./journal";
import { GradeCommands } from "./grade-command";
export interface Cohort {
  id: string;
  title: string;
  description: string;
  state: "active" | "archived";
  revision: number;
  member_count?: number;
  members?: CohortMember[];
}
export interface CohortMember {
  id: string;
  name: string;
  extra_seconds: number;
}
export interface DirectoryMember {
  id: string;
  name: string;
}
export interface CohortSitting {
  id: string;
  title: string;
  opens_at: string;
  closes_at: string;
  required_services: string[];
  assessment_version_id: string;
}
export interface RosterPreview {
  cohort_id: string;
  cohort_title: string;
  cohort_state: string;
  cohort_revision: number;
  sitting: CohortSitting;
  review_hash: string;
  total: number;
  eligible: number;
  existing: number;
  conflicts: number;
  members: {
    user_id: string;
    name: string;
    extra_seconds: number;
    eligible: boolean;
    registration_id: string | null;
    registered_extra_seconds: number | null;
  }[];
}
export interface RosterJob {
  id: string;
  cohort_id: string;
  window_id: string;
  window_snapshot: CohortSitting;
  state: string;
  revision: number;
  total: number;
  processed: number;
  blocked_reason: string | null;
  created_at: string;
  summary?: Record<string, number>;
  targets?: {
    user_id: string;
    name: string;
    extra_seconds: number;
    outcome: string;
    registration_id: string | null;
  }[];
}
export const rosterOutcome: Record<string, string> = {
  pending: "Awaiting processing",
  created: "Registered by this job",
  existing: "Already registered with matching extra time",
  conflict: "Existing registration has different extra time — unchanged",
  inactive: "Institution membership inactive or not eligible at review",
  removed: "Cohort entry removed or its extra time changed",
  cancelled: "Not processed — job cancelled",
};
export const rosterState: Record<string, string> = {
  queued: "Queued for registration",
  running: "Processing a registration batch",
  completed: "All entries processed successfully",
  completed_with_issues: "Finished with entries requiring attention",
  blocked: "Paused — action required",
  cancelled: "Remaining entries cancelled",
};
export async function openCohortCommands(tenant: string, actor: string) {
  if (!navigator.locks) {
    throw new Error(
      "Use a browser with secure workspace locking to manage cohorts.",
    );
  }
  const scope = `cohorts:${tenant}:${actor}`,
    journal = await ResponseJournal.create(scope);
  const commands = new GradeCommands(
    {
      async pending() {
        const rows = await journal.pending();
        if (!rows.length) return null;
        const value = rows[0].response as {
          action: string;
          data: Record<string, unknown>;
        };
        return { ...value, key: rows[0].command_key };
      },
      async save(action, data) {
        const row = await journal.append(1, "cohort-command", { action, data });
        return { action, data, key: row.command_key };
      },
      acknowledge: () => journal.acknowledge(1),
    },
    (intent) =>
      request<Record<string, unknown>>(
        "cohorts/commands",
        tenant,
        { action: intent.action, data: intent.data },
        undefined,
        intent.key,
        actor,
      ),
    async <T>(work: () => Promise<T>): Promise<T> =>
      await navigator.locks.request(`schood-cohort-commands:${scope}`, work),
    "cohort",
  );
  return { commands, close: () => journal.close() };
}
const messages: Record<string, string> = {
  forbidden: "Your institution has not granted exam coordination permission.",
  active_institution_member_required:
    "Choose an active member of this institution. Invite or enroll other candidates through the institution’s approved workflow first.",
  cohort_revision_conflict:
    "This cohort changed. Refresh its roster before editing.",
  roster_review_changed:
    "The roster, sitting or existing registrations changed. Review a fresh preview before confirming.",
  cohort_archived:
    "Reactivate the cohort before changing its members or scheduling it.",
  cohort_empty: "Add cohort members before creating a registration job.",
  sitting_closed: "This sitting has closed. Choose an open or future sitting.",
  roster_sitting_changed:
    "The sitting configuration changed. Cancel the remaining work and review a new registration job.",
  roster_job_revision_conflict:
    "The job progressed or changed. Refresh its current state before this action.",
  roster_job_not_blocked: "Only a blocked job can be explicitly resumed.",
  cohort_not_found: "This cohort is not available in the selected institution.",
};
export function cohortProblem(cause: unknown) {
  const code = (cause as { code?: string })?.code;
  return code && messages[code]
    ? messages[code]
    : cause instanceof Error && cause.name === "AbortError"
    ? "No receipt arrived in time. Retry the saved cohort request before another change."
    : cause instanceof Error
    ? cause.message
    : "The cohort request could not be completed.";
}
