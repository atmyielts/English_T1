import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { BookOpen, ClipboardList, Copy, Eye, FileCheck2, Gamepad2, Link2, PenLine, Printer, Send, Store } from 'lucide-react';
import { assessmentItems, checkMaterial, parseMaterial, quizQuestions, type Material } from '../../../../../packages/ai-core/src/materials/mod.ts';
import {
  ApiErrorState, ApproveRunCard, Badge, Button, Card, conflictPage, Field, getPage, Link, LoadingState, PageHeader, PlanGate, savePage, TextArea, TextInput,
  navigate, useT, useWorkspace, type ActionView, type PageView,
} from '../../core/index.ts';
import {
  academyGroups, assessmentBanks, createHandout, exportTelegram, openQuiz, proposeAssessment, proposeHomework, proposeListing, type AcademyGroup,
} from '../api.ts';
import { ChecksPanel } from '../Checks.tsx';
import { MaterialEditor } from '../MaterialEditor.tsx';
import { MaterialView } from '../MaterialView.tsx';

// An approved material, as a library page: view it (teacher or student copy), edit
// it with revision-checked saves, and send it on: print, Telegram text, a student
// link, a Live Quiz, a Homework OS assignment or Assessment Cloud draft items (both
// Approve & run), or the marketplace.

const selectClass = 'min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900';

