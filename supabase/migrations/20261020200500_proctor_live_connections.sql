begin;
-- Live connections do not grant membership, mutate grades or weaken the
-- existing live-policy launch block. End-to-end live readiness remains gated.
create table public.proctor_live_connections(
 id uuid primary key,tenant_id uuid not null,session_id uuid not null,actor_id uuid not null references public.users(id),
 role text not null check(role in('publisher','viewer')),source text not null check(source in('camera','microphone','screen')),
 publisher_id uuid references public.proctor_live_connections(id),device_id uuid,token_hash text,
 state text not null default 'opening' check(state in('opening','allocated','negotiating','active','closing','closed','faulted')),
 provider_session_id text,provider_app_id text,mid text,track_name text,connected_at timestamptz,last_seen_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '20 seconds',
 revision bigint not null default 1 check(revision>0),created_at timestamptz not null default clock_timestamp(),closed_at timestamptz,last_error text,
 unique(tenant_id,id),foreign key(tenant_id,session_id) references public.proctor_sessions(tenant_id,id),
 check((role='publisher' and publisher_id is null and device_id is not null and token_hash is not null and token_hash~'^[a-f0-9]{64}$') or(role='viewer' and publisher_id is not null and device_id is null and token_hash is null)),
 check(provider_session_id is null or provider_session_id~'^[-a-zA-Z0-9_]{1,200}$'),check((provider_session_id is null and provider_app_id is null) or(provider_session_id is not null and provider_app_id is not null and provider_app_id~'^[-a-zA-Z0-9_]{1,200}$')),check(mid is null or mid~'^[-a-zA-Z0-9_]{1,32}$')
);
create unique index proctor_live_one_current on public.proctor_live_connections(session_id,actor_id,role,source) where state in('opening','allocated','negotiating','active');
create index proctor_live_expiry on public.proctor_live_connections(expires_at,id) where state not in('closed');
create index proctor_live_published on public.proctor_live_connections(tenant_id,session_id,source) where role='publisher' and state='active';
create table public.proctor_live_commands(tenant_id uuid not null,actor_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key));
create trigger proctor_live_commands_immutable before update or delete on public.proctor_live_commands for each row execute function public.assessment_immutable();
create function public.proctor_live_connection_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='DELETE' or old.state='closed' or new.revision<>old.revision+1 or row(new.id,new.tenant_id,new.session_id,new.actor_id,new.role,new.source,new.publisher_id,new.device_id,new.token_hash,new.created_at) is distinct from row(old.id,old.tenant_id,old.session_id,old.actor_id,old.role,old.source,old.publisher_id,old.device_id,old.token_hash,old.created_at) or(old.provider_session_id is not null and row(new.provider_session_id,new.provider_app_id) is distinct from row(old.provider_session_id,old.provider_app_id)) or(old.mid is not null and new.mid is distinct from old.mid) or(old.track_name is not null and new.track_name is distinct from old.track_name) then raise exception 'immutable_live_connection' using errcode='23514';end if;
 return new;
end;$$;
create trigger proctor_live_connection_guard before update or delete on public.proctor_live_connections for each row execute function public.proctor_live_connection_guard();
create function public.proctor_live_eligible(p_tenant uuid,p_session uuid,p_actor uuid,p_role text,p_source text,p_device uuid default null,p_token text default null) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.proctor_sessions s join public.proctor_preparations prep on prep.tenant_id=s.tenant_id and prep.registration_id=s.registration_id and prep.candidate_id=s.candidate_id and prep.policy_id=s.policy_id
 where s.tenant_id=p_tenant and s.id=p_session and s.state in('preparing','active','paused') and s.policy_snapshot->>'mode'='live' and coalesce((s.policy_snapshot->>p_source)::boolean,false)
 and p_source in('camera','microphone','screen') and not coalesce((s.policy_snapshot->>'second_camera')::boolean,false)
 and(case when p_role='publisher' then s.candidate_id=p_actor and exists(select 1 from public.proctor_capture_launches l where l.tenant_id=p_tenant and l.session_id=s.id and l.device_id=p_device and l.token_hash=p_token and l.expires_at>clock_timestamp())
 when p_role='viewer' then s.candidate_id<>p_actor and public.assessment_has_capability(p_tenant,p_actor,'proctor.observe') and public.proctor_can_access(p_tenant,s.id,p_actor,'observer') else false end));
