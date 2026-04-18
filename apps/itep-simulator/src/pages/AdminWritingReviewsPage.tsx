import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout';
import { ITEP_PRODUCT_ID } from '../lib/constants';
import {
  adminWritingReviewClear,
  adminWritingReviewDetail,
  adminWritingReviewsList,
  adminWritingReviewUpsert,
  getReviewSession,
  gradeWriting,
  scoreSession,
  type AdminWritingReviewDetail,
  type AdminWritingReviewEvaluation,
  type AdminWritingReviewQueueRow,
  type ReviewSessionResponse,
  type ScoreSessionResponse,
} from '../lib/platformClient';
import { formatItepFamily, formatItepVariant, getItepCefrBand, getItepComposite } from '../lib/itepScores';
import { useAccess } from '../lib/useAccess';

type ReviewTask = {
  contentUnitId: string;
  prompt: string;
  answer: string;
  taskType: string;
  wordCount: number;
  partOrder: number;
};

type ReviewFormTask = ReviewTask & {
  score: string;
  taskCompletion: string;
  organization: string;
  vocabulary: string;
  grammar: string;
  feedback: string;
  actionableFeedback: string;
};

type ReviewFormState = {
  overallScore: string;
  notes: string;
  tasks: ReviewFormTask[];
};

const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
};

const readTextAnswer = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') {
    const text = (value as Record<string, unknown>).text;
    if (typeof text === 'string') return text.trim();
    const answer = (value as Record<string, unknown>).answer;
    if (typeof answer === 'string') return answer.trim();
  }
  return '';
};

const countWords = (text: string): number => {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
};

const inferTaskType = (rawTaskType: unknown, partOrder: number): string => {
  const normalized = String(rawTaskType ?? '').trim().toLowerCase();
  if (normalized) return normalized;
  return partOrder <= 1 ? 'task1' : 'task2';
};

const evaluationResult = (evaluation: AdminWritingReviewEvaluation | null | undefined): Record<string, unknown> =>
  evaluation?.result && !Array.isArray(evaluation.result) ? (evaluation.result as Record<string, unknown>) : {};

const evaluationScore = (evaluation: AdminWritingReviewEvaluation | null | undefined): number | null =>
  asNumber(evaluationResult(evaluation).overall_score) ??
  asNumber(evaluationResult(evaluation).writing_score) ??
  asNumber(evaluationResult(evaluation).overall_band);

const pickPreferredEvaluation = (evaluations: AdminWritingReviewEvaluation[]): AdminWritingReviewEvaluation | null =>
  evaluations.find((row) => ['admin', 'manual'].includes(String(row.method ?? '').toLowerCase())) ??
  evaluations.find((row) => String(row.method ?? '').toLowerCase() === 'ai') ??
  null;

const getCriteriaScore = (criteria: Record<string, unknown> | null | undefined, key: string): number | null =>
  asNumber(criteria?.[key]) ??
  (key === 'task_completion'
    ? asNumber(criteria?.taskCompletion) ?? asNumber(criteria?.task_response) ?? asNumber(criteria?.TR)
    : key === 'organization'
      ? asNumber(criteria?.coherence) ?? asNumber(criteria?.CC)
      : key === 'vocabulary'
        ? asNumber(criteria?.lexical_resource) ?? asNumber(criteria?.LR)
        : asNumber(criteria?.GRA));

