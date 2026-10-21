import assert from 'node:assert/strict';
export function seedAcademicMarkers(sql,{tenant,owner,marker1,marker2}){
  // Only the historical identity/membership spine is seeded. Permissions use the
  // canonical owner-authorized staff command, not direct grant-table writes.
  for(const [index,marker]of [marker1,marker2].entries()){
    sql(`insert into users values('${marker}');insert into tenant_memberships values('${tenant}','${marker}','active','member');select assessment_staff_command('${owner}','${tenant}','answer-marker-grant-${index}','capability.grant',jsonb_build_object('user_id','${marker}','capability','grades.mark','expected_revision',0,'reason','Pre-authorized synthetic institutional marker'));`);
  }
}
export function academicAnswerReport(sql){
  const report=JSON.parse(sql(`select jsonb_build_object(
    'answer_assets',(select count(*) from assessment_artifacts where purpose='answer' and state='ready'),
    'prompt_assets',(select count(*) from assessment_artifacts where purpose='prompt'),
    'bindings',(select count(*) from assessment_answer_assets),
    'admissions',(select count(*) from assessment_answer_commands where request->>'action'='upload.begin'),
    'parts',(select count(*) from assessment_artifact_parts),
    'scans',(select count(*) from assessment_artifact_scan_reports),
    'approved_questions',(select count(*) from assessment_item_versions where status='approved'),
    'attempts',(select count(*) from assessment_attempts where state='submitted' and last_sequence=5),
    'responses',(select count(*) from assessment_response_journal),
    'tasks',(select count(*) from assessment_grading_tasks),
    'assignments',(select count(*) from assessment_grading_assignments where revoked_at is null),
    'marks',(select count(*) from assessment_grading_marks),
    'run',(select jsonb_build_object('status',status,'summary',assessment_grading_summary(id)) from assessment_grading_runs),
    'score_revisions',(select count(*) from assessment_score_revisions),
    'score_history',(select jsonb_agg(jsonb_build_object('status',status,'source',source,'approved',approved_by is not null) order by status,source) from assessment_score_revisions),
    'released_human_scores',(select count(*) from assessment_grading_releases l join assessment_score_revisions s on s.id=l.score_revision_id where s.status='approved' and s.source='human' and s.approved_by is not null),
    'releases',(select count(*) from assessment_grading_releases));`));
  for(const key of ['answer_assets','bindings','admissions','scans','approved_questions','tasks'])assert.equal(report[key],3,key);
  assert.equal(report.responses,5);
  assert.equal(report.prompt_assets,0);assert.equal(report.attempts,1);assert.equal(report.parts,4);assert.equal(report.assignments,6);assert.equal(report.marks,6);assert.equal(report.score_revisions,2,'Retain both the immutable deterministic proposal and the independently approved human revision');assert.equal(report.released_human_scores,1);assert.deepEqual(report.score_history,[{status:'approved',source:'human',approved:true},{status:'needs_human',source:'deterministic',approved:false}]);assert.equal(report.releases,1);assert.equal(report.run.status,'released');assert.equal(Number(report.run.summary.total),24);
  assert.equal(sql("select count(*) from assessment_response_journal where response ? 'score' or response ? 'filename' or response ? 'url';"),'0');
  return report;
}
