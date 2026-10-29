import { supabase } from '../../../packages/assessment-web/src/client';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Record<string, unknown> = {}) {
    super(message);
  }
  get field(): string | undefined {
    return typeof this.details.field === 'string' ? this.details.field : undefined;
  }
}

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Calls the `company` function. Signed in by default; `{ auth: false }` for public
 * routes (landing form, candidate tests, certificate checks).
 */
export async function api<T>(path: string, options: { method?: Method; body?: unknown; auth?: boolean; expectedActor?: string; timeoutMs?: number } = {}): Promise<T> {
  if (!url || !anon) throw new ApiError(0, 'unconfigured', 'Not configured');
  const headers: Record<string, string> = { apikey: anon, 'Content-Type': 'application/json' };
  if (options.auth !== false) {
    if (!supabase) throw new ApiError(0, 'unconfigured', 'Not configured');
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new ApiError(401, 'unauthorized', 'Sign in first.');
    if (options.expectedActor && data.session.user.id !== options.expectedActor) throw new ApiError(409, 'account_changed', 'You signed in as someone else in another tab. Reload the page.');
    headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  try {
    const response = await fetch(`${url}/functions/v1/company/${path}`, {
      method: options.method ?? 'GET',
      headers,
      signal: controller.signal,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const { code, error, ...details } = payload as Record<string, unknown>;
      throw new ApiError(response.status, String(code ?? 'request_failed'), String(error ?? 'Request failed'), details);
    }
    return payload as T;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw new TypeError('timeout');
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}

/** Shapes the core routes return (areas add their own types next to their code). */
export interface OrgSummary { id: string; name: string; status: 'pilot' | 'active' | 'suspended' | 'closed'; industry: string }
export interface Member {
  id: string; org_id: string; user_id: string | null; email: string | null; full_name: string | null;
  role: 'owner' | 'admin' | 'manager' | 'employee'; department_id: string | null; job_role: string;
  status: 'invited' | 'active' | 'removed'; seat: boolean; level: string | null; level_score: number | null;
  level_source: string | null; level_at: string | null; target_level: string | null; target_date: string | null;
  consent_at: string | null; joined_at: string | null;
}
export interface Org extends OrgSummary {
  size_band: string; city?: string | null; contact_phone?: string | null; billing_email?: string | null; tax_id?: string | null;
  seats_limit?: number; tests_limit?: number | null; tests_used?: number; contract_ends_at?: string | null;
  settings: Record<string, unknown>; created_at?: string;
}
export interface Me { user: { id: string; email: string | null }; staff: boolean; self_serve: boolean; workspaces: { org: OrgSummary; member: Member }[] }
export interface Usage { seats_used: number; seats_limit: number; tests_used: number; tests_limit: number | null }
export interface Workspace { org: Org; member: Member | null; departments: { id: string; name: string }[]; usage: Usage | null }
