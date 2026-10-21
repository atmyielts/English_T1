import { supabase } from "./client";
import type { CertificateEnvelope } from "../../assessment-core/src/certificates";
import type {
  CertificateLocale,
  CertificateReference,
} from "../../assessment-core/src/certificate-document";
import {LocalizedError,english} from './i18n/translate.ts';
export interface CertificateReferenceResult {
  status: string;
  replacement_id?: string;
  checked_at?: string;
  certificate: CertificateEnvelope;
  documents: {
    sha256: string;
    locale: string;
    byte_length: number;
    renderer_id: string;
  }[];
}
async function bounded(response: Response, max: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new LocalizedError("certificate.document.documentResponseArrived");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new LocalizedError("certificate.document.documentResponseExceededLimit");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
function endpoint(path: string) {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new LocalizedError("certificate.document.certificateDeliveryConfigured");
  const url = new URL(
    `${base}/functions/v1/assessment-cloud/certificates/${path}`,
  );
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) throw new LocalizedError("certificate.document.useSecureCertificateEndpoint");
  return url;
}
export async function downloadCertificatePdf(
  tenant: string,
  actor: string,
  id: string,
  locale: CertificateLocale,
) {
  const current = await supabase!.auth.getSession();
  if (current.data.session?.user.id !== actor) {
    throw new LocalizedError("certificate.document.signedAccountChangedReopen");
  }
  const url = endpoint(`${id}/pdf`);
  url.searchParams.set("tenant_id", tenant);
  url.searchParams.set("locale", locale);
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      headers: {
        authorization: "Bearer " + current.data.session.access_token,
        apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""),
      },
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) {
      const value = JSON.parse(
        new TextDecoder().decode(await bounded(response, 8000)),
      );
      throw value.error ? Error(value.error) : new LocalizedError("certificate.document.pdfUnavailable");
    }
    if (response.headers.get("content-type") !== "application/pdf") {
      throw new LocalizedError("certificate.document.serviceReturnCertificatePdf");
    }
    const bytes = await bounded(response, 3000000),
      digest = [
        ...new Uint8Array(
          await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
        ),
      ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (
      digest !== response.headers.get("x-certificate-sha256") ||
      new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
    ) throw new LocalizedError("certificate.document.downloadedPdfMatchService");
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}
export async function resolveCertificateReference(
  reference: CertificateReference,
): Promise<CertificateReferenceResult> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint("reference/resolve"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""),
        },
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        body: JSON.stringify({ reference }),
        signal: controller.signal,
      }),
      value = JSON.parse(
        new TextDecoder().decode(await bounded(response, 100000)),
      );
    if (!response.ok) {
      throw Error(
        value.error ?? english("certificate.document.referenceUnconfirmed"),
      );
    }
    return value.data;
  } finally {
    clearTimeout(timer);
  }
}
