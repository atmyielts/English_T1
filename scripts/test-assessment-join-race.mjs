/** Join link races. Four tabs of the same person join at once, and four people
 * race for the last two places: each person ends with exactly one registration
 * and the link never admits more people than its limit. Disposable local test
 * container only. */
export async function joinRace(query,parallel){
 const tenant='10000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000001';
 const people=[1,2,3,4].map(n=>`62000000-0000-4000-8000-00000000000${n}`);
 const link=JSON.parse(query(`insert into users(id) values ${people.map(id=>`('${id}')`).join(',')};
 do $$declare v uuid;w uuid;begin
  select assessment_version_id into v from assessment_forms limit 1;
  w:=(assessment_command('${owner}','${tenant}','join-race-window','window.create',jsonb_build_object('assessment_version_id',v,'title','Join race','opens_at',clock_timestamp()-interval '1 hour','closes_at',clock_timestamp()+interval '1 hour'))->>'id')::uuid;
  create temporary table if not exists fixture_join_race(link jsonb);
  insert into fixture_join_race select assessment_command('${owner}','${tenant}','join-race-link','join_link.create',jsonb_build_object('window_id',w,'max_joins',3));
 end;$$;
 create function fixture_join_try(p_actor uuid,p_link uuid,p_code text) returns jsonb language plpgsql as $$begin
  return jsonb_build_object('ok',true,'result',assessment_join_accept(p_actor,p_link,p_code));
 exception when others then return jsonb_build_object('ok',false,'error',sqlerrm);end;$$;
 select link from fixture_join_race;`).trim().split('\n').at(-1));
 const join=person=>`select fixture_join_try('${person}','${link.id}','${link.code}');`;
 const same=(await parallel(Array(4).fill(join(people[0])))).map(text=>JSON.parse(text));
 if(same.some(row=>!row.ok)||new Set(same.map(row=>row.result.registration_id)).size!==1)throw Error('One person joining from four tabs did not converge: '+JSON.stringify(same));
 const racers=[people[1],people[2],people[3],people[1]];
 const others=(await parallel(racers.map(join))).map((text,index)=>({...JSON.parse(text),person:racers[index]}));
 const count=query(`select count(*)||':'||(select joined from assessment_join_links where id='${link.id}') from assessment_registrations where window_id='${link.window_id}';`).trim();
 if(count!=='3:3')throw Error('Join limit not held under concurrency: '+count);
 const refused=new Set(others.filter(row=>!row.ok).map(row=>row.person));
 if(refused.size!==1||others.some(row=>!row.ok&&row.error!=='join_link_full'))throw Error('Expected exactly one person refused as full: '+JSON.stringify(others));
 // The same person racing themself gets one registration either way.
 const repeated=others.filter(row=>row.person===people[1]);
 if(repeated[0].ok!==repeated[1].ok||(repeated[0].ok&&repeated[0].result.registration_id!==repeated[1].result.registration_id))throw Error('A person racing themself got different outcomes: '+JSON.stringify(repeated));
}
