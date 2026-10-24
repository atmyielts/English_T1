-- ============================================================================
-- IELTS Playbook: close the premium-section read leak, add Uzbekistan markets
-- ----------------------------------------------------------------------------
-- 1. RLS. The old select policy let anyone holding the public anon key read
--    every published section through PostgREST, including the sections of
--    premium guides. Only the ielts-playbook / admin-ielts-playbook Edge
--    Functions read these tables, and they use the service role (which
--    bypasses RLS), so tightening the policy changes nothing for the app.
--
-- 2. Markets. Production already has a UZ / british-council guide (authored in
--    the admin CMS). This migration never overwrites it: the row insert is
--    `on conflict do nothing`, and the local guide is merged into metadata
--    only when that row has no `local_guide` key yet. It adds a UZ / idp
--    guide so learners booking with IDP get a local answer instead of the
--    GLOBAL fallback.
--
--    Facts come from official provider pages (britishcouncil.uz, ielts.idp.com)
--    as of 2026-10-24. The British Council city list was read from its
--    "test dates, fees and locations" page through a search index because the
--    page itself timed out; an admin should re-check it in the CMS. Fees,
--    dates and centre lists change, so the guide sends learners to the
--    official booking pages for those and states no prices.
-- ============================================================================

begin;
set local lock_timeout = '5s';

-- 1. Premium sections are no longer readable with the anon key -------------

drop policy if exists "IELTS playbook sections select published" on public.ielts_playbook_page_sections;
create policy "IELTS playbook sections select published"
on public.ielts_playbook_page_sections
for select
using (
  public.is_admin()
  or (
    status = 'published'
    and exists (
      select 1
      from public.ielts_playbook_pages p
      where p.id = page_id
        and p.status = 'published'
        and (
          p.visibility = 'public'
          or (p.visibility = 'authenticated' and auth.uid() is not null)
        )
    )
  )
);

-- 2. Uzbekistan market guides ----------------------------------------------

insert into public.ielts_playbook_sources (source_type, provider_key, title, url, summary, status, published_at, verified_at, last_checked_at, metadata)
values
  (
    'provider_url', 'british-council',
    'British Council Uzbekistan: IELTS test dates, fees and locations',
    'https://www.britishcouncil.uz/en/exam/ielts/test-dates-fees-location',
    'Official British Council Uzbekistan page listing IELTS test centre locations, test dates and current fees in UZS.',
    'published', now(), '2026-10-24', '2026-10-24',
    jsonb_build_object('seeded_by', '20261026120000_ielts_playbook_premium_rls_and_uz_markets', 'market', 'UZ')
  ),
  (
    'provider_url', 'british-council',
    'British Council Uzbekistan: book an IELTS test',
    'https://www.britishcouncil.uz/en/exam/ielts/book-test',
    'Official British Council Uzbekistan booking page for IELTS on paper and IELTS on computer.',
    'published', now(), '2026-10-24', '2026-10-24',
    jsonb_build_object('seeded_by', '20261026120000_ielts_playbook_premium_rls_and_uz_markets', 'market', 'UZ')
  ),
  (
    'provider_url', 'idp',
    'IDP IELTS Uzbekistan',
    'https://ielts.idp.com/uzbekistan',
    'Official IDP IELTS site for Uzbekistan: test centres, dates, fees and online booking.',
    'published', now(), '2026-10-24', '2026-10-24',
    jsonb_build_object('seeded_by', '20261026120000_ielts_playbook_premium_rls_and_uz_markets', 'market', 'UZ')
  ),
  (
    'provider_url', 'idp',
    'IDP Uzbekistan: One Skill Retake test centres',
    'https://ielts.idp.com/uzbekistan/about/ielts-one-skill-retake/ielts-one-skill-retake-test-centres',
    'Official IDP Uzbekistan page on One Skill Retake: available after a full IELTS on computer test at eligible centres, within 60 days of the original test date.',
    'published', now(), '2026-10-24', '2026-10-24',
    jsonb_build_object('seeded_by', '20261026120000_ielts_playbook_premium_rls_and_uz_markets', 'market', 'UZ')
  )
on conflict (url) where url is not null do nothing;

-- British Council row: create only if missing (production already has one).
insert into public.ielts_playbook_market_guidance (
  product_id, country_code, provider_key, summary, status,
  ukvi_available, computer_available, writing_on_paper_available, one_skill_retake_available,
  result_timing_note, booking_url, verified_at, published_at, metadata
)
values (
  '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid, 'UZ', 'british-council',
  'IELTS in Uzbekistan with the British Council: centres in Tashkent and regional cities, IELTS on paper or on computer at a test centre, and One Skill Retake after a computer-delivered test. Check fees and dates on the official booking page.',
  'published', false, true, false, true,
  'Results for IELTS on computer usually arrive within a few days and paper results take longer. Confirm the current timing on the booking page before you choose a date.',
  'https://www.britishcouncil.uz/en/exam/ielts/book-test',
  '2026-10-24', now(),
  jsonb_build_object('seeded_by', '20261026120000_ielts_playbook_premium_rls_and_uz_markets')
)
on conflict (country_code, provider_key) do nothing;

insert into public.ielts_playbook_market_guidance (
  product_id, country_code, provider_key, summary, status,
  ukvi_available, computer_available, writing_on_paper_available, one_skill_retake_available,
  result_timing_note, booking_url, verified_at, published_at, metadata
)
values (
  '9de6c9e7-31df-4d1d-9574-1f8f84a53b54'::uuid, 'UZ', 'idp',
  'IELTS in Uzbekistan with IDP: book online on the IDP Uzbekistan site, choose IELTS on computer where your centre offers it, and use One Skill Retake within 60 days of a full computer-delivered test at an eligible centre. Check fees, dates and centres on the official IDP page.',
  'published', false, true, false, true,
  'Results for IELTS on computer usually arrive within a few days and paper results take longer. Confirm the current timing on the IDP booking page before you choose a date.',
  'https://ielts.idp.com/uzbekistan',
  '2026-10-24', now(),
  jsonb_build_object('seeded_by', '20261026120000_ielts_playbook_premium_rls_and_uz_markets')
)
on conflict (country_code, provider_key) do nothing;

