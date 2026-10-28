import { useCallback, useEffect, useState } from 'react';
import type { OfflinePack, QueueEntry } from './model';
import { listEntries, loadPack, offlineSupported, onOfflineChange, type OfflineStoreErrorKind, OfflineStoreError } from './store';

/** navigator.onLine, kept current. */
export const useOnline = (): boolean => {
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
};

export type OfflineState = {
  supported: boolean;
  loading: boolean;
  pack: OfflinePack | null;
  entries: QueueEntry[];
  problem: OfflineStoreErrorKind | null;
  reload: () => void;
};

/**
 * The saved pack and queued answers for a learner (or, signed out, the most
 * recent pack and every queued answer on this device). Updates when they change.
 */
export const useOfflineState = (userId: string | null, enabled = true): OfflineState => {
  const supported = offlineSupported();
  const [state, setState] = useState<Omit<OfflineState, 'supported' | 'reload'>>({ loading: supported && enabled, pack: null, entries: [], problem: null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => onOfflineChange(reload), [reload]);

  useEffect(() => {
    if (!supported || !enabled) {
      setState({ loading: false, pack: null, entries: [], problem: supported ? null : 'unavailable' });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const pack = await loadPack(userId);
        const entries = await listEntries(userId ?? pack?.user_id ?? null);
        if (!cancelled) setState({ loading: false, pack, entries, problem: null });
      } catch (error) {
        if (!cancelled) setState({ loading: false, pack: null, entries: [], problem: error instanceof OfflineStoreError ? error.kind : 'failed' });
      }
    })();
    return () => { cancelled = true; };
  }, [supported, enabled, userId, tick]);

  return { supported, ...state, reload };
};
