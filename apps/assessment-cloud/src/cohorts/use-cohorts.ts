import { useEffect, useRef, useState } from "react";
import {
  request,
  ServiceRequestError,
} from "../../../../packages/assessment-web/src/client";
import {
  type Cohort,
  cohortProblem as cohortProblemText,
  type CohortSitting,
  type DirectoryMember,
  openCohortCommands,
  type RosterJob,
} from "../../../../packages/assessment-web/src/cohorts";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
import { useAppT } from "../i18n/index.ts";
export function useCohorts(tenant: string, actor: string) {
  const t = useAppT(),
    cohortProblem = (cause: unknown) => cohortProblemText(cause, t);
  const [groups, setGroups] = useState<Cohort[]>([]),
    [sittings, setSittings] = useState<CohortSitting[]>([]),
    [jobs, setJobs] = useState<RosterJob[]>([]),
    [group, setGroup] = useState<Cohort | null>(null),
    [job, setJob] = useState<RosterJob | null>(null),
    [directory, setDirectory] = useState<DirectoryMember[]>([]),
    [more, setMore] = useState({
      groups: false,
      sittings: false,
      jobs: false,
      members: false,
      targets: false,
      directory: false,
    });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [authorized, setAuthorized] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState<GradeIntent | null>(null);
  const engine = useRef<Awaited<ReturnType<typeof openCohortCommands>> | null>(
      null,
    ),
    epoch = useRef(0),
    listVersion = useRef(0),
    groupVersion = useRef(0),
    jobVersion = useRef(0),
    directoryVersion = useRef(0),
    flight = useRef(false),
    selectedGroup = useRef<string | null>(null),
    selectedJob = useRef<string | null>(null),
    query = useRef("");
  const get = <T>(path: string) =>
    request<T>(
      `cohorts/${path}`,
      tenant,
      undefined,
      undefined,
      undefined,
      actor,
    );
  function clearSensitive() {
    listVersion.current++;
    groupVersion.current++;
    jobVersion.current++;
    directoryVersion.current++;
    selectedGroup.current = null;
    selectedJob.current = null;
    setGroups([]);
    setSittings([]);
    setJobs([]);
    setGroup(null);
    setJob(null);
    setDirectory([]);
    setAuthorized(false);
    setLoading(false);
    setMore({
      groups: false,
      sittings: false,
      jobs: false,
      members: false,
      targets: false,
      directory: false,
    });
  }
  function problem(cause: unknown) {
    if (
      cause instanceof ServiceRequestError && [401, 403].includes(cause.status)
    ) clearSensitive();
    setError(cohortProblem(cause));
  }
  async function load(kind?: "groups" | "sittings" | "jobs") {
    const current = ++listVersion.current;
    setLoading(true);
    try {
      if (kind) {
        const rows = kind === "groups"
            ? groups
            : kind === "sittings"
            ? sittings
            : jobs,
          after = rows.at(-1)?.id;
        if (!after) return;
        const next = await get<unknown[]>(`${kind}?limit=50&after=${after}`);
        if (current !== listVersion.current) return;
        if (kind === "groups") {
          setGroups((rows) => [...rows, ...next as Cohort[]]);
        } else if (kind === "sittings") {
          setSittings((rows) => [...rows, ...next as CohortSitting[]]);
        } else setJobs((rows) => [...rows, ...next as RosterJob[]]);
        setMore((flags) => ({ ...flags, [kind]: next.length === 50 }));
      } else {
        const [g, s, j] = await Promise.all([
          get<Cohort[]>("groups?limit=50"),
          get<CohortSitting[]>("sittings?limit=50"),
          get<RosterJob[]>("jobs?limit=50"),
        ]);
        if (current === listVersion.current) {
          setGroups(g);
          setSittings(s);
          setJobs(j);
          setAuthorized(true);
          setMore((flags) => ({
            ...flags,
            groups: g.length === 50,
            sittings: s.length === 50,
            jobs: j.length === 50,
          }));
        }
      }
    } catch (cause) {
      if (current === listVersion.current) problem(cause);
    } finally {
      if (current === listVersion.current) setLoading(false);
    }
  }
  async function openGroup(id: string, after?: string) {
    const current = ++groupVersion.current;
    selectedGroup.current = id;
    if (!after) setGroup(null);
    try {
      const next = await get<Cohort>(
        `groups/${id}?limit=50${after ? `&after=${after}` : ""}`,
      );
      if (current === groupVersion.current) {
        setGroup((previous) =>
          after && previous?.id === id && previous.revision === next.revision
            ? {
              ...next,
              members: [...(previous.members ?? []), ...(next.members ?? [])],
            }
            : next
        );
        setMore((flags) => ({
          ...flags,
          members: next.members?.length === 50,
        }));
      }
    } catch (cause) {
      if (current === groupVersion.current) problem(cause);
    }
  }
  async function openJob(id: string, after?: string) {
    const current = ++jobVersion.current;
    if (selectedJob.current !== id) setJob(null);
    selectedJob.current = id;
    try {
      const next = await get<RosterJob>(
        `jobs/${id}?limit=50${after ? `&after=${after}` : ""}`,
      );
      if (current === jobVersion.current) {
        setJob((previous) =>
          after && previous?.id === id && previous.revision === next.revision
            ? {
              ...next,
              targets: [...(previous.targets ?? []), ...(next.targets ?? [])],
            }
            : next
        );
        setMore((flags) => ({
          ...flags,
          targets: next.targets?.length === 50,
        }));
      }
    } catch (cause) {
      if (current === jobVersion.current) problem(cause);
    }
  }
  async function search(value: string, after?: string) {
    const current = ++directoryVersion.current;
    query.current = value;
    try {
      const next = await get<DirectoryMember[]>(
        `directory?limit=50&q=${encodeURIComponent(value)}${
          after ? `&after=${after}` : ""
        }`,
      );
      if (current === directoryVersion.current) {
        setDirectory((rows) => after ? [...rows, ...next] : next);
        setMore((flags) => ({ ...flags, directory: next.length === 50 }));
      }
    } catch (cause) {
      if (current === directoryVersion.current) problem(cause);
    }
  }
  async function send(
    action?: string,
    data?: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    if (flight.current) return null;
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const current = epoch.current;
    let result: Record<string, unknown> | null = null;
    try {
      if (!engine.current) {
        throw new Error(t("cohorts.notReady"));
      }
      result = await (action
        ? engine.current.commands.execute(action, data ?? {})
        : engine.current.commands.retry()) as Record<string, unknown> | null;
      if (current === epoch.current) {
        setNotice(
          action === "job.create"
            ? t("cohorts.jobCreated")
            : action === "job.cancel"
            ? t("cohorts.jobCancelled")
            : t("cohorts.recorded"),
        );
        await load();
        if (selectedGroup.current) {
          await openGroup(selectedGroup.current);
        }
        if (selectedJob.current) {
          await openJob(selectedJob.current);
        }
      }
    } catch (cause) {
      if (current === epoch.current) problem(cause);
    } finally {
      if (current === epoch.current) {
        try {
          setPending(await engine.current?.commands.pending() ?? null);
        } catch (cause) {
          problem(cause);
        }
        setBusy(false);
      }
      flight.current = false;
    }
    return result;
  }
  useEffect(() => {
    const current = ++epoch.current;
    void load();
    void search("");
    void openCohortCommands(tenant, actor).then(async (next) => {
      try {
        const saved = await next.commands.pending();
        if (current !== epoch.current) {
          next.close();
          return;
        }
        engine.current = next;
        setPending(saved);
        setReady(true);
      } catch (cause) {
        next.close();
        throw cause;
      }
    }).catch((cause) => {
      if (current === epoch.current) problem(cause);
    });
    return () => {
      epoch.current++;
      listVersion.current++;
      groupVersion.current++;
      jobVersion.current++;
      directoryVersion.current++;
      engine.current?.close();
      engine.current = null;
    };
  }, [tenant, actor]);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.state)) return;
    const interval = setInterval(() => {
      if (!flight.current && selectedJob.current) {
        void openJob(selectedJob.current);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [job?.id, job?.state]);
  return {
    groups,
    sittings,
    jobs,
    group,
    job,
    directory,
    more,
    loading,
    busy,
    ready: ready && authorized,
    error,
    notice,
    pending,
    load,
    openGroup,
    openJob,
    search,
    send,
    moreDirectory: () => search(query.current, directory.at(-1)?.id),
  };
}
