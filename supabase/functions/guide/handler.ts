import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";
import { createGuideDraft } from "../_shared/guide-seed.ts";
import { goalChanges, goalTarget } from "../_shared/guide-goals.ts";
import { type GuideEvent, guideMetrics } from "../_shared/guide-metrics.ts";
import {
  type Answers,
  type Catalog,
  changeAnswer,
  checkBank,
  type GuideFlow,
  type Locale,
  locales,
  nextQuestion,
  normalizeAnswers,
  publicFlow,
  recommend,
  scoreCheck,
  validateFlow,
} from "../_shared/guide.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-guide-token, x-client-info, x-user-jwt",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
class RequestError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
function requireValue(
  value: unknown,
  code: string,
  status = 400,
): asserts value {
  if (!value) throw new RequestError(status, code);
}
const hash = async (value: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ].map((v) => v.toString(16).padStart(2, "0")).join("");
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const env = (name: string) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name}`);
  return v;
};
const checked = <T>(result: { data: T; error: unknown }): T => {
  if (result.error) throw result.error;
  return result.data;
};

function isPublicCredential(token: string, configuredAnon: string): boolean {
  if (!token || token === configuredAnon || token.startsWith("sb_publishable_")) {
    return true;
  }
  // API-key rotation can leave a valid public JWT different from the runtime key.
  // These UNVERIFIED claims only select the unauthenticated guest path; they never
  // establish identity or grant access. Every account operation still uses getUser.
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || token.length > 8192) return false;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims: unknown = JSON.parse(atob(payload));
    return object(claims) && claims.role === "anon" && !Object.hasOwn(claims, "sub");
  } catch {
    return false;
  }
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*\/guide/, "") || "/";
    const base = env("SUPABASE_URL");
    const anon = env("SUPABASE_ANON_KEY");
    const sb = createClient(base, env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    const explicitUserToken = req.headers.get("x-user-jwt");
    const authorization = explicitUserToken ??
      (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const hasUserCredential = explicitUserToken !== null ||
      !isPublicCredential(authorization, anon);
    const user = async () => {
      requireValue(
        hasUserCredential && authorization,
        "sign_in_required",
        401,
      );
      const result = await createClient(base, anon, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }).auth.getUser(authorization);
      requireValue(!result.error && result.data.user, "sign_in_required", 401);
      return result.data.user!;
    };
    const body = async (): Promise<Record<string, unknown>> => {
      requireValue(
        Number(req.headers.get("content-length") ?? 0) <= 250000,
        "request_too_large",
        413,
      );
      const text = await req.text();
      requireValue(text.length <= 250000, "request_too_large", 413);
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw new RequestError(400, "invalid_json");
      }
      requireValue(object(value), "invalid_request");
      return value as Record<string, unknown>;
    };
    const catalog = async (): Promise<Catalog> => {
      const [products, plans] = await Promise.all([
        sb.from("products").select("id,name,status,description,metadata").limit(
          1000,
        ),
        sb.from("plans").select(
          "id,product_id,name,amount,currency,duration_days,is_active,metadata",
        ).limit(
          1000,
        ),
      ]);
      return { products: checked(products) ?? [], plans: checked(plans) ?? [] };
    };
    const release = async () =>
      checked(
        await sb.from("guide_release").select("*").eq("id", true).single(),
      );
    const version = async (id: string) =>
      checked(
        await sb.from("guide_versions").select("*").eq("id", id).single(),
      );

    if (path.startsWith("/admin/")) {
      const permission = ["/admin/publish", "/admin/disable"].includes(path)
        ? "admin.settings.manage"
        : path === "/admin/analytics"
        ? "admin.analytics.view"
        : "admin.products.manage";
      const authz = await authorizeAdminRequest(sb, req, cors, {
        requiredPermission: permission,
        action: `guide${path}`,
      });
      if (!authz.ok) return authz.response;
      if (req.method === "GET" && path === "/admin/list") {
        return json(200, {
          release: await release(),
          versions: checked(
            await sb.from("guide_versions").select(
              "id,number,revision,created_at,published_at,config",
            ).order(
              "number",
              { ascending: false },
            ).limit(50),
          ),
          catalog: await catalog(),
        });
      }
      if (req.method === "POST" && path === "/admin/draft") {
        const input = await body();
        const config = uuid(input.cloneId)
          ? (await version(input.cloneId)).config
          : createGuideDraft();
        return json(201, {
          version: checked(
            await sb.from("guide_versions").insert({
              config,
              created_by: authz.context.userId,
            }).select("*")
              .single(),
          ),
        });
      }
      if (req.method === "PATCH" && path === "/admin/draft") {
        const input = await body();
        requireValue(
          uuid(input.id) && Number.isInteger(input.revision) &&
            object(input.config),
          "invalid_draft",
        );
        // Structurally incomplete drafts may be saved, but never evaluated or published.
        const result = checked(
          await sb.from("guide_versions").update({
            config: input.config,
            revision: Number(input.revision) + 1,
          }).eq("id", input.id).eq("revision", input.revision).is(
            "published_at",
            null,
          ).select("*")
            .maybeSingle(),
        );
        requireValue(result, "draft_changed_reload", 409);
        return json(200, { version: result });
      }
      if (
        req.method === "POST" &&
        ["/admin/validate", "/admin/preview", "/admin/publish"].includes(path)
      ) {
        const input = await body();
        const draft = path === "/admin/publish"
          ? await version(String(input.id))
          : null;
        const config = draft?.config ?? input.config;
        const currentCatalog = await catalog();
        let validation;
        try {
          validation = validateFlow(config, currentCatalog);
        } catch {
          validation = {
            errors: ["Malformed configuration"],
            maxPath: 0,
            paths: 0,
          };
        }
        if (validation.errors.length || path === "/admin/validate") {
          return json(
            path === "/admin/publish" && validation.errors.length ? 422 : 200,
            { validation },
          );
        }
        if (path === "/admin/preview") {
          const flow = config as GuideFlow;
          const answers = normalizeAnswers(
            flow,
            object(input.answers) ? input.answers as Answers : {},
          );
          const responses = object(input.checkAnswers)
            ? input.checkAnswers as Record<string, string | null>
            : {};
          const signals = scoreCheck(flow, answers, responses);
          return json(200, {
            validation,
            result: recommend(
              flow,
              answers,
              currentCatalog,
              Array.isArray(input.effectiveIds)
                ? input.effectiveIds as string[]
                : [],
              signals,
            ),
            signals,
          });
        }
        requireValue(
          draft && input.revision === draft.revision,
          "draft_changed_reload",
          409,
        );
        const result = await sb.rpc("guide_publish", {
          p_version: draft.id,
          p_draft_revision: input.revision,
          p_release_revision: input.releaseRevision,
          p_actor: authz.context.userId,
        });
        if (result.error?.code === "40001") {
          throw new RequestError(409, "release_changed_reload");
        }
        return json(200, { release: checked(result) });
      }
      if (req.method === "POST" && path === "/admin/disable") {
        const input = await body();
        const result = checked(
          await sb.from("guide_release").update({
            enabled: false,
            revision: Number(input.revision) + 1,
            updated_at: new Date().toISOString(),
            updated_by: authz.context.userId,
          }).eq("id", true).eq("revision", input.revision).select("*")
            .maybeSingle(),
        );
        requireValue(result, "release_changed_reload", 409);
        return json(200, { release: result });
      }
      if (req.method === "GET" && path === "/admin/analytics") {
        // Aggregate on the server; never expose interview answers or session secrets.
        const since = new Date(Date.now() - 30 * 86400000).toISOString();
        const rows = checked(
          await sb.from("guide_events").select(
            "journey_id,event,version_id,question_id,offer_id,audience,locale,campaign,created_at",
          ).gte("created_at", since).order("id", { ascending: false }).limit(
            10000,
          ),
        ) ?? [];
        return json(200, {
          ...guideMetrics(rows as GuideEvent[]),
          since,
          truncated: rows.length === 10000,
        });
      }
      return json(404, { error: "not_found" });
    }

    // No raw IP persistence. Short-lived bucket hashes rotate daily.
    const ip = req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const key = await hash(
      `${new Date().toISOString().slice(0, 10)}:${
        path === "/sessions" ? "create" : "read"
      }:${ip}`,
    );
    const allowed = checked(
      await sb.rpc("guide_rate_limit", {
        p_key: key,
        p_limit: path === "/sessions" ? 20 : 240,
        p_seconds: 60,
      }),
    );
    requireValue(allowed, "try_again_later", 429);
    if (req.method === "POST" && path === "/arrival") {
      const input = await body();
      requireValue(
        typeof input.receipt === "string" &&
          /^[0-9a-f-]{72}$/.test(input.receipt),
        "invalid_receipt",
      );
      requireValue(
        typeof input.path === "string" && input.path.startsWith("/") &&
          input.path.length <= 500,
        "invalid_destination",
      );
      const origin = req.headers.get("origin");
      requireValue(origin, "invalid_destination");
      // Atomic consumption, exact destination binding and no session-reading authority.
      const receipt = checked(
        await sb.from("guide_arrivals").delete().eq(
          "token_hash",
          await hash(input.receipt),
        )
          .eq("target_origin", origin).eq("target_path", input.path).gt(
            "expires_at",
            new Date().toISOString(),
          )
          .select("session_id,offer_id").maybeSingle(),
      );
      if (!receipt) return json(200, { recorded: false });
      const arrivalSession = checked(
        await sb.from("guide_sessions").select(
          "id,version_id,locale,campaign,answers",
        )
          .eq("id", receipt.session_id).gt(
            "expires_at",
            new Date().toISOString(),
          ).maybeSingle(),
      );
      if (!arrivalSession) return json(200, { recorded: false });
      checked(
        await sb.from("guide_events").upsert({
          session_id: arrivalSession.id,
          version_id: arrivalSession.version_id,
          event: "destination_opened",
          locale: arrivalSession.locale,
          campaign: arrivalSession.campaign,
          audience: arrivalSession.answers.audience ?? null,
          offer_id: receipt.offer_id,
          dedupe_key: `arrival:${receipt.offer_id}`,
        }, { onConflict: "session_id,dedupe_key", ignoreDuplicates: true }),
      );
      return json(200, { recorded: true });
    }
    if (req.method === "GET" && path === "/status") {
      const current = await release();
      return json(200, { enabled: current.enabled && !!current.version_id });
    }
    if (req.method === "GET" && path === "/config") {
      const current = await release();
      if (!current.enabled || !current.version_id) {
        return json(200, { enabled: false });
      }
      const v = await version(current.version_id);
      requireValue(v.published_at, "guide_unavailable", 503);
      return json(200, {
        enabled: true,
        versionId: v.id,
        number: v.number,
        flow: publicFlow(v.config as GuideFlow),
      });
    }
    if (req.method === "POST" && path === "/sessions") {
      const input = await body();
      const current = await release();
      requireValue(
        current.enabled && current.version_id,
        "guide_unavailable",
        503,
      );
      const locale = locales.includes(input.locale as Locale)
        ? input.locale
        : "en";
      const campaign = typeof input.campaign === "string" &&
          /^[a-zA-Z0-9_-]{1,64}$/.test(input.campaign)
        ? input.campaign
        : "direct";
      const token = crypto.randomUUID() + crypto.randomUUID();
      const session = checked(
        await sb.from("guide_sessions").insert({
          version_id: current.version_id,
          secret_hash: await hash(token),
          locale,
          campaign,
        }).select("*").single(),
      );
      const v = await version(session.version_id);
      checked(
        await sb.from("guide_events").insert({
          session_id: session.id,
          version_id: session.version_id,
          event: "started",
          locale,
          campaign,
          dedupe_key: "started",
        }),
      );
      const { secret_hash: _secret, ...safe } = session;
      return json(201, {
        session: safe,
        token,
        flow: publicFlow(v.config as GuideFlow),
      });
    }
    const sessionId = url.searchParams.get("session");
    requireValue(uuid(sessionId), "session_not_found", 404);
    const token = req.headers.get("x-guide-token");
    requireValue(token && token.length <= 160, "session_not_found", 404);
    const session = checked(
      await sb.from("guide_sessions").select("*").eq("id", sessionId).eq(
        "secret_hash",
        await hash(token!),
      )
        .gt("expires_at", new Date().toISOString()).maybeSingle(),
    );
    requireValue(session, "session_expired", 404);
    const v = await version(session.version_id);
    const flow = v.config as GuideFlow;
    requireValue(v.published_at, "session_not_found", 404);
    // Once claimed, a bearer resume token alone is no longer sufficient.
    if (session.user_id) {
      requireValue(
        (await user()).id === session.user_id,
        "session_belongs_to_another_account",
        403,
      );
    }
    const event = async (
      name: string,
      extra: { question_id?: string; offer_id?: string; dedupe_key?: string } =
        {},
    ) => {
      checked(
        await sb.from("guide_events").upsert({
          session_id: session.id,
          version_id: session.version_id,
          event: name,
          locale: session.locale,
          campaign: session.campaign,
          audience: session.answers.audience ?? null,
          ...extra,
          dedupe_key: extra.dedupe_key ?? name,
        }, { onConflict: "session_id,dedupe_key", ignoreDuplicates: true }),
      );
    };
    const safeSession = () => {
      const { secret_hash: _secret, ...safe } = session;
      return safe;
    };
    if (req.method === "POST" && path === "/view") {
      const input = await body();
      requireValue(
        typeof input.questionId === "string" &&
          (nextQuestion(flow, session.answers)?.id === input.questionId ||
            Object.hasOwn(session.answers, input.questionId)),
        "invalid_question",
      );
      await event("question_viewed", {
        question_id: input.questionId,
        dedupe_key: `view:${input.questionId}`,
      });
      return json(200, { recorded: true });
    }
    if (req.method === "GET" && path === "/session") {
      return json(200, { session: safeSession(), flow: publicFlow(flow) });
    }
    if (req.method === "DELETE" && path === "/session") {
      checked(await sb.from("guide_sessions").delete().eq("id", session.id));
      return json(200, { discarded: true });
    }
    if (req.method === "PATCH" && path === "/session") {
      const input = await body();
      requireValue(
        input.revision === session.revision,
        "session_changed_reload",
        409,
      );
      let answers = session.answers as Answers;
      if (typeof input.questionId === "string") {
        const allowedQuestion = flow.questions.find((q) =>
          q.id === input.questionId
        );
        requireValue(
          allowedQuestion &&
            (Object.hasOwn(answers, input.questionId) ||
              nextQuestion(flow, answers)?.id === input.questionId),
          "answer_out_of_order",
        );
        try {
          answers = changeAnswer(
            flow,
            answers,
            input.questionId,
            input.answer as Answers[string],
          );
        } catch {
          throw new RequestError(400, "invalid_answer");
        }
      }
      const changed = ["audience", "exam", "parent_intent"].some((key) =>
        answers[key] !== session.answers[key]
      );
      const locale = locales.includes(input.locale as Locale)
        ? input.locale
        : session.locale;
      const update = {
        answers,
        locale,
        revision: session.revision + 1,
        ...(changed ? { check_answers: {}, check_status: "undecided" } : {}),
      };
      const saved = checked(
        await sb.from("guide_sessions").update(update).eq("id", session.id).eq(
          "revision",
          session.revision,
        )
          .select("id").maybeSingle(),
      );
      requireValue(saved, "session_changed_reload", 409);
      Object.assign(session, update);
      if (typeof input.questionId === "string") {
        await event("answered", {
          question_id: input.questionId,
          dedupe_key: `answered:${input.questionId}`,
        });
      }
      return json(200, { session: safeSession() });
    }
    if (req.method === "POST" && path === "/claim") {
      const input = await body();
      const account = await user();
      requireValue(input.confirm === true, "confirmation_required");
      if (
        session.answers.audience === "parent" &&
        session.answers.parent_intent !== "progress"
      ) {
        requireValue(input.learnerAccount === true, "learner_account_required");
      }
      const claimed = checked(
        await sb.from("guide_sessions").update({ user_id: account.id }).eq(
          "id",
          session.id,
        ).is(
          "user_id",
          null,
        ).select("id").maybeSingle(),
      );
      requireValue(
        claimed || session.user_id === account.id,
        "session_belongs_to_another_account",
        403,
      );
      session.user_id = account.id;
      await event("claimed");
      return json(200, { session: safeSession() });
    }
    if (req.method === "POST" && path === "/check") {
      const input = await body();
      requireValue(
        !nextQuestion(flow, session.answers),
        "interview_incomplete",
      );
      requireValue(
        input.revision === session.revision,
        "session_changed_reload",
        409,
      );
      const bank = checkBank(session.answers);
      const questions = flow.checks.filter((q) =>
        q.reviewed && q.bank === bank
      );
      requireValue(
        ["started", "completed", "skipped"].includes(String(input.status)),
        "invalid_check_status",
      );
      const responses: Record<string, string | null> = {};
      if (input.status !== "skipped") {
        requireValue(bank && questions.length, "check_unavailable");
        const raw = object(input.answers) ? input.answers : {};
        for (const [id, answer] of Object.entries(raw)) {
          const q = questions.find((q) => q.id === id);
          requireValue(
            q && (answer === null || q.options.some((o) => o.id === answer)),
            "invalid_check_answer",
          );
          responses[id] = answer as string | null;
        }
        if (input.status === "completed") {
          requireValue(
            questions.every((q) => Object.hasOwn(responses, q.id)),
            "check_incomplete",
          );
        }
      }
      const saved = checked(
        await sb.from("guide_sessions").update({
          check_answers: responses,
          check_status: input.status,
          revision: session.revision + 1,
        }).eq("id", session.id).eq("revision", session.revision).select("id")
          .maybeSingle(),
      );
      requireValue(saved, "session_changed_reload", 409);
      Object.assign(session, {
        check_answers: responses,
        check_status: input.status,
        revision: session.revision + 1,
      });
      await event(`check_${input.status}`);
      return json(200, {
        session: safeSession(),
        signals: input.status === "completed"
          ? scoreCheck(flow, session.answers, responses)
          : [],
      });
    }
    const getResult = async () => {
      requireValue(
        !nextQuestion(flow, session.answers),
        "interview_incomplete",
      );
      let effectiveIds: string[] = [];
      if (hasUserCredential) {
        await user();
        const response = await fetch(`${base}/functions/v1/access-effective`, {
          signal: AbortSignal.timeout(8000),
          headers: { authorization: `Bearer ${authorization}`, apikey: anon },
        });
        requireValue(response.ok, "access_check_unavailable", 503);
        effectiveIds = (await response.json()).effective_product_ids ?? [];
      }
      const signals = session.check_status === "completed"
        ? scoreCheck(flow, session.answers, session.check_answers)
        : [];
      const { trace: _trace, ...result } = recommend(
        flow,
        session.answers,
        await catalog(),
        effectiveIds,
        signals,
      );
      return { ...result, signals, fallback: flow.fallback };
    };
    if (req.method === "GET" && path === "/result") {
      const result = await getResult();
      await event("result");
      if (result.primary) await event('recommended', { offer_id: result.primary.rule.id, dedupe_key: `recommended:${result.primary.rule.id}` });
      else await event('no_match');
      return json(200, result);
    }
    if (
      req.method === "POST" && ["/goals/preview", "/goals/apply"].includes(path)
    ) {
      const input = await body();
      const account = await user();
      requireValue(session.user_id === account.id, "claim_required", 403);
      requireValue(
        ["learner", "parent"].includes(session.answers.audience) &&
          session.answers.parent_intent !== "progress",
        "learner_goals_only",
        403,
      );
      const result = await getResult();
      const match = [result.primary, result.alternative].find((m) =>
        m?.rule.id === input.offerId
      );
      requireValue(
        match?.product && match.owned,
        "existing_access_required",
        403,
      );
      const target = goalTarget(match.product);
      requireValue(target, "goal_transfer_unavailable", 422);
      let languageId: string | null = null;
      if (target.scope === "language") {
        const language = checked(
          await sb.from("languages").select("id").eq("code", "en").single(),
        );
        requireValue(language, "goal_transfer_unavailable", 422);
        languageId = language.id;
      }
      const scope = {
        user_id: account.id,
        ...(target.scope === "language"
          ? { language_id: languageId }
          : target.scope === "product"
          ? { product_id: match.product.id }
          : {}),
      };
      const current = checked(
        await sb.from(target.table).select("*").match(scope).maybeSingle(),
      );
      const changes = goalChanges(
        flow,
        session.answers,
        target,
        current,
        new Date().toISOString().slice(0, 10),
      );
      const fingerprint = await hash(JSON.stringify({ current, changes, revision: session.revision, offerId: match.rule.id }));
      if (path === "/goals/preview") return json(200, { changes, fingerprint });
      requireValue(
        input.confirm === true && input.fingerprint === fingerprint,
        "goals_changed_review_again",
        409,
      );
      if (changes.length) {
        const patch = Object.fromEntries(changes.map((c) => [c.field, c.next]));
        const metadata = {
          ...(object(current?.metadata) ? current.metadata : {}),
          guide: {
            version_id: session.version_id,
            applied_at: new Date().toISOString(),
          },
        };
        if (current) {
          const updated = checked(
            await sb.from(target.table).update({
              ...patch,
              metadata,
              updated_at: new Date().toISOString(),
            })
              .match(scope).eq("updated_at", current.updated_at).select(
                "user_id",
              ).maybeSingle(),
          );
          requireValue(updated, "goals_changed_review_again", 409);
        } else {
          const inserted = await sb.from(target.table).insert({
            ...scope,
            ...(target.scope === "language"
              ? { product_id: match.product.id }
              : {}),
            ...patch,
            metadata,
          });
          if (inserted.error?.code === "23505") {
            throw new RequestError(409, "goals_changed_review_again");
          }
          checked(inserted);
        }
      }
      return json(200, { applied: true, changes });
    }
    if (req.method === "POST" && path === "/open") {
      const input = await body();
      const result = await getResult();
      const match = [result.primary, result.alternative].find((m) =>
        m?.rule.id === input.offerId
      );
      requireValue(match, "offer_changed_reload", 409);
      await event(
        match!.plan && !match!.owned ? "checkout_started" : "offer_opened",
        {
          offer_id: match!.rule.id,
          dedupe_key: `open:${match!.rule.id}`,
        },
      );
      let href = match!.href;
      // Checkout intent is not destination arrival. A fresh receipt is issued after the user
      // returns and opens their now-owned product; there is no forced post-payment redirect.
      if (!href.startsWith("/checkout")) {
        const destination = new URL(href, "https://schood.online");
        const receipt = crypto.randomUUID() + crypto.randomUUID();
        checked(
          await sb.from("guide_arrivals").insert({
            token_hash: await hash(receipt),
            session_id: session.id,
            offer_id: match!.rule.id,
            target_origin: destination.origin,
            target_path: destination.pathname,
          }),
        );
        destination.searchParams.set("schood_guide", receipt);
        href = href.startsWith("/")
          ? `${destination.pathname}${destination.search}${destination.hash}`
          : destination.href;
      }
      return json(200, { href, offerId: match!.rule.id });
    }
    if (req.method === "POST" && path === "/payment") {
      const input = await body();
      const account = await user();
      requireValue(session.user_id === account.id, "claim_required", 403);
      requireValue(uuid(input.paymentId), "invalid_payment");
      const payment = checked(
        await sb.from("payments").select(
          "id,user_id,plan_id,product_id,created_at",
        ).eq("id", input.paymentId)
          .eq("user_id", account.id).maybeSingle(),
      );
      const rule = flow.offers.find((r) =>
        r.id === input.offerId && r.kind === "plan"
      );
      requireValue(
        payment && rule && payment.plan_id === rule.planId &&
          payment.product_id === rule.productId &&
          Date.parse(payment.created_at) >= Date.parse(session.created_at),
        "payment_does_not_match",
        403,
      );
      checked(
        await sb.from("guide_payment_links").upsert({
          payment_id: payment.id,
          session_id: session.id,
          version_id: session.version_id,
          offer_id: rule.id,
        }, { onConflict: "payment_id", ignoreDuplicates: true }),
      );
      return json(200, { linked: true });
    }
    return json(404, { error: "not_found" });
  } catch (error) {
    if (error instanceof RequestError) {
      return json(error.status, { error: error.code });
    }
    // Never log request bodies, interview answers, auth tokens, or session secrets.
    console.error(
      "guide_request_failed",
      error instanceof Error ? error.name : "DatabaseError",
    );
    return json(500, { error: "guide_request_failed" });
  }
}
