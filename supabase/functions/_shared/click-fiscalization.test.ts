import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildFiscalItem,
  extractProductTaxInfo,
  submitFiscalItems,
  validateFiscalConfig,
} from "./click-fiscalization.ts";

Deno.test("CLICK fiscal configuration requires one valid merchant tax identifier", () => {
  assertEquals(validateFiscalConfig({ tin: "123456789" }), { ok: true });
  assertEquals(validateFiscalConfig({ pinfl: "12345678901234" }), { ok: true });
  assertEquals(validateFiscalConfig({}), {
    ok: false,
    error: "Exactly one of TIN or PINFL is required",
  });
  assertEquals(
    validateFiscalConfig({ tin: "123456789", pinfl: "12345678901234" }),
    {
      ok: false,
      error: "Exactly one of TIN or PINFL is required",
    },
  );
});

Deno.test("CLICK fiscal product metadata fails closed when required official fields are invalid", () => {
  assertEquals(
    extractProductTaxInfo({
      tax: {
        name: "Online lesson (1 unit)",
        spic: "12345678901234567",
        package_code: "12345678901234567890",
        vat_percent: 12,
      },
    }, "fallback"),
    {
      name: "Online lesson (1 unit)",
      spic: "12345678901234567",
      packageCode: "12345678901234567890",
      vatPercent: 12,
    },
  );
  assertEquals(
    extractProductTaxInfo({
      tax: {
        spic: "123456789012345678",
        package_code: "1",
        vat_percent: 12,
      },
    }, "fallback"),
    null,
  );
});

Deno.test("CLICK fiscal item calculation uses tiyin and validates TIN", () => {
  assertEquals(
    buildFiscalItem(
      {
        name: "Online lesson (1 unit)",
        spic: "123",
        packageCode: "1",
        vatPercent: 12,
      },
      1120,
      { tin: "123456789" },
    ),
    {
      Name: "Online lesson (1 unit)",
      SPIC: "123",
      PackageCode: "1",
      Price: 112000,
      Amount: 1,
      VAT: 12000,
      VATPercent: 12,
      CommissionInfo: { TIN: "123456789" },
    },
  );
  assertThrows(
    () =>
      buildFiscalItem(
        {
          name: "Online lesson",
          spic: "123",
          packageCode: "1",
          vatPercent: 12,
        },
        1000,
        {},
      ),
    Error,
    "Exactly one of TIN or PINFL is required",
  );
});

Deno.test("CLICK fiscal submission rejects incomplete payloads before network access", async () => {
  const result = await submitFiscalItems({
    authHeader: "not-used",
    serviceId: "104316",
    clickTransId: "123",
    items: [],
  });
  assertEquals(result.ok, false);
  assertEquals(
    (result.raw as any).error_note,
    "At least one fiscal item is required",
  );
});
