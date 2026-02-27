-- ============================================================================
-- DEBUG: LIST TRIGGERS
-- ============================================================================

create or replace function public.debug_triggers()
returns table(event_object_schema text, event_object_table text, trigger_name text)
language sql
security definer
set search_path = public
as $$
  select event_object_schema, event_object_table, trigger_name
  from information_schema.triggers
  where event_object_schema in ('auth','public')
  order by event_object_schema, event_object_table, trigger_name;
$$;
