import { useId, useState, type FormEvent } from 'react';
import { Plus, Trash2, UserMinus } from 'lucide-react';
import { Badge, Button, Dialog, Field, PageHeader, TextInput } from '../../core/index.ts';
import { ApiErrorState, CentreGate, CopyField, Loaded, Section, Select, Table, Tabs, useCentre, useCentreApi, useFormat, useLoad, useSubmit, useT } from '../kit.tsx';

// C1 seats and invites, C7 budgets: who is in the centre, how many seats are used,
// invites by code or link, and monthly credit budgets.

interface Member { user_id: string; name: string | null; role: string; status: 'active' | 'suspended'; joined_at: string; is_me: boolean; budget: number | null; used_this_month: number; groups: string[] }
interface Members { can_manage: boolean; limits: { teachers: number | null; students: number | null }; budget_defaults: Record<string, number>; members: Member[] }
interface Invite { id: string; role: string; label: string | null; max_uses: number; uses: number; expires_at: string; state: string }
const ROLES = ['admin', 'teacher', 'student', 'parent'] as const;

export function PeoplePage() {
  const t = useT();
  const [tab, setTab] = useState<'members' | 'invites' | 'budgets'>('members');
  return <CentreGate roles={['owner', 'admin']}>
    <PageHeader title={t('centre.people.title')} lead={t('centre.people.lead')}/>
    <Tabs label={t('centre.people.title')} active={tab} onChange={setTab} tabs={[{ key: 'members', label: t('centre.people.members') }, { key: 'invites', label: t('centre.people.invites') }, { key: 'budgets', label: t('centre.people.budgets') }]}/>
    {tab === 'members' ? <MembersTab/> : tab === 'invites' ? <InvitesTab/> : <BudgetsTab/>}
  </CentreGate>;
}

function MembersTab() {
  const t = useT(), f = useFormat(), call = useCentreApi(), { role: myRole } = useCentre();
  const state = useLoad<Members>('members');
  const change = useSubmit();
  const [filter, setFilter] = useState<'all' | 'staff' | 'student' | 'parent'>('all');
  const patch = (user: Member, body: Record<string, unknown>) => change.run(async () => { await call('members', { method: 'PATCH', body: { user_id: user.user_id, ...body } }); await state.reload(); });
  const remove = (user: Member) => change.run(async () => { await call('members', { method: 'DELETE', body: { user_id: user.user_id } }); await state.reload(); });
  return <Loaded state={state}>{(data) => {
    const rows = data.members.filter((m) => filter === 'all' || (filter === 'staff' ? ['owner', 'admin', 'teacher'].includes(m.role) : m.role === filter));
    const staff = data.members.filter((m) => (m.role === 'admin' || m.role === 'teacher') && m.status === 'active').length, students = data.members.filter((m) => m.role === 'student' && m.status === 'active').length;
    const editable = (m: Member) => m.role !== 'owner' && !m.is_me && (myRole === 'owner' || m.role !== 'admin');
    return <Section title={t('centre.people.members')} lead={t('centre.people.seats', { teachers: staff, teacherLimit: data.limits.teachers ?? '∞', students, studentLimit: data.limits.students ?? '∞' })}
      actions={<Select label={t('centre.people.filter')} value={filter} onChange={setFilter} options={[{ value: 'all', label: t('centre.people.filterAll') }, { value: 'staff', label: t('centre.people.filterStaff') }, { value: 'student', label: t('role.student') }, { value: 'parent', label: t('role.parent') }]}/>}>
      {change.error !== null && <div className="mb-3"><ApiErrorState error={change.error}/></div>}
      <Table caption={t('centre.people.members')} rows={rows} rowKey={(m) => m.user_id} empty={t('centre.people.noMembers')} columns={[
        { key: 'name', label: t('centre.people.name'), render: (m) => <span className="font-semibold">{m.name ?? t('centre.people.unnamed')}{m.is_me && <span className="ml-2 text-xs font-normal text-gray-600">{t('centre.people.you')}</span>}</span> },
        { key: 'role', label: t('centre.people.role'), render: (m) => editable(m)
          ? <label><span className="sr-only">{t('centre.people.role')}</span><select value={m.role} disabled={change.busy} onChange={(event) => void patch(m, { role: event.target.value })} className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm">{ROLES.filter((r) => myRole === 'owner' || r !== 'admin').map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select></label>
          : t(`role.${m.role}`) },
        { key: 'status', label: t('centre.people.status'), render: (m) => <Badge tone={m.status === 'active' ? 'lime' : 'warn'}>{t(`centre.people.state.${m.status}`)}</Badge> },
        { key: 'budget', label: t('centre.people.budget'), render: (m) => editable(m) ? <BudgetInput value={m.budget} used={m.used_this_month} disabled={change.busy} onSave={(value) => void patch(m, { credit_budget: value })}/> : <span>{m.budget === null ? t('centre.people.noLimit') : f.number(m.budget)} · {t('centre.people.used', { count: m.used_this_month })}</span> },
        { key: 'groups', label: t('centre.people.groups'), render: (m) => m.groups.join(', ') || '—' },
        { key: 'actions', label: <span className="sr-only">{t('centre.people.actions')}</span>, render: (m) => editable(m) && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={change.busy} onClick={() => void patch(m, { status: m.status === 'active' ? 'suspended' : 'active' })}>{m.status === 'active' ? t('centre.people.suspend') : t('centre.people.reactivate')}</Button>
          <Button size="sm" variant="danger" disabled={change.busy} onClick={() => { if (confirm(t('centre.people.confirmRemove', { name: m.name ?? '' }))) void remove(m); }} icon={<UserMinus size={14} aria-hidden="true"/>}>{t('centre.people.remove')}</Button>
        </div> },
      ]}/>
    </Section>;
  }}</Loaded>;
}

