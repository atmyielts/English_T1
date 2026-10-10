import { useEffect, useRef, useState } from 'react';
import { checkoutAttempt, completeCheckoutAttempt, restoreCheckoutAttempt } from '../../../../packages/checkout-session/attempt';
import { getAuthSession, refreshAuthSession, supabase } from './supabase';
import { clickStatus, partnerOfficeCreateSeatPurchase, partnerOfficeCreateTicketPurchase,
  partnerOfficeCreateTierUpgradePayment, partnerOfficeCreateWalletTopup, PartnerOfficeRequestError, type ClickCreateResponse } from './platformClient';

export type OfficePurchaseKind = 'tickets' | 'seats' | 'wallet' | 'tier';
type Choices = Record<string, unknown>;
type Pending = { actor: string; key: string | null; kind: OfficePurchaseKind; choices: Choices;
  transactionId: string | null; paid: boolean; paymentUrl: string | null };
const paid = (status?: string | null) => ['paid', 'success', 'completed'].includes(String(status ?? '').toLowerCase());
const terminal = (status?: string | null) => ['failed', 'canceled', 'cancelled', 'expired'].includes(String(status ?? '').toLowerCase());
const kinds = ['tickets', 'seats', 'wallet', 'tier'];
const financialChoices = (body: Choices): Choices => Object.fromEntries([
  'tenant_id', 'center_office', 'experience_id', 'quantity', 'expires_in_days', 'plan_id', 'seat_count',
  'apply_credit', 'credit_amount', 'amount', 'currency', 'requested_tier', 'billing_period', 'note',
].filter(key => body[key] !== undefined).map(key => [key, body[key]]));
const actorSession = async () => {
  const session = await getAuthSession() ?? await refreshAuthSession();
  if (!session?.user?.id || !session.access_token) throw new Error('Sign in again to recover your purchase.');
  return session;
};
const trustedPaymentUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const value = new URL(url);
  if (value.protocol !== 'https:' || value.hostname !== 'my.click.uz' || value.pathname !== '/services/pay') {
    throw new Error('The recorded payment link is unavailable. Resume the same purchase.');
  }
  return value.toString();
};

