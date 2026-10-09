import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { AcademyVideoSettingsPanel } from '../../components/admin/AcademyVideoSettingsPanel';
import { supabase } from '../../lib/supabase';
import {
  adminSecurityPolicyGet,
  adminSecurityPolicyPatch,
  platformSettingsGet,
  platformSettingsPatch,
  type AdminSecurityPolicy,
  type PlatformSettings,
} from '../../lib/platformClient';

export const AdminSettingsPage: React.FC = () => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [securityPolicy, setSecurityPolicy] = useState<AdminSecurityPolicy | null>(null);
  const [ipAllowlistText, setIpAllowlistText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const load = async () => {
      if (!accessToken) return;
      setError(null);
      try {
        const [settingsRes, securityRes] = await Promise.all([platformSettingsGet(accessToken), adminSecurityPolicyGet(accessToken)]);
        setSettings(settingsRes);
        setSecurityPolicy(securityRes);
        setIpAllowlistText((securityRes.ip_allowlist ?? []).join('\n'));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load settings');
      }
    };
    void load();
  }, [accessToken]);

  const save = async () => {
    if (!accessToken || !settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await platformSettingsPatch(accessToken, {
        writing_ai_enabled: settings.writing_ai_enabled,
        writing_ai_daily_limit: settings.writing_ai_daily_limit,
        student_center_enabled: settings.student_center_enabled,
        classroom_v2_enabled: settings.classroom_v2_enabled,
        academy_video_provider: settings.academy_video_provider,
        academy_video_uploads_enabled: settings.academy_video_uploads_enabled,
      });
      setSettings(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const saveSecurity = async () => {
    if (!accessToken || !securityPolicy) return;
    setSavingSecurity(true);
    setError(null);
    try {
      const allowlist = ipAllowlistText
        .split(/[\n,]/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
      const res = await adminSecurityPolicyPatch(accessToken, {
        session_timeout_minutes: securityPolicy.session_timeout_minutes,
        rate_limit_per_minute: securityPolicy.rate_limit_per_minute,
        ip_allowlist: allowlist,
      });
      setSecurityPolicy(res);
      setIpAllowlistText((res.ip_allowlist ?? []).join('\n'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save admin security');
    } finally {
      setSavingSecurity(false);
    }
  };

  if (!settings || !securityPolicy) {
    return (
      <AdminLayout>
        {error ? <div className="space-y-3">
          <p role="alert" className="text-sm text-red-700">Settings could not load. Retry when the service is available.</p>
          <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-gray-900 px-4 py-2 text-white">Retry loading settings</button>
        </div> : <div className="text-sm text-gray-600">Loading settings...</div>}
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
          <p className="text-sm text-gray-600">Release controls, AI limits, managed media, and system-level configuration.</p>
        </div>

        {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-900">
          Trial configuration has moved to{' '}
          <Link to="/admin/trials" className="font-semibold underline">
            Admin / Trials
          </Link>
          .
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
          <div className="text-sm font-semibold text-gray-900">Learning workspace release controls</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="rounded-xl border border-gray-200 p-3 inline-flex items-start gap-3 text-sm text-gray-700">
              <input type="checkbox" className="mt-1" checked={settings.student_center_enabled} onChange={(event) => setSettings((previous) => previous && { ...previous, student_center_enabled: event.target.checked })} />
              <span><strong className="block text-gray-900">Student Center</strong><span className="text-xs text-gray-600">Canonical cross-service learner command centre at /student-center.</span></span>
            </label>
            <label className="rounded-xl border border-gray-200 p-3 inline-flex items-start gap-3 text-sm text-gray-700">
              <input type="checkbox" className="mt-1" checked={settings.classroom_v2_enabled} onChange={(event) => setSettings((previous) => previous && { ...previous, classroom_v2_enabled: event.target.checked })} />
              <span><strong className="block text-gray-900">Classroom 2.0</strong><span className="text-xs text-gray-600">Role-safe course, live-session, work, progress, and people navigation.</span></span>
            </label>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={settings.writing_ai_enabled}
                onChange={(e) => setSettings((prev) => prev && { ...prev, writing_ai_enabled: e.target.checked })}
              />
              Writing AI enabled
            </label>
            <div>
              <label className="text-xs font-semibold text-gray-600">Writing AI daily limit</label>
              <input
                type="number"
                min={0}
                value={settings.writing_ai_daily_limit}
                onChange={(e) =>
                  setSettings((prev) => (prev ? { ...prev, writing_ai_daily_limit: Number(e.target.value) } : prev))
                }
                className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
              />
            </div>
          </div>
        </div>

        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold">
          {saving ? 'Saving...' : 'Save platform settings'}
        </button>

        {accessToken ? <AcademyVideoSettingsPanel
          accessToken={accessToken}
          globalEnabled={settings.academy_video_uploads_enabled}
          onGlobalEnabledChange={(enabled) => setSettings((previous) => previous && { ...previous, academy_video_uploads_enabled: enabled })}
        /> : null}

        <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
          <div className="text-sm font-semibold text-gray-900">Admin security policy</div>
          <div className="text-xs text-gray-600">
            MFA is {securityPolicy.require_mfa ? 'required' : 'optional'} under the saved admin policy. Saving these settings preserves that requirement.{' '}
            <Link to="/admin-mfa?returnTo=%2Fadmin%2Fsettings" className="underline">Manage your authenticator</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600">Admin idle timeout (minutes)</label>
              <input
                type="number"
                min={5}
                max={240}
                value={securityPolicy.session_timeout_minutes}
                onChange={(e) =>
                  setSecurityPolicy((prev) =>
                    prev ? { ...prev, session_timeout_minutes: Math.max(5, Math.min(240, Number(e.target.value) || 30)) } : prev,
                  )
                }
                className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Admin API rate limit (requests per minute)</label>
              <input
                type="number"
                min={10}
                max={2000}
                value={securityPolicy.rate_limit_per_minute}
                onChange={(e) =>
                  setSecurityPolicy((prev) =>
                    prev ? { ...prev, rate_limit_per_minute: Math.max(10, Math.min(2000, Number(e.target.value) || 120)) } : prev,
                  )
                }
                className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">IP allowlist (one per line or comma-separated, empty = allow all)</label>
            <textarea
              value={ipAllowlistText}
              onChange={(e) => setIpAllowlistText(e.target.value)}
              className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2 min-h-[120px] font-mono text-xs"
              placeholder={'203.0.113.10\\n203.0.113.0/24'}
            />
          </div>
          <button onClick={saveSecurity} disabled={savingSecurity} className="px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold">
            {savingSecurity ? 'Saving...' : 'Save admin security'}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
};
