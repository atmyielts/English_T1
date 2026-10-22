begin;
-- Assessment Cloud is sold to institutions as its own product. Purchases use the
-- existing Click `plan` flow, which writes one tenant-scoped `entitlements` row
-- (resource_type 'product') with `value.limits`. This migration only READS that
-- row; it seeds no plans or prices. Enforcement stays off until Schood support
-- enables it, so deploying this changes no institution's access.
--
-- Metering: one attempt unit per started attempt, reserved at start and
-- consumed when the attempt is submitted or expires. The unit is keyed by the
-- attempt, so retries and replays cannot charge twice, and preparation or a
-- refused start never charges. Support may release a unit (e.g. a technical
-- failure) only with an audited reason.

insert into public.products(id,name,type,status,metadata)
values('a55e5500-0000-4000-8000-00000000c10d','Schood Assessment Cloud','tool','draft','{"service":"assessment-cloud","kind":"institution_service","limits":{"assessment_attempts_monthly":"attempts started per UTC calendar month"}}'::jsonb)
on conflict (id) do nothing;

create function public.assessment_product_id() returns uuid language sql immutable set search_path=public,pg_temp as $$select 'a55e5500-0000-4000-8000-00000000c10d'::uuid$$;

create table public.assessment_service_config(
 key text primary key check(key in('billing.enforced')),
 value jsonb not null,
 updated_by uuid,
 updated_at timestamptz not null default clock_timestamp()
);
insert into public.assessment_service_config(key,value) values('billing.enforced','false'::jsonb);

create table public.assessment_usage_ledger(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 metric text not null check(metric in('attempts')),
 quantity bigint not null check(quantity>0),
 state text not null check(state in('reserved','consumed','released')),
 source_kind text not null check(source_kind in('attempt')),
 source_id uuid not null,
 period_start date not null,
 entitlement_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 settled_at timestamptz,
 unique(tenant_id,metric,source_kind,source_id)
);
create index assessment_usage_ledger_period on public.assessment_usage_ledger(tenant_id,metric,period_start,state);
create index assessment_usage_ledger_page on public.assessment_usage_ledger(tenant_id,created_at desc,id desc);

create table public.assessment_usage_adjustments(
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references public.tenants(id),
 ledger_id uuid not null references public.assessment_usage_ledger(id),
 actor_id uuid not null,
 action text not null check(action in('release','restore')),
 reason text not null check(length(trim(reason)) between 1 and 2000),
 idempotency_key text not null,
 request jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(actor_id,idempotency_key)
);

create table public.assessment_config_commands(
 actor_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,idempotency_key)
);

