import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { getCompetencies } from '../lib/mastery';
import { useResource } from '../lib/useResource';
import { Panel } from '../ui/kit';

export const GrammarCheckLink = () => {
  const t = useT();
  const { access, isPaused, session } = useEnglish();
  const enabled = access.unlocked.has('grammar') && !isPaused('grammar');
  const checks = useResource(getCompetencies, [session?.user.id], enabled);
  if (!enabled || checks.loading || checks.error || !checks.data?.competencies.length) return null;

  return (
    <Panel title={t('mastery.title')}>
      <p>{t('mastery.lead')}</p>
      <Link className="en-button-quiet" to="/mastery">{t('mastery.open')}</Link>
    </Panel>
  );
};
