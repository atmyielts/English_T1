import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { planItemStart, type PlanItem } from './api';

/** Start any plan item through the server (drill, module or review); one start at a time. */
export function usePlanStart(accessToken: string | null, onDone: () => void) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<'nothing_due' | null>(null);
  const guard = useRef(false);
  const start = async (item: PlanItem) => {
    if (!accessToken || guard.current) return;
    guard.current = true; setBusy(item.id); setError(null); setNotice(null);
    try {
      const result = await planItemStart(accessToken, item.id);
      if (result.completed) { setNotice('nothing_due'); onDone(); return; }
      navigate(`/lab/${result.attempt.id}`, { state: { selection: result.selection ?? null } });
    } catch (failure) {
      setError(failure);
    } finally {
      guard.current = false; setBusy(null);
    }
  };
  return { start, busy, error, notice };
}
