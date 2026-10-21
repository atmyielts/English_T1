import { useEffect, useRef, useState } from "react";
import { request, ServiceRequestError } from "./client";
import {
  type AppealDetail,
  appealProblem,
  type AppealRow,
  openAppealCommands,
} from "./appeals";
import type { GradeIntent } from "./grade-command";
export function useAppeals(
  tenant: string,
  actor: string,
  mode: "candidate" | "queue",
) {
  const [rows, setRows] = useState<AppealRow[]>([]),
    [detail, setDetail] = useState<AppealDetail | null>(null),
    [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState<GradeIntent | null>(null),
    [commandReady, setCommandReady] = useState(false);
  const engine = useRef<Awaited<ReturnType<typeof openAppealCommands>> | null>(
      null,
    ),
    alive = useRef(false),
    lifecycle = useRef(0),
    loadVersion = useRef(0),
    selectionVersion = useRef(0),
    selection = useRef<string | null>(null),
    flight = useRef(false);
  const get = <T>(path: string) =>
    request<T>(
      `appeals/${path}`,
      tenant,
      undefined,
      undefined,
      undefined,
      actor,
    );
  async function load(after?: string) {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const next = await get<AppealRow[]>(
        `${mode}?limit=50${after ? `&after=${after}` : ""}`,
      );
      if (alive.current && version === loadVersion.current) {
        setRows((current) => after ? [...current, ...next] : next);
        setMore(next.length === 50);
      }
    } catch (cause) {
      if (alive.current && version === loadVersion.current) {
        setError(appealProblem(cause));
        if (
          cause instanceof ServiceRequestError &&
          [401, 403].includes(cause.status)
        ) {
          selectionVersion.current++;
          selection.current = null;
          setRows([]);
          setDetail(null);
          setMore(false);
        }
      }
    } finally {
      if (alive.current && version === loadVersion.current) setLoading(false);
    }
  }
  async function open(id: string) {
    const version = ++selectionVersion.current;
    selection.current = id;
    setDetail(null);
    setError("");
    try {
      const next = await get<AppealDetail>(id);
      if (alive.current && version === selectionVersion.current) {
        setDetail(next);
      }
    } catch (cause) {
      if (alive.current && version === selectionVersion.current) {
        setError(appealProblem(cause));
      }
    }
  }
  async function refresh() {
    await load();
    const selected = selection.current;
    if (selected) await open(selected);
  }
  async function send(action?: string, data?: Record<string, unknown>) {
    if (flight.current) return false;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    let saved = false;
    try {
      if (!engine.current) {
        throw new Error(
          "Secure appeal recovery is not ready. Reload this workspace.",
        );
      }
      if (action) await engine.current.commands.execute(action, data ?? {});
      else await engine.current.commands.retry();
      saved = true;
      if (alive.current) {
        setNotice("The institution recorded your appeal request.");
        await refresh();
      }
    } catch (cause) {
      if (alive.current) setError(appealProblem(cause));
    } finally {
      if (alive.current) {
        try {
          setPending(await engine.current?.commands.pending() ?? null);
        } catch (cause) {
          setError(appealProblem(cause));
        }
        setBusy(false);
      }
      flight.current = false;
    }
    return saved;
  }
  useEffect(() => {
    alive.current = true;
    setCommandReady(false);
    const epoch = ++lifecycle.current;
    void load();
    void openAppealCommands(tenant, actor).then(async (next) => {
      if (!alive.current || epoch !== lifecycle.current) {
        next.close();
        return;
      }
      try {
        const value = await next.commands.pending();
        if (!alive.current || epoch !== lifecycle.current) {
          next.close();
          return;
        }
        engine.current = next;
        setPending(value);
        setCommandReady(true);
      } catch (cause) {
        next.close();
        throw cause;
      }
    }).catch((cause) => {
      if (alive.current && epoch === lifecycle.current) {
        setError(appealProblem(cause));
      }
    });
    return () => {
      alive.current = false;
      lifecycle.current++;
      loadVersion.current++;
      selectionVersion.current++;
      engine.current?.close();
      engine.current = null;
    };
  }, [tenant, actor, mode]);
  return {
    rows,
    detail,
    more,
    loading,
    busy,
    error,
    notice,
    pending,
    commandReady,
    open,
    refresh,
    send,
    loadMore: () => load(rows.at(-1)?.id),
  };
}
