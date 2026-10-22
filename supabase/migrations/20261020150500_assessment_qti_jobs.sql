begin;
alter table public.assessment_bank_imports drop constraint assessment_bank_imports_format_check;
alter table public.assessment_bank_imports add constraint assessment_bank_imports_format_check check(format in('csv','json','qti3'));
create table public.assessment_qti_jobs(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),bank_id uuid not null references public.assessment_item_banks(id),
 created_by uuid not null references public.users(id),processing_actor uuid not null references public.users(id),filename text not null check(length(filename) between 1 and 200),
 source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),byte_length integer not null check(byte_length between 22 and 67108864),expected_parts jsonb not null,
 processor_id text not null check(processor_id~'^[a-f0-9]{64}$'),manifest_hash text not null check(manifest_hash~'^[a-f0-9]{64}$'),
 state text not null default 'uploading' check(state in('uploading','scan_queued','scanning','parse_queued','parsing','review_ready','blocked','adopted','cancelled')),
 revision integer not null default 1 check(revision>0),lease_token uuid,lease_until timestamptz,attempts integer not null default 0 check(attempts>=0),
 upload_expires_at timestamptz not null default clock_timestamp()+interval '24 hours',created_at timestamptz not null default clock_timestamp(),completed_at timestamptz,
 unique(tenant_id,id),foreign key(tenant_id,bank_id) references public.assessment_item_banks(tenant_id,id),
 check(case when state in('scanning','parsing') then lease_token is not null and lease_until is not null else lease_token is null and lease_until is null end)
);
create unique index assessment_qti_active_source on public.assessment_qti_jobs(tenant_id,bank_id,source_hash,processor_id) where state<>'cancelled';
create table public.assessment_qti_parts(
 tenant_id uuid not null,job_id uuid not null,index integer not null check(index between 0 and 63),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),byte_length integer not null check(byte_length between 1 and 1048576),
 cipher_sha256 text not null check(cipher_sha256~'^[a-f0-9]{64}$'),iv text not null check(iv~'^[a-f0-9]{24}$'),key_id text not null check(length(key_id) between 1 and 80),object_key text not null unique,etag text not null check(length(etag) between 1 and 200),
 created_at timestamptz not null default clock_timestamp(),primary key(job_id,index),foreign key(tenant_id,job_id) references public.assessment_qti_jobs(tenant_id,id)
);
create table public.assessment_qti_reports(
 tenant_id uuid not null,job_id uuid not null,stage text not null check(stage in('scan','parse')),lease_token uuid not null,report_hash text not null check(report_hash~'^[a-f0-9]{64}$'),
 payload jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(job_id,stage),foreign key(tenant_id,job_id) references public.assessment_qti_jobs(tenant_id,id)
);
create table public.assessment_qti_adoptions(
 tenant_id uuid not null,job_id uuid primary key,import_id uuid not null references public.assessment_bank_imports(id),raw_source_hash text not null,processor_id text not null,review_hash text not null,
 adopted_by uuid not null references public.users(id),reason text not null,created_at timestamptz not null default clock_timestamp(),foreign key(tenant_id,job_id) references public.assessment_qti_jobs(tenant_id,id),foreign key(tenant_id,import_id) references public.assessment_bank_imports(tenant_id,id)
);
create table public.assessment_qti_commands(tenant_id uuid not null,actor_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key));
create index assessment_qti_due on public.assessment_qti_jobs(state,lease_until,created_at);
create index assessment_qti_list on public.assessment_qti_jobs(tenant_id,created_at desc,id);
create function public.assessment_qti_guard() returns trigger language plpgsql as $$begin
 if tg_op='DELETE' or old.state in('adopted','cancelled') or new.revision<>old.revision+1 or (to_jsonb(new)-array['state','revision','lease_token','lease_until','attempts','processing_actor','completed_at']) is distinct from (to_jsonb(old)-array['state','revision','lease_token','lease_until','attempts','processing_actor','completed_at']) then raise exception 'immutable_qti_source' using errcode='23514';end if;return new;
end;$$;
create trigger qti_source_guard before update or delete on public.assessment_qti_jobs for each row execute function public.assessment_qti_guard();
do $$declare tab text;begin
 foreach tab in array array['assessment_qti_jobs','assessment_qti_parts','assessment_qti_reports','assessment_qti_adoptions','assessment_qti_commands'] loop
  execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from anon,authenticated',tab);execute format('grant all on public.%I to service_role',tab);
  if tab<>'assessment_qti_jobs' then execute format('create trigger immutable_record before update or delete on public.%I for each row execute function public.assessment_immutable()',tab);end if;
 end loop;
