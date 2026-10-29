// Schood Company English API (/functions/v1/company/...). One router over the
// area modules' route lists: CORS, sign-in, Schood staff, workspace membership
// and role checks happen here, so each area only writes its handlers.
import { check, CompanyError, type AiCall, type CompanyEnv, type Ctx, type Db, type MemberRow, type OrgRow, type Route } from './types.ts';
import { sha256, tashkentDay } from './util.ts';

export interface HandlerDeps {
  db: Db;
  userFromToken: (token: string) => Promise<{ id: string; email: string | null } | null>;
  origins: string[];
  env: CompanyEnv;
  ai: AiCall;
  routes: Route[];
  now?: () => Date;
}

const MAX_BODY = 512 * 1024;
export const ORG_COLUMNS = 'id,name,industry,size_band,city,contact_phone,billing_email,tax_id,status,seats_limit,tests_limit,tests_used,contract_ends_at,settings,created_at';
export const MEMBER_COLUMNS = 'id,org_id,user_id,email,full_name,role,department_id,job_role,status,seat,level,level_score,level_source,level_at,target_level,target_date,consent_at,joined_at';

function match(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/'), have = path.split('/');
  if (want.length !== have.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < want.length; index++) {
    if (want[index].startsWith(':')) {
      if (!have[index]) return null;
      params[want[index].slice(1)] = decodeURIComponent(have[index]);
    } else if (want[index] !== have[index]) return null;
  }
  return params;
}

export function createCompanyHandler(deps: HandlerDeps) {
  const now = deps.now ?? (() => new Date());
  const cors = (origin: string | null): Record<string, string> => ({
    'Access-Control-Allow-Origin': origin && deps.origins.includes(origin) ? origin : deps.origins.length ? deps.origins[0] : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    Vary: 'Origin',
  });
  const json = (status: number, body: unknown, origin: string | null) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(origin) } });

  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*?\/company\/?/, '').replace(/\/+$/, '');
    try {
      const candidates = deps.routes.map((route) => ({ route, params: match(route.path, path) })).filter((entry) => entry.params);
      if (!candidates.length) throw new CompanyError('not_found', 'No such endpoint.', 404);
      const found = candidates.find((entry) => entry.route.method === req.method);
      if (!found) throw new CompanyError('method_not_allowed', 'Method not allowed.', 405);
      const { route } = found, params = found.params!;

      let body: unknown = undefined;
      if (req.method !== 'GET' && req.method !== 'DELETE') {
        const raw = await req.text();
        if (raw.length > MAX_BODY) throw new CompanyError('body_too_large', 'Request is too large.', 413);
        if (raw) {
          try { body = JSON.parse(raw); } catch { throw new CompanyError('invalid_json', 'Send valid JSON.', 400); }
        }
      }

      const address = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
      const ctx: Ctx = {
        db: deps.db, req, user: null, email: null, staff: false, org: null, member: null, env: deps.env, now, ai: deps.ai,
        ipHash: (await sha256(`${tashkentDay(now())}:${address}`)).slice(0, 32),
        audit: async (action, target = null, details = {}) => {
          const { error } = await deps.db.from('company_audit').insert({ org_id: ctx.org?.id ?? null, actor: ctx.user, action, target, details });
          if (error) console.error(JSON.stringify({ company_audit: 'failed', action, error: error.message }));
        },
      };

      const header = req.headers.get('Authorization') ?? '';
      const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (route.access !== 'public' || bearer) {
        const account = bearer ? await deps.userFromToken(bearer) : null;
        if (!account && route.access !== 'public') throw new CompanyError('unauthorized', 'Sign in first.', 401);
        if (account) {
          ctx.user = account.id;
          ctx.email = account.email;
          const row = check<{ role: string | null } | null>(await deps.db.from('users').select('role').eq('id', account.id).maybeSingle());
          ctx.staff = String(row?.role ?? '').trim().toLowerCase().startsWith('admin');
        }
      }
      if (route.access === 'staff' && !ctx.staff) throw new CompanyError('forbidden', 'Schood staff only.', 403);

      if (route.access === 'org') {
        const org = check<OrgRow | null>(await deps.db.from('company_orgs').select(ORG_COLUMNS).eq('id', params.org ?? '').maybeSingle());
        if (!org) throw new CompanyError('org_not_found', 'Workspace not found.', 404);
        const member = check<MemberRow | null>(await deps.db.from('company_members').select(MEMBER_COLUMNS).eq('org_id', org.id).eq('user_id', ctx.user).eq('status', 'active').maybeSingle());
        if (!ctx.staff) {
          if (!member) throw new CompanyError('not_member', 'You are not in this workspace.', 403);
          if (route.roles && !route.roles.includes(member.role)) throw new CompanyError('forbidden', 'Your role cannot do this.', 403, { role: member.role });
          if (org.status === 'closed') throw new CompanyError('org_closed', 'This workspace is closed.', 403);
          if (org.status === 'suspended' && req.method !== 'GET' && !route.allowSuspended) throw new CompanyError('org_suspended', 'This workspace is paused. Contact Schood.', 403);
        }
        ctx.org = org;
        ctx.member = member;
      }

      const result = await route.handle(ctx, params, body, url.searchParams);
      return json(200, result ?? { ok: true }, origin);
    } catch (cause) {
      if (cause instanceof CompanyError) return json(cause.status, { code: cause.code, error: cause.message, ...cause.details }, origin);
      console.error(JSON.stringify({ company: 'internal_error', path, error: String(cause instanceof Error ? cause.stack ?? cause.message : cause) }));
      return json(500, { code: 'internal_error', error: 'Something went wrong. Try again.' }, origin);
    }
  };
}
