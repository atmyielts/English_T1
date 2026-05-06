import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  ClipboardList,
  Coins,
  Copy,
  CreditCard,
  Download,
  Link2,
  Paintbrush,
  ReceiptText,
  RefreshCw,
  Save,
  Ticket,
  Trash2,
  UserPlus,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SiteHeader, type SiteHeaderAction } from '../components/layout/SiteHeader';
import { supabase } from '../lib/supabase';
import {
  partnerOfficeApplyCenter,
  partnerOfficeAcceptStaffInvites,
  partnerOfficeCatalog,
  partnerOfficeCenter,
  partnerOfficeCreateSeatPurchase,
  partnerOfficeCreateTicketPurchase,
  partnerOfficeCreateVoucherBatch,
  partnerOfficeCreateWalletTopup,
  partnerOfficeDashboard,
  partnerOfficeExportReport,
  partnerOfficePayments,
  partnerOfficePlans,
  partnerOfficeReports,
  partnerOfficeInviteStaff,
  partnerOfficeRequestCashPayout,
  partnerOfficeResults,
  partnerOfficeSeats,
  partnerOfficeStaff,
  partnerOfficeStudents,
  partnerOfficeTickets,
  partnerOfficeUpdateCenter,
  partnerOfficeUpdateStaff,
  partnerOfficeUploadCenterLogo,
  partnerOfficeVoidVoucher,
  partnerOfficeVoucherBatches,
  partnerOfficeVouchers,
  partnerOfficeWallet,
  tspayStatus,
  type PartnerCenterProfile,
  type PartnerCenterStaffInvite,
  type PartnerCenterStaffMember,
  type PartnerCreditLedgerEntry,
  type PartnerOfficeExperience,
  type PartnerOfficePayment,
  type PartnerOfficePlan,
  type PartnerOfficeResult,
  type PartnerReportSummary,
  type PartnerStudent,
  type PartnerVoucher,
  type PartnerVoucherBatch,
} from '../lib/platformClient';

type Tab = 'overview' | 'wallet' | 'buy' | 'vouchers' | 'students' | 'staff' | 'results' | 'reports' | 'branding' | 'payments';

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'wallet', label: 'Wallet', icon: WalletCards },
  { id: 'buy', label: 'Buy', icon: CreditCard },
  { id: 'vouchers', label: 'Vouchers', icon: Ticket },
  { id: 'students', label: 'Students', icon: UsersRound },
  { id: 'staff', label: 'Staff', icon: UserPlus },
  { id: 'results', label: 'Results', icon: ClipboardList },
  { id: 'reports', label: 'Reports', icon: Download },
  { id: 'branding', label: 'Branding', icon: Paintbrush },
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
  typeof amount === 'number' && Number.isFinite(amount) ? `${amount.toLocaleString()} ${currency}` : '-';

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

const isPaid = (status?: string | null) => ['paid', 'success', 'completed'].includes(String(status ?? '').trim().toLowerCase());

