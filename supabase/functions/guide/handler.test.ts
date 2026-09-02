import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./handler.ts";
import { createGuideDraft } from "../_shared/guide-seed.ts";
import { type Answers, changeAnswer, nextQuestion } from "../_shared/guide.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const VERSION = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";
const ANON = "guide-contract-anon";
// Shape of a public JWT from another key generation; not a real credential.
const ROTATED_ANON = `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role: "anon", iss: "supabase", iat: 1 }))}.test-signature`;
type Row = Record<string, unknown>;

/** Actual HTTP handler with intercepted Supabase transport. No production services are contacted. */
Deno.test("guide HTTP security and session contracts", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries(
    ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"].map((k) => [k, Deno.env.get(k)]),
  );
  Deno.env.set("SUPABASE_URL", "https://guide-contract.invalid");
  Deno.env.set("SUPABASE_ANON_KEY", ANON);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "guide-test-service-only");
  const flow = createGuideDraft();
  const version: Row = { id: VERSION, config: flow, revision: 1, published_at: "2026-01-01T00:00:00Z" };
  let session: Row | null = null;
  let token = "";
  let role = "student";
  let permissions: string[] = [];
  let published = 0;
  let rateAllowed = true;
  const productId = '55555555-5555-4555-8555-555555555555';
  const planId = '66666666-6666-4666-8666-666666666666';
  let effectiveIds: string[] = [];
  let authRequests = 0;
  let accessRequests = 0;
  let goals: Row | null = { user_id: USER, language_id: 'english', target_overall_band: 6, daily_practice_minutes: 20, updated_at: '2026-01-01T00:00:00Z', assessed_band: 5.5, metadata: { keep: 'unchanged' } };
  const arrivals: Row[] = [];
  const product = { id: productId, name: 'IELTS Practice', status: 'active', description: 'Practice', metadata: { slug: 'ielts-practice', app_url: 'https://practice.ielts.schood.online/dashboard' } };
  const plan = { id: planId, product_id: productId, name: 'Month', amount: 99000, currency: 'UZS', duration_days: 30, is_active: true, metadata: {} };
  const events: Row[] = [];
  const writes: string[] = [];
  const rowMatches = (row: Row, url: URL) =>
    [...url.searchParams].every(([key, value]) => {
      if (["select", "limit", "order", "on_conflict"].includes(key)) return true;
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      if (value === "is.null") return row[key] === null;
      if (value.startsWith("gt.")) return String(row[key]) > value.slice(3);
      return true;
    });
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    assertEquals(url.hostname, "guide-contract.invalid", "Unexpected external request");
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    const one = (row: Row | null) =>
      json(req.headers.get("accept")?.includes("vnd.pgrst.object") ? row : row ? [row] : []);
    const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    if (url.pathname === "/auth/v1/user") {
      authRequests++;
      const bearer = req.headers.get("authorization") ?? "";
      if (!["Bearer learner-token", "Bearer other-token"].includes(bearer)) {
        return json({ msg: "Invalid token", code: "bad_jwt" }, 401);
      }
      return json({
        id: bearer.includes("other") ? OTHER : USER,
        aud: "authenticated",
        email: "guide@example.test",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
      });
    }
    if (url.pathname.endsWith("/rpc/guide_rate_limit")) return json(rateAllowed);
    if (url.pathname.endsWith("/rpc/admin_effective_permissions")) return json(permissions);
    if (url.pathname.endsWith("/rpc/admin_rate_limit_consume")) {
      return json([{ allowed: true, request_count: 1 }]);
    }
    if (url.pathname.endsWith("/rpc/guide_publish")) {
      published++;
      return json({ enabled: true, revision: 2 });
    }
    const table = url.pathname.split("/").at(-1)!;
    if (table === "users") return one({ role });
    if (table === "admin_security_policies") return one(null);
    if (table === "admin_audit_logs") return json(null, 201);
    if (table === "guide_release") return one({ id: true, enabled: true, version_id: VERSION, revision: 1 });
    if (table === "guide_versions") return one(version);
    if (table === "guide_events") {
      if (req.method !== "GET") events.push(body);
      return json(null, 201);
    }
    if (table === "guide_sessions") {
      if (req.method === "POST") {
        session = {
          id: SESSION,
          user_id: null,
          answers: {},
          check_answers: {},
          check_status: "undecided",
          revision: 1,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          ...body,
        };
        writes.push(table);
        return one(session);
      }
      if (!session || !rowMatches(session, url)) return one(null);
      if (req.method === "PATCH") {
        session = { ...session, ...body };
        writes.push(table);
      }
      if (req.method === "DELETE") {
        session = null;
        writes.push(table);
        return json(null);
      }
      return one(session);
    }
    if (table === 'guide_arrivals') {
      if (req.method === 'POST') { arrivals.push({ ...body, expires_at: new Date(Date.now() + 900000).toISOString() }); return json(null, 201); }
      const at = arrivals.findIndex(row => rowMatches(row, url));
      return one(at < 0 ? null : arrivals.splice(at, 1)[0]);
    }
    if (table === 'languages') return one({ id: 'english' });
    if (table === 'ielts_practice_user_goals') {
      if (req.method === 'POST') { goals = body; writes.push(table); return json(null, 201); }
      if (!goals || !rowMatches(goals, url)) return one(null);
      if (req.method === 'PATCH') { goals = { ...goals, ...body }; writes.push(table); }
      return one(goals);
    }
    if (table === "products") return json([product]);
    if (table === "plans") return json([plan]);
    if (url.pathname === "/functions/v1/access-effective") {
      accessRequests++;
      return json({ effective_product_ids: effectiveIds });
    }
    throw new Error(`Unexpected contract transport ${req.method} ${url.pathname}`);
  };
  const request = (
    path: string,
    { method = "GET", body, jwt = ANON, secret = token, withSession = true, origin, userJwt }: {
      method?: string;
      body?: unknown;
      jwt?: string;
      secret?: string;
      withSession?: boolean;
      origin?: string;
      userJwt?: string;
    } = {},
  ) =>
    handler(
      new Request(
        `https://edge.invalid/functions/v1/guide${path}${withSession ? `?session=${SESSION}` : ""}`,
        {
          method,
          headers: {
            ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
            ...(userJwt === undefined ? {} : { "x-user-jwt": userJwt }),
            "content-type": "application/json",
            ...(origin ? { origin } : {}),
            ...(secret ? { "x-guide-token": secret } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      ),
    );
  function complete(overrides: Answers = {}) {
    let answers: Answers = {};
    for (let i = 0; i < 13; i++) {
      const q = nextQuestion(flow, answers);
      if (!q) break;
      answers = changeAnswer(
        flow,
        answers,
        q.id,
        Object.hasOwn(overrides, q.id)
          ? overrides[q.id]
          : !q.required
          ? null
          : q.kind === "multi"
          ? [q.options[0].id]
          : q.options[0].id,
      );
    }
    session!.answers = answers;
  }
  try {
    await t.step("public configuration strips every answer key and internal offer rule", async () => {
      const res = await request("/config", { withSession: false });
      assertEquals(res.status, 200);
      const body = await res.text();
      assert(!body.includes("correctOption"));
      assert(!body.includes("explanation"));
      assert(!body.includes("teacher_workspace"));
    });
    await t.step("anonymous session returns a secret once but persists only its hash", async () => {
      const res = await request("/sessions", {
        method: "POST",
        body: { locale: "uz", campaign: "spring" },
        withSession: false,
      });
      assertEquals(res.status, 201);
      const result = await res.json();
      token = result.token;
      assert(token.length > 60);
      assertEquals(result.session.secret_hash, undefined);
      assertEquals(result.session.locale, "uz");
      assert(session);
      assertEquals(String(session.secret_hash).length, 64);
      assert(session.secret_hash !== token);
    });
    await t.step("a missing or wrong guest secret cannot read or mutate the session", async () => {
      assertEquals((await request("/session", { secret: "wrong" })).status, 404);
      assertEquals((await request("/session", { secret: "" })).status, 404);
      const before = writes.length;
      assertEquals(
        (await request("/session", {
          method: "PATCH",
          secret: "wrong",
          body: { revision: 1, questionId: "audience", answer: "learner" },
        })).status,
        404,
      );
      assertEquals(writes.length, before);
    });
    await t.step("out-of-order, invalid and stale answers are rejected", async () => {
      assertEquals(
        (await request("/session", {
          method: "PATCH",
          body: { revision: 1, questionId: "exam", answer: "ielts" },
        })).status,
        400,
      );
      assertEquals(
        (await request("/session", {
          method: "PATCH",
          body: { revision: 1, questionId: "audience", answer: "admin" },
        })).status,
        400,
      );
      assertEquals(
        (await request("/session", {
          method: "PATCH",
          body: { revision: 1, questionId: "audience", answer: "learner" },
        })).status,
        200,
      );
      assertEquals(
        (await request("/session", {
          method: "PATCH",
          body: { revision: 1, questionId: "access", answer: "new" },
        })).status,
        409,
      );
      assertEquals((session!.answers as Answers).audience, "learner");
    });
    await t.step("incomplete interview cannot obtain a result or begin a check", async () => {
      assertEquals((await request("/result")).status, 400);
      assertEquals(
        (await request("/check", {
          method: "POST",
          body: { revision: session!.revision, status: "started", answers: {} },
        })).status,
        400,
      );
    });
    await t.step("guest recommendations accept public credentials without requesting user access", async () => {
      complete({ audience: "learner" });
      const beforeAuth = authRequests;
      const beforeAccess = accessRequests;
      for (const jwt of ["", ANON, ROTATED_ANON, "sb_publishable_test-only"]) {
        assertEquals((await request("/result", { jwt })).status, 200, jwt);
        assertEquals((await request("/claim", { method: "POST", jwt, body: { confirm: true } })).status, 401);
      }
      assertEquals(authRequests, beforeAuth);
      assertEquals(accessRequests, beforeAccess);
      assertEquals(session!.user_id, null);
    });
    await t.step("invalid user credentials never silently fall back to guest recommendations", async () => {
      for (const jwt of ["invalid-user-token", "expired-user-token", "a.malformed.signature",
        `e30.${btoa(JSON.stringify({ role: "authenticated", sub: USER }))}.forged`,
        `e30.${btoa(JSON.stringify({ role: "anon", sub: USER }))}.forged`,
        `e30.${btoa(JSON.stringify({ role: "service_role" }))}.forged`]) {
        assertEquals((await request("/result", { jwt })).status, 401);
      }
      // An explicit user header is always verified, even if it resembles a public key.
      assertEquals((await request("/result", { jwt: ROTATED_ANON, userJwt: "invalid-user-token" })).status, 401);
      assertEquals((await request("/result", { userJwt: ROTATED_ANON })).status, 401);
      assertEquals((await request("/result", { userJwt: "" })).status, 401);
      const beforeAccess = accessRequests;
      assertEquals((await request("/result", { jwt: ROTATED_ANON, userJwt: "learner-token" })).status, 200);
      assertEquals(accessRequests, beforeAccess + 1);
    });
    await t.step("parent claims require the learner-account confirmation", async () => {
      complete({ audience: "parent", parent_intent: "prepare" });
      assertEquals(
        (await request("/claim", { method: "POST", jwt: "learner-token", body: { confirm: true } })).status,
        400,
      );
      assertEquals(
        (await request("/claim", {
          method: "POST",
          jwt: "learner-token",
          body: { confirm: true, learnerAccount: true },
        })).status,
        200,
      );
      assertEquals(session!.user_id, USER);
    });
    await t.step(
      "claimed sessions require both the guest secret and the matching authenticated account",
      async () => {
        assertEquals((await request("/session")).status, 401);
        assertEquals((await request("/session", { jwt: ROTATED_ANON })).status, 401);
        assertEquals((await request("/result", { jwt: ROTATED_ANON })).status, 401);
        assertEquals((await request("/goals/preview", { method: "POST", jwt: ROTATED_ANON, body: { offerId: "practice" } })).status, 401);
        assertEquals((await request("/session", { jwt: "other-token" })).status, 403);
        assertEquals((await request("/session", { jwt: "learner-token" })).status, 200);
        assertEquals((await request("/session", { jwt: "learner-token", secret: "wrong" })).status, 404);
      },
    );
    await t.step(
      "check submissions cannot inject new question IDs or pretend an incomplete check is complete",
      async () => {
        assertEquals(
          (await request("/check", {
            method: "POST",
            jwt: "learner-token",
            body: { revision: session!.revision, status: "completed", answers: {} },
          })).status,
          400,
        );
        assertEquals(
          (await request("/check", {
            method: "POST",
            jwt: "learner-token",
            body: { revision: session!.revision, status: "started", answers: { injected: "a" } },
          })).status,
          400,
        );
        assertEquals(
          (await request("/check", {
            method: "POST",
            jwt: "learner-token",
            body: { revision: session!.revision, status: "skipped", answers: {} },
          })).status,
          200,
        );
      },
    );
    await t.step("ordinary users cannot read or publish admin drafts", async () => {
      assertEquals((await request("/admin/list", { jwt: "learner-token", withSession: false })).status, 403);
      assertEquals(
        (await request("/admin/publish", {
          jwt: "learner-token",
          withSession: false,
          method: "POST",
          body: { id: VERSION, revision: 1, releaseRevision: 1 },
        })).status,
        403,
      );
      assertEquals(published, 0);
    });
    await t.step("content editors cannot publish without settings permission", async () => {
      role = "editor";
      permissions = ["admin.portal.access", "admin.products.manage"];
      assertEquals(
        (await request("/admin/publish", {
          jwt: "learner-token",
          withSession: false,
          method: "POST",
          body: { id: VERSION, revision: 1, releaseRevision: 1 },
        })).status,
        403,
      );
      assertEquals(published, 0);
      permissions.push("admin.settings.manage");
      assertEquals(
        (await request("/admin/publish", {
          jwt: "learner-token",
          withSession: false,
          method: "POST",
          body: { id: VERSION, revision: 1, releaseRevision: 1 },
        })).status,
        200,
      );
      assertEquals(published, 1);
    });
    await t.step("role selection never writes membership or entitlement records", () => {
      assert(writes.every((table) => table === "guide_sessions"));
      assert(events.every((e) => !Object.hasOwn(e, "answers") && !Object.hasOwn(e, "secret_hash")));
    });
    await t.step('goal preview requires owned access and never mutates; apply requires the reviewed fingerprint', async () => {
      flow.offers.push({ ...flow.offers[0], id: 'practice', kind: 'plan', productId, planId, enabled: true, priority: 100,
        when: { any: [{ all: [{ question: 'exam', op: 'is', value: 'ielts' }] }] } });
      complete({ audience: 'learner', exam: 'ielts', target_ielts: 7, daily_minutes: 30, budget: 'paid' });
      // Use the authored goal field identifiers, independent of question display names.
      const targetQuestion = flow.questions.find(q => q.goalField === 'target_score' && q.id.includes('ielts'))!;
      const timeQuestion = flow.questions.find(q => q.goalField === 'daily_minutes')!;
      (session!.answers as Answers)[targetQuestion.id] = 7;
      (session!.answers as Answers)[timeQuestion.id] = 30;
      const before = writes.length;
      assertEquals((await request('/goals/preview', { method: 'POST', jwt: 'learner-token', body: { offerId: 'practice' } })).status, 403);
      effectiveIds = [productId];
      const preview = await request('/goals/preview', { method: 'POST', jwt: 'learner-token', body: { offerId: 'practice' } });
      assertEquals(preview.status, 200);
      const review = await preview.json();
      assert(review.changes.some((c: Row) => c.field === 'target_overall_band' && c.next === 7));
      assertEquals(writes.length, before);
      assertEquals((await request('/goals/apply', { method: 'POST', jwt: 'learner-token', body: { offerId: 'practice', fingerprint: review.fingerprint } })).status, 409);
      session!.revision = Number(session!.revision) + 1;
      assertEquals((await request('/goals/apply', { method: 'POST', jwt: 'learner-token', body: { offerId: 'practice', confirm: true, fingerprint: review.fingerprint } })).status, 409);
      goals = { ...goals, updated_at: '2026-02-01T00:00:00Z' };
      assertEquals((await request('/goals/apply', { method: 'POST', jwt: 'learner-token', body: { offerId: 'practice', confirm: true, fingerprint: review.fingerprint } })).status, 409);
      const fresh = await (await request('/goals/preview', { method: 'POST', jwt: 'learner-token', body: { offerId: 'practice' } })).json();
      assertEquals((await request('/goals/apply', { method: 'POST', jwt: 'learner-token', body: { offerId: 'practice', confirm: true, fingerprint: fresh.fingerprint } })).status, 200);
      assertEquals(goals!.target_overall_band, 7);
      assertEquals(goals!.daily_practice_minutes, 30);
      assertEquals(goals!.assessed_band, 5.5);
      assertEquals((goals!.metadata as Row).keep, 'unchanged');
      assert(writes.slice(before).every(table => table === 'ielts_practice_user_goals'));
    });
    await t.step('opening an owned offer issues a destination-bound single-use telemetry receipt, never a resume secret', async () => {
      const opened = await request('/open', { method: 'POST', jwt: 'learner-token', body: { offerId: 'practice' } });
      assertEquals(opened.status, 200);
      const destination = new URL((await opened.json()).href);
      const receipt = destination.searchParams.get('schood_guide');
      assert(receipt && receipt !== token);
      const before = events.filter(e => e.event === 'destination_opened').length;
      assertEquals((await request('/arrival', { method: 'POST', withSession: false, secret: '', origin: 'https://evil.invalid', body: { receipt, path: '/dashboard' } })).status, 200);
      assertEquals(events.filter(e => e.event === 'destination_opened').length, before);
      const hit = await request('/arrival', { method: 'POST', withSession: false, secret: '', origin: destination.origin, body: { receipt, path: destination.pathname } });
      assertEquals((await hit.json()).recorded, true);
      const replay = await request('/arrival', { method: 'POST', withSession: false, secret: '', origin: destination.origin, body: { receipt, path: destination.pathname } });
      assertEquals((await replay.json()).recorded, false);
      assertEquals(events.filter(e => e.event === 'destination_opened').length, before + 1);
      assert(!events.some(e => e.event === 'paid'));
    });
    await t.step("rate-limited guests receive a retryable response", async () => {
      rateAllowed = false;
      assertEquals((await request("/config", { withSession: false })).status, 429);
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(originalEnv)) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
