import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { gradeWriting, scoreSession, type ScoreSessionResponse } from '../lib/platformClient';
import { getItepCefrBand, getItepComposite, getItepScoreMeaning, getItepSkillScore, getItepVisibleSectionTypes } from '../lib/itepScores';
import { useAccess } from '../lib/useAccess';

type WritingEvaluationRow = {
  id: string;
  method: string;
  status: string;
  result: Record<string, unknown> | null;
  evaluated_at: string;
};

const asNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatSectionLabel = (type: string): string =>
  type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());

const formatCriteriaLabel = (key: string): string =>
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());

const writingTaskLabel = (taskType: unknown): string => {
  const type = String(taskType ?? '').trim().toLowerCase();
  if (['task1', 'short_response', 'note', 'email'].includes(type)) return 'Writing Task 1';
  if (['task2', 'essay', 'opinion', 'independent'].includes(type)) return 'Writing Task 2';
  return 'Writing Task';
};

const pickPreferredWritingEvaluation = (rows: WritingEvaluationRow[]): WritingEvaluationRow | null =>
  rows.find((row) => ['admin', 'manual'].includes(String(row.method ?? '').toLowerCase())) ??
  rows.find((row) => String(row.method ?? '').toLowerCase() === 'ai') ??
  null;

const extractWritingTasks = (evaluation: WritingEvaluationRow | null): Array<Record<string, unknown>> =>
  Array.isArray(evaluation?.result?.tasks)
    ? ((evaluation?.result?.tasks ?? []) as Array<Record<string, unknown>>)
    : [];

const extractWritingScore = (evaluation: WritingEvaluationRow | null): number | null =>
  asNumber(evaluation?.result?.overall_score) ??
  asNumber(evaluation?.result?.writing_score) ??
  asNumber(evaluation?.result?.overall_band);

