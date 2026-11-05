import { useState } from 'react';
import { Copy, Send, Swords } from 'lucide-react';
import { Badge, Button, ButtonLink, EmptyState, Field, LoadingState, TextArea, TextInput, Thinking, signInUrl, useI18n, useLocation, useSession, useT } from '../../core/index.ts';
import { ConsentGate, Failure, Mcq, Section, ToolHeader, useLearnerApi, useLoad, useRun, type McqResult, Cost } from '../kit.tsx';

// L7 homework helper, L14 daily brief settings and today's brief, L17 duels and the duel landing page.

// --- L7 ---------------------------------------------------------------------------------
interface Homework { id: string; title: string; type: string; due_at: string | null; instructions: string; status: string; rule: 'hints_only' | 'explain' | 'off'; focus: string[] }
export function HomeworkPage() {
  const t = useT(), call = useLearnerApi(), { date } = useI18n();
  const list = useLoad(() => call<{ academy: boolean; homework: Homework[] }>('homework'));
  const [open, setOpen] = useState<Homework | null>(null), [question, setQuestion] = useState(''), [attempt, setAttempt] = useState(''), [step, setStep] = useState(1);
  const hint = useRun<{ hint: { hint: string; check_question: string; topic: string; guarded: boolean } }>();
  const [history, setHistory] = useState<{ step: number; text: string; check: string }[]>([]);
  const ask = async () => {
    const out = await hint.run(() => call('homework-hint', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { assignment_id: open!.id, question, attempt: attempt || undefined, step } }));
    if (out) { setHistory((list) => [...list, { step, text: out.hint.hint, check: out.hint.check_question }]); setStep((value) => Math.min(3, value + 1)); }
  };
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.homework')} lead={t('learner.homework.lead')} creditKey="homework.hint"/>
    {list.loading && !list.data && <LoadingState/>}
    <Failure error={list.error} onRetry={list.reload}/>
    {list.data && !list.data.academy && <EmptyState title={t('learner.homework.noAcademy')} lead={t('learner.homework.noAcademyLead')}/>}
    {list.data?.academy && !list.data.homework.length && <EmptyState title={t('learner.homework.none')} lead={t('learner.homework.noneLead')}/>}
    {list.data && list.data.homework.length > 0 && <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <ul className="m-0 grid list-none content-start gap-2 p-0">{list.data.homework.map((entry) => <li key={entry.id}>
        <button type="button" onClick={() => { setOpen(entry); setHistory([]); setStep(1); }} aria-current={open?.id === entry.id} className={`min-h-11 w-full rounded-2xl border border-navy-line/40 px-3 py-2 text-left text-sm ${open?.id === entry.id ? 'bg-navy text-white' : 'bg-white hover:bg-cream-soft'}`}>
          <strong>{entry.title}</strong><br/>{entry.due_at ? t('learner.homework.due', { date: date(entry.due_at, { dateStyle: 'medium' }) }) : ''} <Badge tone={entry.rule === 'off' ? 'danger' : 'sky'}>{t(`learner.homework.rule.${entry.rule}`)}</Badge>
        </button>
      </li>)}</ul>
      {open ? <Section title={open.title}>
        <p className="m-0 whitespace-pre-wrap text-sm text-gray-700">{open.instructions}</p>
        {open.rule === 'off' ? <p role="status" className="m-0 font-semibold">{t('learner.homework.off')}</p> : <>
          <p className="m-0 rounded-2xl bg-cream-soft p-3 text-sm">{t(`learner.homework.ruleLead.${open.rule}`)}</p>
          <Field label={t('learner.homework.question')}>{(id) => <TextArea id={id} rows={3} value={question} maxLength={2000} onChange={(event) => setQuestion(event.target.value)}/>}</Field>
          <Field label={t('learner.homework.attempt')}>{(id) => <TextArea id={id} rows={3} value={attempt} maxLength={2000} onChange={(event) => setAttempt(event.target.value)}/>}</Field>
          <div className="flex flex-wrap items-center gap-3"><Button variant="spark" disabled={!question.trim() || hint.busy} onClick={() => void ask()}>{t(`learner.homework.step${step}`)}</Button><Cost creditKey="homework.hint"/></div>
          {hint.busy && <Thinking label={t('chat.thinking')}/>}
          <ol className="m-0 grid gap-2 list-decimal pl-5 text-sm">{history.map((entry, index) => <li key={index}><span className="whitespace-pre-wrap">{entry.text}</span>{entry.check && <span className="mt-1 block text-gray-700">{t('learner.homework.check')}: {entry.check}</span>}</li>)}</ol>
          <Failure error={hint.error}/>
        </>}
      </Section> : <p className="m-0 rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-6 text-sm">{t('learner.homework.pick')}</p>}
    </div>}
  </ConsentGate>;
}

