begin;
create table public.assessment_certificate_documents(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,certificate_id uuid not null,payload_hash text not null check(payload_hash~'^[a-f0-9]{64}$'),renderer_id text not null check(renderer_id~'^[a-f0-9]{64}$'),locale text not null check(locale in('en','uz','ru')),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),byte_length integer not null check(byte_length between 100 and 3000000),created_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,certificate_id) references public.assessment_certificates(tenant_id,id),unique(certificate_id,renderer_id,locale)
);
create trigger immutable_certificate_document before update or delete on public.assessment_certificate_documents for each row execute function public.assessment_immutable();
alter table public.assessment_certificate_documents enable row level security;
revoke all on public.assessment_certificate_documents from public,anon,authenticated,service_role;
create function public.assessment_certificate_reference(p_id uuid,p_key_id text,p_payload_hash text,p_signature text) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$declare c public.assessment_certificates;begin
 select * into c from public.assessment_certificates where id=p_id and key_id=p_key_id and payload_hash=p_payload_hash and signature=p_signature and state in('issued','revoked');
 if not found then raise exception 'certificate_reference_not_found' using errcode='P0002';end if;
 return jsonb_build_object('record',jsonb_build_object('id',c.id,'key_id',c.key_id,'payload_text',c.payload_text,'payload_hash',c.payload_hash,'signature',c.signature),'documents',coalesce((select jsonb_agg(jsonb_build_object('renderer_id',d.renderer_id,'locale',d.locale,'sha256',d.sha256,'byte_length',d.byte_length) order by d.created_at,d.id) from(select * from public.assessment_certificate_documents where certificate_id=c.id order by created_at desc,id desc limit 100)d),'[]'::jsonb));
end;$$;
create function public.assessment_certificate_document_report(p_actor uuid,p_tenant uuid,p_id uuid,p_payload_hash text,p_renderer_id text,p_locale text,p_sha256 text,p_byte_length integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c public.assessment_certificates;d public.assessment_certificate_documents;begin
 perform public.assessment_certificate_read(p_actor,p_tenant,'download',p_id,null,1);
 select * into c from public.assessment_certificates where tenant_id=p_tenant and id=p_id for share;
 if p_payload_hash is distinct from c.payload_hash then raise exception 'certificate_payload_conflict' using errcode='23505';end if;
 if p_renderer_id is null or p_renderer_id!~'^[a-f0-9]{64}$' or p_locale is null or p_locale not in('en','uz','ru') or p_sha256 is null or p_sha256!~'^[a-f0-9]{64}$' or p_byte_length is null or p_byte_length not between 100 and 3000000 then raise exception 'invalid_certificate_document' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('certificate.document:'||p_id::text||p_renderer_id||p_locale,0));
 select * into d from public.assessment_certificate_documents where certificate_id=p_id and renderer_id=p_renderer_id and locale=p_locale;
 if found then if(d.payload_hash,d.sha256,d.byte_length) is distinct from(p_payload_hash,p_sha256,p_byte_length) then raise exception 'immutable_certificate_document_conflict' using errcode='23505';end if;
 else
  insert into public.assessment_certificate_documents(tenant_id,certificate_id,payload_hash,renderer_id,locale,sha256,byte_length) values(p_tenant,p_id,p_payload_hash,p_renderer_id,p_locale,p_sha256,p_byte_length) returning * into d;
  insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'certificates.document.rendered',p_id,jsonb_build_object('document_id',d.id,'renderer_id',d.renderer_id,'locale',d.locale,'sha256',d.sha256,'byte_length',d.byte_length));
 end if;return jsonb_build_object('id',d.id,'sha256',d.sha256,'byte_length',d.byte_length,'renderer_id',d.renderer_id,'locale',d.locale);
end;$$;
revoke all on function public.assessment_certificate_reference(uuid,text,text,text),public.assessment_certificate_document_report(uuid,uuid,uuid,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.assessment_certificate_reference(uuid,text,text,text),public.assessment_certificate_document_report(uuid,uuid,uuid,text,text,text,text,integer) to service_role;
commit;
