# Academy v1 (Start)

Academy is implemented as a separate service on top of the shared platform identity.

## What is live

- Academy-scoped schema (additive, no breaking changes):
  - `academy_contacts`
  - `academy_classrooms`
  - `academy_classroom_memberships`
  - `academy_offers`
  - `academy_offer_grants`
  - `academy_payments`
  - `academy_entitlements`
  - `academy_conversations`
  - `academy_messages`
  - `academy_alerts`
- Idempotent payment engine:
  - SQL function `public.apply_academy_payment(p_payment_id uuid, p_actor_id uuid)`
  - Unique grant guard on `(payment_id, payment_grant_key)` in `academy_entitlements`
- Sponsored access resolver:
  - `GET /functions/v1/access-effective`
  - Combines personal entitlements + academy-sponsored product access
- Service app scaffold:
  - `apps/academy`

## Migrations

- `supabase/migrations/20260212000000_teacher_studio_core.sql`
- `supabase/migrations/20260212010000_teacher_studio_payment_engine.sql`
- `supabase/migrations/20260213200000_rename_teacher_studio_to_academy.sql`

## Edge functions

- Primary: `supabase/functions/academy/index.ts`
- Backward-compatible alias: `supabase/functions/teacher-studio/index.ts`
- `supabase/functions/access-effective/index.ts`

### `academy` read actions

- `POST /functions/v1/academy` with `action=summary`
- `POST /functions/v1/academy` with `action=contacts`
- `POST /functions/v1/academy` with `action=classrooms`
- `POST /functions/v1/academy` with `action=offers`
- `POST /functions/v1/academy` with `action=offer-grants`
- `POST /functions/v1/academy` with `action=payments`
- `POST /functions/v1/academy` with `action=entitlements`

If `academy_id` is omitted, the first active tenant membership is used.

### `academy` write actions (academy owner/admin)

- `action=upsert_contact`
- `action=create_classroom`
- `action=create_offer`
- `action=upsert_offer_grant`
- `action=create_payment`
- `action=mark_payment_paid` (internally calls `apply_academy_payment`)
- `action=grant_contact`

All write actions require academy admin role (`owner` or `admin`).

## Separation of concerns

- Existing product entitlements and IELTS content/session data are unchanged.
- Academy is isolated in academy-scoped tables and function namespace.
- Shared identity (`users`, `tenants`, `tenant_memberships`) stays the cross-service backbone.

## Current scope of app

- Auth-gated dashboard
- Academy selector
- Contacts management
- Classrooms management
- Classroom membership management
- Inbox (conversation list + direct teacher messages)
- Announcements (all contacts or classroom scoped)
- Alerts (create + resolve, with conversation timeline events)
- Offers management
- Offer grants
- Payment creation and manual settlement
- Entitlements visibility

## Next phase

1. Provider-backed payment statuses (instead of manual `mark_paid`).
2. Product entitlement guard hardening for Academy routes.
3. Student-facing classroom/workstream expansion.
