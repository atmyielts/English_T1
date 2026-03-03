# SAT Production Smoke Checklist

Run this checklist on staging with production-like env values before pushing SAT to production.

## Required pass criteria

- All six scenarios pass end-to-end.
- Any failed scenario blocks release.

## Scenarios

1. `signup -> pricing -> payment -> entitlement -> SAT dashboard`
- Create a new user.
- Purchase SAT plan.
- Confirm active SAT entitlement exists.
- Confirm SAT dashboard opens without manual grants.

2. `non-entitled deep-link guard`
- Use an account without SAT entitlement.
- Open `/dashboard` on SAT app directly.
- Verify redirect to platform pricing with SAT product context.

3. `full exam resume`
- Start a full exam.
- Answer some items, refresh page.
- Verify same section resumes and deadline does not reset.

4. `finish + score + review`
- Complete a full exam session.
- Verify results page renders SAT totals and section scores.
- Verify review page and review-session pages load.

5. `starter cap enforcement`
- Use SAT Starter entitlement.
- Start one full mock successfully.
- Attempt second full mock start.
- Verify `usage_limit_reached` behavior and user-facing message.

6. `admin content safety`
- Update/import SAT content from admin pages.
- Verify active learner sessions can still continue without schema/runtime errors.

## Evidence to capture

- Timestamped screenshots for each scenario.
- Session IDs used for scoring/review checks.
- Any backend error payloads (`request_id`) for failures.