$$;
create function public.proctor_live_projection(p_id uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',id,'tenant_id',tenant_id,'session_id',session_id,'role',role,'source',source,'state',case when state not in('closing','closed','faulted') and expires_at<=clock_timestamp() then 'expired' else state end,'expires_at',expires_at,'server_time',clock_timestamp(),'revision',revision) from public.proctor_live_connections where id=p_id;
$$;
create function public.proctor_live_read(p_actor uuid,p_tenant uuid,p_session uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$begin
 if not exists(select 1 from public.proctor_sessions where tenant_id=p_tenant and id=p_session and candidate_id<>p_actor and public.assessment_has_capability(p_tenant,p_actor,'proctor.observe') and public.proctor_can_access(p_tenant,id,p_actor,'observer')) then raise exception 'live_observer_required' using errcode='42501';end if;
 return(select coalesce(jsonb_agg(public.proctor_live_projection(c.id) order by c.source),'[]') from public.proctor_live_connections c where c.tenant_id=p_tenant and c.session_id=p_session and c.role='publisher' and c.state='active' and c.expires_at>clock_timestamp() and public.proctor_live_eligible(c.tenant_id,c.session_id,c.actor_id,c.role,c.source,c.device_id,c.token_hash));
end;$$;
create function public.proctor_live_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c public.proctor_live_connections;publisher public.proctor_live_connections;prior public.proctor_live_commands;request jsonb:=jsonb_build_object('action',p_action,'data',p_data);result jsonb;sid uuid;begin
 if p_key is null or length(p_key) not between 8 and 200 or p_action is null or p_action not in('connection.open','connection.close') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'invalid_live_command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('proctor-live:'||p_tenant::text||p_actor::text,0));
 if p_action='connection.open' then
  sid:=(p_data->>'session_id')::uuid;
  perform 1 from public.proctor_sessions where tenant_id=p_tenant and id=sid for share;
  perform 1 from public.tenant_memberships where tenant_id=p_tenant and user_id=p_actor for share;
  perform 1 from public.proctor_assignments where tenant_id=p_tenant and session_id=sid and user_id=p_actor for share;
  if not public.proctor_live_eligible(p_tenant,sid,p_actor,p_data->>'role',p_data->>'source',(p_data->>'device_id')::uuid,p_data->>'token_hash') then raise exception 'live_access_denied' using errcode='42501';end if;
  if p_data->>'role'='viewer' then select * into publisher from public.proctor_live_connections where tenant_id=p_tenant and session_id=sid and id=(p_data->>'publisher_id')::uuid and role='publisher' and source=p_data->>'source' and state='active' and expires_at>clock_timestamp() for share;
   if not found or not public.proctor_live_eligible(p_tenant,publisher.session_id,publisher.actor_id,publisher.role,publisher.source,publisher.device_id,publisher.token_hash) then raise exception 'live_source_unavailable' using errcode='23514';end if;
  end if;
 else
  select * into c from public.proctor_live_connections where tenant_id=p_tenant and id=(p_data->>'id')::uuid and actor_id=p_actor for update;
  if not found then raise exception 'live_connection_not_found' using errcode='P0002';end if;
 end if;
 select * into prior from public.proctor_live_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='connection.open' then
  -- Mark expired bindings for cleanup; never pretend their provider tracks closed.
  update public.proctor_live_connections set state='closing',revision=revision+1,last_error='lease_expired' where tenant_id=p_tenant and actor_id=p_actor and state in('opening','allocated','negotiating','active') and expires_at<=clock_timestamp();
  if(select count(*) from public.proctor_live_connections where tenant_id=p_tenant and actor_id=p_actor and state in('opening','allocated','negotiating','active'))>=24 then raise exception 'live_connection_limit' using errcode='23514';end if;
  if(select count(*) from public.proctor_live_connections where tenant_id=p_tenant and actor_id=p_actor and session_id=sid)>=96 then raise exception 'live_connection_restart_limit' using errcode='23514';end if;
  insert into public.proctor_live_connections(id,tenant_id,session_id,actor_id,role,source,publisher_id,device_id,token_hash) values((p_data->>'id')::uuid,p_tenant,sid,p_actor,p_data->>'role',p_data->>'source',publisher.id,(p_data->>'device_id')::uuid,p_data->>'token_hash') returning * into c;
 else
  if c.state<>'closed' and c.state<>'closing' then update public.proctor_live_connections set state='closing',revision=revision+1 where id=c.id returning * into c;end if;
 end if;
 result:=public.proctor_live_projection(c.id);insert into public.proctor_live_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'proctor.live.'||p_action,c.id,jsonb_build_object('session_id',c.session_id,'role',c.role,'source',c.source));return result;
end;$$;
create function public.proctor_live_context(p_tenant uuid,p_id uuid,p_actor uuid default null,p_touch boolean default false) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c public.proctor_live_connections;publisher public.proctor_live_connections;allowed boolean;begin
 select * into c from public.proctor_live_connections where tenant_id=p_tenant and id=p_id for update;if not found or(p_actor is not null and c.actor_id<>p_actor) then raise exception 'live_connection_not_found' using errcode='P0002';end if;
 allowed:=c.state not in('closed','closing','faulted') and c.expires_at>clock_timestamp() and public.proctor_live_eligible(c.tenant_id,c.session_id,c.actor_id,c.role,c.source,c.device_id,c.token_hash);
 if c.role='viewer' then select * into publisher from public.proctor_live_connections where tenant_id=p_tenant and id=c.publisher_id;
  allowed:=allowed and publisher.state='active' and publisher.expires_at>clock_timestamp() and public.proctor_live_eligible(p_tenant,publisher.session_id,publisher.actor_id,publisher.role,publisher.source,publisher.device_id,publisher.token_hash);
 end if;
 if not coalesce(allowed,false) and c.state not in('closing','closed','faulted') then update public.proctor_live_connections set state='closing',revision=revision+1,last_error='live_authority_or_lease_lost' where id=c.id returning * into c;end if;
 if p_touch and allowed then update public.proctor_live_connections set expires_at=clock_timestamp()+interval '20 seconds',last_seen_at=clock_timestamp(),revision=revision+1 where id=c.id returning * into c;end if;
 return public.proctor_live_projection(c.id)||jsonb_build_object('allowed',coalesce(allowed,false),'actor_id',c.actor_id,'provider_session_id',c.provider_session_id,'provider_app_id',c.provider_app_id,'mid',c.mid,'track_name',coalesce(c.track_name,'c-'||c.id::text||'-'||c.source),'publisher_provider_session_id',publisher.provider_session_id,'publisher_provider_app_id',publisher.provider_app_id,'publisher_track_name',publisher.track_name);
end;$$;
create function public.proctor_live_report(p_tenant uuid,p_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare c public.proctor_live_connections;provider text;new_state text;context jsonb;begin
 select * into c from public.proctor_live_connections where tenant_id=p_tenant and id=p_id for update;if not found then raise exception 'live_connection_not_found' using errcode='P0002';end if;
 if p_action is null or p_action not in('allocated','negotiated','connected','faulted','closed') or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'invalid_live_report' using errcode='22023';end if;
 -- Allocation/track receipts survive authority loss so their resources can be
 -- closed. They do not grant access or revive an expired lease.
 if p_action='closed' then
  if c.state='closed' then return public.proctor_live_projection(c.id);end if;
  update public.proctor_live_connections set state='closed',revision=revision+1,closed_at=clock_timestamp() where id=c.id;
 elsif p_action='faulted' then
  if c.state in('closed','closing') then return public.proctor_live_projection(c.id);end if;
  update public.proctor_live_connections set state='faulted',revision=revision+1,last_error=case when p_data->>'code' in('provider_outcome_unknown','provider_rejected','provider_partial','connection_description_lost','relay_outcome_unknown') then p_data->>'code' else 'provider_outcome_unknown' end where id=c.id;
 elsif p_action='allocated' then
  provider:=p_data->>'provider_session_id';if provider is null or provider!~'^[-a-zA-Z0-9_]{1,200}$' or coalesce(p_data->>'provider_app_id','')!~'^[-a-zA-Z0-9_]{1,200}$' or(c.provider_session_id is not null and (c.provider_session_id<>provider or c.provider_app_id is distinct from p_data->>'provider_app_id')) or c.state='closed' then raise exception 'live_provider_binding_conflict' using errcode='23505';end if;
  if c.provider_session_id=provider then return public.proctor_live_projection(c.id);end if;
  update public.proctor_live_connections set provider_session_id=provider,provider_app_id=p_data->>'provider_app_id',state=case when state='opening' then 'allocated' else state end,revision=revision+1 where id=c.id;
 elsif p_action='negotiated' then
  if c.provider_session_id is null or c.state='closed' or coalesce(p_data->>'mid','')!~'^[-a-zA-Z0-9_]{1,32}$' or p_data->>'track_name' is distinct from 'c-'||c.id::text||'-'||c.source then raise exception 'live_track_binding_conflict' using errcode='23505';end if;
  if c.mid=p_data->>'mid' and c.track_name=p_data->>'track_name' then return public.proctor_live_projection(c.id);end if;
  update public.proctor_live_connections set mid=p_data->>'mid',track_name=p_data->>'track_name',state=case when state in('allocated','opening') then 'negotiating' else state end,revision=revision+1 where id=c.id;
 else
  context:=public.proctor_live_context(p_tenant,p_id,null,false);if context->'allowed'<>'true'::jsonb or c.mid is null or c.state not in('negotiating','active') then raise exception 'live_connection_not_ready' using errcode='23514';end if;
  if c.state='active' then return public.proctor_live_projection(c.id);end if;
  update public.proctor_live_connections set state='active',connected_at=coalesce(connected_at,clock_timestamp()),revision=revision+1 where id=c.id;
 end if;
 insert into public.assessment_audit_events(tenant_id,actor_kind,action,target_id,details) values(p_tenant,'system','proctor.live.'||p_action,c.id,jsonb_build_object('session_id',c.session_id,'role',c.role,'source',c.source,'provenance',case when p_action='connected' then 'browser_reported_connection' else 'broker_reported_provider_receipt' end));
 return public.proctor_live_projection(c.id);
end;$$;
alter table public.proctor_live_connections enable row level security;alter table public.proctor_live_commands enable row level security;
revoke all on public.proctor_live_connections,public.proctor_live_commands from public,anon,authenticated;grant all on public.proctor_live_connections,public.proctor_live_commands to service_role;
revoke all on function public.proctor_live_connection_guard(),public.proctor_live_eligible(uuid,uuid,uuid,text,text,uuid,text),public.proctor_live_projection(uuid),public.proctor_live_read(uuid,uuid,uuid),public.proctor_live_command(uuid,uuid,text,text,jsonb),public.proctor_live_context(uuid,uuid,uuid,boolean),public.proctor_live_report(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.proctor_live_eligible(uuid,uuid,uuid,text,text,uuid,text),public.proctor_live_projection(uuid) from service_role;
grant execute on function public.proctor_live_read(uuid,uuid,uuid),public.proctor_live_command(uuid,uuid,text,text,jsonb),public.proctor_live_context(uuid,uuid,uuid,boolean),public.proctor_live_report(uuid,uuid,text,jsonb) to service_role;
commit;
