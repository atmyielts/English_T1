-- Schood AI library: revision-checked saves, version history (snapshot rules and the
-- 200-version limit), full-text search and excerpts, size limits and isolation.
-- Runs after schood-ai-core.integration.sql on PGlite and a real Postgres.
do $$
declare
  teacher constant uuid := '00000000-0000-4000-8000-0000000000a1';
  colleague constant uuid := '00000000-0000-4000-8000-0000000000a4';
  t0 constant timestamptz := '2026-11-03T09:00:00Z';
  ws uuid := (public.ai_ensure_personal_workspace(teacher, 'Teacher')).id;
  page uuid;
  r jsonb;
  raised boolean;
  i integer;
begin
  insert into public.ai_pages (workspace_id, owner_id, kind, title, folder, body, updated_by)
    values (ws, teacher, 'note', 'Samarqand reading', 'Reading/B1', E'Read   the text\n\nabout Samarqand and   Registon.', teacher)
    returning id into page;
  assert (select excerpt from public.ai_pages where id = page) = 'Read the text about Samarqand and Registon.', 'excerpts collapse whitespace';
  assert (select count(*) from public.ai_pages where search @@ websearch_to_tsquery('simple', 'registon')) = 1, 'the body is searchable';
  assert (select count(*) from public.ai_pages where search @@ websearch_to_tsquery('simple', 'reading b1')) = 1, 'title and folder are searchable';

  -- The first save keeps revision 1 as a version.
  r := public.ai_page_save(page, 1, '{"body": "Version two"}', teacher, false, t0);
  assert r = '{"ok": true, "revision": 2}'::jsonb, 'saved at revision 2';
  assert (select body from public.ai_page_revisions where page_id = page and revision = 1) like 'Read   the text%', 'revision 1 kept';
  -- A save that started from revision 1 is a conflict and changes nothing.
  r := public.ai_page_save(page, 1, '{"body": "Stale tab"}', teacher, false, t0);
  assert r = '{"ok": false, "code": "revision_conflict", "revision": 2}'::jsonb, 'stale save refused';
  assert (select body from public.ai_pages where id = page) = 'Version two', 'nothing changed';
  -- Quick saves by the same person do not pile up versions; a snapshot or another editor does.
  r := public.ai_page_save(page, 2, '{"title": "Samarqand reading 2"}', teacher, false, t0 + interval '1 minute');
  assert (select count(*) from public.ai_page_revisions where page_id = page) = 1, 'no version for a quick save';
  r := public.ai_page_save(page, 3, '{"body": "Snapshot"}', teacher, true, t0 + interval '2 minutes');
  assert (select count(*) from public.ai_page_revisions where page_id = page) = 2 and exists (select 1 from public.ai_page_revisions where page_id = page and revision = 3), 'snapshot kept';
  r := public.ai_page_save(page, 4, '{"body": "Colleague edit"}', colleague, false, t0 + interval '3 minutes');
  assert exists (select 1 from public.ai_page_revisions where page_id = page and revision = 4 and author_id = teacher), 'another editor keeps a version';
  assert (select updated_by from public.ai_pages where id = page) = colleague, 'the last editor is recorded';
  r := public.ai_page_save(page, 5, '{"body": "Later"}', colleague, false, t0 + interval '20 minutes');
  assert exists (select 1 from public.ai_page_revisions where page_id = page and revision = 5), 'a version every ten minutes';
  -- Only named fields change; material null clears it; the checks still apply.
  update public.ai_pages set material = '{"items": [1]}' where id = page;
  r := public.ai_page_save(page, 6, '{"material": null, "folder": "Reading", "visibility": "workspace", "status": "approved"}', colleague, false, t0 + interval '21 minutes');
  assert (select material is null and folder = 'Reading' and visibility = 'workspace' and status = 'approved' and title = 'Samarqand reading 2' and body = 'Later' and revision = 7 from public.ai_pages where id = page), 'patch semantics';
  raised := false;
  begin perform public.ai_page_save(page, 7, '{"status": "deleted"}', teacher, false, t0); exception when check_violation then raised := true; end;
  assert raised, 'status check applies';
  raised := false;
  begin perform public.ai_page_save(page, 7, jsonb_build_object('body', repeat('x', 200001)), teacher, false, t0); exception when check_violation then raised := true; end;
  assert raised, 'body limit applies';
  raised := false;
  begin perform public.ai_page_save(page, 7, '[]', teacher, false, t0); exception when invalid_parameter_value then raised := true; end;
  assert raised, 'a patch is an object';
  r := public.ai_page_save(gen_random_uuid(), 1, '{}', teacher, false, t0);
  assert r = '{"ok": false, "code": "not_found"}'::jsonb, 'missing page';

  -- At most the newest 200 versions are kept.
  for i in 7..215 loop
    perform public.ai_page_save(page, i, jsonb_build_object('body', 'v' || i), teacher, true, t0 + interval '1 hour');
  end loop;
  assert (select count(*) from public.ai_page_revisions where page_id = page) = 200, '200 versions kept';
  assert (select min(revision) from public.ai_page_revisions where page_id = page) = 16 and (select revision from public.ai_pages where id = page) = 216, 'the oldest go first';
  delete from public.ai_pages where id = page;
  assert not exists (select 1 from public.ai_page_revisions where page_id = page), 'versions go with the page';
end $$;

set role authenticated;
do $$
begin
  begin perform 1 from public.ai_pages; raise exception 'authenticated read pages'; exception when insufficient_privilege then null; end;
  begin perform public.ai_page_save(gen_random_uuid(), 1, '{}', gen_random_uuid(), false, now()); raise exception 'authenticated saved a page'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$
begin
  begin perform public.ai_page_save(gen_random_uuid(), 1, '{}', gen_random_uuid(), false, now()); raise exception 'anon saved a page'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role service_role;
do $$
begin
  perform public.ai_page_save(gen_random_uuid(), 1, '{}', gen_random_uuid(), false, now());
end $$;
reset role;
select 'schood ai library: ok';