export const SessionResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAccess();

  const [data, setData] = useState<ScoreSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [writingEval, setWritingEval] = useState<WritingEvaluationRow | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const aiRequestedRef = useRef(false);

  useEffect(() => {
    aiRequestedRef.current = false;
  }, [sessionId]);

  const loadWritingEvaluations = useCallback(async () => {
    if (!sessionId) return null;
    const { data: evaluationRows } = await supabase
      .from('evaluations')
      .select('id, method, status, result, evaluated_at')
      .eq('session_id', sessionId)
      .in('method', ['admin', 'manual', 'ai'])
      .order('evaluated_at', { ascending: false });

    const preferred = pickPreferredWritingEvaluation((evaluationRows ?? []) as WritingEvaluationRow[]);
    setWritingEval(preferred);
    return preferred;
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
        await loadWritingEvaluations();
      } catch (caught) {
        console.error(caught);
        setError('Unable to load results. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [accessToken, loadWritingEvaluations, sessionId]);

  const runAiGrading = useCallback(
    async (force: boolean) => {
      if (!sessionId || !accessToken) return;
      setAiLoading(true);
      setAiError(null);

      try {
        await gradeWriting(accessToken, sessionId, { force });
        await loadWritingEvaluations();
        const rescored = await scoreSession(accessToken, sessionId);
        setData(rescored);
      } catch (caught) {
        const details = (caught as any)?.details;
        const detailObject = details && typeof details === 'object' ? (details as Record<string, unknown>) : null;
        const code = detailObject ? String(detailObject.code ?? '') : '';
        const requestId = detailObject && typeof detailObject.request_id === 'string' ? detailObject.request_id : null;
        const reason = detailObject && typeof detailObject.reason === 'string' ? detailObject.reason : null;
        const withRef = (message: string): string => (requestId ? `${message} (ref: ${requestId})` : message);

        if (code === 'no_writing_section' || code === 'no_writing_prompts') {
          setAiError(null);
          setWritingEval(null);
          return;
        }
        if (code === 'no_writing_answer') {
          setAiError('No writing response was submitted, so there is nothing to grade.');
          setWritingEval(null);
          return;
        }
        if (code === 'ai_not_configured' || code === 'ai_disabled') {
          setAiError(withRef('AI writing feedback is currently disabled. Ask an admin to enable it.'));
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
    [accessToken, loadWritingEvaluations, sessionId],
  );

  const result = data?.result;
  const sections = result ? Object.entries(result.sections) : [];
  const isCandidate = String((data?.session?.metadata as any)?.exam_mode ?? '') === 'token';
  const isAdminSessionRoute = location.pathname.startsWith('/admin/session/');
  const backPath = isCandidate ? '/' : isAdminSessionRoute ? '/admin/tests' : '/dashboard';

  useEffect(() => {
    if (isCandidate) localStorage.removeItem('itep:candidate_session');
  }, [isCandidate, sessionId]);

  const visibleTypes = getItepVisibleSectionTypes(result ?? null);
  const hasWriting = visibleTypes.includes('writing') || sections.some(([, section]) => String(section.type ?? '').toLowerCase() === 'writing');
  const compositeScore = getItepComposite(result ?? null);
  const readingScore = getItepSkillScore(result ?? null, 'reading');
  const listeningScore = getItepSkillScore(result ?? null, 'listening');
  const grammarScore = getItepSkillScore(result ?? null, 'grammar');
  const writingScore = getItepSkillScore(result ?? null, 'writing') ?? extractWritingScore(writingEval);
  const cefrBand = getItepCefrBand(compositeScore);
  const scoreMeaning = getItepScoreMeaning(compositeScore);
  const isPartialCoverage = visibleTypes.length > 0 && visibleTypes.length < 4;

  const sectionRows = sections.map(([sectionId, section]) => {
    const type = String(section.type ?? '').toLowerCase();
    const raw = Number(section.raw_score ?? 0);
    const max = Number(section.max_score ?? 0);
    const accuracy = max > 0 ? Math.round((raw / max) * 100) : null;

    const estimatedScore =
      type === 'reading'
        ? readingScore
        : type === 'listening'
          ? listeningScore
          : type === 'grammar'
            ? grammarScore
            : type === 'writing'
              ? writingScore
              : asNumber((section as any).scaled_score_6) ?? asNumber(section.band);

    const notes =
      type === 'writing' && estimatedScore == null
        ? aiLoading
          ? 'AI writing estimate in progress'
          : 'Waiting for AI or admin writing evaluation'
        : max <= 0 && type !== 'writing'
          ? 'No auto-scorable items in this section'
          : type === 'speaking'
            ? 'Speaking is reserved for a future release'
            : 'Scored';

    return { id: sectionId, type, raw, max, accuracy, estimatedScore, notes };
  });

  useEffect(() => {
    if (!sessionId || !hasWriting || !result || loading || writingEval || aiLoading || aiRequestedRef.current) return;
    aiRequestedRef.current = true;
    void runAiGrading(false);
  }, [aiLoading, hasWriting, loading, result, runAiGrading, sessionId, writingEval]);

  const writingTasks = extractWritingTasks(writingEval);

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
              {isCandidate ? 'Back to landing' : 'Back to dashboard'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-6xl bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold tracking-wider uppercase text-emerald-700 mb-2">Results</div>
            <h1 className="text-2xl font-bold text-gray-900">Session Results</h1>
            <p className="text-sm text-gray-500 mt-1">Estimated iTEP scoring for Reading, Listening, Grammar, and Writing on the 0.0-6.0 scale.</p>
          </div>
          <button
            onClick={() => navigate(backPath, { replace: true })}
            className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium"
          >
            {isCandidate ? 'Back to landing' : 'Back'}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="border border-gray-200 rounded-xl p-5 md:col-span-2">
            <div className="text-xs text-gray-500">Estimated composite</div>
            <div className="text-4xl font-bold text-gray-900 mt-1">{compositeScore != null ? `${compositeScore}/6.0` : 'Pending'}</div>
            <div className="text-sm text-gray-600 mt-2">{cefrBand}</div>
            <div className="text-xs text-gray-500 mt-1">{scoreMeaning}</div>
          </div>
          {[
            { label: 'Reading', value: readingScore },
            { label: 'Listening', value: listeningScore },
            { label: 'Grammar', value: grammarScore },
            { label: 'Writing', value: writingScore },
          ].map((item) => (
            <div key={item.label} className="border border-gray-200 rounded-xl p-5">
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className="text-4xl font-bold text-gray-900 mt-1">{item.value != null ? `${item.value}/6.0` : hasWriting && item.label === 'Writing' && aiLoading ? '...' : 'N/A'}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm text-amber-900">
          Scores here are practice estimates, not official iTEP reports. Speaking is reserved for a future release and is excluded from this report.
        </div>

        <div className="mt-4 border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500">Session</div>
          <div className="font-mono text-xs bg-gray-50 border border-gray-200 rounded p-2 mt-2 break-all">{result?.session_id}</div>
          <div className="text-xs text-gray-500 mt-2">Computed at: {result?.computed_at}</div>
        </div>

        {isPartialCoverage ? (
          <div className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
            This report reflects only the sections included in this session. Composite scoring uses the visible scored sections only.
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
                    <td className="p-3 text-gray-700">{row.max > 0 ? `${row.raw}/${row.max}` : row.type === 'writing' ? 'AI/Admin' : 'N/A'}</td>
                    <td className="p-3 text-gray-700">{row.accuracy != null ? `${row.accuracy}%` : 'N/A'}</td>
                    <td className="p-3 text-gray-900 font-semibold">{row.estimatedScore != null ? `${row.estimatedScore}/6.0` : 'Pending'}</td>
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
                <p className="text-sm text-gray-500 mt-1">Writing uses AI estimation first, and admin or manual review overrides it when available.</p>
              </div>
              {(aiError || !writingEval) ? (
                <button
                  onClick={() => runAiGrading(false)}
                  disabled={aiLoading}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:bg-gray-50 font-semibold"
                >
                  {aiLoading ? 'Trying...' : writingEval ? 'Refresh AI feedback' : 'Generate feedback'}
                </button>
              ) : null}
            </div>

            {aiLoading && !writingEval ? <div className="mt-4 text-sm text-gray-600">Generating feedback...</div> : null}
            {aiError ? <div className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">{aiError}</div> : null}

            {writingEval ? (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="text-xs text-gray-500">Estimated writing score</div>
                  <div className="text-4xl font-bold text-gray-900 mt-1">{writingScore != null ? `${writingScore}/6.0` : 'Pending'}</div>
                </div>
                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="text-xs text-gray-500">Evaluation method</div>
                  <div className="text-lg font-semibold text-gray-900 mt-1">{String(writingEval.method ?? '').toUpperCase()}</div>
                  <div className="text-xs text-gray-500 mt-2">Status: {writingEval.status}</div>
                </div>
                <div className="border border-gray-200 rounded-xl p-5">
                  <div className="text-xs text-gray-500">Evaluated at</div>
                  <div className="text-sm text-gray-900 mt-1">{writingEval.evaluated_at ?? ''}</div>
                </div>
              </div>
            ) : (
              <div className="mt-6 text-sm text-gray-600">{aiLoading ? 'Generating feedback...' : 'Feedback will appear here once ready.'}</div>
            )}

            {writingTasks.length > 0 ? (
              <div className="mt-6 space-y-4">
                {writingTasks.map((task, index) => {
                  const criteria = task.criteria && typeof task.criteria === 'object' ? (task.criteria as Record<string, unknown>) : {};
                  const criteriaEntries = Object.entries(criteria)
                    .map(([key, value]) => ({ key, value: asNumber(value) }))
                    .filter((entry) => entry.value != null) as Array<{ key: string; value: number }>;

                  return (
                    <div key={String(task.content_unit_id ?? index)} className="border border-gray-200 rounded-xl p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="text-sm font-semibold text-gray-900">
                          {writingTaskLabel(task.task_type)}
                          {typeof task.word_count === 'number' ? <span className="ml-2 text-xs text-gray-500">({task.word_count} words)</span> : null}
                        </div>
                        <div className="text-sm font-bold text-gray-900">
                          {asNumber(task.score) != null || asNumber(task.band) != null
                            ? `Estimated ${(asNumber(task.score) ?? asNumber(task.band))?.toFixed(1)}/6.0`
                            : 'Estimate pending'}
                        </div>
                      </div>

                      {criteriaEntries.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {criteriaEntries.map((entry) => (
                            <div key={entry.key} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700">
                              {formatCriteriaLabel(entry.key)}: {entry.value.toFixed(1)}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {typeof task.feedback === 'string' ? (
                        <div className="mt-4 text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-xl p-4">
                          {task.feedback}
                        </div>
                      ) : null}

                      {Array.isArray(task.actionable_feedback) && task.actionable_feedback.length > 0 ? (
                        <div className="mt-4">
                          <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Actionable next steps</div>
                          <div className="mt-2 flex flex-col gap-2">
                            {task.actionable_feedback.map((item, itemIndex) => (
                              <div key={itemIndex} className="text-sm text-gray-700">
                                {String(item)}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {typeof writingEval?.result?.notes === 'string' && String(writingEval.result.notes).trim() ? (
                  <div className="border border-gray-200 rounded-xl p-5 bg-gray-50">
                    <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Overall Notes</div>
                    <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{String(writingEval.result.notes)}</div>
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
