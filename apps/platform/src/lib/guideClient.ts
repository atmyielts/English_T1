import {
  edgeBase,
  refreshAuthSession,
  supabase,
  supabaseAnonKey,
} from "./supabase";
import type {
  Answers,
  GuideFlow,
  Locale,
  MatchResult,
  Signal,
} from "../../../../supabase/functions/_shared/guide";
export type {
  GuideFlow,
  Locale,
} from "../../../../supabase/functions/_shared/guide";

export type GuideSession = {
  id: string;
  version_id: string;
  revision: number;
  locale: Locale;
  user_id: string | null;
  answers: Answers;
  check_answers: Record<string, string | null>;
  check_status: "undecided" | "started" | "completed" | "skipped";
  expires_at: string;
};
export type SessionResponse = {
  session: GuideSession;
  flow: GuideFlow;
  token?: string;
};
export type ResultResponse = Omit<MatchResult, "trace"> & {
  signals: Signal[];
  fallback: GuideFlow["fallback"];
};
export type GuideCredential = { id: string; token: string; expiresAt: string };
const storageKey = "schood.guide.session.v1";
let memoryCredential: GuideCredential | null = null;
export class GuideError extends Error {
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.status = status;
  }
}
export function readGuideCredential(): GuideCredential | null {
  let value = memoryCredential;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) value = JSON.parse(stored) as GuideCredential;
  } catch { /* Memory-only mode remains usable. */ }
  if (!value?.id || !value.token || Date.parse(value.expiresAt) <= Date.now()) {
    forgetGuideCredential();
    return null;
  }
  return value;
}
export function saveGuideCredential(value: GuideCredential) {
  memoryCredential = value;
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch { /* Resume is limited to this tab. */ }
}
export function forgetGuideCredential() {
  memoryCredential = null;
  try {
    localStorage.removeItem(storageKey);
  } catch { /* No storage permission. */ }
}
export async function guideRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    credential?: GuideCredential | null;
    retry?: boolean;
  } = {},
): Promise<T> {
  const session = (await supabase.auth.getSession()).data.session;
  const credential = options.credential;
  const response = await fetch(
    `${edgeBase}/guide${path}${
      credential
        ? `${path.includes("?") ? "&" : "?"}session=${
          encodeURIComponent(credential.id)
        }`
        : ""
    }`,
    {
      method: options.method ?? "GET",
      signal: AbortSignal.timeout(15000),
      headers: {
        apikey: supabaseAnonKey,
        authorization: `Bearer ${session?.access_token ?? supabaseAnonKey}`,
        "Content-Type": "application/json",
        ...(credential ? { "x-guide-token": credential.token } : {}),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    },
  );
  if (response.status === 401 && options.retry !== false && session) {
    const renewed = await refreshAuthSession();
    if (renewed) return guideRequest(path, { ...options, retry: false });
  }
  const data = await response.json().catch(() => ({
    error: "guide_request_failed",
  })) as T & {
    error?: string;
    validation?: { errors: string[] };
  };
  if (!response.ok) {
    throw new GuideError(
      data.error ?? data.validation?.errors.join(" · ") ??
        "guide_request_failed",
      response.status,
    );
  }
  return data;
}
export async function startGuide(locale: Locale): Promise<SessionResponse> {
  const campaign = new URLSearchParams(location.search).get("campaign") ??
    "direct";
  const response = await guideRequest<SessionResponse>("/sessions", {
    method: "POST",
    body: { locale, campaign },
  });
  if (!response.token) throw new GuideError("guide_request_failed", 500);
  saveGuideCredential({
    id: response.session.id,
    token: response.token,
    expiresAt: response.session.expires_at,
  });
  return response;
}
let bootstrap: Promise<SessionResponse> | null = null;
export function resumeGuide(locale: Locale): Promise<SessionResponse> {
  if (!bootstrap) {
    const credential = readGuideCredential();
    bootstrap = (credential
      ? guideRequest<SessionResponse>("/session", { credential })
      : startGuide(locale))
      .finally(() => {
        bootstrap = null;
      });
  }
  return bootstrap;
}
/** Analytics must never interrupt payment. Pending linkage is retried after returning. */
export async function linkGuidePayment(paymentId: string): Promise<void> {
  const credential = readGuideCredential();
  if (!credential) return;
  let offerId: string | null = null;
  try {
    offerId = sessionStorage.getItem("schood.guide.checkoutOffer");
  } catch {
    return;
  }
  if (!offerId) return;
  try {
    sessionStorage.setItem("schood.guide.pendingPayment", paymentId);
  } catch { /* Best effort. */ }
  try {
    await guideRequest("/payment", {
      method: "POST",
      credential,
      body: { paymentId, offerId },
    });
    sessionStorage.removeItem("schood.guide.pendingPayment");
  } catch {
    /* The verified payment remains intact; retry on the recommendation page. */
  }
}
