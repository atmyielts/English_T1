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
const appealStatusCodes = ["submitted", "withdrawn", "upheld", "regrade_requested"];
const appealCategoryCodes = ["scoring", "procedure", "accessibility"];
/** Reader-language appeal status; unknown codes render as nothing, as before. */
export function appealStatusText(code: string, t: Translate = english) {
  const key = `appeal.status.${code}`;
  return isWebKey(key) ? t(key) : "";
}
export function appealCategoryText(code: string, t: Translate = english) {
  const key = `appeal.category.${code}`;
  return isWebKey(key) ? t(key) : "";
}
/** English maps kept for existing callers; prefer the `*Text(code, t)` helpers. */
export const appealStatus: Record<string, string> = Object.fromEntries(
  appealStatusCodes.map((code) => [code, appealStatusText(code)]),
);
export const appealCategory: Record<string, string> = Object.fromEntries(
  appealCategoryCodes.map((code) => [code, appealCategoryText(code)]),
);
export async function openAppealCommands(tenant: string, actor: string) {
  if (!navigator.locks) {
    throw new LocalizedError("appeal.locks");
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
/** Known appeal refusals are translated under `appeal.code.<code>`. */
export function appealProblem(cause: unknown, t: Translate = english) {
  const code = (cause as { code?: string })?.code, key = `appeal.code.${code}`;
  if (code && isWebKey(key)) return t(key);
  if (cause instanceof Error && cause.name === "AbortError") {
    return t("appeal.problem.timeout");
  }
  return messageText(cause, t, "appeal.problem.failed");
}
