import { formatLocaleLongDate, translate } from '../../i18n';
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, CircleAlert, Clock3, ClipboardList, GraduationCap, UsersRound, Wallet } from 'lucide-react';
import type {
  TeacherStudioActionItem,
  TeacherStudioEducationOS,
  TeacherStudioSummary,
} from '../../lib/client';
import type { OfficeRouteIntent } from '../../lib/academyAccess';

type QuickTarget = {
  title: string;
  caption: string;
  path: string;
};

type WorkspaceHomeViewProps = {
  intent: OfficeRouteIntent;
  academyName: string;
  role: string;
  scopeLabel: string;
  summary: TeacherStudioSummary | null;
  educationOS: TeacherStudioEducationOS | null;
  quickTargets: QuickTarget[];
  contactsCount: number;
  classroomsCount: number;
  openAlertsCount: number;
  onOpenAction: (item: TeacherStudioActionItem) => void;
  onNavigate: (path: string) => void;
  formatDate: (iso: string | null | undefined) => string;
};

const HOME_COPY: Record<OfficeRouteIntent, { eyebrow: string; title: string; description: string; queue: string }> = {
  admin: {
    eyebrow: 'Academy control',
    title: 'Today at your academy',
    description: 'See operational risk first, then move into finance, access, and configuration only when needed.',
    queue: 'Owner attention',
  },
  center: {
    eyebrow: 'Center office',
    title: 'Today across this academy',
    description: 'Keep center context visible while handling the selected academy’s highest-priority work.',
    queue: 'Center attention',
  },
  office: {
    eyebrow: 'Daily operations',
    title: 'What needs handling today?',
    description: 'Classes, student follow-up, messages, and exceptions are gathered into one working queue.',
    queue: 'Operations queue',
  },
  teacher: {
    eyebrow: 'Teaching workspace',
    title: 'Your teaching day',
    description: 'Open the next classroom, submit attendance, and move through grading without admin noise.',
    queue: 'Teaching queue',
  },
};

const priorityLabel = (priority: string): string => {
  const normalized = priority.toLowerCase();
  if (normalized === 'critical') return 'Critical';
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  return 'Routine';
};

const shortcutIcon = (title: string) => {
  if (/contact|student/i.test(title)) return <UsersRound size={17} />;
  if (/classroom|class/i.test(title)) return <GraduationCap size={17} />;
  if (/pay|billing|finance/i.test(title)) return <Wallet size={17} />;
  if (/placement|exam/i.test(title)) return <ClipboardList size={17} />;
  return <BookOpen size={17} />;
};

