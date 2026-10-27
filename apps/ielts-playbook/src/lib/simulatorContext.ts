// Context handed over by IELTS Simulator links such as
//   /dashboard?source=simulator&session_id=<id>&intent=regenerate
// The session id is remembered for the tab so moving between the dashboard
// and the diagnostic keeps the plan anchored to that simulator result.

const KEY = 'ielts-playbook:simulator-session';

export type SimulatorContext = {
  source: string | null;
  sessionId: string | null;
  intent: string | null;
};

const clean = (value: string | null): string | null => {
  const text = (value ?? '').trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(text) ? text : null;
};

export const readSimulatorContext = (search: string): SimulatorContext => {
  const params = new URLSearchParams(search);
  const source = clean(params.get('source'));
  const intent = clean(params.get('intent'));
  let sessionId = clean(params.get('session_id'));
  try {
    if (sessionId && source === 'simulator') window.sessionStorage.setItem(KEY, sessionId);
    if (!sessionId) sessionId = clean(window.sessionStorage.getItem(KEY));
  } catch {
    // storage unavailable: fall back to the URL only
  }
  return { source, sessionId, intent };
};

export const clearSimulatorSession = (): void => {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};
