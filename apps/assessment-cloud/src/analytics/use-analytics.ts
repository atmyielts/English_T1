import { useEffect, useRef, useState } from "react";
import { request } from "../../../../packages/assessment-web/src/client";
import {
  type AnalyticsChoice,
  type AnalyticsForm,
  type AnalyticsReport,
  type AnalyticsSnapshot,
  openAnalyticsCommands,
} from "../../../../packages/assessment-web/src/analytics";
export function useAnalytics(tenant: string, actor: string) {
  const [sittings, setSittings] = useState<AnalyticsChoice[]>([]),
    [cohorts, setCohorts] = useState<AnalyticsChoice[]>([]),
    [snapshots, setSnapshots] = useState<AnalyticsSnapshot[]>([]),
    [report, setReport] = useState<AnalyticsReport | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [ready, setReady] = useState(false),
    [allowed, setAllowed] = useState(true),
    [moreForms, setMoreForms] = useState(false),
    [moreItems, setMoreItems] = useState(false);
  const [pages, setPages] = useState({
    sittings: false,
    cohorts: false,
    snapshots: false,
  });
  const alive = useRef(true),
    version = useRef(0),
    engine = useRef<Awaited<ReturnType<typeof openAnalyticsCommands>> | null>(
      null,
    ),
    scope = useRef(`${tenant}:${actor}`);
  scope.current = `${tenant}:${actor}`;
  const read = async <T>(path: string) => {
    const expected = scope.current,
      value = await request<T>(
        "analytics/" + path,
        tenant,
        undefined,
        undefined,
        undefined,
        actor,
      );
    if (!alive.current || scope.current !== expected) {
      throw new Error("This report workspace is no longer open.");
    }
    return value;
  };
  const problem = (cause: unknown) => {
    if (!alive.current) return;
    if ([401, 403].includes((cause as { status: number })?.status)) {
      setAllowed(false);
      setReport(null);
      setSittings([]);
      setCohorts([]);
      setSnapshots([]);
    }
    setError(
      cause instanceof Error ? cause.message : "The reporting request failed.",
    );
  };
  async function list(
    kind: "sittings" | "cohorts" | "snapshots",
    append = false,
  ) {
    const current = kind === "sittings"
        ? sittings
        : kind === "cohorts"
        ? cohorts
        : snapshots,
      after = append ? current.at(-1)?.id : null,
      rows = await read<AnalyticsSnapshot[]>(
        kind + "?limit=100" + (after ? "&after=" + after : ""),
      );
    setPages((current) => ({ ...current, [kind]: rows.length === 100 }));
    if (kind === "sittings") {
      setSittings(append ? [...sittings, ...rows] : rows);
    } else if (kind === "cohorts") {
      setCohorts(append ? [...cohorts, ...rows] : rows);
    } else setSnapshots(append ? [...snapshots, ...rows] : rows);
  }
  async function open(
    id: string,
    form: string | null = null,
    after: string | null = null,
  ) {
    const token = ++version.current;
    setBusy(true);
    setError("");
    try {
      const value = await read<AnalyticsReport>(
        `reports/${id}?limit=50${form ? "&form=" + form : ""}${
          after ? "&after=" + after : ""
        }`,
      );
      if (token !== version.current) return;
      setReport((current) =>
        after && current?.id === value.id &&
          current.selected_form === value.selected_form
          ? {
            ...value,
            forms: current.forms,
            items: [...current.items, ...value.items],
          }
          : value
      );
      setMoreItems(value.items.length === 50);
      if (!after) {
        setMoreForms(value.forms.length === 100 && value.form_count > 100);
      }
    } catch (cause) {
      if (token === version.current) problem(cause);
    } finally {
      if (alive.current && token === version.current) setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    let disposed = false,
      created: Awaited<ReturnType<typeof openAnalyticsCommands>> | null = null;
    void openAnalyticsCommands(tenant, actor).then(async (value) => {
      created = value;
      if (disposed) {
        value.close();
        return;
      }
      engine.current = value;
      const saved = await value.commands.pending();
      if (disposed) return;
      setPending(!!saved);
      await Promise.all([list("sittings"), list("cohorts"), list("snapshots")]);
      if (!disposed) setReady(true);
    }).catch((cause) => {
      if (!disposed) problem(cause);
    });
    return () => {
      disposed = true;
      alive.current = false;
      version.current++;
      created?.close();
      engine.current = null;
    };
  }, [tenant, actor]);
  async function create(data?: Record<string, unknown>) {
    if (!engine.current || busy || !allowed) return;
    setBusy(true);
    setError("");
    try {
      const result = await (data
        ? engine.current.commands.execute("snapshot.create", data)
        : engine.current.commands.retry()) as { id: string } | null;
      if (!alive.current) {
        return;
      }
      setPending(false); // Do not label a receipted command uncertain while reads load.
      await list("snapshots");
      if (result) {
        await open(result.id);
      }
    } catch (cause) {
      problem(cause);
    } finally {
      if (alive.current) {
        try {
          setPending(!!await engine.current?.commands.pending());
        } catch (cause) {
          problem(cause);
          setReady(false);
        }
        setBusy(false);
      }
    }
  }
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      problem(cause);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function loadForms() {
    if (!report) return;
    const rows = await read<AnalyticsForm[]>(
      `reports/${report.id}/forms?limit=100&form=${
        report.forms.at(-1)?.form_key ?? ""
      }`,
    );
    setReport((current) =>
      current?.id === report.id
        ? { ...current, forms: [...current.forms, ...rows] }
        : current
    );
    setMoreForms(rows.length === 100);
  }
  return {
    sittings,
    cohorts,
    snapshots,
    report,
    error,
    busy,
    pending,
    ready,
    allowed,
    moreForms,
    moreItems,
    pages,
    open,
    create,
    loadMore: (kind: "sittings" | "cohorts" | "snapshots") =>
      run(() => list(kind, true)),
    loadForms: () => run(loadForms),
  };
}
