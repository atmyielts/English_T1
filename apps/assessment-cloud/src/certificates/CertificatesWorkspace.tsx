import { useCertificates } from "./use-certificates";
import { ProgramEditor } from "./ProgramEditor";
import { CertificateIssuer } from "./CertificateIssuer";
import { CertificateDecision } from "./CertificateDecision";
import { CertificateReplacement } from "./CertificateReplacement";
import { CertificateCard } from "../../../../packages/assessment-web/src/CertificateCard";
import "../../../../packages/assessment-web/src/certificates.css";
import { useAppT } from "../i18n/index.ts";
export function CertificatesWorkspace(
  { tenant, actor }: { tenant: string; actor: string },
) {
  const t = useAppT();
  const state = useCertificates(tenant, actor),
    disabled = state.busy || state.loading || !state.ready || !!state.pending;
  return (
    <div className="certificates-panel" aria-busy={state.loading || state.busy}>
      {state.error && <p role="alert" className="error">{state.error}</p>}
      {state.notice && <p role="status" className="notice">{state.notice}</p>}
      {state.loading && (
        <p role="status">{t("certificates.checking")}</p>
      )}
      {!state.ready && !state.error && (
        <p role="status">{t("certificates.preparing")}</p>
      )}
      {state.pending && (
        <section>
          <h2>{t("certificates.pendingTitle")}</h2>
          <p>
            {t("certificates.pendingBody")}
          </p>
          <button
            disabled={state.busy}
            onClick={() => void state.send()}
          >
            {t("certificates.retry")}
          </button>
        </section>
      )}
      <button
        className="quiet"
        disabled={state.busy || state.loading}
        onClick={() =>
          void state.load()}
      >
        {t("certificates.refresh")}
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
          {t("certificates.morePrograms")}
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
          {t("certificates.issuanceDisabled")}
        </p>
      )}
      {state.more.results && (
        <button
          className="quiet"
          disabled={disabled}
          onClick={() => void state.page("results")}
        >
          {t("certificates.moreResults")}
        </button>
      )}
      <section>
        <h2>{t("certificates.listTitle")}</h2>
        {!state.loading && !state.certificates.length && (
          <p>{t("certificates.empty")}</p>
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
            {t("certificates.more")}
          </button>
        )}
      </section>
    </div>
  );
}
