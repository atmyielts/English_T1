begin;
-- BANK-02: reviewer comments, change requests and revision conflict fences for
-- question versions. Versions stay immutable: a change request closes a version
-- for approval and the author answers with a new revision.

alter table public.assessment_item_versions drop constraint assessment_item_versions_status_check;
alter table public.assessment_item_versions add constraint assessment_item_versions_status_check
  check (status in ('draft','review','changes_requested','approved','retired'));

create or replace function public.assessment_item_version_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'immutable_item_version' using errcode='23514'; end if;
  if (to_jsonb(new)-array['status','approved_by','approved_at'])<>(to_jsonb(old)-array['status','approved_by','approved_at']) then
    raise exception 'immutable_item_payload' using errcode='23514';
  end if;
  if not ((old.status='draft' and new.status='review') or (old.status='review' and new.status in ('approved','changes_requested')) or (old.status='approved' and new.status='retired')) then
    raise exception 'invalid_item_transition' using errcode='23514';
  end if;
  if old.approved_by is not null and (old.approved_by<>new.approved_by or old.approved_at<>new.approved_at) then
    raise exception 'immutable_approval' using errcode='23514';
  end if;
  return new;
end; $$;

create table public.assessment_item_review_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  item_id uuid not null,
  item_version_id uuid not null,
  author_id uuid not null references public.users(id),
  kind text not null check (kind in ('comment','changes_requested')),
  area text not null check (area in ('general','prompt','options','key','rubric','media','scoring','metadata')),
  body text not null check (length(btrim(body)) between 1 and 5000),
  review_hash text check (review_hash is null or review_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (tenant_id,item_id) references public.assessment_items(tenant_id,id),
  foreign key (tenant_id,item_version_id) references public.assessment_item_versions(tenant_id,id),
  check (kind<>'changes_requested' or review_hash is not null)
);
create index assessment_item_review_comments_item on public.assessment_item_review_comments(tenant_id,item_id,created_at,id);
alter table public.assessment_item_review_comments enable row level security;
revoke all on public.assessment_item_review_comments from public,anon,authenticated;
grant select on public.assessment_item_review_comments to service_role;

create function public.assessment_item_review_comment_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'immutable_review_comment' using errcode='23514'; end; $$;
create trigger assessment_item_review_comment_guard before update or delete on public.assessment_item_review_comments for each row execute function public.assessment_item_review_comment_guard();

alter function public.assessment_command(uuid,uuid,text,text,jsonb) rename to assessment_command_before_item_review;
create function public.assessment_command(p_actor uuid,p_tenant uuid,p_key text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.assessment_commands;iv public.assessment_item_versions;latest public.assessment_item_versions;request jsonb;result jsonb;note text;area text;comment_id uuid;
begin
 if p_action='item.revise' then
  -- A revision names the version it was edited from; a newer version means
  -- someone else revised the question meanwhile.
  if p_data ? 'base_version_id' then
   select * into iv from public.assessment_item_versions where tenant_id=p_tenant and id=(p_data->>'base_version_id')::uuid;
   if not found or iv.item_id<>(p_data->>'item_id')::uuid then raise exception 'not_found' using errcode='P0002';end if;
   perform 1 from public.assessment_items where tenant_id=p_tenant and id=iv.item_id for update;
   select * into latest from public.assessment_item_versions where item_id=iv.item_id order by version desc limit 1;
   if latest.id<>iv.id then
    if exists(select 1 from public.assessment_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key) then null;
    else raise exception 'item_revision_conflict' using errcode='23505';end if;
   end if;
  end if;
  return public.assessment_command_before_item_review(p_actor,p_tenant,p_key,p_action,p_data-'base_version_id');
 elsif p_action='item.approve' then
  select * into iv from public.assessment_item_versions where tenant_id=p_tenant and id=(p_data->>'id')::uuid;
  if found and iv.status='changes_requested' and not exists(select 1 from public.assessment_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key) then raise exception 'invalid_item_transition' using errcode='23514';end if;
  return public.assessment_command_before_item_review(p_actor,p_tenant,p_key,p_action,p_data);
 elsif p_action not in('item.comment','item.request_changes') then
  return public.assessment_command_before_item_review(p_actor,p_tenant,p_key,p_action,p_data);
 end if;
 if p_key is null or length(p_key) not between 8 and 200 then raise exception 'idempotency_key_required' using errcode='22023';end if;
 if p_actor is null or not exists(select 1 from public.users where id=p_actor) then raise exception 'unauthorized' using errcode='42501';end if;
 perform public.assessment_staff_write_fence(p_tenant,p_actor);
 request:=jsonb_build_object('action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_actor::text||p_key,0));
 select * into prior from public.assessment_commands where tenant_id=p_tenant and actor_id=p_actor and idempotency_key=p_key;
 if found then if prior.request<>request then raise exception 'idempotency_conflict' using errcode='23505';end if;return prior.result;end if;
 if p_action='item.request_changes' and not public.assessment_has_capability(p_tenant,p_actor,'items.approve') then raise exception 'forbidden' using errcode='42501';end if;
 if p_action='item.comment' and not public.assessment_has_capability(p_tenant,p_actor,'items.approve') and not public.assessment_has_capability(p_tenant,p_actor,'items.write') then raise exception 'forbidden' using errcode='42501';end if;
 select * into iv from public.assessment_item_versions where tenant_id=p_tenant and id=(p_data->>'id')::uuid for update;
 if not found then raise exception 'not_found' using errcode='P0002';end if;
 note:=btrim(p_data->>'body');if note is null or length(note) not between 1 and 5000 then raise exception 'review_comment_required' using errcode='22023';end if;
 area:=coalesce(p_data->>'area','general');if area not in('general','prompt','options','key','rubric','media','scoring','metadata') then raise exception 'invalid_review_area' using errcode='22023';end if;
 if p_action='item.request_changes' then
  if iv.created_by=p_actor then raise exception 'reviewer_must_differ_from_author' using errcode='23514';end if;
  if iv.status<>'review' then raise exception 'invalid_item_transition' using errcode='23514';end if;
  if p_data->>'review_hash' is null or p_data->>'review_hash'!~'^[a-f0-9]{64}$' then raise exception 'review_required' using errcode='22023';end if;
  update public.assessment_item_versions set status='changes_requested' where id=iv.id;
 elsif iv.status in('approved','retired') then raise exception 'item_review_closed' using errcode='23514';
 end if;
 insert into public.assessment_item_review_comments(tenant_id,item_id,item_version_id,author_id,kind,area,body,review_hash)
 values(p_tenant,iv.item_id,iv.id,p_actor,case when p_action='item.request_changes' then 'changes_requested' else 'comment' end,area,note,case when p_action='item.request_changes' then p_data->>'review_hash' end) returning id into comment_id;
 result:=jsonb_build_object('id',comment_id,'item_version_id',iv.id,'status',case when p_action='item.request_changes' then 'changes_requested' else iv.status end);
 insert into public.assessment_commands(tenant_id,actor_id,idempotency_key,request,result) values(p_tenant,p_actor,p_key,request,result);
 insert into public.assessment_audit_events(tenant_id,actor_id,action,target_id,details) values(p_tenant,p_actor,p_action,iv.id,jsonb_build_object('comment_id',comment_id,'area',area));
 return result;
end;$$;
revoke all on function public.assessment_command_before_item_review(uuid,uuid,text,text,jsonb),public.assessment_item_review_comment_guard() from public,anon,authenticated,service_role;
revoke all on function public.assessment_command(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessment_command(uuid,uuid,text,text,jsonb) to service_role;
commit;
