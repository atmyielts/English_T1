-- Relationships are durable consent identities, not editable pointers to a
-- different student/parent. Existing account bindings cannot be reassigned by
-- the older invitation handler. Account erasure may still clear a user FK.
begin;
set local lock_timeout='5s';

create or replace function public.academy_guardian_preserve_binding_identity()
returns trigger language plpgsql set search_path=public as $$
begin
 if tg_table_name='academy_guardians' then
  if new.id is distinct from old.id or new.academy_id is distinct from old.academy_id
   or(old.user_id is not null and new.user_id is not null and new.user_id<>old.user_id) then
   raise exception using errcode='42501',message='This parent record is already linked. Create a new reviewed relationship to change access';
  end if;
 else
  if new.id is distinct from old.id or new.academy_id is distinct from old.academy_id
   or new.contact_id is distinct from old.contact_id or new.guardian_id is distinct from old.guardian_id then
   raise exception using errcode='42501',message='This family relationship cannot be moved to another student or parent';
  end if;
 end if;
 return new;
end;$$;
revoke all on function public.academy_guardian_preserve_binding_identity() from public,anon,authenticated,service_role;
drop trigger if exists academy_guardian_preserve_binding_identity on public.academy_guardians;
create trigger academy_guardian_preserve_binding_identity before update on public.academy_guardians
 for each row execute function public.academy_guardian_preserve_binding_identity();
drop trigger if exists academy_guardian_relationship_preserve_identity on public.academy_student_guardian_relationships;
create trigger academy_guardian_relationship_preserve_identity before update on public.academy_student_guardian_relationships
 for each row execute function public.academy_guardian_preserve_binding_identity();
commit;