export const WorkspaceHomeView = ({
  intent,
  academyName,
  role,
  scopeLabel,
  summary,
  educationOS,
  quickTargets,
  contactsCount,
  classroomsCount,
  openAlertsCount,
  onOpenAction,
  onNavigate,
  formatDate,
}: WorkspaceHomeViewProps) => {
  const copy = HOME_COPY[intent];
  const openQueue = (educationOS?.action_queue ?? []).filter((item) => item.status === 'open');
  const actionQueue = openQueue.slice(0, 7);
  const todayLabel = formatLocaleLongDate(new Date());
  const now = new Date().getTime();
  const upcoming = (educationOS?.calendar_events ?? [])
    .filter((item) => new Date(item.ends_at || item.starts_at).getTime() >= now)
    .sort((left, right) => new Date(left.starts_at).getTime() - new Date(right.starts_at).getTime())
    .slice(0, 4);
  const deadlines = openQueue.filter((item) => item.due_at)
    .sort((left, right) => new Date(left.due_at!).getTime() - new Date(right.due_at!).getTime()).slice(0, 4);
  const openActions = educationOS?.stats.open_actions ?? null;
  const urgentActions = educationOS?.stats.urgent_actions ?? null;
  const routineActions = openActions === null || urgentActions === null ? null : Math.max(0, openActions - urgentActions);
  const urgentShare = openActions && urgentActions !== null ? Math.min(1, Math.max(0, urgentActions / openActions)) : 0;
  const pulse = [
    { label: intent === 'teacher' ? 'My students' : 'Contacts', value: summary?.counts.contacts ?? contactsCount, icon: <UsersRound size={18} /> },
    { label: intent === 'teacher' ? 'My classrooms' : 'Classrooms', value: summary?.counts.classrooms ?? classroomsCount, icon: <GraduationCap size={18} /> },
    { label: 'Open actions', value: openActions, icon: <ClipboardList size={18} /> },
  ];

  return (
    <section className="workspace-home" aria-labelledby="workspace-home-title">
      <header className={`workspace-home__hero workspace-home__hero--${intent}`}>
        <BookOpen size={22} aria-hidden="true" />
        <h2 id="workspace-home-title">{translate(copy.title)}</h2>
        <strong className="workspace-home__academy">{academyName || translate('Academy')}</strong>
        <div className="workspace-date" aria-label={translate("Today is {date}", { date: todayLabel })}>
          <CalendarDays size={14} aria-hidden="true" />
          <strong>{todayLabel}</strong>
        </div>
      </header>

      <dl className="workspace-pulse" aria-label={translate("Workspace status")}>
        {pulse.map((item) => <div key={item.label}><dt>{translate(item.label)}</dt><dd><span className="workspace-metric-icon" aria-hidden="true">{item.icon}</span><span>{item.value ?? '—'}</span></dd></div>)}
      </dl>

      <section className="workspace-workload" aria-labelledby="workspace-workload-title">
        <div className="section-heading"><h3 id="workspace-workload-title">{translate('Workload')}</h3><span className="muted">{translate('Open actions')}</span></div>
        <div className="workspace-workload__chart">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle className="workspace-workload__track" cx="80" cy="80" r="62" />
            {openActions !== null && openActions > 0 ? <>
              <circle className="workspace-workload__routine" cx="80" cy="80" r="62" />
              <circle className="workspace-workload__urgent" cx="80" cy="80" r="62" pathLength="100" strokeDasharray={`${urgentShare * 100} 100`} />
            </> : null}
          </svg>
          <div><span>{translate('Open actions')}</span><strong>{openActions ?? '—'}</strong></div>
        </div>
        <dl className="workspace-workload__legend">
          <div><dt><i className="is-urgent" aria-hidden="true" />{translate('Urgent')}</dt><dd>{urgentActions ?? '—'}</dd></div>
          <div><dt><i aria-hidden="true" />{translate('Routine')}</dt><dd>{routineActions ?? '—'}</dd></div>
          <div><dt><CircleAlert size={14} aria-hidden="true" />{translate('Open alerts')}</dt><dd>{summary?.counts.open_alerts ?? openAlertsCount}</dd></div>
        </dl>
      </section>

      <aside className="workspace-home__aside">
        <section className="workspace-shortcuts">
          <div className="section-heading"><h3>{translate('Start here')}</h3></div>
          <div className="workspace-shortcuts__list">
            {quickTargets.slice(0, 6).map((item) => (
              <button type="button" key={item.path} onClick={() => onNavigate(item.path)} title={translate(item.caption)}>
                <span className="workspace-shortcut-icon" aria-hidden="true">{shortcutIcon(item.title)}</span>
                <span><strong>{translate(item.title)}</strong></span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
        <section className="workspace-context" aria-label={translate('Current workspace context')}>
          <h3>{translate('Your workspace')}</h3>
          <dl>
            <div><dt>{translate('Role')}</dt><dd>{translate(role)}</dd></div>
            <div><dt>{translate('Scope')}</dt><dd>{translate(scopeLabel)}</dd></div>
          </dl>
        </section>
      </aside>

      <section className="workspace-schedule" aria-labelledby="workspace-schedule-title">
        <div className="section-heading"><h3 id="workspace-schedule-title">{translate('Upcoming')}</h3><CalendarDays size={17} aria-hidden="true" /></div>
        <div className="workspace-schedule__list">
          {upcoming.map((item) => <article key={item.id}><span className="workspace-schedule__icon" aria-hidden="true"><BookOpen size={16} /></span><div><strong>{item.title}</strong><span>{formatDate(item.starts_at)}</span></div></article>)}
          {upcoming.length === 0 ? <div className="workspace-empty-state"><CalendarDays size={20} aria-hidden="true" /><p>{translate(educationOS ? 'No upcoming events' : 'Schedule is unavailable. Refresh to try again.')}</p></div> : null}
        </div>
      </section>

        <section className="attention-ledger" aria-labelledby="attention-ledger-title">
          <div className="section-heading">
            <div>
              <h3 id="attention-ledger-title">{translate(copy.queue)}</h3>
            </div>
            <span className="ledger-count">{actionQueue.length} {translate("open")}</span>
          </div>

          <div className="attention-ledger__labels" aria-hidden="true"><span>{translate('Task')}</span><span>{translate('Due')}</span><span>{translate('Priority')}</span><span /></div>
          <div className="attention-ledger__list">
            {actionQueue.map((item) => (
              <article className="attention-item" key={item.id}>
                <div className="attention-item__copy">
                  <strong>{item.title}</strong>
                  <p>{item.description || item.recommended_action}</p>
                </div>
                <span className="attention-due">{item.due_at ? formatDate(item.due_at) : '—'}</span>
                <span className={`attention-priority attention-priority--${item.priority}`}>{translate(priorityLabel(item.priority))}</span>
                <button className="small-btn" type="button" onClick={() => onOpenAction(item)}>
                  {translate("Open")}{' '}<ArrowRight size={15} aria-hidden="true" />
                </button>
              </article>
            ))}
            {actionQueue.length === 0 ? (
              <div className="workspace-empty-state">
                <CheckCircle2 size={22} aria-hidden="true" />
                <div>
                  <strong>{translate(educationOS ? 'No open work in this queue' : 'Tasks are unavailable. Refresh to try again.')}</strong>
                  <p>{translate('New role-relevant actions will appear here when they need attention.')}</p>
                </div>
              </div>
            ) : null}
          </div>
        </section>

      <section className="workspace-deadlines" aria-labelledby="workspace-deadlines-title">
        <div className="section-heading"><h3 id="workspace-deadlines-title">{translate('Deadlines')}</h3><Clock3 size={17} aria-hidden="true" /></div>
        {deadlines.map((item) => <button key={item.id} type="button" onClick={() => onOpenAction(item)}><span className="workspace-deadline-dot" aria-hidden="true" /><span><strong>{item.title}</strong><small>{formatDate(item.due_at)}</small></span><ArrowRight size={14} aria-hidden="true" /></button>)}
        {deadlines.length === 0 ? <p className="workspace-deadlines__empty">{translate(educationOS ? 'No dated tasks' : 'Tasks are unavailable. Refresh to try again.')}</p> : null}
      </section>
    </section>
  );
};
