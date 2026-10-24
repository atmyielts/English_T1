import { useEffect } from 'react';
import { useEnglish } from '../../app/EnglishContext';
import { offlineSupported } from '../../lib/offline/store';

/**
 * Sends answers saved in the offline session once the learner is signed in and
 * online: at start, when the connection comes back and when the tab is shown
 * again. Renders nothing. The sync code loads only when it is needed.
 */
export const OfflineSync = () => {
  const { session } = useEnglish();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId || !offlineSupported()) return;
    let cancelled = false;
    let retry: number | null = null;
    const sync = () => {
      if (cancelled || !navigator.onLine) return;
      if (retry !== null) window.clearTimeout(retry);
      retry = null;
      void import('../../lib/offline/sync')
        .then(({ syncNow }) => syncNow(userId))
        .then((report) => {
          // Answers waiting for a retry (server busy): look again in a minute while the tab is open.
          if (!cancelled && report && report.waiting > 0 && !report.stopped) retry = window.setTimeout(sync, 60_000);
        })
        .catch(() => undefined);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    // Let the page settle first; the sync is never urgent.
    const first = window.setTimeout(sync, 3000);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      if (retry !== null) window.clearTimeout(retry);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  return null;
};
