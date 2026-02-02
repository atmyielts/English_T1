# 🔒 UNIVERSAL FOUNDATION SPECIFICATION

> **⚠️ READ THIS FIRST — MANDATORY FOR ALL AGENTS AND DEVELOPERS**
>
> This document is the **single source of truth** for the foundation layer.  
> No code may be written that violates these principles.  
> No product requirement may modify the foundation.

---

## 0. Purpose of This Document

This document defines the foundational layer of a **universal education and assessment platform**.

The foundation is:

- ✅ Product-agnostic
- ✅ Infrastructure-agnostic  
- ✅ UI-agnostic
- ✅ Behavior-minimal
- ✅ Stable over time

It supports **any** structured learning or assessment experience:

| Category | Examples |
|----------|----------|
| Language Exams | IELTS, TOEFL, SAT |
| Academic | School exams, certifications |
| Technical | Coding interviews, typing tests |
| Practice | Language drills, grammar trainers |

**This document is the single source of truth for what the foundation is allowed to know and do.**

---

## 1. Core Philosophy

### 1.1 Separation of Truth, Behavior, and Interpretation

| Layer | Responsibility |
|-------|----------------|
| **Foundation (Domain)** | Stores facts and relationships |
| **Configuration / Product** | Defines behavior using data |
| **Applications** | Render UI and orchestrate flows |

> The foundation **never** interprets meaning, **never** enforces product rules, and **never** assumes context.

### 1.2 Entity-First, Behavior-Last

The foundation models:
- ✅ What exists
- ✅ What happened  
- ✅ Who did what

The foundation does **NOT** model:
- ❌ What should happen
- ❌ What is correct
- ❌ What is good or bad

**Those belong outside.**

### 1.3 Universality Contract

> If a concept cannot exist in **an exam, a game, a lesson, AND a tool**, then it does not belong in the foundation.

---

## 2. Foundational Layers Overview

The foundation consists of **seven conceptual domains**:

| # | Domain | Question |
|---|--------|----------|
| 1 | Identity | WHO |
| 2 | Products | WHAT |
| 3 | Entitlements | CAN |
| 4 | Content | CONTENT |
| 5 | Structure | ORGANIZATION |
| 6 | Interaction | TIME |
| 7 | Output & Memory | FACTS |

Each domain is **independent but composable**.

---

## 3. Identity Layer — WHO

**Purpose**: Represent who a user is, not how they authenticated or what they can do.

### Core Concepts

- A `User` is an immutable identity reference
- Authentication providers are external
- Identity does not imply access or ownership

### Rules

| ❌ NEVER | ✅ ALLOWED |
|----------|------------|
| Permissions | UUID |
| Roles | Email |
| Product knowledge | Creation timestamp |
| | Minimal metadata |

### Guarantees

- Any auth provider can be swapped
- Any user system (SSO, email, phone) can fit

---

## 4. Product Layer — WHAT

**Purpose**: Represent things the platform offers, not how they behave.

### Definition

A `Product` is a logical container for experiences.

**Examples**:
- IELTS Simulator
- TOEFL Practice
- Math SAT
- Typing Speed Test
- Grammar Trainer

### Rules

| ❌ NEVER | ✅ ALLOWED |
|----------|------------|
| Content storage | Name |
| Rules/behavior | Type (exam/practice/tool) |
| Execution logic | Status |
| | Metadata |

### Why This Exists

Enables unified:
- Billing
- Entitlement
- Discovery
- Analytics

**Without mixing logic.**

---

## 5. Entitlement Layer — CAN

**Purpose**: Represent access rights as facts, not business decisions.

### Definition

An `Entitlement` states:

> "User X may access Product Y from time A until time B."

### Rules

| ❌ NEVER | ✅ ALLOWED |
|----------|------------|
| Why it exists | User reference |
| Payment logic | Product reference |
| Admin overrides | Valid from/until |
| Pricing | Source (purchase/grant/trial) |

### Guarantees

Works for:
- ✅ Subscriptions
- ✅ One-time purchases
- ✅ Free access
- ✅ Admin grants

---

## 6. Content Layer — CONTENT

**Purpose**: Represent atomic, reusable content, independent of context.

### Definition

