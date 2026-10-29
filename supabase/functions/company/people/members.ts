// People in a workspace: the list (HR sees everyone, a manager their department),
// CSV import, edits, learning seats, removal and leaving.
import { HR_ROLES, LEAD_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { syncAccess, usage } from '../core.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, CompanyError, type Ctx, type MemberRow, type Route } from '../types.ts';
import { obj, text, email as readEmail } from '../util.ts';
import { readImport, MAX_IMPORT_ROWS } from './csv.ts';
import {
  actsAsOwner, assertOwnerRemains, dateOrNull, DAY, departmentIn, fetchAll, guardError, INVITE_COLUMNS, inviteRoleFor, inviteState, issueInvite, isHr,
  jobRole, levelOrNull, loadMember, orgRole, PERSONAL_DAYS, revokeMemberInvites, seatCount, type InviteRow,
} from './shared.ts';

/** Columns HR edits; `email` and `full_name` only matter before the person joins. */
async function applyEdit(ctx: Ctx, member: MemberRow, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const orgId = ctx.org!.id;
  const patch: Record<string, unknown> = {};
  if ('role' in input) {
    const role = orgRole(input.role);
    if (role !== member.role) {
      if ((member.role === 'owner' || role === 'owner') && !actsAsOwner(ctx)) throw new CompanyError('owner_protected', 'Only an owner can change owners.', 403);
      if (member.role === 'owner') await assertOwnerRemains(ctx.db, orgId, member);
      patch.role = role;
    }
  }
  if ('department_id' in input) patch.department_id = await departmentIn(ctx, orgId, input.department_id);
  if ('job_role' in input) patch.job_role = jobRole(input.job_role);
  if ('target_level' in input) patch.target_level = levelOrNull(input.target_level, 'target_level');
  if ('target_date' in input) patch.target_date = dateOrNull(input.target_date, 'target_date');
  if ('full_name' in input) patch.full_name = text(input.full_name, 'full_name', { max: 120, optional: true });
  if ('email' in input) {
    if (member.status !== 'invited') throw new CompanyError('email_locked', 'The email of someone who has joined comes from their Schood account.', 409);
    const next = readEmail(input.email, 'email', true);
    if (next && next !== member.email) {
      const taken = check<{ id: string }[]>(await ctx.db.from('company_members').select('id').eq('org_id', orgId).eq('email', next).neq('status', 'removed'));
      if (taken.some((row) => row.id !== member.id)) throw new CompanyError('member_exists', 'Someone with this email is already in the workspace.', 409, { field: 'email' });
    }
    patch.email = next;
  }
  return patch;
}

export const memberRoutes: Route[] = [
  {
    // Everyone HR can see (a manager: their own department), with open invitations and usage.
    method: 'GET', path: 'orgs/:org/people', access: 'org', roles: LEAD_ROLES, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const org = ctx.org!, hr = isHr(ctx);
      const withRemoved = hr && query.get('removed') === '1';
      let members = await fetchAll<MemberRow & { invited_at?: string; removed_at?: string | null }>(() => {
        let q = ctx.db.from('company_members').select(`${MEMBER_COLUMNS},invited_at,removed_at`).eq('org_id', org.id);
        if (!withRemoved) q = q.neq('status', 'removed');
        return q.order('full_name', { ascending: true }).order('id', { ascending: true });
      });
      if (!hr) {
        const own = ctx.member!;
        members = members.filter((row) => row.id === own.id || (own.department_id !== null && row.department_id === own.department_id));
      }
      const departments = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id).order('name'));
      let invites: InviteRow[] = [];
      if (hr) invites = check<InviteRow[]>(await ctx.db.from('company_invites').select(INVITE_COLUMNS).eq('org_id', org.id).is('revoked_at', null).order('created_at', { ascending: false }).limit(2000));
      const now = ctx.now();
      const personal = new Map(invites.filter((invite) => invite.kind === 'personal' && invite.member_id).map((invite) => [invite.member_id!, invite]));
      return {
        members: members.map((row) => {
          const invite = row.status === 'invited' ? personal.get(row.id) : undefined;
          return { ...row, invite: invite ? { id: invite.id, expires_at: invite.expires_at, state: inviteState(invite, now) } : null };
        }),
        departments,
        links: invites.filter((invite) => invite.kind === 'link').map((invite) => ({ ...invite, state: inviteState(invite, now) })),
        usage: hr ? await usage(ctx.db, org) : null,
        status: org.status,
        scope: hr ? 'all' : 'department',
        can_edit: hr,
      };
    },
  },
  {
    // CSV import: `dry_run` checks every row; otherwise valid rows become invited people with personal links.
    method: 'POST', path: 'orgs/:org/people/import', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body), org = ctx.org!;
      const csv = text(input.csv, 'csv', { min: 1, max: 400_000 })!;
      const existing = await fetchAll<{ email: string | null }>(() => ctx.db.from('company_members').select('email').eq('org_id', org.id).neq('status', 'removed').order('id'));
      const emails = new Set(existing.map((row) => (row.email ?? '').toLowerCase()).filter(Boolean));
      const { rows, header, tooMany } = readImport(csv, emails);
      if (tooMany) throw new CompanyError('import_too_large', `Import at most ${MAX_IMPORT_ROWS} people at a time.`, 400, { max: MAX_IMPORT_ROWS });
      const departments = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', org.id));
      const byName = new Map(departments.map((row) => [row.name.trim().toLowerCase(), row.id]));
      const fresh = [...new Set(rows.filter((row) => !row.error && row.department && !byName.has(row.department.toLowerCase())).map((row) => row.department!))];
      const valid = rows.filter((row) => !row.error);
      const summary = { header, total: rows.length, valid: valid.length, invalid: rows.length - valid.length, new_departments: fresh };
      if (input.dry_run !== false) return { ...summary, rows: rows.map((row) => ({ ...row, department_new: Boolean(row.department && !byName.has(row.department.toLowerCase())) })) };
      if (!valid.length) throw new CompanyError('import_empty', 'There are no valid rows to import.', 400);

      // Create the departments the file names, keeping the first spelling of each.
      const unique = new Map<string, string>();
      for (const name of fresh) if (!unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name);
      if (unique.size) {
        if (departments.length + unique.size > 200) throw new CompanyError('too_many_departments', 'A workspace can have up to 200 departments.', 409);
        const created = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').insert([...unique.values()].map((name) => ({ org_id: org.id, name }))).select('id,name'));
        for (const row of created) byName.set(row.name.trim().toLowerCase(), row.id);
      }
      const now = ctx.now(), expires = new Date(now.getTime() + PERSONAL_DAYS * DAY).toISOString();
      const people = valid.map((row) => ({
        id: crypto.randomUUID(), org_id: org.id, email: row.email, full_name: row.name, role: row.role!, job_role: row.job_role!,
        department_id: row.department ? byName.get(row.department.toLowerCase()) ?? null : null,
        status: 'invited', seat: false, invited_by: ctx.user, invited_at: now.toISOString(),
      }));
      check(await ctx.db.from('company_members').insert(people));
      const results = [];
      for (const [index, person] of people.entries()) {
        const { link } = await issueInvite(ctx, {
          org_id: org.id, member_id: person.id, kind: 'personal', role: inviteRoleFor(person.role), department_id: person.department_id,
          job_role: person.job_role, max_uses: 1, expires_at: expires,
        });
        results.push({ line: valid[index].line, member_id: person.id, name: person.full_name, email: person.email, department: valid[index].department, job_role: person.job_role, role: person.role, link });
      }
      await ctx.audit('member.imported', null, { count: people.length, departments_created: unique.size });
      return { ...summary, created: results, expires_at: expires };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/people/:member', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const org = ctx.org!, input = obj(body);
      const member = await loadMember(ctx, org.id, params.member);
      if (member.status === 'removed') throw new CompanyError('member_removed', 'This person was removed from the workspace.', 409);
      const patch = await applyEdit(ctx, member, input);
      if (!Object.keys(patch).length) return { member };
      let updated: MemberRow;
      try {
        updated = check<MemberRow>(await ctx.db.from('company_members').update(patch).eq('id', member.id).select(MEMBER_COLUMNS).single());
      } catch (cause) {
        guardError(cause);
      }
      // A demotion raced with another one: put it back rather than leave no owner.
      if (patch.role && member.role === 'owner' && !(await assertOwnerStill(ctx, member))) {
        check(await ctx.db.from('company_members').update({ role: 'owner' }).eq('id', member.id));
        throw new CompanyError('last_owner', 'A workspace needs at least one owner. Make someone else an owner first.', 409);
      }
      if (patch.role && member.status === 'invited' && member.role !== patch.role) {
        // Keep the personal invitation's placeholder in step with the member's role.
        check(await ctx.db.from('company_invites').update({ role: inviteRoleFor(updated!.role) }).eq('member_id', member.id).is('revoked_at', null));
      }
      const changes = Object.fromEntries(Object.keys(patch).map((key) => [key, { from: (member as unknown as Record<string, unknown>)[key] ?? null, to: patch[key] }]));
      await ctx.audit('member.updated', member.id, changes);
      return { member: updated! };
    },
  },
  {
    // Learning seat on or off. Seats exist only in active workspaces, within seats_limit.
    method: 'POST', path: 'orgs/:org/people/:member/seat', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const org = ctx.org!, input = obj(body);
      if (typeof input.seat !== 'boolean') throw new CompanyError('invalid_field', 'seat must be true or false.', 400, { field: 'seat' });
      const member = await loadMember(ctx, org.id, params.member);
      if (member.status === 'removed') throw new CompanyError('member_removed', 'This person was removed from the workspace.', 409);
      if (member.seat === input.seat) return { member, usage: await usage(ctx.db, org) };
      if (input.seat) {
        if (org.status !== 'active') throw new CompanyError('seats_inactive', 'Learning seats are available once Schood activates your agreement.', 409, { status: org.status });
        if (org.contract_ends_at && new Date(org.contract_ends_at).getTime() <= ctx.now().getTime()) throw new CompanyError('contract_ended', 'Your agreement has ended. Contact Schood to renew it.', 409);
        if (await seatCount(ctx.db, org.id) >= org.seats_limit) throw new CompanyError('seats_full', 'All learning seats are in use.', 409, { limit: org.seats_limit });
      }
      const updated = check<MemberRow>(await ctx.db.from('company_members').update({ seat: input.seat }).eq('id', member.id).select(MEMBER_COLUMNS).single());
      // Two HR tabs may seat people at the same moment: re-count and roll back if over.
      if (input.seat && await seatCount(ctx.db, org.id) > org.seats_limit) {
        check(await ctx.db.from('company_members').update({ seat: false }).eq('id', member.id));
        throw new CompanyError('seats_full', 'All learning seats are in use.', 409, { limit: org.seats_limit });
      }
      const access = await syncAccess(ctx.db, member.user_id);
      await ctx.audit(input.seat ? 'member.seat_on' : 'member.seat_off', member.id, { access });
      return { member: updated, usage: await usage(ctx.db, org) };
    },
  },
  {
    // Removes a person: status removed, seat off, open invitations revoked, English access re-synced.
    method: 'DELETE', path: 'orgs/:org/people/:member', access: 'org', roles: HR_ROLES, allowSuspended: true,
    async handle(ctx, params) {
      const org = ctx.org!;
      const member = await loadMember(ctx, org.id, params.member);
      if (member.status === 'removed') return { member };
      if (member.role === 'owner' && !actsAsOwner(ctx)) throw new CompanyError('owner_protected', 'Only an owner can remove an owner.', 403);
      await assertOwnerRemains(ctx.db, org.id, member);
      let updated: MemberRow;
      try {
        updated = check<MemberRow>(await ctx.db.from('company_members').update({ status: 'removed', seat: false, removed_at: ctx.now().toISOString() }).eq('id', member.id).select(MEMBER_COLUMNS).single());
      } catch (cause) {
        guardError(cause);
      }
      await revokeMemberInvites(ctx, member.id);
      const access = await syncAccess(ctx.db, member.user_id);
      await ctx.audit('member.removed', member.id, { name: member.full_name, email: member.email, access });
      return { member: updated! };
    },
  },
  {
    // Anyone may leave a workspace, except its last owner.
    method: 'POST', path: 'orgs/:org/people/me/leave', access: 'org', allowSuspended: true,
    async handle(ctx) {
      const member = ctx.member;
      if (!member) throw new CompanyError('not_member', 'You are not in this workspace.', 403);
      await assertOwnerRemains(ctx.db, ctx.org!.id, member);
      try {
        check(await ctx.db.from('company_members').update({ status: 'removed', seat: false, removed_at: ctx.now().toISOString() }).eq('id', member.id));
      } catch (cause) {
        guardError(cause);
      }
      const access = await syncAccess(ctx.db, member.user_id);
      await ctx.audit('member.left', member.id, { access });
      return { left: true };
    },
  },
];

async function assertOwnerStill(ctx: Ctx, member: MemberRow): Promise<boolean> {
  const owners = check<{ id: string }[]>(await ctx.db.from('company_members').select('id').eq('org_id', member.org_id).eq('role', 'owner').eq('status', 'active'));
  return owners.length > 0;
}
