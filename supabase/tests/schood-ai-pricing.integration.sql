-- Integration test for 20261030500000_schood_ai_pricing.sql. Runs after the Schood AI core
-- migrations, the pricing migration (twice) and the coach migrations, on PGlite and on a
-- throwaway Postgres (scripts/test-schood-ai-pricing-db.mjs).
do $$
declare
  u1 constant uuid := '00000000-0000-4000-8000-0000000000a1';
  u2 constant uuid := '00000000-0000-4000-8000-0000000000a2';
  u3 constant uuid := '00000000-0000-4000-8000-0000000000a3';
  u4 constant uuid := '00000000-0000-4000-8000-0000000000a4';
  t1 constant uuid := '00000000-0000-4000-8000-0000000001a1';
  t2 constant uuid := '00000000-0000-4000-8000-0000000001a2';
  plus_product constant uuid := md5('schood-product:schood-ai-plus')::uuid;
  credits_product constant uuid := md5('schood-product:schood-ai-credits')::uuid;
  gift_product constant uuid := md5('schood-product:schood-ai-gift')::uuid;
  pay uuid;
  pay2 uuid;
  reply jsonb;
  ws uuid;
  gift uuid;
  hash text := repeat('ab', 32);
  t text;
  ends timestamptz;
  team uuid;
  raised boolean;
