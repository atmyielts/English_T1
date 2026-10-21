begin;
create function public.academy_booking_command(p_academy uuid,p_actor uuid,p_payload jsonb,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='30s' as $$
declare scope jsonb;previous public.academy_operational_command_receipts;teacher public.academy_staff;room public.academy_rooms;calendar public.academy_academic_calendars;session jsonb;result jsonb;branch uuid;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or coalesce(p_request_key,'')!~'^[A-Za-z0-9_.:-]{1,160}$' then raise exception using errcode='22023',message='Review the lesson and retry key';end if;
 perform public.academy_current_authorities(p_academy,p_actor);
 perform pg_advisory_xact_lock(hashtextextended('operational-command:'||p_academy::text||':'||p_actor::text||':'||p_request_key,0));
 scope:=public.academy_command_resource(p_academy,'classroom',(p_payload->>'classroom_id')::uuid);
 perform public.academy_assert_current_capability(p_academy,p_actor,'manageAcademicOperations',scope);
 branch:=nullif(scope->>'branch_id','')::uuid;
 if branch is null or branch is distinct from nullif(p_payload->>'branch_id','')::uuid then raise exception using errcode='22023',message='Use the classroom branch for this lesson';end if;
 select * into previous from public.academy_operational_command_receipts where academy_id=p_academy and request_key=p_request_key;
 if found then
  if previous.actor_id<>p_actor or previous.command<>'create_lesson_session' or previous.payload is distinct from p_payload then raise exception using errcode='23505',message='This booking retry belongs to another change';end if;
  perform public.academy_assert_current_capability(p_academy,p_actor,'manageAcademicOperations',scope);
  return previous.result||'{"replayed":true}';
 end if;
 select * into teacher from public.academy_staff where academy_id=p_academy and id=(p_payload->>'primary_staff_id')::uuid for share;
 if teacher.id is null or not teacher.is_active then raise exception using errcode='22023',message='Choose an active teacher';end if;
 if not coalesce(teacher.classroom_ids,'[]')@>jsonb_build_array((p_payload->>'classroom_id')::uuid)
  and not public.academy_command_covers(public.academy_current_authorities(p_academy,p_actor),'manageAcademicOperations',jsonb_build_object('kind','academy')) then
  perform s.id from public.academy_staff_branch_assignments s where s.academy_id=p_academy and s.staff_id=teacher.id and s.branch_id=branch and s.status='active' and s.starts_on<=current_date and(s.ends_on is null or s.ends_on>=current_date) for share;
  if not found then raise exception using errcode='42501',message='Teacher is outside the current booking scope';end if;
 end if;
 if nullif(p_payload->>'room_id','') is not null then
  select * into room from public.academy_rooms where academy_id=p_academy and id=(p_payload->>'room_id')::uuid for share;
  if room.id is null or not room.is_active or room.branch_id is distinct from branch then raise exception using errcode='22023',message='Choose an active room in this branch';end if;
 end if;
 if nullif(p_payload->>'calendar_id','') is not null then
  select * into calendar from public.academy_academic_calendars where academy_id=p_academy and id=(p_payload->>'calendar_id')::uuid for share;
  if calendar.id is null or(calendar.branch_id is not null and calendar.branch_id<>branch) then raise exception using errcode='22023',message='Choose a calendar in this branch';end if;
 end if;
 session:=public.academy_create_lesson_session(p_academy,p_actor,p_payload,p_request_key);
 result:=jsonb_build_object('actor_id',p_actor,'request_key',p_request_key,'command','create_lesson_session','replayed',false,'session',session);
 insert into public.academy_operational_command_receipts(academy_id,actor_id,request_key,command,payload,protected_scopes,result) values(p_academy,p_actor,p_request_key,'create_lesson_session',p_payload,jsonb_build_array(scope),result);
 perform public.academy_assert_current_capability(p_academy,p_actor,'manageAcademicOperations',scope);
 return result;
end;$$;
revoke all on function public.academy_booking_command(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_booking_command(uuid,uuid,jsonb,text) to service_role;
commit;
