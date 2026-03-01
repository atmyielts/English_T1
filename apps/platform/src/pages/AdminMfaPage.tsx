import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { KeyRound, QrCode, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getMe } from '../lib/platformClient';
import { sanitizeReturnTo } from '../lib/returnTo';

type MfaFactor = {
  id: string;
  factor_type?: string | null;
  status?: string | null;
  friendly_name?: string | null;
};

const flattenMfaFactors = (raw: unknown): MfaFactor[] => {
  if (!raw || typeof raw !== 'object') return [];
  const rawAll = (raw as Record<string, unknown>).all;
  if (!Array.isArray(rawAll)) return [];
  return rawAll.filter((entry): entry is MfaFactor => !!entry && typeof entry === 'object' && 'id' in (entry as Record<string, unknown>));
};

export const AdminMfaPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = useMemo(() => sanitizeReturnTo(new URLSearchParams(location.search).get('returnTo') ?? '/admin'), [location.search]);

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [currentAal, setCurrentAal] = useState<string | null>(null);
  const [nextAal, setNextAal] = useState<string | null>(null);
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [selectedFactorId, setSelectedFactorId] = useState('');

  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [pendingQrSvg, setPendingQrSvg] = useState<string | null>(null);
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);

  const [verifyCode, setVerifyCode] = useState('');
  const [enrollCode, setEnrollCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [removingFactorId, setRemovingFactorId] = useState<string | null>(null);
  const [loadingMfa, setLoadingMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadMfaState = async () => {
    setLoadingMfa(true);
    setError(null);
    try {
      const mfaClient = (supabase.auth as any).mfa;
      if (!mfaClient) throw new Error('MFA client is not available');
      const [listRes, aalRes] = await Promise.all([
        mfaClient.listFactors(),
        mfaClient.getAuthenticatorAssuranceLevel(),
      ]);
      if (listRes?.error) throw listRes.error;
      if (aalRes?.error) throw aalRes.error;
      const nextFactors = flattenMfaFactors(listRes?.data);
      setFactors(nextFactors);
      setCurrentAal(typeof aalRes?.data?.currentLevel === 'string' ? aalRes.data.currentLevel : null);
      setNextAal(typeof aalRes?.data?.nextLevel === 'string' ? aalRes.data.nextLevel : null);
      setSelectedFactorId((prev) => {
        if (prev && nextFactors.some((factor) => factor.id === prev)) return prev;
        return nextFactors[0]?.id ?? '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MFA status');
    } finally {
      setLoadingMfa(false);
    }
  };

  useEffect(() => {
    const metaName = 'robots';
    const existing = document.querySelector(`meta[name="${metaName}"]`) as HTMLMetaElement | null;
    const previous = existing?.content ?? null;
    const created = existing ?? document.createElement('meta');
    created.setAttribute('name', metaName);
    created.setAttribute('content', 'noindex, nofollow');
    if (!existing) document.head.appendChild(created);
    return () => {
      if (!existing) {
        created.remove();
      } else if (previous != null) {
        existing.setAttribute('content', previous);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ensure = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        navigate(`/auth?returnTo=${encodeURIComponent(`/admin-mfa?returnTo=${encodeURIComponent(returnTo)}`)}`, { replace: true });
        return;
      }

      try {
        const me = await getMe(session.access_token, { force: true });
        const role = String(me.user.role ?? '').toLowerCase();
        const isAdmin = Boolean(me.admin?.is_admin) || role === 'admin' || role.startsWith('admin_');
        if (!isAdmin) {
          navigate(`/account?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
          return;
        }
        if (!cancelled) {
          setAllowed(true);
          await loadMfaState();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to verify admin access');
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    };
    void ensure();
    return () => {
      cancelled = true;
    };
  }, [navigate, returnTo]);

  const startEnrollment = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const mfaClient = (supabase.auth as any).mfa;
      const { data, error: enrollError } = await mfaClient.enroll({
        factorType: 'totp',
        friendlyName: `Schood Admin (${new Date().toLocaleDateString()})`,
      });
      if (enrollError) throw enrollError;
      const factorId = typeof data?.id === 'string' ? data.id : null;
      if (!factorId) throw new Error('Failed to start enrollment');
      setPendingFactorId(factorId);
      setPendingQrSvg(typeof data?.totp?.qr_code === 'string' ? data.totp.qr_code : null);
      setPendingSecret(typeof data?.totp?.secret === 'string' ? data.totp.secret : null);
      setEnrollCode('');
      setNotice('Scan QR code, then verify with a 6-digit code.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start MFA enrollment');
    } finally {
      setBusy(false);
    }
  };

  const verifyEnrollment = async () => {
    if (!pendingFactorId || enrollCode.trim().length < 6) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const mfaClient = (supabase.auth as any).mfa;
      const { data: challengeData, error: challengeError } = await mfaClient.challenge({ factorId: pendingFactorId });
      if (challengeError) throw challengeError;
      const challengeId = typeof challengeData?.id === 'string' ? challengeData.id : null;
      if (!challengeId) throw new Error('Could not start MFA challenge');
      const { error: verifyError } = await mfaClient.verify({
        factorId: pendingFactorId,
        challengeId,
        code: enrollCode.trim(),
      });
      if (verifyError) throw verifyError;
      setPendingFactorId(null);
      setPendingQrSvg(null);
      setPendingSecret(null);
      setEnrollCode('');
      setNotice('MFA setup complete. Session elevated to AAL2.');
      await loadMfaState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify enrollment code');
    } finally {
      setBusy(false);
    }
  };

  const verifyExistingFactor = async () => {
    if (!selectedFactorId || verifyCode.trim().length < 6) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const mfaClient = (supabase.auth as any).mfa;
      const { data: challengeData, error: challengeError } = await mfaClient.challenge({ factorId: selectedFactorId });
      if (challengeError) throw challengeError;
      const challengeId = typeof challengeData?.id === 'string' ? challengeData.id : null;
      if (!challengeId) throw new Error('Could not create MFA challenge');
      const { error: verifyError } = await mfaClient.verify({
        factorId: selectedFactorId,
        challengeId,
        code: verifyCode.trim(),
      });
      if (verifyError) throw verifyError;
      setVerifyCode('');
      setNotice('Session elevated to AAL2. You can continue to admin.');
      await loadMfaState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify MFA code');
    } finally {
      setBusy(false);
    }
  };

  const removeFactor = async (factorId: string) => {
    setRemovingFactorId(factorId);
    setError(null);
    setNotice(null);
    try {
      const mfaClient = (supabase.auth as any).mfa;
      const { error: removeError } = await mfaClient.unenroll({ factorId });
      if (removeError) throw removeError;
      setNotice('Authenticator removed.');
      if (selectedFactorId === factorId) setSelectedFactorId('');
      await loadMfaState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove authenticator');
    } finally {
      setRemovingFactorId(null);
    }
  };

  if (checkingAccess) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">Checking admin MFA access...</div>;
  }

  if (!allowed) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-2">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wide font-semibold text-gray-500">
            <ShieldCheck size={14} /> Admin security
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Admin MFA verification</h1>
          <p className="text-sm text-gray-600">This page is only for admin authentication (AAL2) before entering `/admin`.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Current AAL</div>
              <div className="text-sm font-semibold text-gray-900">{currentAal ?? 'unknown'}</div>
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Next AAL</div>
              <div className="text-sm font-semibold text-gray-900">{nextAal ?? 'unknown'}</div>
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <div className="text-xs text-gray-500">Factors</div>
              <div className="text-sm font-semibold text-gray-900">{factors.length}</div>
            </div>
          </div>

          {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}
          {notice ? <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{notice}</div> : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadMfaState()}
              disabled={busy || loadingMfa}
              className="px-4 py-2 rounded-full border border-gray-900 text-sm font-semibold disabled:opacity-60"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              disabled={currentAal !== 'aal2'}
              className="px-4 py-2 rounded-full bg-[#0f172a] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
            >
              <KeyRound size={15} /> Continue to admin
            </button>
          </div>
        </div>

        {factors.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Verify existing authenticator</h2>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px_auto] gap-2">
              <select
                value={selectedFactorId}
                onChange={(event) => setSelectedFactorId(event.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2"
              >
                {factors.map((factor) => (
                  <option key={factor.id} value={factor.id}>
                    {factor.friendly_name ?? factor.factor_type ?? 'Authenticator'} ({factor.status ?? 'unknown'})
                  </option>
                ))}
              </select>
              <input
                value={verifyCode}
                onChange={(event) => setVerifyCode(event.target.value)}
                placeholder="6-digit code"
                className="border border-gray-200 rounded-xl px-3 py-2"
              />
              <button
                type="button"
                onClick={() => void verifyExistingFactor()}
                disabled={busy || verifyCode.trim().length < 6 || !selectedFactorId}
                className="px-4 py-2 rounded-xl bg-[#0f172a] text-white text-sm font-semibold disabled:opacity-60"
              >
                Verify
              </button>
            </div>
          </div>
        ) : null}

        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Enroll authenticator app</h2>
          <p className="text-sm text-gray-600">
            You can enroll multiple authenticator apps. Add a new one, verify it, then remove old factors below.
          </p>
          <button
            type="button"
            onClick={() => void startEnrollment()}
            disabled={busy}
            className="px-4 py-2 rounded-full border border-gray-900 text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
          >
            <QrCode size={15} /> Add authenticator
          </button>

          {pendingFactorId ? (
            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm text-gray-600">Scan this QR code with Google Authenticator, Authy, 1Password, then verify.</p>
              {pendingQrSvg ? <div className="inline-block rounded-lg border border-gray-200 p-2" dangerouslySetInnerHTML={{ __html: pendingQrSvg }} /> : null}
              {pendingSecret ? (
                <div className="text-xs text-gray-600">
                  Manual key: <span className="font-mono text-gray-800 break-all">{pendingSecret}</span>
                </div>
              ) : null}
              <div className="grid grid-cols-1 sm:grid-cols-[160px_auto] gap-2">
                <input
                  value={enrollCode}
                  onChange={(event) => setEnrollCode(event.target.value)}
                  placeholder="6-digit code"
                  className="border border-gray-200 rounded-xl px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => void verifyEnrollment()}
                  disabled={busy || enrollCode.trim().length < 6}
                  className="px-4 py-2 rounded-xl bg-[#0f172a] text-white text-sm font-semibold disabled:opacity-60"
                >
                  Verify setup
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {factors.length > 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Enrolled authenticators</h2>
            <div className="space-y-2">
              {factors.map((factor) => (
                <div key={factor.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2">
                  <div className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">{factor.friendly_name ?? factor.factor_type ?? 'Authenticator'}</span>{' '}
                    <span className="text-gray-500">({factor.status ?? 'unknown'})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeFactor(factor.id)}
                    disabled={busy || loadingMfa || removingFactorId === factor.id}
                    className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-sm font-medium disabled:opacity-60"
                  >
                    {removingFactorId === factor.id ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
