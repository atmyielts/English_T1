import { useCallback, useEffect, useRef, useState } from 'react';
import { logIntegrityEvent, type IntegrityEventInput, type IntegrityEventType, type IntegrityEventSeverity } from './platformClient';

export type StrictModeOptions = {
  enabled: boolean;
  accessToken: string | null;
  sessionId: string | null;
  sectionId: string | null;
  blockPaste: boolean;
  blockContextMenu: boolean;
  warnOnLeave: boolean;
};

export type StrictModeState = {
  fullscreen: boolean;
  fullscreenAvailable: boolean;
  fullscreenAsked: boolean;
  focusLossCount: number;
  pasteBlockedCount: number;
  lastEvent: { event_type: IntegrityEventType; at: string } | null;
};

export type LogEvent = (
  event_type: IntegrityEventType,
  data?: Record<string, unknown>,
  severity?: IntegrityEventSeverity,
) => void;

const isFullscreenAvailable = (): boolean => {
  if (typeof document === 'undefined') return false;
  return !!(document.documentElement?.requestFullscreen);
};

const requestEnterFullscreen = async (): Promise<boolean> => {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement;
  if (!el?.requestFullscreen) return false;
  try {
    await el.requestFullscreen();
    return true;
  } catch {
    return false;
  }
};

