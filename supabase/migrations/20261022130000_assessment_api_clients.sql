begin;
-- Institution service accounts (ENT-02). A client belongs to one tenant, has
-- explicit scopes, and acts with the CURRENT authority of the staff member who
-- created it: if that person loses a capability, the client loses it too.
-- Secrets and access tokens are stored only as SHA-256 hashes; tokens are
-- opaque, short-lived and revocable immediately.

alter table public.assessment_audit_events drop constraint if exists assessment_audit_events_actor_kind_check;
alter table public.assessment_audit_events add constraint assessment_audit_events_actor_kind_check check(actor_kind in('user','system','integration'));
-- Integration actions name the accountable staff member (the client's creator).
alter table public.assessment_audit_events drop constraint if exists assessment_audit_events_check;
alter table public.assessment_audit_events add constraint assessment_audit_events_actor_check check((actor_kind='system' and actor_id is null) or (actor_kind in('user','integration') and actor_id is not null));

create table public.assessment_api_clients(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 name text not null check(length(trim(name)) between 1 and 120),
 scopes text[] not null check(cardinality(scopes) between 1 and 4 and scopes <@ array['registrations:read','registrations:write','results:read','events:read']),
 state text not null default 'active' check(state in('active','revoked')),
 revision integer not null default 1,
 created_by uuid not null references public.users(id),
 created_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 unique(tenant_id,id)
);
create table public.assessment_api_client_secrets(
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.assessment_api_clients(id),
 secret_hash text not null unique check(secret_hash ~ '^[a-f0-9]{64}$'),
 hint text not null check(length(hint)=4),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz
);
create table public.assessment_api_tokens(
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 client_id uuid not null references public.assessment_api_clients(id),
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp()
);
create index assessment_api_tokens_expiry on public.assessment_api_tokens(expires_at);
create table public.assessment_api_commands(
 tenant_id uuid not null,client_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,client_id,idempotency_key)
);
create table public.assessment_api_client_commands(
 tenant_id uuid not null,actor_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key)
);
do $$declare t text;begin foreach t in array array['assessment_api_clients','assessment_api_client_secrets','assessment_api_tokens','assessment_api_commands','assessment_api_client_commands'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end;$$;

-- Staff management (team.manage). The Edge function generates the secret and
-- sends only its hash; the plaintext is shown to the staff member once.
create function public.assessment_api_client_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_api_client_commands;request jsonb;result jsonb;c public.assessment_api_clients;begin
 perform public.assessment_staff_write_fence(p_tenant,p_actor);
 if not public.assessment_has_capability(p_tenant,p_actor,'team.manage') then raise exception 'forbidden' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data-'secret_hash'-'hint');
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||':api-client:'||p_key,0));
 select * into prior from public.assessment_api_client_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='client.create' then
  if (select count(*) from public.assessment_api_clients where tenant_id=p_tenant and state='active')>=20 then raise exception 'api_client_limit' using errcode='23514';end if;
  insert into public.assessment_api_clients(tenant_id,name,scopes,created_by) values(p_tenant,trim(p_data->>'name'),array(select jsonb_array_elements_text(p_data->'scopes') order by 1),p_actor) returning * into c;
  insert into public.assessment_api_client_secrets(client_id,secret_hash,hint) values(c.id,p_data->>'secret_hash',p_data->>'hint');
 else
  select * into c from public.assessment_api_clients where tenant_id=p_tenant and id=(p_data->>'client_id')::uuid for update;
  if not found then raise exception 'not_found' using errcode='P0002';end if;
  if c.revision is distinct from (p_data->>'revision')::integer then raise exception 'revision_conflict' using errcode='23505';end if;
  if c.state<>'active' then raise exception 'api_client_revoked' using errcode='23514';end if;
  if p_action='client.rotate' then
   -- The previous secret keeps working for 24 hours, then expires.
   update public.assessment_api_client_secrets set expires_at=least(coalesce(expires_at,'infinity'),clock_timestamp()+interval '24 hours') where client_id=c.id;
   insert into public.assessment_api_client_secrets(client_id,secret_hash,hint) values(c.id,p_data->>'secret_hash',p_data->>'hint');
   update public.assessment_api_clients set revision=revision+1 where id=c.id returning * into c;
  elsif p_action='client.update' then
   update public.assessment_api_clients set scopes=array(select jsonb_array_elements_text(p_data->'scopes') order by 1),revision=revision+1 where id=c.id returning * into c;
  elsif p_action='client.revoke' then
   update public.assessment_api_clients set state='revoked',revoked_at=clock_timestamp(),revision=revision+1 where id=c.id returning * into c;
   delete from public.assessment_api_tokens where client_id=c.id;
  else raise exception 'unknown_action' using errcode='22023';end if;
 end if;
 result:=jsonb_build_object('id',c.id,'name',c.name,'scopes',to_jsonb(c.scopes),'state',c.state,'revision',c.revision,
  'secret_check',(select secret_hash from public.assessment_api_client_secrets where client_id=c.id order by created_at desc limit 1));
 insert into public.assessment_api_client_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'api.'||p_action,c.id,result-'secret_check');
 return result;
