// Exactly-once activity submits for answers sent later (the offline session).
//
// The learner app gives every queued submit a client attempt id and may send it
// more than once: a sync can be cut off after the server recorded the attempt
// but before the browser saw the answer. The first request with an id claims
// it, runs the normal submit and stores the response; a repeat gets the stored
// response back (with `replayed: true`) and records nothing. A repeat that
// arrives while the first is still running gets 409, and the browser retries
// later. Requests without an id behave exactly as before.
//
// Table: english_client_attempts (migration 20261026120000). If it is missing
// (code deployed before the migration), submits run without dedupe.

import { authUser, corsHeaders, extractRoute } from "./english-learning.ts";

export const CLIENT_ATTEMPT_ID = /^[A-Za-z0-9_-]{8,64}$/;
/** A claim older than this whose request never finished may be taken over. */
export const CLAIM_STALE_MS = 5 * 60_000;
/** Stored responses larger than this keep only their headline fields. */
const MAX_STORED_CHARS = 60_000;

/** True for "/<collection>/<slug>/submit", e.g. isSubmitPath("/units/past-simple/submit", "units"). */
export const isSubmitPath = (route: string, collection: string): boolean => {
  const parts = route.split("/");
  return parts.length === 4 && parts[0] === "" && parts[1] === collection && Boolean(parts[2]) && parts[3] === "submit";
};

export const parseClientAttemptId = (value: unknown): string | null =>
  typeof value === "string" && CLIENT_ATTEMPT_ID.test(value) ? value : null;

export type ClaimRow = { status: "pending" | "done"; response: unknown; created_at: string };

export type ClaimDecision = "new" | "replay" | "in_progress" | "stale";

/** What to do with a request, given the row already stored for its id (if any). */
export const decideClaim = (row: ClaimRow | null, nowMs: number): ClaimDecision => {
  if (!row) return "new";
  if (row.status === "done" && row.response && typeof row.response === "object") return "replay";
  const age = nowMs - Date.parse(row.created_at);
  return Number.isFinite(age) && age < CLAIM_STALE_MS ? "in_progress" : "stale";
};

/** The response kept for replays: the whole body when small, else the fields the app shows in a summary. */
export const storableResponse = (body: unknown): Record<string, unknown> => {
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : { value: body };
  if (JSON.stringify(record).length <= MAX_STORED_CHARS) return record;
  const keep: Record<string, unknown> = { trimmed: true };
  for (const key of ["ok", "attempt_id", "score", "correct", "total", "no_questions", "mode", "recorded"]) {
    if (key in record) keep[key] = record[key];
  }
  return keep;
};

/** Storage for claims; the Supabase version is below, tests use an in-memory one. */
export type ClaimStore = {
  get: (userId: string, id: string) => Promise<ClaimRow | null>;
  /** Inserts a pending claim; false when the id is already claimed. */
  claim: (userId: string, id: string, serviceKey: string, route: string) => Promise<boolean>;
  /** Takes over a stale pending claim; false when someone else did first. */
  reclaim: (userId: string, id: string, staleBeforeIso: string) => Promise<boolean>;
  complete: (userId: string, id: string, response: Record<string, unknown>) => Promise<void>;
  release: (userId: string, id: string) => Promise<void>;
};

const replyJson = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

/**
 * Runs `submit` at most once per (learner, client attempt id). Without an id,
 * or when the store fails, `submit` simply runs.
 */
