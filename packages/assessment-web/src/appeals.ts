import { request } from "./client";
import { ResponseJournal } from "./journal";
import { GradeCommands } from "./grade-command";
export interface AppealRow {
  id: string;
  attempt_id: string;
  score_revision_id: string;
  category: string;
  status: string;
  revision: number;
  created_at: string;
}
export interface AppealDetail extends AppealRow {
  run_id: string;
  reason: string;
  explanation: string | null;
  decided_at: string | null;
  requested_generation: number | null;
  can_decide: boolean;
  can_withdraw: boolean;
  can_regrade: boolean;
  released_result: {
    generation: number;
    total: number;
    max_score: number;
    released_at: string;
    title: string;
  };
  events: {
    revision: number;
    event: string;
    explanation: string;
    created_at: string;
  }[];
}
export const appealStatus: Record<string, string> = {
  submitted: "Awaiting review",
  withdrawn: "Withdrawn by candidate",
  upheld: "Original result upheld",
  regrade_requested: "Accepted for regrading",
};
export const appealCategory: Record<string, string> = {
  scoring: "Scoring or marking",
  procedure: "Exam procedure",
  accessibility: "Access or accommodation",
};
export async function openAppealCommands(tenant: string, actor: string) {
  if (!navigator.locks) {
    throw new Error(
      "Use a browser with secure workspace locking to submit appeals.",
    );
  }
  const scope = `appeals:${tenant}:${actor}`,
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
        const entry = await journal.append(1, "appeal-command", {
          action,
          data,
        });
        return { action, data, key: entry.command_key };
      },
      acknowledge: () => journal.acknowledge(1),
    },
    (intent) =>
      request(
        "appeals/commands",
        tenant,
        { action: intent.action, data: intent.data },
        undefined,
        intent.key,
        actor,
      ),
    async <T>(work: () => Promise<T>): Promise<T> =>
      await navigator.locks.request(`schood-appeal-commands:${scope}`, work),
    "appeal",
  );
  return { commands, close: () => journal.close() };
}
const messages: Record<string, string> = {
  forbidden: "Your institution has not granted permission to review appeals.",
  candidate_appeal_only:
    "Only the candidate who owns the released result can submit or withdraw its appeal.",
  independent_appeal_reviewer_required:
    "A moderator who did not mark, adjudicate, approve or release this result must decide its appeal.",
  latest_released_result_required:
    "This result changed or is not released yet. Refresh your results before appealing.",
  appeal_already_exists:
    "This result already has an appeal. Refresh your appeals to see its status.",
  appeal_revision_conflict:
    "Someone changed this appeal. Refresh and review its current state.",
  appeal_closed:
    "This appeal is already closed. Refresh to see the recorded decision.",
  regrade_already_pending:
    "A newer grading generation is already in progress. Review that generation before requesting another.",
  appeal_not_found: "This appeal is not available in the current institution.",
};
export function appealProblem(cause: unknown) {
  const code = (cause as { code?: string })?.code;
  if (code && messages[code]) return messages[code];
  if (cause instanceof Error && cause.name === "AbortError") {
    return "No receipt arrived in time. Retry the saved appeal request before making another change.";
  }
  return cause instanceof Error
    ? cause.message
    : "The appeals request could not be completed.";
}
