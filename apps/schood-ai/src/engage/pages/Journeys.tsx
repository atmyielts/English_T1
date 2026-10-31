import { useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, ExternalLink, GraduationCap, Map as MapIcon, Pause, Play } from 'lucide-react';
import { Badge, Button, Card, Eyebrow, Field, Link, navigate, TextInput, useI18n } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { useAction, useEngage, type JourneyMine, type Offer, type Task } from '../api.ts';
import { EngageError, Loaded, Meter, Notice, Page } from '../ui.tsx';

// /journeys and /journeys/:key (E1): multi-month programmes with weekly chapters and
// a graduation. A chapter closes when its tracked tasks are done through verified
// practice with the coaches, the learner tools or the stories; Schood practice links
// are recommendations and never block a chapter.

interface JourneyCard { key: string; title: string; lead: string; weeks: number; coach: string; level: string; goal: string }
interface JourneyDetail { journey: JourneyCard & { chapters: { week: number; title: string; focus: string; tasks: number }[]; graduation: { title: string; lead: string; certificate: string | null } }; mine: JourneyMine | null; offer: Offer | null }

function TaskList({ tasks }: { tasks: Task[] }) {
  const t = useT();
  return <ul className="m-0 flex list-none flex-col gap-3 p-0">
    {tasks.map((task) => <li key={task.id} className="flex items-start gap-3">
      {task.done ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-700" aria-label={t('engage.journey.taskDone')}/> : <Circle size={20} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true"/>}
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-semibold">{task.title}</p>
        {task.tracked ? <div className="mt-1 flex items-center gap-2"><div className="flex-1"><Meter value={task.progress} max={task.target} label={task.title}/></div><span className="text-xs text-gray-600">{task.progress}/{task.target}</span></div>
          : <p className="m-0 text-xs text-gray-600">{t('engage.journey.recommended')}</p>}
      </div>
      {task.link.startsWith('https://') ? <a href={task.link} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-gray-900 underline underline-offset-2">{t('engage.journey.go')}<ExternalLink size={12} aria-hidden="true"/></a>
        : <Link to={task.link} className="shrink-0 text-sm font-semibold text-gray-900 underline underline-offset-2">{t('engage.journey.go')}</Link>}
    </li>)}
  </ul>;
}

export function OfferCard({ offer, onDismiss }: { offer: Offer; onDismiss: () => void }) {
  const t = useT(), action = useAction();
  const dismiss = async (all: boolean) => { if (await action.run('offer-dismiss', { offer: offer.key, mute_all: all })) onDismiss(); };
  return <Card className="flex flex-col gap-2 bg-cream-soft">
    <Eyebrow>{t('engage.offer.eyebrow')}</Eyebrow>
    <p className="m-0 font-semibold">{offer.title}</p>
    <p className="m-0 text-sm text-gray-700">{offer.terms}</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => navigate(offer.path)}>{t('engage.offer.see')}</Button>
      <Button size="sm" variant="ghost" onClick={() => void dismiss(false)}>{t('engage.offer.notNow')}</Button>
      <Button size="sm" variant="ghost" onClick={() => void dismiss(true)}>{t('engage.offer.never')}</Button>
    </div>
  </Card>;
}

