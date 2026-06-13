# System Foundation Specification

## 1. Core architectural principles (non-negotiable)

These rules keep the system safe and sane long-term:

- One identity, one billing, one entitlement system
- Products never handle auth or payments
- Platform never contains product logic
- Entitlements are the only access contract
- Each product owns its data
- All access flows through `/me`
- Monorepo, not microservices

**If you violate these, the system rots.**

---

## 2. High-level system view

                ┌───────────────────────────┐
                │        Platform            │
                │───────────────────────────│
                │ Auth / Account / Billing   │
                │ Pricing / Entitlements     │
                │ Admin (optional)           │
                └─────────────┬─────────────┘
                              │
                      /me + entitlements
                              │
    ┌─────────────────────────┼─────────────────────────┐
    │                         │                         │
┌───────────────┐ ┌────────────────┐ ┌────────────────┐
│ IELTS Product │ │ Grammar Product │ │ Speaking Product│
│ (exam logic) │ │ (drills) │ │ (AI eval) │
└───────────────┘ └────────────────┘ └────────────────┘


---

## 3. Monorepo structure (final form)
**Note:** The current repo keeps supabase/migrations and supabase/functions flat. That is acceptable for now. Do not refactor infra layout until 2+ products are live and multiple devs touch Supabase regularly.


/
├─ apps/
│ ├─ platform/ # Identity & billing shell
│ │ ├─ src/
│ │ │ ├─ pages/
│ │ │ │ ├─ auth/
│ │ │ │ ├─ account/
│ │ │ │ ├─ billing/
│ │ │ │ ├─ pricing/
│ │ │ │ └─ admin/ # optional
│ │ │ ├─ components/
│ │ │ ├─ guards/
│ │ │ ├─ routes.ts
│ │ │ └─ index.tsx
│ │ └─ env.d.ts
│ │
│ ├─ ielts-simulator/ # Product app
│ │ ├─ src/
│ │ │ ├─ features/
│ │ │ │ ├─ listening/
│ │ │ │ ├─ reading/
│ │ │ │ ├─ writing/
│ │ │ │ └─ speaking/
│ │ │ ├─ pages/
│ │ │ ├─ guards/
│ │ │ ├─ services/
│ │ │ └─ index.tsx
│ │
│ ├─ grammar/
│ │ ├─ src/
│ │ │ ├─ features/
│ │ │ ├─ pages/
│ │ │ ├─ guards/
│ │ │ └─ index.tsx
│ │
│ ├─ speaking/
│ │ ├─ src/
│ │ │ ├─ features/
│ │ │ ├─ ai/
│ │ │ ├─ pages/
│ │ │ └─ index.tsx
│
├─ packages/
│ ├─ domain/ # Shared domain models
│ │ ├─ user.ts
│ │ ├─ entitlements.ts
│ │ ├─ ielts/
│ │ │ ├─ session.ts
│ │ │ ├─ scoring.ts
│ │ │ └─ rubric.ts
│ │ ├─ grammar/
│ │ └─ speaking/
│ │
│ ├─ integration/ # External services
│ │ ├─ payments/
│ │ ├─ ai/
│ │ └─ storage/
│ │
│ ├─ ui-kit/ # Design system
│ │ ├─ components/
│ │ ├─ layout/
│ │ └─ theme/
│ │
│ ├─ config/
│ │ ├─ env.ts
│ │ └─ feature-flags.ts
│
├─ supabase/
│ ├─ migrations/
│ │ ├─ platform/
│ │ │ ├─ users.sql
│ │ │ ├─ tenants.sql
│ │ │ ├─ entitlements.sql
│ │ │ ├─ payments.sql
│ │ ├─ ielts/
│ │ ├─ grammar/
│ │ └─ speaking/
│ │
│ ├─ functions/
│ │ ├─ platform/
│ │ │ ├─ me.ts
│ │ │ ├─ billing.ts
│ │ │ ├─ click.ts
│ │ │ └─ admin/
│ │ │
│ │ ├─ ielts/
│ │ │ ├─ exam-state.ts
│ │ │ ├─ score-session.ts
│ │ │ └─ review-session.ts
│ │ │
│ │ ├─ grammar/
│ │ └─ speaking/
│
├─ tools/
│ ├─ scripts/
│ └─ importers/
│
├─ FOUNDATION_SPEC.md
├─ tsconfig.base.json
├─ package.json
└─ .env.example


---

## 4. Platform responsibilities (locked & stable)

Platform owns only:

- Authentication UI
- Password reset
- Account & profile
- Billing & subscriptions
- Entitlement management
- Admin (optional)

Platform must **never**:

- Render learning UI
- Handle exams
- Know scoring logic
- Import product domain code

**If a feature depends on IELTS existing → not platform**

---

## 5. Product responsibilities (isolated & fast)

Each product owns:

- UX
- Workflows
- Product-specific state
- AI logic (if applicable)
- Storage usage (audio, answers)

Each product:

- Calls `/me`
- Checks entitlements
- Calls its own APIs
- Redirects when blocked

**No exceptions.**

---

## 6. Entitlements model (future-proof)

entitlements
------------
id
tenant_id
user_id (optional audit / payer)
resource_type ('product' | 'feature' | 'limit')
resource_id
starts_at
ends_at
value (jsonb)


**Examples:**

- `product: ielts_simulator`
- `feature: ai_writing_feedback`
- `limit: monthly_ai_tokens`

Entitlements are **tenant-scoped**. /me resolves effective entitlements via the user's memberships.

This supports:

- Bundles
- Trials
- Add-ons
- Lifetime access
- Enterprise plans

---

## 7. Authentication & access flow (single rule)

Product loads →
call /me →
no session → redirect platform/auth
session but no entitlement → redirect platform/pricing
valid → load product


**This rule never changes.**

---

## 8. Safety & dependability guarantees

This structure guarantees:

- 🔒 Security via RLS + centralized auth
- 🧠 Correctness via `/me`
- 🔁 Extensibility via entitlements
- 🚀 Velocity via monorepo
- 🧱 Isolation without infra split
- 🧭 Clarity for new developers
