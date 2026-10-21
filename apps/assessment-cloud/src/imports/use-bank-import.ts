import { useEffect, useRef, useState } from "react";
import { request } from "../../../../packages/assessment-web/src/client";
import {
  type BankImport,
  openImportCommands,
} from "../../../../packages/assessment-web/src/bank-import";
export function useBankImports(tenant: string, actor: string) {
  const [jobs, setJobs] = useState<BankImport[]>([]),
    [job, setJob] = useState<BankImport | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [ready, setReady] = useState(false),
    [allowed, setAllowed] = useState(true),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false);
  const engine = useRef<Awaited<ReturnType<typeof openImportCommands>> | null>(
      null,
    ),
    alive = useRef(true),
    readVersion = useRef(0);
  const read = async <T>(path: string) => {
    const value = await request<T>(
      path,
      tenant,
      undefined,
      undefined,
      undefined,
      actor,
    );
    if (!alive.current) {
      throw new Error("This institution workspace is no longer open.");
    }
    return value;
  };
  function problem(cause: unknown) {
    if (!alive.current) return;
    if ([401, 403].includes((cause as { status: number })?.status)) {
      setAllowed(false);
      setJobs([]);
      setJob(null);
    }
    setError(
      cause instanceof Error
        ? cause.message
        : "The question-bank request failed.",
    );
  }
  async function list(append = false) {
    const after = append ? offset : 0,
      rows = await read<BankImport[]>(
        "imports/jobs?after=" + after + "&limit=50",
      );
    if (alive.current) {
      setJobs((current) => append ? [...current, ...rows] : rows);
      setOffset(after + rows.length);
      setMore(rows.length === 50);
    }
  }
  async function open(id: string, after = 0) {
    const version = ++readVersion.current;
    try {
      const value = await read<BankImport>(
        `imports/jobs/${id}?after=${after}&limit=50`,
      );
      if (alive.current && version === readVersion.current) {
        setJob((current) =>
          after && current?.id === id
            ? { ...value, rows: [...current.rows, ...value.rows] }
            : value
        );
      }
    } catch (cause) {
      problem(cause);
    }
  }
  useEffect(() => {
    alive.current = true;
    let disposed = false,
      created: Awaited<ReturnType<typeof openImportCommands>> | null = null;
    void openImportCommands(tenant, actor).then(async (value) => {
      created = value;
      if (disposed) {
        value.close();
        return;
      }
      engine.current = value;
      const saved = await value.commands.pending();
      if (disposed) return;
      setPending(!!saved);
      setReady(true);
      await list();
    }).catch((cause) => {
      if (!disposed) problem(cause);
    });
    return () => {
      disposed = true;
      alive.current = false;
      readVersion.current++;
      created?.close();
      engine.current = null;
    };
  }, [tenant, actor]);
  async function send(action?: string, data: Record<string, unknown> = {}) {
    if (busy || !engine.current || !allowed) return null;
    setBusy(true);
    setError("");
    let result: Record<string, unknown> | null = null;
    try {
      result = await (action
        ? engine.current.commands.execute(action, data)
        : engine.current.commands.retry()) as Record<string, unknown> | null;
      if (!alive.current) {
        return null;
      }
      setPending(false); // Canonical command receipt is independent of read refresh.
      await list();
      if (result?.id) {
        await open(String(result.id));
      }
      return result;
    } catch (cause) {
      problem(cause);
      return null;
    } finally {
      if (alive.current) {
        try {
          setPending(!!await engine.current?.commands.pending());
        } catch (cause) {
          problem(cause);
          setReady(false);
        } finally {
          setBusy(false);
        }
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
  return {
    jobs,
    job,
    error,
    busy,
    pending,
    ready,
    allowed,
    more,
    read,
    send,
    open,
    openReviewedImport: async (id: string) => { await list(); await open(id); },
    run,
    loadMore: () => run(() => list(true)),
  };
}