function BudgetInput({ value, used, disabled, onSave }: { value: number | null; used: number; disabled: boolean; onSave(value: number | null): void }) {
  const t = useT(), id = useId();
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const dirty = draft !== (value === null ? '' : String(value));
  return <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); onSave(draft.trim() === '' ? null : Math.max(0, Math.round(Number(draft)))); }}>
    <label className="sr-only" htmlFor={id}>{t('centre.people.budget')}</label>
    <input id={id} inputMode="numeric" pattern="[0-9]*" value={draft} placeholder={t('centre.people.noLimit')} onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))} className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm"/>
    {dirty && <Button size="sm" type="submit" disabled={disabled}>{t('centre.common.save')}</Button>}
    <span className="whitespace-nowrap text-xs text-gray-600">{t('centre.people.used', { count: used })}</span>
  </form>;
}

function InvitesTab() {
  const t = useT(), f = useFormat(), call = useCentreApi(), { role } = useCentre();
  const state = useLoad<{ invites: Invite[] }>('invites');
  const [open, setOpen] = useState(false), [created, setCreated] = useState<{ code: string; link: string } | null>(null);
  const [form, setForm] = useState({ role: 'student', max_uses: '50', days: '14', label: '' });
  const submit = useSubmit(), revoke = useSubmit();
  const create = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      const result = await call<{ code: string; link: string }>('invites', { method: 'POST', body: { role: form.role, max_uses: Number(form.max_uses), expires_in_days: Number(form.days), ...(form.label.trim() ? { label: form.label.trim() } : {}) } });
      setCreated(result); await state.reload();
    });
  };
  return <Section title={t('centre.people.invites')} lead={t('centre.people.invitesLead')} actions={<Button onClick={() => { setCreated(null); setOpen(true); }} icon={<Plus size={16} aria-hidden="true"/>}>{t('centre.people.newInvite')}</Button>}>
    <Loaded state={state}>{(data) => <Table caption={t('centre.people.invites')} rows={data.invites} rowKey={(row) => row.id} empty={t('centre.people.noInvites')} columns={[
      { key: 'role', label: t('centre.people.role'), render: (row) => <span className="font-semibold">{t(`role.${row.role}`)}{row.label && <span className="ml-2 font-normal text-gray-600">{row.label}</span>}</span> },
      { key: 'uses', label: t('centre.people.uses'), render: (row) => `${row.uses} / ${row.max_uses}` },
      { key: 'expires', label: t('centre.people.expires'), render: (row) => f.date(row.expires_at) },
      { key: 'state', label: t('centre.people.status'), render: (row) => <Badge tone={row.state === 'active' ? 'lime' : 'neutral'}>{t(`centre.join.state.${row.state}`)}</Badge> },
      { key: 'revoke', label: <span className="sr-only">{t('centre.people.actions')}</span>, render: (row) => row.state === 'active' && <Button size="sm" variant="danger" disabled={revoke.busy} onClick={() => void revoke.run(async () => { await call('invites', { method: 'DELETE', body: { id: row.id } }); await state.reload(); })} icon={<Trash2 size={14} aria-hidden="true"/>}>{t('centre.people.revoke')}</Button> },
    ]}/>}</Loaded>
    {revoke.error !== null && <div className="mt-3"><ApiErrorState error={revoke.error}/></div>}
    <Dialog open={open} title={t('centre.people.newInvite')} onClose={() => setOpen(false)} closeLabel={t('centre.common.close')}>
      {created ? <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-gray-700">{t('centre.people.inviteShown')}</p>
        <CopyField label={t('centre.people.code')} value={created.code}/>
        <CopyField label={t('centre.people.link')} value={created.link}/>
        <div><Button onClick={() => setOpen(false)}>{t('centre.common.done')}</Button></div>
      </div> : <form onSubmit={create} className="grid gap-4">
        <Select label={t('centre.people.role')} value={form.role} onChange={(value) => setForm({ ...form, role: value, max_uses: value === 'student' ? '50' : '1' })} options={ROLES.filter((r) => role === 'owner' || r !== 'admin').map((r) => ({ value: r, label: t(`role.${r}`) }))}/>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('centre.people.maxUses')}>{(id) => <TextInput id={id} type="number" min={1} max={1000} value={form.max_uses} onChange={(event) => setForm({ ...form, max_uses: event.target.value })} required/>}</Field>
          <Field label={t('centre.people.days')}>{(id) => <TextInput id={id} type="number" min={1} max={60} value={form.days} onChange={(event) => setForm({ ...form, days: event.target.value })} required/>}</Field>
        </div>
        <Field label={t('centre.people.label')} hint={t('centre.people.labelHint')}>{(id) => <TextInput id={id} value={form.label} maxLength={120} onChange={(event) => setForm({ ...form, label: event.target.value })}/>}</Field>
        {submit.error !== null && <ApiErrorState error={submit.error}/>}
        <div><Button type="submit" disabled={submit.busy}>{submit.busy ? t('centre.common.working') : t('centre.people.createInvite')}</Button></div>
      </form>}
    </Dialog>
  </Section>;
}

