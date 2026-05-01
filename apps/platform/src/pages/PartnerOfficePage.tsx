import React, { useEffect, useMemo, useState } from 'react';
import { Copy, CreditCard, RefreshCw, Send, Ticket, UserPlus } from 'lucide-react';
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
  partnerOfficeResults,
  partnerOfficeSeats,
  partnerOfficeTickets,
  tspayStatus,
  type PartnerOfficeExperience,
  type PartnerOfficePayment,
  type PartnerOfficePlan,
  type PartnerOfficeResult,
  type PartnerOfficeSeat,
  type PartnerOfficeTicket,
  type ReferralMeResponse,
} from '../lib/platformClient';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';

type Tab = 'overview' | 'buy' | 'tickets' | 'results' | 'seats' | 'referrals' | 'credits' | 'payments';

const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'buy', label: 'Buy Tickets' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'results', label: 'Results' },
  { id: 'seats', label: 'Seats' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'credits', label: 'Credits' },
  { id: 'payments', label: 'Payments' },
];

const money = (amount?: number | null, currency = 'UZS') =>
  typeof amount === 'number' && Number.isFinite(amount) ? `${amount.toLocaleString()} ${currency}` : 'Not priced';

const isPaid = (status?: string | null) => ['paid', 'success', 'completed'].includes(String(status ?? '').trim().toLowerCase());

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

  const selectedExperience = useMemo(() => catalog.find((item) => item.id === experienceId) ?? null, [catalog, experienceId]);
  const selectedPlan = useMemo(() => plans.find((item) => item.id === seatPlanId) ?? null, [plans, seatPlanId]);

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
        setSuccess('Payment opened. Tickets will appear here after payment is confirmed.');
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

  const copy = async (value: string, message = 'Copied.') => {
    await navigator.clipboard.writeText(value);
    setSuccess(message);
  };

  const inviteUrl = (code: string) => `${window.location.origin}/candidate?code=${encodeURIComponent(code)}`;
  const referralUrl = referrals?.account?.referral_code
    ? `${window.location.origin}/?ref=${encodeURIComponent(referrals.account.referral_code)}`
    : '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Partner Office</p>
            <h1 className="text-2xl font-semibold">Tickets, seats, referrals, and credits</h1>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${tab === item.id ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {success && <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

        {pendingTransactionId && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>Pending {pendingKind}: {pendingTransactionId}</span>
            <button type="button" onClick={() => void checkPayment()} className="inline-flex items-center gap-2 rounded-md bg-amber-900 px-3 py-2 text-white">
              <CreditCard className="h-4 w-4" />
              Check payment
            </button>
          </div>
        )}

        {tab === 'overview' && (
          <section className="grid gap-4 md:grid-cols-5">
            {['tickets', 'results', 'seats', 'payments'].map((key) => (
              <div key={key} className="rounded-md border border-slate-200 bg-white p-4">
                <p className="text-sm capitalize text-slate-500">{key}</p>
                <p className="mt-2 text-3xl font-semibold">{dashboard?.counts?.[key] ?? 0}</p>
              </div>
            ))}
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Credit</p>
              <p className="mt-2 text-2xl font-semibold">{money(dashboard?.credit?.available_amount ?? credit.available_amount, 'UZS')}</p>
            </div>
          </section>
        )}

        {tab === 'buy' && (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <Ticket className="h-5 w-5 text-emerald-700" />
                <h2 className="text-lg font-semibold">Buy single-sitting mock tickets</h2>
              </div>
              <label className="block text-sm font-medium text-slate-700">Mock experience</label>
              <select value={experienceId} onChange={(e) => setExperienceId(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
                {catalog.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    {exp.product_name ? `${exp.product_name} - ` : ''}{exp.name} ({money(exp.price_amount, exp.price_currency ?? 'UZS')})
                  </option>
                ))}
              </select>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Quantity
                  <input type="number" min={1} max={200} value={ticketQuantity} onChange={(e) => setTicketQuantity(Number(e.target.value))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Expires in days
                  <input type="number" min={1} max={30} value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
                </label>
              </div>
              <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={ticketApplyCredit} onChange={(e) => setTicketApplyCredit(e.target.checked)} />
                Apply available credit ({money(credit.available_amount, credit.currency)})
              </label>
              <button type="button" onClick={() => void buyTickets()} disabled={loading || !selectedExperience?.is_ticket_ready} className="mt-5 inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-50">
                <CreditCard className="h-4 w-4" />
                Buy tickets
              </button>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-sky-700" />
                <h2 className="text-lg font-semibold">Buy subscription seats</h2>
              </div>
              <label className="block text-sm font-medium text-slate-700">Plan</label>
              <select value={seatPlanId} onChange={(e) => setSeatPlanId(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.products?.name ? `${plan.products.name} - ` : ''}{plan.name} ({money(plan.amount, plan.currency)})
                  </option>
                ))}
              </select>
              <label className="mt-4 block text-sm font-medium text-slate-700">
                Seats
                <input type="number" min={1} max={200} value={seatQuantity} onChange={(e) => setSeatQuantity(Number(e.target.value))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
              </label>
              <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={seatApplyCredit} onChange={(e) => setSeatApplyCredit(e.target.checked)} />
                Apply available credit ({money(credit.available_amount, credit.currency)})
              </label>
              <button type="button" onClick={() => void buySeats()} disabled={loading || !selectedPlan} className="mt-5 inline-flex items-center gap-2 rounded-md bg-sky-700 px-4 py-2 font-medium text-white disabled:opacity-50">
                <CreditCard className="h-4 w-4" />
                Buy seats
              </button>
            </div>
          </section>
        )}

        {tab === 'tickets' && (
          <section className="rounded-md border border-slate-200 bg-white">
            {tickets.map((ticket) => (
              <div key={ticket.id} className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <p className="font-mono text-lg font-semibold">{ticket.token_code}</p>
                  <p className="text-sm text-slate-500">{ticket.experiences?.name ?? 'Mock'} · {ticket.status} · uses {ticket.uses_count}/{ticket.max_uses}</p>
                </div>
                <button type="button" onClick={() => void copy(inviteUrl(ticket.token_code), 'Candidate link copied.')} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
                  <Copy className="h-4 w-4" />
                  Copy link
                </button>
                <a href={inviteUrl(ticket.token_code)} className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm text-white">
                  <Send className="h-4 w-4" />
                  Open
                </a>
              </div>
            ))}
            {tickets.length === 0 && <p className="p-6 text-sm text-slate-500">No tickets yet.</p>}
          </section>
        )}

        {tab === 'results' && (
          <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-left text-slate-600">
                <tr><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Ticket</th><th className="px-4 py-3">Mock</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((row) => (
                  <tr key={row.id}><td className="px-4 py-3">{row.candidate_name || row.email}</td><td className="px-4 py-3 font-mono">{row.token_code}</td><td className="px-4 py-3">{row.experience_name}</td><td className="px-4 py-3">{row.overall_band ?? '-'}</td><td className="px-4 py-3">{row.session_status ?? row.registration_status}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === 'seats' && (
          <section className="rounded-md border border-slate-200 bg-white">
            {seats.map((seat) => (
              <div key={seat.id} className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[1fr_280px_auto] md:items-center">
                <div><p className="font-semibold">{seat.plans?.name ?? 'Seat'}</p><p className="text-sm text-slate-500">{seat.status} · {seat.assigned_user?.email ?? 'Unassigned'}</p></div>
                <input value={seatEmails[seat.id] ?? ''} onChange={(e) => setSeatEmails((prev) => ({ ...prev, [seat.id]: e.target.value }))} placeholder="student@email.com" className="rounded-md border border-slate-300 px-3 py-2 text-sm" disabled={seat.status !== 'unassigned'} />
                <button type="button" onClick={() => void assignSeat(seat.id)} disabled={seat.status !== 'unassigned'} className="rounded-md bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-40">Assign</button>
              </div>
            ))}
            {seats.length === 0 && <p className="p-6 text-sm text-slate-500">No seats yet.</p>}
          </section>
        )}

        {tab === 'referrals' && (
          <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <div className="rounded-md border border-slate-200 bg-white p-5">
              <p className="text-sm text-slate-500">Your referral code</p>
              <p className="mt-2 font-mono text-3xl font-semibold">{referrals?.account?.referral_code ?? '-'}</p>
              <button type="button" onClick={() => referralUrl && void copy(referralUrl, 'Referral link copied.')} className="mt-4 inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm">
                <Copy className="h-4 w-4" />
                Copy referral link
              </button>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-5">
              <p className="font-semibold">Program status: {referrals?.program?.status ?? 'not configured'}</p>
              <p className="mt-2 text-sm text-slate-500">Available credit: {money(referrals?.credit?.available_amount ?? 0, referrals?.credit?.currency ?? 'UZS')}</p>
              <div className="mt-4 divide-y divide-slate-100">
                {(referrals?.rewards ?? []).slice(0, 8).map((reward: any) => (
                  <div key={reward.id} className="py-3 text-sm">
                    {money(reward.credit_amount, reward.currency)} · {reward.status}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {tab === 'credits' && (
          <section className="rounded-md border border-slate-200 bg-white">
            <div className="border-b border-slate-100 p-4 font-semibold">Available: {money(credit.available_amount, credit.currency)}</div>
            {(referrals?.ledger ?? []).map((entry) => (
              <div key={entry.id} className="grid grid-cols-4 gap-3 border-b border-slate-100 p-4 text-sm">
                <span>{entry.entry_kind}</span><span>{entry.status}</span><span>{money(entry.amount, entry.currency)}</span><span>{new Date(entry.created_at).toLocaleString()}</span>
              </div>
            ))}
          </section>
        )}

        {tab === 'payments' && (
          <section className="rounded-md border border-slate-200 bg-white">
            {payments.map((payment) => (
              <div key={payment.id} className="grid gap-2 border-b border-slate-100 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <p className="font-semibold">{payment.purchase_type ?? 'plan'} · {payment.status}</p>
                  <p className="font-mono text-xs text-slate-500">{payment.provider_transaction_id}</p>
                </div>
                <span>{money(payment.final_amount ?? payment.amount, payment.currency)}</span>
                <span className="text-sm text-slate-500">{new Date(payment.created_at).toLocaleString()}</span>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
};
