import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Ticket,
  UsersRound,
} from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SiteHeader, type SiteHeaderAction } from '../components/layout/SiteHeader';
import { publicCenter, type PublicCenterResponse } from '../lib/platformClient';

const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full border border-gray-900 bg-white/85 px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-white';

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const CenterLandingPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<PublicCenterResponse | null>(null);
  const [voucherCode, setVoucherCode] = useState(() => String(searchParams.get('code') ?? '').trim().toUpperCase());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const slug = String(params.slug ?? '').trim();
    if (!slug) return;
    setLoading(true);
    setError(null);
    publicCenter(slug)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Center not found'))
      .finally(() => setLoading(false));
  }, [params.slug]);

  const actions: SiteHeaderAction[] = [
    { id: 'redeem', label: 'Redeem', onClick: () => navigate('/redeem') },
    { id: 'account', label: 'Account', onClick: () => navigate('/account'), primary: true },
  ];

  const branding = (data?.center.branding && typeof data.center.branding === 'object' ? data.center.branding : {}) as Record<string, any>;
  const accentColor = String(branding.accent_color ?? branding.primary_color ?? '#d8f266').trim() || '#d8f266';
  const contactEmail = String(branding.contact_email ?? branding.email ?? '').trim();
  const contactPhone = String(branding.contact_phone ?? branding.phone ?? '').trim();
  const contactName = String(branding.contact_name ?? '').trim();
  const address = String(branding.address ?? branding.location ?? '').trim();
  const upcomingEvents = data?.events ?? [];
  const accessCards = [
    { label: 'Mock access', value: 'Voucher required', icon: Ticket, tone: 'bg-[#d8f266]' },
    { label: 'Learning access', value: 'Center issued', icon: BookOpen, tone: 'bg-[#9ee7ff]' },
    { label: 'Events', value: upcomingEvents.length > 0 ? 'Public schedule' : 'Private roster', icon: CalendarDays, tone: 'bg-[#ffd166]' },
  ];
  const openRedeem = () => {
    const clean = voucherCode.trim().toUpperCase();
    navigate(clean ? `/redeem/${encodeURIComponent(clean)}` : '/redeem');
  };

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SiteHeader actions={actions} brandLabel={data?.center.name ?? 'schood center'} />
      <main className="px-5 py-8 md:px-10 md:py-10">
        {loading ? (
          <div className="mx-auto flex max-w-3xl items-center justify-center rounded-3xl border border-gray-900 bg-white/85 p-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error || !data ? (
          <div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-red-50 p-8 text-red-700">Center not found or not active.</div>
        ) : (
          <section className="mx-auto max-w-7xl space-y-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
              <section className="rounded-3xl border border-gray-900 bg-white/90 p-6 shadow-sm md:p-9">
                <div className="flex flex-wrap items-center gap-4">
                  {data.center.logo_url ? (
                    <img src={data.center.logo_url} alt="" className="h-20 w-20 rounded-3xl border border-gray-900/10 bg-white object-contain p-2" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-gray-900 bg-[#d8f266]">
                      <Building2 className="h-8 w-8" />
                    </div>
                  )}
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-gray-900 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-900" style={{ backgroundColor: accentColor }}>
                      <ShieldCheck className="h-4 w-4" />
                      Verified Schood partner
                    </div>
                    <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight md:text-6xl">{data.center.name}</h1>
                  </div>
                </div>

                <p className="mt-6 max-w-3xl text-base leading-7 text-gray-600 md:text-lg">
                  {data.center.public_instructions || 'Redeem your center voucher to activate your mock exam or digital learning access.'}
                </p>

                <div className="mt-7 rounded-2xl border border-gray-900/15 bg-[#fbfaf7] p-4">
                  <label className="block text-sm font-semibold text-gray-800">
                    Enter your unique Schood voucher code
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                      <input
                        value={voucherCode}
                        onChange={(event) => setVoucherCode(event.target.value.toUpperCase())}
                        className="min-h-12 flex-1 rounded-2xl border border-gray-900/25 bg-white px-4 py-3 font-mono text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                        placeholder="SCH-CENTER-A12B7"
                      />
                      <button type="button" onClick={openRedeem} className={primaryButton}>
                        <KeyRound className="h-4 w-4" />
                        Begin
                      </button>
                    </div>
                  </label>
                </div>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button type="button" onClick={openRedeem} className={primaryButton}>
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

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {accessCards.map((card) => (
                    <div key={card.label} className={`rounded-2xl border border-gray-900 p-4 ${card.tone}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wider">{card.label}</p>
                        <card.icon className="h-5 w-5" />
                      </div>
                      <p className="mt-3 text-lg font-bold">{card.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <aside className="rounded-3xl border border-gray-900 bg-[#0f172a] p-6 text-white shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Access desk</p>
                <h2 className="mt-2 text-2xl font-bold">Your center controls who gets access.</h2>
                <div className="mt-5 space-y-3 text-sm text-white/75">
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                    <div className="flex items-center gap-2 font-semibold text-white"><KeyRound className="h-4 w-4" />Code first</div>
                    <p className="mt-2">Students enter with a center-issued voucher, event code, or account access.</p>
                  </div>
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                    <div className="flex items-center gap-2 font-semibold text-white"><ShieldCheck className="h-4 w-4" />Private catalog</div>
                    <p className="mt-2">Mock tests, seat inventory, pricing, and purchased stock stay inside the center office.</p>
                  </div>
                </div>
                <button type="button" onClick={openRedeem} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15">
                  Continue
                  <ArrowUpRight className="h-4 w-4" />
                </button>

                {(contactName || contactEmail || contactPhone || address) ? (
                  <div className="mt-6 rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-white/75">
                    {contactName ? <p className="font-semibold text-white">{contactName}</p> : null}
                    {contactEmail ? <p className="mt-2 flex items-center gap-2"><Mail className="h-4 w-4" />{contactEmail}</p> : null}
                    {contactPhone ? <p className="mt-2 flex items-center gap-2"><Phone className="h-4 w-4" />{contactPhone}</p> : null}
                    {address ? <p className="mt-2 flex items-center gap-2"><MapPin className="h-4 w-4" />{address}</p> : null}
                  </div>
                ) : null}
                {data.center.powered_by_schood ? <p className="mt-5 text-center text-xs text-white/50">Powered by Schood</p> : null}
              </aside>
            </div>

            <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-3xl border border-gray-900 bg-white/90 p-5 shadow-sm md:p-6">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  <BookOpen className="h-4 w-4" />
                  Private intake
                </div>
                <h2 className="mt-2 text-2xl font-bold">Nothing is public until the center chooses it.</h2>
                <div className="mt-5 grid gap-3">
                  {[
                    ['Student invites', 'A center staff member prepares the roster or sends a direct invite.'],
                    ['Voucher batches', 'Codes can be assigned privately to named students before they redeem.'],
                    ['Public events', 'Only events explicitly marked public appear on this page.'],
                  ].map(([title, copy]) => (
                    <article key={title} className="rounded-2xl border border-gray-900/15 bg-[#fbfaf7] p-4">
                      <p className="font-semibold">{title}</p>
                      <p className="mt-1 text-sm text-gray-600">{copy}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-gray-900 bg-white/90 p-5 shadow-sm md:p-6">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                  <UsersRound className="h-4 w-4" />
                  Student path
                </div>
                <h2 className="mt-2 text-2xl font-bold">From voucher to outcome</h2>
                <div className="mt-5 grid gap-3">
                  {[
                    ['Redeem', 'Use the center voucher or event code.'],
                    ['Sit', 'Open the assigned mock or learning service.'],
                    ['Review', 'Return to Schood for access, results, and next steps.'],
                  ].map(([title, copy], index) => (
                    <div key={title} className="flex gap-4 rounded-2xl border border-gray-900/15 bg-[#fbfaf7] p-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-900 bg-[#9ee7ff] text-sm font-bold">{index + 1}</span>
                      <div>
                        <p className="font-semibold">{title}</p>
                        <p className="mt-1 text-sm text-gray-600">{copy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {upcomingEvents.length > 0 ? (
              <section className="rounded-3xl border border-gray-900 bg-white/90 p-5 shadow-sm md:p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
                      <CalendarDays className="h-4 w-4" />
                      Upcoming mocks
                    </div>
                    <h2 className="mt-2 text-2xl font-bold">Center mock exam events</h2>
                  </div>
                  <button type="button" onClick={openRedeem} className={secondaryButton}>
                    <KeyRound className="h-4 w-4" />
                    Redeem event code
                  </button>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {upcomingEvents.slice(0, 6).map((event) => (
                    <article key={event.id} className="rounded-2xl border border-gray-900/15 bg-[#fbfaf7] p-4">
                      <p className="font-semibold">{event.title}</p>
                      <p className="mt-2 text-sm text-gray-600">{event.experiences?.name ?? 'Mock exam'} - {formatDateTime(event.starts_at)}</p>
                      <p className="mt-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        <MapPin className="h-4 w-4" />
                        {event.mode}{event.location ? ` - ${event.location}` : ''}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
};
