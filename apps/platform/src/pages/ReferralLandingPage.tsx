import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, GraduationCap, Link2, Sparkles, Users2 } from 'lucide-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SiteHeader, type SiteHeaderAction, type SiteHeaderNavItem } from '../components/layout/SiteHeader';
import { referralsClaim } from '../lib/platformClient';
import { buildReferralContext, normalizeReferralCode, storeReferral } from '../lib/referralContext';
import { supabase } from '../lib/supabase';

export const ReferralLandingPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const code = useMemo(() => normalizeReferralCode(params.code ?? searchParams.get('ref')), [params.code, searchParams]);
  const source = useMemo(() => String(searchParams.get('source') ?? 'rewards').trim().toLowerCase(), [searchParams]);
  const service = useMemo(() => String(searchParams.get('service') ?? 'platform').trim().toLowerCase(), [searchParams]);
  const audience = useMemo(() => String(searchParams.get('audience') ?? 'learner').trim().toLowerCase(), [searchParams]);
  const servicePath = useMemo(() => {
    if (service === 'ielts') return '/ielts';
    if (service === 'sat') return '/sat';
    if (service === 'toefl') return '/toefl';
    if (service === 'academy' || audience === 'center' || audience === 'teacher') return '/education-centers';
    return '/plans';
  }, [audience, service]);

  const actions: SiteHeaderAction[] = [
    { id: 'login', label: 'Login', onClick: () => navigate(`/auth?mode=signin&ref=${encodeURIComponent(code)}&returnTo=${encodeURIComponent(servicePath)}`) },
    { id: 'signup', label: 'Sign up', onClick: () => navigate(`/auth?mode=signup&ref=${encodeURIComponent(code)}&returnTo=${encodeURIComponent(servicePath)}`), primary: true },
  ];

  useEffect(() => {
    if (!code) return;
    const context = buildReferralContext(location.pathname, location.search, code);
    storeReferral(code, context);

    const claimIfAuthed = async () => {
      setClaiming(true);
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        await referralsClaim(data.session.access_token, code, context).catch(() => null);
        setClaimed(true);
      }
      setClaiming(false);
    };

    void claimIfAuthed();
  }, [code, location.pathname, location.search]);

  const navItems: SiteHeaderNavItem[] = [
    { id: 'plans', label: 'Plans', onClick: () => navigate('/plans') },
    { id: 'candidate', label: 'Candidate', onClick: () => navigate('/candidate') },
    { id: 'partner', label: 'Partner Office', onClick: () => navigate('/partner') },
  ];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SiteHeader navItems={navItems} actions={actions} />
      <main className="px-6 py-10 md:px-10">
        <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="overflow-hidden rounded-3xl border border-gray-900 bg-white shadow-sm">
            <div className="bg-[#0f172a] px-6 py-8 text-white md:px-10 md:py-12">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white/75">
                <Sparkles className="h-4 w-4" />
                {source === 'affiliate' ? 'Schood Affiliate' : 'Schood Rewards'}
              </div>
              <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight md:text-5xl">
                Your Schood invite is ready.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/72">
                {source === 'affiliate'
                  ? 'This affiliate code is attached to your browser now. If the account and eligible purchase qualify, the conversion stays traceable through payout settlement.'
                  : 'This code is attached to your browser now. Sign up, explore the right service, and any active referral discount will follow you into eligible checkout.'}
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => navigate(`/auth?mode=signup&ref=${encodeURIComponent(code)}&returnTo=${encodeURIComponent(servicePath)}`)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#b6f24a] px-5 py-3 text-sm font-bold text-gray-950 transition hover:bg-[#c8ff65]"
                >
                  Create account
                  <ArrowUpRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`${servicePath}?ref=${encodeURIComponent(code)}&source=rewards`)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  Continue exploring
                </button>
              </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-3 md:p-6">
              <div className="rounded-2xl border border-gray-900/10 bg-[#fff7dd] p-4">
                <Link2 className="h-5 w-5 text-gray-700" />
                <p className="mt-3 font-semibold">Code saved</p>
                <p className="mt-1 text-sm leading-6 text-gray-600">Your referral code stays available through signup and checkout.</p>
              </div>
              <div className="rounded-2xl border border-gray-900/10 bg-[#e9f9ff] p-4">
                <GraduationCap className="h-5 w-5 text-gray-700" />
                <p className="mt-3 font-semibold">Right path</p>
                <p className="mt-1 text-sm leading-6 text-gray-600">This invite can point to learners, teachers, centers, or academy operators.</p>
              </div>
              <div className="rounded-2xl border border-gray-900/10 bg-[#eef9df] p-4">
                <CheckCircle2 className="h-5 w-5 text-gray-700" />
                <p className="mt-3 font-semibold">Reward tracked</p>
                <p className="mt-1 text-sm leading-6 text-gray-600">Eligible purchases can trigger the configured Schood Rewards credit or payout.</p>
              </div>
            </div>
          </div>

          <aside className="rounded-3xl border border-gray-900 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              <Users2 className="h-4 w-4" />
              Referral code
            </div>
            <p className="mt-4 break-all font-mono text-4xl font-bold">{code || 'MISSING'}</p>
            <div className="mt-6 rounded-2xl border border-gray-900/10 bg-gray-50 p-4">
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {claimed ? 'Referral claimed on your account.' : claiming ? 'Checking your account...' : 'Saved for your next checkout.'}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-gray-900/10 bg-[#0f172a] p-4 text-white">
                <p className="text-white/55">Audience</p>
                <p className="mt-1 font-semibold capitalize">{audience}</p>
              </div>
              <div className="rounded-2xl border border-gray-900/10 bg-[#b6f24a] p-4 text-gray-950">
                <p className="text-gray-700">Service</p>
                <p className="mt-1 font-semibold capitalize">{service}</p>
              </div>
              <div className="col-span-2 rounded-2xl border border-gray-900/10 bg-gray-50 p-4 text-gray-900">
                <p className="text-gray-500">Source</p>
                <p className="mt-1 font-semibold capitalize">{source}</p>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
};