-- Local guide shown in the app ("Where will you sit IELTS?"). Merged only
-- when the row has none, so an admin's own local guide is never replaced.
with guides(provider_key, local_guide) as (
  values
    (
      'british-council',
      jsonb_build_object(
        'title', 'Taking IELTS in Uzbekistan with the British Council',
        'checked_on', '2026-10-24',
        'cities', jsonb_build_array('Tashkent', 'Andijan', 'Bukhara', 'Fergana', 'Jizzakh', 'Karshi', 'Namangan', 'Navoiy', 'Nukus', 'Samarkand', 'Termez', 'Urgench'),
        'cities_note', 'Cities where the British Council lists IELTS test centres. The list changes, so confirm your city and venue on the official page before booking.',
        'delivery', 'You can choose IELTS on paper or IELTS on computer. Either way you sit the test at a test centre; computer-delivered sessions are offered at selected venues and dates.',
        'booking', jsonb_build_array(
          'Decide Academic or General Training first: the receiving university, employer or visa office decides, not the test centre.',
          'Open the official booking page, pick your city, then compare paper and computer dates.',
          'Book with the same passport you will bring on test day; the name must match exactly.',
          'Leave enough time before your application deadline for a possible retake.'
        ),
        'lead_time', 'Popular Tashkent dates, especially before university application deadlines, can fill early. Book as soon as you know your target date and check how late registration closes on the booking page.',
        'fees', 'Fees are set in UZS by the provider and change from time to time. Check the current fee on the official page before paying; Schood does not quote it.',
        'one_skill_retake', 'One Skill Retake lets you retake one skill after a full IELTS on computer test, within 60 days of the original test, at eligible centres. Check that your university or visa office accepts it.',
        'ukvi', 'If you need IELTS for UKVI (for some UK visas), confirm on the official page whether and where it is currently offered before you book.',
        'links', jsonb_build_array(
          jsonb_build_object('label', 'Test dates, fees and locations', 'url', 'https://www.britishcouncil.uz/en/exam/ielts/test-dates-fees-location'),
          jsonb_build_object('label', 'Book a test', 'url', 'https://www.britishcouncil.uz/en/exam/ielts/book-test'),
          jsonb_build_object('label', 'One Skill Retake', 'url', 'https://www.britishcouncil.uz/en/exam/ielts/one-skill-retake')
        )
      )
    ),
    (
      'idp',
      jsonb_build_object(
        'title', 'Taking IELTS in Uzbekistan with IDP',
        'checked_on', '2026-10-24',
        'cities', jsonb_build_array(),
        'cities_note', 'IDP lists its Uzbekistan test centres and the centres eligible for One Skill Retake on its official site. Check there for the venue nearest to you.',
        'delivery', 'IDP offers IELTS on computer at its centres; check the booking page for whether your centre also runs paper-based sessions.',
        'booking', jsonb_build_array(
          'Decide Academic or General Training first: the receiving organisation decides.',
          'Book online on the IDP Uzbekistan site and choose a centre and date.',
          'Book with the passport you will bring on test day; the name must match exactly.',
          'If you might need One Skill Retake, book IELTS on computer at an eligible centre.'
        ),
        'lead_time', 'Seats on popular dates can go early. Book once your target date is fixed and check the registration deadline on the booking page.',
        'fees', 'Fees are set in UZS by the provider and change from time to time. Check the current fee on the official page before paying; Schood does not quote it.',
        'one_skill_retake', 'One Skill Retake is available after a full IELTS on computer test at an eligible centre and must be taken within 60 days of the original test date. Check that your receiving organisation accepts it.',
        'ukvi', 'If you need IELTS for UKVI, confirm on the official site whether it is currently offered in Uzbekistan before you book.',
        'links', jsonb_build_array(
          jsonb_build_object('label', 'IDP IELTS Uzbekistan', 'url', 'https://ielts.idp.com/uzbekistan'),
          jsonb_build_object('label', 'One Skill Retake centres', 'url', 'https://ielts.idp.com/uzbekistan/about/ielts-one-skill-retake/ielts-one-skill-retake-test-centres')
        )
      )
    )
)
update public.ielts_playbook_market_guidance as market
set metadata = coalesce(market.metadata, '{}'::jsonb) || jsonb_build_object('local_guide', guides.local_guide)
from guides
where market.country_code = 'UZ'
  and market.provider_key = guides.provider_key
  and not (coalesce(market.metadata, '{}'::jsonb) ? 'local_guide');

insert into public.ielts_playbook_market_sources (market_guidance_id, source_id, sort_order)
select market.id, source.id, link.sort_order
from (
  values
    ('british-council', 'https://www.britishcouncil.uz/en/exam/ielts/test-dates-fees-location', 101),
    ('british-council', 'https://www.britishcouncil.uz/en/exam/ielts/book-test', 102),
    ('idp', 'https://ielts.idp.com/uzbekistan', 101),
    ('idp', 'https://ielts.idp.com/uzbekistan/about/ielts-one-skill-retake/ielts-one-skill-retake-test-centres', 102)
) as link(provider_key, url, sort_order)
join public.ielts_playbook_market_guidance market
  on market.country_code = 'UZ' and market.provider_key = link.provider_key
join public.ielts_playbook_sources source
  on source.url = link.url
on conflict (market_guidance_id, source_id) do nothing;

commit;
