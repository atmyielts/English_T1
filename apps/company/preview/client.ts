// Preview stand-in for packages/assessment-web/src/client: a persona is "signed in"
// and its user id doubles as the access token the in-browser function accepts.
import { PERSONAS, currentPersona, setPersona } from './personas.ts';

export const configured = true;
export class ServiceRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const listeners = new Set<(actor: string) => void>();
const userId = () => {
  const persona = currentPersona();
  return persona === 'signedout' ? '' : PERSONAS[persona].id;
};
const notify = () => listeners.forEach((listener) => listener(userId()));

export function observeAccount(changed: (actor: string) => void) {
  listeners.add(changed);
  queueMicrotask(() => changed(userId()));
  return () => listeners.delete(changed);
}

export const supabase = {
  auth: {
    async getSession() {
      const id = userId();
      return { data: { session: id ? { access_token: id, user: { id, email: `${currentPersona()}@preview.local` } } : null }, error: null };
    },
    async signInWithPassword({ email }: { email: string; password: string }) {
      const name = email.split('@')[0];
      setPersona(name in PERSONAS ? name as keyof typeof PERSONAS : 'owner');
      notify();
      return { data: {}, error: null };
    },
    async signOut() {
      setPersona('signedout');
      notify();
      return { error: null };
    },
  },
};
