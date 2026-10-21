begin;
create table public.assessment_invitation_mail(
 id uuid primary key,tenant_id uuid not null,invitation_id uuid not null,requested_by uuid not null references public.users(id),
 kind text not null check(kind in('invitation','reminder')),locale text not null check(locale in('uz','ru','en')),send_after timestamptz not null,
 retry_of uuid references public.assessment_invitation_mail(id),reason text not null check(length(btrim(reason)) between 1 and 5000),created_at timestamptz not null default clock_timestamp(),
 state text not null default 'queued' check(state in('queued','leased','sending','accepted','failed','uncertain','cancelled')),revision bigint not null default 1 check(revision>0),
 attempt_count integer not null default 0 check(attempt_count between 0 and 5),next_attempt_at timestamptz not null,lease_token uuid,lease_until timestamptz,started_at timestamptz,accepted_at timestamptz,last_code text,
 unique(tenant_id,id),foreign key(tenant_id,invitation_id) references public.assessment_staff_invitations(tenant_id,id),
 check((state in('queued','cancelled') and lease_token is null and lease_until is null) or state in('leased','sending','accepted','failed','uncertain')),
 check(state<>'accepted' or accepted_at is not null)
);
create index assessment_invitation_mail_due on public.assessment_invitation_mail(next_attempt_at,id) where state='queued';
create index assessment_invitation_mail_expired on public.assessment_invitation_mail(lease_until,id) where state in('leased','sending');
create index assessment_invitation_mail_history on public.assessment_invitation_mail(tenant_id,invitation_id,id);
create unique index assessment_invitation_mail_replacement on public.assessment_invitation_mail(retry_of) where retry_of is not null;
create table public.assessment_invitation_mail_commands(tenant_id uuid not null,actor_id uuid not null,idempotency_key text not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,idempotency_key));
create table public.assessment_invitation_mail_reports(delivery_id uuid not null references public.assessment_invitation_mail(id),lease_token uuid not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(delivery_id,lease_token));
create trigger assessment_invitation_mail_commands_immutable before update or delete on public.assessment_invitation_mail_commands for each row execute function public.assessment_immutable();
create trigger assessment_invitation_mail_reports_immutable before update or delete on public.assessment_invitation_mail_reports for each row execute function public.assessment_immutable();
create function public.assessment_invitation_mail_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$begin
 if tg_op='DELETE' or new.revision<>old.revision+1 or (to_jsonb(new)-array['state','revision','attempt_count','next_attempt_at','lease_token','lease_until','started_at','accepted_at','last_code']) is distinct from (to_jsonb(old)-array['state','revision','attempt_count','next_attempt_at','lease_token','lease_until','started_at','accepted_at','last_code']) or
 not((old.state='queued' and new.state in('leased','cancelled')) or(old.state='leased' and new.state in('sending','queued','failed','cancelled')) or(old.state='sending' and new.state in('queued','accepted','failed','uncertain')) or(old.state='uncertain' and new.state in('accepted','failed'))) or
 new.attempt_count<>old.attempt_count+(case when old.state='queued' and new.state='leased' then 1 else 0 end) then raise exception 'immutable_invitation_mail' using errcode='23514';end if;return new;
end;$$;
create trigger assessment_invitation_mail_guard before update or delete on public.assessment_invitation_mail for each row execute function public.assessment_invitation_mail_guard();
create function public.assessment_invitation_mail_event(p_delivery uuid,p_action text,p_code text) returns void language sql security definer set search_path=public,pg_temp as $$
 insert into public.assessment_audit_events(tenant_id,actor_kind,action,target_id,details) select tenant_id,'system','staff.mail.'||p_action,id,jsonb_build_object('invitation_id',invitation_id,'code',p_code,'attempt_count',attempt_count) from public.assessment_invitation_mail where id=p_delivery;
