import React, { useEffect, useRef, useState } from "react";
import { proctorRequest } from "../../../packages/assessment-web/src/client";
import {
  type ChainPosition,
  emptyChain,
  verifyRecordingPage,
} from "../../../packages/proctor-web/src/recording-pages";
import {
  type RecordingPage,
  recordingPage,
  type RecordingRow,
  type RecordingSegment,
} from "./recording-client";
import { RecordingTimeline } from "./RecordingTimeline";
import { RecordingCatalog } from "./RecordingCatalog";
import type { RecordingSelection } from "./RecordingCitationPicker";
import { label } from "./types";
export function RecordingPanel(
  { session, tenant, actor, prepareReference }: {
    session: string;
    tenant: string;
    actor: string;
    prepareReference: (value: RecordingSelection) => void;
  },
) {
  const [rows, setRows] = useState<RecordingRow[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<RecordingRow | null>(null),
    [entries, setEntries] = useState<RecordingSegment[]>([]),
    [next, setNext] = useState<number | null>(null),
    [pageLoading, setPageLoading] = useState(false),
    generation = useRef(0),
    position = useRef<ChainPosition>(emptyChain());
  const scope = useRef("");
  scope.current = `${actor}:${tenant}:${session}`;
  async function catalog(after: string | null = null) {
    const expected = scope.current;
    setLoading(true);
    setError("");
    try {
      const data = await proctorRequest<
        { items: RecordingRow[]; next_cursor: string | null }
      >(
        `recordings/sessions/${session}${
          after ? "?after=" + encodeURIComponent(after) : ""
        }`,
        tenant,
        undefined,
        undefined,
        actor,
      );
      if (scope.current !== expected) return;
      setRows((current) => after ? [...current, ...data.items] : data.items);
      setCursor(data.next_cursor);
      if (
        selected && !after && !data.items.some((row) => row.id === selected.id)
      ) {
        setSelected(null);
        setEntries([]);
      }
    } catch (cause) {
      if (scope.current === expected) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load recorded evidence.",
        );
        setSelected(null);
      }
    } finally {
      if (scope.current === expected) setLoading(false);
    }
  }
  useEffect(() => {
    setRows([]);
    setSelected(null);
    setEntries([]);
    position.current = emptyChain();
    generation.current++;
    void catalog();
    return () => {
      scope.current = "";
      generation.current++;
    };
  }, [session, tenant, actor]);
  async function timeline(row: RecordingRow, after = 0) {
    const expected = scope.current, ticket = ++generation.current;
    setPageLoading(true);
    setError("");
    if (!after) {
      setSelected(null);
      setEntries([]);
      position.current = emptyChain();
    }
    try {
      const page: RecordingPage = await recordingPage(
          row.id,
          after,
          tenant,
          actor,
        ),
        verified = await verifyRecordingPage(
          page,
          row.id,
          after ? position.current : emptyChain(),
        );
      if (scope.current !== expected || ticket !== generation.current) return;
      position.current = verified;
      setSelected(page.recording);
      setEntries((current) =>
        after ? [...current, ...page.segments] : page.segments
      );
      setNext(page.next_cursor);
    } catch (cause) {
      if (scope.current === expected && ticket === generation.current) {
        setSelected(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not verify the recording timeline.",
        );
      }
    } finally {
      if (scope.current === expected && ticket === generation.current) {
        setPageLoading(false);
      }
    }
  }
  return (
    <section className="recorded-evidence" aria-busy={loading || pageLoading}>
      <div className="record-heading">
        <h3>Recorded evidence</h3>
        <button
          className="quiet"
          disabled={loading || pageLoading}
          onClick={() =>
            void catalog()}
        >
          Refresh recordings
        </button>
      </div>
      <p className="hint">
        Only currently authorized assigned reviewers can retrieve recorded
        bytes. A sealed manifest can still contain gaps.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {loading && !rows.length
        ? <p role="status">Loading authorized recordings…</p>
        : !rows.length && !error
        ? (
          <p>
            No recording manifests have been received for this session. Browser
            events are not a substitute for required footage.
          </p>
        )
        : null}
      <RecordingCatalog
        rows={rows}
        pageLoading={pageLoading}
        timeline={timeline}
      />

      {cursor && (
        <button
          className="quiet"
          disabled={loading}
          onClick={() => void catalog(cursor)}
        >
          Load more recording manifests
        </button>
      )}
      {pageLoading && !selected && (
        <p role="status">Verifying the immutable recording timeline…</p>
      )}
      {selected && (
        <RecordingTimeline
          selected={selected}
          entries={entries}
          next={next}
          pageLoading={pageLoading}
          tenant={tenant}
          actor={actor}
          timeline={timeline}
          prepareReference={prepareReference}
        />
      )}
    </section>
  );
}
