import { useState, type FormEvent } from 'react';
import { BadgeCheck, Copy, Save, Sparkles } from 'lucide-react';
import { ApiErrorState, Badge, Button, Card, createPage, CreditCost, Field, Link, PageHeader, TextArea, TextInput, useT } from '../../core/index.ts';
import { CentreGate, Loaded, newKey, Section, Select, Table, Tabs, Toggle, useCentre, useCentreApi, useFormat, useLoad, useSubmit } from '../kit.tsx';

// C4 marketing studio: posts, ad copy, event announcements and results posts in
// the centre's voice. Results come only from the register below, verified by the
// office and with the student's agreement to be named; nothing is invented.

interface Result { id: string; student_name: string; exam: string; score: string; result_date: string | null; verified: boolean; consent: boolean; evidence_note: string | null }
interface Variant { text: string; hashtags: string[] }
const KINDS = ['instagram', 'telegram', 'ad', 'event', 'results'] as const;
const LANGS = ['uz', 'ru', 'en'] as const;

export function MarketingPage() {
  const t = useT();
  const [tab, setTab] = useState<'studio' | 'results'>('studio');
  return <CentreGate roles={['owner', 'admin']}>
    <PageHeader title={t('centre.marketing.title')} lead={t('centre.marketing.lead')}/>
    <Tabs label={t('centre.marketing.title')} active={tab} onChange={setTab} tabs={[{ key: 'studio', label: t('centre.marketing.studio') }, { key: 'results', label: t('centre.marketing.results') }]}/>
    {tab === 'studio' ? <Studio/> : <Results/>}
  </CentreGate>;
}

