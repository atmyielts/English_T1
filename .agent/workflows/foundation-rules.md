---
description: How to work with the foundation codebase
---

# Foundation Codebase Workflow

## ⚠️ MANDATORY: Read Before Touching Code

**STOP.** Before making any changes to this codebase, you MUST read:

1. **[FOUNDATION_SPEC.md](../../FOUNDATION_SPEC.md)** — Complete specification of the foundation layer
2. **[packages/domain/ARCHITECTURE.md](../../packages/domain/ARCHITECTURE.md)** — Layer boundaries and frozen contract

## Key Rules

1. **The domain package is FROZEN** — No modifications allowed
2. **Foundation tables are FROZEN** — `001_foundation_users_entitlements.sql` cannot be modified
3. **Domain core tables are MEANING-FROZEN** — `002_domain_core_structure.sql` allows additive changes only
4. **Domain has zero external dependencies** — Never add imports from infrastructure
5. **No product-specific logic in domain** — IELTS/TOEFL logic goes in config layer
6. **Responses are immutable** — Never add update methods

## Frozen Migrations

| Migration | Layer | Freeze Type |
|-----------|-------|-------------|
| `001_foundation_users_entitlements.sql` | Foundation | Full freeze |
| `002_domain_core_structure.sql` | Domain Core | Meaning freeze (additive OK) |
| `020_ielts/001_content_units.sql` | Product Data | Structure freeze (content evolves) |
| `020_ielts/002_sessions_responses.sql` | Runtime | Structure freeze (data immutable) |

## Database Layers

```
🔒 FOUNDATION (001_) — users, entitlements
      ↓
🔒 DOMAIN CORE (002_) — products, experiences, sections, parts
      ↓
🟧 PRODUCT DATA (020_ielts/) — content_units
      ↓
🟥 RUNTIME (020_ielts/) — sessions, responses
```

## Layer Structure

```
apps/           → UI applications (can change freely)
packages/
  ├── config/       → Product configurations (IELTS rules, etc.)
  ├── domain/       → FROZEN foundation (DO NOT MODIFY)
  ├── infrastructure/ → Supabase adapters (implement domain interfaces)
  ├── integration/  → External APIs (OpenRouter, payments)
  └── ui-kit/       → Shared components
```

## Adding a New Product

1. Create product config in `packages/config/products/`
2. Define rules as data
3. Reuse existing domain entities
4. **NEVER modify domain for product requirements**

## Validation Check

Before any commit, ask:
- Does this change violate any invariant in FOUNDATION_SPEC.md?
- Does domain package still have zero external dependencies?
- Are all responses still immutable?

