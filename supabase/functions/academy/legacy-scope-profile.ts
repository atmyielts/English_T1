import {
  academyAccessProfile as oldProfile,
  academyRoleRank,
  buildAcademyPermissions,
  type AcademyAccessPermissions,
  type MembershipRow,
} from './access.ts';
import { resolveAcademyCapabilityScope } from './capability-scope.ts';

// This is presentation data. Resource authorization remains in the database,
// against each original capability and its current binding.
export function currentAcademyAccessProfile(access: MembershipRow, now = new Date()): Record<string, unknown> {
  const original = (access as MembershipRow & {legacy_original_access?: MembershipRow}).legacy_original_access;
  if (original) return currentAcademyAccessProfile(original, now);
  const entries = access.authority_entries ?? [access];
  const permissions = {} as AcademyAccessPermissions;
  const scopes: Record<string, unknown> = {};
  const branches = new Set<string>(), classrooms = new Set<string>(), students = new Set<string>();
  let academyWide = false;
  for (const capability of Object.keys(buildAcademyPermissions({ ...access, authority_entries: undefined })) as (keyof AcademyAccessPermissions)[]) {
    const scope = resolveAcademyCapabilityScope(access.tenant_id, entries, capability, now);
    permissions[capability] = ['manageAcademy','manageBranding','manageLocalization','sendGlobalAnnouncements'].includes(capability)
      ? scope.academyWide : scope.sources.length > 0;
    scopes[capability] = { academy_wide: scope.academyWide, branch_ids: scope.branchIds, classroom_ids: scope.classroomIds, student_ids: scope.studentIds };
    academyWide ||= scope.academyWide;
    scope.branchIds.forEach(id => branches.add(id));
    scope.classroomIds.forEach(id => classrooms.add(id));
    scope.studentIds.forEach(id => students.add(id));
  }
  return {
    ...oldProfile(access),
    scope: academyWide ? 'academy' : branches.size ? 'assigned_branches' : 'assigned_classrooms',
    branch_ids: [...branches].sort(), classroom_ids: [...classrooms].sort(), student_ids: [...students].sort(),
    permissions, capability_scopes: scopes,
  };
}

export function effectiveLegacyMembership(access: MembershipRow, entries: MembershipRow[]): MembershipRow {
  if (!entries.length) throw new Error('Forbidden');
  const chosen = [...entries].sort((a, b) => academyRoleRank(b.role) - academyRoleRank(a.role))[0];
  return {
    ...access, role: chosen.role, source: chosen.source, scope_type: chosen.scope_type,
    scope_ids: chosen.scope_ids, authority_entries: entries,
    branch_ids: [...new Set(entries.flatMap(entry => entry.scope_type === 'branches' && Array.isArray(entry.scope_ids) ? entry.scope_ids as string[] : entry.branch_ids ?? []))],
    classroom_ids: [...new Set(entries.flatMap(entry => entry.scope_type === 'classrooms' && Array.isArray(entry.scope_ids) ? entry.scope_ids as string[] : entry.classroom_ids ?? []))],
    // Only the scoped table client consumes this marker. Public profiles never
    // serialize it; other consumers keep their original filtering behavior.
    legacy_row_boundary: true,
    legacy_original_access: access,
  } as MembershipRow;
}
