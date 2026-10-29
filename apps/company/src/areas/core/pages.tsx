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

// The guided pilot onboarding (company, departments, people, first test) lives with the
// people area of the gtm workstream and loads on demand.
const StartPilot = React.lazy(() => import('../people/Onboarding.tsx').then((module) => ({ default: module.StartPilot })));
export function CreateWorkspace() {
  const t = useAppT();
  return <React.Suspense fallback={<p role="status">{t('app.loading')}</p>}><StartPilot/></React.Suspense>;
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
