-- Current classroom identity and private file issuance. No browser/service-table
-- grants are opened and no stored customer references are rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create function public.academy_classroom_access_context(p_academy uuid,p_actor uuid,p_classroom uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='5s' as $$
declare k public.academy_classrooms;authorities jsonb;entries jsonb;contact uuid;member public.academy_classroom_memberships;
 h jsonb;claims jsonb;selected uuid;staff_view boolean;can_resources boolean;can_messages boolean;viewer_role text;links jsonb;
begin
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 if coalesce(claims->>'role',current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception using errcode='42501',message='Private classroom context';end if;
 select * into k from public.academy_classrooms where academy_id=p_academy and id=p_classroom for share;
 if k.id is null then raise exception using errcode='42501',message='Current classroom access is required';end if;
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 if h?'x-schood-classroom-branch' then
  if h->>'x-schood-classroom-actor' is distinct from p_actor::text or h->>'x-schood-classroom-academy' is distinct from p_academy::text then raise exception using errcode='42501',message='Classroom context changed';end if;
  selected:=public.academy_legacy_uuid(h->>'x-schood-classroom-branch');
  if selected is null then raise exception using errcode='22023',message='Choose a permitted branch';end if;
 end if;
 authorities:=public.academy_current_authorities(p_academy,p_actor);
 select coalesce(jsonb_agg(a order by case a->>'role' when 'owner' then 0 when 'admin' then 1 when 'center_admin' then 2 when 'branch_manager' then 3 when 'manager' then 4 when 'counselor' then 5 when 'teacher' then 6 when 'assistant' then 7 else 8 end,a->>'source_id'),'[]') into entries
 from jsonb_array_elements(authorities) a where public.academy_command_covers(jsonb_build_array(a),'viewClassrooms',jsonb_build_object('kind','classroom','classroom_id',k.id,'branch_id',k.branch_id));
 staff_view:=jsonb_array_length(entries)>0 and(selected is null or selected=k.branch_id);
 can_resources:=staff_view and public.academy_command_covers(authorities,'manageResources',jsonb_build_object('kind','classroom','classroom_id',k.id,'branch_id',k.branch_id));
 can_messages:=staff_view and public.academy_command_covers(authorities,'manageMessages',jsonb_build_object('kind','classroom','classroom_id',k.id,'branch_id',k.branch_id));
 if staff_view then viewer_role:=entries->0->>'role';
 else
  links:=public.academy_student_contacts_command(p_actor);
  select m.* into member from public.academy_classroom_memberships m join public.academy_contacts c on c.academy_id=m.academy_id and c.id=m.contact_id
   where m.academy_id=p_academy and m.classroom_id=p_classroom and m.role in('student','observer') and m.status in('active','trial','completed')
    and(m.expires_at is null or m.expires_at>clock_timestamp()) and c.user_id=p_actor and c.status in('active','trial','paused') order by m.id limit 1 for share of m,c;
  if member.id is null then raise exception using errcode='42501',message='Current classroom access is required';end if;
  contact:=member.contact_id;viewer_role:=member.role;can_messages:=true;
 end if;
 return jsonb_build_object('actor_id',p_actor,'academy_id',p_academy,'classroom_id',p_classroom,'branch_id',k.branch_id,'classroom_active',k.is_active,
  'viewer_type',case when staff_view then 'teacher' else 'student' end,'role',viewer_role,'contact_id',contact,'can_manage_resources',can_resources,'can_send_messages',can_messages,
  'authorities',authorities,'entries',entries,'membership',case when member.id is null then null else jsonb_build_object('id',member.id,'status',member.status,'expires_at',member.expires_at) end);
end;$$;
revoke all on function public.academy_classroom_access_context(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.academy_classroom_access_context(uuid,uuid,uuid) to service_role;

create function public.academy_files_access_context(p_actor uuid,p_records jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='5s' set statement_timeout='20s' as $$
declare claims jsonb;item jsonb;row_data jsonb;record_id uuid;academy uuid;classroom uuid;contact uuid;authorities jsonb;scope jsonb;kind text;storage jsonb;
 allowed boolean;student_ok boolean;result jsonb:='[]';snapshots jsonb:='{}';links jsonb;current_context jsonb;record_key text;h jsonb;selected uuid;member public.academy_classroom_memberships;earliest_expiry timestamptz;
begin
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 if coalesce(claims->>'role',current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception using errcode='42501',message='Private file context';end if;
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)>200 or jsonb_array_length(p_records)<1 then raise exception using errcode='22023',message='Review the file request';end if;
 links:=public.academy_student_contacts_command(p_actor);
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 if h?'x-schood-classroom-branch' then selected:=public.academy_legacy_uuid(h->>'x-schood-classroom-branch');if selected is null or h->>'x-schood-classroom-actor' is distinct from p_actor::text then raise exception using errcode='42501',message='Current branch access is required';end if;end if;
 for item in select value from jsonb_array_elements(p_records) loop
  record_id:=public.academy_legacy_uuid(item->>'record_id');kind:=item->>'record_kind';record_key:=item->>'record_key';row_data:=null;
  if record_id is null or length(coalesce(record_key,''))>100 then raise exception using errcode='22023',message='Review the file record';end if;
  if kind='resource' then select to_jsonb(r) into row_data from public.academy_classroom_resources r where r.id=record_id for share;
  elsif kind='submission' then select to_jsonb(r) into row_data from public.academy_submissions r where r.id=record_id for share;
  elsif kind='assignment' then select to_jsonb(r) into row_data from public.academy_assignments r where r.id=record_id for share;
  else raise exception using errcode='22023',message='Review the file type';end if;
  if row_data is null then raise exception using errcode='42501',message='Current file access is required';end if;
  academy:=(row_data->>'academy_id')::uuid;classroom:=(row_data->>'classroom_id')::uuid;contact:=public.academy_legacy_uuid(row_data->>'contact_id');
  if snapshots ? (academy::text) then authorities:=snapshots->(academy::text);else authorities:=public.academy_current_authorities(academy,p_actor);snapshots:=snapshots||jsonb_build_object(academy::text,authorities);end if;
  if kind='submission' then
   scope:=public.academy_legacy_contact_scope(academy,contact,classroom);
   allowed:=scope is not null and public.academy_command_covers(authorities,'gradeSubmissions',scope);
  else
   select jsonb_build_object('kind','classroom','classroom_id',c.id,'branch_id',c.branch_id) into scope from public.academy_classrooms c where c.academy_id=academy and c.id=classroom for share;
   allowed:=scope is not null and (public.academy_command_covers(authorities,'manageAssignments',scope) or public.academy_command_covers(authorities,'viewClassrooms',scope));
   if not allowed and kind='assignment' then
    allowed:=exists(select 1 from public.academy_classroom_memberships m where m.academy_id=academy and m.classroom_id=classroom and m.status in('active','trial','paused','completed')
     and public.academy_command_covers(authorities,'gradeSubmissions',public.academy_legacy_contact_scope(academy,m.contact_id,classroom)));
   end if;
  end if;
  if selected is not null and not exists(select 1 from public.academy_classrooms c where c.id=classroom and c.academy_id=academy and c.branch_id=selected) then allowed:=false;end if;
  if not allowed then
   member:=null;
   select m.* into member from public.academy_classroom_memberships m join public.academy_contacts c on c.academy_id=m.academy_id and c.id=m.contact_id
    where m.academy_id=academy and m.classroom_id=classroom and m.role in('student','observer') and m.status in('active','trial','completed')
     and(m.expires_at is null or m.expires_at>clock_timestamp()) and c.user_id=p_actor and c.status in('active','trial','paused')
     and(kind<>'submission' or c.id=contact) order by m.id limit 1 for share of m,c;
   student_ok:=member.id is not null;
   earliest_expiry:=least(earliest_expiry,member.expires_at);
   allowed:=student_ok and(case when kind='resource' then coalesce((row_data->>'is_published')::boolean,false) when kind='assignment' then row_data->>'status'='active' else true end);
  end if;
  if not allowed then raise exception using errcode='42501',message='Current file access is required';end if;
  storage:=row_data#>'{metadata,storage}';
  if storage is distinct from item->'expected_storage' then raise exception using errcode='23505',message='The file changed; refresh its current record';end if;
  result:=result||jsonb_build_array(jsonb_build_object('record_key',record_key,'record_id',record_id,'record_kind',kind,'academy_id',academy,'classroom_id',classroom,'storage',storage));
 end loop;
 for academy,authorities in select key::uuid,value from jsonb_each(snapshots) loop
  if public.academy_current_authorities(academy,p_actor) is distinct from authorities then raise exception using errcode='42501',message='Current file access changed';end if;
 end loop;
 if earliest_expiry is not null and earliest_expiry<=clock_timestamp() then raise exception using errcode='42501',message='Current file enrollment expired';end if;
 return jsonb_build_object('actor_id',p_actor,'records',result);
end;$$;
revoke all on function public.academy_files_access_context(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.academy_files_access_context(uuid,jsonb) to service_role;

create function public.academy_classroom_write_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='5s' as $$
declare h jsonb;ctx jsonb;academy uuid;actor uuid;classroom uuid;resource public.academy_classroom_resources;member public.academy_classroom_memberships;conversation public.academy_conversations;row_data jsonb;
begin
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 if not(h?'x-schood-classroom-action') then return case when tg_op='DELETE' then old else new end;end if;
 academy:=public.academy_legacy_uuid(h->>'x-schood-classroom-academy');actor:=public.academy_legacy_uuid(h->>'x-schood-classroom-actor');classroom:=public.academy_legacy_uuid(h->>'x-schood-classroom-id');
 if academy is null or actor is null or classroom is null then raise exception using errcode='42501',message='Current classroom identity is required';end if;
 ctx:=public.academy_classroom_access_context(academy,actor,classroom);row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if (row_data->>'academy_id')::uuid<>academy then raise exception using errcode='42501',message='Foreign classroom target';end if;
 if tg_table_name='academy_classroom_resource_progress' then
  select * into resource from public.academy_classroom_resources where academy_id=academy and id=(row_data->>'resource_id')::uuid for share;
  if resource.id is null or resource.classroom_id<>classroom then raise exception using errcode='42501',message='Foreign classroom resource';end if;
  if not(ctx->>'can_manage_resources')::boolean and(ctx->>'viewer_type'<>'student' or row_data->>'contact_id' is distinct from ctx->>'contact_id' or not resource.is_published) then raise exception using errcode='42501',message='Current progress access is required';end if;
 elsif tg_table_name='academy_messages' then
  if h->>'x-schood-classroom-action'<>'classroom-chat-send' or not(ctx->>'can_send_messages')::boolean
   or row_data#>>'{metadata,classroom_id}' is distinct from classroom::text or row_data#>>'{metadata,sender_user_id}' is distinct from actor::text
   or row_data->>'sender_type' is distinct from ctx->>'viewer_type' and not(row_data->>'sender_type'='teacher' and ctx->>'viewer_type'='teacher') then raise exception using errcode='42501',message='Current classroom message access is required';end if;
  select * into conversation from public.academy_conversations where academy_id=academy and id=(row_data->>'conversation_id')::uuid for share;
  if conversation.id is null or conversation.contact_id is distinct from (row_data->>'contact_id')::uuid then raise exception using errcode='42501',message='Foreign classroom conversation';end if;
 else raise exception using errcode='42501',message='Unsupported classroom write';end if;
 select m.* into member from public.academy_classroom_memberships m join public.academy_contacts c on c.academy_id=m.academy_id and c.id=m.contact_id
  where m.academy_id=academy and m.classroom_id=classroom and m.contact_id=(row_data->>'contact_id')::uuid and m.role in('student','observer')
   and m.status in('active','trial','completed') and(m.expires_at is null or m.expires_at>clock_timestamp()) and c.status in('active','trial','paused') for share of m,c;
 if member.id is null then raise exception using errcode='42501',message='A current classroom recipient is required';end if;
 if tg_op='UPDATE' and(to_jsonb(old)->>'contact_id' is distinct from row_data->>'contact_id' or to_jsonb(old)->>'resource_id' is distinct from row_data->>'resource_id') then raise exception using errcode='42501',message='A stored classroom binding cannot change';end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function public.academy_classroom_write_guard() from public,anon,authenticated,service_role;
create trigger academy_classroom_current_before before insert or update or delete on public.academy_classroom_resource_progress for each row execute function public.academy_classroom_write_guard();
create trigger zz_academy_classroom_current_after after insert or update or delete on public.academy_classroom_resource_progress for each row execute function public.academy_classroom_write_guard();
create trigger academy_classroom_current_before before insert on public.academy_messages for each row execute function public.academy_classroom_write_guard();
create trigger zz_academy_classroom_current_after after insert on public.academy_messages for each row execute function public.academy_classroom_write_guard();
notify pgrst,'reload schema';
commit;
