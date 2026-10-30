import { useEffect, useState, type FormEvent } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import { ApiErrorState, Badge, Button, Card, Dialog, EmptyState, Field, PageHeader, TextArea, TextInput, useT } from '../../core/index.ts';
import { CentreGate, Loaded, useCentre, useCentreApi, useLoad, useSubmit } from '../kit.tsx';

// C2: groups and the Student Assistant's rules for each one (hints only while a
// homework is open, always, or off; topics to focus on; a note), and who is in it.

interface Group { id: string; name: string; level: string | null; teacher_ids: string[]; hint_policy: 'during_homework' | 'always' | 'off'; homework_rule: Rule | null; homework_effective: Rule; focus_topics: string[]; note: string | null; academy_linked: boolean; members: number; can_edit: boolean }
type Rule = 'hints_only' | 'explain' | 'off';
interface HomeworkRules { default: Rule; academy_linked: boolean; assignments: { id: string; title: string; due_at: string | null; rule: Rule | null }[] }
interface Member { user_id: string; name: string | null; role: string; status: string }
const POLICIES = ['during_homework', 'always', 'off'] as const;
const RULES = ['hints_only', 'explain', 'off'] as const;

export function GroupsPage() {
  return <CentreGate roles={['owner', 'admin', 'teacher']}><Groups/></CentreGate>;
}

function Groups() {
  const t = useT(), call = useCentreApi(), { manager } = useCentre();
  const state = useLoad<{ groups: Group[]; can_create: boolean; academy_linked: boolean }>('groups');
  const people = useLoad<{ members: Member[] }>('members');
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const sync = useSubmit();
  const [synced, setSynced] = useState<{ created: number; linked: number } | null>(null);
  return <Loaded state={state}>{(data) => <>
    <PageHeader title={t('centre.groups.title')} lead={t('centre.groups.lead')} actions={manager && <>
      {data.academy_linked && <Button variant="secondary" disabled={sync.busy} onClick={() => void sync.run(async () => { setSynced(await call('groups-sync', { method: 'POST', body: {} })); await state.reload(); })} icon={<RefreshCw size={16} aria-hidden="true"/>}>{sync.busy ? t('centre.common.working') : t('centre.groups.sync')}</Button>}
      <Button onClick={() => setEditing('new')} icon={<Plus size={16} aria-hidden="true"/>}>{t('centre.groups.new')}</Button>
    </>}/>
    {sync.error !== null && <div className="mb-4"><ApiErrorState error={sync.error}/></div>}
    {synced && <p role="status" className="mb-4 text-sm text-green-800">{t('centre.groups.synced', { created: synced.created, linked: synced.linked })}</p>}
    {!data.groups.length ? <EmptyState title={t('centre.groups.none')} lead={t('centre.groups.noneLead')}/> :
      <div className="grid gap-4 md:grid-cols-2">{data.groups.map((group) => <Card key={group.id} className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="m-0 font-display text-lg font-bold">{group.name}</h2><p className="m-0 text-xs text-gray-600">{[group.level, t('centre.groups.members', { count: group.members }), group.academy_linked ? t('centre.groups.fromAcademy') : null].filter(Boolean).join(' · ')}</p></div>
          <Badge tone={group.hint_policy === 'off' ? 'neutral' : 'sky'}>{t(`centre.groups.policy.${group.hint_policy}`)}</Badge>
        </div>
        {group.focus_topics.length > 0 && <p className="m-0 text-sm text-gray-700"><strong>{t('centre.groups.focus')}:</strong> {group.focus_topics.join(', ')}</p>}
        {group.note && <p className="m-0 text-sm text-gray-700">{group.note}</p>}
        {group.can_edit && <div><Button size="sm" variant="secondary" onClick={() => setEditing(group)}>{t('centre.groups.edit')}</Button></div>}
      </Card>)}</div>}
    {editing && <GroupDialog group={editing === 'new' ? null : editing} people={people.data?.members ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void state.reload(); }}/>}
  </>}</Loaded>;
}

