// Import from an HR or hiring system: paste from a spreadsheet or upload any CSV, say
// which column is which (remembered per workspace), see what would change, then apply.
// Applying checks that the plan is still the one on screen. Nobody is removed: people
// missing from the file are only listed, because a partial export must not end access.
import { HR_ROLES, JOB_ROLES, type JobRole } from '../../../../packages/company-core/src/mod.ts';
import { fetchAll, csv } from '../insights/common.ts';
import { MAX_IMPORT_ROWS, parseCsv, readJobRole, readRole, type ImportRole } from '../people/csv.ts';
import { DAY, inviteRoleFor, joinLink, PERSONAL_DAYS } from '../people/shared.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { EMAIL, obj, sha256, storable, text, token } from '../util.ts';
import { ensureSettings, readSettings } from './shared.ts';

const FIELDS = ['name', 'first_name', 'last_name', 'email', 'department', 'job_role', 'role'] as const;
export type ImportField = (typeof FIELDS)[number];
export type Mapping = Partial<Record<ImportField, string>>;
export interface ImportOptions {
  mapping: Mapping;
  job_role_map: Record<string, JobRole>;
  has_header: boolean;
  /** HR chose these columns just now, so "not in my file" is respected. A remembered mapping is only a starting point. */
  explicit: boolean;
}

/** Column names HR, ATS and payroll exports tend to use, in the three languages. */
const ALIASES: Record<ImportField, string[]> = {
  name: ['name', 'full name', 'fullname', 'employee', 'employee name', 'candidate', 'candidate name', 'display name', 'имя и фамилия', 'фио', 'ф.и.о.', 'сотрудник', 'кандидат', 'ism familiya', 'f.i.sh', 'fish', 'xodim', 'nomzod', 'to‘liq ism'],
  first_name: ['first name', 'firstname', 'given name', 'имя', 'ism'],
  last_name: ['last name', 'lastname', 'surname', 'family name', 'фамилия', 'familiya'],
  email: ['email', 'e-mail', 'mail', 'work email', 'email address', 'work e-mail', 'corporate email', 'почта', 'эл. почта', 'email адрес', 'электронная почта', 'рабочая почта', 'pochta', 'elektron pochta', 'ish pochtasi'],
  department: ['department', 'dept', 'team', 'division', 'unit', 'cost center', 'отдел', 'подразделение', 'департамент', 'bo‘lim', "bo'lim", 'bolim'],
  job_role: ['job role', 'job title', 'job', 'title', 'position', 'role title', 'vacancy', 'должность', 'позиция', 'вакансия', 'lavozim', 'vakansiya'],
  role: ['role', 'access', 'access level', 'роль', 'доступ', 'rol', 'huquq'],
};

