import { type FormEvent, useEffect, useRef, useState } from "react";
import { proctorRequest } from "../../../packages/assessment-web/src/client";
import type {
  WorkloadCursor,
  WorkloadPage,
  WorkloadSession,
  WorkloadStaff,
} from "../../../packages/assessment-core/src/proctor-workload";
import { LivePanel } from "./LivePanel";
import { useAppT, useCodeText, useDateTime, useErrorText } from "./i18n/index.ts";
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
  const t = useAppT(), code = useCodeText(), dateTime = useDateTime(), problem = useErrorText();
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
          setError(problem(cause, "workload.loadFailed"));
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
        setStaffError(problem(cause, "workload.staffFailed"));
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
      setNotice(t("workload.saved"));
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(problem(cause, "workload.saveFailed"));
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
          <p className="eyebrow">{t("sessions.eyebrow")}</p>
          <h1>{t("nav.workload")}</h1>
          <p>{t("workload.lead")}</p>
        </div>
      </div>
      <section aria-label={t("workload.filters")}>
        <form
          className="workload-filters"
          onSubmit={(event) => {
            event.preventDefault();
            reset();
            setCandidateFilter(candidate.trim());
          }}
        >
          <label>
            {t("workload.state")}<select
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
                    {value === "all" ? t("workload.allStates") : code("state", value)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            {t("workload.coverage")}<select
              disabled={saving || !!review}
              value={assignment}
              onChange={(event) => {
                reset();
                setAssignment(event.target.value);
              }}
            >
              <option value="all">{t("workload.coverage.all")}</option>
              <option value="mine">{t("workload.coverage.mine")}</option>
              {effectiveManager && (
                <option value="unassigned">{t("workload.noObserver")}</option>
              )}
            </select>
          </label>
          <label>
            {t("workload.candidate")}<input
              disabled={saving || !!review}
              value={candidate}
              onChange={(event) => setCandidate(event.target.value)}
              placeholder={t("workload.candidatePlaceholder")}
            />
          </label>
          <button disabled={saving || !!review}>{t("workload.apply")}</button>
          <button
            type="button"
            className="quiet"
            disabled={saving || !!review && !!page}
            onClick={() => {
              setRefresh((value) => value + 1);
            }}
          >
            {t("workload.refresh")}
          </button>
        </form>
        <p className="hint">{t("workload.pageHint")}</p>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
          {review && " " + t("workload.retained")}
        </p>
      )}
      {notice && <p className="notice" role="status">{notice}</p>}
      {effectiveManager && !!selectedRows.length && !review && (
        <div className="workload-selection">
          <span role="status">{t("workload.selected", { count: selectedRows.length })}</span>
          <button
            className="quiet"
            onClick={() => assignmentHeading.current?.focus()}
          >
            {t("workload.distributeSelected")}
          </button>
        </div>
      )}
      {loading
        ? <p role="status">{t("workload.loading")}</p>
        : (
          <section className="workload-sessions" aria-label={t("workload.coverageTitle")}>
            <div className="record-heading">
              <h2>{t("workload.coverageTitle")}</h2>
              <span className="state-badge">{t("workload.onPage", { count: rows.length })}</span>
            </div>
            {!rows.length && <p>{t("workload.empty")}</p>}
            <ul className="records">
              {rows.map((row) => (
                <li key={row.id} className="workload-row">
                  <div>
                    <div className="record-heading">
                      <strong>{row.candidate_name}</strong>
                      <span className="state-badge">{code("state", row.state)}</span>
                    </div>
                    <p className="hint">
                      {row.window_title} · {code("mode", row.monitoring_mode)}
                    </p>
                    <p className="hint">
                      {t("workload.observers", {
                        names: row.observers.length
                          ? row.observers.map((person) => person.name).join(", ")
                          : t("workload.noObserver"),
                      })}
                      {row.loss_since
                        ? " · " + t("workload.interrupted", { time: dateTime(row.loss_since) })
                        : ""}
                    </p>
                    <p className="hint">
                      {t("workload.heartbeat", { time: dateTime(row.last_heartbeat_at) })}
                    </p>
                  </div>
                  <div className="action-row">
                    {effectiveManager && (
                      <label className="check">
                        <input
                          type="checkbox"
                          aria-label={t("workload.selectSession", { name: row.candidate_name, id: row.id })}
                          checked={selected.includes(row.id)}
                          disabled={saving || !!review}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, row.id]
                                : current.filter((id) => id !== row.id)
                            )}
                        />{t("workload.select")}
                      </label>
                    )}
                    <button
                      className="quiet"
                      disabled={saving || !!review}
                      onClick={() => openSession(row.id)}
                    >
                      {t("sessions.open")}
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
                          ? t("workload.removeLive")
                          : t("workload.addLive")}
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
                {t("workload.previous")}
              </button>
              <button
                className="quiet"
                disabled={!page?.next || saving || !!review}
                onClick={() => {
                  setHistory((current) => [...current, after]);
                  setAfter(page!.next);
                }}
              >
                {t("workload.next")}
              </button>
            </div>
            <p className="hint">
              {t("workload.lastConfirmed", { time: dateTime(page?.server_time) })}
            </p>
          </section>
        )}
      {effectiveManager && (
        <section
          className="workload-assignment"
          aria-label={t("workload.distribute")}
        >
          <h2 ref={assignmentHeading} tabIndex={-1}>{t("workload.distribute")}</h2>
          <p>{t("workload.distributeLead", { count: selectedRows.length })}</p>
          <form onSubmit={prepare}>
            <div className="form-pair">
              <label>
                {t("workload.change")}<select
                  disabled={saving || !!review}
                  value={action}
                  onChange={(event) => {
                    setAction(event.target.value);
                    setUser("");
                  }}
                >
                  <option value="assignment.set">{t("workload.change.set")}</option>
                  <option value="assignment.remove">
                    {t("workload.change.remove")}
                  </option>
                </select>
              </label>
              <label>
                {t("team.role")}<select
                  disabled={saving || !!review}
                  value={role}
                  onChange={(event) => {
                    setRole(event.target.value);
                    setStaffAfter(null);
                    setStaffHistory([]);
                  }}
                >
                  <option value="observer">{t("team.role.observer")}</option>
                  <option value="reviewer">{t("team.role.reviewer")}</option>
                </select>
              </label>
            </div>
            <label>
              {t("workload.staff")}<select
                required
                disabled={staffLoading || saving || !!review}
                value={user}
                onChange={(event) => setUser(event.target.value)}
              >
                <option value="">{t("workload.chooseStaff")}</option>
                {staff.rows.map((person) => (
                  <option
                    key={person.user_id}
                    value={person.user_id}
                    disabled={action === "assignment.set" && !person.eligible}
                  >
                    {t("workload.staffOption", { name: person.name, count: person.active_assignments, role: code("role", role) })}
                    {person.eligible
                      ? ""
                      : " · " + t("workload.noCapability")}
                  </option>
                ))}
              </select>
            </label>
            {staffLoading && <p role="status">{t("workload.loadingStaff")}</p>}
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
                {t("workload.previousStaff")}
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
                {t("workload.nextStaff")}
              </button>
            </div>
            <label>
              {t("workload.reason")}<textarea
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
              {t("workload.review")}
            </button>
          </form>
          {review && (
            <div
              className="workload-review"
              role="region"
              aria-label={t("workload.reviewRegion")}
            >
              <h3 tabIndex={-1} ref={reviewHeading}>
                {t("workload.confirmTitle")}
              </h3>
              <p>
                {t(review.action === "assignment.set" ? "workload.confirmAssign" : "workload.confirmRemove", { staff: review.staff, role: code("role", review.data.role) })}
              </p>
              <ul>
                {review.names.map((name, index) => (
                  <li key={review.data.targets[index].session_id}>{name}</li>
                ))}
              </ul>
              <p>{review.data.reason}</p>
              <p className="hint">{t("workload.reviewHint")}</p>
              <div className="action-row">
                <button disabled={saving} onClick={() => void save()}>
                  {saving
                    ? t("workload.saving")
                    : t("workload.confirm")}
                </button>
                <button
                  className="quiet"
                  disabled={saving}
                  onClick={() => {
                    setReview(null);
                    setRefresh((value) => value + 1);
                  }}
                >
                  {t("workload.cancel")}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      {!!watching.length && (
        <section aria-label={t("workload.liveBoard")} className="workload-live">
          <div className="record-heading">
            <h2>{t("workload.liveTitle", { count: watching.length })}</h2>
            <button
              className="quiet"
              onClick={() =>
                setWatching([])}
            >
              {t("workload.closeLive")}
            </button>
          </div>
          <p className="hint">{t("workload.liveHint")}</p>
          <div className="workload-live-grid">
            {watching.map((id) => {
              const row = rows.find((row) =>
                row.id === id
              );
              return row && row.can_observe
                ? (
                  <article
                    key={row.id + ":" + row.assignment_revision}
                    aria-label={t("workload.liveCandidate", { name: row.candidate_name })}
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
