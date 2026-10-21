import { useEffect, useRef, useState } from "react";
import { request } from "../../../../packages/assessment-web/src/client";
import {
  feedbackDate,
  feedbackLabel,
  type FeedbackPreview,
} from "../../../../packages/assessment-web/src/feedback";
export function FeedbackReleaseReview(
  { tenant, actor, runId, locked, submit }: {
    tenant: string;
    actor: string;
    runId: string;
    locked: boolean;
    submit: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  },
) {
  const [preview, setPreview] = useState<FeedbackPreview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [releaseAt, setReleaseAt] = useState("");
  const alive = useRef(false), epoch = useRef(0);
  async function load() {
    const token = ++epoch.current;
    setPreview(null);
    setConfirmed(false);
    setBusy(true);
    setError("");
    try {
      const value = await request<FeedbackPreview>(
        "feedback/preview/" + runId,
        tenant,
        undefined,
        undefined,
        undefined,
        actor,
      );
      if (alive.current && token === epoch.current) setPreview(value);
    } catch (cause) {
      if (alive.current && token === epoch.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The release policy could not be checked.",
        );
      }
    } finally {
      if (alive.current && token === epoch.current) setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      epoch.current++;
    };
  }, [tenant, actor, runId]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!preview || !confirmed || locked || busy) return;
        void submit("grade.release", {
          run_id: runId,
          feedback_review_hash: preview.review_hash,
          ...(releaseAt
            ? { release_at: new Date(releaseAt).toISOString() }
            : {}),
        }).then((ok) => {
          if (alive.current && !ok) {
            setConfirmed(false);
            setPreview(null);
          }
        });
      }}
    >
      <h3>Release approved results</h3>
      {busy && (
        <p role="status">Checking the current approved feedback policy…</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {preview && (
        <p className="notice">
          Candidate receives: {feedbackLabel(preview.level)}.{" "}
          {preview.level !== "totals" &&
            `Additional details: ${
              feedbackDate(preview.available_after)
            } (never before the result release).`} {preview.version
            ? `Independently approved policy version ${preview.version}.`
            : "Conservative default; no section or question points."}
        </p>
      )}
      <button
        type="button"
        className="quiet"
        disabled={locked || busy}
        onClick={() => void load()}
      >
        Refresh release feedback policy
      </button>
      <label>
        Release time (your local time; leave empty for now)<input
          type="datetime-local"
          value={releaseAt}
          onChange={(event) => {
            setReleaseAt(event.target.value);
            setConfirmed(false);
          }}
          disabled={locked || busy}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={locked || busy || !preview}
        />I reviewed the grade, candidate feedback level and timing and
        authorize this release.
      </label>
      <button disabled={locked || busy || !preview || !confirmed}>
        Release approved results
      </button>
    </form>
  );
}
