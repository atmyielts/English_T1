import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type JsonObject = Record<string, unknown>;

export type AdminSecurityPolicy = {
  require_mfa: boolean;
  session_timeout_minutes: number;
  rate_limit_per_minute: number;
  ip_allowlist: string[];
};

export type AdminRequestContext = {
  userId: string;
  email: string | null;
  role: string;
  permissions: string[];
  requestId: string;
  ipAddress: string | null;
  sessionAal: string | null;
  policy: AdminSecurityPolicy;
};

type AuthorizeInput = {
  requiredPermission?: string;
  action?: string;
  rateLimitKey?: string;
};

type AuthorizeResult =
  | { ok: true; context: AdminRequestContext }
  | { ok: false; response: Response };

let cachedAuthClient: any | null | undefined;

const getAuthClient = (): any | null => {
  if (cachedAuthClient !== undefined) return cachedAuthClient;
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    cachedAuthClient = null;
    return cachedAuthClient;
  }
  cachedAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAuthClient;
};

const jsonResponse = (status: number, body: unknown, corsHeaders: Record<string, string>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, 'Cache-Control': 'no-store' },
  });

const getBearerToken = (req: Request): string | null => {
  const header = req.headers.get('Authorization') ?? '';
  if (header) return header.startsWith('Bearer ') ? header.slice(7) : header;
  const fallback = req.headers.get('x-user-jwt') ?? '';
  return fallback.trim() || null;
};

const getClientIp = (req: Request): string | null => {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const value = forwarded.split(',')[0]?.trim();
    if (value) return value;
  }

  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return null;
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const toInt = (value: string): number | null => {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((nums[0] << 24) >>> 0) + ((nums[1] << 16) >>> 0) + ((nums[2] << 8) >>> 0) + nums[3];
};

const ipv4InCidr = (ip: string, cidr: string): boolean => {
  const [range, prefixRaw] = cidr.split('/');
  const prefix = Number(prefixRaw);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const ipInt = toInt(ip);
  const rangeInt = toInt(range);
  if (ipInt == null || rangeInt == null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
};

const isIpAllowed = (ipAddress: string | null, allowlist: string[]): boolean => {
  if (allowlist.length === 0) return true;
  if (!ipAddress) return false;
  const ip = ipAddress.trim();
  if (!ip) return false;

  for (const entryRaw of allowlist) {
    const entry = String(entryRaw ?? '').trim();
    if (!entry) continue;
    if (entry === '*') return true;
    if (entry.includes('/')) {
      if (ip.includes(':')) continue;
      if (ipv4InCidr(ip, entry)) return true;
      continue;
    }
    if (entry === ip) return true;
  }

  return false;
};

const hasPermission = (permissions: Set<string>, requiredPermission?: string): boolean => {
  if (!requiredPermission) return true;
  if (permissions.has('admin.*')) return true;
  return permissions.has(requiredPermission);
};

const normalizeAllowlist = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
};

export const loadSecurityPolicy = async (sb: any): Promise<AdminSecurityPolicy> => {
  const { data, error } = await sb
    .from('admin_security_policies')
    .select('require_mfa, session_timeout_minutes, rate_limit_per_minute, ip_allowlist')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) throw new Error('Admin security policy unavailable');

  const policy = data as {
    require_mfa?: boolean;
    session_timeout_minutes?: number;
    rate_limit_per_minute?: number;
    ip_allowlist?: unknown;
  };

  if (
    typeof policy.require_mfa !== 'boolean' ||
    !Number.isInteger(policy.session_timeout_minutes) ||
    Number(policy.session_timeout_minutes) < 5 || Number(policy.session_timeout_minutes) > 240 ||
    !Number.isInteger(policy.rate_limit_per_minute) ||
    Number(policy.rate_limit_per_minute) < 10 || Number(policy.rate_limit_per_minute) > 2000 ||
    !Array.isArray(policy.ip_allowlist) ||
    policy.ip_allowlist.some((entry: unknown) => typeof entry !== 'string')
  ) {
    throw new Error('Admin security policy invalid');
  }
  return {
    require_mfa: policy.require_mfa,
    session_timeout_minutes: Number(policy.session_timeout_minutes),
    rate_limit_per_minute: Number(policy.rate_limit_per_minute),
    ip_allowlist: normalizeAllowlist(policy.ip_allowlist),
  };
};

