type EnglishProductMap = Record<string, { productId?: string | null }>;

/** "All of English": one product that unlocks every skill (seeded by 20261025160000). */
export const ENGLISH_BUNDLE_PRODUCT_ID = "3a7bd983-58c5-4c75-b5f8-5ac46c94a0fa";

/** A learning seat from an employer (Schood Company English, seeded by 20261031100000): not sold, unlocks every skill. */
export const ENGLISH_COMPANY_SEAT_PRODUCT_ID = "c0a1e5d2-7b3f-4a86-9c14-5e2f8d6b1a07";

/** Products that stand for every English skill. Entitlement queries must ask for these too. */
export const ENGLISH_ALL_SKILLS_PRODUCT_IDS = [ENGLISH_BUNDLE_PRODUCT_ID, ENGLISH_COMPANY_SEAT_PRODUCT_ID];

/** Product ids the learner effectively holds: the bundle or a company seat stands for every skill product. */
export const expandBundleEntitlements = (
  entitledIds: string[],
  skillProductIds: string[],
): string[] =>
  entitledIds.some((id) => ENGLISH_ALL_SKILLS_PRODUCT_IDS.includes(id))
    ? [...new Set([...entitledIds, ...skillProductIds])]
    : entitledIds;

type AccessWindow = {
  is_active?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type EnglishSuiteAccess = {
  allowed: boolean;
  admin: boolean;
  tenantId: string | null;
  entitlementProductIds: string[];
};

export type EnglishAiQuota = {
  allowed: boolean;
  remaining: number;
  total: number;
};

const errorMessage = (error: unknown): string => {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error ?? "unknown error");
};

export const parseEnglishAiDailyLimit = (
  raw: string | null | undefined,
  fallback = 30,
): number => {
  const fallbackLimit = Number.isFinite(fallback)
    ? Math.min(500, Math.max(1, Math.floor(fallback)))
    : 30;
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? Math.min(500, Math.max(1, Math.floor(parsed)))
    : fallbackLimit;
};

export const isActiveAccessWindow = (
  row: AccessWindow,
  nowMs = Date.now(),
): boolean => {
  if (row.is_active === false) return false;
  const startsAt = row.starts_at ? Date.parse(row.starts_at) : null;
  const endsAt = row.ends_at ? Date.parse(row.ends_at) : null;
  if (startsAt != null && (!Number.isFinite(startsAt) || startsAt > nowMs)) {
    return false;
  }
  if (endsAt != null && (!Number.isFinite(endsAt) || endsAt <= nowMs)) {
    return false;
  }
  return true;
};

export const requireEnglishSuiteAccess = async (
  sb: any,
  userId: string,
  products: EnglishProductMap,
): Promise<EnglishSuiteAccess> => {
  const { data: userRow, error: userError } = await sb.from("users").select(
    "role",
  ).eq("id", userId).maybeSingle();
  if (userError) {
    throw new Error(
      `Failed to resolve English access role: ${errorMessage(userError)}`,
    );
  }

  const admin = String(userRow?.role ?? "").trim().toLowerCase().startsWith(
    "admin",
  );
  if (admin) {
    return {
      allowed: true,
      admin: true,
      tenantId: null,
      entitlementProductIds: [],
    };
  }

  const { data: memberships, error: membershipError } = await sb
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  if (membershipError) {
    throw new Error(
      `Failed to resolve English access membership: ${
        errorMessage(membershipError)
      }`,
    );
  }

  const tenantId = String(memberships?.[0]?.tenant_id ?? "") || null;
  if (!tenantId) {
    return {
      allowed: false,
      admin: false,
      tenantId: null,
      entitlementProductIds: [],
    };
  }

  const productIds = [
    ...new Set(
      Object.values(products).map((product) => String(product?.productId ?? ""))
        .filter(Boolean),
    ),
  ];
  if (productIds.length === 0) {
    return {
      allowed: false,
      admin: false,
      tenantId,
      entitlementProductIds: [],
    };
  }

  const { data: rows, error: entitlementError } = await sb
    .from("entitlements")
    .select("resource_id,is_active,starts_at,ends_at")
    .eq("tenant_id", tenantId)
    .eq("resource_type", "product")
    .eq("is_active", true)
    .in("resource_id", [...productIds, ...ENGLISH_ALL_SKILLS_PRODUCT_IDS]);
  if (entitlementError) {
    throw new Error(
      `Failed to resolve English entitlements: ${
        errorMessage(entitlementError)
      }`,
    );
  }

  const entitlementProductIds = expandBundleEntitlements(
    (rows ?? [])
      .filter((row: AccessWindow) => isActiveAccessWindow(row))
      .map((row: { resource_id?: unknown }) => String(row.resource_id ?? ""))
      .filter(Boolean),
    productIds,
  );

  return {
    allowed: entitlementProductIds.length > 0,
    admin: false,
    tenantId,
    entitlementProductIds,
  };
};

export const consumeEnglishAiDailyQuota = async (
  sb: any,
  userId: string,
  limit: number,
): Promise<EnglishAiQuota> => {
  const total = parseEnglishAiDailyLimit(String(limit));
  const { data, error } = await sb.rpc("consume_english_ai_daily_quota", {
    p_user_id: userId,
    p_limit: total,
    p_amount: 1,
  });
  if (error) {
    throw new Error(
      `Failed to consume English AI quota: ${errorMessage(error)}`,
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(row?.allowed),
    remaining: Math.max(0, Number(row?.remaining ?? 0)),
    total: Math.max(1, Number(row?.total ?? total)),
  };
};
