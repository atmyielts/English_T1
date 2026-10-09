import { useEffect, useRef, useState } from 'react';
import { getAuthSession, refreshAuthSession, supabase } from './supabase';
import {
  type IssuedVoucherBatch,
  partnerOfficeCancelVoucherRequest,
  partnerOfficeCreateVoucherBatch,
} from './platformClient';
import {
  finishVoucherAttempt,
  readVoucherAttempt,
  saveVoucherAttempt,
  type VoucherAttempt,
  voucherChoices,
} from './voucher-attempt';
const actorSession = async () => {
  const session = await getAuthSession() ?? await refreshAuthSession();
  if (!session?.user?.id || !session.access_token) throw Error('Sign in again to recover your voucher request.');
  return session;
};
export function useVoucherIssue(
  tenant: string | null,
  onIssued: (result: IssuedVoucherBatch) => Promise<void>,
  onNotice: (message: string) => void,
) {
  const [pending, setPending] = useState<VoucherAttempt | null>(null),
    [problem, setProblem] = useState<string | null>(null),
    [ready, setReady] = useState(false),
    [actor, setActor] = useState<string | null>(null);
  const record = useRef<VoucherAttempt | null>(null),
    inFlight = useRef(false),
    epoch = useRef(0),
    scope = useRef(tenant);
  const restoredActor = useRef<string | null>(null);
  scope.current = tenant;
  const callbacks = useRef({ onIssued, onNotice });
  callbacks.current = { onIssued, onNotice };
  const put = (value: VoucherAttempt | null) => {
    record.current = value;
    setPending(value);
  };
  const restore = async () => {
    const version = epoch.current, center = scope.current;
    if (!center) {
      put(null);
      setActor(null);
      restoredActor.current = null;
      setReady(false);
      return;
    }
    try {
      const session = await actorSession();
      if (version !== epoch.current || scope.current !== center) return;
      restoredActor.current = session.user.id;
      setActor(session.user.id);
      put(readVoucherAttempt(session.user.id, center));
      setProblem(null);
    } catch (error) {
      if (version === epoch.current) {
        put(null);
        setActor(null);
        restoredActor.current = null;
        setProblem(error instanceof Error ? error.message : 'Voucher recovery is unavailable.');
      }
    } finally {
      if (version === epoch.current) setReady(true);
    }
  };
  useEffect(() => {
    epoch.current++;
    put(null);
    setProblem(null);
    setReady(false);
    void restore();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id === restoredActor.current) return;
      epoch.current++;
      put(null);
      setActor(null);
      restoredActor.current = null;
      setReady(false);
      void restore();
    });
    return () => {
      epoch.current++;
      data.subscription.unsubscribe();
    };
  }, [tenant]);
  const execute = async (value: VoucherAttempt, mode: 'issue' | 'cancel') => {
    if (inFlight.current) throw Error('This voucher request is already being checked.');
    inFlight.current = true;
    const version = epoch.current;
    try {
      const session = await actorSession();
      if (version !== epoch.current || scope.current !== value.tenant || session.user.id !== value.actor) {
        throw Error('Recover this voucher request in the account and center that started it.');
      }
      put(value);
      const result = mode === 'issue'
        ? await partnerOfficeCreateVoucherBatch(session.access_token, { ...value.choices, idempotency_key: value.key })
        : await partnerOfficeCancelVoucherRequest(session.access_token, {
          ...value.choices,
          idempotency_key: value.key,
        });
      const current = await actorSession();
      if (version !== epoch.current || scope.current !== value.tenant || current.user.id !== value.actor) {
        throw Error('The signed-in account or center changed. Recover the original voucher request in its account.');
      }
      if (result.idempotency_key !== value.key) {
        throw Error('The recorded voucher response is unavailable. Resume the original request.');
      }
      if (result.state === 'canceled' && mode === 'cancel') {
        finishVoucherAttempt(value);
        put(null);
        callbacks.current.onNotice('No batch was created. The original request is closed; you can change its choices.');
        return;
      }
      if (
        result.state !== 'issued' || typeof result.deduped !== 'boolean' || result.batch?.tenant_id !== value.tenant ||
        result.batch?.created_by !== value.actor ||
        !result.batch?.id || result.batch.quantity !== value.choices.quantity || !Array.isArray(result.vouchers) ||
        result.vouchers.length !== value.choices.quantity
      ) {
        throw Error('The recorded batch response is unavailable. Resume the original request.');
      }
      finishVoucherAttempt(value);
      put(null);
      // Receipt confirmation is separate from inventory refresh. A failed refresh
      // must never report that this already-committed purchase needs re-creation.
      try {
        await callbacks.current.onIssued(result);
      } catch {
        if (version === epoch.current && scope.current === value.tenant) {
          callbacks.current.onNotice(
            `Batch ${result.batch.batch_code} was created. Refresh recorded batches to view it.`,
          );
        }
      }
    } finally {
      inFlight.current = false;
    }
  };
  const start = async (raw: Record<string, unknown>) => {
    if (!tenant || !ready || problem || record.current || inFlight.current) {
      throw Error('Resume or close the saved voucher request before creating another.');
    }
    inFlight.current = true;
    let value: VoucherAttempt;
    try {
      const version = epoch.current, session = await actorSession();
      if (version !== epoch.current || scope.current !== tenant) {
        throw Error('The account or center changed. Review your voucher choices.');
      }
      const saved = readVoucherAttempt(session.user.id, tenant);
      if (saved) {
        put(saved);
        throw Error('Resume or close the saved voucher request before creating another.');
      }
      value = {
        version: 1,
        actor: session.user.id,
        tenant,
        key: crypto.randomUUID(),
        choices: voucherChoices(raw, tenant),
      };
      saveVoucherAttempt(value);
      put(value);
    } finally {
      inFlight.current = false;
    }
    return execute(value, 'issue');
  };
  const resume = async (mode: 'issue' | 'cancel' = 'issue') => {
    if (!record.current) throw Error('The original voucher reference is unavailable. Check recorded batches.');
    return execute(record.current, mode);
  };
  return { actor, pending, problem, ready, start, resume, recover: restore };
}
