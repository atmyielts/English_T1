import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { Panel } from '../ui/kit';

/** Pointer to role-plays and the speaking mock, for Speaking, Practice and Tutor. */
export const PracticeLinks = () => {
  const t = useT();
  return (
    <Panel title={t('practice.links.title')}>
      <p>{t('practice.links.body')}</p>
      <div className="en-actions">
        <Link className="en-button" to="/roleplay">{t('practice.links.roleplay')}</Link>
        <Link className="en-button-quiet" to="/speaking-mock">{t('practice.links.mock')}</Link>
      </div>
    </Panel>
  );
};
