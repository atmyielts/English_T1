import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PracticeContextSession } from '../lib/api';
import type { PracticeContext } from '../lib/practiceContext';
import { formatPracticeLabel } from '../lib/practiceExperience';
import { sectionLabel, useAppT, useFormat } from '../i18n';

interface Props {
  context: PracticeContext | null;
  session: PracticeContextSession | null;
  onDismiss: () => void;
  /** Extra line, e.g. which lab the plan picked for this focus. */
  note?: string | null;
  /** Show the "start practice" call to action (dashboard); Today starts it itself. */
  showStart?: boolean;
  children?: ReactNode;
}

/** "From your mock on <date>" / "From IELTS Playbook" banner with the focus it brought. */
export const PracticeContextBanner = ({ context, session, onDismiss, note, showStart = false, children }: Props) => {
  const t = useAppT();
  const fmt = useFormat();
  if (!context) return null;

  const origin = session?.taken_at
    ? session.experience_name
      ? t('context.fromNamedMock', { name: session.experience_name, date: fmt.date(session.taken_at) })
      : t('context.fromMock', { date: fmt.date(session.taken_at) })
    : context.source === 'playbook'
      ? t('context.fromPlaybook')
      : context.source === 'simulator'
        ? t('context.fromSimulator')
        : context.source === 'reviews'
          ? t('context.fromReviews')
          : t('context.fromOther');

  const skill = context.skill ? sectionLabel(t, context.skill) : null;
  const typeLabel = context.questionType ? formatPracticeLabel(`question_${context.questionType}`) : null;
  const bands = session?.section_bands ? Object.entries(session.section_bands) : [];
  const startHref = context.skill === 'speaking'
    ? '/speaking'
    : context.skill
      ? `/today?focus_section=${encodeURIComponent(context.skill)}${context.questionType ? `&focus_question_type=${encodeURIComponent(context.questionType)}` : ''}`
      : '/today';

  return (
    <section className="glass context-banner" aria-label={origin} data-testid="practice-context">
      <p className="eyebrow">{origin}</p>
      {skill ? (
        <p><strong>{typeLabel ? t('context.focusType', { skill, type: typeLabel }) : t('context.focus', { skill })}</strong></p>
      ) : null}
      {session && (session.overall_band != null || bands.length > 0) ? (
        <p className="muted">
          {[
            session.overall_band != null ? t('context.overall', { band: fmt.band(session.overall_band) }) : null,
            ...bands.map(([section, band]) => t('context.sectionBand', { section: sectionLabel(t, section), band: fmt.band(band) })),
          ].filter(Boolean).join(' · ')}
        </p>
      ) : null}
      {note ? <p>{note}</p> : null}
      {children}
      <div className="inline-actions">
        {showStart && context.skill ? (
          <Link to={startHref} className="btn solid compact">
            {context.skill === 'speaking' ? t('context.openSpeaking') : t('context.start', { skill: skill ?? '' })}
          </Link>
        ) : null}
        <button type="button" className="btn ghost compact" onClick={onDismiss}>{t('context.dismiss')}</button>
      </div>
    </section>
  );
};

/** Clear empty state when no lab content is published for the learner. */
export const EmptyCatalogueCard = () => {
  const t = useAppT();
  return (
    <article className="glass practice-card empty-catalogue" data-testid="empty-catalogue">
      <h3>{t('empty.title')}</h3>
      <p className="muted">{t('empty.lead')}</p>
      <div className="inline-actions">
        <Link to="/practice/reviews" className="btn ghost compact">{t('empty.reviews')}</Link>
        <Link to="/speaking" className="btn ghost compact">{t('empty.speaking')}</Link>
        <Link to="/generator" className="btn ghost compact">{t('empty.generator')}</Link>
        <Link to="/writing-prep" className="btn ghost compact">{t('empty.writing')}</Link>
      </div>
    </article>
  );
};
