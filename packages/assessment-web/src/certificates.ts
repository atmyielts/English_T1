import { request } from "./client";
import { ResponseJournal } from "./journal";
import { GradeCommands } from "./grade-command";
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
    throw new Error(
      "Use a browser with secure workspace locking to issue certificates.",
    );
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
  if (!base) throw new Error("Certificate verification is not configured.");
  const endpoint = new URL(
    `${base}/functions/v1/assessment-cloud/certificates/${path}`,
  );
  if (
    endpoint.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
  ) throw new Error("Use a secure certificate verification endpoint.");
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
      throw new Error(body.error ?? "Certificate verification failed.");
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
    throw new Error(
      "This certificate signing key is not trusted or has been revoked.",
    );
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
  ) throw new Error("The certificate signature does not match.");
  return { envelope, claims: certificateClaims(envelope.payload) };
}
const problems: Record<string, string> = {
  certificate_program_retired:
    "This program is retired. Choose another independently approved program. An unfinished award under the retired program cannot be signed; an authorized manager can cancel it.",
  certificate_replacement_exists:
    "This certificate already has a replacement or an unfinished replacement request. Refresh and review its history.",
  certificate_replacement_subject_mismatch:
    "A replacement must use a released result from the original candidate’s same assessment attempt.",
  certificate_replacement_predecessor_changed:
    "The original certificate changed before the replacement was signed. Refresh and review it; cancel the unfinished replacement if necessary.",
  forbidden:
    "Your institution has not granted certificate management permission.",
  independent_certificate_approver_required:
    "Another certificate manager must approve this program.",
  certificate_program_review_required:
    "Refresh and review the current program before approval.",
  approved_certificate_program_required:
    "Choose an independently approved certificate program.",
  certificate_threshold_not_met:
    "The released score does not meet this program’s award threshold.",
  latest_released_result_required:
    "The released result changed. Refresh before issuing.",
  certificate_review_pending:
    "An appeal or new grading generation is pending. Resolve it before issuing.",
  certificate_identity_profile_required:
    "The institution and candidate need their recorded display names before issuance.",
  candidate_certificate_self_issue:
    "A candidate cannot issue a certificate for their own result.",
  certificate_revision_conflict:
    "The certificate changed. Refresh before recording another decision.",
  certificate_signing_key_unavailable:
    "The pinned signing key is unavailable. Keep and retry the saved request after the institution restores that key.",
  certificate_issuance_disabled:
    "Certificate issuance is not enabled and configured for this environment.",
};
export function certificateProblem(cause: unknown) {
  const code = (cause as { code?: string })?.code;
  return code && problems[code]
    ? problems[code]
    : cause instanceof Error && cause.name === "AbortError"
    ? "No receipt arrived in time. Retry the saved certificate request before another change."
    : cause instanceof Error
    ? cause.message
    : "The certificate request could not be completed.";
}
