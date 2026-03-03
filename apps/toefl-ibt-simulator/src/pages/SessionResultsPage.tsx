import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { gradeWriting, scoreSession, type ScoreSessionResponse } from '../lib/platformClient';
import { useAccess } from '../lib/useAccess';

const toHalfBand = (value: number): number => Math.round(value * 2) / 2;

export const SessionResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAccess();
  const [data, setData] = useState<ScoreSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [aiEval, setAiEval] = useState<any | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Avoid duplicate automatic grading runs in React StrictMode/dev re-renders.
  const aiRequestedRef = useRef(false);

  useEffect(() => {
    aiRequestedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    const run = async () => {
      if (!sessionId) {
        setError('Missing session id');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setAiError(null);

      try {
        if (!accessToken) return;

        const scored = await scoreSession(accessToken, sessionId);
        setData(scored);

        // Best-effort: load any existing AI evaluation without triggering a new grading run.
        const { data: existingAi } = await supabase
          .from('evaluations')
          .select('id, method, status, result, evaluated_at')
          .eq('session_id', sessionId)
          .eq('method', 'ai')
          .maybeSingle();
        setAiEval(existingAi ?? null);
      } catch (err) {
        console.error(err);
        setError('Unable to load results. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [accessToken, sessionId]);

  const runAiGrading = useCallback(async (force: boolean) => {
    if (!sessionId) return;
    setAiLoading(true);
    setAiError(null);
    try {
      if (!accessToken) return;

      const res = await gradeWriting(accessToken, sessionId, { force });
      setAiEval(res.evaluation ?? null);
    } catch (err) {
      const anyErr = err as any;
      const details = anyErr?.details;
      const detailObj = details && typeof details === 'object' ? (details as Record<string, unknown>) : null;
      const code = detailObj ? String(detailObj.code ?? '') : '';
      const requestId = detailObj && typeof detailObj.request_id === 'string' ? detailObj.request_id : null;
      const reason = detailObj && typeof detailObj.reason === 'string' ? detailObj.reason : null;
      const withRef = (message: string): string => (requestId ? `${message} (ref: ${requestId})` : message);

      if (code === 'no_writing_section' || code === 'no_writing_prompts') {
        // Nothing to grade for this session; keep UI clean.
        setAiError(null);
        setAiEval(null);
        return;
      }

      if (code === 'no_writing_answer') {
        setAiError('No writing response was submitted, so there is nothing to grade.');
        setAiEval(null);
        return;
      }

      if (code === 'ai_not_configured' || code === 'ai_disabled') {
        setAiError(withRef('AI feedback is currently disabled. Ask an admin to enable it.'));
        return;
      }

      if (code === 'ai_limit_reached') {
        setAiError(withRef('Daily AI feedback limit reached. Please try again tomorrow.'));
        return;
      }

      if (code === 'usage_limit_reached') {
        setAiError('Monthly writing feedback limit reached for your plan.');
        return;
      }

      if (reason) {
        setAiError(withRef(`AI feedback failed: ${reason}`));
        return;
      }

      setAiError(withRef('AI feedback is temporarily unavailable. Please try again later.'));
    } finally {
      setAiLoading(false);
    }
  }, [accessToken, sessionId]);

  const result = data?.result;
  const sections = result ? Object.entries(result.sections) : [];
  const hasWriting = Object.values(result?.sections ?? {}).some(
    (s: any) => String((s as any)?.type ?? '').toLowerCase() === 'writing',
  );
  const isCandidate = String((data?.session?.metadata as any)?.exam_mode ?? '') === 'token';
  const isAdminSessionRoute = location.pathname.startsWith('/admin/session/');
  const backPath = isCandidate ? '/' : isAdminSessionRoute ? '/admin/tests' : '/dashboard';

  useEffect(() => {
    if (isCandidate) {
      localStorage.removeItem('toefl:candidate_session');
    }
  }, [isCandidate, sessionId]);

  const ai = (aiEval?.result ?? null) as any;
  const aiTasks = Array.isArray(ai?.tasks) ? (ai.tasks as any[]) : [];
  const aiOverallBand = typeof ai?.overall_band === 'number' ? ai.overall_band : null;

  const sectionStats = sections.map(([sectionId, section]) => ({
    id: sectionId,
    type: String(section.type ?? '').toLowerCase(),
    band: typeof section.band === 'number' ? section.band : null,
  }));
  const sectionTypeSet = new Set(sectionStats.map((section) => section.type));
  const completedCoreSections = ['reading', 'listening', 'writing', 'speaking'].filter((type) => sectionTypeSet.has(type));
  const isPartialCoverage = completedCoreSections.length > 0 && completedCoreSections.length < 4;

  const componentBands: number[] = [];
  for (const section of sectionStats) {
    if ((section.type === 'reading' || section.type === 'listening') && typeof section.band === 'number') {
      componentBands.push(section.band);
    }
  }
  if (typeof aiOverallBand === 'number') componentBands.push(aiOverallBand);

  const objectiveOverallBand = typeof result?.overall_band === 'number' ? result.overall_band : null;
  const objectiveOverallScore = typeof (result as any)?.overall_score === 'number' ? (result as any).overall_score : null;
  const provisionalBand =
    componentBands.length > 0 ? toHalfBand(componentBands.reduce((sum, score) => sum + score, 0) / componentBands.length) : null;

  const summaryValue = objectiveOverallScore ?? objectiveOverallBand ?? aiOverallBand ?? provisionalBand;
  const summaryLabel =
    objectiveOverallScore != null
      ? 'Overall score'
      : objectiveOverallBand != null
        ? 'Overall band'
        : aiOverallBand != null
          ? 'Writing band (AI)'
          : provisionalBand != null
            ? 'Provisional band'
            : 'Result';

  // Auto-trigger writing grading for sessions that include Writing.
  useEffect(() => {
    if (!sessionId) return;
    if (!hasWriting) return;
    if (!result) return;
    if (loading) return;
    if (aiEval) return;
    if (aiLoading) return;
    if (aiRequestedRef.current) return;

    aiRequestedRef.current = true;
    void runAiGrading(false);
  }, [aiEval, aiLoading, hasWriting, loading, result, runAiGrading, sessionId]);

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">Scoring session...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900">Results</h1>
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</div>
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => navigate(backPath, { replace: true })}
              className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium"
            >
              {isCandidate ? 'Back to landing' : 'Back to Dashboard'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-wider uppercase text-emerald-700 mb-2">Results</div>
            <h1 className="text-2xl font-bold text-gray-900">Session Score</h1>
            <p className="text-sm text-gray-500 mt-1">Objective scoring for auto-gradable sections, plus Writing feedback when available.</p>
          </div>
          <button
            onClick={() => navigate(backPath, { replace: true })}
            className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium"
          >
            {isCandidate ? 'Back to landing' : 'Back'}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded-xl p-5">
            <div className="text-xs text-gray-500">{summaryLabel}</div>
            <div className="text-4xl font-bold text-gray-900 mt-1">{summaryValue ?? 'N/A'}</div>
            {summaryValue == null ? (
              <div className="text-xs text-gray-500 mt-2">Score appears after scorable sections or AI writing feedback.</div>
            ) : null}
          </div>
          <div className="border border-gray-200 rounded-xl p-5 md:col-span-2">
            <div className="text-xs text-gray-500">Session</div>
            <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded p-2 mt-2 break-all">
              {result?.session_id}
            </div>
            <div className="text-xs text-gray-500 mt-2">Computed at: {result?.computed_at}</div>
          </div>
        </div>

        {isPartialCoverage ? (
          <div className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Partial attempt detected. Only completed sections are included in this report.
          </div>
        ) : null}

        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900">Section Breakdown</h2>
          <div className="mt-4 overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left p-3 font-semibold">Section</th>
                  <th className="text-left p-3 font-semibold">Raw</th>
                  <th className="text-left p-3 font-semibold">Scaled</th>
                  <th className="text-left p-3 font-semibold">Band</th>
                </tr>
              </thead>
              <tbody>
                {sections.map(([sectionId, s]) => (
                  <tr key={sectionId} className="border-t border-gray-100">
                    <td className="p-3 font-medium text-gray-900">{s.type}</td>
                    <td className="p-3 text-gray-700">
                      {s.raw_score}/{s.max_score}
                    </td>
                    <td className="p-3 text-gray-700">
                      {(s as any).scaled_score_40 ?? (s as any).scaled_score_120 ?? (s as any).scaled_score_800 ?? 'N/A'}
                    </td>
                    <td className="p-3 text-gray-900 font-semibold">
                      {typeof s.band === 'number'
                        ? s.band
                        : String(s.type ?? '').toLowerCase() === 'writing'
                          ? aiOverallBand != null
                            ? `${aiOverallBand} (AI)`
                            : aiLoading
                              ? 'Pending AI'
                              : 'N/A'
                          : 'N/A'}
                    </td>
                  </tr>
                ))}
                {sections.length === 0 ? (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={4}>
                      No section scores found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {hasWriting ? (
          <div className="mt-10 pt-8 border-t border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Writing Feedback</h2>
                <p className="text-sm text-gray-500 mt-1">AI feedback is generated automatically after you finish Writing.</p>
              </div>
              {aiError ? (
                <button
                  onClick={() => runAiGrading(false)}
                  disabled={aiLoading}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:bg-gray-50 font-semibold"
                >
                  {aiLoading ? 'Trying...' : 'Try again'}
                </button>
              ) : null}
            </div>

            {aiLoading && !aiEval ? (
              <div className="mt-4 text-sm text-gray-600">Generating feedback...</div>
            ) : null}

            {aiError ? (
              <div className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">{aiError}</div>
            ) : null}

            {aiEval ? (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="text-xs text-gray-500">AI overall band</div>
                  <div className="text-4xl font-bold text-gray-900 mt-1">{ai?.overall_band ?? 'N/A'}</div>
                </div>
                <div className="border border-gray-200 rounded-xl p-5 md:col-span-2">
                  <div className="text-xs text-gray-500">Evaluated at</div>
                  <div className="text-sm text-gray-900 mt-1">{aiEval?.evaluated_at ?? ''}</div>
                  <div className="text-xs text-gray-500 mt-2">Status: {aiEval?.status ?? ''}</div>
                </div>
              </div>
            ) : (
              <div className="mt-6 text-sm text-gray-600">{aiLoading ? 'Generating feedback...' : 'Feedback will appear here once ready.'}</div>
            )}

            {aiTasks.length > 0 ? (
              <div className="mt-6 space-y-4">
                {aiTasks.map((t) => (
                  <div key={String(t.content_unit_id ?? Math.random())} className="border border-gray-200 rounded-xl p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="text-sm font-semibold text-gray-900">
                        {String(t.task_type ?? '').toLowerCase() === 'task1'
                          ? 'Task 1'
                          : String(t.task_type ?? '').toLowerCase() === 'task2'
                            ? 'Task 2'
                            : 'Task'}
                        {typeof t.word_count === 'number' ? (
                          <span className="ml-2 text-xs text-gray-500">({t.word_count} words)</span>
                        ) : null}
                      </div>
                      <div className="text-sm font-bold text-gray-900">Band {t.band ?? 'N/A'}</div>
                    </div>

                    {typeof t.feedback === 'string' ? (
                      <div className="mt-4 text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-xl p-4">
                        {t.feedback}
                      </div>
                    ) : null}
                  </div>
                ))}
                {typeof ai?.notes === 'string' && ai.notes.trim() ? (
                  <div className="border border-gray-200 rounded-xl p-5 bg-gray-50">
                    <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Overall Notes</div>
                    <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{ai.notes}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};
