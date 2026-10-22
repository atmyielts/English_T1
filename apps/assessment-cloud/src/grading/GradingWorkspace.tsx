import { useEffect, useRef, useState } from "react";
import type { ItemType } from "../../../../packages/assessment-core/src/mod.ts";
import {
  request,
  ServiceRequestError,
  type Row,
} from "../../../../packages/assessment-web/src/client";
import {
  gradingProblem as gradingProblemText,
  intentDescription as intentDescriptionText,
  openGradeCommands,
  type GradeAccess,
  type GradeRun,
  type GradeTask,
} from "../../../../packages/assessment-web/src/grading";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
import { TaskEditor } from "./TaskEditor";
import { RunReview } from "./RunReview";
import "./grading.css";
import { useI18n } from "../../../../packages/service-i18n/src/i18n.tsx";
import { useAppT, useItemLabel } from "../i18n/index.ts";
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
  const t = useAppT(), { date } = useI18n(), itemLabel = useItemLabel();
  const gradingProblem = (cause: unknown) => gradingProblemText(cause, t), intentDescription = (intent: GradeIntent) => intentDescriptionText(intent, t);
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
          t("grading.queueNotReady"),
        );
      const result=action?await active.commands.execute(action,data!):await active.commands.retry();
      committed=true;
      if (!alive.current) return false;
      setNotice((result as {device_draft_preserved?:boolean})?.device_draft_preserved?t('grading.recordedPreserved'):t('grading.recorded'));
      await load();
      const selected = selection.current;
      if (selected) await open(selected.kind, selected.id);
      return true;
    } catch (cause) {
      if (alive.current) setError(gradingProblem(cause));
      if(committed&&alive.current)setNotice(t('grading.recordedRefresh'));
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
          <h2>{t("grading.pendingTitle")}</h2>
          <p>
            {t("grading.pendingBody", { intent: intentDescription(pending) })}
          </p>
          <button disabled={busy} onClick={() => void mutate()}>
            {t("grading.retry")}
          </button>
        </section>
      )}
      <div className="grading-layout">
        <div className="grading-lists" aria-busy={loading}>
          {loading && (
            <p role="status">
              {t("grading.loading")}
            </p>
          )}
          {(access.can_mark || access.can_moderate) && (
            <section>
              <h2>
                {access.can_moderate
                  ? t("grading.queueModeration")
                  : t("grading.queueOwn")}
              </h2>
              <p>
                {t("grading.queueLead")}
              </p>
              <ul className="records">
                {tasks.map((row) => (
                  <li key={row.id}>
                    <strong>
                      {itemLabel(row.type as ItemType) ?? t("grading.submittedResponse")}
                    </strong>
                    <span>{String(row.status).replaceAll("_", " ")}</span>
                    <button
                      disabled={busy || !!pending}
                      onClick={() => void open("task", row.id!)}
                    >
                      {t("grading.openResponse")}
                    </button>
                  </li>
                ))}
              </ul>
              {!loading && !tasks.length && (
                <p>{t("grading.queueEmpty")}</p>
              )}
              {taskMore && (
                <button
                  className="quiet"
                  disabled={busy || !!pending}
                  onClick={() => void more("tasks")}
                >
                  {t("grading.moreResponses")}
                </button>
              )}
            </section>
          )}
          {(access.can_moderate || access.can_release) && (
            <section>
              <h2>{t("grading.runsTitle")}</h2>
              <ul className="records">
                {runs.map((row) => (
                  <li key={row.id}>
                    <strong>{t("grading.generation", { generation: String(row.generation) })}</strong>
                    <span>
                      {t("grading.runMeta", { status: String(row.status).replaceAll("_", " "), created: date(String(row.created_at)) })}
                    </span>
                    <button
                      disabled={busy || !!pending}
                      onClick={() => void open("run", row.id!)}
                    >
                      {t("grading.reviewGrade")}
                    </button>
                  </li>
                ))}
              </ul>
              {!loading && !runs.length && (
                <p>{t("grading.runsEmpty")}</p>
              )}
              {runMore && (
                <button
                  className="quiet"
                  disabled={busy || !!pending}
                  onClick={() => void more("runs")}
                >
                  {t("grading.moreRuns")}
                </button>
              )}
            </section>
          )}
          {!loading &&
            !access.can_mark &&
            !access.can_moderate &&
            !access.can_release && (
              <p>
                {t("grading.noPermissions")}
              </p>
            )}
          <button
            className="quiet"
            disabled={busy || !!pending}
            onClick={() => void refresh()}
          >
            {t("grading.refresh")}
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
              <h2>{t("grading.selectTitle")}</h2>
              <p>
                {t("grading.selectLead")}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
