import { useState, type ReactNode } from 'react';
import { ArrowLeft, Coins, Copy, Trash2, Wand2 } from 'lucide-react';
import { ApiError, ApiErrorState, Badge, Button, Card, Dialog, EmptyState, Field, Link, navigate, Paywall, TextArea, Thinking, useI18n, useSession, useT } from '../../core/index.ts';
import { coachApi, type BuiltScript, type ScriptDetail, type ScriptList } from '../api.ts';
import { CoachFrame, dateText, Loaded, useLoad } from '../ui.tsx';
import { OpenBot, SignedOut } from './common.tsx';

// /coach/<pack>/scripts and /coach/<pack>/scripts/<id> (B4 Sales): the script builder.
// The learner describes their own product, offer and buyers; one charge returns a call
// script, an objection map, a DM version and a follow-up, saved here and practised in the
// bot with a buyer of their own product. Placeholders such as [your price] mark details
// the coach never invents.

export function CoachScripts({ params }: { params: Record<string, string> }) {
  const session = useSession();
  if (session.status !== 'signed_in') return <SignedOut pack={params.pack}/>;
  return params.id ? <ScriptBody pack={params.pack} id={params.id}/> : <ScriptsBody pack={params.pack}/>;
}

function ScriptsBody({ pack }: { pack: string }) {
  const coach = useLoad(() => coachApi.dashboard(pack), [pack]);
  const list = useLoad(() => coachApi.scripts(pack), [pack]);
  return <Loaded state={coach}>{(data) => <CoachFrame pack={pack} name={data.coach.name} accent={data.coach.accent}>
    <Loaded state={list}>{(view) => <Scripts pack={pack} view={view} allowed={data.access.allowed} plans={data.access.plans}/>}</Loaded>
  </CoachFrame>}</Loaded>;
}

function Scripts({ pack, view, allowed, plans }: { pack: string; view: ScriptList; allowed: boolean; plans: string[] }) {
  const t = useT(), { locale } = useI18n();
  const full = view.scripts.length >= view.max;
  return <>
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 font-display text-xl font-bold">{t('coach.scripts.title')}</h2>
        <Badge>{t('coach.scripts.count', { count: view.scripts.length, max: view.max })}</Badge>
      </div>
      <p className="m-0 text-sm leading-6 text-gray-700">{t('coach.scripts.lead')}</p>
      {view.scripts.length ? <ul className="m-0 flex list-none flex-col p-0">
        {view.scripts.map((script) => <li key={script.id} className="border-b border-navy-line/15 py-2 last:border-0">
          <Link to={`/coach/${pack}/scripts/${script.id}`} className="flex min-h-11 min-w-0 items-center justify-between gap-3 text-sm text-gray-900 no-underline">
            <span className="min-w-0 break-words font-semibold">{script.title}</span>
            <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-gray-600"><span>{t('coach.scripts.objections', { count: script.objections })}</span><span>{dateText(script.created_at, locale)}</span></span>
          </Link>
        </li>)}
      </ul> : <EmptyState title={t('coach.scripts.empty')} lead={t('coach.scripts.emptyLead')}/>}
    </Card>
    {full ? <Card><p className="m-0 text-sm leading-6 text-gray-700">{t('coach.scripts.limit', { max: view.max })}</p></Card>
      : <Builder pack={pack} view={view} allowed={allowed} plans={plans}/>}
  </>;
}

function Builder({ pack, view, allowed, plans }: { pack: string; view: ScriptList; allowed: boolean; plans: string[] }) {
  const t = useT();
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(view.questions.map((question) => [question.id, ''])));
  const [state, setState] = useState<{ busy: boolean; error: unknown }>({ busy: false, error: null });
  const ready = view.questions.every((question) => answers[question.id].trim().length >= 8);
  const build = async () => {
    setState({ busy: true, error: null });
    try {
      const result = await coachApi.buildScript(pack, Object.fromEntries(Object.entries(answers).map(([id, value]) => [id, value.trim()])), crypto.randomUUID());
      navigate(`/coach/${pack}/scripts/${result.script.id}`);
    } catch (error) {
      // The answers stay; a failed build is refunded by the function, so trying again is safe.
      setState({ busy: false, error });
    }
  };
  if (!allowed) return <Paywall plans={plans}/>;
  const limitError = state.error instanceof ApiError && state.error.code === 'limit_reached';
  return <Card className="flex flex-col gap-4">
    <h2 className="m-0 font-display text-lg font-bold">{t('coach.scripts.new')}</h2>
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (ready && !state.busy) void build(); }}>
      {view.questions.map((question, index) => <Field key={question.id} label={`${index + 1}. ${question.prompt}`} hint={t('coach.scripts.chars', { count: answers[question.id].length, max: question.max_chars })}>
        {(id) => <TextArea id={id} rows={4} maxLength={question.max_chars} placeholder={question.example} value={answers[question.id]} disabled={state.busy}
          onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })}/>}
      </Field>)}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="spark" disabled={!ready || state.busy} icon={<Wand2 size={16} aria-hidden="true"/>}>{t('coach.scripts.build')}</Button>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700"><Coins size={14} aria-hidden="true"/>{t('coach.scripts.cost', { count: view.cost })}</span>
        {state.busy && <Thinking label={t('coach.scripts.building')}/>}
      </div>
      {!ready && !state.busy && <p className="m-0 text-xs text-gray-600">{t('coach.scripts.fillAll')}</p>}
    </form>
    {limitError ? <p role="alert" className="m-0 text-sm text-gray-800">{t('coach.scripts.limit', { max: view.max })}</p>
      : state.error !== null && <ApiErrorState error={state.error} onRetry={ready ? () => void build() : undefined}/>}
  </Card>;
}

