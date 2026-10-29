import { useEffect, useState } from 'react';
import { Download, Gamepad2 } from 'lucide-react';
import { ApiErrorState, Badge, Card, EmptyState, Link, LoadingState, PageHeader, useI18n, useT, useWorkspace } from '../../core/index.ts';
import { listQuizzes, quizResults } from '../api.ts';

// The teacher's Live Quiz games and their saved results, per class: every player,
// every question, and a CSV for the class register.

export function QuizzesPage() {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listQuizzes>> | null>(null), [error, setError] = useState<unknown>(null);
  useEffect(() => { listQuizzes(workspace.workspaceId).then(setRows).catch(setError); }, [workspace.workspaceId]);
  return <>
    <PageHeader title={t('teacher.quizzes.title')} lead={t('teacher.quizzes.lead')} actions={<Link to="/library" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline"><Gamepad2 size={16} aria-hidden="true"/>{t('teacher.quizzes.pick')}</Link>}/>
    {error ? <ApiErrorState error={error}/> : !rows ? <LoadingState/> : !rows.length ? <EmptyState title={t('teacher.quizzes.none')} lead={t('teacher.quizzes.noneLead')}/> :
      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">{rows.map((row) => <li key={row.id}><Card as="div" className="h-full">
        <div className="flex flex-wrap items-center gap-2"><strong className="min-w-0 flex-1 truncate">{row.title}</strong><Badge tone={row.status === 'finished' ? 'neutral' : 'lime'}>{t(`teacher.quizStatus.${row.status}`)}</Badge></div>
        <p className="m-0 mt-1 text-sm text-gray-700">{[row.class_label, t('teacher.quiz.players', { count: row.players }), t('teacher.quizzes.questions', { count: row.questions }), date(row.created_at, { dateStyle: 'medium', timeStyle: 'short' })].filter(Boolean).join(' · ')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {row.status !== 'finished' && <Link to={`/studio/quiz/${row.id}`} className="inline-flex min-h-9 items-center rounded-full bg-navy px-3 text-xs font-semibold text-white no-underline">{t('teacher.quizzes.open')}</Link>}
          <Link to={`/studio/quizzes/${row.id}`} className="inline-flex min-h-9 items-center rounded-full border border-navy-line px-3 text-xs font-semibold text-gray-900 no-underline">{t('teacher.quiz.results')}</Link>
        </div>
      </Card></li>)}</ul>}
  </>;
}

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export function QuizResultsPage({ params }: { params: Record<string, string> }) {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const [data, setData] = useState<Awaited<ReturnType<typeof quizResults>> | null>(null), [error, setError] = useState<unknown>(null);
  useEffect(() => { quizResults(workspace.workspaceId, params.id).then(setData).catch(setError); }, [params.id, workspace.workspaceId]);
  if (error) return <ApiErrorState error={error}/>;
  if (!data) return <LoadingState/>;
  const download = () => {
    const header = ['rank', 'nickname', 'score', 'correct', 'answered', ...data.questions.map((question) => `q${question.index + 1}`)];
    const lines = data.players.map((player) => [player.rank, player.nickname, player.score, player.correct, player.answered, ...data.questions.map((question) => { const answer = player.answers.find((entry) => entry.index === question.index); return answer ? `${answer.choice}${answer.correct ? '+' : ''}` : ''; })]);
    const blob = new Blob([[header, ...lines].map((row) => row.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `${data.quiz.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}-results.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <PageHeader eyebrow={<Link to="/studio/quizzes" className="text-sm text-gray-700">{t('teacher.quizzes.title')}</Link>} title={data.quiz.title}
      lead={[data.quiz.class_label, date(data.quiz.created_at, { dateStyle: 'medium', timeStyle: 'short' })].filter(Boolean).join(' · ')}
      actions={<button type="button" onClick={download} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-navy-line bg-white px-4 text-sm font-semibold"><Download size={16} aria-hidden="true"/>{t('teacher.quizzes.csv')}</button>}/>
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><h2 className="m-0 mb-3 font-display text-lg font-bold">{t('teacher.quizzes.players')}</h2>
        {!data.players.length ? <EmptyState/> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wider text-gray-600"><th className="py-1">#</th><th className="py-1">{t('teacher.quizzes.nickname')}</th><th className="py-1 text-right">{t('teacher.quizzes.score')}</th><th className="py-1 text-right">{t('teacher.quizzes.correct')}</th></tr></thead>
          <tbody>{data.players.map((player) => <tr key={player.id} className="border-t border-navy-line/20"><td className="py-1.5 tabular-nums">{player.rank}</td><td className="py-1.5">{player.nickname}</td><td className="py-1.5 text-right tabular-nums">{player.score}</td><td className="py-1.5 text-right tabular-nums">{player.correct}/{data.questions.length}</td></tr>)}</tbody></table></div>}
      </Card>
      <Card><h2 className="m-0 mb-3 font-display text-lg font-bold">{t('teacher.quizzes.byQuestion')}</h2>
        <ol className="m-0 grid list-none gap-2 p-0">{data.questions.map((question) => {
          const share = question.answered ? Math.round((question.correct / question.answered) * 100) : 0;
          return <li key={question.index} className="rounded-2xl border border-navy-line/20 p-3 text-sm">
            <p className="m-0 font-semibold">{question.index + 1}. {question.prompt}</p>
            <p className="m-0 mt-1 text-gray-700">{question.answered ? t('teacher.quizzes.questionStat', { correct: question.correct, answered: question.answered, share }) : t('teacher.quizzes.noAnswers')}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cream-deep" aria-hidden="true"><div className={`h-full ${share < 50 ? 'bg-amber-400' : 'bg-lime'}`} style={{ width: `${share}%` }}/></div>
          </li>;
        })}</ol>
      </Card>
    </div>
  </>;
}
