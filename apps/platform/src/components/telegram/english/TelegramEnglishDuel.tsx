import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Swords, Timer } from 'lucide-react';
import { useTgDuelT, type TgDuelKey } from './duelStrings';
import type { TelegramAppCall } from './types';

// Vocabulary duels inside the Telegram Mini App (telegram-app action
// english_duel). Same duels, rules and server clock as the web app and the
// bot chat (supabase/functions/_shared/english-duel-service.ts).

type Outcome = 'win' | 'loss' | 'draw' | 'walkover' | 'forfeit';
type DuelView = {
  code: string;
  status: 'open' | 'active' | 'finished' | 'expired';
  role: 'creator' | 'opponent';
  server_now: string;
  opponent_name: string;
  me: { started: boolean; finished: boolean; deadline_at: string | null; answered: number; correct: number; outcome: Outcome | null; xp: number };
  question: { index: number; total: number; prompt: string; options: string[] } | null;
  opponent: { correct: number | null } | null;
  can_rematch: boolean;
  rematch_code: string | null;
};
type Invite = { status: string; inviter_name: string };
type Summary = { code: string; status: string; opponent_name: string; my_correct: number | null; their_correct: number | null; outcome: Outcome | null; next: 'play' | 'wait_friend' | 'wait_join' | null };

const button = 'w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:opacity-60';
const quiet = 'w-full rounded-xl border border-gray-900 bg-white px-4 py-3 text-sm font-bold disabled:opacity-60';

const Card: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="rounded-2xl border border-gray-900 bg-white p-4 shadow-[0_2px_0_#111827]">{children}</section>
);

const ERROR_KEYS = new Set(['paused', 'limit', 'no_words', 'not_found', 'expired', 'taken', 'own_duel']);

/** The duel entry card on the English section. */
export const TelegramDuelCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { t } = useTgDuelT();
  return (
    <Card>
      <div className="flex items-center gap-2 text-sm font-black"><Swords size={17} aria-hidden /> {t('card.title')}</div>
      <p className="mt-2 text-sm text-gray-600">{t('card.body')}</p>
      <button type="button" onClick={onOpen} className={`mt-4 ${quiet}`}>{t('card.cta')}</button>
    </Card>
  );
};