A `ContentUnit` is:
- A single piece of information
- Without structure
- Without scoring
- Without user awareness

**Examples**: Question text, images, audio files, writing prompts, instructions

### Rules

| ❌ NEVER | ✅ ALLOWED |
|----------|------------|
| Where it appears | Type (text/audio/image/prompt) |
| Who sees it | Raw data payload |
| How it's evaluated | Creation timestamp |
| Answers/correctness | Metadata (tags, difficulty) |

**This guarantees maximum reuse.**

---

## 7. Structure Layer — ORGANIZATION

**Purpose**: Organize content into navigable hierarchies.

### Core Abstractions

| Level | Meaning | Example |
|-------|---------|---------|
| **Experience** | A full activity | Full IELTS Test |
| **Section** | A major division | Listening, Reading |
| **Part** | A granular grouping | Part 1, Passage A |

### Rules

| ❌ NEVER | ✅ ALLOWED |
|----------|------------|
| Behavior enforcement | Order |
| Logic | Containment |
| Timing | References to content |
| Scoring | Metadata |

Structure can be **reused across products**.

---

## 8. Rules Layer — CONSTRAINTS (Data-Only)

**Purpose**: Define constraints as **data**, not code.

### Rule Categories

- **Timing** — Duration, warnings, auto-submit
- **Navigation** — Back/skip, sequential-only
- **Submission** — Edit allowed, require all
- **Display** — Show answers, immediate score
- **Retry** — Max attempts, cooldown

### Attachment Model

Rules attach to: `Product` → `Experience` → `Section` → `Part`

### Critical Rule

> **The foundation stores rules but NEVER enforces them.**

Enforcement is done by Applications / Runtimes / Engines.

---

## 9. Interaction Layer — TIME

**Purpose**: Track user interaction over time.

### Core Concept: Session

A `Session` represents:
- A user
- Engaging with an experience
- Across time
- With a lifecycle: `created → active → paused → completed`

### What Sessions Do NOT Do

| ❌ NEVER |
|----------|
| Score |
| Validate answers |
| Enforce timing |
| Apply rules |

**They only record state transitions.**

---

## 10. Response Layer — RAW OUTPUT

**Purpose**: Store exact user submissions as **immutable facts**.

### Principles

| Rule | Reason |
|------|--------|
| Responses are **immutable** | Audit trail |
| Responses are **never overwritten** | Re-evaluation |
| Responses contain **no correctness** | Separation of judgment |

This enables:
- Re-evaluation
- Auditing
- Appeals
- AI reprocessing

---

## 11. Evaluation Layer — JUDGMENT

**Purpose**: Interpret responses **without modifying them**.

### Characteristics

- Multiple evaluations per response allowed
- Methods can differ: `auto`, `ai`, `human`, `hybrid`
- Evaluations are repeatable and versionable

### Separation Rule

> **Evaluation is never required for response existence.**
> A response is valid even if never evaluated.

---

## 12. Progress Layer — MEMORY

**Purpose**: Record what happened, **not what it means**.

### Examples

- User completed a section
- User attempted an experience
- User received a score

### Properties

- Append-only
- Time-stamped
- Contextual

**No recommendations. No predictions.**

---

## 13. Infrastructure Boundary (Supabase)

### Supabase Role

| Supabase IS | Supabase is NOT |
|-------------|-----------------|
| A persistence engine | A domain authority |
| An auth provider | A rule engine |
| A storage system | A product brain |

### Contract

> Infrastructure **implements interfaces** defined by the foundation.
> The foundation **never imports infrastructure**.

---

## 14. API Philosophy (Conceptual)

All APIs exposed by the foundation are:

- ✅ CRUD-style
- ✅ Intent-neutral
- ✅ Side-effect free (except persistence)

### Valid Intents

```
Create session
Save response  
Fetch structure
Check entitlement
```

### Invalid Intents (Product Concerns)

```
❌ "Start IELTS"
❌ "Grade writing"
❌ "Calculate band"
```

---

## 15. Universality Validation

