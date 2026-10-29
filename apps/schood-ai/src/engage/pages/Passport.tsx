import { useEffect, useState } from 'react';
import { BadgeCheck, Copy, Download, EyeOff, Eye, IdCard, Link2, QrCode as QrIcon, ShieldCheck, XCircle } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Eyebrow, Field, navigate, TextInput, useI18n, useSession } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { publicGet, useAction, useEngage, type PassportItemView, type PassportOwn } from '../api.ts';
import { QrCode } from '../qr.tsx';
import { EngageError, Loaded, Notice, Page, selectClass } from '../ui.tsx';

// /passport (E3): one profile with certificates, levels, verified results and chosen
// samples. Private by default; a share link shows only the items it was made with and
// can be turned off at once. /p/:token is what a link holder sees; /verify/:code
// checks a Skill Certificate (the QR on it).

const itemLine = (item: { kind: string; data: Record<string, unknown> }, t: (key: string, params?: Record<string, string | number>) => string) => {
  const data = item.data;
  if (item.kind === 'result') return t('engage.passport.result', { skill: String(data.skill ?? data.feature ?? ''), score: String(data.score ?? '') });
  if (item.kind === 'certificate' && data.code) return t('engage.passport.code', { code: String(data.code) });
  if (item.kind === 'level') return t('engage.passport.level', { level: String(data.level ?? '') });
  if (item.kind === 'journey') return t('engage.passport.journey', { weeks: String(data.weeks ?? '') });
  return '';
};

