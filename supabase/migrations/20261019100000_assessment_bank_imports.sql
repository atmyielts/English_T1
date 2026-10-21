begin;
create table public.assessment_bank_imports(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),bank_id uuid not null references public.assessment_item_banks(id),
 source_name text not null check(length(source_name) between 1 and 200),source_hash text not null check(source_hash~'^[a-f0-9]{64}$'),format text not null check(format in('csv','json')),
 review_hash text not null check(review_hash~'^[a-f0-9]{64}$'),created_by uuid not null references public.users(id),authorized_by uuid references public.users(id),
 state text not null default 'staged' check(state in('staged','importing','completed','cancelled')),revision integer not null default 1,
 total integer not null check(total between 1 and 2000),processed integer not null default 0 check(processed between 0 and total),created_at timestamptz not null default clock_timestamp(),finished_at timestamptz,
 unique(tenant_id,bank_id,source_hash),unique(tenant_id,id)
);
create table public.assessment_bank_import_rows(
 tenant_id uuid not null,import_id uuid not null,line integer not null check(line>0),item jsonb not null,key jsonb not null,fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),
 warnings jsonb not null default '[]',state text not null default 'pending' check(state in('pending','created','cancelled')),item_version_id uuid references public.assessment_item_versions(id),
 primary key(import_id,line),foreign key(tenant_id,import_id) references public.assessment_bank_imports(tenant_id,id),check((state='created')=(item_version_id is not null))
);
create table public.assessment_bank_import_commands(tenant_id uuid not null,actor_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(tenant_id,actor_id,idempotency_key));
create index assessment_import_rows_pending on public.assessment_bank_import_rows(import_id,line) where state='pending';
create trigger immutable_record before update or delete on public.assessment_bank_import_commands for each row execute function public.assessment_immutable();
create function public.assessment_import_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if tg_op='DELETE' then raise exception 'immutable_import_history' using errcode='23514';end if;
 if tg_table_name='assessment_bank_import_rows' then
  if old.state<>'pending' or new.state='pending' or (to_jsonb(new)-array['state','item_version_id']) is distinct from (to_jsonb(old)-array['state','item_version_id']) then raise exception 'immutable_import_row' using errcode='23514';end if;
 else
  if old.state in('completed','cancelled') or new.revision<>old.revision+1 or (to_jsonb(new)-array['state','authorized_by','revision','processed','finished_at']) is distinct from (to_jsonb(old)-array['state','authorized_by','revision','processed','finished_at']) then raise exception 'immutable_import_manifest' using errcode='23514';end if;
 end if;return new;
