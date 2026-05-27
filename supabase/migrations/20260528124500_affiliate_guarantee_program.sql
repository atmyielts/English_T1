-- Add a first-class affiliate guarantee layer on top of the existing
-- referral attribution and reward ledger. Financial rates remain controlled by
-- the referral program settings; this metadata defines the public contract.

update public.referral_programs
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'affiliate_program',
  jsonb_build_object(
    'brand_name', 'Schood Affiliate Guarantee',
    'tagline', 'Tracked, qualified conversions are reserved for payout.',
    'guarantee_label', 'Tracked conversion guarantee',
    'guarantee_window_days', 45,
    'description', 'Affiliate traffic uses the same referral ledger, but with stricter visibility: click context, account claim, eligible purchase, reward reservation, payout request, and admin settlement all stay attached to one code.',
    'terms', jsonb_build_array(
      'The first valid referral claim for a referred account owns the attribution.',
      'A reward is guaranteed only after an eligible purchase converts under the active program rules.',
      'Issued cash rewards remain reserved as available, requested, approved, or paid until an admin rejects or reverses them.',
      'Self-referrals, invalid codes, refunded purchases, and admin reversals are excluded.'
    ),
    'proof_points', jsonb_build_array(
      'Code captured from link',
      'Account attribution stored',
      'Payment conversion linked',
      'Reward row issued',
      'Cash payout settlement audited'
    ),
    'updated_by_migration', '20260528124500_affiliate_guarantee_program'
  )
)
where program_key = 'default';

create index if not exists referral_attributions_affiliate_source_idx
  on public.referral_attributions((metadata->>'source'), claimed_at desc)
  where metadata ? 'source';
