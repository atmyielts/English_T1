import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { gradeWriting, scoreSession, type ScoreSessionResponse } from '../lib/platformClient';
import { useAccess } from '../lib/useAccess';
import { Toefl2026Results } from '../features/toefl2026/Toefl2026Results';
import { toefl2026From } from '../features/toefl2026/resultShape';
import { useAppT } from '../i18n';

const asNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const toToeflSectionScore = (ratio: number): number => {
  const safeRatio = clamp(ratio, 0, 1);
  return Math.round(safeRatio * 30);
};

const toToeflScoreFromBand = (bandValue: number): number => {
  const safeBand = clamp(bandValue, 0, 9);
  return Math.round((safeBand / 9) * 30);
};

const formatSectionLabel = (type: string): string =>
  type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());

const writingTaskLabel = (taskType: unknown): string => {
  const type = String(taskType ?? '').trim().toLowerCase();
  if (['integrated', 'integrated_writing', 'task1'].includes(type)) return 'Integrated Writing';
  if (['academic_discussion', 'discussion', 'task2'].includes(type)) return 'Academic Discussion';
  return 'Writing Task';
};

const taskEstimatedScore = (task: any): number | null => {
  const direct = asNumber(task?.writing_score);
  if (direct != null) return clamp(Math.round(direct), 0, 30);
  const band = asNumber(task?.band);
  if (band != null) return toToeflScoreFromBand(band);
  return null;
};

