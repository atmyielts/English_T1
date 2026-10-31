import { Building2, GraduationCap, LayoutDashboard, School, Ticket } from 'lucide-react';
import { BrandMark, Card, Eyebrow, Link, useT, type Me } from '../core/index.ts';

// Home cards of the centre area, under "Your tools".

const button = 'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold no-underline';

export function SetupHomeCard({ me }: { me: Me }) {
  const t = useT();
  if (me.workspace.kind !== 'personal') return null;
  return <Card className="flex flex-col gap-3">
    <Eyebrow icon={<Building2 size={14} aria-hidden="true"/>}>{t('centre.home.setup.eyebrow')}</Eyebrow>
    <p className="m-0 text-sm leading-6 text-gray-700">{t('centre.home.setup.lead')}</p>
    <div className="flex flex-wrap gap-2">
      <Link to="/centre/new" className={`${button} bg-navy text-white`}>{t('centre.gate.create')}</Link>
      <Link to="/join" className={`${button} border border-navy-line bg-white text-gray-900`}><Ticket size={16} aria-hidden="true"/>{t('centre.gate.join')}</Link>
    </div>
  </Card>;
}

export function CentreHomeCard({ me }: { me: Me }) {
  const t = useT();
  if (me.workspace.kind !== 'centre') return null;
  return <Card className="flex flex-col gap-3">
    <Eyebrow icon={<LayoutDashboard size={14} aria-hidden="true"/>}>{t('centre.home.centre.eyebrow')}</Eyebrow>
    <p className="m-0 text-sm leading-6 text-gray-700">{t('centre.home.centre.lead')}</p>
    <div className="flex flex-wrap gap-2">
      <Link to="/centre" className={`${button} bg-navy text-white`}>{t('centre.nav.overview')}</Link>
      <Link to="/centre/people" className={`${button} border border-navy-line bg-white text-gray-900`}>{t('centre.nav.people')}</Link>
      <Link to="/centre/admissions" className={`${button} border border-navy-line bg-white text-gray-900`}>{t('centre.nav.admissions')}</Link>
    </div>
  </Card>;
}

export function TeacherHomeCard({ me }: { me: Me }) {
  const t = useT();
  if (me.workspace.kind !== 'centre') return null;
  return <Card className="flex flex-col gap-3">
    <Eyebrow icon={<School size={14} aria-hidden="true"/>}>{t('centre.home.teacher.eyebrow')}</Eyebrow>
    <p className="m-0 text-sm leading-6 text-gray-700">{t('centre.home.teacher.lead')}</p>
    <div><Link to="/teach/classes" className={`${button} bg-navy text-white`}>{t('centre.nav.classes')}</Link></div>
  </Card>;
}

export function StudentHomeCard({ me }: { me: Me }) {
  const t = useT();
  if (me.workspace.kind !== 'centre') return null;
  const ws = me.workspace, name = ws.branding.assistant_name ?? ws.name;
  return <Card className="flex flex-col gap-3" style={ws.branding.primary_color ? { boxShadow: `inset 4px 0 0 ${ws.branding.primary_color}` } : undefined}>
    <div className="flex items-center gap-3">
      <BrandMark name={ws.name} logo={ws.branding.logo_url} color={ws.branding.primary_color} size={36}/>
      <p className="m-0 font-display text-lg font-bold">{name}</p>
    </div>
    <p className="m-0 text-sm leading-6 text-gray-700">{t('centre.home.student.lead', { centre: ws.name })}</p>
    <div><Link to="/my-centre" className={`${button} bg-navy text-white`}><GraduationCap size={16} aria-hidden="true"/>{t('centre.home.student.open', { name })}</Link></div>
  </Card>;
}
