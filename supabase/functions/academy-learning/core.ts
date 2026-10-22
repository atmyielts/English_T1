// Shared plumbing for the academy-learning function: responses, errors,
// scope checks, Telegram transport and private-file signing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getS3Config, signStorageRef } from "../_shared/media-storage.ts";
import { validClassroomStorage } from "../academy/resource-access.ts";
import { isUuid, type Row } from "./lib.ts";

// deno-lint-ignore no-explicit-any
export type Db = any;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const env = (key: string): string | undefined => Deno.env.get(key) ?? undefined;
export const requiredEnv = (key: string): string => {
  const value = env(key);
  if (!value) throw new HttpError(500, `Missing env var: ${key}`);
  return value;
};

export const serviceClient = (): Db =>
  createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

export const anonClient = (): Db =>
  createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });

/** Maps a Postgres/PostgREST error code from a command RPC to an HTTP error. */
export const rpcError = (error: { code?: string; message?: string } | null, fallback: string): HttpError => {
  const code = error?.code ?? "";
  if (code === "42501") return new HttpError(403, error?.message || "Your current access does not cover this.");
  if (code === "23505") return new HttpError(409, error?.message || "This changed. Refresh and try again.");
  if (code === "P0001" || code.startsWith("22") || code === "23514") return new HttpError(400, error?.message || fallback);
  return new HttpError(503, fallback);
};

export const rpc = async <T = unknown>(sb: Db, name: string, args: Row, fallback: string): Promise<T> => {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw rpcError(error, fallback);
  return data as T;
};

const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
export const secretEquals = async (supplied: string, expected: string): Promise<boolean> => {
  if (!supplied || !expected) return false;
  const [a, b] = await Promise.all([digest(supplied), digest(expected)]);
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
};

// ---------------------------------------------------------------------------
// Staff scope (from academy_current_authorities via academy_homework_staff_scope)
// ---------------------------------------------------------------------------

export type StaffScope = { academy_wide: boolean; classroom_ids: string[]; contact_ids: string[]; roles: string[]; allowed: boolean };

export const staffScope = async (sb: Db, academyId: string, actorId: string, capability: string): Promise<StaffScope> => {
  if (!isUuid(academyId)) throw new HttpError(400, "academy_id is required");
  const { data, error } = await sb.rpc("academy_homework_staff_scope", { p_academy: academyId, p_actor: actorId, p_capability: capability });
  if (error) {
    if (error.code === "42501") throw new HttpError(403, "Forbidden");
    throw new HttpError(503, "We could not confirm your Academy access. Retry.");
  }
  const scope = data as StaffScope;
  return {
    academy_wide: scope?.academy_wide === true,
    classroom_ids: Array.isArray(scope?.classroom_ids) ? scope.classroom_ids.map(String) : [],
    contact_ids: Array.isArray(scope?.contact_ids) ? scope.contact_ids.map(String) : [],
    roles: Array.isArray(scope?.roles) ? scope.roles.map(String) : [],
    allowed: scope?.allowed === true,
  };
};

export const requireScope = async (sb: Db, academyId: string, actorId: string, capability: string): Promise<StaffScope> => {
  const scope = await staffScope(sb, academyId, actorId, capability);
  if (!scope.allowed) throw new HttpError(403, "Forbidden");
  return scope;
};

export const scopeCovers = (scope: StaffScope, classroomId: string, contactId?: string | null): boolean =>
  scope.academy_wide || scope.classroom_ids.includes(classroomId) || (!!contactId && scope.contact_ids.includes(contactId));

export const learningPlan = async (sb: Db, academyId: string): Promise<Row> => {
  const { data, error } = await sb.rpc("academy_learning_plan", { p_academy: academyId });
  if (error || !data) throw new HttpError(503, "We could not confirm this academy's plan. Retry.");
  return data as Row;
};

export const requireCapability = async (sb: Db, academyId: string, capability: "homework" | "courses" | "homework_ai") => {
  const plan = await learningPlan(sb, academyId);
  if ((plan.allowed as Row | undefined)?.[capability] !== true) {
    throw new HttpError(402, "This needs an active Schood Teaching plan or centre tier.", "teaching_plan_required");
  }
  return plan;
};

export const configFlag = async (sb: Db, key: string): Promise<boolean> => {
  const { data } = await sb.rpc("academy_learning_flag", { p_key: key });
  return data === true;
};

