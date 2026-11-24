import { Route, Routes } from 'react-router-dom';
import { useT } from '../../i18n';
import { useResource } from '../../lib/useResource';
import { ErrorState, Panel } from '../../ui/kit';
import { SkillHome } from '../SkillHome';
import { ListeningActivity } from './Activity';
import { getRecordedSlugs } from './api';
import './listening.css';

const ListeningHome = () => {
  const t = useT();
  const recordings = useResource(getRecordedSlugs, []);
  const notice = recordings.error ? <ErrorState error={recordings.error} onRetry={recordings.reload} />
    : recordings.data && !recordings.data.slugs.length ? <Panel title={t('intensive.audioSoon')}><p>{t('intensive.audioSoonBody')}</p></Panel> : null;
  return <SkillHome skill="listening" readyItems={new Set(recordings.data?.slugs ?? [])} extra={notice} />;
};

const ListeningApp = () => (
  <Routes>
    <Route index element={<ListeningHome />} />
    <Route path=":slug" element={<ListeningActivity />} />
  </Routes>
);

export default ListeningApp;
