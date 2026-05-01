import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Coins,
  Copy,
  CreditCard,
  Link2,
  ReceiptText,
  RefreshCw,
  Send,
  Ticket,
  UserPlus,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  partnerOfficeAssignSeat,
  partnerOfficeCatalog,
  partnerOfficeCreateSeatPurchase,
  partnerOfficeCreateTicketPurchase,
  partnerOfficeCredits,
  partnerOfficeDashboard,
  partnerOfficePayments,
  partnerOfficePlans,
  partnerOfficeReferrals,
  partnerOfficeRequestCashPayout,
  partnerOfficeResults,
  partnerOfficeSeats,
  partnerOfficeTickets,
  tspayStatus,
  type PartnerCreditLedgerEntry,
  type PartnerOfficeExperience,
  type PartnerOfficePayment,
  type PartnerOfficePlan,
  type PartnerOfficeResult,
  type PartnerOfficeSeat,
  type PartnerOfficeTicket,
  type ReferralMeResponse,
} from '../lib/platformClient';
import { SiteHeader, type SiteHeaderAction, type SiteHeaderNavItem } from '../components/layout/SiteHeader';

type Tab = 'overview' | 'buy' | 'tickets' | 'results' | 'seats' | 'referrals' | 'credits' | 'payments';

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'buy', label: 'Buy', icon: CreditCard },
  { id: 'tickets', label: 'Tickets', icon: Ticket },
  { id: 'results', label: 'Results', icon: ClipboardList },
  { id: 'seats', label: 'Seats', icon: UsersRound },
  { id: 'referrals', label: 'Referrals', icon: Link2 },
  { id: 'credits', label: 'Credits', icon: Coins },
  { id: 'payments', label: 'Payments', icon: ReceiptText },
];

const panelClass = 'rounded-3xl border border-gray-900 bg-white/85 shadow-sm';
const inputClass =
  'mt-2 w-full rounded-2xl border border-gray-900/25 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100';
