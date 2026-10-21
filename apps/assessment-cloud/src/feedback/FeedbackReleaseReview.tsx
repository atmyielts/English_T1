import { useEffect, useRef, useState } from "react";
import { request } from "../../../../packages/assessment-web/src/client";
import {
  feedbackDate,
  feedbackLabel,
  type FeedbackPreview,
} from "../../../../packages/assessment-web/src/feedback";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT, useErrorText } from "../i18n/index.ts";
export function FeedbackReleaseReview(
  { tenant, actor, runId, locked, submit }: {
    tenant: string;
    actor: string;
    runId: string;
    locked: boolean;
    submit: (action: string, data: Record<string, unknown>) => Promise<boolean>;
  },
) {
  const t = useAppT(), { date: formatDate } = useI18n(), problem = useErrorText();
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
        setError(problem(cause, "release.checkFailed"));
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
      <h3>{t("release.title")}</h3>
      {busy && (
        <p role="status">{t("release.checking")}</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {preview && (
        <p className="notice">
          {t("release.receives", { level: feedbackLabel(preview.level, t) })}{" "}
          {preview.level !== "totals" &&
            t("release.details", { date:
              feedbackDate(preview.available_after, t, (value) => formatDate(value))
            })} {preview.version
            ? t("release.approvedVersion", { version: String(preview.version) })
            : t("release.default")}
        </p>
      )}
      <button
        type="button"
        className="quiet"
        disabled={locked || busy}
        onClick={() => void load()}
      >
        {t("release.refresh")}
      </button>
      <label>
        {t("release.time")}<input
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
        />{t("release.ack")}
      </label>
      <button disabled={locked || busy || !preview || !confirmed}>
        {t("release.submit")}
      </button>
    </form>
  );
}
