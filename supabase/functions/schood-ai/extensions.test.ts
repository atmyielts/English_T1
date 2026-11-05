import { contextLabels, registerContextProvider } from './context.ts';
import { equal, fixture, ID, ok, PRODUCT, streamOf, USERS } from './fixture.test.ts';
import { MODULES } from './handler.ts';
import { registerPlanSource } from './plan.ts';
import { registerChatGuard, registerSpecialist } from './specialists.ts';
import { createStores, defineStore, type ServiceDb } from './stores.ts';
import { SchoodAIError, type FeatureModule } from './types.ts';

// The extension points areas asked for (docs/product/ai-requests/learner.md):
// area stores (ctx.store), chat guards, plan sources that see other people's
// plans, and context labels. Registrations here are global to the test run, so
// each is inert unless its own test switches it on, and core's other tests must
// pass with them registered (that is the point of request 4).

interface FamilyStore {
  links: Map<string, string>; // child → parent
  consent: Set<string>;
  link(child: string, parent: string): Promise<void>;
  parentOf(child: string): Promise<string | null>;
}
const memoryFamily = (): FamilyStore => {
  const links = new Map<string, string>(), consent = new Set<string>();
  return { links, consent, link: (child, parent) => Promise.resolve(void links.set(child, parent)), parentOf: (child) => Promise.resolve(links.get(child) ?? null) };
};
const family = defineStore<FamilyStore>('test.family', {
  postgres: (db: ServiceDb) => ({
    links: new Map(), consent: new Set(),
    async link(child, parent) { await db.from('test_family_links').insert({ child_id: child, parent_id: parent }); },
    async parentOf(child) { const { data } = await db.from('test_family_links').select('parent_id').eq('child_id', child).maybeSingle(); return data?.parent_id ?? null; },
  }),
  memory: () => memoryFamily(),
});

let switchedOn = false;
// A Plus Family parent gives a linked child Plus (the learner area's P plan source).
registerPlanSource('test.family', async ({ user, workspace, store, plansOf, productIds }) => {
  if (!switchedOn || workspace.kind !== 'personal' || !productIds.family) return null;
  const parent = await store(family).parentOf(user.id);
  return parent && (await plansOf(parent)).includes('family') ? { plans: ['plus'] } : null;
});
// The under-18 consent step, server-side for every chat.
registerChatGuard('test.consent', async (ctx) => {
  if (switchedOn && ctx.user.id === ID.student && !ctx.store(family).consent.has(ctx.user.id)) {
    throw new SchoodAIError('consent_required', 'A parent or guardian must agree first.', 403);
  }
});
let tutorGuardCalls = 0;
registerSpecialist({
  key: 'test_tutor', area: 'learner',
  name: { en: 'Test tutor', uz: 'Test ustoz', ru: 'Тестовый репетитор' },
  description: { en: 'Tests', uz: 'Testlar', ru: 'Тесты' },
  instructions: 'Help with the test.', contextKinds: ['test_plan'], creditKey: 'tutor.reply', roles: ['owner'], workspaceKinds: ['personal'],
  guard: () => { tutorGuardCalls++; return Promise.resolve(); },
});
registerContextProvider('test_plan', () => Promise.resolve({ kind: 'test_plan', title: 'Study plan', data: { week: 2 } }), {
  label: { en: 'your study plan', uz: 'o‘quv rejangiz', ru: 'ваш учебный план' },
});

const area: FeatureModule = {
  area: 'engage',
  routes: {
    link: { POST: async (ctx) => { await ctx.store(family).link(ctx.user.id, String((await ctx.body<{ parent: string }>()).parent)); return { ok: true }; } },
    parent: { GET: async (ctx) => ({ parent: await ctx.store(family).parentOf(ctx.user.id) }) },
  },
};
const modules = [...MODULES.filter((module) => module.area !== 'engage'), area];
const chat = (body: Record<string, unknown>) => ({ client_message_id: crypto.randomUUID(), ...body });