export const auditEvent = async (sb: Db, args: {
  academyId: string; actorUserId: string | null; action: string; targetType: string; targetId?: string | null;
  contactId?: string | null; classroomId?: string | null; metadata?: Row;
}) => {
  const { error } = await sb.from("academy_audit_events").insert({
    academy_id: args.academyId, actor_user_id: args.actorUserId, action: args.action, target_type: args.targetType,
    target_id: args.targetId ?? null, contact_id: args.contactId ?? null, classroom_id: args.classroomId ?? null,
    status: "ok", metadata: args.metadata ?? {},
  });
  if (error) console.warn(JSON.stringify({ event: "academy_learning_audit_failed", action: args.action }));
};

// ---------------------------------------------------------------------------
// Private files
// ---------------------------------------------------------------------------

export const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

/** Signs a submission file only when it sits under that submission's classroom prefix. */
export const signSubmissionFile = async (sb: Db, storage: unknown, owner: Row): Promise<string | null> => {
  if (!storage || typeof storage !== "object") return null;
  const bucket = getS3Config()?.bucket ?? null;
  if (!validClassroomStorage(storage as Row, owner, "submission", bucket)) return null;
  try {
    return await signStorageRef(sb, storage as Row, SIGNED_URL_TTL_SECONDS, { route: "academy-learning.sign" });
  } catch {
    return null;
  }
};

export const submissionFiles = (metadata: unknown): Row[] => {
  const meta = (metadata && typeof metadata === "object" ? metadata : {}) as Row;
  const files: Row[] = [];
  if (meta.storage && typeof meta.storage === "object") files.push(meta.storage as Row);
  if (Array.isArray(meta.pages)) for (const page of meta.pages.slice(0, 10)) if (page && typeof page === "object") files.push(page as Row);
  return files;
};

// ---------------------------------------------------------------------------
// Telegram (the student bot, @schoodstudentbot, shares TELEGRAM_BOT_TOKEN)
// ---------------------------------------------------------------------------

export type Telegram = {
  call: (method: string, body: Row) => Promise<Row>;
  download: (fileId: string, limitBytes: number) => Promise<{ bytes: Uint8Array<ArrayBuffer>; filePath: string }>;
};

export const telegramClient = (token: string, fetcher: typeof fetch = fetch): Telegram => ({
  call: async (method, body) => {
    const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => ({})) as Row;
    if (!response.ok) {
      console.warn(JSON.stringify({ event: "academy_learning_telegram_failed", method, status: response.status }));
      if (response.status === 429 || response.status >= 500) throw new HttpError(503, `Telegram ${method} failed`);
    }
    return payload;
  },
  download: async (fileId, limitBytes) => {
    const info = await fetcher(`https://api.telegram.org/bot${token}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
      signal: AbortSignal.timeout(15000),
    }).then((r) => r.json()).catch(() => null) as Row | null;
    const result = info?.result as Row | undefined;
    const filePath = typeof result?.file_path === "string" ? result.file_path : "";
    if (!info?.ok || !filePath) throw new HttpError(422, "Telegram could not provide this file.", "telegram_file_unavailable");
    if (Number(result?.file_size ?? 0) > limitBytes) throw new HttpError(413, "This file is too large for Telegram hand-in.", "telegram_file_too_large");
    const response = await fetcher(`https://api.telegram.org/file/bot${token}/${filePath}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new HttpError(422, "Telegram could not provide this file.", "telegram_file_unavailable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limitBytes) throw new HttpError(413, "This file is too large for Telegram hand-in.", "telegram_file_too_large");
    return { bytes, filePath };
  },
});

/** Student notifications go through send-telegram so preferences and the outbox apply. */
export const notifyStudent = async (args: {
  userId: string | null; text: string; dedupeKey: string; ctaUrl?: string | null; metadata?: Row;
}): Promise<void> => {
  if (!args.userId) return;
  const url = env("SUPABASE_URL"), serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) return;
  await fetch(`${url}/functions/v1/send-telegram`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: args.userId, text: args.text, parse_mode: "HTML", notification_type: "homework_feedback",
      category: "academic_required", dedupe_key: args.dedupeKey, cta_url: args.ctaUrl ?? null, metadata: args.metadata ?? {},
    }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => console.warn(JSON.stringify({ event: "academy_learning_notify_failed" })));
};
