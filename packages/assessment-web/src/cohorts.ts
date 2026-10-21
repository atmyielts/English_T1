import { request } from "./client";
import { ResponseJournal } from "./journal";
import { GradeCommands } from "./grade-command";
import {
  english,
  isWebKey,
  LocalizedError,
  messageText,
  type Translate,
} from "./i18n/translate.ts";
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
const outcomeCodes = ["pending", "created", "existing", "conflict", "inactive", "removed", "cancelled"];
const rosterStateCodes = ["queued", "running", "completed", "completed_with_issues", "blocked", "cancelled"];
/** Reader-language roster wording; unknown codes return undefined, as the maps did. */
export function rosterOutcomeText(code: string, t: Translate = english) {
  const key = `roster.outcome.${code}`;
  return isWebKey(key) ? t(key) : undefined;
}
export function rosterStateText(code: string, t: Translate = english) {
  const key = `roster.state.${code}`;
  return isWebKey(key) ? t(key) : undefined;
}
/** English maps kept for existing callers; prefer the `*Text(code, t)` helpers. */
export const rosterOutcome: Record<string, string> = Object.fromEntries(
  outcomeCodes.map((code) => [code, rosterOutcomeText(code)!]),
);
export const rosterState: Record<string, string> = Object.fromEntries(
  rosterStateCodes.map((code) => [code, rosterStateText(code)!]),
);
export async function openCohortCommands(tenant: string, actor: string) {
  if (!navigator.locks) {
    throw new LocalizedError("cohort.locks");
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
/** Known cohort refusals are translated under `cohort.code.<code>`. */
export function cohortProblem(cause: unknown, t: Translate = english) {
  const code = (cause as { code?: string })?.code, key = `cohort.code.${code}`;
  return code && isWebKey(key)
    ? t(key)
    : cause instanceof Error && cause.name === "AbortError"
    ? t("cohort.problem.timeout")
    : messageText(cause, t, "cohort.problem.failed");
}
