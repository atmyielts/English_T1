import { useEffect, useRef, useState } from "react";
import { request } from "../../../packages/assessment-web/src/client";
import type { ReleasedBreakdown } from "../../../packages/assessment-web/src/analytics";
import { useI18n } from "../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "./i18n/index.ts";
import { errorText } from "../../../packages/assessment-web/src/i18n/errors.ts";
function SectionPoints(
  { section }: { section: ReleasedBreakdown["sections"][number] },
) {
  const t = useAppT();
  const [open, setOpen] = useState(false), [limit, setLimit] = useState(50);
  return (
    <li>
      <h4>
        {t("exam.breakdown.section", {
          title: section.title ||
            t("exam.breakdown.sectionFallback", { position: section.position }),
          total: section.total,
          max: section.max_score,
        })}
      </h4>
      {section.questions.length > 0 && (
        <details onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary>
            {t("exam.breakdown.questions", { position: section.position })}
          </summary>
          {open && (
            <>
              <ol>
                {section.questions.slice(0, limit).map((question) => (
                  <li key={question.position}>
                    {t("exam.breakdown.question", {
                      position: question.position,
                      score: question.score,
                      max: question.max_score,
                    })}
                  </li>
                ))}
              </ol>
              {section.questions.length > limit && (
                <button
                  className="quiet"
                  onClick={() =>
                    setLimit((value) => value + 50)}
                >
                  {t("exam.breakdown.more")}
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
  const t = useAppT(), { date } = useI18n();
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
        setError(errorText(cause, t, "exam.breakdown.failed"));
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
        {t(opened ? "exam.breakdown.close" : "exam.breakdown.view")}
      </button>
      {opened && (
        <section aria-label={t("exam.breakdown.title")}>
          <h3>{t("exam.breakdown.title")}</h3>
          {busy && <p role="status">{t("exam.breakdown.loading")}</p>}
          {error && <p role="alert" className="error">{error}</p>}
          {value && (
            <>
              <p>
                {t("exam.breakdown.generation", {
                  generation: value.generation,
                })}
              </p>
              {value.feedback_status === "totals_only" && (
                <p>{t("exam.breakdown.totalsOnly")}</p>
              )}
              {value.feedback_status === "pending" && (
                <p role="status">
                  {t("exam.breakdown.scheduled", {
                    date: value.available_at
                      ? date(value.available_at)
                      : t("exam.breakdown.later"),
                  })}
                </p>
              )}
              {value.feedback_status === "withheld" && (
                <p role="status">{t("exam.breakdown.withheld")}</p>
              )}
              {value.score_revision_id !== scoreRevision && (
                <p role="status">{t("exam.breakdown.newer")}</p>
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
              {t("exam.breakdown.refresh")}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
