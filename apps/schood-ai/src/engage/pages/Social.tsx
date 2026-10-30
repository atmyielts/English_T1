import { useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Crown, Hand, Medal, Swords, Trophy, Users } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Eyebrow, Field, Link, navigate, TextInput, useI18n, useWorkspace } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { useAction, useEngage } from '../api.ts';
import { EngageError, Loaded, Meter, Notice, Page, Stat, TierBadge, chip } from '../ui.tsx';

// /league (E4), /squads (E6) and /boards (E11).

// --- League ------------------------------------------------------------------------------------
interface LeagueRow { rank: number; xp: number; me: boolean; name: string | null; zone: 'promote' | 'demote' | 'stay' }
interface LeagueView {
  summary: { joined: boolean; opted_out: boolean; tier: string; rank: number | null; size: number; xp: number; zone: string | null; week_start: string; last_week: { tier: string; rank: number | null; outcome: string | null; xp: number } | null };
  standings: { tier: string; tiers: string[]; ends_at: string; size: number; capacity: number; promote: number; demote: number; rows: LeagueRow[] } | null;
}

export function LeaguePage() {
  const t = useT(), { date } = useI18n();
  const view = useEngage<LeagueView>('league');
  return <Page eyebrow={<Eyebrow icon={<Trophy size={14} aria-hidden="true"/>}>{t('engage.league.eyebrow')}</Eyebrow>} title={t('engage.league.title')} lead={t('engage.league.lead')}>
    <Loaded {...view}>{(data) => <>
      {data.summary.last_week && <Notice tone={data.summary.last_week.outcome === 'promoted' ? 'lime' : 'calm'}>{t(`engage.league.result.${data.summary.last_week.outcome ?? 'stayed'}`, { rank: data.summary.last_week.rank ?? '-', tier: t(`engage.tier.${data.summary.last_week.tier}`), xp: data.summary.last_week.xp })}</Notice>}
      {data.summary.opted_out ? <EmptyState title={t('engage.league.optedOut')} action={<Button variant="secondary" size="sm" onClick={() => navigate('/progress/settings')}>{t('engage.settings.title')}</Button>}/>
        : !data.standings ? <EmptyState title={t('engage.league.notYet')} lead={t('engage.league.notYetLead')} action={<Button size="sm" onClick={() => navigate('/stories')}>{t('engage.firstStep.title')}</Button>}/>
        : <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2"><TierBadge tier={data.standings.tier}/><span className="text-sm text-gray-700">{t('engage.league.size', { size: data.standings.size, capacity: data.standings.capacity })}</span></div>
            <span className="text-xs text-gray-600">{t('engage.league.ends', { date: date(data.standings.ends_at, { weekday: 'long', hour: '2-digit', minute: '2-digit' }) })}</span>
          </div>
          <ol className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t('engage.league.standings')}>
            {data.standings.rows.map((row) => <li key={row.rank} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${row.me ? 'border border-navy bg-lime-soft/50 font-semibold' : 'bg-white/70'}`}>
              <span className="w-6 text-right font-display font-bold">{row.rank}</span>
              <span className="min-w-0 flex-1 truncate">{row.me ? t('engage.you') : row.name}</span>
              {row.zone === 'promote' && <ArrowUp size={14} className="text-green-700" aria-label={t('engage.league.up')}/>}
              {row.zone === 'demote' && <ArrowDown size={14} className="text-red-700" aria-label={t('engage.league.down')}/>}
              <span className="shrink-0 tabular-nums">{row.xp} XP</span>
            </li>)}
          </ol>
          <p className="m-0 text-xs text-gray-600">{data.standings.demote ? t('engage.league.rules', { promote: data.standings.promote, demote: data.standings.demote }) : t('engage.league.rulesBronze', { promote: data.standings.promote })}</p>
          <p className="m-0 text-xs text-gray-600">{t('engage.league.names')}</p>
        </Card>}
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => navigate('/boards')}>{t('engage.nav.boards')}</Button><Button size="sm" variant="secondary" onClick={() => navigate('/events')}>{t('engage.nav.events')}</Button></div>
      <div className="flex flex-wrap gap-2 text-xs text-gray-600">{(data.standings?.tiers ?? ['bronze', 'silver', 'gold', 'sapphire', 'diamond']).map((tier) => <TierBadge key={tier} tier={tier}/>)}</div>
    </>}</Loaded>
  </Page>;
}

// --- Squads ------------------------------------------------------------------------------------
interface SquadMemberView { name: string | null; me: boolean; role: string; week_minutes: number; today: boolean; key: string }
interface SquadView {
  id: string; name: string; invite_code: string; invite_path: string; owner: boolean; weekly_goal_minutes: number; week_minutes: number; goal_done: boolean; max_members: number;
  streak: number; today_count: number; today_target: number; members: SquadMemberView[]; duels: { name: string | null; me: boolean; outcome: string; at: string }[];
}

function SquadCard({ squad, onChange }: { squad: SquadView; onChange: () => void }) {
  const t = useT(), action = useAction();
  const [goal, setGoal] = useState(String(squad.weekly_goal_minutes));
  const [nudged, setNudged] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}${squad.invite_path}`;
  const nudge = async (member: SquadMemberView) => {
    const result = await action.run<{ queued: boolean; reason: string | null }>('squad-nudge', { member: member.key }, member.key);
    if (result) setNudged((current) => ({ ...current, [member.key]: result.queued ? 'sent' : result.reason ?? 'sent' }));
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } };
  return <div className="flex flex-col gap-4">
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-display text-2xl font-bold">{squad.name}</h2>
        {squad.goal_done ? <Badge tone="lime">{t('engage.squad.goalDone')}</Badge> : <Badge>{t('engage.squad.goal', { minutes: squad.weekly_goal_minutes })}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label={t('engage.squad.week')} value={t('engage.squad.minutes', { count: squad.week_minutes })}/>
        <Stat label={t('engage.squad.streak')} value={t('engage.streak.days', { count: squad.streak })} hint={t('engage.squad.streakRule', { target: squad.today_target })}/>
        <Stat label={t('engage.squad.today')} value={`${squad.today_count}/${squad.members.length}`}/>
      </div>
      <Meter value={squad.week_minutes} max={squad.weekly_goal_minutes} label={t('engage.squad.goal', { minutes: squad.weekly_goal_minutes })}/>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {squad.members.map((member) => <li key={member.key} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm">
          {member.role === 'owner' && <Crown size={14} aria-label={t('engage.squad.owner')}/>}
          <span className="min-w-0 flex-1 font-semibold">{member.me ? t('engage.you') : member.name}</span>
          <span className="text-gray-600">{t('engage.squad.minutes', { count: member.week_minutes })}</span>
          {member.today ? <Badge tone="lime">{t('engage.squad.learnedToday')}</Badge> : !member.me && <Button size="sm" variant="ghost" disabled={action.busy !== null || !!nudged[member.key]} onClick={() => void nudge(member)} icon={<Hand size={14} aria-hidden="true"/>}>{nudged[member.key] ? t(`engage.squad.nudge.${nudged[member.key]}`) : t('engage.squad.nudge')}</Button>}
        </li>)}
      </ul>
      <p className="m-0 text-xs text-gray-600">{t('engage.squad.nudgeRule')}</p>
      {squad.duels.length > 0 && <div className="flex flex-col gap-1">
        <Eyebrow icon={<Swords size={14} aria-hidden="true"/>}>{t('engage.squad.duels')}</Eyebrow>
        <ul className="m-0 list-none p-0 text-sm">{squad.duels.map((duel, index) => <li key={index}>{duel.me ? t('engage.you') : duel.name}: {t(`engage.squad.duel.${duel.outcome}`)}</li>)}</ul>
      </div>}
    </Card>
    {squad.members.length < squad.max_members && <Card className="flex flex-col gap-3">
      <Eyebrow>{t('engage.squad.invite')}</Eyebrow>
      <p className="m-0 text-sm text-gray-700">{t('engage.squad.inviteLead', { count: squad.max_members - squad.members.length })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-xl border border-navy-line/30 bg-cream-soft px-3 py-2 font-mono text-lg tracking-widest">{squad.invite_code}</code>
        <Button size="sm" variant="secondary" onClick={() => void copy()} icon={<Copy size={14} aria-hidden="true"/>}>{copied ? t('engage.copied') : t('engage.squad.copy')}</Button>
      </div>
    </Card>}
    {squad.owner && <Card className="flex flex-col gap-3">
      <form className="flex flex-wrap items-end gap-2" onSubmit={async (event) => { event.preventDefault(); if (await action.run('squad-goal', { weekly_goal_minutes: Number(goal) })) onChange(); }}>
        <div className="w-40"><Field label={t('engage.squad.setGoal')}>{(id) => <TextInput id={id} type="number" min={30} max={1200} step={10} value={goal} onChange={(event) => setGoal(event.target.value)}/>}</Field></div>
        <Button type="submit" size="sm" variant="secondary">{t('engage.save')}</Button>
      </form>
    </Card>}
    {action.error !== null && <EngageError error={action.error}/>}
    <div><Button variant="ghost" size="sm" onClick={async () => { if (await action.run('squad-leave')) onChange(); }}>{t('engage.squad.leave')}</Button></div>
  </div>;
}

export function SquadsPage({ params }: { params: Record<string, string> }) {
  const t = useT(), action = useAction();
  const code = params.code?.toUpperCase();
  const view = useEngage<{ squad: SquadView | null; invite: { name: string; members: number; max_members: number; mine: boolean } | null }>('squad', { code });
  const [name, setName] = useState('');
  const [typed, setTyped] = useState('');
  const create = async () => { if (await action.run('squad-create', { name: name.trim() })) void view.reload(); };
  const join = async (value: string) => { if (await action.run('squad-join', { code: value })) { navigate('/squads', { replace: true }); void view.reload(); } };
  return <Page eyebrow={<Eyebrow icon={<Users size={14} aria-hidden="true"/>}>{t('engage.squad.eyebrow')}</Eyebrow>} title={t('engage.squad.title')} lead={t('engage.squad.lead')}>
    <Loaded {...view}>{(data) => <>
      {data.invite && !data.invite.mine && !data.squad && <Card className="flex flex-col gap-3 bg-lime-soft/40">
        <p className="m-0 font-semibold">{t('engage.squad.invited', { name: data.invite.name, members: data.invite.members, max: data.invite.max_members })}</p>
        <div><Button disabled={action.busy !== null} onClick={() => void join(code!)}>{t('engage.squad.join')}</Button></div>
      </Card>}
      {data.squad ? <SquadCard squad={data.squad} onChange={() => void view.reload()}/> : <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <Eyebrow>{t('engage.squad.create')}</Eyebrow>
          <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void create(); }}>
            <Field label={t('engage.squad.name')}>{(id) => <TextInput id={id} required minLength={2} maxLength={40} value={name} onChange={(event) => setName(event.target.value)}/>}</Field>
            <div><Button type="submit" disabled={action.busy !== null || name.trim().length < 2}>{t('engage.squad.create')}</Button></div>
          </form>
        </Card>
        <Card className="flex flex-col gap-3">
          <Eyebrow>{t('engage.squad.joinTitle')}</Eyebrow>
          <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void join(typed.trim().toUpperCase()); }}>
            <Field label={t('engage.squad.code')}>{(id) => <TextInput id={id} required maxLength={8} value={typed} autoCapitalize="characters" onChange={(event) => setTyped(event.target.value)}/>}</Field>
            <div><Button type="submit" variant="secondary" disabled={action.busy !== null || typed.trim().length !== 8}>{t('engage.squad.join')}</Button></div>
          </form>
        </Card>
      </div>}
      {action.error !== null && <EngageError error={action.error}/>}
    </>}</Loaded>
  </Page>;
}

