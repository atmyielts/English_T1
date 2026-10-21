begin;
create function public.academy_telegram_attendance_command(p_academy uuid,p_actor uuid,p_session uuid,p_classroom uuid,p_records jsonb,p_request_key text)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='35s' as $$
declare scope jsonb;intent jsonb;previous public.academy_operational_command_receipts;result jsonb;session public.academy_lesson_sessions;auths jsonb;record jsonb;
begin
 if coalesce(p_request_key,'')!~'^[A-Za-z0-9_.:-]{1,160}$' or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records) not between 1 and 500 then raise exception using errcode='22023',message='Review attendance and its retry key';end if;
 auths:=public.academy_current_authorities(p_academy,p_actor);
 perform pg_advisory_xact_lock(hashtextextended('operational-command:'||p_academy::text||':'||p_actor::text||':'||p_request_key,0));
 select * into session from public.academy_lesson_sessions where academy_id=p_academy and id=p_session and classroom_id=p_classroom for update;
 if session.id is null then raise exception using errcode='42501',message='Current access does not cover this lesson';end if;
 scope:=public.academy_command_resource(p_academy,'classroom',p_classroom);
 perform public.academy_assert_current_capability(p_academy,p_actor,'markAttendance',scope);
 -- Administrative attendance remains available in its actual scope. A teaching
 -- grant alone must also belong to the lesson's current assigned staff profile.
 if not public.academy_command_covers(auths,'manageAcademicOperations',scope) and not public.academy_command_covers(auths,'manageContacts',scope) then perform public.academy_teacher_session_context(p_academy,p_actor,p_session);end if;
 if (select count(*)<>count(distinct value->>'contact_id') from jsonb_array_elements(p_records)) then raise exception using errcode='22023',message='Choose each attendance student once';end if;
 for record in select value from jsonb_array_elements(p_records) loop
  perform m.id from public.academy_classroom_memberships m join public.academy_contacts c on c.academy_id=m.academy_id and c.id=m.contact_id
  where m.academy_id=p_academy and m.classroom_id=p_classroom and m.contact_id=(record->>'contact_id')::uuid and m.role='student' and m.status in('active','trial') and c.status='active' for share of m,c;
  if not found then raise exception using errcode='42501',message='Attendance student is outside the active classroom roster';end if;
 end loop;
 intent:=jsonb_build_object('session_id',p_session,'classroom_id',p_classroom,'records',p_records);
 select * into previous from public.academy_operational_command_receipts where academy_id=p_academy and request_key=p_request_key;
 if found then
  if previous.actor_id<>p_actor or previous.command<>'record_attendance' or previous.payload is distinct from intent then raise exception using errcode='23505',message='Attendance retry belongs to another change';end if;
  perform public.academy_assert_current_capability(p_academy,p_actor,'markAttendance',scope);
  return previous.result||'{"replayed":true}';
 end if;
 -- Older audit-only keys did not bind the original attendance payload. Keep
 -- their saved rows, but require review instead of adopting an unbound receipt.
 if exists(select 1 from public.academy_audit_events where academy_id=p_academy and idempotency_key='telegram.attendance:'||trim(p_request_key)) then raise exception using errcode='23505',message='Review the attendance already saved by this older request';end if;
 result:=public.academy_record_telegram_attendance_batch(p_academy,p_session,p_classroom,p_actor,p_records,p_request_key);
 result:=result||jsonb_build_object('actor_id',p_actor,'request_key',p_request_key,'command','record_attendance','replayed',false);
 insert into public.academy_operational_command_receipts(academy_id,actor_id,request_key,command,payload,protected_scopes,result) values(p_academy,p_actor,p_request_key,'record_attendance',intent,jsonb_build_array(scope),result);
 perform public.academy_assert_current_capability(p_academy,p_actor,'markAttendance',scope);
 return result;
end;$$;
revoke all on function public.academy_telegram_attendance_command(uuid,uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.academy_telegram_attendance_command(uuid,uuid,uuid,uuid,jsonb,text) to service_role;
commit;