const extractWritingTasks = (reviewData: ReviewSessionResponse | null): ReviewTask[] => {
  if (!reviewData) return [];
  const writingSectionIds = new Set(
    reviewData.sections
      .filter((section) => String((section.metadata as any)?.type ?? '').toLowerCase() === 'writing')
      .map((section) => section.id),
  );
  if (writingSectionIds.size === 0) return [];

  const writingUnits = reviewData.units
    .filter((unit) => writingSectionIds.has(unit.section_id))
    .slice()
    .sort((a, b) => {
      const partOrderDiff = Number(a.part_order ?? 0) - Number(b.part_order ?? 0);
      if (partOrderDiff !== 0) return partOrderDiff;
      return Number(a.display_order ?? 0) - Number(b.display_order ?? 0);
    });

  const byPart = new Map<string, typeof writingUnits>();
  for (const unit of writingUnits) {
    const partId = String(unit.part_id ?? '');
    if (!partId) continue;
    const bucket = byPart.get(partId);
    if (bucket) bucket.push(unit);
    else byPart.set(partId, [unit]);
  }

  const tasks: ReviewTask[] = [];
  for (const units of byPart.values()) {
    const questionUnits = units.filter((unit) => unit.type === 'question_text');
    const partOrder = Number(questionUnits[0]?.part_order ?? units[0]?.part_order ?? 0);

    if (questionUnits.length > 0) {
      for (const unit of questionUnits) {
        const prompt = String((unit.data as any)?.prompt ?? '').trim() || 'Write your response.';
        const answer = readTextAnswer(unit.answer);
        tasks.push({
          contentUnitId: unit.id,
          prompt,
          answer,
          taskType: inferTaskType((unit.metadata as any)?.task_type ?? (unit.data as any)?.task_type, Number(unit.part_order ?? partOrder)),
          wordCount: countWords(answer),
          partOrder: Number(unit.part_order ?? partOrder),
        });
      }
      continue;
    }

    const fallbackUnit = units.find((unit) => unit.type === 'instruction');
    if (!fallbackUnit) continue;
    const prompt = String((fallbackUnit.data as any)?.text ?? '').trim() || 'Write your response.';
    const answer = readTextAnswer(fallbackUnit.answer);
    tasks.push({
      contentUnitId: fallbackUnit.id,
      prompt,
      answer,
      taskType: inferTaskType((fallbackUnit.metadata as any)?.task_type ?? (fallbackUnit.data as any)?.task_type, partOrder),
      wordCount: countWords(answer),
      partOrder,
    });
  }

  return tasks.sort((a, b) => a.partOrder - b.partOrder);
};

const buildFormState = (
  detail: AdminWritingReviewDetail | null,
  reviewData: ReviewSessionResponse | null,
): ReviewFormState | null => {
  const promptTasks = extractWritingTasks(reviewData);
  const preferredEvaluation = detail ? pickPreferredEvaluation(detail.evaluations ?? []) : null;
  const preferredResult = evaluationResult(preferredEvaluation);
  const evaluationTasks = Array.isArray(preferredResult.tasks)
    ? (preferredResult.tasks as Array<Record<string, unknown>>)
    : [];

  const evaluationById = new Map<string, Record<string, unknown>>();
  evaluationTasks.forEach((task, index) => {
    const contentUnitId = String(task.content_unit_id ?? promptTasks[index]?.contentUnitId ?? index);
    if (!evaluationById.has(contentUnitId)) evaluationById.set(contentUnitId, task);
  });

  const tasks = promptTasks.map((task, index) => {
    const match = evaluationById.get(task.contentUnitId) ?? evaluationTasks[index] ?? {};
    const criteria = (match.criteria as Record<string, unknown> | undefined) ?? undefined;
    return {
      ...task,
      score: asNumber(match.score ?? match.band)?.toFixed(1) ?? '',
      taskCompletion: asNumber(getCriteriaScore(criteria, 'task_completion'))?.toFixed(1) ?? '',
      organization: asNumber(getCriteriaScore(criteria, 'organization'))?.toFixed(1) ?? '',
      vocabulary: asNumber(getCriteriaScore(criteria, 'vocabulary'))?.toFixed(1) ?? '',
      grammar: asNumber(getCriteriaScore(criteria, 'grammar'))?.toFixed(1) ?? '',
      feedback: typeof match.feedback === 'string' ? match.feedback : '',
      actionableFeedback: Array.isArray(match.actionable_feedback) ? match.actionable_feedback.map(String).join('\n') : '',
    } satisfies ReviewFormTask;
  });

  const taskScores = tasks.map((task) => asNumber(task.score)).filter((value): value is number => value != null);
  const averageScore = taskScores.length > 0 ? taskScores.reduce((sum, value) => sum + value, 0) / taskScores.length : null;

  return {
    overallScore:
      asNumber(preferredResult.overall_score ?? preferredResult.overall_band)?.toFixed(1) ??
      (averageScore != null ? averageScore.toFixed(1) : ''),
    notes: typeof preferredResult.notes === 'string' ? preferredResult.notes : '',
    tasks,
  };
};

const statusChipClass = (status: AdminWritingReviewQueueRow['review_status']): string => {
  if (status === 'overridden') return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
  if (status === 'ai_ready') return 'bg-amber-50 text-amber-900 border border-amber-200';
  return 'bg-gray-100 text-gray-700 border border-gray-200';
};

