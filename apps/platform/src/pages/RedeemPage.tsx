import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CheckCircle2, KeyRound, Loader2, Ticket } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SiteHeader, type SiteHeaderAction } from '../components/layout/SiteHeader';
import { supabase } from '../lib/supabase';
import { candidateEntry, voucherPreview, voucherRedeem, type VoucherPreview } from '../lib/platformClient';

const inputClass =
  'mt-2 w-full rounded-2xl border border-gray-900/25 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100';
const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-full border border-gray-900 bg-white/80 px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50';

const normalizeCode = (value?: string | null) => String(value ?? '').trim().toUpperCase();

const toErrorMessage = (err: unknown) => {
  const raw = err instanceof Error ? err.message : String(err ?? 'Something went wrong');
  const explicit = raw.match(/"error":"([^"]+)"/i)?.[1];
  if (explicit) return explicit;
  if (/not found/i.test(raw)) return 'Voucher not found.';
  if (/expired/i.test(raw)) return 'Voucher has expired.';
  if (/already/i.test(raw)) return 'Voucher has already been redeemed.';
  if (/login|unauthorized|401/i.test(raw)) return 'Please log in to redeem this voucher.';
  return raw;
};

export const RedeemPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const initialCode = useMemo(() => normalizeCode(params.code ?? searchParams.get('code')), [params.code, searchParams]);
  const [code, setCode] = useState(initialCode);
  const [voucher, setVoucher] = useState<VoucherPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null);
  const [candidate, setCandidate] = useState({ first_name: '', last_name: '', email: '', phone: '' });

  const preview = async (targetCode = code) => {
    const clean = normalizeCode(targetCode);
    if (!clean) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await voucherPreview(clean);
      setVoucher(res.voucher);
      setCode(res.voucher.code);
    } catch (err) {
      setVoucher(null);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCode) void preview(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  const redeemSubscription = async () => {
    if (!voucher) return;
    setRedeeming(true);
    setError(null);
    setSuccess(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        navigate(`/auth?mode=signin&returnTo=${encodeURIComponent(`/redeem/${encodeURIComponent(voucher.code)}`)}`);
        return;
      }
      const res = await voucherRedeem(voucher.code, token);
      setVoucher(res.voucher);
      setSuccess('Access activated.');
      if (res.next_url) {
        window.setTimeout(() => window.location.assign(res.next_url || '/account'), 450);
      }
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setRedeeming(false);
    }
  };

  const redeemMock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!voucher) return;
    setRedeeming(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await candidateEntry({
        token_code: voucher.code,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        email: candidate.email,
        phone: candidate.phone,
      });
      const appBase = String(res.app_url ?? '').trim().replace(/\/$/, '');
      if (!appBase) throw new Error('Exam app URL is not configured');
      const qs = new URLSearchParams({
        access_token: res.session.access_token,
        refresh_token: res.session.refresh_token,
        expires_in: String(res.session.expires_in),
        session_id: res.session_id,
      });
      if (res.first_section_id) qs.set('first_section_id', res.first_section_id);
      const target = `${appBase}/candidate?${qs.toString()}`;
      setHandoffUrl(target);
      window.location.assign(target);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setRedeeming(false);
    }
  };

  const actions: SiteHeaderAction[] = [
    { id: 'home', label: 'Home', onClick: () => navigate('/') },
    { id: 'account', label: 'Account', onClick: () => navigate('/account'), primary: true },
  ];

  return (
    <div className="min-h-screen bg-[#f6f1e8] text-gray-900">
      <SiteHeader actions={actions} brandLabel="schood redeem" />
      <main className="px-6 py-10 md:px-10">
        <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="rounded-3xl border border-gray-900 bg-white/85 p-6 shadow-sm md:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-900 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gray-800">
              <KeyRound className="h-4 w-4" />
              Voucher redeem
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-bold leading-tight md:text-5xl">
              Enter your center code and start instantly.
            </h1>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={`${inputClass} mt-0 sm:max-w-sm`} placeholder="SCH-ATLAS-IELTS30-8K29" />
              <button type="button" onClick={() => void preview()} disabled={loading || !code.trim()} className={primaryButton}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                Check code
              </button>
            </div>

            {error ? <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            {success ? <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}
            {handoffUrl ? (
              <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                Redirecting to your exam. <button type="button" className="font-semibold underline" onClick={() => window.location.assign(handoffUrl)}>Open again</button>
              </div>
            ) : null}

            {voucher?.access_kind === 'mock_exam' && voucher.status === 'unused' ? (
              <form onSubmit={redeemMock} className="mt-8 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-semibold text-gray-800">First name<input required value={candidate.first_name} onChange={(e) => setCandidate((prev) => ({ ...prev, first_name: e.target.value }))} className={inputClass} /></label>
                <label className="text-sm font-semibold text-gray-800">Last name<input required value={candidate.last_name} onChange={(e) => setCandidate((prev) => ({ ...prev, last_name: e.target.value }))} className={inputClass} /></label>
                <label className="text-sm font-semibold text-gray-800">Email<input required type="email" value={candidate.email} onChange={(e) => setCandidate((prev) => ({ ...prev, email: e.target.value }))} className={inputClass} /></label>
                <label className="text-sm font-semibold text-gray-800">Phone<input required value={candidate.phone} onChange={(e) => setCandidate((prev) => ({ ...prev, phone: e.target.value }))} className={inputClass} /></label>
                <div className="md:col-span-2"><button type="submit" disabled={redeeming} className={primaryButton}>{redeeming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}Start mock exam</button></div>
              </form>
            ) : null}

            {voucher && voucher.access_kind !== 'mock_exam' && voucher.status === 'unused' ? (
              <div className="mt-8">
                <button type="button" onClick={() => void redeemSubscription()} disabled={redeeming} className={primaryButton}>
                  {redeeming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Activate access
                </button>
              </div>
            ) : null}
          </div>

          <aside className="rounded-3xl border border-gray-900 bg-[#0f172a] p-6 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Voucher status</p>
            {voucher ? (
              <div className="mt-5 space-y-5">
                <div>
                  <p className="font-mono text-2xl font-bold">{voucher.code}</p>
                  <p className="mt-2 text-sm capitalize text-white/70">{voucher.access_kind.replace('_', ' ')}</p>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4 text-sm text-white/80">
                  <p className="font-semibold text-white">{voucher.product?.name ?? voucher.experience?.name ?? voucher.plan?.name ?? 'Schood access'}</p>
                  <p className="mt-2">Status: {voucher.status}</p>
                  <p>Expires: {voucher.expires_at ? new Date(voucher.expires_at).toLocaleDateString() : '-'}</p>
                </div>
                {voucher.center ? (
                  <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Center</p>
                    <p className="mt-2 font-semibold">{voucher.center.display_name}</p>
                    <p className="mt-2 text-sm text-white/70">{voucher.center.public_instructions}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 text-sm text-white/70">Your voucher details will appear here after the code is checked.</p>
            )}
            <button type="button" onClick={() => navigate('/contact')} className={`${secondaryButton} mt-6 w-full border-white/30 bg-white/10 text-white hover:bg-white/15`}>
              Need help?
            </button>
          </aside>
        </section>
      </main>
    </div>
  );
};
