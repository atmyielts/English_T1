import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { PracticeLinks } from '../../components/PracticeLinks';
import { SkillHome } from '../SkillHome';
import { SpeakingActivity } from './Activity';
import './speaking.css';

const PronunciationDrillCard = lazy(() => import('../../components/AIIter7Cards').then((m) => ({ default: m.PronunciationDrillCard })));
const VoiceConversationCard = lazy(() => import('../../components/AIIter8Cards').then((m) => ({ default: m.VoiceConversationCard })));

const SpeakingApp = () => {
  const t = useT();
  const { accessToken } = useEnglish();
  return (
    <Routes>
      <Route
        index
        element={(
          <SkillHome
            skill="speaking"
            extra={<PracticeLinks />}
            tools={[
              { id: 'pronunciation', title: t('speaking.tool.pronunciation'), hint: t('speaking.tool.pronunciationHint'), render: () => <PronunciationDrillCard accessToken={accessToken} /> },
              { id: 'conversation', title: t('speaking.tool.conversation'), hint: t('speaking.tool.conversationHint'), render: () => <VoiceConversationCard accessToken={accessToken} /> },
            ]}
          />
        )}
      />
      <Route path=":slug" element={<SpeakingActivity />} />
    </Routes>
  );
};

export default SpeakingApp;