function ItemRow({ item, onToggle, busy }: { item: PassportItemView; onToggle: (shown: boolean) => void; busy: boolean }) {
  const t = useT(), { date } = useI18n();
  return <li className="flex flex-wrap items-center gap-3 rounded-2xl border border-navy-line/30 bg-white p-3">
    <div className="min-w-0 flex-1">
      <p className="m-0 font-semibold">{item.title}</p>
      <p className="m-0 text-sm text-gray-600">{[itemLine(item, t), item.issued_at ? date(item.issued_at, { dateStyle: 'medium' }) : ''].filter(Boolean).join(' · ')}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {item.verified ? <Badge tone="lime"><BadgeCheck size={12} aria-hidden="true"/>{t('engage.passport.verified')}</Badge> : <Badge>{t(item.source === 'platform' ? 'engage.passport.issuedOnPlatform' : 'engage.passport.notVerified')}</Badge>}
        <Badge>{t(`engage.passport.source.${item.source}`)}</Badge>
        {item.verify_url && <a href={item.verify_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-gray-900 underline underline-offset-2">{t('engage.passport.check')}</a>}
      </div>
    </div>
    <Button size="sm" variant={item.shown ? 'secondary' : 'ghost'} disabled={busy} onClick={() => onToggle(!item.shown)} aria-pressed={item.shown}
      icon={item.shown ? <Eye size={14} aria-hidden="true"/> : <EyeOff size={14} aria-hidden="true"/>}>{item.shown ? t('engage.passport.shown') : t('engage.passport.hidden')}</Button>
  </li>;
}

function NewLink({ data, onCreated }: { data: PassportOwn; onCreated: (next: PassportOwn & { url: string }) => void }) {
  const t = useT(), action = useAction();
  const shown = [...data.items.filter((item) => item.shown), ...data.samples.filter((sample) => sample.shown && sample.item_id).map((sample) => ({ id: sample.item_id!, title: t(`engage.thenNow.kind.${sample.kind}`) }))];
  const [label, setLabel] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [days, setDays] = useState('30');
  useEffect(() => { setChosen(shown.map((item) => item.id)); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async () => {
    const result = await action.run<PassportOwn & { url: string }>('passport-link', { label: label.trim(), item_ids: chosen, ...(days ? { expires_in_days: Number(days) } : {}) });
    if (result) { onCreated(result); setLabel(''); }
  };
  if (!shown.length) return <Notice>{t('engage.passport.chooseFirst')}</Notice>;
  return <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void create(); }}>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t('engage.passport.linkLabel')} hint={t('engage.passport.linkLabelHint')}>{(id) => <TextInput id={id} required maxLength={60} value={label} onChange={(event) => setLabel(event.target.value)}/>}</Field>
      <Field label={t('engage.passport.expires')}>{(id) => <select id={id} className={selectClass} value={days} onChange={(event) => setDays(event.target.value)}>
        {['7', '30', '90', '365'].map((value) => <option key={value} value={value}>{t('engage.passport.days', { count: Number(value) })}</option>)}
        <option value="">{t('engage.passport.never')}</option>
      </select>}</Field>
    </div>
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="mb-1 text-sm font-semibold">{t('engage.passport.include')}</legend>
      {shown.map((item) => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={chosen.includes(item.id)} onChange={(event) => setChosen(event.target.checked ? [...chosen, item.id] : chosen.filter((id) => id !== item.id))}/>{item.title}</label>)}
    </fieldset>
    {action.error !== null && <EngageError error={action.error}/>}
    <div><Button type="submit" disabled={action.busy !== null || !label.trim() || !chosen.length} icon={<Link2 size={16} aria-hidden="true"/>}>{t('engage.passport.makeLink')}</Button></div>
  </form>;
}

export function PassportPage() {
  const t = useT(), { date } = useI18n(), action = useAction();
  const view = useEngage<PassportOwn>('passport');
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [profile, setProfile] = useState<{ display_name: string; headline: string } | null>(null);
  useEffect(() => { if (view.data && !profile) setProfile({ display_name: view.data.passport.display_name ?? '', headline: view.data.passport.headline ?? '' }); }, [view.data, profile]);
  const apply = (next: PassportOwn | null) => { if (next) view.setData(next); };
  return <Page eyebrow={<Eyebrow icon={<IdCard size={14} aria-hidden="true"/>}>{t('engage.passport.eyebrow')}</Eyebrow>} title={t('engage.passport.title')} lead={t('engage.passport.lead')}
    actions={<Button variant="secondary" size="sm" disabled={action.busy !== null} onClick={async () => apply(await action.run<PassportOwn>('passport-import'))} icon={<Download size={14} aria-hidden="true"/>}>{t('engage.passport.import')}</Button>}>
    <Loaded {...view}>{(data) => <>
      <Notice icon={<ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true"/>}>{t('engage.passport.private')}</Notice>
      {created && <Card className="flex flex-col items-start gap-3 bg-lime-soft/40 md:flex-row md:items-center">
        <QrCode value={created} label={t('engage.passport.qr')}/>
        <div className="flex min-w-0 flex-col gap-2">
          <p className="m-0 font-semibold">{t('engage.passport.linkReady')}</p>
          <code className="break-all rounded-xl bg-white px-3 py-2 text-xs">{created}</code>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(created); setCopied(true); } catch { setCopied(false); } }} icon={<Copy size={14} aria-hidden="true"/>}>{copied ? t('engage.copied') : t('engage.passport.copy')}</Button></div>
          <p className="m-0 text-xs text-gray-700">{t('engage.passport.once')}</p>
        </div>
      </Card>}
      {profile && <Card className="flex flex-col gap-3">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (event) => { event.preventDefault(); apply(await action.run<PassportOwn>('passport', { display_name: profile.display_name.trim() || null, headline: profile.headline.trim() || null }, 'profile')); }}>
          <Field label={t('engage.passport.name')} hint={t('engage.passport.nameHint')}>{(id) => <TextInput id={id} maxLength={60} value={profile.display_name} onChange={(event) => setProfile({ ...profile, display_name: event.target.value })}/>}</Field>
          <Field label={t('engage.passport.headline')}>{(id) => <TextInput id={id} maxLength={160} value={profile.headline} placeholder={t('engage.passport.headlineHint')} onChange={(event) => setProfile({ ...profile, headline: event.target.value })}/>}</Field>
          <div className="sm:col-span-2"><Button type="submit" size="sm" variant="secondary" disabled={action.busy !== null}>{t('engage.save')}</Button></div>
        </form>
      </Card>}
      <section aria-labelledby="engage-passport-items" className="flex flex-col gap-3">
        <h2 id="engage-passport-items" className="m-0 font-display text-xl font-bold">{t('engage.passport.records')}</h2>
        {data.items.length ? <ul className="m-0 flex list-none flex-col gap-2 p-0">{data.items.map((item) => <ItemRow key={item.id} item={item} busy={action.busy === item.id}
          onToggle={async (shown) => apply(await action.run<PassportOwn>('passport-item', { id: item.id, shown }, item.id))}/>)}</ul>
          : <EmptyState title={t('engage.passport.empty')} lead={t('engage.passport.emptyLead')} action={<Button size="sm" onClick={() => navigate('/certificates')}>{t('engage.nav.certificates')}</Button>}/>}
      </section>
      <section aria-labelledby="engage-passport-samples" className="flex flex-col gap-3">
        <h2 id="engage-passport-samples" className="m-0 font-display text-xl font-bold">{t('engage.passport.samples')}</h2>
        {data.samples.length ? <ul className="m-0 flex list-none flex-col gap-2 p-0">{data.samples.map((sample) => <li key={sample.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-navy-line/30 bg-white p-3">
          <span className="min-w-0 flex-1 text-sm"><span className="font-semibold">{t(`engage.thenNow.kind.${sample.kind}`)}</span> · {date(sample.recorded_at, { dateStyle: 'medium' })}</span>
          <Button size="sm" variant={sample.shown ? 'secondary' : 'ghost'} aria-pressed={!!sample.shown} disabled={action.busy === sample.id}
            onClick={async () => apply(await action.run<PassportOwn>('passport-item', { sample_id: sample.id, shown: !sample.shown }, sample.id))}
            icon={sample.shown ? <Eye size={14} aria-hidden="true"/> : <EyeOff size={14} aria-hidden="true"/>}>{sample.shown ? t('engage.passport.shown') : t('engage.passport.hidden')}</Button>
        </li>)}</ul> : <EmptyState title={t('engage.passport.noSamples')} action={<Button size="sm" variant="secondary" onClick={() => navigate('/then-vs-now')}>{t('engage.nav.thenNow')}</Button>}/>}
      </section>
      <Card className="flex flex-col gap-3">
        <Eyebrow icon={<QrIcon size={14} aria-hidden="true"/>}>{t('engage.passport.share')}</Eyebrow>
        <NewLink data={data} onCreated={(next) => { setCreated(next.url); setCopied(false); view.setData(next); }}/>
      </Card>
      {data.links.length > 0 && <section aria-labelledby="engage-passport-links" className="flex flex-col gap-2">
        <h2 id="engage-passport-links" className="m-0 font-display text-xl font-bold">{t('engage.passport.links')}</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">{data.links.map((link) => <li key={link.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-navy-line/30 bg-white p-3 text-sm">
          <span className="min-w-0 flex-1"><span className="font-semibold">{link.label}</span> · {t('engage.passport.linkStats', { items: link.items, views: link.views })}{link.expires_at ? ` · ${t('engage.passport.until', { date: date(link.expires_at, { dateStyle: 'medium' }) })}` : ''}</span>
          {link.revoked ? <Badge>{t('engage.passport.revoked')}</Badge> : link.expired ? <Badge>{t('engage.passport.expired')}</Badge>
            : <Button size="sm" variant="danger" disabled={action.busy === link.id} onClick={async () => apply(await action.run<PassportOwn>('passport-link-revoke', { id: link.id }, link.id))} icon={<XCircle size={14} aria-hidden="true"/>}>{t('engage.passport.revoke')}</Button>}
        </li>)}</ul>
      </section>}
      {action.error !== null && <EngageError error={action.error}/>}
    </>}</Loaded>
  </Page>;
}

