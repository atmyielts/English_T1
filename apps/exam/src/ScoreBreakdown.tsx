import { useEffect, useRef, useState } from "react";
import { request } from "../../../packages/assessment-web/src/client";
import type { ReleasedBreakdown } from "../../../packages/assessment-web/src/analytics";
function SectionPoints(
  { section }: { section: ReleasedBreakdown["sections"][number] },
) {
  const [open, setOpen] = useState(false), [limit, setLimit] = useState(50);
  return (
    <li>
      <h4>
        {section.title || `Section ${section.position}`} · {section.total} /
        {" "}
        {section.max_score} points
      </h4>
      {section.questions.length > 0 && (
        <details onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary>Question points for section {section.position}</summary>
          {open && (
            <>
              <ol>
                {section.questions.slice(0, limit).map((question) => (
                  <li key={question.position}>
                    Question {question.position}: {question.score} /{" "}
                    {question.max_score} points
                  </li>
                ))}
              </ol>
              {section.questions.length > limit && (
                <button
                  className="quiet"
                  onClick={() =>
                    setLimit((value) => value + 50)}
                >
                  Show more question points
                </button>
              )}
            </>
          )}
        </details>
      )}
    </li>
  );
}
export function ScoreBreakdown(
  { tenant, actor, attempt, scoreRevision }: {
    tenant: string;
    actor: string;
    attempt: string;
    scoreRevision: string;
  },
) {
  const [opened, setOpened] = useState(false),
    [value, setValue] = useState<ReleasedBreakdown | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true), version = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      version.current++;
    };
  }, [tenant, actor, attempt, scoreRevision]);
  async function load() {
    const token = ++version.current;
    setOpened(true);
    setBusy(true);
    setError("");
    setValue(null);
    try {
      const detail = await request<ReleasedBreakdown>(
        `analytics/candidate/result?attempt_id=${attempt}`,
        tenant,
        undefined,
        undefined,
        undefined,
        actor,
      );
      if (alive.current && token === version.current) setValue(detail);
    } catch (cause) {
      if (alive.current && token === version.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The released result breakdown could not be loaded.",
        );
      }
    } finally {
      if (alive.current && token === version.current) setBusy(false);
    }
  }
  return (
    <div className="score-breakdown">
      <button
        className="quiet"
        disabled={busy}
        onClick={() =>
          opened
            ? (version.current++, setOpened(false), setValue(null))
            : void load()}
      >
        {opened ? "Close score breakdown" : "View score breakdown"}
      </button>
      {opened && (
        <section aria-label="Released score breakdown">
          <h3>Released score breakdown</h3>
          {busy && <p role="status">Checking your latest eligible release…</p>}
          {error && <p role="alert" className="error">{error}</p>}
          {value && (
            <>
              <p>
                Released grading generation{" "}
                {value.generation}. Feedback does not disclose prompts, answer
                keys, responses or marker identities.
              </p>
              {value.feedback_status === "totals_only" && (
                <p>
                  Your institution has shared your overall result only. Section
                  and question points are not included.
                </p>
              )}
              {value.feedback_status === "pending" && (
                <p role="status">
                  Additional feedback is scheduled for {value.available_at
                    ? new Date(value.available_at).toLocaleString()
                    : "a later time"}. Your overall released result is
                  unchanged.
                </p>
              )}
              {value.feedback_status === "withheld" && (
                <p role="status">
                  Your institution has withheld additional feedback. Your
                  overall result is unchanged. Contact your institution about
                  detail access.
                </p>
              )}
              {value.score_revision_id !== scoreRevision && (
                <p role="status">
                  A newer released result is available. Refresh your released
                  results list.
                </p>
              )}
              <ul className="records">
                {value.sections.map((section) => (
                  <SectionPoints key={section.position} section={section} />
                ))}
              </ul>
            </>
          )}
          {!busy && (
            <button
              className="quiet"
              onClick={() => void load()}
            >
              Refresh score breakdown
            </button>
          )}
        </section>
      )}
    </div>
  );
}