function GroupDialog({ group, people, onClose, onSaved }: { group: Group | null; people: Member[]; onClose(): void; onSaved(): void }) {
  const t = useT(), call = useCentreApi(), { manager } = useCentre();
  const [form, setForm] = useState({ name: group?.name ?? '', level: group?.level ?? '', homework: (group?.homework_rule ?? '') as Rule | '', policy: group?.hint_policy ?? 'during_homework', topics: group?.focus_topics ?? [], topic: '', note: group?.note ?? '', teachers: group?.teacher_ids ?? [] as string[] });
  const [members, setMembers] = useState<string[] | null>(group ? null : []);
  const submit = useSubmit();
  useEffect(() => {
    if (!group) return;
    call<{ member_ids: string[] }>('groups', { query: { id: group.id } }).then((result) => setMembers(result.member_ids)).catch(() => setMembers([]));
  }, [group, call]);
  const staff = people.filter((m) => ['owner', 'admin', 'teacher'].includes(m.role) && m.status === 'active'), students = people.filter((m) => m.role === 'student' && m.status === 'active');
  const addTopic = () => { const value = form.topic.trim(); if (value && !form.topics.includes(value) && form.topics.length < 12) setForm({ ...form, topics: [...form.topics, value], topic: '' }); };
  const save = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      const rules = { hint_policy: form.policy, homework_rule: form.homework || null, focus_topics: form.topics, note: form.note.trim() || null };
      const saved = group
        ? await call<{ group: Group }>('groups', { method: 'PATCH', body: { id: group.id, ...rules, ...(manager ? { name: form.name, level: form.level.trim() || null, teacher_ids: form.teachers } : {}) } })
        : await call<{ group: Group }>('groups', { method: 'POST', body: { name: form.name, level: form.level.trim() || null, teacher_ids: form.teachers, ...rules } });
      if (members) await call('group-members', { method: 'PUT', body: { group_id: saved.group.id, user_ids: members } });
      onSaved();
    });
  };
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]);
  return <Dialog open title={group ? t('centre.groups.edit') : t('centre.groups.new')} onClose={onClose} closeLabel={t('centre.common.close')}>
    <form onSubmit={save} className="grid max-h-[70vh] gap-4 overflow-y-auto pr-1">
      {manager && <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label={t('centre.groups.name')}>{(id) => <TextInput id={id} value={form.name} maxLength={120} required onChange={(event) => setForm({ ...form, name: event.target.value })}/>}</Field>
        <Field label={t('centre.groups.level')}>{(id) => <TextInput id={id} value={form.level} maxLength={40} placeholder="B1" onChange={(event) => setForm({ ...form, level: event.target.value })}/>}</Field>
      </div>}
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-1 text-sm font-semibold text-gray-800">{t('centre.groups.policyLabel')}</legend>
        {POLICIES.map((policy) => <label key={policy} className="flex items-start gap-3 rounded-2xl border border-navy-line/30 bg-white p-3 text-sm">
          <input type="radio" name="policy" className="mt-1" checked={form.policy === policy} onChange={() => setForm({ ...form, policy })}/>
          <span><strong>{t(`centre.groups.policy.${policy}`)}</strong><br/><span className="text-gray-600">{t(`centre.groups.policyHint.${policy}`)}</span></span>
        </label>)}
      </fieldset>
      <Field label={t('centre.groups.homeworkRule')} hint={t('centre.groups.homeworkRuleHint')}>{(id) => <select id={id} value={form.homework} onChange={(event) => setForm({ ...form, homework: event.target.value as Rule | '' })} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm">
        <option value="">{t('centre.groups.ruleFollow')}</option>{RULES.map((rule) => <option key={rule} value={rule}>{t(`centre.groups.rule.${rule}`)}</option>)}
      </select>}</Field>
      {group?.academy_linked && <AssignmentRules groupId={group.id}/>}
      <Field label={t('centre.groups.focus')} hint={t('centre.groups.focusHint')}>{(id) => <div className="flex gap-2"><TextInput id={id} value={form.topic} maxLength={60} onChange={(event) => setForm({ ...form, topic: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTopic(); } }}/><Button variant="secondary" onClick={addTopic}>{t('centre.common.add')}</Button></div>}</Field>
      {form.topics.length > 0 && <ul className="m-0 flex list-none flex-wrap gap-2 p-0">{form.topics.map((topic) => <li key={topic}><button type="button" onClick={() => setForm({ ...form, topics: form.topics.filter((entry) => entry !== topic) })} className="inline-flex items-center gap-1 rounded-full border border-navy-line bg-cream-soft px-3 py-1 text-xs font-semibold" aria-label={t('centre.groups.removeTopic', { topic })}>{topic}<X size={12} aria-hidden="true"/></button></li>)}</ul>}
      <Field label={t('centre.groups.note')} hint={t('centre.groups.noteHint')}>{(id) => <TextArea id={id} rows={2} maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })}/>}</Field>
      {manager && <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold text-gray-800">{t('centre.groups.teachers')}</legend>
        <div className="grid gap-1 sm:grid-cols-2">{staff.map((m) => <label key={m.user_id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.teachers.includes(m.user_id)} onChange={() => setForm({ ...form, teachers: toggle(form.teachers, m.user_id) })}/>{m.name ?? t('centre.people.unnamed')}</label>)}</div>
      </fieldset>}
      <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold text-gray-800">{t('centre.groups.students')}</legend>
        {!members ? <p className="m-0 text-sm text-gray-600">{t('state.loading')}</p> : !students.length ? <p className="m-0 text-sm text-gray-600">{t('centre.groups.noStudents')}</p> :
          <div className="grid gap-1 sm:grid-cols-2">{students.map((m) => <label key={m.user_id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={members.includes(m.user_id)} onChange={() => setMembers(toggle(members, m.user_id))}/>{m.name ?? t('centre.people.unnamed')}</label>)}</div>}
      </fieldset>
      {submit.error !== null && <ApiErrorState error={submit.error}/>}
      <div className="flex gap-2"><Button type="submit" disabled={submit.busy}>{submit.busy ? t('centre.common.working') : t('centre.common.save')}</Button><Button variant="ghost" onClick={onClose}>{t('centre.common.cancel')}</Button></div>
    </form>
  </Dialog>;
}

