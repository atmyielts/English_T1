import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { gradeWriting, scoreSession, type ScoreSessionResponse } from '../lib/platformClient';
import { useAccess } from '../lib/useAccess';

const toHalfBand = (value: number): number => Math.round(value * 2) / 2;
const PLAYBOOK_URL = 'https://playbook.ielts.schood.online';
const humanizeSectionType = (value: string): string => {
  const first = value.charAt(0).toUpperCase();
  return first ? `${first}${value.slice(1)}` : value;
};

export const SessionResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { accessToken } = useAccess();
  const search = new URLSearchParams(location.search);
  const backOverride = search.get('back')?.trim() || null;
  const playbookSource = search.get('playbook_source')?.trim() || 'simulator';
  const reviewUrl = search.get('review_url')?.trim() || null;
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
  const backPath = backOverride ?? (isCandidate ? '/' : isAdminSessionRoute ? '/admin/tests' : '/dashboard');

  useEffect(() => {
    if (isCandidate) {
      localStorage.removeItem('ielts:candidate_session');
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
  const weakestSkill =
    sectionStats
      .filter((section) => typeof section.band === 'number')
      .sort((a, b) => Number(a.band ?? 99) - Number(b.band ?? 99))[0]?.type ?? 'writing';
  const sectionTypeSet = new Set(sectionStats.map((section) => section.type));
  const completedCoreSections = ['listening', 'reading', 'writing'].filter((type) => sectionTypeSet.has(type));
  const missingCoreSections = ['listening', 'reading', 'writing'].filter((type) => !sectionTypeSet.has(type));
  const isPartialCoverage = completedCoreSections.length > 0 && missingCoreSections.length > 0;

  const componentBands: number[] = [];
  for (const section of sectionStats) {
    if ((section.type === 'listening' || section.type === 'reading') && typeof section.band === 'number') {
      componentBands.push(section.band);
    }
  }
  if (typeof aiOverallBand === 'number') componentBands.push(aiOverallBand);

  const objectiveOverallBand = typeof result?.overall_band === 'number' ? result.overall_band : null;
  const provisionalBand =
    componentBands.length > 0 ? toHalfBand(componentBands.reduce((sum, score) => sum + score, 0) / componentBands.length) : null;
  const summaryBand = objectiveOverallBand ?? aiOverallBand ?? provisionalBand;
  const summaryBandLabel =
    objectiveOverallBand != null
      ? 'Overall band'
      : aiOverallBand != null
        ? 'Writing band (AI)'
        : provisionalBand != null
          ? 'Provisional band'
          : 'Band estimate';

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
            <p className="text-sm text-gray-500 mt-1">Objective scoring for Reading/Listening, plus Writing feedback when available.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {reviewUrl ? (
              <button
                onClick={() => navigate(reviewUrl)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-gray-900 text-white font-medium"
              >
                Review Answers
              </button>
            ) : null}
            <button
              onClick={() => navigate(backPath, { replace: true })}
              className="w-full sm:w-auto px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium"
            >
              {isCandidate ? 'Back to landing' : 'Back'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded-xl p-5">
            <div className="text-xs text-gray-500">{summaryBandLabel}</div>
            <div className="text-4xl font-bold text-gray-900 mt-1">{summaryBand ?? 'N/A'}</div>
            {summaryBand == null ? (
              <div className="text-xs text-gray-500 mt-2">Band appears after scorable sections or AI writing feedback.</div>
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
            Partial attempt: this result includes{' '}
            <strong>{completedCoreSections.map(humanizeSectionType).join(', ')}</strong>
            . Missing: <strong>{missingCoreSections.map(humanizeSectionType).join(', ')}</strong>.
          </div>
        ) : null}

        <div className="mt-3 text-xs text-gray-500">
          Note: Speaking is not assessed in this simulator yet, so there is no speaking band in this report.
        </div>

        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-wider uppercase text-emerald-800">Next step</div>
            <div className="text-sm text-emerald-900 mt-1">
              Open the IELTS Playbook with this scored session and turn the weakest skill into a study order.
            </div>
          </div>
          <a
            href={`${PLAYBOOK_URL}/diagnostic?source=${encodeURIComponent(playbookSource)}&session_id=${encodeURIComponent(sessionId ?? '')}&overall_band=${encodeURIComponent(String(summaryBand ?? ''))}&weak_skill=${encodeURIComponent(weakestSkill)}`}
            className="px-4 py-2 rounded-lg bg-emerald-700 text-white font-semibold text-center"
          >
            Open playbook
          </a>
        </div>

        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900">Section Breakdown</h2>
          <div className="mt-4 overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left p-3 font-semibold">Section</th>
                  <th className="text-left p-3 font-semibold">Raw</th>
                  <th className="text-left p-3 font-semibold">Scaled/40</th>
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
                    <td className="p-3 text-gray-700">{s.scaled_score_40}</td>
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

                    {t.criteria && typeof t.criteria === 'object' ? (
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        {(() => {
                          const c = t.criteria as any;
                          const num = (v: any): number | null => {
                            const n = typeof v === 'number' ? v : Number(v);
                            return Number.isFinite(n) ? n : null;
                          };
                          const TR = num(c.TR ?? c.task_response ?? c.task_achievement_or_response ?? c.task_achievement);
                          const CC = num(c.CC ?? c.coherence_and_cohesion);
                          const LR = num(c.LR ?? c.lexical_resource);
                          const GRA = num(c.GRA ?? c.grammar_range_and_accuracy);
                          const items: { k: string; v: number | null; label: string }[] = [
                            { k: 'TR', v: TR, label: 'Task Response' },
                            { k: 'CC', v: CC, label: 'Coherence & Cohesion' },
                            { k: 'LR', v: LR, label: 'Lexical Resource' },
                            { k: 'GRA', v: GRA, label: 'Grammar (Range/Accuracy)' },
                          ];
                          return items.map((it) => (
                            <div key={it.k} className="border border-gray-100 rounded-xl p-3 bg-gray-50/60">
                              <div className="text-gray-500">{it.k}</div>
                              <div className="text-gray-900 font-bold text-lg mt-1">{it.v ?? 'N/A'}</div>
                              <div className="text-[11px] text-gray-600 mt-1">{it.label}</div>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                      {Array.isArray(t.strengths) && t.strengths.length > 0 ? (
                        <div className="border border-gray-100 rounded-xl p-4 bg-white">
                          <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Strengths</div>
                          <ul className="mt-2 text-sm text-gray-700 list-disc pl-5 space-y-1">
                            {t.strengths.slice(0, 6).map((s: any, idx: number) => (
                              <li key={idx}>{String(s)}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {Array.isArray(t.improvements) && t.improvements.length > 0 ? (
                        <div className="border border-gray-100 rounded-xl p-4 bg-white">
                          <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Improvements</div>
                          <ul className="mt-2 text-sm text-gray-700 list-disc pl-5 space-y-1">
                            {t.improvements.slice(0, 6).map((s: any, idx: number) => (
                              <li key={idx}>{String(s)}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {Array.isArray((t as any).actionable_feedback) && (t as any).actionable_feedback.length > 0 ? (
                        <div className="border border-gray-100 rounded-xl p-4 bg-white">
                          <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Action Plan</div>
                          <ul className="mt-2 text-sm text-gray-700 list-disc pl-5 space-y-1">
                            {(t as any).actionable_feedback.slice(0, 8).map((s: any, idx: number) => (
                              <li key={idx}>{String(s)}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
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
