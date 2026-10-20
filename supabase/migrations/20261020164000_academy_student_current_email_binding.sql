-- Only current, confirmed Auth email may link historical unbound contacts.
-- Auth/account locks serialize email changes and account closure with linking.
begin;
create or replace function public.academy_student_contacts_command(p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path=public set lock_timeout='5s' set statement_timeout='15s' as $$
declare email_value text;verified boolean;contact public.academy_contacts;result jsonb;
begin
 select lower(trim(email)),email_confirmed_at is not null into email_value,verified from auth.users
  where id=p_actor_id and deleted_at is null and(banned_until is null or banned_until<=clock_timestamp()) for share;
 if not found then raise exception using errcode='42501',message='An active account is required';end if;
 perform 1 from public.users where id=p_actor_id and is_active for share;
 if not found then raise exception using errcode='42501',message='An active account is required';end if;
 if verified and nullif(email_value,'') is not null then
  for contact in select * from public.academy_contacts where user_id is null and lower(trim(email))=email_value
    and status in('active','trial','paused') order by academy_id,id for update loop
   -- Ambiguous historical identity within one institution requires a reviewed
   -- invitation; never pick a row by email ordering or an ILIKE wildcard.
   if(select count(*) from public.academy_contacts c where c.academy_id=contact.academy_id and lower(trim(c.email))=email_value
      and c.status in('active','trial','paused'))<>1 then continue;end if;
   update public.academy_contacts set user_id=p_actor_id where id=contact.id and user_id is null and lower(trim(email))=email_value;
   if found then
    insert into public.academy_audit_events(academy_id,actor_user_id,action,target_type,target_id,contact_id,metadata)
     values(contact.academy_id,p_actor_id,'student.verified_email_linked','academy_contact',contact.id::text,contact.id,'{"binding_source":"current_confirmed_auth_email"}');
   end if;
  end loop;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'academy_id',c.academy_id,'user_id',c.user_id,'primary_branch_id',c.primary_branch_id,
  'first_name',c.first_name,'last_name',c.last_name,'email',c.email,'phone',c.phone,'telegram_id',c.telegram_id,'status',c.status,'metadata',c.metadata,'created_at',c.created_at,'updated_at',c.updated_at) order by c.academy_id,c.id),'[]')
  into result from public.academy_contacts c where c.user_id=p_actor_id and c.status in('active','trial','paused');
 return jsonb_build_object('actor_id',p_actor_id,'contacts',result);
end;$$;
revoke all on function public.academy_student_contacts_command(uuid) from public,anon,authenticated;
grant execute on function public.academy_student_contacts_command(uuid) to service_role;
commit;
