import React, { useState } from "react";
import { FindingRecordingCitation } from "./FindingRecordingCitation";
import { CaseDecision } from "./CaseDecision";
import { type Command, type SessionDetail } from "./types";
import { useAppT, useCodeText, useDateTime } from "./i18n/index.ts";
import {
  type RecordingSelection,
  referenceKey,
} from "./RecordingCitationPicker";
export function CasePanel({
  detail,
  caseId,
  busy,
  canReview,
  command,
  reviewerId,
  recordingSelections,
  recordingsEnabled = true,
}: {
  detail: SessionDetail;
  caseId: string;
  busy: boolean;
  canReview: boolean;
  command: Command;
  reviewerId: string;
  recordingSelections: RecordingSelection[];
  recordingsEnabled?: boolean;
}) {
  const t = useAppT(), code = useCodeText(), dateTime = useDateTime();
  const reviewCase = detail.cases.find((row) => row.id === caseId)!;
  const [disposition, setDisposition] = useState("insufficient_evidence"),
    [rationale, setRationale] = useState(""),
    [evidence, setEvidence] = useState<string[]>([]),
    [acknowledged, setAcknowledged] = useState(false);
  const [recordingKeys, setRecordingKeys] = useState<string[]>([]);
  const findings = detail.findings.filter((row) => row.case_id === caseId);
  const alreadyReviewed = findings.some((row) =>
    row.reviewer_id === reviewerId
  );
  return (
    <article className="case-panel">
      <div className="record-heading">
        <h4>{reviewCase.title}</h4>
        <span className="state-badge">{code("state", reviewCase.state)}</span>
      </div>
      {reviewCase.disposition && (
        <p>{t("case.disposition", { disposition: code("disposition", reviewCase.disposition) })}</p>
      )}
      <ul className="records">
        {findings.map((finding) => (
          <li key={finding.id}>
            <strong>{code("disposition", finding.disposition)}</strong>
            <span>{t("case.reviewer", { id: finding.reviewer_id })}</span>
            <p>{finding.rationale}</p>
            <span>
              {t("case.evidenceCited", { count: finding.evidence_event_ids.length })}
            </span>
            {(detail.recording_citations ?? []).filter((cite) =>
              cite.finding_id === finding.id
            ).map((cite) => (
              <FindingRecordingCitation key={cite.id} cite={cite} />
            ))}
          </li>
        ))}
      </ul>
      {!findings.length && <p>{t("case.noFindings")}</p>}
      {reviewCase.state === "reviewing" && findings.length > 1 &&
        new Set(findings.map((row) => row.disposition)).size > 1 && (
        <p className="service-warning">{t("case.disagree")}</p>
      )}
      <CaseDecision detail={detail} caseId={caseId} busy={busy} command={command} actor={reviewerId} />
      {alreadyReviewed && reviewCase.state !== "resolved" && (
        <p>{t("case.alreadyReviewed")}</p>
      )}
      {canReview && !alreadyReviewed && reviewCase.state !== "resolved" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const refs = recordingSelections.filter((value) =>
              recordingKeys.includes(referenceKey(value.reference))
            ).map((value) => value.reference);
            if (acknowledged) {
              void command("case.finding", {
                case_id: caseId,
                disposition,
                rationale,
                evidence_event_ids: evidence,
                ...(refs.length ? { evidence_recording_refs: refs } : {}),
              }, t("case.recorded"));
            }
          }}
        >
          <label>
            {t("case.finding")}<select
              value={disposition}
              onChange={(event) =>
                setDisposition(event.target.value)}
            >
              <option value="insufficient_evidence">
                {t("case.finding.insufficient_evidence")}
              </option>
              <option value="clear">{t("case.finding.clear")}</option>
              <option value="confirmed">
                {t("case.finding.confirmed")}
              </option>
            </select>
          </label>
          <fieldset>
            <legend>{t("case.evidence")}</legend>
            {!detail.events.length && <p>{t("case.noEvents")}</p>}
            {detail.events.map((event) => (
              <label className="check" key={event.id}>
                <input
                  type="checkbox"
                  checked={evidence.includes(event.id)}
                  onChange={(change) =>
                    setEvidence((current) =>
                      change.target.checked
                        ? [...current, event.id]
                        : current.filter((id) =>
                          id !== event.id
                        )
                    )}
                />
                {t("case.eventOption", { kind: code("event", event.kind), time: dateTime(event.occurred_at) })}
              </label>
            ))}
          </fieldset>
          {recordingsEnabled && <fieldset>
            <legend>{t("case.intervals")}</legend>
            {!recordingSelections.length && <p>{t("case.noIntervals")}</p>}
            {recordingSelections.map((entry) => {
              const key = referenceKey(entry.reference);
              return (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={recordingKeys.includes(key)}
                    onChange={(event) =>
                      setRecordingKeys((current) =>
                        event.target.checked
                          ? [...current, key]
                          : current.filter((value) => value !== key)
                      )}
                  />
                  {t("recording.entries", { source: code("source", entry.source), from: String(entry.reference.from_sequence), to: String(entry.reference.to_sequence) })}
                </label>
              );
            })}
            <p className="hint">{t("case.gapHint")}</p>
          </fieldset>}
          <label>
            {t("case.rationale")}<textarea
              className="prose-input"
              minLength={10}
              maxLength={10000}
              required
              rows={4}
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              required
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />{t("case.ack")}
          </label>
          <button disabled={busy || !acknowledged}>{t("case.submit")}</button>
        </form>
      )}
    </article>
  );
}
