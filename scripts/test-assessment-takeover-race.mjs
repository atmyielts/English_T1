/** Device takeover races. Three devices confirm a takeover at the same moment
 * while the original device saves an answer: the epochs form one unbroken chain,
 * exactly one device ends up holding the attempt, and the racing answer is either
 * saved before a takeover (and counted in it) or refused as superseded — never
 * accepted afterwards. Disposable local test container only. */
export async function takeoverRace(query,parallel){
 const tenant='10000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000001',candidate='00000000-0000-4000-8000-000000000003';
 const devices=[1,2,3,4].map(n=>`61000000-0000-4000-8000-00000000000${n}`);
 const attempt=query(`do $$declare v uuid;f jsonb;w uuid;r uuid;a uuid;begin
  select assessment_version_id,manifest into v,f from assessment_forms limit 1;
  w:=(assessment_command('${owner}','${tenant}','takeover-race-window','window.create',jsonb_build_object('assessment_version_id',v,'title','Takeover race','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '1 hour'))->>'id')::uuid;
  r:=(assessment_command('${owner}','${tenant}','takeover-race-reg','registration.create',jsonb_build_object('window_id',w,'candidate_id','${candidate}'))->>'id')::uuid;
  a:=(assessment_command('${candidate}','${tenant}','takeover-race-start','attempt.start',jsonb_build_object('registration_id',r,'manifest',f,'manifest_hash',repeat('a',64)))->>'id')::uuid;
  perform assessment_runtime_command('${candidate}','${tenant}','takeover-race-acquire','lease.acquire',jsonb_build_object('attempt_id',a,'device_id','${devices[0]}','token_hash',repeat('1',64)));
  perform assessment_runtime_command('${candidate}','${tenant}','takeover-race-answer-1','response.append',jsonb_build_object('attempt_id',a,'sequence',1,'item_version_id',(f#>>'{sections,0,items,0,item_version_id}')::uuid,'response','a','payload_hash','race-1','lease',jsonb_build_object('device_id','${devices[0]}','token_hash',repeat('1',64),'epoch',1)));
  create temporary table if not exists fixture_takeover_race(id uuid);insert into fixture_takeover_race values(a);
 end;$$;
 create function fixture_takeover_try(p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql as $$begin
  return jsonb_build_object('ok',true,'result',assessment_runtime_command('${candidate}','${tenant}',p_key,p_action,p_data)->'result');
 exception when others then return jsonb_build_object('ok',false,'error',sqlerrm);end;$$;
 select id from fixture_takeover_race;`).trim().split('\n').at(-1);
 const item=query(`select (manifest#>>'{sections,0,items,0,item_version_id}') from assessment_forms limit 1;`).trim();
 const statements=[
  `select fixture_takeover_try('takeover-race-answer-2','response.append',jsonb_build_object('attempt_id','${attempt}','sequence',2,'item_version_id','${item}','response','b','payload_hash','race-2','lease',jsonb_build_object('device_id','${devices[0]}','token_hash',repeat('1',64),'epoch',1)));`,
  ...[1,2,3].map(n=>`select fixture_takeover_try('takeover-race-take-${n}','lease.acquire',jsonb_build_object('attempt_id','${attempt}','device_id','${devices[n]}','token_hash',repeat('${n+1}',64),'takeover',true));`),
 ];
 const [answer,...takeovers]=(await parallel(statements)).map(text=>JSON.parse(text));
 if(takeovers.some(row=>!row.ok))throw Error('A confirmed takeover was refused: '+JSON.stringify(takeovers));
 const chain=query(`select string_agg(from_epoch||'>'||to_epoch,',' order by to_epoch) from assessment_attempt_takeovers where attempt_id='${attempt}';`).trim();
 if(chain!=='1>2,2>3,3>4')throw Error('Takeover epochs are not one unbroken chain: '+chain);
 const holder=query(`select device_id||':'||epoch from assessment_attempt_leases where attempt_id='${attempt}';`).trim();
 const last=takeovers.find(row=>row.result.epoch===4);
 if(!last||holder!==`${last.result.device_id}:4`)throw Error('The final holder is not the last takeover: '+holder);
 const first=query(`select acknowledged_sequence from assessment_attempt_takeovers where attempt_id='${attempt}' and from_epoch=1;`).trim();
 const saved=query(`select count(*) from assessment_response_journal where attempt_id='${attempt}';`).trim();
 if(answer.ok?(first!=='2'||saved!=='2'):(answer.error!=='device_lease_superseded'||first!=='1'||saved!=='1'))throw Error(`Racing answer ${JSON.stringify(answer)} disagrees with takeover acknowledged_sequence ${first} and ${saved} saved answers`);
}
