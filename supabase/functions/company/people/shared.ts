// Helpers shared by the people, invitation, join, settings and staff routes.
// Browser-safe: no Deno globals, so the preview can run them too.
import { isJobRole, isLevel, isOrgRole, type JobRole, type Level, type OrgRole } from '../../../../packages/company-core/src/mod.ts';
import { MEMBER_COLUMNS } from '../handler.ts';
import { check, CompanyError, UUID, type Ctx, type Db, type MemberRow, type OrgRow } from '../types.ts';
import { sha256, token } from '../util.ts';

export const DAY = 86_400_000;
/** How long a personal invitation stays open. */
export const PERSONAL_DAYS = 14;
/** How long an owner invitation from Schood staff stays open. */
export const OWNER_DAYS = 30;
export const INVITE_COLUMNS = 'id,org_id,member_id,kind,role,department_id,job_role,max_uses,uses,expires_at,revoked_at,created_by,created_at';

export interface InviteRow {
  id: string;
  org_id: string;
  member_id: string | null;
  kind: 'personal' | 'link';
  role: 'admin' | 'manager' | 'employee';
  department_id: string | null;
  job_role: string;
  max_uses: number | null;
  uses: number;
  expires_at: string;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
}
export type InviteState = 'open' | 'expired' | 'revoked' | 'used_up';

export function inviteState(invite: Pick<InviteRow, 'revoked_at' | 'expires_at' | 'max_uses' | 'uses' | 'kind'>, now: Date): InviteState {
  if (invite.revoked_at) return 'revoked';
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return 'expired';
  const cap = invite.kind === 'personal' ? 1 : invite.max_uses;
  if (cap !== null && cap !== undefined && invite.uses >= cap) return 'used_up';
  return 'open';
}

/** Whether the caller runs HR here (owner, HR admin, or Schood staff). */
export const isHr = (ctx: Ctx): boolean => ctx.staff || ctx.member?.role === 'owner' || ctx.member?.role === 'admin';
/** Owners and staff may create, change and remove owners. */
export const actsAsOwner = (ctx: Ctx): boolean => ctx.staff || ctx.member?.role === 'owner';

/** The public link for a raw invitation token. */
export const joinLink = (ctx: Ctx, raw: string): string => `${ctx.env.appUrl}/join/${raw}`;

/** Creates an invitation row; only the sha256 of the token is stored, the link is returned once. */
export async function issueInvite(ctx: Ctx, row: {
  org_id: string; member_id: string | null; kind: 'personal' | 'link'; role: InviteRow['role'];
  department_id: string | null; job_role: string; max_uses: number | null; expires_at: string;
}): Promise<{ invite: InviteRow; link: string }> {
  const raw = token();
  const invite = check<InviteRow>(await ctx.db.from('company_invites').insert({ ...row, uses: 0, revoked_at: null, token_hash: await sha256(raw), created_by: ctx.user }).select(INVITE_COLUMNS).single());
  return { invite, link: joinLink(ctx, raw) };
}

/** Personal invitations carry a placeholder role; the member row holds the real one. */
export const inviteRoleFor = (role: OrgRole): InviteRow['role'] => role === 'owner' ? 'admin' : role;

/** Reads every page of a query (PostgREST returns at most 1,000 rows at a time). */
export async function fetchAll<T>(build: () => { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> }, cap = 20_000): Promise<T[]> {
  const page = 1000, out: T[] = [];
  for (let from = 0; from < cap; from += page) {
    const rows = check<T[]>(await build().range(from, from + page - 1) as { data: T[] | null; error: { code?: string; message: string } | null });
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

export async function loadMember(ctx: Ctx, orgId: string, memberId: string): Promise<MemberRow> {
  if (!UUID.test(memberId)) throw new CompanyError('member_not_found', 'This person is not in the workspace.', 404);
  const member = check<MemberRow | null>(await ctx.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', orgId).eq('id', memberId).maybeSingle());
  if (!member) throw new CompanyError('member_not_found', 'This person is not in the workspace.', 404);
  return member;
}

export async function activeOwnerIds(db: Db, orgId: string): Promise<string[]> {
  const rows = check<{ id: string }[]>(await db.from('company_members').select('id').eq('org_id', orgId).eq('role', 'owner').eq('status', 'active'));
  return rows.map((row) => row.id);
}

/** Refuses a change that would leave the workspace with no active owner. */
export async function assertOwnerRemains(db: Db, orgId: string, leaving: MemberRow): Promise<void> {
  if (leaving.role !== 'owner' || leaving.status !== 'active') return;
  const owners = await activeOwnerIds(db, orgId);
  if (!owners.some((id) => id !== leaving.id)) throw new CompanyError('last_owner', 'A workspace needs at least one owner. Make someone else an owner first.', 409);
}

/** Maps the database's own guards (see 20261031140000_company_people.sql) to friendly errors. */
export function guardError(cause: unknown): never {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.includes('company_last_owner')) throw new CompanyError('last_owner', 'A workspace needs at least one owner. Make someone else an owner first.', 409);
  throw cause;
}

/** A department id that must belong to the workspace, or null. */
export async function departmentIn(ctx: Ctx, orgId: string, value: unknown, field = 'department_id'): Promise<string | null> {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !UUID.test(value)) throw new CompanyError('invalid_field', `${field} must be a department.`, 400, { field });
  const found = check<{ id: string } | null>(await ctx.db.from('company_departments').select('id').eq('org_id', orgId).eq('id', value).maybeSingle());
  if (!found) throw new CompanyError('invalid_field', `${field} must be a department of this workspace.`, 400, { field });
  return value;
}

export function jobRole(value: unknown, field = 'job_role', fallback: JobRole = 'general'): JobRole {
  if (value === undefined || value === null || value === '') return fallback;
  if (!isJobRole(value)) throw new CompanyError('invalid_field', `${field} is not a job role.`, 400, { field });
  return value;
}

export function orgRole(value: unknown, field = 'role', fallback: OrgRole = 'employee'): OrgRole {
  if (value === undefined || value === null || value === '') return fallback;
  if (!isOrgRole(value)) throw new CompanyError('invalid_field', `${field} is not a workspace role.`, 400, { field });
  return value;
}

export function levelOrNull(value: unknown, field: string): Level | null {
  if (value === undefined || value === null || value === '') return null;
  if (!isLevel(value)) throw new CompanyError('invalid_field', `${field} is not a CEFR level.`, 400, { field });
  return value;
}

/** A calendar date (YYYY-MM-DD) or null. */
export function dateOrNull(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new CompanyError('invalid_field', `${field} must be a date (YYYY-MM-DD).`, 400, { field });
  }
  const year = Number(value.slice(0, 4));
  if (year < 2020 || year > 2100) throw new CompanyError('invalid_field', `${field} is out of range.`, 400, { field });
  return value;
}

/** Revokes every open personal invitation of a member (after removal or re-issue). */
export async function revokeMemberInvites(ctx: Ctx, memberId: string): Promise<void> {
  check(await ctx.db.from('company_invites').update({ revoked_at: ctx.now().toISOString() }).eq('member_id', memberId).is('revoked_at', null));
}

/** Seats in use: seated members who are not removed. */
export async function seatCount(db: Db, orgId: string): Promise<number> {
  const { count, error } = await db.from('company_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('seat', true).neq('status', 'removed');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Sets the workspace on ctx so audit rows carry its id (user and staff routes). */
export function useOrg(ctx: Ctx, org: OrgRow): void {
  ctx.org = org;
}
