import { useSyncExternalStore } from 'react';
import { entryScriptFrom, isIosDevice, isNewBuild, manifestFor } from './pwaManifest';

/**
 * Installable-app runtime: the browser's install prompt, the per-skill manifest
 * swap, service-worker registration and "new version" detection.
 * Call installPwa() once, before React renders, so an early install prompt is not missed.
 */

type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type PwaSnapshot = {
  /** The browser offered installation and we hold its prompt. */
  canPrompt: boolean;
  /** The app was installed during this visit. */
  installed: boolean;
  /** Running as an installed app (home screen / desktop window). */
  standalone: boolean;
  /** iPhone or iPad: installation is manual (Share → Add to Home Screen). */
  ios: boolean;
  /** A newer build is live; a reload picks it up. */
  updateReady: boolean;
};

const VISITS_KEY = 'schood.english.visits';
const VISIT_COUNTED_KEY = 'schood.english.visitCounted';
const CARD_DISMISSED_KEY = 'schood.english.installCardDismissed';
const UPDATE_CHECK_MS = 30 * 60 * 1000;

let deferred: BeforeInstallPromptEvent | null = null;
let snapshot: PwaSnapshot = { canPrompt: false, installed: false, standalone: false, ios: false, updateReady: false };
const listeners = new Set<() => void>();

const set = (patch: Partial<PwaSnapshot>) => {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const usePwa = (): PwaSnapshot => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);

const detectStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const media = (query: string) => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  return media('(display-mode: standalone)') || media('(display-mode: minimal-ui)')
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
};

const readNumber = (key: string): number => {
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
};

/** Counts one visit per browser session. */
const recordVisit = () => {
  try {
    if (window.sessionStorage.getItem(VISIT_COUNTED_KEY)) return;
    window.sessionStorage.setItem(VISIT_COUNTED_KEY, '1');
    window.localStorage.setItem(VISITS_KEY, String(readNumber(VISITS_KEY) + 1));
  } catch {
    // Storage blocked (private mode): the install card simply stays hidden.
  }
};

export const visitCount = (): number => (typeof window === 'undefined' ? 0 : readNumber(VISITS_KEY));

export const installCardDismissed = (): boolean => {
  try {
    return window.localStorage.getItem(CARD_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

export const dismissInstallCard = () => {
  try {
    window.localStorage.setItem(CARD_DISMISSED_KEY, '1');
  } catch {
    // Not remembered; the learner can dismiss again next time.
  }
};

/** Shows the browser's install dialog for the app this page offers. */
export const promptInstall = async (): Promise<InstallOutcome> => {
  const event = deferred;
  if (!event) return 'unavailable';
  deferred = null;
  set({ canPrompt: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
};

const setHead = (selector: string, create: () => HTMLElement, attribute: string, value: string) => {
  let element = document.head.querySelector<HTMLElement>(selector);
  if (!element) {
    element = create();
    document.head.appendChild(element);
  }
  if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
};

/**
 * Inside /<skill> the page offers that skill's own app ("Schood Speaking"); elsewhere, Schood English.
 * An installed app keeps the identity it was installed with.
 */
export const applyManifest = (pathname: string) => {
  if (typeof document === 'undefined' || snapshot.standalone) return;
  const app = manifestFor(pathname);
  const make = (tag: string, attrs: Record<string, string>) => () => {
    const element = document.createElement(tag);
    Object.entries(attrs).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  };
  setHead('link[rel="manifest"]', make('link', { rel: 'manifest' }), 'href', app.href);
  setHead('link[rel="apple-touch-icon"]', make('link', { rel: 'apple-touch-icon' }), 'href', app.appleIcon);
  setHead('meta[name="apple-mobile-web-app-title"]', make('meta', { name: 'apple-mobile-web-app-title' }), 'content', app.title);
  setHead('meta[name="theme-color"]', make('meta', { name: 'theme-color' }), 'content', app.themeColor);
};

const currentEntry = (): string | null =>
  document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? null;

let lastCheck = 0;

/** Compares the live index.html with the one this page booted from. */
const checkForUpdate = async (registration: ServiceWorkerRegistration | null) => {
  if (snapshot.updateReady || !navigator.onLine || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
  lastCheck = Date.now();
  void registration?.update().catch(() => undefined);
  const current = currentEntry();
  if (!current) return;
  try {
    const response = await fetch('/', { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'text/html' } });
    if (!response.ok) return;
    if (isNewBuild(current, entryScriptFrom(await response.text()))) set({ updateReady: true });
  } catch {
    // Offline or blocked: try again later.
  }
};

let installedOnce = false;

export const installPwa = () => {
  if (installedOnce || typeof window === 'undefined') return;
  installedOnce = true;

  set({
    standalone: detectStandalone(),
    ios: isIosDevice(navigator.userAgent, navigator.platform ?? '', navigator.maxTouchPoints ?? 0),
  });
  recordVisit();
  applyManifest(window.location.pathname);
  // "Download for offline" reads the build files this page loaded from resource timing; keep room for them.
  try {
    performance.setResourceTimingBufferSize?.(1000);
  } catch {
    // Not supported: the entry script and styles are still found from the document.
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => set({ standalone: detectStandalone() }));
  }

  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        lastCheck = Date.now();
        const check = () => { if (document.visibilityState === 'visible') void checkForUpdate(registration); };
        document.addEventListener('visibilitychange', check);
        window.setInterval(check, UPDATE_CHECK_MS);
      })
      .catch(() => undefined);
  });
};

/**
 * Asks the service worker to keep the app shell and every script and style this
 * page has loaded so far (including lazy pages already opened), so the app can
 * start offline. Used by "Download for offline". Same-origin build files only;
 * the worker ignores anything else and never caches API responses.
 */
export const warmAppShell = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  const origin = window.location.origin;
  const urls = new Set<string>(['/']);
  const add = (raw: string | null | undefined) => {
    if (!raw) return;
    try {
      const url = new URL(raw, origin);
      if (url.origin === origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) urls.add(url.pathname);
    } catch {
      // Not a URL.
    }
  };
  document.querySelectorAll<HTMLScriptElement>('script[src]').forEach((element) => add(element.getAttribute('src')));
  document.querySelectorAll<HTMLLinkElement>('link[href]').forEach((element) => add(element.getAttribute('href')));
  try {
    performance.getEntriesByType('resource').forEach((entry) => add(entry.name));
  } catch {
    // Older browsers: the entry script and styles above still go in.
  }
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 4000)),
  ]).catch(() => null);
  const worker = ready?.active ?? navigator.serviceWorker.controller;
  if (!worker) return false;
  worker.postMessage({ type: 'warm-cache', urls: [...urls].slice(0, 300) });
  return true;
};

/** Reload into the newest build (page loads are network-first, so this always fetches it). */
export const reloadForUpdate = () => window.location.reload();

/** Hide the update prompt; the next check (at most every 30 minutes) may show it again. */
export const postponeUpdate = () => set({ updateReady: false });
