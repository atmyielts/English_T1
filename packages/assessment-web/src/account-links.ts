// Account creation and password recovery live on the mother platform; the shared
// .schood.online sign-in cookie brings the person back here already signed in.
const platform = String(import.meta.env.VITE_PLATFORM_URL || 'https://schood.online').replace(/\/+$/, '');

export function accountLink(mode: 'signup' | 'forgot', returnTo: string = location.href): string {
  return `${platform}/auth?mode=${mode}&returnTo=${encodeURIComponent(returnTo)}`;
}

/** Where candidates open a sitting join link. */
export function examOrigin(): string {
  return String(import.meta.env.VITE_ASSESSMENT_EXAM_URL || location.origin).replace(/\/+$/, '');
}

export function joinUrl(linkId: string, code: string): string {
  return `${examOrigin()}/#join=${linkId}.${code}`;
}

/** Reads `#join=<link id>.<code>`; the code never travels in a query string. */
export function parseJoin(hash: string): { id: string; code: string } | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('join') ?? '';
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([a-f0-9]{64})$/.exec(value);
  return match ? { id: match[1], code: match[2] } : null;
}

/** The Proctor staff app, opened on an institution and optionally a screen. */
export function proctorLink(tenant: string, tab?: 'policies' | 'sessions' | 'workload'): string {
  const origin = String(import.meta.env.VITE_PROCTOR_URL || 'https://proctor.schood.online').replace(/\/+$/, '');
  return `${origin}/?tenant_id=${encodeURIComponent(tenant)}${tab ? `&tab=${tab}` : ''}`;
}
