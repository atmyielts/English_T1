import React, { useState } from "react";
import { SessionList } from "./SessionList";
import { SessionActions } from "./SessionActions";
import { useRecordingReferences } from "./use-recording-references";
import { PreparedRecordings } from "./PreparedRecordings";
import {
  evidenceConfigured,
  liveConfigured,
  type ScreenProps,
  type SessionDetail,
} from "./types";
import { useAppT, useCodeText, useDateTime } from "./i18n/index.ts";
import { RecordingPanel } from "./RecordingPanel";
import { LivePanel } from './LivePanel';
import { CasePanel } from "./CasePanel";
import { SnapshotGallery } from "./SnapshotGallery";
import { referenceKey } from "./RecordingCitationPicker";

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
  const t = useAppT(), code = useCodeText(), dateTime = useDateTime();
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
          <p className="eyebrow">{t("sessions.eyebrow")}</p>
          <h1>{t("nav.sessions")}</h1>
          <p>{t("sessions.lead")}</p>
        </div>
      </div>
      <p className="service-warning">{t("sessions.warning")}</p>
      <div className="split proctor-session-layout">
        <SessionList
          rows={rows}
          busy={busy}
          detailLoading={detailLoading}
          selectSession={selectSession}
        />
        <section aria-busy={detailLoading}>
          {detailLoading
            ? <p role="status">{t("sessions.loadingEvidence")}</p>
            : !detail
            ? (
              <>
                <h2>{t("sessions.evidence")}</h2>
                <p>{t("sessions.selectHint")}</p>
              </>
            )
            : (
              <>
                <div className="record-heading">
                  <h2>{t("sessions.evidence")}</h2>
                  <span className="state-badge">
                    {code("state", detail.session.state)}
                  </span>
                </div>
                <p>{t("sessions.candidate", { id: detail.session.candidate_id })}</p>
                <p className="hint">{t("sessions.eventHint")}</p>
                {canObserve && detail.session.state !== "completed" && (
                  <SessionActions
                    session={detail.session}
                    busy={busy}
                    command={command}
                  />
                )}
                {liveConfigured && canObserve && detail.session.policy_snapshot.mode === 'live' && detail.session.state !== 'completed' && <LivePanel key={`${tenantId}:${reviewerId}:${detail.session.id}`} tenant={tenantId} actor={reviewerId} session={detail.session.id} />}
                <h3 className="following-heading">{t("sessions.timeline")}</h3>
                {!detail.events.length && <p>{t("sessions.noEvents")}</p>}
                <ol className="evidence-timeline">
                  {detail.events.map((event) => (
                    <li key={event.id}>
                      <strong>{code("event", event.kind)}</strong>
                      <span>{t("sessions.eventSource", { source: code("source", event.source) })}</span>
                      <span>{t("sessions.reported", { time: dateTime(event.occurred_at) })}</span>
                      <span>{t("sessions.received", { time: dateTime(event.received_at) })}</span>
                    </li>
                  ))}
                </ol>
                {(canReview || canObserve) && (
                  <SnapshotGallery key={`snapshots:${detail.session.id}:${reviewerId}:${tenantId}`} tenant={tenantId} actor={reviewerId} session={detail.session.id} interval={detail.session.policy_snapshot.snapshot_interval_seconds ?? 0} />
                )}
                {evidenceConfigured && canReview && (
                  <RecordingPanel
                    key={`${detail.session.id}:${reviewerId}:${tenantId}`}
                    session={detail.session.id}
                    tenant={tenantId}
                    actor={reviewerId}
                    prepareReference={prepareReference}
                  />
                )}
                {canReview && recordingProblem && (
                  <p className="error" role="alert">{t(recordingProblem)}</p>
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
                <h3>{t("sessions.cases")}</h3>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void command("case.create", {
                      session_id: detail.session.id,
                      title: caseTitle,
                    }, t("sessions.caseOpened"));
                  }}
                >
                  <label>
                    {t("sessions.caseTitle")}<input
                      required
                      maxLength={200}
                      value={caseTitle}
                      onChange={(event) => setCaseTitle(event.target.value)}
                    />
                  </label>
                  <button disabled={busy}>{t("sessions.openCase")}</button>
                </form>
                <p className="hint">
                  {t("sessions.quorum", { count: detail.session.policy_snapshot.reviewer_quorum })}
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
                    recordingsEnabled={evidenceConfigured}
                  />
                ))}
              </>
            )}
        </section>
      </div>
    </>
  );
}
