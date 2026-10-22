import { useState } from "react";
import { type CaseOutcome, type Command, type SessionDetail } from "./types";
import { useAppT, useCodeText } from "./i18n/index.ts";

/** Senior decision when reviewers disagree, and the explanation the candidate sees. */
export function CaseDecision({ detail, caseId, busy, command, actor }: {
  detail: SessionDetail;
  caseId: string;
  busy: boolean;
  command: Command;
  actor: string;
}) {
  const t = useAppT(), code = useCodeText();
  const reviewCase = detail.cases.find((row) => row.id === caseId)!;
  const outcome: CaseOutcome = detail.outcomes?.[caseId] ?? { adjudication: null, disclosure: null };
  const findings = detail.findings.filter((row) => row.case_id === caseId);
  const disagreement = reviewCase.state === "reviewing" && findings.length > 1 && new Set(findings.map((row) => row.disposition)).size > 1;
  const reviewedIt = findings.some((row) => row.reviewer_id === actor);
  const decide = detail.permissions.decide === true;
  const [disposition, setDisposition] = useState("insufficient_evidence"),
    [rationale, setRationale] = useState(""),
    [summary, setSummary] = useState("");
  return (
    <div className="case-decision">
      {outcome.adjudication && (
        <div className="decision-record">
          <h5>{t("decision.title")}</h5>
          <p><strong>{code("disposition", outcome.adjudication.disposition)}</strong></p>
          <p>{outcome.adjudication.rationale}</p>
        </div>
      )}
      {disagreement && decide && !reviewedIt && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void command("case.adjudicate", { case_id: caseId, disposition, rationale }, t("decision.saved"));
          }}
        >
          <h5>{t("decision.title")}</h5>
          <p className="hint">{t("decision.hint")}</p>
          <label>
            {t("decision.outcome")}
            <select value={disposition} onChange={(event) => setDisposition(event.target.value)}>
              {["clear", "confirmed", "insufficient_evidence"].map((value) => <option key={value} value={value}>{code("disposition", value)}</option>)}
            </select>
          </label>
          <label>
            {t("decision.rationale")}
            <textarea className="prose-input" required minLength={10} maxLength={10000} rows={3} value={rationale} onChange={(event) => setRationale(event.target.value)} />
          </label>
          <button disabled={busy || rationale.trim().length < 10}>{t("decision.submit")}</button>
        </form>
      )}
      {disagreement && decide && reviewedIt && <p className="hint">{t("decision.independent")}</p>}
      {outcome.disclosure ? (
        <div className="decision-record">
          <h5>{t("disclosure.sent")}</h5>
          <p>{outcome.disclosure.summary}</p>
        </div>
      ) : reviewCase.state === "resolved" && decide && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void command("case.disclose", { case_id: caseId, summary }, t("disclosure.saved"));
          }}
        >
          <h5>{t("disclosure.title")}</h5>
          <p className="hint">{t("disclosure.hint")}</p>
          <label>
            {t("disclosure.summary")}
            <textarea className="prose-input" required minLength={10} maxLength={4000} rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
          </label>
          <button disabled={busy || summary.trim().length < 10}>{t("disclosure.submit")}</button>
        </form>
      )}
    </div>
  );
}