end;$$;
create trigger import_guard before update or delete on public.assessment_bank_imports for each row execute function public.assessment_import_guard();
create trigger import_row_guard before update or delete on public.assessment_bank_import_rows for each row execute function public.assessment_import_guard();
create function public.assessment_bank_import_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_bank_import_commands;job public.assessment_bank_imports;entry public.assessment_bank_import_rows;rid uuid;request jsonb;result jsonb;rows jsonb;review text;bank uuid;made integer:=0;
begin
 if p_key is null or length(p_key) not between 8 and 200 or p_action is null or p_action not in('stage','confirm','step','cancel') or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'invalid_import_command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('assessment.staff:'||p_tenant::text,0));
 if not public.assessment_has_capability(p_tenant,p_actor,'items.write') or not public.assessment_has_capability(p_tenant,p_actor,'banks.read') then raise exception 'forbidden' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||'bank-import'||p_key,0));request:=jsonb_build_object('action',p_action,'data',p_data);
 select * into prior from public.assessment_bank_import_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='stage' then
  bank:=(p_data->>'bank_id')::uuid;perform 1 from public.assessment_item_banks where tenant_id=p_tenant and id=bank for share;if not found then raise exception 'bank_not_found' using errcode='P0002';end if;
  rows:=p_data->'rows';if rows is null or jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 2000 then raise exception 'invalid_import_rows' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(rows)e where jsonb_typeof(e->'item') is distinct from 'object' or jsonb_typeof(e->'key') is distinct from 'object' or e->'item'->>'schema_version' is distinct from 'assessment.item.v1' or e->>'fingerprint'!~'^[a-f0-9]{64}$' or jsonb_typeof(e->'warnings') is distinct from 'array') then raise exception 'invalid_import_rows' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(rows)e where e->'item' ? 'rubric_id' and not exists(select 1 from public.assessment_rubrics r where r.tenant_id=p_tenant and r.id=(e->'item'->>'rubric_id')::uuid)) then raise exception 'import_rubric_not_found' using errcode='23514';end if;
  if exists(select 1 from jsonb_array_elements(rows)e cross join lateral jsonb_array_elements(coalesce(e->'item'->'media','[]'))m where not exists(select 1 from public.assessment_artifacts a where a.tenant_id=p_tenant and a.id=(m->>'artifact_id')::uuid and a.state='ready' and a.kind=m->>'kind')) then raise exception 'artifact_not_ready_or_foreign' using errcode='23514';end if;
  -- The service port supplies normalized contracts. Media still passes the canonical item-version trigger in every batch.
  review:=encode(sha256(convert_to(jsonb_build_object('bank_id',bank,'source_hash',p_data->>'source_hash','rows',rows)::text,'UTF8')),'hex');
  select * into job from public.assessment_bank_imports where tenant_id=p_tenant and bank_id=bank and source_hash=p_data->>'source_hash';
  if found then if job.review_hash<>review then raise exception 'import_source_conflict' using errcode='23505';end if;rid:=job.id;
  else
   insert into public.assessment_bank_imports(tenant_id,bank_id,source_name,source_hash,format,review_hash,created_by,total) values(p_tenant,bank,p_data->>'source_name',p_data->>'source_hash',p_data->>'format',review,p_actor,jsonb_array_length(rows)) returning id into rid;
   insert into public.assessment_bank_import_rows(tenant_id,import_id,line,item,key,fingerprint,warnings) select p_tenant,rid,(e->>'line')::integer,e->'item',e->'key',e->>'fingerprint',e->'warnings' from jsonb_array_elements(rows)e;
  end if;result:=jsonb_build_object('id',rid,'review_hash',review);
 else
  select * into job from public.assessment_bank_imports where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;if not found then raise exception 'import_not_found' using errcode='P0002';end if;
  if p_data->>'expected_revision' is distinct from job.revision::text then raise exception 'import_revision_conflict' using errcode='23505';end if;
  if job.state in('completed','cancelled') then raise exception 'import_finalized' using errcode='23514';end if;
  if p_action='confirm' then
   if p_data->>'review_hash' is distinct from job.review_hash then raise exception 'import_review_changed' using errcode='23505';end if;
   if coalesce(length(btrim(p_data->>'reason')),0) not between 1 and 2000 then raise exception 'import_reason_required' using errcode='22023';end if;
   update public.assessment_bank_imports set state='importing',authorized_by=p_actor,revision=revision+1 where id=job.id;
  elsif p_action='cancel' then
   if coalesce(length(btrim(p_data->>'reason')),0) not between 1 and 2000 then raise exception 'import_reason_required' using errcode='22023';end if;
   update public.assessment_bank_import_rows set state='cancelled' where import_id=job.id and state='pending';
   update public.assessment_bank_imports set state='cancelled',revision=revision+1,finished_at=clock_timestamp() where id=job.id;
  else
   if job.state<>'importing' or job.authorized_by<>p_actor then raise exception 'import_confirmation_required' using errcode='42501';end if;
   for entry in select * from public.assessment_bank_import_rows where import_id=job.id and state='pending' order by line limit 50 for update loop
    if entry.item ? 'rubric_id' and not exists(select 1 from public.assessment_rubrics r where r.tenant_id=p_tenant and r.id=(entry.item->>'rubric_id')::uuid) then raise exception 'import_rubric_not_found' using errcode='23514';end if;
    result:=public.assessment_command(p_actor,p_tenant,'bank-import:'||job.id||':'||entry.line,'item.create',jsonb_build_object('bank_id',job.bank_id,'item',entry.item,'key',entry.key));
    -- item.create returns a version ID. Never submits or approves imported questions.
    update public.assessment_bank_import_rows set state='created',item_version_id=(result->>'id')::uuid where import_id=job.id and line=entry.line;made:=made+1;
   end loop;
   update public.assessment_bank_imports set processed=processed+made,revision=revision+1,state=case when processed+made=total then 'completed' else 'importing' end,finished_at=case when processed+made=total then clock_timestamp() else null end where id=job.id;
  end if;rid:=job.id;select jsonb_build_object('id',id,'state',state,'revision',revision,'processed',processed,'total',total) into result from public.assessment_bank_imports where id=job.id;
 end if;
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'bank-import.'||p_action,rid,jsonb_build_object('reason',p_data->>'reason','batch_created',made));
 insert into public.assessment_bank_import_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);return result;
