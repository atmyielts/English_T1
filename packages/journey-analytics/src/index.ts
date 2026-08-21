export type JourneyEventName =
  | 'platform_home_viewed'
  | 'platform_path_selected'
  | 'english_discovery_viewed'
  | 'english_hub_viewed'
  | 'english_skill_selected'
  | 'signin_started'
  | 'signup_started'
  | 'pricing_viewed'
  | 'checkout_started'
  | 'authenticated_return_completed';

export type JourneySurface = 'platform' | 'english_hub';

type JourneyTrackerConfig = {
  endpoint: string;
  anonKey: string;
  surface: JourneySurface;
  releaseSha?: string;
  cookieDomain?: string;
};

type JourneyEventOptions = {
  path?: string;
  target?: string;
  metadata?: Record<string, string | number | boolean | null>;
  accessToken?: string | null;
  once?: boolean;
};

const VISITOR_COOKIE = 'schood_journey_id';
const SESSION_PREFIX = 'schood.journey.once.';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const readCookie = (name: string): string | null => {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(';')) {
    const value = part.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return null;
};

const visitorId = (cookieDomain?: string): string => {
  const existing = readCookie(VISITOR_COOKIE);
  if (existing && UUID_PATTERN.test(existing)) return existing;

  const created = crypto.randomUUID();
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const domain = cookieDomain?.trim();
  const domainPart = domain && window.location.hostname.endsWith(domain.replace(/^\./, ''))
    ? `; Domain=${domain}`
    : '';
  document.cookie = `${encodeURIComponent(VISITOR_COOKIE)}=${encodeURIComponent(created)}; Path=/; Max-Age=7776000; SameSite=Lax${secure}${domainPart}`;
  return created;
};

const cleanPath = (value: string | undefined): string => {
  const raw = value || window.location.pathname || '/';
  const withoutQuery = raw.split(/[?#]/, 1)[0] || '/';
  return withoutQuery.startsWith('/') ? withoutQuery.slice(0, 240) : '/';
};

const cleanAttribution = (): Record<string, string> => {
  const query = new URLSearchParams(window.location.search);
  const result: Record<string, string> = {};
  for (const [key, outputKey] of [
    ['utm_source', 'source'],
    ['utm_medium', 'medium'],
    ['utm_campaign', 'campaign'],
  ] as const) {
    const value = query.get(key)?.trim();
    if (value) result[outputKey] = value.slice(0, 120);
  }
  return result;
};

export const createJourneyTracker = (config: JourneyTrackerConfig) => {
  const track = (eventName: JourneyEventName, options: JourneyEventOptions = {}): void => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const path = cleanPath(options.path);
    const onceKey = `${SESSION_PREFIX}${eventName}:${config.surface}:${path}:${options.target ?? ''}`;
    if (options.once) {
      try {
        if (window.sessionStorage.getItem(onceKey)) return;
        window.sessionStorage.setItem(onceKey, '1');
      } catch {
        // Event idempotency at the API remains the fallback when storage is unavailable.
      }
    }

    const id = visitorId(config.cookieDomain);
    const body = {
      visitor_id: id,
      event_name: eventName,
      surface: config.surface,
      path,
      target: options.target?.trim().slice(0, 120) || null,
      release_sha: config.releaseSha?.trim().slice(0, 64) || null,
      idempotency_key: `${id}:${eventName}:${config.surface}:${path}:${options.target ?? ''}:${Math.floor(Date.now() / 60_000)}`,
      metadata: options.metadata ?? {},
      ...cleanAttribution(),
    };

    const headers: Record<string, string> = {
      apikey: config.anonKey,
      'Content-Type': 'application/json',
    };
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

    void fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {
      // Journey measurement must never block navigation or the learning experience.
    });
  };

  return { track };
};