export const AdminWritingReviewsPage: React.FC = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess();

  const [rows, setRows] = useState<AdminWritingReviewQueueRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminWritingReviewDetail | null>(null);
  const [reviewData, setReviewData] = useState<ReviewSessionResponse | null>(null);
  const [scoreData, setScoreData] = useState<ScoreSessionResponse | null>(null);
  const [form, setForm] = useState<ReviewFormState | null>(null);

  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [familyFilter, setFamilyFilter] = useState('all');
  const [variantFilter, setVariantFilter] = useState('all');
  const [reviewStatusFilter, setReviewStatusFilter] = useState('all');
  const [query, setQuery] = useState('');

  const loadQueue = useCallback(async () => {
    if (!accessToken) return;
    setListLoading(true);
    setListError(null);

    try {
      const result = await adminWritingReviewsList(accessToken, {
        family: familyFilter,
        variant: variantFilter,
        reviewStatus: reviewStatusFilter,
        q: query.trim() || null,
        limit: 150,
      });
      const nextRows = result.rows ?? [];
      setRows(nextRows);
      setSelectedSessionId((current) => {
        if (current && nextRows.some((row) => row.session_id === current)) return current;
        return nextRows[0]?.session_id ?? null;
      });
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Failed to load writing review queue.');
      setRows([]);
      setSelectedSessionId(null);
    } finally {
      setListLoading(false);
    }
  }, [accessToken, familyFilter, query, reviewStatusFilter, variantFilter]);

  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!accessToken) return;
      setDetailLoading(true);
      setDetailError(null);

      try {
        const [detailResult, reviewResult, scoreResult] = await Promise.all([
          adminWritingReviewDetail(accessToken, sessionId),
          getReviewSession(accessToken, sessionId, undefined, ITEP_PRODUCT_ID),
          scoreSession(accessToken, sessionId),
        ]);
        setDetail(detailResult);
        setReviewData(reviewResult);
        setScoreData(scoreResult);
        setForm(buildFormState(detailResult, reviewResult));
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : 'Failed to load review details.');
        setDetail(null);
        setReviewData(null);
        setScoreData(null);
        setForm(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null);
      setReviewData(null);
      setScoreData(null);
      setForm(null);
      return;
    }
    void loadSession(selectedSessionId);
  }, [loadSession, selectedSessionId]);

  const queueCounts = useMemo(
    () => ({
      total: rows.length,
      awaitingAi: rows.filter((row) => row.review_status === 'awaiting_ai').length,
      aiReady: rows.filter((row) => row.review_status === 'ai_ready').length,
      overridden: rows.filter((row) => row.review_status === 'overridden').length,
    }),
    [rows],
  );

  const currentEvaluation = useMemo(() => (detail ? pickPreferredEvaluation(detail.evaluations ?? []) : null), [detail]);
  const currentComposite = getItepComposite(scoreData?.result ?? null);
  const writingScore = scoreData?.result?.itep?.writing_score ?? evaluationScore(currentEvaluation);
  const writingTasks = useMemo(() => extractWritingTasks(reviewData), [reviewData]);

  const updateTask = (taskIndex: number, patch: Partial<ReviewFormTask>) => {
    setForm((current) => {
      if (!current) return current;
      const nextTasks = current.tasks.map((task, index) => (index === taskIndex ? { ...task, ...patch } : task));
      return { ...current, tasks: nextTasks };
    });
  };

  const saveOverride = async () => {
    if (!accessToken || !selectedSessionId || !form) return;
    const taskPayload = form.tasks.map((task) => ({
      content_unit_id: task.contentUnitId,
      task_type: task.taskType,
      word_count: task.wordCount,
      score: asNumber(task.score),
      feedback: task.feedback.trim() || null,
      actionable_feedback: task.actionableFeedback
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      criteria: {
        task_completion: asNumber(task.taskCompletion),
        organization: asNumber(task.organization),
        vocabulary: asNumber(task.vocabulary),
        grammar: asNumber(task.grammar),
      },
    }));

    const taskScores = taskPayload.map((task) => asNumber(task.score)).filter((value): value is number => value != null);
    const overallScore = asNumber(form.overallScore) ?? (taskScores.length > 0 ? taskScores.reduce((sum, value) => sum + value, 0) / taskScores.length : null);

    if (overallScore == null && taskScores.length === 0) {
      setActionNotice('Add at least one writing score before saving an override.');
      return;
    }

    setSaving(true);
    setActionNotice(null);

    try {
      const result = await adminWritingReviewUpsert(accessToken, {
        session_id: selectedSessionId,
        evaluation: {
          overall_score: overallScore,
          overall_band: overallScore,
          notes: form.notes.trim() || null,
          tasks: taskPayload,
        },
      });

      await Promise.all([loadQueue(), loadSession(selectedSessionId)]);
      setActionNotice(result.score_refresh_warning ?? 'Admin override saved.');
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Failed to save admin override.');
    } finally {
      setSaving(false);
    }
  };

  const clearOverride = async () => {
    if (!accessToken || !selectedSessionId) return;
    if (!window.confirm('Clear the manual override for this writing submission?')) return;

    setSaving(true);
    setActionNotice(null);

    try {
      const result = await adminWritingReviewClear(accessToken, selectedSessionId);
      await Promise.all([loadQueue(), loadSession(selectedSessionId)]);
      setActionNotice(result.score_refresh_warning ?? 'Manual override cleared.');
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Failed to clear admin override.');
    } finally {
      setSaving(false);
    }
  };

  const refreshAi = async () => {
    if (!accessToken || !selectedSessionId) return;
    setAiLoading(true);
    setActionNotice(null);

    try {
      await gradeWriting(accessToken, selectedSessionId, { force: true });
      await Promise.all([loadQueue(), loadSession(selectedSessionId)]);
      setActionNotice('AI feedback refreshed.');
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Failed to refresh AI feedback.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Writing Reviews</h2>
            <p className="text-sm text-gray-500 mt-1">
              Review iTEP writing submissions, refresh AI feedback, and publish manual overrides that flow into the live score report.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadQueue()}
            disabled={listLoading || saving || aiLoading}
            className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
          >
            Refresh Queue
          </button>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Submissions</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{queueCounts.total}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Awaiting AI</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{queueCounts.awaitingAi}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">AI Ready</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{queueCounts.aiReady}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Overridden</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">{queueCounts.overridden}</div>
          </div>
        </div>

        {listError ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{listError}</div> : null}
        {detailError ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{detailError}</div> : null}
        {actionNotice ? <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">{actionNotice}</div> : null}

        <div className="grid grid-cols-1 xl:grid-cols-[420px,minmax(0,1fr)] gap-6">
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Family</div>
                  <select
                    value={familyFilter}
                    onChange={(event) => setFamilyFilter(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="all">All families</option>
                    <option value="academic">Academic</option>
                    <option value="slate">SLATE</option>
                    <option value="business">Business</option>
                  </select>
                </div>
                <div>
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Variant</div>
                  <select
                    value={variantFilter}
                    onChange={(event) => setVariantFilter(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="all">All variants</option>
                    <option value="core">Core</option>
                    <option value="writing_live">Writing Live</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Review status</div>
                  <select
                    value={reviewStatusFilter}
                    onChange={(event) => setReviewStatusFilter(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="all">All statuses</option>
                    <option value="awaiting_ai">Awaiting AI</option>
                    <option value="ai_ready">AI Ready</option>
                    <option value="overridden">Overridden</option>
                  </select>
                </div>
                <div>
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Search</div>
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="candidate, email, session"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">Review Queue</div>
                <div className="text-xs text-gray-500">{listLoading ? 'Loading...' : `${rows.length} shown`}</div>
              </div>

              <div className="max-h-[70dvh] overflow-y-auto divide-y divide-gray-100">
                {rows.map((row) => {
                  const active = row.session_id === selectedSessionId;
                  return (
                    <button
                      key={row.session_id}
                      type="button"
                      onClick={() => setSelectedSessionId(row.session_id)}
                      className={`w-full text-left p-4 transition-colors ${
                        active ? 'bg-amber-50/70' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-gray-900">
                            {row.candidate_name || row.candidate_email || row.user_email || 'Unnamed candidate'}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{row.experience_name}</div>
                        </div>
                        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${statusChipClass(row.review_status)}`}>
                          {row.review_status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                        {row.family ? <span className="rounded-full border border-gray-200 bg-white px-2 py-1">{formatItepFamily(row.family)}</span> : null}
                        {row.variant ? <span className="rounded-full border border-gray-200 bg-white px-2 py-1">{formatItepVariant(row.variant)}</span> : null}
                        <span className="rounded-full border border-gray-200 bg-white px-2 py-1">{row.session_status}</span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-gray-500">Current score</div>
                          <div className="font-semibold text-gray-900">{row.preferred_score != null ? `${row.preferred_score}/6.0` : 'Pending'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Completed</div>
                          <div className="font-medium text-gray-700">{formatDateTime(row.completed_at ?? row.created_at)}</div>
                        </div>
                      </div>

                      <div className="mt-3 text-[11px] text-gray-500 font-mono break-all">{row.session_id}</div>
                    </button>
                  );
                })}

                {!listLoading && rows.length === 0 ? (
                  <div className="p-6 text-sm text-gray-600">No writing submissions match the current filters.</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {!selectedSessionId ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-gray-600">
                Select a writing submission from the queue to start reviewing.
              </div>
            ) : null}

            {selectedSessionId && detailLoading ? (
              <div className="bg-white border border-gray-200 rounded-2xl p-8 text-gray-600">Loading review details...</div>
            ) : null}

            {selectedSessionId && !detailLoading && detail ? (
              <>
                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold tracking-wider uppercase text-amber-700">Selected Submission</div>
                      <h3 className="text-2xl font-bold text-gray-900 mt-1">
                        {detail.candidate.name || detail.candidate.email || detail.candidate.user_email || 'Unnamed candidate'}
                      </h3>
                      <div className="text-sm text-gray-500 mt-2">{detail.experience.name}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/admin/session/${selectedSessionId}/results`, {
                            state: { backPath: '/admin/writing-reviews' },
                          })
                        }
                        className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
                      >
                        Open Results
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/admin/review/${selectedSessionId}`, {
                            state: { backPath: '/admin/writing-reviews' },
                          })
                        }
                        className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
                      >
                        Open Review
                      </button>
                      <button
                        type="button"
                        onClick={() => void refreshAi()}
                        disabled={aiLoading || saving}
                        className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
                      >
                        {aiLoading ? 'Refreshing AI...' : 'Refresh AI'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="border border-gray-200 rounded-xl p-4">
                      <div className="text-xs text-gray-500">Composite</div>
                      <div className="text-3xl font-bold text-gray-900 mt-2">{currentComposite != null ? `${currentComposite}/6.0` : 'Pending'}</div>
                      <div className="text-xs text-gray-500 mt-2">{getItepCefrBand(currentComposite)}</div>
                    </div>
                    <div className="border border-gray-200 rounded-xl p-4">
                      <div className="text-xs text-gray-500">Writing</div>
                      <div className="text-3xl font-bold text-gray-900 mt-2">{writingScore != null ? `${writingScore}/6.0` : 'Pending'}</div>
                      <div className="text-xs text-gray-500 mt-2">Status: {detail.review_status.replace(/_/g, ' ')}</div>
                    </div>
                    <div className="border border-gray-200 rounded-xl p-4">
                      <div className="text-xs text-gray-500">Candidate</div>
                      <div className="text-sm font-semibold text-gray-900 mt-2 break-all">
                        {detail.candidate.email || detail.candidate.user_email || 'No email'}
                      </div>
                      <div className="text-xs text-gray-500 mt-2">Completed: {formatDateTime(detail.session.completed_at)}</div>
                    </div>
                    <div className="border border-gray-200 rounded-xl p-4">
                      <div className="text-xs text-gray-500">Session</div>
                      <div className="text-xs font-mono text-gray-700 mt-2 break-all">{detail.session.id}</div>
                      <div className="text-xs text-gray-500 mt-2">
                        {detail.family ? formatItepFamily(detail.family) : 'General'} / {detail.variant ? formatItepVariant(detail.variant) : 'Standard'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {(detail.evaluations ?? []).map((evaluation) => (
                      <div key={evaluation.id} className="border border-gray-200 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-gray-900">{String(evaluation.method).toUpperCase()}</div>
                          <div className="text-xs text-gray-500">{formatDateTime(evaluation.evaluated_at)}</div>
                        </div>
                        <div className="mt-3 text-2xl font-bold text-gray-900">
                          {evaluationScore(evaluation) != null ? `${evaluationScore(evaluation)}/6.0` : 'Pending'}
                        </div>
                        <div className="mt-2 text-xs text-gray-500">Status: {evaluation.status}</div>
                      </div>
                    ))}
                    {(detail.evaluations ?? []).length === 0 ? (
                      <div className="border border-dashed border-gray-300 rounded-xl p-4 text-sm text-gray-600">
                        No writing evaluation exists yet. You can refresh AI feedback or score this submission manually.
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Manual Review</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Edit the score, rubric criteria, and reviewer notes. Saving publishes an admin override.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void saveOverride()}
                        disabled={saving || aiLoading || !form}
                        className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-black disabled:bg-gray-300 text-white font-semibold"
                      >
                        {saving ? 'Saving...' : 'Save Override'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void clearOverride()}
                        disabled={saving || aiLoading || !detail.evaluations.some((row) => ['admin', 'manual'].includes(String(row.method).toLowerCase()))}
                        className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold disabled:text-gray-400"
                      >
                        Clear Override
                      </button>
                    </div>
                  </div>

                  {form ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-[220px,minmax(0,1fr)] gap-4">
                        <div>
                          <div className="text-sm font-semibold text-gray-900 mb-2">Overall score</div>
                          <input
                            type="number"
                            min={0}
                            max={6}
                            step={0.1}
                            value={form.overallScore}
                            onChange={(event) => setForm((current) => (current ? { ...current, overallScore: event.target.value } : current))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900 mb-2">Overall notes</div>
                          <textarea
                            rows={4}
                            value={form.notes}
                            onChange={(event) => setForm((current) => (current ? { ...current, notes: event.target.value } : current))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="Summarize the score rationale and next-step coaching."
                          />
                        </div>
                      </div>

                      <div className="space-y-5">
                        {form.tasks.map((task, index) => (
                          <div key={task.contentUnitId} className="border border-gray-200 rounded-2xl p-5 space-y-5">
                            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                              <div>
                                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">
                                  {task.taskType.replace(/_/g, ' ')}
                                </div>
                                <div className="text-sm text-gray-500 mt-1">Word count: {task.wordCount}</div>
                              </div>
                              <div className="text-xs text-gray-500 font-mono break-all">{task.contentUnitId}</div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Prompt</div>
                                <div className="mt-3 text-sm text-gray-800 whitespace-pre-wrap">{task.prompt || 'No prompt found.'}</div>
                              </div>
                              <div className="border border-gray-200 rounded-xl p-4 bg-white">
                                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Candidate Response</div>
                                <div className="mt-3 text-sm text-gray-800 whitespace-pre-wrap min-h-[140px]">
                                  {task.answer || 'No writing answer was submitted.'}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              <div>
                                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Score</div>
                                <input
                                  type="number"
                                  min={0}
                                  max={6}
                                  step={0.1}
                                  value={task.score}
                                  onChange={(event) => updateTask(index, { score: event.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                              </div>
                              <div>
                                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Task Completion</div>
                                <input
                                  type="number"
                                  min={0}
                                  max={6}
                                  step={0.1}
                                  value={task.taskCompletion}
                                  onChange={(event) => updateTask(index, { taskCompletion: event.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                              </div>
                              <div>
                                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Organization</div>
                                <input
                                  type="number"
                                  min={0}
                                  max={6}
                                  step={0.1}
                                  value={task.organization}
                                  onChange={(event) => updateTask(index, { organization: event.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                              </div>
                              <div>
                                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Vocabulary</div>
                                <input
                                  type="number"
                                  min={0}
                                  max={6}
                                  step={0.1}
                                  value={task.vocabulary}
                                  onChange={(event) => updateTask(index, { vocabulary: event.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                              </div>
                              <div>
                                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">Grammar</div>
                                <input
                                  type="number"
                                  min={0}
                                  max={6}
                                  step={0.1}
                                  value={task.grammar}
                                  onChange={(event) => updateTask(index, { grammar: event.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                              <div>
                                <div className="text-sm font-semibold text-gray-900 mb-2">Feedback</div>
                                <textarea
                                  rows={5}
                                  value={task.feedback}
                                  onChange={(event) => updateTask(index, { feedback: event.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                  placeholder="Explain the main strengths and weaknesses for this response."
                                />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-900 mb-2">Actionable Next Steps</div>
                                <textarea
                                  rows={5}
                                  value={task.actionableFeedback}
                                  onChange={(event) => updateTask(index, { actionableFeedback: event.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                  placeholder="One line per coaching point."
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                        {form.tasks.length === 0 ? (
                          <div className="border border-dashed border-gray-300 rounded-2xl p-6 text-sm text-gray-600">
                            No writing prompt units were found for this session. Open the full review view to inspect the raw content structure.
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </div>

                {writingTasks.length > 0 && !form ? (
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 text-sm text-gray-600">
                    Review prompts loaded, but the manual review form could not be initialized.
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
