// Departments: create (one or several at once), rename, delete. Deleting moves its
// people to "no department" (the foreign key sets it to null).
import { HR_ROLES, LEAD_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { check, CompanyError, UUID, type Ctx, type Route } from '../types.ts';
import { obj, text } from '../util.ts';
import { fetchAll } from './shared.ts';

const MAX_DEPARTMENTS = 200;
interface DepartmentRow { id: string; org_id: string; name: string; created_at?: string }

async function loadDepartment(ctx: Ctx, id: string): Promise<DepartmentRow> {
  if (!UUID.test(id)) throw new CompanyError('department_not_found', 'This department does not exist.', 404);
  const row = check<DepartmentRow | null>(await ctx.db.from('company_departments').select('id,org_id,name').eq('org_id', ctx.org!.id).eq('id', id).maybeSingle());
  if (!row) throw new CompanyError('department_not_found', 'This department does not exist.', 404);
  return row;
}

const key = (name: string) => name.trim().toLowerCase();

export const departmentRoutes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/departments', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx) {
      const org = ctx.org!;
      const departments = check<DepartmentRow[]>(await ctx.db.from('company_departments').select('id,name,created_at').eq('org_id', org.id).order('name'));
      const members = await fetchAll<{ department_id: string | null; status: string; seat: boolean }>(() => ctx.db.from('company_members').select('department_id,status,seat').eq('org_id', org.id).neq('status', 'removed').order('id'));
      const tally = new Map<string | null, { people: number; invited: number; seats: number }>();
      for (const row of members) {
        const entry = tally.get(row.department_id) ?? { people: 0, invited: 0, seats: 0 };
        if (row.status === 'invited') entry.invited++; else entry.people++;
        if (row.seat) entry.seats++;
        tally.set(row.department_id, entry);
      }
      const empty = { people: 0, invited: 0, seats: 0 };
      return {
        departments: departments.map((row) => ({ id: row.id, name: row.name, created_at: row.created_at ?? null, ...(tally.get(row.id) ?? empty) })),
        unassigned: tally.get(null) ?? empty,
      };
    },
  },
  {
    // { name } or { names: [...] } (onboarding adds several at once; existing names are skipped).
    method: 'POST', path: 'orgs/:org/departments', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const org = ctx.org!, input = obj(body);
      const asked = Array.isArray(input.names) ? input.names : [input.name];
      if (!asked.length || asked.length > 50) throw new CompanyError('invalid_field', 'Send one to 50 department names.', 400, { field: 'names' });
      const names = asked.map((value) => text(value, 'name', { min: 1, max: 80 })!);
      const existing = check<DepartmentRow[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id));
      const taken = new Set(existing.map((row) => key(row.name)));
      const fresh: string[] = [];
      for (const name of names) {
        if (taken.has(key(name))) continue;
        taken.add(key(name));
        fresh.push(name.replace(/\s+/g, ' '));
      }
      if (!Array.isArray(input.names) && !fresh.length) throw new CompanyError('department_exists', 'A department with this name already exists.', 409, { field: 'name' });
      if (existing.length + fresh.length > MAX_DEPARTMENTS) throw new CompanyError('too_many_departments', 'A workspace can have up to 200 departments.', 409);
      const created = fresh.length ? check<DepartmentRow[]>(await ctx.db.from('company_departments').insert(fresh.map((name) => ({ org_id: org.id, name }))).select('id,name')) : [];
      for (const row of created) await ctx.audit('department.created', row.id, { name: row.name });
      return { departments: created, department: created[0] ?? null, skipped: names.length - created.length };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/departments/:department', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const row = await loadDepartment(ctx, params.department);
      const name = text(obj(body).name, 'name', { min: 1, max: 80 })!.replace(/\s+/g, ' ');
      if (name === row.name) return { department: row };
      const others = check<DepartmentRow[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', ctx.org!.id));
      if (others.some((other) => other.id !== row.id && key(other.name) === key(name))) throw new CompanyError('department_exists', 'A department with this name already exists.', 409, { field: 'name' });
      const updated = check<DepartmentRow>(await ctx.db.from('company_departments').update({ name }).eq('id', row.id).select('id,name').single());
      await ctx.audit('department.renamed', row.id, { from: row.name, to: name });
      return { department: updated };
    },
  },
  {
    method: 'DELETE', path: 'orgs/:org/departments/:department', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const row = await loadDepartment(ctx, params.department);
      const { count } = await ctx.db.from('company_members').select('id', { count: 'exact', head: true }).eq('department_id', row.id).neq('status', 'removed');
      // Members and invitations keep existing with no department (on delete set null).
      check(await ctx.db.from('company_members').update({ department_id: null }).eq('department_id', row.id));
      check(await ctx.db.from('company_invites').update({ department_id: null }).eq('department_id', row.id));
      check(await ctx.db.from('company_departments').delete().eq('id', row.id));
      await ctx.audit('department.deleted', row.id, { name: row.name, moved: count ?? 0 });
      return { deleted: true, moved: count ?? 0 };
    },
  },
];
