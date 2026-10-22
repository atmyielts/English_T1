import {readFileSync} from 'node:fs';
/** Four-process accommodation approval/start and break begin/end/pause/expiry
 * races. Every port is the caller's disposable local test container; failed
 * commands come back as data from fixture_accommodation_try. */
export async function accommodationsRace(query,parallel){
 const tenant='10000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000001',candidate='00000000-0000-4000-8000-000000000003';
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
 const json=text=>JSON.parse(text);
 const attempt=(actor,key,action,data,runtime=false)=>`select fixture_accommodation_try('${actor}','${key}','${action}',${literal(data)},${runtime});`;
 const scalar=sql=>json(query(`select to_jsonb(x) from (${sql}) x;`));
 query(readFileSync('supabase/tests/assessment-accommodations-race.fixture.sql','utf8'));
 const scoresBefore=query('select count(*) from assessment_score_revisions;').trim();
 const form=json(query("select jsonb_build_object('version',assessment_version_id,'manifest',manifest) from assessment_forms limit 1;"));
 const command=(key,action,data)=>{const outcome=json(query(attempt(owner,key,action,data)));if(!outcome.ok)throw Error(`${action} failed: ${outcome.error}`);return outcome.result;};
 const window=command('acc-race-window','window.create',{assessment_version_id:form.version,title:'Accommodation concurrency',opens_at:new Date(Date.now()-3600000).toISOString(),closes_at:new Date(Date.now()+4*3600000).toISOString()}).id;
 const registration=command('acc-race-registration','registration.create',{window_id:window,candidate_id:candidate}).id;
 const policy={schema_version:'assessment.break-policy.v1',clock:'stopped',max_breaks:3,max_seconds:120,total_seconds:240};
 const approval=(revision,extra)=>({registration_id:registration,revision,extra_seconds:extra,break_policy:policy,reason:'Approved timed support; no diagnosis stored'});

 // Same key: one receipt, one revision, one audit.
 const replay=(await parallel(Array(4).fill(attempt(owner,'acc-race-approve','registration.accommodate',approval(0,300))))).map(json);
 if(replay.some(row=>!row.ok)||new Set(replay.map(row=>JSON.stringify(row.result))).size!==1)throw Error('Accommodation replay changed its receipt: '+JSON.stringify(replay));
 // Different keys against the same expected revision: exactly one approval wins.
 const competing=(await parallel(Array.from({length:4},(_,i)=>attempt(owner,`acc-race-compete-${i}`,'registration.accommodate',approval(1,310+i))))).map(json);
 if(competing.filter(row=>row.ok).length!==1||competing.some(row=>!row.ok&&row.error!=='revision_conflict'))throw Error('Competing approvals bypassed the revision fence: '+JSON.stringify(competing));
 const approvals=scalar(`select accommodation_revision revision,(select count(*) from assessment_audit_events where action='registration.accommodate' and target_id='${registration}') audits from assessment_registrations where id='${registration}'`);
 if(approvals.revision!==2||approvals.audits!==2)throw Error('Approval races left wrong revision/audits: '+JSON.stringify(approvals));

 // A late approval racing the start either lands before the pinned snapshot or is refused after it.
 const start={registration_id:registration,manifest:form.manifest,manifest_hash:'a'.repeat(64)};
 const startRace=(await parallel([attempt(owner,'acc-race-late','registration.accommodate',approval(2,600)),...Array(3).fill(attempt(candidate,'acc-race-start','attempt.start',start))])).map(json);
 const [late,...starts]=startRace;
 if(starts.some(row=>!row.ok)||new Set(starts.map(row=>JSON.stringify(row.result))).size!==1)throw Error('Concurrent start replay changed its attempt: '+JSON.stringify(starts));
 if(!late.ok&&late.error!=='accommodations_locked_after_start')throw Error('Late approval failed for the wrong reason: '+late.error);
 const attemptId=starts[0].result.id;
 const pinned=scalar(`select a.accommodations,r.extra_seconds,r.accommodation_revision,(select count(*) from assessment_attempts where registration_id='${registration}') attempts from assessment_attempts a join assessment_registrations r on r.id=a.registration_id where a.id='${attemptId}'`);
 if(pinned.attempts!==1||pinned.accommodations.revision!==(late.ok?3:2)||pinned.accommodations.revision!==pinned.accommodation_revision||pinned.accommodations.extra_seconds!==pinned.extra_seconds)throw Error('Start pinned a different accommodation than the registration holds: '+JSON.stringify(pinned));

 const leased=json(query(attempt(candidate,'acc-race-lease','lease.acquire',{attempt_id:attemptId,device_id:candidate,token_hash:'f'.repeat(64)},true)));
 if(!leased.ok)throw Error('Lease acquisition failed: '+leased.error);
 const input={attempt_id:attemptId,lease:{device_id:candidate,token_hash:'f'.repeat(64),epoch:leased.result.epoch}};

 // Same-key begin: one break. Different-key begins during it: all refused, still one break.
 const begins=(await parallel(Array(4).fill(attempt(candidate,'acc-race-begin','break.begin',input,true)))).map(json);
 if(begins.some(row=>!row.ok)||new Set(begins.map(row=>JSON.stringify(row.result))).size!==1)throw Error('Break begin replay changed its receipt: '+JSON.stringify(begins));
 const breakId=begins[0].result.id;
 const extra=(await parallel(Array.from({length:4},(_,i)=>attempt(candidate,`acc-race-extra-${i}`,'break.begin',input,true)))).map(json);
 if(extra.some(row=>row.ok||row.error!=='assessment_break_active'))throw Error('Concurrent break begins opened a second break: '+JSON.stringify(extra));
 const before=scalar(`select deadline_before,(select count(*) from assessment_breaks where attempt_id='${attemptId}') breaks from assessment_breaks where id='${breakId}'`);
 if(before.breaks!==1)throw Error('Break races duplicated breaks');

 // Candidate ends racing a pause: the break ends exactly once and time is never credited twice.
 const endRace=(await parallel([...Array.from({length:2},(_,i)=>attempt(candidate,`acc-race-end-${i}`,'break.end',{...input,break_id:breakId},true)),`select fixture_accommodation_pause('${attemptId}');`,attempt(candidate,'acc-race-end-0','break.end',{...input,break_id:breakId},true)])).map(json);
 const ended=scalar(`select b.ended_at,b.end_reason,b.started_at,a.deadline_at,a.state,(select count(*) from assessment_audit_events where action='assessment.break.ended' and details->>'break_id'='${breakId}') audits from assessment_breaks b join assessment_attempts a on a.id=b.attempt_id where b.id='${breakId}'`);
 if(!ended.ended_at||!['candidate','proctor_pause'].includes(ended.end_reason)||ended.audits!==1)throw Error('Break end/pause race lost its single outcome: '+JSON.stringify({ended,endRace}));
 const credited=Date.parse(ended.deadline_at)-Date.parse(before.deadline_before),used=Date.parse(ended.ended_at)-Date.parse(ended.started_at);
 if(Math.abs(credited-used)>2)throw Error(`Break/pause overlap credited ${credited}ms for ${used}ms of break`);
 if(endRace.filter(row=>row.ok&&row.result?.ended).length>2)throw Error('More than one distinct break end acknowledged');

 // Late alarm: expiry passes racing a candidate end all close the break at its scheduled end.
 query(`update assessment_attempts set state='active' where id='${attemptId}';`);
 const second=json(query(attempt(candidate,'acc-race-begin-2','break.begin',input,true)));
 if(!second.ok)throw Error('Second break failed: '+second.error);
 query(`update assessment_breaks set started_at=clock_timestamp()-interval '120 seconds',ends_at=clock_timestamp()-interval '5 seconds' where id='${second.result.id}';`);
 await parallel([...Array(3).fill(`select fixture_accommodation_expire('${attemptId}');`),attempt(candidate,'acc-race-end-late','break.end',{...input,break_id:second.result.id},true)]);
 const elapsed=scalar(`select ended_at=ends_at exact,end_reason,(select count(*) from assessment_audit_events where action='assessment.break.ended' and details->>'break_id'='${second.result.id}') audits from assessment_breaks where id='${second.result.id}'`);
 if(!elapsed.exact||elapsed.end_reason!=='elapsed'||elapsed.audits!==1)throw Error('Late expiry race did not end the break exactly once at its scheduled time: '+JSON.stringify(elapsed));

 if(query('select count(*) from assessment_score_revisions;').trim()!==scoresBefore)throw Error('Accommodation races changed academic scores');
}