$$;
create function public.assessment_invitation_mail_read(p_actor uuid,p_tenant uuid,p_invitation uuid,p_after uuid default null,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$begin
 if not public.assessment_has_capability(p_tenant,p_actor,'team.manage') then raise exception 'invitation_manager_required' using errcode='42501';end if;
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_page_limit' using errcode='22023';end if;
 return(select coalesce(jsonb_agg(to_jsonb(x)-array['lease_token','lease_until'] order by x.id),'[]') from(select * from public.assessment_invitation_mail where tenant_id=p_tenant and invitation_id=p_invitation and (p_after is null or id>p_after) order by id limit p_limit)x);
end;$$;
create function public.assessment_invitation_mail_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare request jsonb:=jsonb_build_object('action',p_action,'data',p_data);prior public.assessment_invitation_mail_commands;i public.assessment_staff_invitations;m public.assessment_invitation_mail;source public.assessment_invitation_mail;due timestamptz;retry_id uuid;result jsonb;begin
 perform public.assessment_staff_write_fence(p_tenant,p_actor);
 if not public.assessment_has_capability(p_tenant,p_actor,'team.manage') then raise exception 'invitation_manager_required' using errcode='42501';end if;
 if p_key is null or length(p_key) not between 8 and 200 or p_action is null or p_action not in('mail.queue','mail.cancel') or jsonb_typeof(p_data) is distinct from 'object' or length(btrim(coalesce(p_data->>'reason',''))) not between 1 and 5000 or p_data->'acknowledged' is distinct from 'true'::jsonb then raise exception 'invalid_invitation_mail_command' using errcode='22023';end if;
 select * into prior from public.assessment_invitation_mail_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='mail.queue' then
  select * into i from public.assessment_staff_invitations where tenant_id=p_tenant and id=(p_data->>'invitation_id')::uuid for share;
  if not found then raise exception 'invitation_not_found' using errcode='P0002';end if;
  if i.created_by<>p_actor or i.state<>'pending' or i.expires_at<=clock_timestamp() then raise exception 'invitation_link_unavailable' using errcode='42501';end if;
  if p_data->>'expected_invitation_revision' is distinct from i.revision::text then raise exception 'invitation_revision_conflict' using errcode='23505';end if;
  perform public.assessment_invitation_delegation(p_actor,p_tenant,i.role_version_id,i.permission_expires_at);
  due:=(p_data->>'send_after')::timestamptz;retry_id:=(p_data->>'retry_of')::uuid;
  if due is null or due<clock_timestamp()-interval '10 minutes' or due>=i.expires_at or p_data->>'kind' is null or p_data->>'kind' not in('invitation','reminder') or p_data->>'locale' is null or p_data->>'locale' not in('uz','ru','en') then raise exception 'invalid_mail_schedule' using errcode='23514';end if;
  if (select count(*) from public.assessment_invitation_mail where invitation_id=i.id and state in('queued','leased','sending'))>=3 or (select count(*) from public.assessment_invitation_mail where invitation_id=i.id and created_at>clock_timestamp()-interval '1 day')>=10 then raise exception 'invitation_mail_limit' using errcode='23514';end if;
  if exists(select 1 from public.assessment_invitation_mail u where u.invitation_id=i.id and u.state='uncertain' and not exists(select 1 from public.assessment_invitation_mail replacement where replacement.retry_of=u.id) and (retry_id is null or retry_id<>u.id)) then raise exception 'mail_uncertainty_review_required' using errcode='23514';end if;
  if retry_id is not null then
   select * into source from public.assessment_invitation_mail where tenant_id=p_tenant and invitation_id=i.id and id=retry_id;
   if not found or source.state not in('failed','uncertain') then raise exception 'mail_retry_source_required' using errcode='23514';end if;
   if p_data->>'expected_source_revision' is distinct from source.revision::text or (source.state='uncertain' and p_data->'possible_duplicate_ack' is distinct from 'true'::jsonb) then raise exception 'mail_uncertainty_review_required' using errcode='23514';end if;
  end if;
  if exists(select 1 from public.assessment_invitation_mail where invitation_id=i.id and state<>'cancelled' and abs(extract(epoch from(send_after-due)))<60) then raise exception 'mail_schedule_too_close' using errcode='23514';end if;
  insert into public.assessment_invitation_mail(id,tenant_id,invitation_id,requested_by,kind,locale,send_after,next_attempt_at,retry_of,reason) values((p_data->>'id')::uuid,p_tenant,i.id,p_actor,p_data->>'kind',p_data->>'locale',due,due,retry_id,p_data->>'reason') returning * into m;
 else
  select * into m from public.assessment_invitation_mail where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;
  if not found then raise exception 'mail_not_found' using errcode='P0002';end if;
  if p_data->>'expected_revision' is distinct from m.revision::text then raise exception 'mail_revision_conflict' using errcode='23505';end if;
  if m.state not in('queued','leased') then raise exception 'mail_handoff_already_started' using errcode='23514';end if;
  update public.assessment_invitation_mail set state='cancelled',revision=revision+1,lease_token=null,lease_until=null,last_code='manager_cancelled' where id=m.id returning * into m;
 end if;
 result:=jsonb_build_object('id',m.id,'state',m.state,'revision',m.revision);
 insert into public.assessment_invitation_mail_commands values(p_tenant,p_actor,p_key,request,result,clock_timestamp());
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,'staff.'||p_action,m.id,jsonb_build_object('invitation_id',m.invitation_id,'reason',p_data->>'reason','retry_of',m.retry_of));
 return result;
