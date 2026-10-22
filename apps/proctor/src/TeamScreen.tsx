import React, { useState } from 'react';
import { identifier, label, type ScreenProps } from './types';

export function TeamScreen({ rows, busy, command, canGrant }: ScreenProps & { canGrant: boolean }) {
  const [user, setUser] = useState(''), [capability, setCapability] = useState('proctor.observe');
  const [session, setSession] = useState(''), [assignmentUser, setAssignmentUser] = useState(''), [assignmentRole, setAssignmentRole] = useState('observer');
  return <><div className="page-heading"><div><p className="eyebrow">Institution access</p><h1>Proctor team</h1><p>Capabilities authorize a role. Assignments limit observers and reviewers to specific sessions.</p></div></div><div className="split">
    <section><h2>Assign a session</h2><form onSubmit={event => { event.preventDefault(); void command('session.assign', { session_id: session, user_id: assignmentUser, assignment_role: assignmentRole }, 'Proctor assigned to session.'); }}>
      <label>Session<select required value={session} onChange={event => setSession(event.target.value)}><option value="">Choose a session</option>{rows.sessions?.map(row => <option key={row.id} value={row.id}>{identifier(row.candidate_id)} · {label(row.state)}</option>)}</select></label>
      <label>Schood staff account ID<input required value={assignmentUser} onChange={event => setAssignmentUser(event.target.value)} placeholder="Account UUID"/></label>
      <label>Session role<select value={assignmentRole} onChange={event => setAssignmentRole(event.target.value)}><option value="observer">Observer</option><option value="reviewer">Reviewer</option></select></label>
      <p className="hint">The staff member must already have the matching institution capability. Supervisors can access all institution sessions.</p><button disabled={busy}>Assign proctor</button>
    </form><h2 className="following-heading">Current assignments</h2>{!rows.assignments?.length && <p>No session assignments yet.</p>}<ul className="records">{rows.assignments?.map(row => <li key={row.id}><strong>{identifier(row.user_id)}</strong><span>{label(row.assignment_role)} · {row.active ? 'Active' : 'Inactive'}</span><span>Session: {identifier(row.session_id)}</span></li>)}</ul></section>
    <section><h2>Institution capabilities</h2>{canGrant ? <form onSubmit={event => { event.preventDefault(); void command('capability.grant', { user_id: user, capability }, 'Institution capability granted.'); }}>
      <label>Schood institution member ID<input required value={user} onChange={event => setUser(event.target.value)} placeholder="Account UUID"/></label>
      <label>Capability<select value={capability} onChange={event => setCapability(event.target.value)}><option value="proctor.observe">Observe assigned sessions</option><option value="proctor.review">Review assigned sessions</option><option value="proctor.manage">Supervise institution proctoring</option></select></label>
      <p className="hint">Only an owner or administrator can grant capabilities. The account must be an active member of this institution.</p>
      <div className="action-row"><button disabled={busy}>Grant capability</button><button type="button" className="quiet" disabled={busy || !user} onClick={() => { if (window.confirm('Revoke this capability? Session access may stop immediately.')) void command('capability.revoke', { user_id: user, capability }, 'Institution capability revoked.'); }}>Revoke capability</button></div>
    </form> : <p>An institution owner or administrator manages capabilities. Contact them to authorize additional proctors.</p>}</section>
  </div></>;
}
