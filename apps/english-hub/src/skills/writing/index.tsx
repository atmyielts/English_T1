import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { SkillHome } from '../SkillHome';
import { WritingTask } from './Task';
import { RubricHistory } from './Depth';
import './writing.css';

// "Check any text" uses the writing-task engine (writing-workbench /free/check). The older
// EssayGraderCard (hub /ai/essay-grade) stays in AIIter3Cards for reference but is no longer mounted.
const FreeCheckCard = lazy(() => import('./FreeCheck').then((m) => ({ default: m.FreeCheckCard })));
const TranslationCompareCard = lazy(() => import('../../components/AIIter3Cards').then((m) => ({ default: m.TranslationCompareCard })));
const RubricCalibrationCard = lazy(() => import('../../components/AIIter5Cards').then((m) => ({ default: m.RubricCalibrationCard })));

const WritingApp = () => {
  const t = useT();
  const { accessToken } = useEnglish();
  return (
    <Routes>
      <Route
        index
        element={(
          <SkillHome
            skill="writing"
            extra={<RubricHistory />}
            tools={[
              { id: 'grader', title: t('writing.tool.grader'), hint: t('writing.tool.graderHint'), render: () => <FreeCheckCard /> },
              { id: 'rubric', title: t('writing.tool.rubric'), hint: t('writing.tool.rubricHint'), render: () => <RubricCalibrationCard accessToken={accessToken} /> },
              { id: 'translate', title: t('writing.tool.translate'), hint: t('writing.tool.translateHint'), render: () => <TranslationCompareCard accessToken={accessToken} /> },
            ]}
          />
        )}
      />
      <Route path=":slug" element={<WritingTask />} />
    </Routes>
  );
};

export default WritingApp;
