import { request } from "./client";
import { GradeCommands } from "./grade-command";
import { ResponseJournal } from "./journal";
import {LocalizedError,english,type Translate} from './i18n/translate.ts';
export interface AnalyticsChoice {
  id: string;
  title: string;
}
export interface AnalyticsSnapshot extends AnalyticsChoice {
  as_of: string;
  cohort_id: string | null;
  population: {
    registered: number;
    started: number;
    finalized: number;
    released: number;
    cohort_title: string | null;
  };
}
export interface AnalyticsForm {
  form_key: string;
  sample_size: number;
  item_count: number;
}
export interface AnalyticsItem {
  id: string;
  prompt: string;
  type: string;
  locale: string;
  sample_size: number;
  mean_percent: number;
  full_credit: number;
  recorded: number;
  item_rest_correlation: number | null;
  options: { id: string; text: string; selected: number }[];
}
export interface AnalyticsReport extends AnalyticsSnapshot {
  threshold_percent: number;
  source_hash: string;
  reason: string;
  summary: {
    count: number;
    mean_percent: number | null;
    median_percent: number | null;
    sd_percent: number | null;
    minimum_percent: number | null;
    maximum_percent: number | null;
    at_or_above_threshold: number;
    distribution: { from_percent: number; to_percent: number; count: number }[];
  };
  forms: AnalyticsForm[];
  form_count: number;
  selected_form: string | null;
  items: AnalyticsItem[];
  reliability: {
    sample_size: number;
    item_count: number;
    raw_alpha: number | null;
    method: string;
  } | null;
  cautions: string[];
}
export interface ReleasedBreakdown {
  attempt_id: string;
  generation: number;
  score_revision_id: string;
  released_at: string;
  detail_level: 'totals' | 'sections' | 'questions';
  feedback_status: 'totals_only' | 'pending' | 'withheld' | 'available';
  available_at: string | null;
  sections: {
    title: string | null;
    position: number;
    total: number;
    max_score: number;
    questions: { position: number; score: number; max_score: number }[];
  }[];
}
export const metric = (
  value: number | null | undefined,
  digits = 1,
  t: Translate = english,
  locale?: string,
) =>
  value == null ? t("analytics.notAvailable") : value.toLocaleString(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
export async function openAnalyticsCommands(tenant: string, actor: string) {
  if (!navigator.locks) {
    throw new LocalizedError("analytics.locks");
  }
  const scope = `analytics:${tenant}:${actor}`,
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
        const row = await journal.append(1, "analytics-command", {
          action,
          data,
        });
        return { action, data, key: row.command_key };
      },
      acknowledge: () => journal.acknowledge(1),
    },
    (intent) =>
      request<{ id: string }>(
        "analytics/commands",
        tenant,
        { action: intent.action, data: intent.data },
        undefined,
        intent.key,
        actor,
      ),
    async <T>(work: () => Promise<T>) =>
      await navigator.locks.request("schood-analytics:" + scope, work),
    "report",
  );
  return { commands, close: () => journal.close() };
}
