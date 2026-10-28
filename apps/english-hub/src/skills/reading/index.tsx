import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { SkillHome } from '../SkillHome';
import { ReadingArticle } from './Article';
import { ReadingSpeedPanel } from './SpeedPanel';
import './reading.css';

const ContentRecommendCard = lazy(() => import('../../components/AIIter6Cards').then((m) => ({ default: m.ContentRecommendCard })));
const IdiomExplorerCard = lazy(() => import('../../components/AIIter3Cards').then((m) => ({ default: m.IdiomExplorerCard })));
const CulturalNotesCard = lazy(() => import('../../components/AIIter4Cards').then((m) => ({ default: m.CulturalNotesCard })));

const ReadingApp = () => {
  const t = useT();
  const { accessToken } = useEnglish();
  return (
    <Routes>
      <Route
        index
        element={(
          <SkillHome
            skill="reading"
            extra={<ReadingSpeedPanel />}
            tools={[
              { id: 'recommend', title: t('reading.tool.recommend'), hint: t('reading.tool.recommendHint'), render: () => <ContentRecommendCard accessToken={accessToken} /> },
              { id: 'idioms', title: t('reading.tool.idioms'), hint: t('reading.tool.idiomsHint'), render: () => <IdiomExplorerCard accessToken={accessToken} /> },
              { id: 'culture', title: t('reading.tool.culture'), hint: t('reading.tool.cultureHint'), render: () => <CulturalNotesCard accessToken={accessToken} /> },
            ]}
          />
        )}
      />
      <Route path=":slug" element={<ReadingArticle />} />
    </Routes>
  );
};

export default ReadingApp;
