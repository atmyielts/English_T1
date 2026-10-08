begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
-- The legacy "service write" policy had no TO role and also permitted SELECT,
-- exposing every cached learner prediction through browser table grants.
-- Keep existing Edge service-role cache reads/writes compatible; retain all rows privately.
drop policy if exists "Score predictions service write" on public.score_predictions;
revoke all on public.score_predictions from public, anon, authenticated;
do $$
declare columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into columns
    from pg_attribute where attrelid='public.score_predictions'::regclass
      and attnum>0 and not attisdropped;
  execute format('revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s)
    on public.score_predictions from public, anon, authenticated', columns);
end $$;
grant select, insert, update, delete on public.score_predictions to service_role;
commit;
