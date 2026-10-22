import React, { useState } from 'react';
import { useAppT, useCodeText } from './i18n/index.ts';
import { identifier, type ScreenProps } from './types';

export function TeamScreen({ rows, busy, command, canGrant }: ScreenProps & { canGrant: boolean }) {
  const t = useAppT(), code = useCodeText();
  const [user, setUser] = useState(''), [capability, setCapability] = useState('proctor.observe');
  const [session, setSession] = useState(''), [assignmentUser, setAssignmentUser] = useState(''), [assignmentRole, setAssignmentRole] = useState('observer');
  return <><div className="page-heading"><div><p className="eyebrow">{t('team.eyebrow')}</p><h1>{t('nav.team')}</h1><p>{t('team.lead')}</p></div></div><div className="split">
    <section><h2>{t('team.assignTitle')}</h2><form onSubmit={event => { event.preventDefault(); void command('session.assign', { session_id: session, user_id: assignmentUser, assignment_role: assignmentRole }, t('team.assigned')); }}>
      <label>{t('team.session')}<select required value={session} onChange={event => setSession(event.target.value)}><option value="">{t('team.chooseSession')}</option>{rows.sessions?.map(row => <option key={row.id} value={row.id}>{identifier(row.candidate_id)} · {code('state', row.state)}</option>)}</select></label>
      <label>{t('team.staffId')}<input required value={assignmentUser} onChange={event => setAssignmentUser(event.target.value)} placeholder={t('team.uuidPlaceholder')}/></label>
      <label>{t('team.role')}<select value={assignmentRole} onChange={event => setAssignmentRole(event.target.value)}><option value="observer">{t('team.role.observer')}</option><option value="reviewer">{t('team.role.reviewer')}</option></select></label>
      <p className="hint">{t('team.assignHint')}</p><button disabled={busy}>{t('team.assign')}</button>
    </form><h2 className="following-heading">{t('team.current')}</h2>{!rows.assignments?.length && <p>{t('team.noAssignments')}</p>}<ul className="records">{rows.assignments?.map(row => <li key={row.id}><strong>{identifier(row.user_id)}</strong><span>{code('role', row.assignment_role)} · {row.active ? t('team.active') : t('team.inactive')}</span><span>{t('team.assignmentSession', { id: identifier(row.session_id) })}</span></li>)}</ul></section>
    <section><h2>{t('team.capabilities')}</h2>{canGrant ? <form onSubmit={event => { event.preventDefault(); void command('capability.grant', { user_id: user, capability }, t('team.granted')); }}>
      <label>{t('team.memberId')}<input required value={user} onChange={event => setUser(event.target.value)} placeholder={t('team.uuidPlaceholder')}/></label>
      <label>{t('team.capability')}<select value={capability} onChange={event => setCapability(event.target.value)}><option value="proctor.observe">{t('team.capability.observe')}</option><option value="proctor.review">{t('team.capability.review')}</option><option value="proctor.manage">{t('team.capability.manage')}</option></select></label>
      <p className="hint">{t('team.grantHint')}</p>
      <div className="action-row"><button disabled={busy}>{t('team.grant')}</button><button type="button" className="quiet" disabled={busy || !user} onClick={() => { if (window.confirm(t('team.revokeConfirm'))) void command('capability.revoke', { user_id: user, capability }, t('team.revoked')); }}>{t('team.revoke')}</button></div>
    </form> : <p>{t('team.noGrant')}</p>}</section>
  </div></>;
}
