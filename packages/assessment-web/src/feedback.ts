import { request } from "./client";
import { GradeCommands } from "./grade-command";
import { ResponseJournal } from "./journal";
export type FeedbackLevel = "totals" | "sections" | "questions";
export interface FeedbackPolicy {
  window_id: string;
  revision: number;
  level: FeedbackLevel;
  version_id: string | null;
  version: number | null;
  available_after: string | null;
}
export interface FeedbackPreview extends FeedbackPolicy {
  review_hash: string;
}
export interface FeedbackVersion {
  id: string;
  version: number;
  level: FeedbackLevel;
  available_after: string | null;
  created_by: string;
  reason: string;
  approved: boolean;
  can_approve: boolean;
  review_hash: string;
}
export interface FeedbackHistory {
  window_id: string;
  revision: number;
  current: FeedbackPolicy;
  versions: FeedbackVersion[];
}
export interface FeedbackRelease {
  id: string;
  generation: number;
  release_at: string;
  feedback_snapshot: FeedbackPolicy & { available_at: string | null };
  held: boolean;
  revision: number;
}
export const feedbackLabel = (level: FeedbackLevel) =>
  ({
    totals: "Overall total only",
    sections: "Overall and section totals",
    questions: "Section totals and question points",
  })[level];
export const feedbackDate = (date: string | null) =>
  date ? new Date(date).toLocaleString() : "When the result is released";
export async function openFeedbackCommands(tenant: string, actor: string) {
  if (!navigator.locks) {
    throw new Error(
      "Use a browser with secure workspace locking to manage result feedback.",
    );
  }
  const scope = `feedback:${tenant}:${actor}`,
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
        const row = await journal.append(1, "feedback-command", {
          action,
          data,
        });
        return { action, data, key: row.command_key };
      },
      acknowledge: () => journal.acknowledge(1),
    },
    (intent) =>
      request<{ id: string }>(
        "feedback/commands",
        tenant,
        { action: intent.action, data: intent.data },
        undefined,
        intent.key,
        actor,
      ),
    async <T>(work: () => Promise<T>) =>
      await navigator.locks.request("schood-feedback:" + scope, work),
    "feedback",
  );
  return { commands, close: () => journal.close() };
}
