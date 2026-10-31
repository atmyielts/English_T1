-- Schood AI: selling (phase 5, docs/product/44_SCHOOD_AI.md "Plans", "Credits",
-- "Selling the coaches", E12 and L18). Prices: the doc's proposed plans table, in UZS,
-- all [ASSUMPTION] until the owner confirms them.
-- ============================================================================
-- 1. Products and plans, seeded INACTIVE: every product is `draft` (the public
--    catalogue only shows `active` products) and every plan `is_active = false`
--    (checkout only sells active plans). Nothing here is on sale until the owner runs
--    `select public.ai_pricing_launch(true);` (section 5), which also sets the launch switch.
--    Ids are deterministic, like the exam bundles: products md5('schood-product:<slug>')::uuid,
--    plans md5('schood-plan:<slug>')::uuid (packages/ai-core/src/catalog.ts holds the same ids).
--    Re-running never reopens, re-prices or re-closes a row: status, is_active and amount
--    are only written on the first insert.
-- 2. Bundles: Plus and Plus Family include the six coach passes (bundle_product_ids on the
--    bundle, included_in_bundles on each pass, included_product_ids on the bundle plans,
--    so payment fulfilment grants the passes with the plan, as for the exam bundles).
-- 3. What Schood AI fulfils itself after a payment is marked paid (the existing Click →
--    payments → entitlements path is not changed): credit packs (pack credits through
--    ai_credit_grant), gift codes (L18), certificate sittings (E12) and Coach Team seats.
--    Each paid payment is fulfilled exactly once (ai_pricing_fulfilments.payment_id is the
--    primary key, claimed in the same transaction as the effect).
-- 4. Gift redemption: once, under a row lock, with an expiry.
-- 5. The launch switch (ai_settings.features['pricing.launch']) and ai_pricing_launch().
-- 6. Account closure: the buyer and the recipient are unlinked from these financial rows.
-- Codex's pending #220 payment migrations (20261010162000-174000) are not touched.
-- ============================================================================
begin;
set local lock_timeout = '5s';

