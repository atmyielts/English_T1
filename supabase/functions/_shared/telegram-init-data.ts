export type TelegramIdentity = {
  telegram_user_id: string;
  first_name: string | null;
  username: string | null;
  auth_date: number;
};

const encoder = new TextEncoder();
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const hmac = async (key: string | Uint8Array, message: string) => {
  const bytes = typeof key === "string" ? encoder.encode(key) : key;
  const keyData = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
};
const equal = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
};
const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

export const validateTelegramInitData = async (
  initData: string,
  botToken: string,
  options: { maxAgeSeconds?: number; nowSeconds?: number; futureToleranceSeconds?: number } = {},
): Promise<TelegramIdentity> => {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash") ?? "";
  if (!receivedHash) throw new Error("Missing Telegram hash");
  const pairs: string[] = [];
  params.forEach((value, key) => { if (key !== "hash") pairs.push(`${key}=${value}`); });
  pairs.sort();
  const secret = new Uint8Array(await hmac("WebAppData", botToken));
  const expectedHash = hex(await hmac(secret, pairs.join("\n")));
  if (!equal(expectedHash, receivedHash)) throw new Error("Invalid Telegram signature");

  const authDate = Number(params.get("auth_date") ?? 0);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate <= 0) throw new Error("Missing Telegram auth date");
  if (now - authDate > (options.maxAgeSeconds ?? 3600) || authDate > now + (options.futureToleranceSeconds ?? 300)) {
    throw new Error("Telegram session expired");
  }
  let user: Record<string, unknown>;
  try { user = JSON.parse(params.get("user") ?? "") as Record<string, unknown>; } catch { throw new Error("Invalid Telegram user"); }
  const id = clean(user.id, 80);
  if (!/^\d{1,20}$/.test(id)) throw new Error("Invalid Telegram user id");
  return { telegram_user_id: id, first_name: clean(user.first_name, 120) || null, username: clean(user.username, 120) || null, auth_date: authDate };
};

export const signTelegramInitDataForTest = async (values: Record<string, string>, botToken: string) => {
  const dataCheckString = Object.entries(values).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secret = new Uint8Array(await hmac("WebAppData", botToken));
  const hash = hex(await hmac(secret, dataCheckString));
  return new URLSearchParams({ ...values, hash }).toString();
};
