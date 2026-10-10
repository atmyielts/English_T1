import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
export type CoachingQuota = {
  api_version: number;
  used: number;
  limit: number;
  remaining: number;
  has_paid_access: boolean;
  addon_available: boolean;
  enabled: boolean;
  attempts_remaining: number;
};
type Receipt = { id: string; key: string };
class CoachingError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
export function useAiCoaching<Result extends { session_id: string }, History>(
  service: "writing-tutor" | "speaking-coach",
  onAccountChange?: () => void,
) {
  const title = service === "writing-tutor"
    ? "Writing Tutor"
    : "Speaking Coach";
  const action = service === "writing-tutor" ? "grade" : "score";
  const savedResult = (value: Record<string, unknown> | null) =>
    Boolean(value?.session_id) &&
    (service === "writing-tutor" ||
      value?.assessment_scope === "transcript_only");
  const [quota, setQuota] = useState<CoachingQuota | null>(null),
    [history, setHistory] = useState<History[]>([]);
  const [quotaError, setQuotaError] = useState<string | null>(null),
    [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null),
    [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false),
    [loading, setLoading] = useState(true);
  const [accountVersion, setAccountVersion] = useState(0);
  const authorityVersion = useRef({ version: 0 });
  const requests = useRef(new Set<AbortController>());
  const accountChanged = useRef(onAccountChange);
  useEffect(() => {
    accountChanged.current = onAccountChange;
  }, [onAccountChange]);
  const guard = useRef(false),
    actor = useRef(""),
    receipt = useRef<Receipt | null>(null);
  const storageKey = useCallback(
    () => `schood.${service}.request.${actor.current}`,
    [service],
  );
  const bindActor = useCallback((id: string) => {
    if (actor.current) return;
    actor.current = id;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey()) || "null");
      if (
        saved && /^[0-9a-f-]{36}$/i.test(saved.id) &&
        /^[0-9a-f]{64}$/.test(saved.key)
      ) {
        receipt.current = saved;
        setPending(true);
      }
    } catch { /* Never store transcript text. */ }
  }, [storageKey]);
  const api = useCallback(async (action: string, body?: unknown) => {
    const version = authorityVersion.current.version;
    const { data, error: authError } = await supabase.auth.getSession();
    if (version !== authorityVersion.current.version) {
      throw new CoachingError("Your account changed. Retry after signing in.");
    }
    if (authError || !data.session) {
      throw new CoachingError(
        "Sign in again to continue. Copy your draft before leaving this page.",
      );
    }
    bindActor(data.session.user.id);
    if (actor.current !== data.session.user.id) {
      throw new CoachingError(
        "Your account changed. Copy your draft and reload before continuing.",
      );
    }
    const controller = new AbortController();
    requests.current.add(controller);
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${service}?action=${action}`,
        {
          method: body ? "POST" : "GET",
          signal: controller.signal,
          headers: {
            Authorization: "Bearer " + data.session.access_token,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      const value = await response.json();
      if (version !== authorityVersion.current.version) {
        throw new CoachingError(
          "Your account changed. Retry after signing in.",
        );
      }
      if (!response.ok) {
        throw new CoachingError(
          value.error || "The service is unavailable. Your draft is unchanged.",
          value.code,
        );
      }
      return value;
    } finally {
      clearTimeout(timeout);
      requests.current.delete(controller);
    }
  }, [bindActor, service]);
  const refreshQuota = useCallback(async () => {
    try {
      const value = await api("quota");
      if (value.api_version !== 2) {
        throw new Error(
          title +
            " is being updated. Feedback will resume when the service is ready.",
        );
      }
      setQuota(value);
      setQuotaError(null);
    } catch (e) {
      setQuota(null);
      setQuotaError(
        e instanceof Error ? e.message : "Could not load allowance.",
      );
    }
  }, [api, title]);
  const refreshHistory = useCallback(async () => {
    try {
      const value = await api("history");
      if (!Array.isArray(value.sessions)) throw new Error();
      setHistory(value.sessions);
      setHistoryError(null);
    } catch {
      setHistoryError(
        "History could not be loaded. Retry to see your saved sessions.",
      );
    }
  }, [api]);
  const clearPending = () => {
    setPending(false);
    try {
      sessionStorage.removeItem(storageKey());
    } catch { /* Storage is optional. */ }
  };
  useEffect(() => {
    const authority = authorityVersion.current,
      ownedRequests = requests.current;
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (actor.current && actor.current !== session?.user.id) {
          authority.version++;
          for (const request of ownedRequests) request.abort();
          actor.current = "";
          receipt.current = null;
          setHistory([]);
          setResult(null);
          setQuota(null);
          setPending(false);
          setAccountVersion((value) => value + 1);
          accountChanged.current?.();
          setQuotaError(
            "Your account changed. Sign in and retry the allowance to continue.",
          );
        }
      },
    );
    void (async () => {
      try {
        const { data, error: authError } = await supabase.auth.getSession();
        if (authError || !data.session) {
          throw new Error(
            "Sign in to use " + title +
              ". Your draft can stay here until you are ready.",
          );
        }
        bindActor(data.session.user.id);
        await Promise.allSettled([refreshQuota(), refreshHistory()]);
      } catch (e) {
        setQuotaError(
          e instanceof Error
            ? e.message
            : "Account verification failed. Reload to retry.",
        );
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      subscription.subscription.unsubscribe();
      authority.version++;
      for (const request of ownedRequests) request.abort();
    };
  }, [bindActor, refreshHistory, refreshQuota, service, title]);
  const submit = async (body: Record<string, unknown>) => {
    if (
      guard.current || pending || !quota?.enabled || quota.api_version !== 2
    ) return;
    guard.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(body)),
      );
      const key = Array.from(
        new Uint8Array(digest),
        (v) => v.toString(16).padStart(2, "0"),
      ).join("");
      if (receipt.current?.key !== key) {
        receipt.current = { id: crypto.randomUUID(), key };
      }
      try {
        sessionStorage.setItem(storageKey(), JSON.stringify(receipt.current));
      } catch { /* In-memory identity remains. */ }
      setPending(true);
      const value = await api(action, {
        ...body,
        request_id: receipt.current.id,
      });
      if (!savedResult(value)) {
        throw new Error(
          "Saved feedback could not be confirmed. Check the result.",
        );
      }
      setResult(value);
      clearPending();
      await refreshHistory();
    } catch (e) {
      setError(
        e instanceof CoachingError
          ? e.message
          : "The response was interrupted. Check the saved result before requesting feedback again.",
      );
    } finally {
      await refreshQuota();
      guard.current = false;
      setBusy(false);
    }
  };
  const checkResult = async () => {
    if (guard.current || !receipt.current) return;
    guard.current = true;
    setBusy(true);
    setError(null);
    try {
      const value = await api(
        "result&request_id=" + encodeURIComponent(receipt.current.id),
      );
      if (
        value.status === "succeeded" && savedResult(value.result)
      ) {
        setResult(value.result);
        clearPending();
        await refreshHistory();
      } else if (["cancelled", "failed"].includes(value.status)) {
        clearPending();
        receipt.current = null;
        setError(
          "This request did not produce feedback. You can start a new request.",
        );
      } else {setError(
          "The result is still unconfirmed. This request may count toward your allowance. Check again later.",
        );}
    } catch (e) {
      if (e instanceof CoachingError && e.code === "request_not_found") {
        clearPending();
        setError(
          "No saved request was found. Retry with the same reference; it will not duplicate a request received late.",
        );
      } else {setError(
          e instanceof CoachingError
            ? e.message
            : "Could not check the saved result.",
        );}
    } finally {
      await refreshQuota();
      guard.current = false;
      setBusy(false);
    }
  };
  return {
    quota,
    history,
    quotaError,
    historyError,
    error,
    result,
    busy,
    pending,
    loading,
    accountVersion,
    requestId: receipt.current?.id,
    refreshQuota,
    refreshHistory,
    submit,
    checkResult,
    clearResult: () => setResult(null),
    startSeparate: () => {
      if (guard.current) return;
      clearPending();
      receipt.current = null;
      setError(null);
    },
  };
}