end;$$;
create function public.assessment_api_client_list(p_actor uuid,p_tenant uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$begin
 if not public.assessment_has_capability(p_tenant,p_actor,'team.manage') then raise exception 'forbidden' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'scopes',to_jsonb(c.scopes),'state',c.state,'revision',c.revision,'created_at',c.created_at,'revoked_at',c.revoked_at,
  'secrets',(select jsonb_agg(jsonb_build_object('hint',s.hint,'created_at',s.created_at,'expires_at',s.expires_at) order by s.created_at desc) from public.assessment_api_client_secrets s where s.client_id=c.id and (s.expires_at is null or s.expires_at>clock_timestamp())))
  order by c.created_at desc) from public.assessment_api_clients c where c.tenant_id=p_tenant),'[]'::jsonb);
end;$$;

-- Client credentials → opaque 15-minute token (stored hashed).
create function public.assessment_api_token_issue(p_client uuid,p_secret_hash text,p_token_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.assessment_api_clients;expires timestamptz:=clock_timestamp()+interval '15 minutes';begin
 select k.* into c from public.assessment_api_clients k join public.assessment_api_client_secrets s on s.client_id=k.id
 where k.id=p_client and k.state='active' and s.secret_hash=p_secret_hash and (s.expires_at is null or s.expires_at>clock_timestamp());
 if not found then raise exception 'invalid_client' using errcode='42501';end if;
 delete from public.assessment_api_tokens where client_id=c.id and expires_at<clock_timestamp();
 insert into public.assessment_api_tokens(token_hash,client_id,expires_at) values(p_token_hash,c.id,expires);
 return jsonb_build_object('expires_at',expires,'scopes',to_jsonb(c.scopes),'tenant_id',c.tenant_id);
end;$$;
-- Resolve a token to its client, enforcing scope and the creator's current capability.
create function public.assessment_api_principal(p_token_hash text,p_scope text) returns public.assessment_api_clients language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.assessment_api_clients;capability text:=case when p_scope like 'registrations:%' then 'exams.manage' when p_scope='results:read' then 'results.read' else 'exams.manage' end;begin
 select k.* into c from public.assessment_api_tokens t join public.assessment_api_clients k on k.id=t.client_id where t.token_hash=p_token_hash and t.expires_at>clock_timestamp() and k.state='active';
 if not found then raise exception 'invalid_token' using errcode='42501';end if;
 if not p_scope=any(c.scopes) then raise exception 'insufficient_scope' using errcode='42501';end if;
 if not public.assessment_has_capability(c.tenant_id,c.created_by,capability) then raise exception 'client_owner_lacks_capability' using errcode='42501';end if;
 return c;
end;$$;

-- v1 reads. Keyset paging on stable keys; only released results whose
-- release time has passed, latest generation per attempt.
create function public.assessment_api_read(p_token_hash text,p_kind text,p_filter uuid,p_after text,p_limit integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.assessment_api_clients;lim integer:=least(greatest(coalesce(p_limit,100),1),500);rows jsonb;begin
 if p_kind='registrations' then
  c:=public.assessment_api_principal(p_token_hash,'registrations:read');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb) into rows from(
   select r.id,r.window_id,r.candidate_id,r.extra_seconds,r.created_at from public.assessment_registrations r
   where r.tenant_id=c.tenant_id and (p_filter is null or r.window_id=p_filter) and (p_after is null or r.id>p_after::uuid) order by r.id limit lim) x;
 elsif p_kind='results' then
  c:=public.assessment_api_principal(p_token_hash,'results:read');
  select coalesce(jsonb_agg(to_jsonb(x) order by x.attempt_id),'[]'::jsonb) into rows from(
   select distinct on(a.id) a.id attempt_id,a.registration_id,a.candidate_id,g.window_id,rel.id release_id,rel.release_at,run.generation,
    (select sum((s->>'score')::numeric) from jsonb_array_elements(sr.scores)s) score,(select sum((s->>'max_score')::numeric) from jsonb_array_elements(sr.scores)s) max_score
   from public.assessment_grading_releases rel join public.assessment_grading_runs run on run.id=rel.run_id join public.assessment_attempts a on a.id=run.attempt_id
   join public.assessment_registrations g on g.id=a.registration_id join public.assessment_score_revisions sr on sr.id=rel.score_revision_id
   where rel.tenant_id=c.tenant_id and rel.release_at<=clock_timestamp() and (p_filter is null or g.window_id=p_filter) and (p_after is null or a.id>p_after::uuid)
   order by a.id,run.generation desc limit lim) x;
 elsif p_kind='events' then
  c:=public.assessment_api_principal(p_token_hash,'events:read');
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'type',e.type,'sequence',e.sequence,'created_at',e.occurred_at,'data',e.data) order by e.sequence),'[]'::jsonb) into rows from(
   select * from public.assessment_events e where e.tenant_id=c.tenant_id and e.occurred_at<=clock_timestamp() and (p_after is null or e.sequence>p_after::bigint) order by e.sequence limit lim) e;
 else raise exception 'unknown_kind' using errcode='22023';end if;
 return jsonb_build_object('data',rows,'next_after',case when jsonb_array_length(rows)=lim then rows->(lim-1)->>(case p_kind when 'events' then 'sequence' when 'results' then 'attempt_id' else 'id' end) end);
