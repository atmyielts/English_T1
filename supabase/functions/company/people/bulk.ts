// Changing many people at once, each with its own result: department, job role, target,
// seat on or off within the limit, removal. A row that cannot change says why and the
// rest go on. Also: saved People filters and extra departments for a manager.
import { HR_ROLES, LEAD_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { syncAccess } from '../core.ts';
import { contractEnded, MEMBER_COLUMNS } from '../handler.ts';
import { check, checkUnique, CompanyError, UUID, type Ctx, type MemberRow, type Route } from '../types.ts';
import { inChunks, obj, oneOf, text } from '../util.ts';
import { actsAsOwner, activeOwnerIds, dateOrNull, DAY, departmentIn, fetchAll, guardError, inviteRoleFor, issueInvite, jobRole, levelOrNull, loadMember, PERSONAL_DAYS, revokeMemberInvites, seatCount } from './shared.ts';

export const BULK_ACTIONS = ['department', 'job_role', 'target', 'seat_on', 'seat_off', 'remove', 'renew_links'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
export const MAX_BULK = 500;
const SYNC_AT_ONCE = 5;

export interface BulkResult { id: string; name: string | null; ok: boolean; code?: string; unchanged?: boolean; access_sync_failed?: boolean; email?: string | null; link?: string }

/** Seats handed out in this run may overrun a limit another tab also used: the last ones go back. */
async function trimSeats(ctx: Ctx, turnedOn: MemberRow[], results: Map<string, BulkResult>, limit: number): Promise<MemberRow[]> {
  const over = await seatCount(ctx.db, ctx.org!.id) - limit;
  if (over <= 0) return turnedOn;
  const back = turnedOn.slice(-over);
  for (const row of back) {
    check(await ctx.db.from('company_members').update({ seat: false }).eq('id', row.id));
    results.set(row.id, { id: row.id, name: row.full_name || row.email, ok: false, code: 'seats_full' });
  }
  return turnedOn.slice(0, turnedOn.length - back.length);
}

async function syncMany(ctx: Ctx, rows: MemberRow[], results: Map<string, BulkResult>): Promise<void> {
  const linked = rows.filter((row) => row.user_id);
  for (let from = 0; from < linked.length; from += SYNC_AT_ONCE) {
    await Promise.all(linked.slice(from, from + SYNC_AT_ONCE).map(async (row) => {
      if (await syncAccess(ctx.db, row.user_id) === 'failed') results.get(row.id)!.access_sync_failed = true;
    }));
  }
}

async function loadSelected(ctx: Ctx, ids: string[]): Promise<Map<string, MemberRow>> {
  const rows = await inChunks(ids, (chunk) => fetchAll<MemberRow>(() => ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', ctx.org!.id).in('id', chunk).order('id')));
  return new Map(rows.map((row) => [row.id, row]));
}

/** Everyone a manager may see: their own department and any others HR gave them. A read that fails leaves just the first. */
export async function managedDepartments(ctx: Ctx): Promise<Set<string>> {
  const own = ctx.member;
  if (!own) return new Set();
  const out = new Set<string>(own.department_id ? [own.department_id] : []);
  const { data, error } = await ctx.db.from('company_manager_departments').select('department_id').eq('member_id', own.id);
  if (error) console.error(JSON.stringify({ company_manager_departments: 'unavailable', error: error.message }));
  else for (const row of (data ?? []) as { department_id: string }[]) out.add(row.department_id);
  return out;
}

export const bulkRoutes: Route[] = [
  {
    // { action, ids, department_id?, job_role?, target_level?, target_date? } → one result per row.
    method: 'POST', path: 'orgs/:org/people/bulk', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const org = ctx.org!, input = obj(body);
      const action = oneOf<BulkAction>(input.action, BULK_ACTIONS, 'action');
      if (!Array.isArray(input.ids) || !input.ids.length) throw new CompanyError('invalid_field', 'Choose at least one person.', 400, { field: 'ids' });
      if (input.ids.length > MAX_BULK) throw new CompanyError('bulk_too_large', `Choose at most ${MAX_BULK} people at a time.`, 400, { max: MAX_BULK });
      const ids = [...new Set(input.ids as unknown[])].filter((id): id is string => typeof id === 'string' && UUID.test(id));
      if (!ids.length) throw new CompanyError('invalid_field', 'Choose at least one person.', 400, { field: 'ids' });
      const people = await loadSelected(ctx, ids);
      const results = new Map<string, BulkResult>();
      const name = (row: MemberRow) => row.full_name || row.email;
      const refuse = (id: string, code: string, row?: MemberRow) => results.set(id, { id, name: row ? name(row) : null, ok: false, code });
      const done = (row: MemberRow, unchanged = false) => results.set(row.id, { id: row.id, name: name(row), ok: true, ...(unchanged ? { unchanged: true } : {}) });
      const eligible: MemberRow[] = [];
      for (const id of ids) {
        const row = people.get(id);
        // Someone else's id is simply not found, as if it did not exist.
        if (!row) refuse(id, 'member_not_found');
        else if (row.status === 'removed') refuse(id, 'member_removed', row);
        else eligible.push(row);
      }

      if (action === 'department' || action === 'job_role' || action === 'target') {
        const patch: Record<string, unknown> = {};
        if (action === 'department') patch.department_id = await departmentIn(ctx, org.id, input.department_id);
        if (action === 'job_role') {
          if (!input.job_role) throw new CompanyError('invalid_field', 'Choose a job role.', 400, { field: 'job_role' });
          patch.job_role = jobRole(input.job_role);
        }
        if (action === 'target') {
          if ('target_level' in input) patch.target_level = levelOrNull(input.target_level, 'target_level');
          if ('target_date' in input) patch.target_date = dateOrNull(input.target_date, 'target_date');
          if (!Object.keys(patch).length) throw new CompanyError('invalid_field', 'Choose a target level or date.', 400, { field: 'target_level' });
        }
        await inChunks(eligible.map((row) => row.id), async (chunk) => {
          check(await ctx.db.from('company_members').update(patch).eq('org_id', org.id).in('id', chunk));
          return [];
        });
        for (const row of eligible) done(row);
        await ctx.audit('member.bulk_updated', null, { action, count: eligible.length, ...patch, ids: eligible.slice(0, 100).map((row) => row.id) });
      }

      if (action === 'seat_on') {
        if (org.status !== 'active') throw new CompanyError('seats_inactive', 'Learning seats are available once Schood activates your agreement.', 409, { status: org.status });
        if (contractEnded(org, ctx.now())) throw new CompanyError('seats_contract_ended', 'This agreement has ended, so learning seats cannot be turned on. Extend the contract first.', 409);
        let left = org.seats_limit - await seatCount(ctx.db, org.id);
        let turnedOn: MemberRow[] = [];
        for (const row of eligible) {
          if (row.seat) done(row, true);
          else if (left <= 0) refuse(row.id, 'seats_full', row);
          else {
            left--;
            turnedOn.push(row);
            done(row);
          }
        }
        await inChunks(turnedOn.map((row) => row.id), async (chunk) => {
          check(await ctx.db.from('company_members').update({ seat: true }).eq('org_id', org.id).in('id', chunk).neq('status', 'removed'));
          return [];
        });
        turnedOn = await trimSeats(ctx, turnedOn, results, org.seats_limit);
        await syncMany(ctx, turnedOn, results);
        if (turnedOn.length) await ctx.audit('member.bulk_updated', null, { action, count: turnedOn.length, ids: turnedOn.slice(0, 100).map((row) => row.id) });
      }

      if (action === 'seat_off') {
        const changing = eligible.filter((row) => row.seat);
        for (const row of eligible) done(row, !row.seat);
        await inChunks(changing.map((row) => row.id), async (chunk) => {
          check(await ctx.db.from('company_members').update({ seat: false }).eq('org_id', org.id).in('id', chunk));
          return [];
        });
        await syncMany(ctx, changing, results);
        if (changing.length) await ctx.audit('member.bulk_updated', null, { action, count: changing.length, ids: changing.slice(0, 100).map((row) => row.id) });
      }

      if (action === 'remove') {
        // One at a time: the database's owner guard has its say on each row.
        let owners = await activeOwnerIds(ctx.db, org.id);
        const gone: MemberRow[] = [];
        for (const row of eligible) {
          if (row.role === 'owner' && !actsAsOwner(ctx)) { refuse(row.id, 'owner_protected', row); continue; }
          if (ctx.member && row.id === ctx.member.id) { refuse(row.id, 'bulk_not_yourself', row); continue; }
          if (row.role === 'owner' && row.status === 'active' && !owners.some((id) => id !== row.id)) { refuse(row.id, 'last_owner', row); continue; }
          try {
            check(await ctx.db.from('company_members').update({ status: 'removed', seat: false, removed_at: ctx.now().toISOString() }).eq('id', row.id).eq('org_id', org.id));
          } catch (cause) {
            try {
              guardError(cause);
            } catch (mapped) {
              if (mapped instanceof CompanyError) { refuse(row.id, mapped.code, row); continue; }
              throw mapped;
            }
          }
          owners = owners.filter((id) => id !== row.id);
          await revokeMemberInvites(ctx, row.id);
          done(row);
          gone.push(row);
        }
        await syncMany(ctx, gone, results);
        for (const row of gone) await ctx.audit('member.removed', row.id, { name: row.full_name, email: row.email, bulk: true });
      }

      if (action === 'renew_links') {
        // New personal links for people who have not joined. Each is shown once, here, as with any invitation.
        const expires_at = new Date(ctx.now().getTime() + PERSONAL_DAYS * DAY).toISOString();
        let renewed = 0;
        for (const row of eligible) {
          if (row.status !== 'invited') { refuse(row.id, 'invite_closed', row); continue; }
          if (row.role === 'owner' && !actsAsOwner(ctx)) { refuse(row.id, 'owner_protected', row); continue; }
          await revokeMemberInvites(ctx, row.id);
          const { link } = await issueInvite(ctx, {
            org_id: org.id, member_id: row.id, kind: 'personal', role: inviteRoleFor(row.role), department_id: row.department_id, job_role: row.job_role, max_uses: 1, expires_at,
          });
          results.set(row.id, { id: row.id, name: name(row), ok: true, email: row.email, link });
          renewed++;
        }
        if (renewed) await ctx.audit('invite.renewed', null, { kind: 'personal', bulk: true, count: renewed });
      }

      const rows = ids.map((id) => results.get(id)!);
      return { action, results: rows, changed: rows.filter((row) => row.ok && !row.unchanged).length, failed: rows.filter((row) => !row.ok).length, access_sync_failed: rows.some((row) => row.access_sync_failed) };
    },
  },
  {
    // A person's own saved filters on the People page.
    method: 'GET', path: 'orgs/:org/people/filters', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx) {
      return { filters: check<unknown[]>(await ctx.db.from('company_saved_filters').select('id,name,filters').eq('org_id', ctx.org!.id).eq('user_id', ctx.user).order('name')) };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/people/filters', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, body) {
      const input = obj(body), filters = obj(input.filters);
      const clean: Record<string, string> = {};
      for (const key of ['q', 'department', 'role', 'level', 'seat', 'status']) {
        const value = text(filters[key], key, { max: 100, optional: true });
        if (value) clean[key] = value;
      }
      if (!Object.keys(clean).length) throw new CompanyError('filter_empty', 'Choose a filter to save.', 400);
      const mine = check<{ id: string }[]>(await ctx.db.from('company_saved_filters').select('id').eq('org_id', ctx.org!.id).eq('user_id', ctx.user));
      if (mine.length >= 30) throw new CompanyError('too_many_filters', 'You can keep up to 30 saved filters.', 409);
      const saved = checkUnique<{ id: string; name: string; filters: Record<string, string> }>(await ctx.db.from('company_saved_filters').insert({
        org_id: ctx.org!.id, user_id: ctx.user, name: text(input.name, 'name', { min: 1, max: 60 }), filters: clean,
      }).select('id,name,filters').single(), () => new CompanyError('filter_exists', 'You already have a filter with this name.', 409, { field: 'name' }));
      return { filter: saved };
    },
  },
  {
    method: 'DELETE', path: 'orgs/:org/people/filters/:filter', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, params) {
      if (!UUID.test(params.filter)) throw new CompanyError('filter_not_found', 'Filter not found.', 404);
      const removed = check<{ id: string }[]>(await ctx.db.from('company_saved_filters').delete().eq('id', params.filter).eq('org_id', ctx.org!.id).eq('user_id', ctx.user).select('id'));
      if (!removed.length) throw new CompanyError('filter_not_found', 'Filter not found.', 404);
      return { ok: true };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/people/:member/departments', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx, params) {
      const member = await loadMember(ctx, ctx.org!.id, params.member);
      const rows = check<{ department_id: string }[]>(await ctx.db.from('company_manager_departments').select('department_id').eq('org_id', ctx.org!.id).eq('member_id', member.id));
      return { department_ids: rows.map((row) => row.department_id), primary: member.department_id };
    },
  },
  {
    // { department_ids }: the departments a manager looks after beyond their own.
    method: 'PUT', path: 'orgs/:org/people/:member/departments', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const org = ctx.org!, input = obj(body);
      const member = await loadMember(ctx, org.id, params.member);
      if (member.role !== 'manager') throw new CompanyError('not_a_manager', 'Only a manager looks after departments.', 409);
      if (!Array.isArray(input.department_ids) || input.department_ids.length > 200) throw new CompanyError('invalid_field', 'department_ids must be a list.', 400, { field: 'department_ids' });
      const wanted = [...new Set(input.department_ids as unknown[])];
      for (const id of wanted) await departmentIn(ctx, org.id, id, 'department_ids');
      const ids = wanted.filter((id): id is string => typeof id === 'string' && id !== member.department_id);
      check(await ctx.db.from('company_manager_departments').delete().eq('org_id', org.id).eq('member_id', member.id));
      if (ids.length) check(await ctx.db.from('company_manager_departments').upsert(ids.map((department_id) => ({ org_id: org.id, member_id: member.id, department_id, created_by: ctx.user })), { onConflict: 'member_id,department_id', ignoreDuplicates: true }));
      await ctx.audit('member.departments', member.id, { count: ids.length });
      return { department_ids: ids };
    },
  },
];
