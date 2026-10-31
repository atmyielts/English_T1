import { useEffect, useState } from 'react';
import { Check, Copy, Gift, Share2, Users } from 'lucide-react';
import { COACH_PACK_OF, COACH_FEATURES } from '../../../../../packages/ai-core/src/catalog.ts';
import { api, ApiError, Badge, Button, Card, Field, Link, TextInput, useI18n, useT } from '../../core/index.ts';
import { count, setUpTeam, type GiftView, type PurchaseView } from '../api.ts';

// Pieces the pricing page and the checkout return page share: a bought gift with its code,
// and the Coach Team setup form.

export function GiftCard({ gift }: { gift: GiftView }) {
  const t = useT(), { date, locale } = useI18n();
  const [copied, setCopied] = useState(false);
  const title = gift.kind === 'credits' ? t('pricing.giftCard.credits', { count: count(gift.credits ?? 0, locale) }) : t('pricing.giftCard.plus', { count: gift.days ?? 0 });
  const copy = async () => {
    if (!gift.link) return;
    try { await navigator.clipboard.writeText(gift.link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* the code is on screen to copy by hand */ }
  };
  const share = () => { if (gift.link && navigator.share) void navigator.share({ title: t('pricing.giftCard.shareText'), url: gift.link }).catch(() => undefined); };
  return <Card as="article" className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="m-0 inline-flex items-center gap-2 font-display text-lg font-bold"><Gift size={18} aria-hidden="true"/>{title}</h3>
      {gift.status !== 'issued' && <Badge tone={gift.status === 'redeemed' ? 'lime' : 'warn'}>{t(`pricing.giftCard.status.${gift.status}`)}</Badge>}
    </div>
    {gift.status === 'issued' && (gift.code ? <>
      <div>
        <p className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-600">{t('pricing.giftCard.code')}</p>
        <p className="m-0 mt-1 break-all font-mono text-xl font-bold tracking-wider text-gray-950" translate="no">{gift.code}</p>
      </div>
      <p className="m-0 text-sm text-gray-700">{t('pricing.giftCard.until', { date: date(gift.expires_at, { dateStyle: 'long' }) })}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void copy()} icon={copied ? <Check size={14} aria-hidden="true"/> : <Copy size={14} aria-hidden="true"/>}>{copied ? t('pricing.giftCard.copied') : t('pricing.giftCard.copy')}</Button>
        {typeof navigator !== 'undefined' && 'share' in navigator && <Button variant="secondary" size="sm" onClick={share} icon={<Share2 size={14} aria-hidden="true"/>}>{t('pricing.giftCard.share')}</Button>}
      </div>
      <p className="m-0 text-xs leading-5 text-gray-600">{t('pricing.giftCard.private')}</p>
    </> : <p className="m-0 text-sm text-gray-700">{t('pricing.giftCard.noCode')}</p>)}
  </Card>;
}

interface TeamRow { id: string; name: string; role: string }
/** Name the team and pick its coaches, or add the seats to a team the buyer manages. */
export function TeamSetup({ order, onDone }: { order: PurchaseView; onDone(): void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [packs, setPacks] = useState<string[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Teams this person manages, to extend one instead of starting another.
    api<{ teams?: TeamRow[] }>('coach/team').then((reply) => setTeams((reply.teams ?? []).filter((team) => team.role === 'manager'))).catch(() => setTeams([]));
  }, []);
  const run = async (body: Parameters<typeof setUpTeam>[0]) => {
    setBusy(true); setError(null);
    try { await setUpTeam(body); onDone(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : t('pricing.redeem.error.other')); } finally { setBusy(false); }
  };
  const toggle = (pack: string) => setPacks((current) => current.includes(pack) ? current.filter((entry) => entry !== pack) : [...current, pack]);
  return <Card as="article" className="flex flex-col gap-4">
    <div>
      <h3 className="m-0 inline-flex items-center gap-2 font-display text-lg font-bold"><Users size={18} aria-hidden="true"/>{t('pricing.done.team')}</h3>
      <p className="m-0 mt-1 text-sm text-gray-700">{t('pricing.team.seats', { count: order.seats ?? 5 })}</p>
    </div>
    <form className="flex flex-col gap-4" onSubmit={(event) => {
      event.preventDefault();
      if (!packs.length) { setError(t('pricing.team.pick')); return; }
      void run({ payment_id: order.payment_id, name: name.trim(), packs });
    }}>
      <Field label={t('pricing.team.name')}>{(id) => <TextInput id={id} value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required/>}</Field>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-sm font-semibold text-gray-900">{t('pricing.team.coaches')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {COACH_FEATURES.map((feature) => {
            const pack = COACH_PACK_OF[feature];
            return <label key={pack} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-navy-line bg-white/80 px-3 py-2 text-sm">
              <input type="checkbox" checked={packs.includes(pack)} onChange={() => toggle(pack)} className="h-4 w-4"/>
              {t(`pricing.coach.${feature}`)}
            </label>;
          })}
        </div>
      </fieldset>
      {error && <p className="m-0 text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <div><Button type="submit" disabled={busy}>{t('pricing.team.create')}</Button></div>
    </form>
    {teams.length > 0 && <div className="flex flex-col gap-2 border-t border-navy-line/30 pt-4">
      <p className="m-0 text-sm text-gray-700">{t('pricing.team.extend')}</p>
      <div className="flex flex-wrap gap-2">{teams.map((team) => <Button key={team.id} variant="secondary" size="sm" disabled={busy} onClick={() => void run({ payment_id: order.payment_id, team_id: team.id })}>{t('pricing.team.extendButton', { name: team.name })}</Button>)}</div>
    </div>}
  </Card>;
}

export function TeamReady() {
  const t = useT();
  return <Card as="article" className="flex flex-col gap-3">
    <p className="m-0 text-sm text-gray-800">{t('pricing.team.done')}</p>
    <div><Link to="/coach/team" className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('pricing.team.open')}</Link></div>
  </Card>;
}
