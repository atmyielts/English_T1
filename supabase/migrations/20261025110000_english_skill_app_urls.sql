-- Point the seven English skill products at their routes inside the one English app.
--
-- The old per-skill hosts (reading.english.schood.online, ...) only 301 to
-- https://english.schood.online/<skill> now; linking there directly saves a
-- redirect and keeps a learner inside the installed app's scope.
--
-- Idempotent: only rewrites an empty, localhost or legacy-subdomain app_url.
-- A value an operator set to anything else is left alone.

do $$
declare
  spec record;
begin
  for spec in
    select *
    from (
      values
        ('0e8ad198-6284-4406-9e07-11ba7da0f42d'::uuid, 'english-reading'::text, 'reading'::text),
        ('f9c4a14b-d5a2-4a66-9cd8-5b3a0d6e7bf1'::uuid, 'english-listening'::text, 'listening'::text),
        ('2f7c2d09-08e4-4f9f-9e8d-4f5916ef8532'::uuid, 'english-writing'::text, 'writing'::text),
        ('94ac6f14-15f3-4f35-a8a2-01f5aaecf66d'::uuid, 'english-speaking'::text, 'speaking'::text),
        ('6c4f0566-6f50-4fb4-b176-c4397ecb8ec5'::uuid, 'english-grammar'::text, 'grammar'::text),
        ('b1c98e87-84d3-4ddc-8f07-c72bcf7a716a'::uuid, 'english-vocabulary'::text, 'vocabulary'::text),
        ('7ce43052-2f35-42ca-b305-0d9c358f73f0'::uuid, 'english-immersion'::text, 'immersion'::text)
    ) as specs(product_id, slug, skill)
  loop
    update public.products
    set metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{app_url}',
      to_jsonb('https://english.schood.online/' || spec.skill),
      true
    )
    where (id = spec.product_id or lower(coalesce(metadata->>'slug', '')) = spec.slug)
      and coalesce(metadata->>'app_url', '') is distinct from 'https://english.schood.online/' || spec.skill
      and (
        nullif(coalesce(metadata->>'app_url', ''), '') is null
        or coalesce(metadata->>'app_url', '') ~* '^https?://(localhost|127\.0\.0\.1)(:\d+)?(/|$)'
        or coalesce(metadata->>'app_url', '') ~* ('^https://' || spec.skill || '\.english\.schood\.online/?$')
      );
  end loop;
end $$;
