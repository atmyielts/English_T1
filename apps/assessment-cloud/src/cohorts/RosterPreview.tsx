import { useEffect, useRef, useState } from "react";
import { request } from "../../../../packages/assessment-web/src/client";
import {
  type Cohort,
  cohortProblem as cohortProblemText,
  type CohortSitting,
  type RosterPreview as Preview,
} from "../../../../packages/assessment-web/src/cohorts";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT } from "../i18n/index.ts";
export function RosterPreview({
  group,
  sittings,
  tenant,
  actor,
  disabled,
  send,
  openJob,
}: {
  group: Cohort;
  sittings: CohortSitting[];
  tenant: string;
  actor: string;
  disabled: boolean;
  send: (
    action: string,
    data: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
  openJob: (id: string) => Promise<void>;
}) {
  const t = useAppT(), { date } = useI18n(),
    cohortProblem = (cause: unknown) => cohortProblemText(cause, t);
  const [sitting, setSitting] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ack, setAck] = useState(false),
    [more, setMore] = useState(false),
    version = useRef(0);
  useEffect(() => () => {
    version.current++;
  }, []);
  async function load(after?: string) {
    const current = ++version.current;
    setBusy(true);
    setError("");
    setAck(false);
    try {
      const next = await request<Preview>(
        `cohorts/preview?cohort_id=${group.id}&window_id=${sitting}&limit=50${
          after ? `&after=${after}` : ""
        }`,
        tenant,
        undefined,
        undefined,
        undefined,
        actor,
      );
      if (current === version.current) {
        if (after && preview?.review_hash !== next.review_hash) {
          setPreview(null);
          throw new Error(
            t("preview.changed"),
          );
        }
        setPreview((previous) =>
          after && previous
            ? { ...next, members: [...previous.members, ...next.members] }
            : next
        );
        setMore(next.members.length === 50);
      }
    } catch (cause) {
      if (current === version.current) {
        setPreview(null);
        setError(cohortProblem(cause));
      }
    } finally {
      if (current === version.current) setBusy(false);
    }
  }
  async function create() {
    if (!preview || !ack) return;
    const result = await send("job.create", {
      cohort_id: group.id,
      window_id: sitting,
      review_hash: preview.review_hash,
    });
    if (result) {
      setPreview(null);
      setAck(false);
      await openJob(String(result.id));
    }
  }
  return (
    <section>
      <h2>{t("preview.title")}</h2>
      <p>
        {t("preview.lead")}
      </p>
      <label>
        {t("preview.sitting")}<select
          value={sitting}
          onChange={(event) => {
            version.current++;
            setSitting(event.target.value);
            setPreview(null);
            setAck(false);
            setBusy(false);
          }}
          disabled={disabled || busy}
        >
          <option value="">{t("windows.chooseSitting")}</option>
          {sittings.map((row) => (
            <option key={row.id} value={row.id}>
              {t("preview.sittingOption", { title: row.title, date: date(row.closes_at, { dateStyle: "short" }) })}
            </option>
          ))}
        </select>
      </label>
      <button
        className="quiet"
        disabled={disabled || busy || !sitting || group.state !== "active"}
        onClick={() => void load()}
      >
        {t("preview.review")}
      </button>
      {busy && <p role="status">{t("preview.checking")}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {preview && (
        <>
          <h3>{t("preview.heading", { cohort: preview.cohort_title, sitting: preview.sitting.title })}</h3>
          <p>
            {t("preview.summary", { total: String(preview.total), eligible: String(preview.eligible), existing: String(preview.existing), conflicts: String(preview.conflicts) })}
          </p>
          <p>
            {t("preview.window", { opens: date(preview.sitting.opens_at), closes: date(preview.sitting.closes_at) })}
          </p>
          <ul className="records">
            {preview.members.map((member) => (
              <li key={member.user_id}>
                <strong>{member.name}</strong>
                <span>
                  {t("preview.member", { count: member.extra_seconds, seconds: String(member.extra_seconds), status: !member.eligible
                    ? t("preview.inactive")
                    : member.registration_id
                    ? (member.registered_extra_seconds === member.extra_seconds
                      ? t("preview.matching")
                      : t("preview.conflict"))
                    : t("preview.planned") })}
                </span>
              </li>
            ))}
          </ul>
          {more && (
            <button
              className="quiet"
              disabled={busy || disabled}
              onClick={() => void load(preview.members.at(-1)?.user_id)}
            >
              {t("preview.more")}
            </button>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
              disabled={disabled || busy}
            />{t("preview.ack")}
          </label>
          <button
            disabled={disabled || busy || !ack || !preview.total ||
              preview.cohort_state !== "active" ||
              Date.parse(preview.sitting.closes_at) <= Date.now()}
            onClick={() => void create()}
          >
            {t("preview.create")}
          </button>
        </>
      )}
    </section>
  );
}
