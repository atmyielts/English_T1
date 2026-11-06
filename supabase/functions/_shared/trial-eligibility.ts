// Which products a free trial can never apply to, whatever the platform settings say.
import { isExamBundleProductId } from "./product-bundles.ts";

/** Hidden products (a company seat, retired services) are not on sale, so a trial of one cannot be on offer either. */
export const isHiddenProduct = (product: { metadata?: unknown } | null | undefined): boolean => {
  const metadata = product?.metadata;
  return !!metadata && typeof metadata === "object" && !Array.isArray(metadata) && (metadata as Record<string, unknown>).hidden === true;
};

export const withoutBundleTrial = <T extends { trial_enabled: boolean }>(config: T, productId: string): T =>
  isExamBundleProductId(productId) ? { ...config, trial_enabled: false } : config;

export const withoutHiddenProductTrial = <T extends { trial_enabled: boolean }>(config: T, product: { metadata?: unknown } | null | undefined): T =>
  isHiddenProduct(product) ? { ...config, trial_enabled: false } : config;
