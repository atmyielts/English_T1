import { useEffect, useRef, useState } from "react";
import { request } from "../../../../packages/assessment-web/src/client";
import {
  type Cohort,
  cohortProblem,
  type CohortSitting,
  type RosterPreview as Preview,
} from "../../../../packages/assessment-web/src/cohorts";
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
            "The roster or sitting changed while paging. Review it again.",
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
      <h2>Register this cohort for a sitting</h2>
      <p>
        Review the complete roster summary. Existing registrations and responses
        remain unchanged. Extra-time differences are reported as conflicts, not
        silently replaced.
      </p>
      <label>
        Exam sitting<select
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
          <option value="">Choose a sitting</option>
          {sittings.map((row) => (
            <option key={row.id} value={row.id}>
              {row.title} · {new Date(row.closes_at).toLocaleDateString()}
            </option>
          ))}
        </select>
      </label>
      <button
        className="quiet"
        disabled={disabled || busy || !sitting || group.state !== "active"}
        onClick={() => void load()}
      >
        Review cohort registration
      </button>
      {busy && <p role="status">Checking the current roster and sitting…</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {preview && (
        <>
          <h3>{preview.cohort_title} → {preview.sitting.title}</h3>
          <p>
            {preview.total} roster entries · {preview.eligible}{" "}
            currently eligible · {preview.existing} existing registrations ·
            {" "}
            {preview.conflicts} extra-time conflicts
          </p>
          <p>
            Opens {new Date(preview.sitting.opens_at).toLocaleString()} · Closes
            {" "}
            {new Date(preview.sitting.closes_at).toLocaleString()}
          </p>
          <ul className="records">
            {preview.members.map((member) => (
              <li key={member.user_id}>
                <strong>{member.name}</strong>
                <span>
                  {member.extra_seconds} extra seconds · {!member.eligible
                    ? "Institution membership inactive"
                    : member.registration_id
                    ? (member.registered_extra_seconds === member.extra_seconds
                      ? "Already registered with matching extra time"
                      : "Existing registration has conflicting extra time")
                    : "New registration planned"}
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
              Load more preview entries
            </button>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
              disabled={disabled || busy}
            />I reviewed this cohort, sitting and summary. Only the reviewed
            roster will be processed, with current membership checks and
            explicit per-candidate outcomes.
          </label>
          <button
            disabled={disabled || busy || !ack || !preview.total ||
              preview.cohort_state !== "active" ||
              Date.parse(preview.sitting.closes_at) <= Date.now()}
            onClick={() => void create()}
          >
            Create cohort registration job
          </button>
        </>
      )}
    </section>
  );
}
