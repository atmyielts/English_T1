import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { SkillHome } from '../SkillHome';
import { ListeningActivity } from './Activity';
import './listening.css';

const DictationDrillCard = lazy(() => import('../../components/AIIter4Cards').then((m) => ({ default: m.DictationDrillCard })));
const ShadowingPracticeCard = lazy(() => import('../../components/AIIter6Cards').then((m) => ({ default: m.ShadowingPracticeCard })));

const ListeningApp = () => {
  const t = useT();
  const { accessToken } = useEnglish();
  return (
    <Routes>
      <Route
        index
        element={(
          <SkillHome
            skill="listening"
            tools={[
              {
                id: 'dictation',
                title: t('listening.tool.dictation'),
                hint: t('listening.tool.dictationHint'),
                render: () => <DictationDrillCard accessToken={accessToken} />,
              },
              {
                id: 'shadowing',
                title: t('listening.tool.shadowing'),
                hint: t('listening.tool.shadowingHint'),
                render: () => <ShadowingPracticeCard accessToken={accessToken} />,
              },
            ]}
          />
        )}
      />
      <Route path=":slug" element={<ListeningActivity />} />
    </Routes>
  );
};

export default ListeningApp;
