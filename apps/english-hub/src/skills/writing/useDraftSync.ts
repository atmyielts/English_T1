import { useCallback, useEffect, useRef, useState } from 'react';
import { chooseDraft, type DraftCopy } from '../../../../../supabase/functions/_shared/english-writing-depth.ts';
import { saveWritingDraft } from './api';

/**
 * The writing editor's text, kept in two places: this device (instantly, so
 * nothing is lost offline) and the learner's account (a few seconds after
 * typing stops, so the draft continues on any device). When the page opens,
 * the newer of the two copies is shown.
 */

// v2 stores {text, at}; the older key held plain text and is read once, then removed.
const storageKey = (slug: string) => `schood.english.writing.draft.v2.${slug}`;
const legacyKey = (slug: string) => `schood.english.writing.draft.${slug}`;
const LOCAL_DELAY_MS = 600;
const SERVER_DELAY_MS = 2500;

export type DraftSaveState = 'idle' | 'pending' | 'saving' | 'account' | 'device' | 'error';

const readLocal = (slug: string): DraftCopy | null => {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (raw) {
      const parsed = JSON.parse(raw) as { text?: unknown; at?: unknown };
      if (typeof parsed.text === 'string') return { text: parsed.text, at: typeof parsed.at === 'string' ? parsed.at : null };
    }
    // Older app versions stored the plain text without a time.
    const legacy = window.localStorage.getItem(legacyKey(slug));
    return legacy ? { text: legacy, at: null } : null;
  } catch {
    return null;
  }
};

const writeLocal = (slug: string, text: string): boolean => {
  try {
    if (text.trim()) window.localStorage.setItem(storageKey(slug), JSON.stringify({ text, at: new Date().toISOString() }));
    else window.localStorage.removeItem(storageKey(slug));
    window.localStorage.removeItem(legacyKey(slug));
    return true;
  } catch {
    return false;
  }
};

export const useDraftSync = (slug: string, server: { text: string; updated_at: string | null } | null, ready: boolean) => {
  const [text, setTextState] = useState('');
  const [state, setState] = useState<DraftSaveState>('idle');
  const [restored, setRestored] = useState<'local' | 'server' | null>(null);
  const loadedFor = useRef<string | null>(null);
  const synced = useRef('');
  const latest = useRef('');
  const serverTimer = useRef<number | null>(null);
  const inFlight = useRef(false);

  // Start from the newer copy once the task has loaded.
  useEffect(() => {
    if (!ready || loadedFor.current === slug) return;
    loadedFor.current = slug;
    const serverCopy = server ? { text: server.text, at: server.updated_at } : null;
    const choice = chooseDraft(readLocal(slug), serverCopy);
    synced.current = serverCopy?.text ?? '';
    latest.current = choice.text;
    setTextState(choice.text);
    setRestored(choice.source === 'none' ? null : choice.source);
    setState(choice.text.trim() ? (choice.source === 'local' && choice.text !== synced.current ? 'device' : 'account') : 'idle');
  }, [ready, slug, server]);

  const pushToServer = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    const value = latest.current;
    if (value === synced.current) return;
    inFlight.current = true;
    setState('saving');
    let failed = false;
    try {
      await saveWritingDraft(slug, value);
      synced.current = value;
      setState(latest.current === value ? 'account' : 'pending');
    } catch {
      // Kept on this device; the next change or visit tries again.
      failed = true;
      setState('device');
    } finally {
      inFlight.current = false;
    }
    // The learner kept typing while this save was on its way.
    if (!failed && latest.current !== synced.current) {
      if (serverTimer.current !== null) window.clearTimeout(serverTimer.current);
      serverTimer.current = window.setTimeout(() => { void pushToServer(); }, SERVER_DELAY_MS);
    }
  }, [slug]);

  // Device copy quickly, account copy after a pause in typing.
  useEffect(() => {
    if (loadedFor.current !== slug) return;
    const local = window.setTimeout(() => { writeLocal(slug, text); }, LOCAL_DELAY_MS);
    if (text !== synced.current) {
      setState((current) => (current === 'saving' ? current : 'pending'));
      if (serverTimer.current !== null) window.clearTimeout(serverTimer.current);
      serverTimer.current = window.setTimeout(() => { void pushToServer(); }, SERVER_DELAY_MS);
    }
    return () => window.clearTimeout(local);
  }, [text, slug, pushToServer]);

  // Leaving the page or switching apps: save now.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden' && latest.current !== synced.current) void pushToServer();
    };
    document.addEventListener('visibilitychange', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      if (serverTimer.current !== null) window.clearTimeout(serverTimer.current);
      if (latest.current !== synced.current && loadedFor.current) void pushToServer();
    };
  }, [pushToServer]);

  const setText = useCallback((value: string) => {
    latest.current = value;
    setTextState(value);
  }, []);

  /** After a submit the server already holds this text. */
  const markSubmitted = useCallback((value: string) => {
    synced.current = value;
    if (serverTimer.current !== null) window.clearTimeout(serverTimer.current);
    setState('account');
  }, []);

  return { text, setText, state, restored, markSubmitted };
};
