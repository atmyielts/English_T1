import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { priceTableProblems, type PlanCode } from '../../../packages/ai-core/src/mod.ts';
import { boundedJson } from '../_shared/ai-response.ts';
import { authorizeAdminRequest } from '../_shared/admin-access.ts';
import { CircuitBreaker, createGateway } from './gateway.ts';
import { createSchoodAIHandler } from './handler.ts';
import { accessEffectiveOverHttp, createPlanResolver } from './plan.ts';
import { createSchoodAIRepository, type SchoodAIDatabase } from './repository.ts';
import { createStores } from './stores.ts';

// Schood AI Edge Function: env wiring only; the router is handler.ts.

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const problems = priceTableProblems();
if (problems.length) throw new Error(`Credit price table: ${problems.join('; ')}`);

const url = required('SUPABASE_URL'), anon = required('SUPABASE_ANON_KEY');
const auth = createClient(url, anon, { auth: { persistSession: false } });
const service = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const db = service as unknown as SchoodAIDatabase;

const origins = (Deno.env.get('SCHOOD_AI_ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Product ids per plan. Unset means nobody holds that plan (only beta testers have access).
const productIds: Partial<Record<PlanCode, string>> = Object.fromEntries(([
  ['plus', Deno.env.get('SCHOOD_AI_PLUS_PRODUCT_ID')],
  ['family', Deno.env.get('SCHOOD_AI_FAMILY_PRODUCT_ID')],
  ['teacher', Deno.env.get('SCHOOD_AI_TEACHER_PRODUCT_ID')],
  ['teacher_pro', Deno.env.get('SCHOOD_AI_TEACHER_PRO_PRODUCT_ID')],
  ['centre', Deno.env.get('SCHOOD_AI_CENTRE_PRODUCT_ID')],
  ['centre_pro', Deno.env.get('SCHOOD_AI_CENTRE_PRO_PRODUCT_ID')],
] as const).filter(([, id]) => !!id && uuid.test(id)).map(([plan, id]) => [plan, id!.toLowerCase()]));
const betaUserIds = new Set((Deno.env.get('SCHOOD_AI_BETA_USER_IDS') ?? '').split(',').map((id) => id.trim().toLowerCase()).filter((id) => uuid.test(id)));
const serviceSecret = Deno.env.get('SCHOOD_AI_SERVICE_SECRET') ?? null;
const ceiling = Number(Deno.env.get('SCHOOD_AI_GLOBAL_DAILY_CALLS') ?? '');

const repository = createSchoodAIRepository(async (token) => {
  const { data, error } = await auth.auth.getUser(token);
  return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null };
}, db);

// Background work (call log, learning events, stream bookkeeping) outlives the response.
const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (work: Promise<unknown>) => void } }).EdgeRuntime;
const after = (work: Promise<unknown>) => {
  const guarded = work.catch((cause) => console.error(JSON.stringify({ event: 'schood_ai_background_failed', error: String(cause).slice(0, 200) })));
  try { runtime?.waitUntil?.(guarded); } catch { /* the promise still runs */ }
};

// Settings and registry change rarely; a short cache keeps one query off every call.
const cached = <T>(load: () => Promise<T>, ms: number) => {
  let value: { at: number; data: Promise<T> } | null = null;
  return () => {
    if (!value || Date.now() - value.at > ms) {
      const data = load();
      value = { at: Date.now(), data };
      data.catch(() => { value = null; });
    }
    return value.data;
  };
};

const gateway = createGateway({
  registry: cached(() => repository.registry(), 30_000),
  settings: cached(() => repository.settings(), 15_000),
  takeCall: (input) => repository.takeCall(input),
  record: (rows) => after(repository.recordCalls(rows)),
  // Provider keys are Supabase secrets named by the registry; only allowed names reach here.
  env: (name) => Deno.env.get(name),
  fetch,
  now: () => new Date(),
  breaker: new CircuitBreaker(),
  globalCeiling: Number.isInteger(ceiling) && ceiling > 0 ? ceiling : null,
});

const adminCache = new Map<string, { at: number; admin: boolean }>();
async function isAdmin(userId: string): Promise<boolean> {
  const hit = adminCache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.admin;
  const profile = await repository.profile(userId);
  const permissions = profile ? await repository.adminPermissions(userId, profile.role.toLowerCase()).catch(() => [] as string[]) : [];
  const admin = permissions.includes('admin.*') || permissions.includes('admin.portal.access');
  adminCache.set(userId, { at: Date.now(), admin });
  if (adminCache.size > 5000) adminCache.clear();
  return admin;
}

const plans = createPlanResolver({ productIds, betaUserIds, accessEffective: accessEffectiveOverHttp(url, anon), repo: repository, isAdmin, now: () => new Date() });

// Area tables (stores.ts) over the same service-role client.
const stores = createStores({ kind: 'postgres', db }, { now: () => new Date(), env: (name) => Deno.env.get(name) });

Deno.serve(createSchoodAIHandler({
  repository, gateway, plans, isAdmin, stores,
  async callFunction(name, path, token, init) {
    const target = new URL(`${url}/functions/v1/${name}${path}`);
    for (const [key, value] of Object.entries(init.query ?? {})) target.searchParams.set(key, value);
    const response = await fetch(target, {
      method: init.method ?? 'GET',
      headers: { apikey: anon, Authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(init.timeoutMs ?? 8_000),
    });
    const data = response.body ? await boundedJson(response, init.maxBytes ?? 1_000_000).catch(() => null) : null;
    return { status: response.status, data };
  },
  async adminGate(req, permission) {
    const result = await authorizeAdminRequest(service, req, {}, { requiredPermission: permission, action: `schood-ai:${new URL(req.url).pathname.split('/').slice(-2).join('/')}` });
    if (result.ok) return { ok: true };
    const status = result.response.status;
    const body = await result.response.json().catch(() => ({}));
    return { ok: false, status, code: typeof body?.code === 'string' ? body.code : status === 401 ? 'unauthorized' : 'admin_required' };
  },
}, { allowedOrigins: origins, serviceSecret, after }));
