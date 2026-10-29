// Shared types for the `company` function. Each area module (core, people, hiring,
// training, insights, staff) exports a `routes` list; handler.ts dispatches to them.
import type { OrgRole } from '../../../packages/company-core/src/mod.ts';

// The subset of supabase-js the function uses (service-role client).
// deno-lint-ignore no-explicit-any
export type Db = any;

export interface OrgRow {
  id: string;
  name: string;
  industry: string;
  size_band: string;
  city: string | null;
  contact_phone: string | null;
  billing_email: string | null;
  tax_id: string | null;
  status: 'pilot' | 'active' | 'suspended' | 'closed';
  seats_limit: number;
  tests_limit: number | null;
  tests_used: number;
  contract_ends_at: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface MemberRow {
  id: string;
  org_id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  role: OrgRole;
  department_id: string | null;
  job_role: string;
  status: 'invited' | 'active' | 'removed';
  seat: boolean;
  level: string | null;
  level_score: number | null;
  level_source: string | null;
  level_at: string | null;
  target_level: string | null;
  target_date: string | null;
  consent_at: string | null;
  joined_at: string | null;
}

export interface CompanyEnv {
  /** Test attempts a new pilot workspace gets. */
  pilotTests: number;
  /** Whether anyone signed in may create a pilot workspace. */
  selfServe: boolean;
  /** AI calls a workspace may make per Tashkent day unless its settings say otherwise. */
  aiDailyLimit: number;
  /** Public origin of the app, for links in responses. */
  appUrl: string;
}

/** AI gateway call, injected so tests can stub it (normally callEnglishAIWithStatus). */
export type AiCall = <T>(request: { systemPrompt: string; userPayload: string; temperature?: number; feature: string; userId?: string | null }, fallback: T) => Promise<{ data: T; status: 'ok' | 'unconfigured' | 'failed'; error?: string }>;

export interface Ctx {
  db: Db;
  req: Request;
  /** Signed-in user id, or null on public routes. */
  user: string | null;
  email: string | null;
  /** Schood staff (users.role starts with "admin"). */
  staff: boolean;
  /** Set on `org` routes: the workspace and the caller's membership (null for staff acting without one). */
  org: OrgRow | null;
  member: MemberRow | null;
  env: CompanyEnv;
  now: () => Date;
  ai: AiCall;
  /** Client address hash for rate limits on public routes. */
  ipHash: string;
  /** Appends a row to company_audit for the current workspace. */
  audit: (action: string, target?: string | null, details?: Record<string, unknown>) => Promise<void>;
}

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
/**
 * `public`: no session needed. `user`: any signed-in user. `staff`: Schood staff.
 * `org`: path starts with `orgs/:org`; the caller must be an active member with one of `roles`
 * (staff are always allowed).
 */
export type Access = 'public' | 'user' | 'staff' | 'org';

export interface Route {
  method: Method;
  /** Path after /functions/v1/company/, with `:name` parameters, e.g. `orgs/:org/people/:member`. */
  path: string;
  access: Access;
  roles?: readonly OrgRole[];
  /** Also allowed for workspaces that are suspended (read-only views). Defaults to false for writes. */
  allowSuspended?: boolean;
  handle: (ctx: Ctx, params: Record<string, string>, body: unknown, query: URLSearchParams) => Promise<unknown>;
}

export class CompanyError extends Error {
  constructor(public code: string, message: string, public status = 400, public details: Record<string, unknown> = {}) {
    super(message);
  }
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Throws on a Supabase error and returns the data. */
export function check<T>(result: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (result.error) throw new Error(`${result.error.code ?? 'db'}: ${result.error.message}`);
  return result.data as T;
}