const norm = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, ' ').replace(/[’ʼ']/g, '‘').trim();

/** Guesses which column is which from the header. */
export function suggestMapping(headers: string[]): Mapping {
  const out: Mapping = {};
  for (const field of FIELDS) {
    const wanted = ALIASES[field].map(norm);
    const found = headers.find((header) => wanted.includes(norm(header)));
    if (found) out[field] = found;
  }
  // Someone called "name" and "first name" at once: the whole-name column wins.
  if (out.name) { delete out.first_name; delete out.last_name; }
  return out;
}

function readOptions(input: Record<string, unknown>, remembered: Partial<ImportOptions>): ImportOptions {
  const raw = (input.mapping ?? remembered.mapping ?? {}) as Record<string, unknown>;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new CompanyError('invalid_field', 'mapping is not valid.', 400, { field: 'mapping' });
  const mapping: Mapping = {};
  for (const field of FIELDS) if (typeof raw[field] === 'string' && raw[field]) mapping[field] = (raw[field] as string).slice(0, 200);
  const given = (input.job_role_map ?? remembered.job_role_map ?? {}) as Record<string, unknown>;
  if (typeof given !== 'object' || Array.isArray(given)) throw new CompanyError('invalid_field', 'job_role_map is not valid.', 400, { field: 'job_role_map' });
  const job_role_map: Record<string, JobRole> = {};
  for (const [title, code] of Object.entries(given).slice(0, 300)) if ((JOB_ROLES as readonly unknown[]).includes(code)) job_role_map[storable(norm(title)).slice(0, 120)] = code as JobRole;
  return { mapping, job_role_map, explicit: input.mapping !== undefined, has_header: input.has_header === undefined ? remembered.has_header !== false : input.has_header !== false };
}

export interface PlanRow { line: number; name: string; email: string | null; department: string | null; job_role: JobRole; role: ImportRole; title: string | null; changes?: Record<string, { from: unknown; to: unknown }>; member_id?: string }
export interface PlanError { line: number; name: string; code: 'name' | 'email' | 'duplicate' | 'department' | 'role' }
export interface Plan {
  headers: string[];
  mapping: Mapping;
  suggested: Mapping;
  add: PlanRow[];
  update: PlanRow[];
  unchanged: number;
  errors: PlanError[];
  missing: { id: string; name: string; email: string }[];
  new_departments: string[];
  /** Job titles with no job role yet: they import as "general" until HR maps them. */
  unknown_titles: string[];
  too_many: boolean;
  total_rows: number;
}

type Existing = Pick<MemberRow, 'id' | 'email' | 'full_name' | 'department_id' | 'job_role' | 'status' | 'role'>;

/** Works out what a file would change. Reads only. */
export async function buildPlan(ctx: Ctx, source: string, options: ImportOptions): Promise<Plan> {
  const orgId = ctx.org!.id;
  const table = parseCsv(source);
  const width = Math.max(0, ...table.map((row) => row.length));
  const headers = options.has_header ? (table[0] ?? []) : Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
  const rows = options.has_header ? table.slice(1) : table;
  const suggested = suggestMapping(headers);
  const mapping: Mapping = Object.fromEntries(Object.entries(options.mapping).filter(([, column]) => headers.includes(column as string)));
  const effective: Mapping = options.explicit ? mapping : { ...suggested, ...mapping };
  // A whole-name column makes first and last name columns redundant, whichever list they came from.
  if (effective.name) { delete effective.first_name; delete effective.last_name; }
  const at = (field: ImportField) => effective[field] ? headers.indexOf(effective[field]!) : -1;
  const cell = (cells: string[], field: ImportField) => { const index = at(field); return index < 0 ? '' : storable(cells[index] ?? '').trim(); };

  const members = await fetchAll<Existing>(() => ctx.db.from('company_members').select('id,email,full_name,department_id,job_role,status,role').eq('org_id', orgId).neq('status', 'removed').order('id'));
  const departments = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', orgId));
  const departmentByName = new Map(departments.map((entry) => [entry.name.trim().toLowerCase(), entry]));
  const departmentName = new Map(departments.map((entry) => [entry.id, entry.name]));
  const byEmail = new Map(members.filter((member) => member.email).map((member) => [member.email!.toLowerCase(), member]));
  const byName = new Map(members.filter((member) => !member.email && member.full_name).map((member) => [member.full_name!.trim().toLowerCase(), member]));

  const plan: Plan = { headers, mapping: effective, suggested, add: [], update: [], unchanged: 0, errors: [], missing: [], new_departments: [], unknown_titles: [], too_many: rows.length > MAX_IMPORT_ROWS, total_rows: rows.length };
  const seen = new Set<string>(), inFile = new Set<string>(), newDepartments = new Map<string, string>(), unknownTitles = new Map<string, string>();
  rows.slice(0, MAX_IMPORT_ROWS).forEach((cells, index) => {
    const line = index + (options.has_header ? 2 : 1);
    const name = (cell(cells, 'name') || `${cell(cells, 'first_name')} ${cell(cells, 'last_name')}`).replace(/\s+/g, ' ').trim();
    const rawEmail = cell(cells, 'email').toLowerCase();
    const department = cell(cells, 'department').slice(0, 200) || null;
    const title = cell(cells, 'job_role').slice(0, 200) || null;
    const roleValue = cell(cells, 'role');
    const fail = (code: PlanError['code']) => { plan.errors.push({ line, name: name.slice(0, 120), code }); };
    if (name.length < 2 || name.length > 120) return fail('name');
    if (rawEmail && (rawEmail.length > 200 || !EMAIL.test(rawEmail))) return fail('email');
    const identity = rawEmail || `name:${name.toLowerCase()}`;
    if (seen.has(identity)) return fail('duplicate');
    seen.add(identity);
    if (department && department.length > 80) return fail('department');
    const role = readRole(roleValue);
    if (!role) return fail('role');
    let job_role: JobRole = 'general';
    if (title) {
      const mapped = options.job_role_map[norm(title)] ?? readJobRole(title);
      if (mapped) job_role = mapped;
      else unknownTitles.set(norm(title), title);
    }
    if (department && !departmentByName.has(department.toLowerCase())) newDepartments.set(department.toLowerCase(), department);
    const row: PlanRow = { line, name, email: rawEmail || null, department, job_role, role, title };
    const existing = rawEmail ? byEmail.get(rawEmail) : byName.get(name.toLowerCase());
    if (!existing) { plan.add.push(row); return; }
    inFile.add(existing.id);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (existing.full_name?.trim() !== name) changes.name = { from: existing.full_name, to: name };
    // Only what the file says: an empty or unmapped column leaves the person's value alone.
    if (department && (existing.department_id ? departmentName.get(existing.department_id) : null)?.trim().toLowerCase() !== department.toLowerCase()) changes.department = { from: existing.department_id ? departmentName.get(existing.department_id) ?? null : null, to: department };
    if (title && (options.job_role_map[norm(title)] || readJobRole(title)) && existing.job_role !== job_role) changes.job_role = { from: existing.job_role, to: job_role };
    if (Object.keys(changes).length) plan.update.push({ ...row, changes, member_id: existing.id });
    else plan.unchanged++;
  });
  plan.missing = members.filter((member) => member.status === 'active' && member.email && !inFile.has(member.id) && member.role !== 'owner').slice(0, 200).map((member) => ({ id: member.id, name: member.full_name ?? '', email: member.email! }));
  plan.new_departments = [...newDepartments.values()].sort();
  plan.unknown_titles = [...unknownTitles.values()].sort().slice(0, 100);
  return plan;
}

/** Identifies the plan on screen, so applying a stale one is refused. */
const fingerprint = async (plan: Plan) => await sha256(JSON.stringify([plan.add, plan.update, plan.errors, plan.new_departments]));

const trimmed = (plan: Plan, limit = 200) => ({ ...plan, add: plan.add.slice(0, limit), update: plan.update.slice(0, limit), errors: plan.errors.slice(0, limit), add_total: plan.add.length, update_total: plan.update.length, error_total: plan.errors.length });

function sourceOf(input: Record<string, unknown>): string {
  const value = text(input.text, 'text', { min: 1, max: 400_000 })!;
  return value;
}

export const importRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/connect/import', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx) {
      const settings = await readSettings(ctx.db, ctx.org!.id);
      return { remembered: settings.import_mapping ?? {}, fields: FIELDS, job_roles: JOB_ROLES, max_rows: MAX_IMPORT_ROWS };
    },
  },
  {
    // { text, mapping?, job_role_map?, has_header? } → what would change, and a fingerprint to apply it with.
    method: 'POST', path: 'orgs/:org/connect/import/preview', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const settings = await readSettings(ctx.db, ctx.org!.id);
      const plan = await buildPlan(ctx, sourceOf(input), readOptions(input, settings.import_mapping as Partial<ImportOptions>));
      return { plan: trimmed(plan), fingerprint: await fingerprint(plan) };
    },
  },
  {
    // { text, mapping, job_role_map, has_header, fingerprint } → counts, and the new people's links, once.
    method: 'POST', path: 'orgs/:org/connect/import/apply', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body), org = ctx.org!;
      const settings = await readSettings(ctx.db, org.id);
      const options = readOptions(input, settings.import_mapping as Partial<ImportOptions>);
      const plan = await buildPlan(ctx, sourceOf(input), options);
      if (plan.too_many) throw new CompanyError('import_too_many', `Import at most ${MAX_IMPORT_ROWS} people at a time.`, 400, { max: MAX_IMPORT_ROWS });
      if (input.fingerprint !== await fingerprint(plan)) throw new CompanyError('import_stale', 'People have changed since this preview. Look at the new preview and apply again.', 409);

      // Departments first. Another tab may have just made one: a clash just means it exists.
      const wanted = new Map<string, string>();
      const departments = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id));
      for (const entry of departments) wanted.set(entry.name.trim().toLowerCase(), entry.id);
      for (const name of plan.new_departments) {
        const { data, error } = await ctx.db.from('company_departments').insert({ org_id: org.id, name }).select('id,name').single();
        if (error && error.code !== '23505') throw new Error(`${error.code ?? 'db'}: ${error.message}`);
        if (data) wanted.set(name.trim().toLowerCase(), (data as { id: string }).id);
        else {
          const again = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id));
          const hit = again.find((entry) => entry.name.trim().toLowerCase() === name.trim().toLowerCase());
          if (hit) wanted.set(name.trim().toLowerCase(), hit.id);
        }
      }
      const departmentId = (name: string | null) => name ? wanted.get(name.trim().toLowerCase()) ?? null : null;

      // Changes to people already here. Their workspace role is never touched from a file.
      let updated = 0;
      for (const row of plan.update) {
        const patch: Record<string, unknown> = {};
        if (row.changes!.name) patch.full_name = row.name;
        if (row.changes!.department) patch.department_id = departmentId(row.department);
        if (row.changes!.job_role) patch.job_role = row.job_role;
        check(await ctx.db.from('company_members').update(patch).eq('org_id', org.id).eq('id', row.member_id));
        updated++;
      }

      // New people, with a personal link each. A person who appeared meanwhile is skipped, not a failure.
      const now = ctx.now().toISOString(), expires = new Date(ctx.now().getTime() + PERSONAL_DAYS * DAY).toISOString();
      const links: { name: string; email: string | null; link: string }[] = [];
      let skipped = 0;
      for (const row of plan.add) {
        const { data, error } = await ctx.db.from('company_members').insert({
          org_id: org.id, full_name: row.name, email: row.email, role: row.role, department_id: departmentId(row.department), job_role: row.job_role, status: 'invited', seat: false, invited_by: ctx.user, invited_at: now,
        }).select(MEMBER_COLUMNS).single();
        if (error?.code === '23505') { skipped++; continue; }
        if (error) throw new Error(`${error.code ?? 'db'}: ${error.message}`);
        const member = data as MemberRow, raw = token();
        check(await ctx.db.from('company_invites').insert({
          org_id: org.id, member_id: member.id, kind: 'personal', role: inviteRoleFor(row.role), department_id: member.department_id, job_role: member.job_role, max_uses: 1, uses: 0,
          token_hash: await sha256(raw), expires_at: expires, created_by: ctx.user, created_at: now, token_issued_at: now,
        }));
        links.push({ name: row.name, email: row.email, link: joinLink(ctx, raw) });
      }

      await ensureSettings(ctx.db, org.id);
      check(await ctx.db.from('company_connect_settings').update({ import_mapping: { mapping: plan.mapping, job_role_map: options.job_role_map, has_header: options.has_header } }).eq('org_id', org.id));
      await ctx.audit('import.applied', org.id, { added: links.length, updated, skipped, departments_created: plan.new_departments.length, errors: plan.errors.length });
      return {
        added: links.length, updated, skipped, errors: plan.errors.length, departments_created: plan.new_departments.length, links,
        links_csv: csv(['name', 'email', 'link'], links.map((row) => [row.name, row.email, row.link])),
      };
    },
  },
];
