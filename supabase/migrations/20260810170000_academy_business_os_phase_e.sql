-- Education Business OS Phase E: guardians, consent, secure linking, preferences, and privacy-scoped communication.
create extension if not exists pgcrypto;

create table public.academy_guardians(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,
 user_id uuid references public.users(id) on delete set null,full_name text not null,phone text,email text,
 telegram_user_id text,telegram_chat_id text,telegram_username text,telegram_verified_at timestamptz,
 status text not null default 'invited' check(status in('invited','verified','suspended','revoked')),
 locale text not null default 'uz',notes text,metadata jsonb not null default '{}'::jsonb,
 created_by uuid references public.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(academy_id,id),check(phone is not null or email is not null or telegram_user_id is not null)
);
create unique index academy_guardians_user_uidx on public.academy_guardians(academy_id,user_id) where user_id is not null and status<>'revoked';
create unique index academy_guardians_telegram_uidx on public.academy_guardians(academy_id,telegram_user_id) where telegram_user_id is not null and status<>'revoked';

create table public.academy_student_guardian_relationships(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,
 contact_id uuid not null,guardian_id uuid not null,
 relationship_type text not null check(relationship_type in('mother','father','guardian','sponsor','emergency_contact','other')),
 status text not null default 'pending' check(status in('pending','active','suspended','revoked','expired')),
 is_primary_contact boolean not null default false,is_financially_responsible boolean not null default false,is_emergency_contact boolean not null default false,
 can_view_status boolean not null default true,can_view_attendance boolean not null default true,can_view_grades boolean not null default true,
 can_view_homework boolean not null default true,can_view_schedule boolean not null default true,can_view_payments boolean not null default false,
 can_view_debt boolean not null default false,can_view_messages boolean not null default true,can_view_progress_reports boolean not null default true,
 can_view_resources boolean not null default true,can_view_announcements boolean not null default true,can_message_academy boolean not null default true,
 consent_status text not null default 'pending' check(consent_status in('pending','granted','declined','revoked','expired')),
 consented_at timestamptz,consent_expires_at timestamptz,revoked_at timestamptz,revoked_by uuid references public.users(id) on delete set null,revocation_reason text,
 created_by uuid references public.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),metadata jsonb not null default '{}'::jsonb,
 unique(academy_id,id),foreign key(academy_id,contact_id) references public.academy_contacts(academy_id,id) on delete restrict,
 foreign key(academy_id,guardian_id) references public.academy_guardians(academy_id,id) on delete restrict,
 check(not is_financially_responsible or can_view_payments),check(not can_view_debt or can_view_payments)
);
create unique index academy_guardian_relationship_active_uidx on public.academy_student_guardian_relationships(academy_id,contact_id,guardian_id) where status in('pending','active','suspended');
create unique index academy_guardian_primary_contact_uidx on public.academy_student_guardian_relationships(academy_id,contact_id) where is_primary_contact and status='active';

create table public.academy_guardian_consents(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,
 relationship_id uuid not null,consent_type text not null check(consent_type in('guardian_access','academic_visibility','financial_visibility','messaging','telegram_link','data_processing')),
 policy_version text not null,status text not null check(status in('granted','declined','revoked','expired')),
 granted_by_user_id uuid references public.users(id) on delete set null,recorded_by_user_id uuid references public.users(id) on delete set null,
 occurred_at timestamptz not null default now(),expires_at timestamptz,reason text,evidence jsonb not null default '{}'::jsonb,
 unique(academy_id,id),foreign key(academy_id,relationship_id) references public.academy_student_guardian_relationships(academy_id,id) on delete restrict
);

