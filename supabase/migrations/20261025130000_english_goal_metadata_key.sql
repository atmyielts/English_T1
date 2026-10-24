-- Atomic write of one key in learner_language_goals.metadata.
-- ============================================================================
-- The learning engine (supabase/functions/hub/engine.ts) caches per-skill
-- ratings in metadata.skill_ratings and records the progress-check result in
-- metadata.placement_test_result. Writing the whole metadata object from an
-- edge function can overwrite a key another request saved a moment earlier
-- (placement, goal plan, reminders...). This function merges a single key in
-- one statement instead. It only updates an existing row (a learner who has
-- not finished onboarding has nothing to cache) and returns whether it did.
--
-- Called only by edge functions with the service role; no access for anon or
-- authenticated users. Safe to run more than once.
-- ============================================================================

create or replace function public.english_set_goal_metadata_key(
  p_user_id uuid,
  p_language_id uuid,
  p_key text,
  p_value jsonb
) returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_key is null or p_key !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'invalid metadata key';
  end if;
  update public.learner_language_goals
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), array[p_key], coalesce(p_value, 'null'::jsonb), true)
   where user_id = p_user_id
     and language_id = p_language_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.english_set_goal_metadata_key(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.english_set_goal_metadata_key(uuid, uuid, text, jsonb) to service_role;
