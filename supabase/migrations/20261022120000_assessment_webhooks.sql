begin;
-- Institution webhooks (ENT-04). Events are thin: type, ids and time only.
-- Consumers read details through authorized APIs, so no answer, score, key,
-- media or other-tenant data is ever placed in a payload. Endpoint signing
-- secrets are stored only as ciphertext produced by the Edge function, which
-- also signs deliveries; the delivery Worker posts bytes and reports outcomes.

create table public.assessment_events(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 sequence bigint generated always as identity,
 type text not null check(type in('registration.created','attempt.submitted','result.released')),
 subject_id uuid not null,
 data jsonb not null,
 occurred_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,type,subject_id)
);
create index assessment_events_tenant_sequence on public.assessment_events(tenant_id,sequence);

create table public.assessment_webhook_endpoints(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 url text not null check(url ~ '^https://' and length(url)<=2048),
 events text[] not null check(cardinality(events) between 1 and 3 and events <@ array['registration.created','attempt.submitted','result.released']),
 state text not null default 'active' check(state in('active','disabled')),
 secret_ciphertext text not null,
 previous_secret_ciphertext text,
 previous_secret_expires_at timestamptz,
 secret_version integer not null default 1,
 revision integer not null default 1,
 created_by uuid not null references public.users(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id)
);
create unique index assessment_webhook_endpoint_url on public.assessment_webhook_endpoints(tenant_id,url) where state='active';

create table public.assessment_webhook_deliveries(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 endpoint_id uuid not null,
 event_id uuid not null references public.assessment_events(id),
 state text not null default 'pending' check(state in('pending','delivering','delivered','dead')),
 attempts integer not null default 0 check(attempts>=0),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease_token uuid,
 leased_until timestamptz,
 last_status integer,
 last_error text check(length(last_error)<=500),
 delivered_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 unique(endpoint_id,event_id),
 foreign key(tenant_id,endpoint_id) references public.assessment_webhook_endpoints(tenant_id,id)
);
create index assessment_webhook_due on public.assessment_webhook_deliveries(next_attempt_at) where state in('pending','delivering');
create index assessment_webhook_history on public.assessment_webhook_deliveries(tenant_id,endpoint_id,created_at desc,id desc);

create table public.assessment_webhook_commands(
 tenant_id uuid not null,actor_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key)
);

