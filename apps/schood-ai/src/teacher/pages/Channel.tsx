import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Plus, RefreshCw, Send, Trash2, Wand2 } from 'lucide-react';
import {
  ApiError, ApiErrorState, ApproveRunCard, Badge, Button, Card, CreditCost, EmptyState, Field, LoadingState, PageHeader, PlanGate, TextArea, TextInput,
  useI18n, useT, useWorkspace, type ActionView,
} from '../../core/index.ts';
import {
  connectChannel, dispatchPosts, editPost, listChannels, planWeek, proposeWeek, removeChannel, updateChannel, verifyChannel, writePost,
  type ChannelPostView, type ChannelView, type ChannelWeek,
} from '../api.ts';

// T11 Telegram channel autopilot: connect your channel (add the Schood bot as an
// admin), plan a week from your schedule, let AI write each post in your voice
// (3 credits a post), edit anything, approve the whole week in one click, and the
// bot posts each one at its time. While this page is open it sends due posts every
// minute.

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const KINDS = ['word', 'quiz', 'tip'] as const;
const selectClass = 'min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900';

export default function ChannelPage() {
  const t = useT(), workspace = useWorkspace();
  const [data, setData] = useState<Awaited<ReturnType<typeof listChannels>> | null>(null), [error, setError] = useState<unknown>(null);
  const load = useCallback(() => { listChannels(workspace.workspaceId).then(setData).catch(setError); }, [workspace.workspaceId]);
  useEffect(load, [load]);
  // Due posts go out while the autopilot page is open.
  useEffect(() => {
    if (!data?.channels.some((channel) => channel.batches?.some((batch) => batch.posts.some((post) => post.status === 'scheduled')))) return;
    const timer = setInterval(() => { void dispatchPosts(workspace.workspaceId).then((result) => { if (result.dispatched.sent || result.dispatched.failed) load(); }).catch(() => undefined); }, 60_000);
    void dispatchPosts(workspace.workspaceId).then((result) => { if (result.dispatched.sent || result.dispatched.failed) load(); }).catch(() => undefined);
    return () => clearInterval(timer);
  }, [data, load, workspace.workspaceId]);
  return <>
    <PageHeader title={t('teacher.channel.title')} lead={t('teacher.channel.lead')}/>
    <PlanGate feature="T11">
      {error ? <ApiErrorState error={error} onRetry={load}/> : !data ? <LoadingState/> : <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="grid content-start gap-4">
          {!data.bot.configured && <p role="status" className="m-0 rounded-3xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{t('teacher.channel.botMissing')}</p>}
          {!data.channels.length ? <EmptyState title={t('teacher.channel.none')} lead={t('teacher.channel.noneLead')}/> : data.channels.map((channel) => <ChannelCard key={channel.id} channel={channel} nextWeek={data.next_week} bot={data.bot.username} onChange={load}/>)}
        </section>
        <Connect bot={data.bot.username} onConnected={load}/>
      </div>}
    </PlanGate>
  </>;
}

function ScheduleFields({ value, onChange }: { value: ChannelView['schedule']; onChange(next: ChannelView['schedule']): void }) {
  const t = useT();
  return <div className="grid gap-3">
    <Field label={t('teacher.channel.time')} hint={t('teacher.channel.timeHint')}>{(id) => <TextInput id={id} type="time" min="08:00" max="18:00" value={value.time} onChange={(event) => onChange({ ...value, time: event.target.value })}/>}</Field>
    <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('teacher.channel.days')}</legend><div className="flex flex-wrap gap-1">{DAYS.map((day) => {
      const on = value.days.includes(day);
      return <label key={day} className={`inline-flex min-h-9 min-w-11 cursor-pointer items-center justify-center rounded-full border px-2 text-xs font-semibold ${on ? 'border-navy bg-navy text-white' : 'border-navy-line/40 bg-white'}`}>
        <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange({ ...value, days: on ? value.days.filter((entry) => entry !== day) : [...value.days, day].sort() })}/>{t(`teacher.day.${day}`)}</label>;
    })}</div></fieldset>
    <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('teacher.channel.kinds')}</legend><div className="flex flex-wrap gap-2">{KINDS.map((kind) => {
      const on = value.kinds.includes(kind);
      return <label key={kind} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-semibold ${on ? 'border-navy bg-lime-soft' : 'border-navy-line/40 bg-white'}`}>
        <input type="checkbox" className="h-4 w-4" checked={on} onChange={() => onChange({ ...value, kinds: on ? value.kinds.filter((entry) => entry !== kind) : KINDS.filter((entry) => entry === kind || value.kinds.includes(entry)) })}/>{t(`teacher.post.${kind}`)}</label>;
    })}</div></fieldset>
  </div>;
}

function Connect({ bot, onConnected }: { bot: string | null; onConnected(): void }) {
  const t = useT(), workspace = useWorkspace();
  const [chat, setChat] = useState(''), [voice, setVoice] = useState(''), [language, setLanguage] = useState('uz'), [level, setLevel] = useState('B1'), [topics, setTopics] = useState('');
  const [schedule, setSchedule] = useState<ChannelView['schedule']>({ time: '09:00', days: [1, 2, 3, 4, 5], kinds: ['word', 'quiz', 'tip'] });
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  return <Card as="div" className="content-start"><h2 className="m-0 mb-3 font-display text-lg font-bold">{t('teacher.channel.connect')}</h2>
    <ol className="m-0 mb-3 grid list-decimal gap-1 pl-5 text-sm text-gray-700"><li>{bot ? t('teacher.channel.step1', { bot: `@${bot}` }) : t('teacher.channel.step1Generic')}</li><li>{t('teacher.channel.step2')}</li><li>{t('teacher.channel.step3')}</li></ol>
    <form className="grid gap-3" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(null);
      try { await connectChannel(workspace.workspaceId, { chat: chat.trim(), voice, language, level, topics, schedule }); setChat(''); onConnected(); } catch (cause) { setError(cause); } finally { setBusy(false); }
    }}>
      <Field label={t('teacher.channel.chat')} hint={t('teacher.channel.chatHint')}>{(id) => <TextInput id={id} value={chat} onChange={(event) => setChat(event.target.value)} placeholder="@my_ielts_channel" required/>}</Field>
      <Field label={t('teacher.channel.voice')} hint={t('teacher.channel.voiceHint')}>{(id) => <TextArea id={id} rows={2} value={voice} maxLength={1000} onChange={(event) => setVoice(event.target.value)}/>}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('teacher.studio.language')}>{(id) => <select id={id} className={selectClass} value={language} onChange={(event) => setLanguage(event.target.value)}>{['uz', 'ru', 'en'].map((entry) => <option key={entry} value={entry}>{t(`teacher.lang.${entry}`)}</option>)}</select>}</Field>
        <Field label={t('teacher.studio.level')}>{(id) => <select id={id} className={selectClass} value={level} onChange={(event) => setLevel(event.target.value)}>{['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((entry) => <option key={entry}>{entry}</option>)}</select>}</Field>
      </div>
      <Field label={t('teacher.channel.topics')}>{(id) => <TextInput id={id} value={topics} maxLength={500} onChange={(event) => setTopics(event.target.value)}/>}</Field>
      <ScheduleFields value={schedule} onChange={setSchedule}/>
      <Button type="submit" disabled={busy || !chat.trim() || !schedule.days.length || !schedule.kinds.length} icon={<Plus size={16} aria-hidden="true"/>}>{t('teacher.channel.connectButton')}</Button>
      {error !== null && <ApiErrorState error={error}/>}
    </form>
  </Card>;
}

function ChannelCard({ channel, nextWeek, bot, onChange }: { channel: ChannelView; nextWeek: string; bot: string | null; onChange(): void }) {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null), [schedule, setSchedule] = useState(channel.schedule), [editing, setEditing] = useState(false);
  const week = channel.batches?.find((batch) => batch.status !== 'cancelled') ?? null;
  const act = async (work: () => Promise<unknown>) => { setBusy(true); setError(null); try { await work(); onChange(); } catch (cause) { setError(cause); } finally { setBusy(false); } };
  return <Card as="article">
    <div className="flex flex-wrap items-center gap-2">
      <Send size={18} aria-hidden="true"/><h2 className="m-0 min-w-0 flex-1 truncate font-display text-lg font-bold">{channel.title}</h2>
      <Badge tone={channel.status === 'verified' ? 'lime' : channel.status === 'error' ? 'warn' : 'neutral'}>{t(`teacher.channel.status.${channel.status}`)}</Badge>
    </div>
    <p className="m-0 mt-1 text-sm text-gray-700">{channel.username ? `@${channel.username}` : channel.chat_id} · {t(`teacher.lang.${channel.language}`)} · {channel.level}</p>
    {channel.last_error && <p className="m-0 mt-2 rounded-2xl bg-amber-50 p-2 text-sm text-amber-950">{t(`teacher.channel.error.${channel.last_error}`, { bot: bot ? `@${bot}` : '' })}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" disabled={busy} icon={<RefreshCw size={14} aria-hidden="true"/>} onClick={() => void act(() => verifyChannel(workspace.workspaceId, channel.id))}>{t('teacher.channel.verify')}</Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>{t('teacher.channel.schedule')}</Button>
      <Button size="sm" variant="ghost" disabled={busy} icon={<Trash2 size={14} aria-hidden="true"/>} onClick={() => void act(() => removeChannel(workspace.workspaceId, channel.id))}>{t('teacher.channel.remove')}</Button>
    </div>
    {editing && <div className="mt-3 grid gap-3 rounded-2xl border border-navy-line/30 p-3"><ScheduleFields value={schedule} onChange={setSchedule}/><Button size="sm" disabled={busy} onClick={() => void act(async () => { await updateChannel(workspace.workspaceId, { id: channel.id, schedule }); setEditing(false); })}>{t('teacher.editor.save')}</Button></div>}
    {!week ? <div className="mt-4"><Button variant="spark" disabled={busy || channel.status !== 'verified'} icon={<CalendarDays size={16} aria-hidden="true"/>} onClick={() => void act(() => planWeek(workspace.workspaceId, channel.id, nextWeek))}>{t('teacher.channel.plan', { week: date(nextWeek, { dateStyle: 'medium' }) })}</Button>
      {channel.status !== 'verified' && <p className="m-0 mt-2 text-xs text-gray-600">{t('teacher.channel.verifyFirst')}</p>}</div>
      : <Week week={week} onChange={onChange}/>}
    {error !== null && <div className="mt-3"><ApiErrorState error={error}/></div>}
  </Card>;
}

function Week({ week, onChange }: { week: ChannelWeek; onChange(): void }) {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const [posts, setPosts] = useState(week.posts), [running, setRunning] = useState(false), [error, setError] = useState<unknown>(null), [action, setAction] = useState<ActionView | null>(null);
  useEffect(() => setPosts(week.posts), [week.posts]);
  const empty = posts.filter((post) => post.status === 'draft' && !post.content.text && !post.content.poll);
  const writeAll = async () => {
    setRunning(true); setError(null);
    for (const post of empty) {
      try { const result = await writePost(workspace.workspaceId, post.id); setPosts((current) => current.map((entry) => (entry.id === post.id ? result.post : entry))); }
      catch (cause) { setError(cause); if (cause instanceof ApiError && ['insufficient_credits', 'budget_exhausted', 'capped', 'plan_required', 'ai_disabled', 'ai_unavailable'].includes(cause.code)) break; }
    }
    setRunning(false);
  };
  const editable = week.status === 'draft' || week.status === 'proposed';
  return <div className="mt-4 grid gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="m-0 flex-1 text-sm font-semibold">{t('teacher.channel.week', { week: date(week.week_start, { dateStyle: 'medium' }) })} · {t(`teacher.channel.weekStatus.${week.status}`)}</h3>
      {editable && empty.length > 0 && <><Button size="sm" variant="spark" disabled={running} icon={<Wand2 size={14} aria-hidden="true"/>} onClick={() => void writeAll()}>{running ? t('teacher.channel.writing') : t('teacher.channel.writeAll', { count: empty.length })}</Button><CreditCost creditKey="channel.post"/></>}
    </div>
    <ol className="m-0 grid list-none gap-2 p-0">{posts.map((post) => <PostRow key={post.id} post={post} editable={editable} onChange={(next) => setPosts((current) => current.map((entry) => (entry.id === next.id ? next : entry)))}/>)}</ol>
    {editable && !empty.length && posts.some((post) => post.status === 'draft') && <Button onClick={async () => { setError(null); try { setAction(await proposeWeek(workspace.workspaceId, week.id)); } catch (cause) { setError(cause); } }} icon={<CheckCircle2 size={16} aria-hidden="true"/>}>{t('teacher.channel.approveWeek')}</Button>}
    {action && <ApproveRunCard action={action} onChange={(next) => { setAction(next); if (next.status === 'done') onChange(); }}/>}
    {error !== null && <ApiErrorState error={error}/>}
  </div>;
}

function PostRow({ post, editable, onChange }: { post: ChannelPostView; editable: boolean; onChange(post: ChannelPostView): void }) {
  const t = useT(), workspace = useWorkspace(), { date } = useI18n();
  const [open, setOpen] = useState(false), [text, setText] = useState(post.content.text ?? ''), [poll, setPoll] = useState(post.content.poll ?? { question: '', options: ['', ''], correct: 0 });
  const [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(null);
  const act = async (work: () => Promise<ChannelPostView>) => { setBusy(true); setError(null); try { onChange(await work()); setOpen(false); } catch (cause) { setError(cause); } finally { setBusy(false); } };
  const filled = !!(post.content.text || post.content.poll);
  return <li className="rounded-2xl border border-navy-line/30 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="sky">{t(`teacher.post.${post.kind}`)}</Badge>
      <span className="text-xs text-gray-600">{date(post.scheduled_for, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      <span className="flex-1"/><Badge tone={post.status === 'sent' ? 'lime' : post.status === 'failed' ? 'warn' : 'neutral'}>{t(`teacher.post.status.${post.status}`)}</Badge>
    </div>
    {filled ? <div className="mt-2 text-sm">{post.content.text ? <p className="m-0 whitespace-pre-wrap">{post.content.text}</p> : <><p className="m-0 font-semibold">{post.content.poll!.question}</p><ul className="m-0 mt-1 pl-5">{post.content.poll!.options.map((option, index) => <li key={index}>{index === post.content.poll!.correct ? '✓ ' : ''}{option}</li>)}</ul>{post.content.poll!.explanation && <p className="m-0 mt-1 text-xs text-gray-600">{post.content.poll!.explanation}</p>}</>}</div>
      : <p className="m-0 mt-2 text-sm text-gray-600">{t('teacher.channel.notWritten')}</p>}
    {post.last_error && <p className="m-0 mt-1 text-xs text-amber-900">{t(`teacher.post.error.${post.last_error}`)}</p>}
    <div className="mt-2 flex flex-wrap gap-2">
      {editable && post.status === 'draft' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(async () => (await writePost(workspace.workspaceId, post.id)).post)}>{filled ? t('teacher.channel.rewrite') : t('teacher.channel.write')}</Button>}
      {editable && post.status === 'draft' && filled && <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{t('teacher.channel.edit')}</Button>}
      {['draft', 'scheduled', 'failed'].includes(post.status) && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => editPost(workspace.workspaceId, { id: post.id, cancel: true }))}>{t('teacher.channel.cancelPost')}</Button>}
    </div>
    {open && <div className="mt-2 grid gap-2">
      {post.kind === 'quiz' ? <>
        <TextInput aria-label={t('teacher.channel.pollQuestion')} value={poll.question} maxLength={300} onChange={(event) => setPoll({ ...poll, question: event.target.value })}/>
        {poll.options.map((option, index) => <label key={index} className="flex items-center gap-2"><input type="radio" name={`correct-${post.id}`} checked={poll.correct === index} onChange={() => setPoll({ ...poll, correct: index })} aria-label={t('teacher.channel.correctOption', { number: index + 1 })}/>
          <TextInput aria-label={t('teacher.channel.option', { number: index + 1 })} value={option} maxLength={100} onChange={(event) => setPoll({ ...poll, options: poll.options.map((entry, i) => (i === index ? event.target.value : entry)) })}/></label>)}
        {poll.options.length < 10 && <Button size="sm" variant="ghost" onClick={() => setPoll({ ...poll, options: [...poll.options, ''] })}>{t('teacher.editor.addOption')}</Button>}
        <TextInput aria-label={t('teacher.channel.explanation')} placeholder={t('teacher.channel.explanation')} value={poll.explanation ?? ''} maxLength={200} onChange={(event) => setPoll({ ...poll, explanation: event.target.value || undefined })}/>
      </> : <TextArea aria-label={t('teacher.channel.text')} rows={5} value={text} maxLength={4096} onChange={(event) => setText(event.target.value)}/>}
      <Button size="sm" disabled={busy} onClick={() => void act(() => editPost(workspace.workspaceId, { id: post.id, content: post.kind === 'quiz' ? { poll } : { text } }))}>{t('teacher.editor.save')}</Button>
    </div>}
    {error !== null && <div className="mt-2"><ApiErrorState error={error}/></div>}
  </li>;
}
