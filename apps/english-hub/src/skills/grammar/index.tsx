import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { SkillHome } from '../SkillHome';
import { HandbookTeaser } from './HandbookTeaser';
import { GrammarLesson } from './Lesson';

const GrammarHandbook = lazy(() => import('./Handbook').then((m) => ({ default: m.GrammarHandbook })));
const GrammarDecoderCard = lazy(() => import('../../components/AIFeatureCards').then((m) => ({ default: m.GrammarDecoderCard })));

const GrammarApp = () => {
  const t = useT();
  const { accessToken } = useEnglish();
  return (
    <Routes>
      <Route
        index
        element={(
          <SkillHome
            skill="grammar"
            extra={<HandbookTeaser />}
            tools={[{ id: 'decoder', title: t('grammar.tool.decoder'), hint: t('grammar.tool.decoderHint'), render: () => <GrammarDecoderCard accessToken={accessToken} /> }]}
          />
        )}
      />
      <Route path="handbook" element={<GrammarHandbook />} />
      <Route path=":slug" element={<GrammarLesson />} />
    </Routes>
  );
};

export default GrammarApp;