// --- L14 --------------------------------------------------------------------------------
interface BriefView { id: string; based_on: string; tip: string; word: { word: string; meaning_en: string; meaning_uz: string; meaning_ru: string; example: string }; questions: { prompt: string; options: string[]; answer: (McqResult & { explanation: string }) | null }[]; score: number; answered: number }
interface BriefState { schedule: { enabled: boolean; time: string; next_at: string | null } | null; telegram_linked: boolean; bot_url: string; today: BriefView | null }
export function BriefPage() {
  const t = useT(), call = useLearnerApi(), { date, locale } = useI18n();
  const state = useLoad(() => call<BriefState>('brief'));
  const [time, setTime] = useState('08:30');
  const save = useRun<BriefState>(), now = useRun<{ today: BriefView }>();
  const view = state.data, today = now.data?.today ?? view?.today ?? null;
  const set = (enabled: boolean) => save.run(() => call<BriefState>('brief', { method: 'PUT', body: { enabled, time: view?.schedule?.time && !enabled ? view.schedule.time : time, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tashkent' } }).then((out) => { state.reload(); return out; }));
  const answer = async (q: number, choice: number) => {
    const out = await call<{ brief: BriefView }>('brief-answer', { method: 'POST', body: { id: today!.id, q, choice } }).catch(() => null);
    if (out) now.set({ today: out.brief });
  };
  const meaning = (word: BriefView['word']) => (locale === 'uz' ? word.meaning_uz : locale === 'ru' ? word.meaning_ru : word.meaning_en);
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.brief')} lead={t('learner.brief.lead')} creditKey="daily.brief"/>
    {state.loading && !view && <LoadingState/>}
    <Failure error={state.error} onRetry={state.reload}/>
    {view && <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <Section title={t('learner.brief.telegram')}>
        {!view.telegram_linked ? <><p className="m-0 text-sm">{t('learner.brief.link')}</p><ButtonLink href="https://schood.online/account" variant="secondary">{t('learner.brief.linkGo')}</ButtonLink></> : <>
          <p className="m-0 text-sm">{view.schedule?.enabled ? t('learner.brief.on', { time: view.schedule.time }) : t('learner.brief.off')}</p>
          {view.schedule?.next_at && <p className="m-0 text-xs text-gray-600">{t('learner.brief.next', { date: date(view.schedule.next_at, { dateStyle: 'medium', timeStyle: 'short' }) })}</p>}
          <Field label={t('learner.brief.time')} hint={t('learner.brief.quiet')}>{(id) => <TextInput id={id} type="time" min="08:00" max="21:59" value={time} onChange={(event) => setTime(event.target.value)}/>}</Field>
          <div className="flex flex-wrap gap-2"><Button disabled={save.busy || time < '08:00' || time >= '22:00'} onClick={() => void set(true)}>{t('learner.brief.turnOn')}</Button>{view.schedule?.enabled && <Button variant="secondary" disabled={save.busy} onClick={() => void set(false)}>{t('learner.brief.turnOff')}</Button>}</div>
          <a href={view.bot_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline">{t('learner.brief.openBot')}</a>
        </>}
        <p className="m-0 text-xs text-gray-600">{t('learner.brief.budget')}</p>
        <Failure error={save.error}/>
      </Section>
      <div className="grid content-start gap-4">
        {today ? <>
          <Section title={t('learner.brief.today')}>
            <p className="m-0 text-sm text-gray-700">{today.based_on}</p>
            <p className="m-0 text-sm"><strong>{t('learner.brief.word')}:</strong> {today.word.word} — {meaning(today.word)}<br/><em>{today.word.example}</em></p>
            <p className="m-0 text-sm"><strong>{t('learner.brief.tip')}:</strong> {today.tip}</p>
          </Section>
          {today.questions.map((question, index) => <Mcq key={index} index={index} prompt={question.prompt} options={question.options} result={question.answer} onAnswer={(choice) => void answer(index, choice)}/>)}
          {today.answered === today.questions.length && <p role="status" className="m-0 font-semibold">{t('learner.brief.done', { score: today.score, total: today.questions.length })}</p>}
        </> : <Section title={t('learner.brief.today')}>
          <p className="m-0 text-sm">{t('learner.brief.none')}</p>
          <div className="flex flex-wrap items-center gap-3"><Button variant="spark" disabled={now.busy} onClick={() => void now.run(() => call('brief', { method: 'POST' }))}>{now.busy ? t('chat.thinking') : t('learner.brief.now')}</Button><Cost creditKey="daily.brief"/></div>
          <Failure error={now.error}/>
        </Section>}
      </div>
    </div>}
  </ConsentGate>;
}

// --- L17 --------------------------------------------------------------------------------
interface Links { landing: string; bot: string; web: string; signup: string; share: string }
interface DuelRow { code: string; topic: string; level: string | null; status: string; created_at: string; result: { won: boolean; draw: boolean; me: number; friend: number | null } | null; links: Links }

function ShareLinks({ links }: { links: Links }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return <div className="flex flex-wrap gap-2">
    <ButtonLink href={links.share} target="_blank" rel="noopener noreferrer" variant="spark"><Send size={16} aria-hidden="true"/>{t('learner.duel.shareTelegram')}</ButtonLink>
    <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(links.landing).then(() => setCopied(true)); }} icon={<Copy size={16} aria-hidden="true"/>}>{copied ? t('chat.copied') : t('learner.duel.copy')}</Button>
  </div>;
}

export function DuelsPage() {
  const t = useT(), call = useLearnerApi();
  const mine = useLoad(() => call<{ duels: DuelRow[]; win_streak: number }>('duels'));
  const [topic, setTopic] = useState(''), [friend, setFriend] = useState('');
  const make = useRun<{ duel: { code: string; topic: string; level: string; links: Links } }>();
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.duels')} lead={t('learner.duel.lead')} creditKey="duel.quiz"/>
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title={t('learner.duel.new')}>
        <Field label={t('learner.duel.topic')} hint={t('learner.duel.topicHint')}>{(id) => <TextInput id={id} value={topic} maxLength={80} onChange={(event) => setTopic(event.target.value)}/>}</Field>
        <Field label={t('learner.duel.friend')}>{(id) => <select id={id} value={friend} onChange={(event) => setFriend(event.target.value)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm"><option value="">{t('learner.duel.same')}</option>{['A1', 'A2', 'B1', 'B2', 'C1'].map((value) => <option key={value}>{value}</option>)}</select>}</Field>
        <div><Button variant="spark" disabled={!topic.trim() || make.busy} icon={<Swords size={16} aria-hidden="true"/>} onClick={() => void make.run(() => call('duel-create', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { topic, friend_level: friend || undefined } }).then((out) => { mine.reload(); return out as never; }))}>{make.busy ? t('chat.thinking') : t('learner.duel.make')}</Button></div>
        {make.data && <div className="grid gap-2 rounded-2xl bg-lime-soft p-3"><p className="m-0 text-sm font-semibold">{t('learner.duel.ready', { topic: make.data.duel.topic, level: make.data.duel.level })}</p><ShareLinks links={make.data.duel.links}/><p className="m-0 text-xs">{t('learner.duel.free')}</p></div>}
        <Failure error={make.error}/>
      </Section>
      <Section title={t('learner.duel.mine')}>
        {mine.data && <Badge tone="lime">{t('learner.duel.streak', { count: mine.data.win_streak })}</Badge>}
        {mine.loading && !mine.data && <LoadingState/>}
        {mine.data && !mine.data.duels.length && <p className="m-0 text-sm text-gray-700">{t('learner.duel.none')}</p>}
        <ul className="m-0 grid list-none gap-2 p-0">{mine.data?.duels.map((duel) => <li key={duel.code} className="grid gap-2 rounded-2xl bg-white/85 p-3 text-sm">
          <span><strong>{duel.topic}</strong> {duel.level && <Badge>{duel.level}</Badge>} <Badge tone={duel.result?.won ? 'lime' : 'neutral'}>{duel.result ? (duel.result.draw ? t('learner.duel.draw') : duel.result.won ? t('learner.duel.won', { me: duel.result.me, friend: duel.result.friend ?? 0 }) : t('learner.duel.lost', { me: duel.result.me, friend: duel.result.friend ?? 0 })) : t(`learner.duel.status.${duel.status}`)}</Badge></span>
          {duel.status === 'open' && <ShareLinks links={duel.links}/>}
          {duel.status === 'active' && <a href={duel.links.web} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{t('learner.duel.play')}</a>}
        </li>)}</ul>
        <Failure error={mine.error}/>
      </Section>
    </div>
  </ConsentGate>;
}

/** ai.schood.online/duel/:code, also for friends who are not signed in (no AI is used). */
export function DuelLandingPage({ params }: { params: Record<string, string> }) {
  const t = useT(), session = useSession(), { query } = useLocation();
  const code = String(params.code ?? '').toUpperCase();
  const ref = /^[A-Z0-9]{4,16}$/.test(query.get('ref') ?? '') ? query.get('ref')! : null;
  const signup = `${signInUrl('signup', location.href)}${ref ? `&ref=${ref}` : ''}`;
  const signedIn = session.status === 'signed_in';
  const bot = `https://t.me/schoodstudentbot?start=duel_${encodeURIComponent(code)}`, web = `https://english.schood.online/duel/${encodeURIComponent(code)}`;
  return <div className="mx-auto max-w-xl">
    <Section title={t('learner.duel.invited')}>
      <p className="m-0 text-sm leading-6">{t('learner.duel.invitedLead')}</p>
      {signedIn ? <SignedInInvite code={code} bot={bot} web={web}/> : <>
        <div className="flex flex-wrap gap-2"><ButtonLink href={signup} variant="spark">{t('header.signUp')}</ButtonLink><ButtonLink href={signInUrl()} variant="secondary">{t('header.signIn')}</ButtonLink><ButtonLink href={bot} variant="ghost">{t('learner.duel.playTelegram')}</ButtonLink></div>
        <p className="m-0 text-xs text-gray-600">{t('learner.duel.signupNote')}</p>
      </>}
    </Section>
  </div>;
}
function SignedInInvite({ code, bot, web }: { code: string; bot: string; web: string }) {
  const t = useT(), call = useLearnerApi();
  const invite = useLoad(() => call<{ duel: { topic: string; level: string | null; challenger: string | null; mine: boolean; status: string; links: Links } }>('duel', { query: { code } }));
  if (invite.loading) return <LoadingState/>;
  if (invite.error) return <Failure error={invite.error}/>;
  const duel = invite.data!.duel;
  return <>
    <p className="m-0 font-display text-xl font-bold">{duel.challenger ? t('learner.duel.from', { name: duel.challenger }) : t('learner.duel.fromFriend')}: {duel.topic} {duel.level && <Badge>{duel.level}</Badge>}</p>
    {duel.mine ? <ShareLinks links={duel.links}/> : duel.status === 'open' || duel.status === 'active'
      ? <div className="flex flex-wrap gap-2"><ButtonLink href={bot} variant="spark">{t('learner.duel.playTelegram')}</ButtonLink><ButtonLink href={web} variant="secondary">{t('learner.duel.playWeb')}</ButtonLink></div>
      : <p className="m-0 text-sm">{t(`learner.duel.status.${duel.status}`)}</p>}
    <p className="m-0 text-xs text-gray-600">{t('learner.duel.free')}</p>
  </>;
}