function AssignmentRules({ groupId }: { groupId: string }) {
  const t = useT(), call = useCentreApi();
  const [data, setData] = useState<HomeworkRules | null>(null), [error, setError] = useState<unknown>(null);
  const change = useSubmit();
  useEffect(() => { call<HomeworkRules>('assignment-rules', { query: { group_id: groupId } }).then(setData).catch(setError); }, [groupId, call]);
  if (error) return <ApiErrorState error={error}/>;
  if (!data) return <p className="m-0 text-sm text-gray-600">{t('state.loading')}</p>;
  const set = (id: string, title: string, rule: Rule | null) => change.run(async () => {
    await call('assignment-rules', { method: 'PUT', body: { group_id: groupId, assignment_id: id, rule, title } });
    setData({ ...data, assignments: data.assignments.map((row) => (row.id === id ? { ...row, rule } : row)) });
  });
  return <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold text-gray-800">{t('centre.groups.perHomework')}</legend>
    {!data.assignments.length ? <p className="m-0 text-sm text-gray-600">{t('centre.groups.noHomework')}</p> : <ul className="m-0 grid list-none gap-2 p-0">{data.assignments.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-navy-line/20 bg-white px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{row.title}</span>
      <label className="sr-only" htmlFor={`rule-${row.id}`}>{t('centre.groups.ruleFor', { title: row.title })}</label>
      <select id={`rule-${row.id}`} value={row.rule ?? ''} disabled={change.busy} onChange={(event) => void set(row.id, row.title, (event.target.value || null) as Rule | null)} className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm">
        <option value="">{t('centre.groups.ruleDefault', { rule: t(`centre.groups.rule.${data.default}`) })}</option>{RULES.map((rule) => <option key={rule} value={rule}>{t(`centre.groups.rule.${rule}`)}</option>)}
      </select>
    </li>)}</ul>}
    {change.error !== null && <ApiErrorState error={change.error}/>}
  </fieldset>;
}
