begin;
-- Recover a committed admission even when the browser lost its reply/device
-- checkpoint and the academic clock or admission release flag has since closed.
-- The opaque command key identifies a receipt; it is never authorization.
create index assessment_answer_admission_lookup on public.assessment_answer_commands(tenant_id,actor_id,(result->>'id')) where request->>'action'='upload.begin';
create or replace function public.assessment_answer_read(p_actor uuid,p_tenant uuid,p_attempt uuid,p_item uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare result jsonb;begin
 if not exists(select 1 from public.assessment_attempts where tenant_id=p_tenant and id=p_attempt and candidate_id=p_actor) then raise exception 'not_found' using errcode='P0002';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'content_hash',b.content_hash,'admission_key',c.idempotency_key,'filename',a.filename,'mime',a.mime,'byte_length',a.byte_length,'state',a.state,'source',b.source,'upload_expires_at',a.upload_expires_at) order by b.admitted_at,a.id),'[]') into result
 from public.assessment_answer_assets b join public.assessment_artifacts a on a.id=b.artifact_id
 left join public.assessment_answer_commands c on c.tenant_id=b.tenant_id and c.actor_id=p_actor and c.result->>'id'=a.id::text and c.request->>'action'='upload.begin'
 where b.tenant_id=p_tenant and b.attempt_id=p_attempt and b.item_version_id=p_item;
 return result;
end;$$;
revoke all on function public.assessment_answer_read(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assessment_answer_read(uuid,uuid,uuid,uuid) to service_role;
commit;