function Studio() {
  const t = useT(), call = useCentreApi(), { workspaceId } = useCentre();
  const results = useLoad<{ results: Result[] }>('results');
  const [form, setForm] = useState({ kind: 'instagram' as (typeof KINDS)[number], language: 'uz', brief: '', facts: '', title: '', when: '', where: '', join: '', ids: [] as string[] });
  const [variants, setVariants] = useState<Variant[] | null>(null), [saved, setSaved] = useState<string | null>(null);
  const submit = useSubmit(), save = useSubmit();
  const [key, setKey] = useState(newKey);
  const usable = (results.data?.results ?? []).filter((row) => row.verified && row.consent);
  const generate = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      const result = await call<{ variants: Variant[] }>('marketing', { method: 'POST', idempotencyKey: key, body: {
        kind: form.kind, language: form.language, brief: form.brief, facts: form.facts.trim() || null,
        ...(form.kind === 'event' ? { event: { title: form.title, when: form.when, where: form.where, how_to_join: form.join } } : {}),
        ...(form.kind === 'results' ? { result_ids: form.ids } : {}),
      } });
      setVariants(result.variants); setSaved(null); setKey(newKey());
    });
  };
  const toText = (variant: Variant) => `${variant.text}${variant.hashtags.length ? `\n\n${variant.hashtags.join(' ')}` : ''}`;
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
    <Section title={t('centre.marketing.brief')}>
      <form onSubmit={generate} className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label={t('centre.marketing.kind')} value={form.kind} onChange={(kind) => setForm({ ...form, kind })} options={KINDS.map((kind) => ({ value: kind, label: t(`centre.marketing.kinds.${kind}`) }))}/>
          <Select label={t('centre.common.language')} value={form.language} onChange={(language) => setForm({ ...form, language })} options={LANGS.map((lang) => ({ value: lang, label: t(`centre.lang.${lang}`) }))}/>
        </div>
        <Field label={t('centre.marketing.what')} hint={t('centre.marketing.whatHint')}>{(id) => <TextArea id={id} rows={3} required minLength={3} maxLength={1500} value={form.brief} onChange={(event) => setForm({ ...form, brief: event.target.value })}/>}</Field>
        {form.kind === 'event' && <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('centre.marketing.eventTitle')}>{(id) => <TextInput id={id} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/>}</Field>
          <Field label={t('centre.marketing.eventWhen')}>{(id) => <TextInput id={id} maxLength={80} value={form.when} onChange={(event) => setForm({ ...form, when: event.target.value })}/>}</Field>
          <Field label={t('centre.marketing.eventWhere')}>{(id) => <TextInput id={id} maxLength={160} value={form.where} onChange={(event) => setForm({ ...form, where: event.target.value })}/>}</Field>
          <Field label={t('centre.marketing.eventJoin')}>{(id) => <TextInput id={id} maxLength={200} value={form.join} onChange={(event) => setForm({ ...form, join: event.target.value })}/>}</Field>
        </div>}
        {form.kind === 'results' && <fieldset className="m-0 border-0 p-0"><legend className="mb-1 text-sm font-semibold">{t('centre.marketing.pickResults')}</legend>
          {!usable.length ? <p className="m-0 text-sm text-amber-900">{t('centre.marketing.noVerified')}</p> : <div className="grid gap-1">{usable.map((row) => <label key={row.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.ids.includes(row.id)} onChange={() => setForm({ ...form, ids: form.ids.includes(row.id) ? form.ids.filter((id) => id !== row.id) : [...form.ids, row.id] })}/>{row.student_name} · {row.exam} {row.score}</label>)}</div>}
        </fieldset>}
        <Field label={t('centre.marketing.facts')} hint={t('centre.marketing.factsHint')}>{(id) => <TextArea id={id} rows={3} maxLength={2000} value={form.facts} onChange={(event) => setForm({ ...form, facts: event.target.value })}/>}</Field>
        {submit.error !== null && <ApiErrorState error={submit.error}/>}
        <div className="flex flex-wrap items-center gap-3"><Button type="submit" variant="spark" disabled={submit.busy || (form.kind === 'results' && !form.ids.length)} icon={<Sparkles size={16} aria-hidden="true"/>}>{submit.busy ? t('centre.common.drafting') : t('centre.marketing.write')}</Button><CreditCost creditKey="marketing.post"/></div>
        <p className="m-0 text-xs text-gray-600">{t('centre.marketing.rule')}</p>
      </form>
    </Section>
    <div className="grid content-start gap-4">
      {!variants ? <Card><p className="m-0 text-sm text-gray-700">{t('centre.marketing.empty')}</p></Card> : variants.map((variant, index) => <Card key={index} className="flex flex-col gap-3">
        <p className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-600">{t('centre.marketing.variant', { n: index + 1 })}</p>
        <p className="m-0 whitespace-pre-wrap text-sm leading-6">{variant.text}</p>
        {variant.hashtags.length > 0 && <p className="m-0 text-sm text-sky-900">{variant.hashtags.join(' ')}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(toText(variant))} icon={<Copy size={14} aria-hidden="true"/>}>{t('centre.common.copy')}</Button>
          <Button size="sm" variant="secondary" disabled={save.busy} onClick={() => void save.run(async () => { const page = await createPage({ kind: 'note', title: `${t(`centre.marketing.kinds.${form.kind}`)} · ${form.brief.slice(0, 60)}`, folder: 'Marketing', body: toText(variant), visibility: 'workspace' }, workspaceId); setSaved(page.id); })} icon={<Save size={14} aria-hidden="true"/>}>{t('centre.marketing.saveLibrary')}</Button>
        </div>
      </Card>)}
      {saved && <p role="status" className="m-0 text-sm text-green-800">{t('centre.marketing.saved')} <Link to={`/library/${saved}`} className="font-semibold underline">{t('centre.common.open')}</Link></p>}
      {save.error !== null && <ApiErrorState error={save.error}/>}
    </div>
  </div>;
}

