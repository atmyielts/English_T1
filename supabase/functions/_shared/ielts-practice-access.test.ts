import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bundleIdsIncluding,
  decidePracticeAccess,
  IELTS_PRACTICE_PRODUCT_ID_FALLBACK,
  practiceAccessRequired,
  resolvePracticeProductId,
  userHasPracticeAccess,
} from "./ielts-practice-access.ts";

const PRACTICE = "a74195fd-b4f3-4fd4-93bf-c807e42250c6";
const COMPLETE = "11111111-1111-4111-8111-111111111111";
const ENGLISH_ALL = "3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa";
const NOW = Date.parse("2026-10-24T10:00:00.000Z");
const active = (resource_id: string, extra: Record<string, unknown> = {}) =>
  ({ resource_id, is_active: true, starts_at: "2026-10-01T00:00:00.000Z", ends_at: "2026-11-01T00:00:00.000Z", ...extra });

Deno.test("bundles that list IELTS Practice by slug or id count; others do not", () => {
  const products = [
    { id: COMPLETE, status: "active", metadata: { bundle_of: ["ielts-academic-simulator", "ielts-practice", "ielts-playbook"] } },
    { id: "by-id", status: "active", metadata: { bundle_of: [PRACTICE] } },
    { id: ENGLISH_ALL, status: "active", metadata: { bundle_of: ["english-reading", "english-writing"] } },
    { id: "retired", status: "archived", metadata: { bundle_of: ["ielts-practice"] } },
  ];
  assertEquals(bundleIdsIncluding(products, PRACTICE), [COMPLETE, "by-id"]);
  assertEquals(bundleIdsIncluding(null, PRACTICE), []);
});

Deno.test("access decision: admin, direct, sponsored and bundle entitlements", () => {
  const base = { role: "student", practiceProductId: PRACTICE, bundleProductIds: [COMPLETE], entitlements: [], sponsored: [], nowMs: NOW };
  assertEquals(decidePracticeAccess(base), false);
  assertEquals(decidePracticeAccess({ ...base, role: "admin" }), true);
  assertEquals(decidePracticeAccess({ ...base, entitlements: [active(PRACTICE)] }), true);
  assertEquals(decidePracticeAccess({ ...base, entitlements: [active(COMPLETE)] }), true);
  // An English All Skills subscription does not unlock IELTS Practice.
  assertEquals(decidePracticeAccess({ ...base, entitlements: [active(ENGLISH_ALL)] }), false);
  // Expired and inactive entitlements do not count.
  assertEquals(decidePracticeAccess({ ...base, entitlements: [active(PRACTICE, { ends_at: "2026-10-20T00:00:00.000Z" })] }), false);
  assertEquals(decidePracticeAccess({ ...base, entitlements: [active(PRACTICE, { is_active: false })] }), false);
  assertEquals(decidePracticeAccess({
    ...base,
    sponsored: [{ status: "active", grant_type: "product_access", resource_type: "product", resource_id: COMPLETE, starts_at: "2026-10-01T00:00:00.000Z", expires_at: null }],
  }), true);
  assertEquals(decidePracticeAccess({
    ...base,
    sponsored: [{ status: "revoked", grant_type: "product_access", resource_type: "product", resource_id: PRACTICE, starts_at: "2026-10-01T00:00:00.000Z", expires_at: null }],
  }), false);
});

type Tables = Record<string, { data: unknown; error?: unknown }>;

/** Minimal chainable stand-in for the supabase-js query builder. */
const fakeClient = (tables: Tables, seen: string[] = []) => ({
  from(table: string) {
    seen.push(table);
    const result = tables[table] ?? { data: [] };
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "in", "order", "limit"]) builder[method] = () => builder;
    builder.maybeSingle = () => Promise.resolve({ data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error ?? null });
    builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: result.data, error: result.error ?? null });
    return builder;
  },
});

Deno.test("loader: a bundle subscriber passes, a learner with no product gets the 403 body", async () => {
  const bundleOwner = fakeClient({
    users: { data: { role: "student" } },
    products: { data: [{ id: COMPLETE, status: "active", metadata: { bundle_of: ["ielts-practice"] } }] },
    tenant_memberships: { data: [{ tenant_id: "tenant-1" }] },
    entitlements: { data: [{ resource_id: COMPLETE, is_active: true, starts_at: null, ends_at: null }] },
    academy_entitlements: { data: [] },
  });
  assertEquals(await userHasPracticeAccess(bundleOwner, "user-1", PRACTICE), true);

  const noProduct = fakeClient({
    users: { data: { role: "student" } },
    products: { data: [] },
    tenant_memberships: { data: [] },
    academy_entitlements: { data: [] },
  });
  assertEquals(await userHasPracticeAccess(noProduct, "user-2", PRACTICE), false);
  assertEquals(practiceAccessRequired(PRACTICE).code, "product_access_required");
});

Deno.test("loader: admins skip entitlement reads; failures surface instead of granting", async () => {
  const seen: string[] = [];
  assertEquals(await userHasPracticeAccess(fakeClient({ users: { data: { role: "admin" } } }, seen), "admin", PRACTICE), true);
  assertEquals(seen, ["users"]);
  await assertRejects(
    () => userHasPracticeAccess(fakeClient({ users: { data: null, error: { message: "boom" } } }), "u", PRACTICE),
    Error,
    "Failed to load user role",
  );
});

Deno.test("product id resolves by slug with the seeded fallback", async () => {
  assertEquals(await resolvePracticeProductId(fakeClient({ products: { data: { id: "from-db" } } })), "from-db");
  assertEquals(await resolvePracticeProductId(fakeClient({ products: { data: null } })), IELTS_PRACTICE_PRODUCT_ID_FALLBACK);
});
