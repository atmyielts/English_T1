import {
  buildAcademyPermissions, isAcademyBranchRole, isAcademyTeachingRole,
  normalizeAcademyRole, type AcademyAccessPermissions, type MembershipRow, type AcademyRoleGrantRow,
} from './access.ts';

export type AcademyAuthorityEntry = MembershipRow & {
  scope_type?: string | null;
  scope_ids?: unknown;
  starts_at?: string | null;
  expires_at?: string | null;
};

export type AcademyCapabilityScope = {
  academyWide: boolean;
  branchIds: string[];
  classroomIds: string[];
  studentIds: string[];
  sources: AcademyAuthorityEntry[];
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const identifiers = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !uuid.test(id))) return null;
  return [...new Set(value.map(id => (id as string).toLowerCase()))].sort();
};

export type AcademyVerifiedPrincipal = {
  userId: string;
  email: string | null;
  emailVerified: boolean;
};

export function academyAuthorityIdentityMatches(
  binding: {user_id?: unknown; email?: unknown}, principal: AcademyVerifiedPrincipal,
): boolean {
  if (!uuid.test(principal.userId)) return false;
  if (binding.user_id != null) return typeof binding.user_id === 'string'
    && uuid.test(binding.user_id) && binding.user_id.toLowerCase() === principal.userId.toLowerCase();
  const email = principal.email?.trim().toLowerCase();
  return principal.emailVerified && Boolean(email) && typeof binding.email === 'string'
    && binding.email.trim().toLowerCase() === email;
}

// Callers supply the identity returned by Auth, never fields from request JSON.
// A verified matching email cannot take over a grant bound to another user.
export function academyGrantAuthorityEntry(
  grant: AcademyRoleGrantRow & {user_id?: unknown; email?: unknown},
  principal: AcademyVerifiedPrincipal,
): AcademyAuthorityEntry | null {
  if (!uuid.test(principal.userId) || typeof grant.id !== 'string' || !uuid.test(grant.id)
    || typeof grant.academy_id !== 'string' || !uuid.test(grant.academy_id)
    || grant.status !== 'active') return null;
  if (!academyAuthorityIdentityMatches(grant, principal)) return null;
  return {
    tenant_id: grant.academy_id.toLowerCase(), role: normalizeAcademyRole(grant.role),
    status: 'active', source: 'grant', grant_id: grant.id.toLowerCase(),
    scope_type: grant.scope_type, scope_ids: Array.isArray(grant.scope_ids) ? grant.scope_ids.slice() : grant.scope_ids,
    starts_at: grant.starts_at, expires_at: grant.expires_at,
  };
}
const withinDates = (entry: AcademyAuthorityEntry, now: number): boolean => {
  const start = entry.starts_at ? Date.parse(entry.starts_at) : -Infinity;
  const end = entry.expires_at ? Date.parse(entry.expires_at) : Infinity;
  return !Number.isNaN(start) && !Number.isNaN(end) && start <= now && now < end;
};

// Resolve each capability against its original grants. Presentation rank must
// never promote a lower-role assignment into a higher-role permission.
export function resolveAcademyCapabilityScope(
  academyId: string, entries: readonly AcademyAuthorityEntry[],
  capability: keyof AcademyAccessPermissions, now = new Date(),
): AcademyCapabilityScope {
  const result: AcademyCapabilityScope = {
    academyWide: false, branchIds: [], classroomIds: [], studentIds: [], sources: [],
  };
  if (!uuid.test(academyId) || !Number.isFinite(now.getTime())) return result;
  const branches = new Set<string>(), classrooms = new Set<string>(), students = new Set<string>();
  for (const entry of entries) {
    if (entry.tenant_id.toLowerCase() !== academyId.toLowerCase() || entry.status !== 'active'
      || !withinDates(entry, now.getTime()) || buildAcademyPermissions(entry)[capability] !== true) continue;
    const role = normalizeAcademyRole(entry.role);
    let scope: string;
    let ids: string[] | null;
    if (entry.source === 'grant') {
      scope = String(entry.scope_type ?? '').toLowerCase();
      scope = ({branch: 'branches', classroom: 'classrooms', student: 'students'} as Record<string,string>)[scope] ?? scope;
      if (!['academy', 'branches', 'classrooms', 'students'].includes(scope)) continue;
      ids = identifiers(entry.scope_ids);
      if (ids === null || (scope === 'academy' && ids.length !== 0)) continue;
    } else {
      scope = isAcademyBranchRole(role) ? 'branches' : isAcademyTeachingRole(role) ? 'classrooms' : 'academy';
      ids = scope === 'branches' ? identifiers(entry.branch_ids ?? [])
        : scope === 'classrooms' ? identifiers(entry.classroom_ids ?? []) : [];
      if (ids === null) continue;
    }
    if (scope !== 'academy' && ids.length === 0) continue;
    result.sources.push({
      ...entry, classroom_ids: entry.classroom_ids?.slice(), branch_ids: entry.branch_ids?.slice(),
      scope_ids: Array.isArray(entry.scope_ids) ? entry.scope_ids.slice() : entry.scope_ids,
    });
    if (scope === 'academy') result.academyWide = true;
    for (const id of ids) {
      if (scope === 'branches') branches.add(id);
      if (scope === 'classrooms') classrooms.add(id);
      if (scope === 'students') students.add(id);
    }
  }
  result.branchIds = [...branches].sort();
  result.classroomIds = [...classrooms].sort();
  result.studentIds = [...students].sort();
  return result;
}
