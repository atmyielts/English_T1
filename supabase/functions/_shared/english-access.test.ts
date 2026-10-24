import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  consumeEnglishAiDailyQuota,
  ENGLISH_BUNDLE_PRODUCT_ID,
  expandBundleEntitlements,
  isActiveAccessWindow,
  parseEnglishAiDailyLimit,
  requireEnglishSuiteAccess,
} from "./english-access.ts";

Deno.test("English AI daily limit is bounded and defaults safely", () => {
  assertEquals(parseEnglishAiDailyLimit(undefined), 30);
  assertEquals(parseEnglishAiDailyLimit("not-a-number"), 30);
  assertEquals(parseEnglishAiDailyLimit("0"), 1);
  assertEquals(parseEnglishAiDailyLimit("45.9"), 45);
  assertEquals(parseEnglishAiDailyLimit("9999"), 500);
});

Deno.test("English entitlement windows fail closed outside their active range", () => {
  const now = Date.parse("2026-08-15T12:00:00.000Z");
  assertEquals(
    isActiveAccessWindow({
      is_active: true,
      starts_at: "2026-08-14T00:00:00Z",
      ends_at: "2026-08-16T00:00:00Z",
    }, now),
    true,
  );
  assertEquals(isActiveAccessWindow({ is_active: false }, now), false);
  assertEquals(
    isActiveAccessWindow({ starts_at: "2026-08-16T00:00:00Z" }, now),
    false,
  );
  assertEquals(
    isActiveAccessWindow({ ends_at: "2026-08-15T12:00:00Z" }, now),
    false,
  );
  assertEquals(isActiveAccessWindow({ starts_at: "invalid" }, now), false);
});

const accessClient = (
  options: { role?: string; entitlementEndsAt?: string | null; resourceId?: string },
) => ({
  from: (table: string) => {
    if (table === "users") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { role: options.role ?? "user" },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "tenant_memberships") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: async () => ({
                  data: [{ tenant_id: "tenant-1" }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }
    if (table === "entitlements") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                in: async () => ({
                  data: [{
                    resource_id: options.resourceId ?? "product-1",
                    is_active: true,
                    starts_at: "2026-01-01T00:00:00Z",
                    ends_at: options.entitlementEndsAt ??
                      "2099-01-01T00:00:00Z",
                  }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      };
    }
    throw new Error(`Unexpected table ${table}`);
  },
});

Deno.test("English suite access accepts a current product entitlement and rejects an expired one", async () => {
  const products = { reading: { productId: "product-1" } };
  const active = await requireEnglishSuiteAccess(
    accessClient({}),
    "user-1",
    products,
  );
  const expired = await requireEnglishSuiteAccess(
    accessClient({ entitlementEndsAt: "2026-01-02T00:00:00Z" }),
    "user-1",
    products,
  );

  assertEquals(active.allowed, true);
  assertEquals(active.entitlementProductIds, ["product-1"]);
  assertEquals(expired.allowed, false);
});

Deno.test("The All of English bundle unlocks every skill product", async () => {
  const products = { reading: { productId: "product-1" }, speaking: { productId: "product-2" } };
  const access = await requireEnglishSuiteAccess(
    accessClient({ resourceId: ENGLISH_BUNDLE_PRODUCT_ID }),
    "user-1",
    products,
  );
  assertEquals(access.allowed, true);
  assertEquals(access.entitlementProductIds.sort(), [ENGLISH_BUNDLE_PRODUCT_ID, "product-1", "product-2"].sort());

  const expired = await requireEnglishSuiteAccess(
    accessClient({ resourceId: ENGLISH_BUNDLE_PRODUCT_ID, entitlementEndsAt: "2026-01-02T00:00:00Z" }),
    "user-1",
    products,
  );
  assertEquals(expired.allowed, false);
  assertEquals(expandBundleEntitlements(["product-1"], ["product-1", "product-2"]), ["product-1"]);
});

Deno.test("English suite access permits platform admins without tenant lookup", async () => {
  const access = await requireEnglishSuiteAccess(
    accessClient({ role: "admin_ops" }),
    "admin-1",
    {},
  );
  assertEquals(access, {
    allowed: true,
    admin: true,
    tenantId: null,
    entitlementProductIds: [],
  });
});

Deno.test("English AI quota maps the atomic RPC response", async () => {
  const calls: unknown[] = [];
  const quota = await consumeEnglishAiDailyQuota(
    {
      rpc: async (name: string, payload: unknown) => {
        calls.push({ name, payload });
        return {
          data: [{ allowed: true, remaining: 11, total: 30 }],
          error: null,
        };
      },
    },
    "user-1",
    30,
  );

  assertEquals(quota, { allowed: true, remaining: 11, total: 30 });
  assertEquals(calls, [{
    name: "consume_english_ai_daily_quota",
    payload: { p_user_id: "user-1", p_limit: 30, p_amount: 1 },
  }]);
});
