import type { AccessEffectiveResponse, MeResponse } from './api';
import { IELTS_PLAYBOOK_PRODUCT_ID, IELTS_PLAYBOOK_PRODUCT_SLUG } from './constants';
import { buildPlatformUrl } from './platformUrls';

export const paywallDisabled = (): boolean =>
  String(import.meta.env.VITE_DISABLE_PAYWALL ?? '').toLowerCase() === 'true';

/** Same rule the route guard uses: a direct entitlement or an effective (bundle) grant. */
export const hasPlaybookPremium = (
  me: MeResponse | null | undefined,
  effective: AccessEffectiveResponse | null | undefined,
): boolean => {
  if (paywallDisabled()) return true;
  if (!me) return false;
  const direct = me.entitlements.some(
    (entry) => entry.resource_type === 'product' && entry.resource_id === IELTS_PLAYBOOK_PRODUCT_ID,
  );
  const viaEffective =
    Array.isArray(effective?.effective_product_ids) && effective.effective_product_ids.includes(IELTS_PLAYBOOK_PRODUCT_ID);
  return direct || viaEffective;
};

const here = () => (typeof window !== 'undefined' ? window.location.href : '/');

export const pricingUrl = (returnTo: string = here()): string =>
  buildPlatformUrl('/pricing', returnTo, { product: IELTS_PLAYBOOK_PRODUCT_SLUG });

export const signInUrl = (returnTo: string = here()): string =>
  buildPlatformUrl('/auth', returnTo, { product: IELTS_PLAYBOOK_PRODUCT_SLUG });

const rawPlatform = String(import.meta.env.VITE_PLATFORM_URL ?? '').trim().replace(/\/$/, '');
export const SCHOOD_HOME_URL = rawPlatform || 'https://schood.online';
export const ACCOUNT_URL = `${SCHOOD_HOME_URL}/account`;
