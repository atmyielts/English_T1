-- Schood AI teacher area: Live Quiz answers and codes, marketplace ratings, copies,
-- verified use and the append-only ledger, the guarded writes and browser isolation.
-- Plain SQL so it runs on PGlite and on a real Postgres (scripts/test-schood-ai-teacher-db.mjs).
-- Runs after the core fixture, the core migration and the teacher migration.
do $$
declare
  teacher constant uuid := '00000000-0000-4000-8000-0000000000a1';
  buyer constant uuid := '00000000-0000-4000-8000-0000000000a2';
  student constant uuid := '00000000-0000-4000-8000-0000000000a3';
  ws uuid;
  buyer_ws uuid;
  gen uuid;
  copy_gen uuid;
  session uuid;
  player uuid;
  other uuid;
  listing public.ai_teacher_listings;
  rated public.ai_teacher_listings;
  copy uuid;
  raised boolean;
  ok boolean;
begin
  ws := (public.ai_ensure_personal_workspace(teacher, 'Teacher')).id;
  buyer_ws := (public.ai_ensure_personal_workspace(buyer, 'Buyer')).id;
  insert into public.ai_pages (workspace_id, owner_id, kind, title, status) values (ws, teacher, 'ielts_reading', 'Aral Sea', 'approved') returning id into gen;
  insert into public.ai_pages (workspace_id, owner_id, kind, title, status) values (buyer_ws, buyer, 'ielts_reading', 'Aral Sea (copy)', 'approved') returning id into copy_gen;

  -- Live Quiz: one open game per code; a finished game frees it.
  insert into public.ai_teacher_quiz_sessions (workspace_id, host_id, page_id, title, code, questions)
  values (ws, teacher, gen, 'Aral Sea', '482913', '[{"id":"q1","prompt":"?","options":[{"id":"A","text":"a"},{"id":"B","text":"b"}],"answer":"A"}]') returning id into session;
  raised := false;
  begin
    insert into public.ai_teacher_quiz_sessions (workspace_id, host_id, title, code, questions) values (ws, teacher, 'Again', '482913', '[{"id":"q1"}]');
  exception when unique_violation then raised := true;
  end;
  assert raised, 'a join code belongs to one open game';

  -- Nicknames are unique per game, whatever the case.
  insert into public.ai_teacher_quiz_players (session_id, user_id, nickname, token_hash) values (session, student, 'Aziz', repeat('a', 64)) returning id into player;
  raised := false;
  begin
    insert into public.ai_teacher_quiz_players (session_id, nickname, token_hash) values (session, 'AZIZ', repeat('b', 64));
  exception when unique_violation then raised := true;
  end;
  assert raised, 'nicknames are unique per game';
  insert into public.ai_teacher_quiz_players (session_id, nickname, token_hash) values (session, 'Malika', repeat('c', 64)) returning id into other;

  -- One answer per player and question; points are added once.
  ok := public.ai_teacher_quiz_answer(session, player, 0, 'A', true, 900);
  assert ok, 'first answer is taken';
  ok := public.ai_teacher_quiz_answer(session, player, 0, 'B', false, 0);
  assert not ok, 'a second answer to the same question is refused';
  assert (select score from public.ai_teacher_quiz_players where id = player) = 900, 'points added once';
  assert (select answered from public.ai_teacher_quiz_players where id = player) = 1 and (select correct from public.ai_teacher_quiz_players where id = player) = 1, 'totals';
  ok := public.ai_teacher_quiz_answer(session, other, 0, 'B', false, 0);
  assert ok and (select score from public.ai_teacher_quiz_players where id = other) = 0, 'wrong answers score nothing';
  ok := public.ai_teacher_quiz_answer(session, player, 0, 'A', true, 999999);
  assert not ok, 'still one answer';
  ok := public.ai_teacher_quiz_answer(session, player, 1, 'A', true, 999999);
  assert ok and (select score from public.ai_teacher_quiz_players where id = player) = 2900, 'points are capped per answer';
  update public.ai_teacher_quiz_players set removed = true where id = other;
  ok := public.ai_teacher_quiz_answer(session, other, 1, 'A', true, 500);
  assert not ok, 'a removed player cannot answer';
  update public.ai_teacher_quiz_sessions set status = 'finished', finished_at = now() where id = session;
  insert into public.ai_teacher_quiz_sessions (workspace_id, host_id, title, code, questions) values (ws, teacher, 'Next game', '482913', '[{"id":"q1"}]');

  -- Channels: only a channel id or a public @username.
  raised := false;
  begin
    insert into public.ai_teacher_channels (workspace_id, owner_id, chat_id, title) values (ws, teacher, '12345', 'Not a channel');
  exception when check_violation then raised := true;
  end;
  assert raised, 'a private chat id is not a channel';
  insert into public.ai_teacher_channels (workspace_id, owner_id, chat_id, title) values (ws, teacher, '@ielts_with_aziza', 'IELTS with Aziza');

  -- Marketplace: ratings replace, totals stay exact.
  insert into public.ai_teacher_listings (seller_workspace_id, seller_id, seller_name, source_page_id, title, kind, level, language, material, status)
  values (ws, teacher, 'Aziza', gen, 'Aral Sea reading', 'ielts_reading', 'B2', 'en', '{"title":"x"}', 'published') returning * into listing;
  rated := public.ai_teacher_rate_listing(listing.id, buyer, 4, 'Good');
  assert rated.rating_sum = 4 and rated.rating_count = 1, 'first rating';
  rated := public.ai_teacher_rate_listing(listing.id, buyer, 2, 'Changed my mind');
  assert rated.rating_sum = 2 and rated.rating_count = 1, 'a second rating replaces the first';
  rated := public.ai_teacher_rate_listing(listing.id, student, 5, null);
  assert rated.rating_sum = 7 and rated.rating_count = 2, 'another person adds';
  -- Erasing a rater's row keeps the totals exact.
  delete from public.ai_teacher_listing_ratings where listing_id = listing.id and user_id = student;
  assert (select rating_sum from public.ai_teacher_listings where id = listing.id) = 2 and (select rating_count from public.ai_teacher_listings where id = listing.id) = 1, 'an erased rating leaves the totals exact';
  rated := public.ai_teacher_rate_listing(listing.id, student, 5, null);
  raised := false;
  begin
    perform public.ai_teacher_rate_listing(listing.id, buyer, 6, null);
  exception when invalid_parameter_value then raised := true;
  end;
  assert raised, 'stars are 1 to 5';

  -- Verified use needs a copy and counts each workspace once.
  ok := public.ai_teacher_record_use(listing.id, buyer_ws, 'live_quiz');
  assert not ok, 'no copy, no verified use';
  copy := public.ai_teacher_add_copy(listing.id, buyer_ws, buyer, copy_gen, 0);
  assert copy is not null, 'copy made';
  assert public.ai_teacher_add_copy(listing.id, buyer_ws, buyer, copy_gen, 0) is null, 'one copy per workspace';
  assert (select copies from public.ai_teacher_listings where id = listing.id) = 1, 'copies counted once';
  ok := public.ai_teacher_record_use(listing.id, buyer_ws, 'live_quiz');
  assert ok, 'first use';
  ok := public.ai_teacher_record_use(listing.id, buyer_ws, 'live_quiz');
  assert not ok, 'the same use again is not counted';
  ok := public.ai_teacher_record_use(listing.id, buyer_ws, 'homework');
  assert ok, 'another kind of use is recorded';
  assert (select usage_count from public.ai_teacher_listings where id = listing.id) = 1, 'usage counts distinct workspaces';

  -- The earnings ledger only grows.
  insert into public.ai_teacher_seller_ledger (listing_id, seller_workspace_id, buyer_workspace_id, gross_uzs, reference) values (listing.id, ws, buyer_ws, 15000, 'sale-1');
  raised := false;
  begin
    update public.ai_teacher_seller_ledger set gross_uzs = 0 where reference = 'sale-1';
  exception when insufficient_privilege then raised := true;
  end;
  assert raised, 'ledger rows cannot change';
  raised := false;
  begin
    delete from public.ai_teacher_seller_ledger where reference = 'sale-1';
  exception when insufficient_privilege then raised := true;
  end;
  assert raised, 'ledger rows cannot be deleted';
  raised := false;
  begin
    insert into public.ai_teacher_seller_ledger (listing_id, seller_workspace_id, buyer_workspace_id, gross_uzs, reference) values (listing.id, ws, buyer_ws, 15000, 'sale-1');
  exception when unique_violation then raised := true;
  end;
  assert raised, 'a sale is recorded once';
  raised := false;
  begin
    update public.ai_teacher_listings set price_uzs = -1 where id = listing.id;
  exception when check_violation then raised := true;
  end;
  assert raised, 'prices are never negative';

  -- Browsers get nothing directly; every table has RLS on.
  assert not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'ai\_teacher\_%' and not c.relrowsecurity
  ), 'RLS is on for every teacher table';
  assert not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name like 'ai\_teacher\_%' and grantee in ('anon', 'authenticated')
  ), 'no table grants to browsers';
  assert not has_function_privilege('authenticated', 'public.ai_teacher_quiz_answer(uuid, uuid, integer, text, boolean, integer)', 'execute'), 'browsers cannot answer for others';
  assert has_function_privilege('service_role', 'public.ai_teacher_quiz_answer(uuid, uuid, integer, text, boolean, integer)', 'execute'), 'the function can';
  assert not has_table_privilege('service_role', 'public.ai_teacher_quiz_answers', 'insert'), 'answers only through the function';
  assert (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'ai\_teacher\_%') = 16, 'sixteen teacher tables';
end $$;

select 'schood ai teacher: ok';
