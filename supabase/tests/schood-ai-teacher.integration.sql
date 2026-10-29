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
  insert into public.ai_teacher_seller_ledger (listing_id, listing_title, seller_workspace_id, buyer_workspace_id, gross_uzs, reference) values (listing.id, listing.title, ws, buyer_ws, 15000, 'sale-1');
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
    update public.ai_teacher_seller_ledger set buyer_workspace_id = null, gross_uzs = 1 where reference = 'sale-1';
  exception when insufficient_privilege then raised := true;
  end;
  assert raised, 'unlinking cannot carry another change';
  raised := false;
  begin
    insert into public.ai_teacher_seller_ledger (listing_id, listing_title, seller_workspace_id, buyer_workspace_id, gross_uzs, reference) values (listing.id, listing.title, ws, buyer_ws, 15000, 'sale-1');
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

-- Account closure through auth.users (the core fixture's stand-in for the real
-- closure transaction): the teacher area's personal rows go, the personal
-- workspace's teacher rows go with it, the seller ledger stays unlinked with the
-- listing's title, centre rows stay, and listing totals stay exact.
insert into public.users (id) values ('00000000-0000-4000-8000-0000000000c1'), ('00000000-0000-4000-8000-0000000000c2'), ('00000000-0000-4000-8000-0000000000c3');
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000c1'), ('00000000-0000-4000-8000-0000000000c2'), ('00000000-0000-4000-8000-0000000000c3');
do $$
declare
  leaver constant uuid := '00000000-0000-4000-8000-0000000000c1';
  boss constant uuid := '00000000-0000-4000-8000-0000000000c2';
  rater constant uuid := '00000000-0000-4000-8000-0000000000c3';
  personal uuid := (public.ai_ensure_personal_workspace(leaver, 'Leaver')).id;
  rater_ws uuid := (public.ai_ensure_personal_workspace(rater, 'Rater')).id;
  centre uuid;
  own_listing uuid;
  other_listing uuid;
  own_game uuid;
  centre_game uuid;
  centre_batch uuid;
begin
  assert 'ai_teacher_quiz_players' = any(public.account_personal_erasure_tables()) and 'ai_teacher_listing_ratings' = any(public.account_personal_erasure_tables()), 'teacher personal tables registered';
  insert into public.ai_workspaces (kind, name, owner_id) values ('centre', 'Registan', boss) returning id into centre;
  insert into public.ai_workspace_members (workspace_id, user_id, role) values (centre, boss, 'owner'), (centre, leaver, 'teacher');

  -- In the personal workspace: a published listing with a paid sale, a game, a channel.
  insert into public.ai_teacher_listings (seller_workspace_id, seller_id, seller_name, title, kind, level, language, material, price_uzs, status)
  values (personal, leaver, 'Leaver', 'Paid set', 'ielts_reading', 'B2', 'en', '{"title":"Paid set"}', 15000, 'published') returning id into own_listing;
  insert into public.ai_teacher_seller_ledger (listing_id, listing_title, seller_workspace_id, buyer_workspace_id, gross_uzs, reference) values (own_listing, 'Paid set', personal, rater_ws, 15000, 'sale-leaver');
  insert into public.ai_teacher_quiz_sessions (workspace_id, host_id, title, code, questions) values (personal, leaver, 'Own game', '700001', '[{"id":"q1"}]') returning id into own_game;
  insert into public.ai_teacher_channels (workspace_id, owner_id, chat_id, title) values (personal, leaver, '-1009990001', 'Leaver channel');
  -- In the centre: a game and a marking batch the leaver ran stay with the centre.
  insert into public.ai_teacher_quiz_sessions (workspace_id, host_id, title, code, questions) values (centre, leaver, 'Centre game', '700002', '[{"id":"q1"}]') returning id into centre_game;
  insert into public.ai_teacher_marking_batches (workspace_id, owner_id, title, rubric) values (centre, leaver, 'Mock 3', 'ielts_task2') returning id into centre_batch;
  -- As a player and a rater elsewhere: a nickname in the boss's game and a rating of someone else's listing.
  insert into public.ai_teacher_listings (seller_workspace_id, seller_id, seller_name, title, kind, level, language, material, status)
  values (rater_ws, rater, 'Rater', 'Free set', 'quiz', 'A2', 'en', '{"title":"Free set"}', 'published') returning id into other_listing;
  perform public.ai_teacher_rate_listing(other_listing, leaver, 4, 'Useful');
  perform public.ai_teacher_rate_listing(other_listing, rater, 2, null);
  insert into public.ai_teacher_quiz_players (session_id, user_id, nickname, token_hash) values (centre_game, leaver, 'Leaver', repeat('c', 64));

  update auth.users set deleted_at = now() where id = leaver;
  assert exists (select 1 from public.account_closure_receipts where user_id = leaver), 'closed';
  assert not exists (select 1 from public.ai_workspaces where id = personal), 'personal workspace deleted';
  assert not exists (select 1 from public.ai_teacher_listings where id = own_listing), 'own listing gone with it';
  assert not exists (select 1 from public.ai_teacher_quiz_sessions where id = own_game) and not exists (select 1 from public.ai_teacher_channels where workspace_id = personal), 'personal games and channels gone';
  assert (select listing_id is null and seller_workspace_id is null and buyer_workspace_id = rater_ws and listing_title = 'Paid set' and gross_uzs = 15000 from public.ai_teacher_seller_ledger where reference = 'sale-leaver'), 'the sale stays, unlinked';
  assert exists (select 1 from public.ai_teacher_quiz_sessions where id = centre_game) and exists (select 1 from public.ai_teacher_marking_batches where id = centre_batch), 'centre work stays with the centre';
  assert not exists (select 1 from public.ai_teacher_quiz_players where user_id = leaver), 'their nicknames are gone';
  assert not exists (select 1 from public.ai_teacher_listing_ratings where user_id = leaver), 'their ratings are gone';
  assert (select rating_count = 1 and rating_sum = 2 from public.ai_teacher_listings where id = other_listing), 'listing totals stay exact';
end $$;

select 'schood ai teacher: ok';