export const resolvePermissions = async (sb: any, userId: string, role: string): Promise<string[]> => {
  // Legacy super-admin role keeps full access even before RBAC tables are configured.
  if (role === 'admin') return ['admin.*'];

  try {
    const { data, error } = await sb.rpc('admin_effective_permissions', {
      p_user_id: userId,
      p_role: role,
    });

    if (error || !Array.isArray(data)) throw new Error('Admin permissions unavailable');

    const out = new Set<string>();
    for (const row of data) {
      if (typeof row === 'string') {
        out.add(row);
        continue;
      }
      if (row && typeof row === 'object' && 'permission_key' in row) {
        const value = String((row as Record<string, unknown>).permission_key ?? '').trim();
        if (value) out.add(value);
      }
    }
    return Array.from(out);
  } catch {
    throw new Error('Admin permissions unavailable');
  }
};

const applyRateLimit = async (
  sb: any,
  userId: string,
  routeKey: string,
  perMinuteLimit: number,
): Promise<{ allowed: boolean; requestCount: number }> => {
  if (!Number.isFinite(perMinuteLimit) || perMinuteLimit <= 0) {
    throw new Error('Admin rate limit invalid');
  }

  try {
    const { data, error } = await sb.rpc('admin_rate_limit_consume', {
      p_user_id: userId,
      p_route_key: routeKey,
      p_limit: Math.floor(perMinuteLimit),
      p_window_seconds: 60,
    });
    if (error || !Array.isArray(data) || data.length !== 1) throw new Error('Admin rate limit unavailable');
    const row = data[0] as Record<string, unknown>;
    if (
      typeof row.allowed !== 'boolean' || !Number.isSafeInteger(row.request_count) ||
      Number(row.request_count) < 1
    ) {
      throw new Error('Admin rate limit receipt invalid');
    }
    return {
      allowed: row.allowed,
      requestCount: Number(row.request_count),
    };
  } catch {
    throw new Error('Admin rate limit unavailable');
  }
};

const writeAuditLog = async (
  sb: any,
  req: Request,
  context: {
    userId: string | null;
    email: string | null;
    role: string | null;
    permissionKey: string | null;
    action: string;
    statusCode: number;
    requestId: string;
    ipAddress: string | null;
    metadata?: JsonObject;
  },
): Promise<boolean> => {
  try {
    const { error } = await sb.from('admin_audit_logs').insert({
      user_id: context.userId,
      user_email: context.email,
      role: context.role,
      permission_key: context.permissionKey,
      action: context.action,
      method: req.method,
      path: new URL(req.url).pathname,
      status_code: context.statusCode,
      ip: context.ipAddress,
      user_agent: req.headers.get('user-agent'),
      request_id: context.requestId,
      metadata: context.metadata ?? {},
    });
    return !error;
  } catch {
    return false;
  }
};

