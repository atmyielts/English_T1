import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { getCompetencies } from '../lib/mastery';
import { useResource } from '../lib/useResource';
import { Panel } from '../ui/kit';

export const GrammarCheckLink = ({ dueOnly = false }: { dueOnly?: boolean }) => {
  const t = useT();
  const { access, isPaused, session } = useEnglish();
  const enabled = access.unlocked.has('grammar') && !isPaused('grammar');
  const checks = useResource(getCompetencies, [session?.user.id], enabled);
  if (!enabled || checks.loading || checks.error || !checks.data?.competencies.length) return null;

  const due = checks.data.competencies.find((entry) => entry.status === 'retention');
  if (due) {
    return (
      <Panel title={t('mastery.dueTitle')} tone="lime">
        <p lang="en">{due.title}</p>
        <div className="en-actions">
          <Link className="en-button" to={`/mastery/${due.slug}`}>{t('mastery.dueAction')}</Link>
          <Link className="en-button-quiet" to="/mastery">{t('mastery.open')}</Link>
        </div>
      </Panel>
    );
  }
  if (dueOnly) return null;
  return (
    <Panel title={t('mastery.title')}>
      <p>{t('mastery.lead')}</p>
      <Link className="en-button-quiet" to="/mastery">{t('mastery.open')}</Link>
    </Panel>
  );
};
