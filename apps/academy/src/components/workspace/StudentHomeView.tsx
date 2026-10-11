import { translate } from '../../i18n';
import { ArrowRight, Bell, BookOpenCheck, CheckCircle2, MessageSquare } from 'lucide-react';
import type {
  TeacherStudioAlert,
  TeacherStudioAnnouncement,
  TeacherStudioClassroom,
  TeacherStudioMessage,
  TeacherStudioPayment,
} from '../../lib/client';

type StudentHomeViewProps = {
  academyName: string;
  classrooms: TeacherStudioClassroom[];
  announcements: TeacherStudioAnnouncement[];
  messages: TeacherStudioMessage[];
  alerts: TeacherStudioAlert[];
  payments: TeacherStudioPayment[];
  onOpenClassroom: (classroom: TeacherStudioClassroom) => void;
  onNavigate: (view: 'classrooms' | 'messages' | 'alerts' | 'access') => void;
  formatDate: (iso: string | null | undefined) => string;
};

export const StudentHomeView = ({
  academyName,
  classrooms,
  announcements,
  messages,
  alerts,
  payments,
  onOpenClassroom,
  onNavigate,
  formatDate,
}: StudentHomeViewProps) => {
  const openAlerts = alerts.filter((alert) => !alert.resolved);
  const pendingPayments = payments.filter((payment) => !['paid', 'completed', 'refunded'].includes(payment.status.toLowerCase()));
  const nextClassroom = classrooms[0] ?? null;

  return (
    <section className="student-home" aria-labelledby="student-home-title">
      <header className="student-home__hero">
        <div>
          <h2 id="student-home-title">{translate("What will you continue today?")}</h2>
          <p>{academyName || 'Your academy'} {translate("keeps classrooms, updates, and account items together without staff controls.")}</p>
        </div>
        {nextClassroom ? (
          <button className="student-continue" type="button" onClick={() => onOpenClassroom(nextClassroom)}>
            <span>{translate("Continue learning")}</span>
            <strong>{nextClassroom.name}</strong>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      <dl className="workspace-pulse workspace-pulse--student" aria-label={translate("Learning status")}>
        <div><dt>{translate("My classrooms")}</dt><dd>{classrooms.length}</dd></div>
        <div><dt>{translate("Academy updates")}</dt><dd>{announcements.length}</dd></div>
        <div><dt>{translate("Messages")}</dt><dd>{messages.length}</dd></div>
        <div><dt>{translate("Needs attention")}</dt><dd>{openAlerts.length + pendingPayments.length}</dd></div>
      </dl>

      <div className="student-home__grid">
        <section className="student-next-list" aria-labelledby="student-next-title">
          <div className="section-heading">
            <div>
              <h3 id="student-next-title">{translate("Your learning queue")}</h3>
            </div>
          </div>

          {classrooms.slice(0, 4).map((classroom) => (
            <button className="student-next-item" type="button" key={classroom.id} onClick={() => onOpenClassroom(classroom)}>
              <BookOpenCheck size={18} aria-hidden="true" />
              <span>
                <strong>{classroom.name}</strong>
                <small>{classroom.description || 'Open assignments, resources, progress, and classroom updates.'}</small>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ))}

          {openAlerts.slice(0, 2).map((alert) => (
            <button className="student-next-item student-next-item--attention" type="button" key={alert.id} onClick={() => onNavigate('alerts')}>
              <Bell size={18} aria-hidden="true" />
              <span>
                <strong>{alert.type}</strong>
                <small>{alert.message}</small>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ))}

          {classrooms.length === 0 && openAlerts.length === 0 ? (
            <div className="workspace-empty-state">
              <CheckCircle2 size={22} aria-hidden="true" />
              <div>
                <strong>{translate("No learning tasks are waiting")}</strong>
                <p>{translate("Your next classroom or academy action will appear here.")}</p>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="student-home__updates">
          <section>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Latest")}</span>
                <h3>{translate("Academy updates")}</h3>
              </div>
            </div>
            <div className="student-update-list">
              {announcements.slice(0, 4).map((announcement) => (
                <article key={announcement.id}>
                  <strong>{announcement.title}</strong>
                  <p>{announcement.body}</p>
                  <time>{formatDate(announcement.created_at)}</time>
                </article>
              ))}
              {announcements.length === 0 ? <p className="muted small">{translate("No new announcements.")}</p> : null}
            </div>
          </section>

          <button className="student-message-link" type="button" onClick={() => onNavigate('messages')}>
            <MessageSquare size={18} aria-hidden="true" />
            <span><strong>{translate("Messages")}</strong><small>{messages.length} {translate("in your academy timeline")}</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          {pendingPayments.length > 0 ? (
            <button className="student-account-link" type="button" onClick={() => onNavigate('access')}>
              <span><strong>{translate("Tuition needs attention")}</strong><small>{pendingPayments.length} {translate("open item")}{pendingPayments.length === 1 ? '' : 's'}</small></span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ) : null}
        </aside>
      </div>
    </section>
  );
};
