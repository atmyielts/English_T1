import { lazy } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { PracticeLinks } from '../../components/PracticeLinks';
import { SkillHome } from '../SkillHome';
import { SpeakingActivity } from './Activity';
import { Panel } from '../../ui/kit';
import './speaking.css';

const PronunciationDrillCard = lazy(() => import('../../components/AIIter7Cards').then((m) => ({ default: m.PronunciationDrillCard })));
const VoiceConversationCard = lazy(() => import('../../components/AIIter8Cards').then((m) => ({ default: m.VoiceConversationCard })));
const ShadowingPage = lazy(() => import('./Shadowing').then((m) => ({ default: m.ShadowingPage })));

/** Speaking home: the way into Shadowing (free, no AI). */
const ShadowingLink = () => {
  const t = useT();
  return (
    <Panel title={t('shadow.link.title')}>
      <p className="hint" style={{ margin: 0 }}>{t('shadow.link.body')}</p>
      <div className="en-actions">
        <Link className="en-button-quiet" to="/speaking/shadowing">{t('shadow.link.cta')}</Link>
      </div>
    </Panel>
  );
};

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
            extra={<><ShadowingLink /><PracticeLinks /></>}
            tools={[
              { id: 'pronunciation', title: t('speaking.tool.pronunciation'), hint: t('speaking.tool.pronunciationHint'), render: () => <PronunciationDrillCard accessToken={accessToken} /> },
              { id: 'conversation', title: t('speaking.tool.conversation'), hint: t('speaking.tool.conversationHint'), render: () => <VoiceConversationCard accessToken={accessToken} /> },
            ]}
          />
        )}
      />
      <Route path="shadowing" element={<ShadowingPage />} />
      <Route path=":slug" element={<SpeakingActivity />} />
    </Routes>
  );
};

export default SpeakingApp;