end;$$;
create function public.assessment_qti_authorize(p_actor uuid,p_tenant uuid) returns void language plpgsql stable security definer set search_path=public,pg_temp as $$begin
 if not public.assessment_has_capability(p_tenant,p_actor,'items.write') or not public.assessment_has_capability(p_tenant,p_actor,'banks.read') then raise exception 'forbidden' using errcode='42501';end if;
end;$$;
create function public.assessment_qti_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_qti_commands;job public.assessment_qti_jobs;request jsonb;result jsonb;review public.assessment_qti_reports;entry jsonb;manifest jsonb;bank uuid;rid uuid;reason text;staged jsonb;
begin
 if p_key is null or length(p_key) not between 8 and 200 or p_action is null or p_action not in('source.begin','cancel','retry','adopt') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'invalid_qti_command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));perform public.assessment_qti_authorize(p_actor,p_tenant);
 perform pg_advisory_xact_lock(hashtextextended('assessment.qti:'||p_tenant::text||p_actor::text||p_key,0));request:=jsonb_build_object('action',p_action,'data',p_data);
 select * into prior from public.assessment_qti_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='source.begin' then
  bank:=(p_data->>'bank_id')::uuid;perform 1 from public.assessment_item_banks where tenant_id=p_tenant and id=bank for share;if not found then raise exception 'bank_not_found' using errcode='P0002';end if;
  if coalesce(p_data->>'source_hash','')!~'^[a-f0-9]{64}$' or coalesce(p_data->>'processor_id','')!~'^[a-f0-9]{64}$' or jsonb_typeof(p_data->'byte_length') is distinct from 'number' or (p_data->>'byte_length')::numeric<>trunc((p_data->>'byte_length')::numeric) or (p_data->>'byte_length')::bigint not between 22 and 67108864 or coalesce(length(p_data->>'filename'),0) not between 1 and 200 or jsonb_typeof(p_data->'parts') is distinct from 'array' then raise exception 'invalid_qti_source' using errcode='22023';end if;
  if jsonb_array_length(p_data->'parts')<>ceil((p_data->>'byte_length')::numeric/1048576) then raise exception 'invalid_qti_parts' using errcode='22023';end if;
  for entry in select jsonb_build_object('value',value,'index',ordinality-1) from jsonb_array_elements(p_data->'parts') with ordinality loop
   if coalesce(entry->'value'->>'sha256','')!~'^[a-f0-9]{64}$' or jsonb_typeof(entry->'value'->'byte_length') is distinct from 'number' or (entry->'value'->>'byte_length')::numeric<>least(1048576,(p_data->>'byte_length')::integer-(entry->>'index')::integer*1048576) then raise exception 'invalid_qti_part' using errcode='22023';end if;
  end loop;
  manifest:=jsonb_build_object('source_hash',p_data->>'source_hash','byte_length',p_data->'byte_length','parts',p_data->'parts');
  perform pg_advisory_xact_lock(hashtextextended('assessment.qti.source:'||p_tenant::text||bank::text||(p_data->>'source_hash')||(p_data->>'processor_id'),0));
  select * into job from public.assessment_qti_jobs where tenant_id=p_tenant and bank_id=bank and source_hash=p_data->>'source_hash' and processor_id=p_data->>'processor_id' and state<>'cancelled';
  if found then
   if job.byte_length<>(p_data->>'byte_length')::integer or job.expected_parts<>p_data->'parts' then raise exception 'qti_source_conflict' using errcode='23505';end if;
   if job.created_by<>p_actor then raise exception 'qti_source_owned_by_another_author' using errcode='42501';end if;rid:=job.id;
  else
   insert into public.assessment_qti_jobs(tenant_id,bank_id,created_by,processing_actor,filename,source_hash,byte_length,expected_parts,processor_id,manifest_hash) values(p_tenant,bank,p_actor,p_actor,p_data->>'filename',p_data->>'source_hash',(p_data->>'byte_length')::integer,p_data->'parts',p_data->>'processor_id',encode(sha256(convert_to(manifest::text,'UTF8')),'hex')) returning id into rid;
  end if;
 else
  select * into job from public.assessment_qti_jobs where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;if not found then raise exception 'qti_not_found' using errcode='P0002';end if;
  if p_data->>'expected_revision' is distinct from job.revision::text then raise exception 'qti_revision_conflict' using errcode='23505';end if;
  if job.state in('adopted','cancelled') then raise exception 'qti_finalized' using errcode='23514';end if;
  reason:=btrim(p_data->>'reason');if coalesce(length(reason),0) not between 1 and 2000 then raise exception 'qti_reason_required' using errcode='22023';end if;
  if p_action='cancel' then update public.assessment_qti_jobs set state='cancelled',lease_token=null,lease_until=null,revision=revision+1,completed_at=clock_timestamp() where id=job.id;
  elsif p_action='retry' then
   if job.state not in('scan_queued','scanning','parse_queued','parsing','blocked') or exists(select 1 from assessment_qti_reports where job_id=job.id and (stage='parse' or (stage='scan' and payload->>'verdict'='rejected'))) then raise exception 'qti_retry_not_allowed' using errcode='23514';end if;
   update public.assessment_qti_jobs set state=case when exists(select 1 from assessment_qti_reports where job_id=job.id and stage='scan') then 'parse_queued' else 'scan_queued' end,processing_actor=p_actor,attempts=0,lease_token=null,lease_until=null,revision=revision+1 where id=job.id;
  else
   select * into review from public.assessment_qti_reports where job_id=job.id and stage='parse';
   if job.state<>'review_ready' or not found or jsonb_array_length(review.payload->'blocked')<>0 or jsonb_array_length(review.payload->'rows') not between 1 and 2000 then raise exception 'qti_review_not_ready' using errcode='23514';end if;
   if p_data->>'review_hash' is distinct from review.report_hash or p_data->'acknowledged' is distinct from 'true'::jsonb then raise exception 'qti_review_changed_or_unacknowledged' using errcode='23505';end if;
   -- QTI import source identity is the normalized snapshot digest. Immutable
   -- adoption separately retains the original ZIP digest and processor identity.
   staged:=public.assessment_bank_import_command(p_actor,p_tenant,'qti-stage:'||job.id,'stage',jsonb_build_object('bank_id',job.bank_id,'source_name',job.filename,'format','qti3','source_hash',review.report_hash,'rows',review.payload->'rows'));
   insert into public.assessment_qti_adoptions(tenant_id,job_id,import_id,raw_source_hash,processor_id,review_hash,adopted_by,reason) values(p_tenant,job.id,(staged->>'id')::uuid,job.source_hash,job.processor_id,review.report_hash,p_actor,reason);
   update public.assessment_qti_jobs set state='adopted',revision=revision+1,completed_at=clock_timestamp() where id=job.id;
  end if;rid:=job.id;
 end if;
 select jsonb_build_object('id',j.id,'state',j.state,'revision',j.revision,'manifest_hash',j.manifest_hash,'source_hash',j.source_hash,'import',staged) into result from public.assessment_qti_jobs j where j.id=rid;
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'qti.'||p_action,rid,jsonb_build_object('reason',reason));
 insert into public.assessment_qti_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);return result;
