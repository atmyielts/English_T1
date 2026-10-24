import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import { Panel } from '../../ui/kit';

/** A short pointer to the grammar handbook, for the Grammar home and the Practice page. */
export const HandbookTeaser = () => {
  const t = useT();
  return (
    <Panel title={t('handbook.teaser.title')}>
      <p>{t('handbook.teaser.body')}</p>
      <div className="en-actions">
        <Link className="en-button-quiet" to="/grammar/handbook">{t('handbook.teaser.cta')}</Link>
      </div>
    </Panel>
  );
};