export default function MaterialPage({ params }: { params: Record<string, string> }) {
  const t = useT(), workspace = useWorkspace();
  const [page, setPage] = useState<PageView | null>(null), [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<'teacher' | 'student' | 'edit'>('teacher');
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState<unknown>(null), [conflict, setConflict] = useState<PageView | null>(null);
  const load = useCallback(() => { setError(null); getPage(params.id, workspace.workspaceId).then(setPage).catch(setError); }, [params.id, workspace.workspaceId]);
  useEffect(load, [load]);
  if (error) return <ApiErrorState error={error} onRetry={load}/>;
  if (!page) return <LoadingState/>;
  let material: Material | null = null;
  try { material = parseMaterial(page.material); } catch { material = null; }
  if (!material) return <Card><p className="m-0">{t('teacher.page.notMaterial')}</p><Link to={`/library/${page.id}`}>{t('teacher.page.openLibrary')}</Link></Card>;
  const checks = checkMaterial(material);

  return <>
    <PageHeader eyebrow={<span className="flex flex-wrap items-center gap-2"><Badge>{t(`teacher.kind.${material.kind}`)}</Badge><Badge tone={page.status === 'approved' ? 'lime' : 'neutral'}>{t(`teacher.pageStatus.${page.status}`)}</Badge><span className="text-xs text-gray-600">{t('teacher.page.revision', { revision: page.revision })}</span></span>}
      title={page.title} lead={page.folder || undefined}
      actions={<>
        <Link to={`/studio/page/${page.id}/print`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline"><Printer size={16} aria-hidden="true"/>{t('teacher.page.print')}</Link>
        <Link to={`/library/${page.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-navy-line bg-white px-4 text-sm font-semibold text-gray-900 no-underline"><BookOpen size={16} aria-hidden="true"/>{t('teacher.page.inLibrary')}</Link>
      </>}/>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="min-w-0 overflow-hidden rounded-3xl border border-navy-line bg-white">
        <div role="tablist" aria-label={t('teacher.page.tabs')} className="flex flex-wrap gap-2 border-b border-navy-line/20 bg-cream-soft px-4 py-3">
          {([['teacher', Eye], ['student', FileCheck2], ...(page.can_edit ? [['edit', PenLine] as const] : [])] as const).map(([key, Icon]) => <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => setTab(key as typeof tab)}
            className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold ${tab === key ? 'bg-navy text-white' : 'text-gray-800 hover:bg-white'}`}><Icon size={14} aria-hidden="true"/>{t(`teacher.page.tab.${key}`)}</button>)}
        </div>
        <div className="p-4 md:p-6">
          {tab === 'edit' ? <>
            {conflict && <div role="alert" className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm">{t('teacher.page.conflict', { revision: conflict.revision })} <Button size="sm" variant="secondary" onClick={() => { setPage(conflict); setConflict(null); }}>{t('teacher.page.loadLatest')}</Button></div>}
            <MaterialEditor key={page.revision} material={material} saving={saving} onSave={async (next) => {
              setSaving(true); setSaveError(null);
              try { setPage(await savePage(page.id, { expected_revision: page.revision, material: next, title: next.title, snapshot: true }, workspace.workspaceId)); setTab('teacher'); }
              catch (cause) { const current = conflictPage(cause); if (current) setConflict(current); else setSaveError(cause); } finally { setSaving(false); }
            }}/>
            {saveError !== null && <div className="mt-3"><ApiErrorState error={saveError}/></div>}
          </> : <MaterialView material={material} mode={tab === 'student' ? 'student' : 'teacher'}/>}
        </div>
      </section>
      <aside className="grid content-start gap-4">
        {checks.errors > 0 && <ChecksPanel checks={checks} solver={null} clean={false}/>}
        {page.status !== 'approved' ? <Card as="div"><p className="m-0 text-sm text-gray-800">{t('teacher.page.notApproved')}</p></Card> : <Exports page={page} material={material}/>}
      </aside>
    </div>
  </>;
}

function Panel({ icon, title, lead, children }: { icon: ReactNode; title: string; lead?: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-navy-line bg-white p-4">
    <h2 className="m-0 flex items-center gap-2 font-display text-base font-bold">{icon}{title}</h2>
    {lead && <p className="m-0 mt-1 text-sm text-gray-700">{lead}</p>}
    <div className="mt-3 grid gap-3">{children}</div>
  </section>;
}

function Exports({ page, material }: { page: PageView; material: Material }) {
  const t = useT(), workspace = useWorkspace();
  const ws = workspace.workspaceId;
  const playable = quizQuestions(material).length, items = assessmentItems(material).length;
  // Live Quiz.
  const [seconds, setSeconds] = useState('20'), [classLabel, setClassLabel] = useState(''), [quizError, setQuizError] = useState<unknown>(null), [opening, setOpening] = useState(false);
  // Telegram, handout.
  const [messages, setMessages] = useState<string[] | null>(null), [withKey, setWithKey] = useState(false), [link, setLink] = useState<string | null>(null), [copied, setCopied] = useState<string | null>(null), [simpleError, setSimpleError] = useState<unknown>(null);
  // Homework OS and Assessment Cloud.
  const [groups, setGroups] = useState<AcademyGroup[] | null>(null), [groupsUnavailable, setGroupsUnavailable] = useState(false), [group, setGroup] = useState(''), [due, setDue] = useState(''), [instructions, setInstructions] = useState('');
  const [banks, setBanks] = useState<Awaited<ReturnType<typeof assessmentBanks>> | null>(null), [bank, setBank] = useState('');
  const [action, setAction] = useState<ActionView | null>(null), [actionError, setActionError] = useState<unknown>(null);
  // Marketplace.
  const [listTitle, setListTitle] = useState(page.title), [description, setDescription] = useState(''), [tags, setTags] = useState(''), [listAction, setListAction] = useState<ActionView | null>(null), [listError, setListError] = useState<unknown>(null);

  useEffect(() => {
    academyGroups(ws).then((result) => { setGroups(result.groups); setGroupsUnavailable(result.unavailable); }).catch(() => { setGroups([]); setGroupsUnavailable(true); });
    if (items) assessmentBanks(ws).then(setBanks).catch(() => setBanks({ tenants: [], unavailable: true }));
  }, [ws, items]);
  const copy = async (text: string, id: string) => { try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { setCopied(null); } };

  return <>
    <Panel icon={<Gamepad2 size={18} aria-hidden="true"/>} title={t('teacher.export.quiz')} lead={playable ? t('teacher.export.quizLead', { count: playable }) : t('teacher.export.quizNone')}>
      {playable > 0 && <PlanGate feature="T10"><div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('teacher.export.seconds')}>{(id) => <select id={id} className={selectClass} value={seconds} onChange={(event) => setSeconds(event.target.value)}>{['10', '20', '30', '45', '60'].map((value) => <option key={value} value={value}>{t('teacher.export.secondsValue', { count: Number(value) })}</option>)}</select>}</Field>
        <Field label={t('teacher.export.classLabel')}>{(id) => <TextInput id={id} value={classLabel} onChange={(event) => setClassLabel(event.target.value)} maxLength={120} placeholder="5B"/>}</Field>
      </div>
      <Button disabled={opening} icon={<Gamepad2 size={16} aria-hidden="true"/>} onClick={async () => {
        setOpening(true); setQuizError(null);
        try { const quiz = await openQuiz(ws, { page_id: page.id, seconds: Number(seconds), ...(classLabel.trim() ? { class_label: classLabel.trim() } : {}) }); navigate(`/studio/quiz/${quiz.id}`); } catch (cause) { setQuizError(cause); } finally { setOpening(false); }
      }}>{t('teacher.export.play')}</Button>
      <p className="m-0 text-xs text-gray-600">{t('teacher.export.quizFree')}</p>
      {quizError !== null && <ApiErrorState error={quizError}/>}</PlanGate>}
    </Panel>

    <Panel icon={<ClipboardList size={18} aria-hidden="true"/>} title={t('teacher.export.homework')} lead={t('teacher.export.homeworkLead')}>
      {groups === null ? <LoadingState/> : !groups.length ? <p className="m-0 text-sm text-gray-700">{groupsUnavailable ? t('teacher.export.academyDown') : t('teacher.export.noGroups')}</p> : <>
        <Field label={t('teacher.export.group')}>{(id) => <select id={id} className={selectClass} value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="">{t('teacher.export.pickGroup')}</option>{groups.map((entry) => <option key={`${entry.academy_id}:${entry.classroom_id}`} value={`${entry.academy_id}:${entry.classroom_id}`}>{entry.name}{entry.students !== null ? ` · ${t('teacher.export.students', { count: entry.students })}` : ''}</option>)}
        </select>}</Field>
        <Field label={t('teacher.export.due')}>{(id) => <TextInput id={id} type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)}/>}</Field>
        <Field label={t('teacher.export.instructions')}>{(id) => <TextArea id={id} rows={2} value={instructions} maxLength={1000} onChange={(event) => setInstructions(event.target.value)}/>}</Field>
        <Button variant="secondary" disabled={!group} onClick={async () => {
          const picked = groups.find((entry) => `${entry.academy_id}:${entry.classroom_id}` === group)!;
          setActionError(null);
          try { setAction(await proposeHomework(ws, { page_id: page.id, academy_id: picked.academy_id, classroom_id: picked.classroom_id, due_at: due ? new Date(due).toISOString() : null, ...(instructions.trim() ? { instructions: instructions.trim() } : {}) })); } catch (cause) { setActionError(cause); }
        }}>{t('teacher.export.prepare')}</Button>
      </>}
    </Panel>

    {items > 0 && <Panel icon={<FileCheck2 size={18} aria-hidden="true"/>} title={t('teacher.export.assessment')} lead={t('teacher.export.assessmentLead', { count: items })}>
      {banks === null ? <LoadingState/> : !banks.tenants.some((tenant) => tenant.banks.length) ? <p className="m-0 text-sm text-gray-700">{banks.unavailable ? t('teacher.export.assessmentDown') : t('teacher.export.noBanks')}</p> : <>
        <Field label={t('teacher.export.bank')}>{(id) => <select id={id} className={selectClass} value={bank} onChange={(event) => setBank(event.target.value)}>
          <option value="">{t('teacher.export.pickBank')}</option>{banks.tenants.flatMap((tenant) => tenant.banks.map((entry) => <option key={entry.id} value={`${tenant.tenant_id}:${entry.id}`}>{tenant.name} · {entry.title}</option>))}
        </select>}</Field>
        <Button variant="secondary" disabled={!bank} onClick={async () => {
          const [tenantId, bankId] = bank.split(':');
          setActionError(null);
          try { setAction(await proposeAssessment(ws, { page_id: page.id, tenant_id: tenantId, bank_id: bankId })); } catch (cause) { setActionError(cause); }
        }}>{t('teacher.export.prepare')}</Button>
      </>}
    </Panel>}

    {action && <ApproveRunCard action={action} onChange={setAction}/>}
    {actionError !== null && <ApiErrorState error={actionError}/>}

    <Panel icon={<Send size={18} aria-hidden="true"/>} title={t('teacher.export.telegram')} lead={t('teacher.export.telegramLead')}>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={withKey} onChange={(event) => { setWithKey(event.target.checked); setMessages(null); }}/>{t('teacher.export.withKey')}</label>
      <Button variant="secondary" onClick={async () => { setSimpleError(null); try { setMessages(await exportTelegram(ws, page.id, withKey)); } catch (cause) { setSimpleError(cause); } }}>{t('teacher.export.makeText')}</Button>
      {messages && messages.map((message, index) => <div key={index} className="rounded-2xl border border-navy-line/30 bg-cream-soft p-3">
        <div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-gray-600">{t('teacher.export.message', { number: index + 1, total: messages.length })}</span><Button size="sm" variant="ghost" icon={<Copy size={14} aria-hidden="true"/>} onClick={() => void copy(message, `m${index}`)}>{copied === `m${index}` ? t('teacher.common.copied') : t('teacher.common.copy')}</Button></div>
        <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{message}</pre>
      </div>)}
    </Panel>

    <Panel icon={<Link2 size={18} aria-hidden="true"/>} title={t('teacher.export.handout')} lead={t('teacher.export.handoutLead')}>
      {link ? <div className="flex flex-wrap items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-xl bg-cream-soft px-2 py-1 text-xs">{link}</code><Button size="sm" variant="ghost" icon={<Copy size={14} aria-hidden="true"/>} onClick={() => void copy(link, 'link')}>{copied === 'link' ? t('teacher.common.copied') : t('teacher.common.copy')}</Button></div>
        : <Button variant="secondary" onClick={async () => { setSimpleError(null); try { setLink((await createHandout(ws, page.id)).url); } catch (cause) { setSimpleError(cause); } }}>{t('teacher.export.makeLink')}</Button>}
    </Panel>
    {simpleError !== null && <ApiErrorState error={simpleError}/>}

    <Panel icon={<Store size={18} aria-hidden="true"/>} title={t('teacher.export.market')} lead={t('teacher.export.marketLead')}>
      <PlanGate feature="T12">
        <Field label={t('teacher.market.listTitle')}>{(id) => <TextInput id={id} value={listTitle} maxLength={160} onChange={(event) => setListTitle(event.target.value)}/>}</Field>
        <Field label={t('teacher.market.description')}>{(id) => <TextArea id={id} rows={3} value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)}/>}</Field>
        <Field label={t('teacher.market.tags')} hint={t('teacher.market.tagsHint')}>{(id) => <TextInput id={id} value={tags} onChange={(event) => setTags(event.target.value)}/>}</Field>
        <p className="m-0 text-xs text-gray-600">{t('teacher.market.freeOnly')}</p>
        <Button variant="secondary" disabled={!listTitle.trim()} onClick={async () => {
          setListError(null);
          try { setListAction(await proposeListing(ws, { page_id: page.id, title: listTitle.trim(), description: description.trim(), tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12), price_uzs: 0 })); } catch (cause) { setListError(cause); }
        }}>{t('teacher.market.propose')}</Button>
        {listAction && <ApproveRunCard action={listAction} onChange={setListAction}/>}
        {listError !== null && <ApiErrorState error={listError}/>}
      </PlanGate>
    </Panel>
  </>;
}