end;$$;
create function public.assessment_qti_read(p_actor uuid,p_tenant uuid,p_id uuid default null,p_after integer default 0,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare job public.assessment_qti_jobs;review public.assessment_qti_reports;rows jsonb;
begin
 perform public.assessment_qti_authorize(p_actor,p_tenant);if p_after is null or p_after<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_qti_page' using errcode='22023';end if;
 if p_id is null then return(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc,id),'[]') from(select id,bank_id,filename,source_hash,processor_id,state,revision,created_by,created_at from public.assessment_qti_jobs where tenant_id=p_tenant order by created_at desc,id limit p_limit offset p_after)x);end if;
 select * into job from public.assessment_qti_jobs where tenant_id=p_tenant and id=p_id;if not found then raise exception 'qti_not_found' using errcode='P0002';end if;
 select * into review from public.assessment_qti_reports where job_id=job.id and stage='parse';
 select coalesce(jsonb_agg(value order by (value->>'line')::integer),'[]') into rows from(select value from jsonb_array_elements(coalesce(review.payload->'rows','[]')) where (value->>'line')::integer>p_after order by (value->>'line')::integer limit p_limit)x;
 return(to_jsonb(job)-array['lease_token','lease_until'])||jsonb_build_object('received_parts',(select coalesce(jsonb_agg(index order by index),'[]') from public.assessment_qti_parts where job_id=job.id),'review_hash',review.report_hash,'parser_review_hash',review.payload->>'parser_review_hash','blocked',coalesce(review.payload->'blocked','[]'),'total',coalesce(jsonb_array_length(review.payload->'rows'),0),'rows',rows,'adoption',(select to_jsonb(a) from public.assessment_qti_adoptions a where a.job_id=job.id));
