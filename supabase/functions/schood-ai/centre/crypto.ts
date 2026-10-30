// Secrets a centre gives Schood AI (its Telegram bot token, a bring-your-own model
// key), sealed with AES-256-GCM before they are stored. The repo has no Supabase
// Vault or pgsodium, so this follows its existing pattern for stored secrets
// (assessment-cloud/webhook-secrets.ts): `v1:<key id>:<iv>:<ciphertext>` under
// rotating 32-byte keys held only as Edge Function secrets:
//   SCHOOD_AI_CENTRE_KEYS        `<id>:<base64 32 bytes>,<id>:<base64 32 bytes>`
//   SCHOOD_AI_CENTRE_KEY_ACTIVE  the id new secrets are sealed with
// The additional data binds each ciphertext to its key id, workspace, purpose and
// label, so a sealed value copied to another centre or purpose cannot be opened.
// Plain values never reach the database, logs or the browser; the browser only
// ever sees a four-character hint.

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const encoder = new TextEncoder();

export class SecretBox {
  private constructor(private active: string, private keys: Map<string, CryptoKey>) {}

  /** `material` maps key ids to base64 32-byte keys. */
  static async create(active: string, material: Record<string, string>): Promise<SecretBox> {
    const keys = new Map<string, CryptoKey>();
    for (const [id, value] of Object.entries(material)) {
      if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new Error('Centre secret key ids must be short lowercase identifiers.');
      const raw = unb64(value.trim());
      if (raw.length !== 32) throw new Error('Centre secret keys must be 32 bytes.');
      keys.set(id, await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
    }
    if (!keys.has(active)) throw new Error('The active centre secret key is not configured.');
    return new SecretBox(active, keys);
  }

  /** From SCHOOD_AI_CENTRE_KEYS and SCHOOD_AI_CENTRE_KEY_ACTIVE; null when they are not set. */
  static async fromEnv(read: (name: string) => string | undefined): Promise<SecretBox | null> {
    const list = read('SCHOOD_AI_CENTRE_KEYS')?.trim(), active = read('SCHOOD_AI_CENTRE_KEY_ACTIVE')?.trim();
    if (!list || !active) return null;
    const material = Object.fromEntries(list.split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
      const at = entry.indexOf(':');
      return [entry.slice(0, at), entry.slice(at + 1)];
    }));
    return SecretBox.create(active, material);
  }

  async seal(secret: string, context: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(`${this.active}|${context}`) }, this.keys.get(this.active)!, encoder.encode(secret));
    return `v1:${this.active}:${b64(iv)}:${b64(new Uint8Array(data))}`;
  }

  async open(sealed: string, context: string): Promise<string> {
    const [version, id, iv, data] = sealed.split(':');
    const key = this.keys.get(id);
    if (version !== 'v1' || !key || !iv || !data) throw new Error('This secret cannot be opened with the configured keys.');
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: encoder.encode(`${id}|${context}`) }, key, unb64(data));
    return new TextDecoder().decode(plain);
  }
}

/** The context a sealed value is bound to. */
export const secretContext = (workspaceId: string, purpose: string, label: string) => `${workspaceId}:${purpose}:${label}`;

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** URL-safe random text with `bytes` of entropy. */
export function randomToken(bytes = 24): string {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** An invite or staff code people can type: 10 characters without look-alikes. */
export function humanCode(length = 10): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a), right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
