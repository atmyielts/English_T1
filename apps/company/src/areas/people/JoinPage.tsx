// /join/:token — the invitee sees which company invited them and for what, signs
// in (or creates a Schood account), agrees to share progress, and joins.
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../../../../packages/assessment-web/src/client';
import { accountLink } from '../../../../../packages/assessment-web/src/account-links';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useSession } from '../../session.tsx';
import type { JoinPreview } from './types.ts';
import { useDates, useProblem } from './ui.tsx';

export function JoinPage({ token }: { token: string }) {
  const t = useAppT(), problem = useProblem(), { day } = useDates();
  const session = useSession();
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [error, setError] = useState<{ code: string; text: string } | null>(null);
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const signedIn = Boolean(session.user);
  const load = useCallback(async () => {
    try {
      setPreview(await api<JoinPreview>(`join/${encodeURIComponent(token)}`, { auth: signedIn }));
      setError(null);
    } catch (cause) {
      setError({ code: String((cause as { code?: string }).code ?? ''), text: problem(cause) });
    }
  }, [token, signedIn]);
  useEffect(() => { if (session.user !== undefined) void load(); }, [load, session.user]);

  async function join(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setFailure('');
    try {
      const result = await api<{ home: string }>(`join/${encodeURIComponent(token)}`, { method: 'POST', body: { consent: true, full_name: name.trim() || null } });
      await session.refresh();
      navigate(result.home);
    } catch (cause) {
      setFailure(problem(cause));
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <section className="company-narrow people-join" aria-labelledby="join-title">
    <h1 id="join-title">{error.code === 'invite_not_found' ? t('people.join.invalidTitle') : t('people.join.problemTitle')}</h1>
    <p role="alert">{error.code === 'invite_not_found' ? t('people.join.invalid') : error.text}</p>
    <p><Link to="/">{t('people.join.aboutService')}</Link></p>
  </section>;
  if (!preview || session.user === undefined) return <p role="status" className="company-narrow">{t('app.loading')}</p>;

  const { org } = preview;
  const roleText = t(`role.${preview.role}` as AppKey);
  const closed = !['open', 'joined'].includes(preview.state);
  return <section className="company-narrow people-join" aria-labelledby="join-title">
    <p className="eyebrow">{t('people.join.eyebrow')}</p>
    <h1 id="join-title">{preview.state === 'joined' ? t('people.join.alreadyTitle', { company: org.name }) : t('people.join.title', { company: org.name })}</h1>
    <dl className="people-facts people-join-facts">
      <div><dt>{t('people.field.role')}</dt><dd>{roleText}</dd></div>
      {preview.department && <div><dt>{t('people.field.department_id')}</dt><dd>{preview.department}</dd></div>}
      <div><dt>{t('people.field.job_role')}</dt><dd>{t(`job.${preview.job_role}` as AppKey)}</dd></div>
      {preview.full_name && <div><dt>{t('people.join.for')}</dt><dd>{preview.full_name}{preview.email_hint ? ` · ${preview.email_hint}` : ''}</dd></div>}
      {preview.state === 'open' && <div><dt>{t('people.join.validUntil')}</dt><dd>{day(preview.expires_at)}</dd></div>}
    </dl>

    {preview.state === 'joined' && <>
      <p className="notice" role="status">{t('people.join.already')}</p>
      <p><Link className="button-link" to={preview.home ?? `/w/${org.id}`}>{t('people.join.open')}</Link></p>
    </>}

    {closed && <div className="people-join-closed" role="alert">
      <h2>{t(`people.join.state.${preview.state}.title` as AppKey)}</h2>
      <p>{t(`people.join.state.${preview.state}.body` as AppKey, { company: org.name })}</p>
    </div>}

    {preview.state === 'open' && <>
      <div className="people-join-what">
        <h2>{t('people.join.whatTitle')}</h2>
        <ul>
          <li>{t('people.join.what1')}</li>
          <li>{t('people.join.what2')}</li>
          <li>{t('people.join.what3')}</li>
        </ul>
      </div>
      {signedIn ? <form onSubmit={join} className="people-join-form">
        {!preview.full_name && <label>{t('people.join.name')}<input maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)}/></label>}
        <div className="company-consent people-join-consent">
          <h2>{t('consent.title', { company: org.name })}</h2>
          <p>{t('consent.body')}</p>
          <label className="check"><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)}/>{t('people.join.consent', { company: org.name })}</label>
        </div>
        <button disabled={busy || !consent}>{busy ? t('app.loading') : t('people.join.submit', { company: org.name })}</button>
        <p className="hint">{t('people.join.signedInAs', { email: session.me?.user.email ?? '' })} <button type="button" className="people-linkish" onClick={() => void session.signOut()}>{t('people.join.switch')}</button></p>
      </form> : <JoinSignIn/>}
    </>}
    {failure && <p className="error" role="alert">{failure}</p>}
  </section>;
}

/** Sign-in inside the join page, so the invitation stays on screen. */
function JoinSignIn() {
  const t = useAppT(), problem = useProblem();
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
  return <div className="people-join-signin">
    <h2>{t('people.join.signInTitle')}</h2>
    <p className="hint">{t('people.join.signInLead')}</p>
    <form onSubmit={submit}>
      <label>{t('signin.email')}<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)}/></label>
      <label>{t('signin.password')}<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>
      <button disabled={busy}>{t('signin.submit')}</button>
    </form>
    <p className="account-links"><a href={accountLink('signup')}>{t('account.create')}</a><a href={accountLink('forgot')}>{t('account.forgot')}</a></p>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