end;$$;
create function public.assessment_qti_transport(p_actor uuid,p_tenant uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.assessment_qti_jobs;part public.assessment_qti_parts;expected jsonb;idx integer;receipt jsonb;result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));perform public.assessment_qti_authorize(p_actor,p_tenant);
 select * into job from public.assessment_qti_jobs where tenant_id=p_tenant and id=(p_data->>'job_id')::uuid for update;
 if not found then raise exception 'qti_not_found' using errcode='P0002';end if;
 if job.created_by<>p_actor or job.state in('cancelled','adopted') then raise exception 'qti_upload_denied' using errcode='42501';end if;
 if p_action='complete' then
  if job.state='uploading' then
   if job.upload_expires_at<=clock_timestamp() then raise exception 'qti_upload_expired' using errcode='23514';end if;
   if(select count(*) from public.assessment_qti_parts where job_id=job.id)<>jsonb_array_length(job.expected_parts) then raise exception 'qti_parts_missing' using errcode='23514';end if;
   update public.assessment_qti_jobs set state='scan_queued',revision=revision+1 where id=job.id;
   insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'qti.source.completed',job.id,jsonb_build_object('manifest_hash',job.manifest_hash));
  end if;
  return jsonb_build_object('id',job.id,'state',(select state from public.assessment_qti_jobs where id=job.id));
 end if;
 if p_action is null or p_action not in('part.authorize','part.receipt') or jsonb_typeof(p_data->'index') is distinct from 'number' or (p_data->>'index')::numeric<>trunc((p_data->>'index')::numeric) then raise exception 'invalid_qti_transport' using errcode='22023';end if;
 idx:=(p_data->>'index')::integer;expected:=job.expected_parts->idx;if idx<0 or expected is null then raise exception 'invalid_qti_part' using errcode='22023';end if;
 select * into part from public.assessment_qti_parts where job_id=job.id and index=idx;
 if part.job_id is null and (job.state<>'uploading' or job.upload_expires_at<=clock_timestamp()) then raise exception 'qti_upload_expired_or_closed' using errcode='23514';end if;
 if p_action='part.receipt' then
  receipt:=p_data-array['job_id','index'];
  if receipt-array['sha256','byte_length','cipher_sha256','iv','key_id','object_key','etag']<>'{}'::jsonb then raise exception 'invalid_qti_part_receipt' using errcode='22023';end if;
  if receipt->>'sha256' is distinct from expected->>'sha256' or receipt->'byte_length' is distinct from expected->'byte_length' or coalesce(receipt->>'cipher_sha256','')!~'^[a-f0-9]{64}$' or coalesce(receipt->>'iv','')!~'^[a-f0-9]{24}$' or coalesce(length(receipt->>'key_id'),0) not between 1 and 80 or coalesce(length(receipt->>'etag'),0) not between 1 and 200 or receipt->>'object_key' is distinct from ('assessment-qti/'||p_tenant||'/'||job.id||'/'||idx||'/'||(expected->>'sha256')) then raise exception 'qti_part_receipt_conflict' using errcode='23505';end if;
  if part.job_id is not null then
   if (to_jsonb(part)-array['tenant_id','job_id','index','created_at'])<>receipt then raise exception 'qti_part_receipt_conflict' using errcode='23505';end if;
  else insert into public.assessment_qti_parts(tenant_id,job_id,index,sha256,byte_length,cipher_sha256,iv,key_id,object_key,etag) values(p_tenant,job.id,idx,receipt->>'sha256',(receipt->>'byte_length')::integer,receipt->>'cipher_sha256',receipt->>'iv',receipt->>'key_id',receipt->>'object_key',receipt->>'etag') returning * into part;end if;
 end if;
 return jsonb_build_object('tenant_id',p_tenant,'job_id',job.id,'index',idx,'sha256',expected->>'sha256','byte_length',expected->'byte_length','receipt',case when part.job_id is null then null else to_jsonb(part)-'created_at' end);
