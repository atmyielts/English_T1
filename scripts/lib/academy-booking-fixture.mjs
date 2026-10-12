import {readFileSync} from 'node:fs';
export async function installAcademyBookingFixture(db){
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create table tenants(id uuid primary key);create table users(id uuid primary key,is_active boolean default true);
    create table academy_branches(id uuid primary key,academy_id uuid,is_active boolean default true,unique(academy_id,id));
    create table academy_classrooms(id uuid primary key,academy_id uuid,branch_id uuid,is_active boolean default true,unique(academy_id,id));
    create table academy_rooms(id uuid primary key,academy_id uuid,branch_id uuid,capacity integer,is_active boolean default true,unique(academy_id,id));
    create table academy_staff(id uuid primary key,academy_id uuid,is_active boolean default true,unique(academy_id,id));
    create table academy_classroom_schedules(id uuid primary key,academy_id uuid,classroom_id uuid,day_of_week int,start_time time,end_time time,timezone text,is_active boolean default true,unique(academy_id,id));
    create table academy_attendance(id uuid primary key,academy_id uuid,session_id uuid,status text,unique(academy_id,id));
    create table academy_classroom_memberships(academy_id uuid,classroom_id uuid,role text,status text);
    create table academy_audit_events(id uuid primary key default gen_random_uuid(),academy_id uuid,actor_user_id uuid,action text,target_type text,target_id text,classroom_id uuid,metadata jsonb);
    create table domain_event_outbox(id uuid primary key default gen_random_uuid(),event_type text,event_version text,aggregate_type text,aggregate_id uuid,user_id uuid,payload jsonb,idempotency_key text unique);
    create table academy_lesson_deliveries(academy_id uuid,branch_id uuid,classroom_id uuid,staff_id uuid,delivered_on date,started_at timestamptz,ended_at timestamptz,duration_minutes integer,delivery_status text,student_count integer,verified_by uuid,idempotency_key text,metadata jsonb,unique(academy_id,idempotency_key));
  `);
  const phaseD=readFileSync(new URL('../../supabase/migrations/20260810160000_academy_business_os_phase_d.sql',import.meta.url),'utf8');
  await db.exec(phaseD.slice(0,phaseD.indexOf('alter table public.academy_attendance drop constraint')));
  await db.exec(phaseD.slice(phaseD.indexOf('create or replace function public.academy_create_lesson_session'),phaseD.indexOf('create or replace function public.academy_assign_session_substitute')));
  const operational=readFileSync(new URL('../../supabase/migrations/20260819120000_academy_operational_service_loops.sql',import.meta.url),'utf8');
  await db.exec(operational.slice(operational.indexOf('create table public.academy_timetable_terms'),operational.indexOf('-- Learner and guardian service requests')));
}
