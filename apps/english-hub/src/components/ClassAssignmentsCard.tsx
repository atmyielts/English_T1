import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import { daysUntil, getMyAssignments, type LearnerAssignment } from '../lib/classes';
import { useResource } from '../lib/useResource';
import { LevelBadge, SkillDot, Tag } from '../ui/kit';
import '../classes.css';

/** "Due today", "Due in 3 days", "Overdue", or "Done". */
export const DueText = ({ assignment }: { assignment: Pick<LearnerAssignment, 'due_date' | 'state'> }) => {
  const t = useT();
  if (assignment.state === 'done') return <>{t('classes.state.done')}</>;
  const days = daysUntil(assignment.due_date);
  if (days < 0) return <>{t('classes.due.overdue')}</>;
  if (days === 0) return <>{t('classes.due.today')}</>;
  if (days === 1) return <>{t('classes.due.tomorrow')}</>;
  return <>{t('classes.due.inDays', { count: days })}</>;
};

/** One assignment for the learner: what, which class, due when, how far along; opens the right page. */
export const AssignmentItem = ({ assignment, showClass = true }: { assignment: LearnerAssignment; showClass?: boolean }) => {
  const t = useT();
  const done = assignment.state === 'done';
  const body = (
    <>
      <span className={`en-check ${done ? 'is-done' : ''}`.trim()} aria-hidden="true">{done ? '✓' : ''}</span>
      <span className="en-item-main">
        <span className="en-row" style={{ gap: '.4rem' }}>
          {assignment.skill ? <SkillDot skill={assignment.skill} /> : null}
          <small className="en-class-meta">
            {showClass ? `${assignment.class_name} · ` : ''}<DueText assignment={assignment} />
          </small>
        </span>
        <strong>{assignment.label}</strong>
        <span>
          {assignment.required > 1 ? t('classes.progress', { done: assignment.done, required: assignment.required }) : null}
          {assignment.note ? `${assignment.required > 1 ? ' · ' : ''}${assignment.note}` : null}
        </span>
      </span>
      <span className="en-item-meta">
        {assignment.level ? <LevelBadge level={assignment.level} muted /> : null}
        {assignment.state === 'overdue' ? <span className="en-tag is-warn">{t('classes.state.overdue')}</span> : null}
        {!done && assignment.href ? <span className="en-button-quiet">{t('classes.open')}</span> : null}
      </span>
    </>
  );
  return (
    <li>
      {!done && assignment.href
        ? <Link className="en-item" to={assignment.href}>{body}</Link>
        : <div className={`en-item ${done ? 'is-done' : ''}`.trim()}>{body}</div>}
    </li>
  );
};

/** Today: work set by the learner's teachers. Shows nothing when there is none. */
export const ClassAssignmentsCard = () => {
  const t = useT();
  const { locale } = useI18n();
  const { onboarding } = useEnglish();
  const placed = onboarding.value?.placementDone ?? false;
  const mine = useResource((signal) => getMyAssignments(locale, signal), [locale], placed);
  const list = mine.data?.assignments ?? [];
  if (!mine.data?.enabled || !list.length) return null;
  return (
    <section className="en-panel en-class-today" aria-labelledby="class-today-title">
      <div className="en-panel-head">
        <h2 id="class-today-title">{t('classes.today.title')}</h2>
        <Tag>{t('classes.today.count', { count: list.length })}</Tag>
      </div>
      <ul className="en-list">
        {list.slice(0, 3).map((assignment) => <AssignmentItem key={assignment.id} assignment={assignment} />)}
      </ul>
      <div className="en-actions">
        <Link className="en-button-quiet" to="/classes">{t('classes.today.all')}</Link>
      </div>
    </section>
  );
};
