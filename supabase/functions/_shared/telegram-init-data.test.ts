import { signTelegramInitDataForTest, validateTelegramInitData } from "./telegram-init-data.ts";

const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const token = "123456:TEST_TOKEN";
const now = 1786489200;

Deno.test("valid Telegram initData returns the signed identity", async () => {
  const initData = await signTelegramInitDataForTest({ auth_date: String(now), query_id: "q1", user: JSON.stringify({ id: 12345, first_name: "Jafar" }) }, token);
  const identity = await validateTelegramInitData(initData, token, { nowSeconds: now });
  assert(identity.telegram_user_id === "12345", "signed Telegram user should be returned");
});

Deno.test("forged and expired Telegram initData are rejected", async () => {
  const valid = await signTelegramInitDataForTest({ auth_date: String(now), user: JSON.stringify({ id: 12345 }) }, token);
  let forged = false;
  try { await validateTelegramInitData(valid.replace("12345", "99999"), token, { nowSeconds: now }); } catch { forged = true; }
  assert(forged, "forged identity must fail signature validation");
  const expiredData = await signTelegramInitDataForTest({ auth_date: String(now - 4000), user: JSON.stringify({ id: 12345 }) }, token);
  let expired = false;
  try { await validateTelegramInitData(expiredData, token, { nowSeconds: now }); } catch { expired = true; }
  assert(expired, "expired initData must fail");
});
