import { useEffect, useRef, useState } from "react";
import { itemLabels } from "../../../../packages/assessment-core/src/authoring.ts";
import type { ItemType } from "../../../../packages/assessment-core/src/mod.ts";
import {
  request,
  ServiceRequestError,
  type Row,
} from "../../../../packages/assessment-web/src/client";
import {
  gradingProblem,
  intentDescription,
  openGradeCommands,
  type GradeAccess,
  type GradeRun,
  type GradeTask,
} from "../../../../packages/assessment-web/src/grading";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
import { TaskEditor } from "./TaskEditor";
import { RunReview } from "./RunReview";
import "./grading.css";
export function GradingWorkspace({
  tenant,
  actor,
  initialAccess,
  refreshVersion,
}: {
  tenant: string;
  actor: string;
  initialAccess: GradeAccess;
  refreshVersion: number;
}) {
  const [access, setAccess] = useState(initialAccess),
    [tasks, setTasks] = useState<Row[]>([]),
    [runs, setRuns] = useState<Row[]>([]),
    [task, setTask] = useState<GradeTask | null>(null),
    [run, setRun] = useState<GradeRun | null>(null),
    [markers, setMarkers] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [pending, setPending] = useState<GradeIntent | null>(null),
    [taskMore, setTaskMore] = useState(false),
    [runMore, setRunMore] = useState(false);
  const engine = useRef<Awaited<ReturnType<typeof openGradeCommands>> | null>(
      null,
    ),
    alive = useRef(true),
    loadVersion = useRef(0),
    contextVersion = useRef(0),
    selection = useRef<{ kind: "task" | "run"; id: string } | null>(null);
  const get = <T,>(path: string) =>
    request<T>(
      `grading/${path}`,
      tenant,
      undefined,
      undefined,
      undefined,
      actor,
    );
  async function refresh() {
    await load();
    const selected = selection.current;
    if (selected) await open(selected.kind, selected.id);
  }
  function clearContext() {
    contextVersion.current++;
    selection.current = null;
    setTask(null);
    setRun(null);
    setMarkers([]);
  }
  async function load() {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const current = await get<GradeAccess>("access");
      const [nextTasks, nextRuns] = await Promise.all([
        current.can_mark || current.can_moderate
          ? get<Row[]>("worklist?limit=50")
          : [],
        current.can_moderate || current.can_release
          ? get<Row[]>("runs?limit=50")
          : [],
      ]);
      if (alive.current && version === loadVersion.current) {
        setAccess(current);
        setTasks(nextTasks);
        setRuns(nextRuns);
        setTaskMore(nextTasks.length === 50);
        setRunMore(nextRuns.length === 50);
        const selected = selection.current;
        if (
          selected &&
          (selected.kind === "task"
            ? !current.can_mark && !current.can_moderate
            : !current.can_moderate && !current.can_release)
        )
          clearContext();
      }
    } catch (cause) {
      if (alive.current && version === loadVersion.current) {
        if (
          cause instanceof ServiceRequestError &&
          [401, 403].includes(cause.status)
        ) {
          clearContext();
          setTasks([]);
          setRuns([]);
          setTaskMore(false);
          setRunMore(false);
          setAccess({
            ...initialAccess,
            can_mark: false,
            can_moderate: false,
            can_release: false,
          });
        }
        setError(gradingProblem(cause));
      }
    } finally {
      if (alive.current && version === loadVersion.current) setLoading(false);
    }
  }
  async function open(kind: "task" | "run", id: string) {
    const version = ++contextVersion.current;
    selection.current = { kind, id };
    setError("");
    setTask(null);
    setRun(null);
    setMarkers([]);
    try {
      if (kind === "task") {
        const next = await get<GradeTask>(`tasks/${id}`);
        const staff = next.can_assign
          ? await get<{ id: string; name: string }[]>(`markers/${id}`)
          : [];
        if (alive.current && version === contextVersion.current) {
          setTask(next);
          setMarkers(staff);
        }
      } else {
        const next = await get<GradeRun>(`runs/${id}`);
        if (alive.current && version === contextVersion.current) setRun(next);
      }
    } catch (cause) {
      if (alive.current && version === contextVersion.current)
        setError(gradingProblem(cause));
    }
  }
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void openGradeCommands(tenant, actor)
      .then(async (value) => {
        if (cancelled) {
          value.close();
          return;
        }
        engine.current = value;
        const intent = await value.commands.pending();
        if (!cancelled) setPending(intent);
      })
      .catch((cause) => {
        if (!cancelled) setError(gradingProblem(cause));
      });
    void load();
    return () => {
      cancelled = true;
      alive.current = false;
      loadVersion.current++;
      contextVersion.current++;
      engine.current?.close();
      engine.current = null;
    };
  }, [tenant, actor]);
  useEffect(() => {
    if (refreshVersion) void refresh();
  }, [refreshVersion]);
  async function mutate(action?: string, data?: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    let committed=false;
    try {
      const active = engine.current;
      if (!active)
        throw new Error(
          "The encrypted grading queue is not ready. Refresh this workspace.",
        );
      const result=action?await active.commands.execute(action,data!):await active.commands.retry();
      committed=true;
      if (!alive.current) return false;
      setNotice((result as {device_draft_preserved?:boolean})?.device_draft_preserved?'Your grading change was recorded. A newer device draft was preserved for review.':'Your grading change was recorded.');
      await load();
      const selected = selection.current;
      if (selected) await open(selected.kind, selected.id);
      return true;
    } catch (cause) {
      if (alive.current) setError(gradingProblem(cause));
      if(committed&&alive.current)setNotice('Your grading change was recorded. Refresh its current state before continuing.');
      return committed;
    } finally {
      if (alive.current) {
        try {
          setPending((await engine.current?.commands.pending()) ?? null);
        } catch (cause) {
          setError(gradingProblem(cause));
        }
        setBusy(false);
      }
    }
  }
  async function more(kind: "tasks" | "runs") {
    const rows = kind === "tasks" ? tasks : runs,
      last = rows.at(-1)?.id;
    if (!last) return;
    setBusy(true);
    try {
      const page = await get<Row[]>(
        `${kind === "tasks" ? "worklist" : "runs"}?limit=50&after=${last}`,
      );
      if (!alive.current) return;
      if (kind === "tasks") {
        setTasks((current) => [...current, ...page]);
        setTaskMore(page.length === 50);
      } else {
        setRuns((current) => [...current, ...page]);
        setRunMore(page.length === 50);
      }
    } catch (cause) {
      if (alive.current) setError(gradingProblem(cause));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="grading-workspace">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {pending && (
        <section className="pending-grade">
          <h2>Saved grading request needs a receipt</h2>
          <p>
            The request to {intentDescription(pending)} is encrypted on this
            device. It may already be recorded. Retry it before making another
            change.
          </p>
          <button disabled={busy} onClick={() => void mutate()}>
            Retry saved grading request
          </button>
        </section>
      )}
      <div className="grading-layout">
        <div className="grading-lists" aria-busy={loading}>
          {loading && (
            <p role="status">
              Loading current grading permissions and records…
            </p>
          )}
          {(access.can_mark || access.can_moderate) && (
            <section>
              <h2>
                {access.can_moderate
                  ? "Marking and moderation queue"
                  : "Your marking queue"}
              </h2>
              <p>
                Work only on assigned responses. Independent marks and approved
                generations remain in the audit history.
              </p>
              <ul className="records">
                {tasks.map((row) => (
                  <li key={row.id}>
                    <strong>
                      {itemLabels[row.type as ItemType] ?? "Submitted response"}
                    </strong>
                    <span>{String(row.status).replaceAll("_", " ")}</span>
                    <button
                      disabled={busy || !!pending}
                      onClick={() => void open("task", row.id!)}
                    >
                      Open response
                    </button>
                  </li>
                ))}
              </ul>
              {!loading && !tasks.length && (
                <p>No responses are waiting in your queue.</p>
              )}
              {taskMore && (
                <button
                  className="quiet"
                  disabled={busy || !!pending}
                  onClick={() => void more("tasks")}
                >
                  Load more responses
                </button>
              )}
            </section>
          )}
          {(access.can_moderate || access.can_release) && (
            <section>
              <h2>Grade reviews and releases</h2>
              <ul className="records">
                {runs.map((row) => (
                  <li key={row.id}>
                    <strong>Grading generation {String(row.generation)}</strong>
                    <span>
                      {String(row.status).replaceAll("_", " ")} ·{" "}
                      {new Date(String(row.created_at)).toLocaleString()}
                    </span>
                    <button
                      disabled={busy || !!pending}
                      onClick={() => void open("run", row.id!)}
                    >
                      Review grade
                    </button>
                  </li>
                ))}
              </ul>
              {!loading && !runs.length && (
                <p>No grading generations are available for your role.</p>
              )}
              {runMore && (
                <button
                  className="quiet"
                  disabled={busy || !!pending}
                  onClick={() => void more("runs")}
                >
                  Load more grades
                </button>
              )}
            </section>
          )}
          {!loading &&
            !access.can_mark &&
            !access.can_moderate &&
            !access.can_release && (
              <p>
                Your institution has not assigned grading permissions to this
                account.
              </p>
            )}
          <button
            className="quiet"
            disabled={busy || !!pending}
            onClick={() => void refresh()}
          >
            Refresh grading records
          </button>
        </div>
        <div>
          {task ? (
            <TaskEditor
              tenant={tenant}
              actor={actor}
              key={`${task.id}:${task.run_status}:${task.own_mark?.revision}:${task.review_hash}:${JSON.stringify(task.assignments)}`}
              task={task}
              markers={markers}
              busy={busy}
              locked={!!pending}
              submit={(action, data) => mutate(action, data)}
            />
          ) : run ? (
            <RunReview
              key={`${run.id}:${run.status}:${run.review_hash}`}
              tenant={tenant}
              actor={actor}
              run={run}
              busy={busy}
              locked={!!pending}
              submit={(action, data) => mutate(action, data)}
            />
          ) : (
            <section>
              <h2>Select a response or grade</h2>
              <p>
                Open a marking task to review its submitted response and rubric,
                or open a complete grade for independent approval and release.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