end;$$;
create function public.assessment_qti_claim(p_stage text,p_processor text,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.assessment_qti_jobs;result jsonb:='[]';token uuid;
begin
 if p_stage is null or p_stage not in('scan','parse') or p_processor is null or p_processor!~'^[a-f0-9]{64}$' or p_limit is null or p_limit not between 1 and 20 then raise exception 'invalid_qti_claim' using errcode='22023';end if;
 for job in select * from public.assessment_qti_jobs where processor_id=p_processor and (state=p_stage||'_queued' or (state=case p_stage when 'scan' then 'scanning' else 'parsing' end and lease_until<=clock_timestamp())) and public.assessment_has_capability(tenant_id,processing_actor,'items.write') and public.assessment_has_capability(tenant_id,processing_actor,'banks.read') order by created_at,id for update skip locked limit p_limit loop
  if job.attempts>=10 then update public.assessment_qti_jobs set state='blocked',lease_token=null,lease_until=null,revision=revision+1 where id=job.id;insert into public.assessment_audit_events(tenant_id,actor_kind,action,target_id,details) values(job.tenant_id,'system','qti.processing.exhausted',job.id,jsonb_build_object('stage',p_stage,'attempts',job.attempts));continue;end if;
  token:=gen_random_uuid();update public.assessment_qti_jobs set state=case p_stage when 'scan' then 'scanning' else 'parsing' end,lease_token=token,lease_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1,revision=revision+1 where id=job.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',job.id,'tenant_id',job.tenant_id,'stage',p_stage,'lease_token',token,'processor_id',job.processor_id,'source_hash',job.source_hash,'manifest_hash',job.manifest_hash));
 end loop;return result;
end;$$;
create function public.assessment_qti_bundle(p_job uuid,p_stage text,p_token uuid,p_processor text,p_renew boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.assessment_qti_jobs;report public.assessment_qti_reports;parts jsonb;
begin
 select tenant_id into job.tenant_id from public.assessment_qti_jobs where id=p_job;if not found then raise exception 'qti_not_found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||job.tenant_id::text,0));
 select * into job from public.assessment_qti_jobs where id=p_job for update;if not found then raise exception 'qti_not_found' using errcode='P0002';end if;
 perform public.assessment_qti_authorize(job.processing_actor,job.tenant_id);
 if job.state='cancelled' then raise exception 'qti_cancelled' using errcode='42501';end if;
 if p_stage is null or p_stage not in('scan','parse') then raise exception 'invalid_qti_stage' using errcode='22023';end if;
 if p_processor is distinct from job.processor_id then raise exception 'qti_processor_mismatch' using errcode='23505';end if;
 select * into report from public.assessment_qti_reports where job_id=p_job and stage=p_stage;
 if found and report.lease_token=p_token then return jsonb_build_object('id',job.id,'done',true,'report_hash',report.report_hash);end if;
 if job.state is distinct from (case p_stage when 'scan' then 'scanning' else 'parsing' end) or p_token is null or job.lease_token is distinct from p_token or job.lease_until<=clock_timestamp() then raise exception 'qti_stale_lease' using errcode='23505';end if;
 if p_renew then update public.assessment_qti_jobs set lease_until=clock_timestamp()+interval '5 minutes',revision=revision+1 where id=p_job;end if;
 select jsonb_agg(to_jsonb(p)-'created_at' order by index) into parts from public.assessment_qti_parts p where p.job_id=job.id;
 return jsonb_build_object('id',job.id,'tenant_id',job.tenant_id,'stage',p_stage,'source_hash',job.source_hash,'manifest_hash',job.manifest_hash,'byte_length',job.byte_length,'processor_id',job.processor_id,'parts',parts);
end;$$;
create function public.assessment_qti_report(p_job uuid,p_stage text,p_token uuid,p_processor text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.assessment_qti_jobs;prior public.assessment_qti_reports;digest text;next_state text;
begin
 select tenant_id into job.tenant_id from public.assessment_qti_jobs where id=p_job;if not found then raise exception 'qti_not_found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||job.tenant_id::text,0));
 select * into job from public.assessment_qti_jobs where id=p_job for update;if not found then raise exception 'qti_not_found' using errcode='P0002';end if;
 perform public.assessment_qti_authorize(job.processing_actor,job.tenant_id);
 if job.state='cancelled' then raise exception 'qti_cancelled' using errcode='42501';end if;
 if p_stage is null or p_stage not in('scan','parse') or jsonb_typeof(p_data) is distinct from 'object' or p_processor is distinct from job.processor_id or p_data->>'source_hash' is distinct from job.source_hash then raise exception 'qti_report_scope' using errcode='23505';end if;
 digest:=encode(sha256(convert_to(jsonb_build_object('schema','assessment.qti-report.v1','stage',p_stage,'source_hash',job.source_hash,'manifest_hash',job.manifest_hash,'processor_id',job.processor_id,'payload',p_data)::text,'UTF8')),'hex');
 select * into prior from public.assessment_qti_reports where job_id=p_job and stage=p_stage;
 if found then if prior.lease_token is distinct from p_token or prior.report_hash<>digest then raise exception 'qti_report_conflict' using errcode='23505';end if;return jsonb_build_object('id',job.id,'report_hash',prior.report_hash);end if;
 if job.state is distinct from (case p_stage when 'scan' then 'scanning' else 'parsing' end) or p_token is null or job.lease_token is distinct from p_token or job.lease_until<=clock_timestamp() then raise exception 'qti_stale_lease' using errcode='23505';end if;
 if p_stage='scan' then
  if (p_data->>'byte_length')::integer is distinct from job.byte_length or p_data->>'verdict' is null or p_data->>'verdict' not in('clean','rejected') or coalesce(p_data->>'signature_version','')!~'^[a-f0-9]{64}$' or coalesce(p_data->>'report_hash','')!~'^[a-f0-9]{64}$' or coalesce(length(p_data->>'engine_version'),0) not between 1 and 120 then raise exception 'invalid_qti_scan_report' using errcode='22023';end if;
  next_state:=case when p_data->>'verdict'='clean' then 'parse_queued' else 'blocked' end;
 else
  if not exists(select 1 from public.assessment_qti_reports where job_id=job.id and stage='scan' and payload->>'verdict'='clean') then raise exception 'qti_scan_required' using errcode='42501';end if;
  if p_data->>'schema_version' is distinct from 'assessment.qti-normalized.v1' or coalesce(p_data->>'parser_review_hash','')!~'^[a-f0-9]{64}$' or jsonb_typeof(p_data->'rows') is distinct from 'array' or jsonb_typeof(p_data->'blocked') is distinct from 'array' or jsonb_array_length(p_data->'rows')>2000 or jsonb_array_length(p_data->'blocked')>2000 or (jsonb_array_length(p_data->'rows')=0 and jsonb_array_length(p_data->'blocked')=0) then raise exception 'invalid_qti_parse_report' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(p_data->'rows') e where jsonb_typeof(e->'item') is distinct from 'object' or jsonb_typeof(e->'key') is distinct from 'object' or e->'item'->>'schema_version' is distinct from 'assessment.item.v1' or coalesce(e->>'fingerprint','')!~'^[a-f0-9]{64}$' or jsonb_typeof(e->'warnings') is distinct from 'array') then raise exception 'invalid_qti_rows' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(p_data->'rows') with ordinality e(value,n) where jsonb_typeof(value->'line') is distinct from 'number' or (value->>'line')::numeric is distinct from n::numeric or coalesce(length(value->>'source_path'),0) not between 1 and 1024 or coalesce(length(value->>'identifier'),0) not between 1 and 200) then raise exception 'invalid_qti_row_identity' using errcode='22023';end if;
  next_state:=case when jsonb_array_length(p_data->'blocked')=0 then 'review_ready' else 'blocked' end;
 end if;
 insert into public.assessment_qti_reports(tenant_id,job_id,stage,lease_token,report_hash,payload) values(job.tenant_id,job.id,p_stage,p_token,digest,p_data);
 update public.assessment_qti_jobs set state=next_state,attempts=0,lease_token=null,lease_until=null,revision=revision+1 where id=job.id;
 insert into public.assessment_audit_events(tenant_id,actor_kind,action,target_id,details) values(job.tenant_id,'system','qti.'||p_stage||'.reported',job.id,jsonb_build_object('report_hash',digest,'processor_id',job.processor_id,'state',next_state));
 return jsonb_build_object('id',job.id,'report_hash',digest);
end;$$;
revoke all on function public.assessment_qti_guard(),public.assessment_qti_authorize(uuid,uuid),public.assessment_qti_command(uuid,uuid,text,text,jsonb),public.assessment_qti_read(uuid,uuid,uuid,integer,integer),public.assessment_qti_transport(uuid,uuid,text,jsonb),public.assessment_qti_claim(text,text,integer),public.assessment_qti_bundle(uuid,text,uuid,text,boolean),public.assessment_qti_report(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessment_qti_command(uuid,uuid,text,text,jsonb),public.assessment_qti_read(uuid,uuid,uuid,integer,integer),public.assessment_qti_transport(uuid,uuid,text,jsonb),public.assessment_qti_claim(text,text,integer),public.assessment_qti_bundle(uuid,text,uuid,text,boolean),public.assessment_qti_report(uuid,text,uuid,text,jsonb) to service_role;
commit;
