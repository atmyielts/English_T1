-- ============================================================================
-- UPDATE: SAMPLE IELTS SECTION DURATIONS (MORE REALISTIC DEFAULTS)
-- ============================================================================

update public.sections
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('duration_seconds', 2400)
where id = '44444444-4444-4444-4444-444444444441';

update public.sections
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('duration_seconds', 3600)
where id = '44444444-4444-4444-4444-444444444442';

update public.sections
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('duration_seconds', 3600)
where id = '44444444-4444-4444-4444-444444444443';

