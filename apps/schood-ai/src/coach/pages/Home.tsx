import { Award, Users } from 'lucide-react';
import { Badge, Card, Link, PageHeader, useSession, useT } from '../../core/index.ts';
import { coachApi } from '../api.ts';
import { Loaded, useLoad } from '../ui.tsx';
import { OpenBot, SignedOut } from './common.tsx';

// /coach: the coaches, what each one does, and whether this person has it.

export function CoachHome() {
  const t = useT(), session = useSession();
  return <div className="flex min-w-0 flex-col gap-5">
    <PageHeader eyebrow={t('coach.eyebrow')} title={t('coach.home.title')} lead={t('coach.home.lead')}/>
    {session.status === 'signed_in' ? <Coaches/> : <SignedOut/>}
  </div>;
}

function Coaches() {
  const t = useT();
  const state = useLoad(() => coachApi.home(), []);
  return <Loaded state={state}>{(home) => <>
    <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
      {home.coaches.map((coach) => <li key={coach.id}>
        <Card className="flex h-full flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="m-0 font-display text-xl font-bold">{coach.name}</h2>
              <p className="mb-0 mt-1 text-sm leading-6 text-gray-700">{coach.tagline}</p>
            </div>
            <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-xl border border-navy-line" style={{ background: /^#[0-9a-f]{6}$/i.test(coach.accent) ? coach.accent : '#0f172a' }}/>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={coach.allowed ? 'lime' : 'neutral'}>{t(coach.allowed ? 'coach.home.included' : 'coach.home.needsPlan')}</Badge>
            {coach.placement && <Badge tone="sky">{t('coach.home.placement', { level: coach.placement })}</Badge>}
            {coach.streak > 0 && <Badge tone="navy">{t('coach.home.streak', { count: coach.streak })}</Badge>}
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Link to={`/coach/${coach.id}`} className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('coach.home.open')}</Link>
            <OpenBot bot={coach.bot}/>
          </div>
        </Card>
      </li>)}
    </ul>
    <div className="flex flex-wrap gap-2">
      <Link to="/coach/certificates" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-navy-line bg-white px-4 text-sm font-semibold text-gray-900 no-underline"><Award size={16} aria-hidden="true"/>{t('coach.cert.title')}</Link>
      <Link to="/coach/team" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-navy-line bg-white px-4 text-sm font-semibold text-gray-900 no-underline"><Users size={16} aria-hidden="true"/>{t('coach.team.title')}</Link>
    </div>
  </>}</Loaded>;
}
