import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  practiceGeneratePlan,
  practiceLabGet,
  practiceLabHint,
  practiceLabSave,
  practiceLabSubmit,
  practicePlanItemStart,
  practiceTodayPlan,
  srsBulkFromMastery,
  type PracticeLabPayload,
  type PracticeLabStep,
  type PracticeNotebookItem,
  type PracticePlanItem,
  type PracticeRoadmapItem,
} from '../lib/api';
import { IELTS_PRACTICE_PRODUCT_ID } from '../lib/constants';
import { getPlanItemDescription, getPlanItemTitle } from '../lib/practiceExperience';
import { useAccess } from '../lib/useAccess';
import { pingUserStreak } from '../lib/useUserStreak';
import { LocaleSwitcher } from '../../../../packages/service-i18n/src/i18n.tsx';
import { sectionLabel, statusLabel, useAppT, useErrorText, useFormat, type AppKey, type AppTranslate } from '../i18n';

type AnswerMap = Record<string, Record<string, unknown>>;

const LAB_SCHEMA_VERSION = 'ielts.practice.lab.v1';
const SECTION_ORDER = ['reading', 'listening', 'writing'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, unknown> =>
  isRecord(value) ? value : {};

const toText = (value: unknown): string => String(value ?? '').trim();

const titleCase = (value: unknown): string =>
  String(value ?? '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || 'Practice Lab';

const KNOWN_TRAPS = ['word_match', 'opposite_meaning', 'too_broad', 'nearby_but_wrong', 'wrong_number', 'wrong_speaker', 'not_given'];
const KNOWN_KINDS = ['evidence_locator', 'distractor_elimination', 'listening_replay', 'writing_rewrite', 'mastery_response', 'timed_response'];
const trapLabel = (t: AppTranslate, trap: string): string => (KNOWN_TRAPS.includes(trap) ? t(`lab.trap.${trap}` as AppKey) : titleCase(trap));
const kindLabel = (t: AppTranslate, kind: unknown): string => {
  const value = String(kind ?? '');
  return KNOWN_KINDS.includes(value) ? t(`lab.kind.${value}` as AppKey) : titleCase(value);
};
/** Step feedback from the measured accuracy (same thresholds as the server's scoreLabStep). */
const stepFeedback = (t: AppTranslate, accuracy: unknown): string => {
  const value = Number(accuracy);
  if (!Number.isFinite(value)) return '';
  return value >= 0.85 ? t('lab.fb.strong') : value >= 0.55 ? t('lab.fb.partial') : t('lab.fb.repair');
};

const sectionChipClass = (section: unknown): string => {
  const value = String(section ?? '').toLowerCase();
  if (value === 'reading') return 'chip reading';
  if (value === 'listening') return 'chip listening';
  if (value === 'writing') return 'chip writing';
  return 'chip';
};

const stepResponse = (answers: AnswerMap, stepId: string): Record<string, unknown> =>
  asRecord(answers[stepId]);

const stepShape = (step: PracticeLabStep): Record<string, unknown> => asRecord(step.response_shape);

const stepOptions = (step: PracticeLabStep): Array<{ id: string; label: string }> =>
  Array.isArray(step.options)
    ? step.options
      .map((entry, index) => {
        const row = asRecord(entry);
        return {
          id: toText(row.id ?? row.value ?? row.key ?? String(index + 1)),
          label: toText(row.label ?? row.text ?? row.value ?? row.id ?? entry),
        };
      })
      .filter((entry) => entry.id || entry.label)
    : [];

const mapKeysForStep = (step: PracticeLabStep): string[] => {
  const shape = stepShape(step);
  if (Array.isArray(shape.keys)) return shape.keys.map((entry) => toText(entry)).filter(Boolean);
  const answerKey = asRecord(step.answer_key);
  for (const key of ['blanks', 'matches', 'cells', 'labels', 'targets']) {
    const map = asRecord(answerKey[key]);
    const keys = Object.keys(map);
    if (keys.length > 0) return keys;
  }
  return ['answer'];
};

const coachList = (coach: Record<string, unknown>, key: string): string[] =>
  Array.isArray(coach[key]) ? coach[key].map((entry) => toText(entry)).filter(Boolean) : [];

const contextText = (context: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = toText(context[key]);
    if (value) return value;
  }
  return '';
};

const updateNestedMapAnswer = (
  current: Record<string, unknown>,
  mapKey: string,
  key: string,
  value: string,
): Record<string, unknown> => ({
  ...current,
  [mapKey]: {
    ...asRecord(current[mapKey]),
    [key]: value,
  },
});

type LabResult = Awaited<ReturnType<typeof practiceLabSubmit>> & { review_items_queued?: number };

const hasLabPayload = (item: { delivery_build?: { metadata?: unknown } | null }): boolean => {
  const metadata = asRecord(item.delivery_build?.metadata);
  const labPayload = asRecord(metadata.lab_payload);
  return labPayload.version === LAB_SCHEMA_VERSION;
};

export const LabPage = () => {
  const t = useAppT();
  const fmt = useFormat();
  const errorText = useErrorText();
  const percent = (value: unknown): string => {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? fmt.percent(Math.max(0, Math.min(1, number))) : '–';
  };
  const navigate = useNavigate();
  const { practiceSessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { accessToken } = useAccess();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lab, setLab] = useState<PracticeLabPayload | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [notebook, setNotebook] = useState<PracticeNotebookItem[]>([]);
  const [roadmap, setRoadmap] = useState<PracticeRoadmapItem[]>([]);
  const [plan, setPlan] = useState<PracticePlanItem[]>([]);
  const [launchingPlanItemId, setLaunchingPlanItemId] = useState<string | null>(null);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [result, setResult] = useState<LabResult | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const backPath = searchParams.get('back') || '/dashboard';
  const steps = useMemo(
    () => (Array.isArray(lab?.steps) ? lab.steps : []).filter((step): step is PracticeLabStep => isRecord(step) && toText(step.id).length > 0),
    [lab],
  );
  const activeStep = steps[Math.min(activeStepIndex, Math.max(steps.length - 1, 0))] ?? null;
  const coach = asRecord(lab?.coach_template);
  const labKind = titleCase(lab?.lab_kind);
  const isScored = result != null;

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      if (!accessToken || !practiceSessionId) return;
      setLoading(true);
      setError(null);
      try {
        const response = await practiceLabGet(accessToken, practiceSessionId);
        const planResponse = await practiceTodayPlan(accessToken).catch(() => ({ items: [] as PracticePlanItem[] }));
        if (cancelled) return;
        setLab(response.lab);
        setPlan(planResponse.items ?? []);
        setNotebook(response.notebook ?? []);
        setRoadmap(response.roadmap ?? []);
        const savedAnswers = asRecord(response.attempt?.answers_json);
        const initialAnswers = Object.fromEntries(
          Object.entries(savedAnswers).filter(([, value]) => isRecord(value)),
        ) as AnswerMap;
        setAnswers(initialAnswers);
        setActiveStepIndex(Math.max(0, Number(response.attempt?.current_step_index ?? 0) || 0));
        if (response.attempt?.status === 'scored') {
          setResult({
            ok: true,
            lab_attempt: response.attempt,
            score: {
              raw_score: Number(response.attempt.raw_score ?? 0),
              max_score: Number(response.attempt.max_score ?? 1),
              accuracy_ratio: Number(response.attempt.accuracy_ratio ?? 0),
              estimated_band: Number(response.attempt.estimated_band ?? 0),
            },
            scored_steps: Array.isArray(asRecord(response.attempt.score_artifacts).scored_steps)
              ? asRecord(response.attempt.score_artifacts).scored_steps as Record<string, unknown>[]
              : [],
            mastery_updates: [],
            notebook_items: response.notebook ?? [],
            roadmap_items: response.roadmap ?? [],
            diagnostics_snapshot_id: null,
          });
        }
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, practiceSessionId]);

  useEffect(() => {
    if (!accessToken || !practiceSessionId || !dirty || isScored) return;
    const timer = window.setTimeout(() => {
      setSaving(true);
      practiceLabSave(accessToken, practiceSessionId, { answers, current_step_index: activeStepIndex })
        .then(() => setDirty(false))
        .catch((err: unknown) => setError(errorText(err)))
        .finally(() => setSaving(false));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [accessToken, activeStepIndex, answers, dirty, isScored, practiceSessionId, errorText]);

  const updateStepAnswer = (stepId: string, patch: Record<string, unknown>): void => {
    setAnswers((prev) => ({
      ...prev,
      [stepId]: {
        ...asRecord(prev[stepId]),
        ...patch,
      },
    }));
    setDirty(true);
  };

  const getHint = async (): Promise<void> => {
    if (!accessToken || !practiceSessionId || !activeStep) return;
    setHintBusy(true);
    setHint(null);
    try {
      const res = await practiceLabHint(accessToken, practiceSessionId, toText(activeStep.id));
      setHint(res.hint);
    } catch {
      setHint(t('lab.hintUnavailable'));
    } finally {
      setHintBusy(false);
    }
  };

  const saveNow = async (): Promise<void> => {
    if (!accessToken || !practiceSessionId || isScored) return;
    setSaving(true);
    setError(null);
    try {
      await practiceLabSave(accessToken, practiceSessionId, { answers, current_step_index: activeStepIndex });
      setDirty(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  const submit = async (): Promise<void> => {
    if (!accessToken || !practiceSessionId) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await practiceLabSubmit(accessToken, practiceSessionId, {
        answers,
        current_step_index: activeStepIndex,
        metadata: { submitted_from: 'practice_lab_ui' },
      });
      setResult(response);
      setNotebook(response.notebook_items ?? []);
      setRoadmap(response.roadmap_items ?? []);
      setDirty(false);
      setActiveStepIndex(Math.min(activeStepIndex, Math.max(steps.length - 1, 0)));

      // Feed the spaced-repetition queue. Best-effort: a 404/network error here
      // must not break the lab submit flow, so the API helper already swallows.
      const masteryUpdates = Array.isArray(response.mastery_updates)
        ? response.mastery_updates.map(asRecord)
        : [];
      const srsItems: Array<{ question_type: string; accuracy_ratio: number; section_type?: 'reading' | 'listening' | 'writing' }> = [];
      for (const entry of masteryUpdates) {
        const questionType = toText(entry.question_type);
        const accuracy = typeof entry.accuracy_ratio === 'number'
          ? entry.accuracy_ratio
          : typeof entry.last_accuracy_ratio === 'number'
            ? entry.last_accuracy_ratio
            : null;
        if (!questionType || accuracy == null || !Number.isFinite(accuracy)) continue;
        const sectionRaw = toText(entry.section_type).toLowerCase();
        const section = sectionRaw === 'reading' || sectionRaw === 'listening' || sectionRaw === 'writing' ? sectionRaw : undefined;
        srsItems.push({ question_type: questionType, accuracy_ratio: accuracy, section_type: section });
      }
      // Fall back: if no mastery_updates rows but we have a top-level score and
      // know the lab section_type + question_type from steps, derive a single review.
      if (srsItems.length === 0 && response.score && Number.isFinite(response.score.accuracy_ratio)) {
        const stepQuestionTypes = new Set<string>();
        for (const step of (response.scored_steps ?? []).map(asRecord)) {
          const qt = toText(step.question_type);
          if (qt) stepQuestionTypes.add(qt);
        }
        if (stepQuestionTypes.size === 0) {
          const stepFromAttempt = lab?.steps ?? [];
          for (const step of stepFromAttempt) {
            const qt = toText(step?.question_type);
            if (qt) stepQuestionTypes.add(qt);
          }
        }
        const sectionType = (lab?.section_type ?? null) as 'reading' | 'listening' | 'writing' | null;
        for (const qt of stepQuestionTypes) {
          srsItems.push({
            question_type: qt,
            accuracy_ratio: response.score.accuracy_ratio,
            ...(sectionType ? { section_type: sectionType } : {}),
          });
        }
      }
      if (srsItems.length > 0) {
        void srsBulkFromMastery(accessToken, srsItems, IELTS_PRACTICE_PRODUCT_ID).catch(() => {
          // best-effort
        });
      }

      // Cross-app streak ping: a completed lab counts as today's activity.
      // Fire-and-forget; the streak badge re-fetches itself on next mount.
      const startedAt = Date.parse(String(response.lab_attempt?.started_at ?? ''));
      const minutes = Number.isFinite(startedAt) ? Math.max(1, Math.round((Date.now() - startedAt) / 60000)) : undefined;
      void pingUserStreak(accessToken, {
        activity_type: 'practice_lab_completed',
        xp: 25,
        // Real time spent on this attempt; omitted when the start time is unknown.
        ...(minutes != null && minutes <= 240 ? { minutes } : {}),
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  };

  const goToStep = (index: number): void => {
    setActiveStepIndex(Math.max(0, Math.min(index, Math.max(steps.length - 1, 0))));
    setDirty(true);
  };

  const reloadPlan = async (): Promise<void> => {
    if (!accessToken) return;
    const response = await practiceTodayPlan(accessToken);
    setPlan(response.items ?? []);
  };

  const regeneratePlan = async (): Promise<void> => {
    if (!accessToken) return;
    setGeneratingPlan(true);
    setError(null);
    try {
      await practiceGeneratePlan(accessToken, { refresh_diagnostics: false });
      await reloadPlan();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setGeneratingPlan(false);
    }
  };

  const launchPlanItem = async (item: PracticePlanItem): Promise<void> => {
    if (!accessToken || launchingPlanItemId) return;
    const existingPracticeSessionId = toText(item.practice_session_id || item.practice_session?.id);
    if (existingPracticeSessionId && existingPracticeSessionId === practiceSessionId) return;

    setLaunchingPlanItemId(item.id);
    setError(null);
    try {
      if (dirty && !isScored) {
        await practiceLabSave(accessToken, practiceSessionId, { answers, current_step_index: activeStepIndex }).catch(() => undefined);
        setDirty(false);
      }

      if (existingPracticeSessionId && hasLabPayload(item)) {
        const query = new URLSearchParams({ back: backPath }).toString();
        navigate(`/lab/${encodeURIComponent(existingPracticeSessionId)}?${query}`);
        return;
      }

      const started = await practicePlanItemStart(accessToken, item.id);
      const sessionId = started.session?.id ?? started.practice_session?.session_id ?? null;
      const nextPracticeSessionId = started.practice_session?.id ?? null;
      const firstSectionId = started.first_section_id ?? started.sections?.[0]?.id ?? null;
      const labReady = hasLabPayload(started);

      if (labReady && nextPracticeSessionId) {
        const query = new URLSearchParams({ back: backPath }).toString();
        navigate(`/lab/${encodeURIComponent(nextPracticeSessionId)}?${query}`);
        return;
      }

      if (!sessionId || !firstSectionId) throw new Error('Practice session started without a section id');
      const runtimeQuery = new URLSearchParams({
        results_back: backPath,
        review_back: backPath,
        review_product_id: IELTS_PRACTICE_PRODUCT_ID,
        playbook_source: 'practice',
      }).toString();
      navigate(`/session/${encodeURIComponent(sessionId)}/${encodeURIComponent(firstSectionId)}?${runtimeQuery}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('plan item not found')) {
        await regeneratePlan();
        setError(t('lab.stale'));
      } else {
        setError(errorText(err));
      }
    } finally {
      setLaunchingPlanItemId(null);
    }
  };

  const dailySectionLabs = useMemo(() => (
    SECTION_ORDER.map((section) => {
      const items = plan.filter((item) => item.section_type === section && (item.blueprint_id || item.delivery_build_id));
      const item = items.find((row) => row.status !== 'completed') ?? items[0] ?? null;
      const linkedPracticeSessionId = toText(item?.practice_session_id || item?.practice_session?.id);
      return {
        section,
        item,
        isCurrent: linkedPracticeSessionId === practiceSessionId,
      };
    })
  ), [plan, practiceSessionId]);

  const renderAnswerSurface = (step: PracticeLabStep) => {
    const stepId = toText(step.id);
    const response = stepResponse(answers, stepId);
    const shape = stepShape(step);
    const kind = toText(shape.kind || 'free_text');
    const options = stepOptions(step);
    const mapKey = toText(shape.map_key || 'answers') || 'answers';

    if (step.kind === 'writing_rewrite' || lab?.section_type === 'writing') {
      return (
        <div className="lab-answer-stack">
          <label>
            {t('lab.w.analysis')}
            <textarea
              rows={3}
              value={toText(response.task_analysis)}
              onChange={(event) => updateStepAnswer(stepId, { task_analysis: event.target.value })}
              placeholder={t('lab.w.analysisPh')}
              disabled={isScored}
            />
          </label>
          <label>
            {t('lab.w.plan')}
            <textarea
              rows={4}
              value={toText(response.plan)}
              onChange={(event) => updateStepAnswer(stepId, { plan: event.target.value })}
              placeholder={t('lab.w.planPh')}
              disabled={isScored}
            />
          </label>
          <label>
            {t('lab.w.rewrite')}
            <textarea
              rows={10}
              value={toText(response.full_rewrite)}
              onChange={(event) => updateStepAnswer(stepId, { full_rewrite: event.target.value })}
              placeholder={t('lab.w.rewritePh')}
              disabled={isScored}
            />
          </label>
        </div>
      );
    }

    if (kind === 'single_choice' && options.length > 0) {
      return (
        <div className="lab-options">
          {options.map((option) => (
            <label className="lab-option" key={option.id}>
              <input
                type="radio"
                name={`${stepId}-choice`}
                checked={toText(response.selected_option) === option.id}
                onChange={() => updateStepAnswer(stepId, { selected_option: option.id })}
                disabled={isScored}
              />
              <span>{option.label || option.id}</span>
            </label>
          ))}
        </div>
      );
    }

    if (kind === 'multi_choice' && options.length > 0) {
      const selected = Array.isArray(response.selected_options) ? response.selected_options.map(String) : [];
      return (
        <div className="lab-options">
          {options.map((option) => (
            <label className="lab-option" key={option.id}>
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? Array.from(new Set([...selected, option.id]))
                    : selected.filter((entry) => entry !== option.id);
                  updateStepAnswer(stepId, { selected_options: next });
                }}
                disabled={isScored}
              />
              <span>{option.label || option.id}</span>
            </label>
          ))}
        </div>
      );
    }

    if (kind === 'gap_fill') {
      // Render the sentence template with inputs inline at each placeholder —
      // the simulator does this and the practice lab used to just show numeric
      // labels above empty inputs, losing all sentence context.
      const mapValues = asRecord(response[mapKey]);
      const template = toText(shape.template);
      const keys = mapKeysForStep(step);
      const setBlank = (id: string, val: string) =>
        updateStepAnswer(stepId, updateNestedMapAnswer(response, mapKey, id, val));

      if (template) {
        // Split on placeholder patterns: __1__, ___1___, {1}, {{1}}, [1], (1)
        const parts: Array<{ kind: 'text'; value: string } | { kind: 'blank'; id: string }> = [];
        const regex = /(_{2,}|\{\{|\{|\[|\()\s*([A-Za-z0-9_-]+)\s*(_{2,}|\}\}|\}|\]|\))/g;
        let last = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(template)) != null) {
          if (match.index > last) parts.push({ kind: 'text', value: template.slice(last, match.index) });
          parts.push({ kind: 'blank', id: String(match[2]) });
          last = match.index + match[0].length;
        }
        if (last < template.length) parts.push({ kind: 'text', value: template.slice(last) });

        // If the regex matched no placeholders but we have keys, fall back to
        // numbered inputs below the template text.
        const hasPlaceholders = parts.some((p) => p.kind === 'blank');
        if (hasPlaceholders) {
          return (
            <div className="lab-gap-fill">
              <p className="lab-gap-fill-template">
                {parts.map((p, i) =>
                  p.kind === 'text' ? (
                    <span key={i}>{p.value}</span>
                  ) : (
                    <input
                      key={i}
                      className="lab-gap-fill-input"
                      value={toText(mapValues[p.id])}
                      onChange={(e) => setBlank(p.id, e.target.value)}
                      placeholder={p.id}
                      disabled={isScored}
                    />
                  ),
                )}
              </p>
            </div>
          );
        }
        return (
          <div className="lab-gap-fill">
            <p className="lab-gap-fill-template">{template}</p>
            <div className="lab-map-inputs">
              {keys.map((key) => (
                <label key={key}>
                  {key}
                  <input
                    value={toText(mapValues[key])}
                    onChange={(e) => setBlank(key, e.target.value)}
                    disabled={isScored}
                  />
                </label>
              ))}
            </div>
          </div>
        );
      }
      // No template at all — fall through to legacy map rendering below.
    }

    if (kind === 'map' || kind === 'gap_fill') {
      const mapValues = asRecord(response[mapKey]);
      // Legacy gap-fill payloads (generated before the template-aware blueprint
      // shipped) only have numbered keys and no sentence template stored.
      // Surface the situation explicitly so users don't think the form is
      // broken — and point them at Today's "Generate" button which rebuilds
      // the lab with the new shape.
      const isLegacyGapFill = mapKey === 'blanks' && !toText(shape.template);
      return (
        <div className="lab-map-inputs">
          {isLegacyGapFill ? (
            <div
              className="dashboard-alert"
              style={{
                gridColumn: '1 / -1',
                padding: '10px 12px',
                background: 'color-mix(in srgb, #b6512c 6%, white)',
                border: '1px solid color-mix(in srgb, #b6512c 22%, transparent)',
                borderRadius: 8,
                fontSize: 13.5,
                lineHeight: 1.45,
              }}
            >
              {t('lab.legacyGap')}
            </div>
          ) : null}
          {mapKeysForStep(step).map((key) => (
            <label key={key}>
              {titleCase(key)}
              <input
                value={toText(mapValues[key])}
                onChange={(event) => updateStepAnswer(stepId, updateNestedMapAnswer(response, mapKey, key, event.target.value))}
                disabled={isScored}
              />
            </label>
          ))}
        </div>
      );
    }

    return (
      <label>
        {t('lab.answer')}
        <textarea
          rows={4}
          value={toText(response.answer)}
          onChange={(event) => updateStepAnswer(stepId, { answer: event.target.value })}
          disabled={isScored}
        />
      </label>
    );
  };

  const renderProcessFields = (step: PracticeLabStep) => {
    const stepId = toText(step.id);
    const response = stepResponse(answers, stepId);

    if (step.kind === 'evidence_locator') {
      return (
        <label>
          {t('lab.evidence')}
          <textarea
            rows={4}
            value={toText(response.evidence)}
            onChange={(event) => updateStepAnswer(stepId, { evidence: event.target.value })}
            placeholder={t('lab.evidencePh')}
            disabled={isScored}
          />
        </label>
      );
    }

    if (step.kind === 'distractor_elimination') {
      const trapTypes = Array.isArray(asRecord(step.distractors).trap_types)
        ? asRecord(step.distractors).trap_types as string[]
        : ['word_match', 'opposite_meaning', 'too_broad', 'nearby_but_wrong', 'wrong_number', 'wrong_speaker', 'not_given'];
      return (
        <div className="lab-answer-stack">
          <label>
            {t('lab.trap')}
            <select
              value={toText(response.trap_type)}
              onChange={(event) => updateStepAnswer(stepId, { trap_type: event.target.value })}
              disabled={isScored}
            >
              <option value="">{t('lab.trapChoose')}</option>
              {trapTypes.map((trap) => <option value={trap} key={trap}>{trapLabel(t, trap)}</option>)}
            </select>
          </label>
          <label>
            {t('lab.trapWhy')}
            <textarea
              rows={4}
              value={toText(response.reason)}
              onChange={(event) => updateStepAnswer(stepId, { reason: event.target.value })}
              placeholder={t('lab.trapWhyPh')}
              disabled={isScored}
            />
          </label>
        </div>
      );
    }

    if (step.kind === 'listening_replay') {
      return (
        <div className="lab-answer-stack">
          <label>
            {t('lab.prediction')}
            <input
              value={toText(response.prediction)}
              onChange={(event) => updateStepAnswer(stepId, { prediction: event.target.value })}
              placeholder={t('lab.predictionPh')}
              disabled={isScored}
            />
          </label>
          <label>
            {t('lab.paraphrase')}
            <textarea
              rows={3}
              value={toText(response.paraphrase)}
              onChange={(event) => updateStepAnswer(stepId, { paraphrase: event.target.value })}
              placeholder={t('lab.paraphrasePh')}
              disabled={isScored}
            />
          </label>
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="practice-root">
        <div className="lab-loading-shell">
          <div className="lab-loading-card glass">
            <div className="lab-loading-spinner" aria-hidden="true" />
            <div>
              <strong>{t('lab.loading')}</strong>
              <p className="muted">{t('lab.loadingLead')}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !lab) {
    return (
      <div className="practice-root">
        <div className="lab-loading-shell">
          <div className="lab-loading-card glass" role="alert">
            <strong style={{ color: 'var(--danger)' }}>{error}</strong>
            <Link className="btn ghost compact" to={backPath} style={{ marginTop: 12 }}>{t('lab.back')}</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!lab || lab.version !== LAB_SCHEMA_VERSION || steps.length === 0) {
    return (
      <div className="practice-root">
        <div className="glass dashboard-alert error" role="alert">{t('lab.notReady')}</div>
        <Link className="btn ghost" to={backPath}>{t('lab.back')}</Link>
      </div>
    );
  }

  const activeContext = asRecord(activeStep?.context);
  const passageText = contextText(activeContext, ['passage_text', 'passage']);
  const transcript = contextText(activeContext, ['transcript']);
  const audioUrl = contextText(activeContext, ['audio_url']);
  const scoredSteps = Array.isArray(result?.scored_steps) ? result.scored_steps.map(asRecord) : [];
  const correctSteps = scoredSteps.filter((step) => Number(step.accuracy_ratio ?? 0) >= 0.75).length;
  const writingEvaluation = asRecord(asRecord(result?.lab_attempt?.score_artifacts).writing_evaluation);
  const writingBandRaw = Number(asRecord(writingEvaluation.result).overall_band);
  const writingBand = Number.isFinite(writingBandRaw) && writingBandRaw > 0 ? writingBandRaw : null;

  return (
    <div className="practice-root lab-root">
      <header className="lab-topbar">
        <Link className="brand" to={backPath}>
          <img src="/schood-logo.png" alt="Schood" />
          <div>
            <strong>{t('lab.brand')}</strong>
            <span>{labKind}</span>
          </div>
        </Link>
        <div className="top-nav-actions">
          <LocaleSwitcher label={t('shell.language')} />
          <span className={sectionChipClass(lab.section_type)}>{sectionLabel(t, lab.section_type)}</span>
          <span className="status-pill" role="status">{saving ? t('lab.saving') : dirty ? t('lab.unsaved') : t('lab.saved')}</span>
          <button
            className="btn ghost"
            type="button"
            onClick={() => void getHint()}
            disabled={hintBusy || isScored || !activeStep}
            title={t('lab.stuckTitle')}
          >
            {hintBusy ? t('lab.thinking') : t('lab.stuck')}
          </button>
          <button className="btn ghost" type="button" onClick={() => void saveNow()} disabled={saving || isScored}>{t('lab.save')}</button>
          <button className="btn solid" type="button" onClick={() => void submit()} disabled={submitting || isScored}>
            {submitting ? t('lab.scoring') : isScored ? t('lab.scored') : t('lab.submit')}
          </button>
        </div>
      </header>
      {hint ? (
        <div
          style={{
            margin: '12px 0 0',
            padding: '10px 14px',
            background: 'var(--accent-soft)',
            border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
            borderRadius: 10,
            fontSize: 14,
            color: 'var(--ink-2)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong style={{ color: 'var(--accent)' }}>{t('lab.hint')}</strong> {hint}</span>
          <button
            type="button"
            className="btn ghost compact"
            onClick={() => setHint(null)}
            style={{ flex: '0 0 auto' }}
          >
            {t('lab.dismiss')}
          </button>
        </div>
      ) : null}

      {error ? <div className="dashboard-alert error" role="alert">{error}</div> : null}

      <main className="lab-layout">
        <aside className="lab-sidebar">
          <section className="lab-panel coach-panel">
            <p className="eyebrow">{t('lab.coach')}</p>
            <h2>{toText(coach.headline) || labKind}</h2>
            <p>{toText(coach.body) || t('lab.coachDefault')}</p>
            <div className="lab-watch-list">
              {coachList(coach, 'watch_for').slice(0, 4).map((item) => <span key={item}>{item}</span>)}
            </div>
          </section>

          <section className="lab-panel today-labs-panel">
            <div className="lab-panel-head">
              <div>
                <h3>{t('lab.today')}</h3>
                <p className="muted">{t('lab.todayLead')}</p>
              </div>
              <button className="btn ghost compact" type="button" onClick={() => void regeneratePlan()} disabled={generatingPlan}>
                {generatingPlan ? t('lab.refreshing') : t('lab.refresh')}
              </button>
            </div>
            <div className="today-lab-list">
              {dailySectionLabs.map((row) => (
                <article className={`today-lab-card ${row.section}${row.isCurrent ? ' active' : ''}`} key={row.section}>
                  <div className="today-lab-card-head">
                    <span className={sectionChipClass(row.section)}>{sectionLabel(t, row.section)}</span>
                    <span className={`status-pill ${row.item?.status ?? 'missing'}`}>{row.isCurrent ? t('lab.current') : row.item?.status ? statusLabel(t, row.item.status) : t('lab.missing')}</span>
                  </div>
                  <strong>{row.item ? getPlanItemTitle(row.item, t) : t('lab.notGenerated', { section: sectionLabel(t, row.section) })}</strong>
                  <p>{row.item ? getPlanItemDescription(row.item, t) : t('lab.addSection')}</p>
                  {row.item ? (
                    <button
                      className={row.isCurrent ? 'btn ghost full' : 'btn solid full'}
                      type="button"
                      onClick={() => { if (row.item) void launchPlanItem(row.item); }}
                      disabled={row.isCurrent || launchingPlanItemId === row.item.id}
                    >
                      {row.isCurrent ? t('lab.openNow') : launchingPlanItemId === row.item.id ? t('common.opening') : row.item.practice_session_id ? t('lab.resume') : t('lab.openSection', { section: sectionLabel(t, row.section) })}
                    </button>
                  ) : (
                    <button className="btn ghost full" type="button" onClick={() => void regeneratePlan()} disabled={generatingPlan}>
                      {t('lab.generate')}
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="lab-panel">
            <h3>{t('lab.steps')}</h3>
            <div className="lab-stepper">
              {steps.map((step, index) => (
                <button
                  key={toText(step.id)}
                  className={`lab-step-button${index === activeStepIndex ? ' active' : ''}`}
                  type="button"
                  onClick={() => goToStep(index)}
                >
                  <span>{index + 1}</span>
                  <strong>{step.kind ? kindLabel(t, step.kind) : titleCase(step.question_type)}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="lab-panel">
            <h3>{t('lab.notebook')}</h3>
            {notebook.length === 0 ? <p className="muted">{t('lab.notebookEmpty')}</p> : (
              <ul className="lab-mini-list">
                {notebook.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <strong>{item.mistake_pattern}</strong>
                    <span>{t('lab.notebookNext', { status: titleCase(item.status), date: item.next_review_at ? fmt.date(item.next_review_at) : '–' })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="lab-panel">
            <h3>{t('lab.roadmap')}</h3>
            {roadmap.length === 0 ? <p className="muted">{t('lab.roadmapEmpty')}</p> : (
              <ul className="lab-mini-list">
                {roadmap.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span>{t('lab.roadmapMeta', { kind: titleCase(item.linked_lab_kind), n: Math.round(Number(item.priority ?? 0)) })}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className="lab-main">
          {isScored && result ? (
            <section className="lab-result-panel">
              <div>
                <p className="eyebrow">{t('lab.result')}</p>
                {lab.section_type === 'writing' ? (
                  writingBand != null
                    ? <h1>{t('lab.resultWritingBand', { band: fmt.band(writingBand) })}</h1>
                    : <><h1>{t('lab.resultCorrect', { correct: correctSteps, total: scoredSteps.length })}</h1><p className="muted">{t('lab.resultWritingNoBand')}</p></>
                ) : (
                  <h1>{t('lab.resultCorrect', { correct: correctSteps, total: scoredSteps.length })}</h1>
                )}
                <p className="muted">{t('lab.resultAccuracy', { value: percent(result.score.accuracy_ratio) })}</p>
                {(result.review_items_queued ?? 0) > 0 ? (
                  <p>
                    {t('lab.queued', { count: result.review_items_queued ?? 0 })}{' '}
                    <Link to="/practice/reviews">{t('lab.openReviews')}</Link>
                  </p>
                ) : null}
              </div>
              <div className="lab-result-actions">
                <Link className="btn solid" to="/dashboard">{t('lab.dashboard')}</Link>
                <Link className="btn ghost" to="/plan">{t('lab.nextPlan')}</Link>
                {notebook.length > 0 ? (
                  <Link className="btn ghost" to="/practice/reviews">{t('lab.openNotebook', { count: notebook.length })}</Link>
                ) : null}
              </div>
              <div className="lab-feedback-list">
                {scoredSteps.map((step) => (
                  <article key={toText(step.step_id)} className="lab-feedback-item">
                    <strong>{titleCase(step.question_type)}</strong>
                    <span>{percent(step.accuracy_ratio)} · {stepFeedback(t, step.accuracy_ratio)}</span>
                  </article>
                ))}
              </div>
              {notebook.length > 0 ? (
                <div className="lab-notebook-callout">
                  <p className="eyebrow">{t('lab.nbAdded')}</p>
                  <p className="muted" style={{ marginTop: 4 }}>{t('lab.nbAddedLead', { count: notebook.length })}</p>
                  <ul className="lab-notebook-list">
                    {notebook.slice(0, 6).map((item) => (
                      <li key={item.id}>
                        <strong>{titleCase(item.question_type)}</strong>
                        {item.mistake_pattern ? <span> — {toText(item.mistake_pattern)}</span> : null}
                      </li>
                    ))}
                  </ul>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <Link className="btn solid" to="/practice/reviews">{t('lab.openReviews')}</Link>
                    <Link className="btn ghost" to="/dashboard#dashboard-review">{t('lab.reviewDashboard')}</Link>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeStep ? (
            <article className="lab-task-panel">
              <div className="lab-task-head">
                <div>
                  <p className="eyebrow">{t('lab.step', { n: activeStepIndex + 1, total: steps.length })}</p>
                  <h1 style={{ overflowWrap: 'anywhere' }}>{toText(activeStep.title) || kindLabel(t, activeStep.kind)}</h1>
                  <p>{toText(activeStep.instructions)}</p>
                </div>
                {(lab.experience_kind === 'timed_mini' || lab.lab_kind === 'timed_mini' || lab.lab_kind === 'mastery_check') ? (
                  <span className="status-pill">{t('lab.noHints')}</span>
                ) : null}
              </div>

              {(passageText || transcript || audioUrl) ? (
                <section className="lab-context-grid">
                  {passageText ? (
                    <article className="lab-context-panel">
                      <h3>{toText(activeContext.passage_title) || t('lab.passage')}</h3>
                      <div className="lab-scroll-text">{passageText}</div>
                    </article>
                  ) : null}
                  {audioUrl || transcript ? (
                    <article className="lab-context-panel">
                      <h3>{t('lab.replay')}</h3>
                      {audioUrl ? <audio controls src={audioUrl} className="lab-audio" /> : <p className="muted">{t('lab.noAudio')}</p>}
                      {transcript ? <div className="lab-scroll-text transcript">{transcript}</div> : <p className="muted">{t('lab.noTranscript')}</p>}
                    </article>
                  ) : null}
                </section>
              ) : null}

              <section className="lab-question-panel">
                <h3>{t('lab.task')}</h3>
                <p style={{ overflowWrap: 'anywhere' }}>{toText(activeStep.prompt)}</p>
                <div className="lab-answer-stack">
                  {renderAnswerSurface(activeStep)}
                  {renderProcessFields(activeStep)}
                </div>
              </section>

              <footer className="lab-footer-actions">
                <button className="btn ghost" type="button" onClick={() => goToStep(activeStepIndex - 1)} disabled={activeStepIndex === 0}>{t('lab.previous')}</button>
                {activeStepIndex < steps.length - 1 ? (
                  <button className="btn solid" type="button" onClick={() => goToStep(activeStepIndex + 1)}>{t('lab.next')}</button>
                ) : (
                  <button className="btn solid" type="button" onClick={() => void submit()} disabled={submitting || isScored}>
                    {submitting ? t('lab.scoring') : t('lab.submitLab')}
                  </button>
                )}
              </footer>
            </article>
          ) : null}
        </section>
      </main>
    </div>
  );
};
