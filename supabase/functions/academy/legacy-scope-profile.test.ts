import { currentAcademyAccessProfile, effectiveLegacyMembership } from './legacy-scope-profile.ts';
import type { MembershipRow } from './access.ts';
const academy = '00000000-0000-4000-8000-000000000001', a = '00000000-0000-4000-8000-000000000002', b = '00000000-0000-4000-8000-000000000003';
const grant = (role: string, branch: string): MembershipRow => ({tenant_id: academy, role, status:'active', source:'grant', scope_type:'branches', scope_ids:[branch]});
const assert = (value: unknown) => { if (!value) throw Error('Legacy presentation boundary assertion failed'); };
Deno.test('mixed branch grants never present a scoped administrator as Academy-wide', () => {
  const entries = [grant('admin', b), grant('cashier', a)], p = currentAcademyAccessProfile({...entries[0], authority_entries: entries});
  assert(p.scope === 'assigned_branches');
  const scopes = p.capability_scopes as Record<string,{academy_wide:boolean; branch_ids:string[]}>;
  assert(!scopes.manageAcademicOperations.academy_wide && JSON.stringify(scopes.manageAcademicOperations.branch_ids) === JSON.stringify([b]));
  assert(JSON.stringify(scopes.collectFinance.branch_ids) === JSON.stringify([a,b]));
});
Deno.test('presentation keeps complementary permissions and removes expired or malformed grant scopes', () => {
  const entries = [grant('manager', b), {...grant('teacher',a),scope_type:'classrooms'}, {...grant('admin',a),expires_at:'2020-01-01'}, {...grant('owner',a),scope_type:'academy'}];
  const p=currentAcademyAccessProfile({...entries[0],authority_entries:entries});
  const permissions=p.permissions as Record<string,boolean>;
  assert(permissions.manageAssignments && permissions.manageAdmissions && !permissions.manageStaff);
  assert(p.scope!=='academy');
});
Deno.test('legacy capability routing uses an actual qualifying role and does not serialize its internal marker', () => {
  const original={...grant('manager',b),authority_entries:[grant('manager',b),{...grant('teacher',a),scope_type:'classrooms'}]};
  const effective=effectiveLegacyMembership(original,[original.authority_entries[1]]);
  assert(effective.role==='teacher' && JSON.stringify(effective.classroom_ids)===JSON.stringify([a]));
  assert(!('legacy_row_boundary' in currentAcademyAccessProfile(effective)));
});