export const authorizeAdminRequest = async (
  sb: any,
  req: Request,
  corsHeaders: Record<string, string>,
  input: AuthorizeInput,
): Promise<AuthorizeResult> => {
  const token = getBearerToken(req);
  const requestId = crypto.randomUUID();
  const path = new URL(req.url).pathname;
  const routeKey = input.rateLimitKey ?? `${req.method}:${path}`;
  const ipAddress = getClientIp(req);
  const action = input.action ?? routeKey;
  const requiredPermission = input.requiredPermission ?? null;
  const unavailable = (): AuthorizeResult => ({
    ok: false,
    response: jsonResponse(503, {
      error: 'Admin security checks are temporarily unavailable. Retry shortly.',
      code: 'admin_security_unavailable',
      request_id: requestId,
    }, corsHeaders),
  });

  if (!token) {
    await writeAuditLog(sb, req, {
      userId: null,
      email: null,
      role: null,
      permissionKey: requiredPermission,
      action,
      statusCode: 401,
      requestId,
      ipAddress,
      metadata: { reason: 'missing_token' },
    });
    return {
      ok: false,
      response: jsonResponse(401, { error: 'Unauthorized', request_id: requestId }, corsHeaders),
    };
  }

  const authClient = getAuthClient();
  let authData: any, authError: any;
  try {
    const result = authClient ? await authClient.auth.getUser(token) : await sb.auth.getUser(token);
    authData = result.data;
    authError = result.error;
  } catch {
    return unavailable();
  }
  if (authError && (Number(authError.status) >= 500 || authError.name === 'AuthRetryableFetchError')) {
    return unavailable();
  }
  if (authError || !authData?.user) {
    await writeAuditLog(sb, req, {
      userId: null,
      email: null,
      role: null,
      permissionKey: requiredPermission,
      action,
      statusCode: 401,
      requestId,
      ipAddress,
      metadata: { reason: 'auth_get_user_failed' },
    });
    return {
      ok: false,
      response: jsonResponse(401, { error: 'Unauthorized', request_id: requestId }, corsHeaders),
    };
  }

  const userId = String(authData.user.id);
  const userEmail = authData.user.email ?? null;

  let userRow: any, userRowError: any;
  try {
    const result = await sb
      .from('users')
      .select('role,is_active')
      .eq('id', userId)
      .maybeSingle();
    userRow = result.data;
    userRowError = result.error;
  } catch {
    return unavailable();
  }
  if (userRowError) return unavailable();

  if (!userRow || userRow.is_active !== true) {
    await writeAuditLog(sb, req, {
      userId,
      email: userEmail,
      role: null,
      permissionKey: requiredPermission,
      action,
      statusCode: 403,
      requestId,
      ipAddress,
      metadata: { reason: userRow ? 'inactive_account' : 'missing_user_role_row' },
    });
    return {
      ok: false,
      response: jsonResponse(403, { error: 'Forbidden', request_id: requestId }, corsHeaders),
    };
  }

  const role = String((userRow as Record<string, unknown>).role ?? '').trim().toLowerCase();
  let policy: AdminSecurityPolicy, permissions: string[];
  try {
    policy = await loadSecurityPolicy(sb);
    permissions = await resolvePermissions(sb, userId, role);
  } catch {
    return unavailable();
  }
  const permissionSet = new Set(permissions);

  const hasAdminPortalAccess = hasPermission(permissionSet, 'admin.portal.access');
  if (!hasAdminPortalAccess) {
    await writeAuditLog(sb, req, {
      userId,
      email: userEmail,
      role,
      permissionKey: requiredPermission,
      action,
      statusCode: 403,
      requestId,
      ipAddress,
      metadata: { reason: 'missing_portal_access' },
    });
    return {
      ok: false,
      response: jsonResponse(403, { error: 'Forbidden', request_id: requestId }, corsHeaders),
    };
  }

  if (!hasPermission(permissionSet, requiredPermission ?? undefined)) {
    await writeAuditLog(sb, req, {
      userId,
      email: userEmail,
      role,
      permissionKey: requiredPermission,
      action,
      statusCode: 403,
      requestId,
      ipAddress,
      metadata: { reason: 'missing_permission' },
    });
    return {
      ok: false,
      response: jsonResponse(403, { error: 'Forbidden', request_id: requestId }, corsHeaders),
    };
  }

  const tokenPayload = decodeJwtPayload(token) ?? {};
  const sessionAal = typeof tokenPayload.aal === 'string' ? tokenPayload.aal : null;
  // Auth verified this exact token above. Honor the stored policy; never enable
  // MFA implicitly or accept user metadata as proof of a second factor.
  if (policy.require_mfa && (sessionAal !== 'aal2' || tokenPayload.sub !== userId)) {
    await writeAuditLog(sb, req, {
      userId,
      email: userEmail,
      role,
      permissionKey: requiredPermission,
      action,
      statusCode: 403,
      requestId,
      ipAddress,
      metadata: { reason: 'mfa_required' },
    });
    return {
      ok: false,
      response: jsonResponse(403, {
        error: 'Verify your authenticator before continuing to admin.',
        code: 'mfa_required',
        request_id: requestId,
      }, corsHeaders),
    };
  }

  if (!isIpAllowed(ipAddress, policy.ip_allowlist)) {
    await writeAuditLog(sb, req, {
      userId,
      email: userEmail,
      role,
      permissionKey: requiredPermission,
      action,
      statusCode: 403,
      requestId,
      ipAddress,
      metadata: { reason: 'ip_not_allowed', allowlist_size: policy.ip_allowlist.length },
    });
    return {
      ok: false,
      response: jsonResponse(
        403,
        { error: 'Admin access from this IP is not allowed', code: 'ip_not_allowed', request_id: requestId },
        corsHeaders,
      ),
    };
  }

  let rateLimit: { allowed: boolean; requestCount: number };
  try {
    rateLimit = await applyRateLimit(sb, userId, routeKey, policy.rate_limit_per_minute);
  } catch {
    return unavailable();
  }
  if (!rateLimit.allowed) {
    await writeAuditLog(sb, req, {
      userId,
      email: userEmail,
      role,
      permissionKey: requiredPermission,
      action,
      statusCode: 429,
      requestId,
      ipAddress,
      metadata: { reason: 'rate_limited', request_count: rateLimit.requestCount, route_key: routeKey },
    });
    return {
      ok: false,
      response: jsonResponse(
        429,
        {
          error: 'Rate limit reached for admin API',
          code: 'admin_rate_limited',
          request_id: requestId,
        },
        corsHeaders,
      ),
    };
  }

  const audited = await writeAuditLog(sb, req, {
    userId,
    email: userEmail,
    role,
    permissionKey: requiredPermission,
    action,
    statusCode: 200,
    requestId,
    ipAddress,
    metadata: { route_key: routeKey, request_count: rateLimit.requestCount },
  });
  if (!audited) return unavailable();

  return {
    ok: true,
    context: {
      userId,
      email: userEmail,
      role,
      permissions,
      requestId,
      ipAddress,
      sessionAal,
      policy,
    },
  };
};
