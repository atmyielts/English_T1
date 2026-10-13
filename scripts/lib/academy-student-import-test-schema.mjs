import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
export const studentImportMigration=file=>readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8');
const installedFunction=(file,name)=>{const text=studentImportMigration(file),start=text.indexOf('create or replace function public.'+name+'('),end=text.indexOf('$$;',start);assert(start>=0&&end>start);return text.slice(start,end+3);};

// Shared isolated fixture; this never connects to a hosted database.
export async function createStudentImportTestSchema(db,{recovery=true}={}) {
 await db.exec(`create role anon;create role authenticated;create role service_role;
  create table tenants(id uuid primary key);create table users(id uuid primary key,is_active boolean not null);
  create table academy_branches(id uuid primary key,academy_id uuid not null references tenants(id),timezone text not null,is_active boolean not null,unique(academy_id,id));
  create table academy_localization_settings(academy_id uuid primary key,currency text not null);`);
 await db.exec(installedFunction('20260810190000_academy_business_os_phase_g.sql','academy_normalize_phone'));
 await db.exec(`create table academy_contacts(id uuid primary key default gen_random_uuid(),academy_id uuid not null,primary_branch_id uuid not null,first_name text not null,last_name text not null default '',status text not null,phone text,email text,user_id uuid,lifecycle_stage text,created_by uuid,metadata jsonb not null default '{}',created_at timestamptz default now(),updated_at timestamptz default now(),phone_normalized text generated always as(academy_normalize_phone(phone)) stored,unique(academy_id,id),unique(academy_id,phone));
  create index on academy_contacts(academy_id,phone_normalized);create unique index on academy_contacts(academy_id,lower(email));
  create table academy_classrooms(id uuid primary key default gen_random_uuid(),academy_id uuid not null,branch_id uuid not null,name text not null,is_active boolean default true,student_capacity integer,created_by uuid,metadata jsonb not null default '{}',unique(academy_id,id),unique(academy_id,name));
  create table academy_classroom_memberships(id uuid primary key default gen_random_uuid(),academy_id uuid not null,classroom_id uuid not null,contact_id uuid not null,role text not null,status text not null,joined_at timestamptz,started_at timestamptz,metadata jsonb not null default '{}',unique(classroom_id,contact_id),foreign key(academy_id,classroom_id) references academy_classrooms(academy_id,id),foreign key(academy_id,contact_id) references academy_contacts(academy_id,id));
  create index on academy_classroom_memberships(classroom_id);
  create index on academy_classroom_memberships(contact_id);
  create table academy_guardians(id uuid primary key default gen_random_uuid(),academy_id uuid not null,full_name text not null,phone text,status text not null,created_by uuid,metadata jsonb not null default '{}',phone_normalized text generated always as(academy_normalize_phone(phone)) stored,unique(academy_id,id));
  create index on academy_guardians(academy_id,phone_normalized);
  create table academy_student_guardian_relationships(id uuid primary key default gen_random_uuid(),academy_id uuid not null,contact_id uuid not null,guardian_id uuid not null,relationship_type text,status text not null,consent_status text not null,is_financially_responsible boolean,is_primary_contact boolean,can_view_payments boolean,can_view_debt boolean,created_by uuid,metadata jsonb not null default '{}',unique(academy_id,id),foreign key(academy_id,contact_id) references academy_contacts(academy_id,id),foreign key(academy_id,guardian_id) references academy_guardians(academy_id,id));
  create table academy_account_ledger_entries(id uuid primary key default gen_random_uuid(),academy_id uuid not null,contact_id uuid not null,entry_type text not null,amount bigint not null check(amount<>0),currency text not null,effective_at timestamptz,reason text,idempotency_key text not null,created_by uuid,metadata jsonb not null default '{}',unique(academy_id,idempotency_key),foreign key(academy_id,contact_id) references academy_contacts(academy_id,id));
  create index on academy_account_ledger_entries(academy_id,contact_id,currency,effective_at,id);
  create index on academy_student_guardian_relationships(academy_id,contact_id);
  create index on academy_student_guardian_relationships(academy_id,guardian_id);
  create table academy_audit_events(id uuid primary key default gen_random_uuid(),academy_id uuid not null,actor_user_id uuid,action text not null,target_type text not null,target_id text not null,metadata jsonb not null);
  create table academy_lead_conversions(academy_id uuid,contact_id uuid,lead_id uuid,converted_at timestamptz);
  create table academy_student_lifecycle_events(id uuid primary key default gen_random_uuid(),academy_id uuid not null,branch_id uuid,lead_id uuid,contact_id uuid,classroom_id uuid,subscription_id uuid,guardian_relationship_id uuid,event_key text not null,actor_user_id uuid,source_table text,source_id uuid,idempotency_key text not null,evidence jsonb not null,occurred_at timestamptz not null default now(),unique(academy_id,idempotency_key),unique(academy_id,id));
  create table domain_event_outbox(id uuid primary key default gen_random_uuid(),event_type text,event_version text,aggregate_type text,aggregate_id uuid,user_id uuid,occurred_at timestamptz,payload jsonb,status text,attempts integer,idempotency_key text unique);`);
 await db.exec('create index on academy_student_lifecycle_events(academy_id,contact_id,occurred_at);');
 await db.exec(installedFunction('20260810190000_academy_business_os_phase_g.sql','academy_capture_student_lifecycle_event'));
 await db.exec(installedFunction('20260810230000_academy_lifecycle_automation_worker.sql','academy_publish_lifecycle_event'));
 await db.exec(`create trigger capture_membership after insert or update on academy_classroom_memberships for each row execute function academy_capture_student_lifecycle_event();
  create trigger capture_relationship after insert or update on academy_student_guardian_relationships for each row execute function academy_capture_student_lifecycle_event();
  create trigger publish_lifecycle after insert on academy_student_lifecycle_events for each row execute function academy_publish_lifecycle_event();`);
 for(const file of ['20261012160000_academy_student_import_staging.sql','20261012170000_academy_student_import_normalization.sql','20261012180000_academy_student_import_preview.sql','20261012190000_academy_student_import_commit.sql','20261012200000_academy_student_import_lifecycle.sql'])await db.exec(studentImportMigration(file));
 if(recovery)await db.exec(studentImportMigration('20261012220000_academy_student_import_recovery.sql'));
}