const requestExitFullscreen = async (): Promise<void> => {
  if (typeof document === 'undefined') return;
  if (!document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch {
    // ignore
  }
};

export const useStrictMode = (opts: StrictModeOptions): {
  state: StrictModeState;
  enterFullscreen: () => Promise<boolean>;
  exitFullscreen: () => Promise<void>;
  logEvent: LogEvent;
} => {
  const { enabled, accessToken, sessionId, sectionId, blockPaste, blockContextMenu, warnOnLeave } = opts;

  const [fullscreen, setFullscreen] = useState<boolean>(() => {
    if (typeof document === 'undefined') return false;
    return !!document.fullscreenElement;
  });
  const [fullscreenAvailable] = useState<boolean>(() => isFullscreenAvailable());
  const [fullscreenAsked, setFullscreenAsked] = useState(false);
  const [focusLossCount, setFocusLossCount] = useState(0);
  const [pasteBlockedCount, setPasteBlockedCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<StrictModeState['lastEvent']>(null);

  const enabledRef = useRef(enabled);
  const sessionRef = useRef(sessionId);
  const sectionRef = useRef(sectionId);
  const tokenRef = useRef(accessToken);
  const queueRef = useRef<IntegrityEventInput[]>([]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    sectionRef.current = sectionId;
  }, [sectionId]);
  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  // Flush queued events whenever auth becomes available.
  useEffect(() => {
    const flush = async () => {
      const token = tokenRef.current;
      if (!token) return;
      const queue = queueRef.current;
      if (queue.length === 0) return;
      queueRef.current = [];
      for (const payload of queue) {
        try {
          await logIntegrityEvent(token, payload);
        } catch {
          // best-effort
        }
      }
    };
    void flush();
  }, [accessToken]);

  const logEvent = useCallback<LogEvent>((event_type, data, severity) => {
    const sid = sessionRef.current;
    if (!sid) return;
    const payload: IntegrityEventInput = {
      session_id: sid,
      section_id: sectionRef.current ?? null,
      event_type,
      severity: severity ?? 'info',
      data: data ?? {},
    };
    setLastEvent({ event_type, at: new Date().toISOString() });
    const token = tokenRef.current;
    if (!token) {
      queueRef.current.push(payload);
      return;
    }
    void logIntegrityEvent(token, payload);
  }, []);

  // beforeunload warning while strict mode is active.
  useEffect(() => {
    if (!warnOnLeave) return;
    const handler = (event: BeforeUnloadEvent) => {
      if (!enabledRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [warnOnLeave]);

  // Visibility (tab switch / minimize) tracking.
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        logEvent('tab_hidden', {}, 'warn');
      } else if (document.visibilityState === 'visible') {
        logEvent('tab_visible');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, logEvent]);

  // Window focus / blur.
  useEffect(() => {
    if (!enabled) return;
    const onBlur = () => {
      setFocusLossCount((c) => c + 1);
      logEvent('focus_loss', {}, 'warn');
    };
    const onFocus = () => logEvent('focus_return');
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, logEvent]);

  // Fullscreen change tracking.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => {
      const isFs = !!document.fullscreenElement;
      setFullscreen(isFs);
      if (!enabledRef.current) return;
      logEvent(isFs ? 'fullscreen_enter' : 'fullscreen_exit', {}, isFs ? 'info' : 'warn');
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [logEvent]);

  // Block / log paste, copy, cut, contextmenu globally while strict.
  useEffect(() => {
    if (!enabled) return;

    const isWithinTextarea = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = (el.tagName ?? '').toUpperCase();
      if (tag === 'TEXTAREA') return true;
      if (tag === 'INPUT') return true;
      return !!el.closest?.('textarea, input');
    };

    const onPaste = (event: ClipboardEvent) => {
      const inField = isWithinTextarea(event.target);
      const length = event.clipboardData?.getData('text')?.length ?? 0;
      if (blockPaste && inField) {
        event.preventDefault();
        setPasteBlockedCount((c) => c + 1);
        logEvent('paste', { blocked: true, length, in_field: true }, 'high');
        return;
      }
      logEvent('paste', { blocked: false, length, in_field: inField }, 'warn');
    };
    const onCopy = (_event: ClipboardEvent) => {
      logEvent('copy', {}, 'info');
    };
    const onCut = (event: ClipboardEvent) => {
      const inField = isWithinTextarea(event.target);
      if (blockPaste && inField) {
        event.preventDefault();
        logEvent('cut', { blocked: true, in_field: true }, 'high');
        return;
      }
      logEvent('cut', { blocked: false, in_field: inField }, 'info');
    };
    const onContextMenu = (event: MouseEvent) => {
      if (blockContextMenu) {
        event.preventDefault();
        logEvent('context_menu', { blocked: true }, 'info');
        return;
      }
      logEvent('context_menu', { blocked: false }, 'info');
    };

    document.addEventListener('paste', onPaste, true);
    document.addEventListener('copy', onCopy, true);
    document.addEventListener('cut', onCut, true);
    document.addEventListener('contextmenu', onContextMenu);

    return () => {
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('copy', onCopy, true);
      document.removeEventListener('cut', onCut, true);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [enabled, blockPaste, blockContextMenu, logEvent]);

  // Heuristic devtools / window resize detection.
  useEffect(() => {
    if (!enabled) return;
    let timer: number | null = null;
    const check = () => {
      const widthGap = window.outerWidth - window.innerWidth;
      const heightGap = window.outerHeight - window.innerHeight;
      if (widthGap > 200 || heightGap > 200) {
        logEvent('devtools_suspected', { widthGap, heightGap }, 'warn');
      }
    };
    timer = window.setInterval(check, 5000);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [enabled, logEvent]);

  // Log a `reload` event on initial mount so admins can see refresh attempts. We
  // tag it with a session-scoped flag in sessionStorage so the same load doesn't
  // re-emit if the hook re-runs (e.g. dev StrictMode).
  useEffect(() => {
    if (!enabled || !sessionId) return;
    try {
      const key = `ielts:reload-logged:${sessionId}:${sectionId ?? ''}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
      logEvent('reload', { performance_navigation: (performance as any)?.navigation?.type ?? null });
    } catch {
      // ignore
    }
  }, [enabled, sessionId, sectionId, logEvent]);

  const enterFullscreen = useCallback(async (): Promise<boolean> => {
    setFullscreenAsked(true);
    return requestEnterFullscreen();
  }, []);

  const exitFullscreen = useCallback(async (): Promise<void> => {
    await requestExitFullscreen();
  }, []);

  return {
    state: { fullscreen, fullscreenAvailable, fullscreenAsked, focusLossCount, pasteBlockedCount, lastEvent },
    enterFullscreen,
    exitFullscreen,
    logEvent,
  };
};
