// Runs before the app in preview: seeds an in-memory database, then answers every
// fetch to /functions/v1/company/* with the real handler and routes. Data persists
// in localStorage until ?reset=1. Areas add data and AI stubs in preview/seed.<area>.ts:
//   export function seed(db: FakeDb, world: World): void
//   export const ai: Record<string, (payload: unknown) => unknown>   (feature → JSON reply)
import { createCompanyHandler } from '../../../supabase/functions/company/handler.ts';
import { allRoutes } from '../../../supabase/functions/company/routes.ts';
import { FakeDb, TEST_ENV } from '../../../supabase/functions/company/testing.ts';
import type { AiCall } from '../../../supabase/functions/company/types.ts';
import { ORG_ID, PERSONAS } from './personas.ts';

export interface World { orgId: string; personas: typeof PERSONAS; now: Date; departments: Record<'front' | 'sales' | 'finance', string>; employees: string[] }
type SeedModule = { seed?: (db: FakeDb, world: World) => void; ai?: Record<string, (payload: unknown) => unknown> };

const STORE = 'company-preview-db';
const seeds = import.meta.glob<SeedModule>('./seed.*.ts', { eager: true });
const day = 86_400_000;

function seedCore(db: FakeDb): World {
  const now = new Date();
  const departments = { front: crypto.randomUUID(), sales: crypto.randomUUID(), finance: crypto.randomUUID() };
  const users = Object.values(PERSONAS).map((persona) => ({ id: persona.id, role: persona.name === 'Schood staff' ? 'admin' : 'user' }));
  db.rows('users').push(...users);
  db.rows('company_orgs').push({
    id: ORG_ID, name: 'Silk Road Hotels', industry: 'hospitality', size_band: '201-1000', city: 'Tashkent', contact_phone: '+998 71 000 00 00',
    billing_email: 'hr@silkroad.example', tax_id: null, status: 'active', seats_limit: 25, tests_limit: 200, tests_used: 14,
    contract_ends_at: new Date(now.getTime() + 300 * day).toISOString(), settings: { locale: 'ru' }, created_by: PERSONAS.owner.id,
    created_at: new Date(now.getTime() - 60 * day).toISOString(),
  });
  db.rows('company_departments').push(
    { id: departments.front, org_id: ORG_ID, name: 'Front office' },
    { id: departments.sales, org_id: ORG_ID, name: 'Sales' },
    { id: departments.finance, org_id: ORG_ID, name: 'Finance' },
  );
  const member = (row: Record<string, unknown>) => ({
    id: crypto.randomUUID(), org_id: ORG_ID, email: null, full_name: null, role: 'employee', department_id: null, job_role: 'general', status: 'active',
    seat: false, level: null, level_score: null, level_source: null, level_at: null, target_level: null, target_date: null, consent_at: null,
    invited_at: new Date(now.getTime() - 50 * day).toISOString(), joined_at: new Date(now.getTime() - 45 * day).toISOString(), ...row,
  });
  const consent = new Date(now.getTime() - 44 * day).toISOString();
  db.rows('company_members').push(
    member({ user_id: PERSONAS.owner.id, full_name: PERSONAS.owner.name, email: 'owner@preview.local', role: 'owner', consent_at: consent }),
    member({ user_id: PERSONAS.hr.id, full_name: PERSONAS.hr.name, email: 'hr@preview.local', role: 'admin', consent_at: consent }),
    member({ user_id: PERSONAS.manager.id, full_name: PERSONAS.manager.name, email: 'manager@preview.local', role: 'manager', department_id: departments.front, job_role: 'hospitality', seat: true, level: 'b2', level_score: 70, level_source: 'placement', consent_at: consent }),
    member({ user_id: PERSONAS.employee.id, full_name: PERSONAS.employee.name, email: 'employee@preview.local', department_id: departments.front, job_role: 'hospitality', seat: true, level: 'a2', level_score: 38, level_source: 'placement', level_at: new Date(now.getTime() - 30 * day).toISOString(), target_level: 'b1', target_date: new Date(now.getTime() + 90 * day).toISOString().slice(0, 10) }),
  );
  const names = ['Jasur Nazarov', 'Malika Yusupova', 'Timur Sadykov', 'Nodira Ergasheva', 'Anvar Kholmatov', 'Olga Petrova', 'Sardor Mirzaev', 'Kamola Ismoilova', 'Farrukh Ahmedov', 'Zarina Usmonova', 'Alisher Qodirov', 'Gulnora Saidova'];
  const levels = ['a1', 'a2', 'a2', 'b1', 'b1', 'b1', 'b2', 'a2', 'b1', 'pre_a1', 'b2', 'c1'];
  const deptCycle = [departments.front, departments.sales, departments.finance];
  const roles = ['hospitality', 'sales', 'banking_finance'];
  const employees: string[] = [];
  names.forEach((name, index) => {
    const id = `00000000-0000-4000-8000-0000000b${String(index).padStart(4, '0')}`;
    db.rows('users').push({ id, role: 'user' });
    employees.push(id);
    const score = [12, 30, 36, 50, 55, 58, 70, 34, 52, 8, 72, 84][index];
    db.rows('company_members').push(member({
      user_id: id, full_name: name, email: `${name.split(' ')[0].toLowerCase()}@silkroad.example`, department_id: deptCycle[index % 3], job_role: roles[index % 3],
      seat: index < 9, level: levels[index], level_score: score, level_source: 'placement', level_at: new Date(now.getTime() - (40 - index) * day).toISOString(),
      target_level: index % 3 === 0 ? 'b1' : 'b2', target_date: new Date(now.getTime() + (60 + index * 5) * day).toISOString().slice(0, 10),
      consent_at: index % 4 === 3 ? null : consent,
    }));
  });
  db.rows('company_members').push(member({ user_id: null, full_name: 'Invited Person', email: 'invited@silkroad.example', status: 'invited', joined_at: null, department_id: departments.sales }));
  // Six weeks of learning activity for dashboards and challenges.
  const active = db.rows('company_members').filter((row) => row.user_id && row.role !== 'owner' && row.role !== 'admin');
  const kinds = ['lesson', 'lesson', 'roleplay', 'writing', 'glossary', 'english'];
  for (let back = 42; back >= 0; back--) {
    active.forEach((row, index) => {
      if ((back + index) % 3 === 0 || (index % 5 === 4 && back % 2 === 0)) return;
      const kind = kinds[(back + index) % kinds.length];
      db.rows('company_activity').push({
        id: db.rows('company_activity').length + 1, org_id: ORG_ID, member_id: row.id, user_id: row.user_id, kind,
        minutes: 5 + ((back * 7 + index * 3) % 20), points: 10 + ((back + index) % 15) * 2, ref: null,
        created_at: new Date(now.getTime() - back * day - index * 600_000).toISOString(),
      });
    });
  }
  return { orgId: ORG_ID, personas: PERSONAS, now, departments, employees };
}

