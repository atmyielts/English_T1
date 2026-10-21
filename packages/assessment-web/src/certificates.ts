import { request } from "./client";
import { ResponseJournal } from "./journal";
import { GradeCommands } from "./grade-command";
import {
  english,
  isWebKey,
  LocalizedError,
  messageText,
  type Translate,
} from "./i18n/translate.ts";
import {
  type CertificateClaims,
  certificateClaims,
  type CertificateEnvelope,
  certificateEnvelope,
  certificateMessage,
  unbase64url,
} from "../../assessment-core/src/certificates";
export interface CertificateProgram {
  id: string;
  title: string;
  description: string;
  minimum_percent: number;
  valid_days: number | null;
  created_by: string;
  approved_by: string | null;
  review_hash: string;
  retirement?: { retired_at: string; reason: string } | null;
}
export interface CertificateRow {
  id: string;
  state: string;
  revision: number;
  claims: CertificateClaims;
  current_result: boolean;
  pdf_enabled?: boolean;
  attempt_id?: string;
  replaces_certificate_id?: string | null;
  replacement_id?: string | null;
  replacement_pending?: boolean;
}
export interface CertificateResult {
  id?: string;
  attempt_id: string;
  score_revision_id: string;
  generation: number;
  candidate: string;
  exam: string;
}
export interface CertificatePublicKey {
  id: string;
  jwk: JsonWebKey;
  revoked: boolean;
}
export async function openCertificateCommands(tenant: string, actor: string) {
  if (!navigator.locks) {
    throw new LocalizedError("certificate.locks");
  }
  const scope = `certificates:${tenant}:${actor}`,
    journal = await ResponseJournal.create(scope);
  const commands = new GradeCommands(
    {
      async pending() {
        const rows = await journal.pending();
        if (!rows.length) return null;
        const input = rows[0].response as {
          action: string;
          data: Record<string, unknown>;
        };
        return { ...input, key: rows[0].command_key };
      },
      async save(action, data) {
        const entry = await journal.append(1, "certificate-command", {
          action,
          data,
        });
        return { action, data, key: entry.command_key };
      },
      acknowledge: () => journal.acknowledge(1),
    },
    (intent) =>
      request(
        "certificates/commands",
        tenant,
        { action: intent.action, data: intent.data },
        undefined,
        intent.key,
        actor,
      ),
    async <T>(work: () => Promise<T>): Promise<T> =>
      await navigator.locks.request(
        `schood-certificate-commands:${scope}`,
        work,
      ),
    "certificate",
  );
  return { commands, close: () => journal.close() };
}
export async function certificatePublicRequest<T>(
  path: "keys" | "verify",
  certificate?: CertificateEnvelope,
): Promise<T> {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) throw new LocalizedError("certificate.verify.unconfigured");
  const endpoint = new URL(
    `${base}/functions/v1/assessment-cloud/certificates/${path}`,
  );
  if (
    endpoint.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
  ) throw new LocalizedError("certificate.verify.insecure");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
        method: certificate ? "POST" : "GET",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          ...(import.meta.env.VITE_SUPABASE_ANON_KEY
            ? { apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY) }
            : {}),
        },
        signal: controller.signal,
        ...(certificate ? { body: JSON.stringify({ certificate }) } : {}),
      }),
      body = await response.json();
    if (!response.ok) {
      throw body.error
        ? new Error(body.error)
        : new LocalizedError("certificate.verify.failed");
    }
    return body.data;
  } finally {
    clearTimeout(timer);
  }
}
export async function verifyCertificateSignature(
  value: unknown,
  keys: CertificatePublicKey[],
) {
  const envelope = certificateEnvelope(value),
    key = keys.find((key) => key.id === envelope.key_id);
  if (!key || key.revoked) {
    throw new LocalizedError("certificate.verify.untrustedKey");
  }
  const imported = await crypto.subtle.importKey(
    "jwk",
    key.jwk,
    "Ed25519",
    false,
    ["verify"],
  );
  if (
    !await crypto.subtle.verify(
      "Ed25519",
      imported,
      unbase64url(envelope.signature),
      certificateMessage(envelope),
    )
  ) throw new LocalizedError("certificate.verify.signatureMismatch");
  return { envelope, claims: certificateClaims(envelope.payload) };
}
/** Known certificate refusals are translated under `certificate.code.<code>`. */
export function certificateProblem(cause: unknown, t: Translate = english) {
  const code = (cause as { code?: string })?.code,
    key = `certificate.code.${code}`;
  return code && isWebKey(key)
    ? t(key)
    : cause instanceof Error && cause.name === "AbortError"
    ? t("certificate.problem.timeout")
    : messageText(cause, t, "certificate.problem.failed");
}
