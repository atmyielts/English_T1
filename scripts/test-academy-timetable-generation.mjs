import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {installAcademyBookingFixture} from './lib/academy-booking-fixture.mjs';
import {createNativeSessionDb,bindSql} from './lib/academy-session-test-db.mjs';
const native=process.argv.includes('--native');
const db=native?await createNativeSessionDb():new PGlite({extensions:{btree_gist}});
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const academy=id(1),actor=id(2),branch=id(3),otherBranch=id(4),classroom=id(5),room=id(6),otherRoom=id(7),staff=id(8),term=id(9),series=id(10),schedule=id(11);
let checks=0;
const eq=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
const reject=async(action,pattern)=>{await assert.rejects(action,pattern);checks++;};
const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
const create=async(key,start,end,patch={})=>(await rows('select academy_create_lesson_session($1,$2,$3::jsonb,$4) as data',[academy,actor,JSON.stringify({branch_id:branch,classroom_id:classroom,room_id:room,primary_staff_id:staff,title:'Owned fixture lesson',starts_at:start,ends_at:end,...patch}),key]))[0].data;
const generate=async(key,preview=false,selected=term,branches=null)=>(await rows('select academy_generate_timetable($1,$2,$3,$4,$5,$6::uuid[],null) as data',[academy,selected,actor,preview,key,branches]))[0].data.run;
const counts=async()=>(await rows("select (select count(*)::int from academy_lesson_sessions) as sessions,(select count(*)::int from academy_session_staff_assignments) as assignments,(select count(*)::int from domain_event_outbox) as events,(select count(*)::int from academy_audit_events) as audits"))[0];
const addTerm=async(n,start,end)=>{
  await rows("insert into academy_timetable_terms(id,academy_id,branch_id,name,starts_on,ends_on,status) values($1,$2,$3,'Owned fixture term',$4,$5,'draft')",[id(n),academy,branch,start,end]);
  await rows("insert into academy_timetable_series(id,academy_id,term_id,classroom_id,source_schedule_id,branch_id,room_id,primary_staff_id,title,starts_on,ends_on) values($1,$2,$3,$4,$5,$6,$7,$8,'Owned weekly lesson',$9,$10)",[id(n+1),academy,id(n),classroom,schedule,branch,room,staff,start,end]);
};
try{
  await installAcademyBookingFixture(db);
  await rows('insert into tenants values($1)',[academy]);await rows('insert into users values($1)',[actor]);
  await rows('insert into academy_branches(id,academy_id) values($1,$2),($3,$2)',[branch,academy,otherBranch]);
  await rows('insert into academy_classrooms(id,academy_id,branch_id) values($1,$2,$3)',[classroom,academy,branch]);
  await rows('insert into academy_rooms(id,academy_id,branch_id,capacity) values($1,$2,$3,20),($4,$2,$5,20)',[room,academy,branch,otherRoom,otherBranch]);
  await rows('insert into academy_staff(id,academy_id) values($1,$2)',[staff,academy]);
  await rows("insert into academy_classroom_schedules values($1,$2,$3,1,'14:00','15:00','Asia/Tashkent',true)",[schedule,academy,classroom]);
  await rows("insert into academy_timetable_terms(id,academy_id,branch_id,name,starts_on,ends_on) values($1,$2,$3,'Owned term','2026-10-12','2026-10-26')",[term,academy,branch]);
  await rows("insert into academy_timetable_series(id,academy_id,term_id,classroom_id,source_schedule_id,branch_id,room_id,primary_staff_id,title,starts_on,ends_on) values($1,$2,$3,$4,$5,$6,$7,$8,'Owned weekly lesson','2026-10-12','2026-10-26')",[series,academy,term,classroom,schedule,branch,room,staff]);
  const original=await create(`timetable:${series}:2026-10-12`,'2026-10-12T09:00Z','2026-10-12T10:00Z');
  await rows("update academy_lesson_sessions set timetable_term_id=$1,timetable_series_id=$2,timetable_occurrence_date='2026-10-12' where id=$3",[term,series,original.id]);
  await rows("select academy_transition_lesson_session($1,$2,$3,'cancelled','{\"reason\":\"Owned fixture\"}','old-cancel')",[academy,original.id,actor]);
  // Reproduce the prior active-only occurrence lookup against real constraints.
  // Do not require old Git objects: CI uses a shallow checkout of the repaired head.
  eq((await rows("select id from academy_lesson_sessions where academy_id=$1 and timetable_series_id=$2 and status in('scheduled','confirmed','in_progress')",[academy,series])).length,0);
  await reject(()=>rows("insert into academy_lesson_sessions(id,academy_id,branch_id,classroom_id,room_id,primary_staff_id,title,delivery_mode,starts_at,ends_at,idempotency_key,timetable_term_id,timetable_series_id,timetable_occurrence_date) select gen_random_uuid(),academy_id,branch_id,classroom_id,room_id,primary_staff_id,title,delivery_mode,starts_at,ends_at,'different-key',timetable_term_id,timetable_series_id,timetable_occurrence_date from academy_lesson_sessions where id=$1",[original.id]),/duplicate key/);
  console.log('Reproduced retained cancelled occurrence missing from the old active-only lookup and refusing a duplicate insert.');
  await db.exec(readFileSync(new URL('../supabase/migrations/20261012010000_academy_session_reschedule_integrity.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261012120000_academy_timetable_booking_integrity.sql',import.meta.url),'utf8'));
  const budget=(await rows("select proconfig from pg_proc where proname='academy_generate_timetable'"))[0].proconfig;
  eq(budget.includes('statement_timeout=45s'),true);eq(budget.includes('lock_timeout=5s'),true);
  const preview=await generate('preview',true);eq(preview.status,'preview_ready');eq(preview.skipped_count,1);eq(preview.candidate_count,2);eq(preview.conflict_count,0);eq((await counts()).sessions,1);
  const committed=await generate('commit');eq(committed.status,'completed');eq(committed.generated_count,2);
  eq((await counts()).sessions,3);eq((await counts()).assignments,3);
  eq((await rows("select count(*)::int as n from domain_event_outbox where event_type='session.created'"))[0].n,3);
  eq((await generate('commit')).id,committed.id);
  const again=await generate('again');eq(again.generated_count,0);eq(again.skipped_count,3);
  await reject(()=>generate('commit',true),/another command/);
  await reject(()=>generate('wrong-branch',false,term,[otherBranch]),/Forbidden timetable branch/);
  await addTerm(20,'2026-11-02','2026-11-09');
  await create(`timetable:${id(21)}:2026-11-09`,'2026-11-09T18:00Z','2026-11-09T19:00Z');
  const before=await counts();const failed=await generate('rollback',false,id(20));
  eq(failed.status,'failed');eq(failed.generated_count,0);eq(await counts(),before);
  eq((await rows('select status from academy_timetable_terms where id=$1',[id(20)]))[0].status,'draft');
  eq((await rows('select status from academy_timetable_series where id=$1',[id(21)]))[0].status,'draft');
  // Fail after all lessons, teacher assignments and audits were inserted. A
  // preflight key collision alone cannot prove batch-write rollback.
  await addTerm(70,'2027-02-01','2027-02-08');
  await db.exec(`create function owned_generation_event_failure() returns trigger language plpgsql as $$
    begin
      if new.event_type='session.created' and exists(select 1 from academy_lesson_sessions
        where id=new.aggregate_id and timetable_term_id='${id(70)}' and timetable_occurrence_date='2027-02-08') then
        raise exception 'Owned injected outbox failure';
      end if;return new;
    end;$$;
    create trigger owned_generation_event_failure before insert on domain_event_outbox
      for each row execute function owned_generation_event_failure();`);
  const beforeLateFailure=await counts();const lateFailure=await generate('late-rollback',false,id(70));
  eq(lateFailure.status,'failed');eq(lateFailure.generated_count,0);eq(await counts(),beforeLateFailure);
  eq(lateFailure.error,'Owned injected outbox failure');
  eq((await generate('late-rollback',false,id(70))).id,lateFailure.id);
  eq((await rows('select status from academy_timetable_terms where id=$1',[id(70)]))[0].status,'draft');
  eq((await rows('select status from academy_timetable_series where id=$1',[id(71)]))[0].status,'draft');
  await db.exec('drop trigger owned_generation_event_failure on domain_event_outbox;drop function owned_generation_event_failure();');
  eq((await generate('late-retry',false,id(70))).generated_count,2);
  await reject(()=>create('wrong-room','2026-11-30T09:00Z','2026-11-30T10:00Z',{room_id:otherRoom}),/another branch/);
  await reject(()=>create('bad-status','2026-11-30T09:00Z','2026-11-30T10:00Z',{status:'completed'}),/must be scheduled/);
  await reject(()=>create('bad-timezone','2026-11-30T09:00Z','2026-11-30T10:00Z',{timezone:'Not/A_Timezone'}),/valid lesson timezone/);
  await reject(()=>create(`timetable:${series}:2026-10-12`,'2026-12-01T09:00Z','2026-12-01T10:00Z'),/different inputs/);
  await rows("insert into academy_staff_availability(academy_id,staff_id,day_of_week,starts_at,ends_at,timezone,available,effective_from,effective_to) values($1,$2,1,'00:00','03:00','Asia/Tashkent',true,'2026-11-23','2026-11-23')",[academy,staff]);
  const early=await create('local-date','2026-11-22T21:30Z','2026-11-22T22:00Z');eq(early.status,'scheduled');
  const shifted=(await rows("select academy_transition_lesson_session($1,$2,$3,'rescheduled',$4::jsonb,'early-move') as data",[academy,early.id,actor,JSON.stringify({starts_at:'2026-11-22T21:15Z',ends_at:'2026-11-22T21:45Z'})]))[0].data;
  eq(shifted.session.status,'rescheduled');eq(shifted.replacement.source_session_id,early.id);
  await reject(()=>create('outside-local-hours','2026-11-22T23:00Z','2026-11-22T23:30Z'),/Teacher is unavailable/);
  await rows('delete from academy_staff_availability where academy_id=$1 and staff_id=$2',[academy,staff]);
  await rows("insert into academy_staff_availability(academy_id,staff_id,day_of_week,starts_at,ends_at,timezone,available,effective_from,effective_to) values($1,$2,1,'14:00','15:00','Asia/Tashkent',false,'2026-12-07','2026-12-07')",[academy,staff]);
  eq((await create('outside-block','2026-12-07T11:00Z','2026-12-07T12:00Z')).status,'scheduled');
  await reject(()=>create('inside-block','2026-12-07T09:00Z','2026-12-07T10:00Z'),/Teacher is unavailable/);
  await addTerm(30,'2026-12-07','2026-12-07');
  const blocked=await generate('blocked',true,id(30));eq(blocked.conflict_count,1);eq(blocked.candidate_count,0);
  await rows("insert into academy_staff_availability(academy_id,staff_id,day_of_week,starts_at,ends_at,timezone,available,effective_from,effective_to) values($1,$2,1,'09:00','18:00','Asia/Tashkent',true,'2026-12-07','2026-12-07')",[academy,staff]);
  await reject(()=>create('blocked-overrides-open','2026-12-07T09:00Z','2026-12-07T10:00Z'),/Teacher is unavailable/);
  await rows("insert into academy_classroom_memberships values($1,$2,'student','active'),($1,$2,'student','active')",[academy,classroom]);
  await rows('update academy_rooms set capacity=1 where id=$1',[room]);
  await reject(()=>create('capacity','2027-01-04T09:00Z','2027-01-04T10:00Z'),/capacity/);
  await rows('update academy_rooms set capacity=20 where id=$1',[room]);
  await reject(()=>create('hybrid-no-room','2027-01-04T09:00Z','2027-01-04T10:00Z',{delivery_mode:'hybrid',room_id:null}),/require a room/);
  eq((await create('online','2027-01-04T09:00Z','2027-01-04T10:00Z',{delivery_mode:'online',room_id:null})).room_id,null);
  await reject(()=>rows("insert into academy_lesson_sessions(academy_id,branch_id,classroom_id,room_id,primary_staff_id,title,starts_at,ends_at,idempotency_key) values($1,$2,$3,$4,$5,'Invalid direct fixture','2027-01-05T09:00Z','2027-01-05T10:00Z','wrong-direct-room')",[academy,branch,classroom,otherRoom,staff]),/another branch/);
  await db.exec('set role authenticated');await reject(()=>generate('unauthorized'),/permission denied/);await db.exec('reset role');
  if(native){
    const command=(selected,key)=>bindSql('select academy_generate_timetable($1,$2,$3,false,$4,null,null)',[academy,id(selected),actor,key]);
    await addTerm(40,'2026-12-14','2026-12-14');
    const held=await db.holdTransaction(command(40,'same-term-first'),'generation-first');
    const second=db.independent(command(40,'same-term-second'),'generation-second');second.catch(()=>{});
    try{
      await db.waitForLock('generation-second');checks++;await held.commit();
      const replay=JSON.parse(await second).run;eq(replay.status,'completed');eq(replay.generated_count,0);eq(replay.skipped_count,1);
      eq((await rows('select count(*)::int as n from academy_lesson_sessions where timetable_series_id=$1',[id(41)]))[0].n,1);
    }finally{await held.rollback().catch(()=>{});}
    await addTerm(50,'2026-12-21','2026-12-21');await addTerm(60,'2026-12-21','2026-12-21');
    const competingHeld=await db.holdTransaction(command(50,'competing-first'),'competing-first');
    const competing=db.independent(command(60,'competing-second'),'competing-second');competing.catch(()=>{});
    try{
      await db.waitForLock('competing-second');checks++;await competingHeld.commit();
      const failed=JSON.parse(await competing).run;eq(failed.status,'failed');eq(failed.generated_count,0);
      eq((await rows('select count(*)::int as n from academy_lesson_sessions where timetable_series_id=$1',[id(61)]))[0].n,0);
      eq((await rows('select status from academy_timetable_series where id=$1',[id(61)]))[0].status,'draft');
    }finally{await competingHeld.rollback().catch(()=>{});}
    // A manual booking racing a batch commit still uses the authoritative
    // exclusion constraints; the losing command creates no side effects.
    await addTerm(80,'2027-01-11','2027-01-11');
    const generatedHeld=await db.holdTransaction(command(80,'manual-race-generator'),'manual-race-generator');
    const manualSql=bindSql('select academy_create_lesson_session($1,$2,$3::jsonb,$4)',[academy,actor,JSON.stringify({branch_id:branch,classroom_id:classroom,room_id:room,primary_staff_id:staff,title:'Owned concurrent manual lesson',starts_at:'2027-01-11T09:00Z',ends_at:'2027-01-11T10:00Z'}),'manual-race']);
    const manual=db.independent(manualSql,'manual-race-booking');manual.catch(()=>{});
    try{
      await db.waitForLock('manual-race-booking');checks++;await generatedHeld.commit();
      const afterGenerator=await counts();await reject(()=>manual,/exclusion constraint/);
      eq(await counts(),afterGenerator);
      eq((await rows('select count(*)::int as n from academy_lesson_sessions where idempotency_key=$1',['manual-race']))[0].n,0);
    }finally{await generatedHeld.rollback().catch(()=>{});}
  }
  if(process.argv.includes('--benchmark')){
    const selected=id(100);
    await rows("insert into academy_timetable_terms(id,academy_id,branch_id,name,starts_on,ends_on) values($1,$2,$3,'Owned year benchmark','2027-01-01','2027-12-31')",[selected,academy,branch]);
    for(let i=0;i<40;i++){
      const group=id(1000+i),space=id(2000+i),teacher=id(3000+i);
      await rows('insert into academy_classrooms(id,academy_id,branch_id) values($1,$2,$3)',[group,academy,branch]);
      await rows('insert into academy_rooms(id,academy_id,branch_id,capacity) values($1,$2,$3,20)',[space,academy,branch]);
      await rows('insert into academy_staff(id,academy_id) values($1,$2)',[teacher,academy]);
      for(let j=0;j<3;j++){
        const weekly=id(4000+i*3+j),recurrence=id(5000+i*3+j);
        await rows("insert into academy_classroom_schedules values($1,$2,$3,$4,'14:00','15:00','Asia/Tashkent',true)",[weekly,academy,group,[1,3,5][j]]);
        await rows("insert into academy_timetable_series(id,academy_id,term_id,classroom_id,source_schedule_id,branch_id,room_id,primary_staff_id,title,starts_on,ends_on) values($1,$2,$3,$4,$5,$6,$7,$8,'Owned year benchmark','2027-01-01','2027-12-31')",[recurrence,academy,selected,group,weekly,branch,space,teacher]);
      }
    }
    const start=performance.now();const outcome=await generate('owned-year-benchmark',false,selected);const elapsed=Math.round(performance.now()-start);
    eq(outcome.status,'completed');assert(outcome.generated_count>=6000);checks++;
    console.log(JSON.stringify({benchmark:'40 groups, three weekly classes, one year',sessions:outcome.generated_count,elapsedMs:elapsed,scope:'Owned local database only; not hosted latency or production throughput proof.'}));
  }
  if(process.argv.includes('--rest')){
    if(!native)throw Error('REST qualification requires the owned native database');
    await addTerm(90,'2027-04-05','2027-04-05');
    await db.exec(`grant usage on schema public to service_role;
      alter role postgres set statement_timeout='8s';
      create function owned_generation_slow_insert() returns trigger language plpgsql as $$
      begin if new.timetable_term_id='${id(90)}' then perform pg_sleep(10);end if;return new;end;$$;
      create trigger owned_generation_slow_insert before insert on academy_lesson_sessions
        for each row execute function owned_generation_slow_insert();`);
    const rpc=await db.startRestGateway();const start=performance.now();
    const result=await rpc('academy_generate_timetable',{p_academy_id:academy,p_term_id:id(90),p_actor_id:actor,p_dry_run:false,p_key:'rest-budget-proof'});
    eq(result.run.status,'completed');eq(result.run.generated_count,1);
    const elapsed=Math.round(performance.now()-start);assert(elapsed>=10000&&elapsed<45000);checks++;
    eq((await rpc('academy_generate_timetable',{p_academy_id:academy,p_term_id:id(90),p_actor_id:actor,p_dry_run:false,p_key:'rest-budget-proof'})).run.id,result.run.id);
    console.log(JSON.stringify({rest:'PostgREST 12.2.12 in owned isolated network',inheritedStatementTimeout:'8s',generationFunctionBudget:'45s',elapsedMs:elapsed,scope:'Synthetic local REST proof only; not installed hosted runtime qualification.'}));
  }
  console.log(`Academy timetable generation: ${checks} ${native?'native':'isolated'} PostgreSQL checks passed; no hosted mutations.`);
}finally{await db.close();}
