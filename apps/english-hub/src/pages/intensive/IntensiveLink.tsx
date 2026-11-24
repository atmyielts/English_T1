import { Link } from 'react-router-dom';
import { useT } from '../../i18n';
import type { CefrLevel, SkillKey } from '../../lib/skills';
import { useResource } from '../../lib/useResource';
import { Panel } from '../../ui/kit';
import { getIntensiveAvailability } from './api';

export const IntensiveLink = ({ skill, level }: { skill?: SkillKey; level?: CefrLevel | null }) => {
  const t = useT();
  const availability = useResource(getIntensiveAvailability, []);
  const params = new URLSearchParams();
  if (skill) params.set('skill', skill);
  if (level) params.set('level', level);
  if (!availability.data?.ready) return null;
  return (
    <Panel title={t('intensive.title')} aside={<Link className="en-button-quiet" to={params.size ? `/intensive?${params}` : '/intensive'}>
      {t('intensive.open')}
    </Link>}>
      <p>{t('intensive.teaser')}</p>
    </Panel>
  );
};
