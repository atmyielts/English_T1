-- Keep the learner catalog in step with English content edits.
-- learning_content_registry_items drives Today, Practice and the skill pages,
-- but it was only written by seed migrations: archiving, renaming or re-levelling
-- an article/unit/prompt in admin never reached learners. This trigger copies
-- slug, title, level and status onto the item's existing registry row.
-- (Creating brand-new items stays with the seed migrations / a future editor.)

create or replace function public.sync_english_registry_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.slug is not distinct from old.slug
    and new.title is not distinct from old.title
    and new.level is not distinct from old.level
    and new.status is not distinct from old.status then
    return new;
  end if;

  update public.learning_content_registry_items r
  set
    source_ref = coalesce(nullif(trim(new.slug), ''), r.source_ref),
    title = coalesce(nullif(trim(new.title), ''), r.title),
    cefr_level = case when new.level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2') then new.level else r.cefr_level end,
    status = case when new.status in ('draft', 'published', 'archived') then new.status else r.status end,
    updated_at = now()
  where r.source_table = tg_table_name
    and r.source_record_id = new.id;

  return new;
end;
$$;

revoke all on function public.sync_english_registry_item() from public, anon, authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'reading_articles',
    'listening_items',
    'writing_prompts',
    'speaking_prompts',
    'grammar_units',
    'immersion_missions',
    'vocabulary_decks'
  ] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_registry_sync', v_table);
    execute format(
      'create trigger %I after update of slug, title, level, status on public.%I
         for each row execute function public.sync_english_registry_item()',
      v_table || '_registry_sync',
      v_table
    );

    -- One-time catch-up for edits made before this trigger existed.
    execute format(
      'update public.learning_content_registry_items r
          set status = c.status, title = c.title, cefr_level = c.level, updated_at = now()
         from public.%I c
        where r.source_table = %L
          and r.source_record_id = c.id
          and c.status in (''draft'', ''published'', ''archived'')
          and c.level in (''A1'', ''A2'', ''B1'', ''B2'', ''C1'', ''C2'')
          and nullif(trim(c.title), '''') is not null
          and (r.status is distinct from c.status
            or r.title is distinct from c.title
            or r.cefr_level is distinct from c.level)',
      v_table,
      v_table
    );
  end loop;
end
$$;