create table public.academy_guardian_link_tokens(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,
 relationship_id uuid not null,token_hash bytea not null unique,purpose text not null default 'telegram_guardian_link' check(purpose in('telegram_guardian_link','web_guardian_link')),
 expires_at timestamptz not null,max_uses integer not null default 1 check(max_uses between 1 and 5),use_count integer not null default 0,
 status text not null default 'active' check(status in('active','used','revoked','expired')),
 issued_by uuid references public.users(id) on delete set null,used_by uuid references public.users(id) on delete set null,used_at timestamptz,revoked_at timestamptz,
 metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),unique(academy_id,id),
 foreign key(academy_id,relationship_id) references public.academy_student_guardian_relationships(academy_id,id) on delete restrict
);

create table public.academy_guardian_notification_preferences(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,guardian_id uuid not null,
 event_type text not null,enabled boolean not null default true,inapp_enabled boolean not null default true,telegram_enabled boolean not null default true,
 email_enabled boolean not null default false,sms_enabled boolean not null default false,locale text not null default 'uz',timezone text not null default 'Asia/Tashkent',
 quiet_hours_start time,quiet_hours_end time,allow_critical_override boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(academy_id,id),unique(academy_id,guardian_id,event_type),
 foreign key(academy_id,guardian_id) references public.academy_guardians(academy_id,id) on delete cascade,
 check((quiet_hours_start is null)=(quiet_hours_end is null))
);

create table public.academy_guardian_messages(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,
 relationship_id uuid not null,direction text not null check(direction in('guardian_to_academy','academy_to_guardian')),
 sender_user_id uuid references public.users(id) on delete set null,body text not null,status text not null default 'sent' check(status in('draft','queued','sent','delivered','failed','read','archived')),
 channel text not null default 'inapp' check(channel in('inapp','telegram','email','sms')),
 reply_to_message_id uuid references public.academy_guardian_messages(id) on delete set null,provider_message_id text,
 metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),delivered_at timestamptz,read_at timestamptz,
 unique(academy_id,id),foreign key(academy_id,relationship_id) references public.academy_student_guardian_relationships(academy_id,id) on delete restrict
);

alter table public.academy_notifications drop constraint if exists academy_notifications_channel_check;
alter table public.academy_notifications add constraint academy_notifications_channel_check check(channel in('telegram','email','inapp','sms'));
alter table public.academy_notifications add column if not exists guardian_id uuid,add column if not exists relationship_id uuid,
 add column if not exists event_key text,add column if not exists dedupe_key text,add column if not exists critical_override boolean not null default false;
alter table public.academy_notifications add constraint academy_notifications_guardian_fk foreign key(academy_id,guardian_id) references public.academy_guardians(academy_id,id) on delete restrict;
alter table public.academy_notifications add constraint academy_notifications_relationship_fk foreign key(academy_id,relationship_id) references public.academy_student_guardian_relationships(academy_id,id) on delete restrict;
create unique index if not exists academy_notifications_academy_id_id_uidx on public.academy_notifications(academy_id,id);
create unique index academy_notifications_dedupe_uidx on public.academy_notifications(academy_id,dedupe_key) where dedupe_key is not null;

create table public.academy_notification_delivery_attempts(
 id uuid primary key default gen_random_uuid(),academy_id uuid not null references public.tenants(id) on delete cascade,notification_id uuid not null,
 attempt_number integer not null check(attempt_number>0),channel text not null,provider text,status text not null check(status in('sent','failed','skipped')),
 error_code text,error_message text,provider_message_id text,attempted_at timestamptz not null default now(),metadata jsonb not null default '{}'::jsonb,
 unique(academy_id,id),unique(academy_id,notification_id,attempt_number),
 foreign key(academy_id,notification_id) references public.academy_notifications(academy_id,id) on delete restrict
);

create or replace function public.academy_guardian_user_can_view(p_academy_id uuid,p_guardian_id uuid)
returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.academy_guardians g where g.academy_id=p_academy_id and g.id=p_guardian_id and g.user_id=auth.uid() and g.status='verified')$$;
revoke all on function public.academy_guardian_user_can_view(uuid,uuid) from public,anon;
grant execute on function public.academy_guardian_user_can_view(uuid,uuid) to authenticated,service_role;

