begin;
-- Read authority remains attached to each grant/capability, never display rank.
create function public.academy_operational_read(p_academy uuid,p_actor uuid,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='30s' as $$
declare auths jsonb;final_auths jsonb;stamp text;result jsonb;branch uuid;classroom uuid;scope jsonb;full_class boolean;contacts uuid[];branches uuid[];
 assignments jsonb;submissions jsonb;members jsonb;categories jsonb;more jsonb:='{}';
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or p_action not in('room_timetable_branches','room_timetable','gradebook','gradebook_recheck') then raise exception using errcode='22023',message='Choose a valid operational workspace';end if;
 auths:=public.academy_current_authorities(p_academy,p_actor);
 stamp:=encode(extensions.digest(convert_to(auths::text,'UTF8'),'sha256'),'hex');
 if p_action in('room_timetable_branches','room_timetable') then
  if not exists(select 1 from jsonb_array_elements(auths) a where public.academy_command_role_has(a->>'role','viewRoomTimetable')) then raise exception using errcode='42501',message='Current access does not cover the room timetable';end if;
  if p_action='room_timetable_branches' then
   select coalesce(array_agg(b.id),'{}') into branches from public.academy_branches b where b.academy_id=p_academy and b.is_active
    and public.academy_command_covers(auths,'viewRoomTimetable',jsonb_build_object('kind','branch','branch_id',b.id));
   result:=public.academy_room_timetable_branches(p_academy,branches);
  else
   if coalesce(p_payload->>'from','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception using errcode='22023',message='Choose a complete timetable date';end if;
   branch:=(p_payload->>'branch_id')::uuid;
   scope:=public.academy_command_resource(p_academy,'branch',branch);
   perform public.academy_assert_current_capability(p_academy,p_actor,'viewRoomTimetable',scope);
   result:=public.academy_room_timetable_snapshot(p_academy,branch,(p_payload->>'from')::date,coalesce((p_payload->>'days')::integer,7));
   perform public.academy_assert_current_capability(p_academy,p_actor,'viewRoomTimetable',scope);
  end if;
 else
  classroom:=(p_payload->>'classroom_id')::uuid;
  scope:=public.academy_command_resource(p_academy,'classroom',classroom);
  full_class:=public.academy_command_covers(auths,'gradeSubmissions',scope);
  -- A student grant can reveal only that student's row. An unrelated branch
  -- grant cannot enter via the student's primary or second branch.
  select coalesce(array_agg(m.contact_id),'{}') into contacts from public.academy_classroom_memberships m
   join public.academy_contacts c on c.academy_id=m.academy_id and c.id=m.contact_id
   where m.academy_id=p_academy and m.classroom_id=classroom and m.role in('student','observer') and m.status in('active','completed')
   and(full_class or exists(select 1 from jsonb_array_elements(auths) a where a->>'scope_type'='students'
    and public.academy_command_role_has(a->>'role','gradeSubmissions') and a->'scope_ids' @> jsonb_build_array(m.contact_id)));
  if not full_class and cardinality(contacts)=0 then raise exception using errcode='42501',message='Current grading access does not cover this classroom';end if;
  if p_action='gradebook_recheck' then
   if p_payload->>'authority_hash' is distinct from stamp then raise exception using errcode='42501',message='Grading access changed while loading';end if;
   result:=jsonb_build_object('valid',true);
  else
   select coalesce(jsonb_agg(to_jsonb(t) order by t.position,t.id),'[]') into assignments from(
    select id,title,assignment_type,due_at,max_score,score_weight,grade_category_id,rubric_id,attempts_allowed,allow_late_submission,position,status
    from public.academy_assignments where academy_id=p_academy and classroom_id=classroom and status<>'archived' order by position,id limit 201) t;
   more:=more||jsonb_build_object('assignments',jsonb_array_length(assignments)>200);if jsonb_array_length(assignments)>200 then assignments:=assignments-200;end if;
   select coalesce(jsonb_agg(to_jsonb(t) order by t.contact_id),'[]') into members from(
    select m.contact_id,m.role,jsonb_build_object('id',c.id,'first_name',c.first_name,'last_name',c.last_name,'email',c.email,'status',c.status) academy_contacts
    from public.academy_classroom_memberships m join public.academy_contacts c on c.academy_id=m.academy_id and c.id=m.contact_id
    where m.academy_id=p_academy and m.classroom_id=classroom and m.contact_id=any(contacts) order by m.contact_id limit 501) t;
   more:=more||jsonb_build_object('members',jsonb_array_length(members)>500);if jsonb_array_length(members)>500 then members:=members-500;end if;
   select coalesce(array_agg((v->>'contact_id')::uuid),'{}') into contacts from jsonb_array_elements(members) v;
   select coalesce(jsonb_agg(to_jsonb(t) order by t.submitted_at desc nulls last,t.id),'[]') into submissions from(
    select id,assignment_id,contact_id,score,max_score,status,attempt_number,submitted_at,graded_at,notes,feedback,submission_content,submission_url,metadata
    from public.academy_submissions where academy_id=p_academy and classroom_id=classroom and contact_id=any(contacts)
    and assignment_id in(select (v->>'id')::uuid from jsonb_array_elements(assignments) v) order by submitted_at desc nulls last,id limit 5001) t;
   more:=more||jsonb_build_object('submissions',jsonb_array_length(submissions)>5000);if jsonb_array_length(submissions)>5000 then submissions:=submissions-5000;end if;
   select coalesce(jsonb_agg(to_jsonb(t) order by t.position,t.id),'[]') into categories from(
    select id,name,weight,position,drop_lowest from public.academy_grade_categories where academy_id=p_academy and classroom_id=classroom order by position,id limit 101) t;
   more:=more||jsonb_build_object('categories',jsonb_array_length(categories)>100);if jsonb_array_length(categories)>100 then categories:=categories-100;end if;
   result:=jsonb_build_object('assignments',assignments,'submissions',submissions,'members',members,'categories',categories,'has_more',more);
  end if;
 end if;
 final_auths:=public.academy_current_authorities(p_academy,p_actor);
 if auths is distinct from final_auths then raise exception using errcode='42501',message='Operational access changed while loading';end if;
 return result||jsonb_build_object('schema_version',1,'actor_id',p_actor,'authority_hash',stamp);
end;$$;
revoke all on function public.academy_operational_read(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.academy_operational_read(uuid,uuid,text,jsonb) to service_role;
commit;