end;$$;
create function public.assessment_bank_import_read(p_actor uuid,p_tenant uuid,p_kind text,p_id uuid default null,p_after integer default 0,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare job public.assessment_bank_imports;rows jsonb;
begin
 if not public.assessment_has_capability(p_tenant,p_actor,'items.write') or not public.assessment_has_capability(p_tenant,p_actor,'banks.read') then raise exception 'forbidden' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 or p_after is null or p_after<0 then raise exception 'invalid_import_page' using errcode='22023';end if;
 if p_kind='list' then return (select coalesce(jsonb_agg(to_jsonb(t) order by created_at desc),'[]') from(select * from public.assessment_bank_imports where tenant_id=p_tenant order by created_at desc,id limit p_limit offset p_after)t);end if;
 select * into job from public.assessment_bank_imports where tenant_id=p_tenant and id=p_id;if not found then raise exception 'import_not_found' using errcode='P0002';end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by line),'[]') into rows from(select line,item,key,warnings,state,item_version_id from public.assessment_bank_import_rows where tenant_id=p_tenant and import_id=job.id and line>p_after order by line limit p_limit)t;
 return to_jsonb(job)||jsonb_build_object('rows',rows);
end;$$;
create function public.assessment_bank_export(p_actor uuid,p_tenant uuid,p_bank uuid,p_after uuid default null,p_at timestamptz default null,p_limit integer default 100) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare stamp timestamptz:=coalesce(p_at,statement_timestamp());rows jsonb;
begin
 if not public.assessment_has_capability(p_tenant,p_actor,'items.write') or not public.assessment_has_capability(p_tenant,p_actor,'banks.read') then raise exception 'forbidden' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 or stamp>statement_timestamp() then raise exception 'invalid_export_page' using errcode='22023';end if;
 if not exists(select 1 from public.assessment_item_banks where tenant_id=p_tenant and id=p_bank) then raise exception 'bank_not_found' using errcode='P0002';end if;
 select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') into rows from(select i.id,v.payload item,k.key from public.assessment_items i cross join lateral(select iv.* from public.assessment_item_versions iv where iv.item_id=i.id and iv.tenant_id=p_tenant and iv.created_at<=stamp order by iv.version desc limit 1)v join public.assessment_item_keys k on k.item_version_id=v.id where i.tenant_id=p_tenant and i.bank_id=p_bank and (p_after is null or i.id>p_after) order by i.id limit p_limit)t;
 return jsonb_build_object('snapshot_at',stamp,'rows',rows);
end;$$;
alter table public.assessment_bank_imports enable row level security;alter table public.assessment_bank_import_rows enable row level security;alter table public.assessment_bank_import_commands enable row level security;
revoke all on public.assessment_bank_imports,public.assessment_bank_import_rows,public.assessment_bank_import_commands from anon,authenticated;
revoke all on function public.assessment_import_guard(),public.assessment_bank_import_command(uuid,uuid,text,text,jsonb),public.assessment_bank_import_read(uuid,uuid,text,uuid,integer,integer),public.assessment_bank_export(uuid,uuid,uuid,uuid,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.assessment_bank_import_command(uuid,uuid,text,text,jsonb),public.assessment_bank_import_read(uuid,uuid,text,uuid,integer,integer),public.assessment_bank_export(uuid,uuid,uuid,uuid,timestamptz,integer) to service_role;
commit;
