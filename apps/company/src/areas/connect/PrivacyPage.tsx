// Privacy tools: a plain summary of what is kept, one person's export and erasing their
// learning data. Everything sent to the server here is checked again there.
import React, { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { useWorkspace } from '../../session.tsx';
import { Page, saveFile, send, Status, useAction, useLoad, useOrgPath } from './shared.tsx';

interface Summary { counts: { people_active: number; people_invited: number; people_removed: number; sharing: number; not_sharing: number; candidate_attempts: number; staff_attempts: number; roleplays: number; writing_checks: number } }
interface Person { id: string; full_name: string | null; email: string | null; status: string; consent_at: string | null }

const ROWS = ['people', 'tests', 'learning', 'practice', 'candidates', 'tutor', 'notices'] as const;

function PersonTools({ orgId, person, onDone }: { orgId: string; person: Person; onDone: () => void }) {
  const t = useAppT(), path = useOrgPath(orgId);
  const { busy, error, notice, run } = useAction();
  const [erasing, setErasing] = useState(false);
  const [word, setWord] = useState('');
  const exportIt = () => void run(() => api<unknown>(path(`privacy/people/${person.id}/export`)), (data) => {
    saveFile(`person-${person.id}.json`, JSON.stringify(data, null, 2), 'application/json');
    return t('connect.privacy.exported');
  });
  const erase = () => void run(() => send<{ erased: Record<string, number> }>(path(`privacy/people/${person.id}/erase-learning`), 'POST', { confirm: word }), (result) => {
    setErasing(false); setWord(''); onDone();
    return t('connect.privacy.erased', { total: Object.values(result.erased).reduce((sum, value) => sum + value, 0) });
  });
  return <div className="connect-person">
    <div className="connect-row">
      <strong>{person.full_name ?? person.email}</strong>
      <span className={`company-badge ${person.consent_at ? 'good' : ''}`}>{person.consent_at ? t('connect.privacy.shares') : t('connect.privacy.noShare')}</span>
    </div>
    {person.email && <p className="hint">{person.email}</p>}
    <Status error={error} notice={notice}/>
    <div className="company-actions">
      <button type="button" className="quiet" disabled={busy} onClick={exportIt}>{t('connect.privacy.export')}</button>
      <button type="button" className="quiet connect-danger" disabled={busy} aria-expanded={erasing} onClick={() => setErasing(!erasing)}>{t('connect.privacy.erase')}</button>
    </div>
    <p className="hint">{t('connect.privacy.exportHint')}</p>
    {erasing && <div className="connect-confirm">
      <p>{t('connect.privacy.eraseLead')}</p>
      <label>{t('connect.privacy.eraseType')}<input value={word} autoComplete="off" onChange={(event) => setWord(event.target.value)}/></label>
      <div className="company-actions"><button type="button" className="connect-danger-solid" disabled={busy || word !== 'ERASE'} onClick={erase}>{t('connect.privacy.eraseGo')}</button></div>
    </div>}
  </div>;
}

function PersonSearch({ orgId }: { orgId: string }) {
  const t = useAppT(), path = useOrgPath(orgId);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Person[] | null>(null);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    const text = q.trim();
    if (!text) { setPeople(null); return; }
    let live = true;
    const timer = setTimeout(() => {
      api<{ people: Person[] }>(`${path('privacy/people')}?q=${encodeURIComponent(text)}`).then((result) => { if (live) { setPeople(result.people); setFailed(''); } }, () => { if (live) setFailed(t('error.network')); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [q, orgId]);
  return <section aria-labelledby="connect-person">
    <h2 id="connect-person">{t('connect.privacy.person')}</h2>
    <label>{t('connect.privacy.search')}<input type="search" placeholder={t('connect.privacy.searchPlaceholder')} value={q} onChange={(event) => setQ(event.target.value)}/></label>
    {failed && <p className="error" role="alert">{failed}</p>}
    {people && (people.length ? <div className="connect-stack connect-people">{people.map((person) => <PersonTools key={person.id} orgId={orgId} person={person} onDone={() => undefined}/>)}</div> : <p className="connect-empty">{t('connect.privacy.noResults')}</p>)}
  </section>;
}

export function PrivacyPage() {
  const t = useAppT();
  const { org } = useWorkspace();
  const { data, error } = useLoad<Summary>(useOrgPath(org.id)('privacy/summary'));
  const counts = data?.counts;
  return <Page title={t('connect.privacy.title')} lead={t('connect.privacy.lead')}>
    <p className="hint">{t('connect.privacy.note')}</p>
    {error && <p className="error" role="alert">{error}</p>}
    {counts && <section aria-labelledby="connect-now">
      <h2 id="connect-now">{t('connect.privacy.now')}</h2>
      <div className="company-grid connect-stats">
        <div className="company-stat"><strong>{counts.people_active}</strong><span>{t('connect.privacy.count.active')}</span></div>
        <div className="company-stat"><strong>{counts.people_invited}</strong><span>{t('connect.privacy.count.invited')}</span></div>
        <div className="company-stat"><strong>{counts.sharing}</strong><span>{t('connect.privacy.count.sharing')}</span></div>
        <div className="company-stat"><strong>{counts.not_sharing}</strong><span>{t('connect.privacy.count.notSharing')}</span></div>
        <div className="company-stat"><strong>{counts.candidate_attempts}</strong><span>{t('connect.privacy.count.candidates')}</span></div>
        <div className="company-stat"><strong>{counts.staff_attempts}</strong><span>{t('connect.privacy.count.staffTests')}</span></div>
      </div>
    </section>}
    <PersonSearch orgId={org.id}/>
    <section aria-labelledby="connect-what">
      <h2 id="connect-what">{t('connect.privacy.what')}</h2>
      <div className="company-table-wrap"><table className="company-table">
        <thead><tr><th>{t('connect.privacy.colData')}</th><th>{t('connect.privacy.colWho')}</th><th>{t('connect.privacy.colKept')}</th></tr></thead>
        <tbody>{ROWS.map((row) => <tr key={row}>
          <td>{t(`connect.privacy.row.${row}` as AppKey)}</td>
          <td>{t(`connect.privacy.row.${row}Who` as AppKey)}</td>
          <td>{t(`connect.privacy.row.${row}Kept` as AppKey)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section aria-labelledby="connect-services">
      <h2 id="connect-services">{t('connect.privacy.services')}</h2>
      <p>{t('connect.privacy.services.body')}</p>
    </section>
  </Page>;
}
