import { useEffect, useState, type FormEvent } from 'react';
import { ClipboardCheck, Mail, Sparkles } from 'lucide-react';
import { api, ApiErrorState, Badge, BrandMark, Button, Card, Chat, CreditCost, Dialog, EmptyState, Field, Link, LoadingState, PageHeader, PlanGate, TextArea, useT, useWorkspace } from '../../core/index.ts';
import { ApprovalList, CentreGate, Loaded, Section, Select, newKey, useCentreApi, useLoad, useSubmit } from '../kit.tsx';

// T7 the teacher's classes and their read-only assistant, T8 parent message drafts
// (sent after the office approves), and C2 the branded Student Assistant.

interface Student { contact_id: string; name: string; missed_homework: number; absences_30d: number; avg_score: number | null }
interface ClassView { classroom_id: string; name: string; students: Student[]; assignments_due: number }
const PURPOSES = ['progress', 'attendance', 'homework', 'praise', 'payment', 'meeting', 'other'] as const;

export function ClassesPage() {
  const t = useT();
  return <CentreGate roles={['owner', 'admin', 'teacher']}>
    <PageHeader title={t('centre.classes.title')} lead={t('centre.classes.lead')}/>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"><Classes/><Card><Chat specialist="teacher_assistant" heading={t('centre.classes.ask')}/></Card></div>
  </CentreGate>;
}

function Classes() {
  const t = useT();
  const state = useLoad<{ classes: ClassView[]; as_of: string }>('my-classes');
  const [drafting, setDrafting] = useState<Student | null>(null);
  return <div className="grid content-start gap-4">
    <Loaded state={state}>{(data) => !data.classes.length ? <EmptyState title={t('centre.classes.none')}/> : data.classes.map((room) => <Section key={room.classroom_id} title={room.name} lead={t('centre.classes.due', { count: room.assignments_due })}>
      <ul className="m-0 grid list-none gap-2 p-0">{room.students.map((student) => <li key={student.contact_id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-navy-line/20 bg-white px-3 py-2 text-sm">
        <span className="min-w-0"><span className="font-semibold">{student.name}</span>
          <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
            {student.missed_homework > 0 && <Badge tone={student.missed_homework >= 2 ? 'warn' : 'neutral'}>{t('centre.classes.missed', { count: student.missed_homework })}</Badge>}
            {student.absences_30d > 0 && <Badge tone={student.absences_30d >= 2 ? 'warn' : 'neutral'}>{t('centre.classes.absent', { count: student.absences_30d })}</Badge>}
            {student.avg_score !== null && <Badge>{t('centre.classes.average', { score: Math.round(student.avg_score) })}</Badge>}
          </span>
        </span>
        <Button size="sm" variant="secondary" onClick={() => setDrafting(student)} icon={<Mail size={14} aria-hidden="true"/>}>{t('centre.classes.messageParent')}</Button>
      </li>)}</ul>
    </Section>)}</Loaded>
    <PlanGate feature="T8"><Section title={t('centre.classes.drafts')} lead={t('centre.classes.draftsLead')}><ApprovalList kinds={['centre_parent_message']} empty={t('centre.classes.noDrafts')}/></Section></PlanGate>
    {drafting && <ParentDraft student={drafting} onClose={() => setDrafting(null)}/>}
  </div>;
}

function ParentDraft({ student, onClose }: { student: Student; onClose(): void }) {
  const t = useT(), call = useCentreApi();
  const [form, setForm] = useState({ purpose: 'progress', language: 'uz', channel: 'telegram', note: '' });
  const [result, setResult] = useState<{ draft: string; action_id: string; guardian: { name: string } | null } | null>(null);
  const [key] = useState(newKey);
  const submit = useSubmit();
  const draft = (event: FormEvent) => { event.preventDefault(); void submit.run(async () => setResult(await call('parent-draft', { method: 'POST', idempotencyKey: key, body: { contact_id: student.contact_id, purpose: form.purpose, language: form.language, channel: form.channel, note: form.note.trim() || null } }))); };
  return <Dialog open title={t('centre.classes.messageAbout', { name: student.name })} onClose={onClose} closeLabel={t('centre.common.close')}>
    {result ? <div className="grid gap-3">
      <p className="m-0 text-sm text-gray-700">{result.guardian ? t('centre.classes.toGuardian', { name: result.guardian.name }) : t('centre.classes.officeChooses')}</p>
      <ApprovalList ids={[result.action_id]}/>
      <div><Button variant="secondary" onClick={onClose}>{t('centre.common.done')}</Button></div>
    </div> : <form onSubmit={draft} className="grid gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select label={t('centre.classes.purpose')} value={form.purpose} onChange={(purpose) => setForm({ ...form, purpose })} options={PURPOSES.map((value) => ({ value, label: t(`centre.classes.purposes.${value}`) }))}/>
        <Select label={t('centre.common.language')} value={form.language} onChange={(language) => setForm({ ...form, language })} options={['uz', 'ru', 'en'].map((lang) => ({ value: lang, label: t(`centre.lang.${lang}`) }))}/>
        <Select label={t('centre.classes.channel')} value={form.channel} onChange={(channel) => setForm({ ...form, channel })} options={[{ value: 'telegram', label: t('centre.classes.telegram') }, { value: 'inapp', label: t('centre.classes.portal') }]}/>
      </div>
      <Field label={t('centre.office.note')} hint={t('centre.classes.noteHint')}>{(id) => <TextArea id={id} rows={2} maxLength={1000} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })}/>}</Field>
      {submit.error !== null && <ApiErrorState error={submit.error}/>}
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" variant="spark" disabled={submit.busy} icon={<Sparkles size={16} aria-hidden="true"/>}>{submit.busy ? t('centre.common.drafting') : t('centre.common.draft')}</Button><CreditCost creditKey="parent.message"/></div>
      <p className="m-0 text-xs text-gray-600">{t('centre.classes.approvalNote')}</p>
    </form>}
  </Dialog>;
}