function Detail({ journeyKey }: { journeyKey: string }) {
  const t = useT(), { date } = useI18n(), action = useAction();
  const view = useEngage<JourneyDetail>('journey', { key: journeyKey });
  const [target, setTarget] = useState('');
  const start = async () => { if (await action.run('journey-start', { journey: journeyKey, ...(target ? { target_date: target } : {}) })) void view.reload(); };
  const change = async (kind: 'pause' | 'resume' | 'leave') => { if (await action.run('journey-change', { journey: journeyKey, action: kind })) void view.reload(); };
  return <Loaded {...view}>{(data) => {
    const { journey, mine } = data;
    return <Page eyebrow={<Eyebrow icon={<MapIcon size={14} aria-hidden="true"/>}>{t('engage.journeys.eyebrow')}</Eyebrow>} title={journey.title} lead={journey.lead}>
      {!mine && <Card className="flex flex-col gap-3">
        <p className="m-0 text-sm text-gray-700">{t('engage.journey.startLead', { weeks: journey.weeks })}</p>
        <div className="max-w-xs"><Field label={t('engage.journey.target')} hint={t('engage.journey.targetHint')}>{(id) => <TextInput id={id} type="date" value={target} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setTarget(event.target.value)}/>}</Field></div>
        <div><Button disabled={action.busy !== null} onClick={() => void start()} icon={<Play size={16} aria-hidden="true"/>}>{t('engage.journey.start')}</Button></div>
      </Card>}
      {mine?.graduated && <Card className="flex flex-col gap-2 bg-lime-soft/40">
        <Eyebrow icon={<GraduationCap size={14} aria-hidden="true"/>}>{journey.graduation.title}</Eyebrow>
        <p className="m-0 text-sm text-gray-800">{journey.graduation.lead}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate('/path')}>{t('engage.path.open')}</Button>
          {journey.graduation.certificate && <Button size="sm" variant="secondary" onClick={() => navigate('/certificates')}>{t('engage.journey.certificate')}</Button>}
          <Button size="sm" variant="secondary" onClick={() => navigate('/then-vs-now')}>{t('engage.nav.thenNow')}</Button>
        </div>
      </Card>}
      {data.offer && <OfferCard offer={data.offer} onDismiss={() => void view.reload()}/>}
      {mine && !mine.graduated && <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow>{t('engage.journey.chapter', { chapter: mine.chapter, weeks: mine.weeks })}</Eyebrow>
          {mine.status === 'paused' ? <Badge>{t('engage.journey.paused')}</Badge> : mine.at_risk ? <Badge tone="warn">{t('engage.journey.atRisk')}</Badge> : <Badge tone="lime">{t('engage.journey.onTrack')}</Badge>}
        </div>
        <h2 className="m-0 font-display text-2xl font-bold">{mine.chapter_title}</h2>
        <p className="m-0 text-sm text-gray-700">{mine.chapter_focus}</p>
        <p className="m-0 text-xs text-gray-600">{t('engage.journey.weekEnds', { date: date(`${mine.scheduled_end}T12:00:00Z`, { dateStyle: 'medium' }) })}</p>
        <TaskList tasks={mine.tasks}/>
        <div className="flex flex-wrap gap-2 border-t border-navy-line/20 pt-3">
          {mine.status === 'active' ? <Button size="sm" variant="ghost" onClick={() => void change('pause')} icon={<Pause size={14} aria-hidden="true"/>}>{t('engage.journey.pause')}</Button>
            : <Button size="sm" variant="secondary" onClick={() => void change('resume')} icon={<Play size={14} aria-hidden="true"/>}>{t('engage.journey.resume')}</Button>}
          <Button size="sm" variant="ghost" onClick={() => void change('leave')}>{t('engage.journey.leave')}</Button>
        </div>
      </Card>}
      {action.error !== null && <EngageError error={action.error}/>}
      <section aria-labelledby="engage-chapters" className="flex flex-col gap-2">
        <h2 id="engage-chapters" className="m-0 font-display text-xl font-bold">{t('engage.journey.chapters')}</h2>
        <ol className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
          {journey.chapters.map((chapter) => {
            const done = !!mine && (mine.graduated || chapter.week < mine.chapter), current = !!mine && !mine.graduated && chapter.week === mine.chapter;
            return <li key={chapter.week} className={`rounded-2xl border p-3 ${current ? 'border-navy bg-white' : 'border-navy-line/30 bg-white/70'}`}>
              <p className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-600">{t('engage.journey.week', { week: chapter.week })}{done ? ` · ${t('engage.journey.taskDone')}` : ''}</p>
              <p className="m-0 font-semibold">{chapter.title}</p>
              <p className="m-0 text-sm text-gray-600">{chapter.focus}</p>
            </li>;
          })}
        </ol>
      </section>
    </Page>;
  }}</Loaded>;
}

export function JourneysPage({ params }: { params: Record<string, string> }) {
  const t = useT();
  const view = useEngage<{ journeys: JourneyCard[]; mine: JourneyMine[] }>(params.key ? null : 'journeys');
  if (params.key) return <Detail journeyKey={params.key}/>;
  return <Page eyebrow={<Eyebrow icon={<MapIcon size={14} aria-hidden="true"/>}>{t('engage.journeys.eyebrow')}</Eyebrow>} title={t('engage.journeys.title')} lead={t('engage.journeys.lead')}>
    <Loaded {...view}>{(data) => <>
      {data.mine.length > 0 && <Notice>{t('engage.journeys.mine', { count: data.mine.filter((entry) => !entry.graduated).length })}</Notice>}
      <div className="grid gap-4 md:grid-cols-3">
        {data.journeys.map((journey) => {
          const mine = data.mine.find((entry) => entry.key === journey.key);
          return <Card key={journey.key} className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2"><Badge tone="sky">{t('engage.journeys.weeks', { count: journey.weeks })}</Badge>{mine && <Badge tone="lime">{mine.graduated ? t('engage.journey.graduated') : t('engage.journey.chapter', { chapter: mine.chapter, weeks: mine.weeks })}</Badge>}</div>
            <h2 className="m-0 font-display text-xl font-bold">{journey.title}</h2>
            <p className="m-0 flex-1 text-sm text-gray-700">{journey.lead}</p>
            <div><Button variant={mine ? 'primary' : 'secondary'} size="sm" onClick={() => navigate(`/journeys/${journey.key}`)} icon={<ArrowRight size={14} aria-hidden="true"/>}>{mine ? t('engage.journey.open') : t('engage.journeys.see')}</Button></div>
          </Card>;
        })}
      </div>
    </>}</Loaded>
  </Page>;
}