// --- Boards ----------------------------------------------------------------------------------------
type Scope = 'national' | 'region' | 'school' | 'centre' | 'centres';
interface BoardView {
  scope: Scope; value: string | null; week_start: string; min_active?: number;
  you?: { visible: boolean; visibility: string; adult: boolean; rank: number | null; xp: number };
  rows: { rank: number; xp?: number; me?: boolean; name: string | null; active?: number; xp_per_learner?: number; mine?: boolean }[];
}

function CentreLeagueSwitch() {
  const t = useT(), action = useAction();
  const view = useEngage<{ opt_in: boolean; centre: boolean }>('centre-league');
  if (!view.data?.centre) return null;
  return <Card className="flex flex-wrap items-center justify-between gap-3">
    <p className="m-0 text-sm">{view.data.opt_in ? t('engage.boards.centreIn') : t('engage.boards.centreOut')}</p>
    <Button size="sm" variant="secondary" disabled={action.busy !== null} onClick={async () => { const result = await action.run<{ opt_in: boolean }>('centre-league', { opt_in: !view.data!.opt_in }); if (result) view.setData({ ...view.data!, opt_in: result.opt_in }); }}>{view.data.opt_in ? t('engage.boards.leave') : t('engage.boards.joinLeague')}</Button>
  </Card>;
}

