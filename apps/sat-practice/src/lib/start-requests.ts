type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Pending = { selection: string; requestId: string };
const prefix = 'schood.sat-start.pending.';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function startActor(accessToken: string): string {
  try {
    const payload = (accessToken.split('.')[1] ?? '').replaceAll('-', '+').replaceAll('_', '/');
    const sub = JSON.parse(atob(payload)).sub;
    if (typeof sub === 'string' && uuid.test(sub)) return sub.toLowerCase();
  } catch { /* Authorization remains enforced by the service. */ }
  throw new Error('Sign in again before starting a drill.');
}

export function startSelection(path: string, body: Record<string, unknown>): string {
  // Missing and blank controls mean the same filter. Property order must not
  // change the request identity after a reload or a different screen's retry.
  return JSON.stringify([path, Object.fromEntries(Object.entries(body)
    .filter(([, value]) => value != null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b)))]);
}

function read(storage: StoragePort, actor: string): Pending[] {
  const raw = storage.getItem(prefix + actor);
  const rows: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(rows) || rows.length > 32 || rows.some(row =>
    !row || typeof row.selection !== 'string' || typeof row.requestId !== 'string' || !uuid.test(row.requestId))) {
    throw new Error('Saved drill starts could not be recovered. Please contact support.');
  }
  return rows;
}

export function pendingStart(storage: StoragePort, actor: string, selection: string, createId: () => string = () => crypto.randomUUID()): string {
  if (!uuid.test(actor) || selection.length > 8192) throw new Error('Invalid drill selection.');
  let rows: Pending[];
  try { rows = read(storage, actor); } catch {
    throw new Error('Saved drill starts are unavailable. Enable browser storage and retry.');
  }
  const existing = rows.find(row => row.selection === selection);
  if (existing) return existing.requestId;
  if (rows.length >= 32) throw new Error('Several drill starts need confirmation. Retry an earlier selection.');
  const requestId = createId();
  if (!uuid.test(requestId)) throw new Error('The drill start could not be prepared. Please retry.');
  try { storage.setItem(prefix + actor, JSON.stringify([...rows, { selection, requestId }])); } catch {
    // Do not send a mutation whose identity cannot survive a lost response.
    throw new Error('Enable browser storage before starting a drill, then retry.');
  }
  return requestId;
}

export function acknowledgeStart(storage: StoragePort, actor: string, attemptId: string): void {
  try {
    const remaining = read(storage, actor).filter(row => row.requestId !== attemptId);
    if (remaining.length) storage.setItem(prefix + actor, JSON.stringify(remaining));
    else storage.removeItem(prefix + actor);
  } catch { /* A failed acknowledgement safely reopens the same server drill. */ }
}
