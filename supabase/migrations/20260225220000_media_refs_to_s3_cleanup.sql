-- ============================================================================
-- MEDIA REFERENCES CLEANUP (ONE-TIME)
-- - Rewrite legacy storage refs to S3-only format.
-- - Normalize media bucket references to schood-project.
-- ============================================================================

create or replace function public.rewrite_media_storage_refs_to_s3(
  p_doc jsonb,
  p_old_buckets text[],
  p_new_bucket text
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_type text;
  v_key text;
  v_val jsonb;
  v_result jsonb;
  v_bucket text;
  v_provider text;
begin
  if p_doc is null then
    return p_doc;
  end if;

  v_type := jsonb_typeof(p_doc);

  if v_type = 'object' then
    v_result := '{}'::jsonb;
    for v_key, v_val in
      select key, value
      from jsonb_each(p_doc)
    loop
      if v_key = 'storage' and jsonb_typeof(v_val) = 'object' then
        v_bucket := trim(coalesce(v_val->>'bucket', ''));
        v_provider := lower(trim(coalesce(v_val->>'provider', '')));

        if v_bucket <> '' and (
          v_bucket = p_new_bucket
          or v_bucket = any(p_old_buckets)
          or v_provider in ('supabase', 'supabase_storage', 'storage', 's3', 'aws', 'aws_s3')
        ) then
          v_val := jsonb_set(v_val, '{bucket}', to_jsonb(p_new_bucket), true);
          v_val := jsonb_set(v_val, '{provider}', '"s3"'::jsonb, true);
        end if;
      else
        v_val := public.rewrite_media_storage_refs_to_s3(v_val, p_old_buckets, p_new_bucket);
      end if;

      v_result := v_result || jsonb_build_object(v_key, v_val);
    end loop;

    return v_result;
  end if;

  if v_type = 'array' then
    return coalesce(
      (
        select jsonb_agg(public.rewrite_media_storage_refs_to_s3(value, p_old_buckets, p_new_bucket))
        from jsonb_array_elements(p_doc)
      ),
      '[]'::jsonb
    );
  end if;

  return p_doc;
end;
$$;

do $$
declare
  v_old_buckets text[] := array[
    'ielts-audio',
    'ielts-assets',
    'ielts-sim-media',
    'schood-platform-media-781729906383'
  ];
  v_new_bucket text := 'schood-project';
  v_assets integer := 0;
  v_units integer := 0;
  v_templates integer := 0;
  v_snapshots integer := 0;
begin
  update public.assets a
  set
    bucket = v_new_bucket,
    metadata = jsonb_set(coalesce(a.metadata, '{}'::jsonb), '{storage_provider}', '"s3"'::jsonb, true)
  where
    a.bucket = v_new_bucket
    or a.bucket = any(v_old_buckets)
    or lower(coalesce(a.metadata->>'storage_provider', '')) in ('supabase', 'supabase_storage', 'storage', 's3', 'aws', 'aws_s3');
  get diagnostics v_assets = row_count;

  with mapped as (
    select
      cu.id,
      public.rewrite_media_storage_refs_to_s3(cu.data, v_old_buckets, v_new_bucket) as next_data
    from public.content_units cu
    where
      cu.data is not null
      and cu.data::text like '%"storage"%'
  )
  update public.content_units cu
  set data = mapped.next_data
  from mapped
  where
    cu.id = mapped.id
    and mapped.next_data is distinct from cu.data;
  get diagnostics v_units = row_count;

  with mapped as (
    select
      stv.id,
      public.rewrite_media_storage_refs_to_s3(stv.section_payload, v_old_buckets, v_new_bucket) as next_payload
    from public.section_template_versions stv
    where stv.section_payload::text like '%"storage"%'
  )
  update public.section_template_versions stv
  set section_payload = mapped.next_payload
  from mapped
  where
    stv.id = mapped.id
    and mapped.next_payload is distinct from stv.section_payload;
  get diagnostics v_templates = row_count;

  with mapped as (
    select
      es.id,
      public.rewrite_media_storage_refs_to_s3(es.payload, v_old_buckets, v_new_bucket) as next_payload
    from public.experience_snapshots es
    where es.payload::text like '%"storage"%'
  )
  update public.experience_snapshots es
  set payload = mapped.next_payload
  from mapped
  where
    es.id = mapped.id
    and mapped.next_payload is distinct from es.payload;
  get diagnostics v_snapshots = row_count;

  raise notice 'media refs migration complete: assets=%, content_units=%, template_versions=%, snapshots=%',
    v_assets, v_units, v_templates, v_snapshots;
end;
$$;
