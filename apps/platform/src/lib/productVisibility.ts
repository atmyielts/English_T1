type ProductLike = {
  name?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

const ARCHIVED_PRODUCT_SLUGS = new Set<string>();

const slugify = (value: string | null): string =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  return null;
};

export const productSlug = (product: ProductLike): string => {
  const meta = asRecord(product.metadata);
  const metaSlug = typeof meta.slug === 'string' ? meta.slug : null;
  return slugify(metaSlug ?? product.name ?? null);
};

export const isArchivedProductSlug = (slug: string | null): boolean => {
  const normalized = slugify(slug);
  return normalized.length > 0 && ARCHIVED_PRODUCT_SLUGS.has(normalized);
};

export const isArchivedProduct = (product: ProductLike): boolean => {
  const status = (product.status ?? '').trim().toLowerCase();
  if (status === 'archived') return true;

  const meta = asRecord(product.metadata);
  if (asBoolean(meta.archived) === true) return true;
  if (asBoolean(meta.hidden) === true) return true;
  if (asBoolean(meta.visible) === false) return true;

  return isArchivedProductSlug(productSlug(product));
};

/** Each product someone holds, with its entitlement: from all products, because holding one is not browsing for one. */
export const heldProducts = <E extends { resource_type: string; resource_id?: string | null }, P extends { id: string }>(entitlements: E[], products: P[]): { entitlement: E; product: P }[] => {
  const byId = new Map(products.map((product) => [product.id, product]));
  return entitlements.flatMap((entitlement) => {
    const product = entitlement.resource_type === 'product' && entitlement.resource_id ? byId.get(entitlement.resource_id) : undefined;
    return product ? [{ entitlement, product }] : [];
  });
};

/** Schood English access provided by an employer through Company English: never sold, shown only to whoever holds it. */
export const isCompanySeat = (product: ProductLike): boolean => asRecord(product.metadata).kind === 'company_seat';

export const filterVisibleProducts = <T extends ProductLike>(products: T[]): T[] =>
  products.filter((product) => !isArchivedProduct(product));