function Results() {
  const t = useT(), f = useFormat(), call = useCentreApi();
  const state = useLoad<{ results: Result[]; can_verify: boolean }>('results');
  const [form, setForm] = useState({ student_name: '', exam: '', score: '', result_date: '', evidence_note: '', consent: false });
  const add = useSubmit(), change = useSubmit();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void add.run(async () => { await call('results', { method: 'POST', body: { ...form, result_date: form.result_date || null, evidence_note: form.evidence_note || null } }); setForm({ student_name: '', exam: '', score: '', result_date: '', evidence_note: '', consent: false }); await state.reload(); });
  };
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
    <Section title={t('centre.marketing.addResult')} lead={t('centre.marketing.addResultLead')}>
      <form onSubmit={submit} className="grid gap-3">
        <Field label={t('centre.marketing.student')} hint={t('centre.marketing.studentHint')}>{(id) => <TextInput id={id} required maxLength={120} value={form.student_name} onChange={(event) => setForm({ ...form, student_name: event.target.value })}/>}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('centre.marketing.exam')}>{(id) => <TextInput id={id} required maxLength={80} placeholder="IELTS" value={form.exam} onChange={(event) => setForm({ ...form, exam: event.target.value })}/>}</Field>
          <Field label={t('centre.marketing.score')}>{(id) => <TextInput id={id} required maxLength={40} placeholder="7.5" value={form.score} onChange={(event) => setForm({ ...form, score: event.target.value })}/>}</Field>
        </div>
        <Field label={t('centre.marketing.date')}>{(id) => <TextInput id={id} type="date" value={form.result_date} onChange={(event) => setForm({ ...form, result_date: event.target.value })}/>}</Field>
        <Field label={t('centre.marketing.evidence')} hint={t('centre.marketing.evidenceHint')}>{(id) => <TextInput id={id} maxLength={300} value={form.evidence_note} onChange={(event) => setForm({ ...form, evidence_note: event.target.value })}/>}</Field>
        <Toggle label={t('centre.marketing.consent')} description={t('centre.marketing.consentHint')} checked={form.consent} onChange={(consent) => setForm({ ...form, consent })}/>
        {add.error !== null && <ApiErrorState error={add.error}/>}
        <div><Button type="submit" disabled={add.busy}>{t('centre.common.add')}</Button></div>
      </form>
    </Section>
    <Section title={t('centre.marketing.results')}>
      <Loaded state={state}>{(data) => <Table caption={t('centre.marketing.results')} rows={data.results} rowKey={(row) => row.id} empty={t('centre.marketing.noResults')} columns={[
        { key: 'who', label: t('centre.marketing.student'), render: (row) => <span className="font-semibold">{row.student_name}</span> },
        { key: 'result', label: t('centre.marketing.score'), render: (row) => <span>{row.exam} {row.score}<span className="block text-xs text-gray-600">{f.date(row.result_date)}{row.evidence_note ? ` · ${row.evidence_note}` : ''}</span></span> },
        { key: 'status', label: t('centre.people.status'), render: (row) => <span className="flex flex-wrap gap-1"><Badge tone={row.verified ? 'lime' : 'warn'}>{row.verified ? t('centre.marketing.verified') : t('centre.marketing.unverified')}</Badge>{!row.consent && <Badge>{t('centre.marketing.noConsent')}</Badge>}</span> },
        { key: 'actions', label: <span className="sr-only">{t('centre.people.actions')}</span>, render: (row) => data.can_verify && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={change.busy} onClick={() => void change.run(async () => { await call('results', { method: 'PATCH', body: { id: row.id, verified: !row.verified } }); await state.reload(); })} icon={<BadgeCheck size={14} aria-hidden="true"/>}>{row.verified ? t('centre.marketing.unverify') : t('centre.marketing.verify')}</Button>
          <Button size="sm" variant="ghost" disabled={change.busy} onClick={() => void change.run(async () => { await call('results', { method: 'DELETE', body: { id: row.id } }); await state.reload(); })}>{t('centre.common.remove')}</Button>
        </div> },
      ]}/>}</Loaded>
      {change.error !== null && <div className="mt-3"><ApiErrorState error={change.error}/></div>}
    </Section>
  </div>;
}