const statusTone = (status?: string | null) => {
  const normalized = String(status ?? '').toLowerCase();
  if (['active', 'paid', 'success', 'completed', 'issued', 'unused', 'unassigned', 'redeemed'].includes(normalized)) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (['pending', 'reserved', 'processing'].includes(normalized)) return 'border-amber-200 bg-amber-50 text-amber-900';
  if (['claimed', 'assigned'].includes(normalized)) return 'border-sky-200 bg-sky-50 text-sky-800';
  if (['failed', 'canceled', 'cancelled', 'expired', 'void', 'disabled'].includes(normalized)) return 'border-red-200 bg-red-50 text-red-700';
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

export const CenterOfficePage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [center, setCenter] = useState<PartnerCenterProfile | null>(null);
  const [catalog, setCatalog] = useState<PartnerOfficeExperience[]>([]);
  const [plans, setPlans] = useState<PartnerOfficePlan[]>([]);
  const [payments, setPayments] = useState<PartnerOfficePayment[]>([]);
  const [results, setResults] = useState<PartnerOfficeResult[]>([]);
  const [reports, setReports] = useState<PartnerReportSummary | null>(null);
  const [batches, setBatches] = useState<PartnerVoucherBatch[]>([]);
  const [vouchers, setVouchers] = useState<PartnerVoucher[]>([]);
  const [students, setStudents] = useState<PartnerStudent[]>([]);
  const [staffMembers, setStaffMembers] = useState<PartnerCenterStaffMember[]>([]);
  const [staffInvites, setStaffInvites] = useState<PartnerCenterStaffInvite[]>([]);
  const [wallet, setWallet] = useState<{ currency: string; available_amount: number }>({ currency: 'UZS', available_amount: 0 });
  const [ledger, setLedger] = useState<PartnerCreditLedgerEntry[]>([]);
  const [dashboard, setDashboard] = useState<{ counts: Record<string, number>; wallet?: { currency: string; available_amount: number } } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<'tickets' | 'seats' | null>(null);

  const [ticketForm, setTicketForm] = useState({ experience_id: '', quantity: 10, expires_in_days: 30, apply_credit: true });
  const [seatForm, setSeatForm] = useState({ plan_id: '', seat_count: 10, apply_credit: true });
  const [voucherForm, setVoucherForm] = useState({
    access_kind: 'mock_exam' as 'mock_exam' | 'subscription' | 'seat',
    experience_id: '',
    plan_id: '',
    quantity: 10,
    expires_in_days: 30,
    prefix: 'SCH',
    source_model: 'prepaid_wallet',
  });
  const [walletTopup, setWalletTopup] = useState({ amount: 1000000, note: '' });
  const [brandingForm, setBrandingForm] = useState({ display_name: '', slug: '', logo_url: '', public_instructions: '', powered_by_schood: true });
  const [cashPayout, setCashPayout] = useState({ payout_method: 'cash', payout_details: '', note: '' });
  const [staffForm, setStaffForm] = useState({ email: '', role: 'member' as 'admin' | 'member' });
  const [logoUploading, setLogoUploading] = useState(false);
  const [applicationForm, setApplicationForm] = useState({
    display_name: '',
    slug: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    public_instructions: 'Enter your Schood voucher code to start your exam or activate your learning access.',
  });

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const centerUrl = center?.slug ? `${origin}/center/${center.slug}` : '';
  const redeemUrl = (code?: string | null) => `${origin}/redeem${code ? `/${encodeURIComponent(code)}` : ''}`;
  const centerTenantId = center?.tenant_id ?? null;
  const centerIsActive = center?.status === 'active';

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
        navigate(`/auth?returnTo=${encodeURIComponent('/center-office')}`, { replace: true });
        return;
      }
      await partnerOfficeAcceptStaffInvites(token).catch(() => null);
      const centerRes = await partnerOfficeCenter(token);
      setCenter(centerRes.center);
      if (!centerRes.center?.tenant_id) {
        const { data } = await supabase.auth.getUser();
        setApplicationForm((prev) => ({
          ...prev,
          contact_email: prev.contact_email || data.user?.email || '',
          contact_name: prev.contact_name || String(data.user?.user_metadata?.full_name ?? data.user?.user_metadata?.name ?? ''),
        }));
        setDashboard(null);
        setPayments([]);
        setWallet({ currency: 'UZS', available_amount: 0 });
        setLedger([]);
        setVouchers([]);
        setBatches([]);
        setStudents([]);
        setStaffMembers([]);
        setStaffInvites([]);
        setResults([]);
        setReports(null);
        return;
      }

      const tenant_id = centerRes.center.tenant_id;
      const [dashRes, catalogRes, plansRes, ticketRes, seatRes, paymentRes, walletRes, voucherRes, batchRes, studentRes, staffRes, resultRes, reportRes] =
        await Promise.all([
          partnerOfficeDashboard(token, tenant_id),
          partnerOfficeCatalog(token),
          partnerOfficePlans(token),
          partnerOfficeTickets(token, tenant_id),
          partnerOfficeSeats(token, tenant_id),
          partnerOfficePayments(token, tenant_id),
          partnerOfficeWallet(token, tenant_id),
          partnerOfficeVouchers(token, { tenant_id }),
          partnerOfficeVoucherBatches(token, tenant_id),
          partnerOfficeStudents(token, tenant_id),
          partnerOfficeStaff(token, tenant_id).catch(() => ({ members: [], invites: [] })),
          partnerOfficeResults(token, { tenant_id }),
          partnerOfficeReports(token, tenant_id),
        ]);

      setDashboard(dashRes);
      setCatalog(catalogRes.experiences ?? []);
      setPlans(plansRes.plans ?? catalogRes.plans ?? []);
      void ticketRes;
      void seatRes;
      setPayments(paymentRes.payments ?? []);
      setWallet(walletRes.wallet ?? dashRes.wallet ?? { currency: 'UZS', available_amount: 0 });
      setLedger(walletRes.ledger ?? []);
      setVouchers(voucherRes.vouchers ?? []);
      setBatches(batchRes.batches ?? []);
      setStudents(studentRes.students ?? []);
      setStaffMembers(staffRes.members ?? []);
      setStaffInvites(staffRes.invites ?? []);
      setResults(resultRes.results ?? []);
      setReports(reportRes.reports ?? null);

      const firstExperience = catalogRes.experiences?.[0]?.id ?? '';
      const firstPlan = (plansRes.plans ?? catalogRes.plans ?? [])[0]?.id ?? '';
      setTicketForm((prev) => ({ ...prev, experience_id: prev.experience_id || firstExperience }));
      setSeatForm((prev) => ({ ...prev, plan_id: prev.plan_id || firstPlan }));
      setVoucherForm((prev) => ({ ...prev, experience_id: prev.experience_id || firstExperience, plan_id: prev.plan_id || firstPlan }));
      setBrandingForm({
        display_name: centerRes.center.display_name ?? '',
        slug: centerRes.center.slug ?? '',
        logo_url: centerRes.center.logo_url ?? '',
        public_instructions: centerRes.center.public_instructions ?? '',
        powered_by_schood: Boolean(centerRes.center.powered_by_schood),
      });
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

  const copy = async (value: string, message = 'Copied.') => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setSuccess(message);
  };

  const openPayment = (url: string | null) => {
    if (!url) return;
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) setError('Popup blocked. Use the payment link from the Payments tab.');
  };

  const buyTickets = async () => {
    const token = await getValidToken();
    if (!token || !ticketForm.experience_id || !centerTenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeCreateTicketPurchase(token, { ...ticketForm, tenant_id: centerTenantId, center_office: true });
      setPendingTransactionId(res.transaction_id);
      setPendingKind('tickets');
      if (res.payment_url) {
        openPayment(res.payment_url);
        setSuccess('Payment opened. Mock tickets will appear after payment is confirmed.');
      } else if (isPaid(res.status)) {
        await refreshAll();
        setSuccess('Mock tickets generated.');
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const buySeats = async () => {
    const token = await getValidToken();
    if (!token || !seatForm.plan_id || !centerTenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeCreateSeatPurchase(token, { ...seatForm, tenant_id: centerTenantId, center_office: true });
      setPendingTransactionId(res.transaction_id);
      setPendingKind('seats');
      if (res.payment_url) {
        openPayment(res.payment_url);
        setSuccess('Payment opened. Seats will appear after payment is confirmed.');
      } else if (isPaid(res.status)) {
        await refreshAll();
        setSuccess('Seats added.');
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
        setSuccess(pendingKind === 'seats' ? 'Seats added.' : 'Mock tickets generated.');
      } else {
        setSuccess(`Payment status: ${res.status}`);
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const createVoucherBatch = async () => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        ...voucherForm,
        tenant_id: centerTenantId,
        center_office: true,
        experience_id: voucherForm.access_kind === 'mock_exam' ? voucherForm.experience_id : null,
        plan_id: voucherForm.access_kind === 'mock_exam' ? null : voucherForm.plan_id,
      };
      const res = await partnerOfficeCreateVoucherBatch(token, payload);
      await refreshAll();
      setTab('vouchers');
      setSuccess(`Created ${res.vouchers.length} vouchers in ${res.batch.batch_code}.`);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const requestTopup = async () => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await partnerOfficeCreateWalletTopup(token, { tenant_id: centerTenantId, amount: walletTopup.amount, currency: wallet.currency, note: walletTopup.note, center_office: true });
      await refreshAll();
      setSuccess('Top-up request recorded. Admin settlement is required before funds become available.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const saveBranding = async () => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeUpdateCenter(token, { ...brandingForm, tenant_id: centerTenantId, center_office: true });
      setCenter(res.center);
      setSuccess('Center branding saved.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const voidVoucher = async (voucherId: string) => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await partnerOfficeVoidVoucher(token, { tenant_id: centerTenantId, voucher_id: voucherId, reason: 'voided_from_center_office', center_office: true });
      await refreshAll();
      setSuccess('Voucher voided.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async () => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    setError(null);
    try {
      const res = await partnerOfficeExportReport(token, centerTenantId, true);
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess('Report exported.');
    } catch (err) {
      setError(parseError(err));
    }
  };

  const requestCashPayout = async () => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await partnerOfficeRequestCashPayout(token, {
        tenant_id: centerTenantId,
        center_office: true,
        payout_method: cashPayout.payout_method,
        payout_details: cashPayout.payout_details.trim() ? { instructions: cashPayout.payout_details.trim() } : {},
        note: cashPayout.note.trim() || null,
      });
      setSuccess('Cash payout request sent.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const applyForCenter = async () => {
    const token = await getValidToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeApplyCenter(token, applicationForm);
      setCenter(res.center);
      setBrandingForm({
        display_name: res.center.display_name ?? '',
        slug: res.center.slug ?? '',
        logo_url: res.center.logo_url ?? '',
        public_instructions: res.center.public_instructions ?? '',
        powered_by_schood: Boolean(res.center.powered_by_schood),
      });
      setSuccess('Center profile submitted. Schood admin approval is required before workspace tools unlock.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const uploadLogo = async (file?: File | null) => {
    const token = await getValidToken();
    if (!token || !centerTenantId || !file) return;
    setLogoUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeUploadCenterLogo(token, centerTenantId, file);
      setCenter(res.center);
      setBrandingForm((prev) => ({ ...prev, logo_url: res.logo_url ?? res.center.logo_url ?? '' }));
      setSuccess('Logo uploaded and saved.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLogoUploading(false);
    }
  };

  const inviteStaff = async () => {
    const token = await getValidToken();
    if (!token || !centerTenantId || !staffForm.email.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeInviteStaff(token, { tenant_id: centerTenantId, email: staffForm.email.trim(), role: staffForm.role });
      setStaffMembers(res.members ?? []);
      setStaffInvites(res.invites ?? []);
      setStaffForm({ email: '', role: 'member' });
      setSuccess('Staff access updated. If the email is not registered yet, an invite is waiting for that account.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const updateStaff = async (membership_id: string, patch: { role?: 'admin' | 'member'; status?: 'active' | 'disabled' }) => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeUpdateStaff(token, { tenant_id: centerTenantId, membership_id, ...patch });
      setStaffMembers(res.members ?? []);
      setStaffInvites(res.invites ?? []);
      setSuccess('Staff access saved.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const selectedExperience = useMemo(() => catalog.find((item) => item.id === ticketForm.experience_id), [catalog, ticketForm.experience_id]);
  const selectedPlan = useMemo(() => plans.find((item) => item.id === seatForm.plan_id), [plans, seatForm.plan_id]);
  const recentVouchers = vouchers.slice(0, 12);

  const headerActions: SiteHeaderAction[] = [
    { id: 'account', label: 'Account', onClick: () => navigate('/account'), primary: true },
  ];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SiteHeader actions={headerActions} brandLabel="schood center" />

      <main className="px-6 pb-16 pt-8 md:px-10">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className={`${panelClass} p-6 md:p-8`}>
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-900 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-800">
                <Building2 className="h-4 w-4" />
                {center?.display_name ?? 'Education Center Office'}
              </div>
              <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight text-gray-900 md:text-5xl">
                Sell access, distribute vouchers, and monitor student outcomes.
              </h1>
              <p className="mt-4 max-w-2xl text-base text-gray-600">
                Manage mock exams, subscription access, seats, wallet activity, branded center pages, reports, and partner payments from one workspace.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => setTab('buy')} className={primaryButton} disabled={!centerIsActive}>
                  <CreditCard className="h-4 w-4" />
                  Buy or generate
                </button>
                <button type="button" onClick={() => centerUrl && window.open(centerUrl, '_blank', 'noopener,noreferrer')} disabled={!centerUrl} className={secondaryButton}>
                  <ArrowUpRight className="h-4 w-4" />
                  Center page
                </button>
                <button type="button" onClick={() => void refreshAll()} className={secondaryButton} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-900 bg-[#0f172a] p-6 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Partner wallet</p>
              <p className="mt-3 text-3xl font-bold">{money(wallet.available_amount, wallet.currency)}</p>
              <div className="mt-6 rounded-2xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Public center page</p>
                <p className="mt-2 break-all font-mono text-sm">{centerUrl || '-'}</p>
                <button type="button" onClick={() => void copy(centerUrl, 'Center page copied.')} disabled={!centerUrl} className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/30 px-3 py-2 text-sm font-semibold text-white">
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
              </div>
            </div>
          </section>

          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

          {centerIsActive ? (
            <nav className={`${panelClass} flex flex-wrap gap-2 p-3`}>
              {tabs.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition ${
                      tab === item.id ? 'border-gray-900 bg-[#0f172a] text-white' : 'border-gray-900/20 bg-white/80 text-gray-800 hover:border-gray-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          ) : null}

          {!center ? (
            <section className={`${panelClass} p-6 md:p-8`}>
              <SectionTitle icon={Building2} label="Center application" title="Create your education center profile" />
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-gray-800">Center name<input value={applicationForm.display_name} onChange={(e) => setApplicationForm((prev) => ({ ...prev, display_name: e.target.value }))} className={inputClass} /></label>
                <label className="text-sm font-semibold text-gray-800">Public slug<input value={applicationForm.slug} onChange={(e) => setApplicationForm((prev) => ({ ...prev, slug: e.target.value }))} className={inputClass} placeholder="atlas-academy" /></label>
                <label className="text-sm font-semibold text-gray-800">Contact name<input value={applicationForm.contact_name} onChange={(e) => setApplicationForm((prev) => ({ ...prev, contact_name: e.target.value }))} className={inputClass} /></label>
                <label className="text-sm font-semibold text-gray-800">Contact email<input value={applicationForm.contact_email} onChange={(e) => setApplicationForm((prev) => ({ ...prev, contact_email: e.target.value }))} className={inputClass} /></label>
                <label className="text-sm font-semibold text-gray-800 md:col-span-2">Contact phone<input value={applicationForm.contact_phone} onChange={(e) => setApplicationForm((prev) => ({ ...prev, contact_phone: e.target.value }))} className={inputClass} /></label>
                <label className="text-sm font-semibold text-gray-800 md:col-span-2">Student instructions<textarea value={applicationForm.public_instructions} onChange={(e) => setApplicationForm((prev) => ({ ...prev, public_instructions: e.target.value }))} className={`${inputClass} min-h-[110px]`} /></label>
              </div>
              <button type="button" onClick={() => void applyForCenter()} disabled={loading || !applicationForm.display_name.trim()} className={`${primaryButton} mt-6`}>
                <Building2 className="h-4 w-4" />
                Submit for approval
              </button>
            </section>
          ) : !centerIsActive ? (
            <section className={`${panelClass} p-6 md:p-8`}>
              <SectionTitle icon={Building2} label={`Status: ${center.status}`} title="Waiting for Schood approval" />
              <p className="mt-4 max-w-2xl text-sm text-gray-600">
                Your center profile exists, but wallet top-ups, code generation, student reports, and payouts unlock only after a Schood admin approves the center and assigns a pricing tier.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <StatusPill status={center.status} />
                <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4 text-sm"><span className="font-semibold">Tier:</span> {center.package_tier}</div>
                <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4 text-sm"><span className="font-semibold">Model:</span> {center.commercial_model.replace('_', ' ')}</div>
              </div>
            </section>
          ) : null}

          {centerIsActive && tab === 'overview' ? (
            <section className="space-y-5">
              <div className="grid gap-4 md:grid-cols-4">
                <StatCard label="Wallet" value={money(wallet.available_amount, wallet.currency)} icon={WalletCards} tone="dark" />
                <StatCard label="Unused vouchers" value={dashboard?.counts?.vouchers_unused ?? 0} icon={Ticket} />
                <StatCard label="Redeemed" value={dashboard?.counts?.vouchers_redeemed ?? 0} icon={UsersRound} />
                <StatCard label="Completed exams" value={reports?.completed_exams ?? dashboard?.counts?.results ?? 0} icon={ClipboardList} />
              </div>
              <div className={`${panelClass} overflow-hidden`}>
                <div className="border-b border-gray-900/10 p-5 md:p-6">
                  <SectionTitle icon={Ticket} label="Recent inventory" title="Latest vouchers" />
                </div>
                <VoucherTable vouchers={recentVouchers} onCopy={(code) => void copy(redeemUrl(code), 'Redeem link copied.')} onVoid={(id) => void voidVoucher(id)} />
              </div>
            </section>
          ) : null}

          {centerIsActive && tab === 'wallet' ? (
            <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
              <div className={`${panelClass} p-5 md:p-6`}>
                <SectionTitle icon={WalletCards} label="Prepaid wallet" title="Request top-up" />
                <label className="mt-5 block text-sm font-semibold text-gray-800">
                  Amount
                  <input type="number" min={1} value={walletTopup.amount} onChange={(e) => setWalletTopup((prev) => ({ ...prev, amount: Number(e.target.value) }))} className={inputClass} />
                </label>
                <label className="mt-4 block text-sm font-semibold text-gray-800">
                  Note
                  <textarea value={walletTopup.note} onChange={(e) => setWalletTopup((prev) => ({ ...prev, note: e.target.value }))} className={`${inputClass} min-h-[90px]`} />
                </label>
                <button type="button" onClick={() => void requestTopup()} disabled={loading} className={`${primaryButton} mt-5 w-full`}>
                  <WalletCards className="h-4 w-4" />
                  Request top-up
                </button>
                <p className="mt-3 text-xs text-gray-500">Top-up requests require admin settlement before they become available balance.</p>
              </div>
              <LedgerPanel ledger={ledger} />
            </section>
          ) : null}

          {centerIsActive && tab === 'buy' ? (
            <section className="grid gap-5 lg:grid-cols-3">
              <BuyMockPanel
                catalog={catalog}
                form={ticketForm}
                selected={selectedExperience}
                loading={loading}
                pending={pendingKind === 'tickets' ? pendingTransactionId : null}
                onChange={setTicketForm}
                onBuy={() => void buyTickets()}
                onCheck={() => void checkPayment()}
              />
              <BuySeatPanel
                plans={plans}
                form={seatForm}
                selected={selectedPlan}
                loading={loading}
                pending={pendingKind === 'seats' ? pendingTransactionId : null}
                onChange={setSeatForm}
                onBuy={() => void buySeats()}
                onCheck={() => void checkPayment()}
              />
              <VoucherGeneratorPanel
                catalog={catalog}
                plans={plans}
                wallet={wallet}
                form={voucherForm}
                loading={loading}
                onChange={setVoucherForm}
                onCreate={() => void createVoucherBatch()}
              />
            </section>
          ) : null}

          {centerIsActive && tab === 'vouchers' ? (
            <section className="space-y-5">
              <div className={`${panelClass} overflow-hidden`}>
                <div className="border-b border-gray-900/10 p-5 md:p-6">
                  <SectionTitle icon={Ticket} label="Distribution" title="Voucher codes" />
                </div>
                <VoucherTable vouchers={vouchers} onCopy={(code) => void copy(redeemUrl(code), 'Redeem link copied.')} onVoid={(id) => void voidVoucher(id)} />
              </div>
              <div className={`${panelClass} overflow-hidden`}>
                <div className="border-b border-gray-900/10 p-5 md:p-6">
                  <SectionTitle icon={ReceiptText} label="Batches" title="Voucher batches" />
                </div>
                <div className="divide-y divide-gray-900/10">
                  {batches.map((batch) => (
                    <div key={batch.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <div>
                        <p className="font-mono font-bold">{batch.batch_code}</p>
                        <p className="mt-1 text-sm text-gray-600">
                          {batch.access_kind.replace('_', ' ')} - {batch.quantity} codes - expires {formatDate(batch.expires_at)}
                        </p>
                      </div>
                      <StatusPill status={batch.status} />
                      <span className="text-sm font-semibold">{String((batch.metadata as any)?.total_amount ?? 0).toLocaleString()} {(batch.metadata as any)?.currency ?? 'UZS'}</span>
                    </div>
                  ))}
                  {batches.length === 0 ? <div className="p-6"><EmptyState icon={Ticket} title="No batches yet" note="Generated voucher batches will appear here." /></div> : null}
                </div>
              </div>
            </section>
          ) : null}

          {centerIsActive && tab === 'students' ? (
            <section className={`${panelClass} overflow-hidden`}>
              <div className="border-b border-gray-900/10 p-5 md:p-6">
                <SectionTitle icon={UsersRound} label="Students" title="Assigned and redeemed students" />
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-900/10 text-sm">
                  <thead className="bg-[#efe6d8]/70 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                    <tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Access</th><th className="px-5 py-3">Voucher</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Expires</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-900/10 bg-white/60">
                    {students.map((row) => (
                      <tr key={row.id}>
                        <td className="px-5 py-4"><p className="font-semibold">{row.name || row.email || 'Student'}</p><p className="text-xs text-gray-500">{row.email}</p></td>
                        <td className="px-5 py-4">{row.product_name ?? row.access_kind}</td>
                        <td className="px-5 py-4 font-mono">{row.voucher_code}</td>
                        <td className="px-5 py-4"><StatusPill status={row.status} /></td>
                        <td className="px-5 py-4">{formatDate(row.expires_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {students.length === 0 ? <div className="p-6"><EmptyState icon={UsersRound} title="No students yet" note="Assigned and redeemed students will appear here." /></div> : null}
            </section>
          ) : null}

          {centerIsActive && tab === 'staff' ? (
            <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
              <div className={`${panelClass} p-5 md:p-6`}>
                <SectionTitle icon={UserPlus} label="Staff access" title="Invite center staff" />
                <label className="mt-5 block text-sm font-semibold text-gray-800">
                  Email
                  <input value={staffForm.email} onChange={(e) => setStaffForm((prev) => ({ ...prev, email: e.target.value }))} className={inputClass} placeholder="teacher@center.uz" />
                </label>
                <label className="mt-4 block text-sm font-semibold text-gray-800">
                  Role
                  <select value={staffForm.role} onChange={(e) => setStaffForm((prev) => ({ ...prev, role: e.target.value as 'admin' | 'member' }))} className={inputClass}>
                    <option value="member">Teacher / member</option>
                    <option value="admin">Center admin</option>
                  </select>
                </label>
                <button type="button" onClick={() => void inviteStaff()} disabled={loading || !staffForm.email.trim()} className={`${primaryButton} mt-5 w-full`}>
                  <UserPlus className="h-4 w-4" />
                  Add staff
                </button>
                <p className="mt-3 text-xs leading-5 text-gray-500">
                  Registered emails get access immediately. New staff can sign up with the same email and their pending invite will attach automatically.
                </p>
              </div>

              <div className={`${panelClass} overflow-hidden`}>
                <div className="border-b border-gray-900/10 p-5 md:p-6">
                  <SectionTitle icon={UsersRound} label="Team" title="Center staff and pending invites" />
                </div>
                <div className="divide-y divide-gray-900/10">
                  {staffMembers.map((member) => (
                    <div key={member.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <div>
                        <p className="font-semibold">{member.users?.full_name || member.users?.email || member.user_id}</p>
                        <p className="text-xs text-gray-500">{member.users?.email ?? member.user_id}</p>
                      </div>
                      <select
                        value={member.role}
                        onChange={(e) => void updateStaff(member.id, { role: e.target.value as 'admin' | 'member' })}
                        disabled={member.role === 'owner'}
                        className="rounded-xl border border-gray-900/20 bg-white px-3 py-2 text-sm capitalize"
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void updateStaff(member.id, { status: member.status === 'active' ? 'disabled' : 'active' })}
                        disabled={member.role === 'owner'}
                        className={secondaryButton}
                      >
                        {member.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  ))}
                  {staffInvites.map((invite) => (
                    <div key={invite.id} className="grid gap-3 bg-amber-50/60 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <div>
                        <p className="font-semibold">{invite.email}</p>
                        <p className="text-xs text-gray-500">Pending invite - expires {formatDate(invite.expires_at)}</p>
                      </div>
                      <span className="text-sm font-semibold capitalize">{invite.role}</span>
                      <StatusPill status={invite.status} />
                    </div>
                  ))}
                  {staffMembers.length === 0 && staffInvites.length === 0 ? (
                    <div className="p-6"><EmptyState icon={UsersRound} title="No staff yet" note="Add center staff so teachers and office managers can help manage student access." /></div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {centerIsActive && tab === 'results' ? <ResultsPanel results={results} /> : null}

          {centerIsActive && tab === 'reports' ? (
            <section className="space-y-5">
              <div className="grid gap-4 md:grid-cols-5">
                <StatCard label="Completed" value={reports?.completed_exams ?? 0} icon={ClipboardList} />
                <StatCard label="Average score" value={reports?.average_score ?? '-'} icon={BarChart3} />
                <StatCard label="Active students" value={reports?.active_students ?? 0} icon={UsersRound} />
                <StatCard label="Inactive vouchers" value={reports?.inactive_vouchers ?? 0} icon={Ticket} />
                <StatCard label="Expiring soon" value={reports?.expiring_vouchers ?? 0} icon={ReceiptText} />
              </div>
              <div className={`${panelClass} p-5 md:p-6`}>
                <SectionTitle
                  icon={Download}
                  label="Export"
                  title="Teacher-ready reports"
                  action={<button type="button" onClick={() => void exportReport()} className={primaryButton}><Download className="h-4 w-4" />Export CSV</button>}
                />
                <p className="mt-4 text-sm text-gray-600">The export includes candidate names, email, voucher code, exam, status, score, and completion date for offline teacher review.</p>
              </div>
            </section>
          ) : null}

          {centerIsActive && tab === 'branding' ? (
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className={`${panelClass} p-5 md:p-6`}>
                <SectionTitle icon={Paintbrush} label="Center profile" title="Branding and instructions" />
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-semibold text-gray-800">Center name<input value={brandingForm.display_name} onChange={(e) => setBrandingForm((prev) => ({ ...prev, display_name: e.target.value }))} className={inputClass} /></label>
                  <label className="text-sm font-semibold text-gray-800">Slug<input value={brandingForm.slug} onChange={(e) => setBrandingForm((prev) => ({ ...prev, slug: e.target.value }))} className={inputClass} /></label>
                  <div className="md:col-span-2 rounded-2xl border border-gray-900/15 bg-white/80 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Center logo</p>
                        <p className="mt-1 text-xs leading-5 text-gray-600">
                          Use a transparent PNG or WebP when possible. A square logo around 512x512px with comfortable padding looks best; keep the file under 3MB.
                        </p>
                      </div>
                      {brandingForm.logo_url ? <img src={brandingForm.logo_url} alt="" className="h-14 w-14 rounded-2xl border border-gray-900/10 bg-white object-contain p-1" /> : null}
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/webp,image/jpeg,image/svg+xml"
                      onChange={(e) => void uploadLogo(e.target.files?.[0])}
                      disabled={logoUploading}
                      className="mt-4 block w-full text-sm text-gray-700 file:mr-4 file:rounded-full file:border-0 file:bg-[#0f172a] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                    />
                    {logoUploading ? <p className="mt-2 text-xs text-gray-500">Uploading logo...</p> : null}
                  </div>
                  <label className="md:col-span-2 text-sm font-semibold text-gray-800">Public instructions<textarea value={brandingForm.public_instructions} onChange={(e) => setBrandingForm((prev) => ({ ...prev, public_instructions: e.target.value }))} className={`${inputClass} min-h-[120px]`} /></label>
                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-900/15 bg-white/80 px-4 py-3 text-sm font-semibold text-gray-800">
                    <span>Powered by Schood</span>
                    <input type="checkbox" checked={brandingForm.powered_by_schood} onChange={(e) => setBrandingForm((prev) => ({ ...prev, powered_by_schood: e.target.checked }))} className="h-5 w-5 accent-[#0f172a]" />
                  </label>
                </div>
                <button type="button" onClick={() => void saveBranding()} disabled={loading} className={`${primaryButton} mt-5`}>
                  <Save className="h-4 w-4" />
                  Save branding
                </button>
              </div>
              <div className={`${panelClass} p-5 md:p-6`}>
                <SectionTitle icon={Link2} label="Public page" title="Links" />
                <div className="mt-5 space-y-3">
                  <button type="button" onClick={() => void copy(centerUrl, 'Center page copied.')} className={`${secondaryButton} w-full`} disabled={!centerUrl}><Copy className="h-4 w-4" />Copy center page</button>
                  <button type="button" onClick={() => void copy(`${origin}/redeem`, 'Redeem page copied.')} className={`${secondaryButton} w-full`}><Copy className="h-4 w-4" />Copy redeem page</button>
                  <button type="button" onClick={() => centerUrl && window.open(centerUrl, '_blank', 'noopener,noreferrer')} className={`${primaryButton} w-full`} disabled={!centerUrl}><ArrowUpRight className="h-4 w-4" />Open public page</button>
                </div>
              </div>
            </section>
          ) : null}

          {centerIsActive && tab === 'payments' ? (
            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <PaymentsPanel payments={payments} />
              <div className={`${panelClass} p-5 md:p-6`}>
                <SectionTitle icon={Coins} label="Revenue share" title="Cash payout" />
                <label className="mt-5 block text-sm font-semibold text-gray-800">Method<input value={cashPayout.payout_method} onChange={(e) => setCashPayout((prev) => ({ ...prev, payout_method: e.target.value }))} className={inputClass} /></label>
                <label className="mt-4 block text-sm font-semibold text-gray-800">Details<input value={cashPayout.payout_details} onChange={(e) => setCashPayout((prev) => ({ ...prev, payout_details: e.target.value }))} className={inputClass} /></label>
                <label className="mt-4 block text-sm font-semibold text-gray-800">Note<textarea value={cashPayout.note} onChange={(e) => setCashPayout((prev) => ({ ...prev, note: e.target.value }))} className={`${inputClass} min-h-[90px]`} /></label>
                <button type="button" onClick={() => void requestCashPayout()} disabled={loading} className={`${primaryButton} mt-5 w-full`}>Request payout</button>
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
};

const VoucherTable: React.FC<{ vouchers: PartnerVoucher[]; onCopy: (code: string) => void; onVoid: (id: string) => void }> = ({ vouchers, onCopy, onVoid }) => (
  <>
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-900/10 text-sm">
        <thead className="bg-[#efe6d8]/70 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
          <tr><th className="px-5 py-3">Code</th><th className="px-5 py-3">Access</th><th className="px-5 py-3">Product</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Expires</th><th className="px-5 py-3">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-900/10 bg-white/60">
          {vouchers.map((voucher) => (
            <tr key={voucher.id}>
              <td className="px-5 py-4 font-mono font-bold">{voucher.code}</td>
              <td className="px-5 py-4 capitalize">{voucher.access_kind.replace('_', ' ')}</td>
              <td className="px-5 py-4">{voucher.products?.name ?? voucher.experiences?.name ?? voucher.plans?.name ?? '-'}</td>
              <td className="px-5 py-4"><StatusPill status={voucher.status} /></td>
              <td className="px-5 py-4">{formatDate(voucher.expires_at)}</td>
              <td className="px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onCopy(voucher.code)} className={secondaryButton}><Copy className="h-4 w-4" />Copy</button>
                  <button type="button" onClick={() => onVoid(voucher.id)} disabled={voucher.status !== 'unused'} className={secondaryButton}><Trash2 className="h-4 w-4" />Void</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {vouchers.length === 0 ? <div className="p-6"><EmptyState icon={Ticket} title="No vouchers yet" note="Generate voucher batches from the Buy tab." /></div> : null}
  </>
);

const LedgerPanel: React.FC<{ ledger: PartnerCreditLedgerEntry[] }> = ({ ledger }) => (
  <section className={`${panelClass} overflow-hidden`}>
    <div className="border-b border-gray-900/10 p-5 md:p-6"><SectionTitle icon={Coins} label="Ledger" title="Wallet activity" /></div>
    <div className="divide-y divide-gray-900/10">
      {ledger.map((entry) => (
        <div key={entry.id} className="grid gap-3 p-5 text-sm md:grid-cols-[1fr_auto_auto_auto] md:items-center">
          <span className="font-semibold capitalize">{entry.entry_kind}</span>
          <StatusPill status={entry.status} />
          <span className="font-bold">{money(entry.amount, entry.currency)}</span>
          <span className="text-gray-500">{formatDateTime(entry.created_at)}</span>
        </div>
      ))}
      {ledger.length === 0 ? <div className="p-6"><EmptyState icon={Coins} title="No wallet activity" note="Top-ups, voucher debits, and commission credits will appear here." /></div> : null}
    </div>
  </section>
);

const BuyMockPanel: React.FC<{
  catalog: PartnerOfficeExperience[];
  form: { experience_id: string; quantity: number; expires_in_days: number; apply_credit: boolean };
  selected?: PartnerOfficeExperience | null;
  loading: boolean;
  pending: string | null;
  onChange: React.Dispatch<React.SetStateAction<{ experience_id: string; quantity: number; expires_in_days: number; apply_credit: boolean }>>;
  onBuy: () => void;
  onCheck: () => void;
}> = ({ catalog, form, selected, loading, pending, onChange, onBuy, onCheck }) => (
  <div className={`${panelClass} p-5 md:p-6`}>
    <SectionTitle icon={Ticket} label="Wholesale pack" title="Buy mock tickets" />
    <label className="mt-5 block text-sm font-semibold text-gray-800">Mock exam<select value={form.experience_id} onChange={(e) => onChange((prev) => ({ ...prev, experience_id: e.target.value }))} className={inputClass}>{catalog.map((item) => <option key={item.id} value={item.id}>{item.product_name ? `${item.product_name} - ${item.name}` : item.name}</option>)}</select></label>
    <label className="mt-4 block text-sm font-semibold text-gray-800">Quantity<input type="number" min={1} max={200} value={form.quantity} onChange={(e) => onChange((prev) => ({ ...prev, quantity: Number(e.target.value) }))} className={inputClass} /></label>
    <label className="mt-4 block text-sm font-semibold text-gray-800">Expiry days<input type="number" min={1} max={30} value={form.expires_in_days} onChange={(e) => onChange((prev) => ({ ...prev, expires_in_days: Number(e.target.value) }))} className={inputClass} /></label>
    <p className="mt-4 text-sm text-gray-600">Estimate: <strong>{money((selected?.price_amount ?? 0) * form.quantity, selected?.price_currency ?? 'UZS')}</strong></p>
    <button type="button" onClick={onBuy} disabled={loading || !selected} className={`${primaryButton} mt-5 w-full`}>Buy tickets</button>
    {pending ? <button type="button" onClick={onCheck} className={`${secondaryButton} mt-3 w-full`}>Check payment</button> : null}
  </div>
);

const BuySeatPanel: React.FC<{
  plans: PartnerOfficePlan[];
  form: { plan_id: string; seat_count: number; apply_credit: boolean };
  selected?: PartnerOfficePlan | null;
  loading: boolean;
  pending: string | null;
  onChange: React.Dispatch<React.SetStateAction<{ plan_id: string; seat_count: number; apply_credit: boolean }>>;
  onBuy: () => void;
  onCheck: () => void;
}> = ({ plans, form, selected, loading, pending, onChange, onBuy, onCheck }) => (
  <div className={`${panelClass} p-5 md:p-6`}>
    <SectionTitle icon={UsersRound} label="Seat pack" title="Buy subscriptions" />
    <label className="mt-5 block text-sm font-semibold text-gray-800">Plan<select value={form.plan_id} onChange={(e) => onChange((prev) => ({ ...prev, plan_id: e.target.value }))} className={inputClass}>{plans.map((item) => <option key={item.id} value={item.id}>{item.products?.name ? `${item.products.name} - ${item.name}` : item.name}</option>)}</select></label>
    <label className="mt-4 block text-sm font-semibold text-gray-800">Seats<input type="number" min={1} max={200} value={form.seat_count} onChange={(e) => onChange((prev) => ({ ...prev, seat_count: Number(e.target.value) }))} className={inputClass} /></label>
    <p className="mt-4 text-sm text-gray-600">Estimate: <strong>{money((selected?.amount ?? 0) * form.seat_count, selected?.currency ?? 'UZS')}</strong></p>
    <button type="button" onClick={onBuy} disabled={loading || !selected} className={`${primaryButton} mt-5 w-full`}>Buy seats</button>
    {pending ? <button type="button" onClick={onCheck} className={`${secondaryButton} mt-3 w-full`}>Check payment</button> : null}
  </div>
);

const VoucherGeneratorPanel: React.FC<{
  catalog: PartnerOfficeExperience[];
  plans: PartnerOfficePlan[];
  wallet: { currency: string; available_amount: number };
  form: { access_kind: 'mock_exam' | 'subscription' | 'seat'; experience_id: string; plan_id: string; quantity: number; expires_in_days: number; prefix: string; source_model: string };
  loading: boolean;
  onChange: React.Dispatch<React.SetStateAction<{ access_kind: 'mock_exam' | 'subscription' | 'seat'; experience_id: string; plan_id: string; quantity: number; expires_in_days: number; prefix: string; source_model: string }>>;
  onCreate: () => void;
}> = ({ catalog, plans, wallet, form, loading, onChange, onCreate }) => (
  <div className={`${panelClass} p-5 md:p-6`}>
    <SectionTitle icon={UserPlus} label="Distribution" title="Generate vouchers" />
    <label className="mt-5 block text-sm font-semibold text-gray-800">Access type<select value={form.access_kind} onChange={(e) => onChange((prev) => ({ ...prev, access_kind: e.target.value as any }))} className={inputClass}><option value="mock_exam">Mock exam</option><option value="subscription">Subscription</option><option value="seat">Seat voucher</option></select></label>
    {form.access_kind === 'mock_exam' ? (
      <label className="mt-4 block text-sm font-semibold text-gray-800">Mock exam<select value={form.experience_id} onChange={(e) => onChange((prev) => ({ ...prev, experience_id: e.target.value }))} className={inputClass}>{catalog.map((item) => <option key={item.id} value={item.id}>{item.product_name ? `${item.product_name} - ${item.name}` : item.name}</option>)}</select></label>
    ) : (
      <label className="mt-4 block text-sm font-semibold text-gray-800">Plan<select value={form.plan_id} onChange={(e) => onChange((prev) => ({ ...prev, plan_id: e.target.value }))} className={inputClass}>{plans.map((item) => <option key={item.id} value={item.id}>{item.products?.name ? `${item.products.name} - ${item.name}` : item.name}</option>)}</select></label>
    )}
    <div className="mt-4 grid grid-cols-2 gap-3">
      <label className="text-sm font-semibold text-gray-800">Quantity<input type="number" min={1} max={500} value={form.quantity} onChange={(e) => onChange((prev) => ({ ...prev, quantity: Number(e.target.value) }))} className={inputClass} /></label>
      <label className="text-sm font-semibold text-gray-800">Days<input type="number" min={1} max={365} value={form.expires_in_days} onChange={(e) => onChange((prev) => ({ ...prev, expires_in_days: Number(e.target.value) }))} className={inputClass} /></label>
    </div>
    <label className="mt-4 block text-sm font-semibold text-gray-800">Code prefix<input value={form.prefix} onChange={(e) => onChange((prev) => ({ ...prev, prefix: e.target.value }))} className={inputClass} /></label>
    <label className="mt-4 block text-sm font-semibold text-gray-800">Commercial model<select value={form.source_model} onChange={(e) => onChange((prev) => ({ ...prev, source_model: e.target.value }))} className={inputClass}><option value="prepaid_wallet">Prepaid wallet</option><option value="wholesale">Wholesale</option><option value="revenue_share">Revenue share</option><option value="manual">Manual</option></select></label>
    <p className="mt-4 text-sm text-gray-600">Wallet available: <strong>{money(wallet.available_amount, wallet.currency)}</strong></p>
    <button type="button" onClick={onCreate} disabled={loading} className={`${primaryButton} mt-5 w-full`}>Generate vouchers</button>
  </div>
);

const ResultsPanel: React.FC<{ results: PartnerOfficeResult[] }> = ({ results }) => (
  <section className={`${panelClass} overflow-hidden`}>
    <div className="border-b border-gray-900/10 p-5 md:p-6"><SectionTitle icon={ClipboardList} label="Student outcomes" title="Results" /></div>
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-900/10 text-sm">
        <thead className="bg-[#efe6d8]/70 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
          <tr><th className="px-5 py-3">Candidate</th><th className="px-5 py-3">Voucher</th><th className="px-5 py-3">Mock</th><th className="px-5 py-3">Score</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Date</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-900/10 bg-white/60">
          {results.map((row) => (
            <tr key={row.id}>
              <td className="px-5 py-4"><p className="font-semibold">{row.candidate_name || row.email || 'Candidate'}</p><p className="text-xs text-gray-500">{row.email}</p></td>
              <td className="px-5 py-4 font-mono">{row.token_code ?? '-'}</td>
              <td className="px-5 py-4">{row.experience_name ?? '-'}</td>
              <td className="px-5 py-4 font-semibold">{row.overall_band ?? row.overall_score ?? '-'}</td>
              <td className="px-5 py-4"><StatusPill status={row.session_status ?? row.registration_status} /></td>
              <td className="px-5 py-4">{formatDate(row.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {results.length === 0 ? <div className="p-6"><EmptyState icon={ClipboardList} title="No results yet" note="Completed candidate sessions will appear here." /></div> : null}
  </section>
);

const PaymentsPanel: React.FC<{ payments: PartnerOfficePayment[] }> = ({ payments }) => (
  <section className={`${panelClass} overflow-hidden`}>
    <div className="border-b border-gray-900/10 p-5 md:p-6"><SectionTitle icon={ReceiptText} label="Billing" title="Payments" /></div>
    <div className="divide-y divide-gray-900/10">
      {payments.map((payment) => (
        <div key={payment.id} className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="font-semibold capitalize">{payment.purchase_type ?? 'plan'}</p><StatusPill status={payment.status} /></div>
            <p className="mt-1 truncate font-mono text-xs text-gray-500">{payment.provider_transaction_id ?? payment.id}</p>
          </div>
          <span className="font-bold">{money(payment.final_amount ?? payment.amount, payment.currency)}</span>
          <span className="text-sm text-gray-500">{formatDateTime(payment.created_at)}</span>
        </div>
      ))}
      {payments.length === 0 ? <div className="p-6"><EmptyState icon={ReceiptText} title="No payments yet" note="Partner purchases and status updates will appear here." /></div> : null}
    </div>
  </section>
);
