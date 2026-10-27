// Exam "Complete" bundles (IELTS and SAT): one product that stands for every
// product of an exam family (seeded by migration 20261026100900_exam_plans_and_complete_bundles).
//
// Two layers make a bundle real:
//   1. Purchases: each bundle plan lists its member products in
//      metadata.included_product_ids, so payment fulfilment grants an
//      entitlement row for the bundle AND every member (grant time).
//   2. Every other grant of the bundle product (trial, admin, academy sponsor):
//      access checks expand the bundle id to its members (check time), the same
//      way _shared/english-access.ts expands the English All Skills bundle.
//
// Ids are deterministic: md5('schood-product:<slug>')::uuid.

export const IELTS_SIMULATOR_PRODUCT_ID = "ead05eae-aa97-4bda-a07c-51e5dbb062c0";
export const IELTS_PRACTICE_PRODUCT_ID = "a74195fd-b4f3-4fd4-93bf-c807e42250c6";
export const IELTS_PLAYBOOK_PRODUCT_ID = "9de6c9e7-31df-4d1d-9574-1f8f84a53b54";
export const SAT_SIMULATOR_PRODUCT_ID = "5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef";
export const SAT_PRACTICE_PRODUCT_ID = "2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010";
export const SAT_PLAYBOOK_PRODUCT_ID = "a8b41e2c-9a36-4caf-9bba-7212e35a8b8c";

/** md5('schood-product:ielts-complete')::uuid */
export const IELTS_COMPLETE_PRODUCT_ID = "50dab6d9-5345-ce1e-0e66-853450737e39";
/** md5('schood-product:sat-complete')::uuid */
export const SAT_COMPLETE_PRODUCT_ID = "056db74c-0bc5-32f7-9997-654e3f31611f";

export type ExamBundle = {
  productId: string;
  slug: string;
  members: readonly string[];
};

export const EXAM_BUNDLES: readonly ExamBundle[] = Object.freeze([
  {
    productId: IELTS_COMPLETE_PRODUCT_ID,
    slug: "ielts-complete",
    members: Object.freeze([IELTS_SIMULATOR_PRODUCT_ID, IELTS_PRACTICE_PRODUCT_ID, IELTS_PLAYBOOK_PRODUCT_ID]),
  },
  {
    productId: SAT_COMPLETE_PRODUCT_ID,
    slug: "sat-complete",
    members: Object.freeze([SAT_SIMULATOR_PRODUCT_ID, SAT_PRACTICE_PRODUCT_ID, SAT_PLAYBOOK_PRODUCT_ID]),
  },
]);

const bundleById = new Map(EXAM_BUNDLES.map((bundle) => [bundle.productId, bundle]));

export const isExamBundleProductId = (productId: string | null | undefined): boolean =>
  !!productId && bundleById.has(String(productId));

/** Member product ids of a bundle (empty for a non-bundle product). */
export const examBundleMembers = (productId: string | null | undefined): string[] =>
  productId ? [...(bundleById.get(String(productId))?.members ?? [])] : [];

/** Bundle product ids whose entitlement also grants `productId`. */
export const bundlesGranting = (productId: string | null | undefined): string[] =>
  productId
    ? EXAM_BUNDLES.filter((bundle) => bundle.members.includes(String(productId))).map((bundle) => bundle.productId)
    : [];

/** Product ids that grant access to `productId`: itself plus every bundle containing it. */
export const productIdsGrantingAccess = (productId: string): string[] => [productId, ...bundlesGranting(productId)];

/** Held product ids plus the members of every held exam bundle (stable order, no duplicates). */
export const expandExamBundleProductIds = (productIds: readonly string[]): string[] => {
  const out = new Set<string>();
  for (const id of productIds) {
    const key = String(id ?? "");
    if (!key) continue;
    out.add(key);
    for (const member of examBundleMembers(key)) out.add(member);
  }
  return [...out];
};

type EntitlementLike = {
  id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  value?: unknown;
};

const laterEnd = (a: string | null | undefined, b: string | null | undefined): string | null => {
  // null ends_at means "no expiry", which always wins.
  if (a == null || b == null) return null;
  const am = Date.parse(a);
  const bm = Date.parse(b);
  if (!Number.isFinite(am)) return b;
  if (!Number.isFinite(bm)) return a;
  return am >= bm ? a : b;
};

/**
 * Adds a derived product entitlement row for every member of a held exam bundle
 * the learner does not hold directly (for /me, which frontends gate on).
 * Derived rows carry `value.via_bundle_product_id` so display code can tell
 * them apart; the original rows are returned untouched.
 */
export const withExamBundleMemberEntitlements = <T extends EntitlementLike>(rows: readonly T[]): (T | EntitlementLike)[] => {
  const direct = new Set(
    rows.filter((row) => row.resource_type === "product" && row.resource_id).map((row) => String(row.resource_id)),
  );
  const derived = new Map<string, EntitlementLike>();
  for (const row of rows) {
    if (row.resource_type !== "product" || !isExamBundleProductId(row.resource_id)) continue;
    const bundleId = String(row.resource_id);
    for (const member of examBundleMembers(bundleId)) {
      if (direct.has(member)) continue;
      const existing = derived.get(member);
      if (existing) {
        existing.ends_at = laterEnd(existing.ends_at, row.ends_at ?? null);
        continue;
      }
      derived.set(member, {
        id: `${row.id ?? bundleId}:bundle:${member}`,
        resource_type: "product",
        resource_id: member,
        starts_at: row.starts_at ?? null,
        ends_at: row.ends_at ?? null,
        value: { via_bundle_product_id: bundleId },
      });
    }
  }
  return [...rows, ...derived.values()];
};
