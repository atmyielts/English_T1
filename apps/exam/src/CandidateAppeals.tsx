import { type FormEvent, useState } from "react";
import { useAppeals } from "../../../packages/assessment-web/src/use-appeals";
import { AppealList } from "../../../packages/assessment-web/src/AppealList";
import { AppealView } from "../../../packages/assessment-web/src/AppealView";
import type { ReleasedResult } from "../../../packages/assessment-web/src/grading";
import "../../../packages/assessment-web/src/appeals.css";
import { appealCategoryText } from "../../../packages/assessment-web/src/appeals";
import { useI18n } from "../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "./i18n/index.ts";
export function CandidateAppeals(
  { tenant, actor, results }: {
    tenant: string;
    actor: string;
    results: ReleasedResult[];
  },
) {
  const t = useAppT(), { date } = useI18n();
  const state = useAppeals(tenant, actor, "candidate"),
    [selected, setSelected] = useState(""),
    [category, setCategory] = useState("scoring"),
    [reason, setReason] = useState(""),
    [ack, setAck] = useState(false);
  const availableResults = results.filter((row) =>
    !state.rows.some((appeal) =>
      appeal.score_revision_id === row.score_revision_id
    )
  );
  const result = availableResults.find((row) =>
    row.score_revision_id === selected
  );
  const blocked = state.busy || !!state.pending || !state.commandReady;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!result) return;
    if (
      await state.send("appeal.submit", {
        attempt_id: result.attempt_id,
        score_revision_id: result.score_revision_id,
        category,
        reason,
      })
    ) {
      setReason("");
      setSelected("");
      setAck(false);
    }
  }
  return (
    <section
      className="appeals-panel"
      aria-labelledby="candidate-appeals-title"
      aria-busy={state.loading || state.busy}
    >
      <h2 id="candidate-appeals-title">{t("exam.appeals.title")}</h2>
      <p>{t("exam.appeals.intro")}</p>
      <AppealList state={state} />
      {state.detail && (
        <AppealView
          key={`${state.detail.id}:${state.detail.revision}`}
          appeal={state.detail}
          busy={state.busy}
          blocked={!!state.pending || !state.commandReady}
          send={state.send}
        />
      )}
      {!state.loading && results.length > 0 && !availableResults.length && (
        <p>{t("exam.appeals.allAppealed")}</p>
      )}
      {availableResults.length > 0 && (
        <form onSubmit={(event) => void submit(event)}>
          <h3>{t("exam.appeals.formTitle")}</h3>
          <label>
            {t("exam.appeals.result")}<select
              required
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value);
                setAck(false);
              }}
              disabled={blocked}
            >
              <option value="">{t("exam.appeals.chooseResult")}</option>
              {availableResults.map((row) => (
                <option
                  key={row.score_revision_id}
                  value={row.score_revision_id}
                >
                  {t("exam.appeals.option", {
                    total: row.total,
                    max: row.max_score,
                    generation: row.generation,
                    date: date(row.released_at),
                    id: row.attempt_id.slice(0, 8),
                  })}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("exam.appeals.concern")}<select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value)}
              disabled={blocked}
            >
              <option value="scoring">{appealCategoryText("scoring", t)}</option>
              <option value="procedure">
                {appealCategoryText("procedure", t)}
              </option>
              <option value="accessibility">
                {appealCategoryText("accessibility", t)}
              </option>
            </select>
          </label>
          <label>
            {t("exam.appeals.explain")}<textarea
              required
              maxLength={5000}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setAck(false);
              }}
              disabled={blocked}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
              disabled={blocked}
            />{t("exam.appeals.ack")}
          </label>
          <button
            disabled={blocked || !result || !ack ||
              !reason.trim()}
          >
            {t("exam.appeals.submit")}
          </button>
        </form>
      )}
    </section>
  );
}
