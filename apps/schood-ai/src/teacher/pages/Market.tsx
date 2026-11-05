import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Copy, Search, ShieldCheck, Star, Store } from 'lucide-react';
import { MATERIAL_KIND_IDS } from '../../../../../packages/ai-core/src/materials/mod.ts';
import { ApiErrorState, Badge, Button, Card, EmptyState, Field, Link, LoadingState, PageHeader, TextArea, TextInput, navigate, useI18n, useT, useWorkspace } from '../../core/index.ts';
import { acquireListing, getListing, moderate, moderationQueue, myListings, rateListing, searchMarket, withdrawListing, type ListingCard } from '../api.ts';
import { issueText } from '../Checks.tsx';
import { MaterialView } from '../MaterialView.tsx';

// T12 materials marketplace: approved materials from teachers and centres, checked
// by Schood before they appear. Ratings come only from people who took a copy, and
// "verified uses" counts workspaces that really used one. Free listings work now;
// paid listings (UZS) wait for the owner to switch them on and for checkout.

const selectClass = 'min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900';
const Tabs = ({ active }: { active: 'browse' | 'mine' | 'review' }) => {
  const t = useT(), workspace = useWorkspace();
  return <nav aria-label={t('teacher.market.tabs')} className="mb-5 flex flex-wrap gap-2">
    {([['browse', '/studio/market'], ['mine', '/studio/market/mine'], ...(workspace.me?.user.is_schood_admin ? [['review', '/studio/market/review']] : [])] as const).map(([key, to]) =>
      <Link key={key} to={to} aria-current={active === key ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold no-underline ${active === key ? 'border-navy bg-navy text-white' : 'border-navy-line bg-white text-gray-900'}`}>{t(`teacher.market.tab.${key}`)}</Link>)}
  </nav>;
};
const price = (t: (key: string, params?: Record<string, string | number>) => string, number: (value: number) => string, value: number) => value ? t('teacher.market.price', { price: number(value) }) : t('teacher.market.free');

function ListingTile({ listing }: { listing: ListingCard }) {
  const t = useT(), { number } = useI18n();
  return <Link to={`/studio/market/${listing.id}`} className="flex h-full flex-col gap-2 rounded-3xl border border-navy-line bg-white p-4 text-gray-900 no-underline hover:bg-cream-soft">
    <span className="flex flex-wrap gap-2"><Badge>{t(`teacher.kind.${listing.kind}`)}</Badge><Badge tone="sky">{listing.level.replace('band:', '')}</Badge><Badge tone={listing.price_uzs ? 'warn' : 'lime'}>{price(t, number, listing.price_uzs)}</Badge></span>
    <strong className="font-display text-base">{listing.title}</strong>
    {listing.description && <span className="line-clamp-3 text-sm text-gray-700">{listing.description}</span>}
    <span className="mt-auto flex flex-wrap items-center gap-3 text-xs text-gray-700">
      <span className="inline-flex items-center gap-1"><Star size={13} aria-hidden="true"/>{listing.rating !== null ? t('teacher.market.rating', { rating: listing.rating, count: listing.ratings }) : t('teacher.market.noRatings')}</span>
      <span className="inline-flex items-center gap-1"><BadgeCheck size={13} aria-hidden="true"/>{t('teacher.market.uses', { count: listing.verified_uses })}</span>
      <span>{listing.seller_name}</span>
    </span>
  </Link>;
}

export function MarketPage() {
  const t = useT(), workspace = useWorkspace();
  const [q, setQ] = useState(''), [kind, setKind] = useState(''), [level, setLevel] = useState(''), [language, setLanguage] = useState(''), [priceFilter, setPriceFilter] = useState('any'), [sort, setSort] = useState('rating'), [page, setPage] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof searchMarket>> | null>(null), [error, setError] = useState<unknown>(null);
  const search = useCallback(() => { setError(null); searchMarket(workspace.workspaceId, { q: q.trim() || undefined, kind: kind || undefined, level: level || undefined, language: language || undefined, price: priceFilter, sort, page: String(page) }).then(setData).catch(setError); }, [q, kind, level, language, priceFilter, sort, page, workspace.workspaceId]);
  useEffect(() => { const timer = setTimeout(search, 250); return () => clearTimeout(timer); }, [search]);
  return <>
    <PageHeader eyebrow={<span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600"><Store size={14} aria-hidden="true"/>{t('teacher.market.eyebrow')}</span>} title={t('teacher.market.title')} lead={t('teacher.market.lead')}/>
    <Tabs active="browse"/>
    <form role="search" className="mb-5 grid gap-3 rounded-3xl border border-navy-line bg-white p-4 md:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]" onSubmit={(event) => { event.preventDefault(); search(); }}>
      <label className="relative"><span className="sr-only">{t('teacher.market.search')}</span><Search size={16} className="absolute left-3 top-3.5 text-gray-500" aria-hidden="true"/><TextInput className="pl-9" value={q} onChange={(event) => { setQ(event.target.value); setPage(0); }} placeholder={t('teacher.market.searchPlaceholder')}/></label>
      <select aria-label={t('teacher.studio.kind')} className={selectClass} value={kind} onChange={(event) => { setKind(event.target.value); setPage(0); }}><option value="">{t('teacher.market.anyKind')}</option>{MATERIAL_KIND_IDS.map((entry) => <option key={entry} value={entry}>{t(`teacher.kind.${entry}`)}</option>)}</select>
      <select aria-label={t('teacher.studio.level')} className={selectClass} value={level} onChange={(event) => { setLevel(event.target.value); setPage(0); }}><option value="">{t('teacher.market.anyLevel')}</option>{['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((entry) => <option key={entry}>{entry}</option>)}</select>
      <select aria-label={t('teacher.studio.language')} className={selectClass} value={language} onChange={(event) => { setLanguage(event.target.value); setPage(0); }}><option value="">{t('teacher.market.anyLanguage')}</option>{['uz', 'ru', 'en'].map((entry) => <option key={entry} value={entry}>{t(`teacher.lang.${entry}`)}</option>)}</select>
      <select aria-label={t('teacher.market.priceFilter')} className={selectClass} value={priceFilter} onChange={(event) => { setPriceFilter(event.target.value); setPage(0); }}>{['any', 'free', 'paid'].map((entry) => <option key={entry} value={entry}>{t(`teacher.market.priceOption.${entry}`)}</option>)}</select>
      <select aria-label={t('teacher.market.sort')} className={selectClass} value={sort} onChange={(event) => setSort(event.target.value)}>{['rating', 'usage', 'new'].map((entry) => <option key={entry} value={entry}>{t(`teacher.market.sortOption.${entry}`)}</option>)}</select>
    </form>
    {error ? <ApiErrorState error={error} onRetry={search}/> : !data ? <LoadingState/> : !data.listings.length ? <EmptyState title={t('teacher.market.none')} lead={t('teacher.market.noneLead')}/> : <>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">{data.listings.map((listing) => <li key={listing.id}><ListingTile listing={listing}/></li>)}</ul>
      <div className="mt-4 flex items-center gap-2"><Button size="sm" variant="secondary" disabled={!page} onClick={() => setPage(page - 1)}>{t('teacher.market.prev')}</Button><span className="text-sm text-gray-700">{t('teacher.market.pageOf', { page: page + 1, total: Math.max(1, Math.ceil(data.total / 24)) })}</span><Button size="sm" variant="secondary" disabled={(page + 1) * 24 >= data.total} onClick={() => setPage(page + 1)}>{t('teacher.market.next')}</Button></div>
    </>}
    {data && !data.paid_enabled && <p className="mt-4 text-xs text-gray-600">{t('teacher.market.paidOff')}</p>}
  </>;
}

export function ListingPage({ params }: { params: Record<string, string> }) {
  const t = useT(), workspace = useWorkspace(), { number, date } = useI18n();
  const [data, setData] = useState<Awaited<ReturnType<typeof getListing>> | null>(null), [error, setError] = useState<unknown>(null);
  const [stars, setStars] = useState(0), [comment, setComment] = useState(''), [busy, setBusy] = useState(false), [actionError, setActionError] = useState<unknown>(null);
  const load = useCallback(() => { getListing(workspace.workspaceId, params.id).then(setData).catch(setError); }, [params.id, workspace.workspaceId]);
  useEffect(load, [load]);
  if (error) return <ApiErrorState error={error}/>;
  if (!data) return <LoadingState/>;
  const { listing, mine } = data;
  return <>
    <PageHeader eyebrow={<Link to="/studio/market" className="text-sm text-gray-700">{t('teacher.market.title')}</Link>} title={listing.title} lead={`${listing.seller_name} · ${t(`teacher.kind.${listing.kind}`)} · ${listing.level.replace('band:', '')}`}/>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        {listing.description && <p className="m-0 mb-4 whitespace-pre-wrap text-gray-800">{listing.description}</p>}
        {listing.preview && <section aria-label={t('teacher.market.preview')} className="grid gap-2 text-sm">
          <h2 className="m-0 font-display text-lg font-bold">{t('teacher.market.preview')}</h2>
          <p className="m-0 text-gray-700">{t('teacher.market.shape', { questions: listing.preview.questions, versions: listing.preview.variants })}</p>
          {listing.preview.aims.length > 0 && <p className="m-0"><strong>{t('teacher.view.aims')}:</strong> {listing.preview.aims.join('; ')}</p>}
          {listing.preview.excerpt && <p className="m-0 rounded-2xl bg-cream-soft p-3 italic">{listing.preview.excerpt}…</p>}
          {listing.preview.sample.map((sample, index) => <div key={index} className="rounded-2xl border border-navy-line/20 p-3"><p className="m-0 font-semibold">{sample.prompt}</p>{sample.options.length > 0 && <ul className="m-0 mt-1 pl-5">{sample.options.map((option, i) => <li key={i}>{option}</li>)}</ul>}</div>)}
          <p className="m-0 text-xs text-gray-600">{t('teacher.market.keyHidden')}</p>
        </section>}
        <section className="mt-6"><h2 className="m-0 mb-2 font-display text-lg font-bold">{t('teacher.market.reviews')}</h2>
          {!data.ratings.length ? <p className="m-0 text-sm text-gray-700">{t('teacher.market.noRatings')}</p> : <ul className="m-0 grid list-none gap-2 p-0">{data.ratings.map((rating, index) => <li key={index} className="rounded-2xl border border-navy-line/20 p-3 text-sm">
            <span aria-label={t('teacher.market.stars', { count: rating.stars })}>{'★'.repeat(rating.stars)}{'☆'.repeat(5 - rating.stars)}</span> <span className="text-xs text-gray-600">{date(rating.created_at, { dateStyle: 'medium' })}{rating.mine ? ` · ${t('teacher.market.yours')}` : ''}</span>
            {rating.comment && <p className="m-0 mt-1">{rating.comment}</p>}
          </li>)}</ul>}
        </section>
      </Card>
      <aside className="grid content-start gap-4">
        <Card as="div" className="grid gap-3">
          <p className="m-0 font-display text-2xl font-bold">{price(t, number, listing.price_uzs)}</p>
          <p className="m-0 text-sm text-gray-700">{listing.rating !== null ? t('teacher.market.rating', { rating: listing.rating, count: listing.ratings }) : t('teacher.market.noRatings')} · {t('teacher.market.uses', { count: listing.verified_uses })}</p>
          {mine.seller ? <p className="m-0 text-sm">{t('teacher.market.yourListing')}</p> : mine.copy_id ? <Button onClick={() => navigate(`/studio/page/${mine.copy_id}`)}>{t('teacher.market.openCopy')}</Button>
            : <Button variant="spark" disabled={busy || (listing.price_uzs > 0)} icon={<Copy size={16} aria-hidden="true"/>} onClick={async () => { setBusy(true); setActionError(null); try { const copy = await acquireListing(workspace.workspaceId, listing.id); navigate(`/studio/page/${copy.page_id}`); } catch (cause) { setActionError(cause); } finally { setBusy(false); } }}>{t('teacher.market.take')}</Button>}
          {listing.price_uzs > 0 && !mine.copy_id && !mine.seller && <p className="m-0 text-xs text-gray-600">{data.paid_enabled ? t('teacher.market.checkoutSoon') : t('teacher.market.paidOff')}</p>}
          {actionError !== null && <ApiErrorState error={actionError}/>}
        </Card>
        {mine.copy_id && <Card as="div"><h2 className="m-0 mb-2 font-display text-base font-bold">{mine.rated ? t('teacher.market.changeRating') : t('teacher.market.rate')}</h2>
          <div role="radiogroup" aria-label={t('teacher.market.rate')} className="flex gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" role="radio" aria-checked={stars === value} aria-label={t('teacher.market.stars', { count: value })} onClick={() => setStars(value)} className={`text-2xl ${value <= stars ? 'text-amber-500' : 'text-gray-300'}`}>★</button>)}</div>
          <Field label={t('teacher.market.comment')}>{(id) => <TextArea id={id} rows={2} value={comment} maxLength={1000} onChange={(event) => setComment(event.target.value)}/>}</Field>
          <Button className="mt-2" size="sm" disabled={!stars || busy} onClick={async () => { setBusy(true); try { await rateListing(workspace.workspaceId, listing.id, stars, comment.trim() || undefined); load(); } catch (cause) { setActionError(cause); } finally { setBusy(false); } }}>{t('teacher.market.send')}</Button>
        </Card>}
      </aside>
    </div>
  </>;
}

export function MyListingsPage() {
  const t = useT(), workspace = useWorkspace(), { number, date } = useI18n();
  const [data, setData] = useState<Awaited<ReturnType<typeof myListings>> | null>(null), [error, setError] = useState<unknown>(null);
  const load = useCallback(() => { myListings(workspace.workspaceId).then(setData).catch(setError); }, [workspace.workspaceId]);
  useEffect(load, [load]);
  return <>
    <PageHeader title={t('teacher.market.mineTitle')} lead={t('teacher.market.mineLead')}/>
    <Tabs active="mine"/>
    {error ? <ApiErrorState error={error}/> : !data ? <LoadingState/> : <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {!data.listings.length ? <EmptyState title={t('teacher.market.noListings')} lead={t('teacher.market.noListingsLead')}/> : <ul className="m-0 grid list-none gap-3 p-0">{data.listings.map((listing) => <li key={listing.id}><Card as="div">
        <div className="flex flex-wrap items-center gap-2"><strong className="min-w-0 flex-1">{listing.title}</strong><Badge tone={listing.status === 'published' ? 'lime' : listing.status === 'rejected' ? 'warn' : 'neutral'}>{t(`teacher.market.status.${listing.status}`)}</Badge></div>
        <p className="m-0 mt-1 text-sm text-gray-700">{price(t, number, listing.price_uzs)} · {t('teacher.market.copies', { count: listing.copies })} · {t('teacher.market.uses', { count: listing.verified_uses })}{listing.rating !== null ? ` · ${t('teacher.market.rating', { rating: listing.rating, count: listing.ratings })}` : ''}</p>
        {listing.moderation_note && <p className="m-0 mt-2 rounded-2xl bg-amber-50 p-2 text-sm text-amber-950">{t('teacher.market.note', { note: listing.moderation_note })}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {listing.status === 'published' && <Link to={`/studio/market/${listing.id}`} className="inline-flex min-h-9 items-center rounded-full border border-navy-line px-3 text-xs font-semibold text-gray-900 no-underline">{t('teacher.market.view')}</Link>}
          {['pending', 'published', 'rejected'].includes(listing.status) && <Button size="sm" variant="ghost" onClick={async () => { try { await withdrawListing(workspace.workspaceId, listing.id); load(); } catch (cause) { setError(cause); } }}>{t('teacher.market.withdraw')}</Button>}
        </div>
      </Card></li>)}</ul>}
      <Card as="div"><h2 className="m-0 mb-2 font-display text-lg font-bold">{t('teacher.market.earnings')}</h2>
        <p className="m-0 text-sm text-gray-700">{data.paid_enabled ? t('teacher.market.earningsLead') : t('teacher.market.paidOff')}</p>
        {data.totals.commission_rate === null && <p className="m-0 mt-2 text-xs text-gray-600">{t('teacher.market.commissionPending')}</p>}
        {data.ledger.length > 0 ? <ul className="m-0 mt-3 grid list-none gap-1 p-0 text-sm">{data.ledger.map((row) => <li key={row.id} className="flex justify-between gap-2"><span>{date(row.created_at, { dateStyle: 'medium' })}</span><span className="tabular-nums">{number(row.gross_uzs)} UZS · {t(`teacher.market.ledger.${row.status}`)}</span></li>)}</ul> : <p className="m-0 mt-3 text-sm text-gray-600">{t('teacher.market.noSales')}</p>}
      </Card>
    </div>}
  </>;
}

export function ModerationPage() {
  const t = useT(), workspace = useWorkspace();
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof moderationQueue>>['queue'] | null>(null), [error, setError] = useState<unknown>(null), [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(() => { moderationQueue().then((result) => setQueue(result.queue)).catch(setError); }, []);
  useEffect(load, [load]);
  if (!workspace.me?.user.is_schood_admin) return <EmptyState title={t('teacher.market.adminsOnly')}/>;
  return <>
    <PageHeader eyebrow={<span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600"><ShieldCheck size={14} aria-hidden="true"/>{t('teacher.market.moderation')}</span>} title={t('teacher.market.reviewTitle')} lead={t('teacher.market.reviewLead')}/>
    <Tabs active="review"/>
    {error ? <ApiErrorState error={error}/> : !queue ? <LoadingState/> : !queue.length ? <EmptyState title={t('teacher.market.queueEmpty')}/> : <ul className="m-0 grid list-none gap-4 p-0">{queue.map((listing) => <li key={listing.id}><Card as="article">
      <div className="flex flex-wrap items-center gap-2"><strong className="min-w-0 flex-1">{listing.title}</strong><Badge>{t(`teacher.kind.${listing.kind}`)}</Badge><Badge tone="sky">{listing.seller_name}</Badge></div>
      {listing.description && <p className="m-0 mt-2 text-sm">{listing.description}</p>}
      {listing.checks && (listing.checks.issues.length ? <ul className="m-0 mt-2 list-disc pl-5 text-sm text-amber-950">{listing.checks.issues.slice(0, 8).map((issue, index) => <li key={index}>{issueText(t, issue)}</li>)}</ul> : <p className="m-0 mt-2 text-sm text-emerald-800">{t('teacher.checks.none')}</p>)}
      <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">{t('teacher.market.fullMaterial')}</summary><div className="mt-3 rounded-2xl border border-navy-line/20 p-3"><MaterialView material={listing.material}/></div></details>
      <Field label={t('teacher.market.noteLabel')}>{(id) => <TextArea id={id} rows={2} value={notes[listing.id] ?? ''} onChange={(event) => setNotes({ ...notes, [listing.id]: event.target.value })}/>}</Field>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={async () => { try { await moderate(listing.id, 'publish', notes[listing.id]?.trim() || undefined); load(); } catch (cause) { setError(cause); } }}>{t('teacher.market.publish')}</Button>
        <Button variant="secondary" disabled={!notes[listing.id]?.trim()} onClick={async () => { try { await moderate(listing.id, 'reject', notes[listing.id].trim()); load(); } catch (cause) { setError(cause); } }}>{t('teacher.market.reject')}</Button>
      </div>
    </Card></li>)}</ul>}
  </>;
}
