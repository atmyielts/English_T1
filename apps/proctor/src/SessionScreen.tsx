import React, { useState } from "react";
import { SessionList } from "./SessionList";
import { SessionActions } from "./SessionActions";
import { useRecordingReferences } from "./use-recording-references";
import { PreparedRecordings } from "./PreparedRecordings";
import {
  type Command,
  dateTime,
  identifier,
  label,
  type ScreenProps,
  type SessionDetail,
} from "./types";
import { RecordingPanel } from "./RecordingPanel";
import { LivePanel } from './LivePanel';
import { CasePanel } from "./CasePanel";
import {
  type RecordingSelection,
  referenceKey,
} from "./RecordingCitationPicker";

export function SessionScreen({
  rows,
  busy,
  command,
  detail,
  selectSession,
  canObserve,
  canReview,
  detailLoading,
  reviewerId,
  tenantId,
}: ScreenProps & {
  detail: SessionDetail | null;
  selectSession: (id: string) => void;
  canObserve: boolean;
  canReview: boolean;
  detailLoading: boolean;
  reviewerId: string;
  tenantId: string;
}) {
  const [caseTitle, setCaseTitle] = useState("");
  const {
    recordingSelections,
    setRecordingSelections,
    recordingProblem,
    prepareReference,
  } = useRecordingReferences(canReview);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Institution monitoring</p>
          <h1>Exam sessions</h1>
          <p>
            Observe authorized sessions and review browser reports with their
            source intact.
          </p>
        </div>
      </div>
      <p className="service-warning">
        Recorded evidence can be inspected by assigned reviewers when the
        private recording service is enabled. Live feeds are available only
        for enabled institution policies and assigned observers. Browser events
        and connection interruptions are not findings of misconduct.
      </p>
      <div className="split proctor-session-layout">
        <SessionList
          rows={rows}
          busy={busy}
          detailLoading={detailLoading}
          selectSession={selectSession}
        />
        <section aria-busy={detailLoading}>
          {detailLoading
            ? <p role="status">Loading session evidence…</p>
            : !detail
            ? (
              <>
                <h2>Session evidence</h2>
                <p>
                  Select a session to inspect its timeline, controls and review
                  cases.
                </p>
              </>
            )
            : (
              <>
                <div className="record-heading">
                  <h2>Session evidence</h2>
                  <span className="state-badge">
                    {label(detail.session.state)}
                  </span>
                </div>
                <p>Candidate: {detail.session.candidate_id}</p>
                <p className="hint">
                  A browser event describes a reported interaction. It is not a
                  finding of misconduct.
                </p>
                {canObserve && detail.session.state !== "completed" && (
                  <SessionActions
                    session={detail.session}
                    busy={busy}
                    command={command}
                  />
                )}
                {canObserve && detail.session.policy_snapshot.mode === 'live' && detail.session.state !== 'completed' && <LivePanel key={`${tenantId}:${reviewerId}:${detail.session.id}`} tenant={tenantId} actor={reviewerId} session={detail.session.id} />}
                <h3 className="following-heading">Browser event timeline</h3>
                {!detail.events.length && (
                  <p>No browser events have been received for this session.</p>
                )}
                <ol className="evidence-timeline">
                  {detail.events.map((event) => (
                    <li key={event.id}>
                      <strong>{label(event.kind)}</strong>
                      <span>Source: {label(event.source)}</span>
                      <span>Reported: {dateTime(event.occurred_at)}</span>
                      <span>Received: {dateTime(event.received_at)}</span>
                    </li>
                  ))}
                </ol>
                {canReview && (
                  <RecordingPanel
                    key={`${detail.session.id}:${reviewerId}:${tenantId}`}
                    session={detail.session.id}
                    tenant={tenantId}
                    actor={reviewerId}
                    prepareReference={prepareReference}
                  />
                )}
                {canReview && recordingProblem && (
                  <p className="error" role="alert">{recordingProblem}</p>
                )}
                {canReview && recordingSelections.length > 0 && (
                  <PreparedRecordings
                    selections={recordingSelections}
                    remove={(key) =>
                      setRecordingSelections((current) =>
                        current.filter((value) =>
                          referenceKey(value.reference) !== key
                        )
                      )}
                  />
                )}
                <h3>Review cases</h3>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void command("case.create", {
                      session_id: detail.session.id,
                      title: caseTitle,
                    }, "Review case opened.");
                  }}
                >
                  <label>
                    Case title<input
                      required
                      maxLength={200}
                      value={caseTitle}
                      onChange={(event) => setCaseTitle(event.target.value)}
                    />
                  </label>
                  <button disabled={busy}>Open review case</button>
                </form>
                <p className="hint">
                  This policy requires{" "}
                  {detail.session.policy_snapshot.reviewer_quorum}{" "}
                  agreeing human
                  reviewer{detail.session.policy_snapshot.reviewer_quorum === 1
                    ? ""
                    : "s"}. Integrity findings do not change academic grades.
                </p>
                {detail.cases.map((reviewCase) => (
                  <CasePanel
                    key={reviewCase.id}
                    detail={detail}
                    caseId={reviewCase.id}
                    busy={busy}
                    canReview={canReview}
                    command={command}
                    reviewerId={reviewerId}
                    recordingSelections={recordingSelections}
                  />
                ))}
              </>
            )}
        </section>
      </div>
    </>
  );
}
