import { ContractError } from "../../../packages/assessment-core/src/mod.ts";
import type { CertificateEnvelope } from "../../../packages/assessment-core/src/certificates.ts";
import type { CertificateLocale } from "../../../packages/assessment-core/src/certificate-document.ts";
export interface CertificatePdf {
  bytes: Uint8Array;
  renderer_id: string;
  sha256: string;
  payload_hash: string;
  locale: CertificateLocale;
}
export interface CertificateDocumentRenderer {
  render(
    certificate: CertificateEnvelope,
    locale: CertificateLocale,
    verificationUrl: string,
  ): Promise<CertificatePdf>;
}
const encoder = new TextEncoder(),
  hex = (value: ArrayBuffer) =>
    [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
export async function documentDigest(bytes: Uint8Array) {
  return hex(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
}
export async function documentMac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
export function createCertificateDocumentTransport(
  endpoint: string,
  secret: string,
  { allowLocalhost = false, fetcher = fetch }: {
    allowLocalhost?: boolean;
    fetcher?: typeof fetch;
  } = {},
): CertificateDocumentRenderer {
  const url = new URL(endpoint),
    local = allowLocalhost &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username || url.password || url.search || url.hash ||
    url.pathname !== "/render" || secret.length < 32
  ) {
    throw new Error(
      "Invalid private certificate document transport configuration.",
    );
  }
  return {
    async render(certificate, locale, verificationUrl) {
      const body = encoder.encode(
          JSON.stringify({
            certificate,
            locale,
            verification_url: verificationUrl,
          }),
        ),
        time = String(Date.now()),
        nonce = crypto.randomUUID(),
        signature = await documentMac(
          secret,
          `request.v1\n${time}\n${nonce}\n${await documentDigest(body)}`,
        ),
        controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetcher(url, {
          method: "POST",
          redirect: "manual",
          credentials: "omit",
          headers: {
            "content-type": "application/json",
            "x-document-time": time,
            "x-document-nonce": nonce,
            "x-document-signature": signature,
          },
          body: new Uint8Array(body),
          signal: controller.signal,
        });
        const unavailable = () =>
          new ContractError(
            "certificate_document_unavailable",
            "The certificate document service could not confirm a PDF. Retry later; the signed credential is still available.",
            503,
          );
        if (
          !response.ok ||
          response.headers.get("content-type") !== "application/pdf"
        ) {
          await response.body?.cancel();
          throw unavailable();
        }
        const renderer = response.headers.get("x-document-renderer") ?? "",
          digest = response.headers.get("x-document-sha256") ?? "",
          payload = response.headers.get("x-document-payload") ?? "",
          mac = response.headers.get("x-document-signature") ?? "",
          length = Number(response.headers.get("content-length"));
        if (
          ![renderer, digest, payload, mac].every((value) =>
            /^[a-f0-9]{64}$/.test(value)
          ) || !Number.isSafeInteger(length) || length < 100 || length > 3000000
        ) {
          await response.body?.cancel();
          throw unavailable();
        }
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["verify"],
          ),
          message =
            `response.v1\n${nonce}\n${renderer}\n${digest}\n${payload}\n${locale}\n${length}`;
        if (
          !await crypto.subtle.verify(
            "HMAC",
            key,
            Uint8Array.from(mac.match(/../g)!, (byte) => parseInt(byte, 16)),
            encoder.encode(message),
          )
        ) {
          await response.body?.cancel();
          throw unavailable();
        }
        const reader = response.body?.getReader();
        if (!reader) throw unavailable();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > length || size > 3000000) {
              await reader.cancel();
              throw unavailable();
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
        if (
          size !== length ||
          new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-" ||
          await documentDigest(bytes) !== digest
        ) throw unavailable();
        return {
          bytes,
          renderer_id: renderer,
          sha256: digest,
          payload_hash: payload,
          locale,
        };
      } catch (cause) {
        if (cause instanceof ContractError) throw cause;
        throw new ContractError(
          "certificate_document_unavailable",
          "No confirmed PDF arrived. Retry later; no extra certificate was issued.",
          503,
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