do $$declare t text;begin foreach t in array array['assessment_events','assessment_webhook_endpoints','assessment_webhook_deliveries','assessment_webhook_commands'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end;$$;

-- Event producers. One event per subject and type; replays are no-ops.
create function public.assessment_event_emit(p_tenant uuid,p_type text,p_subject uuid,p_data jsonb,p_at timestamptz) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.assessment_events;begin
 insert into public.assessment_events(tenant_id,type,subject_id,data,occurred_at) values(p_tenant,p_type,p_subject,p_data,coalesce(p_at,clock_timestamp()))
 on conflict (tenant_id,type,subject_id) do nothing returning * into e;
 if e.id is null then return;end if;
 insert into public.assessment_webhook_deliveries(tenant_id,endpoint_id,event_id,next_attempt_at)
 select e.tenant_id,w.id,e.id,greatest(clock_timestamp(),e.occurred_at) from public.assessment_webhook_endpoints w
 where w.tenant_id=e.tenant_id and w.state='active' and e.type=any(w.events)
 on conflict (endpoint_id,event_id) do nothing;
end;$$;
create function public.assessment_event_registration() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 perform public.assessment_event_emit(new.tenant_id,'registration.created',new.id,jsonb_build_object('registration_id',new.id,'window_id',new.window_id),new.created_at);return null;
end;$$;
create trigger assessment_event_registration after insert on public.assessment_registrations for each row execute function public.assessment_event_registration();
create function public.assessment_event_attempt() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if new.state in('submitted','expired') and old.state is distinct from new.state then
  perform public.assessment_event_emit(new.tenant_id,'attempt.submitted',new.id,jsonb_build_object('attempt_id',new.id,'registration_id',new.registration_id,'state',new.state),coalesce(new.submitted_at,clock_timestamp()));
 end if;return null;
end;$$;
create trigger assessment_event_attempt after update of state on public.assessment_attempts for each row execute function public.assessment_event_attempt();
-- A scheduled release is announced at its release time, not before.
create function public.assessment_event_release() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare attempt uuid;begin
 select attempt_id into attempt from public.assessment_grading_runs where tenant_id=new.tenant_id and id=new.run_id;
 perform public.assessment_event_emit(new.tenant_id,'result.released',new.id,jsonb_build_object('release_id',new.id,'attempt_id',attempt),new.release_at);return null;
end;$$;
create trigger assessment_event_release after insert on public.assessment_grading_releases for each row execute function public.assessment_event_release();

-- Institution management. team.manage (owner/admin or delegated) is required;
-- ciphertext is produced by the Edge function and never returned.
create function public.assessment_webhook_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_webhook_commands;request jsonb;result jsonb;w public.assessment_webhook_endpoints;d public.assessment_webhook_deliveries;begin
 perform public.assessment_staff_write_fence(p_tenant,p_actor);
 if not public.assessment_has_capability(p_tenant,p_actor,'team.manage') then raise exception 'forbidden' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 -- Secret material is excluded from the stored request identity.
 request:=jsonb_build_object('action',p_action,'data',p_data-'secret_ciphertext');
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||':webhook:'||p_key,0));
 select * into prior from public.assessment_webhook_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='endpoint.create' then
  if (select count(*) from public.assessment_webhook_endpoints where tenant_id=p_tenant and state='active')>=10 then raise exception 'webhook_endpoint_limit' using errcode='23514';end if;
  insert into public.assessment_webhook_endpoints(tenant_id,url,events,secret_ciphertext,created_by)
  values(p_tenant,p_data->>'url',array(select jsonb_array_elements_text(p_data->'events')),p_data->>'secret_ciphertext',p_actor) returning * into w;
 elsif p_action in('endpoint.update','endpoint.rotate','endpoint.disable') then
  select * into w from public.assessment_webhook_endpoints where tenant_id=p_tenant and id=(p_data->>'endpoint_id')::uuid for update;
  if not found then raise exception 'not_found' using errcode='P0002';end if;
  if w.revision is distinct from (p_data->>'revision')::integer then raise exception 'revision_conflict' using errcode='23505';end if;
  if w.state='disabled' then raise exception 'webhook_endpoint_disabled' using errcode='23514';end if;
  if p_action='endpoint.update' then
   update public.assessment_webhook_endpoints set events=array(select jsonb_array_elements_text(p_data->'events')),revision=revision+1,updated_at=clock_timestamp() where id=w.id returning * into w;
  elsif p_action='endpoint.rotate' then
   -- The old secret keeps signing for 24 hours so consumers can switch over.
   update public.assessment_webhook_endpoints set previous_secret_ciphertext=secret_ciphertext,previous_secret_expires_at=clock_timestamp()+interval '24 hours',secret_ciphertext=p_data->>'secret_ciphertext',secret_version=secret_version+1,revision=revision+1,updated_at=clock_timestamp() where id=w.id returning * into w;
  else
   update public.assessment_webhook_endpoints set state='disabled',revision=revision+1,updated_at=clock_timestamp() where id=w.id returning * into w;
   update public.assessment_webhook_deliveries set state='dead',last_error='endpoint disabled',lease_token=null,leased_until=null where endpoint_id=w.id and state in('pending','delivering');
  end if;
 elsif p_action='delivery.replay' then
  select * into d from public.assessment_webhook_deliveries where tenant_id=p_tenant and id=(p_data->>'delivery_id')::uuid for update;
  if not found then raise exception 'not_found' using errcode='P0002';end if;
  select * into w from public.assessment_webhook_endpoints where id=d.endpoint_id;
  if d.state<>'dead' or w.state<>'active' then raise exception 'webhook_replay_not_applicable' using errcode='23514';end if;
  update public.assessment_webhook_deliveries set state='pending',attempts=0,next_attempt_at=clock_timestamp(),last_error=null where id=d.id;
  result:=jsonb_build_object('delivery_id',d.id,'state','pending');
 else raise exception 'unknown_action' using errcode='22023';end if;
 result:=coalesce(result,jsonb_build_object('id',w.id,'url',w.url,'events',to_jsonb(w.events),'state',w.state,'revision',w.revision,'secret_version',w.secret_version,'secret_check',encode(sha256(convert_to(w.secret_ciphertext,'UTF8')),'hex')));
 insert into public.assessment_webhook_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'webhook.'||p_action,case when p_action='delivery.replay' then d.id else w.id end,result);
 return result;
end;$$;

