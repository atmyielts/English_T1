import { useEffect, useRef, useState } from "react";
import { openImportCommands } from "../../../../packages/assessment-web/src/bank-import";
import {
  type QtiJob,
  qtiTransport,
  readQti,
} from "../../../../packages/assessment-web/src/qti";
import {
  type PreparedQtiSource,
  transferQtiSource,
} from "../../../../packages/assessment-web/src/qti-source";
import { useAppT, useErrorText } from "../i18n/index.ts";
export function useQti(tenant: string, actor: string) {
  const t = useAppT(), errorText = useErrorText();
  const [jobs, setJobs] = useState<QtiJob[]>([]),
    [job, setJob] = useState<QtiJob | null>(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [ready, setReady] = useState(false),
    [allowed, setAllowed] = useState(true),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(""),
    [more, setMore] = useState(false);
  const engine = useRef<Awaited<ReturnType<typeof openImportCommands>> | null>(
      null,
    ),
    lifetime = useRef(new AbortController()),
    running = useRef(false),
    version = useRef(0),
    offset = useRef(0);
  const active = () => lifetime.current.signal.throwIfAborted();
  function problem(cause: unknown) {
    if (lifetime.current.signal.aborted) return;
    if ([401, 403].includes((cause as { status?: number })?.status ?? 0)) {
      setAllowed(false);
      setJob(null);
      setJobs([]);
    }
    setError(errorText(cause, "qti.failed"));
  }
  async function list(append = false) {
    const start = append ? offset.current : 0;
    const rows = await readQti<QtiJob[]>(
      `jobs?after=${start}&limit=50`,
      tenant,
      actor,
    );
    active();
    setJobs((current) => append ? [...current, ...rows] : rows);
    offset.current = start + rows.length;
    setMore(rows.length === 50);
  }
  async function open(id: string, after = 0) {
    const read = ++version.current;
    const value = await readQti<QtiJob>(
      `jobs/${id}?after=${after}&limit=50`,
      tenant,
      actor,
    );
    active();
    if (read === version.current) {
      setJob((current) =>
        after && current?.id === id && current.review_hash === value.review_hash
          ? { ...value, rows: [...current.rows, ...value.rows] }
          : value
      );
    }
    return value;
  }
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    let created: Awaited<ReturnType<typeof openImportCommands>> | null = null;
    void openImportCommands(tenant, actor, "qti").then(async (value) => {
      created = value;
      if (controller.signal.aborted) {
        value.close();
        return;
      }
      engine.current = value;
      const saved = await value.commands.pending();
      if (controller.signal.aborted) return;
      setPending(!!saved);
      setReady(true);
      await list();
    }).catch((cause) => {
      if (!controller.signal.aborted) problem(cause);
    });
    return () => {
      controller.abort();
      version.current++;
      created?.close();
      engine.current = null;
    };
  }, [tenant, actor]);
  async function run(work: () => Promise<unknown>) {
    if (running.current || !allowed || !ready) return;
    running.current = true;
    setBusy(true);
    setError("");
    setProgress("");
    try {
      await work();
    } catch (cause) {
      problem(cause);
    } finally {
      if (!lifetime.current.signal.aborted) {
        try {
          setPending(!!await engine.current?.commands.pending());
        } catch (cause) {
          problem(cause);
          setReady(false);
        }
        setBusy(false);
      }
      running.current = false;
    }
  }
  async function command(action?: string, data: Record<string, unknown> = {}) {
    active();
    if (!engine.current) {
      throw new Error(t("qti.notReady"));
    }
    const result =
      await (action
        ? engine.current.commands.execute(action, data)
        : engine.current.commands.retry()) as { id?: string } | null;
    active();
    setPending(false);
    if (result?.id) await open(result.id);
    await list();
    return result;
  }
  async function upload(source: PreparedQtiSource, existing?: QtiJob) {
    let target = existing;
    if (!target) {
      const receipt = await command("source.begin", { ...source.manifest });
      if (!receipt?.id) {
        throw new Error(
          t("qti.noReceipt"),
        );
      }
      target = await open(receipt.id);
    }
    if (target.created_by !== actor || target.state !== "uploading") {
      throw new Error(
        t("qti.ownerOnly"),
      );
    }
    const id = target.id;
    await transferQtiSource(source, target, {
      active,
      part: (index, bytes) =>
        qtiTransport(
          tenant,
          actor,
          id,
          `parts/${index}`,
          bytes,
          lifetime.current.signal,
        ),
      complete: () =>
        qtiTransport(
          tenant,
          actor,
          id,
          "complete",
          undefined,
          lifetime.current.signal,
        ),
      progress: (received, total) =>
        setProgress(t("qti.progress", { received: String(received), total: String(total) })),
    });
    setProgress(
      t("qti.uploaded"),
    );
    await open(id);
    await list();
  }
  return {
    jobs,
    job,
    busy,
    pending,
    ready,
    allowed,
    error,
    progress,
    more,
    active,
    run,
    command,
    upload,
    open,
    refresh: async () => {
      await list();
      if (job) await open(job.id);
    },
    loadMore: () => list(true),
  };
}