| Scenario | Structure | Session | Response | Evaluation | Rules |
|----------|-----------|---------|----------|------------|-------|
| IELTS Exam | ✅ | ✅ | ✅ | ✅ (AI) | ✅ (timing) |
| Coding Interview | ✅ | ✅ | ✅ (file) | ✅ (AI) | ✅ |
| Typing Game | ✅ | ✅ | ✅ (text) | ✅ (auto) | ✅ (timing) |
| Math SAT | ✅ | ✅ | ✅ (select) | ✅ (auto) | ✅ |

**All supported by the same foundation.**

---

## 16. Invariants (Non-Negotiable)

> ⚠️ **If any invariant breaks, the architecture is broken.**

| # | Invariant |
|---|-----------|
| 1 | Domain has **zero infrastructure imports** |
| 2 | Foundation has **zero product logic** |
| 3 | Responses are **immutable** |
| 4 | Evaluations **never modify** originals |
| 5 | Rules are **data, not behavior** |
| 6 | Products are **configuration, not code** |
| 7 | UI is **replaceable at any time** |

---

## 17. Foundation Completion Criteria

The foundation is complete when:

- ✅ No new entity is needed for a new product
- ✅ All future complexity lives outside
- ✅ Changes are additive, not mutative
- ✅ The foundation feels **boring**

**You are here.**

---

## 18. Final Statement

> This foundation is not optimized for speed.  
> It is optimized for **longevity, clarity, and scale**.

If built correctly:

- You will move slower for 2–3 weeks
- Then **faster than anyone else for years**

---

## 19. Foundation Database Schema — FROZEN

> ⚠️ **THESE TABLES ARE FROZEN. DO NOT MODIFY.**
> 
> Location: `packages/infrastructure/supabase/migrations/001_foundation_users_entitlements.sql`

These tables answer only **TWO questions**:
1. Who is the user (inside our domain)?
2. What is the user allowed to access?

**Nothing else.**

### 19.1 `users` Table — Domain Mirror of auth.users

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid (PK) | References auth.users |
| `email` | text | Duplicated on purpose (avoid joins) |
| `full_name` | text | Display name |
| `avatar_url` | text | Profile image |
| `role` | text | Coarse system roles: user, admin, staff |
| `is_active` | boolean | Account state |
| `created_at` | timestamptz | Audit |
| `updated_at` | timestamptz | Audit |

**Rules**:
- 1-to-1 with `auth.users`
- Never deleted directly (soft delete only)
- **NO product-specific columns**

### 19.2 `entitlements` Table — Universal Access Control

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid (PK) | Unique identifier |
| `user_id` | uuid (FK) | Who owns this |
| `resource_type` | text | What kind: product, experience, feature |
| `resource_id` | uuid | Which specific resource (nullable for global) |
| `is_active` | boolean | Currently valid |
| `starts_at` | timestamptz | When access begins |
| `ends_at` | timestamptz | When access expires (null = perpetual) |
| `usage_limit` | integer | Max uses (future) |
| `usage_count` | integer | Current uses (future) |
| `source` | text | Origin: system, admin, stripe, promo |
| `created_at` | timestamptz | Audit |
| `updated_at` | timestamptz | Audit |

**Supports**:
- ✅ Free access
- ✅ Trials
- ✅ Paid access
- ✅ Admin grants
- ✅ Time-limited access
- ✅ Usage-limited access (future)

### 19.3 What You MUST NOT Add

| ❌ FORBIDDEN | Why |
|--------------|-----|
| `product_id` in users | Product-specific |
| `exam_id` in entitlements | Product-specific |
| `permissions` JSON | Too complex |
| Role-based logic | Belongs in app layer |
| Session references | Wrong table |
| Payment columns | Belongs in billing module |

### 19.4 Sanity Test

If tomorrow you:
- Delete IELTS entirely
- Add TOEFL, Math tests, a blog, a mobile app

👉 **These tables remain UNTOUCHED**

---

## 20. Domain Core Structure — FROZEN (Meaning, Not Evolution)

> ⚠️ **AI AGENTS: You may READ these. You do NOT redesign them.**
>
> Location: `packages/infrastructure/supabase/migrations/002_domain_core_structure.sql`

### Freeze Policy

| Allowed | Forbidden |
|---------|-----------|
| ✅ Add columns | ❌ Rename tables |
| ✅ Add indexes | ❌ Change meaning |
| ✅ Add metadata usage | ❌ Mix product logic |