create or replace function public.academy_create_guardian_relationship(p_academy_id uuid,p_actor_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_guardian public.academy_guardians%rowtype;v_relationship public.academy_student_guardian_relationships%rowtype;
begin
 insert into public.academy_guardians(academy_id,full_name,phone,email,locale,notes,created_by)
 values(p_academy_id,trim(p_payload->>'full_name'),nullif(trim(p_payload->>'phone'),''),nullif(lower(trim(p_payload->>'email')),''),coalesce(nullif(p_payload->>'locale',''),'uz'),nullif(trim(p_payload->>'notes'),''),p_actor_id)returning * into v_guardian;
 insert into public.academy_student_guardian_relationships(academy_id,contact_id,guardian_id,relationship_type,status,is_primary_contact,is_financially_responsible,is_emergency_contact,
 can_view_status,can_view_attendance,can_view_grades,can_view_homework,can_view_schedule,can_view_payments,can_view_debt,can_view_messages,can_view_progress_reports,can_view_resources,can_view_announcements,can_message_academy,consent_status,created_by)
 values(p_academy_id,(p_payload->>'contact_id')::uuid,v_guardian.id,lower(p_payload->>'relationship_type'),'pending',coalesce((p_payload->>'is_primary_contact')::boolean,false),coalesce((p_payload->>'is_financially_responsible')::boolean,false),coalesce((p_payload->>'is_emergency_contact')::boolean,false),
 coalesce((p_payload->>'can_view_status')::boolean,true),coalesce((p_payload->>'can_view_attendance')::boolean,true),coalesce((p_payload->>'can_view_grades')::boolean,true),coalesce((p_payload->>'can_view_homework')::boolean,true),coalesce((p_payload->>'can_view_schedule')::boolean,true),coalesce((p_payload->>'can_view_payments')::boolean,false),coalesce((p_payload->>'can_view_debt')::boolean,false),coalesce((p_payload->>'can_view_messages')::boolean,true),coalesce((p_payload->>'can_view_progress_reports')::boolean,true),coalesce((p_payload->>'can_view_resources')::boolean,true),coalesce((p_payload->>'can_view_announcements')::boolean,true),coalesce((p_payload->>'can_message_academy')::boolean,true),'pending',p_actor_id)returning * into v_relationship;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,metadata)values(p_academy_id,p_actor_id,'guardian.relationship_created','academy_student_guardian_relationship',v_relationship.id::text,v_relationship.contact_id,jsonb_build_object('guardian_id',v_guardian.id,'relationship_type',v_relationship.relationship_type));
 return jsonb_build_object('guardian',to_jsonb(v_guardian),'relationship',to_jsonb(v_relationship));
end;$$;

create or replace function public.academy_issue_guardian_link(p_academy_id uuid,p_relationship_id uuid,p_actor_id uuid,p_expires_at timestamptz,p_purpose text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_token text;v_row public.academy_guardian_link_tokens%rowtype;
begin
 if not exists(select 1 from public.academy_student_guardian_relationships where academy_id=p_academy_id and id=p_relationship_id and status in('pending','active')) then raise exception 'Linkable guardian relationship not found';end if;
 v_token:=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.academy_guardian_link_tokens(academy_id,relationship_id,token_hash,purpose,expires_at,issued_by)
 values(p_academy_id,p_relationship_id,extensions.digest(v_token,'sha256'),lower(coalesce(nullif(p_purpose,''),'telegram_guardian_link')),least(p_expires_at,now()+interval '30 days'),p_actor_id)returning * into v_row;
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,metadata)values(p_academy_id,p_actor_id,'guardian.link_issued','academy_guardian_link_token',v_row.id::text,jsonb_build_object('relationship_id',p_relationship_id,'expires_at',v_row.expires_at,'purpose',v_row.purpose));
 return jsonb_build_object('id',v_row.id,'token',v_token,'expires_at',v_row.expires_at,'purpose',v_row.purpose);
end;$$;