-- --- 1a. Products (draft) ------------------------------------------------------------
with seed(slug, name, type, description, metadata) as (values
  ('schood-ai-plus', 'Schood AI Plus', 'tool',
   'A personal AI tutor that knows your Schood results, with writing, speaking, interview, explanation and planning tools, and all six Telegram coaches.',
   jsonb_build_object('sort_order', 45, 'hidden', false,
     'short_description', 'Your AI tutor across every Schood app, plus all six Telegram coaches.',
     'tagline', 'An AI tutor that knows your results.',
     'bundle_of', jsonb_build_array('schood-coach-ielts-pass', 'schood-coach-speaking-pass', 'schood-coach-maths-pass', 'schood-coach-sales-pass', 'schood-coach-career-pass', 'schood-coach-speech-pass'),
     'bundle_product_ids', jsonb_build_array(md5('schood-product:schood-coach-ielts-pass')::uuid, md5('schood-product:schood-coach-speaking-pass')::uuid, md5('schood-product:schood-coach-maths-pass')::uuid, md5('schood-product:schood-coach-sales-pass')::uuid, md5('schood-product:schood-coach-career-pass')::uuid, md5('schood-product:schood-coach-speech-pass')::uuid),
     'ai_plan', 'plus', 'sale_kind', 'plan', 'grant', 'checkout')),
  ('schood-ai-family', 'Schood AI Plus Family', 'tool',
   'One parent and up to three children: Plus for each child, the weekly parent brief and answers about your child from their own Schood data.',
   jsonb_build_object('sort_order', 46, 'hidden', true,
     'short_description', 'Plus for up to three children, with the weekly parent brief.',
     'bundle_of', jsonb_build_array('schood-coach-ielts-pass', 'schood-coach-speaking-pass', 'schood-coach-maths-pass', 'schood-coach-sales-pass', 'schood-coach-career-pass', 'schood-coach-speech-pass'),
     'bundle_product_ids', jsonb_build_array(md5('schood-product:schood-coach-ielts-pass')::uuid, md5('schood-product:schood-coach-speaking-pass')::uuid, md5('schood-product:schood-coach-maths-pass')::uuid, md5('schood-product:schood-coach-sales-pass')::uuid, md5('schood-product:schood-coach-career-pass')::uuid, md5('schood-product:schood-coach-speech-pass')::uuid),
     'ai_plan', 'family', 'sale_kind', 'plan', 'grant', 'checkout')),
  ('schood-ai-teacher', 'Schood AI Teacher', 'tool',
   'Materials Studio with checked answer keys, marking, feedback, lesson planning, the library, Live Quiz and speaking marking for independent teachers.',
   jsonb_build_object('sort_order', 47, 'hidden', true, 'ai_plan', 'teacher', 'sale_kind', 'plan', 'grant', 'checkout')),
  ('schood-ai-teacher-pro', 'Schood AI Teacher Pro', 'tool',
   'Everything in Teacher plus the Telegram channel autopilot, selling in the materials marketplace and the tutor brand kit.',
   jsonb_build_object('sort_order', 48, 'hidden', true, 'ai_plan', 'teacher_pro', 'sale_kind', 'plan', 'grant', 'checkout')),
  ('schood-ai-centre', 'Schood AI Centre', 'tool',
   'A centre workspace: 5 teacher seats, the Student Assistant for up to 100 students and 10,000 pooled credits a month. Granted by Schood support.',
   jsonb_build_object('sort_order', 49, 'hidden', true, 'ai_plan', 'centre', 'sale_kind', 'plan', 'grant', 'manual')),
  ('schood-ai-centre-pro', 'Schood AI Centre Pro', 'tool',
   'Centre plus the admissions agent, the Monday owner brief, win-back campaigns, curriculum in a box, staff knowledge, white-label and lesson observation. Granted by Schood support.',
   jsonb_build_object('sort_order', 50, 'hidden', true, 'ai_plan', 'centre_pro', 'sale_kind', 'plan', 'grant', 'manual')),
  ('schood-coach-ielts-pass', 'IELTS Coach pass', 'tool', 'Fair use of the IELTS Coach Telegram bot for 30 days.',
   jsonb_build_object('hidden', true, 'coach_feature', 'B1', 'coach_pack', 'ielts', 'sale_kind', 'coach_pass', 'grant', 'checkout', 'included_in_bundles', jsonb_build_array('schood-ai-plus', 'schood-ai-family'))),
  ('schood-coach-speaking-pass', 'English Speaking Partner pass', 'tool', 'Fair use of the English Speaking Partner Telegram bot for 30 days.',
   jsonb_build_object('hidden', true, 'coach_feature', 'B2', 'coach_pack', 'speaking', 'sale_kind', 'coach_pass', 'grant', 'checkout', 'included_in_bundles', jsonb_build_array('schood-ai-plus', 'schood-ai-family'))),
  ('schood-coach-maths-pass', 'Admission Maths Coach pass', 'tool', 'Fair use of the Admission Maths Coach Telegram bot for 30 days.',
   jsonb_build_object('hidden', true, 'coach_feature', 'B3', 'coach_pack', 'maths', 'sale_kind', 'coach_pass', 'grant', 'checkout', 'included_in_bundles', jsonb_build_array('schood-ai-plus', 'schood-ai-family'))),
  ('schood-coach-sales-pass', 'Sales Coach pass', 'tool', 'Fair use of the Sales Coach Telegram bot for 30 days.',
   jsonb_build_object('hidden', true, 'coach_feature', 'B4', 'coach_pack', 'sales', 'sale_kind', 'coach_pass', 'grant', 'checkout', 'included_in_bundles', jsonb_build_array('schood-ai-plus', 'schood-ai-family'))),
  ('schood-coach-career-pass', 'Career and Interview Coach pass', 'tool', 'Fair use of the Career and Interview Coach Telegram bot for 30 days.',
   jsonb_build_object('hidden', true, 'coach_feature', 'B5', 'coach_pack', 'career', 'sale_kind', 'coach_pass', 'grant', 'checkout', 'included_in_bundles', jsonb_build_array('schood-ai-plus', 'schood-ai-family'))),
  ('schood-coach-speech-pass', 'Public Speaking Coach pass', 'tool', 'Fair use of the Public Speaking Coach Telegram bot for 30 days.',
   jsonb_build_object('hidden', true, 'coach_feature', 'B6', 'coach_pack', 'speech', 'sale_kind', 'coach_pass', 'grant', 'checkout', 'included_in_bundles', jsonb_build_array('schood-ai-plus', 'schood-ai-family'))),
  ('schood-coach-team', 'Schood Coach Team', 'tool', 'Coach seats for a company or centre team, with a manager dashboard and a leaderboard.',
   jsonb_build_object('hidden', true, 'sale_kind', 'coach_team', 'grant', 'checkout', 'per_seat_amount', 39000, 'min_seats', 5)),
  ('schood-ai-credits', 'Schood AI credits', 'tool', 'Credits that top up a Schood AI plan, a coach pass or a team seat. Bought credits do not expire.',
   jsonb_build_object('hidden', true, 'sale_kind', 'credits', 'grant', 'checkout', 'consumable', true)),
  ('schood-ai-gift', 'Schood AI gift', 'tool', 'Schood AI Plus or credits as a gift: you get a code to share, and the person who redeems it gets the gift.',
   jsonb_build_object('hidden', true, 'sale_kind', 'gift', 'grant', 'checkout', 'consumable', true)),
  ('schood-skill-certificate', 'Schood Skill Certificate exam', 'exam', 'One proctored Skill Certificate exam for a coach level, verifiable by QR.',
   jsonb_build_object('hidden', true, 'sale_kind', 'certificate', 'grant', 'checkout', 'consumable', true)),
  ('schood-ai-centre-addons', 'Schood AI Centre add-ons', 'tool', 'Extra teacher seats and student places for a Schood AI centre. Granted by Schood support.',
   jsonb_build_object('hidden', true, 'sale_kind', 'centre_addon', 'grant', 'manual'))
)
insert into public.products (id, name, type, status, description, metadata)
select md5('schood-product:' || slug)::uuid, name, type, 'draft', description,
  metadata || jsonb_build_object('slug', slug, 'service', 'schood-ai', 'app_url', 'https://ai.schood.online', 'seeded_by', '20261030500000_schood_ai_pricing')
from seed
on conflict (id) do update
set name = excluded.name,
    type = excluded.type,
    description = excluded.description,
    metadata = coalesce(public.products.metadata, '{}'::jsonb) || excluded.metadata;

-- --- 1b. Plans (inactive) ----------------------------------------------------------------
with passes(ids) as (values (jsonb_build_array(
  md5('schood-product:schood-coach-ielts-pass')::uuid, md5('schood-product:schood-coach-speaking-pass')::uuid, md5('schood-product:schood-coach-maths-pass')::uuid,
  md5('schood-product:schood-coach-sales-pass')::uuid, md5('schood-product:schood-coach-career-pass')::uuid, md5('schood-product:schood-coach-speech-pass')::uuid))),
