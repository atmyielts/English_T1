import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  type CertificatePublicKey,
  certificatePublicRequest,
  verifyCertificateSignature,
} from "../../../packages/assessment-web/src/certificates";
import type { CertificateClaims } from "../../../packages/assessment-core/src/certificates";
import { ServiceHeader } from "../../../packages/service-design/src/ServiceHeader";
import "../../../packages/assessment-web/src/certificates.css";
import {
  type CertificateReference,
  decodeCertificateReference,
  referenceForCertificate,
} from "../../../packages/assessment-core/src/certificate-document";
import { resolveCertificateReference } from "../../../packages/assessment-web/src/certificate-document";
import { LocaleSwitcher, useI18n } from "../../../packages/service-i18n/src/i18n.tsx";
import { errorText } from "../../../packages/assessment-web/src/i18n/errors.ts";
import { useAppT } from "./i18n/index.ts";
type Verification = {
  status: string;
  signature_verified: boolean;
  claims: CertificateClaims;
  checked_at?: string;
  pdf_match?: boolean;
  replacement_id?: string;
};
const statuses = [
  "valid",
  "revoked",
  "expired",
  "superseded",
  "replaced",
  "under_review",
  "not_found",
] as const;
export function CertificateVerification() {
  const t = useAppT(), { date } = useI18n(), translate = useRef(t);
  translate.current = t;
  const statusText = (status: string) =>
    (statuses as readonly string[]).includes(status)
      ? t(`exam.verify.status.${status as (typeof statuses)[number]}`)
      : t("exam.verify.status.unknown");
  const [initial] = useState(
    (): { reference: CertificateReference | null; error: string } => {
      try {
        return {
          reference: location.hash.startsWith("#certificate=")
            ? decodeCertificateReference(
              location.hash.slice("#certificate=".length),
            )
            : null,
          error: "",
        };
      } catch {
        return {
          reference: null,
          error: t("exam.verify.invalidReference"),
        };
      }
    },
  );
  const [reference, setReference] = useState<CertificateReference | null>(
      initial.reference,
    ),
    [pdf, setPdf] = useState<File | null>(null);
  const [file, setFile] = useState<File | null>(null),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initial.error),
    [result, setResult] = useState<Verification | null>(null),
    version = useRef(0),
    jsonInput = useRef<HTMLInputElement>(null),
    pdfInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => {
    version.current++;
  }, []);
  useEffect(() => {
    const removeReference = () => {
      if (location.hash.startsWith("#certificate=")) {
        history.replaceState(null, "", location.pathname + location.search);
      }
    };
    const changeReference = () => {
      if (!location.hash.startsWith("#certificate=")) return;
      version.current++;
      setBusy(false);
      setAck(false);
      setResult(null);
      setFile(null);
      setPdf(null);
      if (jsonInput.current) jsonInput.current.value = "";
      if (pdfInput.current) pdfInput.current.value = "";
      try {
        setReference(
          decodeCertificateReference(
            location.hash.slice("#certificate=".length),
          ),
        );
        setError("");
      } catch {
        setReference(null);
        setError(translate.current("exam.verify.invalidReference"));
      }
      removeReference();
    };
    removeReference();
    window.addEventListener("hashchange", changeReference);
    return () => window.removeEventListener("hashchange", changeReference);
  }, []);
  async function verify(event: FormEvent) {
    event.preventDefault();
    if ((!file && !reference) || !ack) return;
    const current = ++version.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (reference) {
        if (pdf && pdf.size > 3000000) {
          throw new Error(t("exam.verify.pdfTooLarge"));
        }
        const resolved = await resolveCertificateReference(reference),
          keys = await certificatePublicRequest<CertificatePublicKey[]>("keys"),
          local = await verifyCertificateSignature(resolved.certificate, keys),
          actualReference = await referenceForCertificate(local.envelope);
        if (
          local.claims.certificate_id !== reference.id ||
          actualReference.payload_hash !== reference.payload_hash ||
          local.envelope.signature !== reference.signature ||
          local.envelope.key_id !== reference.key_id
        ) {
          throw new Error(t("exam.verify.referenceMismatch"));
        }
        let pdfMatch: boolean | undefined;
        if (pdf) {
          const bytes = await pdf.arrayBuffer(),
            digest = [
              ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
          pdfMatch = resolved.documents.some((row) =>
            row.sha256 === digest && row.byte_length === bytes.byteLength
          );
        }
        if (current === version.current) {
          setResult({
            status: resolved.status,
            claims: local.claims,
            signature_verified: true,
            checked_at: resolved.checked_at,
            replacement_id: resolved.replacement_id,
            pdf_match: pdfMatch,
          });
        }
        return;
      }
      if (file!.size > 32000) {
        throw new Error(t("exam.verify.jsonTooLarge"));
      }
      const value = JSON.parse(await file!.text()),
        keys = await certificatePublicRequest<CertificatePublicKey[]>("keys"),
        local = await verifyCertificateSignature(value, keys);
      if (current !== version.current) return;
      const verified = await certificatePublicRequest<Verification>(
        "verify",
        local.envelope,
      );
      if (current === version.current) {
        if (!verified.signature_verified) {
          throw new Error(t("exam.verify.issuerUnconfirmed"));
        }
        if (verified.claims.certificate_id !== local.claims.certificate_id) {
          throw new Error(t("exam.verify.otherCertificate"));
        }
        setResult({ ...verified, claims: local.claims });
      }
    } catch (cause) {
      if (current === version.current) {
        setError(errorText(cause, t, "exam.verify.failed"));
      }
    } finally {
      if (current === version.current) setBusy(false);
    }
  }
  return (
    <div className="exam-workspace">
      <ServiceHeader
        service={t("exam.verify.service")}
        labels={{
          skip: t("header.skip"),
          home: t("header.home"),
          menu: t("header.menu"),
          workspace: t("header.workspace"),
        }}
      >
        <LocaleSwitcher label={t("locale.label")} />
      </ServiceHeader>
      <main id="workspace-main" tabIndex={-1}>
        <h1>{t("exam.verify.title")}</h1>
        <section className="certificates-panel">
          <p>{t("exam.verify.intro")}</p>
          {reference && (
            <div className="certificate-reference">
              <h2>{t("exam.verify.qrTitle")}</h2>
              <p>{t("exam.verify.qrIntro")}</p>
              <p>{t("exam.verify.certificate", { id: reference.id })}</p>
              <label>
                {t("exam.verify.pdf")}<input
                  ref={pdfInput}
                  type="file"
                  accept=".pdf,application/pdf"
                  disabled={busy}
                  onChange={(event) => {
                    version.current++;
                    setPdf(event.target.files?.[0] ?? null);
                    setAck(false);
                    setResult(null);
                    setError("");
                  }}
                />
              </label>
              <p className="hint">{t("exam.verify.pdfHint")}</p>
            </div>
          )}
          <form onSubmit={(event) => void verify(event)}>
            <label>
              {t("exam.verify.file")}<input
                ref={jsonInput}
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(event) => {
                  version.current++;
                  setReference(null);
                  setPdf(null);
                  setFile(event.target.files?.[0] ?? null);
                  setAck(false);
                  setResult(null);
                  setError("");
                }}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={ack}
                disabled={busy}
                onChange={(event) => setAck(event.target.checked)}
              />{t("exam.verify.ack")}
            </label>
            <button disabled={busy || (!file && !reference) || !ack}>
              {t("exam.verify.submit")}
            </button>
          </form>
          {busy && (
            <p role="status">{t("exam.verify.checking")}</p>
          )}
          {error && (
            <p className="error" role="alert">
              {t("exam.verify.error", { error })}
            </p>
          )}
          {result && (
            <div className="certificate-verify-result" role="status">
              <h2>
                {statusText(result.status)}
              </h2>
              <p>{t("exam.verify.signatureVerified")}</p>
              <h3>{result.claims.achievement}</h3>
              <p>{result.claims.recipient} · {result.claims.issuer}</p>
              <p>
                {result.claims.score} / {result.claims.maximum_score} ·{" "}
                {result.claims.exam}
              </p>
              <p>
                {t("exam.verify.certificate", {
                  id: result.claims.certificate_id,
                })}
              </p>
              {result.claims.replaces_certificate_id && (
                <p className="certificate-reference">
                  {t("exam.verify.replaces", {
                    id: result.claims.replaces_certificate_id,
                  })}
                </p>
              )}
              {result.status === "replaced" && (
                <p className="certificate-reference">
                  {t(
                    result.replacement_id
                      ? "exam.verify.askReplacementId"
                      : "exam.verify.askReplacement",
                    { id: result.replacement_id ?? "" },
                  )}
                </p>
              )}
              {result.pdf_match !== undefined && (
                <p>
                  {t(
                    result.pdf_match
                      ? "exam.verify.pdfMatch"
                      : "exam.verify.pdfMismatch",
                  )}
                </p>
              )}
              {result.checked_at && (
                <p>
                  {t("exam.verify.checked", { date: date(result.checked_at) })}
                </p>
              )}
            </div>
          )}
          <a href={location.pathname}>{t("exam.verify.return")}</a>
        </section>
      </main>
    </div>
  );
}
