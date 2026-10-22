import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { SkillHome } from '../SkillHome';
import { MissionPlayer } from './Mission';
import './immersion.css';

const ThemedWeekCard = lazy(() => import('../../components/AIIter5Cards').then((m) => ({ default: m.ThemedWeekCard })));
const DailyChallengeCard = lazy(() => import('../../components/AIIter4Cards').then((m) => ({ default: m.DailyChallengeCard })));

const ImmersionApp = () => {
  const t = useT();
  const { accessToken } = useEnglish();
  return (
    <Routes>
      <Route
        index
        element={(
          <SkillHome
            skill="immersion"
            tools={[
              { id: 'week', title: t('immersion.tool.week'), hint: t('immersion.tool.weekHint'), render: () => <ThemedWeekCard accessToken={accessToken} /> },
              { id: 'challenge', title: t('immersion.tool.challenge'), hint: t('immersion.tool.challengeHint'), render: () => <DailyChallengeCard accessToken={accessToken} /> },
            ]}
          />
        )}
      />
      <Route path=":slug" element={<MissionPlayer />} />
    </Routes>
  );
};

export default ImmersionApp;