function BudgetsTab() {
  const t = useT(), call = useCentreApi();
  const state = useLoad<Members>('members');
  const submit = useSubmit();
  const [form, setForm] = useState<{ teacher: string; student: string; apply: boolean } | null>(null);
  return <Loaded state={state}>{(data) => {
    const current = form ?? { teacher: data.budget_defaults.teacher === undefined ? '' : String(data.budget_defaults.teacher), student: data.budget_defaults.student === undefined ? '' : String(data.budget_defaults.student), apply: false };
    const save = (event: FormEvent) => {
      event.preventDefault();
      void submit.run(async () => {
        await call('budgets', { method: 'POST', body: { defaults: { teacher: current.teacher === '' ? null : Number(current.teacher), student: current.student === '' ? null : Number(current.student) }, apply_to_existing: current.apply } });
        setForm(null); await state.reload();
      });
    };
    return <Section title={t('centre.people.budgets')} lead={t('centre.people.budgetsLead')}>
      <form onSubmit={save} className="grid max-w-xl gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('centre.people.teacherBudget')} hint={t('centre.people.emptyNoLimit')}>{(id) => <TextInput id={id} inputMode="numeric" value={current.teacher} onChange={(event) => setForm({ ...current, teacher: event.target.value.replace(/[^0-9]/g, '') })}/>}</Field>
          <Field label={t('centre.people.studentBudget')} hint={t('centre.people.emptyNoLimit')}>{(id) => <TextInput id={id} inputMode="numeric" value={current.student} onChange={(event) => setForm({ ...current, student: event.target.value.replace(/[^0-9]/g, '') })}/>}</Field>
        </div>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={current.apply} onChange={(event) => setForm({ ...current, apply: event.target.checked })}/><span>{t('centre.people.applyExisting')}</span></label>
        {submit.error !== null && <ApiErrorState error={submit.error}/>}
        <div className="flex items-center gap-3"><Button type="submit" disabled={submit.busy}>{t('centre.common.save')}</Button>{submit.done && <span role="status" className="text-sm text-green-800">{t('centre.common.saved')}</span>}</div>
      </form>
    </Section>;
  }}</Loaded>;
}