create or replace function public.academy_claim_guardian_link(p_token text,p_user_id uuid,p_telegram_user_id text,p_telegram_chat_id text,p_telegram_username text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_token public.academy_guardian_link_tokens%rowtype;v_rel public.academy_student_guardian_relationships%rowtype;v_guardian public.academy_guardians%rowtype;
begin
 if nullif(trim(p_token),'') is null or nullif(trim(p_telegram_user_id),'') is null or nullif(trim(p_telegram_chat_id),'') is null then raise exception 'Token and verified Telegram identifiers are required';end if;
 select * into v_token from public.academy_guardian_link_tokens where token_hash=extensions.digest(trim(p_token),'sha256') for update;
 if not found or v_token.status<>'active' or v_token.expires_at<=now() or v_token.use_count>=v_token.max_uses then raise exception 'Guardian link is invalid, expired, used, or revoked';end if;
 select * into v_rel from public.academy_student_guardian_relationships where academy_id=v_token.academy_id and id=v_token.relationship_id and status in('pending','active') for update;
 if not found then raise exception 'Guardian relationship is unavailable';end if;
 if exists(select 1 from public.academy_guardians where academy_id=v_token.academy_id and user_id=p_user_id and id<>v_rel.guardian_id and status<>'revoked') then raise exception 'User is already linked to another guardian profile';end if;
 update public.academy_guardians set user_id=p_user_id,telegram_user_id=trim(p_telegram_user_id),telegram_chat_id=trim(p_telegram_chat_id),telegram_username=nullif(trim(p_telegram_username),''),telegram_verified_at=now(),status='verified',updated_at=now() where academy_id=v_token.academy_id and id=v_rel.guardian_id returning * into v_guardian;
 update public.academy_student_guardian_relationships set status='active',consent_status='granted',consented_at=now(),updated_at=now() where academy_id=v_token.academy_id and id=v_rel.id returning * into v_rel;
 update public.academy_guardian_link_tokens set use_count=use_count+1,status='used',used_by=p_user_id,used_at=now() where id=v_token.id;
 insert into public.academy_guardian_consents(academy_id,relationship_id,consent_type,policy_version,status,granted_by_user_id,evidence)values(v_token.academy_id,v_rel.id,'telegram_link','v1','granted',p_user_id,jsonb_build_object('telegram_user_id',p_telegram_user_id,'token_id',v_token.id));
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,metadata)values(v_token.academy_id,p_user_id,'guardian.link_claimed','academy_student_guardian_relationship',v_rel.id::text,v_rel.contact_id,jsonb_build_object('guardian_id',v_guardian.id,'telegram_verified',true));
 return jsonb_build_object('academy_id',v_token.academy_id,'guardian',to_jsonb(v_guardian)-'telegram_chat_id','relationship',to_jsonb(v_rel));
end;$$;

create or replace function public.academy_revoke_guardian_relationship(p_academy_id uuid,p_relationship_id uuid,p_actor_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$declare v public.academy_student_guardian_relationships%rowtype;
begin if nullif(trim(p_reason),'') is null then raise exception 'Revocation reason is required';end if;
 update public.academy_student_guardian_relationships set status='revoked',consent_status='revoked',revoked_at=now(),revoked_by=p_actor_id,revocation_reason=trim(p_reason),updated_at=now() where academy_id=p_academy_id and id=p_relationship_id and status<>'revoked' returning * into v;
 if not found then raise exception 'Active guardian relationship not found';end if;
 update public.academy_guardian_link_tokens set status='revoked',revoked_at=now() where academy_id=p_academy_id and relationship_id=p_relationship_id and status='active';
 insert into public.academy_guardian_consents(academy_id,relationship_id,consent_type,policy_version,status,recorded_by_user_id,reason)values(p_academy_id,p_relationship_id,'guardian_access','v1','revoked',p_actor_id,trim(p_reason));
 insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,metadata)values(p_academy_id,p_actor_id,'guardian.relationship_revoked','academy_student_guardian_relationship',v.id::text,v.contact_id,jsonb_build_object('guardian_id',v.guardian_id,'reason',p_reason));return to_jsonb(v);end;$$;