Deno.test('area stores: one memory twin per function in tests, shared by routes and plan sources; Postgres when deployed', async () => {
  const f = fixture({ modules });
  equal((await f.json('POST', 'engage/link', { token: 'tok-student', body: { parent: ID.plus } })).body.ok, true);
  equal((await f.json('GET', 'engage/parent', { token: 'tok-student' })).body.parent, ID.plus, 'the same instance across requests');
  equal(f.stores.get(family).links.get(ID.student), ID.plus, 'tests reach the twin');
  const seeded = memoryFamily();
  seeded.links.set(ID.student, ID.owner);
  f.stores.use(family, seeded);
  equal((await f.json('GET', 'engage/parent', { token: 'tok-student' })).body.parent, ID.owner, 'a seeded twin replaces it');

  // Deployed: built once over the service-role client, on first use.
  const calls: string[] = [];
  const db = { from: (table: string) => { calls.push(table); return { insert: () => Promise.resolve({ data: null, error: null }) }; }, rpc: () => Promise.resolve({ data: null, error: null }) } as unknown as ServiceDb;
  let built = 0;
  const counted = defineStore<{ n: number }>('test.counted', { postgres: () => ({ n: ++built }), memory: () => ({ n: -1 }) });
  const stores = createStores({ kind: 'postgres', db }, { now: () => new Date(), env: (name) => ({ SCHOOD_AI_BETA_USER_IDS: 'yes', SUPABASE_SERVICE_ROLE_KEY: 'secret' })[name] });
  equal([stores.get(counted).n, stores.get(counted).n, built], [1, 1, 1]);
  await stores.get(family).link('child', 'parent');
  equal(calls, ['test_family_links']);
  let seen: (string | undefined)[] = [];
  const envProbe = defineStore<null>('test.env', { postgres: (_db, env) => { seen = [env.env('SCHOOD_AI_BETA_USER_IDS'), env.env('SUPABASE_SERVICE_ROLE_KEY')]; return null; }, memory: () => null });
  stores.get(envProbe);
  equal(seen, ['yes', undefined], 'only SCHOOD_AI_* settings reach a store');
  let threw = false;
  try { defineStore('test.family', { postgres: () => null, memory: () => null }); } catch { threw = true; }
  ok(threw, 'store names are unique');
});

Deno.test('plan sources see other people\'s plans; chat guards refuse before anything is charged; context labels reach the app', async () => {
  const f = fixture({ modules });
  switchedOn = true;
  try {
    // tok-student has no products; tok-parent holds Plus Family for this test.
    equal((await f.json('GET', 'core/me', { token: 'tok-student' })).body.plan.plans, []);
    f.stores.get(family).links.set(ID.student, ID.parent);
    equal((await f.json('GET', 'core/me', { token: 'tok-student' })).body.plan.plans, [], 'a linked parent without Family gives nothing');
    USERS['tok-parent'].products = [PRODUCT.family];
    const child = fixture({ modules });
    child.stores.get(family).links.set(ID.student, ID.parent);
    equal((await child.json('GET', 'core/me', { token: 'tok-student' })).body.plan.plans, ['plus'], 'a Family parent gives the child Plus');

    // The consent guard: refused with a clear code, nothing stored or charged.
    const refused = await f.json('POST', 'core/chat', { token: 'tok-student', body: chat({ message: 'Hi' }) });
    equal([refused.status, refused.body.code], [403, 'consent_required']);
    equal([f.memory.threads.size, f.memory.ledger.length, f.upstream.length], [0, 0, 0], 'nothing stored, charged or sent');
    f.stores.get(family).consent.add(ID.student);
    f.setProvider(() => streamOf(['Salom!']));
    equal((await f.call('POST', 'core/chat', { token: 'tok-student', body: chat({ message: 'Hi' }) })).status, 200, 'after consent the chat runs');
    await f.settle();

    // A specialist's own guard runs only for it.
    tutorGuardCalls = 0;
    equal((await f.call('POST', 'core/chat', { token: 'tok-plus', body: chat({ message: 'Hi', specialist: 'test_tutor' }) })).status, 200);
    await f.settle();
    equal(tutorGuardCalls, 1);
    const used = await f.json('GET', 'core/me', { token: 'tok-plus', headers: { 'x-schood-locale': 'uz' } });
    equal(used.body.context_labels.test_plan, 'o‘quv rejangiz', 'labels in the request language');
    equal(contextLabels('ru').test_plan, 'ваш учебный план');
  } finally {
    switchedOn = false;
    delete USERS['tok-parent'].products;
  }
  let threw = false;
  try { registerContextProvider('test_bad_label', () => Promise.resolve(null), { label: { en: 'x', uz: '', ru: 'y' } }); } catch { threw = true; }
  ok(threw, 'labels need all three languages');
});

// An onboarding step (the learner's consent): skipped for fixtures that declare it done, enforced otherwise.
let onboardingArmed = false;
registerChatGuard('test.onboarding', (ctx) => {
  if (onboardingArmed && ctx.user.id === ID.plus) throw new SchoodAIError('consent_required', 'Take the step first.', 403, { state: 'missing' });
  return Promise.resolve();
}, { onboarding: true });

Deno.test('onboarding chat guards: a fixture declares them done by default, or runs them with onboarding: required', async () => {
  onboardingArmed = true;
  try {
    const taken = fixture();
    taken.setProvider(() => streamOf(['Salom']));
    equal((await taken.call('POST', 'core/chat', { body: chat({ message: 'Hello' }) })).status, 200, 'declared done: skipped');
    const required = fixture({ onboarding: 'required' });
    required.setProvider(() => streamOf(['Salom']));
    const refused = await required.json('POST', 'core/chat', { body: chat({ message: 'Hello' }) });
    equal([refused.status, refused.body.code, required.memory.ledger.length], [403, 'consent_required', 0], 'required: enforced before anything is charged');
  } finally {
    onboardingArmed = false;
  }
});
