import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, LogIn, Trophy, XCircle } from 'lucide-react';
import { ApiError, ApiErrorState, Button, Field, LoadingState, signInUrl, TextInput, useLocation, useSession, useT } from '../../core/index.ts';
import { answerQuiz, joinQuiz, playQuiz, type PlayState } from '../api.ts';

// T10 Live Quiz on a student's phone: join with the six-digit code and a nickname,
// then follow the game. No account is needed (core's anonymous routes, limited per
// game, so a class behind one school address plays without lag). A signed-in student
// joins as themselves, so the class results name them. It polls every 1.5 seconds
// (slower in very large open games, to stay within the game's budget) and keeps
// working on a weak connection: a failed poll tries again, and a rate limit waits as
// long as the server asks. The tab remembers its game (this tab only).

const KEY = 'schood-ai.play';
const COLORS = ['bg-lime', 'bg-sky-ai', 'bg-amber-300', 'bg-rose-300', 'bg-violet-300', 'bg-emerald-300'];
/** `open`: joined without signing in, so every call goes to the open routes with the token. */
interface Joined { session_id: string; token: string | null; nickname: string; open: boolean }
const remembered = (): Joined | null => {
  try { const value = sessionStorage.getItem(KEY); const parsed = value ? JSON.parse(value) as Joined : null; return parsed && typeof parsed.session_id === 'string' ? { ...parsed, open: parsed.open === true } : null; } catch { return null; }
};
const remember = (value: Joined | null) => { try { if (value) sessionStorage.setItem(KEY, JSON.stringify(value)); else sessionStorage.removeItem(KEY); } catch { /* this tab only */ } };

export default function PlayPage() {
  const t = useT(), session = useSession(), { query } = useLocation();
  const [joined, setJoined] = useState<Joined | null>(remembered);
  const [code, setCode] = useState((query.get('code') ?? '').replace(/\D/g, '').slice(0, 6)), [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);

  if (session.status === 'loading') return <LoadingState/>;
  if (joined) return <Game joined={joined} onLeave={() => { remember(null); setJoined(null); }}/>;
  const open = session.status !== 'signed_in';
  const join = async () => {
    setBusy(true); setError(null);
    try {
      const result = await joinQuiz(code, nickname.trim(), open);
      const next = { session_id: result.session_id, token: result.token, nickname: result.nickname, open };
      remember(next); setJoined(next);
    } catch (cause) { setError(cause); } finally { setBusy(false); }
  };
  return <form className="mx-auto grid max-w-md gap-4 rounded-3xl border border-navy-line bg-white p-6" onSubmit={(event) => { event.preventDefault(); void join(); }} aria-label={t('teacher.play.title')}>
    <h1 className="m-0 font-display text-2xl font-bold">{t('teacher.play.title')}</h1>
    <Field label={t('teacher.play.code')}>{(id) => <TextInput id={id} inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="text-center font-display text-3xl tracking-[0.3em]" required/>}</Field>
    <Field label={t('teacher.play.nickname')} hint={t('teacher.play.nicknameHint')}>{(id) => <TextInput id={id} maxLength={24} value={nickname} onChange={(event) => setNickname(event.target.value)} required autoComplete="nickname"/>}</Field>
    <Button type="submit" variant="spark" disabled={busy || code.length !== 6 || !nickname.trim()}>{busy ? t('teacher.play.joining') : t('teacher.play.join')}</Button>
    {error !== null && <ApiErrorState error={error}/>}
    {open && <p className="m-0 flex flex-wrap items-center gap-x-2 text-xs text-gray-600">{t('teacher.play.guest')}
      <a href={signInUrl('login', `${location.origin}/play${code ? `?code=${code}` : ''}`)} className="inline-flex items-center gap-1 font-semibold text-gray-900"><LogIn size={12} aria-hidden="true"/>{t('teacher.play.signInButton')}</a></p>}
  </form>;
}

