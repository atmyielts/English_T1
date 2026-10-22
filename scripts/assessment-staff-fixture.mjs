// Test-only enrollment/identity fixture, not an implemented invitation flow.
export function seedAssessmentStaff(sql, actors, tenant) {
  actors.local = '00000000-0000-4000-8000-000000000021';
  actors.legacy = '00000000-0000-4000-8000-000000000022';
  sql(`insert into users(id,full_name) values('${actors.local}','Assessment-only author'),('${actors.legacy}','Shared institution examiner');
    insert into tenant_memberships values('${tenant}','${actors.legacy}','active','member');
    insert into assessment_memberships(tenant_id,user_id,status,created_by,updated_by) values('${tenant}','${actors.local}','active','${actors.owner}','${actors.owner}');
    select assessment_staff_command('${actors.owner}','${tenant}','connected-staff-legacy-mark','capability.grant',jsonb_build_object('user_id','${actors.legacy}','capability','grades.mark','expected_revision',0,'reason','Fixture marking responsibility'));
    insert into assessment_capability_grants(tenant_id,user_id,capability,granted_by) values('${tenant}','${actors.legacy}','proctor.review','${actors.owner}');
    do $$declare v uuid;begin v:=(assessment_staff_command('${actors.owner}','${tenant}','connected-staff-author-role','role.create','{"title":"Assessment-only author role","capabilities":["banks.read","items.write"],"reason":"Pinned fixture enrollment role"}')->>'id')::uuid;
    perform assessment_staff_command('${actors.owner}','${tenant}','connected-staff-author-assignment','role.assign',jsonb_build_object('user_id','${actors.local}','role_version_id',v,'expected_assignment_id',null,'reason','Fixture enrolled Assessment author, no organization membership'));end;$$;
    grant select on all tables in schema public to service_role;`);
  return { local: actors.local, legacy: actors.legacy, organizationBefore: sql('select jsonb_agg(to_jsonb(m) order by tenant_id,user_id,status,role) from tenant_memberships m;') };
}
export function assessmentStaffProof(sql, tenant, ids, scoreSnapshot) {
  const value=JSON.parse(sql(`select jsonb_build_object('local_organization_memberships',(select count(*) from tenant_memberships where tenant_id='${tenant}' and user_id='${ids.local}'),'local_assessment_membership',(select to_jsonb(m) from assessment_memberships m where tenant_id='${tenant}' and user_id='${ids.local}'),'local_workspaces',jsonb_array_length(assessment_workspaces('${ids.local}')),'local_can_write',assessment_has_capability('${tenant}','${ids.local}','items.write'),'local_proctor',assessment_has_capability('${tenant}','${ids.local}','proctor.review'),'legacy_assessment',assessment_has_capability('${tenant}','${ids.legacy}','grades.mark'),'legacy_proctor',assessment_has_capability('${tenant}','${ids.legacy}','proctor.review'),'suspensions',(select count(*) from assessment_audit_events where action='staff.member.suspend'),'resumptions',(select count(*) from assessment_audit_events where action='staff.member.resume'),'local_banks',(select count(*) from assessment_item_banks where created_by='${ids.local}'));`));
  return {...value,organization_unchanged:ids.organizationBefore===sql('select jsonb_agg(to_jsonb(m) order by tenant_id,user_id,status,role) from tenant_memberships m;'),scores_unchanged:scoreSnapshot===sql('select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;')};
}
