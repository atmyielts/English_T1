import { expandExamBundleProductIds } from "../_shared/product-bundles.ts";

export type EntitlementRow = {
  resource_type: string;
  resource_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
};

export type SponsoredRow = {
  grant_type: string;
  resource_type: string | null;
  resource_id: string | null;
  starts_at: string;
  expires_at: string | null;
  status: string;
};

export const isWithinWindow = (startsAt: string | null, endsAt: string | null, now = Date.now()): boolean => {
  const s = startsAt ? Date.parse(startsAt) : NaN;
  const e = endsAt ? Date.parse(endsAt) : NaN;
  if (Number.isFinite(s) && now < s) return false;
  if (Number.isFinite(e) && now > e) return false;
  return true;
};

export type EffectiveAccess = {
  personal_product_ids: string[];
  sponsored_product_ids: string[];
  effective_product_ids: string[];
  /** Held exam bundle products (their members are already in effective_product_ids). */
  bundle_product_ids: string[];
  has_access: boolean | null;
};

/**
 * Personal and sponsored product grants inside their window, with exam
 * "Complete" bundles expanded to their member products.
 */
export const computeEffectiveAccess = (
  personalRows: readonly EntitlementRow[],
  sponsoredRows: readonly SponsoredRow[],
  productId: string | null,
  now = Date.now(),
): EffectiveAccess => {
  const personal = Array.from(new Set(
    personalRows
      .filter((r) => r.resource_type === "product" && r.resource_id && isWithinWindow(r.starts_at, r.ends_at, now))
      .map((r) => String(r.resource_id)),
  ));
  const sponsored = Array.from(new Set(
    sponsoredRows
      .filter((r) => r.grant_type === "product_access" && String(r.resource_type ?? "") === "product" && r.resource_id)
      .filter((r) => isWithinWindow(r.starts_at, r.expires_at, now))
      .map((r) => String(r.resource_id)),
  ));
  const direct = Array.from(new Set([...personal, ...sponsored]));
  const effective = expandExamBundleProductIds(direct);
  const bundles = direct.filter((id) => expandExamBundleProductIds([id]).length > 1);
  return {
    personal_product_ids: personal,
    sponsored_product_ids: sponsored,
    effective_product_ids: effective,
    bundle_product_ids: bundles,
    has_access: productId ? effective.includes(productId) : null,
  };
};