do $$declare t text;begin foreach t in array array['assessment_service_config','assessment_usage_ledger','assessment_usage_adjustments','assessment_config_commands'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
end loop;end;$$;

create function public.assessment_billing_enforced() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce((select value='true'::jsonb from public.assessment_service_config where key='billing.enforced'),false)
$$;
create function public.assessment_platform_admin(p_actor uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.users u where u.id=p_actor and lower(coalesce(u.role,''))='admin')
$$;
-- The tenant's current Assessment Cloud entitlement, or null.
create function public.assessment_entitlement(p_tenant uuid) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',e.id,'starts_at',e.starts_at,'ends_at',e.ends_at,'plan_id',e.value->>'plan_id','limits',coalesce(e.value->'limits','{}'::jsonb))
 from public.entitlements e
 where e.tenant_id=p_tenant and e.resource_type='product' and e.resource_id=public.assessment_product_id() and e.is_active
   and (e.starts_at is null or e.starts_at<=clock_timestamp()) and (e.ends_at is null or e.ends_at>clock_timestamp())
 order by e.ends_at desc nulls first limit 1
$$;
create function public.assessment_usage_period(p_at timestamptz) returns date language sql immutable set search_path=public,pg_temp as $$
 select date_trunc('month',p_at at time zone 'UTC')::date
$$;

-- New sittings need a current entitlement once enforcement is on.
create function public.assessment_window_entitlement_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin
 if public.assessment_billing_enforced() and public.assessment_entitlement(new.tenant_id) is null then raise exception 'assessment_subscription_required' using errcode='42501';end if;
 return new;
end;$$;
create trigger assessment_window_entitlement_guard before insert on public.assessment_exam_windows for each row execute function public.assessment_window_entitlement_guard();

-- Attempt starts are the metered unit. The advisory lock serialises the quota
-- count with the new reservation for the tenant's whole transaction.
create function public.assessment_attempt_quota_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare e jsonb;quota numeric;used bigint;begin
 if not public.assessment_billing_enforced() then return new;end if;
 e:=public.assessment_entitlement(new.tenant_id);
 if e is null then raise exception 'assessment_subscription_required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text||':assessment-usage:attempts',0));
 if jsonb_typeof(e#>'{limits,assessment_attempts_monthly}')='number' then
  quota:=(e#>>'{limits,assessment_attempts_monthly}')::numeric;
  select coalesce(sum(quantity),0) into used from public.assessment_usage_ledger
   where tenant_id=new.tenant_id and metric='attempts' and period_start=public.assessment_usage_period(clock_timestamp()) and state in('reserved','consumed');
  if used+1>quota then raise exception 'assessment_quota_exhausted' using errcode='23514';end if;
 end if;
 return new;
end;$$;
create trigger assessment_attempt_quota_guard before insert on public.assessment_attempts for each row execute function public.assessment_attempt_quota_guard();

-- Metering is recorded whether or not enforcement is on, so usage is visible
-- before any plan is enforced.
create function public.assessment_attempt_meter() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare e jsonb;begin
 if tg_op='INSERT' then
  e:=public.assessment_entitlement(new.tenant_id);
  insert into public.assessment_usage_ledger(tenant_id,metric,quantity,state,source_kind,source_id,period_start,entitlement_id)
  values(new.tenant_id,'attempts',1,'reserved','attempt',new.id,public.assessment_usage_period(new.starts_at),(e->>'id')::uuid)
  on conflict (tenant_id,metric,source_kind,source_id) do nothing;
 elsif new.state in('submitted','expired') and old.state is distinct from new.state then
  update public.assessment_usage_ledger set state='consumed',settled_at=clock_timestamp()
   where tenant_id=new.tenant_id and metric='attempts' and source_kind='attempt' and source_id=new.id and state='reserved';
 end if;
 return null;
end;$$;
create trigger assessment_attempt_meter_insert after insert on public.assessment_attempts for each row execute function public.assessment_attempt_meter();
create trigger assessment_attempt_meter_state after update of state on public.assessment_attempts for each row execute function public.assessment_attempt_meter();

-- Institution view: entitlement, current-period usage and a keyset page of units.
create function public.assessment_billing_summary(p_actor uuid,p_tenant uuid,p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare e jsonb;period date:=public.assessment_usage_period(clock_timestamp());lim integer:=least(greatest(coalesce(p_limit,50),1),200);rows jsonb;begin
 if not public.assessment_has_capability(p_tenant,p_actor,'team.manage') and not public.assessment_platform_admin(p_actor) then raise exception 'forbidden' using errcode='42501';end if;
 e:=public.assessment_entitlement(p_tenant);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb) into rows from(
  select l.id,l.metric,l.quantity,l.state,l.source_kind,l.source_id,l.period_start,l.created_at,l.settled_at,
   (select jsonb_agg(jsonb_build_object('action',a.action,'reason',a.reason,'at',a.created_at) order by a.created_at) from public.assessment_usage_adjustments a where a.ledger_id=l.id) adjustments
  from public.assessment_usage_ledger l
  where l.tenant_id=p_tenant and (p_before is null or (l.created_at,l.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by l.created_at desc,l.id desc limit lim) x;
 return jsonb_build_object(
  'product_id',public.assessment_product_id(),'enforced',public.assessment_billing_enforced(),'entitlement',e,
  'period_start',period,'period_end',(period+interval '1 month')::date,
  'attempt_limit',case when jsonb_typeof(e#>'{limits,assessment_attempts_monthly}')='number' then (e#>>'{limits,assessment_attempts_monthly}')::integer end,
  'attempts_reserved',(select coalesce(sum(quantity),0) from public.assessment_usage_ledger where tenant_id=p_tenant and metric='attempts' and period_start=period and state='reserved'),
  'attempts_consumed',(select coalesce(sum(quantity),0) from public.assessment_usage_ledger where tenant_id=p_tenant and metric='attempts' and period_start=period and state='consumed'),
  'attempts_released',(select coalesce(sum(quantity),0) from public.assessment_usage_ledger where tenant_id=p_tenant and metric='attempts' and period_start=period and state='released'),
  'units',rows);
end;$$;

-- Schood support adjustment with explicit authority, reason and audit.
create function public.assessment_usage_adjust(p_actor uuid,p_tenant uuid,p_key text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_usage_adjustments;l public.assessment_usage_ledger;request jsonb;result jsonb;action text:=p_data->>'action';begin
 if not public.assessment_platform_admin(p_actor) then raise exception 'forbidden' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 if action not in('release','restore') or jsonb_typeof(p_data->'reason') is distinct from 'string' or length(trim(p_data->>'reason')) not between 1 and 2000 then raise exception 'invalid_adjustment' using errcode='22023';end if;
 request:=jsonb_build_object('tenant_id',p_tenant,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':usage-adjust:'||p_key,0));
 select * into prior from public.assessment_usage_adjustments where actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||':assessment-usage:attempts',0));
 select * into l from public.assessment_usage_ledger where tenant_id=p_tenant and id=(p_data->>'ledger_id')::uuid for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 if action='release' and l.state='released' or action='restore' and l.state<>'released' then raise exception 'adjustment_not_applicable' using errcode='23514';end if;
 update public.assessment_usage_ledger set state=case when action='release' then 'released' else case when exists(select 1 from public.assessment_attempts where id=l.source_id and state in('submitted','expired')) then 'consumed' else 'reserved' end end,settled_at=clock_timestamp() where id=l.id returning * into l;
 result:=jsonb_build_object('ledger_id',l.id,'state',l.state);
 insert into public.assessment_usage_adjustments(tenant_id,ledger_id,actor_id,action,reason,idempotency_key,request,result) values(p_tenant,l.id,p_actor,action,trim(p_data->>'reason'),p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'billing.usage.'||action,l.id,jsonb_build_object('reason',trim(p_data->>'reason'),'state',l.state));
 return result;
end;$$;

-- Turning enforcement on or off is a Schood support decision, audited.
create function public.assessment_billing_configure(p_actor uuid,p_key text,p_enforced boolean,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_config_commands;request jsonb;result jsonb;begin
 if not public.assessment_platform_admin(p_actor) then raise exception 'forbidden' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 or p_enforced is null or p_reason is null or length(trim(p_reason)) not between 1 and 2000 then raise exception 'invalid_configuration' using errcode='22023';end if;
 request:=jsonb_build_object('enforced',p_enforced,'reason',trim(p_reason));
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':billing-config:'||p_key,0));
 select * into prior from public.assessment_config_commands where actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 update public.assessment_service_config set value=to_jsonb(p_enforced),updated_by=p_actor,updated_at=clock_timestamp() where key='billing.enforced';
 result:=jsonb_build_object('enforced',p_enforced);
 insert into public.assessment_config_commands(actor_id,idempotency_key,request,result) values(p_actor,p_key,request,result);
 return result;
end;$$;

revoke all on function public.assessment_window_entitlement_guard(),public.assessment_attempt_quota_guard(),public.assessment_attempt_meter() from public,anon,authenticated,service_role;
revoke all on function public.assessment_billing_enforced(),public.assessment_platform_admin(uuid),public.assessment_entitlement(uuid),public.assessment_billing_summary(uuid,uuid,timestamptz,uuid,integer),public.assessment_usage_adjust(uuid,uuid,text,jsonb),public.assessment_billing_configure(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.assessment_billing_summary(uuid,uuid,timestamptz,uuid,integer),public.assessment_usage_adjust(uuid,uuid,text,jsonb),public.assessment_billing_configure(uuid,text,boolean,text),public.assessment_entitlement(uuid) to service_role;
commit;
