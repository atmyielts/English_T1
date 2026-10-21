import React, { useEffect, useRef, useState } from "react";
import { request, supabase } from "./client";
import { certificateProblem, type CertificateRow } from "./certificates";
import type { CertificateEnvelope } from "../../assessment-core/src/certificates";
import type { CertificateLocale } from "../../assessment-core/src/certificate-document";
import { downloadCertificatePdf } from "./certificate-document";
export function CertificateCard(
  { row, tenant, actor }: {
    row: CertificateRow;
    tenant: string;
    actor: string;
  },
) {
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
        throw new Error(
          "The signed-in account changed. Reopen your certificate list.",
        );
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
        setError(certificateProblem(cause));
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
        {row.state === "pending" || row.state === "cancelled"
          ? "Prepared for"
          : "Issued by"} {claims.issuer}
      </p>
      <p>{claims.criteria}</p>
      <p>
        {claims.score} / {claims.maximum_score} points · {claims.exam}{" "}
        · Grading generation {claims.grading_generation}
      </p>
      <p>
        Record status: {row.replacement_id && row.state === "issued"
          ? "replaced (original record retained)"
          : row.state}
        {!row.current_result ? " · A newer released result exists" : ""}
      </p>
      <p>
        {row.state === "pending" || row.state === "cancelled"
          ? "Prepared"
          : "Issued"} {new Date(claims.issued_at).toLocaleDateString()}
        {claims.expires_at
          ? ` · Expires ${new Date(claims.expires_at).toLocaleDateString()}`
          : " · No scheduled expiry"}
      </p>
      <p className="certificate-reference">Certificate reference: {row.id}</p>
      {row.claims.replaces_certificate_id && (
        <p className="certificate-reference">
          Replaces certificate: {row.claims.replaces_certificate_id}
        </p>
      )}
      {row.replacement_id && (
        <p className="certificate-reference">
          Replaced by certificate:{" "}
          {row.replacement_id}. This original remains available for historical
          verification; use the replacement’s current status before relying on
          an award.
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
            />I understand the signed file contains the recipient name and
            result. Anyone I share it with can read these details. A PDF
            verification QR also lets its holder retrieve the signed details.
          </label>
          <button
            className="quiet"
            disabled={busy || !ack}
            onClick={() => void download()}
          >
            Download signed certificate
          </button>
          {row.pdf_enabled && (
            <div className="certificate-pdf-controls">
              <label>
                PDF language<select
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
                Download certificate PDF
              </button>
              <p className="hint">
                Only document labels change language. The institution’s signed
                names, achievement and criteria stay unchanged.
              </p>
            </div>
          )}
          <p>
            The signed JSON credential is not a digitally signed PDF. Check its
            current status before relying on it.
          </p>
        </>
      )}
    </article>
  );
}
