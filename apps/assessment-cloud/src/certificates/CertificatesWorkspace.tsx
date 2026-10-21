import { useCertificates } from "./use-certificates";
import { ProgramEditor } from "./ProgramEditor";
import { CertificateIssuer } from "./CertificateIssuer";
import { CertificateDecision } from "./CertificateDecision";
import { CertificateReplacement } from "./CertificateReplacement";
import { CertificateCard } from "../../../../packages/assessment-web/src/CertificateCard";
import "../../../../packages/assessment-web/src/certificates.css";
export function CertificatesWorkspace(
  { tenant, actor }: { tenant: string; actor: string },
) {
  const state = useCertificates(tenant, actor),
    disabled = state.busy || state.loading || !state.ready || !!state.pending;
  return (
    <div className="certificates-panel" aria-busy={state.loading || state.busy}>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      {state.notice && <p role="status" className="notice">{state.notice}</p>}
      {state.loading && (
        <p role="status">Checking certificate programs and results…</p>
      )}
      {!state.ready && !state.error && (
        <p role="status">Preparing secure certificate recovery…</p>
      )}
      {state.pending && (
        <section>
          <h2>Saved certificate request needs a receipt</h2>
          <p>
            Retry the saved request before another change. A prepared
            certificate is not issued until its signing receipt commits.
          </p>
          <button
            disabled={state.busy}
            onClick={() => void state.send()}
          >
            Retry saved certificate request
          </button>
        </section>
      )}
      <button
        className="quiet"
        disabled={state.busy || state.loading}
        onClick={() =>
          void state.load()}
      >
        Refresh certificates
      </button>
      <ProgramEditor
        programs={state.programs}
        actor={actor}
        disabled={disabled}
        send={state.send}
      />
      {state.more.programs && (
        <button
          className="quiet"
          disabled={disabled}
          onClick={() => void state.page("programs")}
        >
          Load more certificate programs
        </button>
      )}
      <CertificateIssuer
        programs={state.programs}
        results={state.results}
        disabled={disabled || !state.issuanceReady}
        send={state.send}
      />
      {!state.loading && !state.issuanceReady && (
        <p role="status">
          Certificate issuance is not enabled and configured for this
          environment. Program approval and revocation remain available to
          authorized managers.
        </p>
      )}
      {state.more.results && (
        <button
          className="quiet"
          disabled={disabled}
          onClick={() => void state.page("results")}
        >
          Load more certificate results
        </button>
      )}
      <section>
        <h2>Issued and pending certificates</h2>
        {!state.loading && !state.certificates.length && (
          <p>No certificate records yet.</p>
        )}
        {state.certificates.map((row) => (
          <div key={`${row.id}:${row.revision}`}>
            <CertificateCard row={row} actor={actor} tenant={tenant} />
            <CertificateReplacement
              row={row}
              programs={state.programs}
              results={state.results}
              disabled={disabled || !state.issuanceReady}
              send={state.send}
            />
            <CertificateDecision
              row={row}
              disabled={disabled}
              send={state.send}
            />
          </div>
        ))}
        {state.more.certificates && (
          <button
            className="quiet"
            disabled={disabled}
            onClick={() => void state.page("certificates")}
          >
            Load more certificates
          </button>
        )}
      </section>
    </div>
  );
}