seed(slug, product, name, amount, days, metadata) as (values
  ('schood-ai-plus-30', 'schood-ai-plus', 'Schood AI Plus', 49000, 30,
   jsonb_build_object('display_order', 1, 'tagline', 'One month of Schood AI', 'description', '1,500 credits a month, every learner feature and all six Telegram coaches.',
     'features', jsonb_build_array('1,500 credits a month', 'Every learner feature', 'All six Telegram coaches'), 'ai', jsonb_build_object('plan', 'plus', 'monthly_credits', 1500))),
  ('schood-ai-plus-90', 'schood-ai-plus', 'Schood AI Plus (3 months)', 129000, 90,
   jsonb_build_object('display_order', 2, 'tagline', 'Three months of Schood AI', 'description', '1,500 credits every 30 days for 90 days, every learner feature and all six coaches.',
     'features', jsonb_build_array('1,500 credits every 30 days', 'Every learner feature', 'All six Telegram coaches'), 'ai', jsonb_build_object('plan', 'plus', 'monthly_credits', 1500))),
  ('schood-ai-plus-365', 'schood-ai-plus', 'Schood AI Plus Annual', 399000, 365,
   jsonb_build_object('display_order', 3, 'recommended', true, 'tagline', 'A year of Schood AI', 'description', '1,500 credits every 30 days for a year, every learner feature and all six coaches.',
     'features', jsonb_build_array('1,500 credits every 30 days', 'Every learner feature', 'All six Telegram coaches'), 'ai', jsonb_build_object('plan', 'plus', 'monthly_credits', 1500))),
  ('schood-ai-family-30', 'schood-ai-family', 'Schood AI Plus Family', 89000, 30,
   jsonb_build_object('display_order', 1, 'tagline', 'Plus for up to three children', 'description', 'One parent and up to three children: Plus for each child (1,500 credits each), the weekly parent brief and answers about your child.',
     'features', jsonb_build_array('Plus for up to 3 children', 'Weekly parent brief', 'Ask about my child'), 'ai', jsonb_build_object('plan', 'family'))),
  ('schood-ai-family-365', 'schood-ai-family', 'Schood AI Plus Family Annual', 729000, 365,
   jsonb_build_object('display_order', 2, 'recommended', true, 'tagline', 'A year of Plus Family', 'description', 'Plus Family for a year: Plus for up to three children, the weekly parent brief and answers about your child.',
     'features', jsonb_build_array('Plus for up to 3 children', 'Weekly parent brief', 'Ask about my child'), 'ai', jsonb_build_object('plan', 'family'))),
  ('schood-ai-teacher-30', 'schood-ai-teacher', 'Schood AI Teacher', 99000, 30,
   jsonb_build_object('display_order', 1, 'tagline', 'For independent teachers', 'description', '3,000 credits a month: Materials Studio with checked keys, marking, feedback, planning, the library and Live Quiz.',
     'features', jsonb_build_array('3,000 credits a month', 'Materials Studio with checked keys', 'Marking, feedback and planning'), 'ai', jsonb_build_object('plan', 'teacher', 'monthly_credits', 3000))),
  ('schood-ai-teacher-pro-30', 'schood-ai-teacher-pro', 'Schood AI Teacher Pro', 199000, 30,
   jsonb_build_object('display_order', 1, 'tagline', 'For teachers who publish and sell', 'description', '8,000 credits a month: everything in Teacher, the Telegram channel autopilot, marketplace selling and the tutor brand kit.',
     'features', jsonb_build_array('8,000 credits a month', 'Everything in Teacher', 'Channel autopilot and brand kit'), 'ai', jsonb_build_object('plan', 'teacher_pro', 'monthly_credits', 8000))),
  ('schood-ai-centre-30', 'schood-ai-centre', 'Schood AI Centre', 490000, 30,
   jsonb_build_object('display_order', 1, 'grant', 'manual', 'tagline', 'Granted by Schood support', 'description', '5 teacher seats, the Student Assistant for up to 100 students and 10,000 pooled credits a month.',
     'ai', jsonb_build_object('plan', 'centre', 'monthly_credits', 10000, 'teacher_seats', 5, 'students', 100))),
  ('schood-ai-centre-pro-30', 'schood-ai-centre-pro', 'Schood AI Centre Pro', 1290000, 30,
   jsonb_build_object('display_order', 1, 'grant', 'manual', 'tagline', 'Granted by Schood support', 'description', '15 teacher seats, 400 students and 40,000 pooled credits a month, with every Centre Pro feature.',
     'ai', jsonb_build_object('plan', 'centre_pro', 'monthly_credits', 40000, 'teacher_seats', 15, 'students', 400))),
  ('schood-coach-ielts-pass-30', 'schood-coach-ielts-pass', 'IELTS Coach pass', 29000, 30, jsonb_build_object('display_order', 1, 'ai', jsonb_build_object('coach', 'B1'))),
  ('schood-coach-speaking-pass-30', 'schood-coach-speaking-pass', 'English Speaking Partner pass', 29000, 30, jsonb_build_object('display_order', 1, 'ai', jsonb_build_object('coach', 'B2'))),
  ('schood-coach-maths-pass-30', 'schood-coach-maths-pass', 'Admission Maths Coach pass', 29000, 30, jsonb_build_object('display_order', 1, 'ai', jsonb_build_object('coach', 'B3'))),
  ('schood-coach-sales-pass-30', 'schood-coach-sales-pass', 'Sales Coach pass', 29000, 30, jsonb_build_object('display_order', 1, 'ai', jsonb_build_object('coach', 'B4'))),
  ('schood-coach-career-pass-30', 'schood-coach-career-pass', 'Career and Interview Coach pass', 29000, 30, jsonb_build_object('display_order', 1, 'ai', jsonb_build_object('coach', 'B5'))),
  ('schood-coach-speech-pass-30', 'schood-coach-speech-pass', 'Public Speaking Coach pass', 29000, 30, jsonb_build_object('display_order', 1, 'ai', jsonb_build_object('coach', 'B6'))),
  -- 39,000 per seat; the team sizes are [ASSUMPTION], the amounts seats x 39,000.
  ('schood-coach-team-5-30', 'schood-coach-team', 'Schood Coach Team, 5 seats', 195000, 30, jsonb_build_object('display_order', 1, 'ai', jsonb_build_object('seats', 5, 'per_seat_amount', 39000))),
  ('schood-coach-team-10-30', 'schood-coach-team', 'Schood Coach Team, 10 seats', 390000, 30, jsonb_build_object('display_order', 2, 'ai', jsonb_build_object('seats', 10, 'per_seat_amount', 39000))),
  ('schood-coach-team-20-30', 'schood-coach-team', 'Schood Coach Team, 20 seats', 780000, 30, jsonb_build_object('display_order', 3, 'ai', jsonb_build_object('seats', 20, 'per_seat_amount', 39000))),
  -- Used up rather than timed: no access days (bought credits do not expire).
  ('schood-ai-credits-1000', 'schood-ai-credits', '1,000 Schood AI credits', 29000, null, jsonb_build_object('display_order', 1, 'ai', jsonb_build_object('credits', 1000))),
  ('schood-ai-credits-10000', 'schood-ai-credits', '10,000 Schood AI credits', 149000, null, jsonb_build_object('display_order', 2, 'ai', jsonb_build_object('credits', 10000))),
  ('schood-ai-gift-plus-30', 'schood-ai-gift', 'Gift: Schood AI Plus, 30 days', 49000, null, jsonb_build_object('display_order', 1, 'ai', jsonb_build_object('gift_plan', 'plus', 'gift_days', 30))),
  ('schood-ai-gift-plus-90', 'schood-ai-gift', 'Gift: Schood AI Plus, 3 months', 129000, null, jsonb_build_object('display_order', 2, 'ai', jsonb_build_object('gift_plan', 'plus', 'gift_days', 90))),
  ('schood-ai-gift-plus-365', 'schood-ai-gift', 'Gift: Schood AI Plus, 1 year', 399000, null, jsonb_build_object('display_order', 3, 'ai', jsonb_build_object('gift_plan', 'plus', 'gift_days', 365))),
  ('schood-ai-gift-credits-1000', 'schood-ai-gift', 'Gift: 1,000 Schood AI credits', 29000, null, jsonb_build_object('display_order', 4, 'ai', jsonb_build_object('gift_credits', 1000))),
  ('schood-ai-gift-credits-10000', 'schood-ai-gift', 'Gift: 10,000 Schood AI credits', 149000, null, jsonb_build_object('display_order', 5, 'ai', jsonb_build_object('gift_credits', 10000))),
  ('schood-skill-certificate-sitting', 'schood-skill-certificate', 'Skill Certificate exam, one sitting', 79000, null, jsonb_build_object('display_order', 1, 'ai', jsonb_build_object('sittings', 1))),
  ('schood-ai-centre-teacher-seat-30', 'schood-ai-centre-addons', 'Extra teacher seat', 79000, 30, jsonb_build_object('display_order', 1, 'grant', 'manual', 'ai', jsonb_build_object('teacher_seats', 1))),
  ('schood-ai-centre-students-100-30', 'schood-ai-centre-addons', '100 more students', 59000, 30, jsonb_build_object('display_order', 2, 'grant', 'manual', 'ai', jsonb_build_object('students', 100)))
)
insert into public.plans (id, product_id, name, amount, currency, duration_days, is_active, metadata)
select md5('schood-plan:' || seed.slug)::uuid, md5('schood-product:' || seed.product)::uuid, seed.name, seed.amount, 'UZS', seed.days, false,
  seed.metadata
    || jsonb_build_object('slug', seed.slug, 'service', 'schood-ai', 'seeded_by', '20261030500000_schood_ai_pricing')
    || case when seed.metadata ? 'grant' then '{}'::jsonb else jsonb_build_object('grant', 'checkout') end
    || case when seed.product in ('schood-ai-plus', 'schood-ai-family') then jsonb_build_object('included_product_ids', passes.ids) else '{}'::jsonb end
