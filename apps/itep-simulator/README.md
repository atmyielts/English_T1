# iTEP Simulator

`apps/itep-simulator` powers the production iTEP simulator at `itep.schood.online`.

## Launch Coverage

- Families: `Academic`, `SLATE`, `Business`
- Variants: `Core`, `Writing Live`
- Scored learner-facing skills: `Reading`, `Listening`, `Grammar`, `Writing`
- Future-ready only: `Speaking` foundations exist in shared data and scoring layers, but speaking is intentionally hidden from the learner UI in this release

## Responsibilities

- Learner routes for landing, dashboard, practice, full exam, review, and results
- Admin routes for test management, builder, import, and media assets
- Product entitlement enforcement and platform auth handoff
- iTEP-specific score rendering, composite calculation, and CEFR guidance

## Required Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PLATFORM_URL`
- `VITE_AUTH_COOKIE_DOMAIN`

## Optional Environment Variables

- `VITE_AUTH_SHARED_COOKIE`
- `VITE_AUTH_STORAGE_KEY`
- `VITE_DISABLE_PAYWALL`
- `VITE_DEBUG_AUTH`
- `VITE_USE_LEARNING_PROFILE_V2`
- `VITE_USE_SCORE_SESSION_V2`
- `VITE_USE_GRADE_WRITING_V2`

## Commands

```bash
npm --workspace apps/itep-simulator run dev
npm --workspace apps/itep-simulator run build
```