const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[#0f172a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full border border-gray-900 bg-white/80 px-4 py-2.5 text-sm font-semibold text-gray-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50';

const money = (amount?: number | null, currency = 'UZS') =>
  typeof amount === 'number' && Number.isFinite(amount) ? `${amount.toLocaleString()} ${currency}` : 'Not priced';

const isPaid = (status?: string | null) => ['paid', 'success', 'completed'].includes(String(status ?? '').trim().toLowerCase());

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusTone = (status?: string | null) => {
  const normalized = String(status ?? '').toLowerCase();
  if (['active', 'paid', 'success', 'completed', 'issued', 'unassigned'].includes(normalized)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (['pending', 'reserved', 'processing'].includes(normalized)) {
    return 'border-amber-200 bg-amber-50 text-amber-900';
  }
  if (['used', 'assigned'].includes(normalized)) {
    return 'border-sky-200 bg-sky-50 text-sky-800';
  }
  if (['failed', 'canceled', 'cancelled', 'expired', 'void'].includes(normalized)) {
    return 'border-red-200 bg-red-50 text-red-700';
  }
  return 'border-gray-200 bg-gray-50 text-gray-700';
};

const StatusPill: React.FC<{ status?: string | null }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusTone(status)}`}>
    {status || 'unknown'}
  </span>
);

const SectionTitle: React.FC<{ icon: LucideIcon; label: string; title: string; action?: React.ReactNode }> = ({
  icon: Icon,
  label,
  title,
  action,
}) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <h2 className="mt-2 text-2xl font-bold text-gray-900">{title}</h2>
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
  </div>
);

const EmptyState: React.FC<{ icon: LucideIcon; title: string; note: string }> = ({ icon: Icon, title, note }) => (
  <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-white/60 px-5 py-10 text-center">
    <Icon className="h-8 w-8 text-gray-400" />
    <p className="mt-3 font-semibold text-gray-900">{title}</p>
    <p className="mt-1 max-w-sm text-sm text-gray-600">{note}</p>
  </div>
);

const StatCard: React.FC<{ label: string; value: string | number; icon: LucideIcon; tone?: 'dark' | 'light' }> = ({
  label,
  value,
  icon: Icon,
  tone = 'light',
}) => (
  <div className={`${panelClass} ${tone === 'dark' ? 'bg-[#0f172a] text-white' : 'bg-white/85 text-gray-900'} p-5`}>
    <div className="flex items-center justify-between gap-3">
      <p className={`text-xs font-semibold uppercase tracking-wider ${tone === 'dark' ? 'text-white/70' : 'text-gray-500'}`}>{label}</p>
      <Icon className={`h-5 w-5 ${tone === 'dark' ? 'text-white/70' : 'text-gray-500'}`} />
    </div>
    <p className="mt-3 text-2xl font-bold">{value}</p>
  </div>
);

export const PartnerOfficePage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [catalog, setCatalog] = useState<PartnerOfficeExperience[]>([]);
  const [tickets, setTickets] = useState<PartnerOfficeTicket[]>([]);
  const [results, setResults] = useState<PartnerOfficeResult[]>([]);
  const [plans, setPlans] = useState<PartnerOfficePlan[]>([]);
  const [seats, setSeats] = useState<PartnerOfficeSeat[]>([]);
  const [payments, setPayments] = useState<PartnerOfficePayment[]>([]);
  const [referrals, setReferrals] = useState<ReferralMeResponse | null>(null);
  const [credit, setCredit] = useState<{ currency: string; available_amount: number }>({ currency: 'UZS', available_amount: 0 });
  const [creditLedger, setCreditLedger] = useState<PartnerCreditLedgerEntry[]>([]);
  const [dashboard, setDashboard] = useState<{ counts: Record<string, number>; credit: { currency: string; available_amount: number } } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [experienceId, setExperienceId] = useState('');
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [expiryDays, setExpiryDays] = useState(30);
  const [ticketApplyCredit, setTicketApplyCredit] = useState(true);
  const [seatPlanId, setSeatPlanId] = useState('');
  const [seatQuantity, setSeatQuantity] = useState(1);
  const [seatApplyCredit, setSeatApplyCredit] = useState(true);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<'tickets' | 'seats' | null>(null);
  const [seatEmails, setSeatEmails] = useState<Record<string, string>>({});
  const [cashPayoutMethod, setCashPayoutMethod] = useState('cash');
  const [cashPayoutDetails, setCashPayoutDetails] = useState('');
  const [cashPayoutNote, setCashPayoutNote] = useState('');

  const selectedExperience = useMemo(() => catalog.find((item) => item.id === experienceId) ?? null, [catalog, experienceId]);
  const selectedPlan = useMemo(() => plans.find((item) => item.id === seatPlanId) ?? null, [plans, seatPlanId]);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const activeTickets = useMemo(() => tickets.filter((ticket) => String(ticket.status).toLowerCase() === 'active'), [tickets]);
  const openSeats = useMemo(() => seats.filter((seat) => String(seat.status).toLowerCase() === 'unassigned'), [seats]);
  const ticketReadyCount = useMemo(() => catalog.filter((item) => item.is_ticket_ready).length, [catalog]);
  const referralUrl = referrals?.referral_url_path ? `${origin}${referrals.referral_url_path}` : referrals?.account?.referral_code ? `${origin}/r/${encodeURIComponent(referrals.account.referral_code)}` : '';
  const legacyReferralUrl = referrals?.legacy_referral_url_path ? `${origin}${referrals.legacy_referral_url_path}` : referrals?.account?.referral_code ? `${origin}/?ref=${encodeURIComponent(referrals.account.referral_code)}` : '';
  const availableCashRewards = useMemo(
    () => (referrals?.rewards ?? []).filter((reward: any) => reward.referrer_user_id === referrals?.account?.user_id && reward.status === 'issued' && reward.cash_status === 'available' && Number(reward.cash_amount ?? 0) > 0),
    [referrals?.account?.user_id, referrals?.rewards],
  );
  const cashPayoutRequests = referrals?.cash_payout_requests ?? [];
  const inviteUrl = (code: string) => `${origin}/candidate?code=${encodeURIComponent(code)}`;
  const ticketEstimate =
    selectedExperience && typeof selectedExperience.price_amount === 'number'
      ? selectedExperience.price_amount * Math.max(1, ticketQuantity)
      : null;
  const seatEstimate = selectedPlan && typeof selectedPlan.amount === 'number' ? selectedPlan.amount * Math.max(1, seatQuantity) : null;

  const navItems: SiteHeaderNavItem[] = [
    { id: 'overview', label: 'Overview', onClick: () => setTab('overview'), active: tab === 'overview' },
    { id: 'buy', label: 'Buy', onClick: () => setTab('buy'), active: tab === 'buy' },
    { id: 'tickets', label: 'Tickets', onClick: () => setTab('tickets'), active: tab === 'tickets' },
    { id: 'results', label: 'Results', onClick: () => setTab('results'), active: tab === 'results' },
    { id: 'referrals', label: 'Referrals', onClick: () => setTab('referrals'), active: tab === 'referrals' },
  ];

  const headerActions: SiteHeaderAction[] = [
    { id: 'candidate', label: 'Candidate', onClick: () => navigate('/candidate') },
    { id: 'account', label: 'Account', onClick: () => navigate('/account'), primary: true },
  ];

  const getValidToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
    const refreshed = await supabase.auth.refreshSession();
    return refreshed.data.session?.access_token ?? null;
  };

  const parseError = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err ?? 'Something went wrong');
    const explicit = raw.match(/"error":"([^"]+)"/i)?.[1];
    return explicit || raw;
  };

  const refreshAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getValidToken();
      if (!token) {
        navigate(`/auth?returnTo=${encodeURIComponent('/partner')}`, { replace: true });
        return;
      }
      const [dashRes, catalogRes, ticketsRes, resultsRes, plansRes, seatsRes, paymentsRes, creditsRes, referralsRes] = await Promise.all([
        partnerOfficeDashboard(token),
        partnerOfficeCatalog(token),
        partnerOfficeTickets(token),
        partnerOfficeResults(token),
        partnerOfficePlans(token),
        partnerOfficeSeats(token),
        partnerOfficePayments(token),
        partnerOfficeCredits(token),
        partnerOfficeReferrals(token),
      ]);
      setDashboard(dashRes);
      setCatalog(catalogRes.experiences ?? []);
      setTickets(ticketsRes.tickets ?? []);
      setResults(resultsRes.results ?? []);
      setPlans(plansRes.plans ?? []);
      setSeats(seatsRes.seats ?? []);
      setPayments(paymentsRes.payments ?? []);
      setCredit(creditsRes.credit);
      setCreditLedger(creditsRes.ledger ?? []);
      setReferrals(referralsRes);
      if (!experienceId && catalogRes.experiences?.[0]) setExperienceId(catalogRes.experiences[0].id);
      if (!seatPlanId && plansRes.plans?.[0]) setSeatPlanId(plansRes.plans[0].id);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void refreshAll();
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPayment = (url: string | null) => {
    if (!url) return;
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) setError('Popup blocked. Use the payment link from the Payments tab.');
  };

  const buyTickets = async () => {
    const token = await getValidToken();
    if (!token || !experienceId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeCreateTicketPurchase(token, {
        experience_id: experienceId,
        quantity: ticketQuantity,
        expires_in_days: expiryDays,
        apply_credit: ticketApplyCredit,
      });
      setPendingTransactionId(res.transaction_id);
      setPendingKind('tickets');
      if (res.payment_url) {
        openPayment(res.payment_url);
        setSuccess('Payment opened. Tickets will appear after payment is confirmed.');
      } else if (isPaid(res.status)) {
        await refreshAll();
        setSuccess('Tickets generated using platform credit.');
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const buySeats = async () => {
    const token = await getValidToken();
    if (!token || !seatPlanId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeCreateSeatPurchase(token, {
        plan_id: seatPlanId,
        seat_count: seatQuantity,
        apply_credit: seatApplyCredit,
      });
      setPendingTransactionId(res.transaction_id);
      setPendingKind('seats');
      if (res.payment_url) {
        openPayment(res.payment_url);
        setSuccess('Payment opened. Seats will appear after payment is confirmed.');
      } else if (isPaid(res.status)) {
        await refreshAll();
        setSuccess('Seats added using platform credit.');
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const checkPayment = async () => {
    if (!pendingTransactionId) return;
    const token = await getValidToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await tspayStatus(token, pendingTransactionId);
      if (isPaid(res.status)) {
        setPendingTransactionId(null);
        setPendingKind(null);
        await refreshAll();
        setSuccess(pendingKind === 'seats' ? 'Seats added.' : 'Tickets generated.');
      } else {
        setSuccess(`Payment status: ${res.status}`);
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const assignSeat = async (seatId: string) => {
    const token = await getValidToken();
    const email = seatEmails[seatId]?.trim();
    if (!token || !email) return;
    setLoading(true);
    setError(null);
    try {
      await partnerOfficeAssignSeat(token, { seat_id: seatId, email });
      await refreshAll();
      setSuccess('Seat assigned.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const requestCashPayout = async () => {
    const token = await getValidToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const payoutDetails = cashPayoutDetails.trim()
        ? { instructions: cashPayoutDetails.trim() }
        : {};
      const rewardIds = availableCashRewards.map((reward: any) => String(reward.id)).filter(Boolean);
      await partnerOfficeRequestCashPayout(token, {
        payout_method: cashPayoutMethod,
        payout_details: payoutDetails,
        note: cashPayoutNote.trim() || null,
        reward_ids: rewardIds,
      });
      setCashPayoutDetails('');
      setCashPayoutNote('');
      await refreshAll();
      setSuccess('Cash payout request sent to admins.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const copy = async (value: string, message = 'Copied.') => {
    if (!value) return;
    if (!navigator.clipboard) {
      setError('Clipboard is not available in this browser.');
      return;
    }
    await navigator.clipboard.writeText(value);
    setSuccess(message);
  };

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SiteHeader navItems={navItems} actions={headerActions} brandLabel="schood partner" />

      <main className="px-6 pb-16 pt-8 md:px-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className={`${panelClass} p-6 md:p-8`}>
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-900 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-800">
                <WalletCards className="h-4 w-4" />
                Partner Office
              </div>
              <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight text-gray-900 md:text-5xl">
                Tickets, seats, referrals, and credits in one workspace.
              </h1>
              <p className="mt-4 max-w-2xl text-base text-gray-600">
                Buy single-sitting mock access, hand students into the existing candidate flow, manage seats, and track partner rewards from the same account.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => setTab('buy')} className={primaryButton}>
                  <CreditCard className="h-4 w-4" />
                  Buy access
                </button>
                <button type="button" onClick={() => navigate('/candidate')} className={secondaryButton}>
                  <Send className="h-4 w-4" />
                  Candidate entry
                </button>
                <button type="button" onClick={() => void refreshAll()} className={secondaryButton} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-900 bg-[#0f172a] p-6 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Available credit</p>
              <p className="mt-3 text-3xl font-bold">{money(dashboard?.credit?.available_amount ?? credit.available_amount, credit.currency)}</p>
              <div className="mt-6 rounded-2xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Referral code</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-mono text-xl font-bold">{referrals?.account?.referral_code ?? '-'}</span>
                  <button
                    type="button"
                    onClick={() => referralUrl && void copy(referralUrl, 'Referral link copied.')}
                    disabled={!referralUrl}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"
                    title="Copy referral link"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-white/70">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                Candidate links use /candidate?code=TOKEN
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Tickets" value={dashboard?.counts?.tickets ?? tickets.length} icon={Ticket} />
            <StatCard label="Active" value={activeTickets.length} icon={CheckCircle2} />
            <StatCard label="Results" value={dashboard?.counts?.results ?? results.length} icon={ClipboardList} />
            <StatCard label="Open seats" value={openSeats.length} icon={UsersRound} />
            <StatCard label="Ticket mocks" value={ticketReadyCount} icon={BarChart3} tone="dark" />
          </section>

          <section className="overflow-x-auto rounded-full border border-gray-900 bg-[#efe6d8]/80 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max gap-2">
              {tabs.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`inline-flex items-center gap-2 rounded-full border border-gray-900 px-4 py-2 text-sm font-semibold transition ${
                      active ? 'bg-[#0f172a] text-white' : 'bg-white/80 text-gray-900 hover:bg-white'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </section>

          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

          {pendingTransactionId ? (
            <div className="flex flex-col gap-3 rounded-3xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Pending {pendingKind}</p>
                <p className="mt-1 font-mono text-xs">{pendingTransactionId}</p>
              </div>
              <button type="button" onClick={() => void checkPayment()} className={primaryButton}>
                <CreditCard className="h-4 w-4" />
                Check payment
              </button>
            </div>
          ) : null}

          {tab === 'overview' ? (
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className={`${panelClass} p-5 md:p-6`}>
                <SectionTitle
                  icon={Ticket}
                  label="Recent activity"
                  title="Latest tickets"
                  action={
                    <button type="button" onClick={() => setTab('tickets')} className={secondaryButton}>
                      View all
                    </button>
                  }
                />
                <div className="mt-5 space-y-3">
                  {tickets.slice(0, 5).map((ticket) => (
                    <div key={ticket.id} className="flex flex-col gap-3 rounded-2xl border border-gray-900/10 bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-mono text-lg font-bold text-gray-900">{ticket.token_code}</p>
                        <p className="mt-1 truncate text-sm text-gray-600">{ticket.experiences?.name ?? 'Mock'} - expires {formatDate(ticket.expires_at)}</p>
                      </div>
                      <StatusPill status={ticket.status} />
                    </div>
                  ))}
                  {tickets.length === 0 ? <EmptyState icon={Ticket} title="No tickets yet" note="Purchased mock tickets will appear here." /> : null}
                </div>
              </div>

              <div className="space-y-5">
                <div className={`${panelClass} p-5`}>
                  <SectionTitle icon={Link2} label="Referrals" title="Program snapshot" />
                  <div className="mt-5 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-600">Status</span>
                      <StatusPill status={referrals?.program?.status ?? 'not configured'} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-600">Attributions</span>
                      <span className="font-semibold">{referrals?.attributions?.length ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-600">Rewards</span>
                      <span className="font-semibold">{referrals?.rewards?.length ?? 0}</span>
                    </div>
                  </div>
                </div>

                <div className={`${panelClass} p-5`}>
                  <SectionTitle icon={ReceiptText} label="Payments" title="Recent payments" />
                  <div className="mt-5 space-y-3">
                    {payments.slice(0, 3).map((payment) => (
                      <div key={payment.id} className="rounded-2xl border border-gray-900/10 bg-white/80 p-4 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold capitalize">{payment.purchase_type ?? 'plan'}</span>
                          <StatusPill status={payment.status} />
                        </div>
                        <p className="mt-2 font-bold">{money(payment.final_amount ?? payment.amount, payment.currency)}</p>
                      </div>
                    ))}
                    {payments.length === 0 ? <p className="text-sm text-gray-600">No payments yet.</p> : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {tab === 'buy' ? (
            <section className="grid gap-5 lg:grid-cols-2">
              <div className={`${panelClass} p-5 md:p-6`}>
                <SectionTitle icon={Ticket} label="Mock tickets" title="Buy single-sitting tickets" />
                <div className="mt-6 space-y-4">
                  <label className="block text-sm font-semibold text-gray-800">
                    Mock experience
                    <select value={experienceId} onChange={(event) => setExperienceId(event.target.value)} className={inputClass}>
                      {catalog.map((exp) => (
                        <option key={exp.id} value={exp.id}>
                          {exp.product_name ? `${exp.product_name} - ` : ''}
                          {exp.name} ({money(exp.price_amount, exp.price_currency ?? 'UZS')})
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-gray-800">
                      Quantity
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={ticketQuantity}
                        onChange={(event) => setTicketQuantity(Number(event.target.value))}
                        className={inputClass}
                      />
                    </label>
                    <label className="block text-sm font-semibold text-gray-800">
                      Expires in days
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={expiryDays}
                        onChange={(event) => setExpiryDays(Number(event.target.value))}
                        className={inputClass}
                      />
                    </label>
                  </div>

                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-900/15 bg-white/80 px-4 py-3 text-sm font-semibold text-gray-800">
                    <span>Apply credit</span>
                    <input type="checkbox" checked={ticketApplyCredit} onChange={(event) => setTicketApplyCredit(event.target.checked)} className="h-5 w-5 accent-[#0f172a]" />
                  </label>

                  <div className="rounded-2xl border border-gray-900/10 bg-gray-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600">Estimated total</span>
                      <span className="font-bold">{money(ticketEstimate, selectedExperience?.price_currency ?? 'UZS')}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600">Available credit</span>
                      <span className="font-semibold">{money(credit.available_amount, credit.currency)}</span>
                    </div>
                  </div>

                  <button type="button" onClick={() => void buyTickets()} disabled={loading || !selectedExperience?.is_ticket_ready} className={primaryButton}>
                    <CreditCard className="h-4 w-4" />
                    Buy tickets
                  </button>
                </div>
              </div>

              <div className={`${panelClass} p-5 md:p-6`}>
                <SectionTitle icon={UserPlus} label="Seats" title="Buy subscription seats" />
                <div className="mt-6 space-y-4">
                  <label className="block text-sm font-semibold text-gray-800">
                    Plan
                    <select value={seatPlanId} onChange={(event) => setSeatPlanId(event.target.value)} className={inputClass}>
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.products?.name ? `${plan.products.name} - ` : ''}
                          {plan.name} ({money(plan.amount, plan.currency)})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block text-sm font-semibold text-gray-800">
                    Seats
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={seatQuantity}
                      onChange={(event) => setSeatQuantity(Number(event.target.value))}
                      className={inputClass}
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-900/15 bg-white/80 px-4 py-3 text-sm font-semibold text-gray-800">
                    <span>Apply credit</span>
                    <input type="checkbox" checked={seatApplyCredit} onChange={(event) => setSeatApplyCredit(event.target.checked)} className="h-5 w-5 accent-[#0f172a]" />
                  </label>

                  <div className="rounded-2xl border border-gray-900/10 bg-gray-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600">Estimated total</span>
                      <span className="font-bold">{money(seatEstimate, selectedPlan?.currency ?? 'UZS')}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-600">Available credit</span>
                      <span className="font-semibold">{money(credit.available_amount, credit.currency)}</span>
                    </div>
                  </div>

                  <button type="button" onClick={() => void buySeats()} disabled={loading || !selectedPlan} className={primaryButton}>
                    <CreditCard className="h-4 w-4" />
                    Buy seats
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {tab === 'tickets' ? (
            <section className={`${panelClass} overflow-hidden`}>
              <div className="border-b border-gray-900/10 p-5 md:p-6">
                <SectionTitle icon={Ticket} label="Candidate links" title="Tickets" />
              </div>
              <div className="divide-y divide-gray-900/10">
                {tickets.map((ticket) => (
                  <div key={ticket.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-lg font-bold">{ticket.token_code}</p>
                        <StatusPill status={ticket.status} />
                      </div>
                      <p className="mt-1 text-sm text-gray-600">
                        {ticket.experiences?.name ?? 'Mock'} - uses {ticket.uses_count}/{ticket.max_uses} - expires {formatDate(ticket.expires_at)}
                      </p>
                    </div>
                    <button type="button" onClick={() => void copy(inviteUrl(ticket.token_code), 'Candidate link copied.')} className={secondaryButton}>
                      <Copy className="h-4 w-4" />
                      Copy
                    </button>
                    <a href={inviteUrl(ticket.token_code)} className={primaryButton}>
                      <ArrowUpRight className="h-4 w-4" />
                      Open
                    </a>
                  </div>
                ))}
                {tickets.length === 0 ? (
                  <div className="p-6">
                    <EmptyState icon={Ticket} title="No tickets yet" note="Ticket purchases will generate single-use candidate links." />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {tab === 'results' ? (
            <section className={`${panelClass} overflow-hidden`}>
              <div className="border-b border-gray-900/10 p-5 md:p-6">
                <SectionTitle icon={ClipboardList} label="Student outcomes" title="Results" />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-900/10 text-sm">
                  <thead className="bg-[#efe6d8]/70 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    <tr>
                      <th className="px-5 py-3">Candidate</th>
                      <th className="px-5 py-3">Ticket</th>
                      <th className="px-5 py-3">Mock</th>
                      <th className="px-5 py-3">Score</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-900/10 bg-white/60">
                    {results.map((row) => (
                      <tr key={row.id}>
                        <td className="px-5 py-4">
                          <p className="font-semibold">{row.candidate_name || row.email || 'Candidate'}</p>
                          <p className="text-xs text-gray-500">{row.email}</p>
                        </td>
                        <td className="px-5 py-4 font-mono">{row.token_code ?? '-'}</td>
                        <td className="px-5 py-4">{row.experience_name ?? '-'}</td>
                        <td className="px-5 py-4 font-semibold">{row.overall_band ?? row.overall_score ?? '-'}</td>
                        <td className="px-5 py-4">
                          <StatusPill status={row.session_status ?? row.registration_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {results.length === 0 ? (
                <div className="p-6">
                  <EmptyState icon={ClipboardList} title="No results yet" note="Completed candidate sessions will appear here." />
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === 'seats' ? (
            <section className={`${panelClass} overflow-hidden`}>
              <div className="border-b border-gray-900/10 p-5 md:p-6">
                <SectionTitle icon={UsersRound} label="Seat licenses" title="Seats" />
              </div>
              <div className="divide-y divide-gray-900/10">
                {seats.map((seat) => {
                  const assignable = seat.status === 'unassigned';
                  return (
                    <div key={seat.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_300px_auto] lg:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{seat.plans?.name ?? 'Seat'}</p>
                          <StatusPill status={seat.status} />
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {seat.assigned_user?.email ?? 'Unassigned'} - expires {formatDate(seat.expires_at)}
                        </p>
                      </div>
                      <input
                        value={seatEmails[seat.id] ?? ''}
                        onChange={(event) => setSeatEmails((prev) => ({ ...prev, [seat.id]: event.target.value }))}
                        placeholder="student@email.com"
                        className={`${inputClass} mt-0`}
                        disabled={!assignable}
                      />
                      <button type="button" onClick={() => void assignSeat(seat.id)} disabled={!assignable || !seatEmails[seat.id]?.trim()} className={primaryButton}>
                        Assign
                      </button>
                    </div>
                  );
                })}
                {seats.length === 0 ? (
                  <div className="p-6">
                    <EmptyState icon={UsersRound} title="No seats yet" note="Seat pack purchases will appear here." />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {tab === 'referrals' ? (
            <section className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
              <div className="space-y-5">
                <div className={`${panelClass} p-5 md:p-6`}>
                  <SectionTitle icon={Link2} label="Affiliate link" title="Share" />
                  <p className="mt-5 font-mono text-3xl font-bold">{referrals?.account?.referral_code ?? '-'}</p>
                  <div className="mt-4 rounded-2xl border border-gray-900/10 bg-gray-50 p-3 font-mono text-xs text-gray-700 break-all">
                    {referralUrl || '-'}
                  </div>
                  <div className="mt-4 grid gap-2">
                    <button type="button" onClick={() => referralUrl && void copy(referralUrl, 'Affiliate link copied.')} disabled={!referralUrl} className={secondaryButton}>
                      <Copy className="h-4 w-4" />
                      Copy affiliate link
                    </button>
                    <button type="button" onClick={() => legacyReferralUrl && void copy(legacyReferralUrl, 'Legacy referral link copied.')} disabled={!legacyReferralUrl} className={secondaryButton}>
                      <Copy className="h-4 w-4" />
                      Copy legacy link
                    </button>
                  </div>
                </div>

                <div className={`${panelClass} p-5 md:p-6`}>
                  <SectionTitle icon={Coins} label="Balances" title="Rewards" />
                  <div className="mt-5 grid gap-3">
                    <div className="rounded-2xl border border-gray-900/10 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Platform credit</p>
                      <p className="mt-2 text-xl font-bold">{money(referrals?.credit?.available_amount ?? 0, referrals?.credit?.currency ?? 'UZS')}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-900/10 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cash available</p>
                      <p className="mt-2 text-xl font-bold">{money(referrals?.cash?.available_amount ?? 0, referrals?.cash?.currency ?? 'UZS')}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Requested: {money(referrals?.cash?.requested_amount ?? 0, referrals?.cash?.currency ?? 'UZS')} - Paid: {money(referrals?.cash?.paid_amount ?? 0, referrals?.cash?.currency ?? 'UZS')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className={`${panelClass} p-5 md:p-6`}>
                  <SectionTitle icon={WalletCards} label="Cash payout" title="Request cash from admins" />
                  <div className="mt-5 grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
                    <label className="text-sm font-semibold text-gray-800">
                      Method
                      <select value={cashPayoutMethod} onChange={(event) => setCashPayoutMethod(event.target.value)} className={inputClass}>
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="bank">Bank transfer</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-gray-800">
                      Payout details
                      <input
                        value={cashPayoutDetails}
                        onChange={(event) => setCashPayoutDetails(event.target.value)}
                        placeholder="Card, bank, phone, or pickup instructions"
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <label className="mt-4 block text-sm font-semibold text-gray-800">
                    Note for admin
                    <textarea
                      value={cashPayoutNote}
                      onChange={(event) => setCashPayoutNote(event.target.value)}
                      placeholder="Optional note"
                      className={`${inputClass} min-h-[86px]`}
                    />
                  </label>
                  <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-gray-900/10 bg-gray-50 p-4 text-sm text-gray-700 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Available request amount: <strong>{money(referrals?.cash?.available_amount ?? 0, referrals?.cash?.currency ?? 'UZS')}</strong>
                    </span>
                    <span>Minimum: {money(referrals?.cash?.minimum_payout_amount ?? 0, referrals?.cash?.currency ?? 'UZS')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void requestCashPayout()}
                    disabled={loading || !referrals?.cash?.payouts_enabled || (referrals?.cash?.available_amount ?? 0) <= 0}
                    className={`${primaryButton} mt-5`}
                  >
                    Request cash payout
                  </button>
                </div>

                <div className={`${panelClass} overflow-hidden`}>
                  <div className="border-b border-gray-900/10 p-5 md:p-6">
                    <SectionTitle icon={Coins} label="Referral rewards" title="Active rewards and history" />
                  </div>
                  <div className="divide-y divide-gray-900/10">
                    {(referrals?.rewards ?? []).map((reward) => (
                      <div key={reward.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
                        <div>
                          <p className="font-semibold">
                            Credit {money(reward.credit_amount ?? 0, reward.currency)} / Cash {money(reward.cash_amount ?? 0, reward.currency)}
                          </p>
                          <p className="mt-1 text-sm text-gray-600">{formatDateTime(reward.issued_at ?? reward.created_at)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusPill status={reward.status} />
                          <StatusPill status={reward.cash_status} />
                        </div>
                        <span className="font-mono text-xs text-gray-500">{reward.id}</span>
                      </div>
                    ))}
                    {(referrals?.rewards ?? []).length === 0 ? (
                      <div className="p-6">
                        <EmptyState icon={Coins} title="No rewards yet" note="Rewards are issued after eligible referred purchases convert." />
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className={`${panelClass} overflow-hidden`}>
                  <div className="border-b border-gray-900/10 p-5 md:p-6">
                    <SectionTitle icon={ReceiptText} label="Cash requests" title="Payout requests" />
                  </div>
                  <div className="divide-y divide-gray-900/10">
                    {cashPayoutRequests.map((request: any) => (
                      <div key={request.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
                        <div>
                          <p className="font-semibold">{money(request.amount, request.currency)}</p>
                          <p className="mt-1 text-sm text-gray-600">{request.payout_method} - {formatDateTime(request.requested_at)}</p>
                        </div>
                        <StatusPill status={request.status} />
                        <span className="font-mono text-xs text-gray-500">{request.id}</span>
                      </div>
                    ))}
                    {cashPayoutRequests.length === 0 ? (
                      <div className="p-6">
                        <EmptyState icon={ReceiptText} title="No payout requests" note="Cash payout requests will appear here." />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {tab === 'credits' ? (
            <section className={`${panelClass} overflow-hidden`}>
              <div className="flex flex-col gap-4 border-b border-gray-900/10 p-5 md:flex-row md:items-center md:justify-between md:p-6">
                <SectionTitle icon={Coins} label="Credit ledger" title="Credits" />
                <div className="rounded-full border border-gray-900 bg-white px-4 py-2 text-sm font-bold">
                  Available: {money(credit.available_amount, credit.currency)}
                </div>
              </div>
              <div className="divide-y divide-gray-900/10">
                {creditLedger.map((entry) => (
                  <div key={entry.id} className="grid gap-3 p-5 text-sm md:grid-cols-[1fr_auto_auto_auto] md:items-center">
                    <span className="font-semibold capitalize">{entry.entry_kind}</span>
                    <StatusPill status={entry.status} />
                    <span className="font-bold">{money(entry.amount, entry.currency)}</span>
                    <span className="text-gray-500">{formatDateTime(entry.created_at)}</span>
                  </div>
                ))}
                {creditLedger.length === 0 ? (
                  <div className="p-6">
                    <EmptyState icon={Coins} title="No credit activity" note="Referral credits and reservations will appear in this ledger." />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {tab === 'payments' ? (
            <section className={`${panelClass} overflow-hidden`}>
              <div className="border-b border-gray-900/10 p-5 md:p-6">
                <SectionTitle icon={ReceiptText} label="Billing" title="Payments" />
              </div>
              <div className="divide-y divide-gray-900/10">
                {payments.map((payment) => (
                  <div key={payment.id} className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold capitalize">{payment.purchase_type ?? 'plan'}</p>
                        <StatusPill status={payment.status} />
                      </div>
                      <p className="mt-1 truncate font-mono text-xs text-gray-500">{payment.provider_transaction_id ?? payment.id}</p>
                    </div>
                    <span className="font-bold">{money(payment.final_amount ?? payment.amount, payment.currency)}</span>
                    <span className="text-sm text-gray-500">{formatDateTime(payment.created_at)}</span>
                  </div>
                ))}
                {payments.length === 0 ? (
                  <div className="p-6">
                    <EmptyState icon={ReceiptText} title="No payments yet" note="Partner purchases and status updates will appear here." />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
};
