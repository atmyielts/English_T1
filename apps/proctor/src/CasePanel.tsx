import React, { useState } from "react";
import { FindingRecordingCitation } from "./FindingRecordingCitation";
import { type Command, dateTime, label, type SessionDetail } from "./types";
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
}: {
  detail: SessionDetail;
  caseId: string;
  busy: boolean;
  canReview: boolean;
  command: Command;
  reviewerId: string;
  recordingSelections: RecordingSelection[];
}) {
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
        <span className="state-badge">{label(reviewCase.state)}</span>
      </div>
      {reviewCase.disposition && (
        <p>Disposition: {label(reviewCase.disposition)}</p>
      )}
      <ul className="records">
        {findings.map((finding) => (
          <li key={finding.id}>
            <strong>{label(finding.disposition)}</strong>
            <span>Reviewer: {finding.reviewer_id}</span>
            <p>{finding.rationale}</p>
            <span>
              {finding.evidence_event_ids.length}{" "}
              evidence event{finding.evidence_event_ids.length === 1 ? "" : "s"}
              {" "}
              cited
            </span>
            {(detail.recording_citations ?? []).filter((cite) =>
              cite.finding_id === finding.id
            ).map((cite) => (
              <FindingRecordingCitation key={cite.id} cite={cite} />
            ))}
          </li>
        ))}
      </ul>
      {!findings.length && <p>No human findings yet.</p>}
      {reviewCase.state === "reviewing" && findings.length > 1 &&
        new Set(findings.map((row) => row.disposition)).size > 1 && (
        <p className="service-warning">
          Reviewers disagree. The case remains open; a senior adjudication
          workflow is still required.
        </p>
      )}
      {alreadyReviewed && reviewCase.state !== "resolved" && (
        <p>
          You have recorded your finding. Another independent reviewer must
          complete the review.
        </p>
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
              }, "Human review finding recorded.");
            }
          }}
        >
          <label>
            Human finding<select
              value={disposition}
              onChange={(event) =>
                setDisposition(event.target.value)}
            >
              <option value="insufficient_evidence">
                Insufficient evidence
              </option>
              <option value="clear">No breach found</option>
              <option value="confirmed">
                Breach confirmed by human review
              </option>
            </select>
          </label>
          <fieldset>
            <legend>Evidence reviewed</legend>
            {!detail.events.length && <p>No event evidence is available.</p>}
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
                {label(event.kind)} · {dateTime(event.occurred_at)}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Recording intervals reviewed</legend>
            {!recordingSelections.length && (
              <p>
                Inspect a recording timeline and prepare an interval above to
                cite it here.
              </p>
            )}
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
                  {label(entry.source)} · entries{" "}
                  {entry.reference.from_sequence}–{entry.reference.to_sequence}
                </label>
              );
            })}
            <p className="hint">
              A gap citation preserves missing footage. It is not proof of
              misconduct.
            </p>
          </fieldset>
          <label>
            Finding rationale<textarea
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
            />I personally reviewed this evidence. My finding will be permanent.
          </label>
          <button disabled={busy || !acknowledged}>Record human finding</button>
        </form>
      )}
    </article>
  );
}