// --- C2 the branded Student Assistant ----------------------------------------------------------------

interface Rules { hint_policy: 'during_homework' | 'always' | 'off'; focus_topics: string[]; groups: { name: string; level: string | null }[] }

export function MyCentrePage() {
  const t = useT(), workspace = useWorkspace();
  const me = workspace.me!, ws = me.workspace;
  const name = ws.branding.assistant_name ?? ws.name;
  const [rules, setRules] = useState<Rules | null>(null);
  const tests = useLoad<{ tests: { id: string; title: string }[]; attempts: { test_page_id: string | null; status: string; report: { level_label: string } | null }[] }>(ws.kind === 'centre' ? 'placement-available' : null);
  useEffect(() => {
    if (ws.kind !== 'centre') return;
    api<{ blocks: { kind: string; data: Rules }[] }>('core/context', { workspaceId: workspace.workspaceId, query: { kind: 'centre_rules' } }).then((result) => setRules(result.blocks[0]?.data ?? null)).catch(() => setRules(null));
  }, [ws.kind, workspace.workspaceId]);
  return <CentreGate>
    <header className="mb-6 flex items-center gap-3" style={ws.branding.primary_color ? { borderLeft: `4px solid ${ws.branding.primary_color}`, paddingLeft: '0.75rem' } : undefined}>
      <BrandMark name={ws.name} logo={ws.branding.logo_url} color={ws.branding.primary_color} size={48}/>
      <div><h1 className="m-0 font-display text-3xl font-bold">{name}</h1><p className="m-0 text-sm text-gray-700">{t('centre.my.lead', { centre: ws.name })}</p></div>
    </header>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card><Chat specialist="student_assistant" heading={t('centre.my.chat', { name })} autoFocus/></Card>
      <div className="grid content-start gap-4">
        <Card>
          <h2 className="m-0 font-display text-base font-bold">{t('centre.my.rules')}</h2>
          {!rules ? <LoadingState/> : <>
            <p className="m-0 mt-2 text-sm text-gray-700">{t(`centre.my.policy.${rules.hint_policy}`)}</p>
            {rules.groups.length > 0 && <p className="m-0 mt-2 text-sm">{t('centre.my.groups')}: {rules.groups.map((group) => group.name).join(', ')}</p>}
            {rules.focus_topics.length > 0 && <p className="m-0 mt-2 text-sm">{t('centre.groups.focus')}: {rules.focus_topics.join(', ')}</p>}
          </>}
        </Card>
        <Card>
          <h2 className="m-0 font-display text-base font-bold">{t('centre.my.tools')}</h2>
          <ul className="m-0 mt-2 grid list-none gap-2 p-0 text-sm">{['explain', 'words', 'reading'].map((tool) => <li key={tool}>{t(`centre.my.tool.${tool}`)}</li>)}</ul>
          <p className="m-0 mt-2 text-xs text-gray-600">{t('centre.my.toolsHint')}</p>
        </Card>
        <Card>
          <h2 className="m-0 inline-flex items-center gap-2 font-display text-base font-bold"><ClipboardCheck size={16} aria-hidden="true"/>{t('centre.my.placement')}</h2>
          <Loaded state={tests}>{(data) => !data.tests.length ? <p className="m-0 mt-2 text-sm text-gray-700">{t('centre.my.noTests')}</p> : <ul className="m-0 mt-2 grid list-none gap-2 p-0">{data.tests.map((test) => {
            const done = data.attempts.find((row) => row.test_page_id === test.id);
            return <li key={test.id} className="flex items-center justify-between gap-2 text-sm"><span>{test.title}</span>{done?.report ? <Badge tone="lime">{done.report.level_label}</Badge> : <Link to={`/placement/${test.id}`} className="font-semibold text-gray-900 underline">{done ? t('centre.my.continue') : t('centre.my.take')}</Link>}</li>;
          })}</ul>}</Loaded>
        </Card>
      </div>
    </div>
  </CentreGate>;
}
