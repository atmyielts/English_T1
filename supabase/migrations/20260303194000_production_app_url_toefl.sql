-- Ensure TOEFL iBT product app_url uses production domain when unset/local.

do $$
declare
  localhost_pattern constant text := '^https?://(localhost|127\.0\.0\.1)(:\d+)?(/|$)';
begin
  update public.products
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('app_url', 'https://toefl.schood.online')
  where (
      id = 'b262ffa8-9912-4eba-93d7-58af3164d1cc'
      or lower(coalesce(metadata->>'slug', '')) = 'toefl-ibt-simulator'
    )
    and (
      nullif(coalesce(metadata->>'app_url', ''), '') is null
      or coalesce(metadata->>'app_url', '') ~* localhost_pattern
    );
end $$;
