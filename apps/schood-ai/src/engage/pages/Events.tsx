import { CalendarDays, Gift, Mic, PartyPopper, Sparkles } from 'lucide-react';
import { Badge, Button, Card, Eyebrow, navigate, useI18n } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { useAction, useEngage } from '../api.ts';
import { EngageError, Loaded, Meter, Page } from '../ui.tsx';

// /events (E10): the quarterly season with its badges earned by verified XP, the
// weekly national mock and the monthly speaking and sales tournaments. Prizes come
// from sponsors named here; nothing is random and nothing is for sale.

interface Sponsor { name: string; logo_url: string | null; prize: string | null }
interface Standing { rank: number; score: number; entries: number; me: boolean; name: string | null }
interface EventsView {
  season: { key: string; quarter: number; year: number; starts_on: string; ends_on: string; days_left: number; title: string; lead: string; spotlight: { arc: string; journey: string }; xp: number; tiers: { key: string; xp: number }[]; reached: string | null; sponsor: Sponsor | null };
  events: { key: string; kind: string; title: string; lead: string; opens_at: string; closes_at: string; open: boolean; upcoming: boolean; joinable: boolean; joined: boolean; link: string; entrants: number | null; standings: Standing[]; sponsor: Sponsor | null }[];
}

function SponsorLine({ sponsor }: { sponsor: Sponsor | null }) {
  const t = useT();
  if (!sponsor) return null;
  return <div className="flex items-center gap-2 rounded-2xl border border-navy-line/30 bg-cream-soft p-2 text-sm">
    {sponsor.logo_url && <img src={sponsor.logo_url} alt="" width={28} height={28} referrerPolicy="no-referrer" className="h-7 w-7 rounded-full border border-navy-line/30 bg-white object-cover"/>}
    <span className="min-w-0"><span className="font-semibold">{t('engage.events.sponsor', { name: sponsor.name })}</span>{sponsor.prize && <span className="block text-gray-700"><Gift size={12} className="mr-1 inline" aria-hidden="true"/>{sponsor.prize}</span>}</span>
  </div>;
}

export function EventsPage() {
  const t = useT(), { date } = useI18n(), action = useAction();
  const view = useEngage<EventsView>('events');
  const join = async (key: string) => { const next = await action.run<EventsView>('event-join', { key }, key); if (next) view.setData(next); };
  return <Page eyebrow={<Eyebrow icon={<PartyPopper size={14} aria-hidden="true"/>}>{t('engage.events.eyebrow')}</Eyebrow>} title={t('engage.events.title')} lead={t('engage.events.lead')}>
    <Loaded {...view}>{(data) => {
      const next = data.season.tiers.find((tier) => data.season.xp < tier.xp);
      return <>
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow icon={<Sparkles size={14} aria-hidden="true"/>}>{t('engage.events.season', { quarter: String(data.season.quarter), year: String(data.season.year) })}</Eyebrow>
            <Badge>{t('engage.events.daysLeft', { count: data.season.days_left })}</Badge>
          </div>
          <h2 className="m-0 font-display text-2xl font-bold">{data.season.title}</h2>
          <p className="m-0 text-sm text-gray-700">{data.season.lead}</p>
          <div className="flex flex-wrap gap-2">{data.season.tiers.map((tier) => <Badge key={tier.key} tone={data.season.xp >= tier.xp ? 'lime' : 'neutral'}>{t(`engage.events.badge.${tier.key}`)} · {tier.xp} XP</Badge>)}</div>
          <Meter value={data.season.xp} max={next?.xp ?? data.season.tiers.at(-1)!.xp} label={t('engage.events.seasonXp', { xp: data.season.xp })}/>
          <p className="m-0 text-xs text-gray-600">{next ? t('engage.events.toNext', { xp: next.xp - data.season.xp, badge: t(`engage.events.badge.${next.key}`) }) : t('engage.events.allBadges')} {t('engage.events.badgeRule')}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => navigate(`/stories/${data.season.spotlight.arc}`)}>{t('engage.events.spotlightStory')}</Button>
            <Button size="sm" variant="secondary" onClick={() => navigate(`/journeys/${data.season.spotlight.journey}`)}>{t('engage.events.spotlightJourney')}</Button>
          </div>
          <SponsorLine sponsor={data.season.sponsor}/>
        </Card>
        <div className="grid gap-4 md:grid-cols-3">
          {data.events.map((event) => <Card key={event.key} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {event.kind === 'national_mock' ? <CalendarDays size={16} aria-hidden="true"/> : <Mic size={16} aria-hidden="true"/>}
              {event.open ? <Badge tone="lime">{t('engage.events.open')}</Badge> : event.upcoming ? <Badge>{t('engage.events.opens', { date: date(event.opens_at, { weekday: 'short', day: 'numeric', month: 'short' }) })}</Badge> : <Badge>{t('engage.events.closed')}</Badge>}
            </div>
            <h3 className="m-0 font-display text-lg font-bold">{event.title}</h3>
            <p className="m-0 flex-1 text-sm text-gray-700">{event.lead}</p>
            <p className="m-0 text-xs text-gray-600">{t('engage.events.window', { from: date(event.opens_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), to: date(event.closes_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</p>
            {event.joinable && !event.joined ? <div><Button size="sm" disabled={action.busy !== null || (!event.open && !event.upcoming)} onClick={() => void join(event.key)}>{t('engage.events.join')}</Button></div>
              : <div><Button size="sm" variant="secondary" disabled={!event.open} onClick={() => navigate(event.link)}>{t('engage.events.take')}</Button></div>}
            {event.standings.length > 0 && <ol className="m-0 flex list-none flex-col gap-1 p-0 text-sm" aria-label={t('engage.events.standings')}>
              {event.standings.slice(0, 10).map((row) => <li key={row.rank} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${row.me ? 'bg-lime-soft/60 font-semibold' : ''}`}><span className="w-5 text-right">{row.rank}</span><span className="min-w-0 flex-1 truncate">{row.me ? t('engage.you') : row.name}</span><span className="tabular-nums">{row.score}</span></li>)}
            </ol>}
            {event.entrants !== null && <p className="m-0 text-xs text-gray-600">{t('engage.events.entrants', { count: event.entrants })}</p>}
            <SponsorLine sponsor={event.sponsor}/>
          </Card>)}
        </div>
        <p className="m-0 text-xs text-gray-600">{t('engage.events.rules')}</p>
        {action.error !== null && <EngageError error={action.error}/>}
      </>;
    }}</Loaded>
  </Page>;
}
