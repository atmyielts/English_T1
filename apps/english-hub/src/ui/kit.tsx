import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useT } from '../i18n';
import type { CefrLevel, SkillKey } from '../lib/skills';

/** Page title block. One per screen; `actions` sit on the right on wide screens. */
export const PageHeader = ({
  eyebrow,
  title,
  lead,
  actions,
  back,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) => (
  <header className="en-page-header">
    <div className="en-page-header-copy">
      {back ? <Link className="en-back" to={back.to}>← {back.label}</Link> : null}
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {lead ? <p className="en-lead">{lead}</p> : null}
    </div>
    {actions ? <div className="en-actions">{actions}</div> : null}
  </header>
);

/** A titled card. Renders a <section>, which platform.css styles as a panel. */
export const Panel = ({
  title,
  aside,
  children,
  className = '',
  tone,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'lime' | 'teal' | 'navy';
}) => (
  <section className={`en-panel ${tone ? `en-tone-${tone}` : ''} ${className}`.trim()}>
    {title || aside ? (
      <div className="en-panel-head">
        {title ? <h2>{title}</h2> : <span />}
        {aside ? <div className="en-panel-aside">{aside}</div> : null}
      </div>
    ) : null}
    {children}
  </section>
);

export const LevelBadge = ({ level, muted = false }: { level: CefrLevel | string | null | undefined; muted?: boolean }) =>
  level ? <span className={`en-level ${muted ? 'is-muted' : ''}`.trim()}>{level}</span> : null;

export const SkillDot = ({ skill }: { skill: SkillKey }) => <span className={`en-skill-dot is-${skill}`} aria-hidden="true" />;

export const Tag = ({ children }: { children: ReactNode }) => <span className="en-tag">{children}</span>;

export const ProgressBar = ({ value, label, skill }: { value: number; label: string; skill?: SkillKey }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={`en-progress ${skill ? `is-${skill}` : ''}`.trim()} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped}>
      <span style={{ width: `${clamped}%` }} />
    </div>
  );
};

/** Score out of 100 shown as a ring-less big number with a verdict word. */
export const ScoreBadge = ({ score }: { score: number }) => {
  const t = useT();
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const verdict = value >= 85 ? t('score.excellent') : value >= 65 ? t('score.good') : value >= 40 ? t('score.developing') : t('score.needsWork');
  const tone = value >= 85 ? 'great' : value >= 65 ? 'good' : value >= 40 ? 'ok' : 'low';
  return (
    <div className={`en-score is-${tone}`}>
      <strong>{value}</strong>
      <span>/100</span>
      <small>{verdict}</small>
    </div>
  );
};

export const EmptyState = ({ title, body, action }: { title: ReactNode; body?: ReactNode; action?: ReactNode }) => (
  <div className="en-empty">
    <strong>{title}</strong>
    {body ? <p>{body}</p> : null}
    {action ? <div className="en-actions">{action}</div> : null}
  </div>
);

export const Loading = ({ label, lines = 3 }: { label?: string; lines?: number }) => {
  const t = useT();
  return (
    <div className="en-loading" role="status" aria-live="polite">
      <span className="visually-hidden">{label ?? t('common.loading')}</span>
      {Array.from({ length: lines }, (_, index) => <span key={index} className="en-skeleton" style={{ width: `${92 - index * 14}%` }} />)}
    </div>
  );
};

/** Learner-facing error text. Never shows server internals or configuration hints. */
export const useErrorMessage = () => {
  const t = useT();
  return (error: unknown): string => {
    if (error instanceof ApiError) {
      if (error.status === 0) return t('error.offline');
      if (error.status === 401) return t('error.signedOut');
      if (error.status === 403) return t('error.noAccess');
      if (error.status === 404) return t('error.notFound');
      if (error.status === 429) return t('error.rateLimited');
      if (error.status >= 400 && error.status < 500 && error.message && error.message.length < 160) return error.message;
    }
    return t('error.generic');
  };
};

export const ErrorState = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => {
  const t = useT();
  const message = useErrorMessage()(error);
  return (
    <div className="error en-error" role="alert">
      <span>{message}</span>
      {onRetry ? <button type="button" className="quiet" onClick={onRetry}>{t('common.retry')}</button> : null}
    </div>
  );
};

/** Shown in place of a paid activity when the learner has no access to that skill. */
export const LockedPanel = ({ skillName, pricingHref }: { skillName: string; pricingHref: string }) => {
  const t = useT();
  return (
    <section className="en-panel en-locked">
      <p className="eyebrow">{t('locked.eyebrow')}</p>
      <h2>{t('locked.title', { skill: skillName })}</h2>
      <p>{t('locked.body')}</p>
      <div className="en-actions">
        <a className="en-button" href={pricingHref}>{t('locked.cta')}</a>
      </div>
    </section>
  );
};

/** Segmented single-choice control (levels, filters, answer options). */
export const Segmented = <V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: Array<{ value: V; label: ReactNode }>;
  onChange: (value: V) => void;
}) => (
  <div className="en-segmented" role="radiogroup" aria-label={label}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        role="radio"
        aria-checked={option.value === value}
        className={option.value === value ? 'is-on' : 'quiet'}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export const Stat = ({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) => (
  <div className="en-stat">
    <small>{label}</small>
    <strong>{value}</strong>
    {hint ? <span>{hint}</span> : null}
  </div>
);

/** Feedback items after an attempt: what went well, what to fix. */
export const FeedbackList = ({ title, items, tone }: { title: ReactNode; items: ReactNode[]; tone: 'good' | 'fix' }) =>
  items.length ? (
    <div className={`en-feedback is-${tone}`}>
      <h3>{title}</h3>
      <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </div>
  ) : null;

export const formatMinutes = (seconds: number): string => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes}`;
};
