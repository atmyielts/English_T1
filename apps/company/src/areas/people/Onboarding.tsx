// /start — a new owner creates the pilot workspace, then is guided through
// departments, inviting people and the first hiring test. Resumable with
// /start?org=<id>&step=departments|people|test.
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { INDUSTRIES, SIZE_BANDS, type Industry } from '../../../../../packages/company-core/src/mod.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api, type Member, type Org, type Workspace } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate, useLocation } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import { TeamLinkForm } from './TeamLinks.tsx';
import type { LeadForm } from './types.ts';
import { LinkResult, useProblem } from './ui.tsx';

const STEPS = ['company', 'departments', 'people', 'test'] as const;
type Step = (typeof STEPS)[number];

/** Department names to suggest per industry: `people.onboarding.suggest.<industry>`, comma separated. */
const suggestionKey = (industry: string) => `people.onboarding.suggest.${(INDUSTRIES as readonly string[]).includes(industry) ? industry : 'other'}` as AppKey;

export function StartPilot() {
  const t = useAppT();
  const { query } = useLocation();
  const orgId = query.get('org');
  const asked = query.get('step') as Step | null;
  const step: Step = orgId ? (asked && STEPS.includes(asked) && asked !== 'company' ? asked : 'departments') : 'company';
  const index = STEPS.indexOf(step);
  return <div className="people people-onboarding">
    <ol className="people-steps" aria-label={t('people.onboarding.progress')}>
      {STEPS.map((name, position) => <li key={name} className={position < index ? 'done' : position === index ? 'current' : ''} aria-current={position === index ? 'step' : undefined}>
        <span className="people-step-number" aria-hidden="true">{position < index ? '✓' : position + 1}</span>
        <span>{t(`people.onboarding.step.${name}` as AppKey)}</span>
      </li>)}
    </ol>
    {step === 'company' ? <CompanyStep/> : <Guided orgId={orgId!} step={step}/>}
  </div>;
}

function CompanyStep() {
  const t = useAppT(), problem = useProblem();
  const { locale } = useI18n();
  const { me, refresh } = useSession();
  const [form, setForm] = useState({ name: '', industry: 'other', size_band: '1-50', city: '', contact_phone: '', full_name: '', locale });
  const [pilot, setPilot] = useState<LeadForm | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { api<LeadForm>('public/leads/form', { auth: false }).then(setPilot).catch(() => setPilot(null)); }, []);
  if (me && !me.self_serve && !me.staff) return <section className="company-narrow">
    <h1>{t('create.title')}</h1>
    <p>{t('create.closed')}</p>
    <p><Link className="button-link" to="/#demo">{t('people.onboarding.requestDemo')}</Link></p>
  </section>;
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const { org } = await api<{ org: Org; member: Member }>('orgs', { method: 'POST', body: { ...form, city: form.city || null, contact_phone: form.contact_phone || null, full_name: form.full_name || null } });
      await refresh();
      navigate(`/start?org=${org.id}&step=departments`);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const tests = pilot?.pilot_tests ?? null;
  const owned = me?.workspaces.filter((entry) => entry.member.role === 'owner') ?? [];
  return <div className="people-onboarding-grid">
    <section aria-labelledby="start-title">
      <p className="eyebrow">{t('people.onboarding.eyebrow')}</p>
      <h1 id="start-title">{t('create.title')}</h1>
      <p>{tests === null ? t('people.onboarding.leadNoCount') : t('create.lead', { tests })}</p>
      {owned.length > 0 && <p className="hint">{t('people.onboarding.alreadyOwn', { count: owned.length })} <Link to="/w">{t('people.onboarding.openExisting')}</Link></p>}
      <form onSubmit={submit} className="people-form-grid">
        <label className="people-span">{t('create.name')}<input required minLength={2} maxLength={120} autoComplete="organization" value={form.name} onChange={set('name')}/></label>
        <label>{t('create.fullName')}<input maxLength={120} autoComplete="name" value={form.full_name} onChange={set('full_name')}/></label>
        <label>{t('create.industry')}<select value={form.industry} onChange={set('industry')}>{INDUSTRIES.map((code) => <option key={code} value={code}>{t(`industry.${code}` as AppKey)}</option>)}</select></label>
        <label>{t('create.size')}<select value={form.size_band} onChange={set('size_band')}>{SIZE_BANDS.map((code) => <option key={code} value={code}>{t(`size.${code}` as AppKey)}</option>)}</select></label>
        <label>{t('create.city')}<input maxLength={80} autoComplete="address-level2" value={form.city} onChange={set('city')}/></label>
        <label>{t('create.phone')}<input type="tel" maxLength={40} autoComplete="tel" value={form.contact_phone} onChange={set('contact_phone')}/></label>
        <label>{t('create.locale')}<select value={form.locale} onChange={set('locale')}><option value="ru">Русский</option><option value="uz">O‘zbekcha</option><option value="en">English</option></select></label>
        <div className="people-form-actions"><button disabled={busy}>{busy ? t('app.loading') : t('create.submit')}</button></div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
    <aside className="people-onboarding-aside" aria-labelledby="pilot-includes">
      <h2 id="pilot-includes">{t('people.onboarding.includesTitle')}</h2>
      <ul className="people-checklist">
        <li>{tests === null ? t('people.onboarding.includesTestsPlain') : t('people.onboarding.includesTests', { tests })}</li>
        <li>{t('people.onboarding.includesHiring')}</li>
        <li>{t('people.onboarding.includesPeople')}</li>
        <li>{t('people.onboarding.includesReports')}</li>
      </ul>
      <p className="hint">{t('people.onboarding.seatsNote')}</p>
    </aside>
  </div>;
}

