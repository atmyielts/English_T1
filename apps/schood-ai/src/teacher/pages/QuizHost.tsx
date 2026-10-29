import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, Crown, Eye, Flag, Play, Users } from 'lucide-react';
import { ApiErrorState, Button, FocusSurface, Link, LoadingState, useT, useWorkspace } from '../../core/index.ts';
import { controlQuiz, hostQuiz, type HostQuiz } from '../api.ts';

// T10 Live Quiz, the teacher's screen in focus mode: the join code, players
// arriving, each question with its timer, the answers as they come in, the reveal
// with the class's choices, and the live leaderboard. It polls once a second
// (Realtime is not used in this project). Space or Enter moves the game on.

const COLORS = ['bg-lime text-gray-950', 'bg-sky-ai text-gray-950', 'bg-amber-300 text-gray-950', 'bg-rose-300 text-gray-950', 'bg-violet-300 text-gray-950', 'bg-emerald-300 text-gray-950'];
const joinHost = () => location.host || 'ai.schood.online';

export default function QuizHost({ params }: { params: Record<string, string> }) {
  const t = useT(), workspace = useWorkspace();
  const [quiz, setQuiz] = useState<HostQuiz | null>(null), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const fetched = useRef(Date.now());
  const load = useCallback(async () => {
    try { const next = await hostQuiz(workspace.workspaceId, params.id); fetched.current = Date.now(); setQuiz(next); setError(null); } catch (cause) { setError(cause); }
  }, [params.id, workspace.workspaceId]);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 1000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(timer); }, []);
  const command = useCallback(async (name: 'start' | 'reveal' | 'next' | 'finish') => {
    if (busy) return;
    setBusy(true);
    try { setQuiz(await controlQuiz(workspace.workspaceId, params.id, name)); fetched.current = Date.now(); } catch (cause) { setError(cause); } finally { setBusy(false); }
  }, [busy, params.id, workspace.workspaceId]);
  const primary = quiz?.status === 'lobby' ? 'start' : quiz?.status === 'question' ? 'reveal' : quiz?.status === 'reveal' ? 'next' : null;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.key === ' ' || event.key === 'Enter') && primary && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); void command(primary); } };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [primary, command]);

  if (!quiz) return <FocusSurface>{error ? <ApiErrorState error={error}/> : <LoadingState/>}</FocusSurface>;
  const remaining = Math.max(0, quiz.remaining_ms - (now - fetched.current));
  const seconds = Math.ceil(remaining / 1000);
  const total = Object.values(quiz.counts ?? {}).reduce((sum, count) => sum + count, 0);

  return <FocusSurface className="min-h-[80vh]">
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="m-0 min-w-0 flex-1 truncate font-display text-xl font-bold md:text-2xl">{quiz.title}</h1>
      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm"><Users size={16} aria-hidden="true"/>{t('teacher.quiz.players', { count: quiz.players })}</span>
      {quiz.status !== 'finished' && <span className="rounded-full bg-white/10 px-3 py-1 text-sm">{t('teacher.quiz.code')}: <strong className="tracking-widest">{quiz.code}</strong></span>}
    </div>

    {quiz.status === 'lobby' && <section className="mt-10 grid place-items-center gap-6 text-center" aria-live="polite">
      <p className="m-0 text-lg text-white/80">{t('teacher.quiz.joinAt', { host: `${joinHost()}/play` })}</p>
      <p className="m-0 font-display text-6xl font-bold tracking-[0.25em] md:text-8xl" aria-label={t('teacher.quiz.codeLabel', { code: quiz.code.split('').join(' ') })}>{quiz.code}</p>
      <p className="m-0 text-white/70">{quiz.players ? t('teacher.quiz.waitingSome', { count: quiz.players }) : t('teacher.quiz.waiting')}</p>
      {quiz.leaderboard.length > 0 && <ul className="m-0 flex max-w-3xl list-none flex-wrap justify-center gap-2 p-0">{quiz.leaderboard.map((player) => <li key={player.nickname} className="rounded-full bg-white/10 px-3 py-1 text-sm">{player.nickname}</li>)}</ul>}
    </section>}

    {(quiz.status === 'question' || quiz.status === 'reveal') && quiz.question && <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <div className="flex items-center gap-3 text-sm text-white/70"><span>{t('teacher.quiz.questionOf', { number: quiz.index + 1, total: quiz.total })}</span>{quiz.question.context && <span className="truncate">· {quiz.question.context}</span>}</div>
        <p className="m-0 mt-3 font-display text-2xl font-bold leading-snug md:text-4xl">{quiz.question.prompt}</p>
        <ul className="m-0 mt-6 grid list-none gap-3 p-0 sm:grid-cols-2">{quiz.question.options.map((option, index) => {
          const right = quiz.status === 'reveal' && option.id === quiz.question!.answer;
          const share = quiz.status === 'reveal' && total ? Math.round(((quiz.counts?.[option.id] ?? 0) / total) * 100) : null;
          return <li key={option.id} className={`relative overflow-hidden rounded-3xl p-4 text-lg font-semibold ${COLORS[index % COLORS.length]} ${quiz.status === 'reveal' && !right ? 'opacity-40' : ''} ${right ? 'ring-4 ring-white' : ''}`}>
            <span className="relative z-10 flex items-center gap-3"><span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/60 text-sm">{option.id}</span><span className="min-w-0">{option.text}</span>{share !== null && <span className="ml-auto text-sm">{t('teacher.quiz.share', { share, count: quiz.counts?.[option.id] ?? 0 })}</span>}</span>
          </li>;
        })}</ul>
        {quiz.status === 'reveal' && quiz.question.explanation && <p className="m-0 mt-4 rounded-2xl bg-white/10 p-3 text-white/90">{quiz.question.explanation}</p>}
      </div>
      <div className="grid content-start gap-4">
        {quiz.status === 'question' && <div className="grid place-items-center rounded-3xl bg-white/10 p-6 text-center" aria-live="off">
          <span className="font-display text-6xl font-bold tabular-nums" aria-label={t('teacher.quiz.secondsLeft', { count: seconds })}>{seconds}</span>
          <span className="text-sm text-white/70">{t('teacher.quiz.answered', { count: quiz.answered, total: quiz.players })}</span>
        </div>}
        {quiz.status === 'reveal' && <Leaderboard rows={quiz.leaderboard}/>}
      </div>
    </section>}

    {quiz.status === 'finished' && <section className="mt-8 grid gap-6" aria-live="polite">
      <h2 className="m-0 text-center font-display text-3xl font-bold">{t('teacher.quiz.final')}</h2>
      <Leaderboard rows={quiz.leaderboard} big/>
      <p className="m-0 text-center text-white/80">{t('teacher.quiz.saved', { label: quiz.class_label ?? t('teacher.quiz.noClass') })}</p>
      <div className="flex justify-center"><Link to={`/studio/quizzes/${quiz.id}`} className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-gray-950 no-underline">{t('teacher.quiz.results')}</Link></div>
    </section>}

    {error !== null && <div className="mt-4"><ApiErrorState error={error}/></div>}
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {primary === 'start' && <Button variant="spark" onClick={() => void command('start')} disabled={busy || !quiz.players} icon={<Play size={16} aria-hidden="true"/>}>{t('teacher.quiz.start')}</Button>}
      {primary === 'reveal' && <Button variant="onDark" onClick={() => void command('reveal')} disabled={busy} icon={<Eye size={16} aria-hidden="true"/>}>{t('teacher.quiz.reveal')}</Button>}
      {primary === 'next' && <Button variant="spark" onClick={() => void command('next')} disabled={busy} icon={<ChevronRight size={16} aria-hidden="true"/>}>{quiz.index + 1 >= quiz.total ? t('teacher.quiz.finishShow') : t('teacher.quiz.next')}</Button>}
      {quiz.status !== 'finished' && <Button variant="onDark" onClick={() => void command('finish')} disabled={busy} icon={<Flag size={16} aria-hidden="true"/>}>{t('teacher.quiz.end')}</Button>}
      {primary && <span className="text-xs text-white/60">{t('teacher.quiz.keys')}</span>}
    </div>
  </FocusSurface>;
}

function Leaderboard({ rows, big = false }: { rows: HostQuiz['leaderboard']; big?: boolean }) {
  const t = useT();
  if (!rows.length) return <p className="m-0 text-white/70">{t('teacher.quiz.noPlayers')}</p>;
  return <ol className={`m-0 grid list-none gap-2 p-0 ${big ? 'mx-auto w-full max-w-xl' : ''}`} aria-label={t('teacher.quiz.leaderboard')}>
    {rows.map((row) => <li key={`${row.rank}-${row.nickname}`} className={`flex items-center gap-3 rounded-2xl px-4 ${big ? 'py-3 text-lg' : 'py-2'} ${row.rank === 1 ? 'bg-lime text-gray-950' : 'bg-white/10'}`}>
      <span className="w-6 font-bold tabular-nums">{row.rank}</span>{row.rank === 1 && <Crown size={16} aria-hidden="true"/>}
      <span className="min-w-0 flex-1 truncate font-semibold">{row.nickname}</span><span className="tabular-nums">{row.score}</span>
    </li>)}
  </ol>;
}
