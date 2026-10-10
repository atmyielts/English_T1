-- Additive, dormant account-closure foundation. The erasure trigger is a
-- separate gate: never switch the endpoint to soft deletion with this alone.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create table if not exists public.account_closure_receipts (
  user_id uuid primary key references public.users(id) on delete restrict,
  closed_at timestamptz not null default now(),
  purge_version integer not null check(purge_version > 0),
  erased_counts jsonb not null default '{}'::jsonb
);
alter table public.account_closure_receipts enable row level security;
revoke all on public.account_closure_receipts from public,anon,authenticated,service_role;
grant select on public.account_closure_receipts to service_role;

create or replace function public.account_is_open()
returns boolean language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists(select 1 from auth.users u where u.id=(select auth.uid()) and u.deleted_at is null)
    and not exists(select 1 from public.account_closure_receipts c where c.user_id=(select auth.uid()));
$$;
revoke all on function public.account_is_open() from public,anon;
grant execute on function public.account_is_open() to authenticated,service_role;

-- An issued JWT survives Auth deletion until its expiry. Existing permissive
-- policies therefore need an additional AND, never another permissive OR.
-- The scalar subquery evaluates the account decision once per statement.
do $$
declare relation_name text;
begin
  for relation_name in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in('r','p') and c.relrowsecurity
    order by c.relname
  loop
    execute format('drop policy if exists account_open_required on public.%I',relation_name);
    execute format('create policy account_open_required on public.%I as restrictive for all to authenticated using ((select public.account_is_open())) with check ((select public.account_is_open()))',relation_name);
  end loop;
end;
$$;

create or replace function public.guard_closed_personal_record()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare actor_id uuid;
begin
  actor_id := (to_jsonb(new)->>tg_argv[0])::uuid;
  if actor_id is not null then
    -- Serialize BEFORE the receipt lookup, not later via the FK. Otherwise a
    -- delayed INSERT can see no receipt, wait on the FK, then recreate PII
    -- after the erasure transaction commits. A fresh statement sees its receipt.
    perform 1 from public.users where id=actor_id for share;
    if exists(select 1 from public.account_closure_receipts where user_id=actor_id) then
      raise exception using errcode='P0001',message='account_closed';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_closed_personal_record() from public,anon,authenticated,service_role;

-- The frozen principal is retained for financial/institutional FKs, not as a
-- mutable profile. Closed principals must not be repopulated by stale workers.
drop trigger if exists account_closed_profile_guard on public.users;
create trigger account_closed_profile_guard before insert or update on public.users
for each row execute function public.guard_closed_personal_record('id');

commit;
