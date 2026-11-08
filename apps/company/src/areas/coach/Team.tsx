// Team feed (/w/:org/coach/team): kudos between colleagues who chose to join. It holds only
// what people send on purpose. HR can switch it off for the workspace and remove any entry.
import React, { useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { useDate, useLoad } from '../training/lib.tsx';
import { Gate } from './lib.tsx';

interface Entry { id: string; kind: 'kudos' | 'badge'; message: string | null; note: string | null; badge: string | null; created_at: string; from: string | null; to: string | null; mine: boolean; about_me: boolean; can_remove: boolean }
interface TeamData {
  enabled: boolean; joined: boolean; can_manage: boolean; consent: boolean; messages: string[]; daily_limit: number; sent_today: number;
  people: { id: string; name: string | null }[]; feed: Entry[];
}

export function Team() {
  const t = useAppT(), problem = useErrorText(), when = useDate();
  const { org, member } = useWorkspace();
  const { data, error, cause, reload } = useLoad<TeamData>(`orgs/${org.id}/coach/team`);
  const [to, setTo] = useState(''), [message, setMessage] = useState(''), [note, setNote] = useState('');
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  if (!data) return <Gate error={error} cause={cause}/>;

  async function act(run: () => Promise<unknown>, done?: string) {
    setBusy(true); setFailure(''); setNotice('');
    try {
      await run();
      await reload();
      if (done) setNotice(done);
    } catch (failed) {
      setFailure(problem(failed));
    } finally {
      setBusy(false);
    }
  }
  function send(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      await api(`orgs/${org.id}/coach/team/kudos`, { method: 'POST', body: { to, message: message || data!.messages[0], note } });
      setTo(''); setNote('');
    }, t('coach.team.sent'));
  }
  const name = (value: string | null) => value ?? t('coach.team.colleague');
  const canSend = data.joined && data.enabled;

  return <div className="coach-page">
    <header className="coach-head">
      <h1>{t('coach.team.title')}</h1>
      <p>{t('coach.team.lead')}</p>
    </header>

    {data.can_manage && <section className="coach-card coach-manage" aria-labelledby="coach-manage">
      <h2 id="coach-manage">{t('coach.team.manage')}</h2>
      <p>{data.enabled ? t('coach.team.manageOn') : t('coach.team.manageOff')}</p>
      <p className="company-actions"><button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api(`orgs/${org.id}/coach/team/settings`, { method: 'PUT', body: { kudos_off: data.enabled } }))}>{data.enabled ? t('coach.team.turnOff') : t('coach.team.turnOn')}</button></p>
    </section>}

    {!data.enabled && !data.can_manage && <section className="coach-card"><p>{t('coach.team.off')}</p></section>}

    {data.enabled && member && !data.joined && <section className="coach-card" aria-labelledby="coach-join">
      <h2 id="coach-join">{t('coach.team.joinTitle')}</h2>
      <ul className="coach-rules">
        <li>{t('coach.team.joinRule1')}</li>
        <li>{t('coach.team.joinRule2')}</li>
        <li>{t('coach.team.joinRule3')}</li>
      </ul>
      <p className="company-actions"><button type="button" disabled={busy} onClick={() => void act(() => api(`orgs/${org.id}/coach/team/membership`, { method: 'PUT', body: { joined: true } }))}>{t('coach.team.join')}</button></p>
    </section>}

    {canSend && <section className="coach-card" aria-labelledby="coach-send">
      <h2 id="coach-send">{t('coach.team.sendTitle')}</h2>
      {data.people.length === 0 ? <p>{t('coach.team.alone')}</p> : <form className="coach-form" onSubmit={send}>
        <div className="coach-form-row">
          <label>{t('coach.team.to')}
            <select required value={to} onChange={(event) => setTo(event.target.value)}>
              <option value="">{t('coach.team.pick')}</option>
              {data.people.map((person) => <option key={person.id} value={person.id}>{name(person.name)}</option>)}
            </select>
          </label>
          <label>{t('coach.team.for')}
            <select value={message || data.messages[0]} onChange={(event) => setMessage(event.target.value)}>
              {data.messages.map((code) => <option key={code} value={code}>{t(`coach.kudos.${code}` as AppKey)}</option>)}
            </select>
          </label>
        </div>
        <label>{t('coach.team.note')}<input maxLength={140} value={note} onChange={(event) => setNote(event.target.value)}/></label>
        <p className="company-actions">
          <button type="submit" disabled={busy}>{t('coach.team.send')}</button>
          <span className="coach-note">{t('coach.team.sentToday', { count: data.sent_today, limit: data.daily_limit })}</span>
        </p>
      </form>}
    </section>}
    {failure && <p className="error" role="alert">{failure}</p>}
    {notice && <p role="status">{notice}</p>}

    {data.enabled && (data.joined || data.can_manage) && <section className="coach-card" aria-labelledby="coach-feed">
      <h2 id="coach-feed">{t('coach.team.feed')}</h2>
      {data.feed.length === 0 ? <p>{t('coach.team.empty')}</p> : <ul className="coach-rows">
        {data.feed.map((entry) => <li key={entry.id}>
          <div>
            {entry.kind === 'kudos'
              ? <strong>{t('coach.team.kudosLine', { from: name(entry.from), to: name(entry.to) })}</strong>
              : <strong>{t('coach.team.badgeLine', { from: name(entry.from), badge: t(`coach.badge.${entry.badge}` as AppKey) })}</strong>}
            {entry.message && <span>{t(`coach.kudos.${entry.message}` as AppKey)}</span>}
            {entry.note && <span className="coach-row-note">{entry.note}</span>}
            <span className="coach-row-meta">{when(entry.created_at)}</span>
          </div>
          {entry.can_remove && <div className="coach-row-actions"><button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api(`orgs/${org.id}/coach/team/kudos/${entry.id}`, { method: 'DELETE' }))}>{t('coach.team.remove')}</button></div>}
        </li>)}
      </ul>}
    </section>}

    {data.joined && <p className="company-actions">
      <Link to={`/w/${org.id}/coach/progress`}>{t('coach.team.shareHint')}</Link>
      <button type="button" className="quiet" disabled={busy} onClick={() => void act(() => api(`orgs/${org.id}/coach/team/membership`, { method: 'PUT', body: { joined: false } }))}>{t('coach.team.leave')}</button>
    </p>}
    <p className="coach-note">{t('coach.team.privacy')}</p>
  </div>;
}
