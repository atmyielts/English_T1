import { useState, type ReactNode } from 'react';
import { Badge, Button, CreditCost, Field, LoadingState, TextInput, Thinking, useI18n, useLocation, useT } from '../../core/index.ts';
import { ConsentGate, Countdown, Failure, ListenButton, Quote, Section, SpeechInput, ToolHeader, speakAloud, useLearnerApi, useLoad, useRun, type Spoken } from '../kit.tsx';

// L4 speaking partner (conversation, role-plays, IELTS and Multilevel mocks) and
// L12 interview simulator, on one session engine. Speech: the provider's when set
// up, otherwise the browser's; typing always works.

type Text3 = { en: string; uz: string; ru: string };
interface PlanItem { part: string; question: string; prep: number; talk: number; points?: string[]; scene?: string }
interface Session {
  id: string; mode: string; status: 'active' | 'finished'; title: Text3 | null; situation: Text3 | null; role_card: Text3 | null; practice_note: Text3 | null;
  goals: { id: string; text: Text3; met: boolean }[]; messages: { role: 'partner' | 'learner'; text: string }[]; tips: { said: string; better: string }[];
  plan: PlanItem[]; step: number; report: Report | null;
}
type Report = Record<string, unknown> & { kind: 'ielts' | 'multilevel' | 'review' | 'interview' };
interface Overview { sessions: { id: string; mode: string; status: string; title: Text3 | null; score: number | null; created_at: string }[]; scenarios: { id: string; title: Text3; situation: Text3; levels: string[] }[]; interviews: { kind: string; title: Text3; situation: Text3; note: Text3 }[]; speech: { stt: boolean; tts: boolean } }

const pick = (text: Text3 | null, locale: string) => (text ? text[locale as keyof Text3] ?? text.en : '');

function ReportView({ report }: { report: Report }) {
  const t = useT();
  const fixes = (report.fixes ?? []) as { said: string; better: string; why?: string }[];
  const priorities = (report.priorities ?? []) as { text: string; criterion?: string; area?: string }[];
  const fluency = report.fluency as { words_per_minute: number | null; fillers: number; filler_rate: number; words: number } | undefined;
  return <div className="grid gap-4">
    <Section title={t('learner.speak.report')}>
      {report.kind === 'ielts' && <>
        <p className="m-0 font-display text-4xl font-bold">{String(report.overall)} <span className="text-base font-normal text-gray-700">{t('learner.speak.band')}</span></p>
        <ul className="m-0 grid gap-2 p-0 sm:grid-cols-2">{Object.entries(report.bands as Record<string, number | null>).map(([key, value]) => <li key={key} className="list-none rounded-2xl bg-white/80 p-3 text-sm">
          <strong>{t(`learner.speak.criterion.${key}`)}: {value ?? '–'}</strong><br/>{(report.comments as Record<string, string | null>)[key]}
          {((report.evidence as Record<string, string[]> | undefined)?.[key] ?? []).map((quote) => <span key={quote} className="mt-1 block text-xs text-gray-700">{t('learner.speak.evidence')}: <Quote>{quote}</Quote></span>)}
        </li>)}</ul>
        {report.pronunciation_note === 'transcript_only' && <p className="m-0 text-xs text-gray-600">{t('learner.speak.pronNote')}</p>}
      </>}
      {report.kind === 'multilevel' && <>
        <p className="m-0 font-display text-4xl font-bold">{String(report.scaled)} <span className="text-base font-normal text-gray-700">/ 75 {report.level ? `· ${String(report.level).toUpperCase()}` : ''}</span></p>
        <ul className="m-0 grid gap-2 p-0 sm:grid-cols-2">{Object.entries(report.parts as Record<string, { score: number; max: number; comment: string | null }>).map(([key, part]) => <li key={key} className="list-none rounded-2xl bg-white/80 p-3 text-sm"><strong>{key.toUpperCase().replace('_', '–')}: {part.score}/{part.max}</strong><br/>{part.comment}</li>)}</ul>
      </>}
      {report.kind === 'interview' && <>
        <p className="m-0 font-display text-4xl font-bold">{String(report.score)}<span className="text-base font-normal text-gray-700"> / 100</span></p>
        <ul className="m-0 grid gap-2 p-0 sm:grid-cols-2">{(report.criteria as { key: string; score: number; comment: string; evidence: string[] }[]).map((entry) => <li key={entry.key} className="list-none rounded-2xl bg-white/80 p-3 text-sm">
          <strong>{t(`learner.interview.criterion.${entry.key}`)}: {entry.score}/5</strong><br/>{entry.comment}{entry.evidence.map((quote) => <span key={quote} className="mt-1 block text-xs">{t('learner.speak.evidence')}: <Quote>{quote}</Quote></span>)}
        </li>)}</ul>
        {(report.improve as { question: string; said: string; better: string; why: string }[]).map((entry, index) => <div key={index} className="rounded-2xl bg-cream-soft p-3 text-sm"><p className="m-0 text-gray-700">{entry.question}</p><p className="m-0"><Quote>{entry.said}</Quote></p><p className="m-0 font-semibold">→ {entry.better}</p></div>)}
      </>}
      {report.kind === 'review' && <><p className="m-0 font-display text-3xl font-bold">{String(report.score)}<span className="text-base font-normal text-gray-700"> / 100</span></p>{typeof report.summary === 'string' && <p className="m-0 text-sm">{report.summary}</p>}</>}
      {fluency && <p className="m-0 text-sm text-gray-700">{fluency.words_per_minute ? t('learner.speak.wpm', { wpm: fluency.words_per_minute }) : ''} {t('learner.speak.fillers', { count: fluency.fillers })}</p>}
    </Section>
    {fixes.length > 0 && <Section title={t('learner.speak.better')}><ul className="m-0 grid gap-2 pl-5 text-sm">{fixes.map((fix, index) => <li key={index}><Quote>{fix.said}</Quote> → <strong>{fix.better}</strong>{fix.why ? <span className="text-gray-600"> — {fix.why}</span> : null}</li>)}</ul></Section>}
    {priorities.length > 0 && <Section title={t('learner.speak.priorities')}><ol className="m-0 pl-5 text-sm">{priorities.map((entry, index) => <li key={index}>{entry.text}</li>)}</ol></Section>}
  </div>;
}

