import { useEffect, useState } from 'react';
import { CheckCircle2, Gift, ShieldCheck } from 'lucide-react';
import { ApiError, Button, ButtonLink, Card, Eyebrow, Field, Link, PageHeader, signInUrl, TextInput, useI18n, useSession, useT, useWorkspace } from '../../core/index.ts';
import { count, redeemGift, type RedeemView } from '../api.ts';

// /gift#<code>: redeem an L18 gift. The code travels in the URL fragment (never sent to a
// server or kept in logs); the page keeps it in this tab while the person signs in, then
// removes it from the address bar. Redeeming twice is safe: the second time is a replay.

const KEY = 'schood-ai.gift';
const read = () => { try { return sessionStorage.getItem(KEY) ?? ''; } catch { return ''; } };
const keep = (code: string) => { try { if (code) sessionStorage.setItem(KEY, code); else sessionStorage.removeItem(KEY); } catch { /* it stays in the field */ } };

export function GiftPage() {
  const t = useT(), { locale } = useI18n(), session = useSession(), workspace = useWorkspace();
  const [code, setCode] = useState(() => {
    const fromLink = decodeURIComponent(location.hash.slice(1)).trim();
    if (fromLink) keep(fromLink);
    return fromLink || read();
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<RedeemView | null>(null);
  // The code leaves the address bar (history, screenshots, shared tabs) once it is in the field.
  useEffect(() => { if (location.hash) history.replaceState(history.state, '', `${location.pathname}${location.search}`); }, []);

  const header = <PageHeader eyebrow={<Eyebrow icon={<Gift size={14} aria-hidden="true"/>}>{t('pricing.eyebrow')}</Eyebrow>} title={t('pricing.gift.title')} lead={t('pricing.redeem.lead')}/>;
  if (session.status !== 'signed_in') {
    return <>{header}<Card className="flex flex-col gap-3">
      <p className="m-0 text-sm leading-6 text-gray-800">{t('pricing.redeem.signIn')}</p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={signInUrl('login', `${location.origin}/gift`)}>{t('pricing.redeem.signInButton')}</ButtonLink>
      </div>
    </Card></>;
  }
  if (done) {
    return <>{header}<Card className="flex flex-col gap-4">
      <p className="m-0 inline-flex items-start gap-2 text-base font-semibold leading-7 text-gray-900"><CheckCircle2 size={20} className="mt-1 shrink-0" aria-hidden="true"/>
        {done.gift.kind === 'credits' ? t('pricing.redeem.credits', { count: count(done.gift.credits ?? 0, locale) }) : t('pricing.redeem.plus', { count: done.gift.days ?? 0 })}</p>
      {done.gift.kind === 'credits' && <p className="m-0 text-sm text-gray-700">{t('pricing.redeem.creditsNote')}</p>}
      {done.consent_step && <div className="flex flex-col gap-2 rounded-2xl border border-navy-line bg-cream-soft p-4">
        <p className="m-0 inline-flex items-start gap-2 text-sm leading-6 text-gray-900"><ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true"/>{t('pricing.redeem.consent')}</p>
        <div><Link to="/consent?next=%2F" className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('pricing.redeem.consentButton')}</Link></div>
      </div>}
      <div><Link to="/" className="inline-flex min-h-11 items-center rounded-full border border-navy-line bg-white px-4 text-sm font-semibold text-gray-900 no-underline">{t('pricing.redeem.open')}</Link></div>
    </Card></>;
  }
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const reply = await redeemGift(code);
      keep('');
      setDone(reply);
      void workspace.refresh();
    } catch (cause) {
      const key = cause instanceof ApiError ? `pricing.redeem.error.${cause.code}` : '';
      const text = key ? t(key) : '';
      setError(text && text !== key ? text : t('pricing.redeem.error.other'));
    } finally { setBusy(false); }
  };
  return <>{header}<Card className="flex flex-col gap-4">
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Field label={t('pricing.redeem.field')}>{(id) => <TextInput id={id} value={code} onChange={(event) => { setCode(event.target.value); keep(event.target.value); }}
        autoComplete="off" autoCapitalize="characters" spellCheck={false} className="font-mono tracking-wider" placeholder="XXXX-XXXX-XXXX-XXXX" required maxLength={40}/>}</Field>
      {error && <p className="m-0 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <div><Button type="submit" disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 16}>{t('pricing.redeem.button')}</Button></div>
    </form>
  </Card></>;
}
