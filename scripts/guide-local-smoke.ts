import { nextQuestion } from "../supabase/functions/_shared/guide.ts";

// This writes fixtures ONLY to the explicitly named disposable validation stack.
// Never accepts linked projects, production URLs, keys on the command line, or env files.
function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}
const workdir = Deno.args[0];
assert(workdir, "Pass the disposable adaptive_onboarding_validation workdir");
const config = await Deno.readTextFile(`${workdir}/supabase/config.toml`);
assert(/^project_id = "adaptive_onboarding_validation"\s*$/m.test(config), "Wrong local project");
for (const name of ["guide", "access-effective"]) {
  const section = config.split(`[functions.${name}]`)[1]?.split(/\n\[/)[0] ?? "";
  assert(/^verify_jwt = false\s*$/m.test(section), `Match repository configuration for ${name} before testing`);
}
try {
  await Deno.stat(`${workdir}/supabase/.temp/project-ref`);
  throw new Error("Refusing a linked project");
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) throw error;
}
const output = await new Deno.Command(Deno.build.os === "windows" ? "supabase.exe" : "supabase", {
  args: ["status", "--workdir", workdir, "-o", "json"], stdout: "piped", stderr: "piped",
}).output();
assert(output.success, "Local status unavailable");
const keys = JSON.parse(new TextDecoder().decode(output.stdout));
const base = String(keys.API_URL);
assert(base === "http://127.0.0.1:60921", "Refusing non-validation endpoint");
const anon = keys.ANON_KEY;
const service = keys.SERVICE_ROLE_KEY;
assert(anon && service, "Local legacy JWTs unavailable");
async function api(path: string, { method = "GET", body, jwt = anon, secret, expected = 200 }: {
  method?: string; body?: unknown; jwt?: string; secret?: string; expected?: number;
} = {}) {
  const response = await fetch(`${base}${path}`, {
    method, signal: AbortSignal.timeout(15000),
    headers: {
      apikey: anon, authorization: `Bearer ${jwt}`, "Content-Type": "application/json",
      Prefer: "return=representation", ...(secret ? { "x-guide-token": secret } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  assert(response.status === expected,
    `${method} ${path.split("?")[0]} returned ${response.status}; expected ${expected}; code=${data?.error ?? data?.code ?? "unknown"}`);
  return data;
}
const edge = "/functions/v1/guide";
const password = crypto.randomUUID() + "!aA1";
const email = `guide-release-${crypto.randomUUID()}@example.test`;
const account = await api("/auth/v1/admin/users", {
  method: "POST", jwt: service, body: { email, password, email_confirm: true },
});
await api(`/rest/v1/users?id=eq.${account.id}`, { method: "PATCH", jwt: service, body: { role: "admin" } });
const signed = await api("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
const jwt = signed.access_token;
assert(jwt, "Missing real local sign-in token");
async function disable() {
  const current = await api(`${edge}/admin/list`, { jwt });
  if (current.release.enabled) {
    await api(`${edge}/admin/disable`, { method: "POST", jwt, body: { revision: current.release.revision } });
  }
}
// A prior interrupted local run may have published its test draft. Make reruns safe.
await disable();
try {
  assert((await api(`${edge}/status`)).enabled === false, "Release must be dark before setup");
  await api(`${edge}/admin/list`, { expected: 401 });
  const draft = await api(`${edge}/admin/draft`, { method: "POST", jwt, body: {}, expected: 201 });
  const overview = await api(`${edge}/admin/list`, { jwt });
  const validation = await api(`${edge}/admin/validate`, { method: "POST", jwt, body: { config: draft.version.config } });
  assert(validation.validation.errors.length === 0, "Seed must validate against real local schema");
  await api(`${edge}/admin/publish`, {
    method: "POST", jwt,
    body: { id: draft.version.id, revision: draft.version.revision, releaseRevision: overview.release.revision },
  });
  const publicConfig = await api(`${edge}/config`);
  assert(!JSON.stringify(publicConfig).includes("correctOption"), "Private check key leaked");
  const created = await api(`${edge}/sessions`, {
    method: "POST", body: { locale: "en", campaign: "local_release_qa" }, expected: 201,
  });
  const suffix = `?session=${created.session.id}`;
  const secret = created.token;
  let session = created.session;
  await api(`${edge}/session${suffix}`, { secret: "incorrect", expected: 404 });
  for (let i = 0; i < 13; i++) {
    const q = nextQuestion(created.flow, session.answers);
    if (!q) break;
    const answer = q.id === "budget" ? "free" : !q.required ? null : q.kind === "multi" ? [q.options[0].id] : q.options[0].id;
    const result = await api(`${edge}/session${suffix}`, {
      method: "PATCH", secret, body: { revision: session.revision, questionId: q.id, answer },
    });
    session = result.session;
  }
  assert(!nextQuestion(created.flow, session.answers), "Interview must terminate");
  await api(`${edge}/check${suffix}`, {
    method: "POST", secret, body: { revision: session.revision, status: "skipped", answers: {} },
  });
  const recommendation = await api(`${edge}/result${suffix}`, { secret });
  assert(recommendation.primary === null && recommendation.fallback, "Unapproved catalog must fall back");
  await api(`${edge}/result${suffix}`, { secret, jwt: "invalid-user-token", expected: 401 });
  await api(`${edge}/claim${suffix}`, { method: "POST", secret, body: { confirm: true }, expected: 401 });
  await api(`${edge}/claim${suffix}`, { method: "POST", secret, jwt, body: { confirm: true } });
  await api(`${edge}/session${suffix}`, { secret, expected: 401 });
  await api(`${edge}/result${suffix}`, { secret, expected: 401 });
  assert((await api(`${edge}/session${suffix}`, { secret, jwt })).session.user_id === account.id, "Claimed owner differs");
  // Also exercises real verified-user and access-effective transport after the claim.
  await api(`${edge}/result${suffix}`, { secret, jwt });
  const metrics = await api(`${edge}/admin/analytics`, { jwt });
  assert(metrics.funnel.some((m: { event: string; count: number }) => m.event === "started" && m.count >= 1), "Persisted funnel missing");
  assert(metrics.funnel.some((m: { event: string }) => m.event === "no_match"), "No-match event missing");
} finally {
  await disable();
}
assert((await api(`${edge}/status`)).enabled === false, "Disable failed");
console.log(JSON.stringify({ localOnly: true, realAuth: true, realPostgres: true, realEdge: true,
  publishedAndDisabled: true, guestRecommendation: true, invalidUserRejected: true,
  ownerProtectedClaim: true, signedInRecommendation: true, persistedAnalytics: true }));