// --- Public pages -----------------------------------------------------------------------------------
interface PublicPassport { passport: { display_name: string | null; headline: string | null; label: string }; items: Omit<PassportItemView, 'id' | 'shown'>[]; samples: { id: string; kind: string; recorded_at: string; metrics: Record<string, number>; text?: string; audio: boolean }[] }

function usePublic<T>(action: string, query: Record<string, string>) {
  const session = useSession();
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const key = JSON.stringify(query);
  useEffect(() => {
    if (session.status === 'loading') return;
    let live = true;
    setState({ data: null, error: null, loading: true });
    publicGet<T>(action, query, session.status === 'signed_in').then((data) => { if (live) setState({ data, error: null, loading: false }); }).catch((error) => { if (live) setState({ data: null, error, loading: false }); });
    return () => { live = false; };
  }, [action, key, session.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: () => setState((current) => ({ ...current })) };
}

export function PublicPassportPage({ params }: { params: Record<string, string> }) {
  const t = useT(), { date } = useI18n();
  const view = usePublic<PublicPassport>('passport-view', { token: params.token ?? '' });
  return <Page eyebrow={<Eyebrow icon={<IdCard size={14} aria-hidden="true"/>}>{t('engage.passport.publicEyebrow')}</Eyebrow>} title={view.data?.passport.display_name ?? t('engage.passport.title')} lead={view.data?.passport.headline ?? undefined}>
    <Loaded {...view}>{(data) => <>
      <p className="m-0 text-sm text-gray-700">{t('engage.passport.publicLead', { label: data.passport.label })}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">{data.items.map((item, index) => <li key={index} className="flex flex-col gap-1 rounded-2xl border border-navy-line/30 bg-white p-3">
        <p className="m-0 font-semibold">{item.title}</p>
        <p className="m-0 text-sm text-gray-600">{[itemLine(item, t), item.issued_at ? date(item.issued_at, { dateStyle: 'medium' }) : ''].filter(Boolean).join(' · ')}</p>
        <div className="flex flex-wrap gap-2">{item.verified ? <Badge tone="lime"><BadgeCheck size={12} aria-hidden="true"/>{t('engage.passport.verified')}</Badge> : <Badge>{t('engage.passport.notVerified')}</Badge>}
          {item.verify_url && <a href={item.verify_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline underline-offset-2">{t('engage.passport.check')}</a>}</div>
      </li>)}</ul>
      {data.samples.map((sample) => <Card key={sample.id} className="flex flex-col gap-2">
        <Eyebrow>{t(`engage.thenNow.kind.${sample.kind}`)} · {date(sample.recorded_at, { dateStyle: 'medium' })}</Eyebrow>
        {sample.text && <p className="m-0 whitespace-pre-wrap text-sm leading-6">{sample.text}</p>}
        {sample.audio && <p className="m-0 text-sm text-gray-600">{t('engage.passport.audioNote')}</p>}
      </Card>)}
      <p className="m-0 text-xs text-gray-600">{t('engage.passport.publicFoot')}</p>
    </>}</Loaded>
  </Page>;
}

interface Verified { certificate: { code: string; status: 'valid' | 'revoked'; exam: string; title: Record<string, string> | null; level: string; score: number; display_name: string; issued_at: string; revoked_at: string | null; proctored: boolean } }
export function VerifyPage({ params }: { params: Record<string, string> }) {
  const t = useT(), { date, locale } = useI18n();
  const [code, setCode] = useState(params.code ?? '');
  const view = usePublic<Verified>('verify', { code: params.code ?? '' });
  return <Page eyebrow={<Eyebrow icon={<ShieldCheck size={14} aria-hidden="true"/>}>{t('engage.verify.eyebrow')}</Eyebrow>} title={t('engage.verify.title')} lead={t('engage.verify.lead')}>
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); navigate(`/verify/${code.trim().toUpperCase()}`); }}>
      <div className="w-64 max-w-full"><Field label={t('engage.verify.code')}>{(id) => <TextInput id={id} value={code} maxLength={16} placeholder="ABCD-EFGH-JKMN" autoCapitalize="characters" onChange={(event) => setCode(event.target.value)}/>}</Field></div>
      <Button type="submit" variant="secondary">{t('engage.verify.check')}</Button>
    </form>
    {params.code && <Loaded {...view}>{({ certificate }) => <Card className={`flex flex-col gap-2 ${certificate.status === 'valid' ? 'bg-lime-soft/40' : 'bg-red-50'}`}>
      <p className="m-0 inline-flex items-center gap-2 font-display text-xl font-bold">{certificate.status === 'valid' ? <BadgeCheck size={22} aria-hidden="true"/> : <XCircle size={22} aria-hidden="true"/>}{t(`engage.verify.${certificate.status}`)}</p>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-600">{t('engage.verify.name')}</dt><dd className="m-0 font-semibold">{certificate.display_name}</dd>
        <dt className="text-gray-600">{t('engage.verify.exam')}</dt><dd className="m-0">{certificate.title ? certificate.title[locale] ?? certificate.title.en : certificate.exam} · {certificate.level}</dd>
        <dt className="text-gray-600">{t('engage.verify.score')}</dt><dd className="m-0">{certificate.score}/100</dd>
        <dt className="text-gray-600">{t('engage.verify.issued')}</dt><dd className="m-0">{date(certificate.issued_at, { dateStyle: 'long' })}</dd>
        <dt className="text-gray-600">{t('engage.verify.codeLabel')}</dt><dd className="m-0 font-mono">{certificate.code}</dd>
      </dl>
      {certificate.proctored && <p className="m-0 text-xs text-gray-700">{t('engage.verify.proctored')}</p>}
    </Card>}</Loaded>}
  </Page>;
}