function Guided({ orgId, step }: { orgId: string; step: Exclude<Step, 'company'> }) {
  const t = useAppT(), problem = useProblem();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setWorkspace(await api<Workspace>(`orgs/${orgId}`));
    } catch (cause) {
      setError(problem(cause));
    }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <p className="error" role="alert">{error}</p>;
  if (!workspace) return <p role="status">{t('app.loading')}</p>;
  const go = (next: Step) => navigate(`/start?org=${orgId}&step=${next}`);
  return <section className="people-onboarding-step" aria-labelledby="step-title">
    {step === 'departments' && <DepartmentsStep workspace={workspace} onReload={load} onNext={() => go('people')}/>}
    {step === 'people' && <PeopleStep workspace={workspace} onBack={() => go('departments')} onNext={() => go('test')}/>}
    {step === 'test' && <TestStep workspace={workspace} onBack={() => go('people')}/>}
  </section>;
}

function DepartmentsStep({ workspace, onReload, onNext }: { workspace: Workspace; onReload: () => Promise<void>; onNext: () => void }) {
  const t = useAppT(), problem = useProblem();
  const { org, departments } = workspace;
  const suggestions = t(suggestionKey(org.industry as Industry)).split(',').map((name) => name.trim()).filter(Boolean);
  const existing = new Set(departments.map((row) => row.name.trim().toLowerCase()));
  const [chosen, setChosen] = useState<string[]>(() => departments.length ? [] : suggestions.slice(0, 3));
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const toggle = (name: string) => setChosen(chosen.includes(name) ? chosen.filter((value) => value !== name) : [...chosen, name]);
  function addCustom(event: FormEvent) {
    event.preventDefault();
    const name = custom.trim();
    if (name && !chosen.includes(name) && !existing.has(name.toLowerCase())) setChosen([...chosen, name]);
    setCustom('');
  }
  async function save() {
    const names = chosen.filter((name) => !existing.has(name.toLowerCase()));
    if (!names.length) { onNext(); return; }
    setBusy(true); setError('');
    try {
      await api(`orgs/${org.id}/departments`, { method: 'POST', body: { names } });
      await onReload();
      onNext();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  const extra = chosen.filter((name) => !suggestions.includes(name));
  return <>
    <p className="eyebrow">{t('people.onboarding.created', { company: org.name })}</p>
    <h1 id="step-title">{t('people.onboarding.departmentsTitle')}</h1>
    <p>{t('people.onboarding.departmentsLead')}</p>
    {departments.length > 0 && <p className="hint">{t('people.onboarding.haveDepartments', { names: departments.map((row) => row.name).join(', ') })}</p>}
    <fieldset className="people-chips">
      <legend>{t('people.onboarding.suggested')}</legend>
      {[...suggestions, ...extra].filter((name) => !existing.has(name.toLowerCase())).map((name) => <label key={name} className={`people-chip ${chosen.includes(name) ? 'on' : ''}`}>
        <input type="checkbox" checked={chosen.includes(name)} onChange={() => toggle(name)}/>{name}
      </label>)}
    </fieldset>
    <form className="people-inline-form" onSubmit={addCustom}>
      <label>{t('people.onboarding.another')}<input maxLength={80} value={custom} onChange={(event) => setCustom(event.target.value)}/></label>
      <button className="quiet" disabled={!custom.trim()}>{t('common.add')}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="company-actions people-step-actions">
      <button type="button" disabled={busy} onClick={() => void save()}>{chosen.length ? t('people.onboarding.saveDepartments', { count: chosen.filter((name) => !existing.has(name.toLowerCase())).length }) : t('people.onboarding.continue')}</button>
      <button type="button" className="quiet" onClick={onNext}>{t('people.onboarding.skip')}</button>
    </div>
  </>;
}

function PeopleStep({ workspace, onBack, onNext }: { workspace: Workspace; onBack: () => void; onNext: () => void }) {
  const t = useAppT();
  const { org, departments } = workspace;
  const [link, setLink] = useState<string | null>(null);
  return <>
    <h1 id="step-title">{t('people.onboarding.peopleTitle')}</h1>
    <p>{t('people.onboarding.peopleLead')}</p>
    <div className="people-onboarding-options">
      <div>
        <h2>{t('people.onboarding.teamLinkTitle')}</h2>
        <p className="hint">{t('people.onboarding.teamLinkLead')}</p>
        {link ? <LinkResult link={link} title={t('people.links.ready')} message={t('people.share.team', { company: org.name })}/>
          : <TeamLinkForm orgId={org.id} departments={departments} compact onCreated={(value) => setLink(value)}/>}
        {link && <button type="button" className="quiet" onClick={() => setLink(null)}>{t('people.onboarding.anotherLink')}</button>}
      </div>
      <div>
        <h2>{t('people.onboarding.personalTitle')}</h2>
        <p className="hint">{t('people.onboarding.personalLead')}</p>
        <Link className="button-link quiet" to={`/w/${org.id}/people`}>{t('people.onboarding.openPeople')}</Link>
      </div>
    </div>
    <div className="company-actions people-step-actions">
      <button type="button" onClick={onNext}>{t('people.onboarding.continue')}</button>
      <button type="button" className="quiet" onClick={onBack}>{t('common.back')}</button>
    </div>
  </>;
}

function TestStep({ workspace, onBack }: { workspace: Workspace; onBack: () => void }) {
  const t = useAppT();
  const { org } = workspace;
  return <>
    <h1 id="step-title">{t('people.onboarding.testTitle')}</h1>
    <p>{t('people.onboarding.testLead')}</p>
    <ul className="people-checklist">
      <li>{t('people.onboarding.test1')}</li>
      <li>{t('people.onboarding.test2')}</li>
      <li>{t('people.onboarding.test3')}</li>
    </ul>
    <div className="company-actions people-step-actions">
      <Link className="button-link" to={`/w/${org.id}/hiring`}>{t('people.onboarding.createTest')}</Link>
      <Link className="button-link quiet" to={`/w/${org.id}`}>{t('people.onboarding.openWorkspace')}</Link>
      <button type="button" className="quiet" onClick={onBack}>{t('common.back')}</button>
    </div>
  </>;
}