function ScriptBody({ pack, id }: { pack: string; id: string }) {
  const coach = useLoad(() => coachApi.dashboard(pack), [pack]);
  const detail = useLoad(() => coachApi.script(pack, id), [pack, id]);
  return <Loaded state={coach}>{(data) => <CoachFrame pack={pack} name={data.coach.name} accent={data.coach.accent}>
    <Loaded state={detail}>{(view) => <Script pack={pack} view={view}/>}</Loaded>
  </CoachFrame>}</Loaded>;
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <Card className="flex flex-col gap-2">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="m-0 font-display text-lg font-bold">{title}</h3>{action}</div>
    {children}
  </Card>;
}
const Text = ({ children }: { children: ReactNode }) => <p className="m-0 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">{children}</p>;
const List = ({ items, ordered = false }: { items: string[]; ordered?: boolean }) => {
  const Tag = ordered ? 'ol' : 'ul';
  return <Tag className="m-0 flex flex-col gap-1.5 pl-5 text-sm leading-6 text-gray-800">{items.map((item, index) => <li key={index} className="break-words">{item}</li>)}</Tag>;
};

function CopyButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return <Button size="sm" variant="secondary" icon={<Copy size={14} aria-hidden="true"/>} className="!min-h-11"
    onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); } }}>
    <span role="status">{copied ? t('coach.scripts.copied') : t('coach.scripts.copy')}</span>
  </Button>;
}