function Conversation({ session, server, voice, onChange }: { session: Session; server: boolean; voice: boolean; onChange(session: Session): void }) {
  const t = useT(), call = useLearnerApi(), { locale } = useI18n();
  const turn = useRun<{ session: Session; reply: string; voice: { audio: string; mime: string } | null }>();
  const finish = useRun<{ session: Session }>();
  const send = async (spoken: Spoken) => {
    const out = await turn.run(() => call('speaking-turn', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { id: session.id, ...(spoken.audio ? { audio: spoken.audio.data, mime: spoken.audio.mime } : { text: spoken.text, mode: spoken.mode }), seconds: spoken.seconds ?? undefined, voice } }));
    if (out) { onChange(out.session); speakAloud(out.reply, out.voice); }
  };
  const reportKey = session.mode === 'interview' ? 'interview.report' : 'speaking.session_report';
  const learnerTurns = session.messages.filter((message) => message.role === 'learner').length;
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <Section title={pick(session.title, locale) || t(`learner.speak.mode.${session.mode}`)}>
      <ol className="m-0 grid list-none gap-2 p-0" aria-live="polite">{session.messages.map((message, index) => <li key={index} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${message.role === 'partner' ? 'bg-white' : 'ml-auto bg-navy text-white'}`}>
        {message.text}{message.role === 'partner' && <span className="ml-1 inline-block align-middle"><ListenButton text={message.text}/></span>}
      </li>)}</ol>
      {turn.busy && <Thinking label={t('learner.speak.listening')}/>}
      {session.status === 'active' && <><SpeechInput server={server} onDone={(spoken) => void send(spoken)} disabled={turn.busy || finish.busy}/>
        <div className="flex flex-wrap items-center gap-3"><CreditCost creditKey={session.mode === 'interview' ? 'interview.turn' : 'speaking.turn'}/>
          <Button variant="secondary" disabled={learnerTurns < 2 || finish.busy} onClick={() => void finish.run(() => call<{ session: Session }>('speaking-finish', { method: 'POST', body: { id: session.id } }).then((out) => { onChange(out.session); return out; }))}>{t('learner.speak.finish')}</Button><CreditCost creditKey={reportKey}/></div></>}
      <Failure error={turn.error ?? finish.error}/>
    </Section>
    <aside className="grid content-start gap-3">
      {session.situation && <Section title={t('learner.speak.situation')}><p className="m-0 text-sm">{pick(session.situation, locale)}</p><p className="m-0 text-xs text-gray-700">{pick(session.role_card, locale)}</p></Section>}
      {session.goals.length > 0 && <Section title={t('learner.speak.goals')}><ul className="m-0 grid list-none gap-1 p-0 text-sm">{session.goals.map((goal) => <li key={goal.id}>{goal.met ? '✓' : '○'} {pick(goal.text, locale)}</li>)}</ul></Section>}
      {session.tips.length > 0 && <Section title={t('learner.speak.tips')}><ul className="m-0 pl-5 text-sm">{session.tips.slice(-4).map((tip, index) => <li key={index}><Quote>{tip.said}</Quote> → {tip.better}</li>)}</ul></Section>}
      {session.practice_note && <p className="m-0 text-xs text-gray-600">{pick(session.practice_note, locale)}</p>}
    </aside>
  </div>;
}

function Mock({ session, server, onChange }: { session: Session; server: boolean; onChange(session: Session): void }) {
  const t = useT(), call = useLearnerApi();
  const [phase, setPhase] = useState<'ready' | 'prep' | 'talk'>('ready');
  const answer = useRun<{ session: Session }>(), finish = useRun<{ session: Session }>();
  const item = session.plan[session.step];
  const send = async (spoken: Spoken) => {
    const out = await answer.run(() => call('speaking-turn', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { id: session.id, ...(spoken.audio ? { audio: spoken.audio.data, mime: spoken.audio.mime } : { text: spoken.text, mode: spoken.mode }), seconds: spoken.seconds ?? undefined } }));
    if (out) { setPhase('ready'); onChange(out.session); }
  };
  const begin = () => { if (!item) return; speakAloud(item.question); setPhase(item.prep ? 'prep' : 'talk'); };
  if (!item) return <Section title={t('learner.speak.allDone')}>
    <p className="m-0 text-sm">{t('learner.speak.allDoneLead')}</p>
    <div className="flex flex-wrap items-center gap-3"><Button variant="spark" disabled={finish.busy} onClick={() => void finish.run(() => call<{ session: Session }>('speaking-finish', { method: 'POST', body: { id: session.id } }).then((out) => { onChange(out.session); return out; }))}>{finish.busy ? t('chat.thinking') : t('learner.speak.getReport')}</Button><CreditCost creditKey="speaking.mock_report"/></div>
    <Failure error={finish.error}/>
  </Section>;
  return <Section title={t('learner.speak.part', { part: item.part, n: session.step + 1, total: session.plan.length })}>
    {item.scene && <p className="m-0 rounded-2xl bg-cream-soft p-3 text-sm">{item.scene}</p>}
    <p className="m-0 font-display text-lg font-semibold">{item.question}</p>
    {item.points && <ul className="m-0 pl-5 text-sm">{item.points.map((point) => <li key={point}>{point}</li>)}</ul>}
    <div className="flex flex-wrap items-center gap-3">
      {phase === 'ready' && <Button onClick={begin}>{item.prep ? t('learner.speak.startPrep', { seconds: item.prep }) : t('learner.speak.startTalk')}</Button>}
      {phase === 'prep' && <><Countdown seconds={item.prep} running onEnd={() => setPhase('talk')} label={t('learner.speak.prep')}/><span className="text-sm">{t('learner.speak.prep')}</span><Button variant="secondary" size="sm" onClick={() => setPhase('talk')}>{t('learner.speak.skipPrep')}</Button></>}
      {phase === 'talk' && <><Countdown seconds={item.talk} running label={t('learner.speak.talk')}/><span className="text-sm">{t('learner.speak.talkFor', { seconds: item.talk })}</span></>}
      <ListenButton text={item.question}/>
    </div>
    {phase === 'talk' && <SpeechInput server={server} maxSeconds={item.talk + 15} onDone={(spoken) => void send(spoken)} disabled={answer.busy}/>}
    {answer.busy && <Thinking label={t('learner.speak.saving')}/>}
    <p className="m-0 text-xs text-gray-600">{t('learner.speak.mockFree')}</p>
    <Failure error={answer.error}/>
  </Section>;
}

function Picker({ overview, interviewOnly, onStart, busy }: { overview: Overview; interviewOnly: boolean; onStart(body: Record<string, unknown>): void; busy: boolean }) {
  const t = useT(), { locale } = useI18n(), { query } = useLocation();
  const [topic, setTopic] = useState(''), [level, setLevel] = useState('B1');
  const startMode = query.get('mode');
  const card = (title: string, lead: string, body: Record<string, unknown>, extra?: ReactNode) => <li className="grid list-none content-start gap-2 rounded-3xl border border-navy-line bg-white/85 p-4">
    <h3 className="m-0 font-semibold">{title}</h3><p className="m-0 text-sm text-gray-700">{lead}</p>{extra}
    <div><Button size="sm" variant={startMode === body.mode ? 'spark' : 'primary'} disabled={busy} onClick={() => onStart(body)}>{t('learner.speak.start')}</Button></div>
  </li>;
  if (interviewOnly) return <ul className="m-0 grid gap-3 p-0 sm:grid-cols-2">{overview.interviews.map((entry) => card(pick(entry.title, locale), pick(entry.situation, locale), { mode: 'interview', interview: entry.kind, level }, <p className="m-0 text-xs text-gray-600">{pick(entry.note, locale)}</p>))}</ul>;
  return <div className="grid gap-4">
    <div className="flex flex-wrap items-end gap-3"><Field label={t('learner.level')}>{(id) => <select id={id} value={level} onChange={(event) => setLevel(event.target.value)} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{['A2', 'B1', 'B2', 'C1'].map((value) => <option key={value}>{value}</option>)}</select>}</Field></div>
    <ul className="m-0 grid gap-3 p-0 sm:grid-cols-2">
      {card(t('learner.speak.mode.ielts_mock'), t('learner.speak.ieltsLead'), { mode: 'ielts_mock', level })}
      {card(t('learner.speak.mode.multilevel_mock'), t('learner.speak.mlLead'), { mode: 'multilevel_mock', level })}
      {card(t('learner.speak.mode.conversation'), t('learner.speak.convLead'), { mode: 'conversation', level, topic: topic || 'everyday life' }, <Field label={t('learner.speak.topic')}>{(id) => <TextInput id={id} value={topic} maxLength={80} onChange={(event) => setTopic(event.target.value)}/>}</Field>)}
      {overview.scenarios.map((entry) => card(pick(entry.title, locale), pick(entry.situation, locale), { mode: 'roleplay', scenario: entry.id, level }, <Badge>{entry.levels.join('–')}</Badge>))}
    </ul>
  </div>;
}

export function SpeakPage({ interviewOnly = false }: { interviewOnly?: boolean }) {
  const t = useT(), call = useLearnerApi(), { locale } = useI18n();
  const overview = useLoad(() => call<Overview>('speaking'));
  const [session, setSession] = useState<Session | null>(null);
  const [voice, setVoice] = useState(false);
  const start = useRun<{ session: Session }>();
  const open = async (body: Record<string, unknown>) => { const out = await start.run(() => call('speaking-start', { method: 'POST', body })); if (out) { setSession(out.session); if (out.session.messages[0]) speakAloud(out.session.messages[0].text); } };
  const resume = async (id: string) => { const out = await call<{ session: Session }>('speaking', { query: { id } }).catch(() => null); if (out) setSession(out.session); };
  const speech = overview.data?.speech ?? { stt: false, tts: false };
  return <ConsentGate>
    <ToolHeader title={t(interviewOnly ? 'learner.tool.interview' : 'learner.tool.speak')} lead={t(interviewOnly ? 'learner.interview.lead' : 'learner.speak.lead')} creditKey={interviewOnly ? 'interview.turn' : 'speaking.turn'}/>
    {overview.loading && <LoadingState/>}
    <Failure error={overview.error ?? start.error} onRetry={overview.reload}/>
    {session ? <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2"><Button variant="ghost" size="sm" onClick={() => { setSession(null); overview.reload(); }}>{t('learner.speak.back')}</Button>
        {speech.tts && session.mode !== 'ielts_mock' && session.mode !== 'multilevel_mock' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={voice} onChange={(event) => setVoice(event.target.checked)}/>{t('learner.speak.voice')}</label>}</div>
      {session.status === 'finished' && session.report ? <ReportView report={session.report}/>
        : session.mode === 'ielts_mock' || session.mode === 'multilevel_mock' ? <Mock session={session} server={speech.stt} onChange={setSession}/>
        : <Conversation session={session} server={speech.stt} voice={voice} onChange={setSession}/>}
    </div> : overview.data && <div className="grid gap-6">
      <Picker overview={overview.data} interviewOnly={interviewOnly} onStart={(body) => void open(body)} busy={start.busy}/>
      {overview.data.sessions.filter((entry) => (entry.mode === 'interview') === interviewOnly).length > 0 && <Section title={t('learner.speak.recent')}>
        <ul className="m-0 grid list-none gap-1 p-0">{overview.data.sessions.filter((entry) => (entry.mode === 'interview') === interviewOnly).map((entry) => <li key={entry.id}>
          <button type="button" onClick={() => void resume(entry.id)} className="min-h-11 w-full rounded-xl bg-white/70 px-3 py-2 text-left text-sm hover:bg-white">{pick(entry.title, locale) || t(`learner.speak.mode.${entry.mode}`)} · {entry.status === 'finished' ? `${t('learner.speak.done')} ${entry.score ?? ''}` : t('learner.speak.open')}</button>
        </li>)}</ul>
      </Section>}
    </div>}
  </ConsentGate>;
}
export const InterviewPage = () => <SpeakPage interviewOnly/>;
