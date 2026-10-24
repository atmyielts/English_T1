import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { practiceContextGet, type PracticeContextSession } from './api';

// Context handed over by the IELTS Simulator, IELTS Playbook or the review
// queue: ?source=simulator|playbook|reviews&weak_skill=listening
// &focus_module=reading_matching_headings&session_id=<simulator session>
// (and the app's own ?focus_section / ?focus_question_type). It is kept for the
// browser tab so moving from /dashboard to /today keeps the focus.

export type FocusSkill = 'reading' | 'listening' | 'writing' | 'speaking';

export type PracticeContext = {
  source: string | null;
  skill: FocusSkill | null;
  /** question type without the "question_" prefix, e.g. matching_headings */
  questionType: string | null;
  sessionId: string | null;
};

const STORAGE_KEY = 'ielts_practice_context';
const SKILLS: FocusSkill[] = ['reading', 'listening', 'writing', 'speaking'];

const asSkill = (value: string | null | undefined): FocusSkill | null => {
  const text = String(value ?? '').trim().toLowerCase();
  return (SKILLS as string[]).includes(text) ? text as FocusSkill : null;
};

const cleanType = (value: string | null | undefined): string | null => {
  const text = String(value ?? '').trim().toLowerCase().replace(/^question_/, '').replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  return text || null;
};

/** Parse the URL parameters into one focus. Exported for tests. */
export const parsePracticeContext = (params: URLSearchParams): PracticeContext | null => {
  const focusModule = String(params.get('focus_module') ?? '').trim().toLowerCase();
  const moduleSkill = asSkill(focusModule.split(/[_-]/)[0]);
  const skill = asSkill(params.get('weak_skill')) ?? asSkill(params.get('focus_section')) ?? moduleSkill;
  const moduleType = moduleSkill ? cleanType(focusModule.slice(moduleSkill.length)) : null;
  const questionType = cleanType(params.get('focus_question_type')) ?? moduleType;
  const sessionRaw = String(params.get('session_id') ?? '').trim();
  const sessionId = /^[0-9a-f-]{36}$/i.test(sessionRaw) ? sessionRaw : null;
  const source = String(params.get('source') ?? '').trim().toLowerCase() || null;
  if (!skill && !sessionId) return null;
  return { source, skill, questionType: questionType && questionType !== 'task1' && questionType !== 'task2' ? questionType : null, sessionId };
};

const readStored = (): PracticeContext | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as PracticeContext : null;
  } catch {
    return null;
  }
};

const writeStored = (value: PracticeContext | null): void => {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable: the focus lasts for this page only
  }
};

export const usePracticeContext = (accessToken: string | null) => {
  const [params] = useSearchParams();
  const fromUrl = useMemo(() => parsePracticeContext(params), [params]);
  const [context, setContext] = useState<PracticeContext | null>(() => fromUrl ?? readStored());
  const [session, setSession] = useState<PracticeContextSession | null>(null);

  useEffect(() => {
    if (fromUrl) {
      setContext(fromUrl);
      writeStored(fromUrl);
    }
  }, [fromUrl]);

  useEffect(() => {
    let active = true;
    setSession(null);
    if (!accessToken || !context?.sessionId) return;
    practiceContextGet(accessToken, context.sessionId)
      .then((res) => { if (active) setSession(res.session); })
      .catch(() => { if (active) setSession(null); });
    return () => { active = false; };
  }, [accessToken, context?.sessionId]);

  const dismiss = () => {
    setContext(null);
    writeStored(null);
  };

  return { context, session, dismiss };
};
