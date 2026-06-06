import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  Coins,
  Copy,
  CreditCard,
  Download,
  Link2,
  Mail,
  Paintbrush,
  FileText,
  ReceiptText,
  RefreshCw,
  Save,
  School,
  Ticket,
  Trash2,
  UserPlus,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SiteHeader, type SiteHeaderAction } from '../components/layout/SiteHeader';
import { getAuthSession, refreshAuthSession, supabase } from '../lib/supabase';
import {
  partnerOfficeApplyCenter,
  partnerOfficeAcceptStaffInvites,
  partnerOfficeCatalog,
  partnerOfficeCenter,
  partnerOfficeAcademies,
  partnerOfficeCreateAcademy,
  partnerOfficeCreateSeatPurchase,
  partnerOfficeCreateTicketPurchase,
  partnerOfficeCreateVoucherBatch,
  partnerOfficeCreateWalletTopup,
  partnerOfficeDashboard,
  partnerOfficeExportReport,
  partnerOfficeExportPdfReport,
  partnerOfficeGenerateStatement,
  partnerOfficeAnalytics,
  partnerOfficePayments,
  partnerOfficePaymentCapabilities,
  partnerOfficePlans,
  partnerOfficeReports,
  partnerOfficeMockEvents,
  partnerOfficeInviteStaff,
  partnerOfficeCreateMockEvent,
  partnerOfficeCreateStudentInvites,
  partnerOfficeCreateTierUpgradePayment,
  partnerOfficeMarkEventAttendance,
  partnerOfficeRequestCashPayout,
  partnerOfficeResendStudentInvite,
  partnerOfficeReviewQueue,
  partnerOfficeRevokeStudentInvite,
  partnerOfficeStatements,
  partnerOfficeStudentInvites,
  partnerOfficeTierCatalog,
  partnerOfficeUpdateReviewItem,
  partnerOfficeResults,
  partnerOfficeSeats,
  partnerOfficeStaff,
  partnerOfficeStudents,
  partnerOfficeTickets,
  partnerOfficeUpdateCenter,
  partnerOfficeUpdateStaff,
  partnerOfficeUpdateMockEvent,
  partnerOfficeSyncAcademyContacts,
  partnerOfficeUploadCenterLogo,
  partnerOfficeVoidVoucher,
  partnerOfficeVoucherBatches,
  partnerOfficeVouchers,
  partnerOfficeWallet,
  tspayStatus,
  type PartnerCenterAcademy,
  type PartnerCenterProfile,
  type PartnerCenterCapabilities,
  type PartnerCenterMockEvent,
  type PartnerCenterReviewItem,
  type PartnerCenterStaffInvite,
  type PartnerCenterStaffMember,
  type PartnerCenterStudentInvite,
  type PartnerCreditLedgerEntry,
  type PartnerPaymentCapability,
  type PartnerCenterStatement,
  type PartnerCenterTierCatalog,
  type PartnerCenterTierPlan,
  type PartnerOfficeExperience,
  type PartnerOfficePayment,
  type PartnerOfficePlan,
  type PartnerOfficeResult,
  type PartnerReportSummary,
  type PartnerStudent,
  type PartnerVoucher,
  type PartnerVoucherBatch,
} from '../lib/platformClient';

type Tab = 'overview' | 'academies' | 'upgrade' | 'wallet' | 'buy' | 'vouchers' | 'students' | 'events' | 'reviews' | 'staff' | 'results' | 'reports' | 'branding' | 'payments';

const tabs: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'academies', label: 'Academies', icon: School },
  { id: 'upgrade', label: 'Upgrade', icon: Coins },
  { id: 'wallet', label: 'Wallet', icon: WalletCards },
  { id: 'buy', label: 'Buy', icon: CreditCard },
  { id: 'vouchers', label: 'Vouchers', icon: Ticket },
  { id: 'students', label: 'Students', icon: UsersRound },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'reviews', label: 'Reviews', icon: ClipboardList },
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
const FALLBACK_ONLINE_PAYMENT_MAX_AMOUNT_UZS = 200_000_000;

const STARTER_CAPABILITIES: PartnerCenterCapabilities = {
  tier: 'starter',
  tier_label: 'Starter',
  staff_limit: 3,
  max_voucher_batch_quantity: 50,
  max_active_groups: 0,
  max_upcoming_events: 0,
  groups_enabled: false,
  student_invites_enabled: true,
  mock_events_enabled: false,
  review_queue_enabled: false,
  analytics_enabled: false,
  pdf_reports_enabled: false,
  statements_enabled: false,
  advanced_branding_enabled: false,
  public_events_enabled: false,
  payouts_enabled: false,
  white_label_enabled: false,
  included_features: ['Voucher generation', 'Student registry', 'CSV reports', 'Logo and public page'],
};

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

const parseBulkStudents = (raw: string): Array<{ name?: string; email?: string; phone?: string }> =>
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line
        .split(/[,;\t]/)
        .map((part) => part.trim())
        .filter(Boolean);
      const emailIndex = parts.findIndex((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part));
      const phoneIndex = parts.findIndex((part, index) => index !== emailIndex && /^\+?[0-9()\-\s]{6,}$/.test(part));
      const email = emailIndex >= 0 ? parts[emailIndex] : '';
      const phone = phoneIndex >= 0 ? parts[phoneIndex] : '';
      const name = parts.filter((_, index) => index !== emailIndex && index !== phoneIndex).join(' ').trim();
      return { name: name || undefined, email: email || undefined, phone: phone || undefined };
    })
    .filter((student) => student.name || student.email || student.phone)
    .slice(0, 200);

const isPublicCenterEvent = (event: PartnerCenterMockEvent) => {
  const metadata = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : {};
  return metadata.visibility === 'public' || metadata.public_event === true;
};

