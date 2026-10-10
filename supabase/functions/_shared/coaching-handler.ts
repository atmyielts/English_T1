import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { boundedJson } from "./ai-response.ts";

export type CoachingAllowance = {
  limit: number;
  paid: boolean;
  addonAvailable: boolean;
  serviceLimit: number;
  enabled: boolean;
};
export type CoachingDependencies<Input, Feedback> = {
  client: SupabaseClient;
  authenticate: (token: string) => Promise<string | null>;
  allowance: (token: string) => Promise<CoachingAllowance>;
  generate: (input: Input) => Promise<Feedback>;
  reportProviderFailure?: (event: {
    service: string;
    request_id: string;
    code: string;
  }) => void;
};

// Never copy provider bodies, error messages or learner content into logs.
export function coachingProviderFailureCode(failure: unknown): string {
  if (!(failure instanceof Error)) return "provider_unknown";
  if (/^provider_http_[1-5][0-9]{2}$/.test(failure.message)) {
    return failure.message;
  }
  const safeCodes = new Set([
    "invalid_provider_result",
    "invalid_provider_score",
    "invalid_provider_criteria",
    "invalid_provider_text",
    "invalid_provider_advice",
    "invalid_json",
    "body_timeout",
    "body_too_large",
    "provider_unavailable",
  ]);
  if (safeCodes.has(failure.message)) return failure.message;
  if (["TimeoutError", "AbortError"].includes(failure.name)) {
    return "provider_timeout";
  }
  if (failure instanceof SyntaxError) return "invalid_provider_json";
  if (failure instanceof TypeError) return "provider_transport";
  return "provider_unknown";
}
type Configuration<Input, Feedback> = {
  service: "writing-tutor" | "speaking-coach" | "sat-tutor";
  title: string;
  action: string;
  versionHeader: string;
  historyTable?: string;
  historySelect?: string;
  history?: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
  parseInput: (body: Record<string, unknown>) => Input;
  prepareInput?: (input: Input) => Promise<Input>;
  isSaved?: (result: Record<string, unknown>) => boolean;
  completion: (
    input: Input,
    feedback: Feedback,
  ) => { name: string; args: Record<string, unknown> };
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class CoachingInputError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const createCoachingHandler = <Input, Feedback>(
  deps: CoachingDependencies<Input, Feedback>,
  config: Configuration<Input, Feedback>,
) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Expose-Headers": config.versionHeader,
    [config.versionHeader]: "2",
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });
  const error = (
    status: number,
    code: string,
    message: string,
    requestId?: string,
  ) => json(status, { error: message, code, request_id: requestId });
  const isSaved = (value: Record<string, unknown> | null) =>
    value &&
    (config.isSaved ? config.isSaved(value) : Boolean(value.session_id));
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (!["GET", "POST"].includes(req.method)) {
      return error(
        405,
        "method_not_allowed",
        "Use GET to read and POST to grade.",
      );
    }
    const token = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)
      ?.[1];
    if (!token) return error(401, "unauthorized", "Sign in to continue.");
    let user: string | null;
    try {
      user = await deps.authenticate(token);
    } catch {
      return error(
        503,
        "auth_unavailable",
        "Account verification is unavailable. Your draft is unchanged.",
      );
    }
    if (!user) {
      return error(
        401,
        "unauthorized",
        "Your session has expired. Sign in again to continue.",
      );
    }
    const client = deps.client;
    const quota = async (policy: CoachingAllowance) => {
      const { data, error: failure } = await client.from(
        "ai_request_usage_daily",
      ).select("charged,attempts")
        .eq("scope", "user:" + user).eq("service", config.service).eq(
          "usage_date",
          new Date().toISOString().slice(0, 10),
        ).maybeSingle();
      if (failure) throw failure;
      const used = Number(data?.charged ?? 0),
        attempts = Number(data?.attempts ?? 0);
      return {
        api_version: 2,
        used,
        limit: policy.limit,
        remaining: Math.max(0, policy.limit - used),
        has_paid_access: policy.paid,
        addon_available: policy.addonAvailable,
        enabled: policy.enabled,
        attempts_remaining: Math.max(0, policy.limit * 3 - attempts),
      };
    };
    const savedResponse = async (
      saved: Record<string, unknown>,
      policy: CoachingAllowance,
      requestId: string,
      replayed = false,
    ) =>
      json(200, {
        ...saved,
        request_id: requestId,
        quota: await quota(policy).catch(() => null),
        replayed,
      });
    try {
      const url = new URL(req.url);
      let body: Record<string, unknown> = {};
      if (req.method === "POST") {
        try {
          const value = await boundedJson(req, 100000);
          if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("invalid_json");
          }
          body = value as Record<string, unknown>;
        } catch (failure) {
          return error(
            failure instanceof Error && failure.message === "body_too_large"
              ? 413
              : 400,
            "invalid_body",
            "Use a valid JSON request within the size limit.",
          );
        }
      }
      const action = String(
        url.searchParams.get("action") ?? body.action ?? config.action,
      );
      if (action === "quota" && req.method === "GET") {
        return json(200, await quota(await deps.allowance(token)));
      }
      if (action === "history" && req.method === "GET") {
        if (!config.historyTable || !config.historySelect || !config.history) {
          return error(404, "not_found", "This action is unavailable.");
        }
        const { data, error: failure } = await client.from(config.historyTable)
          .select(config.historySelect)
          .eq("user_id", user).order("created_at", { ascending: false }).limit(
            20,
          );
        if (failure) throw failure;
        return json(200, {
          sessions: config.history(
            (data ?? []) as unknown as Record<string, unknown>[],
          ),
        });
      }
      if (action === "result" && req.method === "GET") {
        const id = url.searchParams.get("request_id") ?? "";
        if (!uuid.test(id)) {
          return error(
            400,
            "invalid_request_id",
            "Use a valid request reference.",
          );
        }
        const { data, error: failure } = await client.from("ai_request_ledger")
          .select("status,result,failure_code")
          .eq("user_id", user).eq("service", config.service).eq(
            "request_id",
            id,
          ).maybeSingle();
        if (failure) throw failure;
        if (!data) {
          return error(404, "request_not_found", "No saved request was found.");
        }
        return json(200, { ...data, request_id: id });
      }
      if (action !== config.action) {
        return error(404, "not_found", "This action is unavailable.");
      }
      if (req.method !== "POST") {
        return error(405, "method_not_allowed", "Grading requires POST.");
      }
      const requestId = typeof body.request_id === "string"
        ? body.request_id
        : "";
      if (!uuid.test(requestId)) {
        return error(
          400,
          "refresh_required",
          "Refresh the page before grading. A valid request reference is required.",
        );
      }
      let input: Input;
      try {
        input = config.parseInput(body);
      } catch (failure) {
        return error(400, "invalid_input", (failure as Error).message);
      }
      if (config.prepareInput) input = await config.prepareInput(input);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(input)),
      );
      const requestHash = Array.from(
        new Uint8Array(digest),
        (value) => value.toString(16).padStart(2, "0"),
      ).join("");
      const policy = await deps.allowance(token);
      const { data: reservation, error: reserveError } = await client.rpc(
        "reserve_ai_request",
        {
          p_user_id: user,
          p_service: config.service,
          p_request_id: requestId,
          p_request_hash: requestHash,
          p_user_limit: policy.limit,
          p_global_limit: policy.enabled ? policy.serviceLimit : 0,
        },
      );
      if (reserveError || !reservation) {
        throw reserveError ?? new Error("Invalid reservation");
      }
      if (reservation.status === "conflict") {
        return error(
          409,
          "request_conflict",
          "This request reference belongs to different text. Start a new request.",
          requestId,
        );
      }
      if (
        reservation.status === "succeeded" && isSaved(reservation.result)
      ) {
        return savedResponse(reservation.result, policy, requestId, true);
      }
      if (reservation.status === "user_limit") {
        return error(
          429,
          "quota_exceeded",
          "Your daily request or retry allowance is used. It resets at midnight UTC.",
          requestId,
        );
      }
      if (reservation.status === "service_limit") {
        return error(
          503,
          "service_limit",
          "AI grading is currently unavailable. Your draft is unchanged; try again later.",
          requestId,
        );
      }
      if (reservation.replay || reservation.status !== "reserved") {
        return error(
          409,
          "request_" + reservation.status,
          "This request was already received. Check its saved result before starting another grading request.",
          requestId,
        );
      }
      if (!uuid.test(reservation.lease_token ?? "")) {
        throw new Error("Invalid dispatch lease");
      }
      const command = {
        p_user_id: user,
        p_service: config.service,
        p_request_id: requestId,
        p_lease_token: reservation.lease_token,
      };
      const { data: started, error: startError } = await client.rpc(
        "begin_ai_request",
        command,
      );
      if (startError) throw startError;
      if (started !== true) {
        return error(
          409,
          "request_not_started",
          "This grading request could not start. Check its status before trying again.",
          requestId,
        );
      }
      let feedback: Feedback;
      try {
        feedback = await deps.generate(input);
      } catch (failure) {
        try {
          deps.reportProviderFailure?.({
            service: config.service,
            request_id: requestId,
            code: coachingProviderFailureCode(failure),
          });
        } catch { /* Observability cannot interrupt receipt finalization. */ }
        try {
          await client.rpc("finish_ai_request", {
            ...command,
            p_status: "uncertain",
            p_result: null,
            p_failure_code: "provider_unconfirmed",
          });
        } catch { /* Receipt may need reconciliation. */ }
        return error(
          502,
          "provider_unconfirmed",
          "Feedback could not be confirmed. This request is still counted because the provider may have processed it. Your draft is unchanged.",
          requestId,
        );
      }
      // Retrying this SQL command cannot create another history row or provider
      // charge. It also covers a lost response after a successful DB commit.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data: saved, error: saveError } = await client.rpc(
            config.completion(input, feedback).name,
            {
              p_user_id: user,
              p_request_id: requestId,
              p_lease_token: reservation.lease_token,
              ...config.completion(input, feedback).args,
            },
          );
          if (!saveError && isSaved(saved)) {
            return savedResponse(saved, policy, requestId);
          }
        } catch {
          /* Retrying only this idempotent database command is safe. */
        }
      }
      try {
        await client.rpc("finish_ai_request", {
          ...command,
          p_status: "uncertain",
          p_result: null,
          p_failure_code: "save_unconfirmed",
        });
      } catch { /* Never claim an unconfirmed save succeeded. */ }
      return error(
        503,
        "save_unconfirmed",
        "The saved result could not be confirmed. Check this request again; your draft is unchanged.",
        requestId,
      );
    } catch (failure) {
      if (failure instanceof CoachingInputError) {
        return error(failure.status, "invalid_input", failure.message);
      }
      return error(
        503,
        "service_unavailable",
        config.title +
          " is temporarily unavailable. Your draft is unchanged. Try again later.",
      );
    }
  };
};
