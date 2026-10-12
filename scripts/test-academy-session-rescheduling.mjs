import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createNativeSessionDb,bindSql} from './lib/academy-session-test-db.mjs';

// Executes the previous migration SQL and actual GiST constraints in isolated PostgreSQL.
// --native repeats the behavior tests in network-isolated PostgreSQL 17 and
// proves lock/exclusion behavior across independent local connections.
const native=process.argv.includes('--native');
const db = native ? await createNativeSessionDb() : new PGlite({extensions: {btree_gist}});
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const academy=id(1), other=id(2), actor=id(3), branch=id(4), otherBranch=id(5),
  classroom=id(6), otherClass=id(7), room=id(8), otherRoom=id(9), staff=id(10), otherStaff=id(11);
let checks=0;
const eq=(actual, expected)=>{assert.deepEqual(actual,expected);checks++;};
const rejected=async(task,pattern)=>{await assert.rejects(task,pattern);checks++;};
const query=async(sql,params=[]) => (await db.query(sql,params)).rows;
const original=readFileSync(new URL('../supabase/migrations/20260810160000_academy_business_os_phase_d.sql',import.meta.url),'utf8');
const repair=readFileSync(new URL('../supabase/migrations/20261012010000_academy_session_reschedule_integrity.sql',import.meta.url),'utf8');
const create=async(key,start,end,overrides={}) => {
  const payload={branch_id:branch,classroom_id:classroom,room_id:room,primary_staff_id:staff,title:'Owned fixture lesson',starts_at:start,ends_at:end,...overrides};
  return (await query('select academy_create_lesson_session($1,$2,$3::jsonb,$4) as result',[overrides.academy_id??academy,actor,JSON.stringify(payload),key]))[0].result;
};
const transition=async(session,status,payload,key,tenant=academy) =>
  (await query('select academy_transition_lesson_session($1,$2,$3,$4,$5::jsonb,$6) as result',[tenant,session,actor,status,JSON.stringify(payload),key]))[0].result;