begin
  -- 1. The catalogue: everything inactive, the doc's prices, deterministic ids.
  assert (select count(*) from public.products where metadata->>'service' = 'schood-ai') = 17, '17 Schood AI products';
  assert not exists (select 1 from public.products where metadata->>'service' = 'schood-ai' and status <> 'draft'), 'every product ships as a draft';
  assert (select count(*) from public.plans where metadata->>'service' = 'schood-ai') = 28, '28 Schood AI plans';
  assert not exists (select 1 from public.plans where metadata->>'service' = 'schood-ai' and is_active), 'every plan ships inactive';
  assert (select amount from public.plans where id = md5('schood-plan:schood-ai-plus-30')::uuid) = 49000, 'Plus 49,000';
  assert (select amount from public.plans where id = md5('schood-plan:schood-ai-plus-90')::uuid) = 129000 and (select duration_days from public.plans where id = md5('schood-plan:schood-ai-plus-90')::uuid) = 90, 'Plus 129,000 / 90 days';
  assert (select amount from public.plans where id = md5('schood-plan:schood-ai-plus-365')::uuid) = 399000, 'Plus Annual 399,000';
  assert (select amount from public.plans where id = md5('schood-plan:schood-ai-family-30')::uuid) = 89000, 'Plus Family 89,000';
  assert (select amount from public.plans where id = md5('schood-plan:schood-ai-family-365')::uuid) = 729000, 'Plus Family Annual 729,000';
  assert (select amount from public.plans where id = md5('schood-plan:schood-ai-teacher-30')::uuid) = 99000, 'Teacher 99,000';
  assert (select amount from public.plans where id = md5('schood-plan:schood-ai-teacher-pro-30')::uuid) = 199000, 'Teacher Pro 199,000';
  assert (select amount from public.plans where id = md5('schood-plan:schood-ai-centre-30')::uuid) = 490000, 'Centre 490,000';
  assert (select amount from public.plans where id = md5('schood-plan:schood-ai-centre-pro-30')::uuid) = 1290000, 'Centre Pro 1,290,000';
  assert (select count(*) from public.plans where metadata->'ai' ? 'coach' and amount = 29000 and duration_days = 30) = 6, 'six coach passes at 29,000 / 30 days';
  assert (select amount from public.plans where id = md5('schood-plan:schood-coach-team-5-30')::uuid) = 5 * 39000, 'a 5-seat team is 5 x 39,000';
  assert (select amount from public.plans where id = md5('schood-plan:schood-ai-credits-1000')::uuid) = 29000 and (select amount from public.plans where id = md5('schood-plan:schood-ai-credits-10000')::uuid) = 149000, 'credit packs';
  assert (select amount from public.plans where id = md5('schood-plan:schood-skill-certificate-sitting')::uuid) = 79000, 'a sitting is 79,000';
  assert (select amount from public.plans where id = md5('schood-plan:schood-ai-centre-teacher-seat-30')::uuid) = 79000 and (select amount from public.plans where id = md5('schood-plan:schood-ai-centre-students-100-30')::uuid) = 59000, 'centre add-ons';
  assert (select duration_days from public.plans where id = md5('schood-plan:schood-ai-credits-1000')::uuid) is null, 'credits have no access days';
  assert (select count(*) from public.plans where metadata->>'service' = 'schood-ai' and metadata->>'grant' = 'manual') = 4, 'centre plans and add-ons are granted by support';
  assert (select jsonb_array_length(metadata->'included_product_ids') from public.plans where id = md5('schood-plan:schood-ai-plus-30')::uuid) = 6, 'Plus includes the six coach passes';
  assert (select jsonb_array_length(metadata->'included_product_ids') from public.plans where id = md5('schood-plan:schood-ai-family-365')::uuid) = 6, 'Family includes the six coach passes';
  assert (select jsonb_array_length(metadata->'bundle_product_ids') from public.products where id = plus_product) = 6, 'Plus is a bundle of the passes';
  assert (select metadata->'included_in_bundles' from public.products where id = md5('schood-product:schood-coach-sales-pass')::uuid) = '["schood-ai-plus", "schood-ai-family"]'::jsonb, 'passes name their bundles';
  assert (select (metadata->>'hidden')::boolean from public.products where id = plus_product) = false, 'Plus is the one card in the service list';
  assert (select count(*) from public.products where metadata->>'service' = 'schood-ai' and (metadata->>'hidden')::boolean) = 16, 'the rest is sold from ai.schood.online/pricing';
  assert (select status from public.products where id = '00000000-0000-4000-8000-00000000c001') = 'active', 'other products are untouched';

  -- 2. Closed to browsers; the function reads, and writes only through the functions below.
  foreach t in array array['ai_pricing_fulfilments', 'ai_pricing_gifts'] loop
    assert (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass), format('%s has RLS', t);
    assert not has_table_privilege('anon', format('public.%I', t), 'select'), format('anon cannot read %s', t);
    assert not has_table_privilege('authenticated', format('public.%I', t), 'select'), format('authenticated cannot read %s', t);
    assert has_table_privilege('service_role', format('public.%I', t), 'select'), format('the function reads %s', t);
    assert not has_table_privilege('service_role', format('public.%I', t), 'insert'), format('the function cannot write %s directly', t);
  end loop;
  assert not has_function_privilege('authenticated', 'public.ai_pricing_fulfil(uuid)', 'execute'), 'browsers cannot fulfil';
  assert not has_function_privilege('service_role', 'public.ai_pricing_launch(boolean)', 'execute'), 'only the database owner launches';
  assert has_function_privilege('service_role', 'public.ai_pricing_redeem(text, uuid, timestamptz)', 'execute'), 'the function redeems';

  -- 3. A credit pack: granted once per payment, as pack credits.
  insert into public.payments (user_id, tenant_id, product_id, plan_id, status, amount) values (u1, t1, credits_product, md5('schood-plan:schood-ai-credits-1000')::uuid, 'pending', 29000) returning id into pay;
  assert public.ai_pricing_fulfil(pay)->>'code' = 'not_paid', 'an unpaid payment is not fulfilled';
  update public.payments set status = 'paid' where id = pay;
  reply := public.ai_pricing_fulfil(pay);
  assert reply->>'ok' = 'true' and reply->>'replayed' = 'false' and (reply->'outcome'->>'credits')::int = 1000, 'the pack is granted';
  ws := (reply->'outcome'->>'workspace_id')::uuid;
  assert (select pack_balance from public.ai_credit_accounts where workspace_id = ws) = 1000, '1,000 pack credits';
  reply := public.ai_pricing_fulfil(pay);
  assert reply->>'replayed' = 'true', 'a second fulfilment is a replay';
  assert (select pack_balance from public.ai_credit_accounts where workspace_id = ws) = 1000, 'still 1,000';
  assert (select count(*) from public.ai_credit_ledger where workspace_id = ws and reference = 'payment:' || pay::text) = 1, 'one ledger row with the payment reference';

  -- Payments Schood AI does not fulfil, and a paid row that does not match its plan.
  insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values (u1, t1, '00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-00000000c002', 'paid') returning id into pay2;
  assert public.ai_pricing_fulfil(pay2)->>'code' = 'not_fulfilled_here', 'other services are fulfilled elsewhere';
  insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values (u1, t1, plus_product, md5('schood-plan:schood-ai-credits-10000')::uuid, 'paid') returning id into pay2;
  assert public.ai_pricing_fulfil(pay2)->>'code' = 'product_mismatch', 'a mismatched row is refused';
  assert (select state from public.ai_pricing_fulfilments where payment_id = pay2) = 'refused', 'and recorded for support';
  assert (select pack_balance from public.ai_credit_accounts where workspace_id = ws) = 1000, 'nothing granted for it';

  -- 4. The sync fulfils a person's paid payments once, and skips refused ones.
  insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values (u1, t1, credits_product, md5('schood-plan:schood-ai-credits-10000')::uuid, 'success');
  insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values (u1, t1, md5('schood-product:schood-skill-certificate')::uuid, md5('schood-plan:schood-skill-certificate-sitting')::uuid, 'completed');
  reply := public.ai_pricing_sync(u1);
  assert jsonb_array_length(reply) = 2, 'two payments synced';
  assert (select pack_balance from public.ai_credit_accounts where workspace_id = ws) = 11000, '10,000 more';
  assert jsonb_array_length(public.ai_pricing_sync(u1)) = 0, 'nothing left to sync';
  assert (select count(*) from public.ai_pricing_fulfilments where user_id = u1 and kind = 'certificate' and outcome->>'ref' like 'pricing:sitting:%') = 1, 'a sitting reference per payment';

  -- 5. A gift of Plus: a code once, redeemed once, by anyone, before it expires.
  insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values (u1, t1, gift_product, md5('schood-plan:schood-ai-gift-plus-30')::uuid, 'paid') returning id into pay;
  reply := public.ai_pricing_fulfil(pay);
  gift := (reply->'outcome'->>'gift_id')::uuid;
  assert gift is not null, 'a gift is issued';
  assert (select expires_at > now() + interval '364 days' from public.ai_pricing_gifts where id = gift), 'it can be redeemed for a year';
  assert public.ai_pricing_redeem(hash, u2)->>'code' = 'gift_not_found', 'no code yet';
  assert public.ai_pricing_gift_set_hash(gift, hash), 'the hash is set';
  assert not public.ai_pricing_gift_set_hash(gift, repeat('cd', 32)), 'and only once';
  -- The recipient already has 10 days of Plus left: the gift adds 30 days to them.
  insert into public.entitlements (user_id, tenant_id, resource_type, resource_id, starts_at, ends_at, source) values (u2, t2, 'product', plus_product, now() - interval '20 days', now() + interval '10 days', 'click');
  reply := public.ai_pricing_redeem(hash, u2);
  assert reply->>'ok' = 'true' and reply->'redemption'->>'kind' = 'plus', 'redeemed';
  select ends_at into ends from public.entitlements where tenant_id = t2 and resource_id = plus_product;
  assert ends between now() + interval '39 days 23 hours' and now() + interval '40 days 1 hour', 'Plus extended by 30 days';
  assert (select source from public.entitlements where tenant_id = t2 and resource_id = plus_product) = 'click', 'the running purchase keeps its source';
  assert (select count(*) from public.entitlements where tenant_id = t2 and source = 'gift' and ends_at > now() + interval '29 days') = 6, 'and the six coach passes come with it';
  assert public.ai_pricing_redeem(hash, u2)->>'replayed' = 'true', 'redeeming again is a replay';
  assert public.ai_pricing_redeem(hash, u3)->>'code' = 'gift_used', 'nobody else can redeem it';
  assert (select count(*) from public.entitlements where tenant_id = '00000000-0000-4000-8000-0000000001a3') = 0, 'nothing for them';

  -- A gift of credits, and an expired gift.
  insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values (u1, t1, gift_product, md5('schood-plan:schood-ai-gift-credits-1000')::uuid, 'paid') returning id into pay;
  gift := (public.ai_pricing_fulfil(pay)->'outcome'->>'gift_id')::uuid;
  perform public.ai_pricing_gift_set_hash(gift, repeat('ef', 32));
  reply := public.ai_pricing_redeem(repeat('ef', 32), u3);
  assert reply->'redemption'->>'credits' = '1000', 'credits redeemed';
  assert (select a.pack_balance from public.ai_credit_accounts a join public.ai_workspaces w on w.id = a.workspace_id where w.owner_id = u3 and w.kind = 'personal') = 1000, 'as pack credits';
  insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values (u1, t1, gift_product, md5('schood-plan:schood-ai-gift-plus-90')::uuid, 'paid') returning id into pay;
  gift := (public.ai_pricing_fulfil(pay)->'outcome'->>'gift_id')::uuid;
  perform public.ai_pricing_gift_set_hash(gift, repeat('12', 32));
  assert public.ai_pricing_redeem(repeat('12', 32), u4, now() + interval '366 days')->>'code' = 'gift_expired', 'an expired gift is refused';
  assert (select status from public.ai_pricing_gifts where id = gift) = 'issued', 'and stays unredeemed';

  -- 6. Coach Team: paid, then named and set up once.
  insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values (u4, '00000000-0000-4000-8000-0000000001a4', md5('schood-product:schood-coach-team')::uuid, md5('schood-plan:schood-coach-team-5-30')::uuid, 'paid') returning id into pay;
  reply := public.ai_pricing_fulfil(pay);
  assert reply->>'state' = 'awaiting_setup', 'waits for the buyer to set it up';
  assert public.ai_pricing_team_setup(pay, u3, 'Not mine', array['sales'])->>'code' = 'not_found', 'only the buyer sets it up';
  assert public.ai_pricing_team_setup(pay, u4, 'Sales floor', array[]::text[])->>'code' = 'invalid_packs', 'at least one coach';
  reply := public.ai_pricing_team_setup(pay, u4, 'Sales floor', array['sales', 'speech']);
  team := (reply->'outcome'->>'team_id')::uuid;
  assert (select seats from public.coach_teams where id = team) = 5 and (select source from public.coach_teams where id = team) = 'order', 'a 5-seat team from an order';
  assert (select role from public.coach_team_members where team_id = team and user_id = u4) = 'manager', 'the buyer manages it';
  assert public.ai_pricing_team_setup(pay, u4, 'Again', array['sales'])->>'replayed' = 'true', 'set up once';
  assert (select count(*) from public.coach_teams where manager_id = u4) = 1, 'one team';
  -- A renewal with 10 seats extends it.
  insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values (u4, '00000000-0000-4000-8000-0000000001a4', md5('schood-product:schood-coach-team')::uuid, md5('schood-plan:schood-coach-team-10-30')::uuid, 'paid') returning id into pay;
  perform public.ai_pricing_fulfil(pay);
  reply := public.ai_pricing_team_setup(pay, u4, null, null, team);
  assert (select seats from public.coach_teams where id = team) = 10, 'more seats';
  assert (select valid_until from public.coach_teams where id = team) > now() + interval '59 days', 'another 30 days';

  -- 7. The scheduled sync picks up what nobody opened.
  insert into public.payments (user_id, tenant_id, product_id, plan_id, status) values (u2, t2, credits_product, md5('schood-plan:schood-ai-credits-1000')::uuid, 'paid');
  reply := public.ai_pricing_sync_due(50);
  assert (reply->>'fulfilled')::int = 1, 'one due payment fulfilled';
  assert (public.ai_pricing_sync_due(50)->>'fulfilled')::int = 0, 'nothing twice';

  -- 8. The launch switch: one call puts self-serve on sale and sets the switch; centre stays manual.
  reply := public.ai_pricing_launch(true);
  assert (select (features->>'pricing.launch')::boolean from public.ai_settings where id = 1), 'the switch is on';
  assert (select status from public.products where id = plus_product) = 'active', 'Plus is on sale';
  assert (select is_active from public.plans where id = md5('schood-plan:schood-ai-plus-365')::uuid), 'Plus Annual is on sale';
  assert (select is_active from public.plans where id = md5('schood-plan:schood-coach-team-20-30')::uuid), 'teams are on sale';
  assert not (select is_active from public.plans where id = md5('schood-plan:schood-ai-centre-30')::uuid), 'Centre stays granted by support';
  assert (select status from public.products where id = md5('schood-product:schood-ai-centre')::uuid) = 'draft', 'and out of the catalogue';
  assert (select count(*) from public.ai_audit_events where event = 'pricing.launch') = 1, 'audited';
  reply := public.ai_pricing_launch(false);
  assert not exists (select 1 from public.plans where metadata->>'service' = 'schood-ai' and is_active), 'off sale again';
  assert not exists (select 1 from public.products where metadata->>'service' = 'schood-ai' and status = 'active'), 'and out of the catalogue';
  assert not ((select features from public.ai_settings where id = 1) ? 'pricing.launch'), 'the switch is cleared';
  assert (select is_active from public.plans where id = '00000000-0000-4000-8000-00000000c002'), 'other plans are untouched';

  -- 9. Account closure: the buyer is unlinked from their fulfilments and gifts; the rows stay.
  assert 'ai_pricing_erase_account' = any(public.account_erasure_service_hooks()), 'the hook is registered';
  insert into auth.users (id) values (u1) on conflict do nothing;
  update auth.users set deleted_at = now() where id = u1;
  assert not exists (select 1 from public.ai_pricing_fulfilments where user_id = u1), 'fulfilments unlinked';
  assert not exists (select 1 from public.ai_pricing_gifts where buyer_id = u1), 'gifts unlinked';
  assert (select count(*) from public.ai_pricing_gifts where buyer_id is null) = 3, 'the gifts stay';
  assert (select status from public.ai_pricing_gifts where id = gift) = 'issued', 'an unredeemed gift stays redeemable';
  assert (public.ai_pricing_erase_account(u1)->>'fulfilments')::int = 0, 'idempotent';
  -- A closed account cannot redeem.
  assert public.ai_pricing_redeem(repeat('12', 32), u1)->>'code' = 'account_inactive', 'closed accounts cannot redeem';
end $$;
select 'schood ai pricing: ok';