function Game({ joined, onLeave }: { joined: Joined; onLeave(): void }) {
  const t = useT();
  const [state, setState] = useState<PlayState | null>(null), [error, setError] = useState<unknown>(null), [tapped, setTapped] = useState<{ index: number; choice: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const fetched = useRef(Date.now()), waitUntil = useRef(0);
  const poll = useCallback(async () => {
    if (Date.now() < waitUntil.current) return;
    try { const next = await playQuiz(joined.session_id, joined.token, joined.open); fetched.current = Date.now(); setState(next); setError(null); }
    catch (cause) {
      if (cause instanceof ApiError && ['not_joined', 'quiz_not_found', 'invalid_request'].includes(cause.code)) { onLeave(); return; }
      // The class's shared address hit core's limit: wait as long as the server asks.
      if (cause instanceof ApiError && cause.code === 'rate_limited') { const at = Date.parse(String(cause.details.retry_after ?? '')); waitUntil.current = Number.isFinite(at) ? at : Date.now() + 5_000; }
      setError(cause);
    }
  }, [joined, onLeave]);
  // An open game's budget is 3,000 polls a minute: past 60 phones, each polls a little less often.
  const players = state?.players ?? 0, every = joined.open && players > 60 ? Math.ceil(players / 20) * 500 : 1_500;
  useEffect(() => { void poll(); const timer = setInterval(() => { if (!document.hidden) void poll(); }, every); return () => clearInterval(timer); }, [poll, every]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  if (!state) return error ? <ApiErrorState error={error} onRetry={() => void poll()}/> : <LoadingState label={t('teacher.play.connecting')}/>;
  const mine = state.my_answer ?? (tapped && tapped.index === state.index ? { choice: tapped.choice } : null);
  const seconds = Math.ceil(Math.max(0, state.remaining_ms - (now - fetched.current)) / 1000);
  const tap = async (choice: string) => {
    if (mine || state.status !== 'question') return;
    setTapped({ index: state.index, choice });
    try { await answerQuiz(joined.session_id, joined.token, state.index, choice, joined.open); } catch (cause) { if (!(cause instanceof ApiError && cause.code === 'already_answered')) { setTapped(null); setError(cause); } }
    void poll();
  };
  return <section className="mx-auto grid max-w-md gap-4" aria-live="polite">
    <header className="flex items-center gap-3 rounded-3xl border border-navy-line bg-white px-4 py-3">
      <span className="min-w-0 flex-1 truncate font-semibold">{state.me.nickname}</span>
      <span className="text-sm tabular-nums">{t('teacher.play.score', { score: state.me.score })}</span>
      {state.me.rank > 0 && <span className="rounded-full bg-navy px-2 py-0.5 text-xs font-semibold text-white">#{state.me.rank}</span>}
    </header>
    {state.status === 'lobby' && <div className="rounded-3xl border border-navy-line bg-white p-6 text-center"><p className="m-0 font-display text-xl font-bold">{state.title}</p><p className="m-0 mt-2 text-sm text-gray-700">{t('teacher.play.wait', { count: state.players })}</p></div>}
    {state.status === 'question' && state.question && <div className="grid gap-3">
      <div className="flex items-center justify-between text-sm text-gray-700"><span>{t('teacher.quiz.questionOf', { number: state.index + 1, total: state.total })}</span><span className="tabular-nums font-semibold">{t('teacher.play.seconds', { count: seconds })}</span></div>
      <p className="m-0 rounded-3xl border border-navy-line bg-white p-4 text-lg font-semibold">{state.question.prompt}</p>
      {mine ? <p className="m-0 rounded-3xl bg-cream-soft p-4 text-center font-semibold">{t('teacher.play.locked')}</p> :
        <ul className="m-0 grid list-none gap-3 p-0">{state.question.options.map((option, index) => <li key={option.id}>
          <button type="button" onClick={() => void tap(option.id)} className={`flex min-h-16 w-full items-center gap-3 rounded-3xl border border-navy-line px-4 text-left text-base font-semibold text-gray-950 ${COLORS[index % COLORS.length]} focus-visible:outline focus-visible:outline-4 focus-visible:outline-navy`}>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/60 text-sm">{option.id}</span>{option.text}
          </button></li>)}</ul>}
    </div>}
    {state.status === 'reveal' && state.question && <div className="grid gap-3">
      {state.my_answer ? <div className={`flex items-center gap-3 rounded-3xl p-4 ${state.my_answer.correct ? 'bg-lime' : 'bg-rose-200'}`}>
        {state.my_answer.correct ? <CheckCircle2 size={28} aria-hidden="true"/> : <XCircle size={28} aria-hidden="true"/>}
        <span className="font-display text-xl font-bold">{state.my_answer.correct ? t('teacher.play.right', { points: state.my_answer.points ?? 0 }) : t('teacher.play.wrong')}</span>
      </div> : <p className="m-0 rounded-3xl bg-cream-soft p-4 font-semibold">{t('teacher.play.missed')}</p>}
      <p className="m-0 rounded-3xl border border-navy-line bg-white p-4 text-sm">{t('teacher.play.answerWas', { answer: state.question.options.find((option) => option.id === state.question!.answer)?.text ?? state.question.answer ?? '' })}</p>
      <Top rows={state.leaderboard}/>
    </div>}
    {state.status === 'finished' && <div className="grid gap-3 rounded-3xl border border-navy-line bg-white p-6 text-center">
      <Trophy size={36} className="mx-auto" aria-hidden="true"/>
      <p className="m-0 font-display text-2xl font-bold">{t('teacher.play.finalRank', { rank: state.me.rank, count: state.players })}</p>
      <p className="m-0 text-sm text-gray-700">{t('teacher.play.finalScore', { score: state.me.score, correct: state.me.correct, total: state.total })}</p>
      <Top rows={state.leaderboard}/>
      <Button variant="secondary" onClick={onLeave}>{t('teacher.play.another')}</Button>
    </div>}
    {error !== null && <p className="m-0 text-center text-xs text-gray-600">{t('teacher.play.reconnecting')}</p>}
  </section>;
}

function Top({ rows }: { rows: PlayState['leaderboard'] }) {
  const t = useT();
  if (!rows.length) return null;
  return <ol className="m-0 grid list-none gap-1 rounded-3xl border border-navy-line bg-white p-3 text-sm" aria-label={t('teacher.quiz.leaderboard')}>
    {rows.map((row) => <li key={`${row.rank}-${row.nickname}`} className="flex gap-2"><span className="w-5 font-bold tabular-nums">{row.rank}</span><span className="min-w-0 flex-1 truncate">{row.nickname}</span><span className="tabular-nums">{row.score}</span></li>)}
  </ol>;
}
