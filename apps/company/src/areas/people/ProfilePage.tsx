// /w/:org/profile — the person's own page: name, language, job role and seat requests,
// Telegram status, downloading their data and leaving the workspace.
import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { JOB_ROLES } from '../../../../../packages/company-core/src/mod.ts';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useSession, useWorkspace } from '../../session.tsx';
import type { ProfileData } from './types.ts';
import { AccessSyncIssue, useDates, useProblem } from './ui.tsx';

function saveJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ProfilePage() {
  const t = useAppT(), problem = useProblem(), { day, when } = useDates();
  const { locale, setLocale } = useI18n();
  const workspace = useWorkspace(), session = useSession();
  const orgId = workspace.org.id;
  const [data, setData] = useState<ProfileData | null>(null);
  const [name, setName] = useState('');
  const [wanted, setWanted] = useState('general');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [leaving, setLeaving] = useState(false), [leftUnsynced, setLeftUnsynced] = useState(false);
  // Telegram lives on the Notifications page; this shows only whether it is linked.
  const [telegram, setTelegram] = useState<boolean | null>(null);
  useEffect(() => {
    api<{ linked?: boolean }>(`orgs/${orgId}/connect/me`).then((next) => setTelegram(Boolean(next.linked))).catch(() => setTelegram(null));
  }, [orgId]);
  const load = useCallback(async () => {
    try {
      const next = await api<ProfileData>(`orgs/${orgId}/profile`);
      setData(next);
      setName(next.member.full_name ?? '');
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);
  if (!data) return error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>;
  const { member, requests } = data;
  const pending = requests.filter((row) => row.status === 'pending');
  const seatPending = pending.some((row) => row.kind === 'seat'), jobPending = pending.some((row) => row.kind === 'job_role');
  const readOnly = workspace.org.status === 'suspended' || workspace.org.status === 'closed';

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(message);
      await load();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  function saveName(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await api(`orgs/${orgId}/profile`, { method: 'PATCH', body: { full_name: name } });
      await Promise.all([workspace.refresh(), session.refresh()]);
    }, t('common.saved'));
  }
  function chooseLocale(next: 'en' | 'ru' | 'uz') {
    setLocale(next);
    void run(() => api(`orgs/${orgId}/profile`, { method: 'PATCH', body: { locale: next } }), t('common.saved'));
  }
  const ask = (body: Record<string, unknown>, message: string) => run(() => api(`orgs/${orgId}/profile/requests`, { method: 'POST', body }), message);
  async function exportData() {
    setBusy(true); setError(''); setNotice('');
    try {
      saveJson(`schood-company-my-data-${new Date().toISOString().slice(0, 10)}.json`, await api(`orgs/${orgId}/profile/export`, { timeoutMs: 60000 }));
      setNotice(t('people.profile.exported'));
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  async function afterLeaving() {
    await session.refresh();
    navigate('/w');
  }
  async function leave() {
    setBusy(true); setError('');
    try {
      const result = await api<{ access_sync_failed?: boolean }>(`orgs/${orgId}/people/me/leave`, { method: 'POST' });
      if (result.access_sync_failed) setLeftUnsynced(true);
      else await afterLeaving();
    } catch (cause) {
      setError(problem(cause));
      setLeaving(false);
    } finally {
      setBusy(false);
    }
  }
  return <div className="people">
    <header className="page-heading">
      <div>
        <p className="eyebrow">{t('nav.section.me')}</p>
        <h1>{t('people.profile.title')}</h1>
        <p className="people-sub">{data.email ?? member.email ?? ''}</p>
      </div>
    </header>
    {notice && <p className="notice" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="people-settings">
      <section aria-labelledby="profile-me">
        <h2 id="profile-me">{t('people.profile.about')}</h2>
        <form className="people-inline-form" onSubmit={saveName}>
          <label>{t('people.field.full_name')}<input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)}/></label>
          <button className="quiet" disabled={busy || name.trim() === (member.full_name ?? '')}>{t('common.save')}</button>
        </form>
        <label className="people-profile-language">{t('people.profile.language')}
          <select value={locale} disabled={busy} onChange={(event) => chooseLocale(event.target.value as 'en' | 'ru' | 'uz')}>
            <option value="ru">Русский</option><option value="uz">O‘zbekcha</option><option value="en">English</option>
          </select>
        </label>
        <dl className="people-facts">
          <div><dt>{t('people.field.role')}</dt><dd>{t(`role.${member.role}` as AppKey)}</dd></div>
          <div><dt>{t('people.field.department_id')}</dt><dd>{data.department ?? t('people.noDepartment')}</dd></div>
          <div><dt>{t('people.profile.joined')}</dt><dd>{day(member.joined_at)}</dd></div>
          <div><dt>{t('people.profile.sharing')}</dt><dd>{member.consent_at ? t('people.profile.sharingSince', { date: day(member.consent_at) }) : t('people.profile.sharingNo')}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="profile-job">
        <h2 id="profile-job">{t('people.profile.work')}</h2>
        <dl className="people-facts">
          <div><dt>{t('people.field.job_role')}</dt><dd>{t(`job.${member.job_role}` as AppKey)}</dd></div>
          <div><dt>{t('people.field.seat')}</dt><dd>{member.seat ? <span className="company-badge good">{t('people.seat.on')}</span> : t('people.seat.off')}</dd></div>
        </dl>
        {!readOnly && !jobPending && <form className="people-inline-form" onSubmit={(event) => { event.preventDefault(); void ask({ kind: 'job_role', job_role: wanted }, t('people.profile.asked')); }}>
          <label>{t('people.profile.jobRequest')}<select value={wanted} onChange={(event) => setWanted(event.target.value)}>
            {JOB_ROLES.map((code) => <option key={code} value={code}>{t(`job.${code}` as AppKey)}</option>)}
          </select></label>
          <button className="quiet" disabled={busy || wanted === member.job_role}>{t('people.profile.ask')}</button>
        </form>}
        {!readOnly && !member.seat && !seatPending && (data.seats_available_here
          ? <button type="button" className="quiet" disabled={busy} onClick={() => void ask({ kind: 'seat' }, t('people.profile.asked'))}>{t('people.profile.askSeat')}</button>
          : <p className="hint">{t('people.usage.pilotSeats')}</p>)}
        {requests.length > 0 && <>
          <h3 className="people-subhead">{t('people.profile.requests')}</h3>
          <ul className="people-admins">
            {requests.map((row) => <li key={row.id}>
              <div><strong>{row.kind === 'seat' ? t('people.requests.seat') : t('people.requests.job', { role: t(`job.${row.job_role}` as AppKey) })}</strong><span>{when(row.created_at)}</span></div>
              <span className={`company-badge ${row.status === 'approved' ? 'good' : row.status === 'declined' ? 'bad' : row.status === 'pending' ? 'warn' : ''}`}>{t(`people.requests.status.${row.status}` as AppKey)}</span>
              {row.status === 'pending' && <button type="button" className="quiet" disabled={busy} onClick={() => void run(() => api(`orgs/${orgId}/profile/requests/${row.id}`, { method: 'DELETE' }), t('people.profile.withdrawn'))}>{t('people.profile.withdraw')}</button>}
            </li>)}
          </ul>
        </>}
      </section>

      <section aria-labelledby="profile-telegram">
        <h2 id="profile-telegram">{t('people.profile.telegram')}</h2>
        <p className="hint">{t('people.profile.telegramNote')}</p>
        {telegram !== null && <span className={`company-badge ${telegram ? 'good' : ''}`}>{telegram ? t('people.profile.telegramOn') : t('people.profile.telegramOff')}</span>}
        <p><Link to={`/w/${orgId}/notifications`}>{t('people.profile.telegramManage')}</Link></p>
      </section>

      <section aria-labelledby="profile-data">
        <h2 id="profile-data">{t('people.profile.data')}</h2>
        <p className="hint">{t('people.profile.dataLead')}</p>
        <button type="button" className="quiet" disabled={busy} onClick={() => void exportData()}>{t('people.profile.download')}</button>
      </section>

      <section aria-labelledby="profile-leave" className="people-span-section people-leave">
        <h2 id="profile-leave">{t('people.settings.leaveTitle')}</h2>
        {leftUnsynced ? <AccessSyncIssue message={t('people.accessSync.left', { company: workspace.org.name })} retry={() => api<{ access_sync_failed?: boolean }>('me/access/sync', { method: 'POST' })} onFixed={afterLeaving}>
          <button type="button" className="quiet" onClick={() => void afterLeaving()}>{t('people.accessSync.continue')}</button>
        </AccessSyncIssue> : data.last_owner ? <p className="hint">{t('people.settings.lastOwner')}</p> : <>
          <p className="hint">{t('people.settings.leaveLead', { company: workspace.org.name })}</p>
          {leaving ? <div className="company-actions">
            <button type="button" className="people-danger-solid" disabled={busy} onClick={() => void leave()}>{t('people.settings.leaveConfirm')}</button>
            <button type="button" className="quiet" onClick={() => setLeaving(false)}>{t('common.cancel')}</button>
          </div> : <button type="button" className="quiet people-danger" onClick={() => setLeaving(true)}>{t('people.settings.leave')}</button>}
        </>}
      </section>
    </div>
  </div>;
}
