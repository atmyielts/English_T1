begin;
set local lock_timeout='5s';
create table public.academy_written_submission_receipts(
 academy_id uuid not null references public.tenants(id),actor_id uuid not null references auth.users(id),assignment_id uuid not null references public.academy_assignments(id),
 request_key text not null check(length(request_key) between 8 and 160),contact_id uuid not null references public.academy_contacts(id),intent jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),
 primary key(academy_id,actor_id,assignment_id,request_key)
);
alter table public.academy_written_submission_receipts enable row level security;
revoke all on public.academy_written_submission_receipts from public,anon,authenticated,service_role;
create function public.academy_written_submission_command(p_academy uuid,p_actor uuid,p_assignment uuid,p_key text,p_intent jsonb,p_payload jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set lock_timeout='5s' set statement_timeout='30s' as $$
declare claims jsonb;ctx jsonb;assignment public.academy_assignments;member public.academy_classroom_memberships;receipt public.academy_written_submission_receipts;result jsonb;contact uuid;
begin
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
 if coalesce(claims->>'role',current_setting('request.jwt.claim.role',true),'')<>'service_role' then raise exception using errcode='42501',message='Private submission command';end if;
 if length(coalesce(p_key,'')) not between 8 and 160 or jsonb_typeof(p_intent) is distinct from 'object' or octet_length(p_intent::text)>20000 then raise exception using errcode='22023',message='Review the saved response';end if;
 ctx:=public.academy_audio_context(p_academy,p_actor,p_assignment,'submission',null,false);contact:=(ctx->>'contact_id')::uuid;
 select * into assignment from public.academy_assignments where academy_id=p_academy and id=p_assignment for share;
 select m.* into member from public.academy_classroom_memberships m join public.academy_contacts c on c.academy_id=m.academy_id and c.id=m.contact_id
 where m.academy_id=p_academy and m.classroom_id=assignment.classroom_id and m.contact_id=contact and m.role='student' and m.status in('active','trial','completed')
 and(m.expires_at is null or m.expires_at>clock_timestamp()) and c.user_id=p_actor and c.status in('active','trial','paused') for share of m,c;
 if member.id is null then raise exception using errcode='42501',message='Current enrollment is required';end if;
 perform pg_advisory_xact_lock(hashtextextended('written-receipt:'||p_academy::text||':'||p_actor::text||':'||p_assignment::text||':'||p_key,0));
 if member.expires_at is not null and member.expires_at<=clock_timestamp() then raise exception using errcode='42501',message='Current enrollment expired';end if;
 select * into receipt from public.academy_written_submission_receipts where academy_id=p_academy and actor_id=p_actor and assignment_id=p_assignment and request_key=p_key;
 if receipt.request_key is not null then
  if receipt.contact_id is distinct from contact or receipt.intent is distinct from p_intent then raise exception using errcode='23505',message='The saved response differs; recover its original submission';end if;
  -- Replay acknowledges the original response without overwriting later grading.
  return jsonb_build_object('found',true,'replayed',true,'submission',receipt.result);
 end if;
 if p_payload is null then return jsonb_build_object('found',false);end if;
 if coalesce(p_intent->>'content','')<>coalesce(p_payload->>'submission_content','') or coalesce(p_intent->>'url','')<>coalesce(p_payload->>'submission_url','') or coalesce(p_intent->>'notes','')<>coalesce(p_payload->>'notes','') then raise exception using errcode='23505',message='The saved response content changed';end if;
 result:=public.academy_assignment_written_command(p_academy,p_actor,p_assignment,p_payload);
 insert into public.academy_written_submission_receipts(academy_id,actor_id,assignment_id,request_key,contact_id,intent,result)values(p_academy,p_actor,p_assignment,p_key,contact,p_intent,result);
 if member.expires_at is not null and member.expires_at<=clock_timestamp() then raise exception using errcode='42501',message='Current enrollment expired';end if;
 return jsonb_build_object('found',true,'replayed',false,'submission',result);
end;$$;
revoke all on function public.academy_written_submission_command(uuid,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.academy_written_submission_command(uuid,uuid,uuid,text,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
