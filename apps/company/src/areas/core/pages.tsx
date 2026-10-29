// Shell pages: sign-in, workspace picker, start a pilot, consent banner, not found.
import React, { useState, type FormEvent } from 'react';
import { INDUSTRIES, SIZE_BANDS } from '../../../../../packages/company-core/src/mod.ts';
import { supabase } from '../../../../../packages/assessment-web/src/client';
import { accountLink } from '../../../../../packages/assessment-web/src/account-links';
import { LocaleSwitcher, useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api, type Member, type Org } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useSession, useWorkspace } from '../../session.tsx';

/** Where a member lands in a workspace: HR and managers on the overview, employees on My English. */
export const homeOf = (orgId: string, role: Member['role']) => role === 'employee' ? `/w/${orgId}/me` : `/w/${orgId}`;

export function SignIn() {
  const t = useAppT(), problem = useErrorText();
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <main className="signin" id="workspace-main">
    <div className="brand">Schood <span>{t('app.name')}</span></div>
    <LocaleSwitcher label={t('locale.label')}/>
    <h1>{t('signin.title')}</h1>
    <p>{t('signin.lead')}</p>
    <form onSubmit={submit}>
      <label>{t('signin.email')}<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)}/></label>
      <label>{t('signin.password')}<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>
      <button disabled={busy}>{t('signin.submit')}</button>
    </form>
    <p className="account-links"><a href={accountLink('signup')}>{t('account.create')}</a><a href={accountLink('forgot')}>{t('account.forgot')}</a></p>
    {error && <p className="error" role="alert">{error}</p>}
  </main>;
}

export function Picker() {
  const t = useAppT();
  const { me } = useSession();
  if (!me) return <p role="status">{t('app.loading')}</p>;
  return <section className="company-narrow">
    <h1>{t('picker.title')}</h1>
    {me.workspaces.length === 0 ? <>
      <p>{t('picker.empty')}</p>
      <p>{t('picker.emptyLead')}</p>
    </> : <ul className="records">
      {me.workspaces.map(({ org, member }) => <li key={org.id}>
        <strong>{org.name}</strong>
        <span>{t(`role.${member.role}` as AppKey)} · {t(`status.${org.status}` as AppKey)}</span>
        <Link className="button-link" to={homeOf(org.id, member.role)}>{t('picker.open')}</Link>
      </li>)}
    </ul>}
    <p className="company-actions">
      {(me.self_serve || me.staff) && <Link className="button-link" to="/start">{t('picker.create')}</Link>}
      {me.staff && <Link className="button-link quiet" to="/staff">{t('picker.staff')}</Link>}
    </p>
  </section>;
}

export function CreateWorkspace() {
  const t = useAppT(), problem = useErrorText();
  const { locale } = useI18n();
  const { me, refresh } = useSession();
  const [form, setForm] = useState({ name: '', industry: 'other', size_band: '1-50', city: '', contact_phone: '', full_name: '', locale });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (me && !me.self_serve && !me.staff) return <section className="company-narrow"><h1>{t('create.title')}</h1><p>{t('create.closed')}</p></section>;
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const { org } = await api<{ org: Org; member: Member }>('orgs', { method: 'POST', body: form });
      await refresh();
      navigate(`/w/${org.id}`);
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <section className="company-narrow">
    <h1>{t('create.title')}</h1>
    <p>{t('create.lead', { tests: 10 })}</p>
    <form onSubmit={submit}>
      <label>{t('create.name')}<input required minLength={2} maxLength={120} value={form.name} onChange={set('name')}/></label>
      <label>{t('create.fullName')}<input maxLength={120} autoComplete="name" value={form.full_name} onChange={set('full_name')}/></label>
      <label>{t('create.industry')}<select value={form.industry} onChange={set('industry')}>{INDUSTRIES.map((code) => <option key={code} value={code}>{t(`industry.${code}` as AppKey)}</option>)}</select></label>
      <label>{t('create.size')}<select value={form.size_band} onChange={set('size_band')}>{SIZE_BANDS.map((code) => <option key={code} value={code}>{t(`size.${code}` as AppKey)}</option>)}</select></label>
      <label>{t('create.city')}<input maxLength={80} value={form.city} onChange={set('city')}/></label>
      <label>{t('create.phone')}<input type="tel" maxLength={40} autoComplete="tel" value={form.contact_phone} onChange={set('contact_phone')}/></label>
      <label>{t('create.locale')}<select value={form.locale} onChange={set('locale')}><option value="ru">Русский</option><option value="uz">O‘zbekcha</option><option value="en">English</option></select></label>
      <button disabled={busy}>{t('create.submit')}</button>
    </form>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

/** Asks a member, once, to share their English progress with the company. */
export function ConsentBanner() {
  const t = useAppT(), problem = useErrorText();
  const { org, member, refresh } = useWorkspace();
  const [hidden, setHidden] = useState(false), [error, setError] = useState('');
  if (!member || member.consent_at || hidden || member.role === 'owner' || member.role === 'admin') return null;
  return <aside className="company-consent" aria-labelledby="consent-title">
    <h2 id="consent-title">{t('consent.title', { company: org.name })}</h2>
    <p>{t('consent.body')}</p>
    <div className="company-actions">
      <button onClick={() => void api(`orgs/${org.id}/consent`, { method: 'POST' }).then(refresh).catch((cause) => setError(problem(cause)))}>{t('consent.accept')}</button>
      <button className="quiet" onClick={() => setHidden(true)}>{t('consent.later')}</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </aside>;
}

export function NotFound() {
  const t = useAppT();
  return <section className="company-narrow"><h1>{t('common.notFound')}</h1><p><Link to="/">{t('common.home')}</Link></p></section>;
}

/** Placeholder for a page a workstream has not built yet. */
export function ComingSoon({ title }: { title: AppKey }) {
  const t = useAppT();
  return <section><h1>{t(title)}</h1><p>{t('common.comingSoon')}</p></section>;
}
