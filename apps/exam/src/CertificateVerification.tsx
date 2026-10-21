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
type Verification = {
  status: string;
  signature_verified: boolean;
  claims: CertificateClaims;
  checked_at?: string;
  pdf_match?: boolean;
  replacement_id?: string;
};
const messages: Record<string, string> = {
  valid: "Valid at the time checked",
  revoked: "Revoked by the institution",
  expired: "Expired",
  superseded: "Superseded by a newer released result",
  replaced:
    "Replaced by a new certificate — this original is no longer current",
  under_review: "Under academic review — do not treat as currently confirmed",
  not_found: "Not recognized as an issued certificate",
};
export function CertificateVerification() {
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
          error:
            "This certificate QR reference is incomplete or invalid. Scan the original QR again or select the original signed JSON file.",
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
        setError(
          "This certificate QR reference is incomplete or invalid. Scan the original QR again or select the original signed JSON file.",
        );
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
          throw new Error("Use a certificate PDF smaller than 3 MB.");
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
          throw new Error(
            "The QR reference does not match the signed certificate.",
          );
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
        throw new Error(
          "Use a signed certificate JSON file smaller than 32 KB.",
        );
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
          throw new Error("The issuer did not confirm the signature.");
        }
        if (verified.claims.certificate_id !== local.claims.certificate_id) {
          throw new Error(
            "The verification response refers to another certificate.",
          );
        }
        setResult({ ...verified, claims: local.claims });
      }
    } catch (cause) {
      if (current === version.current) {
        setError(
          cause instanceof Error ? cause.message : "Verification failed.",
        );
      }
    } finally {
      if (current === version.current) setBusy(false);
    }
  }
  return (
    <div className="exam-workspace">
      <ServiceHeader service="Certificate verification" />
      <main id="workspace-main" tabIndex={-1}>
        <h1>Verify a Schood certificate</h1>
        <section className="certificates-panel">
          <p>
            No account is needed. Use the certificate QR reference below or
            select a signed certificate file. Its signature is checked in your
            browser against this service's published keys, then the
            institution's current status is checked. Names and results are sent
            to the verifier only after you agree.
          </p>
          {reference && (
            <div className="certificate-reference">
              <h2>Certificate QR reference</h2>
              <p>
                This reference allows its holder to retrieve the institution’s
                signed recipient name and result. Nothing is sent until you
                agree and verify. The reference was removed from the address
                bar.
              </p>
              <p>Certificate: {reference.id}</p>
              <label>
                Optional PDF to compare<input
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
              <p className="hint">
                The PDF stays in your browser. Its file hash is compared with
                the institution’s rendered-document receipts; the PDF itself is
                not uploaded or opened.
              </p>
            </div>
          )}
          <form onSubmit={(event) => void verify(event)}>
            <label>
              Signed certificate file<input
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
              />I have permission to submit the name and result in this
              certificate for verification.
            </label>
            <button disabled={busy || (!file && !reference) || !ack}>
              Verify signature and current status
            </button>
          </form>
          {busy && (
            <p role="status">Checking signature and institution status…</p>
          )}
          {error && (
            <p className="error" role="alert">
              {error} No current validity has been confirmed.
            </p>
          )}
          {result && (
            <div className="certificate-verify-result" role="status">
              <h2>
                {messages[result.status] ??
                  "Current status could not be confirmed"}
              </h2>
              <p>
                Cryptographic signature verified. This does not independently
                prove accreditation or the real-world identity of the recipient.
              </p>
              <h3>{result.claims.achievement}</h3>
              <p>{result.claims.recipient} · {result.claims.issuer}</p>
              <p>
                {result.claims.score} / {result.claims.maximum_score} ·{" "}
                {result.claims.exam}
              </p>
              <p>Certificate: {result.claims.certificate_id}</p>
              {result.claims.replaces_certificate_id && (
                <p className="certificate-reference">
                  This signed credential replaces certificate{" "}
                  {result.claims.replaces_certificate_id}.
                </p>
              )}
              {result.status === "replaced" && (
                <p className="certificate-reference">
                  Ask the holder for the replacement
                  credential{result.replacement_id
                    ? ` (${result.replacement_id})`
                    : ""}{" "}
                  and verify it separately. This original reference does not
                  disclose the replacement’s signed details.
                </p>
              )}
              {result.pdf_match !== undefined && (
                <p>
                  {result.pdf_match
                    ? "This file matches an institution-rendered PDF receipt."
                    : "This file does not match a known rendered PDF receipt. Its visible contents have not been confirmed; compare them with the signed details above."}
                  {" "}
                  This is not a PDF digital signature.
                </p>
              )}
              {result.checked_at && (
                <p>
                  Checked{" "}
                  {new Date(result.checked_at).toLocaleString()}. A downloaded
                  copy does not carry future revocation updates.
                </p>
              )}
            </div>
          )}
          <a href={location.pathname}>Return to Schood Exam</a>
        </section>
      </main>
    </div>
  );
}