from seed cross join passes
on conflict (id) do update
set name = excluded.name,
    duration_days = excluded.duration_days,
    metadata = coalesce(public.plans.metadata, '{}'::jsonb) || excluded.metadata;

-- --- 2. What a plan id means to Schood AI (immutable: never read from editable metadata) ----
create or replace function public.ai_pricing_terms(p_plan uuid) returns jsonb
language sql immutable set search_path = pg_catalog, public as $$
  select case p_plan
    when md5('schood-plan:schood-ai-credits-1000')::uuid then jsonb_build_object('kind', 'credits', 'credits', 1000, 'product', md5('schood-product:schood-ai-credits')::uuid)
    when md5('schood-plan:schood-ai-credits-10000')::uuid then jsonb_build_object('kind', 'credits', 'credits', 10000, 'product', md5('schood-product:schood-ai-credits')::uuid)
    when md5('schood-plan:schood-ai-gift-plus-30')::uuid then jsonb_build_object('kind', 'gift', 'slug', 'schood-ai-gift-plus-30', 'plan', 'plus', 'days', 30, 'product', md5('schood-product:schood-ai-gift')::uuid)
    when md5('schood-plan:schood-ai-gift-plus-90')::uuid then jsonb_build_object('kind', 'gift', 'slug', 'schood-ai-gift-plus-90', 'plan', 'plus', 'days', 90, 'product', md5('schood-product:schood-ai-gift')::uuid)
    when md5('schood-plan:schood-ai-gift-plus-365')::uuid then jsonb_build_object('kind', 'gift', 'slug', 'schood-ai-gift-plus-365', 'plan', 'plus', 'days', 365, 'product', md5('schood-product:schood-ai-gift')::uuid)
    when md5('schood-plan:schood-ai-gift-credits-1000')::uuid then jsonb_build_object('kind', 'gift', 'slug', 'schood-ai-gift-credits-1000', 'credits', 1000, 'product', md5('schood-product:schood-ai-gift')::uuid)
    when md5('schood-plan:schood-ai-gift-credits-10000')::uuid then jsonb_build_object('kind', 'gift', 'slug', 'schood-ai-gift-credits-10000', 'credits', 10000, 'product', md5('schood-product:schood-ai-gift')::uuid)
    when md5('schood-plan:schood-skill-certificate-sitting')::uuid then jsonb_build_object('kind', 'certificate', 'product', md5('schood-product:schood-skill-certificate')::uuid)
    when md5('schood-plan:schood-coach-team-5-30')::uuid then jsonb_build_object('kind', 'coach_team', 'seats', 5, 'days', 30, 'product', md5('schood-product:schood-coach-team')::uuid)
    when md5('schood-plan:schood-coach-team-10-30')::uuid then jsonb_build_object('kind', 'coach_team', 'seats', 10, 'days', 30, 'product', md5('schood-product:schood-coach-team')::uuid)
    when md5('schood-plan:schood-coach-team-20-30')::uuid then jsonb_build_object('kind', 'coach_team', 'seats', 20, 'days', 30, 'product', md5('schood-product:schood-coach-team')::uuid)
  end