function load(): FakeDb {
  const reset = new URLSearchParams(location.search).get('reset') === '1';
  try {
    const saved = reset ? null : localStorage.getItem(STORE);
    if (saved) return new FakeDb(JSON.parse(saved));
  } catch { /* fall through to a fresh seed */ }
  const db = new FakeDb();
  const world = seedCore(db);
  for (const module of Object.values(seeds)) module.seed?.(db, world);
  return db;
}

const db = load();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(db.tables)); } catch { /* quota: keep in memory */ } };
save();

// RPCs the core migration defines, simplified.
db.rpcs.company_sync_english_access = () => 'granted';
db.rpcs.company_sync_org_access = () => 0;
db.rpcs.company_consume_ai = () => true;
db.rpcs.company_reserve_test = ({ p_org }) => {
  const org = db.rows('company_orgs').find((row) => row.id === p_org);
  if (!org || !['pilot', 'active'].includes(String(org.status))) return false;
  if (org.tests_limit !== null && Number(org.tests_used) >= Number(org.tests_limit)) return false;
  org.tests_used = Number(org.tests_used) + 1;
  return true;
};

const aiStubs: Record<string, (payload: unknown) => unknown> = Object.assign({}, ...Object.values(seeds).map((module) => module.ai ?? {}));
const ai: AiCall = async (request, fallback) => {
  const stub = aiStubs[request.feature];
  if (!stub) return { data: fallback, status: 'unconfigured' };
  await new Promise((resolve) => setTimeout(resolve, 600));
  return { data: stub(JSON.parse(request.userPayload)) as typeof fallback, status: 'ok' };
};

const handler = createCompanyHandler({
  db, routes: allRoutes, origins: [], env: { ...TEST_ENV, aiDailyLimit: 1000 }, ai,
  userFromToken: (token) => Promise.resolve(db.rows('users').some((row) => row.id === token) ? { id: token, email: `${token.slice(-4)}@preview.local` } : null),
});
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('https://preview.local/functions/v1/company/')) return realFetch(input, init);
  const response = await handler(new Request(url, init));
  if (init?.method && init.method !== 'GET') save();
  return response;
};
console.info('[company preview] in-browser API ready. Personas: ?as=owner|hr|manager|employee|newcomer|staff|signedout, ?reset=1 to reseed.');
