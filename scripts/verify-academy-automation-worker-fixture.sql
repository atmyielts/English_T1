\set ON_ERROR_STOP on

do $$
begin
  if exists (select 1 from public.tenants where id = 'a0000000-0000-4000-8000-000000000001') then
    raise exception 'Automation fixture already exists; run supabase db reset before this proof';
  end if;
end;
$$;

insert into public.tenants (id, name, slug, type)
values ('a0000000-0000-4000-8000-000000000001', 'Automation Worker Proof', 'automation-worker-proof', 'org');

insert into public.academy_sales_pipelines (id, academy_id, pipeline_key, name_i18n, is_default)
values (
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000001',
  'admissions',
  '{"en":"Admissions"}',
  true
);

insert into public.academy_pipeline_stages (
  id, academy_id, pipeline_id, stage_key, label_i18n, position, probability_percent
) values (
  'a0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'new',
  '{"en":"New"}',
  0,
  5
);

insert into public.academy_lead_sources (
  id, academy_id, source_key, label_i18n, category, is_system
) values (
  'a0000000-0000-4000-8000-000000000004',
  'a0000000-0000-4000-8000-000000000001',
  'manual',
  '{"en":"Manual"}',
  'manual',
  true
);

insert into public.academy_automation_rules (
  id, academy_id, rule_key, name, description, is_active
) values (
  'a0000000-0000-4000-8000-000000000005',
  'a0000000-0000-4000-8000-000000000001',
  'contact-new-lead',
  'Contact new lead',
  'Repeatable local worker proof',
  true
);

insert into public.academy_automation_rule_versions (
  id, academy_id, rule_id, version, trigger_key, condition_tree, actions,
  safeguard_mode, status, effective_from, idempotency_key
) values (
  'a0000000-0000-4000-8000-000000000006',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000005',
  1,
  'lead.created',
  '{"all":[]}',
  '[{"type":"create_task","payload":{"title":"Contact new lead","priority":"high","category":"admissions"}}]',
  'standard',
  'active',
  now() - interval '1 minute',
  'automation-worker-proof:v1'
);

insert into public.academy_leads (
  id, academy_id, pipeline_id, current_stage_id, source_id, full_name, phone,
  idempotency_key
) values (
  'a0000000-0000-4000-8000-000000000007',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000003',
  'a0000000-0000-4000-8000-000000000004',
  'Automation Proof Lead',
  '+998901234567',
  'automation-worker-proof:lead'
);

do $$
begin
  if (select count(*) from public.domain_event_outbox
      where event_type = 'lead.created'
        and payload @> '{"academy_id":"a0000000-0000-4000-8000-000000000001","academy_automation_event":true}') <> 1 then
    raise exception 'Expected exactly one durable lead.created automation event';
  end if;
end;
$$;

select 'ACADEMY_AUTOMATION_FIXTURE_OK' as result;
