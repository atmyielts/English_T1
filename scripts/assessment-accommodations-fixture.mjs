/** Disposable canonical sitting for the accommodation browser journey. Every
 * mutation goes through assessment_command against the local test database. */
export function seedAssessmentAccommodations(sql,actors,tenant){
 sql(`create table assessment_accommodation_fixture_ids(window_id uuid,registration_id uuid,running_window_id uuid,running_registration_id uuid);do $$declare bank uuid;item uuid;definition jsonb;assessment uuid;published uuid;w uuid;r uuid;rw uuid;rr uuid;begin
 bank:=(assessment_command('${actors.owner}','${tenant}','browser-accommodation-bank','bank.create','{"title":"Accommodation library"}')->>'id')::uuid;
 item:=(assessment_command('${actors.owner}','${tenant}','browser-accommodation-item','item.create',jsonb_build_object('bank_id',bank,'item',jsonb_build_object('schema_version','assessment.item.v1','type','numeric','prompt','How many minutes are in a quarter hour?','locale','en','max_score',1,'tags','[]'::jsonb),'key','{"numeric":{"value":15,"tolerance":0}}'::jsonb))->>'id')::uuid;
 perform assessment_command('${actors.owner}','${tenant}','browser-accommodation-submit','item.submit',jsonb_build_object('id',item));
 perform assessment_command('${actors.reviewer}','${tenant}','browser-accommodation-approve','item.approve',jsonb_build_object('id',item));
 definition:=jsonb_build_object('schema_version','assessment.definition.v1','title','Accommodated reading check','locale','en','duration_seconds',1800,'shuffle_items',false,'shuffle_options',false,'sections',jsonb_build_array(jsonb_build_object('id','77000000-0000-4000-8000-000000000001','title','Timing check','item_version_ids',jsonb_build_array(item),'draw_count',1)));
 assessment:=(assessment_command('${actors.owner}','${tenant}','browser-accommodation-create','assessment.create',jsonb_build_object('definition',definition))->>'id')::uuid;
 published:=(assessment_command('${actors.owner}','${tenant}','browser-accommodation-publish','assessment.publish',jsonb_build_object('id',assessment,'revision',1))->>'id')::uuid;
 w:=(assessment_command('${actors.owner}','${tenant}','browser-accommodation-window','window.create',jsonb_build_object('assessment_version_id',published,'title','Accommodated sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '3 hours'))->>'id')::uuid;
 r:=(assessment_command('${actors.owner}','${tenant}','browser-accommodation-registration','registration.create',jsonb_build_object('window_id',w,'candidate_id','${actors.candidate}'))->>'id')::uuid;
 rw:=(assessment_command('${actors.owner}','${tenant}','browser-accommodation-running-window','window.create',jsonb_build_object('assessment_version_id',published,'title','Running-clock sitting','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '3 hours'))->>'id')::uuid;
 rr:=(assessment_command('${actors.owner}','${tenant}','browser-accommodation-running-registration','registration.create',jsonb_build_object('window_id',rw,'candidate_id','${actors.candidate}'))->>'id')::uuid;
 insert into assessment_accommodation_fixture_ids values(w,r,rw,rr);end;$$;`);
 return JSON.parse(sql(`select jsonb_build_object('window',window_id,'registration',registration_id,'running_registration',running_registration_id,'candidate','${actors.candidate}') from assessment_accommodation_fixture_ids;`));
}
/** Another staff member approves first, so the open browser form holds a stale revision. */
export function bumpAccommodation(sql,actors,tenant,ids){
 return JSON.parse(sql(`select assessment_command('${actors.owner}','${tenant}','browser-accommodation-concurrent','registration.accommodate',jsonb_build_object('registration_id','${ids.registration}','revision',(select accommodation_revision from assessment_registrations where id='${ids.registration}'),'extra_seconds',300,'break_policy','{"schema_version":"assessment.break-policy.v1","clock":"stopped","max_breaks":2,"max_seconds":60,"total_seconds":120}'::jsonb,'reason','Concurrent approval by another staff member'));`));
}
/** Stands in for a proctor/watchdog pause and a human resume: state change only. */
export function setAccommodatedAttemptState(sql,ids,state){
 sql(`update assessment_attempts set state='${state==='paused'?'paused':'active'}' where registration_id='${ids.registration}' and state in('active','paused');`);
}
export function assessmentAccommodationProof(sql,ids){return JSON.parse(sql(`select jsonb_build_object(
 'approval_audits',(select count(*) from assessment_audit_events where action='registration.accommodate' and target_id='${ids.registration}'),
 'registration_revision',(select accommodation_revision from assessment_registrations where id='${ids.registration}'),
 'attempts',(select count(*) from assessment_attempts where registration_id='${ids.registration}'),
 'attempt_state',(select state from assessment_attempts where registration_id='${ids.registration}'),
 'pinned_revision',(select (accommodations->>'revision')::int from assessment_attempts where registration_id='${ids.registration}'),
 'pinned_extra_seconds',(select (accommodations->>'extra_seconds')::int from assessment_attempts where registration_id='${ids.registration}'),
 'breaks',(select count(*) from assessment_breaks b join assessment_attempts a on a.id=b.attempt_id where a.registration_id='${ids.registration}'),
 'break_reasons',(select coalesce(jsonb_agg(b.end_reason order by b.ordinal),'[]') from assessment_breaks b join assessment_attempts a on a.id=b.attempt_id where a.registration_id='${ids.registration}'),
 'break_commands',(select count(*) from assessment_runtime_commands c where c.request->>'action' in('break.begin','break.end') and c.request#>>'{data,attempt_id}'=(select id::text from assessment_attempts where registration_id='${ids.registration}')),
 'responses',(select count(*) from assessment_response_journal j join assessment_attempts a on a.id=j.attempt_id where a.registration_id='${ids.registration}'),
 'running_breaks',(select count(*) from assessment_breaks b join assessment_attempts a on a.id=b.attempt_id where a.registration_id='${ids.running_registration}' and b.clock='running'),
 'running_deadline_unchanged',(select coalesce(bool_and(a.deadline_at=b.deadline_before and b.ends_at<=a.deadline_at),false) from assessment_breaks b join assessment_attempts a on a.id=b.attempt_id where a.registration_id='${ids.running_registration}'),
 'reason_in_candidate_rows',(select count(*) from assessment_registrations where id='${ids.registration}' and to_jsonb(assessment_registrations)::text like '%approval basis%')
 );`));}
