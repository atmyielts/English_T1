import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, BookOpen, ChevronLeft, ChevronRight, Menu, StickyNote, Volume2 } from 'lucide-react';
import { AnswerDraftStore, tabDraftStorage } from '../../../exam-shared/src/answer-draft';
import { ANSWER_SAVE_ERROR, AnswerSaveQueue, transitionAfterSaving } from '../../../exam-shared/src/submission';
import type { ContentUnit } from '../domain/models';
import { PassageViewer, type PassageAnnotation } from '../components/exam/PassageViewer';
import { InputRenderer } from '../features/exam/InputRenderer';
import { getExamState } from '../lib/platformClient';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/useAccess';

type Json = Record<string, unknown>;

type ExperienceRow = { id: string; name: string };
type SectionRow = { id: string; name: string; display_order: number; metadata: Json | null };
type ExamUnit = ContentUnit & { partName?: string | null; partOrder?: number | null };

const sectionType = (s: SectionRow | null): string => String((s?.metadata as any)?.type ?? 'unknown');

const isQuestionUnit = (u: Pick<ContentUnit, 'type'>): boolean => String(u.type).startsWith('question_');

const inferWritingMinWords = (partOrder: number): number | null => {
  if (partOrder === 1) return 150;
  if (partOrder === 2) return 250;
  return null;
};

const withWritingFallbackPrompts = (source: ExamUnit[], currentSection: SectionRow | null): ExamUnit[] => {
  if (sectionType(currentSection) !== 'writing') return source;

  const byPart = new Map<string, ExamUnit[]>();
  for (const u of source) {
    if (!u.partId) continue;
    const list = byPart.get(u.partId);
    if (list) list.push(u);
    else byPart.set(u.partId, [u]);
  }

  const derived: ExamUnit[] = [];
  for (const [partId, units] of byPart.entries()) {
    const hasQuestionText = units.some((u) => u.type === 'question_text');
    if (hasQuestionText) continue;

    const promptSource = units.find((u) => u.type === 'instruction');
    if (!promptSource) continue;

    const promptText = String((promptSource.data as any)?.text ?? '').trim();
    const partOrder = Number(promptSource.partOrder ?? 0);
    const minWords = inferWritingMinWords(partOrder);
    const fallbackPrompt =
      promptText.length > 0
        ? promptText
        : minWords === 250
          ? 'Write at least 250 words.'
          : minWords === 150
            ? 'Write at least 150 words.'
            : 'Write your response.';

    // Keep the original instruction unit in place for the header, and add a writable unit
    // that reuses the same content unit id so responses still persist safely.
    derived.push({
      ...promptSource,
      id: promptSource.id,
      partId,
      type: 'question_text',
      displayOrder: Number(promptSource.displayOrder ?? 0) + 0.01,
      data: {
        prompt: fallbackPrompt,
        placeholder: 'Start typing your answer...',
        rows: minWords === 250 ? 20 : 14,
        show_word_count: true,
        ...(minWords != null ? { min_words: minWords } : {}),
      } as any,
    });
  }

  if (derived.length === 0) return source;
  return [...source, ...derived];
};

type QuestionItem = { unitId: string; subId: string | null; number: number };
type QuestionRange = { start: number; end: number };

const extractPlaceholders = (text: string): string[] => {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /\{\{([a-zA-Z0-9_-]+)\}\}/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text))) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

const questionSubIds = (u: ContentUnit): string[] => {
  const d: any = u.data ?? {};

  if (u.type === 'question_matching' || u.type === 'question_matching_headings' || u.type === 'question_sentence_endings') {
    return Array.isArray(d.items) ? d.items.map((x: any) => String(x?.id ?? '')).filter(Boolean) : [];
  }

  if (u.type === 'question_true_false_not_given' || u.type === 'question_yes_no_not_given') {
    if (Array.isArray(d.statements)) return d.statements.map((x: any) => String(x?.id ?? '')).filter(Boolean);
    return Array.isArray(d.items) ? d.items.map((x: any) => String(x?.id ?? '')).filter(Boolean) : [];
  }

  if (u.type === 'question_gap_fill' || u.type === 'question_select_from_list') {
    if (Array.isArray(d.blanks) && d.blanks.length > 0) {
      return d.blanks.map((b: any) => String(b?.id ?? '')).filter(Boolean);
    }
    const text = String(d.text ?? '');
    return extractPlaceholders(text);
  }

  if (u.type === 'question_table_completion') {
    const rows = Array.isArray(d.rows) ? d.rows : [];
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const cells = Array.isArray(row) ? row : [];
      for (const c of cells) {
        const id = typeof c?.blank_id === 'string' ? c.blank_id : null;
        if (id && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }
    return ids;
  }

  if (u.type === 'question_diagram_labeling') {
    return Array.isArray(d.labels) ? d.labels.map((x: any) => String(x?.id ?? '')).filter(Boolean) : [];
  }

  if (u.type === 'question_drag_drop') {
    return Array.isArray(d.targets) ? d.targets.map((x: any) => String(x?.id ?? '')).filter(Boolean) : [];
  }

  return [];
};

const isAnswered = (unit: ContentUnit, value: unknown, subId?: string | null): boolean => {
  if (!isQuestionUnit(unit)) return false;
  if (value == null) return false;

  if (unit.type === 'question_single_choice') {
    const v: any = value;
    return typeof v === 'string' ? v.length > 0 : typeof v?.selected_option === 'string' && v.selected_option.length > 0;
  }

  if (unit.type === 'question_multi_choice') {
    const v: any = value;
    const arr = Array.isArray(v) ? v : Array.isArray(v?.selected_options) ? v.selected_options : [];
    return arr.length > 0;
  }

  if (unit.type === 'question_text') {
    const v: any = value;
    const text = typeof v === 'string' ? v : typeof v?.text === 'string' ? v.text : '';
    return text.trim().length > 0;
  }

  if (
    unit.type === 'question_matching' ||
    unit.type === 'question_matching_headings' ||
    unit.type === 'question_sentence_endings' ||
    unit.type === 'question_true_false_not_given' ||
    unit.type === 'question_yes_no_not_given'
  ) {
    const v: any = value;
    const matches = v && typeof v === 'object' ? (v.matches ?? v) : null;
    if (!matches || typeof matches !== 'object') return false;
    if (subId) return typeof (matches as any)[subId] === 'string' && String((matches as any)[subId]).length > 0;
    return Object.keys(matches).length > 0;
  }

  if (unit.type === 'question_gap_fill' || unit.type === 'question_select_from_list') {
    const v: any = value;
    const blanks = v && typeof v === 'object' ? (v.blanks ?? v) : null;
    if (!blanks || typeof blanks !== 'object') return false;
    if (subId) return String((blanks as any)[subId] ?? '').trim().length > 0;
    return Object.values(blanks as any).some((x) => String(x ?? '').trim().length > 0);
  }

  if (unit.type === 'question_table_completion') {
    const v: any = value;
    const cells = v && typeof v === 'object' ? (v.cells ?? v) : null;
    if (!cells || typeof cells !== 'object') return false;
    if (subId) return String((cells as any)[subId] ?? '').trim().length > 0;
    return Object.values(cells as any).some((x) => String(x ?? '').trim().length > 0);
  }

  if (unit.type === 'question_diagram_labeling') {
    const v: any = value;
    const labels = v && typeof v === 'object' ? (v.labels ?? v) : null;
    if (!labels || typeof labels !== 'object') return false;
    if (subId) return String((labels as any)[subId] ?? '').trim().length > 0;
    return Object.values(labels as any).some((x) => String(x ?? '').trim().length > 0);
  }

  if (unit.type === 'question_drag_drop') {
    const v: any = value;
    const targets = v && typeof v === 'object' ? (v.targets ?? v) : null;
    if (!targets || typeof targets !== 'object') return false;
    if (subId) return String((targets as any)[subId] ?? '').trim().length > 0;
    return Object.values(targets as any).some((x) => String(x ?? '').trim().length > 0);
  }

  return false;
};

const formatClock = (secondsTotal: number): string => {
  const s = Math.max(0, Math.floor(secondsTotal));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

type TextSize = 'regular' | 'large' | 'xlarge';
type Contrast = 'default' | 'invert' | 'yellow';

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));
const clamp01 = (n: number): number => clamp(n, 0, 1);

const lsGetJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const lsSetJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
};

const qKey = (unitId: string, subId: string | null): string => `${unitId}:${subId ?? ''}`;

export const ExamPlayer: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId, sectionId } = useParams<{ sessionId: string; sectionId: string }>();

  const [loadedOnce, setLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [draftRecovery, setDraftRecovery] = useState<{ answers: Record<string, unknown>; conflicts: number } | null>(null);
  const [draftWarning, setDraftWarning] = useState<string | null>(null);
  const draftStoreRef = useRef<AnswerDraftStore | null>(null);
  const answerSnapshotRef = useRef<Record<string, unknown>>({});
  const submissionInFlightRef = useRef(false);
  const pendingSavesRef = useRef(new Set<Promise<void>>());
  const answerSaveQueueRef = useRef(new AnswerSaveQueue());

  const [experience, setExperience] = useState<ExperienceRow | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [section, setSection] = useState<SectionRow | null>(null);
  const [nextSectionId, setNextSectionId] = useState<string | null>(null);

  const [units, setUnits] = useState<ExamUnit[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  const [deadlineIso, setDeadlineIso] = useState<string | null>(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);
  const [sessionMeta, setSessionMeta] = useState<Record<string, unknown> | null>(null);
  const [showNavigator, setShowNavigator] = useState(false);
  const [mobilePassageOpen, setMobilePassageOpen] = useState(true);
  const { accessToken, userId } = useAccess();
  const [activePartId, setActivePartId] = useState<string | null>(null);

  const [flags, setFlags] = useState<Record<string, true>>({});
  const [contrast, setContrast] = useState<Contrast>(() => {
    const raw = String(localStorage.getItem('toefl:contrast') ?? '').toLowerCase();
    if (raw === 'invert' || raw === 'yellow' || raw === 'default') return raw;
    return 'default';
  });
  const [textSize, setTextSize] = useState<TextSize>(() => {
    const raw = String(localStorage.getItem('toefl:text_size') ?? '').toLowerCase();
    if (raw === 'large' || raw === 'xlarge' || raw === 'regular') return raw;
    return 'regular';
  });
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [volume, setVolume] = useState<number>(() => {
    const raw = localStorage.getItem('toefl:volume');
    const v = raw ? Number(raw) : 0.85;
    return Number.isFinite(v) ? clamp01(v) : 0.85;
  });
  const [passageAnnotations, setPassageAnnotations] = useState<Record<string, PassageAnnotation[]>>({});

  const questionBarRef = useRef<HTMLDivElement | null>(null);

  const saveTimersRef = useRef<Map<string, number>>(new Map());
  const lastSavedRef = useRef<Record<string, string>>({});
  const serverNowOffsetMsRef = useRef<number>(0);
  const autoAdvanceRef = useRef(false);

  const currentSectionIndex = useMemo(() => sections.findIndex((s) => s.id === sectionId), [sections, sectionId]);
  const currentSectionNumber = currentSectionIndex >= 0 ? currentSectionIndex + 1 : 1;

  const isLastSection = nextSectionId == null;
  const isCandidate = String((sessionMeta as any)?.exam_mode ?? '') === 'token';
  const isCandidateRoute = location.pathname.startsWith('/candidate/session/');
  const isAdminSessionRoute = location.pathname.startsWith('/admin/session/');
  const sessionBasePath = isCandidate ? '/candidate/session' : isAdminSessionRoute ? '/admin/session' : '/session';

  useEffect(() => {
    setMobilePassageOpen(true);
  }, [sectionId]);

  useEffect(() => {
    if (!sessionId || !sectionId) return;
    const key = `toefl:flags:${sessionId}:${sectionId}`;
    const loaded = lsGetJson<Record<string, true>>(key, {});
    setFlags(loaded && typeof loaded === 'object' ? loaded : {});
  }, [sectionId, sessionId]);

  useEffect(() => {
    if (!sessionId || !sectionId) return;
    const key = `toefl:flags:${sessionId}:${sectionId}`;
    lsSetJson(key, flags);
  }, [flags, sectionId, sessionId]);

  useEffect(() => {
    localStorage.setItem('toefl:contrast', contrast);
  }, [contrast]);

  useEffect(() => {
    localStorage.setItem('toefl:text_size', textSize);
  }, [textSize]);

  useEffect(() => {
    localStorage.setItem('toefl:volume', String(volume));
  }, [volume]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOptionsOpen(false);
      setNotesOpen(false);
      setShowNavigator(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flushSaves = useCallback(async (): Promise<void> => {
    const sid = sessionId;
    if (!sid) return;
    const draftStore = draftStoreRef.current;

    const timers = saveTimersRef.current;
    for (const t of timers.values()) window.clearTimeout(t);
    timers.clear();
    // Let earlier autosaves settle before writing the final answer snapshot.
    await Promise.allSettled([...pendingSavesRef.current]);

    const toInsert: { session_id: string; content_unit_id: string; type: string; data: unknown }[] = [];

    for (const unit of units) {
      if (!isQuestionUnit(unit)) continue;
      const data = answerSnapshotRef.current[unit.id];
      if (data == null) continue;

      const serialized = JSON.stringify(data);
      if (lastSavedRef.current[unit.id] === serialized) continue;

      toInsert.push({ session_id: sid, content_unit_id: unit.id, type: unit.type, data });
    }

    if (toInsert.length === 0) { setAutosaveError(null); return; }

    await answerSaveQueueRef.current.run(() => supabase.from('responses').insert(toInsert));
    for (const row of toInsert) {
      lastSavedRef.current[row.content_unit_id] = JSON.stringify(row.data);
      draftStore?.acknowledge(row.content_unit_id, row.data);
    }
    setAutosaveError(null);
  }, [sessionId, units]);

  const retrySaving = async () => {
    if (submissionInFlightRef.current || loading || draftRecovery) return;
    submissionInFlightRef.current = true;
    setSubmitting(true);
    try { await flushSaves(); }
    catch { setAutosaveError(ANSWER_SAVE_ERROR); }
    finally { submissionInFlightRef.current = false; setSubmitting(false); }
  };

  const queueSave = (unit: ContentUnit, data: unknown) => {
    if (submissionInFlightRef.current || draftRecovery || loading || timeLeftSeconds === 0 || section?.id !== sectionId) return;
    const sid = sessionId;
    answerSnapshotRef.current = { ...answerSnapshotRef.current, [unit.id]: data };
    setAnswers(answerSnapshotRef.current);
    let base: unknown;
    try { const stored = lastSavedRef.current[unit.id]; base = stored === undefined ? undefined : JSON.parse(stored); } catch { base = undefined; }
    if (!draftStoreRef.current?.put(unit.id, data, base)) {
      setDraftWarning('This browser cannot keep a reload recovery draft. Keep this page open until your answers are saved.');
    }

    const serialized = JSON.stringify(data);
    const draftStore = draftStoreRef.current;
    if (!sid) return;

    const timers = saveTimersRef.current;
    const existing = timers.get(unit.id);
    if (existing) window.clearTimeout(existing);

    const debounceMs =
      unit.type === 'question_text'
        ? 1200
        : unit.type === 'question_matching'
          ? 600
          : unit.type === 'question_gap_fill' || unit.type === 'question_table_completion' || unit.type === 'question_diagram_labeling'
            ? 500
            : unit.type === 'question_drag_drop'
              ? 250
              : 150;

    const t = window.setTimeout(async () => {
      timers.delete(unit.id);
      const save = answerSaveQueueRef.current.run(() => supabase.from('responses').insert({
        session_id: sid, content_unit_id: unit.id, type: unit.type, data,
      }));
      pendingSavesRef.current.add(save);
      try {
        await save;
        if (draftStoreRef.current === draftStore) lastSavedRef.current[unit.id] = serialized;
        draftStore?.acknowledge(unit.id, data);
      } catch {
        if (draftStoreRef.current === draftStore) setAutosaveError(ANSWER_SAVE_ERROR);
      } finally {
        pendingSavesRef.current.delete(save);
      }
    }, debounceMs);

    timers.set(unit.id, t);
  };

  useEffect(() => {
    let cancelled = false;
    const timers = saveTimersRef.current;

    const run = async () => {
      if (!sessionId || !sectionId || !accessToken || !userId) return;

      setLoading(true);
      setError(null);
      setSubmissionError(null);
      setAutosaveError(null);
      setDraftWarning(null);
      setDraftRecovery(null);
      draftStoreRef.current = null;
      setDeadlineIso(null);
      setTimeLeftSeconds(null);
      setNextSectionId(null);
      autoAdvanceRef.current = false;

      try {
        const state = await getExamState(accessToken, sessionId, sectionId);
        if (cancelled) return;

        serverNowOffsetMsRef.current = Date.parse(state.server_time_iso) - Date.now();

        const mappedUnits: ExamUnit[] = state.units.map((u) => ({
          id: u.id,
          partId: u.part_id,
          partName: u.part_name ?? null,
          partOrder: u.part_order ?? null,
          type: u.type as any,
          data: u.data as any,
          displayOrder: u.display_order,
        }));
        const normalizedUnits = withWritingFallbackPrompts(mappedUnits, state.current_section as any);

        lastSavedRef.current = {};
        for (const [unitId, value] of Object.entries(state.answers ?? {})) {
          lastSavedRef.current[unitId] = JSON.stringify(value);
        }

        setExperience({ id: state.experience.id, name: state.experience.name });
        setSections(state.sections as any);
        setSection(state.current_section as any);
        setNextSectionId(state.next_section_id);
        setUnits(normalizedUnits);
        answerSnapshotRef.current = state.answers ?? {};
        const drafts = new AnswerDraftStore(tabDraftStorage(), { app: 'toefl', actor: userId, session: sessionId, section: sectionId });
        draftStoreRef.current = drafts;
        const pending = drafts.pending(state.answers ?? {}, new Set(normalizedUnits.filter(isQuestionUnit).map(u => u.id)));
        setDraftRecovery(Object.keys(pending.answers).length ? pending : null);
        setAnswers(answerSnapshotRef.current);
        setDeadlineIso(state.deadline_iso);
        setSessionMeta((state.session?.metadata ?? {}) as Record<string, unknown>);
        setShowNavigator(false);
        // Reset part selection when changing sections (used for reading split-view).
        setActivePartId(null);
        setLoadedOnce(true);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (/candidate session is (completed|closed)/i.test(msg)) {
          setError('This one-time candidate session is already closed.');
        } else {
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
    };
  }, [accessToken, navigate, sectionId, sessionId, userId]);

  useEffect(() => {
    if (!accessToken) return;
    if (!sessionId) return;
    if (!nextSectionId) return;

    // Prefetch the next section without starting its timer or changing current_section_id.
    void getExamState(accessToken, sessionId, nextSectionId, { prefetch: true }).catch(() => {
      // best-effort
    });
  }, [accessToken, nextSectionId, sessionId]);

  useEffect(() => {
    autoAdvanceRef.current = false;
    if (!deadlineIso) {
      setTimeLeftSeconds(null);
      return;
    }

    const tick = () => {
      const now = Date.now() + serverNowOffsetMsRef.current;
      const ms = Date.parse(deadlineIso) - now;
      setTimeLeftSeconds(Math.max(0, Math.ceil(ms / 1000)));
    };

    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [deadlineIso]);

  const completeOrAdvance = useCallback(async (automatic: boolean, failureMessage: string) => {
    if (nextSectionId) {
      navigate(`${sessionBasePath}/${sessionId}/${nextSectionId}`, { replace: automatic });
      return;
    }
    const { data: completedSession, error: finalizeError } = await supabase.from('sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', sessionId).select('id,status').single();
    if (finalizeError || completedSession?.id !== sessionId || completedSession.status !== 'completed') throw new Error(failureMessage);
    navigate(`${sessionBasePath}/${sessionId}/results`, { replace: automatic });
  }, [navigate, nextSectionId, sessionBasePath, sessionId]);

  const submitSection = useCallback(async (automatic: boolean) => {
    if (submissionInFlightRef.current || loading || draftRecovery || section?.id !== sectionId) return;
    submissionInFlightRef.current = true;
    setSubmitting(true);
    setSubmissionError(null);
    try {
      await transitionAfterSaving(flushSaves, async () => {
        draftStoreRef.current?.clear();
        await completeOrAdvance(automatic, 'Your answers are saved, but this attempt could not be completed. Retry submission.');
      });
    } catch (cause) {
      setSubmissionError(cause instanceof Error ? cause.message : ANSWER_SAVE_ERROR);
    } finally {
      submissionInFlightRef.current = false;
      setSubmitting(false);
    }
  }, [loading, draftRecovery, section?.id, sectionId, flushSaves, completeOrAdvance]);

  useEffect(() => {
    if (timeLeftSeconds == null) return;
    if (timeLeftSeconds > 0 || loading || draftRecovery) return;
    if (!sectionId || section?.id !== sectionId || !deadlineIso || Date.parse(deadlineIso) > Date.now() + serverNowOffsetMsRef.current) return;
    if (autoAdvanceRef.current) return;
    autoAdvanceRef.current = true;

    // Auto-advance when time ends.
    void submitSection(true);
  }, [submitSection, timeLeftSeconds, loading, draftRecovery, sectionId, section?.id, deadlineIso]);

  const handleNext = async () => { await submitSection(false); };

  const continueWithSavedAnswers = async () => {
    if (submissionInFlightRef.current || loading || draftRecovery || timeLeftSeconds !== 0 || !accessToken || !sessionId || !sectionId) return;
    submissionInFlightRef.current = true;
    setSubmitting(true);
    try {
      // Reconcile a lost write reply without allowing late answer edits or relying
      // on the prefetched/cache snapshot. This is an explicit learner decision.
      const saved = await getExamState(accessToken, sessionId, sectionId, { force: true });
      if (saved.session.id !== sessionId || saved.current_section.id !== sectionId) throw new Error('Unconfirmed saved section.');
      await completeOrAdvance(false, 'This attempt could not be completed.');
    } catch {
      setSubmissionError('The saved section could not be confirmed or closed. Keep this page open and retry.');
    } finally {
      submissionInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleAbandon = async () => {
    if (!sessionId || submissionInFlightRef.current || draftRecovery) return;
    const ok = window.confirm('Leaving now will mark this attempt as abandoned and cannot be restarted. Leave exam?');
    if (!ok) return;

    submissionInFlightRef.current = true;
    setSubmitting(true);
    try {
      await flushSaves();
      const { data: abandonedSession, error: abandonError } = await supabase.from('sessions')
        .update({ status: 'abandoned', completed_at: new Date().toISOString() }).eq('id', sessionId).select('id,status').single();
      if (abandonError || abandonedSession?.id !== sessionId || abandonedSession.status !== 'abandoned') throw new Error('This attempt could not be closed. Keep this page open and retry leaving.');
      draftStoreRef.current?.clear();
      navigate('/', { replace: true });
    } catch (cause) {
      setAutosaveError(cause instanceof Error ? cause.message : ANSWER_SAVE_ERROR);
    } finally {
      submissionInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const type = sectionType(section);
  const isReading = type === 'reading';
  const isListening = type === 'listening';

  const parts = useMemo(() => {
    const map = new Map<string, { id: string; name: string; order: number }>();
    for (const u of units) {
      const id = u.partId;
      if (!id) continue;
      if (map.has(id)) continue;
      map.set(id, { id, name: String((u as any).partName ?? 'Part'), order: Number((u as any).partOrder ?? 0) });
    }
    const list = Array.from(map.values());
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return list;
  }, [units]);

  useEffect(() => {
    const first = parts[0]?.id ?? null;
    setActivePartId((prev) => (prev && parts.some((p) => p.id === prev) ? prev : first));
  }, [parts]);

  const allPassages = useMemo(() => (isReading ? units.filter((u) => u.type === 'reading_passage') : []), [isReading, units]);
  const allMainUnits = useMemo(() => (isReading ? units.filter((u) => u.type !== 'reading_passage') : units), [isReading, units]);

  const visiblePassages = useMemo(() => {
    if (!activePartId) return allPassages;
    return allPassages.filter((u) => u.partId === activePartId);
  }, [activePartId, allPassages]);

  const visibleMainUnits = useMemo(() => {
    if (!activePartId) return allMainUnits;
    return allMainUnits.filter((u) => u.partId === activePartId);
  }, [activePartId, allMainUnits]);

  const visibleInstructions = useMemo(() => visibleMainUnits.filter((u) => u.type === 'instruction'), [visibleMainUnits]);
  const visibleRenderableUnits = useMemo(() => visibleMainUnits.filter((u) => u.type !== 'instruction'), [visibleMainUnits]);

  const activeInstructionText = useMemo(() => {
    const texts = visibleInstructions
      .map((u) => String((u.data as any)?.text ?? '').trim())
      .filter((t) => t.length > 0);
    if (texts.length === 0) return null;
    return texts.join('\n\n');
  }, [visibleInstructions]);

  const passageIdsKey = useMemo(() => allPassages.map((p) => p.id).join('|'), [allPassages]);

  useEffect(() => {
    if (!sessionId) return;
    if (!isReading) return;

    const next: Record<string, PassageAnnotation[]> = {};
    for (const p of allPassages) {
      const key = `toefl:passage_annotations:${sessionId}:${p.id}`;
      next[p.id] = lsGetJson<PassageAnnotation[]>(key, []);
    }
    setPassageAnnotations(next);
  }, [allPassages, isReading, passageIdsKey, sessionId]);

  const unitById = useMemo(() => new Map(allMainUnits.map((u) => [u.id, u])), [allMainUnits]);
  const unitToPartId = useMemo(() => new Map(allMainUnits.map((u) => [u.id, u.partId])), [allMainUnits]);

  const questionMeta = useMemo(() => {
    const ranges: Record<string, QuestionRange> = {};
    const items: QuestionItem[] = [];
    let n = 0;

    for (const u of allMainUnits) {
      if (!isQuestionUnit(u)) continue;
      const subIds = questionSubIds(u).filter(Boolean);

      const start = n + 1;
      if (subIds.length === 0) {
        n += 1;
        ranges[u.id] = { start, end: n };
        items.push({ unitId: u.id, subId: null, number: n });
        continue;
      }

      for (const subId of subIds) {
        n += 1;
        items.push({ unitId: u.id, subId, number: n });
      }
      ranges[u.id] = { start, end: n };
    }

    return { ranges, items };
  }, [allMainUnits]);

  const questionItemsByUnitId = useMemo(() => {
    const by = new Map<string, QuestionItem[]>();
    for (const it of questionMeta.items) {
      const arr = by.get(it.unitId);
      if (arr) arr.push(it);
      else by.set(it.unitId, [it]);
    }
    return by;
  }, [questionMeta.items]);

  const questionItemsByPartId = useMemo(() => {
    const by = new Map<string, QuestionItem[]>();
    for (const it of questionMeta.items) {
      const pid = unitToPartId.get(it.unitId) ?? null;
      if (!pid) continue;
      const arr = by.get(pid);
      if (arr) arr.push(it);
      else by.set(pid, [it]);
    }
    return by;
  }, [questionMeta.items, unitToPartId]);

  const partStats = useMemo(() => {
    return parts.map((p) => {
      const items = questionItemsByPartId.get(p.id) ?? [];
      let answered = 0;
      for (const it of items) {
        const u = unitById.get(it.unitId);
        if (u && isAnswered(u, answers[it.unitId], it.subId)) answered += 1;
      }
      const start = items[0]?.number ?? null;
      const end = items.length > 0 ? items[items.length - 1]!.number : null;
      return { ...p, total: items.length, answered, start, end };
    });
  }, [answers, parts, questionItemsByPartId, unitById]);

  const activeQuestionItems = useMemo(() => {
    if (activePartId) return questionItemsByPartId.get(activePartId) ?? [];
    return questionMeta.items;
  }, [activePartId, questionItemsByPartId, questionMeta.items]);

  const activeRangeLabel = useMemo(() => {
    if (activeQuestionItems.length === 0) return null;
    const start = activeQuestionItems[0]!.number;
    const end = activeQuestionItems[activeQuestionItems.length - 1]!.number;
    return start === end ? `Question ${start}` : `Questions ${start}-${end}`;
  }, [activeQuestionItems]);

  const answeredCount = useMemo(() => {
    let count = 0;
    for (const it of questionMeta.items) {
      const u = unitById.get(it.unitId);
      if (u && isAnswered(u, answers[it.unitId], it.subId)) count += 1;
    }
    return count;
  }, [answers, questionMeta.items, unitById]);

  const scrollToUnit = (unitId: string) => {
    const pid = unitToPartId.get(unitId) ?? null;
    if (pid && pid !== activePartId) {
      setActivePartId(pid);
      window.setTimeout(() => {
        const el = document.getElementById(`unit-${unitId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      return;
    }

    const el = document.getElementById(`unit-${unitId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleUnitFlag = (unitId: string) => {
    const items = questionItemsByUnitId.get(unitId) ?? [];
    if (items.length === 0) return;

    setFlags((prev) => {
      const next = { ...prev };
      const anyFlagged = items.some((it) => next[qKey(it.unitId, it.subId)]);
      for (const it of items) {
        const k = qKey(it.unitId, it.subId);
        if (anyFlagged) delete next[k];
        else next[k] = true;
      }
      return next;
    });
  };

  const isUnitFlagged = (unitId: string): boolean => {
    const items = questionItemsByUnitId.get(unitId) ?? [];
    return items.some((it) => !!flags[qKey(it.unitId, it.subId)]);
  };

  const scrollQuestionBar = (dir: -1 | 1) => {
    const el = questionBarRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  const themeClass =
    contrast === 'invert' ? 'inspera-theme-invert' : contrast === 'yellow' ? 'inspera-theme-yellow' : 'inspera-theme-default';
  const textSizeClass = textSize === 'large' ? 'inspera-text-large' : textSize === 'xlarge' ? 'inspera-text-xlarge' : 'inspera-text-regular';
  const oneMinuteWarning = timeLeftSeconds != null && timeLeftSeconds <= 60;

  if (!sessionId || !sectionId) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">Invalid session URL</div>;
  }

  if (!loadedOnce && loading) {
    return (
      <div className={`${themeClass} ${textSizeClass} h-[100dvh] md:h-screen flex flex-col bg-[var(--inspera-bg)] text-[var(--inspera-text)] overflow-hidden`}>
        <header className="h-12 shrink-0 border-b border-[var(--inspera-border)] bg-[var(--inspera-panel)] flex items-center px-4">
          <div className="font-bold tracking-wide">TOEFLX</div>
          <div className="flex-1 flex items-center justify-center">
            <div className="h-4 w-24 bg-black/10 rounded" />
          </div>
          <div className="h-9 w-24 bg-black/10 rounded" />
        </header>
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <div className="text-sm text-[var(--inspera-muted)]">Loading section...</div>
        </div>
        <footer className="shrink-0 border-t border-[var(--inspera-border)] bg-[var(--inspera-panel)] px-4 py-3">
          <div className="h-9 bg-black/10 rounded" />
          <div className="mt-2 h-9 bg-black/10 rounded" />
        </footer>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900">Exam</h1>
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</div>
          <div className="mt-6 flex gap-2">
            <button
              onClick={() => navigate(isCandidateRoute ? '/' : '/dashboard', { replace: true })}
              className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-medium"
            >
              {isCandidateRoute ? 'Back to Landing' : 'Back to Dashboard'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${themeClass} ${textSizeClass} h-[100dvh] md:h-screen flex flex-col bg-[var(--inspera-bg)] text-[var(--inspera-text)] overflow-hidden`}>
      {draftRecovery && (
        <div role="alert" className="shrink-0 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>This tab has {Object.keys(draftRecovery.answers).length} answer draft(s) that the server has not confirmed.
            {draftRecovery.conflicts > 0 ? ' Some saved answers changed. Restoring will replace those answers when you retry saving.' : ' Choose what to recover before continuing.'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="min-h-[44px] rounded border border-amber-800 px-3 py-2 font-semibold" onClick={() => {
              answerSnapshotRef.current = { ...answerSnapshotRef.current, ...draftRecovery.answers };
              setAnswers(answerSnapshotRef.current);
              setDraftRecovery(null);
              setAutosaveError('Your draft has been recovered in this tab. Retry saving to confirm it on the server.');
            }}>Restore tab draft</button>
            <button type="button" className="min-h-[44px] rounded border border-amber-800 px-3 py-2 font-semibold" onClick={() => {
              draftStoreRef.current?.clear(); setDraftRecovery(null);
            }}>Use server answers</button>
          </div>
        </div>
      )}
      {draftWarning && <div role="status" className="shrink-0 bg-amber-50 px-4 py-2 text-sm text-amber-950">{draftWarning}</div>}
      {(submissionError || autosaveError) && (
        <div role="alert" className="shrink-0 border-b border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p>{submissionError ?? autosaveError}</p>
          <button type="button" disabled={submitting || loading || Boolean(draftRecovery)} className="mt-2 min-h-[44px] rounded border border-red-700 px-3 py-2 font-semibold disabled:opacity-50" onClick={() => {
            if (submissionError) void submitSection(false);
            else void retrySaving();
          }}>
            {submissionError ? 'Retry submission' : 'Retry saving'}
          </button>
          {timeLeftSeconds === 0 && !draftRecovery && (
            <div className="mt-3">
              <p>The section time has ended. Only answers confirmed by the server will count. Unsaved changes cannot be added after the deadline. Keep a copy of any unsaved work before continuing.</p>
              <button type="button" disabled={submitting || loading} className="mt-2 min-h-[44px] rounded border border-red-700 px-3 py-2 font-semibold disabled:opacity-50" onClick={() => void continueWithSavedAnswers()}>Continue with saved answers</button>
            </div>
          )}
        </div>
      )}
      <header
        className={`h-12 shrink-0 border-b border-[var(--inspera-border)] bg-[var(--inspera-panel)] flex items-center px-4 gap-4 ${
          oneMinuteWarning ? 'bg-amber-50 border-amber-200' : ''
        }`}
      >
        <div className="min-w-0 flex items-center gap-3">
          <div className="font-bold tracking-wide">TOEFLX</div>
          <div className="hidden sm:block text-xs text-[var(--inspera-muted)] truncate">
            {experience?.name ?? 'Exam'} {section?.name ? `| ${section.name}` : ''}
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center min-w-0">
          <div className="text-sm font-semibold">
            {timeLeftSeconds != null ? (
              <span className={oneMinuteWarning ? 'text-amber-700' : ''}>{formatClock(timeLeftSeconds)} left</span>
            ) : (
              <span className="text-[var(--inspera-muted)]">--:-- left</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isListening ? (
            <div className="hidden md:flex items-center gap-2 px-2 py-1 rounded border border-[var(--inspera-border)] bg-[var(--inspera-panel)]">
              <Volume2 size={16} className="text-[var(--inspera-muted)]" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => setVolume(clamp01(Number(e.target.value)))}
              />
            </div>
          ) : null}

          {isReading ? (
            <button
              type="button"
              onClick={() => setMobilePassageOpen((v) => !v)}
              className={`md:hidden h-9 w-9 inline-flex items-center justify-center rounded border ${
                mobilePassageOpen
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-[var(--inspera-panel)] border-[var(--inspera-border)] hover:bg-gray-50'
              }`}
              title={mobilePassageOpen ? 'Hide passage' : 'Show passage'}
              aria-label={mobilePassageOpen ? 'Hide passage' : 'Show passage'}
            >
              <BookOpen size={16} />
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="h-9 w-9 inline-flex items-center justify-center rounded border border-[var(--inspera-border)] bg-[var(--inspera-panel)] hover:bg-gray-50"
            title="Notes"
          >
            <StickyNote size={16} />
          </button>

          <button
            type="button"
            onClick={() => setOptionsOpen((v) => !v)}
            className="h-9 w-9 inline-flex items-center justify-center rounded border border-[var(--inspera-border)] bg-[var(--inspera-panel)] hover:bg-gray-50"
            title="Options"
          >
            <Menu size={16} />
          </button>

          {isCandidate ? (
            <button
              type="button"
              onClick={handleAbandon}
              disabled={submitting || loading || Boolean(draftRecovery)}
              className="px-3 py-2 rounded border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 text-sm font-semibold"
            >
              Leave
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleNext}
            disabled={submitting || loading || Boolean(draftRecovery)}
            className="ml-1 px-3 py-2 rounded border border-[var(--inspera-border)] bg-[var(--inspera-panel)] hover:bg-gray-50 text-sm font-semibold"
            title={isLastSection ? 'Finish test' : 'Submit section'}
          >
            {isLastSection ? 'Finish' : 'Submit'}
          </button>
        </div>
      </header>

      {activeInstructionText ? (
        <div className="shrink-0 bg-[var(--inspera-panel)] border-b border-[var(--inspera-border)] px-4 py-3">
          <div className="text-xs text-[var(--inspera-muted)] font-semibold uppercase tracking-wider">Instructions</div>
          <div className="mt-2 text-sm whitespace-pre-wrap inspera-prose">{activeInstructionText}</div>
          {activeRangeLabel ? <div className="mt-2 text-xs text-[var(--inspera-muted)]">{activeRangeLabel}</div> : null}
        </div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-hidden flex relative">
        {loading ? (
          <div className="absolute inset-0 z-20 bg-black/5 backdrop-blur-[1px] flex items-center justify-center">
            <div className="px-4 py-2 rounded bg-[var(--inspera-panel)] border border-[var(--inspera-border)] shadow-sm text-sm font-semibold">
              Loading...
            </div>
          </div>
        ) : null}
        {isReading ? (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            <aside
              className={[
                mobilePassageOpen ? 'block' : 'hidden',
                'shrink-0 max-h-[42dvh] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] border-b border-[var(--inspera-border)] bg-[var(--inspera-panel)]',
                'md:block md:max-h-none md:overflow-y-auto md:w-[46%] md:min-w-[320px] md:border-b-0 md:border-r',
              ].join(' ')}
            >
              <div className="p-4 space-y-4">
                {visiblePassages.map((p) => {
                  const d: any = p.data ?? {};
                  const current = passageAnnotations[p.id] ?? [];
                  return (
                    <PassageViewer
                      key={p.id}
                      sessionId={sessionId}
                      unitId={p.id}
                      title={typeof d.title === 'string' ? d.title : null}
                      text={String(d.text ?? '')}
                      annotations={current}
                      onChange={(next) => {
                        setPassageAnnotations((prev) => ({ ...prev, [p.id]: next }));
                        lsSetJson(`toefl:passage_annotations:${sessionId}:${p.id}`, next);
                      }}
                    />
                  );
                })}
                {visiblePassages.length === 0 ? <div className="text-sm text-[var(--inspera-muted)]">No passage found for this part.</div> : null}
              </div>
            </aside>

            <main
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] bg-[var(--inspera-panel)]"
            >
              <div className="p-5 inspera-question space-y-4">
                {visibleRenderableUnits.map((u) => {
                  const range = questionMeta.ranges[u.id];
                  const flagged = isQuestionUnit(u) ? isUnitFlagged(u.id) : false;
                  return (
                    <div key={u.id} id={`unit-${u.id}`} className="scroll-mt-16 relative">
                      {isQuestionUnit(u) ? (
                        <button
                          type="button"
                          onClick={() => toggleUnitFlag(u.id)}
                          className={`absolute right-2 top-2 z-10 h-9 w-9 inline-flex items-center justify-center rounded border ${
                            flagged
                              ? 'bg-amber-50 border-amber-300 text-amber-800'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                          title={flagged ? 'Unflag' : 'Flag for review'}
                        >
                          <Bookmark size={16} />
                        </button>
                      ) : null}

                      <InputRenderer
                        unit={u}
                        value={answers[u.id]}
                        readOnly={isQuestionUnit(u) && (submitting || loading || timeLeftSeconds === 0 || Boolean(draftRecovery))}
                        onChange={(val) => queueSave(u, val)}
                        audioContext={accessToken ? { accessToken, sessionId, volume } : null}
                        questionNumber={range ? (range.start === range.end ? range.start : range) : undefined}
                      />
                    </div>
                  );
                })}
                {visibleRenderableUnits.length === 0 ? <div className="text-sm text-[var(--inspera-muted)]">No items in this part.</div> : null}
              </div>
            </main>
          </div>
        ) : (
          <main className="flex-1 min-h-0 overflow-y-auto bg-[var(--inspera-panel)]">
            <div className="p-5 max-w-5xl mx-auto inspera-question space-y-4">
              {visibleRenderableUnits.map((u) => {
                const range = questionMeta.ranges[u.id];
                const flagged = isQuestionUnit(u) ? isUnitFlagged(u.id) : false;
                return (
                  <div key={u.id} id={`unit-${u.id}`} className="scroll-mt-16 relative">
                    {isQuestionUnit(u) ? (
                      <button
                        type="button"
                        onClick={() => toggleUnitFlag(u.id)}
                        className={`absolute right-2 top-2 z-10 h-9 w-9 inline-flex items-center justify-center rounded border ${
                          flagged
                            ? 'bg-amber-50 border-amber-300 text-amber-800'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                        title={flagged ? 'Unflag' : 'Flag for review'}
                      >
                        <Bookmark size={16} />
                      </button>
                    ) : null}

                    <InputRenderer
                      unit={u}
                      value={answers[u.id]}
                      readOnly={isQuestionUnit(u) && (submitting || loading || timeLeftSeconds === 0 || Boolean(draftRecovery))}
                      onChange={(val) => queueSave(u, val)}
                      audioContext={accessToken ? { accessToken, sessionId, volume } : null}
                      questionNumber={range ? (range.start === range.end ? range.start : range) : undefined}
                    />
                  </div>
                );
              })}
              {visibleRenderableUnits.length === 0 ? <div className="text-sm text-[var(--inspera-muted)]">No items in this part.</div> : null}
            </div>
          </main>
        )}
      </div>

      <footer className="shrink-0 border-t border-[var(--inspera-border)] bg-[var(--inspera-panel)]">
        <div className="px-4 py-2 flex items-center justify-between gap-4 text-xs text-[var(--inspera-muted)]">
          <div>
            Section {currentSectionNumber} of {sections.length} | Answered {answeredCount}/{questionMeta.items.length}
          </div>
          <button
            type="button"
            onClick={() => setShowNavigator(true)}
            className="px-3 py-1.5 rounded border border-[var(--inspera-border)] text-[var(--inspera-text)] hover:bg-gray-50 font-semibold"
          >
            Review
          </button>
        </div>

        <div className="px-4 pb-3 space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            {partStats.map((p) => {
              const active = p.id === activePartId;
              const label = p.total > 0 ? `${p.answered}/${p.total}` : '0';
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActivePartId(p.id)}
                  className={`px-3 py-2 rounded border text-sm font-semibold whitespace-nowrap ${
                    active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                  title={p.start != null && p.end != null ? `${p.name}: ${p.start}-${p.end}` : p.name}
                >
                  {p.name} <span className="opacity-70 ml-1">{label}</span>
                </button>
              );
            })}
            {partStats.length === 0 ? <div className="text-sm text-[var(--inspera-muted)]">No parts.</div> : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-9 w-9 inline-flex items-center justify-center rounded border border-[var(--inspera-border)] bg-white hover:bg-gray-50"
              onClick={() => scrollQuestionBar(-1)}
              title="Scroll left"
            >
              <ChevronLeft size={18} />
            </button>

            <div ref={questionBarRef} className="flex-1 overflow-x-auto">
              <div className="flex items-end gap-1.5 min-w-max pb-1">
                {activeQuestionItems.map((it) => {
                  const u = unitById.get(it.unitId);
                  const answered = u ? isAnswered(u, answers[it.unitId], it.subId) : false;
                  const flagged = !!flags[qKey(it.unitId, it.subId)];
                  return (
                    <button
                      key={`${it.unitId}:${it.subId ?? ''}:${it.number}`}
                      type="button"
                      onClick={() => scrollToUnit(it.unitId)}
                      className={`relative h-9 w-9 rounded border text-sm font-bold ${
                        answered ? 'border-gray-900 text-gray-900' : 'border-gray-300 text-gray-800 hover:bg-gray-50'
                      }`}
                      title={flagged ? 'Flagged' : answered ? 'Answered' : 'Not answered'}
                    >
                      <span className={`absolute -top-1 left-1/2 -translate-x-1/2 h-1 w-7 rounded ${answered ? 'bg-gray-900' : 'bg-transparent'}`} />
                      {flagged ? <Bookmark size={12} className="absolute -right-1 -top-1 text-amber-600" /> : null}
                      {it.number}
                    </button>
                  );
                })}
                {activeQuestionItems.length === 0 ? <div className="text-sm text-[var(--inspera-muted)]">No questions.</div> : null}
              </div>
            </div>

            <button
              type="button"
              className="h-9 w-9 inline-flex items-center justify-center rounded border border-[var(--inspera-border)] bg-white hover:bg-gray-50"
              onClick={() => scrollQuestionBar(1)}
              title="Scroll right"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </footer>

      {optionsOpen ? (
        <div className="fixed inset-0 z-50" onClick={() => setOptionsOpen(false)}>
          <div
            className="absolute right-4 top-14 w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-sm text-gray-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 px-1 pb-2">Options</div>

            <div className="px-1 py-2 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-500 mb-2">Text size</div>
              <div className="flex gap-2">
                {(['regular', 'large', 'xlarge'] as TextSize[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTextSize(s)}
                    className={`px-2 py-1 rounded border text-xs font-semibold ${
                      textSize === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {s === 'regular' ? 'Regular' : s === 'large' ? 'Large' : 'Extra'}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-1 py-2 border-t border-gray-100">
              <div className="text-xs font-semibold text-gray-500 mb-2">Contrast</div>
              <div className="flex gap-2 flex-wrap">
                {(['default', 'invert', 'yellow'] as Contrast[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setContrast(c)}
                    className={`px-2 py-1 rounded border text-xs font-semibold ${
                      contrast === c ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {c === 'default' ? 'Default' : c === 'invert' ? 'White on black' : 'Yellow on black'}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-1 py-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  setOptionsOpen(false);
                  setShowNavigator(true);
                }}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
              >
                Review questions
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {notesOpen ? (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={() => setNotesOpen(false)}>
          <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Notes</div>
                <div className="text-lg font-bold text-gray-900 mt-1">Reading annotations</div>
                <div className="text-xs text-gray-500 mt-1">Notes and highlights are stored locally in your browser for now.</div>
              </div>
              <button
                type="button"
                className="w-full sm:w-auto px-3 py-2 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-50"
                onClick={() => setNotesOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {!isReading ? (
                <div className="text-sm text-gray-600">Notes are available in the Reading section.</div>
              ) : (
                visiblePassages.map((p) => {
                  const list = (passageAnnotations[p.id] ?? []).filter((a) => a.type === 'note');
                  const d: any = p.data ?? {};
                  return (
                    <div key={p.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="text-sm font-semibold text-gray-900">{String(d.title ?? 'Passage')}</div>
                      {list.length === 0 ? (
                        <div className="text-xs text-gray-500 mt-2">No notes yet.</div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {list.map((n) => (
                            <div key={n.id} className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded p-3">
                              <div className="text-xs text-gray-500 font-semibold mb-1">Note</div>
                              <div className="whitespace-pre-wrap">{n.note ?? ''}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showNavigator ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
          onClick={() => setShowNavigator(false)}
          >
          <div
            className="w-full max-w-4xl bg-white rounded-2xl border border-gray-200 shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Question Navigator</div>
                <div className="text-lg font-bold text-gray-900 mt-1">
                  Answered {answeredCount} of {questionMeta.items.length}
                </div>
              </div>
              <button
                className="w-full sm:w-auto px-3 py-2 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-50"
                type="button"
                onClick={() => setShowNavigator(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid grid-cols-4 sm:grid-cols-8 md:grid-cols-10 gap-2">
              {questionMeta.items.map((it) => {
                const u = unitById.get(it.unitId);
                const answered = u ? isAnswered(u, answers[it.unitId], it.subId) : false;
                const flagged = !!flags[qKey(it.unitId, it.subId)];
                return (
                  <button
                    key={`${it.unitId}:${it.subId ?? ''}:${it.number}`}
                    type="button"
                    onClick={() => {
                      setShowNavigator(false);
                      scrollToUnit(it.unitId);
                    }}
                    className={`h-10 rounded-lg border text-sm font-bold transition-colors relative ${
                      answered
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {flagged ? <Bookmark size={12} className="absolute right-1 top-1 text-amber-600" /> : null}
                    {it.number}
                  </button>
                );
              })}
              {questionMeta.items.length === 0 ? <div className="text-sm text-gray-600">No questions in this section.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