end;$$;

-- v1 write: create a registration under the creator's current authority.
create function public.assessment_api_command(p_token_hash text,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.assessment_api_clients;prior public.assessment_api_commands;request jsonb;result jsonb;begin
 if p_action<>'registration.create' then raise exception 'unknown_action' using errcode='22023';end if;
 c:=public.assessment_api_principal(p_token_hash,'registrations:write');
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 request:=jsonb_build_object('action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(c.tenant_id::text||c.id::text||':api:'||p_key,0));
 select * into prior from public.assessment_api_commands where tenant_id=c.tenant_id and client_id=c.id and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 result:=public.assessment_command(c.created_by,c.tenant_id,'api:'||c.id::text||':'||p_key,'registration.create',jsonb_build_object('window_id',p_data->>'window_id','candidate_id',p_data->>'candidate_id'));
 insert into public.assessment_api_commands(tenant_id,client_id,idempotency_key,request,result) values(c.tenant_id,c.id,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,actor_kind,action,target_id,details) values(c.tenant_id,c.created_by,'integration','api.registration.create',(result->>'id')::uuid,jsonb_build_object('client_id',c.id));
 return result;
end;$$;

revoke all on function public.assessment_api_principal(text,text) from public,anon,authenticated,service_role;
revoke all on function public.assessment_api_client_command(uuid,uuid,text,text,jsonb),public.assessment_api_client_list(uuid,uuid),public.assessment_api_token_issue(uuid,text,text),public.assessment_api_read(text,text,uuid,text,integer),public.assessment_api_command(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessment_api_client_command(uuid,uuid,text,text,jsonb),public.assessment_api_client_list(uuid,uuid),public.assessment_api_token_issue(uuid,text,text),public.assessment_api_read(text,text,uuid,text,integer),public.assessment_api_command(text,text,text,jsonb) to service_role;
commit;
