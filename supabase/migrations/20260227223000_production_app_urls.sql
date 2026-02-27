-- Normalize product app_url metadata from local defaults to production domains.
-- Applies only when current app_url is empty or points to localhost/127.0.0.1.

do $$
declare
  localhost_pattern constant text := '^https?://(localhost|127\.0\.0\.1)(:\d+)?(/|$)';
begin
  update public.products
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('app_url', 'https://ielts.schood.online')
  where (
      id = 'ead05eae-aa97-4bda-a07c-51e5dbb062c0'
      or lower(coalesce(metadata->>'slug', '')) = 'ielts-academic-simulator'
    )
    and (
      nullif(coalesce(metadata->>'app_url', ''), '') is null
      or coalesce(metadata->>'app_url', '') ~* localhost_pattern
    );

  update public.products
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('app_url', 'https://sat.schood.online')
  where (
      id = '5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef'
      or lower(coalesce(metadata->>'slug', '')) = 'sat-exam-simulator'
    )
    and (
      nullif(coalesce(metadata->>'app_url', ''), '') is null
      or coalesce(metadata->>'app_url', '') ~* localhost_pattern
    );

  update public.products
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('app_url', 'https://reading.english.schood.online')
  where (
      id = '0e8ad198-6284-4406-9e07-11ba7da0f42d'
      or lower(coalesce(metadata->>'slug', '')) = 'english-reading'
    )
    and (
      nullif(coalesce(metadata->>'app_url', ''), '') is null
      or coalesce(metadata->>'app_url', '') ~* localhost_pattern
    );
end $$;
