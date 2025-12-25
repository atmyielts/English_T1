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
2. **Domain has zero external dependencies** — Never add imports from infrastructure
3. **No product-specific logic in domain** — IELTS/TOEFL logic goes in config layer
4. **Responses are immutable** — Never add update methods

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
