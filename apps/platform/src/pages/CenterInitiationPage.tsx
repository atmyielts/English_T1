import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Building2, CheckCircle2, ClipboardList, ShieldCheck, WalletCards, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SiteHeader, type SiteHeaderNavItem } from '../components/layout/SiteHeader';
import { getAuthSession } from '../lib/supabase';
import { partnerOfficeCenter } from '../lib/platformClient';

const panelClass = 'rounded-3xl border border-gray-900 bg-white/85 shadow-sm';
const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[#0f172a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black';
const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full border border-gray-900 bg-white/80 px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-white';

export const CenterInitiationPage: React.FC = () => {
  const navigate = useNavigate();
  const [checkingCenter, setCheckingCenter] = useState(true);
  const navItems: SiteHeaderNavItem[] = [
    { id: 'redeem', label: 'Redeem code', onClick: () => navigate('/redeem') },
    { id: 'plans', label: 'Plans', onClick: () => navigate('/plans') },
    { id: 'contact', label: 'Contact', onClick: () => navigate('/contact') },
  ];
  const steps: Array<{ title: string; note: string; icon: LucideIcon }> = [
    { title: 'Apply', note: 'Submit center details and contact information.', icon: Building2 },
    { title: 'Approval', note: 'Schood verifies the center and assigns pricing.', icon: ShieldCheck },
    { title: 'Wallet and codes', note: 'Top up, buy packs, and generate voucher batches.', icon: WalletCards },
    { title: 'Reports', note: 'Teachers track usage, results, and inactive students.', icon: ClipboardList },
  ];

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const session = await getAuthSession();
        if (!session?.access_token) return;
        const res = await partnerOfficeCenter(session.access_token).catch(() => null);
        if (alive && res?.center?.tenant_id) navigate('/center-office', { replace: true });
      } finally {
        if (alive) setCheckingCenter(false);
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SiteHeader navItems={navItems} brandLabel="schood centers" />
      <main className="px-6 pb-16 pt-8 md:px-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className={`${panelClass} p-6 md:p-10`}>
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-900 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
              <Building2 className="h-4 w-4" />
              Education center cooperation
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight md:text-5xl">
              Run Schood mock exams and subscriptions under your center supervision.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-gray-600">
              Create a center profile, wait for Schood approval, then buy credits, generate student vouchers, and monitor results from a dedicated center office.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={() => navigate('/center-office')} className={primaryButton}>
                {checkingCenter ? 'Checking center status...' : 'Start center application'}
                <ArrowUpRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => navigate('/contact')} className={secondaryButton}>
                Talk to Schood
              </button>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-4">
            {steps.map(({ title, note, icon: Icon }) => (
              <div key={title} className={`${panelClass} p-5`}>
                <Icon className="h-6 w-6 text-gray-700" />
                <h2 className="mt-4 font-bold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">{note}</p>
              </div>
            ))}
          </section>

          <section className={`${panelClass} p-6 md:p-8`}>
            <h2 className="text-2xl font-bold">What unlocks after approval</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {[
                'Dedicated education center office',
                'Wallet top-up requests and admin settlement',
                'Voucher batches for mock exams, subscriptions, and seats',
                'Center-branded public page and logo',
                'Staff access for center admins and teachers',
                'Student usage, results, and CSV reports',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-gray-900/10 bg-white/70 p-3 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
