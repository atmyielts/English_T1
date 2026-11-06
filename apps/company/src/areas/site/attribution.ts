// Where this visit came from: UTM tags, the first page and the referring site's host,
// kept for the visit only and sent with a demo request. The referrer is cut to its host,
// so no search terms or private paths are kept.
const STORE = 'company-site-attribution';
const UTM = ['source', 'medium', 'campaign', 'term', 'content'] as const;

export interface Attribution { utm: Partial<Record<(typeof UTM)[number], string>>; landing_path: string; referrer_host: string | null }

function refererHost(): string | null {
  try {
    if (!document.referrer) return null;
    const host = new URL(document.referrer).hostname;
    return host && host !== location.hostname ? host : null;
  } catch {
    return null;
  }
}

/** Remembers the first touch of the visit; later pages never overwrite it. */
export function captureAttribution() {
  try {
    if (sessionStorage.getItem(STORE)) return;
    const query = new URLSearchParams(location.search);
    const utm: Attribution['utm'] = {};
    for (const key of UTM) {
      const value = query.get(`utm_${key}`);
      if (value) utm[key] = value.slice(0, 120);
    }
    const value: Attribution = { utm, landing_path: location.pathname.slice(0, 200), referrer_host: refererHost() };
    sessionStorage.setItem(STORE, JSON.stringify(value));
  } catch {
    // Without storage we simply don't know where the visit came from.
  }
}

export function readAttribution(): Partial<Attribution> {
  try {
    const stored = sessionStorage.getItem(STORE);
    return stored ? JSON.parse(stored) as Attribution : {};
  } catch {
    return {};
  }
}
