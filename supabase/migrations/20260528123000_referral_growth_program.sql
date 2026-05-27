-- Reframe the existing referral engine as the Schood Rewards growth program.
-- This keeps financial rules admin-controlled while giving the app a structured
-- program strategy that clients can render consistently.

update public.referral_programs
set
  name = case
    when name = 'Default Referral Program' then 'Schood Rewards'
    else name
  end,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'growth_program',
    jsonb_build_object(
      'brand_name', 'Schood Rewards',
      'tagline', 'Share Schood, fund the next study step.',
      'description', 'A cross-service referral program for students, teachers, academies, and education centers. Share the path that fits the person you are inviting, then Schood keeps the attribution through signup and eligible checkout.',
      'audiences', jsonb_build_array(
        jsonb_build_object(
          'id', 'student',
          'label', 'Students',
          'description', 'Invite learners into IELTS, SAT, TOEFL, English practice, and paid plans.'
        ),
        jsonb_build_object(
          'id', 'teacher',
          'label', 'Teachers',
          'description', 'Invite teachers who need classrooms, cohorts, and student progress tools.'
        ),
        jsonb_build_object(
          'id', 'center',
          'label', 'Education centers',
          'description', 'Invite centers to buy mock access, seats, vouchers, and academy workspaces.'
        ),
        jsonb_build_object(
          'id', 'academy',
          'label', 'Academies',
          'description', 'Invite operators building a structured academy on top of Schood.'
        )
      ),
      'milestones', jsonb_build_array(
        jsonb_build_object('label', 'Share', 'description', 'Pick the link that matches the learner, teacher, or center.'),
        jsonb_build_object('label', 'Claim', 'description', 'The code is stored at first visit and claimed after signup or login.'),
        jsonb_build_object('label', 'Convert', 'description', 'Eligible first purchases trigger the configured reward.'),
        jsonb_build_object('label', 'Use or cash out', 'description', 'Platform credit is posted automatically; cash payouts follow admin review when enabled.')
      ),
      'rules', jsonb_build_array(
        'Self-referrals are blocked.',
        'Discounts and rewards apply only while the program is active.',
        'Eligibility, minimum purchase, and first-purchase rules are controlled by the admin program settings.',
        'Cash payouts require the configured minimum amount and admin settlement.'
      ),
      'updated_by_migration', '20260528123000_referral_growth_program'
    )
  )
where program_key = 'default';

create index if not exists referral_attributions_code_claimed_idx
  on public.referral_attributions(referral_code, claimed_at desc);
