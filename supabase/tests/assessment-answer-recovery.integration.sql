\set ON_ERROR_STOP on
do $$declare t uuid:='10000000-0000-4000-8000-000000000001';candidate uuid:='00000000-0000-4000-8000-000000000003';b public.assessment_answer_assets;catalog jsonb;key text;begin
 select x.* into b from public.assessment_answer_assets x join public.assessment_artifacts a on a.id=x.artifact_id where a.state='ready' and a.created_by=candidate limit 1;
 if b.artifact_id is null then raise exception 'Canonical academic answer fixture missing';end if;
 select idempotency_key into key from public.assessment_answer_commands where tenant_id=t and actor_id=candidate and result->>'id'=b.artifact_id::text and request->>'action'='upload.begin';
 catalog:=public.assessment_answer_read(candidate,t,b.attempt_id,b.item_version_id);
 if not exists(select 1 from jsonb_array_elements(catalog) e where e->>'id'=b.artifact_id::text and e->>'admission_key'=key and e->>'content_hash'=b.content_hash) then raise exception 'Finalized owning candidate could not recover its exact admission key';end if;
 if catalog::text like '%token_hash%' or catalog::text like '%cipher_sha256%' or catalog::text like '%object_key%' or catalog::text like '%lease%' then raise exception 'Admission recovery exposed storage or device secrets';end if;
 begin perform public.assessment_answer_read('00000000-0000-4000-8000-000000000001',t,b.attempt_id,b.item_version_id);raise exception 'Staff recovered another candidate admission';exception when no_data_found then null;end;
end;$$;