export const withClientAttempt = async (
  store: ClaimStore,
  input: { userId: string; clientAttemptId: string | null; serviceKey: string; route: string; now?: () => number },
  submit: () => Promise<Response>,
): Promise<Response> => {
  const id = input.clientAttemptId;
  if (!id) return await submit();
  const now = input.now ?? Date.now;

  const unavailable = async (error: unknown) => {
    console.error(JSON.stringify({ event: "english_client_attempt_unavailable", message: String((error as Error)?.message ?? error) }));
    return await submit();
  };

  let row: ClaimRow | null;
  try {
    row = await store.get(input.userId, id);
  } catch (error) {
    return await unavailable(error);
  }
  const decision = decideClaim(row, now());
  if (decision === "replay") return replyJson(200, { ...(row!.response as Record<string, unknown>), replayed: true });
  if (decision === "in_progress") {
    return replyJson(409, { error: "This answer is already being saved. Try again in a moment.", code: "client_attempt_in_progress" });
  }

  let claimed: boolean;
  try {
    claimed = decision === "new"
      ? await store.claim(input.userId, id, input.serviceKey, input.route)
      : await store.reclaim(input.userId, id, new Date(now() - CLAIM_STALE_MS).toISOString());
  } catch (error) {
    return await unavailable(error);
  }
  if (!claimed) {
    // Lost a race with a parallel request for the same id.
    const winner = await store.get(input.userId, id).catch(() => null);
    if (winner && decideClaim(winner, now()) === "replay") return replyJson(200, { ...(winner.response as Record<string, unknown>), replayed: true });
    return replyJson(409, { error: "This answer is already being saved. Try again in a moment.", code: "client_attempt_in_progress" });
  }

  let response: Response;
  try {
    response = await submit();
  } catch (error) {
    await store.release(input.userId, id).catch(() => undefined);
    throw error;
  }
  if (!response.ok) {
    // Nothing was recorded (refused, invalid, failed): the id may be used again.
    await store.release(input.userId, id).catch(() => undefined);
    return response;
  }
  try {
    const body = await response.clone().json();
    await store.complete(input.userId, id, storableResponse(body));
  } catch (error) {
    // The attempt is recorded; only replay protection for this id is lost.
    console.error(JSON.stringify({ event: "english_client_attempt_store_failed", message: String((error as Error)?.message ?? error) }));
  }
  return response;
};

const TABLE = "english_client_attempts";

export const supabaseClaimStore = (sb: any): ClaimStore => ({
  get: async (userId, id) => {
    const { data, error } = await sb.from(TABLE)
      .select("status, response, created_at")
      .eq("user_id", userId)
      .eq("client_attempt_id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? data as ClaimRow : null;
  },
  claim: async (userId, id, serviceKey, route) => {
    const { data, error } = await sb.from(TABLE)
      .upsert(
        { user_id: userId, client_attempt_id: id, service_key: serviceKey, route: route.slice(0, 200), status: "pending" },
        { onConflict: "user_id,client_attempt_id", ignoreDuplicates: true },
      )
      .select("client_attempt_id");
    if (error) throw new Error(error.message);
    return Array.isArray(data) && data.length > 0;
  },
  reclaim: async (userId, id, staleBeforeIso) => {
    const { data, error } = await sb.from(TABLE)
      .update({ created_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("client_attempt_id", id)
      .eq("status", "pending")
      .lt("created_at", staleBeforeIso)
      .select("client_attempt_id");
    if (error) throw new Error(error.message);
    return Array.isArray(data) && data.length > 0;
  },
  complete: async (userId, id, response) => {
    const { error } = await sb.from(TABLE)
      .update({ status: "done", response, completed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("client_attempt_id", id);
    if (error) throw new Error(error.message);
  },
  release: async (userId, id) => {
    await sb.from(TABLE).delete().eq("user_id", userId).eq("client_attempt_id", id).eq("status", "pending");
  },
});

/** Reads `client_attempt_id` from a JSON body without consuming the request. */
const clientAttemptIdOf = async (req: Request): Promise<string | null> => {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return null;
  try {
    const body = await req.clone().json();
    return parseClientAttemptId(body && typeof body === "object" ? (body as Record<string, unknown>).client_attempt_id : null);
  } catch {
    return null;
  }
};

/**
 * Wraps a skill function's request handler: POSTs to a submit route that carry
 * a client attempt id run at most once. Everything else passes straight through.
 * The learner is identified here too (only for these requests) because the
 * claim is per learner; the handler still does its own auth and access checks.
 */
export const dedupeSubmits = (
  config: { serviceKey: string; routeMarker: string; isSubmitRoute: (route: string) => boolean; client: () => any },
  handler: (req: Request) => Promise<Response>,
) =>
async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return await handler(req);
  let route = "";
  try {
    route = extractRoute(new URL(req.url), config.routeMarker).replace(/\/+$/, "");
  } catch {
    return await handler(req);
  }
  if (!config.isSubmitRoute(route)) return await handler(req);
  const clientAttemptId = await clientAttemptIdOf(req);
  if (!clientAttemptId) return await handler(req);
  let sb: any;
  let userId: string | null = null;
  try {
    sb = config.client();
    userId = (await authUser(sb, req))?.userId ?? null;
  } catch {
    userId = null;
  }
  if (!userId) return await handler(req);
  return await withClientAttempt(
    supabaseClaimStore(sb),
    { userId, clientAttemptId, serviceKey: config.serviceKey, route },
    () => handler(req),
  );
};
