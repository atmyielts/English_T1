import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { SkillHome } from '../SkillHome';
import { VocabularyDeckActivity } from './Deck';
import { MyWordsPanel } from './MyWords';
import { VocabularyPractice } from './Practice';
import './vocabulary.css';

const VocabInContextCard = lazy(() => import('../../components/AIFeatureCards').then((m) => ({ default: m.VocabInContextCard })));

const VocabularyApp = () => {
  const t = useT();
  const { accessToken } = useEnglish();
  return (
    <Routes>
      <Route
        index
        element={(
          <SkillHome
            skill="vocabulary"
            extra={<MyWordsPanel />}
            tools={[{ id: 'story', title: t('vocabulary.tool.story'), hint: t('vocabulary.tool.storyHint'), render: () => <VocabInContextCard accessToken={accessToken} /> }]}
          />
        )}
      />
      <Route path="practice" element={<VocabularyPractice />} />
      <Route path=":slug" element={<VocabularyDeckActivity />} />
    </Routes>
  );
};

export default VocabularyApp;
