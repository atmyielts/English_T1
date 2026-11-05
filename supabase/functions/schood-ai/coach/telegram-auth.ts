// Telegram Mini App data, checked without the bot token: Telegram signs initData
// with Ed25519 for third parties ("Validating data for Third-Party Use",
// core.telegram.org/bots/webapps). The data-check string is
//   `<bot_id>:WebAppData\n` + every received field except `hash` and `signature`,
//   sorted by key, as key=value lines;
// `signature` is base64url. The worker checks the bot-token HMAC first (it holds
// the tokens); this second, independent check here means a leaked service secret
// alone cannot sign anyone in: it would also need data Telegram signed for that
// person and that bot.

export interface MiniAppIdentity { telegramUserId: string; firstName: string | null; authDate: number; startParam: string | null }

const hexBytes = (hex: string): Uint8Array<ArrayBuffer> => new Uint8Array((hex.match(/.{2}/g) ?? []).map((pair) => parseInt(pair, 16)));
function base64url(text: string): Uint8Array<ArrayBuffer> {
  const normal = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normal + '='.repeat((4 - (normal.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function dataCheckString(initData: string, botId: string): string {
  const params = new URLSearchParams(initData);
  const pairs: string[] = [];
  params.forEach((value, key) => { if (key !== 'hash' && key !== 'signature') pairs.push(`${key}=${value}`); });
  pairs.sort();
  return `${botId}:WebAppData\n${pairs.join('\n')}`;
}

/** Throws Error('telegram_signature' | 'telegram_expired' | 'telegram_user') unless Telegram signed this data for that bot recently. */
export async function verifyMiniAppData(initData: string, botId: string, options: { publicKeyHex: string; nowSeconds: number; maxAgeSeconds?: number }): Promise<MiniAppIdentity> {
  const params = new URLSearchParams(initData);
  const signature = params.get('signature') ?? '';
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(signature) || !/^\d{5,20}$/.test(botId) || !/^[0-9a-f]{64}$/i.test(options.publicKeyHex)) throw new Error('telegram_signature');
  let valid = false;
  try {
    const key = await crypto.subtle.importKey('raw', hexBytes(options.publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
    valid = await crypto.subtle.verify('Ed25519', key, base64url(signature), new TextEncoder().encode(dataCheckString(initData, botId)));
  } catch {
    valid = false;
  }
  if (!valid) throw new Error('telegram_signature');
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!Number.isFinite(authDate) || authDate <= 0 || options.nowSeconds - authDate > (options.maxAgeSeconds ?? 86_400) || authDate > options.nowSeconds + 300) throw new Error('telegram_expired');
  let user: Record<string, unknown>;
  try { user = JSON.parse(params.get('user') ?? ''); } catch { throw new Error('telegram_user'); }
  const id = String(user?.id ?? '');
  if (!/^\d{1,20}$/.test(id)) throw new Error('telegram_user');
  const start = params.get('start_param');
  return {
    telegramUserId: id,
    firstName: typeof user.first_name === 'string' ? user.first_name.slice(0, 120) : null,
    authDate,
    startParam: start && /^[A-Za-z0-9_-]{1,64}$/.test(start) ? start : null,
  };
}

/** For tests: signs init data the way Telegram does, with a test key pair. */
export async function signMiniAppDataForTest(values: Record<string, string>, botId: string, privateKey: CryptoKey): Promise<string> {
  const unsigned = new URLSearchParams(values).toString();
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(dataCheckString(unsigned, botId))));
  const encoded = btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return new URLSearchParams({ ...values, signature: encoded, hash: 'f'.repeat(64) }).toString();
}
