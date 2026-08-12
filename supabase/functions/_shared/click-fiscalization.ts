// ---------------------------------------------------------------------------
// Click.uz fiscalization (OFD) helper
// ---------------------------------------------------------------------------
//
// CLICK exposes Merchant API endpoints for submitting fiscal receipt data. See:
//   https://docs.click.uz/merchant-api/fiscalization
//
// Lifecycle (per Click docs):
//   1. submit_items  — after the payment is confirmed (action=1 success),
//                      before the receipt is generated.
//   2. submit_qrcode — after fiscalization completes (optional QR receipt).
//   3. ofd_data GET  — to retrieve the receipt link.
//
// This module is intentionally NOT wired into the live grant path yet. It is
// inert until BOTH are true:
//   - CLICK_FISCALIZATION_ENABLED=1 is set as an edge-function secret, and
//   - each sellable plan/product carries the tax fields below in metadata.
//
// REQUIRED TAX DATA (from the accountant) before this can go live:
//   - SPIC / ИКПУ            per product (string, ≤17 chars)
//   - PackageCode / Код упаковки per product (string, ≤20 chars)
//   - VATPercent             VAT rate as integer percent (e.g. 12 or 0)
//   - TIN (9 digits) OR PINFL (14 digits)  — the merchant's tax identifier
//   - Name with unit-of-measure suffix, e.g. "IELTS Practice (1 шт.)"
//
// Amounts in the Click OFD API are expressed in **tiyin** (1 UZS = 100 tiyin).
// ---------------------------------------------------------------------------

const CLICK_MERCHANT_API_BASE = "https://api.click.uz/v2/merchant";

export type ClickFiscalItem = {
  /** Product/service name; Click expects a unit-of-measure suffix. */
  Name: string;
  /** ИКПУ / SPIC code. */
  SPIC: string;
  /** Package code. */
  PackageCode: string;
  /** Total line amount in **tiyin**. */
  Price: number;
  /** Quantity. */
  Amount: number;
  /** VAT sum in **tiyin**. */
  VAT: number;
  /** VAT percentage as integer. */
  VATPercent: number;
  /** Either TIN (9) or PINFL (14) must be present. */
  CommissionInfo: { TIN?: string; PINFL?: string };
};

export type ClickFiscalConfig = {
  /** TIN (9 digits) — mutually exclusive with PINFL. */
  tin?: string | null;
  /** PINFL (14 digits) — mutually exclusive with TIN. */
  pinfl?: string | null;
};

/** Per-product tax attributes pulled from plan/product metadata. */
export type ProductTaxInfo = {
  name: string;
  spic: string;
  packageCode: string;
  vatPercent: number;
};

const TIYIN = 100;
const TIN_PATTERN = /^\d{9}$/;
const PINFL_PATTERN = /^\d{14}$/;

export const validateFiscalConfig = (
  config: ClickFiscalConfig,
): { ok: true } | { ok: false; error: string } => {
  const tin = String(config.tin ?? "").trim();
  const pinfl = String(config.pinfl ?? "").trim();
  if (Boolean(tin) === Boolean(pinfl)) {
    return { ok: false, error: "Exactly one of TIN or PINFL is required" };
  }
  if (tin && !TIN_PATTERN.test(tin)) {
    return { ok: false, error: "TIN must contain exactly 9 digits" };
  }
  if (pinfl && !PINFL_PATTERN.test(pinfl)) {
    return { ok: false, error: "PINFL must contain exactly 14 digits" };
  }
  return { ok: true };
};

export const validateProductTaxInfo = (
  product: ProductTaxInfo,
): { ok: true } | { ok: false; error: string } => {
  if (!product.name || product.name.length > 63) {
    return { ok: false, error: "Fiscal item name must be 1-63 characters" };
  }
  if (!product.spic || product.spic.length > 17) {
    return { ok: false, error: "SPIC must be 1-17 characters" };
  }
  if (!product.packageCode || product.packageCode.length > 20) {
    return { ok: false, error: "PackageCode must be 1-20 characters" };
  }
  if (
    !Number.isInteger(product.vatPercent) || product.vatPercent < 0 ||
    product.vatPercent > 100
  ) {
    return { ok: false, error: "VATPercent must be an integer from 0 to 100" };
  }
  return { ok: true };
};

/** Reads merchant-level fiscal config from edge-function secrets. */
export const readFiscalConfigFromEnv = (): ClickFiscalConfig => ({
  tin: Deno.env.get("CLICK_FISCAL_TIN") ?? null,
  pinfl: Deno.env.get("CLICK_FISCAL_PINFL") ?? null,
});

export const isFiscalizationEnabled = (): boolean =>
  (Deno.env.get("CLICK_FISCALIZATION_ENABLED") ?? "") === "1";

/**
 * Extracts per-product tax attributes from a metadata bag. Returns null when
 * any required field is missing so callers can skip fiscalization rather than
 * submit an invalid receipt.
 */
