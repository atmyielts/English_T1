// Identity and the initial role template are explicit fixtures. Invitation
// creation, recipient acceptance and service membership must use actual APIs.
export function seedAssessmentInvitations(sql, actors, tenant) {
  actors.invited = "00000000-0000-4000-8000-000000000031";
  actors.unverified = "00000000-0000-4000-8000-000000000032";
  sql(
    `insert into users(id,full_name) values('${actors.invited}','New Assessment invitee'),('${actors.unverified}','Unverified fixture identity');`,
  );
  const role = JSON.parse(
    sql(
      `select assessment_staff_command('${actors.owner}','${tenant}','invitation-browser-role','role.create','{"title":"Invited Assessment author","capabilities":["banks.read","items.write"],"reason":"Reviewed fixture role template, not a membership"}');`,
    ),
  );
  return {
    role: role.id,
    invited: actors.invited,
    organizationBefore: sql(
      "select jsonb_agg(to_jsonb(m) order by tenant_id,user_id,status,role) from tenant_memberships m;",
    ),
  };
}
export function assessmentInvitationProof(sql, tenant, ids, scoreSnapshot) {
  const proof = JSON.parse(
    sql(
      `select jsonb_build_object('invitations',(select count(*) from assessment_staff_invitations),'accepted',(select count(*) from assessment_staff_invitations where state='accepted'),'revoked',(select count(*) from assessment_staff_invitations where state='revoked'),'acceptance_audits',(select count(*) from assessment_audit_events where action='staff.invite.accept'),'creation_audits',(select count(*) from assessment_audit_events where action='staff.invite.create'),'assignments',(select count(*) from assessment_staff_role_assignments where user_id='${ids.invited}'),'service_memberships',(select count(*) from assessment_memberships where user_id='${ids.invited}'),'organization_memberships',(select count(*) from tenant_memberships where user_id='${ids.invited}'),'can_write',assessment_has_capability('${tenant}','${ids.invited}','items.write'),'can_manage',assessment_has_capability('${tenant}','${ids.invited}','team.manage'),'can_proctor',assessment_has_capability('${tenant}','${ids.invited}','proctor.review'),'banks',(select count(*) from assessment_item_banks where created_by='${ids.invited}'));`,
    ),
  );
  return {
    ...proof,
    organization_unchanged: ids.organizationBefore ===
      sql(
        "select jsonb_agg(to_jsonb(m) order by tenant_id,user_id,status,role) from tenant_memberships m;",
      ),
    scores_unchanged: scoreSnapshot ===
      sql(
        "select jsonb_agg(to_jsonb(s) order by id) from assessment_score_revisions s;",
      ),
  };
}
