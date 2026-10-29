import { BETA_CREDITS, isPlanCode, monthlyGrant, PLAN_CODES, PLAN_SCOPE, type PlanCode } from '../../../packages/ai-core/src/mod.ts';
import { createStores, type StoreHandle, type Stores } from './stores.ts';
import type { PlanState, RequestUser, Role, SchoodAIRepository, Workspace } from './types.ts';

// Which plans are in force for a request. There is no free AI:
//   - personal workspace: the person's own Schood AI products (Plus, Family, Teacher, Teacher Pro);
//   - centre workspace: the owner's Centre or Centre Pro product, or an Enterprise contract;
//   - beta: Schood admins and SCHOOD_AI_BETA_USER_IDS, with a beta credit grant. With no
//     product ids configured, beta testers are the only people with access.
// Products are read through access-effective (like admission/access.ts) with the
// person's own token. Without a token (the Telegram worker) or for a centre owner, the
// same logic runs on the entitlement rows (repository.productsHeldBy).
// Areas add plan sources (Family children, coach passes, team seats) with registerPlanSource.

export interface PlanSourceInput {
  user: RequestUser;
  workspace: Workspace;
  role: Role;
  repo: SchoodAIRepository;
  now: Date;
  /** Your area's store (stores.ts), for example family links. */
  store<T>(handle: StoreHandle<T>): T;
  /** Plan → Schood product id, only for plans whose product id is configured. */
  productIds: Readonly<Partial<Record<PlanCode, string>>>;
  /** The personal plans another person holds through their own products (for example a parent's Family). Sources are not consulted. */
  plansOf(userId: string): Promise<PlanCode[]>;
}
export type PlanSource = (input: PlanSourceInput) => Promise<{ plans?: PlanCode[]; features?: string[] } | null>;
const sources = new Map<string, PlanSource>();

/** Adds plans or directly granted features from another source. Names are unique; register at module load. */
export function registerPlanSource(name: string, source: PlanSource): void {
  if (sources.has(name)) throw new Error(`plan source ${name} is already registered`);
  sources.set(name, source);
}

export interface PlanConfig {
  /** Plan → Schood product id, only for plans whose env is set. */
  productIds: Partial<Record<PlanCode, string>>;
  betaUserIds: ReadonlySet<string>;
  /** access-effective with the person's token: effective product ids, or throws when unavailable. */
  accessEffective(token: string): Promise<string[]>;
  repo: SchoodAIRepository;
  isAdmin(userId: string): Promise<boolean>;
  now(): Date;
}
export type PlanResolver = ReturnType<typeof createPlanResolver>;

export function createPlanResolver(config: PlanConfig) {
  const byProduct = new Map(Object.entries(config.productIds).filter(([, id]) => !!id).map(([plan, id]) => [id!, plan as PlanCode]));
  // Short cache per token, and the last good answer per person for access-effective outages.
  const fresh = new Map<string, { at: number; ids: string[] }>();
  const lastGood = new Map<string, { at: number; ids: string[] }>();

  async function products(userId: string, token: string | null): Promise<string[]> {
    if (!token) return config.repo.productsHeldBy(userId);
    const now = config.now().getTime(), cached = fresh.get(token);
    if (cached && now - cached.at < 60_000) return cached.ids;
    try {
      const ids = await config.accessEffective(token);
      fresh.set(token, { at: now, ids });
      lastGood.set(userId, { at: now, ids });
      if (fresh.size > 5000) fresh.clear();
      if (lastGood.size > 20000) lastGood.clear();
      return ids;
    } catch (cause) {
      console.error(JSON.stringify({ event: 'schood_ai_access_effective_unavailable', error: String(cause).slice(0, 200) }));
      const previous = lastGood.get(userId);
      if (previous && now - previous.at < 86_400_000) return previous.ids;
      return config.repo.productsHeldBy(userId);
    }
  }
  const plansFrom = (ids: string[], scope: 'personal' | 'workspace') =>
    [...new Set(ids.map((id) => byProduct.get(id)).filter((plan): plan is PlanCode => !!plan && PLAN_SCOPE[plan] === scope))];
  const isBeta = async (userId: string) => config.betaUserIds.has(userId) || await config.isAdmin(userId);
  const fallbackStores = createStores({ kind: 'memory' }, { now: config.now });

  return {
    /** True when the person is a Schood admin or on the beta allowlist. */
    isBeta,
    async resolve(user: RequestUser, workspace: Workspace, role: Role, stores: Stores = fallbackStores): Promise<PlanState> {
      const now = config.now();
      let plans: PlanCode[], beta: boolean;
      if (workspace.kind === 'personal') {
        plans = plansFrom(await products(user.id, user.token), 'personal');
        beta = await isBeta(user.id);
      } else {
        const owner = workspace.ownerId === user.id;
        plans = plansFrom(owner ? await products(user.id, user.token) : await config.repo.productsHeldBy(workspace.ownerId), 'workspace');
        if (workspace.contractPlan === 'enterprise' && (!workspace.contractUntil || Date.parse(workspace.contractUntil) > now.getTime())) plans.push('enterprise');
        beta = await isBeta(workspace.ownerId);
      }
      const features: string[] = [];
      for (const [name, source] of sources) {
        try {
          const extra = await source({
            user, workspace, role, repo: config.repo, now, productIds: config.productIds,
            store: (handle) => stores.get(handle),
            plansOf: async (userId) => plansFrom(await config.repo.productsHeldBy(userId), 'personal'),
          });
          for (const plan of extra?.plans ?? []) if (isPlanCode(plan) && PLAN_SCOPE[plan] === (workspace.kind === 'personal' ? 'personal' : 'workspace')) plans.push(plan);
          features.push(...(extra?.features ?? []));
        } catch (cause) {
          // A broken source never removes access granted by the others.
          console.error(JSON.stringify({ event: 'schood_ai_plan_source_failed', source: name, error: String(cause).slice(0, 200) }));
        }
      }
      const unique = PLAN_CODES.filter((plan) => plans.includes(plan));
      const planGrant = monthlyGrant(unique), grant = Math.max(planGrant, beta ? BETA_CREDITS[workspace.kind] : 0);
      // Cycles start at the purchase: the earliest start of the products that grant the credits.
      let anchor: string | null = null;
      const sold = unique.map((plan) => config.productIds[plan]).filter((id): id is string => !!id);
      if (planGrant > 0 && planGrant >= grant && sold.length) {
        const starts = await config.repo.productStarts(workspace.kind === 'personal' ? user.id : workspace.ownerId);
        anchor = sold.map((id) => starts[id]).filter(Boolean).sort()[0] ?? null;
      }
      return { workspaceKind: workspace.kind, plans: unique, features: [...new Set(features)], beta, grant, anchor };
    },
  };
}

/** access-effective over HTTP with the person's token (admission/access.ts pattern). */
export function accessEffectiveOverHttp(base: string, anon: string, fetcher: typeof fetch = fetch) {
  return async (token: string): Promise<string[]> => {
    const response = await fetcher(`${base}/functions/v1/access-effective`, { headers: { apikey: anon, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) });
    const payload = response.ok ? await response.json() : null;
    if (!Array.isArray(payload?.effective_product_ids)) throw new Error(`access-effective ${response.status}`);
    return payload.effective_product_ids.map(String);
  };
}