export function BoardsPage() {
  const t = useT(), { me } = useWorkspace();
  const centre = me?.workspace.kind === 'centre';
  const [scope, setScope] = useState<Scope>('national');
  const view = useEngage<BoardView>('boards', { scope });
  const scopes: Scope[] = ['national', 'region', 'school', ...(centre ? ['centre' as const] : []), 'centres'];
  return <Page eyebrow={<Eyebrow icon={<Medal size={14} aria-hidden="true"/>}>{t('engage.boards.eyebrow')}</Eyebrow>} title={t('engage.boards.title')} lead={t('engage.boards.lead')}>
    <div role="tablist" aria-label={t('engage.boards.scope')} className="flex flex-wrap gap-2">
      {scopes.map((entry) => <button key={entry} type="button" role="tab" aria-selected={scope === entry} className={chip(scope === entry)} onClick={() => setScope(entry)}>{t(`engage.boards.scope.${entry}`)}</button>)}
    </div>
    {centre && <CentreLeagueSwitch/>}
    {view.error ? <EngageError error={view.error} onRetry={() => void view.reload()}/> : <Loaded {...view}>{(data) => <>
      {data.you && !data.you.visible && <Notice>{t(data.you.adult ? 'engage.boards.hiddenAdult' : 'engage.boards.hiddenMinor')} <Link to="/progress/settings" className="font-semibold underline underline-offset-2">{t('engage.settings.title')}</Link></Notice>}
      {data.rows.length === 0 ? <EmptyState title={t('engage.boards.empty')} lead={data.scope === 'centres' ? t('engage.boards.centresEmpty', { min: data.min_active ?? 5 }) : t('engage.boards.emptyLead')}/>
        : <Card><ol className="m-0 flex list-none flex-col gap-1 p-0">
          {data.rows.map((row) => <li key={`${row.rank}-${row.name}`} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${row.me || row.mine ? 'border border-navy bg-lime-soft/50 font-semibold' : 'bg-white/70'}`}>
            <span className="w-7 text-right font-display font-bold">{row.rank}</span>
            <span className="min-w-0 flex-1 truncate">{row.me ? t('engage.you') : row.name}</span>
            {data.scope === 'centres' ? <span className="shrink-0 text-gray-700">{t('engage.boards.perLearner', { xp: row.xp_per_learner ?? 0, active: row.active ?? 0 })}</span> : <span className="shrink-0 tabular-nums">{row.xp} XP</span>}
          </li>)}
        </ol></Card>}
      <p className="m-0 text-xs text-gray-600">{t('engage.boards.rule')}</p>
    </>}</Loaded>}
  </Page>;
}
