import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Card, EmptyState, navigate, useLocation, useSession, useT } from '../../core/index.ts';
import { coachApi, levelLabel, type Report, type ReportRow } from '../api.ts';
import { Change, CoachFrame, Loaded, Stat, useLoad } from '../ui.tsx';
import { SignedOut } from './common.tsx';

// /coach/<pack>/report: the weekly report with before/after numbers: this week
// against last week (and the first week), results per criterion, pace, fillers,
// vocabulary range, errors, accuracy on sets, cards and minutes.

const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function CoachReport({ params }: { params: Record<string, string> }) {
  const session = useSession(), { query } = useLocation();
  if (session.status !== 'signed_in') return <SignedOut pack={params.pack}/>;
  return <ReportBody pack={params.pack} week={query.get('week') ?? undefined}/>;
}

function ReportBody({ pack, week }: { pack: string; week?: string }) {
  const t = useT();
  const dashboard = useLoad(() => coachApi.dashboard(pack), [pack]);
  const report = useLoad(() => coachApi.report(pack, week), [pack, week]);
  return <Loaded state={dashboard}>{(coach) => <CoachFrame pack={pack} name={coach.coach.name} accent={coach.coach.accent}>
    <Loaded state={report}>{(data) => <ReportView data={data} pack={pack} scale={coach.coach.scale} t={t} forecasts={coach.forecasts}/>}</Loaded>
  </CoachFrame>}</Loaded>;
}

function ReportView({ data, pack, t, forecasts }: { data: Report; pack: string; scale: Parameters<typeof levelLabel>[0]; t: ReturnType<typeof useT>; forecasts: { rubric: string; scale: Parameters<typeof levelLabel>[0] }[] }) {
  const label = (row: ReportRow & { label: string }) => {
    if (row.key === 'result' || row.key === 'criterion') return row.label;
    if (row.key === 'quiz') return t('coach.report.quiz', { mode: t(`coach.mode.${row.ref}`) });
    return t(`coach.report.${row.key}`);
  };
  const value = (row: ReportRow, v: number | null) => {
    if (v === null) return '—';
    if (row.key === 'result') { const scale = forecasts.find((entry) => entry.rubric === row.ref)?.scale; return scale ? levelLabel(scale, v) : String(v); }
    if (row.key === 'quiz' || row.key === 'cards') return `${Math.round(v)}%`;
    return String(Math.round(v * 10) / 10);
  };
  const groups: { title: string; keys: string[] }[] = [
    { title: t('coach.report.results'), keys: ['result', 'criterion'] },
    { title: t('coach.report.fluency'), keys: ['wpm', 'fillers_per_minute', 'fillers_per_100', 'range', 'errors_per_100'] },
    { title: t('coach.report.practice'), keys: ['quiz', 'cards', 'minutes', 'active_days'] },
  ];
  const range = `${data.from.split('-').reverse().slice(0, 2).join('.')} – ${data.to.split('-').reverse().slice(0, 2).join('.')}`;
  const go = (offset: number) => navigate(`/coach/${pack}/report?week=${addDays(data.from, offset)}`);
  return <>
    <div className="flex items-center justify-between gap-2">
      <Button variant="secondary" size="sm" onClick={() => go(-7)} icon={<ChevronLeft size={16} aria-hidden="true"/>}>{t('coach.report.previous')}</Button>
      <p className="m-0 text-sm font-semibold text-gray-900" aria-live="polite">{t('coach.report.week', { range })}</p>
      <Button variant="secondary" size="sm" onClick={() => go(7)} disabled={addDays(data.from, 7) > new Date().toISOString().slice(0, 10)}>{t('coach.report.next')}<ChevronRight size={16} aria-hidden="true"/></Button>
    </div>
    {!data.has_data ? <EmptyState title={t('coach.report.empty')} lead={t('coach.report.emptyLead')}/> : <>
      <section aria-label={t('coach.report.summary')} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('coach.report.minutes')} value={data.stats.minutes}/>
        <Stat label={t('coach.report.active_days')} value={data.stats.active_days}/>
        <Stat label={t('coach.report.sessions')} value={data.stats.sessions}/>
        <Stat label={t('coach.report.cardsReviewed')} value={data.stats.cards.reviewed}/>
      </section>
      {data.headline && <Card className="bg-lime-soft/60"><p className="m-0 text-sm text-gray-900">{t('coach.report.headline', { what: label(data.headline as ReportRow & { label: string }), before: value(data.headline, data.headline.before ?? data.headline.start), after: value(data.headline, data.headline.after) })}</p></Card>}
      {groups.map((group) => {
        const rows = data.rows.filter((row) => group.keys.includes(row.key) && (row.after !== null || row.before !== null));
        if (!rows.length) return null;
        return <Card key={group.title} className="flex flex-col gap-1">
          <h2 className="m-0 mb-1 font-display text-lg font-bold">{group.title}</h2>
          <ul className="m-0 list-none p-0">{rows.map((row, index) => <Change key={`${row.key}:${row.ref}:${index}`} label={`${row.key === 'criterion' ? '· ' : ''}${label(row)}`} before={value(row, row.before ?? row.start)} after={value(row, row.after)} verdict={row.verdict}/>)}</ul>
          <p className="m-0 mt-1 text-xs text-gray-600">{t('coach.report.compared')}</p>
        </Card>;
      })}
      {data.focus.length > 0 && <Card className="flex flex-col gap-2">
        <h2 className="m-0 font-display text-lg font-bold">{t('coach.report.focus')}</h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">{data.focus.map((entry) => <li key={entry.tag} className="text-sm leading-6"><b>{entry.name}</b> ×{entry.count}<br/><span className="text-gray-700">{entry.explain}</span></li>)}</ul>
      </Card>}
    </>}
  </>;
}