end;$$;
create function public.assessment_invitation_mail_claim(p_limit integer default 3) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare m public.assessment_invitation_mail;result jsonb:='[]';begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'invalid_page_limit' using errcode='22023';end if;
 for m in select * from public.assessment_invitation_mail where state in('leased','sending') and lease_until<=clock_timestamp() order by lease_until,id limit 100 for update skip locked loop
  if m.state='sending' then update public.assessment_invitation_mail set state='uncertain',revision=revision+1,last_code='handoff_receipt_missing' where id=m.id;
  else update public.assessment_invitation_mail set state=case when attempt_count>=5 then 'failed' else 'queued' end,revision=revision+1,lease_token=null,lease_until=null,next_attempt_at=clock_timestamp()+interval '30 seconds',last_code='lease_expired_before_handoff' where id=m.id;end if;
  perform public.assessment_invitation_mail_event(m.id,'lease.expired',case when m.state='sending' then 'handoff_receipt_missing' else 'lease_expired_before_handoff' end);
 end loop;
 for m in select * from public.assessment_invitation_mail where state='queued' and next_attempt_at<=clock_timestamp() and attempt_count<5 order by next_attempt_at,id limit p_limit for update skip locked loop
  update public.assessment_invitation_mail set state='leased',revision=revision+1,attempt_count=attempt_count+1,lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes' where id=m.id returning * into m;
  result:=result||jsonb_build_array(jsonb_build_object('id',m.id,'tenant_id',m.tenant_id,'lease_token',m.lease_token));
 end loop;
 return result;
