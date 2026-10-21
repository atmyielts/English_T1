import { type FormEvent, useEffect, useRef, useState } from "react";
import { proctorRequest } from "../../../packages/assessment-web/src/client";
import type {
  WorkloadCursor,
  WorkloadPage,
  WorkloadSession,
  WorkloadStaff,
} from "../../../packages/assessment-core/src/proctor-workload";
import { LivePanel } from "./LivePanel";
import { dateTime, label } from "./types";
const sources = ["camera", "screen"] as const;
type StaffPage = { rows: WorkloadStaff[]; next: string | null };
type Review = {
  action: string;
  key: string;
  data: {
    user_id: string;
    role: string;
    reason: string;
    targets: { session_id: string; expected_revision: number }[];
  };
  names: string[];
  staff: string;
};
export function WorkloadScreen(
  { tenant, actor, manager, openSession }: {
    tenant: string;
    actor: string;
    manager: boolean;
    openSession: (id: string) => void;
  },
) {
  const [page, setPage] = useState<WorkloadPage | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [state, setState] = useState("all"),
    [assignment, setAssignment] = useState(manager ? "all" : "mine"),
    [candidate, setCandidate] = useState(""),
    [candidateFilter, setCandidateFilter] = useState(""),
    [after, setAfter] = useState<WorkloadCursor | null>(null),
    [history, setHistory] = useState<(WorkloadCursor | null)[]>([]),
    [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<string[]>([]),
    [watching, setWatching] = useState<string[]>([]),
    [staff, setStaff] = useState<StaffPage>({ rows: [], next: null }),
    [staffAfter, setStaffAfter] = useState<string | null>(null),
    [staffHistory, setStaffHistory] = useState<(string | null)[]>([]),
    [staffLoading, setStaffLoading] = useState(false),
    [staffError, setStaffError] = useState("");
  const [role, setRole] = useState("observer"),
    [user, setUser] = useState(""),
    [action, setAction] = useState("assignment.set"),
    [reason, setReason] = useState(""),
    [review, setReview] = useState<Review | null>(null),
    [saving, setSaving] = useState(false);
  const epoch = useRef(0),
    inFlight = useRef(false),
    reviewHeading = useRef<HTMLHeadingElement | null>(null),
    assignmentHeading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    let active = true, flight = false;
    const request = ++epoch.current;
    setSelected([]);
    setWatching([]);
    setPage(null);
    setLoading(true);
    setError("");
    const load = async () => {
      if (flight) return;
      flight = true;
      try {
        const query = new URLSearchParams({
          state,
          assignment,
          limit: "25",
          ...(candidateFilter ? { candidate_id: candidateFilter } : {}),
          ...(after ? { after: JSON.stringify(after) } : {}),
        });
        const result = await proctorRequest<WorkloadPage>(
          "workload/sessions?" + query,
          tenant,
          undefined,
          undefined,
          actor,
        );
        if (active && epoch.current === request) {
          setPage(result);
          setWatching((current) =>
            current.filter((id) =>
              result.rows.some((row) =>
                row.id === id && row.can_observe && row.state !== "completed"
              )
            )
          );
          setError("");
        }
      } catch (cause) {
        if (active) {
          setPage(null);
          setSelected([]);
          setWatching([]);
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not confirm current session access.",
          );
        }
      } finally {
        flight = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden && !inFlight.current) void load();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [tenant, actor, state, assignment, candidateFilter, after, refresh]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) setWatching([]);
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    let active = true;
    setUser("");
    setStaff({ rows: [], next: null });
    setStaffError("");
    if (!manager) return;
    setStaffLoading(true);
    void proctorRequest<StaffPage>(
      "workload/staff?" +
        new URLSearchParams({
          role,
          ...(staffAfter ? { after: staffAfter } : {}),
        }),
      tenant,
      undefined,
      undefined,
      actor,
    ).then((value) => {
      if (active) setStaff(value);
    }).catch((cause) => {
      if (active) {
        setStaffError(
          cause instanceof Error ? cause.message : "Could not load staff.",
        );
      }
    }).finally(() => {
      if (active) setStaffLoading(false);
    });
    return () => {
      active = false;
    };
  }, [tenant, actor, manager, role, staffAfter, refresh]);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  function reset() {
    setAfter(null);
    setHistory([]);
    setReview(null);
    setSelected([]);
    setWatching([]);
  }
  function prepare(event: FormEvent) {
    event.preventDefault();
    const person = staff.rows.find((row) => row.user_id === user),
      targets = page?.rows.filter((row) => selected.includes(row.id)) ?? [];
    if (!person || !targets.length) return;
    setReview({
      action,
      key: crypto.randomUUID(),
      data: {
        user_id: user,
        role,
        reason: reason.trim(),
        targets: targets.map((row) => ({
          session_id: row.id,
          expected_revision: row.assignment_revision,
        })),
      },
      names: targets.map((row) =>
        `${row.candidate_name} · ${row.window_title}`
      ),
      staff: person.name,
    });
    setError("");
    setNotice("");
  }
  async function save() {
    if (!review || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      await proctorRequest(
        "workload/commands",
        tenant,
        { action: review.action, data: review.data },
        review.key,
        actor,
      );
      setReview(null);
      setSelected([]);
      setWatching([]);
      setReason("");
      setNotice("The reviewed assignment change was saved.");
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not confirm this change. Retry the same reviewed request.",
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  const rows = page?.rows ?? [],
    selectedRows = rows.filter((row) => selected.includes(row.id));
  const effectiveManager = manager && page?.manager === true;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Institution monitoring</p>
          <h1>Monitoring board</h1>
          <p>
            Review session coverage, distribute work and open only the live
            feeds you need.
          </p>
        </div>
      </div>
      <section aria-label="Session filters">
        <form
          className="workload-filters"
          onSubmit={(event) => {
            event.preventDefault();
            reset();
            setCandidateFilter(candidate.trim());
          }}
        >
          <label>
            Session state<select
              disabled={saving || !!review}
              value={state}
              onChange={(event) => {
                reset();
                setState(event.target.value);
              }}
            >
              {["all", "preparing", "active", "paused", "completed"].map(
                (value) => (
                  <option key={value} value={value}>
                    {value === "all" ? "All states" : label(value)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Coverage<select
              disabled={saving || !!review}
              value={assignment}
              onChange={(event) => {
                reset();
                setAssignment(event.target.value);
              }}
            >
              <option value="all">All authorized sessions</option>
              <option value="mine">Assigned to me</option>
              {effectiveManager && (
                <option value="unassigned">No eligible observer</option>
              )}
            </select>
          </label>
          <label>
            Candidate reference<input
              disabled={saving || !!review}
              value={candidate}
              onChange={(event) => setCandidate(event.target.value)}
              placeholder="Optional account reference"
            />
          </label>
          <button disabled={saving || !!review}>Apply filters</button>
          <button
            type="button"
            className="quiet"
            disabled={saving || !!review && !!page}
            onClick={() => {
              setRefresh((value) => value + 1);
            }}
          >
            Refresh board
          </button>
        </form>
        <p className="hint">
          Pages contain up to 25 sessions. A connection interruption is not a
          finding of misconduct. Refresh starts a new view; session states and
          assignments may change while paging.
        </p>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
          {review &&
            " Your reviewed request is retained in this tab. Refresh to confirm access if needed, then retry the same review to recover its receipt. Cancelling a review does not undo a saved change."}
        </p>
      )}
      {notice && <p className="notice" role="status">{notice}</p>}
      {effectiveManager && !!selectedRows.length && !review && (
        <div className="workload-selection">
          <span role="status">{selectedRows.length} sessions selected</span>
          <button
            className="quiet"
            onClick={() => assignmentHeading.current?.focus()}
          >
            Distribute selected sessions
          </button>
        </div>
      )}
      {loading
        ? <p role="status">Loading authorized sessions…</p>
        : (
          <section className="workload-sessions" aria-label="Session coverage">
            <div className="record-heading">
              <h2>Session coverage</h2>
              <span className="state-badge">{rows.length} on this page</span>
            </div>
            {!rows.length && <p>No authorized sessions match these filters.</p>}
            <ul className="records">
              {rows.map((row) => (
                <li key={row.id} className="workload-row">
                  <div>
                    <div className="record-heading">
                      <strong>{row.candidate_name}</strong>
                      <span className="state-badge">{label(row.state)}</span>
                    </div>
                    <p className="hint">
                      {row.window_title} · {label(row.monitoring_mode)}
                    </p>
                    <p className="hint">
                      Observers: {row.observers.length
                        ? row.observers.map((person) => person.name).join(", ")
                        : "No eligible observer"}
                      {row.loss_since
                        ? " · Required source interrupted since " +
                          dateTime(row.loss_since)
                        : ""}
                    </p>
                    <p className="hint">
                      Candidate heartbeat: {dateTime(row.last_heartbeat_at)}
                    </p>
                  </div>
                  <div className="action-row">
                    {effectiveManager && (
                      <label className="check">
                        <input
                          type="checkbox"
                          aria-label={"Select " + row.candidate_name + " " +
                            row.id}
                          checked={selected.includes(row.id)}
                          disabled={saving || !!review}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, row.id]
                                : current.filter((id) => id !== row.id)
                            )}
                        />Select
                      </label>
                    )}
                    <button
                      className="quiet"
                      disabled={saving || !!review}
                      onClick={() => openSession(row.id)}
                    >
                      Open session
                    </button>
                    {row.monitoring_mode === "live" &&
                      row.state !== "completed" && row.can_observe && (
                      <button
                        className="quiet"
                        disabled={saving || !!review ||
                          !watching.includes(row.id) && watching.length >= 4}
                        aria-pressed={watching.includes(row.id)}
                        onClick={() =>
                          setWatching((current) =>
                            current.includes(row.id)
                              ? current.filter((id) => id !== row.id)
                              : current.length < 4
                              ? [...current, row.id]
                              : current
                          )}
                      >
                        {watching.includes(row.id)
                          ? "Remove from live board"
                          : "Add to live board"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="action-row">
              <button
                className="quiet"
                disabled={!history.length || saving || !!review}
                onClick={() => {
                  setAfter(history.at(-1) ?? null);
                  setHistory((current) => current.slice(0, -1));
                }}
              >
                Previous sessions
              </button>
              <button
                className="quiet"
                disabled={!page?.next || saving || !!review}
                onClick={() => {
                  setHistory((current) => [...current, after]);
                  setAfter(page!.next);
                }}
              >
                Next sessions
              </button>
            </div>
            <p className="hint">
              Last confirmed:{" "}
              {dateTime(page?.server_time)}. Only current-page candidates can
              remain on the live board.
            </p>
          </section>
        )}
      {effectiveManager && (
        <section
          className="workload-assignment"
          aria-label="Distribute proctor work"
        >
          <h2 ref={assignmentHeading} tabIndex={-1}>Distribute proctor work</h2>
          <p>
            {selectedRows.length}{" "}
            sessions selected. Assignment changes do not change exam time,
            responses or grades.
          </p>
          <form onSubmit={prepare}>
            <div className="form-pair">
              <label>
                Change<select
                  disabled={saving || !!review}
                  value={action}
                  onChange={(event) => {
                    setAction(event.target.value);
                    setUser("");
                  }}
                >
                  <option value="assignment.set">Assign staff member</option>
                  <option value="assignment.remove">
                    Remove staff assignment
                  </option>
                </select>
              </label>
              <label>
                Session role<select
                  disabled={saving || !!review}
                  value={role}
                  onChange={(event) => {
                    setRole(event.target.value);
                    setStaffAfter(null);
                    setStaffHistory([]);
                  }}
                >
                  <option value="observer">Observer</option>
                  <option value="reviewer">Reviewer</option>
                </select>
              </label>
            </div>
            <label>
              Staff member<select
                required
                disabled={staffLoading || saving || !!review}
                value={user}
                onChange={(event) => setUser(event.target.value)}
              >
                <option value="">Choose a staff member</option>
                {staff.rows.map((person) => (
                  <option
                    key={person.user_id}
                    value={person.user_id}
                    disabled={action === "assignment.set" && !person.eligible}
                  >
                    {person.name} · {person.active_assignments} active {role}
                    {" "}
                    assignments{person.eligible
                      ? ""
                      : " · no current capability"}
                  </option>
                ))}
              </select>
            </label>
            {staffLoading && <p role="status">Loading staff workloads…</p>}
            {staffError && <p role="alert" className="error">{staffError}</p>}
            <div className="action-row">
              <button
                type="button"
                className="quiet"
                disabled={!staffHistory.length || saving || !!review}
                onClick={() => {
                  setStaffAfter(staffHistory.at(-1) ?? null);
                  setStaffHistory((current) => current.slice(0, -1));
                }}
              >
                Previous staff
              </button>
              <button
                type="button"
                className="quiet"
                disabled={!staff.next || saving || !!review}
                onClick={() => {
                  setStaffHistory((current) => [...current, staffAfter]);
                  setStaffAfter(staff.next);
                }}
              >
                Next staff
              </button>
            </div>
            <label>
              Reason for assignment change<textarea
                className="prose-input"
                required
                minLength={10}
                maxLength={2000}
                disabled={saving || !!review}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <button
              disabled={!selectedRows.length || !user || saving || !!review}
            >
              Review assignment change
            </button>
          </form>
          {review && (
            <div
              className="workload-review"
              role="region"
              aria-label="Reviewed assignment change"
            >
              <h3 tabIndex={-1} ref={reviewHeading}>
                Confirm assignment change
              </h3>
              <p>
                {review.action === "assignment.set" ? "Assign" : "Remove"}{" "}
                {review.staff} as {review.data.role} for:
              </p>
              <ul>
                {review.names.map((name, index) => (
                  <li key={review.data.targets[index].session_id}>{name}</li>
                ))}
              </ul>
              <p>{review.data.reason}</p>
              <p className="hint">
                This request uses the assignment revisions you reviewed. If
                another supervisor changed them, refresh and review again.
                Retrying this request recovers its original receipt.
              </p>
              <div className="action-row">
                <button disabled={saving} onClick={() => void save()}>
                  {saving
                    ? "Saving reviewed change…"
                    : "Confirm reviewed change"}
                </button>
                <button
                  className="quiet"
                  disabled={saving}
                  onClick={() => {
                    setReview(null);
                    setRefresh((value) => value + 1);
                  }}
                >
                  Cancel review & refresh
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      {!!watching.length && (
        <section aria-label="Live candidate board" className="workload-live">
          <div className="record-heading">
            <h2>Live candidate board · {watching.length}/4</h2>
            <button
              className="quiet"
              onClick={() =>
                setWatching([])}
            >
              Close live board
            </button>
          </div>
          <p className="hint">
            At most four candidates and one camera or screen feed per candidate.
            Audio is available in the individual session. Changing pages, hiding
            this tab or losing access closes these feeds.
          </p>
          <div className="workload-live-grid">
            {watching.map((id) => {
              const row = rows.find((row) =>
                row.id === id
              );
              return row && row.can_observe
                ? (
                  <article
                    key={row.id + ":" + row.assignment_revision}
                    aria-label={"Live candidate " + row.candidate_name}
                  >
                    <h3>{row.candidate_name}</h3>
                    <p className="hint">{row.window_title}</p>
                    <LivePanel
                      tenant={tenant}
                      actor={actor}
                      session={id}
                      maxFeeds={1}
                      allowedSources={sources}
                    />
                  </article>
                )
                : null;
            })}
          </div>
        </section>
      )}
    </>
  );
}
