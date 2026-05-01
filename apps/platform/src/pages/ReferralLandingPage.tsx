import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Link2, Users2 } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SiteHeader, type SiteHeaderAction, type SiteHeaderNavItem } from '../components/layout/SiteHeader';
import { referralsClaim } from '../lib/platformClient';
import { supabase } from '../lib/supabase';

const normalizeCode = (value?: string | null) => String(value ?? '').trim().toUpperCase();

export const ReferralLandingPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const code = useMemo(() => normalizeCode(params.code ?? searchParams.get('ref')), [params.code, searchParams]);

  useEffect(() => {
    if (!code) return;
    window.localStorage.setItem('schood:referral_code', code);

    const claimIfAuthed = async () => {
      setClaiming(true);
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        await referralsClaim(data.session.access_token, code).catch(() => null);
        setClaimed(true);
      }
      setClaiming(false);
    };

    void claimIfAuthed();
  }, [code]);

  const navItems: SiteHeaderNavItem[] = [
    { id: 'plans', label: 'Plans', onClick: () => navigate('/plans') },
    { id: 'candidate', label: 'Candidate', onClick: () => navigate('/candidate') },
    { id: 'partner', label: 'Partner Office', onClick: () => navigate('/partner') },
  ];

  const actions: SiteHeaderAction[] = [
    { id: 'login', label: 'Login', onClick: () => navigate(`/auth?mode=signin&ref=${encodeURIComponent(code)}&returnTo=${encodeURIComponent('/plans')}`) },
    { id: 'signup', label: 'Sign up', onClick: () => navigate(`/auth?mode=signup&ref=${encodeURIComponent(code)}&returnTo=${encodeURIComponent('/plans')}`), primary: true },
  ];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SiteHeader navItems={navItems} actions={actions} />
      <main className="px-6 py-12 md:px-10">
        <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl border border-gray-900 bg-white/85 p-6 shadow-sm md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-900 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-800">
              <Link2 className="h-4 w-4" />
              Referral link
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight md:text-5xl">
              Your Schood referral has been applied.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-gray-600">
              Continue with this link and the referral will stay attached through signup, login, and checkout. Any configured discount is applied by the active referral program.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => navigate(`/auth?mode=signup&ref=${encodeURIComponent(code)}&returnTo=${encodeURIComponent('/plans')}`)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white"
              >
                Create account
                <ArrowUpRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => navigate(`/plans?ref=${encodeURIComponent(code)}`)}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-900 bg-white/80 px-5 py-3 text-sm font-semibold text-gray-900"
              >
                View plans
              </button>
            </div>
          </div>

          <aside className="rounded-3xl border border-gray-900 bg-[#0f172a] p-6 text-white shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <Users2 className="h-4 w-4" />
              Affiliate code
            </div>
            <p className="mt-4 break-all font-mono text-3xl font-bold">{code || 'MISSING'}</p>
            <div className="mt-6 rounded-2xl border border-white/15 bg-white/10 p-4">
              <div className="flex items-center gap-2 text-sm text-white/80">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                {claimed ? 'Referral claimed on your account.' : claiming ? 'Checking your account...' : 'Saved for your next checkout.'}
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
};
