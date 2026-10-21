import { useEffect, useRef, useState } from "react";
import { request } from "../../../packages/assessment-web/src/client";
import { CertificateCard } from "../../../packages/assessment-web/src/CertificateCard";
import {
  certificateProblem,
  type CertificateRow,
} from "../../../packages/assessment-web/src/certificates";
import "../../../packages/assessment-web/src/certificates.css";
export function CandidateCertificates(
  { tenant, actor }: { tenant: string; actor: string },
) {
  const [rows, setRows] = useState<CertificateRow[]>([]),
    [loading, setLoading] = useState(true),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    alive = useRef(true),
    version = useRef(0);
  async function load(after?: string) {
    const current = ++version.current;
    setLoading(true);
    setError("");
    try {
      const next = await request<CertificateRow[]>(
        `certificates/candidate?limit=50${after ? `&after=${after}` : ""}`,
        tenant,
        undefined,
        undefined,
        undefined,
        actor,
      );
      if (alive.current && current === version.current) {
        setRows((rows) => after ? [...rows, ...next] : next);
        setMore(next.length === 50);
      }
    } catch (cause) {
      if (alive.current && current === version.current) {
        setRows([]);
        setError(certificateProblem(cause));
        setMore(false);
      }
    } finally {
      if (alive.current && current === version.current) setLoading(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      version.current++;
    };
  }, [tenant, actor]);
  return (
    <section
      className="certificates-panel"
      aria-labelledby="candidate-certificates-title"
      aria-busy={loading}
    >
      <h2 id="candidate-certificates-title">Your certificates</h2>
      <p>
        Your institution issues certificates using independently approved award
        criteria and released results. Sharing is your choice.{" "}
        <a href="?verify_certificate=1">Verify a signed certificate</a>
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p role="status">Checking certificate records…</p>}
      {!loading && !error && !rows.length && (
        <p>No certificates have been issued for this institution yet.</p>
      )}
      {rows.map((row) => (
        <CertificateCard
          key={`${row.id}:${row.revision}`}
          row={row}
          tenant={tenant}
          actor={actor}
        />
      ))}
      <div className="certificate-actions">
        <button
          className="quiet"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh certificates
        </button>
        {more && (
          <button
            className="quiet"
            disabled={loading}
            onClick={() => void load(rows.at(-1)?.id)}
          >
            Load more certificates
          </button>
        )}
      </div>
    </section>
  );
}
