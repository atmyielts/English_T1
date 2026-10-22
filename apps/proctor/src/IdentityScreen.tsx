import React, { useState } from 'react';
import { useAppT } from './i18n/index.ts';
import { identifier, type ScreenProps } from './types';

export function IdentityScreen({ rows, busy, command }: ScreenProps) {
  const t = useAppT();
  const [registration, setRegistration] = useState(''), [method, setMethod] = useState('onsite_attended'), [notes, setNotes] = useState(''), [acknowledged, setAcknowledged] = useState(false);
  return <><div className="page-heading"><div><p className="eyebrow">{t('identity.eyebrow')}</p><h1>{t('identity.title')}</h1><p>{t('identity.lead')}</p></div></div>
    <div className="split"><section><h2>{t('identity.registered')}</h2>{!rows.registrations?.length && <p>{t('identity.empty')}</p>}<ul className="records">{rows.registrations?.map(row => <li key={row.id}><strong>{identifier(row.candidate_id)}</strong><span>{identifier(rows.windows?.find(window => window.id === row.window_id)?.title) || identifier(row.window_id)}</span><span>{t('identity.registration', { id: identifier(row.id) })}</span><button className="quiet" disabled={busy} onClick={() => { setRegistration(identifier(row.id)); setAcknowledged(false); }}>{t('identity.select')}</button></li>)}</ul></section>
      <section><h2>{t('identity.recordTitle')}</h2><form onSubmit={event => { event.preventDefault(); if (acknowledged) void command('identity.verify', { registration_id: registration, method, notes }, t('identity.recorded')); }}>
        <label>{t('identity.registrationLabel')}<select required value={registration} onChange={event => { setRegistration(event.target.value); setAcknowledged(false); }}><option value="">{t('identity.chooseRegistration')}</option>{rows.registrations?.map(row => <option key={row.id} value={row.id}>{identifier(row.candidate_id)} · {row.id}</option>)}</select></label>
        <label>{t('identity.method')}<select value={method} onChange={event => setMethod(event.target.value)}><option value="onsite_attended">{t('identity.method.onsite_attended')}</option><option value="remote_attended">{t('identity.method.remote_attended')}</option></select></label>
        <label>{t('identity.notes')}<textarea className="prose-input" required minLength={10} maxLength={5000} rows={5} value={notes} onChange={event => setNotes(event.target.value)} aria-describedby="identity-guidance"/></label>
        <p id="identity-guidance" className="hint">{t('identity.guidance')}</p>
        <label className="check"><input type="checkbox" required checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/>{t('identity.ack')}</label>
        <button disabled={busy || !acknowledged}>{t('identity.submit')}</button>
      </form></section></div>
  </>;
}