function Script({ pack, view }: { pack: string; view: ScriptDetail }) {
  const t = useT(), { locale } = useI18n();
  const s: Partial<BuiltScript> = view.script.script ?? {};
  const [remove, setRemove] = useState<{ open: boolean; busy: boolean; error: unknown }>({ open: false, busy: false, error: null });
  const types = view.objection_types;
  const groups = new Map<string, NonNullable<BuiltScript['objections']>>();
  for (const entry of s.objections ?? []) groups.set(entry.type, [...(groups.get(entry.type) ?? []), entry]);
  const del = async () => {
    setRemove({ open: true, busy: true, error: null });
    try { await coachApi.deleteScript(pack, view.script.id); navigate(`/coach/${pack}/scripts`); } catch (error) { setRemove({ open: false, busy: false, error }); }
  };
  const has = (value: unknown) => (Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim().length > 0);
  return <>
    <Link to={`/coach/${pack}/scripts`} className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-gray-900 no-underline"><ArrowLeft size={16} aria-hidden="true"/>{t('coach.scripts.back')}</Link>
    <Card className="flex flex-col gap-3">
      <h2 className="m-0 break-words font-display text-xl font-bold">{view.script.title}</h2>
      <p className="m-0 text-xs text-gray-600">{t('coach.scripts.saved', { date: dateText(view.script.created_at, locale) })}</p>
      <div className="flex flex-wrap gap-2"><OpenBot bot={view.bot} label={t('coach.scripts.practise')}/></div>
      {view.bot && <p className="m-0 text-xs leading-5 text-gray-600">{t('coach.scripts.practiseHow')}</p>}
    </Card>

    {has(s.watch_outs) && <Card className="flex flex-col gap-2 !bg-amber-50">
      <h3 className="m-0 font-display text-lg font-bold">{t('coach.scripts.watchOuts')}</h3>
      <p className="m-0 text-sm leading-6 text-gray-700">{t('coach.scripts.watchOutsLead')}</p>
      <List items={s.watch_outs!}/>
    </Card>}

    {(has(s.product) || has(s.offer)) && <Section title={t('coach.scripts.product')}>
      {has(s.product) && <Text>{s.product}</Text>}
      {has(s.offer) && <p className="m-0 break-words text-sm leading-6"><span className="font-semibold">{t('coach.scripts.offer')}:</span> {s.offer}</p>}
    </Section>}

    {s.buyer && <Section title={t('coach.scripts.buyer')}>
      <dl className="m-0 flex flex-col gap-2 text-sm leading-6">
        {has(s.buyer.who) && <div><dt className="font-semibold text-gray-900">{t('coach.scripts.who')}</dt><dd className="m-0 break-words text-gray-800">{s.buyer.who}</dd></div>}
        {has(s.buyer.pains) && <div><dt className="font-semibold text-gray-900">{t('coach.scripts.pains')}</dt><dd className="m-0"><List items={s.buyer.pains}/></dd></div>}
        {has(s.buyer.decision) && <div><dt className="font-semibold text-gray-900">{t('coach.scripts.decision')}</dt><dd className="m-0 break-words text-gray-800">{s.buyer.decision}</dd></div>}
        {has(s.buyer.budget) && <div><dt className="font-semibold text-gray-900">{t('coach.scripts.budget')}</dt><dd className="m-0 break-words text-gray-800">{s.buyer.budget}</dd></div>}
        {has(s.buyer_opening) && <div><dt className="font-semibold text-gray-900">{t('coach.scripts.buyerOpening')}</dt><dd className="m-0 break-words italic text-gray-800">{s.buyer_opening}</dd></div>}
      </dl>
    </Section>}

    {has(s.opening) && <Section title={t('coach.scripts.opening')}><Text>{s.opening}</Text></Section>}
    {has(s.discovery) && <Section title={t('coach.scripts.discovery')}><List items={s.discovery!} ordered/></Section>}
    {has(s.pitch) && <Section title={t('coach.scripts.pitch')}><Text>{s.pitch}</Text></Section>}

    {groups.size > 0 && <Section title={t('coach.scripts.objectionMap')}>
      <div className="flex flex-col gap-4">
        {[...groups].map(([type, entries]) => <div key={type} className="flex flex-col gap-2">
          <Badge tone="sky">{types[type] ?? t('coach.scripts.other')}</Badge>
          {entries.map((entry, index) => <div key={index} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-navy-line/30 bg-white/70 p-3 text-sm leading-6">
            <p className="m-0 break-words"><span className="text-gray-600">{t('coach.scripts.theySay')}</span> <q className="font-semibold text-gray-900">{entry.objection}</q></p>
            <p className="m-0 break-words"><span className="text-gray-600">{t('coach.scripts.youAnswer')}</span> {entry.response}</p>
            {entry.question && <p className="m-0 break-words"><span className="text-gray-600">{t('coach.scripts.thenAsk')}</span> <i>{entry.question}</i></p>}
          </div>)}
        </div>)}
      </div>
    </Section>}

    {has(s.closes) && <Section title={t('coach.scripts.closes')}><List items={s.closes!}/></Section>}
    {has(s.next_steps) && <Section title={t('coach.scripts.nextSteps')}><List items={s.next_steps!}/></Section>}
    {has(s.dm) && <Section title={t('coach.scripts.dm')} action={<CopyButton text={s.dm!}/>}><Text>{s.dm}</Text></Section>}
    {has(s.follow_up) && <Section title={t('coach.scripts.followUp')} action={<CopyButton text={s.follow_up!}/>}><Text>{s.follow_up}</Text></Section>}

    {Object.keys(view.script.input ?? {}).length > 0 && <Card className="flex flex-col gap-2">
      <details>
        <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-gray-900">{t('coach.scripts.yourAnswers')}</summary>
        <div className="mt-2 flex flex-col gap-2">{Object.values(view.script.input).map((answer, index) => <Text key={index}>{answer}</Text>)}</div>
      </details>
    </Card>}

    <Card className="flex flex-col gap-3">
      <div><Button variant="danger" onClick={() => setRemove({ open: true, busy: false, error: null })} icon={<Trash2 size={16} aria-hidden="true"/>}>{t('coach.scripts.delete')}</Button></div>
      {remove.error !== null && <ApiErrorState error={remove.error}/>}
    </Card>
    <Dialog open={remove.open} title={t('coach.scripts.deleteTitle')} closeLabel={t('coach.close')} onClose={() => setRemove({ ...remove, open: false })}>
      <p className="mt-0 text-sm leading-6 text-gray-700">{t('coach.scripts.deleteLead')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" disabled={remove.busy} onClick={() => void del()}>{t('coach.scripts.deleteConfirm')}</Button>
        <Button variant="secondary" disabled={remove.busy} onClick={() => setRemove({ ...remove, open: false })}>{t('coach.cancel')}</Button>
      </div>
    </Dialog>
  </>;
}
