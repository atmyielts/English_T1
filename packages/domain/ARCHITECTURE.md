# Domain Layer Architecture

---

## 🔒 FOUNDATION CONTRACT — FROZEN

**Status**: CLOSED FOR CHANGES  
**Freeze Date**: 2024-12-25  
**Version**: 1.0.0

### Validation (All Must Pass ✅)

| Product | Supported? | How |
|---------|------------|-----|
| IELTS CBT Exam | ✅ | Experience → Sections (L/R/W) → Parts → ContentUnits (audio, text, prompts) |
| Math SAT Quiz | ✅ | Experience → Sections (Algebra, Geometry) → Parts → ContentUnits (prompts with options) |
| Typing Speed Game | ✅ | Experience → Section → Part → ContentUnit (text prompt) + Response (text) + timing Rule |
| Coding Interview | ✅ | Experience → Section → Part → ContentUnit (prompt) + Response (file/text) + AI Evaluation |

### Invariants (Never Break)

1. **Domain has ZERO external dependencies**
2. **No product-specific logic in domain**
3. **All entities are immutable (readonly)**
4. **Responses cannot be modified after submission**
5. **Evaluations are separate from responses**
6. **Rules are data, not code**

> ⚠️ **From this point forward, no product requirement may modify the foundation.**  
> All product-specific behavior must be built ON TOP of this layer.

---

## System Boundaries (Phase 11)

When adding anything to the foundation, ask:

| Question | Answer | Location |
|----------|--------|----------|
| Is this product-specific? | Yes | **Above foundation** (apps, config) |
| Is this behavioral? | Yes | **Config layer** (rules, settings) |
| Is this meaningful domain logic? | Yes | **Domain layer** (this package) |
| Is this storage/auth? | Yes | **Infrastructure** (Supabase adapters) |

If unclear → **pause and reconsider**.

---

## Layer Dependencies

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT APPS                          │
│           (platform, exam-runner, admin)                │
├─────────────────────────────────────────────────────────┤
│                   CONFIGURATION                         │
│        (product configs, rule sets, themes)             │
├─────────────────────────────────────────────────────────┤
│                    INTEGRATION                          │
│      (OpenRouter AI, payment, external APIs)            │
├─────────────────────────────────────────────────────────┤
│                  INFRASTRUCTURE                         │
│    (Supabase adapters, repositories, storage)           │
│           ↓ implements interfaces from ↓                │
├─────────────────────────────────────────────────────────┤
│                 ★ DOMAIN (this package) ★               │
│   Entities, Interfaces, Types - ZERO DEPENDENCIES       │
└─────────────────────────────────────────────────────────┘
```

**Rule**: Arrows only point DOWN. Domain never imports from layers above.

---

## What Belongs Where

### ✅ Domain Layer (this package)
- Entity definitions (User, Product, Session, etc.)
- Repository interfaces (ProductRepository, etc.)
- Service interfaces (EntitlementService, etc.)
- Type definitions and enums
- Invariant documentation

### ❌ NOT in Domain Layer
- Supabase imports
- HTTP/API logic
- IELTS/TOEFL specific logic
- Scoring algorithms
- UI components
- Payment processing

---

## Verification Checklist

The foundation is complete when:

- [x] Domain compiles standalone with zero external dependencies
- [x] All entities use `readonly` properties
- [x] Interfaces define contracts, not implementations
- [x] Same core works for IELTS, TOEFL, Math SAT
- [x] Responses are immutable (no update methods)
- [x] Evaluations are separate from responses
- [x] Progress tracks facts only, no recommendations
- [x] Rules are data, not code
