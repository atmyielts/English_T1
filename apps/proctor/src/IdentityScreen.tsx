import React, { useState } from 'react';
import { identifier, type ScreenProps } from './types';

export function IdentityScreen({ rows, busy, command }: ScreenProps) {
  const [registration, setRegistration] = useState(''), [method, setMethod] = useState('onsite_attended'), [notes, setNotes] = useState(''), [acknowledged, setAcknowledged] = useState(false);
  return <><div className="page-heading"><div><p className="eyebrow">Candidate preparation</p><h1>Attended identity checks</h1><p>Record a check performed by an authorized supervisor. This does not substitute for automated document or liveness verification.</p></div></div>
    <div className="split"><section><h2>Registered candidates</h2>{!rows.registrations?.length && <p>No candidates are registered. Add candidates to an exam sitting in Assessment Cloud.</p>}<ul className="records">{rows.registrations?.map(row => <li key={row.id}><strong>{identifier(row.candidate_id)}</strong><span>{identifier(rows.windows?.find(window => window.id === row.window_id)?.title) || identifier(row.window_id)}</span><span>Registration: {row.id}</span><button className="quiet" disabled={busy} onClick={() => { setRegistration(identifier(row.id)); setAcknowledged(false); }}>Select candidate</button></li>)}</ul></section>
      <section><h2>Record an attended check</h2><form onSubmit={event => { event.preventDefault(); if (acknowledged) void command('identity.verify', { registration_id: registration, method, notes }, 'Attended identity check recorded.'); }}>
        <label>Candidate registration<select required value={registration} onChange={event => { setRegistration(event.target.value); setAcknowledged(false); }}><option value="">Choose a registration</option>{rows.registrations?.map(row => <option key={row.id} value={row.id}>{identifier(row.candidate_id)} · {row.id}</option>)}</select></label>
        <label>Verification method<select value={method} onChange={event => setMethod(event.target.value)}><option value="onsite_attended">In person at the center</option><option value="remote_attended">Attended remote check</option></select></label>
        <label>Verification notes<textarea className="prose-input" required minLength={10} maxLength={5000} rows={5} value={notes} onChange={event => setNotes(event.target.value)} aria-describedby="identity-guidance"/></label>
        <p id="identity-guidance" className="hint">Record how the check was performed. Do not enter document numbers, upload identity documents or copy biometric data into these notes.</p>
        <label className="check"><input type="checkbox" required checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/>I personally performed this identity check.</label>
        <button disabled={busy || !acknowledged}>Record identity check</button>
      </form></section></div>
  </>;
}