### 20.1 Hierarchy

```
Product
  └── Experience
        └── Section
              └── Part
                    └── Content Units (next layer)
```

### 20.2 Tables

| Table | Purpose | Examples |
|-------|---------|----------|
| `products` | Unit of access/entitlement | IELTS Simulator, TOEFL Practice |
| `experiences` | Structured activity to start | Full IELTS Test, Listening Mock #2 |
| `sections` | Major divisions | Listening, Reading, Writing |
| `parts` | Subdivisions | Part 1, Passage A |

### 20.3 Critical Rules

**Nothing in this hierarchy knows about**:
- ❌ IELTS
- ❌ Time
- ❌ Scoring
- ❌ Users

**That's by design.**

### 20.4 What Comes NEXT (Not in domain core)

These attach ON TOP, never inside:
- `content_units`
- `sessions`
- `responses`
- `rules`
- `timing`
- `evaluation`

---

## 21. Product Data Layer — IELTS Content

> Location: `packages/infrastructure/supabase/migrations/020_ielts/001_content_units.sql`

### Purpose

Static, reusable exam content that exists before any user touches it.
**This is where IELTS becomes IELTS.**

### `content_units` Table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `part_id` | uuid (FK) | Belongs to a Part |
| `type` | text | instruction, reading_passage, question_*, audio, writing_prompt |
| `data` | jsonb | Actual content payload (varies by type) |
| `display_order` | integer | Order within part |
| `metadata` | jsonb | Tags, difficulty, etc. |

### Freeze Status

| ⚠️ Structure frozen | Content evolves |
|---------------------|-----------------|
| Cannot rename columns | Can add new types |
| Cannot change meaning | Can add content |

---

## 22. Runtime Layer — User Interaction

> Location: `packages/infrastructure/supabase/migrations/020_ielts/002_sessions_responses.sql`

### Purpose

Where real users exist. If product data is a book, runtime is someone reading and writing in it.

### `sessions` Table

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `user_id` | uuid (FK) | Who is taking this |
| `experience_id` | uuid (FK) | What experience |
| `status` | text | created, active, paused, completed, abandoned |
| `started_at` | timestamptz | When started |
| `completed_at` | timestamptz | When finished |
| `metadata` | jsonb | Timing, device, position |

### `responses` Table — IMMUTABLE

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid | Primary key |
| `session_id` | uuid (FK) | Which session |
| `content_unit_id` | uuid (FK) | Which question |
| `type` | text | text, single_choice, multi_choice, audio, file |
| `data` | jsonb | User's answer |
| `submitted_at` | timestamptz | When submitted |

### Immutability Rule (CRITICAL)

| ❌ NEVER | ✅ ALWAYS |
|----------|-----------|
| UPDATE responses | New row for changes |
| DELETE responses | Append-only |

---

## 🔒 FROZEN STATUS

| Property | Value |
|----------|-------|
| **Status** | CLOSED FOR CHANGES |
| **Freeze Date** | 2024-12-25 |
| **Version** | 1.0.0 |

### Complete Freeze Table

| Layer | Migration | Freeze Type |
|-------|-----------|-------------|
| Foundation | `001_foundation_users_entitlements.sql` | 🔒 Full freeze |
| Domain Core | `002_domain_core_structure.sql` | 🔒 Meaning freeze |
| Product Data | `020_ielts/001_content_units.sql` | ⚠️ Structure freeze |
| Runtime | `020_ielts/002_sessions_responses.sql` | ⚠️ Structure freeze |
| Domain TypeScript | `packages/domain/src/` | 🔒 Full freeze |
| Architecture Doc | `packages/domain/ARCHITECTURE.md` | 🔒 Full freeze |

### Database Layer Diagram

```
🔒 FOUNDATION — users, entitlements
      ↓
🔒 DOMAIN CORE — products, experiences, sections, parts
      ↓
🟧 PRODUCT DATA — content_units
      ↓
🟥 RUNTIME — sessions, responses
      ↓
⬜ EVALUATION — (next layer)
```

> **From this point forward, no product requirement may modify the foundation.**
> All product-specific behavior must be built ON TOP of this layer.
