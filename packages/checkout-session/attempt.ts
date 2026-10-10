// Preserve a purchase reference across network failures and page refreshes.
// Only non-secret purchase choices and a random key enter session storage.
const attempts = new Map<string, string>();
const prefix = 'schood-checkout-attempt:v1:';
const activePrefix = 'schood-checkout-active:v1:';
const storage = (): Storage | null => {
  try { return window.sessionStorage; } catch { return null; }
};

export function checkoutAttempt(userId: string, intent: Record<string, unknown>, scope?: string): string {
  const identity = `${prefix}${userId}:${JSON.stringify(intent)}`;
  let saved = attempts.get(identity);
  try { saved ??= storage()?.getItem(identity) ?? undefined; } catch { /* Memory fallback for restricted browsers. */ }
  const key = saved && /^[a-f0-9-]{36}$/i.test(saved) ? saved : crypto.randomUUID();
  attempts.set(identity, key);
  try { storage()?.setItem(identity, key); } catch { /* The same mounted attempt remains reusable. */ }
  if (scope) {
    const activeIdentity = `${activePrefix}${userId}:${scope}`;
    const value = JSON.stringify({ key, intent });
    attempts.set(activeIdentity, value);
    try { storage()?.setItem(activeIdentity, value); } catch { /* Memory fallback. */ }
  }
  return key;
}

export function restoreCheckoutAttempt(userId: string, scope: string): { key: string; intent: Record<string, unknown> } | null {
  const identity = `${activePrefix}${userId}:${scope}`;
  try {
    const raw = attempts.get(identity) ?? storage()?.getItem(identity);
    if (!raw || raw.length > 8192) return null;
    const saved = JSON.parse(raw);
    if (typeof saved.key !== 'string' || !/^[a-f0-9-]{36}$/i.test(saved.key)
      || !saved.intent || typeof saved.intent !== 'object' || Array.isArray(saved.intent)) return null;
    return saved;
  } catch { return null; }
}

export function completeCheckoutAttempt(userId: string, requestKey: string | null): void {
  if (!requestKey) return;
  const actorPrefix = `${prefix}${userId}:`;
  const activeActorPrefix = `${activePrefix}${userId}:`;
  const matches = (identity: string, value: string | null): boolean => {
    if (identity.startsWith(actorPrefix)) return value === requestKey;
    if (!identity.startsWith(activeActorPrefix) || !value) return false;
    try { return JSON.parse(value).key === requestKey; } catch { return false; }
  };
  for (const [identity, value] of attempts) {
    if (matches(identity, value)) attempts.delete(identity);
  }
  try {
    const store = storage();
    if (!store) return;
    for (let i = store.length - 1; i >= 0; i--) {
      const identity = store.key(i);
      if (identity && matches(identity, store.getItem(identity))) store.removeItem(identity);
    }
  } catch { /* Storage restrictions must not interrupt confirmed access. */ }
}
