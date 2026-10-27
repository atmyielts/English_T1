// IELTS Practice access: the same rule for every IELTS Practice function
// (ielts-practice, ielts-srs). A learner may use IELTS Practice when they are
// an admin, hold an active personal (tenant) entitlement or an active sponsored
// (academy) grant for the IELTS Practice product, or hold one of those for a
// bundle product whose `metadata.bundle_of` lists IELTS Practice (by slug or
// id), e.g. "IELTS Complete". This mirrors what access-effective reports to
// the frontend, so the app's paywall and the API agree.

import {
  hasActiveProductEntitlement,
  hasActiveSponsoredProductAccess,
  isObject,
} from "./ielts-practice-core.ts";

export const IELTS_PRACTICE_SLUG = "ielts-practice";
export const IELTS_PRACTICE_PRODUCT_ID_FALLBACK = "a74195fd-b4f3-4fd4-93bf-c807e42250c6";

/**
 * IELTS Complete (md5('schood-product:ielts-complete')::uuid), seeded by the
 * integration PR #311 (_shared/product-bundles.ts, productIdsGrantingAccess).
 * Listed here as well so an admin/sponsor grant of the bundle opens IELTS
 * Practice even if the products lookup fails; once #311 is merged this module
 * can import productIdsGrantingAccess instead.
 */
export const IELTS_COMPLETE_PRODUCT_ID = "50dab6d9-5345-ce1e-0e66-853450737e39";

/** The IELTS Practice product id (by slug, with the seeded id as fallback). */
export const resolvePracticeProductId = async (sb: any): Promise<string> => {
  const { data, error } = await sb.from("products").select("id").eq("metadata->>slug", IELTS_PRACTICE_SLUG).maybeSingle();
  return !error && data?.id ? String(data.id) : IELTS_PRACTICE_PRODUCT_ID_FALLBACK;
};

/** Product ids of active bundles that include IELTS Practice. */
export const bundleIdsIncluding = (
  products: unknown,
  practiceProductId: string,
  practiceSlug = IELTS_PRACTICE_SLUG,
): string[] =>
  (Array.isArray(products) ? products : [])
    .filter((row) => isObject(row) && String(row.status ?? "active") === "active")
    .filter((row) => {
      const metadata = isObject((row as Record<string, unknown>).metadata)
        ? (row as Record<string, unknown>).metadata as Record<string, unknown>
        : {};
      const members = [
        ...(Array.isArray(metadata.bundle_of) ? metadata.bundle_of : []),
        ...(Array.isArray(metadata.bundle_product_ids) ? metadata.bundle_product_ids : []),
      ].map((entry) => String(entry));
      return members.includes(practiceSlug) || members.includes(practiceProductId);
    })
    .map((row) => String((row as Record<string, unknown>).id ?? ""))
    .filter(Boolean);

export type PracticeAccessInput = {
  role: string | null;
  practiceProductId: string;
  bundleProductIds: string[];
  /** entitlements rows for the learner's tenant (any of the candidate products) */
  entitlements: unknown;
  /** academy_entitlements rows for the learner */
  sponsored: unknown;
  nowMs?: number;
};

/** Pure decision used by the loader below and by tests. */
export const decidePracticeAccess = (input: PracticeAccessInput): boolean => {
  if (String(input.role ?? "").trim().toLowerCase() === "admin") return true;
  const candidates = [input.practiceProductId, ...input.bundleProductIds];
  return candidates.some((productId) =>
    hasActiveProductEntitlement(
      (Array.isArray(input.entitlements) ? input.entitlements : [])
        .filter((row) => isObject(row) && String(row.resource_id ?? "") === productId)
        .map((row) => ({ ...(row as Record<string, unknown>), resource_type: "product" })),
      productId,
      input.nowMs,
    )
    || hasActiveSponsoredProductAccess(input.sponsored, productId, input.nowMs)
  );
};

/** Loads the rows the decision needs with a service-role client. */
export const userHasPracticeAccess = async (
  sb: any,
  userId: string,
  practiceProductId: string,
): Promise<boolean> => {
  const { data: userRow, error: userError } = await sb.from("users").select("role").eq("id", userId).maybeSingle();
  if (userError) throw new Error("Failed to load user role");
  const role = String((userRow as Record<string, unknown> | null)?.role ?? "");
  if (role.trim().toLowerCase() === "admin") return true;

  const { data: bundleRows, error: bundleError } = await sb
    .from("products")
    .select("id,status,metadata")
    .not("metadata->bundle_of", "is", null)
    .limit(200);
  // A bundle lookup failure must not lock out direct subscribers.
  const bundleProductIds = [...new Set([
    ...(practiceProductId === IELTS_PRACTICE_PRODUCT_ID_FALLBACK ? [IELTS_COMPLETE_PRODUCT_ID] : []),
    ...(bundleError ? [] : bundleIdsIncluding(bundleRows, practiceProductId)),
  ])];
  const candidateIds = [practiceProductId, ...bundleProductIds];

  const { data: memberships, error: membershipError } = await sb
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  if (membershipError) throw new Error("Failed to load tenant memberships");
  const tenantId = Array.isArray(memberships) && memberships[0]
    ? String((memberships[0] as Record<string, unknown>).tenant_id ?? "") || null
    : null;

  let entitlements: unknown[] = [];
  if (tenantId) {
    const { data, error } = await sb
      .from("entitlements")
      .select("id,resource_id,starts_at,ends_at,is_active")
      .eq("tenant_id", tenantId)
      .eq("resource_type", "product")
      .eq("is_active", true)
      .in("resource_id", candidateIds)
      .limit(50);
    if (error) throw new Error("Failed to load product entitlements");
    entitlements = Array.isArray(data) ? data : [];
  }

  const { data: sponsored, error: sponsoredError } = await sb
    .from("academy_entitlements")
    .select("id,grant_type,resource_type,resource_id,starts_at,expires_at,status")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("grant_type", "product_access")
    .eq("resource_type", "product")
    .in("resource_id", candidateIds)
    .limit(50);
  if (sponsoredError) throw new Error("Failed to load sponsored product access");

  return decidePracticeAccess({ role, practiceProductId, bundleProductIds, entitlements, sponsored });
};

/** The 403 body both functions return, so the frontend can route to pricing. */
export const practiceAccessRequired = (practiceProductId: string) => ({
  error: "IELTS Practice access is required",
  code: "product_access_required",
  product_id: practiceProductId,
  product_slug: IELTS_PRACTICE_SLUG,
});