export const SessionResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAccess();
  const t = useAppT();

  const [data, setData] = useState<ScoreSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [aiEval, setAiEval] = useState<any | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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

    void run();
  }, [accessToken, sessionId]);

  const runAiGrading = useCallback(
    async (force: boolean) => {
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
    },
    [accessToken, sessionId],
  );

  const result = data?.result;
  const sections = result ? Object.entries(result.sections) : [];
  const hasWriting = Object.values(result?.sections ?? {}).some((s: any) => String((s as any)?.type ?? '').toLowerCase() === 'writing');
  const isCandidate = String((data?.session?.metadata as any)?.exam_mode ?? '') === 'token';
  const isAdminSessionRoute = location.pathname.startsWith('/admin/session/');
  const backPath = isCandidate ? '/' : isAdminSessionRoute ? '/admin/tests' : '/dashboard';

  useEffect(() => {
    if (isCandidate) localStorage.removeItem('toefl:candidate_session');
  }, [isCandidate, sessionId]);

  const ai = (aiEval?.result ?? null) as any;
  const aiTasks = Array.isArray(ai?.tasks) ? (ai.tasks as any[]) : [];
  const aiWritingScore = (() => {
    const fromScore = asNumber(ai?.writing_score);
    if (fromScore != null) return clamp(Math.round(fromScore), 0, 30);
    const fromBand = asNumber(ai?.overall_band);
    if (fromBand != null) return toToeflScoreFromBand(fromBand);
    return null;
  })();

  const toefl = (result as any)?.toefl ?? null;
  const readingScore = asNumber(toefl?.reading_score);
  const listeningScore = asNumber(toefl?.listening_score);
  const writingScore = asNumber(toefl?.writing_score) ?? aiWritingScore;

  const rlwComposite =
    asNumber(toefl?.rlw_composite_score) ??
    (readingScore != null && listeningScore != null && writingScore != null ? readingScore + listeningScore + writingScore : null);

  const speakingAvailable = Boolean(toefl?.speaking_available === true);
  const speakingNote = speakingAvailable
    ? 'Speaking is enabled for this scoring model.'
    : 'Speaking is intentionally excluded at launch. RLW composite is scored out of 90.';

  const sectionTypeSet = new Set(sections.map(([, section]) => String((section as any)?.type ?? '').toLowerCase()));
  const completedCoreSections = ['reading', 'listening', 'writing'].filter((type) => sectionTypeSet.has(type));
  const isPartialCoverage = completedCoreSections.length > 0 && completedCoreSections.length < 3;

  const sectionRows = sections.map(([sectionId, section]) => {
    const type = String(section.type ?? '').toLowerCase();
    const raw = Number(section.raw_score ?? 0);
    const max = Number(section.max_score ?? 0);
    const scaled40 = asNumber((section as any).scaled_score_40);
    const accuracy = max > 0 ? Math.round((raw / max) * 100) : null;

    let estimatedScore: number | null = null;
    if (type === 'reading') estimatedScore = readingScore ?? (max > 0 ? toToeflSectionScore(raw / max) : null);
    if (type === 'listening') estimatedScore = listeningScore ?? (max > 0 ? toToeflSectionScore(raw / max) : null);
    if (type === 'writing') estimatedScore = writingScore;

    const notes =
      type === 'writing' && estimatedScore == null
        ? aiLoading
          ? 'AI writing estimate in progress'
          : 'Waiting for AI writing estimate'
        : !['reading', 'listening', 'writing'].includes(type)
          ? 'Not included in RLW launch score'
          : max <= 0
            ? 'No auto-scorable items in this section'
            : scaled40 == null
              ? 'Scoring data unavailable'
              : 'Scored';

    return {
      id: sectionId,
      type,
      raw,
      max,
      accuracy,
      estimatedScore,
      notes,
    };
  });

  useEffect(() => {
    if (!sessionId) return;
    if (toefl2026From(data)) return;
    if (!hasWriting) return;
    if (!result) return;
    if (loading) return;
    if (aiEval) return;
    if (aiLoading) return;
    if (aiRequestedRef.current) return;

    aiRequestedRef.current = true;
    void runAiGrading(false);
  }, [aiEval, aiLoading, data, hasWriting, loading, result, runAiGrading, sessionId]);

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

  if (data && sessionId && accessToken && toefl2026From(data)) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Toefl2026Results sessionId={sessionId} accessToken={accessToken} initial={data} backPath={backPath} isCandidate={isCandidate} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-5xl bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-wider uppercase text-emerald-700 mb-2">Results</div>
            <h1 className="text-2xl font-bold text-gray-900">{t('results.legacy_title')}</h1>
            <p className="mt-1 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900" data-testid="legacy-format-badge">{t('format.legacy')}</p>
            <p className="text-sm text-gray-500 mt-1">{t('format.legacy_note')}</p>
            <p className="text-sm text-gray-500 mt-1">Estimated TOEFL iBT scoring for Reading, Listening, and Writing (RLW).</p>
          </div>
          <button
            onClick={() => navigate(backPath, { replace: true })}
            className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium"
          >
            {isCandidate ? 'Back to landing' : 'Back'}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="border border-gray-200 rounded-xl p-5">
            <div className="text-xs text-gray-500">Estimated RLW Composite</div>
            <div className="text-4xl font-bold text-gray-900 mt-1">{rlwComposite != null ? `${rlwComposite}/90` : 'Pending'}</div>
            {rlwComposite == null ? (
              <div className="text-xs text-gray-500 mt-2">Complete Reading and Listening, then finish Writing AI feedback.</div>
            ) : null}
          </div>
          <div className="border border-gray-200 rounded-xl p-5">
            <div className="text-xs text-gray-500">Reading</div>
            <div className="text-4xl font-bold text-gray-900 mt-1">{readingScore != null ? `${readingScore}/30` : 'N/A'}</div>
          </div>
          <div className="border border-gray-200 rounded-xl p-5">
            <div className="text-xs text-gray-500">Listening</div>
            <div className="text-4xl font-bold text-gray-900 mt-1">{listeningScore != null ? `${listeningScore}/30` : 'N/A'}</div>
          </div>
          <div className="border border-gray-200 rounded-xl p-5">
            <div className="text-xs text-gray-500">Writing</div>
            <div className="text-4xl font-bold text-gray-900 mt-1">{writingScore != null ? `${writingScore}/30` : aiLoading ? '...' : 'Pending'}</div>
          </div>
        </div>

        <div className="mt-4 border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm text-amber-900">
          Estimated scores are practice indicators, not official ETS TOEFL scores. {speakingNote}
        </div>

        <div className="mt-4 border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500">Session</div>
          <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded p-2 mt-2 break-all">{result?.session_id}</div>
          <div className="text-xs text-gray-500 mt-2">Computed at: {result?.computed_at}</div>
        </div>

        {isPartialCoverage ? (
          <div className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Partial attempt detected. This report only includes completed sections.
          </div>
        ) : null}

        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900">Section Breakdown</h2>
          <div className="mt-4 overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left p-3 font-semibold">Section</th>
                  <th className="text-left p-3 font-semibold">Correct</th>
                  <th className="text-left p-3 font-semibold">Accuracy</th>
                  <th className="text-left p-3 font-semibold">Estimated Score</th>
                  <th className="text-left p-3 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {sectionRows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="p-3 font-medium text-gray-900">{formatSectionLabel(row.type)}</td>
                    <td className="p-3 text-gray-700">{row.max > 0 ? `${row.raw}/${row.max}` : 'N/A'}</td>
                    <td className="p-3 text-gray-700">{row.accuracy != null ? `${row.accuracy}%` : 'N/A'}</td>
                    <td className="p-3 text-gray-900 font-semibold">{row.estimatedScore != null ? `${row.estimatedScore}/30` : 'Pending'}</td>
                    <td className="p-3 text-gray-600">{row.notes}</td>
                  </tr>
                ))}
                {sectionRows.length === 0 ? (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={5}>
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
                <p className="text-sm text-gray-500 mt-1">AI feedback is generated after your writing responses are submitted.</p>
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

            {aiLoading && !aiEval ? <div className="mt-4 text-sm text-gray-600">Generating feedback...</div> : null}

            {aiError ? (
              <div className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">{aiError}</div>
            ) : null}

            {aiEval ? (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="text-xs text-gray-500">Estimated writing score</div>
                  <div className="text-4xl font-bold text-gray-900 mt-1">{aiWritingScore != null ? `${aiWritingScore}/30` : 'Pending'}</div>
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
                {aiTasks.map((task, index) => (
                  <div key={String(task.content_unit_id ?? index)} className="border border-gray-200 rounded-xl p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="text-sm font-semibold text-gray-900">
                        {writingTaskLabel(task.task_type)}
                        {typeof task.word_count === 'number' ? (
                          <span className="ml-2 text-xs text-gray-500">({task.word_count} words)</span>
                        ) : null}
                      </div>
                      <div className="text-sm font-bold text-gray-900">
                        {taskEstimatedScore(task) != null ? `Estimated ${taskEstimatedScore(task)}/30` : 'Estimate pending'}
                      </div>
                    </div>

                    {typeof task.feedback === 'string' ? (
                      <div className="mt-4 text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-xl p-4">
                        {task.feedback}
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
