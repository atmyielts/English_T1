import React, { useEffect, useRef, useState } from "react";
import { request, supabase } from "./client";
import { certificateProblem, type CertificateRow } from "./certificates";
import type { CertificateEnvelope } from "../../assessment-core/src/certificates";
import type { CertificateLocale } from "../../assessment-core/src/certificate-document";
import { downloadCertificatePdf } from "./certificate-document";
import { useI18n } from "../../service-i18n/src/i18n.tsx";
import { isWebKey, LocalizedError } from "./i18n/translate.ts";
import { useWebT } from "./i18n/useWebT.ts";
/** Lifecycle state words; unknown states are shown as sent. */
function certificateStateText(state: string, t: ReturnType<typeof useWebT>) {
  const key = `certificate.state.${state}`;
  return isWebKey(key) ? t(key) : state;
}
export function CertificateCard(
  { row, tenant, actor }: {
    row: CertificateRow;
    tenant: string;
    actor: string;
  },
) {
  const t = useWebT(), { date } = useI18n();
  const shortDate = (value: string) =>
    date(value, { year: "numeric", month: "numeric", day: "numeric" });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ack, setAck] = useState(false),
    [locale, setLocale] = useState<CertificateLocale>("en"),
    claims = row.claims;
  const lifecycle = useRef(0), alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      lifecycle.current++;
    };
  }, [tenant, actor, row.id]);
  async function download(kind: "json" | "pdf" = "json") {
    const epoch = ++lifecycle.current;
    setBusy(true);
    setError("");
    try {
      const signed = kind === "pdf"
        ? await downloadCertificatePdf(tenant, actor, row.id, locale)
        : await request<CertificateEnvelope>(
          `certificates/${row.id}/download`,
          tenant,
          undefined,
          undefined,
          undefined,
          actor,
        );
      const current = await supabase!.auth.getSession();
      if (!alive.current || epoch !== lifecycle.current) return;
      if (current.data.session?.user.id !== actor) {
        throw new LocalizedError("certificate.document.signedAccountChangedReopen");
      }
      const blob = new Blob([
          kind === "pdf"
            ? new Uint8Array(signed as Uint8Array)
            : JSON.stringify(signed, null, 2),
        ], {
          type: kind === "pdf" ? "application/pdf" : "application/json",
        }),
        url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `schood-certificate-${row.id}${
        kind === "pdf" ? "-" + locale + ".pdf" : ".json"
      }`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      if (alive.current && epoch === lifecycle.current) {
        setError(certificateProblem(cause, t));
      }
    } finally {
      if (alive.current && epoch === lifecycle.current) setBusy(false);
    }
  }
  return (
    <article className="certificate-card">
      <h3>{claims.achievement}</h3>
      <p>
        <strong>{claims.recipient}</strong> ·{" "}
        {t(
          row.state === "pending" || row.state === "cancelled"
            ? "certificate.card.preparedFor"
            : "certificate.card.issuedBy",
          { issuer: claims.issuer },
        )}
      </p>
      <p>{claims.criteria}</p>
      <p>
        {t("certificate.card.score", {
          score: claims.score,
          max: claims.maximum_score,
          exam: claims.exam,
          generation: claims.grading_generation,
        })}
      </p>
      <p>
        {t("certificate.card.status", {
          status: row.replacement_id && row.state === "issued"
            ? t("certificate.card.replacedRetained")
            : certificateStateText(row.state, t),
        })}
        {!row.current_result ? t("certificate.card.newerResult") : ""}
      </p>
      <p>
        {t(
          row.state === "pending" || row.state === "cancelled"
            ? "certificate.card.prepared"
            : "certificate.card.issued",
          { date: shortDate(claims.issued_at) },
        )}
        {claims.expires_at
          ? t("certificate.card.expires", { date: shortDate(claims.expires_at) })
          : t("certificate.card.noExpiry")}
      </p>
      <p className="certificate-reference">
        {t("certificate.card.reference", { id: row.id })}
      </p>
      {row.claims.replaces_certificate_id && (
        <p className="certificate-reference">
          {t("certificate.card.replaces", {
            id: row.claims.replaces_certificate_id,
          })}
        </p>
      )}
      {row.replacement_id && (
        <p className="certificate-reference">
          {t("certificate.card.replacedBy", { id: row.replacement_id })}
        </p>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      {["issued", "revoked"].includes(row.state) && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={ack}
              onChange={(event) => setAck(event.target.checked)}
              disabled={busy}
            />{t("certificate.card.ack")}
          </label>
          <button
            className="quiet"
            disabled={busy || !ack}
            onClick={() => void download()}
          >
            {t("certificate.card.download")}
          </button>
          {row.pdf_enabled && (
            <div className="certificate-pdf-controls">
              <label>
                {t("certificate.card.pdfLanguage")}<select
                  disabled={busy}
                  value={locale}
                  onChange={(event) =>
                    setLocale(event.target.value as CertificateLocale)}
                >
                  <option value="en">English</option>
                  <option value="uz">O‘zbekcha</option>
                  <option value="ru">Русский</option>
                </select>
              </label>
              <button
                className="quiet"
                disabled={busy || !ack}
                onClick={() => void download("pdf")}
              >
                {t("certificate.card.downloadPdf")}
              </button>
              <p className="hint">{t("certificate.card.pdfHint")}</p>
            </div>
          )}
          <p>{t("certificate.card.jsonNote")}</p>
        </>
      )}
    </article>
  );
}