export const extractProductTaxInfo = (
  meta: Record<string, unknown> | null | undefined,
  fallbackName: string,
): ProductTaxInfo | null => {
  const tax = (meta && typeof meta === "object" ? (meta as any).tax : null) ??
    null;
  const spic = String(tax?.spic ?? tax?.ikpu ?? "").trim();
  const packageCode = String(tax?.package_code ?? tax?.packageCode ?? "")
    .trim();
  const vatRaw = tax?.vat_percent ?? tax?.vatPercent;
  const vatPercent = Number.isFinite(Number(vatRaw))
    ? Math.floor(Number(vatRaw))
    : NaN;
  const name = String(tax?.name ?? fallbackName ?? "").trim();

  const product = { name, spic, packageCode, vatPercent };
  return validateProductTaxInfo(product).ok ? product : null;
};

/**
 * Builds a single-line fiscal item from a UZS gross amount. VAT is computed as
 * the tax-inclusive portion: VAT = gross * rate / (100 + rate).
 */
export const buildFiscalItem = (
  product: ProductTaxInfo,
  grossAmountUzs: number,
  config: ClickFiscalConfig,
): ClickFiscalItem => {
  const productValidation = validateProductTaxInfo(product);
  if (!productValidation.ok) throw new Error(productValidation.error);
  const configValidation = validateFiscalConfig(config);
  if (!configValidation.ok) throw new Error(configValidation.error);
  if (!Number.isFinite(grossAmountUzs) || grossAmountUzs <= 0) {
    throw new Error("Fiscal gross amount must be positive");
  }
  const priceTiyin = Math.round(grossAmountUzs * TIYIN);
  const vatTiyin = product.vatPercent > 0
    ? Math.round((priceTiyin * product.vatPercent) / (100 + product.vatPercent))
    : 0;

  const commissionInfo: { TIN?: string; PINFL?: string } = {};
  const tin = String(config.tin ?? "").trim();
  const pinfl = String(config.pinfl ?? "").trim();
  if (tin) commissionInfo.TIN = tin;
  else if (pinfl) commissionInfo.PINFL = pinfl;

  return {
    Name: product.name,
    SPIC: product.spic,
    PackageCode: product.packageCode,
    Price: priceTiyin,
    Amount: 1,
    VAT: vatTiyin,
    VATPercent: product.vatPercent,
    CommissionInfo: commissionInfo,
  };
};

/**
 * Submits fiscal items for a completed payment. `authHeader` must be the same
 * `merchant_user_id:SHA1(timestamp+secret):timestamp` header used elsewhere for
 * the Merchant API. `clickTransId` is Click's transaction id (payment_id).
 */
export const submitFiscalItems = async (input: {
  authHeader: string;
  serviceId: string;
  clickTransId: string;
  items: ClickFiscalItem[];
  receivedCard?: number;
}): Promise<{ ok: boolean; raw: unknown }> => {
  if (!input.items.length) {
    return {
      ok: false,
      raw: {
        error_code: -1,
        error_note: "At least one fiscal item is required",
      },
    };
  }
  if (
    !Number.isSafeInteger(Number(input.serviceId)) ||
    Number(input.serviceId) <= 0
  ) {
    return {
      ok: false,
      raw: { error_code: -1, error_note: "Invalid service_id" },
    };
  }
  if (
    !Number.isSafeInteger(Number(input.clickTransId)) ||
    Number(input.clickTransId) <= 0
  ) {
    return {
      ok: false,
      raw: { error_code: -1, error_note: "Invalid payment_id" },
    };
  }
  if (
    input.items.some((item) => {
      const config = item.CommissionInfo.TIN
        ? { tin: item.CommissionInfo.TIN }
        : { pinfl: item.CommissionInfo.PINFL };
      return !validateProductTaxInfo({
        name: item.Name,
        spic: item.SPIC,
        packageCode: item.PackageCode,
        vatPercent: item.VATPercent,
      }).ok || !validateFiscalConfig(config).ok ||
        !Number.isSafeInteger(item.Price) || item.Price <= 0 ||
        !Number.isSafeInteger(item.Amount) || item.Amount <= 0 ||
        !Number.isSafeInteger(item.VAT) || item.VAT < 0;
    })
  ) {
    return {
      ok: false,
      raw: { error_code: -1, error_note: "Invalid fiscal item" },
    };
  }
  const body = {
    service_id: Number(input.serviceId),
    payment_id: Number(input.clickTransId),
    items: input.items,
    received_ecash: 0,
    received_cash: 0,
    received_card: input.receivedCard ??
      input.items.reduce((sum, it) => sum + it.Price, 0),
  };

  const res = await fetch(
    `${CLICK_MERCHANT_API_BASE}/payment/ofd_data/submit_items`,
    {
      method: "POST",
      headers: { Auth: input.authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    raw = { detail: await res.text() };
  }

  const errorCode = Number((raw as any)?.error_code ?? -1);
  return { ok: res.ok && errorCode === 0, raw };
};
