-- Same RPC signature and existing session/audit/delivery semantics.
-- No table rewrite: legacy retries remain scoped to their recorded Academy/session.
create or replace function public.academy_transition_lesson_session(
  p_academy_id uuid, p_session_id uuid, p_actor_id uuid,
  p_next_status text, p_payload jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v public.academy_lesson_sessions%rowtype;
  v_next text := lower(trim(p_next_status));
  v_key text := nullif(trim(p_idempotency_key),'');
  v_new jsonb;
  v_minutes int;
  v_students int;
  v_event_key text;
  v_request jsonb;
  v_replay public.domain_event_outbox%rowtype;
begin
  if v_key is null then raise exception 'A session transition key is required'; end if;
  if v_next is null or v_next not in('rescheduled','confirmed','in_progress','cancelled','missed','completed') then
    raise exception 'Invalid session transition';
  end if;
  v_event_key := 'session.transition:'||p_academy_id::text||':'||p_session_id::text||':'||v_key;
  select * into v from public.academy_lesson_sessions
    where academy_id=p_academy_id and id=p_session_id for update;
  if not found then raise exception 'Session not found'; end if;

  -- Compare normalized command inputs. A key cannot silently acknowledge a
  -- different actor, destination, room, teacher, or cancellation reason.
  v_request := jsonb_build_object(
    'actor_id',p_actor_id,
    'reason',case when v_next='cancelled' then nullif(trim(p_payload->>'reason'),'') end,
    'starts_at',case when v_next='rescheduled' then to_char((p_payload->>'starts_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
    'ends_at',case when v_next='rescheduled' then to_char((p_payload->>'ends_at')::timestamptz at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end,
    'room_id',case when v_next='rescheduled' then coalesce(nullif(p_payload->>'room_id','')::uuid,v.room_id) end,
    'primary_staff_id',case when v_next='rescheduled' then coalesce(nullif(p_payload->>'primary_staff_id','')::uuid,v.primary_staff_id) end
  );
  select * into v_replay from public.domain_event_outbox
    where idempotency_key in(v_event_key,'session.transition:'||p_idempotency_key)
      and aggregate_id=p_session_id and payload->>'academy_id'=p_academy_id::text
    order by (idempotency_key=v_event_key) desc limit 1;
  if found then
    if v_replay.event_type<>'session.'||v_next then
      raise exception 'Transition key already used for a different action';
    end if;
    -- Old events did not record command inputs; retain their existing retries.
    if v_replay.payload ? 'request' and v_replay.payload->'request'<>v_request then
      raise exception 'Transition key already used for different inputs';
    end if;
    return jsonb_build_object('session',to_jsonb(v),'replacement',
      (select to_jsonb(s) from public.academy_lesson_sessions s
       where s.academy_id=p_academy_id and s.id=v.rescheduled_to_session_id));
  end if;

  if v_next='rescheduled' and v.status in('scheduled','confirmed') then
    -- Release the original slots before inserting its replacement. A conflicting
    -- replacement raises and rolls this update back in the same transaction.
    update public.academy_lesson_sessions set status='rescheduled',
      updated_by=p_actor_id,updated_at=now() where academy_id=p_academy_id and id=v.id;
    v_new := public.academy_create_lesson_session(p_academy_id,p_actor_id,
      jsonb_build_object('branch_id',v.branch_id,'classroom_id',v.classroom_id,
        'room_id',v_request->'room_id','primary_staff_id',v_request->'primary_staff_id',
        'calendar_id',v.calendar_id,'title',v.title,'session_type',v.session_type,
        'delivery_mode',v.delivery_mode,'starts_at',v_request->'starts_at',
        'ends_at',v_request->'ends_at','timezone',v.timezone,'source_session_id',v.id),
      v_event_key||':replacement');
    -- Creation has its own legacy retry behavior. Never link an unrelated
    -- pre-existing row if a separately supplied creation key collides.
    if (v_new->>'source_session_id')::uuid is distinct from v.id
      or (v_new->>'classroom_id')::uuid is distinct from v.classroom_id
      or (v_new->>'branch_id')::uuid is distinct from v.branch_id
      or (v_new->>'created_by')::uuid is distinct from p_actor_id
      or (v_new->>'starts_at')::timestamptz is distinct from (v_request->>'starts_at')::timestamptz
      or (v_new->>'ends_at')::timestamptz is distinct from (v_request->>'ends_at')::timestamptz
      or (v_new->>'room_id')::uuid is distinct from (v_request->>'room_id')::uuid
      or (v_new->>'primary_staff_id')::uuid is distinct from (v_request->>'primary_staff_id')::uuid
      or v_new->>'status' is distinct from 'scheduled' then
      raise exception 'Replacement session key already used for different inputs';
    end if;
    update public.academy_lesson_sessions set rescheduled_to_session_id=(v_new->>'id')::uuid,
      updated_by=p_actor_id,updated_at=now() where academy_id=p_academy_id and id=v.id
      returning * into v;
  elsif (v.status in('scheduled','confirmed') and v_next in('confirmed','in_progress','cancelled','missed'))
    or (v.status='in_progress' and v_next in('completed','cancelled')) then
    if v_next='cancelled' and v_request->>'reason' is null then
      raise exception 'Cancellation reason is required';
    end if;
    update public.academy_lesson_sessions set status=v_next,
      cancellation_reason=case when v_next='cancelled' then v_request->>'reason' else cancellation_reason end,
      updated_by=p_actor_id,updated_at=now() where academy_id=p_academy_id and id=v.id
      returning * into v;
  else raise exception 'Invalid session transition'; end if;

  if v_next='completed' then
    v_minutes := greatest(round(extract(epoch from(v.ends_at-v.starts_at))/60),1);
    select count(*) into v_students from public.academy_attendance
      where academy_id=p_academy_id and session_id=v.id and status in('present','late');
    insert into public.academy_lesson_deliveries(
      academy_id,branch_id,classroom_id,staff_id,delivered_on,started_at,ended_at,
      duration_minutes,delivery_status,student_count,verified_by,idempotency_key,metadata
    ) values(p_academy_id,v.branch_id,v.classroom_id,v.primary_staff_id,
      (v.starts_at at time zone v.timezone)::date,v.starts_at,v.ends_at,v_minutes,
      'delivered',v_students,p_actor_id,'session:'||v.id::text,jsonb_build_object('session_id',v.id))
    on conflict(academy_id,idempotency_key) do nothing;
  end if;
  insert into public.academy_audit_events(
    academy_id,actor_user_id,action,target_type,target_id,classroom_id,metadata
  ) values(p_academy_id,p_actor_id,'session.'||v_next,'academy_lesson_session',v.id::text,
    v.classroom_id,jsonb_build_object('reason',p_payload->>'reason','replacement_session_id',v_new->>'id'));
  insert into public.domain_event_outbox(
    event_type,event_version,aggregate_type,aggregate_id,user_id,payload,idempotency_key
  ) values('session.'||v_next,'v1','academy_lesson_session',v.id,p_actor_id,
    jsonb_build_object('academy_id',p_academy_id,'session_id',v.id,'status',v_next,
      'replacement',v_new,'request',v_request),v_event_key);
  return jsonb_build_object('session',to_jsonb(v),'replacement',v_new);
end;
$$;

revoke all on function public.academy_transition_lesson_session(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_transition_lesson_session(uuid,uuid,uuid,text,jsonb,text) to service_role;