// One visible purchase per office. Unknown responses remain recoverable with the
// same choices/key; recorded paid orders never reopen a provider payment page.
export function useOfficeCheckout(scope: 'center-office' | 'partner-office',
  onComplete: (kind: OfficePurchaseKind) => Promise<void>, onNotice: (message: string) => void) {
  const [pending, setPending] = useState<Pending | null>(null);
  const record = useRef<Pending | null>(null);
  const inFlight = useRef(false);
  const callbacks = useRef({ onComplete, onNotice });
  callbacks.current = { onComplete, onNotice };
  const put = (value: Pending | null) => { record.current = value; setPending(value); };
  const complete = async (value: Pending) => {
    completeCheckoutAttempt(value.actor, value.key);
    put(null);
    await callbacks.current.onComplete(value.kind);
  };
  const accept = async (value: Pending, result: { status?: string; grant_completed?: boolean; payment_url?: string | null }) => {
    if (record.current?.actor !== value.actor || record.current?.key !== value.key) return;
    const isPaid = paid(result.status);
    if (isPaid && result.grant_completed === true) { await complete(value); return; }
    if (!isPaid && terminal(result.status)) {
      completeCheckoutAttempt(value.actor, value.key); put(null);
      callbacks.current.onNotice('This unpaid checkout has ended. You can create a new purchase.'); return;
    }
    put({ ...value, paid: isPaid, paymentUrl: isPaid ? null : trustedPaymentUrl(result.payment_url ?? value.paymentUrl) });
    if (isPaid) callbacks.current.onNotice('Payment received. Activation is still pending. Do not pay again.');
  };
  const dispatch = async (kind: OfficePurchaseKind, token: string, body: Choices): Promise<ClickCreateResponse> => {
    if (kind === 'tickets') return partnerOfficeCreateTicketPurchase(token, body as Parameters<typeof partnerOfficeCreateTicketPurchase>[1]);
    if (kind === 'seats') return partnerOfficeCreateSeatPurchase(token, body as Parameters<typeof partnerOfficeCreateSeatPurchase>[1]);
    if (kind === 'tier') return partnerOfficeCreateTierUpgradePayment(token, body as Parameters<typeof partnerOfficeCreateTierUpgradePayment>[1]);
    const result = await partnerOfficeCreateWalletTopup(token, { ...body, settlement_mode: 'online' } as Parameters<typeof partnerOfficeCreateWalletTopup>[1]);
    if (!('transaction_id' in result)) throw new Error('This online purchase has no payment reference. Resume the same purchase.');
    return result;
  };
  const execute = async (value: Pending): Promise<ClickCreateResponse> => {
    if (inFlight.current) throw new Error('This purchase is already being checked.');
    inFlight.current = true;
    try {
      const session = await actorSession();
      if (session.user.id !== value.actor) throw new Error('Sign in with the account that started this purchase.');
      put(value);
      const url = new URL(scope === 'partner-office' ? '/partner' : '/center-office', window.location.origin);
      url.searchParams.set('kind', value.kind);
      const result = await dispatch(value.kind, session.access_token, { ...value.choices, idempotency_key: value.key, redirect_url: url.toString() });
      if (typeof result.transaction_id !== 'string' || !result.transaction_id) throw new Error('The purchase response is unavailable. Resume the same purchase.');
      if ((await actorSession()).user.id !== value.actor) throw new Error('The signed-in account changed. Recover this purchase in its original account.');
      const next = { ...value, transactionId: result.transaction_id };
      await accept(next, result);
      return { ...result, payment_url: paid(result.status) ? null : trustedPaymentUrl(result.payment_url) };
    } catch (error) {
      if (error instanceof PartnerOfficeRequestError && error.status === 400 && error.details
        && typeof error.details === 'object' && 'checkout_not_created' in error.details
        && error.details.checkout_not_created === true && record.current?.key === value.key && record.current.actor === value.actor) {
        // Retire only an explicit server proof of no created order. Network,
        // permission, conflict and uncertain responses retain the original key.
        completeCheckoutAttempt(value.actor, value.key); put(null);
      }
      throw error;
    } finally { inFlight.current = false; }
  };
  const start = async (kind: OfficePurchaseKind, body: Choices) => {
    if (record.current || inFlight.current) throw new Error('Resume or finish the recorded purchase before creating another.');
    // Reserve the mounted action before awaiting auth so double-clicks cannot
    // admit a second purchase while React's disabled state is still updating.
    inFlight.current = true;
    let value: Pending;
    try {
      const session = await actorSession(), choices = financialChoices(body);
      // A click arriving before the mount-time restore finishes cannot start a
      // different purchase and overwrite the saved recovery reference.
      const saved = restoreCheckoutAttempt(session.user.id, scope);
      if (record.current || saved) throw new Error('Resume the original saved purchase before creating another.');
      const key = checkoutAttempt(session.user.id, { kind, choices }, scope);
      value = { actor: session.user.id, key, kind, choices, transactionId: null, paid: false, paymentUrl: null };
      put(value);
    } finally { inFlight.current = false; }
    return execute(value);
  };
  const resume = async () => {
    const value = record.current;
    if (!value?.key) throw new Error('The original purchase reference is unavailable. Check its recorded payment status.');
    return execute(value);
  };
  const check = async (transactionId?: string | null, kind?: OfficePurchaseKind | null) => {
    if (inFlight.current) return;
    const session = await actorSession();
    if (inFlight.current) return;
    const current = record.current;
    const target = transactionId ?? current?.transactionId;
    if (!target) return;
    if (current && current.actor !== session.user.id) { put(null); return; }
    if (current?.key && !current.transactionId) {
      // Recover by the saved key before trusting a provider-return reference.
      // A different URL payment must not retire this purchase's retry identity.
      const restored = await execute(current);
      if (restored.transaction_id !== target) throw new Error('The return reference differs from the recorded purchase. Check its original status.');
      return;
    }
    // Provider-return links have a known payment reference even without browser
    // storage. Server ownership checks remain authoritative.
    const value: Pending = current?.transactionId === target ? current : {
      actor: session.user.id, key: null, kind: kind ?? 'tickets', choices: {}, transactionId: target, paid: false, paymentUrl: null,
    };
    if (current?.transactionId && current.transactionId !== target) throw new Error('Finish the recorded purchase before checking another payment.');
    inFlight.current = true;
    try {
      put(value);
      const result = await clickStatus(session.access_token, target);
      await accept(value, result);
    } finally { inFlight.current = false; }
  };
  useEffect(() => {
    let canceled = false;
    const restore = async () => {
      try {
        const session = await actorSession();
        if (canceled) return;
        if (record.current?.actor === session.user.id) return;
        put(null);
        const saved = restoreCheckoutAttempt(session.user.id, scope);
        const kind = saved?.intent.kind, choices = saved?.intent.choices;
        if (saved && kinds.includes(String(kind)) && choices && typeof choices === 'object' && !Array.isArray(choices)) {
          put({ actor: session.user.id, key: saved.key, kind: kind as OfficePurchaseKind,
            choices: financialChoices(choices as Choices), transactionId: null, paid: false, paymentUrl: null });
        }
      } catch { if (!canceled) put(null); }
    };
    void restore();
    const { data } = supabase.auth.onAuthStateChange(() => { void restore(); });
    return () => { canceled = true; data.subscription.unsubscribe(); };
  }, [scope]);
  useEffect(() => {
    if (!pending?.transactionId) return;
    const timer = window.setInterval(() => { void check().catch(() => {
      callbacks.current.onNotice('Your purchase remains recorded. Payment checking is temporarily unavailable; retry its status.');
    }); }, 6000);
    return () => window.clearInterval(timer);
  }, [pending?.transactionId]);
  return { pending, start, resume, check };
}
