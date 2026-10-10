import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CircleAlert, CreditCard, LogOut, Trash2, User2 } from 'lucide-react';
import { edgeBase, supabase } from '../lib/supabase';
import { fetchAuthProviderAvailability, hasProviderIdentity, TELEGRAM_AUTH_PROVIDER } from '../lib/authProviders';

// Telegram account-link card

const TelegramLinkCard: React.FC<{ acquisitionSessionId?: string | null }> = ({ acquisitionSessionId }) => {
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [alreadyLinked, setAlreadyLinked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loginLinked, setLoginLinked] = useState(false);
  const [loginReady, setLoginReady] = useState<boolean | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      supabase.auth.getUser(),
      fetchAuthProviderAvailability(controller.signal).catch(() => null),
    ]).then(([userResult, availability]) => {
      if (controller.signal.aborted) return;
      setLoginLinked(hasProviderIdentity(userResult.data.user?.identities, TELEGRAM_AUTH_PROVIDER));
      setLoginReady(availability?.telegram ?? null);
    });
    return () => controller.abort();
  }, []);

  const enableTelegramLogin = async () => {
    setLoginBusy(true);
    setLoginError(null);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: TELEGRAM_AUTH_PROVIDER,
        options: {
          redirectTo: `${window.location.origin}/account?telegram=login-linked`,
          scopes: 'openid profile phone telegram:bot_access',
        },
      });
      if (error) throw error;
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Could not enable Telegram sign-in.');
      setLoginBusy(false);
    }
  };

  const generate = async () => {
    setLoading(true);
    setLinkError(null);
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    try {
      const res = await fetch(`${edgeBase}/telegram-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', acquisition_session_id: acquisitionSessionId || undefined }),
      }).then((r) => r.json());
      if (res.link_url) {
        setLinkUrl(res.link_url);
        setLinkToken(res.token ?? null);
        setAlreadyLinked(res.already_linked ?? false);
      } else {
        setLinkError(String(res.error ?? 'Could not generate a Telegram link.'));
      }
    } finally { setLoading(false); }
  };

  const confirm = async () => {
    if (!linkToken) return;
    setLoading(true);
    setLinkError(null);
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setLoading(false); return; }
    try {
      const response = await fetch(`${edgeBase}/telegram-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', token: linkToken }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) setLinkError(String(result.error ?? 'Telegram link is not ready to confirm.'));
      else setConfirmed(true);
    } finally { setLoading(false); }
  };

  const copy = () => { if (linkUrl) { navigator.clipboard.writeText(linkUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } };

  return (
    <div className="rounded-3xl border border-blue-200 bg-blue-50/70 p-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-2">Telegram</div>
      <div className="text-lg font-bold text-gray-900 mb-1">Telegram sign-in</div>
      <p className="text-sm text-gray-600 mb-3">
        Link your verified Telegram identity so you can sign in without another password. Your email remains the recovery identity.
      </p>
      {loginLinked ? (
        <div className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">Telegram sign-in is enabled.</div>
      ) : (
        <button
          type="button"
          onClick={() => void enableTelegramLogin()}
          disabled={loginBusy || loginReady === false}
          className="px-4 py-2 rounded-full bg-gray-950 text-white text-sm font-semibold hover:bg-black disabled:opacity-50"
        >
          {loginBusy ? 'Connecting…' : 'Enable Telegram sign-in'}
        </button>
      )}
      {loginReady === false ? <p className="mt-2 text-xs text-amber-700">Telegram OIDC credentials still need production configuration.</p> : null}
      {loginError ? <div className="mt-2 text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">{loginError}</div> : null}

      <div className="my-5 h-px bg-blue-200" />
      <div className="text-lg font-bold text-gray-900 mb-1">{acquisitionSessionId ? 'Save your Telegram study journey' : 'Telegram notifications'}</div>
      <p className="text-sm text-gray-600 mb-4">
        {acquisitionSessionId
          ? 'Link once to preserve your plan and continue from the same point tomorrow.'
          : 'Get score results, assignment reminders, certificates, and class schedules directly in Telegram. Also run vocab drills from the chat.'}
      </p>
      {!linkUrl ? (
        <button onClick={generate} disabled={loading} className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Generating…' : 'Link Telegram'}
        </button>
      ) : (
        <div className="space-y-3">
          {alreadyLinked ? <div className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2">A Telegram account is already linked. Unlink it first if you intend to change accounts.</div> : null}
          {confirmed ? <div className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">Telegram account linked safely.</div> : null}
          {linkError ? <div className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">{linkError}</div> : null}
          <a href={linkUrl} target="_blank" rel="noreferrer" className="block w-full text-center px-4 py-2.5 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">
            Open in Telegram
          </a>
          {!acquisitionSessionId && !confirmed ? (
            <button onClick={confirm} disabled={loading} className="w-full px-4 py-2.5 rounded-full bg-gray-950 text-white text-sm font-semibold disabled:opacity-50">
              {loading ? 'Checking…' : 'Confirm after opening Telegram'}
            </button>
          ) : null}
          <button onClick={copy} className="w-full px-4 py-2 rounded-full border border-blue-300 text-sm text-blue-700 hover:bg-blue-100">
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <p className="text-xs text-gray-400">Link expires in 15 minutes. Generate a new one if it expires.</p>
        </div>
      )}
    </div>
  );
};
import { getMe, type MeResponse } from '../lib/platformClient';
import { filterVisibleProducts, productSlug } from '../lib/productVisibility';
import { isExternalUrl, sanitizeReturnTo } from '../lib/returnTo';
import { SiteHeader, type SiteHeaderAction, type SiteHeaderNavItem } from '../components/layout/SiteHeader';
import { useI18n } from '../i18n';
import { AccountDeletionError, deleteOwnAccount } from '../lib/accountDeletion';

type ProductRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
};

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

const fmt = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

export const AccountPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const returnTo = useMemo(() => sanitizeReturnTo(new URLSearchParams(location.search).get('returnTo')), [location.search]);
  const acquisitionSessionId = useMemo(() => new URLSearchParams(location.search).get('acquisition_session_id'), [location.search]);
  const authReturnTo = useMemo(() => `${location.pathname}${location.search}`, [location.pathname, location.search]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [email, setEmail] = useState<string | null>(null);
  const [accountUserId, setAccountUserId] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [role, setRole] = useState<string>('user');
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [entitlements, setEntitlements] = useState<MeResponse['entitlements']>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const toFriendlyError = useCallback((err: unknown, fallback: string): string => {
    const status = (err as { status?: number } | null)?.status;
    const message = err instanceof Error ? err.message : '';
    if (status === 401 || status === 403) return t('account.error.sessionExpired');
    if (message.toLowerCase().includes('invalid jwt') || message.toLowerCase().includes('unauthorized')) {
      return t('account.error.sessionExpired');
    }
    return fallback;
  }, [t]);

  const productMap = useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const productEntitlements = useMemo(() => {
    return (entitlements ?? [])
      .filter((e) => e.resource_type === 'product' && e.resource_id)
      .map((e) => ({ entitlement: e, product: e.resource_id ? productMap.get(e.resource_id) ?? null : null }));
  }, [entitlements, productMap]);

  const visibleProductEntitlements = useMemo(() => {
    return productEntitlements.filter(
      (item): item is { entitlement: MeResponse['entitlements'][number]; product: ProductRow } => !!item.product,
    );
  }, [productEntitlements]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      setProfileError(null);
      setProfileSaved(false);

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate(`/auth?returnTo=${encodeURIComponent(authReturnTo)}`, { replace: true });
        return;
      }

      try {
        const [me, productsRes, profileRes] = await Promise.all([
          getMe(data.session.access_token),
          supabase
            .from('products')
            .select('id,name,type,status,description,metadata')
            .eq('status', 'active')
            .order('name', { ascending: true }),
          supabase.from('user_profiles').select('user_id, first_name, last_name, phone').eq('user_id', data.session.user.id).maybeSingle(),
        ]);

        if (productsRes.error) throw productsRes.error;
        if (profileRes.error) throw profileRes.error;

        if (me.user.id !== data.session.user.id) throw new Error('Account changed');
        setAccountUserId(data.session.user.id);
        setEmail(data.session.user.email ?? me.user.email ?? null);
        setRole(String(me.user.role ?? 'user'));
        setTenantName(me.current_tenant?.name ?? null);
        setEntitlements(me.entitlements ?? []);
        setProducts(filterVisibleProducts((productsRes.data ?? []) as ProductRow[]));

        const profile = (profileRes.data ?? null) as ProfileRow | null;
        const um = (data.session?.user?.user_metadata ?? {}) as Record<string, unknown>;
        const metaFirst = typeof um.first_name === 'string' ? um.first_name.trim() : '';
        const metaLast = typeof um.last_name === 'string' ? um.last_name.trim() : '';
        const metaPhone = typeof um.phone === 'string' ? um.phone.trim() : '';

        setFirstName(profile?.first_name ?? metaFirst ?? '');
        setLastName(profile?.last_name ?? metaLast ?? '');
        setPhone(profile?.phone ?? metaPhone ?? '');
      } catch (e) {
        const friendly = toFriendlyError(e, t('account.error.load'));
        setError(friendly);
        if (friendly.toLowerCase().includes('session expired')) {
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {
            // ignore sign-out failures
          }
          navigate(`/auth?returnTo=${encodeURIComponent(authReturnTo)}`, { replace: true });
          return;
        }
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [authReturnTo, navigate, returnTo, t, toFriendlyError]);

  const isAdmin = String(role ?? '').toLowerCase() === 'admin';

  const goPricing = (product?: ProductRow | null) => {
    const qs = new URLSearchParams();
    if (product) qs.set('product', productSlug(product));
    qs.set('returnTo', returnTo);
    navigate(`/pricing?${qs.toString()}`);
  };

  const saveProfile = async () => {
    setProfileError(null);
    setProfileSaved(false);
    setSaving(true);

    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error(t('account.error.sessionExpired'));
      if (!mounted.current || data.session.user.id !== accountUserId) throw new Error(t('account.error.changed'));

      const payload: ProfileRow = {
        user_id: data.session.user.id,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
      };

      const { error: upErr } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' });
      if (upErr) throw upErr;
      const { data: current } = await supabase.auth.getSession();
      if (!mounted.current || current.session?.user.id !== accountUserId) return;
      setProfileSaved(true);
    } catch (e) {
      if (mounted.current) setProfileError(toFriendlyError(e, t('account.error.save')));
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore sign-out failures
    }
    navigate('/', { replace: true });
  };

  const navItems: SiteHeaderNavItem[] = [
    { id: 'home', label: t('nav.home'), onClick: () => navigate('/') },
    { id: 'learning', label: t('studentCenter.label'), onClick: () => navigate('/student-center') },
    { id: 'plans', label: t('nav.plans'), onClick: () => navigate('/plans') },
    { id: 'pricing', label: t('nav.pricing'), onClick: () => navigate('/pricing') },
    { id: 'contact', label: t('nav.contact'), onClick: () => navigate('/contact') },
    { id: 'account', label: t('common.account'), onClick: () => navigate('/account'), active: true },
  ];

  const headerActions: SiteHeaderAction[] = [
    { id: 'signout', label: t('common.signOut'), onClick: () => void signOut() },
  ];

  const deleteAccount = async () => {
    if (!email || !accountUserId) return;
    if (deleteConfirm.trim().toLowerCase() !== email.trim().toLowerCase()) return;

    setSaving(true);
    setError(null);

    try {
      await deleteOwnAccount(supabase, accountUserId, deleteConfirm, () => mounted.current);
      const { data: current } = await supabase.auth.getSession();
      if (!mounted.current || (current.session && current.session.user.id !== accountUserId)) return;

      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // ignore sign-out failures
      }
      navigate('/', { replace: true });
    } catch (e) {
      if (!mounted.current) return;
      const { data: current } = await supabase.auth.getSession();
      if (!mounted.current || current.session?.user.id !== accountUserId) return;
      const friendly = e instanceof AccountDeletionError && e.code === 'account_changed'
        ? t('account.error.changed') : e instanceof AccountDeletionError && e.code === 'session_required'
          ? t('account.error.sessionExpired') : e instanceof AccountDeletionError && e.code === 'ownership_transfer_required'
            ? t('account.error.ownershipTransfer') : e instanceof AccountDeletionError && e.code === 'billing_review_required'
              ? t('account.error.billingReview') : t('account.error.delete');
      setError(friendly);
    } finally {
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SiteHeader navItems={navItems} actions={headerActions} />

      <main className="px-6 md:px-10 py-10">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="rounded-3xl border border-gray-900 bg-white/85 p-8">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold text-gray-600">{t('account.header.label')}</div>
                <h1 className="text-3xl md:text-4xl font-bold mt-2">{t('account.header.title')}</h1>
                <p className="text-gray-600 mt-2">{t('account.header.desc')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (isExternalUrl(returnTo)) navigate(`/auth?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
                  else navigate(returnTo, { replace: true });
                }}
                className="px-4 py-2 rounded-full border border-gray-900 bg-white/70 text-sm font-semibold"
              >
                Back
              </button>
            </div>
          </div>

          {loading ? <div className="text-gray-600">{t('account.loading')}</div> : null}
          {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</div> : null}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 space-y-6">
              <div className="rounded-3xl border border-gray-900 bg-white/85 p-6">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  <User2 size={14} /> {t('account.profile.label')}
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-gray-600">{t('account.profile.firstName')}</label>
                    <input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="mt-2 w-full border border-gray-900/30 rounded-2xl px-4 py-3 bg-white"
                      placeholder={t('account.profile.firstNamePlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600">{t('account.profile.lastName')}</label>
                    <input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="mt-2 w-full border border-gray-900/30 rounded-2xl px-4 py-3 bg-white"
                      placeholder={t('account.profile.lastNamePlaceholder')}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-gray-600">{t('account.profile.phone')}</label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="mt-2 w-full border border-gray-900/30 rounded-2xl px-4 py-3 bg-white"
                      placeholder={t('account.profile.phonePlaceholder')}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs font-semibold text-gray-600">{t('account.profile.email')}</label>
                    <div className="mt-2 w-full border border-gray-900/20 rounded-2xl px-4 py-3 bg-gray-100 text-gray-600">
                      {email ?? t('common.na')}
                    </div>
                  </div>
                </div>

                {profileError ? (
                  <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{profileError}</div>
                ) : null}
                {profileSaved ? (
                  <div className="mt-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    {t('account.profile.saved')}
                  </div>
                ) : null}

                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="px-5 py-2.5 rounded-full bg-[#0f172a] text-white font-semibold"
                  >
                    {t('account.profile.saveChanges')}
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-900 bg-white/85 p-6">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  <CreditCard size={14} /> {t('account.access.label')}
                </div>
                <div className="mt-2 text-lg font-bold">{t('account.access.title')}</div>
                <div className="text-sm text-gray-600 mt-1">{t('account.access.desc')}</div>

                {visibleProductEntitlements.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {visibleProductEntitlements.map(({ entitlement, product }) => (
                      <div key={entitlement.id} className="rounded-2xl border border-gray-900/15 bg-white p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <div className="font-semibold text-gray-900">{product.name}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {entitlement.ends_at
                                ? t('account.access.activeUntil', { date: fmt(entitlement.ends_at) || t('common.na') })
                                : t('account.access.activeNoExpiry')}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => goPricing(product)}
                            className="px-4 py-2 rounded-full border border-gray-900 text-sm font-semibold"
                          >
                            {t('account.access.managePlan')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {visibleProductEntitlements.length === 0 && products.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {products.map((product) => (
                      <div key={product.id} className="rounded-2xl border border-gray-900/15 bg-white p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <div className="font-semibold text-gray-900">{product.name}</div>
                            <div className="text-sm text-gray-600 mt-1">{product.description ?? t('account.access.exploreService')}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => goPricing(product)}
                            className="px-4 py-2 rounded-full border border-gray-900 text-sm font-semibold"
                          >
                            {t('account.access.viewPlans')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-3xl border border-gray-900 bg-white/85 p-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-600">{t('account.notifications.label')}</div>
                <div className="mt-2 text-lg font-bold">{t('account.notifications.title')}</div>
                <div className="text-sm text-gray-600 mt-1">
                  {t('account.notifications.desc')}
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/updates')}
                  className="mt-4 px-4 py-2 rounded-full border border-gray-900 text-sm font-semibold"
                >
                  {t('account.notifications.open')}
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-6">
              <div className="rounded-3xl border border-gray-900 bg-white/85 p-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-600">{t('account.meta.label')}</div>
                <div className="mt-3 text-lg font-bold text-gray-900">{email ?? t('common.na')}</div>
                <div className="mt-2 text-sm text-gray-600">{t('account.meta.role', { role: isAdmin ? t('account.role.admin') : t('account.role.user') })}</div>
                <div className="text-sm text-gray-600">{t('account.meta.tenant', { tenant: tenantName ?? t('common.na') })}</div>
                <button
                  onClick={signOut}
                  className="mt-4 px-4 py-2 rounded-full border border-gray-900 text-sm font-semibold flex items-center gap-2"
                >
                  <LogOut size={16} /> {t('common.signOut')}
                </button>
                <button
                  onClick={() => navigate('/contact')}
                  className="mt-2 px-4 py-2 rounded-full border border-gray-900 text-sm font-semibold"
                >
                  {t('common.contactSupport')}
                </button>
              </div>

              <TelegramLinkCard acquisitionSessionId={acquisitionSessionId} />


              <div className="rounded-3xl border border-red-300 bg-red-50/70 p-6">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-700">
                  <CircleAlert size={14} /> {t('account.danger.label')}
                </div>
                <div className="mt-3 text-lg font-bold text-red-800">{t('account.danger.title')}</div>
                <p className="text-sm text-red-700 mt-2">
                  {t('account.danger.desc')}
                </p>
                <div className="mt-4">
                  <label htmlFor="delete-account-email" className="text-xs font-semibold text-red-700">{t('account.danger.confirmLabel')}</label>
                  <input
                    id="delete-account-email"
                    type="email"
                    autoComplete="off"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    className="mt-2 w-full border border-red-300 rounded-2xl px-4 py-3 bg-white"
                    placeholder={email ?? t('account.danger.confirmPlaceholder')}
                  />
                </div>
                <button
                  onClick={deleteAccount}
                  disabled={saving || !email || deleteConfirm.trim().toLowerCase() !== (email ?? '').trim().toLowerCase()}
                  className="mt-4 w-full px-4 py-2.5 rounded-full bg-red-600 text-white font-semibold flex items-center justify-center gap-2 disabled:bg-red-300"
                >
                  <Trash2 size={16} /> {t('account.danger.delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