$$;
-- Plan ids Schood AI fulfils itself, for the payment scans.
create or replace function public.ai_pricing_fulfilled_plans() returns uuid[]
language sql immutable set search_path = pg_catalog, public as $$
  select array[
    md5('schood-plan:schood-ai-credits-1000')::uuid, md5('schood-plan:schood-ai-credits-10000')::uuid,
    md5('schood-plan:schood-ai-gift-plus-30')::uuid, md5('schood-plan:schood-ai-gift-plus-90')::uuid, md5('schood-plan:schood-ai-gift-plus-365')::uuid,
    md5('schood-plan:schood-ai-gift-credits-1000')::uuid, md5('schood-plan:schood-ai-gift-credits-10000')::uuid,
    md5('schood-plan:schood-skill-certificate-sitting')::uuid,
    md5('schood-plan:schood-coach-team-5-30')::uuid, md5('schood-plan:schood-coach-team-10-30')::uuid, md5('schood-plan:schood-coach-team-20-30')::uuid]
$$;

-- --- 3. Tables (service role only; RLS on, no browser policies) ------------------------------
-- One row per paid payment Schood AI fulfilled: the claim and its outcome. Financial
-- records: the buyer is unlinked (set null) when their account closes, never deleted.
create table if not exists public.ai_pricing_fulfilments (
  payment_id uuid primary key references public.payments(id) on delete restrict,
  user_id uuid references public.users(id) on delete set null,
  plan_id uuid not null,
  kind text not null check (kind in ('credits', 'gift', 'certificate', 'coach_team')),
  -- done: the effect is applied; awaiting_setup: a Coach Team the buyer has not named yet;
  -- refused: a paid row that does not match its plan (left for support, never retried).
  state text not null check (state in ('done', 'awaiting_setup', 'refused')),
  outcome jsonb not null default '{}'::jsonb check (jsonb_typeof(outcome) = 'object' and pg_column_size(outcome) <= 4000),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index if not exists ai_pricing_fulfilments_user_idx on public.ai_pricing_fulfilments (user_id, created_at desc) where user_id is not null;

-- L18 gift codes. The code is derived by the function from a server secret and the gift id
-- and never stored; only its SHA-256 is (set once, right after the gift is created).
create table if not exists public.ai_pricing_gifts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  buyer_id uuid references public.users(id) on delete set null,
  plan_slug text not null check (plan_slug ~ '^schood-ai-gift-[a-z0-9-]{2,40}$'),
  grant_plan text check (grant_plan is null or grant_plan = 'plus'),
  grant_days integer check (grant_days is null or grant_days between 1 and 400),
  grant_credits integer check (grant_credits is null or grant_credits between 1 and 100000),
  code_hash text unique check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'issued' check (status in ('issued', 'redeemed', 'revoked')),
  expires_at timestamptz not null,
  redeemed_by uuid references public.users(id) on delete set null,
  redeemed_at timestamptz,
  redemption jsonb not null default '{}'::jsonb check (jsonb_typeof(redemption) = 'object' and pg_column_size(redemption) <= 4000),
  created_at timestamptz not null default now(),
  check ((grant_plan is not null and grant_days is not null and grant_credits is null) or (grant_plan is null and grant_days is null and grant_credits is not null)),
  check ((status = 'redeemed') = (redeemed_at is not null))
);
create index if not exists ai_pricing_gifts_buyer_idx on public.ai_pricing_gifts (buyer_id, created_at desc) where buyer_id is not null;

alter table public.ai_pricing_fulfilments enable row level security;
alter table public.ai_pricing_gifts enable row level security;
revoke all on public.ai_pricing_fulfilments, public.ai_pricing_gifts from public, anon, authenticated, service_role;
grant select on public.ai_pricing_fulfilments, public.ai_pricing_gifts to service_role;

