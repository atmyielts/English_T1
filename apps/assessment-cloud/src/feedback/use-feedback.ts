import { useEffect, useRef, useState } from "react";
import { request } from "../../../../packages/assessment-web/src/client";
import {
  type FeedbackHistory,
  type FeedbackRelease,
  openFeedbackCommands,
} from "../../../../packages/assessment-web/src/feedback";
export function useFeedback(tenant: string, actor: string) {
  const [sittings, setSittings] = useState<{ id: string; title: string }[]>([]),
    [moreSittings, setMoreSittings] = useState(false),
    [selected, setSelected] = useState(""),
    [history, setHistory] = useState<FeedbackHistory | null>(null),
    [releases, setReleases] = useState<FeedbackRelease[]>([]),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [pending, setPending] = useState(false),
    [allowed, setAllowed] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const alive = useRef(false),
    epoch = useRef(0),
    engine = useRef<Awaited<ReturnType<typeof openFeedbackCommands>> | null>(
      null,
    ),
    selection = useRef("");
  const read = <T>(path: string) =>
    request<T>(
      "feedback/" + path,
      tenant,
      undefined,
      undefined,
      undefined,
      actor,
    ).catch((cause) => {
      problem(cause);
      throw cause;
    });
  function problem(cause: unknown) {
    if (!alive.current) return;
    if (
      [401, 403].includes((cause as { status?: number })?.status ?? 0) ||
      /account changed|no active session|sign in/i.test(
        (cause as Error)?.message ?? "",
      )
    ) {
      epoch.current++;
      setAllowed(false);
      setHistory(null);
      setReleases([]);
      setSittings([]);
    }
    setError(
      cause instanceof Error ? cause.message : "The feedback request failed.",
    );
  }
  async function loadSittings(append = false) {
    const rows = await read<{ id: string; title: string }[]>(
      `sittings?limit=100${
        append && sittings.length ? "&after=" + sittings.at(-1)!.id : ""
      }`,
    );
    if (!alive.current) return;
    setSittings(append ? [...sittings, ...rows] : rows);
    setMoreSittings(rows.length === 100);
  }
  async function load(id: string, versionAfter = "", releaseAfter = "") {
    const token = ++epoch.current;
    const [policy, items] = await Promise.all([
      read<FeedbackHistory>(
        `policy/${id}?limit=100${versionAfter ? "&after=" + versionAfter : ""}`,
      ),
      read<FeedbackRelease[]>(
        `releases/${id}?limit=100${
          releaseAfter ? "&after=" + releaseAfter : ""
        }`,
      ),
    ]);
    if (!alive.current || token !== epoch.current) return;
    setHistory(policy);
    setReleases(items);
  }
  useEffect(() => {
    alive.current = true;
    let disposed = false,
      created: Awaited<ReturnType<typeof openFeedbackCommands>> | null = null;
    void openFeedbackCommands(tenant, actor).then(async (value) => {
      created = value;
      if (disposed) {
        value.close();
        return;
      }
      engine.current = value;
      const saved = await value.commands.pending();
      if (disposed) return;
      setPending(!!saved);
      await loadSittings();
      if (!disposed) setReady(true);
    }).catch((cause) => {
      if (!disposed) problem(cause);
    });
    return () => {
      disposed = true;
      alive.current = false;
      epoch.current++;
      created?.close();
      engine.current = null;
    };
  }, [tenant, actor]);
  async function run(work: () => Promise<void>) {
    if (busy || !allowed) return;
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
  async function mutate(action?: string, data?: Record<string, unknown>) {
    if (!engine.current) return;
    await run(async () => {
      try {
        if (action && data) {
          await engine.current!.commands.execute(action, data);
        } else await engine.current!.commands.retry();
        if (!alive.current) return;
        setPending(false);
        setNotice(
          "Feedback decision recorded. Grades and historical release policies are unchanged.",
        );
        if (selection.current) await load(selection.current);
      } finally {
        if (alive.current && engine.current) {
          setPending(!!await engine.current.commands.pending());
        }
      }
    });
  }
  return {
    sittings,
    moreSittings,
    selected,
    history,
    releases,
    busy,
    ready,
    pending,
    allowed,
    error,
    notice,
    mutate,
    choose: (id: string) =>
      run(async () => {
        selection.current = id;
        setSelected(id);
        setHistory(null);
        setReleases([]);
        if (id) await load(id);
      }),
    refresh: () =>
      run(async () => {
        await loadSittings();
        if (selection.current) await load(selection.current);
      }),
    more: () => run(() => loadSittings(true)),
    page: (kind: "versions" | "releases") =>
      run(() =>
        load(
          selected,
          kind === "versions" ? history?.versions.at(-1)?.id : "",
          kind === "releases" ? releases.at(-1)?.id : "",
        )
      ),
  };
}
