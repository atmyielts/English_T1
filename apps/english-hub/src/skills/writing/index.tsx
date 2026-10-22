import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useEnglish } from '../../app/EnglishContext';
import { useT } from '../../i18n';
import { SkillHome } from '../SkillHome';
import { WritingTask } from './Task';
import './writing.css';

const EssayGraderCard = lazy(() => import('../../components/AIIter3Cards').then((m) => ({ default: m.EssayGraderCard })));
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
            tools={[
              { id: 'grader', title: t('writing.tool.grader'), hint: t('writing.tool.graderHint'), render: () => <EssayGraderCard accessToken={accessToken} /> },
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