export const TelegramEnglishDuel: React.FC<{
  call: TelegramAppCall;
  openTelegramLink: (url: string) => void;
  initialCode?: string | null;
  onExit: () => void;
}> = ({ call, openTelegramLink, initialCode = null, onExit }) => {
  const { t, locale } = useTgDuelT();
  const [code, setCode] = useState<string | null>(initialCode);
  const [view, setView] = useState<DuelView | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [list, setList] = useState<Summary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const offset = useRef(0);

  const fail = (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : '';
    setError(ERROR_KEYS.has(message) ? t(`error.${message}` as TgDuelKey) : t('error.generic'));
  };

  const show = useCallback((next: DuelView | null) => {
    if (next) offset.current = Date.parse(next.server_now) - Date.now();
    setView(next);
  }, []);

  const loadDuel = useCallback(async (target: string) => {
    try {
      const response = await call('english_duel', { op: 'get', code: target });
      show((response.duel as DuelView | null) ?? null);
      setInvite((response.invite as Invite | undefined) ?? null);
    } catch (cause) {
      fail(cause);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call, show]);

  useEffect(() => {
    setError(null);
    if (code) {
      void loadDuel(code);
      return;
    }
    show(null);
    setInvite(null);
    call('english_duel', { op: 'list' })
      .then((response) => setList((response.duels as Summary[]) ?? []))
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, call, loadDuel]);

  // Countdown on the server's clock.
  useEffect(() => {
    if (!view?.question || !view.me.deadline_at) return;
    const deadline = Date.parse(view.me.deadline_at);
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - (Date.now() + offset.current)) / 1000)));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [view?.question, view?.me.deadline_at]);

  // When the clock runs out, the server decides what happens next.
  useEffect(() => {
    if (!view?.question || left > 0 || !code) return;
    const timer = window.setTimeout(() => void loadDuel(code), 2_800);
    return () => window.clearTimeout(timer);
  }, [left, view?.question, code, loadDuel]);

  const act = async (op: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setError(null);
    try {
      return await call('english_duel', { op, code, locale, ...extra });
    } catch (cause) {
      fail(cause);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    const response = await act('create');
    if (response) setCode(String(response.code));
  };

  // The friend gets the bot link: they can play in the chat or in this app.
  const share = () => {
    if (!code) return;
    const invite = `https://t.me/schoodstudentbot?start=duel_${code}`;
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(invite)}&text=${encodeURIComponent(t('invite.shareText'))}`);
  };

  const name = view?.opponent_name || invite?.inviter_name || t('friend');
  const header = (
    <button type="button" onClick={code && !initialCode ? () => setCode(null) : onExit} className="flex items-center gap-1 text-sm font-bold text-gray-600">
      <ArrowLeft size={16} aria-hidden /> {code && !initialCode ? t('history') : t('back')}
    </button>
  );
  const errorLine = error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{error}</p> : null;

  if (!code) {
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <div className="flex items-center gap-2 text-base font-black"><Swords size={18} aria-hidden /> {t('card.title')}</div>
          <p className="mt-2 text-sm text-gray-600">{t('rules')}</p>
          <button type="button" onClick={() => void create()} disabled={busy} className={`mt-4 ${button}`}>{busy ? t('creating') : t('create')}</button>
          {errorLine}
        </Card>
        <Card>
          <div className="text-sm font-black">{t('history')}</div>
          {list === null ? <div className="mt-3 h-12 animate-pulse rounded-xl bg-gray-100" /> : list.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">{t('empty')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {list.map((duel) => (
                <li key={duel.code}>
                  <button type="button" onClick={() => setCode(duel.code)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left">
                    <span className="min-w-0">
                      <span className="block break-words font-bold">{duel.opponent_name ? t('vs', { name: duel.opponent_name }) : t('next.wait_join')}</span>
                      <span className="block text-xs text-gray-500">
                        {duel.status === 'finished' && duel.outcome ? t(`outcome.${duel.outcome}` as TgDuelKey)
                          : duel.status === 'expired' ? t('expired')
                          : duel.next ? t(`next.${duel.next}` as TgDuelKey, { name: duel.opponent_name || t('friend') }) : ''}
                      </span>
                    </span>
                    {duel.status === 'finished' && duel.my_correct !== null ? <span className="shrink-0 font-black">{duel.my_correct} : {duel.their_correct ?? '–'}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    );
  }

  let body: React.ReactNode = <div className="h-24 animate-pulse rounded-2xl bg-gray-100" />;
  if (!view && invite) {
    body = (
      <Card>
        <div className="text-base font-black">{invite.inviter_name ? t('join.title', { name: invite.inviter_name }) : t('join.titleAnon')}</div>
        {invite.status === 'open' ? (
          <button type="button" disabled={busy} className={`mt-4 ${button}`} onClick={() => void act('join').then((response) => { if (response) { show(response.view as DuelView); setInvite(null); } })}>
            {t('join.accept')}
          </button>
        ) : <p className="mt-2 text-sm text-gray-600">{t('error.expired')}</p>}
      </Card>
    );
  } else if (view?.status === 'open') {
    body = (
      <Card>
        <div className="text-base font-black">{t('invite.title')}</div>
        <p className="mt-2 text-sm text-gray-600">{t('invite.body')}</p>
        <button type="button" className={`mt-4 ${button}`} onClick={share}>{t('invite.share')}</button>
        <button type="button" className={`mt-2 ${quiet}`} onClick={() => void loadDuel(view.code)}>{t('invite.refresh')}</button>
      </Card>
    );
  } else if (view?.status === 'expired') {
    body = <Card><p className="text-sm text-gray-600">{t('expired')}</p></Card>;
  } else if (view?.status === 'finished') {
    const outcome = view.me.outcome ?? 'draw';
    body = (
      <Card>
        <div className="text-base font-black">{t(`result.${outcome}` as TgDuelKey, { name })}</div>
        <div className="mt-3 grid grid-cols-3 items-center text-center">
          <div><div className="text-3xl font-black">{view.me.correct}</div><div className="text-xs text-gray-500">{t('result.you')}</div></div>
          <div className="text-xl font-black text-gray-400">:</div>
          <div><div className="text-3xl font-black">{view.opponent?.correct ?? '–'}</div><div className="break-words text-xs text-gray-500">{name}</div></div>
        </div>
        {view.me.xp > 0 ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">{t('result.xp', { xp: view.me.xp })}</p> : null}
        {view.rematch_code ? (
          <button type="button" className={`mt-4 ${button}`} onClick={() => setCode(view.rematch_code)}>{t('result.openRematch')}</button>
        ) : view.can_rematch ? (
          <button type="button" disabled={busy} className={`mt-4 ${button}`} onClick={() => void act('rematch').then((response) => { if (response) setCode(String(response.code)); })}>{t('result.rematch')}</button>
        ) : null}
      </Card>
    );
  } else if (view?.question) {
    const question = view.question;
    body = (
      <Card>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-gray-500">{t('play.progress', { index: question.index + 1, total: question.total })}</span>
          <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm font-black text-white ${left <= 10 ? 'bg-red-700' : 'bg-gray-950'}`} role="timer">
            <Timer size={14} aria-hidden /> {left > 0 ? `${left}s` : t('play.timeUp')}
          </span>
        </div>
        <p className="mt-3 text-xs font-semibold text-gray-500">{t('play.prompt')}</p>
        <p className="mt-1 break-words text-lg font-black" lang="en">{question.prompt}</p>
        <div className="mt-4 grid grid-cols-1 gap-2">
          {question.options.map((option, index) => (
            <button
              key={`${question.index}-${index}`}
              type="button"
              lang="en"
              disabled={busy || left <= 0}
              className={quiet}
              onClick={() => void act('answer', { index: question.index, choice: index }).then((response) => { if (response) show(response.view as DuelView); })}
            >
              {option}
            </button>
          ))}
        </div>
      </Card>
    );
  } else if (view?.me.finished) {
    body = (
      <Card>
        <div className="text-base font-black">{t('done.title', { count: view.me.correct })}</div>
        <p className="mt-2 text-sm text-gray-600">{t('done.waiting', { name })}</p>
        <button type="button" className={`mt-4 ${quiet}`} onClick={() => void loadDuel(view.code)}>{t('invite.refresh')}</button>
      </Card>
    );
  } else if (view) {
    body = (
      <Card>
        <div className="text-base font-black">{t('ready.title', { name })}</div>
        <p className="mt-2 text-sm text-gray-600">{t('ready.body')}</p>
        <button type="button" disabled={busy} className={`mt-4 ${button}`} onClick={() => void act('start').then((response) => { if (response) show(response.view as DuelView); })}>{t('ready.start')}</button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      {body}
      {errorLine}
    </div>
  );
};
