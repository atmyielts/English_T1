import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authorizeAdminRequest } from '../_shared/admin-access.ts';

type SettingsUpdate = Partial<{
  trial_enabled: boolean;
  trial_days: number;
  trial_autogrant_on_signup: boolean;
  trial_once_per_user: boolean;
  trial_resource_type: string;
  trial_resource_id: string | null;
  trial_limits: Record<string, unknown>;
  trial_product_overrides: Record<string, unknown>;
  writing_ai_enabled: boolean;
  writing_ai_daily_limit: number;
  student_center_enabled: boolean;
  classroom_v2_enabled: boolean;
  academy_video_provider: 'cloudflare_stream';
  academy_video_uploads_enabled: boolean;
  anti_sharing_enabled: boolean;
  anti_sharing_max_concurrent_sessions_per_product: number;
  anti_sharing_device_window_days: number;
  anti_sharing_max_devices_per_window: number;
}>;
type AdminSecurityPatch = Partial<{
  require_mfa: boolean;
  session_timeout_minutes: number;
  rate_limit_per_minute: number;
  ip_allowlist: string[];
}>;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
};

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizePositiveInt = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return Math.floor(n);
};

const normalizeNonNegativeInt = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return Math.floor(n);
};

const normalizeLimitObject = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = normalizePositiveInt(raw);
    if (n != null) out[String(key)] = n;
  }
  return out;
};

const normalizeIpAllowlist = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
};

const normalizeTrialProductOverrides = (value: unknown): Record<string, Record<string, unknown>> => {
  if (!isObject(value)) return {};
  const out: Record<string, Record<string, unknown>> = {};
  for (const [productIdRaw, rawOverride] of Object.entries(value)) {
    const productId = String(productIdRaw ?? '').trim();
    if (!productId || !isObject(rawOverride)) continue;

    const normalized: Record<string, unknown> = {};
    if (typeof rawOverride.trial_enabled === 'boolean') {
      normalized.trial_enabled = rawOverride.trial_enabled;
    }

    const days = normalizePositiveInt(rawOverride.trial_days);
    if (days != null) normalized.trial_days = days;

    if ('trial_limits' in rawOverride) {
      normalized.trial_limits = normalizeLimitObject(rawOverride.trial_limits);
    }

    if (Object.keys(normalized).length > 0) out[productId] = normalized;
  }
  return out;
};