-- --- 3a. Fulfilment: exactly once per paid payment -----------------------------------------
-- Claims the payment in ai_pricing_fulfilments and applies its effect in the same
-- transaction: a concurrent call waits on the claim, then returns the first outcome.
-- The payment row is only read, never locked or written. Never raises for a refusal.
create or replace function public.ai_pricing_fulfil(p_payment uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p record;
  t jsonb;
  f public.ai_pricing_fulfilments;
  ws public.ai_workspaces;
  gift_id uuid;
  result jsonb := '{}'::jsonb;
  claimed integer;
begin
  select id, user_id, plan_id, product_id, status, created_at into p from public.payments where id = p_payment;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if p.status not in ('paid', 'success', 'completed') then return jsonb_build_object('ok', false, 'code', 'not_paid'); end if;
  t := public.ai_pricing_terms(p.plan_id);
  if t is null then return jsonb_build_object('ok', false, 'code', 'not_fulfilled_here'); end if;

  insert into public.ai_pricing_fulfilments (payment_id, user_id, plan_id, kind, state)
    values (p.id, p.user_id, p.plan_id, t->>'kind', 'done')
    on conflict (payment_id) do nothing;
  get diagnostics claimed = row_count;
  if claimed = 0 then
    select * into f from public.ai_pricing_fulfilments where payment_id = p.id;
    return jsonb_build_object('ok', f.state <> 'refused', 'replayed', true, 'payment_id', p.id, 'kind', f.kind, 'state', f.state, 'outcome', f.outcome);
  end if;

  -- A paid row whose product is not its plan's, or without a buyer, is left for support.
  if p.user_id is null or p.product_id is distinct from (t->>'product')::uuid then
    update public.ai_pricing_fulfilments set state = 'refused', outcome = jsonb_build_object('code', case when p.user_id is null then 'no_buyer' else 'product_mismatch' end)
      where payment_id = p.id;
    return jsonb_build_object('ok', false, 'code', case when p.user_id is null then 'no_buyer' else 'product_mismatch' end, 'payment_id', p.id);
  end if;

  if t->>'kind' = 'credits' then
    ws := public.ai_ensure_personal_workspace(p.user_id, 'My workspace');
    perform public.ai_credit_grant(ws.id, (t->>'credits')::integer, 'pack', 'payment:' || p.id::text, p.user_id);
    result := jsonb_build_object('credits', (t->>'credits')::integer, 'workspace_id', ws.id);
  elsif t->>'kind' = 'gift' then
    insert into public.ai_pricing_gifts (payment_id, buyer_id, plan_slug, grant_plan, grant_days, grant_credits, expires_at)
      values (p.id, p.user_id, t->>'slug', t->>'plan', (t->>'days')::integer, (t->>'credits')::integer, now() + interval '365 days')
      returning id into gift_id;
    result := jsonb_build_object('gift_id', gift_id, 'slug', t->>'slug');
  elsif t->>'kind' = 'certificate' then
    -- One payment is one sitting; engage enforces one sitting per reference.
    result := jsonb_build_object('ref', 'pricing:sitting:' || p.id::text, 'expires_at', now() + interval '365 days');
  elsif t->>'kind' = 'coach_team' then
    result := jsonb_build_object('seats', (t->>'seats')::integer, 'days', (t->>'days')::integer);
  end if;
  update public.ai_pricing_fulfilments
    set outcome = result, state = case when t->>'kind' = 'coach_team' then 'awaiting_setup' else 'done' end,
        applied_at = case when t->>'kind' = 'coach_team' then null else now() end
    where payment_id = p.id;
  return jsonb_build_object('ok', true, 'replayed', false, 'payment_id', p.id, 'kind', t->>'kind',
    'state', case when t->>'kind' = 'coach_team' then 'awaiting_setup' else 'done' end, 'outcome', result);
end $$;

-- Fulfils one person's paid, not yet fulfilled Schood AI payments (after checkout). Each
-- payment runs in its own subtransaction, so one failure never blocks the others.
create or replace function public.ai_pricing_sync(p_user uuid, p_limit integer default 20)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  replies jsonb := '[]'::jsonb;
begin
  for r in
    select pay.id from public.payments pay
    where pay.user_id = p_user and pay.status in ('paid', 'success', 'completed')
      and pay.plan_id = any(public.ai_pricing_fulfilled_plans())
      and not exists (select 1 from public.ai_pricing_fulfilments f where f.payment_id = pay.id)
    order by pay.created_at, pay.id
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  loop
    begin
      replies := replies || jsonb_build_array(public.ai_pricing_fulfil(r.id));
    exception when others then
      replies := replies || jsonb_build_array(jsonb_build_object('ok', false, 'code', 'failed', 'payment_id', r.id));
    end;
  end loop;
  return replies;
end $$;

-- The same for everyone, for the scheduled job: paid in the last 60 days, oldest first.
create or replace function public.ai_pricing_sync_due(p_limit integer default 100)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  fulfilled integer := 0;
  failed integer := 0;
  reply jsonb;
begin
  for r in
    select pay.id from public.payments pay
    where pay.status in ('paid', 'success', 'completed')
      and pay.plan_id = any(public.ai_pricing_fulfilled_plans())
      and pay.created_at > now() - interval '60 days'
      and not exists (select 1 from public.ai_pricing_fulfilments f where f.payment_id = pay.id)
    order by pay.created_at, pay.id
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    begin
      reply := public.ai_pricing_fulfil(r.id);
      if reply->>'ok' = 'true' then fulfilled := fulfilled + 1; else failed := failed + 1; end if;
    exception when others then
      failed := failed + 1;
    end;
  end loop;
  return jsonb_build_object('fulfilled', fulfilled, 'failed', failed);
end $$;

-- Sets a gift's code hash once (the function derives the code; see the table).
create or replace function public.ai_pricing_gift_set_hash(p_gift uuid, p_hash text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_hash' using errcode = '22023'; end if;
  update public.ai_pricing_gifts set code_hash = p_hash where id = p_gift and code_hash is null;
  return exists (select 1 from public.ai_pricing_gifts where id = p_gift and code_hash = p_hash);
end $$;

-- --- 4. Redeeming a gift: once, before it expires -------------------------------------------
-- The gift row is locked, so concurrent redemptions of one code serialise and only the
-- first applies. Plus becomes (or extends) the recipient's entitlement to the Plus product
-- and its six coach passes, the same rows a purchase writes; credits are pack credits in the
-- recipient's personal workspace. Never raises for a refusal.
create or replace function public.ai_pricing_redeem(p_hash text, p_user uuid, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  g public.ai_pricing_gifts;
  ws public.ai_workspaces;
  tenant uuid;
  product uuid;
  previous_end timestamptz;
  previous_active boolean;
  previous_found boolean;
  expires timestamptz;
  plan_for_days uuid;
  latest timestamptz;
  result jsonb;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'gift_not_found'); end if;
  select * into g from public.ai_pricing_gifts where code_hash = p_hash for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'gift_not_found'); end if;
  if g.status = 'redeemed' then
    if g.redeemed_by = p_user then return jsonb_build_object('ok', true, 'replayed', true, 'gift_id', g.id, 'redemption', g.redemption); end if;
    return jsonb_build_object('ok', false, 'code', 'gift_used');
  end if;
  if g.status = 'revoked' then return jsonb_build_object('ok', false, 'code', 'gift_revoked'); end if;
  if g.expires_at <= p_now then return jsonb_build_object('ok', false, 'code', 'gift_expired', 'expired_at', g.expires_at); end if;
  if not exists (select 1 from public.users where id = p_user and is_active) then return jsonb_build_object('ok', false, 'code', 'account_inactive'); end if;

  if g.grant_credits is not null then
    ws := public.ai_ensure_personal_workspace(p_user, 'My workspace');
    perform public.ai_credit_grant(ws.id, g.grant_credits, 'pack', 'gift:' || g.id::text, p_user);
    result := jsonb_build_object('kind', 'credits', 'credits', g.grant_credits);
  else
    select m.tenant_id into tenant from public.tenant_memberships m where m.user_id = p_user and m.status = 'active' order by m.created_at limit 1;
    if tenant is null then return jsonb_build_object('ok', false, 'code', 'no_account_tenant'); end if;
    plan_for_days := case g.grant_days when 30 then md5('schood-plan:schood-ai-plus-30')::uuid when 90 then md5('schood-plan:schood-ai-plus-90')::uuid else md5('schood-plan:schood-ai-plus-365')::uuid end;
    for product in select unnest(array[md5('schood-product:schood-ai-plus')::uuid,
        md5('schood-product:schood-coach-ielts-pass')::uuid, md5('schood-product:schood-coach-speaking-pass')::uuid, md5('schood-product:schood-coach-maths-pass')::uuid,
        md5('schood-product:schood-coach-sales-pass')::uuid, md5('schood-product:schood-coach-career-pass')::uuid, md5('schood-product:schood-coach-speech-pass')::uuid]) loop
      select e.ends_at, e.is_active into previous_end, previous_active from public.entitlements e
        where e.tenant_id = tenant and e.resource_type = 'product' and e.resource_id = product for update;
      previous_found := found;
      -- The same extension rule as payment fulfilment: from the later of now and a running end.
      expires := case when previous_found and previous_active and previous_end is null then null
        else greatest(p_now, case when previous_active then coalesce(previous_end, p_now) else p_now end) + make_interval(days => g.grant_days) end;
      insert into public.entitlements (user_id, tenant_id, resource_type, resource_id, is_active, starts_at, ends_at, source, value)
        values (p_user, tenant, 'product', product, true, p_now, expires, 'gift', jsonb_build_object('plan_id', plan_for_days, 'gift_id', g.id))
        on conflict (tenant_id, resource_type, resource_id) do update
        set is_active = true, ends_at = excluded.ends_at,
            starts_at = case when public.entitlements.is_active and (public.entitlements.ends_at is null or public.entitlements.ends_at > p_now) then public.entitlements.starts_at else excluded.starts_at end,
            source = case when public.entitlements.is_active and (public.entitlements.ends_at is null or public.entitlements.ends_at > p_now) then public.entitlements.source else excluded.source end,
            value = case when public.entitlements.is_active and (public.entitlements.ends_at is null or public.entitlements.ends_at > p_now) then public.entitlements.value else excluded.value end;
      if product = md5('schood-product:schood-ai-plus')::uuid then latest := expires; end if;
    end loop;
    result := jsonb_build_object('kind', 'plus', 'days', g.grant_days, 'ends_at', latest);
  end if;
  update public.ai_pricing_gifts set status = 'redeemed', redeemed_by = p_user, redeemed_at = p_now, redemption = result where id = g.id;
  return jsonb_build_object('ok', true, 'replayed', false, 'gift_id', g.id, 'redemption', result);
end $$;

-- --- 3b. Coach Team: the buyer names the team and picks the coaches after paying --------
-- (or extends a team they manage). Locks the fulfilment, so it is applied once.
create or replace function public.ai_pricing_team_setup(p_payment uuid, p_user uuid, p_name text, p_packs text[], p_team uuid default null, p_now timestamptz default now())
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f public.ai_pricing_fulfilments;
  -- coach_teams comes from a later migration (20261030600000): a record, not its row type.
  team record;
  v_seats integer;
  v_days integer;
  v_team uuid;
  v_until timestamptz;
begin
  select * into f from public.ai_pricing_fulfilments where payment_id = p_payment for update;
  if not found or f.kind <> 'coach_team' or f.user_id is distinct from p_user then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if f.state = 'done' then return jsonb_build_object('ok', true, 'replayed', true, 'outcome', f.outcome); end if;
  if f.state <> 'awaiting_setup' then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  v_seats := (f.outcome->>'seats')::integer;
  v_days := (f.outcome->>'days')::integer;
  if p_team is not null then
    select t.id, t.manager_id, t.seats, t.valid_until into team from public.coach_teams t where t.id = p_team for update;
    if not found or team.manager_id is distinct from p_user then return jsonb_build_object('ok', false, 'code', 'team_not_found'); end if;
    update public.coach_teams t
      set seats = greatest(team.seats, v_seats), status = 'active',
          valid_until = greatest(p_now, team.valid_until) + make_interval(days => v_days), updated_at = now()
      where t.id = team.id
      returning t.id, t.valid_until into v_team, v_until;
  else
    if p_packs is null or cardinality(p_packs) not between 1 and 6 then return jsonb_build_object('ok', false, 'code', 'invalid_packs'); end if;
    if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then return jsonb_build_object('ok', false, 'code', 'invalid_name'); end if;
    insert into public.coach_teams (name, manager_id, packs, seats, status, valid_until, source, created_by)
      values (btrim(p_name), p_user, p_packs, v_seats, 'active', p_now + make_interval(days => v_days), 'order', p_user)
      returning id, valid_until into v_team, v_until;
    insert into public.coach_team_members (team_id, user_id, role) values (v_team, p_user, 'manager') on conflict (team_id, user_id) do nothing;
  end if;
  update public.ai_pricing_fulfilments
    set state = 'done', applied_at = p_now, outcome = f.outcome || jsonb_build_object('team_id', v_team, 'valid_until', v_until)
    where payment_id = p_payment;
  return jsonb_build_object('ok', true, 'replayed', false, 'outcome', f.outcome || jsonb_build_object('team_id', v_team, 'valid_until', v_until));
end $$;

-- --- 5. The launch switch ---------------------------------------------------------------
-- Before launch only Schood admins and SCHOOD_AI_BETA_USER_IDS use AI, whatever anyone
-- holds. ai_pricing_launch(true) is the one owner decision: in one transaction it sets
-- ai_settings.features['pricing.launch'] (plan-based access for everyone; the beta list
-- becomes optional) and puts the self-serve products and plans on sale. Centre plans and
-- add-ons stay off sale (granted by support). ai_pricing_launch(false) takes them all off
-- sale again and clears the switch. Run as the database owner (SQL editor); the function
-- cannot call it.
create or replace function public.ai_pricing_launch(p_on boolean)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  self_serve uuid[] := array(
    select md5('schood-product:' || slug)::uuid from unnest(array[
      'schood-ai-plus', 'schood-ai-family', 'schood-ai-teacher', 'schood-ai-teacher-pro',
      'schood-coach-ielts-pass', 'schood-coach-speaking-pass', 'schood-coach-maths-pass', 'schood-coach-sales-pass', 'schood-coach-career-pass', 'schood-coach-speech-pass',
      'schood-coach-team', 'schood-ai-credits', 'schood-ai-gift', 'schood-skill-certificate']) slug);
  every_product uuid[] := self_serve || array[md5('schood-product:schood-ai-centre')::uuid, md5('schood-product:schood-ai-centre-pro')::uuid, md5('schood-product:schood-ai-centre-addons')::uuid];
  products_changed integer;
  plans_changed integer;
begin
  if p_on is null then raise exception 'p_on is required' using errcode = '22023'; end if;
  update public.ai_settings
    set features = case when p_on then features || jsonb_build_object('pricing.launch', true) else features - 'pricing.launch' end, updated_at = now()
    where id = 1;
  if p_on then
    update public.products set status = 'active' where id = any(self_serve) and status = 'draft';
    get diagnostics products_changed = row_count;
    update public.plans set is_active = true where product_id = any(self_serve) and is_active = false and coalesce(metadata->>'grant', 'checkout') = 'checkout';
    get diagnostics plans_changed = row_count;
  else
    update public.plans set is_active = false where product_id = any(every_product) and is_active;
    get diagnostics plans_changed = row_count;
    update public.products set status = 'draft' where id = any(every_product) and status = 'active';
    get diagnostics products_changed = row_count;
  end if;
  insert into public.ai_audit_events (event, target_type, target_id, details)
    values ('pricing.launch', 'service', 'schood-ai', jsonb_build_object('on', p_on, 'products', products_changed, 'plans', plans_changed));
  return jsonb_build_object('launched', p_on, 'products_changed', products_changed, 'plans_changed', plans_changed);
end $$;

-- --- 6. Account closure ----------------------------------------------------------------
-- Fulfilments and gifts are financial records: the person is unlinked, the rows stay.
-- A gift they bought and nobody redeemed stays redeemable by whoever holds the code.
create or replace function public.ai_pricing_erase_account(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_fulfilments integer;
  v_bought integer;
  v_redeemed integer;
begin
  update public.ai_pricing_fulfilments set user_id = null where user_id = p_user;
  get diagnostics v_fulfilments = row_count;
  update public.ai_pricing_gifts set buyer_id = null where buyer_id = p_user;
  get diagnostics v_bought = row_count;
  update public.ai_pricing_gifts set redeemed_by = null where redeemed_by = p_user;
  get diagnostics v_redeemed = row_count;
  return jsonb_build_object('fulfilments', v_fulfilments, 'gifts_bought', v_bought, 'gifts_redeemed', v_redeemed);
end $$;

revoke all on function public.ai_pricing_terms(uuid) from public, anon, authenticated;
revoke all on function public.ai_pricing_fulfilled_plans() from public, anon, authenticated;
revoke all on function public.ai_pricing_fulfil(uuid) from public, anon, authenticated;
revoke all on function public.ai_pricing_sync(uuid, integer) from public, anon, authenticated;
revoke all on function public.ai_pricing_sync_due(integer) from public, anon, authenticated;
revoke all on function public.ai_pricing_gift_set_hash(uuid, text) from public, anon, authenticated;
revoke all on function public.ai_pricing_redeem(text, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_pricing_team_setup(uuid, uuid, text, text[], uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.ai_pricing_launch(boolean) from public, anon, authenticated, service_role;
revoke all on function public.ai_pricing_erase_account(uuid) from public, anon, authenticated, service_role;
grant execute on function public.ai_pricing_terms(uuid) to service_role;
grant execute on function public.ai_pricing_fulfil(uuid) to service_role;
grant execute on function public.ai_pricing_sync(uuid, integer) to service_role;
grant execute on function public.ai_pricing_sync_due(integer) to service_role;
grant execute on function public.ai_pricing_gift_set_hash(uuid, text) to service_role;
grant execute on function public.ai_pricing_redeem(text, uuid, timestamptz) to service_role;
grant execute on function public.ai_pricing_team_setup(uuid, uuid, text, text[], uuid, timestamptz) to service_role;

do $$
declare
  hooks text[];
begin
  if to_regprocedure('public.account_erasure_service_hooks()') is null then
    raise notice 'account_erasure_service_hooks() is not installed; pricing erasure hook not registered';
    return;
  end if;
  hooks := public.account_erasure_service_hooks();
  if not ('ai_pricing_erase_account' = any(hooks)) then
    hooks := hooks || 'ai_pricing_erase_account'::text;
    execute format(
      'create or replace function public.account_erasure_service_hooks() returns text[] language sql immutable set search_path=pg_catalog,public as %L',
      format('select %L::text[];', hooks::text)
    );
  end if;
end
$$;

commit;
