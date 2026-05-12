import { useParams } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { TutorPanel } from '../components/TutorPanel';
import { tutorExplain, tutorSimpler, tutorSimilar, tutorWhyWrong, type TutorResponse } from '../lib/api';
import { useAccess } from '../lib/useAccess';

export const TutorPage = () => {
  const { questionId } = useParams<{ questionId: string }>();
  const { accessToken } = useAccess();

  const load = async (mode: 'explain' | 'simpler' | 'similar' | 'why-wrong'): Promise<TutorResponse> => {
    if (!accessToken || !questionId) return { ok: false, ai_status: 'failed', data: {}, error: 'Missing question' };
    if (mode === 'simpler') return tutorSimpler(accessToken, questionId);
    if (mode === 'similar') return tutorSimilar(accessToken, questionId);
    if (mode === 'why-wrong') return tutorWhyWrong(accessToken, { question_id: questionId });
    return tutorExplain(accessToken, { question_id: questionId });
  };

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">Tutor</p>
            <h1>Repair this SAT question</h1>
          </div>
        </header>
        {questionId ? <TutorPanel questionId={questionId} load={load} /> : <div className="alert error">Missing question id.</div>}
      </main>
    </div>
  );
};