const studentSourceLabel = (student: PartnerStudent) => {
  const metadata = student.metadata && typeof student.metadata === 'object' && !Array.isArray(student.metadata) ? student.metadata as Record<string, unknown> : {};
  const source = String(metadata.invite_source ?? metadata.redeemed_via ?? '').toLowerCase();
  if (source.includes('voucher_batch_roster')) return 'Voucher roster';
  if (source.includes('center_office')) return 'Center intake';
  if (source.includes('voucher-redeem')) return 'Redeemed voucher';
  if (student.voucher_code) return 'Voucher';
  return 'Manual intake';
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

const TierCapabilitiesPanel: React.FC<{ capabilities: PartnerCenterCapabilities }> = ({ capabilities }) => (
  <section className={`${panelClass} p-5 md:p-6`}>
    <SectionTitle icon={Building2} label="Tier controls" title={`${capabilities.tier_label} center capabilities`} />
    <div className="mt-5 grid gap-3 md:grid-cols-4">
      <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Staff limit</p>
        <p className="mt-2 text-xl font-bold">{capabilities.staff_limit}</p>
      </div>
      <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Voucher batch</p>
        <p className="mt-2 text-xl font-bold">{capabilities.max_voucher_batch_quantity}</p>
      </div>
      <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Academy handoff</p>
        <p className="mt-2 text-xl font-bold">{capabilities.student_invites_enabled ? 'Ready' : 'Locked'}</p>
      </div>
      <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Mock events</p>
        <p className="mt-2 text-xl font-bold">{capabilities.mock_events_enabled ? capabilities.max_upcoming_events : 'Locked'}</p>
      </div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      {capabilities.included_features.map((feature) => (
        <span key={feature} className="rounded-full border border-gray-900/15 bg-white px-3 py-1 text-xs font-semibold text-gray-700">{feature}</span>
      ))}
    </div>
  </section>
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
  const [academies, setAcademies] = useState<PartnerCenterAcademy[]>([]);
  const [events, setEvents] = useState<PartnerCenterMockEvent[]>([]);
  const [studentInvites, setStudentInvites] = useState<PartnerCenterStudentInvite[]>([]);
  const [reviewItems, setReviewItems] = useState<PartnerCenterReviewItem[]>([]);
  const [statements, setStatements] = useState<PartnerCenterStatement[]>([]);
  const [paymentCapabilities, setPaymentCapabilities] = useState<PartnerPaymentCapability[]>([]);
  const [tierCatalog, setTierCatalog] = useState<PartnerCenterTierCatalog | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, any> | null>(null);
  const [staffMembers, setStaffMembers] = useState<PartnerCenterStaffMember[]>([]);
  const [staffInvites, setStaffInvites] = useState<PartnerCenterStaffInvite[]>([]);
  const [wallet, setWallet] = useState<{ currency: string; available_amount: number }>({ currency: 'UZS', available_amount: 0 });
  const [ledger, setLedger] = useState<PartnerCreditLedgerEntry[]>([]);
  const [dashboard, setDashboard] = useState<{ counts: Record<string, number>; wallet?: { currency: string; available_amount: number } } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<'tickets' | 'seats' | 'tier' | null>(null);
  const [pendingPaymentUrl, setPendingPaymentUrl] = useState<string | null>(null);
  const [pendingPaymentLabel, setPendingPaymentLabel] = useState<string>('payment');
  const [tierBillingPeriod, setTierBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

  const [ticketForm, setTicketForm] = useState({ experience_id: '', quantity: 10, expires_in_days: 30, apply_credit: false });
  const [seatForm, setSeatForm] = useState({ plan_id: '', seat_count: 10, apply_credit: false });
  const [voucherForm, setVoucherForm] = useState({
    access_kind: 'mock_exam' as 'mock_exam' | 'subscription' | 'seat',
    experience_id: '',
    plan_id: '',
    classroom_id: '',
    quantity: 10,
    expires_in_days: 30,
    prefix: 'SCH',
    source_model: 'prepaid_wallet',
  });
  const [walletTopup, setWalletTopup] = useState({ amount: 1000000, note: '' });
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', phone: '', voucher_batch_id: '' });
  const [bulkInviteText, setBulkInviteText] = useState('');
  const [voucherRosterText, setVoucherRosterText] = useState('');
  const [eventForm, setEventForm] = useState({
    title: '',
    experience_id: '',
    starts_at: '',
    mode: 'online' as 'online' | 'offline' | 'hybrid',
    visibility: 'private' as 'private' | 'public',
    voucher_batch_id: '',
    location: '',
    meeting_url: '',
    capacity: 20,
  });
  const [brandingForm, setBrandingForm] = useState({ display_name: '', slug: '', logo_url: '', public_instructions: '', powered_by_schood: true });
  const [cashPayout, setCashPayout] = useState({ payout_method: 'cash', payout_details: '', note: '' });
  const [staffForm, setStaffForm] = useState({ email: '', role: 'teacher' as 'admin' | 'teacher' | 'counselor' });
  const [academyForm, setAcademyForm] = useState({ name: '', slug: '' });
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
  const redeemUrl = (code?: string | null) =>
    center?.slug && code
      ? `${origin}/center/${center.slug}?code=${encodeURIComponent(code)}`
      : `${origin}/redeem${code ? `/${encodeURIComponent(code)}` : ''}`;
  const centerTenantId = center?.tenant_id ?? null;
  const centerIsActive = center?.status === 'active';
  const capabilities = center?.capabilities ?? STARTER_CAPABILITIES;
  const visibleTabs = useMemo(
    () =>
      tabs.filter((item) => {
        if (item.id === 'events') return capabilities.mock_events_enabled;
        if (item.id === 'reviews') return capabilities.review_queue_enabled;
        if (item.id === 'payments') return capabilities.payouts_enabled || center?.commercial_model === 'revenue_share' || center?.commercial_model === 'hybrid';
        return true;
      }),
    [capabilities, center?.commercial_model],
  );
  const classroomOptions = useMemo(
    () =>
      academies.flatMap((academy) =>
        (academy.classrooms ?? [])
          .filter((classroom) => classroom.is_active)
          .map((classroom) => ({
            ...classroom,
            academy_name: academy.name,
          })),
      ),
    [academies],
  );
  const selectedExperience = useMemo(() => catalog.find((item) => item.id === ticketForm.experience_id), [catalog, ticketForm.experience_id]);
  const selectedPlan = useMemo(() => plans.find((item) => item.id === seatForm.plan_id), [plans, seatForm.plan_id]);
  const ticketEstimate = (selectedExperience?.price_amount ?? 0) * ticketForm.quantity;
  const ticketCurrency = selectedExperience?.price_currency ?? 'UZS';
  const paymentCapability = paymentCapabilities.find((item) => item.currency === ticketCurrency && item.enabled) ?? paymentCapabilities[0];
  const onlineMaxAmount = paymentCapability?.max_amount ?? FALLBACK_ONLINE_PAYMENT_MAX_AMOUNT_UZS;
  const ticketMaxOnlineQuantity = selectedExperience?.price_amount ? Math.floor(onlineMaxAmount / selectedExperience.price_amount) : 0;
  const ticketOnlineBlocked = ticketCurrency === 'UZS' && ticketEstimate > onlineMaxAmount;
  const seatEstimate = (selectedPlan?.amount ?? 0) * seatForm.seat_count;
  const seatCurrency = selectedPlan?.currency ?? 'UZS';
  const seatMaxOnlineQuantity = selectedPlan?.amount ? Math.floor(onlineMaxAmount / selectedPlan.amount) : 0;
  const seatOnlineBlocked = seatCurrency === 'UZS' && seatEstimate > onlineMaxAmount;
  const academyClassroomCount = useMemo(
    () => academies.reduce((total, academy) => total + Number(academy.counts?.active_classrooms ?? academy.counts?.classrooms ?? 0), 0),
    [academies],
  );

  const getValidToken = async (): Promise<string | null> => {
    const session = await getAuthSession();
    if (session?.access_token) return session.access_token;
    const refreshed = await refreshAuthSession();
    return refreshed?.access_token ?? null;
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
        setAcademies([]);
        setEvents([]);
        setStudentInvites([]);
        setReviewItems([]);
        setStatements([]);
        setPaymentCapabilities([]);
        setTierCatalog(null);
        setAnalytics(null);
        setStaffMembers([]);
        setStaffInvites([]);
        setResults([]);
        setReports(null);
        return;
      }

      const tenant_id = centerRes.center.tenant_id;
      const [dashRes, catalogRes, plansRes, ticketRes, seatRes, paymentRes, walletRes, voucherRes, batchRes, studentRes, inviteRes, academyRes, staffRes, resultRes, reportRes, eventRes, reviewRes, statementRes, capsRes, tierCatalogRes, analyticsRes] =
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
          partnerOfficeStudentInvites(token, tenant_id).catch(() => ({ invites: [] })),
          partnerOfficeAcademies(token, tenant_id).catch(() => ({ academies: [] })),
          partnerOfficeStaff(token, tenant_id).catch(() => ({ members: [], invites: [] })),
          partnerOfficeResults(token, { tenant_id }),
          partnerOfficeReports(token, tenant_id),
          partnerOfficeMockEvents(token, tenant_id).catch(() => ({ events: [] })),
          partnerOfficeReviewQueue(token, tenant_id).catch(() => ({ review_items: [] })),
          partnerOfficeStatements(token, tenant_id).catch(() => ({ statements: [] })),
          partnerOfficePaymentCapabilities(token).catch(() => ({ providers: [] })),
          partnerOfficeTierCatalog(token, tenant_id).catch(() => null),
          partnerOfficeAnalytics(token, tenant_id).catch(() => ({ analytics: {} })),
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
      setStudentInvites(inviteRes.invites ?? []);
      setAcademies(academyRes.academies ?? []);
      setEvents(eventRes.events ?? []);
      setReviewItems(reviewRes.review_items ?? []);
      setStatements(statementRes.statements ?? []);
      setPaymentCapabilities(capsRes.providers ?? []);
      setTierCatalog(tierCatalogRes);
      setAnalytics((analyticsRes.analytics ?? {}) as Record<string, any>);
      setStaffMembers(staffRes.members ?? []);
      setStaffInvites(staffRes.invites ?? []);
      setResults(resultRes.results ?? []);
      setReports(reportRes.reports ?? null);

      const firstExperience = catalogRes.experiences?.[0]?.id ?? '';
      const firstPlan = (plansRes.plans ?? catalogRes.plans ?? [])[0]?.id ?? '';
      setTicketForm((prev) => ({ ...prev, experience_id: prev.experience_id || firstExperience }));
      setSeatForm((prev) => ({ ...prev, plan_id: prev.plan_id || firstPlan }));
      setVoucherForm((prev) => ({ ...prev, experience_id: prev.experience_id || firstExperience, plan_id: prev.plan_id || firstPlan }));
      setEventForm((prev) => ({ ...prev, experience_id: prev.experience_id || firstExperience }));
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

  useEffect(() => {
    if (!visibleTabs.some((item) => item.id === tab)) setTab('overview');
  }, [tab, visibleTabs]);

  const copy = async (value: string, message = 'Copied.') => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setSuccess(message);
  };

  const openPayment = (url: string | null, label = 'payment') => {
    if (!url) return;
    setPendingPaymentUrl(url);
    setPendingPaymentLabel(label);
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (!popup) setError('Popup blocked. Use the Continue payment link below to open checkout manually.');
  };

  const buyTickets = async () => {
    const token = await getValidToken();
    if (!token || !ticketForm.experience_id || !centerTenantId) return;
    if (ticketOnlineBlocked) {
      setTab('wallet');
      setError(`Current online checkout limit is ${money(onlineMaxAmount, 'UZS')} per transaction. For larger center packs, use wallet top-up or split the purchase.`);
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeCreateTicketPurchase(token, { ...ticketForm, tenant_id: centerTenantId, center_office: true });
      setPendingTransactionId(res.transaction_id);
      setPendingKind('tickets');
      if (res.payment_url) {
        openPayment(res.payment_url, 'mock ticket pack payment');
        setSuccess('Payment opened. Mock tickets will appear after payment is confirmed.');
      } else if (isPaid(res.status)) {
        setPendingPaymentUrl(null);
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
    if (seatOnlineBlocked) {
      setTab('wallet');
      setError(`Current online checkout limit is ${money(onlineMaxAmount, 'UZS')} per transaction. For larger seat bundles, use wallet top-up or split the purchase.`);
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeCreateSeatPurchase(token, { ...seatForm, tenant_id: centerTenantId, center_office: true });
      setPendingTransactionId(res.transaction_id);
      setPendingKind('seats');
      if (res.payment_url) {
        openPayment(res.payment_url, 'seat pack payment');
        setSuccess('Payment opened. Seats will appear after payment is confirmed.');
      } else if (isPaid(res.status)) {
        setPendingPaymentUrl(null);
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
        setPendingPaymentUrl(null);
        await refreshAll();
        setSuccess(pendingKind === 'seats' ? 'Seats added.' : pendingKind === 'tier' ? 'Center tier updated.' : 'Mock tickets generated.');
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
    const assignedStudents = parseBulkStudents(voucherRosterText);
    const quantity = assignedStudents.length > 0 ? assignedStudents.length : voucherForm.quantity;
    if (quantity > capabilities.max_voucher_batch_quantity) {
      setError(`${capabilities.tier_label} centers can generate up to ${capabilities.max_voucher_batch_quantity} vouchers per batch.`);
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        ...voucherForm,
        quantity,
        tenant_id: centerTenantId,
        center_office: true,
        experience_id: voucherForm.access_kind === 'mock_exam' ? voucherForm.experience_id : null,
        plan_id: voucherForm.access_kind === 'mock_exam' ? null : voucherForm.plan_id,
        classroom_id: voucherForm.classroom_id || null,
        assigned_students: assignedStudents,
      };
      const res = await partnerOfficeCreateVoucherBatch(token, payload);
      setVoucherRosterText('');
      await refreshAll();
      setTab('vouchers');
      setSuccess(`Created ${res.vouchers.length} vouchers in ${res.batch.batch_code}${assignedStudents.length ? ' and attached the roster.' : '.'}`);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const buyTier = async (plan: PartnerCenterTierPlan) => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    if (plan.currency === 'UZS' && plan.amount > onlineMaxAmount) {
      setTab('wallet');
      setError(`Current online payment limit is ${money(onlineMaxAmount, 'UZS')} per transaction. Ask Schood admin to invoice this tier manually.`);
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeCreateTierUpgradePayment(token, {
        tenant_id: centerTenantId,
        requested_tier: plan.tier,
        billing_period: plan.billing_period,
        center_office: true,
      });
      setPendingTransactionId(res.transaction_id);
      setPendingKind('tier');
      if (res.payment_url) {
        openPayment(res.payment_url, `${plan.tier} tier payment`);
        setSuccess('Payment opened. The center tier updates automatically after payment is confirmed.');
      } else if (isPaid(res.status)) {
        setPendingPaymentUrl(null);
        await refreshAll();
        setSuccess('Center tier updated.');
      }
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
    if (!brandingForm.powered_by_schood && !capabilities.advanced_branding_enabled) {
      setError('Removing the Powered by Schood footer is available on Premium and Exclusive center tiers.');
      return;
    }
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
      setStaffForm({ email: '', role: 'teacher' });
      setSuccess('Staff access updated. If the email is not registered yet, an invite is waiting for that account.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const updateStaff = async (membership_id: string, patch: { role?: 'admin' | 'teacher' | 'counselor'; status?: 'active' | 'disabled' }) => {
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

  const createAcademy = async () => {
    const token = await getValidToken();
    if (!token || !centerTenantId || !academyForm.name.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeCreateAcademy(token, {
        tenant_id: centerTenantId,
        center_office: true,
        name: academyForm.name.trim(),
        slug: academyForm.slug.trim() || null,
      });
      setAcademies(res.academies ?? (res.academy ? [res.academy] : []));
      setAcademyForm({ name: '', slug: '' });
      setTab('academies');
      setSuccess('Academy created and linked to this education center.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const syncAcademyContacts = async (academyId: string) => {
    const token = await getValidToken();
    if (!token || !centerTenantId || !academyId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeSyncAcademyContacts(token, { tenant_id: centerTenantId, academy_id: academyId });
      setAcademies(res.academies ?? academies);
      setSuccess(`Synced ${res.synced_count ?? 0} center student${res.synced_count === 1 ? '' : 's'} into the linked Academy contact list.`);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const createStudentInvite = async () => {
    const token = await getValidToken();
    if (!token || !centerTenantId || (!inviteForm.email.trim() && !inviteForm.phone.trim())) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeCreateStudentInvites(token, {
        tenant_id: centerTenantId,
        origin,
        voucher_batch_id: inviteForm.voucher_batch_id || null,
        students: [{ name: inviteForm.name, email: inviteForm.email, phone: inviteForm.phone }],
      });
      setStudents(res.students ?? []);
      setStudentInvites(res.all_invites ?? res.invites ?? []);
      const invite = res.invites?.[0];
      if (invite?.message) await copy(String(invite.message), 'Student invite message copied.');
      setInviteForm({ name: '', email: '', phone: '', voucher_batch_id: '' });
      setSuccess('Student invite prepared.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const createBulkStudentInvites = async () => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    const roster = parseBulkStudents(bulkInviteText);
    if (roster.length === 0) {
      setError('Paste at least one student line with a name, email, or phone.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeCreateStudentInvites(token, {
        tenant_id: centerTenantId,
        origin,
        voucher_batch_id: inviteForm.voucher_batch_id || null,
        students: roster,
      });
      setStudents(res.students ?? []);
      setStudentInvites(res.all_invites ?? res.invites ?? []);
      setBulkInviteText('');
      setSuccess(`Prepared ${res.invites?.length ?? roster.length} student invite${roster.length === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const resendStudentInvite = async (invite_id: string) => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeResendStudentInvite(token, { tenant_id: centerTenantId, invite_id, origin });
      setStudentInvites(res.invites ?? []);
      if (res.message) await copy(String(res.message), 'Student invite message copied.');
      setSuccess('Invite refreshed.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const revokeStudentInvite = async (invite_id: string) => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeRevokeStudentInvite(token, { tenant_id: centerTenantId, invite_id });
      setStudentInvites(res.invites ?? []);
      setSuccess('Invite revoked.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const createMockEvent = async () => {
    const token = await getValidToken();
    if (!token || !centerTenantId || !eventForm.title.trim() || !eventForm.starts_at) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeCreateMockEvent(token, {
        tenant_id: centerTenantId,
        title: eventForm.title,
        experience_id: eventForm.experience_id || null,
        starts_at: eventForm.starts_at,
        mode: eventForm.mode,
        voucher_batch_id: eventForm.voucher_batch_id || null,
        location: eventForm.location || null,
        meeting_url: eventForm.meeting_url || null,
        capacity: eventForm.capacity,
        metadata: { visibility: eventForm.visibility, public_event: eventForm.visibility === 'public' },
      });
      setEvents(res.events ?? []);
      setEventForm((prev) => ({ ...prev, title: '', starts_at: '', location: '', meeting_url: '', visibility: 'private' }));
      setSuccess('Mock event created.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const updateMockEventStatus = async (event_id: string, status: 'scheduled' | 'completed' | 'cancelled') => {
    const token = await getValidToken();
    if (!token || !centerTenantId || !event_id) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeUpdateMockEvent(token, {
        tenant_id: centerTenantId,
        event_id,
        status,
      });
      setEvents(res.events ?? []);
      setSuccess(status === 'cancelled' ? 'Event cancelled.' : status === 'completed' ? 'Event completed.' : 'Event restored.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const updateMockEventVisibility = async (event_id: string, visibility: 'private' | 'public') => {
    const token = await getValidToken();
    if (!token || !centerTenantId || !event_id) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await partnerOfficeUpdateMockEvent(token, {
        tenant_id: centerTenantId,
        event_id,
        metadata: { visibility, public_event: visibility === 'public' },
      });
      setEvents(res.events ?? []);
      setSuccess(visibility === 'public' ? 'Event is now public on the center page.' : 'Event is private again.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  const markAttendance = async (payload: { event_id?: string; registration_id?: string | null; student_id?: string | null; voucher_id?: string | null }, attendance_status: 'pending' | 'present' | 'absent' | 'late') => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    try {
      const res = await partnerOfficeMarkEventAttendance(token, { tenant_id: centerTenantId, ...payload, attendance_status });
      setEvents(res.events ?? []);
      setSuccess('Attendance saved.');
    } catch (err) {
      setError(parseError(err));
    }
  };

  const updateReview = async (review_item_id: string, status: string) => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    try {
      const res = await partnerOfficeUpdateReviewItem(token, { tenant_id: centerTenantId, review_item_id, status });
      setReviewItems(res.review_items ?? []);
      setSuccess('Review item updated.');
    } catch (err) {
      setError(parseError(err));
    }
  };

  const downloadBase64Pdf = (filename: string, base64: string) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = async (report_type: 'student' | 'group' | 'event') => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    setError(null);
    try {
      const res = await partnerOfficeExportPdfReport(token, { tenant_id: centerTenantId, report_type, center_office: true });
      downloadBase64Pdf(res.filename, res.pdf_base64);
      setSuccess('PDF exported.');
    } catch (err) {
      setError(parseError(err));
    }
  };

  const generateStatement = async () => {
    const token = await getValidToken();
    if (!token || !centerTenantId) return;
    setError(null);
    try {
      const res = await partnerOfficeGenerateStatement(token, { tenant_id: centerTenantId, center_office: true });
      downloadBase64Pdf(res.filename, res.pdf_base64);
      await refreshAll();
      setSuccess('Statement generated.');
    } catch (err) {
      setError(parseError(err));
    }
  };

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
                Run the business layer for every academy you operate.
              </h1>
              <p className="mt-4 max-w-2xl text-base text-gray-600">
                Manage center billing, voucher access, staff, reporting, and linked delivery academies from one workspace.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => setTab('academies')} className={primaryButton} disabled={!centerIsActive}>
                  <School className="h-4 w-4" />
                  Manage academies
                </button>
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
              <div className="mt-4 rounded-2xl border border-white/15 bg-white/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/60">{capabilities.tier_label} tier</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/75">
                  <span>Staff {staffMembers.filter((member) => member.status === 'active').length}/{capabilities.staff_limit}</span>
                  <span>Batch max {capabilities.max_voucher_batch_quantity}</span>
                  <span>Academy classes {academyClassroomCount}</span>
                  <span>PDF {capabilities.pdf_reports_enabled ? 'on' : 'premium'}</span>
                </div>
              </div>
            </div>
          </section>

          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
          {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}
          {pendingPaymentUrl ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">Checkout is ready</p>
                  <p className="mt-1 text-amber-900/80">If the payment window did not open, use this link to continue your {pendingPaymentLabel}.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={pendingPaymentUrl} target="_blank" rel="noreferrer" className={primaryButton}>
                    <ArrowUpRight className="h-4 w-4" />
                    Continue payment
                  </a>
                  {pendingTransactionId ? (
                    <button type="button" onClick={() => void checkPayment()} disabled={loading} className={secondaryButton}>
                      <RefreshCw className="h-4 w-4" />
                      Check status
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {centerIsActive ? (
            <nav className={`${panelClass} flex flex-wrap gap-2 p-3`}>
              {visibleTabs.map((item) => {
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
              <div className="grid gap-4 md:grid-cols-5">
                <StatCard label="Wallet" value={money(wallet.available_amount, wallet.currency)} icon={WalletCards} tone="dark" />
                <StatCard label="Academies" value={academies.length || dashboard?.counts?.academies || 0} icon={School} />
                <StatCard label="Unused vouchers" value={dashboard?.counts?.vouchers_unused ?? 0} icon={Ticket} />
                <StatCard label="Redeemed" value={dashboard?.counts?.vouchers_redeemed ?? 0} icon={UsersRound} />
                <StatCard label="Completed exams" value={reports?.completed_exams ?? dashboard?.counts?.results ?? 0} icon={ClipboardList} />
              </div>
              <AcademiesPanel
                academies={academies}
                academyForm={academyForm}
                loading={loading}
                onAcademyFormChange={setAcademyForm}
                onCreate={() => void createAcademy()}
                onSync={(academyId) => void syncAcademyContacts(academyId)}
                onCopy={(value, message) => void copy(value, message)}
              />
              <TierCapabilitiesPanel capabilities={capabilities} />
              <div className={`${panelClass} overflow-hidden`}>
                <div className="border-b border-gray-900/10 p-5 md:p-6">
                  <SectionTitle icon={Ticket} label="Recent inventory" title="Latest vouchers" />
                </div>
                <VoucherTable vouchers={recentVouchers} onCopy={(code) => void copy(redeemUrl(code), 'Redeem link copied.')} onVoid={(id) => void voidVoucher(id)} />
              </div>
            </section>
          ) : null}

          {centerIsActive && tab === 'academies' ? (
            <AcademiesPanel
              academies={academies}
              academyForm={academyForm}
              loading={loading}
              onAcademyFormChange={setAcademyForm}
              onCreate={() => void createAcademy()}
              onSync={(academyId) => void syncAcademyContacts(academyId)}
              onCopy={(value, message) => void copy(value, message)}
              expanded
            />
          ) : null}

          {centerIsActive && tab === 'upgrade' ? (
            <TierUpgradePanel
              catalog={tierCatalog}
              currentTier={capabilities.tier}
              billingPeriod={tierBillingPeriod}
              loading={loading}
              pending={pendingKind === 'tier' ? pendingTransactionId : null}
              maxOnlineAmount={onlineMaxAmount}
              onBillingPeriodChange={setTierBillingPeriod}
              onBuy={(plan) => void buyTier(plan)}
              onCheck={() => void checkPayment()}
            />
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
                maxOnlineAmount={onlineMaxAmount}
                maxOnlineQuantity={ticketMaxOnlineQuantity}
                onlineBlocked={ticketOnlineBlocked}
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
                maxOnlineAmount={onlineMaxAmount}
                maxOnlineQuantity={seatMaxOnlineQuantity}
                onlineBlocked={seatOnlineBlocked}
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
                classrooms={classroomOptions}
                assignedText={voucherRosterText}
                maxQuantity={capabilities.max_voucher_batch_quantity}
                loading={loading}
                onChange={setVoucherForm}
                onAssignedTextChange={setVoucherRosterText}
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
                        {batch.academy_classrooms?.name ? (
                          <p className="mt-1 text-sm font-semibold text-gray-700">Classroom: {batch.academy_classrooms.name}</p>
                        ) : null}
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
            <StudentsPanel
              students={students}
              invites={studentInvites}
              inviteForm={inviteForm}
              batches={batches}
              loading={loading}
              onInviteFormChange={setInviteForm}
              bulkInviteText={bulkInviteText}
              onBulkInviteTextChange={setBulkInviteText}
              onInvite={() => void createStudentInvite()}
              onBulkInvite={() => void createBulkStudentInvites()}
              onCopy={(value, message) => void copy(value, message)}
              onResend={(id) => void resendStudentInvite(id)}
              onRevoke={(id) => void revokeStudentInvite(id)}
            />
          ) : null}

          {centerIsActive && tab === 'events' ? (
            <EventsPanel
              events={events}
              students={students}
              catalog={catalog}
              batches={batches}
              eventForm={eventForm}
              loading={loading}
              onEventFormChange={setEventForm}
              onCreate={() => void createMockEvent()}
              onAttendance={(payload, status) => void markAttendance(payload, status)}
              onStatus={(eventId, status) => void updateMockEventStatus(eventId, status)}
              onVisibility={(eventId, visibility) => void updateMockEventVisibility(eventId, visibility)}
            />
          ) : null}

          {centerIsActive && tab === 'reviews' ? (
            <ReviewQueuePanel reviewItems={reviewItems} onUpdate={(id, status) => void updateReview(id, status)} />
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
                  <select value={staffForm.role} onChange={(e) => setStaffForm((prev) => ({ ...prev, role: e.target.value as 'admin' | 'teacher' | 'counselor' }))} className={inputClass}>
                    <option value="teacher">Teacher</option>
                    <option value="counselor">Counselor</option>
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
                        onChange={(e) => void updateStaff(member.id, { role: e.target.value as 'admin' | 'teacher' | 'counselor' })}
                        disabled={member.role === 'owner'}
                        className="rounded-xl border border-gray-900/20 bg-white px-3 py-2 text-sm capitalize"
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="teacher">Teacher</option>
                        <option value="counselor">Counselor</option>
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
              <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-6">
                <StatCard label="Completed" value={reports?.completed_exams ?? 0} icon={ClipboardList} />
                <StatCard label="Average score" value={reports?.average_score ?? '-'} icon={BarChart3} />
                <StatCard label="Active students" value={reports?.active_students ?? 0} icon={UsersRound} />
                <StatCard label="Academy classes" value={academyClassroomCount} icon={School} />
                <StatCard label="Events" value={reports?.upcoming_events ?? events.length} icon={CalendarDays} />
                <StatCard label="Pending review" value={reports?.pending_reviews ?? reviewItems.filter((item) => item.status !== 'released').length} icon={FileText} />
              </div>

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className={`${panelClass} p-5 md:p-6`}>
                  <SectionTitle
                    icon={Download}
                    label="Export"
                    title="Teacher-ready reports"
                    action={<button type="button" onClick={() => void exportReport()} className={primaryButton}><Download className="h-4 w-4" />Export CSV</button>}
                  />
                  <p className="mt-4 text-sm text-gray-600">CSV export remains available for offline teacher review and spreadsheets.</p>
                  {capabilities.pdf_reports_enabled ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <button type="button" onClick={() => void exportPdf('student')} className={secondaryButton}>
                        <FileText className="h-4 w-4" />
                        Student PDF
                      </button>
                      <button type="button" onClick={() => void exportPdf('group')} className={secondaryButton}>
                        <FileText className="h-4 w-4" />
                        Group PDF
                      </button>
                      <button type="button" onClick={() => void exportPdf('event')} className={secondaryButton}>
                        <FileText className="h-4 w-4" />
                        Event PDF
                      </button>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      PDF reports unlock on Premium and Exclusive center tiers.
                    </div>
                  )}
                </div>

                <div className={`${panelClass} p-5 md:p-6`}>
                  <SectionTitle icon={ReceiptText} label="Statements" title="Monthly center statement" />
                  <p className="mt-4 text-sm text-gray-600">Statements summarize wallet credits, debits, paid purchases, voucher batches, and payouts for the center tenant.</p>
                  <button type="button" onClick={() => void generateStatement()} disabled={loading || !capabilities.statements_enabled} className={`${primaryButton} mt-5 w-full`}>
                    <ReceiptText className="h-4 w-4" />
                    {capabilities.statements_enabled ? 'Generate statement' : 'Growth tier required'}
                  </button>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className={`${panelClass} p-5 md:p-6`}>
                  <SectionTitle icon={BarChart3} label="Analytics" title="Center performance" />
                  {capabilities.analytics_enabled ? <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Redemption rate</p>
                      <p className="mt-2 text-2xl font-bold">{Math.round(Number(analytics?.redemption_rate ?? 0) * 100)}%</p>
                    </div>
                    <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Inactive students</p>
                      <p className="mt-2 text-2xl font-bold">{analytics?.inactive_students ?? 0}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Upcoming events</p>
                      <p className="mt-2 text-2xl font-bold">{analytics?.upcoming_events ?? 0}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Pending reviews</p>
                      <p className="mt-2 text-2xl font-bold">{analytics?.pending_reviews ?? 0}</p>
                    </div>
                  </div> : (
                    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Analytics unlock on Growth, Premium, and Exclusive center tiers.
                    </div>
                  )}
                </div>

                <div className={`${panelClass} overflow-hidden`}>
                  <div className="border-b border-gray-900/10 p-5 md:p-6">
                    <SectionTitle icon={ReceiptText} label="Ledger statements" title="Recent statements" />
                  </div>
                  <div className="divide-y divide-gray-900/10">
                    {statements.slice(0, 6).map((statement) => (
                      <div key={statement.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-center">
                        <div>
                          <p className="font-semibold">{formatDate(statement.period_start)} - {formatDate(statement.period_end)}</p>
                          <p className="text-sm text-gray-600">
                            Credits {money(statement.credits_total, statement.currency)} / debits {money(statement.debits_total, statement.currency)}
                          </p>
                        </div>
                        <StatusPill status={statement.status} />
                      </div>
                    ))}
                    {statements.length === 0 ? <div className="p-6"><EmptyState icon={ReceiptText} title="No statements yet" note="Generate a statement when the center needs monthly financial paperwork." /></div> : null}
                  </div>
                </div>
              </div>

              <div className={`${panelClass} p-5 md:p-6`}>
                <SectionTitle
                  icon={Ticket}
                  label="Operational signals"
                  title="Voucher and access health"
                />
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Inactive vouchers</p>
                    <p className="mt-2 text-2xl font-bold">{reports?.inactive_vouchers ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Expiring soon</p>
                    <p className="mt-2 text-2xl font-bold">{reports?.expiring_vouchers ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-900/10 bg-white/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Unassigned seats</p>
                    <p className="mt-2 text-2xl font-bold">{reports?.unassigned_seats ?? 0}</p>
                  </div>
                </div>
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
                    <span>Powered by Schood{capabilities.advanced_branding_enabled ? '' : ' (Premium+)'}</span>
                    <input
                      type="checkbox"
                      checked={brandingForm.powered_by_schood}
                      disabled={!capabilities.advanced_branding_enabled}
                      onChange={(e) => setBrandingForm((prev) => ({ ...prev, powered_by_schood: e.target.checked }))}
                      className="h-5 w-5 accent-[#0f172a] disabled:opacity-50"
                    />
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
                <button type="button" onClick={() => void requestCashPayout()} disabled={loading || !capabilities.payouts_enabled} className={`${primaryButton} mt-5 w-full`}>
                  {capabilities.payouts_enabled ? 'Request payout' : 'Premium tier required'}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
};

const AcademiesPanel: React.FC<{
  academies: PartnerCenterAcademy[];
  academyForm: { name: string; slug: string };
  loading: boolean;
  expanded?: boolean;
  onAcademyFormChange: React.Dispatch<React.SetStateAction<{ name: string; slug: string }>>;
  onCreate: () => void;
  onSync: (academyId: string) => void;
  onCopy: (value: string, message?: string) => void;
}> = ({ academies, academyForm, loading, expanded = false, onAcademyFormChange, onCreate, onSync, onCopy }) => (
  <section className={`grid gap-5 ${expanded ? 'lg:grid-cols-[360px_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)_360px]'}`}>
    <div className={`${panelClass} overflow-hidden ${expanded ? 'lg:order-2' : ''}`}>
      <div className="border-b border-gray-900/10 p-5 md:p-6">
        <SectionTitle icon={School} label="Delivery layer" title="Academies under this center" />
        <p className="mt-3 max-w-2xl text-sm text-gray-600">
          Center Office owns business controls. Each linked academy keeps its own Teacher Office and Student Workplace for learning delivery.
        </p>
      </div>
      <div className="divide-y divide-gray-900/10">
        {academies.map((academy) => (
          <div key={academy.id} className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-bold text-gray-900">{academy.name || academy.slug || academy.id}</p>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">linked academy</span>
              </div>
              <p className="mt-1 break-all text-sm text-gray-600">{academy.slug || academy.id}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <span className="rounded-2xl border border-gray-900/10 bg-white/70 p-3 text-sm"><strong>{academy.counts?.staff ?? 0}</strong> staff</span>
                <span className="rounded-2xl border border-gray-900/10 bg-white/70 p-3 text-sm"><strong>{academy.counts?.contacts ?? 0}</strong> contacts</span>
                <span className="rounded-2xl border border-gray-900/10 bg-white/70 p-3 text-sm"><strong>{academy.counts?.classrooms ?? 0}</strong> classes</span>
                <span className="rounded-2xl border border-gray-900/10 bg-white/70 p-3 text-sm"><strong>{academy.counts?.offers ?? 0}</strong> offers</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <button type="button" className={secondaryButton} onClick={() => onSync(academy.id)} disabled={loading}>
                <RefreshCw className="h-4 w-4" />
                Sync students
              </button>
              <button type="button" className={primaryButton} onClick={() => academy.teacher_office_url && window.open(academy.teacher_office_url, '_blank', 'noopener,noreferrer')} disabled={!academy.teacher_office_url}>
                <ArrowUpRight className="h-4 w-4" />
                Teacher Office
              </button>
              <button type="button" className={secondaryButton} onClick={() => academy.academy_url && window.open(academy.academy_url, '_blank', 'noopener,noreferrer')} disabled={!academy.academy_url}>
                <School className="h-4 w-4" />
                Public academy
              </button>
              <button type="button" className={secondaryButton} onClick={() => onCopy(academy.teacher_office_url ?? '', 'Teacher Office link copied.')} disabled={!academy.teacher_office_url}>
                <Copy className="h-4 w-4" />
                Copy
              </button>
            </div>
          </div>
        ))}
        {academies.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={School} title="No academies linked yet" note="Create the first academy when this center is ready to run cohorts, classes, contacts, offers, and student communication." />
          </div>
        ) : null}
      </div>
    </div>

    <div className={`${panelClass} p-5 md:p-6 ${expanded ? 'lg:order-1' : ''}`}>
      <SectionTitle icon={School} label="Provisioning" title="Create linked academy" />
      <label className="mt-5 block text-sm font-semibold text-gray-800">
        Academy name
        <input value={academyForm.name} onChange={(e) => onAcademyFormChange((prev) => ({ ...prev, name: e.target.value }))} className={inputClass} placeholder="Atlas IELTS Academy" />
      </label>
      <label className="mt-4 block text-sm font-semibold text-gray-800">
        Slug
        <input value={academyForm.slug} onChange={(e) => onAcademyFormChange((prev) => ({ ...prev, slug: e.target.value }))} className={inputClass} placeholder="atlas-ielts-academy" />
      </label>
      <button type="button" onClick={onCreate} disabled={loading || !academyForm.name.trim()} className={`${primaryButton} mt-5 w-full`}>
        <School className="h-4 w-4" />
        Create academy
      </button>
      <p className="mt-3 text-xs leading-5 text-gray-500">
        Center owners and admins are added to the academy as staff. Teachers and students still enter through separate Academy routes.
      </p>
    </div>
  </section>
);

const TierUpgradePanel: React.FC<{
  catalog: PartnerCenterTierCatalog | null;
  currentTier: string;
  billingPeriod: 'monthly' | 'annual';
  loading: boolean;
  pending: string | null;
  maxOnlineAmount: number;
  onBillingPeriodChange: React.Dispatch<React.SetStateAction<'monthly' | 'annual'>>;
  onBuy: (plan: PartnerCenterTierPlan) => void;
  onCheck: () => void;
}> = ({ catalog, currentTier, billingPeriod, loading, pending, maxOnlineAmount, onBillingPeriodChange, onBuy, onCheck }) => {
  const tiers = catalog?.tiers ?? [];
  const activeRequests = (catalog?.requests ?? []).filter((request) => ['pending_payment', 'paid', 'manual_review'].includes(request.status));
  return (
    <section className="space-y-5">
      <div className={`${panelClass} p-5 md:p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <SectionTitle icon={Coins} label="Paid tiers" title="Upgrade Center Office" />
          <div className="inline-flex rounded-full border border-gray-900 bg-white p-1">
            {(['monthly', 'annual'] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => onBillingPeriodChange(period)}
                className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${billingPeriod === period ? 'bg-[#0f172a] text-white' : 'text-gray-700'}`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm text-gray-600">
          Tier payments are charged to the center tenant. After online payment is confirmed, Schood upgrades the center automatically and records the subscription period for admin audit.
        </p>
        <p className="mt-2 text-xs font-semibold text-gray-500">Current online payment limit: {money(maxOnlineAmount, 'UZS')}</p>
      </div>

      {pending ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Tier payment is pending confirmation.</span>
            <button type="button" onClick={onCheck} disabled={loading} className={secondaryButton}>Check payment</button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        {tiers.map((item) => {
          const plan = item.plans.find((candidate) => candidate.billing_period === billingPeriod) ?? item.plans[0] ?? null;
          const isCurrent = item.tier === currentTier;
          const onlineBlocked = Boolean(plan && plan.currency === 'UZS' && plan.amount > maxOnlineAmount);
          return (
            <article key={item.tier} className={`${panelClass} flex min-h-[420px] flex-col p-5 md:p-6`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{isCurrent ? 'Current tier' : 'Upgrade tier'}</p>
                  <h3 className="mt-2 text-2xl font-bold text-gray-900">{item.tier_label}</h3>
                </div>
                {isCurrent ? <StatusPill status="active" /> : null}
              </div>
              <p className="mt-5 text-3xl font-bold">{plan ? money(plan.amount, plan.currency) : 'Ask admin'}</p>
              <p className="mt-1 text-sm text-gray-500 capitalize">{plan?.billing_period ?? billingPeriod} billing</p>
              <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
                <span className="rounded-2xl border border-gray-900/10 bg-white/70 p-3 font-semibold">Staff {item.capabilities.staff_limit}</span>
                <span className="rounded-2xl border border-gray-900/10 bg-white/70 p-3 font-semibold">Batch {item.capabilities.max_voucher_batch_quantity}</span>
                <span className="rounded-2xl border border-gray-900/10 bg-white/70 p-3 font-semibold">Academy handoff {item.capabilities.student_invites_enabled ? 'ready' : 'locked'}</span>
                <span className="rounded-2xl border border-gray-900/10 bg-white/70 p-3 font-semibold">Events {item.capabilities.mock_events_enabled ? item.capabilities.max_upcoming_events : 'locked'}</span>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {item.capabilities.included_features.map((feature) => (
                  <span key={feature} className="rounded-full border border-gray-900/15 bg-white px-3 py-1 text-xs font-semibold text-gray-700">{feature}</span>
                ))}
              </div>
              <div className="mt-auto pt-6">
                {onlineBlocked ? <p className="mb-3 text-xs font-semibold text-amber-700">This plan is above the current online payment limit.</p> : null}
                <button
                  type="button"
                  onClick={() => plan && onBuy(plan)}
                  disabled={loading || !plan || onlineBlocked || (isCurrent && billingPeriod === 'monthly')}
                  className={`${isCurrent ? secondaryButton : primaryButton} w-full`}
                >
                  <CreditCard className="h-4 w-4" />
                  {isCurrent ? 'Renew annual/monthly' : 'Pay and upgrade'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className={`${panelClass} overflow-hidden`}>
        <div className="border-b border-gray-900/10 p-5 md:p-6">
          <SectionTitle icon={ReceiptText} label="Audit" title="Tier payment requests" />
        </div>
        <div className="divide-y divide-gray-900/10">
          {(catalog?.requests ?? []).slice(0, 8).map((request) => (
            <div key={request.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div>
                <p className="font-semibold capitalize">{request.previous_tier} to {request.requested_tier}</p>
                <p className="text-xs text-gray-500">{formatDateTime(request.created_at)} - {request.billing_period}</p>
              </div>
              <span className="font-semibold">{money(request.amount, request.currency)}</span>
              <StatusPill status={request.status} />
            </div>
          ))}
          {(catalog?.requests ?? []).length === 0 ? <div className="p-6"><EmptyState icon={ReceiptText} title="No tier requests yet" note="Upgrade and renewal attempts will appear here." /></div> : null}
        </div>
      </div>

      {activeRequests.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          There is an active tier request waiting for payment or admin settlement. Paying another plan will create a new request, but only paid/applied requests change the center tier.
        </div>
      ) : null}
    </section>
  );
};

const StudentsPanel: React.FC<{
  students: PartnerStudent[];
  invites: PartnerCenterStudentInvite[];
  inviteForm: { name: string; email: string; phone: string; voucher_batch_id: string };
  batches: PartnerVoucherBatch[];
  loading: boolean;
  onInviteFormChange: React.Dispatch<React.SetStateAction<{ name: string; email: string; phone: string; voucher_batch_id: string }>>;
  bulkInviteText: string;
  onBulkInviteTextChange: React.Dispatch<React.SetStateAction<string>>;
  onInvite: () => void;
  onBulkInvite: () => void;
  onCopy: (value: string, message?: string) => void;
  onResend: (inviteId: string) => void;
  onRevoke: (inviteId: string) => void;
}> = ({
  students,
  invites,
  inviteForm,
  batches,
  loading,
  onInviteFormChange,
  bulkInviteText,
  onBulkInviteTextChange,
  onInvite,
  onBulkInvite,
  onCopy,
  onResend,
  onRevoke,
}) => {
  const parsedBulkCount = parseBulkStudents(bulkInviteText).length;
  const voucherLinkedCount = students.filter((student) => {
    const metadata = (student.metadata ?? {}) as Record<string, unknown>;
    return Boolean(student.voucher_code || metadata.source_voucher_id || metadata.voucher_code);
  }).length;
  const pendingInvites = invites.filter((invite) => invite.status === 'pending').length;

  return (
    <section className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Registry" value={students.length} icon={UsersRound} />
        <StatCard label="Pending invites" value={pendingInvites} icon={Mail} />
        <StatCard label="Voucher-linked" value={voucherLinkedCount} icon={Ticket} />
        <StatCard label="Academy-ready" value={students.filter((student) => student.email || student.phone).length} icon={School} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className={`${panelClass} p-5 md:p-6`}>
          <SectionTitle icon={UserPlus} label="Intake" title="Student roster" />
          <label className="mt-5 block text-sm font-semibold text-gray-800">Name<input value={inviteForm.name} onChange={(e) => onInviteFormChange((prev) => ({ ...prev, name: e.target.value }))} className={inputClass} /></label>
          <label className="mt-4 block text-sm font-semibold text-gray-800">Email<input value={inviteForm.email} onChange={(e) => onInviteFormChange((prev) => ({ ...prev, email: e.target.value }))} className={inputClass} /></label>
          <label className="mt-4 block text-sm font-semibold text-gray-800">Phone<input value={inviteForm.phone} onChange={(e) => onInviteFormChange((prev) => ({ ...prev, phone: e.target.value }))} className={inputClass} /></label>
          <label className="mt-4 block text-sm font-semibold text-gray-800">Voucher batch<select value={inviteForm.voucher_batch_id} onChange={(e) => onInviteFormChange((prev) => ({ ...prev, voucher_batch_id: e.target.value }))} className={inputClass}><option value="">No voucher</option>{batches.filter((batch) => batch.status === 'active').map((batch) => <option key={batch.id} value={batch.id}>{batch.batch_code}</option>)}</select></label>
          <div className="mt-4 rounded-2xl border border-gray-900/10 bg-white/70 p-3">
            <label className="block text-sm font-semibold text-gray-800">Bulk roster<textarea value={bulkInviteText} onChange={(e) => onBulkInviteTextChange(e.target.value)} className={`${inputClass} min-h-[130px]`} placeholder="Student name, email, phone" /></label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-gray-500">
              <span>{parsedBulkCount ? `${parsedBulkCount} parsed` : 'No roster loaded'}</span>
              <button type="button" onClick={onBulkInvite} disabled={loading || parsedBulkCount === 0} className={secondaryButton}>Import roster</button>
            </div>
          </div>
          <button type="button" onClick={onInvite} disabled={loading || (!inviteForm.email.trim() && !inviteForm.phone.trim())} className={`${primaryButton} mt-5 w-full`}>Prepare invite</button>
        </div>
        <section className={`${panelClass} overflow-hidden`}>
          <div className="border-b border-gray-900/10 p-5 md:p-6"><SectionTitle icon={UsersRound} label="Students" title="Assigned and redeemed students" /></div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-900/10 text-sm">
              <thead className="bg-[#efe6d8]/70 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Access</th><th className="px-5 py-3">Voucher</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Last activity</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-900/10 bg-white/60">
                {students.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-4"><p className="font-semibold">{row.name || row.email || 'Student'}</p><p className="text-xs text-gray-500">{row.email || row.phone}</p></td>
                    <td className="px-5 py-4">{studentSourceLabel(row)}</td>
                    <td className="px-5 py-4">{row.product_name ?? row.access_kind}</td>
                    <td className="px-5 py-4 font-mono">{row.voucher_code ?? '-'}</td>
                    <td className="px-5 py-4"><StatusPill status={row.status} /></td>
                    <td className="px-5 py-4">{formatDate(row.last_activity_at ?? row.redeemed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {students.length === 0 ? <div className="p-6"><EmptyState icon={UsersRound} title="No students yet" note="Invites, assigned voucher rosters, and redeemed vouchers will appear here." /></div> : null}
        </section>
      </div>

      <section className={`${panelClass} overflow-hidden`}>
        <div className="border-b border-gray-900/10 p-5 md:p-6"><SectionTitle icon={Mail} label="Invitations" title="Student invite queue" /></div>
        <div className="divide-y divide-gray-900/10">
          {invites.map((invite) => (
            <div key={invite.id} className="grid gap-3 p-5 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{invite.full_name || invite.email || invite.phone || 'Student invite'}</p>
                  <StatusPill status={invite.status} />
                </div>
                <p className="mt-1 truncate text-sm text-gray-600">{invite.email || invite.phone || invite.invite_url}</p>
                <p className="mt-2 text-xs text-gray-500">
                  {invite.partner_voucher_batches?.batch_code ?? invite.partner_vouchers?.code ?? 'No voucher'} - expires {formatDate(invite.expires_at)}
                </p>
              </div>
              <div className="font-mono text-xs text-gray-500">{invite.partner_vouchers?.code ?? '-'}</div>
              <div className="flex flex-wrap gap-2">
                {invite.invite_url ? <button type="button" className={secondaryButton} onClick={() => onCopy(invite.invite_url!, 'Invite link copied.')}><Copy className="h-4 w-4" />Link</button> : null}
                {invite.message ? <button type="button" className={secondaryButton} onClick={() => onCopy(invite.message!, 'Invite message copied.')}><Copy className="h-4 w-4" />Message</button> : null}
                <button type="button" className={secondaryButton} disabled={invite.status !== 'pending' || loading} onClick={() => onResend(invite.id)}><RefreshCw className="h-4 w-4" />Resend</button>
                <button type="button" className={secondaryButton} disabled={!['pending', 'expired'].includes(invite.status) || loading} onClick={() => onRevoke(invite.id)}><Trash2 className="h-4 w-4" />Revoke</button>
              </div>
            </div>
          ))}
          {invites.length === 0 ? <div className="p-6"><EmptyState icon={Mail} title="No invitations yet" note="Prepared invite links and assigned voucher messages will appear here." /></div> : null}
        </div>
      </section>
    </section>
  );
};

const EventsPanel: React.FC<{
  events: PartnerCenterMockEvent[];
  students: PartnerStudent[];
  catalog: PartnerOfficeExperience[];
  batches: PartnerVoucherBatch[];
  eventForm: { title: string; experience_id: string; starts_at: string; mode: 'online' | 'offline' | 'hybrid'; visibility: 'private' | 'public'; voucher_batch_id: string; location: string; meeting_url: string; capacity: number };
  loading: boolean;
  onEventFormChange: React.Dispatch<React.SetStateAction<{ title: string; experience_id: string; starts_at: string; mode: 'online' | 'offline' | 'hybrid'; visibility: 'private' | 'public'; voucher_batch_id: string; location: string; meeting_url: string; capacity: number }>>;
  onCreate: () => void;
  onAttendance: (payload: { event_id?: string; registration_id?: string | null; student_id?: string | null; voucher_id?: string | null }, status: 'pending' | 'present' | 'absent' | 'late') => void;
  onStatus: (eventId: string, status: 'scheduled' | 'completed' | 'cancelled') => void;
  onVisibility: (eventId: string, visibility: 'private' | 'public') => void;
}> = ({ events, students, catalog, batches, eventForm, loading, onEventFormChange, onCreate, onAttendance, onStatus, onVisibility }) => (
  <section className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
    <div className={`${panelClass} p-5 md:p-6`}>
      <SectionTitle icon={CalendarDays} label="Mock events" title="Schedule event" />
      <label className="mt-5 block text-sm font-semibold text-gray-800">Title<input value={eventForm.title} onChange={(e) => onEventFormChange((prev) => ({ ...prev, title: e.target.value }))} className={inputClass} /></label>
      <label className="mt-4 block text-sm font-semibold text-gray-800">Mock<select value={eventForm.experience_id} onChange={(e) => onEventFormChange((prev) => ({ ...prev, experience_id: e.target.value }))} className={inputClass}><option value="">Select mock</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.product_name ? `${item.product_name} - ${item.name}` : item.name}</option>)}</select></label>
      <label className="mt-4 block text-sm font-semibold text-gray-800">Starts<input type="datetime-local" value={eventForm.starts_at} onChange={(e) => onEventFormChange((prev) => ({ ...prev, starts_at: e.target.value }))} className={inputClass} /></label>
      <label className="mt-4 block text-sm font-semibold text-gray-800">Mode<select value={eventForm.mode} onChange={(e) => onEventFormChange((prev) => ({ ...prev, mode: e.target.value as any }))} className={inputClass}><option value="online">Online</option><option value="offline">Offline</option><option value="hybrid">Hybrid</option></select></label>
      <label className="mt-4 block text-sm font-semibold text-gray-800">Public page<select value={eventForm.visibility} onChange={(e) => onEventFormChange((prev) => ({ ...prev, visibility: e.target.value as 'private' | 'public' }))} className={inputClass}><option value="private">Private roster</option><option value="public">Public listing</option></select></label>
      <label className="mt-4 block text-sm font-semibold text-gray-800">Voucher batch<select value={eventForm.voucher_batch_id} onChange={(e) => onEventFormChange((prev) => ({ ...prev, voucher_batch_id: e.target.value }))} className={inputClass}><option value="">No batch</option>{batches.filter((batch) => batch.status === 'active').map((batch) => <option key={batch.id} value={batch.id}>{batch.batch_code}</option>)}</select></label>
      <label className="mt-4 block text-sm font-semibold text-gray-800">Location or link<input value={eventForm.location} onChange={(e) => onEventFormChange((prev) => ({ ...prev, location: e.target.value }))} className={inputClass} /></label>
      <button type="button" onClick={onCreate} disabled={loading || !eventForm.title.trim() || !eventForm.starts_at || !eventForm.experience_id} className={`${primaryButton} mt-5 w-full`}>Create event</button>
    </div>
    <div className="space-y-4">
      {events.map((event) => (
        <div key={event.id} className={`${panelClass} p-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold">{event.title}</h3>
              <p className="text-sm text-gray-600">{formatDateTime(event.starts_at)} - {event.mode} - {event.experiences?.name ?? 'Mock test'}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{event.partner_voucher_batches?.batch_code ?? 'Direct roster'} - {isPublicCenterEvent(event) ? 'Public listing' : 'Private roster'}</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <StatusPill status={event.status} />
              <StatusPill status={isPublicCenterEvent(event) ? 'public' : 'private'} />
              <button type="button" className={secondaryButton} disabled={loading} onClick={() => onVisibility(event.id, isPublicCenterEvent(event) ? 'private' : 'public')}>
                {isPublicCenterEvent(event) ? 'Make private' : 'Make public'}
              </button>
              {event.status !== 'completed' ? <button type="button" className={secondaryButton} disabled={loading} onClick={() => onStatus(event.id, 'completed')}>Complete</button> : null}
              {event.status !== 'cancelled' ? <button type="button" className={secondaryButton} disabled={loading} onClick={() => onStatus(event.id, 'cancelled')}>Cancel</button> : null}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><StatCard label="Registered" value={event.registered_count ?? 0} icon={UsersRound} /><StatCard label="Present" value={event.present_count ?? 0} icon={ClipboardList} /><StatCard label="Capacity" value={event.capacity ?? '-'} icon={Ticket} /></div>
          {(event.registrations ?? []).length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-900/10">
              <table className="min-w-full divide-y divide-gray-900/10 text-sm">
                <thead className="bg-[#efe6d8]/70 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                  <tr><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Voucher</th><th className="px-4 py-3">Attendance</th><th className="px-4 py-3">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-900/10 bg-white/60">
                  {(event.registrations ?? []).map((registration) => {
                    const studentName = registration.partner_center_students?.full_name || registration.partner_vouchers?.assigned_name || registration.partner_center_students?.email || registration.partner_vouchers?.assigned_email || 'Candidate';
                    return (
                      <tr key={registration.id}>
                        <td className="px-4 py-3"><p className="font-semibold">{studentName}</p><p className="text-xs text-gray-500">{registration.partner_center_students?.phone || registration.partner_vouchers?.assigned_phone || ''}</p></td>
                        <td className="px-4 py-3 font-mono">{registration.partner_vouchers?.code ?? '-'}</td>
                        <td className="px-4 py-3"><StatusPill status={registration.attendance_status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className={secondaryButton} onClick={() => onAttendance({ registration_id: registration.id }, 'present')}>Present</button>
                            <button type="button" className={secondaryButton} onClick={() => onAttendance({ registration_id: registration.id }, 'late')}>Late</button>
                            <button type="button" className={secondaryButton} onClick={() => onAttendance({ registration_id: registration.id }, 'absent')}>Absent</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {(event.registrations ?? []).length === 0 && students.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {students.slice(0, 8).map((student) => student.student_id ? <button key={student.id} type="button" onClick={() => onAttendance({ event_id: event.id, student_id: student.student_id }, 'present')} className={secondaryButton}>Mark {student.name || student.email} present</button> : null)}
            </div>
          ) : null}
        </div>
      ))}
      {events.length === 0 ? <EmptyState icon={CalendarDays} title="No mock events yet" note="Schedule online or offline mock sessions from voucher batches or direct attendance." /> : null}
    </div>
  </section>
);

const ReviewQueuePanel: React.FC<{ reviewItems: PartnerCenterReviewItem[]; onUpdate: (id: string, status: string) => void }> = ({ reviewItems, onUpdate }) => (
  <section className={`${panelClass} overflow-hidden`}>
    <div className="border-b border-gray-900/10 p-5 md:p-6"><SectionTitle icon={ClipboardList} label="Teacher workflow" title="Review queue" /></div>
    <div className="divide-y divide-gray-900/10">
      {reviewItems.map((item) => (
        <div key={item.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
          <div><p className="font-semibold capitalize">{item.skill} review</p><p className="text-sm text-gray-600">{item.partner_center_students?.full_name || item.partner_center_students?.email || 'Student'} - {item.partner_center_groups?.name ?? item.partner_center_mock_events?.title ?? 'General'}</p></div>
          <StatusPill status={item.status} />
          <div className="flex flex-wrap gap-2"><button type="button" className={secondaryButton} onClick={() => onUpdate(item.id, 'in_review')}>Start</button><button type="button" className={primaryButton} onClick={() => onUpdate(item.id, 'released')}>Release</button></div>
        </div>
      ))}
      {reviewItems.length === 0 ? <div className="p-6"><EmptyState icon={ClipboardList} title="No pending reviews" note="Writing, speaking, and manual review work will appear here." /></div> : null}
    </div>
  </section>
);

const VoucherTable: React.FC<{ vouchers: PartnerVoucher[]; onCopy: (code: string) => void; onVoid: (id: string) => void }> = ({ vouchers, onCopy, onVoid }) => (
  <>
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-900/10 text-sm">
        <thead className="bg-[#efe6d8]/70 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
          <tr><th className="px-5 py-3">Code</th><th className="px-5 py-3">Access</th><th className="px-5 py-3">Product</th><th className="px-5 py-3">Classroom</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Expires</th><th className="px-5 py-3">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-900/10 bg-white/60">
          {vouchers.map((voucher) => (
            <tr key={voucher.id}>
              <td className="px-5 py-4 font-mono font-bold">{voucher.code}</td>
              <td className="px-5 py-4 capitalize">{voucher.access_kind.replace('_', ' ')}</td>
              <td className="px-5 py-4">{voucher.products?.name ?? voucher.experiences?.name ?? voucher.plans?.name ?? '-'}</td>
              <td className="px-5 py-4">{voucher.academy_classrooms?.name ?? '-'}</td>
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
  maxOnlineAmount: number;
  maxOnlineQuantity: number;
  onlineBlocked: boolean;
  loading: boolean;
  pending: string | null;
  onChange: React.Dispatch<React.SetStateAction<{ experience_id: string; quantity: number; expires_in_days: number; apply_credit: boolean }>>;
  onBuy: () => void;
  onCheck: () => void;
}> = ({ catalog, form, selected, maxOnlineAmount, maxOnlineQuantity, onlineBlocked, loading, pending, onChange, onBuy, onCheck }) => (
  <div className={`${panelClass} p-5 md:p-6`}>
    <SectionTitle icon={Ticket} label="Wholesale pack" title="Buy mock tickets" />
    <label className="mt-5 block text-sm font-semibold text-gray-800">Mock exam<select value={form.experience_id} onChange={(e) => onChange((prev) => ({ ...prev, experience_id: e.target.value }))} className={inputClass}><option value="">Select mock</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.product_name ? `${item.product_name} - ${item.name}` : item.name}{item.is_ticket_ready ? '' : ' (price needed)'}</option>)}</select></label>
    <label className="mt-4 block text-sm font-semibold text-gray-800">Quantity<input type="number" min={1} max={200} value={form.quantity} onChange={(e) => onChange((prev) => ({ ...prev, quantity: Number(e.target.value) }))} className={inputClass} /></label>
    <label className="mt-4 block text-sm font-semibold text-gray-800">Expiry days<input type="number" min={1} max={30} value={form.expires_in_days} onChange={(e) => onChange((prev) => ({ ...prev, expires_in_days: Number(e.target.value) }))} className={inputClass} /></label>
    <p className="mt-4 text-sm text-gray-600">Estimate: <strong>{money((selected?.price_amount ?? 0) * form.quantity, selected?.price_currency ?? 'UZS')}</strong></p>
    <p className="mt-2 text-xs text-gray-500">
      Current online checkout limit: {money(maxOnlineAmount, 'UZS')} per transaction. Larger center packs can use wallet/admin settlement or smaller online purchases.
    </p>
    {onlineBlocked ? (
      <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
        This pack is above the current online checkout limit{maxOnlineQuantity > 0 ? `; buy up to ${maxOnlineQuantity} online, or use wallet for the full pack.` : '; use wallet top-up for this item.'}
      </p>
    ) : null}
    {catalog.length === 0 ? (
      <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
        No active single-sitting mock tests are configured for center sales yet.
      </p>
    ) : null}
    <button type="button" onClick={onBuy} disabled={loading || !selected || !selected.is_ticket_ready || onlineBlocked} className={`${primaryButton} mt-5 w-full`}>Buy tickets</button>
    {pending ? <button type="button" onClick={onCheck} className={`${secondaryButton} mt-3 w-full`}>Check payment</button> : null}
  </div>
);

const BuySeatPanel: React.FC<{
  plans: PartnerOfficePlan[];
  form: { plan_id: string; seat_count: number; apply_credit: boolean };
  selected?: PartnerOfficePlan | null;
  maxOnlineAmount: number;
  maxOnlineQuantity: number;
  onlineBlocked: boolean;
  loading: boolean;
  pending: string | null;
  onChange: React.Dispatch<React.SetStateAction<{ plan_id: string; seat_count: number; apply_credit: boolean }>>;
  onBuy: () => void;
  onCheck: () => void;
}> = ({ plans, form, selected, maxOnlineAmount, maxOnlineQuantity, onlineBlocked, loading, pending, onChange, onBuy, onCheck }) => (
  <div className={`${panelClass} p-5 md:p-6`}>
    <SectionTitle icon={UsersRound} label="Seat pack" title="Buy subscriptions" />
    <label className="mt-5 block text-sm font-semibold text-gray-800">Plan<select value={form.plan_id} onChange={(e) => onChange((prev) => ({ ...prev, plan_id: e.target.value }))} className={inputClass}>{plans.map((item) => <option key={item.id} value={item.id}>{item.products?.name ? `${item.products.name} - ${item.name}` : item.name}</option>)}</select></label>
    <label className="mt-4 block text-sm font-semibold text-gray-800">Seats<input type="number" min={1} max={200} value={form.seat_count} onChange={(e) => onChange((prev) => ({ ...prev, seat_count: Number(e.target.value) }))} className={inputClass} /></label>
    <p className="mt-4 text-sm text-gray-600">Estimate: <strong>{money((selected?.amount ?? 0) * form.seat_count, selected?.currency ?? 'UZS')}</strong></p>
    <p className="mt-2 text-xs text-gray-500">
      Current online checkout limit: {money(maxOnlineAmount, 'UZS')} per transaction. Larger seat bundles can use wallet/admin settlement or smaller online purchases.
    </p>
    {onlineBlocked ? (
      <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
        This bundle is above the current online checkout limit{maxOnlineQuantity > 0 ? `; buy up to ${maxOnlineQuantity} online, or use wallet for the full bundle.` : '; use wallet top-up for this plan.'}
      </p>
    ) : null}
    <button type="button" onClick={onBuy} disabled={loading || !selected || onlineBlocked} className={`${primaryButton} mt-5 w-full`}>Buy seats</button>
    {pending ? <button type="button" onClick={onCheck} className={`${secondaryButton} mt-3 w-full`}>Check payment</button> : null}
  </div>
);

const VoucherGeneratorPanel: React.FC<{
  catalog: PartnerOfficeExperience[];
  plans: PartnerOfficePlan[];
  wallet: { currency: string; available_amount: number };
  form: { access_kind: 'mock_exam' | 'subscription' | 'seat'; experience_id: string; plan_id: string; classroom_id: string; quantity: number; expires_in_days: number; prefix: string; source_model: string };
  classrooms: Array<{ id: string; academy_id: string; name: string; academy_name: string; is_active: boolean }>;
  assignedText: string;
  maxQuantity: number;
  loading: boolean;
  onChange: React.Dispatch<React.SetStateAction<{ access_kind: 'mock_exam' | 'subscription' | 'seat'; experience_id: string; plan_id: string; classroom_id: string; quantity: number; expires_in_days: number; prefix: string; source_model: string }>>;
  onAssignedTextChange: React.Dispatch<React.SetStateAction<string>>;
  onCreate: () => void;
}> = ({ catalog, plans, wallet, form, classrooms, assignedText, maxQuantity, loading, onChange, onAssignedTextChange, onCreate }) => {
  const assignedCount = parseBulkStudents(assignedText).length;
  const exceedsBatchLimit = assignedCount > maxQuantity;
  return (
    <div className={`${panelClass} p-5 md:p-6`}>
      <SectionTitle icon={UserPlus} label="Distribution" title="Generate vouchers" />
      <label className="mt-5 block text-sm font-semibold text-gray-800">Access type<select value={form.access_kind} onChange={(e) => onChange((prev) => ({ ...prev, access_kind: e.target.value as any }))} className={inputClass}><option value="mock_exam">Mock exam</option><option value="subscription">Subscription</option><option value="seat">Seat voucher</option></select></label>
      {form.access_kind === 'mock_exam' ? (
        <label className="mt-4 block text-sm font-semibold text-gray-800">Mock exam<select value={form.experience_id} onChange={(e) => onChange((prev) => ({ ...prev, experience_id: e.target.value }))} className={inputClass}><option value="">Select mock</option>{catalog.map((item) => <option key={item.id} value={item.id}>{item.product_name ? `${item.product_name} - ${item.name}` : item.name}{item.is_ticket_ready ? '' : ' (price needed)'}</option>)}</select></label>
      ) : (
        <label className="mt-4 block text-sm font-semibold text-gray-800">Plan<select value={form.plan_id} onChange={(e) => onChange((prev) => ({ ...prev, plan_id: e.target.value }))} className={inputClass}>{plans.map((item) => <option key={item.id} value={item.id}>{item.products?.name ? `${item.products.name} - ${item.name}` : item.name}</option>)}</select></label>
      )}
      <label className="mt-4 block text-sm font-semibold text-gray-800">
        Bind to academy classroom
        <select value={form.classroom_id} onChange={(e) => onChange((prev) => ({ ...prev, classroom_id: e.target.value }))} className={inputClass}>
          <option value="">No classroom binding</option>
          {classrooms.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>{classroom.academy_name} - {classroom.name}</option>
          ))}
        </select>
      </label>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold text-gray-800">Quantity<input type="number" min={1} max={maxQuantity} value={form.quantity} onChange={(e) => onChange((prev) => ({ ...prev, quantity: Number(e.target.value) }))} className={inputClass} /></label>
        <label className="text-sm font-semibold text-gray-800">Days<input type="number" min={1} max={365} value={form.expires_in_days} onChange={(e) => onChange((prev) => ({ ...prev, expires_in_days: Number(e.target.value) }))} className={inputClass} /></label>
      </div>
      <label className="mt-4 block text-sm font-semibold text-gray-800">Assigned roster<textarea value={assignedText} onChange={(e) => onAssignedTextChange(e.target.value)} className={`${inputClass} min-h-[110px]`} placeholder="Student name, email, phone" /></label>
      <p className={`mt-2 text-xs font-semibold ${exceedsBatchLimit ? 'text-red-700' : 'text-gray-500'}`}>
        {assignedCount ? `${assignedCount} students parsed; voucher quantity will follow the roster.` : `No roster attached; quantity stays ${form.quantity}.`}
      </p>
      <label className="mt-4 block text-sm font-semibold text-gray-800">Code prefix<input value={form.prefix} onChange={(e) => onChange((prev) => ({ ...prev, prefix: e.target.value }))} className={inputClass} /></label>
      <label className="mt-4 block text-sm font-semibold text-gray-800">Commercial model<select value={form.source_model} onChange={(e) => onChange((prev) => ({ ...prev, source_model: e.target.value }))} className={inputClass}><option value="prepaid_wallet">Prepaid wallet</option><option value="wholesale">Wholesale</option><option value="revenue_share">Revenue share</option><option value="manual">Manual</option></select></label>
      <p className="mt-4 text-sm text-gray-600">Wallet available: <strong>{money(wallet.available_amount, wallet.currency)}</strong></p>
      <p className="mt-2 text-xs text-gray-500">Your current tier allows up to {maxQuantity} vouchers per batch.</p>
      <button type="button" onClick={onCreate} disabled={loading || exceedsBatchLimit || (form.access_kind === 'mock_exam' && !catalog.some((item) => item.id === form.experience_id && item.is_ticket_ready))} className={`${primaryButton} mt-5 w-full`}>Generate vouchers</button>
    </div>
  );
};

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
