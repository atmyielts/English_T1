import { Link } from 'react-router-dom';
import type { PausableService } from '../app/EnglishContext';
import { useT } from '../i18n';

/**
 * Calm notice shown when the owner has paused a skill (or the AI tutor) from
 * the admin control center. Saved work is untouched; review and Today still work.
 */
export const ServicePaused = ({ service }: { service: PausableService }) => {
  const t = useT();
  const name = service === 'tutor' ? t('paused.tutor') : t(`skill.${service}`);
  return (
    <section className="en-panel en-tone-teal" role="status">
      <p className="eyebrow">{t('paused.eyebrow')}</p>
      <h2>{t('paused.title', { service: name })}</h2>
      <p>{t('paused.body')}</p>
      <div className="en-actions">
        <Link className="en-button" to="/today">{t('paused.today')}</Link>
        <Link className="en-button-quiet" to="/review">{t('paused.review')}</Link>
      </div>
    </section>
  );
};
