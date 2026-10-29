import { useEffect, useState } from 'react';
import { BookOpen, Brain, CalendarCheck, FileText, Globe2, Languages, MessageSquareText, Mic, Camera, PenLine, Swords, Target, UsersRound, Volume2, ClipboardList, Briefcase } from 'lucide-react';
import { api, Badge, Button, Card, Chat, Link, SparkMark, useLocation, useT, useWorkspace, type ContextBlockView } from '../../core/index.ts';
import { ConsentGate, Failure, Section, ToolHeader, useLearnerApi, useRun } from '../kit.tsx';

// L1 tutor page and the learner hub listing every tool.

export const TOOLS = [
  { id: 'tutor', path: '/tutor', icon: MessageSquareText, feature: 'L1' },
  { id: 'explain', path: '/explain', icon: Brain, feature: 'L2' },
  { id: 'write', path: '/write', icon: PenLine, feature: 'L3' },
  { id: 'essays', path: '/essays', icon: FileText, feature: 'L8' },
  { id: 'speak', path: '/speak', icon: Mic, feature: 'L4' },
  { id: 'interview', path: '/interview', icon: Briefcase, feature: 'L12' },
  { id: 'pronounce', path: '/pronounce', icon: Volume2, feature: 'L13' },
  { id: 'plan', path: '/plan', icon: Target, feature: 'L5' },
  { id: 'words', path: '/words', icon: Languages, feature: 'L6' },
  { id: 'reading', path: '/reading', icon: BookOpen, feature: 'L10' },
  { id: 'photo', path: '/photo', icon: Camera, feature: 'L9' },
  { id: 'homework', path: '/homework', icon: ClipboardList, feature: 'L7' },
  { id: 'brief', path: '/brief', icon: CalendarCheck, feature: 'L14' },
  { id: 'abroad', path: '/abroad', icon: Globe2, feature: 'L16' },
  { id: 'duels', path: '/duels', icon: Swords, feature: 'L17' },
  { id: 'family', path: '/family', icon: UsersRound, feature: 'P1' },
] as const;

export function LearnHubPage() {
  const t = useT(), workspace = useWorkspace();
  const centre = workspace.me?.workspace.kind === 'centre';
  const visible = TOOLS.filter((tool) => tool.id !== 'family' && (tool.id !== 'homework' || centre));
  return <div>
    <ToolHeader title={t('learner.hub.title')} lead={t('learner.hub.lead')}/>
    <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((tool) => {
        const open = workspace.access(tool.feature).allowed, Icon = tool.icon;
        return <li key={tool.id}><Link to={tool.path} className="flex h-full min-h-24 items-start gap-3 rounded-3xl border border-navy-line bg-white/85 p-4 text-gray-900 no-underline hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-navy-line bg-cream-soft" aria-hidden="true"><Icon size={18}/></span>
          <span className="min-w-0"><span className="flex flex-wrap items-center gap-2 font-semibold">{t(`learner.tool.${tool.id}`)}{!open && <Badge>{t('learner.hub.locked')}</Badge>}</span><span className="mt-1 block text-sm leading-5 text-gray-700">{t(`learner.tool.${tool.id}.lead`)}</span></span>
        </Link></li>;
      })}
    </ul>
    <Privacy/>
  </div>;
}

/** Withdraw the age step or delete everything Schood AI kept from these tools. */
function Privacy() {
  const t = useT(), call = useLearnerApi();
  const withdraw = useRun<unknown>(), wipe = useRun<{ deleted: number }>();
  return <Section title={t('learner.privacy.title')} className="mt-6">
    <p className="m-0 text-sm text-gray-700">{t('learner.privacy.lead')}</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" disabled={withdraw.busy} onClick={() => void withdraw.run(() => call('consent', { method: 'DELETE' }))}>{t('learner.privacy.withdraw')}</Button>
      <Button variant="danger" size="sm" disabled={wipe.busy} onClick={() => { if (confirm(t('learner.privacy.confirm'))) void wipe.run(() => call('history', { method: 'DELETE', body: { all: true } })); }}>{t('learner.privacy.delete')}</Button>
    </div>
    {!!withdraw.data && <p role="status" className="m-0 text-sm">{t('learner.privacy.withdrawn')}</p>}
    {wipe.data && <p role="status" className="m-0 text-sm">{t('learner.privacy.deleted', { count: wipe.data.deleted })}</p>}
    <Failure error={withdraw.error ?? wipe.error}/>
  </Section>;
}

const KNOWS = ['learner_prediction', 'learner_activity', 'centre_homework', 'centre_feedback'] as const;
function Knows() {
  const t = useT(), workspace = useWorkspace();
  const [blocks, setBlocks] = useState<ContextBlockView[] | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all(KNOWS.map((kind) => api<{ blocks: ContextBlockView[] }>('core/context', { workspaceId: workspace.workspaceId, query: { kind } }).then((out) => out.blocks).catch(() => [])))
      .then((all) => { if (live) setBlocks(all.flat()); });
    return () => { live = false; };
  }, [workspace.workspaceId]);
  return <Card as="div" className="text-sm">
    <h2 className="m-0 font-display text-base font-bold">{t('learner.tutor.knows')}</h2>
    {blocks === null ? <p className="mb-0 mt-2 text-gray-600">{t('state.loading')}</p> : blocks.length
      ? <ul className="mb-0 mt-2 grid gap-1 list-disc pl-5 text-gray-800">{blocks.map((block) => <li key={block.kind}>{t(`learner.context.${block.kind}`)}</li>)}</ul>
      : <p className="mb-0 mt-2 text-gray-700">{t('learner.tutor.knowsNone')}</p>}
    <p className="mb-0 mt-3 text-xs text-gray-600">{t('learner.tutor.knowsNote')}</p>
  </Card>;
}

/** The tutor here: Schood AI's own in a personal workspace, the centre's assistant in a centre. */
const TUTORS = ['tutor', 'student_assistant', 'assistant'];
export function TutorPage() {
  const t = useT(), { query } = useLocation(), workspace = useWorkspace();
  const specialist = TUTORS.find((key) => workspace.me?.specialists.some((entry) => entry.key === key && entry.available)) ?? 'tutor';
  // The thread from the URL only: a new thread's id must not remount the chat mid-answer.
  const thread = query.get('thread');
  // A deep link from a results screen opens with a starter question (ids only in the URL).
  const source = query.get('source');
  const starter = source ? t('learner.tutor.fromResults', { app: t(`learner.source.${source}`) === `learner.source.${source}` ? source : t(`learner.source.${source}`) }) : '';
  return <ConsentGate>
    <ToolHeader title={t('learner.tool.tutor')} lead={t('learner.tutor.lead')} creditKey="tutor.reply"/>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="min-w-0" aria-label={t('learner.tool.tutor')}>
        <Chat key={`${specialist}:${thread ?? 'new'}`} specialist={specialist} threadId={thread} initialMessage={starter} onThread={(id) => { if (id !== thread) history.replaceState(null, '', `/tutor?thread=${encodeURIComponent(id)}`); }}
          heading={<div className="mb-3 flex items-center gap-2"><SparkMark size={28}/><span className="font-semibold">{t('learner.tool.tutor')}</span></div>}/>
      </section>
      <aside className="grid content-start gap-3"><Knows/>
        <Card as="div" className="text-sm"><p className="m-0 text-gray-800">{t('learner.tutor.telegram')}</p></Card>
      </aside>
    </div>
  </ConsentGate>;
}