const status=async(session)=>(await query('select status from academy_lesson_sessions where id=$1',[session]))[0].status;
try {
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create table tenants(id uuid primary key);
    create table users(id uuid primary key);
    create table academy_branches(id uuid primary key,academy_id uuid,unique(academy_id,id));
    create table academy_classrooms(id uuid primary key,academy_id uuid,branch_id uuid,unique(academy_id,id));
    create table academy_rooms(id uuid primary key,academy_id uuid,branch_id uuid,capacity integer,unique(academy_id,id));
    create table academy_staff(id uuid primary key,academy_id uuid,unique(academy_id,id));
    create table academy_classroom_schedules(id uuid primary key,academy_id uuid,unique(academy_id,id));
    create table academy_attendance(id uuid primary key,academy_id uuid,session_id uuid,status text,unique(academy_id,id));
    create table academy_classroom_memberships(academy_id uuid,classroom_id uuid,role text,status text);
    create table academy_audit_events(id uuid primary key default gen_random_uuid(),academy_id uuid,actor_user_id uuid,action text,target_type text,target_id text,classroom_id uuid,metadata jsonb);
    create table domain_event_outbox(id uuid primary key default gen_random_uuid(),event_type text,event_version text,aggregate_type text,aggregate_id uuid,user_id uuid,payload jsonb,idempotency_key text unique);
    create table academy_lesson_deliveries(academy_id uuid,branch_id uuid,classroom_id uuid,staff_id uuid,delivered_on date,started_at timestamptz,ended_at timestamptz,duration_minutes integer,delivery_status text,student_count integer,verified_by uuid,idempotency_key text,metadata jsonb,unique(academy_id,idempotency_key));
  `);
  await db.exec(original.slice(0,original.indexOf('alter table public.academy_attendance drop constraint')));
  await db.exec(original.slice(original.indexOf('create or replace function public.academy_create_lesson_session'),original.indexOf('create or replace function public.academy_assign_session_substitute')));
  await query('insert into tenants values ($1),($2)',[academy,other]);
  await query('insert into users values ($1)',[actor]);
  await query('insert into academy_branches values ($1,$2),($3,$4)',[branch,academy,otherBranch,other]);
  await query('insert into academy_classrooms values ($1,$2,$3),($4,$5,$6)',[classroom,academy,branch,otherClass,other,otherBranch]);
  await query('insert into academy_rooms values ($1,$2,$3,20),($4,$5,$6,20)',[room,academy,branch,otherRoom,other,otherBranch]);
  await query('insert into academy_staff values ($1,$2),($3,$4)',[staff,academy,otherStaff,other]);
  const lesson=await create('original','2026-10-12T10:00:00Z','2026-10-12T11:30:00Z');
  const move={starts_at:'2026-10-12T10:30:00Z',ends_at:'2026-10-12T12:00:00Z'};
  await rejected(()=>transition(lesson.id,'rescheduled',move,'move'),/exclusion constraint/);
  eq(await status(lesson.id),'scheduled');
  const second=await create('second','2026-10-13T10:00:00Z','2026-10-13T11:00:00Z');
  const foreign=await create('foreign','2026-10-13T10:00:00Z','2026-10-13T11:00:00Z',{academy_id:other,branch_id:otherBranch,classroom_id:otherClass,room_id:otherRoom,primary_staff_id:otherStaff});
  await transition(second.id,'cancelled',{reason:'Owned fixture'},'same-key');
  eq((await transition(foreign.id,'cancelled',{reason:'Owned fixture'},'same-key',other)).session.status,'scheduled');
  console.log('Reproduced self-overlap rejection and cross-academy retry-key suppression in the previous SQL.');
  await db.exec(repair);
  const moved=await transition(lesson.id,'rescheduled',move,'move');
  eq(moved.session.status,'rescheduled');eq(new Date(moved.replacement.starts_at).toISOString(),'2026-10-12T10:30:00.000Z');
  eq(moved.replacement.source_session_id,lesson.id);
  eq(await status(moved.replacement.id),'scheduled');
  const replay=await transition(lesson.id,'rescheduled',move,'move');eq(replay.replacement.id,moved.replacement.id);
  eq((await transition(lesson.id,'rescheduled',{starts_at:'2026-10-12T15:30:00+05:00',ends_at:'2026-10-12T17:00:00+05:00'},' move ')).replacement.id,moved.replacement.id);
  await rejected(()=>transition(lesson.id,'rescheduled',{...move,ends_at:'2026-10-12T12:01:00Z'},'move'),/different inputs/);
  await rejected(()=>query('select academy_transition_lesson_session($1,$2,$3,$4,$5::jsonb,$6)',[academy,lesson.id,id(99),'rescheduled',JSON.stringify(move),'move']),/different inputs/);
  if(native){
    const sql=bindSql('select academy_transition_lesson_session($1,$2,$3,$4,$5::jsonb,$6)',[academy,lesson.id,actor,'rescheduled',JSON.stringify(move),'move']);
    eq(JSON.parse(await db.independent("set timezone='Asia/Tashkent';"+sql,'timezone-retry')).replacement.id,moved.replacement.id);
  }else{
    await db.exec("set timezone='Asia/Tashkent';");
    eq((await transition(lesson.id,'rescheduled',move,'move')).replacement.id,moved.replacement.id);
    await db.exec("set timezone='UTC';");
  }
  await rejected(()=>transition(lesson.id,null,move,'move'),/Invalid session transition/);
  eq((await query("select count(*)::integer as n from domain_event_outbox where event_type='session.rescheduled'"))[0].n,1);
  eq((await transition(foreign.id,'cancelled',{reason:'Owned fixture'},'same-key',other)).session.status,'cancelled');
  eq((await transition(second.id,'cancelled',{reason:'Owned fixture'},'same-key')).session.status,'cancelled');
  const another=await create('another','2026-10-15T10:00:00Z','2026-10-15T11:00:00Z');
  const anotherMove=await transition(another.id,'rescheduled',{starts_at:'2026-10-15T10:30:00Z',ends_at:'2026-10-15T11:30:00Z'},'move');
  assert.notEqual(anotherMove.replacement.id,moved.replacement.id);checks++;
  eq(anotherMove.replacement.source_session_id,another.id);
  const cancel=await create('new-cancel','2026-10-16T10:00:00Z','2026-10-16T11:00:00Z');
  await transition(cancel.id,'cancelled',{reason:'Holiday'},'cancel-new');
  await rejected(()=>transition(cancel.id,'cancelled',{reason:'Different reason'},'cancel-new'),/different inputs/);
  const collision=await create('collision-original','2026-10-17T10:00:00Z','2026-10-17T11:00:00Z');
  await create(`session.transition:${academy}:${collision.id}:collision:replacement`,'2026-10-18T10:00:00Z','2026-10-18T11:00:00Z');
  await rejected(()=>transition(collision.id,'rescheduled',{starts_at:'2026-10-17T10:30:00Z',ends_at:'2026-10-17T11:30:00Z'},'collision'),/Replacement session key already used/);
  eq(await status(collision.id),'scheduled');
  await rejected(()=>transition(lesson.id,'cancelled',{reason:'Different command'},'move'),/different action/);
  await rejected(()=>transition(moved.replacement.id,'confirmed',{},' '),/transition key is required/);
  const blocking=await create('blocking','2026-10-12T12:00:00Z','2026-10-12T13:00:00Z');
  const before=await query('select count(*)::integer as n from academy_lesson_sessions');
  await rejected(()=>transition(moved.replacement.id,'rescheduled',{starts_at:'2026-10-12T11:30:00Z',ends_at:'2026-10-12T12:30:00Z'},'conflicting-move'),/exclusion constraint/);
  eq(await status(moved.replacement.id),'scheduled');eq(await query('select count(*)::integer as n from academy_lesson_sessions'),before);
  eq((await query("select count(*)::integer as n from domain_event_outbox where idempotency_key like '%conflicting-move%'"))[0].n,0);
  await rejected(()=>transition(blocking.id,'cancelled',{},'missing-reason'),/reason is required/);
  eq(await status(blocking.id),'scheduled');
  const released=await create('released','2026-10-12T10:00:00Z','2026-10-12T10:30:00Z');eq(released.status,'scheduled');
  await transition(blocking.id,'in_progress',{},'start');
  await transition(blocking.id,'completed',{},'finish');
  await transition(blocking.id,'completed',{},'finish');
  eq((await query('select count(*)::integer as n from academy_lesson_deliveries'))[0].n,1);
  await db.exec('set role anon');
  await rejected(()=>transition(lesson.id,'confirmed',{},'unauthorized'),/permission denied for function/);
  await db.exec('reset role');
  await db.exec('set role authenticated');
  await rejected(()=>transition(lesson.id,'confirmed',{},'unauthorized-authenticated'),/permission denied for function/);
  await db.exec('reset role');
  if(native){
    await query('insert into academy_classrooms values ($1,$2,$3),($4,$2,$3)',[id(30),academy,branch,id(31)]);
    await query('insert into academy_rooms values ($1,$2,$3,20),($4,$2,$3,20)',[id(32),academy,branch,id(33)]);
    await query('insert into academy_staff values ($1,$2),($3,$2)',[id(34),academy,id(35)]);
    const createSql=(key,day,overrides={})=>bindSql('select academy_create_lesson_session($1,$2,$3::jsonb,$4)',[academy,actor,JSON.stringify({branch_id:branch,classroom_id:id(30),room_id:id(32),primary_staff_id:id(34),title:'Local concurrent fixture',starts_at:day+'T10:00:00Z',ends_at:day+'T11:00:00Z',...overrides}),key]);
    for(const [kind,overrides,day] of [
      ['room',{classroom_id:id(31),primary_staff_id:id(35)},'2026-11-01'],
      ['teacher',{classroom_id:id(31),room_id:id(33)},'2026-11-02'],
      ['classroom',{room_id:id(33),primary_staff_id:id(35)},'2026-11-03'],
    ]){
      const held=await db.holdTransaction(createSql('first-'+kind,day),'first-'+kind);
      const competing=db.independent(createSql('second-'+kind,day,overrides),'second-'+kind);
      competing.catch(()=>{});
      try{await db.waitForLock('second-'+kind);checks++;await held.commit();await rejected(()=>competing,new RegExp('academy_sessions_'+kind+'_no_overlap'));}
      finally{await held.rollback().catch(()=>{});}
      eq((await query('select count(*)::int as n from academy_lesson_sessions where academy_id=$1 and starts_at=$2::timestamptz',[academy,day+'T10:00:00Z']))[0].n,1);
    }
    const concurrent=await create('retry-original','2026-11-05T10:00:00Z','2026-11-05T11:00:00Z');
    const concurrentPayload={starts_at:'2026-11-05T10:30:00Z',ends_at:'2026-11-05T11:30:00Z'};
    const command=bindSql('select academy_transition_lesson_session($1,$2,$3,$4,$5::jsonb,$6)',[academy,concurrent.id,actor,'rescheduled',JSON.stringify(concurrentPayload),'concurrent-retry']);
    const held=await db.holdTransaction(command,'retry-first');
    const retry=db.independent(command,'retry-second');retry.catch(()=>{});
    try{
      await db.waitForLock('retry-second');checks++;await held.commit();
      const result=JSON.parse(await retry);eq(result.session.status,'rescheduled');
      eq(result.replacement.source_session_id,concurrent.id);
      eq((await query('select count(*)::int as n from academy_lesson_sessions where source_session_id=$1',[concurrent.id]))[0].n,1);
      eq((await query("select count(*)::int as n from domain_event_outbox where aggregate_id=$1 and event_type='session.rescheduled'",[concurrent.id]))[0].n,1);
    }finally{await held.rollback().catch(()=>{});}
    const originalA=await create('concurrent-move-a','2026-11-07T10:00:00Z','2026-11-07T11:00:00Z',{classroom_id:id(30),room_id:id(32),primary_staff_id:id(34)});
    const originalB=await create('concurrent-move-b','2026-11-07T10:00:00Z','2026-11-07T11:00:00Z',{classroom_id:id(31),room_id:id(33),primary_staff_id:id(35)});
    const destination={starts_at:'2026-11-08T10:00:00Z',ends_at:'2026-11-08T11:00:00Z',room_id:id(32)};
    const moveSql=(session,key)=>bindSql('select academy_transition_lesson_session($1,$2,$3,$4,$5::jsonb,$6)',[academy,session,actor,'rescheduled',JSON.stringify(destination),key]);
    const moveHeld=await db.holdTransaction(moveSql(originalA.id,'move-race-a'),'move-race-first');
    const moveRace=db.independent(moveSql(originalB.id,'move-race-b'),'move-race-second');moveRace.catch(()=>{});
    try{
      await db.waitForLock('move-race-second');checks++;await moveHeld.commit();
      await rejected(()=>moveRace,/academy_sessions_room_no_overlap/);
      eq(await status(originalB.id),'scheduled');
      eq((await query('select count(*)::int as n from academy_lesson_sessions where source_session_id=$1',[originalB.id]))[0].n,0);
      eq((await query("select count(*)::int as n from domain_event_outbox where aggregate_id=$1 and event_type='session.rescheduled'",[originalB.id]))[0].n,0);
    }finally{await moveHeld.rollback().catch(()=>{});}
  }
  console.log(`Academy session rescheduling: ${checks} PostgreSQL checks passed; ${native?'independent local connection conflicts and retries verified':'single-connection isolated execution'}; no hosted mutations.`);
} finally {await db.close();}
