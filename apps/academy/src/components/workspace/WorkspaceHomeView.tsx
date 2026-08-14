import { formatLocaleLongDate, translate } from '../../i18n';
import { ArrowRight, CalendarDays, CheckCircle2, CircleAlert, Clock3 } from 'lucide-react';
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
  const actionQueue = (educationOS?.action_queue ?? []).filter((item) => item.status === 'open').slice(0, 7);
  const todayLabel = formatLocaleLongDate(new Date());
  const pulse = [
    { label: intent === 'teacher' ? 'My students' : 'Contacts', value: summary?.counts.contacts ?? contactsCount },
    { label: intent === 'teacher' ? 'My classrooms' : 'Classrooms', value: summary?.counts.classrooms ?? classroomsCount },
    { label: 'Open actions', value: educationOS?.stats.open_actions ?? actionQueue.length },
    { label: 'Urgent', value: educationOS?.stats.urgent_actions ?? 0 },
    { label: 'Open alerts', value: summary?.counts.open_alerts ?? openAlertsCount },
  ];

  return (
    <section className="workspace-home" aria-labelledby="workspace-home-title">
      <header className={`workspace-home__hero workspace-home__hero--${intent}`}>
        <div>
          <span className="eyebrow">{translate(copy.eyebrow)}</span>
          <h2 id="workspace-home-title">{translate(copy.title)}</h2>
          <p>{translate(copy.description)}</p>
        </div>
        <div className="workspace-date" aria-label={translate("Today is {date}", { date: todayLabel })}>
          <CalendarDays size={18} aria-hidden="true" />
          <span>{translate("Today")}</span>
          <strong>{todayLabel}</strong>
        </div>
      </header>

      <dl className="workspace-pulse" aria-label={translate("Workspace status")}>
        {pulse.map((item) => (
          <div key={item.label}>
            <dt>{translate(item.label)}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="workspace-home__grid">
        <section className="attention-ledger" aria-labelledby="attention-ledger-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{translate("Action first")}</span>
              <h3 id="attention-ledger-title">{translate(copy.queue)}</h3>
            </div>
            <span className="ledger-count">{actionQueue.length} {translate("open")}</span>
          </div>

          <div className="attention-ledger__list">
            {actionQueue.map((item) => (
              <article className="attention-item" key={item.id}>
                <span className={`attention-priority attention-priority--${item.priority}`}>
                  <CircleAlert size={15} aria-hidden="true" />
                  {translate(priorityLabel(item.priority))}
                </span>
                <div className="attention-item__copy">
                  <strong>{item.title}</strong>
                  <p>{item.description || item.recommended_action}</p>
                  {item.due_at ? (
                    <span className="attention-due"><Clock3 size={14} aria-hidden="true" /> {translate("Due")}{' '}{formatDate(item.due_at)}</span>
                  ) : null}
                </div>
                <button className="small-btn" type="button" onClick={() => onOpenAction(item)}>
                  {translate("Open")}{' '}<ArrowRight size={15} aria-hidden="true" />
                </button>
              </article>
            ))}
            {actionQueue.length === 0 ? (
              <div className="workspace-empty-state">
                <CheckCircle2 size={22} aria-hidden="true" />
                <div>
                  <strong>{translate("No open work in this queue")}</strong>
                  <p>{translate("New role-relevant actions will appear here when they need attention.")}</p>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="workspace-home__aside">
          <section className="workspace-shortcuts">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Direct routes")}</span>
                <h3>{translate("Start here")}</h3>
              </div>
            </div>
            <div className="workspace-shortcuts__list">
              {quickTargets.slice(0, 6).map((item) => (
                <button type="button" key={item.path} onClick={() => onNavigate(item.path)}>
                  <span>
                    <strong>{translate(item.title)}</strong>
                    <small>{translate(item.caption)}</small>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          <section className="workspace-context" aria-label={translate("Current workspace context")}>
            <span className="eyebrow">{translate("Current context")}</span>
            <strong>{academyName || translate('Academy')}</strong>
            <dl>
              <div><dt>{translate("Role")}</dt><dd>{translate(role)}</dd></div>
              <div><dt>{translate("Scope")}</dt><dd>{translate(scopeLabel)}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </section>
  );
};
