import React, { useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, ClipboardList, KeyRound, Loader2, Ticket } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { SiteHeader, type SiteHeaderAction } from '../components/layout/SiteHeader';
import { publicCenter, type PublicCenterResponse } from '../lib/platformClient';

const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full border border-gray-900 bg-white/80 px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-white';

export const CenterLandingPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [data, setData] = useState<PublicCenterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const slug = String(params.slug ?? '').trim();
    if (!slug) return;
    setLoading(true);
    publicCenter(slug)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Center not found'))
      .finally(() => setLoading(false));
  }, [params.slug]);

  const actions: SiteHeaderAction[] = [
    { id: 'redeem', label: 'Redeem', onClick: () => navigate('/redeem') },
    { id: 'account', label: 'Account', onClick: () => navigate('/account'), primary: true },
  ];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SiteHeader actions={actions} brandLabel={data?.center.name ?? 'schood center'} />
      <main className="px-6 py-10 md:px-10">
        {loading ? (
          <div className="mx-auto flex max-w-3xl items-center justify-center rounded-3xl border border-gray-900 bg-white/80 p-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error || !data ? (
          <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-red-50 p-8 text-red-700">Center not found or not active.</div>
        ) : (
          <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="rounded-3xl border border-gray-900 bg-white/85 p-6 shadow-sm md:p-10">
              <div className="flex flex-wrap items-center gap-4">
                {data.center.logo_url ? <img src={data.center.logo_url} alt="" className="h-16 w-16 rounded-2xl border border-gray-900/10 object-contain bg-white" /> : null}
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-gray-900 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-800">
                    <KeyRound className="h-4 w-4" />
                    Schood partner center
                  </div>
                  <h1 className="mt-3 text-3xl font-bold leading-tight md:text-5xl">{data.center.name}</h1>
                </div>
              </div>
              <p className="mt-6 max-w-2xl text-base text-gray-600">
                {data.center.public_instructions || 'Redeem your center voucher to activate your mock exam or digital learning access.'}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => navigate('/redeem')} className={primaryButton}>
                  <KeyRound className="h-4 w-4" />
                  Redeem your code
                </button>
                <button type="button" onClick={() => navigate('/candidate')} className={secondaryButton}>
                  <Ticket className="h-4 w-4" />
                  Take mock exam
                </button>
                <button type="button" onClick={() => navigate('/account')} className={secondaryButton}>
                  <ClipboardList className="h-4 w-4" />
                  View access
                </button>
              </div>
            </div>

            <aside className="rounded-3xl border border-gray-900 bg-[#0f172a] p-6 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Available through Schood</p>
              <div className="mt-5 space-y-3">
                {data.services.mock_exams.slice(0, 4).map((item: any) => (
                  <div key={`mock-${item.id}`} className="rounded-2xl border border-white/15 bg-white/10 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold"><Ticket className="h-4 w-4" />{item.name}</div>
                    <p className="mt-1 text-xs text-white/60">{item.products?.name ?? 'Mock exam'}</p>
                  </div>
                ))}
                {data.services.subscriptions.slice(0, 4).map((item: any) => (
                  <div key={`plan-${item.id}`} className="rounded-2xl border border-white/15 bg-white/10 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4" />{item.name}</div>
                    <p className="mt-1 text-xs text-white/60">{item.products?.name ?? 'Subscription'}{item.duration_days ? ` - ${item.duration_days} days` : ''}</p>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => navigate('/redeem')} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15">
                Continue
                <ArrowUpRight className="h-4 w-4" />
              </button>
              {data.center.powered_by_schood ? <p className="mt-5 text-center text-xs text-white/50">Powered by Schood</p> : null}
            </aside>
          </section>
        )}
      </main>
    </div>
  );
};
