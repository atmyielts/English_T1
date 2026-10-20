-- Parent reads use current account bindings and consent in the same transaction
-- as the returned data. No customer rows or historical evidence are changed.
begin;
set local lock_timeout='5s';

create or replace function public.academy_guardian_assert_actor(p_actor uuid)
returns void language plpgsql set search_path=public as $$
begin
 perform 1 from auth.users where id=p_actor and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception using errcode='42501',message='Sign in again to open parent access';end if;
 perform 1 from public.users where id=p_actor and is_active for share;
 if not found then raise exception using errcode='42501',message='Sign in again to open parent access';end if;
end;$$;
revoke all on function public.academy_guardian_assert_actor(uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_guardian_notification_visible(p_relationship jsonb,p_event text)
returns boolean language sql immutable set search_path=public as $$
 select coalesce((p_relationship->>(case p_event
  when 'student_absent' then 'can_view_attendance' when 'student_late' then 'can_view_attendance'
  when 'homework_assigned' then 'can_view_homework' when 'homework_missing' then 'can_view_homework'
  when 'grade_published' then 'can_view_grades' when 'upcoming_payment' then 'can_view_payments'
  when 'overdue_payment' then 'can_view_debt' when 'schedule_changed' then 'can_view_schedule'
  when 'classroom_announcement' then 'can_view_announcements' when 'progress_report_ready' then 'can_view_progress_reports'
  when 'certificate_issued' then 'can_view_progress_reports' when 'guardian_message' then 'can_view_messages'
  when 'academy_message' then 'can_view_messages' when 'message_received' then 'can_view_messages'
  else null end))::boolean,false);
$$;
revoke all on function public.academy_guardian_notification_visible(jsonb,text) from public,anon,authenticated,service_role;

create or replace function public.academy_guardian_relationship_for_actor(p_actor uuid,p_relationship uuid)
returns jsonb language plpgsql set search_path=public as $$
declare r public.academy_student_guardian_relationships;g public.academy_guardians;c public.academy_contacts;
begin
 perform public.academy_guardian_assert_actor(p_actor);
 select * into r from public.academy_student_guardian_relationships where id=p_relationship;
 if not found then raise exception using errcode='42501',message='This student is not available in your parent portal';end if;
 perform 1 from public.tenants where id=r.academy_id and(type='team' or metadata->>'service_family'='academy' or metadata->>'academy_service'='true' or metadata->>'center_owned'='true') for share;
 if not found then raise exception using errcode='42501',message='This academy is not available';end if;
 select * into c from public.academy_contacts where academy_id=r.academy_id and id=r.contact_id for share;
 select * into g from public.academy_guardians where academy_id=r.academy_id and id=r.guardian_id for share;
 select * into r from public.academy_student_guardian_relationships where id=p_relationship for share;
 if c.id is null or g.user_id is distinct from p_actor or g.status<>'verified' or r.guardian_id is distinct from g.id or r.contact_id is distinct from c.id
  or r.academy_id is distinct from c.academy_id or r.status<>'active' or r.consent_status<>'granted'
  or(r.consent_expires_at is not null and r.consent_expires_at<=clock_timestamp()) then
  raise exception using errcode='42501',message='Parent access changed or expired. Ask the academy to review it';end if;
 return jsonb_build_object('relationship',to_jsonb(r),'guardian',to_jsonb(g),'contact',to_jsonb(c));
end;$$;
revoke all on function public.academy_guardian_relationship_for_actor(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.academy_guardian_child_snapshot(p_actor uuid,p_relationship uuid,p_details boolean)
returns jsonb language plpgsql set search_path=public as $$
declare t jsonb;r public.academy_student_guardian_relationships;c jsonb;result jsonb;
begin
 t:=public.academy_guardian_relationship_for_actor(p_actor,p_relationship);
 r:=jsonb_populate_record(null::public.academy_student_guardian_relationships,t->'relationship');c:=t->'contact';
 result:=jsonb_build_object('academy_id',r.academy_id,'relationship_id',r.id,'guardian_id',r.guardian_id,'relationship_type',r.relationship_type,
  'is_primary_contact',r.is_primary_contact,'is_financially_responsible',r.is_financially_responsible,'details_loaded',p_details,
  'permissions',jsonb_build_object('status',r.can_view_status,'attendance',r.can_view_attendance,'grades',r.can_view_grades,'homework',r.can_view_homework,
   'schedule',r.can_view_schedule,'payments',r.can_view_payments,'debt',r.can_view_debt,'messages',r.can_view_messages,'progress_reports',r.can_view_progress_reports,
   'resources',r.can_view_resources,'announcements',r.can_view_announcements,'message_academy',r.can_message_academy),
  'student',jsonb_build_object('id',c->'id','name',concat_ws(' ',c->>'first_name',c->>'last_name'))||case when r.can_view_status then
   jsonb_build_object('status',c->'status','placement_level',c->'placement_level','placement_score',c->'placement_score') else '{}'::jsonb end,
  'classrooms','[]'::jsonb,'attendance','[]'::jsonb,'grades','[]'::jsonb,'homework','[]'::jsonb,'schedule','[]'::jsonb,'charges','[]'::jsonb,'balances','[]'::jsonb,
  'messages','[]'::jsonb,'announcements','[]'::jsonb,'resources','[]'::jsonb,'progress_reports','[]'::jsonb,'notifications','[]'::jsonb);
 if not p_details then return result;end if;
 -- One statement gives the datasets one MVCC snapshot. Domain permission flags
 -- control every projection, including fields that reveal unpaid debt.
 with memberships as materialized(
  select m.classroom_id,m.status,k.name from public.academy_classroom_memberships m join public.academy_classrooms k on k.academy_id=m.academy_id and k.id=m.classroom_id
   where m.academy_id=r.academy_id and m.contact_id=r.contact_id and m.role='student' and m.status in('active','trial','paused','completed') order by m.classroom_id
 ) select result||jsonb_build_object(
  'classrooms',coalesce((select jsonb_agg(jsonb_build_object('classroom_id',m.classroom_id,'status',m.status,'academy_classrooms',jsonb_build_object('id',m.classroom_id,'name',m.name))) from memberships m),'[]'),
  'attendance',case when r.can_view_attendance then coalesce((select jsonb_agg(to_jsonb(a)) from(select id,classroom_id,session_id,session_date,status,notes,marked_at from public.academy_attendance where academy_id=r.academy_id and contact_id=r.contact_id order by session_date desc,id desc limit 201)a),'[]') else '[]'::jsonb end,
  'grades',case when r.can_view_grades then coalesce((select jsonb_agg(to_jsonb(a)) from(select id,classroom_id,assignment_id,status,case when status in('graded','returned') then score else null end as score,max_score,
case when status in('graded','returned') then coalesce(nullif(notes,''),nullif(feedback->>'comment',''),nullif(feedback->>'summary',''),nullif(feedback->>'text',''),case when jsonb_typeof(feedback)='string' then feedback#>>'{}' end) else null end as feedback,
graded_at,submitted_at from public.academy_submissions s where academy_id=r.academy_id and contact_id=r.contact_id and exists(select 1 from public.academy_assignments a where a.academy_id=s.academy_id and a.id=s.assignment_id and a.status<>'draft' and(a.released_at is null or a.released_at<=clock_timestamp())) order by submitted_at desc,id desc limit 201)a),'[]') else '[]'::jsonb end,
  'homework',case when r.can_view_homework then coalesce((select jsonb_agg(to_jsonb(a)) from(select id,classroom_id,title,description,due_at,status,max_score from public.academy_assignments where academy_id=r.academy_id and classroom_id in(select classroom_id from memberships) and status in('active','closed') and(released_at is null or released_at<=clock_timestamp()) order by due_at desc,id desc limit 201)a),'[]') else '[]'::jsonb end,
  'schedule',case when r.can_view_schedule then coalesce((select jsonb_agg(to_jsonb(a)) from(select id,classroom_id,title,session_type,delivery_mode,starts_at,ends_at,status from public.academy_lesson_sessions where academy_id=r.academy_id and classroom_id in(select classroom_id from memberships) and ends_at>=clock_timestamp()-interval '7 days' order by starts_at,id limit 201)a),'[]') else '[]'::jsonb end,
  'charges',case when r.can_view_payments then coalesce((select jsonb_agg(case when r.can_view_debt then to_jsonb(a) else to_jsonb(a)-'outstanding_amount'-'calculated_status'-'days_overdue'-'aging_bucket' end) from(select id,charge_number,charge_type,due_on,currency,effective_amount::text as effective_amount,outstanding_amount::text as outstanding_amount,calculated_status,days_overdue,aging_bucket from public.academy_charge_balances where academy_id=r.academy_id and contact_id=r.contact_id order by due_on desc,id desc limit 201)a),'[]') else '[]'::jsonb end,
  'balances',case when r.can_view_payments and r.can_view_debt then coalesce((select jsonb_agg(to_jsonb(a)) from(select currency,balance::text as balance,last_entry_at from public.academy_account_balances where academy_id=r.academy_id and contact_id=r.contact_id order by currency)a),'[]') else '[]'::jsonb end,
  'messages',case when r.can_view_messages then coalesce((select jsonb_agg(to_jsonb(a)) from(select id,direction,body,status,channel,created_at,delivered_at,read_at from public.academy_guardian_messages where academy_id=r.academy_id and relationship_id=r.id and status in('sent','delivered','read') order by created_at desc,id desc limit 201)a),'[]') else '[]'::jsonb end,
  'announcements',case when r.can_view_announcements then coalesce((select jsonb_agg(to_jsonb(a)) from(select id,classroom_id,title,body as content,created_at as published_at,created_at from public.academy_announcements where academy_id=r.academy_id and(classroom_id is null or classroom_id in(select classroom_id from memberships)) and created_at<=clock_timestamp() order by created_at desc,id desc limit 201)a),'[]') else '[]'::jsonb end,
  'resources',case when r.can_view_resources then coalesce((select jsonb_agg(to_jsonb(a)) from(select id,classroom_id,title,kind,description,sort_order,is_published,created_at from public.academy_classroom_resources where academy_id=r.academy_id and classroom_id in(select classroom_id from memberships) and is_published order by sort_order,id limit 201)a),'[]') else '[]'::jsonb end,
  'progress_reports',case when r.can_view_progress_reports then coalesce((select jsonb_agg(to_jsonb(a)) from(select id,label,expires_at,last_viewed_at,view_count,is_active,created_at from public.parent_report_tokens where academy_id=r.academy_id and contact_id=r.contact_id and is_active and expires_at>clock_timestamp() order by created_at desc,id desc limit 201)a),'[]') else '[]'::jsonb end,
  'notifications',coalesce((select jsonb_agg(to_jsonb(a)) from(select n.id,n.academy_id,n.guardian_id,n.relationship_id,n.event_key,n.channel,n.type,n.title,n.body,n.status,n.scheduled_at,n.sent_at,n.created_at
   from public.academy_notifications n where n.academy_id=r.academy_id and n.guardian_id=r.guardian_id and n.relationship_id=r.id and(n.contact_id is null or n.contact_id=r.contact_id)
    and n.status='sent' and public.academy_guardian_notification_visible(to_jsonb(r),coalesce(n.event_key,n.type)) order by n.created_at desc,n.id desc limit 201)a),'[]')
 ) into result;
 -- Do not silently describe a bounded history as complete.
 declare field text;more jsonb:='{}';begin
  foreach field in array array['attendance','grades','homework','schedule','charges','messages','announcements','resources','progress_reports','notifications'] loop
   more:=more||jsonb_build_object(field,jsonb_array_length(result->field)>200);
   result:=jsonb_set(result,array[field],coalesce((select jsonb_agg(v order by ord) from jsonb_array_elements(result->field) with ordinality a(v,ord) where ord<=200),'[]'));
  end loop;
  result:=result||jsonb_build_object('history_has_more',more);
 end;
 perform public.academy_guardian_relationship_for_actor(p_actor,p_relationship);
 return result;
end;$$;
revoke all on function public.academy_guardian_child_snapshot(uuid,uuid,boolean) from public,anon,authenticated,service_role;

create or replace function public.academy_guardian_portal_read(p_actor_id uuid,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='20s' as $$
declare ids uuid[];lock_ids uuid[];chosen uuid;selected uuid;after_id uuid;page_limit integer;has_more boolean;children jsonb:='[]';profiles jsonb;preferences jsonb;notifications jsonb:='[]';child jsonb;selected_child jsonb;result jsonb;legacy boolean;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception using errcode='22023',message='Choose a valid parent portal page';end if;
 perform public.academy_guardian_assert_actor(p_actor_id);
 selected:=nullif(p_payload->>'relationship_id','')::uuid;after_id:=nullif(p_payload->>'after_id','')::uuid;
 page_limit:=least(50,greatest(1,coalesce((p_payload->>'limit')::integer,50)));legacy:=coalesce((p_payload->>'all_details')::boolean,false);
 ids:=array(select a.id from public.academy_student_guardian_relationships a join public.academy_guardians g on g.academy_id=a.academy_id and g.id=a.guardian_id
  where g.user_id=p_actor_id and g.status='verified' and a.status='active' and a.consent_status='granted' and(a.consent_expires_at is null or a.consent_expires_at>clock_timestamp())
   and(after_id is null or a.id>after_id) order by a.id limit page_limit+1);
 has_more:=cardinality(ids)>page_limit;ids:=ids[1:page_limit];
 if selected is null and not coalesce((p_payload->>'list_only')::boolean,false) then selected:=ids[1];end if;
 chosen:=selected;lock_ids:=ids;
 -- Acquire the complete parent reference graph in the same order as acceptance:
 -- all contacts before any guardian, then all relationships. This avoids a
 -- cross-child reader/writer deadlock when one parent has several children.
 if selected is not null and not(selected=any(coalesce(ids,'{}'))) then
  if not exists(select 1 from public.academy_student_guardian_relationships a join public.academy_guardians g on g.academy_id=a.academy_id and g.id=a.guardian_id
   where a.id=selected and g.user_id=p_actor_id and g.status='verified' and a.status='active' and a.consent_status='granted' and(a.consent_expires_at is null or a.consent_expires_at>clock_timestamp())) then
   raise exception using errcode='42501',message='This student is not available in your parent portal';end if;
  lock_ids:=array_append(lock_ids,selected);end if;
 perform 1 from public.tenants t where exists(select 1 from public.academy_student_guardian_relationships a where a.id=any(lock_ids) and a.academy_id=t.id) order by t.id for share;
 perform 1 from public.academy_contacts c where exists(select 1 from public.academy_student_guardian_relationships a where a.id=any(lock_ids) and a.academy_id=c.academy_id and a.contact_id=c.id) order by c.id for share;
 perform 1 from public.academy_guardians g where exists(select 1 from public.academy_student_guardian_relationships a where a.id=any(lock_ids) and a.academy_id=g.academy_id and a.guardian_id=g.id) order by g.id for share;
 perform 1 from public.academy_student_guardian_relationships where id=any(lock_ids) order by id for share;
 foreach selected in array coalesce(ids,'{}') loop
  child:=public.academy_guardian_child_snapshot(p_actor_id,selected,legacy or selected=coalesce(nullif(p_payload->>'relationship_id','')::uuid,ids[1]) and not coalesce((p_payload->>'list_only')::boolean,false));
  children:=children||jsonb_build_array(child);notifications:=notifications||coalesce(child->'notifications','[]');
  if selected=chosen then selected_child:=child;end if;
 end loop;
 if chosen is not null and selected_child is null then selected_child:=public.academy_guardian_child_snapshot(p_actor_id,chosen,true);notifications:=coalesce(selected_child->'notifications','[]');end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'academy_id',g.academy_id,'full_name',g.full_name,'status',g.status,'locale',g.locale,'telegram_verified_at',g.telegram_verified_at) order by g.id),'[]') into profiles
  from public.academy_guardians g where g.user_id=p_actor_id and g.status='verified' and exists(select 1 from public.academy_student_guardian_relationships a where a.id=any(lock_ids) and a.academy_id=g.academy_id and a.guardian_id=g.id);
 select coalesce(jsonb_agg(to_jsonb(p)-'created_at' order by p.guardian_id,p.event_type),'[]') into preferences from public.academy_guardian_notification_preferences p
  where exists(select 1 from jsonb_array_elements(profiles) g where g->>'id'=p.guardian_id::text and g->>'academy_id'=p.academy_id::text);
 foreach selected in array coalesce(lock_ids,'{}') loop perform public.academy_guardian_relationship_for_actor(p_actor_id,selected);end loop;
 perform public.academy_guardian_assert_actor(p_actor_id);
 result:=jsonb_build_object('actor_id',p_actor_id,'guardians',profiles,'children',children,'selected_child',selected_child,'preferences',preferences,'notifications',notifications,'has_more',has_more,
  'cursor',case when has_more then jsonb_build_object('after_id',ids[cardinality(ids)]) else null end);
 return result;
end;$$;
revoke all on function public.academy_guardian_portal_read(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.academy_guardian_portal_read(uuid,jsonb) to service_role;

create or replace function public.academy_guardian_portal_requests(p_actor_id uuid,p_relationship_id uuid)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='15s' as $$
declare t jsonb;r public.academy_student_guardian_relationships;requests jsonb;events jsonb;
begin
 t:=public.academy_guardian_relationship_for_actor(p_actor_id,p_relationship_id);
 r:=jsonb_populate_record(null::public.academy_student_guardian_relationships,t->'relationship');
 with own_requests as materialized(
  select id,academy_id,contact_id,guardian_id,requester_kind,requester_user_id,request_type,subject,details,priority,status,desired_date,resolution,resolved_at,created_at,updated_at
   from public.academy_service_requests where academy_id=r.academy_id and guardian_id=r.guardian_id and contact_id=r.contact_id and requester_user_id=p_actor_id
    and requester_kind='guardian' and metadata->>'relationship_id'=r.id::text order by created_at desc,id desc limit 201
 ) select coalesce((select jsonb_agg(to_jsonb(q)) from own_requests q),'[]'),coalesce((select jsonb_agg(to_jsonb(e)) from(
  select id,request_id,event_type,to_status,note,created_at from public.academy_service_request_events
   where academy_id=r.academy_id and request_id in(select id from own_requests) and visible_to_requester order by created_at,id limit 1001)e),'[]') into requests,events;
 perform public.academy_guardian_relationship_for_actor(p_actor_id,p_relationship_id);
 return jsonb_build_object('actor_id',p_actor_id,'relationship_id',r.id,'requests',requests,'events',events,'guardians','[]'::jsonb,
  'history_has_more',jsonb_array_length(requests)>200 or jsonb_array_length(events)>1000);
end;$$;
revoke all on function public.academy_guardian_portal_requests(uuid,uuid) from public,anon,authenticated;
grant execute on function public.academy_guardian_portal_requests(uuid,uuid) to service_role;

-- Legacy one-time Telegram links must not bypass the same account-binding and
-- consent rules. The service derives Telegram IDs from signed initData.
create or replace function public.academy_claim_guardian_link(p_token text,p_user_id uuid,p_telegram_user_id text,p_telegram_chat_id text,p_telegram_username text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='15s' as $$
declare tok public.academy_guardian_link_tokens;r public.academy_student_guardian_relationships;g public.academy_guardians;c public.academy_contacts;
 email_value text;verified boolean;replayed boolean;result jsonb;
begin
 if nullif(trim(p_token),'') is null or length(p_token)>200 or p_telegram_user_id is null or p_telegram_user_id !~ '^[0-9]{1,20}$' or p_telegram_chat_id is distinct from p_telegram_user_id then
  raise exception using errcode='22023',message='Open the parent invitation inside Telegram';end if;
 perform public.academy_guardian_assert_actor(p_user_id);
 select * into tok from public.academy_guardian_link_tokens where token_hash=extensions.digest(trim(p_token),'sha256');
 if not found then raise exception using errcode='P0002',message='Parent invitation not found';end if;
 perform pg_advisory_xact_lock(hashtextextended('academy:learner-invitation:'||tok.academy_id::text,0));
 select * into r from public.academy_student_guardian_relationships where academy_id=tok.academy_id and id=tok.relationship_id;
 if not found then raise exception using errcode='P0002',message='Parent relationship not found';end if;
 perform 1 from public.tenants where id=tok.academy_id and(type='team' or metadata->>'service_family'='academy' or metadata->>'academy_service'='true' or metadata->>'center_owned'='true') for share;
 if not found then raise exception using errcode='42501',message='This academy is not available';end if;
 select * into c from public.academy_contacts where academy_id=r.academy_id and id=r.contact_id for share;
 select * into g from public.academy_guardians where academy_id=r.academy_id and id=r.guardian_id for update;
 select * into r from public.academy_student_guardian_relationships where academy_id=tok.academy_id and id=tok.relationship_id for update;
 select * into tok from public.academy_guardian_link_tokens where id=tok.id for update;
 if g.id is null or c.id is null or r.guardian_id is distinct from g.id or r.contact_id is distinct from c.id
  or(g.user_id is not null and g.user_id<>p_user_id) or(g.telegram_user_id is not null and g.telegram_user_id<>p_telegram_user_id) then
  raise exception using errcode='42501',message='This parent record is linked to another account';end if;
 if g.status not in('invited','verified') or c.status not in('active','trial','paused') or r.status not in('pending','active') or r.consent_status not in('pending','granted')
  or(r.consent_expires_at is not null and r.consent_expires_at<=clock_timestamp()) then
  raise exception using errcode='42501',message='Parent access changed or expired. Ask the academy to review it';end if;
 select lower(trim(email)),email_confirmed_at is not null into email_value,verified from auth.users where id=p_user_id;
 if g.user_id is null and nullif(trim(g.email),'') is not null and(not verified or lower(trim(g.email)) is distinct from email_value) then
  raise exception using errcode='42501',message='Sign in with the email that received the parent invitation';end if;
 replayed:=tok.status='used' and tok.used_by=p_user_id and g.user_id=p_user_id and g.telegram_user_id=p_telegram_user_id and g.status='verified' and r.status='active' and r.consent_status='granted';
 if not replayed then
  if tok.status<>'active' or tok.use_count>=tok.max_uses or tok.expires_at<=clock_timestamp() then raise exception using errcode='P0010',message='Parent invitation has expired or was withdrawn';end if;
  update public.academy_guardians set user_id=p_user_id,telegram_user_id=p_telegram_user_id,telegram_chat_id=p_telegram_user_id,
   telegram_username=nullif(left(trim(p_telegram_username),120),''),telegram_verified_at=clock_timestamp(),status='verified',updated_at=clock_timestamp()
   where academy_id=r.academy_id and id=g.id returning * into g;
  update public.academy_student_guardian_relationships set status='active',consent_status='granted',consented_at=coalesce(consented_at,clock_timestamp()),updated_at=clock_timestamp()
   where academy_id=r.academy_id and id=r.id returning * into r;
  update public.academy_guardian_link_tokens set use_count=use_count+1,status='used',used_by=p_user_id,used_at=clock_timestamp() where id=tok.id returning * into tok;
  insert into public.academy_guardian_consents(academy_id,relationship_id,consent_type,policy_version,status,granted_by_user_id,evidence)
   values(r.academy_id,r.id,'telegram_link','telegram-link-v2','granted',p_user_id,jsonb_build_object('telegram_user_id',p_telegram_user_id,'token_id',tok.id));
  insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,metadata)
   values(r.academy_id,p_user_id,'guardian.link_claimed','academy_student_guardian_relationship',r.id::text,r.contact_id,jsonb_build_object('guardian_id',g.id,'telegram_verified',true));
 end if;
 perform public.academy_guardian_assert_actor(p_user_id);
 if not replayed and tok.expires_at<=clock_timestamp() or r.consent_expires_at<=clock_timestamp() then raise exception using errcode='P0010',message='Parent invitation or consent expired';end if;
 result:=jsonb_build_object('actor_id',p_user_id,'academy_id',r.academy_id,'replayed',replayed,
  'guardian',jsonb_build_object('id',g.id,'academy_id',g.academy_id,'full_name',g.full_name,'status',g.status,'telegram_verified_at',g.telegram_verified_at),
  'relationship',jsonb_build_object('id',r.id,'academy_id',r.academy_id,'contact_id',r.contact_id,'guardian_id',r.guardian_id,'status',r.status,'consent_status',r.consent_status));
 return result;
end;$$;
revoke all on function public.academy_claim_guardian_link(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.academy_claim_guardian_link(text,uuid,text,text,text) to service_role;

-- The shipped applications read these private records through the service API.
-- Old broad RLS and per-column grants cannot remain a second disclosure path.
do $boundary$ declare target text;columns text;begin
 foreach target in array array['academy_guardians','academy_student_guardian_relationships','academy_guardian_consents','academy_guardian_link_tokens',
  'academy_guardian_notification_preferences','academy_guardian_messages','academy_notification_delivery_attempts','academy_notifications'] loop
  if to_regclass('public.'||target) is null then raise exception 'Missing reviewed parent table: %',target;end if;
  execute format('revoke all privileges on table public.%I from public,anon,authenticated',target);
  select string_agg(quote_ident(a.attname),',' order by a.attnum) into columns from pg_attribute a where a.attrelid=to_regclass('public.'||target) and a.attnum>0 and not a.attisdropped;
  execute format('revoke select(%1$s),insert(%1$s),update(%1$s),references(%1$s) on table public.%2$I from public,anon,authenticated',columns,target);
  execute format('grant all privileges on table public.%I to service_role',target);
 end loop;
end;$boundary$;
commit;