revoke all on function public.academy_create_guardian_relationship(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.academy_issue_guardian_link(uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.academy_claim_guardian_link(text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.academy_revoke_guardian_relationship(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.academy_create_guardian_relationship(uuid,uuid,jsonb) to service_role;
grant execute on function public.academy_issue_guardian_link(uuid,uuid,uuid,timestamptz,text) to service_role;
grant execute on function public.academy_claim_guardian_link(text,uuid,text,text,text) to service_role;
grant execute on function public.academy_revoke_guardian_relationship(uuid,uuid,uuid,text) to service_role;

alter table public.academy_guardians enable row level security;alter table public.academy_student_guardian_relationships enable row level security;
alter table public.academy_guardian_consents enable row level security;alter table public.academy_guardian_link_tokens enable row level security;
alter table public.academy_guardian_notification_preferences enable row level security;alter table public.academy_guardian_messages enable row level security;
alter table public.academy_notification_delivery_attempts enable row level security;
create policy "Academy guardians read by staff" on public.academy_guardians for select using(public.academy_org_can_view(academy_id));
create policy "Guardians read own profile" on public.academy_guardians for select using(public.academy_guardian_user_can_view(academy_id,id));
create policy "Academy guardian relationships read by staff" on public.academy_student_guardian_relationships for select using(public.academy_org_can_view(academy_id));
create policy "Guardians read active relationships" on public.academy_student_guardian_relationships for select using(status='active' and consent_status='granted' and public.academy_guardian_user_can_view(academy_id,guardian_id));
create policy "Academy guardian consents read by staff" on public.academy_guardian_consents for select using(public.academy_org_can_view(academy_id));
create policy "Guardians read own consents" on public.academy_guardian_consents for select using(exists(select 1 from public.academy_student_guardian_relationships r where r.academy_id=academy_guardian_consents.academy_id and r.id=academy_guardian_consents.relationship_id and public.academy_guardian_user_can_view(r.academy_id,r.guardian_id)));
create policy "Academy guardian links read by staff" on public.academy_guardian_link_tokens for select using(public.academy_org_can_view(academy_id));
create policy "Academy guardian preferences read by staff" on public.academy_guardian_notification_preferences for select using(public.academy_org_can_view(academy_id));
create policy "Guardians read own preferences" on public.academy_guardian_notification_preferences for select using(public.academy_guardian_user_can_view(academy_id,guardian_id));
create policy "Academy guardian messages read by staff" on public.academy_guardian_messages for select using(public.academy_org_can_view(academy_id));
create policy "Guardians read relationship messages" on public.academy_guardian_messages for select using(exists(select 1 from public.academy_student_guardian_relationships r where r.academy_id=academy_guardian_messages.academy_id and r.id=academy_guardian_messages.relationship_id and r.status='active' and r.consent_status='granted' and r.can_view_messages and public.academy_guardian_user_can_view(r.academy_id,r.guardian_id)));
create policy "Academy notification attempts read by staff" on public.academy_notification_delivery_attempts for select using(public.academy_org_can_view(academy_id));
create policy "Guardians read addressed notifications" on public.academy_notifications for select using(guardian_id is not null and public.academy_guardian_user_can_view(academy_id,guardian_id));

create or replace function public.prevent_academy_guardian_evidence_mutation() returns trigger language plpgsql as $$begin raise exception 'Guardian consent, token use, and delivery attempt history is immutable';end;$$;
create trigger academy_guardian_consents_immutable before update or delete on public.academy_guardian_consents for each row execute function public.prevent_academy_guardian_evidence_mutation();
create trigger academy_notification_attempts_immutable before update or delete on public.academy_notification_delivery_attempts for each row execute function public.prevent_academy_guardian_evidence_mutation();
