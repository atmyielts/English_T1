import React, { useState, type FormEvent } from 'react';
import { validatePolicy, type ProctorPolicy } from '../../../packages/assessment-core/src/mod.ts';
import { identifier, label, type Policy, type ScreenProps } from './types';

const initial: ProctorPolicy = { schema_version: 'proctor.policy.v1', mode: 'browser', identity_level: 0, camera: false, microphone: false, screen: false, second_camera: false, recording_retention_days: 90, identity_retention_days: 30, auto_pause: false, recovery_seconds: 10, reviewer_quorum: 2 };
export function PolicyScreen({ rows, busy, command }: ScreenProps) {
  const [title, setTitle] = useState(''), [policy, setPolicy] = useState(initial);
  const [policyId, setPolicyId] = useState(''), [windowId, setWindowId] = useState('');
  const policies = (rows.policies ?? []) as Policy[];
  const requiresCapture = policy.mode !== 'browser' || policy.camera || policy.microphone || policy.screen || policy.second_camera;
  const submit = (event: FormEvent) => { event.preventDefault(); void command('policy.create', { title, policy: validatePolicy(policy) }, 'Monitoring policy created.'); };
  return <>
    <div className="page-heading"><div><p className="eyebrow">Exam preparation</p><h1>Monitoring policies</h1><p>Define the rules candidates acknowledge before their exam. Published policies cannot be edited.</p></div></div>
    <div className="split">
      <section aria-labelledby="policy-list"><h2 id="policy-list">Institution policies</h2>
        {!policies.length && <p>No monitoring policies yet. Create one for your next sitting.</p>}
        <ul className="records">{policies.map(row => <li key={row.id}><strong>{row.title}</strong><span>{label(row.policy.mode)} · identity level {row.policy.identity_level} · {row.policy.reviewer_quorum} independent reviewer{row.policy.reviewer_quorum === 1 ? '' : 's'}</span><span>Identity records: {row.policy.identity_retention_days} days · recordings: {row.policy.recording_retention_days} days</span></li>)}</ul>
        <h2>Attach a policy to a sitting</h2><p>A policy must be attached before the first candidate starts. It cannot be replaced after launch.</p>
        <form onSubmit={event => { event.preventDefault(); void command('policy.attach', { policy_id: policyId, window_id: windowId }, 'Monitoring policy attached.'); }}>
          <label>Exam sitting<select required value={windowId} onChange={event => setWindowId(event.target.value)}><option value="">Choose a sitting</option>{rows.windows?.map(row => <option key={row.id} value={row.id}>{identifier(row.title) || row.id}</option>)}</select></label>
          <label>Monitoring policy<select required value={policyId} onChange={event => setPolicyId(event.target.value)}><option value="">Choose a policy</option>{policies.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>
          <button disabled={busy}>Attach policy</button>
        </form>
        <ul className="records" aria-label="Attached policies">{rows.bindings?.map(row => <li key={row.id}><span>{identifier(rows.windows?.find(window => window.id === row.window_id)?.title) || identifier(row.window_id)}</span><strong>{policies.find(policy => policy.id === row.policy_id)?.title ?? identifier(row.policy_id)}</strong></li>)}</ul>
      </section>
      <section aria-labelledby="create-policy"><h2 id="create-policy">Create monitoring policy</h2><form onSubmit={submit}>
        <label>Policy name<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)}/></label>
        <label>Monitoring mode<select value={policy.mode} onChange={event => setPolicy({ ...policy, mode: event.target.value as ProctorPolicy['mode'] })}><option value="browser">Browser monitoring</option><option value="record_review">Record and review</option><option value="live">Live proctoring</option><option value="secure_desktop">Secure desktop</option><option value="center">Managed examination center</option></select></label>
        <label>Identity check<select value={policy.identity_level} onChange={event => setPolicy({ ...policy, identity_level: Number(event.target.value) as ProctorPolicy['identity_level'] })}><option value={0}>Schood account</option><option value={1}>Attended identity check</option><option value={2}>Document and liveness verification</option><option value={3}>Enhanced attended identity check</option></select></label>
        <fieldset><legend>Required capture</legend>{(['camera','microphone','screen','second_camera'] as const).map(key => <label className="check" key={key}><input type="checkbox" checked={policy[key]} onChange={event => setPolicy({ ...policy, [key]: event.target.checked })}/>{label(key)}</label>)}</fieldset>
        <div className="form-pair"><label>Recording retention (days)<input type="number" min={1} max={365} required value={policy.recording_retention_days} onChange={event => setPolicy({ ...policy, recording_retention_days: Number(event.target.value) })}/></label><label>Identity retention (days)<input type="number" min={1} max={365} required value={policy.identity_retention_days} onChange={event => setPolicy({ ...policy, identity_retention_days: Number(event.target.value) })}/></label></div>
        <label>Recovery allowance (seconds)<input type="number" min={10} max={300} required value={policy.recovery_seconds} onChange={event => setPolicy({ ...policy, recovery_seconds: Number(event.target.value) })}/></label>
        <label>Independent reviewers required<select value={policy.reviewer_quorum} onChange={event => setPolicy({ ...policy, reviewer_quorum: Number(event.target.value) as 1 | 2 })}><option value={2}>Two agreeing human reviewers</option><option value={1}>One human reviewer</option></select></label>
        <label className="check"><input type="checkbox" checked={policy.auto_pause} onChange={event => setPolicy({ ...policy, auto_pause: event.target.checked })}/>Allow automated pause or re-verification when enforcement is connected</label>
        <p className="hint">Browser reports do not prove misconduct. Automated enforcement is not connected here; a human review is required for consequential decisions.</p>
        {(requiresCapture || policy.identity_level === 2) && <p className="service-warning" role="status">This policy can be saved, but candidates cannot launch it until the required recording, secure-client or document-verification service is connected. It will not fall back to weaker monitoring.</p>}
        <button disabled={busy}>Create policy</button>
      </form></section>
    </div>
  </>;
}
