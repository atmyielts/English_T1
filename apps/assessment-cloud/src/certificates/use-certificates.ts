import { useEffect, useRef, useState } from "react";
import {
  request,
  ServiceRequestError,
} from "../../../../packages/assessment-web/src/client";
import {
  certificateProblem as certificateProblemText,
  type CertificateProgram,
  type CertificateResult,
  type CertificateRow,
  openCertificateCommands,
} from "../../../../packages/assessment-web/src/certificates";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
import { useAppT } from "../i18n/index.ts";
export function useCertificates(tenant: string, actor: string) {
  const t = useAppT(),
    certificateProblem = (cause: unknown) => certificateProblemText(cause, t);
  const [programs, setPrograms] = useState<CertificateProgram[]>([]),
    [certificates, setCertificates] = useState<CertificateRow[]>([]),
    [results, setResults] = useState<CertificateResult[]>([]),
    [more, setMore] = useState({
      programs: false,
      certificates: false,
      results: false,
    });
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [authorized, setAuthorized] = useState(false),
    [issuanceReady, setIssuanceReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState<GradeIntent | null>(null),
    engine = useRef<Awaited<ReturnType<typeof openCertificateCommands>> | null>(
      null,
    ),
    epoch = useRef(0),
    version = useRef(0),
    flight = useRef(false);
  const get = <T>(path: string) =>
    request<T>(
      `certificates/${path}`,
      tenant,
      undefined,
      undefined,
      undefined,
      actor,
    );
  async function load() {
    const current = ++version.current;
    setLoading(true);
    try {
      const [p, c, r, access] = await Promise.all([
        get<CertificateProgram[]>("programs?limit=50"),
        get<CertificateRow[]>("institution?limit=50"),
        get<CertificateResult[]>("results?limit=50"),
        get<{ can_manage: boolean; issuance_enabled: boolean }>("access"),
      ]);
      if (current === version.current) {
        setAuthorized(true);
        setIssuanceReady(access.can_manage && access.issuance_enabled);
        setPrograms(p);
        setCertificates(c);
        setResults(r);
        setMore({
          programs: p.length === 50,
          certificates: c.length === 50,
          results: r.length === 50,
        });
      }
    } catch (cause) {
      if (current === version.current) {
        setError(certificateProblem(cause));
        if (
          cause instanceof ServiceRequestError &&
          [401, 403].includes(cause.status)
        ) {
          setPrograms([]);
          setCertificates([]);
          setResults([]);
          setMore({ programs: false, certificates: false, results: false });
          setAuthorized(false);
        }
      }
    } finally {
      if (current === version.current) setLoading(false);
    }
  }
  async function page(kind: "programs" | "certificates" | "results") {
    const current = ++version.current;
    setLoading(true);
    const rows = kind === "programs"
        ? programs
        : kind === "certificates"
        ? certificates
        : results,
      after = rows.at(-1)?.id;
    if (!after) {
      setLoading(false);
      return;
    }
    try {
      const next = await get<unknown[]>(
        `${
          kind === "certificates" ? "institution" : kind
        }?limit=50&after=${after}`,
      );
      if (current === version.current) {
        if (kind === "programs") {
          setPrograms((rows) => [...rows, ...next as CertificateProgram[]]);
        } else if (kind === "certificates") {
          setCertificates((rows) => [...rows, ...next as CertificateRow[]]);
        } else setResults((rows) => [...rows, ...next as CertificateResult[]]);
        setMore((flags) => ({ ...flags, [kind]: next.length === 50 }));
      }
    } catch (cause) {
      if (current === version.current) {
        setError(certificateProblem(cause));
        if (
          cause instanceof ServiceRequestError &&
          [401, 403].includes(cause.status)
        ) {
          setPrograms([]);
          setCertificates([]);
          setResults([]);
          setMore({ programs: false, certificates: false, results: false });
          setAuthorized(false);
        }
      }
    } finally {
      if (current === version.current) setLoading(false);
    }
  }
  async function send(action?: string, data?: Record<string, unknown>) {
    if (flight.current) return false;
    flight.current = true;
    const current = epoch.current;
    setBusy(true);
    setError("");
    setNotice("");
    let committed = false;
    try {
      if (!engine.current) {
        throw new Error(t("certificates.notReady"));
      }
      if (action) await engine.current.commands.execute(action, data ?? {});
      else await engine.current.commands.retry();
      committed = true;
      if (current === epoch.current) {
        setNotice(
          t("certificates.recorded"),
        );
        await load();
      }
    } catch (cause) {
      if (current === epoch.current) setError(certificateProblem(cause));
    } finally {
      if (current === epoch.current) {
        try {
          setPending(await engine.current?.commands.pending() ?? null);
        } catch (cause) {
          setError(certificateProblem(cause));
        }
        setBusy(false);
      }
      flight.current = false;
    }
    return committed;
  }
  useEffect(() => {
    const current = ++epoch.current;
    void load();
    void openCertificateCommands(tenant, actor).then(async (next) => {
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
      if (current === epoch.current) setError(certificateProblem(cause));
    });
    return () => {
      epoch.current++;
      version.current++;
      engine.current?.close();
      engine.current = null;
    };
  }, [tenant, actor]);
  return {
    programs,
    certificates,
    results,
    more,
    loading,
    busy,
    ready: ready && authorized,
    issuanceReady,
    error,
    notice,
    pending,
    load,
    page,
    send,
  };
}
