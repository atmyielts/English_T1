-- Product-specific trial overrides on top of global trial defaults.

alter table public.platform_settings
  add column if not exists trial_product_overrides jsonb not null default '{}'::jsonb;

alter table public.platform_settings
  drop constraint if exists platform_settings_trial_product_overrides_is_object;

alter table public.platform_settings
  add constraint platform_settings_trial_product_overrides_is_object
  check (jsonb_typeof(trial_product_overrides) = 'object');