end;$$;
create function public.assessment_invitation_mail_begin(p_tenant uuid,p_id uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare m public.assessment_invitation_mail;i public.assessment_staff_invitations;last_start timestamptz;begin
 select * into m from public.assessment_invitation_mail where tenant_id=p_tenant and id=p_id;
 if not found then raise exception 'mail_not_found' using errcode='P0002';end if;
 perform public.assessment_staff_write_fence(p_tenant,m.requested_by);
 select * into m from public.assessment_invitation_mail where tenant_id=p_tenant and id=p_id for update;
 if m.lease_token is distinct from p_token then raise exception 'invalid_mail_lease' using errcode='23505';end if;
 if m.state<>'leased' then return jsonb_build_object('id',m.id,'state',m.state,'send',false);end if;
 if m.lease_until<=clock_timestamp() then raise exception 'invalid_mail_lease' using errcode='23505';end if;
 select * into i from public.assessment_staff_invitations where tenant_id=p_tenant and id=m.invitation_id for share;
 begin
  if i.state<>'pending' or i.expires_at<=clock_timestamp() or m.requested_by<>i.created_by then raise exception 'invitation_unavailable' using errcode='23514';end if;
  perform public.assessment_invitation_delegation(i.created_by,p_tenant,i.role_version_id,i.permission_expires_at);
 exception when insufficient_privilege or check_violation or no_data_found then
  update public.assessment_invitation_mail set state='cancelled',revision=revision+1,lease_token=null,lease_until=null,last_code='invitation_no_longer_sendable' where id=m.id;
  perform public.assessment_invitation_mail_event(m.id,'cancelled','invitation_no_longer_sendable');return jsonb_build_object('id',m.id,'state','cancelled','send',false);
 end;
 select max(started_at) into last_start from public.assessment_invitation_mail where invitation_id=i.id and id<>m.id;
 if last_start>clock_timestamp()-interval '60 seconds' or exists(select 1 from public.assessment_invitation_mail where invitation_id=i.id and id<>m.id and state='sending') then
  update public.assessment_invitation_mail set state=case when attempt_count>=5 then 'failed' else 'queued' end,revision=revision+1,lease_token=null,lease_until=null,next_attempt_at=greatest(clock_timestamp()+interval '60 seconds',last_start+interval '60 seconds'),last_code='handoff_spacing' where id=m.id returning * into m;
  return jsonb_build_object('id',m.id,'state',m.state,'send',false);
 end if;
 update public.assessment_invitation_mail set state='sending',revision=revision+1,started_at=clock_timestamp(),last_code=null where id=m.id;
 perform public.assessment_invitation_mail_event(m.id,'handoff.started','authorized');
 return jsonb_build_object('id',m.id,'state','sending','send',true,'locale',m.locale,'kind',m.kind,'invitation',public.assessment_invitation_view(i.id),'institution_name',(select coalesce(nullif(to_jsonb(t)->>'name',''),'Institution') from public.tenants t where t.id=p_tenant));
end;$$;
create function public.assessment_invitation_mail_report(p_tenant uuid,p_id uuid,p_token uuid,p_outcome text,p_code text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare m public.assessment_invitation_mail;prior public.assessment_invitation_mail_reports;request jsonb:=jsonb_build_object('outcome',p_outcome,'code',p_code);result jsonb;next_state text;begin
 if p_outcome is null or p_outcome not in('accepted','retry','failed','uncertain') or p_code is null or p_code not in('smtp_accepted','smtp_temporary','smtp_rejected','smtp_connect','smtp_auth','smtp_unknown','begin_unavailable','render_unavailable','smtp_timeout') then raise exception 'invalid_mail_report' using errcode='22023';end if;
 select * into m from public.assessment_invitation_mail where tenant_id=p_tenant and id=p_id for update;if not found then raise exception 'mail_not_found' using errcode='P0002';end if;
 select * into prior from public.assessment_invitation_mail_reports where delivery_id=p_id and lease_token=p_token;
 if found then if prior.request<>request then raise exception 'mail_report_conflict' using errcode='23505';end if;return prior.result;end if;
 if m.lease_token is distinct from p_token or m.state not in('leased','sending','uncertain') or (m.state='leased' and p_outcome not in('retry','failed')) or(m.state='uncertain' and p_outcome not in('accepted','failed')) then raise exception 'invalid_mail_lease' using errcode='23505';end if;
 next_state:=case when p_outcome='retry' then case when m.attempt_count>=5 then 'failed' else 'queued' end else p_outcome end;
 update public.assessment_invitation_mail set state=next_state,revision=revision+1,last_code=p_code,accepted_at=case when next_state='accepted' then clock_timestamp() else null end,next_attempt_at=case when next_state='queued' then clock_timestamp()+make_interval(secs=>least(30*power(2,m.attempt_count-1)::integer,900)) else next_attempt_at end,lease_token=case when next_state='queued' then null else lease_token end,lease_until=case when next_state='queued' then null else lease_until end where id=m.id returning * into m;
 result:=jsonb_build_object('id',m.id,'state',m.state,'revision',m.revision);
 insert into public.assessment_invitation_mail_reports values(m.id,p_token,request,result,clock_timestamp());
 perform public.assessment_invitation_mail_event(m.id,'handoff.'||m.state,p_code);return result;
end;$$;
alter table public.assessment_invitation_mail enable row level security;alter table public.assessment_invitation_mail_commands enable row level security;alter table public.assessment_invitation_mail_reports enable row level security;
revoke all on public.assessment_invitation_mail,public.assessment_invitation_mail_commands,public.assessment_invitation_mail_reports from public,anon,authenticated;
grant all on public.assessment_invitation_mail,public.assessment_invitation_mail_commands,public.assessment_invitation_mail_reports to service_role;
revoke all on function public.assessment_invitation_mail_guard(),public.assessment_invitation_mail_event(uuid,text,text),public.assessment_invitation_mail_read(uuid,uuid,uuid,uuid,integer),public.assessment_invitation_mail_command(uuid,uuid,text,text,jsonb),public.assessment_invitation_mail_claim(integer),public.assessment_invitation_mail_begin(uuid,uuid,uuid),public.assessment_invitation_mail_report(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.assessment_invitation_mail_event(uuid,text,text) from service_role;
grant execute on function public.assessment_invitation_mail_read(uuid,uuid,uuid,uuid,integer),public.assessment_invitation_mail_command(uuid,uuid,text,text,jsonb),public.assessment_invitation_mail_claim(integer),public.assessment_invitation_mail_begin(uuid,uuid,uuid),public.assessment_invitation_mail_report(uuid,uuid,uuid,text,text) to service_role;
commit;
