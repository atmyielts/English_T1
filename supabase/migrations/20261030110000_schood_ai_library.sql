-- Schood AI library (T6): pages get a Markdown body with full-text search, the
-- last editor, and one atomic, revision-checked save that keeps version history.
-- Additive to 20261030100000_schood_ai_core.sql. The schood-ai function is the
-- only reader and writer (RLS on, no browser policies).
begin;

alter table public.ai_pages add column if not exists body text not null default '' check (char_length(body) <= 200000);
alter table public.ai_pages add column if not exists updated_by uuid references public.users(id) on delete set null;
-- Simple tokens (no stemming) so Uzbek, Russian and English are all searchable.
alter table public.ai_pages add column if not exists search tsvector
  generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || replace(coalesce(folder, ''), '/', ' ') || ' ' || coalesce(body, ''))) stored;
create index if not exists ai_pages_search_idx on public.ai_pages using gin (search);
-- Lists read this instead of whole bodies.
alter table public.ai_pages add column if not exists excerpt text generated always as (left(regexp_replace(body, '\s+', ' ', 'g'), 240)) stored;
create index if not exists ai_pages_folder_idx on public.ai_pages (workspace_id, folder);
create index if not exists ai_pages_visibility_idx on public.ai_pages (workspace_id, visibility, updated_at desc);

alter table public.ai_page_revisions add column if not exists body text not null default '' check (char_length(body) <= 200000);

-- Saves a page only if it is still at p_expected (two tabs or two teachers can
-- never overwrite each other silently). Before changing it, the previous state is
-- kept as a version when asked (p_snapshot), when someone else edited it last, or
-- when the last version is more than ten minutes old; the newest 200 versions are
-- kept. p_patch holds only the fields to change.
create or replace function public.ai_page_save(p_page uuid, p_expected integer, p_patch jsonb, p_author uuid, p_snapshot boolean default false, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.ai_pages;
  keep boolean;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_patch' using errcode = '22023'; end if;
  select * into p from public.ai_pages where id = p_page for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if p.revision <> p_expected then return jsonb_build_object('ok', false, 'code', 'revision_conflict', 'revision', p.revision); end if;
  keep := p_snapshot
    or p.updated_by is distinct from p_author
    or not exists (select 1 from public.ai_page_revisions r where r.page_id = p_page and r.created_at > p_now - interval '10 minutes');
  if keep then
    insert into public.ai_page_revisions (page_id, revision, title, material, document, body, author_id, created_at)
      values (p.id, p.revision, p.title, p.material, p.document, p.body, p.updated_by, p_now)
      on conflict (page_id, revision) do nothing;
  end if;
  update public.ai_pages set
    title = case when p_patch ? 'title' then p_patch->>'title' else title end,
    body = case when p_patch ? 'body' then p_patch->>'body' else body end,
    material = case when p_patch ? 'material' then nullif(p_patch->'material', 'null'::jsonb) else material end,
    folder = case when p_patch ? 'folder' then p_patch->>'folder' else folder end,
    visibility = case when p_patch ? 'visibility' then p_patch->>'visibility' else visibility end,
    status = case when p_patch ? 'status' then p_patch->>'status' else status end,
    revision = revision + 1, updated_at = p_now, updated_by = p_author
    where id = p_page returning * into p;
  delete from public.ai_page_revisions r where r.page_id = p_page and r.revision < (
    select min(kept.revision) from (select revision from public.ai_page_revisions where page_id = p_page order by revision desc limit 200) kept);
  return jsonb_build_object('ok', true, 'revision', p.revision);
end $$;

revoke all on function public.ai_page_save(uuid, integer, jsonb, uuid, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.ai_page_save(uuid, integer, jsonb, uuid, boolean, timestamptz) to service_role;

commit;