create function public.assessment_webhook_read(p_actor uuid,p_tenant uuid,p_kind text,p_endpoint uuid,p_before timestamptz,p_before_id uuid,p_limit integer) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare lim integer:=least(greatest(coalesce(p_limit,50),1),100);begin
 if not public.assessment_has_capability(p_tenant,p_actor,'team.manage') then raise exception 'forbidden' using errcode='42501';end if;
 if p_kind='endpoints' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'url',url,'events',to_jsonb(events),'state',state,'revision',revision,'secret_version',secret_version,'rotating_until',previous_secret_expires_at,'created_at',created_at) order by created_at desc) from public.assessment_webhook_endpoints where tenant_id=p_tenant),'[]'::jsonb);
 elsif p_kind='deliveries' then
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from(
   select d.id,d.endpoint_id,d.state,d.attempts,d.next_attempt_at,d.last_status,d.last_error,d.delivered_at,d.created_at,e.id event_id,e.type event_type,e.sequence
   from public.assessment_webhook_deliveries d join public.assessment_events e on e.id=d.event_id
   where d.tenant_id=p_tenant and (p_endpoint is null or d.endpoint_id=p_endpoint) and (p_before is null or (d.created_at,d.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by d.created_at desc,d.id desc limit lim) x),'[]'::jsonb);
 end if;
 raise exception 'unknown_kind' using errcode='22023';
end;$$;

-- Delivery plane (service only). Leases are fenced by token; a late report
-- from an expired lease cannot overwrite a newer outcome.
create function public.assessment_webhook_claim(p_limit integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rows jsonb;begin
 with due as(
  select d.id from public.assessment_webhook_deliveries d
  where (d.state='pending' and d.next_attempt_at<=clock_timestamp()) or (d.state='delivering' and d.leased_until<clock_timestamp())
  order by d.next_attempt_at limit least(greatest(coalesce(p_limit,25),1),100) for update skip locked
 ),leased as(
  update public.assessment_webhook_deliveries d set state='delivering',lease_token=gen_random_uuid(),leased_until=clock_timestamp()+interval '2 minutes',attempts=d.attempts+1
  from due where d.id=due.id returning d.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('delivery_id',l.id,'lease_token',l.lease_token,'attempt',l.attempts,'url',w.url,
  'secret_ciphertext',w.secret_ciphertext,'previous_secret_ciphertext',case when w.previous_secret_expires_at>clock_timestamp() then w.previous_secret_ciphertext end,
  'event',jsonb_build_object('id',e.id,'type',e.type,'sequence',e.sequence,'tenant_id',e.tenant_id,'occurred_at',e.occurred_at,'data',e.data))),'[]'::jsonb) into rows
 from leased l join public.assessment_webhook_endpoints w on w.id=l.endpoint_id join public.assessment_events e on e.id=l.event_id;
 return rows;
end;$$;
create function public.assessment_webhook_report(p_delivery uuid,p_lease uuid,p_status integer,p_error text,p_retry_seconds integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.assessment_webhook_deliveries;begin
 select * into d from public.assessment_webhook_deliveries where id=p_delivery for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if d.state<>'delivering' or d.lease_token is distinct from p_lease then return jsonb_build_object('accepted',false,'state',d.state);end if;
 if p_status between 200 and 299 then
  update public.assessment_webhook_deliveries set state='delivered',delivered_at=clock_timestamp(),last_status=p_status,last_error=null,lease_token=null,leased_until=null where id=d.id returning * into d;
 else
  update public.assessment_webhook_deliveries set state=case when d.attempts>=8 then 'dead' else 'pending' end,
   next_attempt_at=clock_timestamp()+make_interval(secs=>least(greatest(coalesce(p_retry_seconds,60),1),21600)),
   last_status=p_status,last_error=left(coalesce(p_error,'delivery failed'),500),lease_token=null,leased_until=null where id=d.id returning * into d;
 end if;
 return jsonb_build_object('accepted',true,'state',d.state);
end;$$;

revoke all on function public.assessment_event_emit(uuid,text,uuid,jsonb,timestamptz),public.assessment_event_registration(),public.assessment_event_attempt(),public.assessment_event_release() from public,anon,authenticated,service_role;
revoke all on function public.assessment_webhook_command(uuid,uuid,text,text,jsonb),public.assessment_webhook_read(uuid,uuid,text,uuid,timestamptz,uuid,integer),public.assessment_webhook_claim(integer),public.assessment_webhook_report(uuid,uuid,integer,text,integer) from public,anon,authenticated;
grant execute on function public.assessment_webhook_command(uuid,uuid,text,text,jsonb),public.assessment_webhook_read(uuid,uuid,text,uuid,timestamptz,uuid,integer),public.assessment_webhook_claim(integer),public.assessment_webhook_report(uuid,uuid,integer,text,integer) to service_role;
commit;
