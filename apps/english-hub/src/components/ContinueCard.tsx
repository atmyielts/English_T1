import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, useT } from '../i18n';
import { clearResume, getResume, type ResumeItem } from '../lib/glue';
import { useResource } from '../lib/useResource';
import { ProgressBar, SkillDot } from '../ui/kit';
import './glue.css';

const MAX_SHOWN = 3;

const itemTitle = (item: ResumeItem, t: ReturnType<typeof useT>): string =>
  item.kind === 'mock' ? t('glue.resume.mock') : item.title ?? t(`skill.${item.skill}`);

const itemNote = (item: ResumeItem, t: ReturnType<typeof useT>): string | null => {
  if (item.kind === 'roleplay') return t('glue.resume.roleplay');
  if (item.kind === 'mock') return t('glue.resume.mockNote');
  if (item.words) return t('glue.resume.words', { count: item.words });
  if (item.progress !== null) return t('glue.resume.progress', { progress: item.progress });
  return null;
};

/**
 * "Continue": what the learner started on any device (this browser, the
 * installed app, a phone) and has not finished. Top of Today. Renders
 * nothing when there is nothing to continue.
 */
export const ContinueCard = () => {
  const t = useT();
  const { locale, date } = useI18n();
  const resume = useResource((signal) => getResume(locale, signal), [locale]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const items = (resume.data?.items ?? []).filter((item) => !hidden.has(item.href)).slice(0, MAX_SHOWN);
  if (!items.length) return null;

  const dismiss = (item: ResumeItem) => {
    setHidden(new Set([...hidden, item.href]));
    if (item.kind === 'activity') void clearResume(item.skill, item.ref);
  };

  return (
    <section className="en-panel en-continue" aria-labelledby="en-continue-title">
      <div className="en-panel-head">
        <h2 id="en-continue-title">{t('glue.resume.title')}</h2>
        <span className="hint">{t('glue.resume.anywhere')}</span>
      </div>
      <ul className="en-continue-list">
        {items.map((item, index) => {
          const note = itemNote(item, t);
          return (
            <li key={item.href} className={`en-continue-item is-${item.skill}`}>
              <Link to={item.href} className="en-continue-main">
                <span className="en-row" style={{ gap: '.4rem' }}>
                  <SkillDot skill={item.skill} />
                  <small>{t(`skill.${item.skill}`)} · {date(item.updated_at, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</small>
                </span>
                <strong>{itemTitle(item, t)}</strong>
                {note ? <span>{note}</span> : null}
                {item.progress !== null ? <ProgressBar value={item.progress} label={t('glue.resume.progressLabel')} skill={item.skill} /> : null}
              </Link>
              <span className="en-continue-actions">
                <Link className={index === 0 ? 'en-button' : 'en-button-quiet'} to={item.href}>{t('glue.resume.cta')}</Link>
                {item.kind === 'activity' ? (
                  <button type="button" className="quiet en-continue-dismiss" onClick={() => dismiss(item)} aria-label={t('glue.resume.dismissLabel', { title: itemTitle(item, t) })}>
                    {t('glue.resume.dismiss')}
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