export const handlePlatformSettings = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = getEnv('SUPABASE_URL');
    const supabaseServiceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const authz = await authorizeAdminRequest(supabase, req, corsHeaders, {
      requiredPermission: 'admin.settings.manage',
      action: 'admin.settings',
    });
    if (!authz.ok) return authz.response;
    const url = new URL(req.url);
    const scope = String(url.searchParams.get('scope') ?? '').trim().toLowerCase();

    if (scope === 'admin_security' && req.method === 'GET') {
      const { data: policy, error: policyError } = await supabase
        .from('admin_security_policies')
        .select('id, require_mfa, session_timeout_minutes, rate_limit_per_minute, ip_allowlist, updated_at')
        .eq('id', 1)
        .maybeSingle();
      if (policyError) {
        return new Response(
          JSON.stringify({ error: 'Failed to load admin security policy', details: policyError }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }
      return new Response(JSON.stringify(policy), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (scope === 'admin_security' && req.method === 'PATCH') {
      const body = (await req.json()) as AdminSecurityPatch;
      // Ordinary edits must preserve the saved MFA requirement. Changing it
      // requires a separately qualified enrollment/recovery rollout.
      if ('require_mfa' in body && body.require_mfa !== authz.context.policy.require_mfa) {
        return new Response(
          JSON.stringify({
            error: 'MFA policy changes require verified administrator recovery.',
            code: 'mfa_policy_change_requires_recovery',
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json', ...corsHeaders, 'Cache-Control': 'no-store' },
          },
        );
      }
      const patch: AdminSecurityPatch = {};
      if ('session_timeout_minutes' in body) {
        const timeout = normalizePositiveInt(body.session_timeout_minutes);
        if (timeout != null) patch.session_timeout_minutes = Math.min(240, Math.max(5, timeout));
      }
      if ('rate_limit_per_minute' in body) {
        const limit = normalizePositiveInt(body.rate_limit_per_minute);
        if (limit != null) patch.rate_limit_per_minute = Math.min(2000, Math.max(10, limit));
      }
      if ('ip_allowlist' in body) patch.ip_allowlist = normalizeIpAllowlist(body.ip_allowlist);

      const { data: updatedPolicy, error: updatePolicyError } = await supabase
        .from('admin_security_policies')
        .update(patch)
        .eq('id', 1)
        .select('id, require_mfa, session_timeout_minutes, rate_limit_per_minute, ip_allowlist, updated_at')
        .maybeSingle();

      if (updatePolicyError) {
        return new Response(
          JSON.stringify({ error: 'Failed to update admin security policy', details: updatePolicyError }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          },
        );
      }

      return new Response(JSON.stringify(updatedPolicy), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (req.method === 'GET') {
      const { data: settings, error: settingsError } = await supabase
        .from('platform_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (settingsError) {
        return new Response(JSON.stringify({ error: 'Failed to load settings', details: settingsError }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return new Response(JSON.stringify(settings), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (req.method === 'PATCH') {
      const body = (await req.json()) as SettingsUpdate;
      const patch: SettingsUpdate = {};

      if (typeof body.trial_enabled === 'boolean') patch.trial_enabled = body.trial_enabled;
      const trialDays = normalizePositiveInt(body.trial_days);
      if (trialDays != null) patch.trial_days = trialDays;
      if (typeof body.trial_once_per_user === 'boolean') patch.trial_once_per_user = body.trial_once_per_user;
      if (typeof body.trial_resource_type === 'string') {
        patch.trial_resource_type = body.trial_resource_type.trim() || 'product';
      }
      if (body.trial_resource_id === null || typeof body.trial_resource_id === 'string') {
        patch.trial_resource_id = body.trial_resource_id ? body.trial_resource_id.trim() || null : null;
      }
      if ('trial_limits' in body) patch.trial_limits = normalizeLimitObject(body.trial_limits);
      if ('trial_product_overrides' in body) {
        patch.trial_product_overrides = normalizeTrialProductOverrides(body.trial_product_overrides);
      }
      if (typeof body.writing_ai_enabled === 'boolean') patch.writing_ai_enabled = body.writing_ai_enabled;
      const writingDailyLimit = normalizeNonNegativeInt(body.writing_ai_daily_limit);
      if (writingDailyLimit != null) patch.writing_ai_daily_limit = writingDailyLimit;
      if (typeof body.student_center_enabled === 'boolean') {
        patch.student_center_enabled = body.student_center_enabled;
      }
      if (typeof body.classroom_v2_enabled === 'boolean') {
        patch.classroom_v2_enabled = body.classroom_v2_enabled;
      }
      if (body.academy_video_provider === 'cloudflare_stream') {
        patch.academy_video_provider = 'cloudflare_stream';
      }
      if (typeof body.academy_video_uploads_enabled === 'boolean') {
        if (body.academy_video_uploads_enabled) {
          const requiredStreamConfig = [
            'CLOUDFLARE_STREAM_ACCOUNT_ID',
            'CLOUDFLARE_STREAM_API_TOKEN',
            'CLOUDFLARE_STREAM_CUSTOMER_CODE',
            'CLOUDFLARE_STREAM_SIGNING_KEY_ID',
            'CLOUDFLARE_STREAM_SIGNING_PRIVATE_JWK',
          ];
          if (requiredStreamConfig.some((key) => !String(Deno.env.get(key) ?? '').trim())) {
            return new Response(
              JSON.stringify({
                error: 'Video hosting must be fully configured before uploads can be enabled',
              }),
              {
                status: 409,
                headers: { 'Content-Type': 'application/json', ...corsHeaders },
              },
            );
          }
        }
        patch.academy_video_uploads_enabled = body.academy_video_uploads_enabled;
      }
      if (typeof body.anti_sharing_enabled === 'boolean') {
        patch.anti_sharing_enabled = body.anti_sharing_enabled;
      }

      if ('anti_sharing_max_concurrent_sessions_per_product' in body) {
        const limit = normalizePositiveInt(body.anti_sharing_max_concurrent_sessions_per_product);
        if (limit != null) {
          patch.anti_sharing_max_concurrent_sessions_per_product = Math.min(10, Math.max(1, limit));
        }
      }

      if ('anti_sharing_device_window_days' in body) {
        const days = normalizePositiveInt(body.anti_sharing_device_window_days);
        if (days != null) patch.anti_sharing_device_window_days = Math.min(365, Math.max(1, days));
      }

      if ('anti_sharing_max_devices_per_window' in body) {
        const maxDevices = normalizePositiveInt(body.anti_sharing_max_devices_per_window);
        if (maxDevices != null) {
          patch.anti_sharing_max_devices_per_window = Math.min(20, Math.max(1, maxDevices));
        }
      }

      // Trial flow is manual claim-based.
      patch.trial_autogrant_on_signup = false;

      const { data: updated, error: updateError } = await supabase
        .from('platform_settings')
        .update(patch)
        .eq('id', 1)
        .select('*')
        .maybeSingle();

      if (updateError) {
        return new Response(JSON.stringify({ error: 'Failed to update settings', details: updateError }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};
