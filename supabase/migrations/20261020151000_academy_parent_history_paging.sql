-- Stable keyset paging of each consent-filtered parent history. Cursor values
-- only narrow the child-bound query; they cannot select another child's data.
begin;
create or replace function public.academy_guardian_history_read(p_actor_id uuid,p_relationship_id uuid,p_section text,p_after jsonb default null)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='15s' as $$
declare graph jsonb;r public.academy_student_guardian_relationships;records jsonb;more boolean;last_row jsonb;cursor_key text;cursor_id uuid;
begin
 graph:=public.academy_guardian_relationship_for_actor(p_actor_id,p_relationship_id);
 r:=jsonb_populate_record(null::public.academy_student_guardian_relationships,graph->'relationship');
 if p_after is not null then
  if jsonb_typeof(p_after) is distinct from 'object' or p_after->>'section' is distinct from p_section or p_after->>'relationship_id' is distinct from r.id::text then raise exception using errcode='22023',message='This history cursor belongs to another page';end if;
  cursor_key:=p_after->>'key';cursor_id:=(p_after->>'id')::uuid;
  if cursor_key is null or cursor_id is null then raise exception using errcode='22023',message='Choose a valid history page';end if;
 end if;
 case p_section
 when 'attendance' then
  if not r.can_view_attendance then records:='[]';else with memberships as materialized(select m.classroom_id from public.academy_classroom_memberships m where m.academy_id=r.academy_id and m.contact_id=r.contact_id and m.role='student' and m.status in('active','trial','paused','completed')) select coalesce(jsonb_agg(to_jsonb(q)),'[]') into records from(select id,classroom_id,session_id,session_date,status,notes,marked_at from public.academy_attendance where academy_id=r.academy_id and contact_id=r.contact_id and (cursor_id is null or (coalesce(session_date,'infinity'::date),id) < (cursor_key::date,cursor_id)) order by coalesce(session_date,'infinity'::date) desc,id desc limit 101)q;end if;
  cursor_key:=coalesce(records->99->>'session_date','infinity'::text);
 when 'grades' then
  if not r.can_view_grades then records:='[]';else with memberships as materialized(select m.classroom_id from public.academy_classroom_memberships m where m.academy_id=r.academy_id and m.contact_id=r.contact_id and m.role='student' and m.status in('active','trial','paused','completed')) select coalesce(jsonb_agg(to_jsonb(q)),'[]') into records from(select id,classroom_id,assignment_id,status,case when status in('graded','returned') then score else null end as score,max_score,
case when status in('graded','returned') then coalesce(nullif(notes,''),nullif(feedback->>'comment',''),nullif(feedback->>'summary',''),nullif(feedback->>'text',''),case when jsonb_typeof(feedback)='string' then feedback#>>'{}' end) else null end as feedback,
graded_at,submitted_at from public.academy_submissions s where academy_id=r.academy_id and contact_id=r.contact_id and exists(select 1 from public.academy_assignments a where a.academy_id=s.academy_id and a.id=s.assignment_id and a.status<>'draft' and(a.released_at is null or a.released_at<=clock_timestamp())) and (cursor_id is null or (coalesce(submitted_at,'infinity'::timestamptz),id) < (cursor_key::timestamptz,cursor_id)) order by coalesce(submitted_at,'infinity'::timestamptz) desc,id desc limit 101)q;end if;
  cursor_key:=coalesce(records->99->>'submitted_at','infinity'::text);
 when 'homework' then
  if not r.can_view_homework then records:='[]';else with memberships as materialized(select m.classroom_id from public.academy_classroom_memberships m where m.academy_id=r.academy_id and m.contact_id=r.contact_id and m.role='student' and m.status in('active','trial','paused','completed')) select coalesce(jsonb_agg(to_jsonb(q)),'[]') into records from(select id,classroom_id,title,description,due_at,status,max_score from public.academy_assignments where academy_id=r.academy_id and classroom_id in(select classroom_id from memberships) and status in('active','closed') and(released_at is null or released_at<=clock_timestamp()) and (cursor_id is null or (coalesce(due_at,'infinity'::timestamptz),id) < (cursor_key::timestamptz,cursor_id)) order by coalesce(due_at,'infinity'::timestamptz) desc,id desc limit 101)q;end if;
  cursor_key:=coalesce(records->99->>'due_at','infinity'::text);
 when 'schedule' then
  if not r.can_view_schedule then records:='[]';else with memberships as materialized(select m.classroom_id from public.academy_classroom_memberships m where m.academy_id=r.academy_id and m.contact_id=r.contact_id and m.role='student' and m.status in('active','trial','paused','completed')) select coalesce(jsonb_agg(to_jsonb(q)),'[]') into records from(select id,classroom_id,title,session_type,delivery_mode,starts_at,ends_at,status from public.academy_lesson_sessions where academy_id=r.academy_id and classroom_id in(select classroom_id from memberships) and ends_at>=clock_timestamp()-interval '7 days' and (cursor_id is null or (coalesce(starts_at,'infinity'::timestamptz),id) > (cursor_key::timestamptz,cursor_id)) order by coalesce(starts_at,'infinity'::timestamptz) asc,id asc limit 101)q;end if;
  cursor_key:=coalesce(records->99->>'starts_at','infinity'::text);
 when 'charges' then
  if not r.can_view_payments then records:='[]';else with memberships as materialized(select m.classroom_id from public.academy_classroom_memberships m where m.academy_id=r.academy_id and m.contact_id=r.contact_id and m.role='student' and m.status in('active','trial','paused','completed')) select coalesce(jsonb_agg(case when r.can_view_debt then to_jsonb(q) else to_jsonb(q)-'outstanding_amount'-'calculated_status'-'days_overdue'-'aging_bucket' end),'[]') into records from(select id,charge_number,charge_type,due_on,currency,effective_amount::text as effective_amount,outstanding_amount::text as outstanding_amount,calculated_status,days_overdue,aging_bucket from public.academy_charge_balances where academy_id=r.academy_id and contact_id=r.contact_id and (cursor_id is null or (coalesce(due_on,'infinity'::date),id) < (cursor_key::date,cursor_id)) order by coalesce(due_on,'infinity'::date) desc,id desc limit 101)q;end if;
  cursor_key:=coalesce(records->99->>'due_on','infinity'::text);
 when 'messages' then
  if not r.can_view_messages then records:='[]';else with memberships as materialized(select m.classroom_id from public.academy_classroom_memberships m where m.academy_id=r.academy_id and m.contact_id=r.contact_id and m.role='student' and m.status in('active','trial','paused','completed')) select coalesce(jsonb_agg(to_jsonb(q)),'[]') into records from(select id,direction,body,status,channel,created_at,delivered_at,read_at from public.academy_guardian_messages where academy_id=r.academy_id and relationship_id=r.id and status in('sent','delivered','read') and (cursor_id is null or (coalesce(created_at,'infinity'::timestamptz),id) < (cursor_key::timestamptz,cursor_id)) order by coalesce(created_at,'infinity'::timestamptz) desc,id desc limit 101)q;end if;
  cursor_key:=coalesce(records->99->>'created_at','infinity'::text);
 when 'announcements' then
  if not r.can_view_announcements then records:='[]';else with memberships as materialized(select m.classroom_id from public.academy_classroom_memberships m where m.academy_id=r.academy_id and m.contact_id=r.contact_id and m.role='student' and m.status in('active','trial','paused','completed')) select coalesce(jsonb_agg(to_jsonb(q)),'[]') into records from(select id,classroom_id,title,body as content,created_at as published_at,created_at from public.academy_announcements where academy_id=r.academy_id and(classroom_id is null or classroom_id in(select classroom_id from memberships)) and created_at<=clock_timestamp() and (cursor_id is null or (coalesce(created_at,'infinity'::timestamptz),id) < (cursor_key::timestamptz,cursor_id)) order by coalesce(created_at,'infinity'::timestamptz) desc,id desc limit 101)q;end if;
  cursor_key:=coalesce(records->99->>'created_at','infinity'::text);
 when 'resources' then
  if not r.can_view_resources then records:='[]';else with memberships as materialized(select m.classroom_id from public.academy_classroom_memberships m where m.academy_id=r.academy_id and m.contact_id=r.contact_id and m.role='student' and m.status in('active','trial','paused','completed')) select coalesce(jsonb_agg(to_jsonb(q)),'[]') into records from(select id,classroom_id,title,kind,description,sort_order,is_published,created_at from public.academy_classroom_resources where academy_id=r.academy_id and classroom_id in(select classroom_id from memberships) and is_published and (cursor_id is null or (coalesce(sort_order,0::integer),id) > (cursor_key::integer,cursor_id)) order by coalesce(sort_order,0::integer) asc,id asc limit 101)q;end if;
  cursor_key:=coalesce(records->99->>'sort_order',0::text);
 when 'progress_reports' then
  if not r.can_view_progress_reports then records:='[]';else with memberships as materialized(select m.classroom_id from public.academy_classroom_memberships m where m.academy_id=r.academy_id and m.contact_id=r.contact_id and m.role='student' and m.status in('active','trial','paused','completed')) select coalesce(jsonb_agg(to_jsonb(q)),'[]') into records from(select id,label,expires_at,last_viewed_at,view_count,is_active,created_at from public.parent_report_tokens where academy_id=r.academy_id and contact_id=r.contact_id and is_active and expires_at>clock_timestamp() and (cursor_id is null or (coalesce(created_at,'infinity'::timestamptz),id) < (cursor_key::timestamptz,cursor_id)) order by coalesce(created_at,'infinity'::timestamptz) desc,id desc limit 101)q;end if;
  cursor_key:=coalesce(records->99->>'created_at','infinity'::text);
 when 'notifications' then
  with memberships as materialized(select m.classroom_id from public.academy_classroom_memberships m where m.academy_id=r.academy_id and m.contact_id=r.contact_id and m.role='student' and m.status in('active','trial','paused','completed')) select coalesce(jsonb_agg(to_jsonb(q)),'[]') into records from(select n.id,n.academy_id,n.guardian_id,n.relationship_id,n.event_key,n.channel,n.type,n.title,n.body,n.status,n.scheduled_at,n.sent_at,n.created_at
   from public.academy_notifications n where n.academy_id=r.academy_id and n.guardian_id=r.guardian_id and n.relationship_id=r.id and(n.contact_id is null or n.contact_id=r.contact_id)
    and n.status='sent' and public.academy_guardian_notification_visible(to_jsonb(r),coalesce(n.event_key,n.type)) and (cursor_id is null or (coalesce(n.created_at,'infinity'::timestamptz),n.id) < (cursor_key::timestamptz,cursor_id)) order by coalesce(n.created_at,'infinity'::timestamptz) desc,n.id desc limit 101)q;
  cursor_key:=coalesce(records->99->>'created_at','infinity'::text);
 when 'requests' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into records from(
   select id,academy_id,contact_id,guardian_id,requester_kind,requester_user_id,request_type,subject,details,priority,status,desired_date,resolution,resolved_at,created_at,updated_at
   from public.academy_service_requests where academy_id=r.academy_id and guardian_id=r.guardian_id and contact_id=r.contact_id and requester_user_id=p_actor_id
    and requester_kind='guardian' and metadata->>'relationship_id'=r.id::text
    and(cursor_id is null or(created_at,id)<(cursor_key::timestamptz,cursor_id)) order by created_at desc,id desc limit 101)q;
  cursor_key:=records->99->>'created_at';
 when 'request_events' then
  select coalesce(jsonb_agg(to_jsonb(q)),'[]') into records from(
   select e.id,e.request_id,e.event_type,e.to_status,e.note,e.created_at from public.academy_service_request_events e
   where e.academy_id=r.academy_id and e.visible_to_requester and exists(
    select 1 from public.academy_service_requests q where q.academy_id=r.academy_id and q.id=e.request_id and q.guardian_id=r.guardian_id
     and q.contact_id=r.contact_id and q.requester_user_id=p_actor_id and q.requester_kind='guardian' and q.metadata->>'relationship_id'=r.id::text)
    and(cursor_id is null or(e.created_at,e.id)<(cursor_key::timestamptz,cursor_id)) order by e.created_at desc,e.id desc limit 101)q;
  cursor_key:=records->99->>'created_at';
 else raise exception using errcode='22023',message='Choose a valid parent history';
 end case;
 more:=jsonb_array_length(records)>100;
 select coalesce(jsonb_agg(value order by ord),'[]') into records from jsonb_array_elements(records) with ordinality a(value,ord) where ord<=100;
 last_row:=records->99;
 perform public.academy_guardian_relationship_for_actor(p_actor_id,p_relationship_id);
 return jsonb_build_object('actor_id',p_actor_id,'relationship_id',r.id,'section',p_section,'records',records,'has_more',more,
  'cursor',case when more then jsonb_build_object('section',p_section,'relationship_id',r.id,'key',cursor_key,'id',last_row->>'id') else null end);
end;$$;
revoke all on function public.academy_guardian_history_read(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_guardian_history_read(uuid,uuid,text,jsonb) to service_role;
commit;
