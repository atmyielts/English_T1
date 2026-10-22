begin;
-- Proctor Lite evidence without video: an identity photo when monitoring
-- starts and periodic webcam stills, kept in a private storage bucket for
-- human review and deleted after the policy's retention period unless a
-- review case is still open for the session.

create table public.proctor_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null,
  sequence integer not null check (sequence between 0 and 100000),
  kind text not null check (kind in ('identity','periodic')),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  bytes integer not null check (bytes between 100 and 307200),
  object_path text not null unique,
  captured_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  stored_at timestamptz,
  expires_at timestamptz not null,
  deleted_at timestamptz,
  unique (session_id,sequence),
  unique (tenant_id,id),
  foreign key (tenant_id,session_id) references public.proctor_sessions(tenant_id,id),
  check (sequence > 0 or kind = 'identity')
);
create index proctor_snapshots_session on public.proctor_snapshots(tenant_id,session_id,sequence);
create index proctor_snapshots_expiry on public.proctor_snapshots(expires_at) where deleted_at is null;
alter table public.proctor_snapshots enable row level security;
revoke all on public.proctor_snapshots from public,anon,authenticated;
grant select on public.proctor_snapshots to service_role;

-- Only storage confirmation and deletion move; what was captured never changes.
create function public.proctor_snapshot_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'immutable_snapshot' using errcode='23514'; end if;
  if (to_jsonb(new)-array['stored_at','deleted_at'])<>(to_jsonb(old)-array['stored_at','deleted_at']) then raise exception 'immutable_snapshot' using errcode='23514'; end if;
  if old.stored_at is not null and new.stored_at is distinct from old.stored_at then raise exception 'immutable_snapshot' using errcode='23514'; end if;
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then raise exception 'immutable_snapshot' using errcode='23514'; end if;
  return new;
end; $$;
create trigger proctor_snapshot_guard before update or delete on public.proctor_snapshots for each row execute function public.proctor_snapshot_guard();

-- The candidate reserves a snapshot slot before the bytes are stored, so an
-- unauthorized caller never gets anything written. A retry of the same
-- picture returns the same slot; different content for a used slot is refused.
create function public.proctor_snapshot_reserve(p_actor uuid,p_tenant uuid,p_session uuid,p_sequence integer,p_kind text,p_sha256 text,p_bytes integer,p_captured_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.proctor_sessions;interval_seconds integer;prior public.proctor_snapshots;limit_count integer;days integer;created public.proctor_snapshots;
begin
  select * into s from public.proctor_sessions where tenant_id=p_tenant and id=p_session for share;
  if not found or s.candidate_id<>p_actor then raise exception 'not_found' using errcode='P0002'; end if;
  interval_seconds:=coalesce((s.policy_snapshot->>'snapshot_interval_seconds')::integer,0);
  if interval_seconds<=0 then raise exception 'snapshots_not_required' using errcode='23514'; end if;
  if p_kind not in ('identity','periodic') or (p_kind='identity')<>(p_sequence=0) then raise exception 'invalid_snapshot' using errcode='22023'; end if;
  select * into prior from public.proctor_snapshots where session_id=p_session and sequence=p_sequence;
  if found then
    if prior.sha256<>p_sha256 or prior.bytes<>p_bytes or prior.kind<>p_kind then raise exception 'snapshot_conflict' using errcode='23505'; end if;
    return jsonb_build_object('id',prior.id,'object_path',prior.object_path,'stored',prior.stored_at is not null,'reused',true);
  end if;
  if s.state='completed' and clock_timestamp()>coalesce(s.completed_at,clock_timestamp())+interval '10 minutes' then raise exception 'session_closed' using errcode='23514'; end if;
  if p_captured_at>clock_timestamp()+interval '2 minutes' or p_captured_at<s.created_at-interval '10 minutes' then raise exception 'invalid_snapshot_time' using errcode='22023'; end if;
  -- Bounded by elapsed time: a client cannot flood storage faster than its policy.
  limit_count:=10+ceil(extract(epoch from (clock_timestamp()-s.created_at))/greatest(interval_seconds,10)*1.5)::integer;
  if p_sequence>limit_count then raise exception 'snapshot_rate_exceeded' using errcode='23514'; end if;
  days:=coalesce((s.policy_snapshot->>'identity_retention_days')::integer,30);
  if p_kind='periodic' then days:=coalesce((s.policy_snapshot->>'recording_retention_days')::integer,90); end if;
  insert into public.proctor_snapshots(tenant_id,session_id,sequence,kind,sha256,bytes,object_path,captured_at,expires_at)
  values(p_tenant,p_session,p_sequence,p_kind,p_sha256,p_bytes,p_tenant||'/'||p_session||'/'||lpad(p_sequence::text,6,'0')||'-'||left(p_sha256,16)||'.jpg',p_captured_at,clock_timestamp()+make_interval(days=>days))
  returning * into created;
  return jsonb_build_object('id',created.id,'object_path',created.object_path,'stored',false,'reused',false);
end;$$;

create function public.proctor_snapshot_stored(p_tenant uuid,p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.proctor_snapshots set stored_at=clock_timestamp() where tenant_id=p_tenant and id=p_id and stored_at is null and deleted_at is null;
end;$$;

-- Reviewers see the session's stored snapshots; access follows the session.
create function public.proctor_snapshot_list(p_actor uuid,p_tenant uuid,p_session uuid) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.proctor_can_access(p_tenant,p_session,p_actor) then raise exception 'forbidden' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'sequence',sequence,'kind',kind,'captured_at',captured_at,'received_at',received_at,'object_path',object_path,'expires_at',expires_at) order by sequence)
    from public.proctor_snapshots where tenant_id=p_tenant and session_id=p_session and stored_at is not null and deleted_at is null),'[]');
end;$$;

-- Expired snapshots to delete, skipping sessions with an unresolved review case.
create function public.proctor_snapshot_expired(p_limit integer) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'tenant_id',x.tenant_id,'object_path',x.object_path)),'[]') from (
    select p.id,p.tenant_id,p.object_path from public.proctor_snapshots p
    where p.deleted_at is null and p.expires_at<=clock_timestamp()
      and not exists(select 1 from public.proctor_review_cases c where c.tenant_id=p.tenant_id and c.session_id=p.session_id and c.state<>'resolved')
    order by p.expires_at limit least(greatest(p_limit,1),500)) x;
$$;
create function public.proctor_snapshot_forget(p_ids uuid[]) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  update public.proctor_snapshots set deleted_at=clock_timestamp() where id=any(p_ids) and deleted_at is null and expires_at<=clock_timestamp();
  get diagnostics n=row_count;return n;
end;$$;

revoke all on function public.proctor_snapshot_guard() from public,anon,authenticated,service_role;
revoke all on function public.proctor_snapshot_reserve(uuid,uuid,uuid,integer,text,text,integer,timestamptz),public.proctor_snapshot_stored(uuid,uuid),public.proctor_snapshot_list(uuid,uuid,uuid),public.proctor_snapshot_expired(integer),public.proctor_snapshot_forget(uuid[]) from public,anon,authenticated;
grant execute on function public.proctor_snapshot_reserve(uuid,uuid,uuid,integer,text,text,integer,timestamptz),public.proctor_snapshot_stored(uuid,uuid),public.proctor_snapshot_list(uuid,uuid,uuid),public.proctor_snapshot_expired(integer),public.proctor_snapshot_forget(uuid[]) to service_role;

-- Private bucket where Supabase Storage exists (not in the plain test database).
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('proctor-snapshots','proctor-snapshots',false,307200,array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
end $$;
commit;
