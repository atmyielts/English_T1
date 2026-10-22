import React, { useState, type FormEvent } from 'react';
import { validatePolicy, type ProctorPolicy } from '../../../packages/assessment-core/src/mod.ts';
import { useAppT, useCodeText, type AppKey } from './i18n/index.ts';
import { evidenceConfigured, identifier, liveConfigured, type Policy, type ScreenProps } from './types';

const initial: ProctorPolicy = { schema_version: 'proctor.policy.v1', mode: 'browser', identity_level: 0, camera: false, microphone: false, screen: false, second_camera: false, recording_retention_days: 90, identity_retention_days: 30, auto_pause: false, recovery_seconds: 10, reviewer_quorum: 2, snapshot_interval_seconds: 0 };
type Mode = ProctorPolicy['mode'];
type CaptureSource = 'camera' | 'microphone' | 'screen' | 'second_camera';
// Only modes this deployment can launch are offered. Browser monitoring needs
// nothing extra; recording needs the private evidence service; live needs the
// live media service. Secure desktop, managed centers and a second camera need
// native clients that do not exist yet.
const offeredModes: Mode[] = ['browser', ...(evidenceConfigured ? ['record_review' as const] : []), ...(liveConfigured ? ['live' as const] : [])];
const offeredSources: CaptureSource[] = evidenceConfigured ? ['camera', 'microphone', 'screen'] : [];
const snapshotIntervals = [0, 30, 60, 120, 300] as const;
/** Whether candidates could launch this saved policy in this deployment. */
function launchable(policy: ProctorPolicy) {
  return offeredModes.includes(policy.mode) && (['camera', 'microphone', 'screen', 'second_camera'] as const).every(source => !policy[source] || offeredSources.includes(source));
}
export function PolicyScreen({ rows, busy, command }: ScreenProps) {
  const t = useAppT(), code = useCodeText();
  const [title, setTitle] = useState(''), [policy, setPolicy] = useState(initial);
  const [policyId, setPolicyId] = useState(''), [windowId, setWindowId] = useState('');
  const policies = (rows.policies ?? []) as Policy[];
  const requiresCapture = policy.mode !== 'browser' || policy.camera || policy.microphone || policy.screen || policy.second_camera;
  const submit = (event: FormEvent) => { event.preventDefault(); void command('policy.create', { title, policy: validatePolicy(policy) }, t('policy.created')); };
  return <>
    <div className="page-heading"><div><p className="eyebrow">{t('policy.eyebrow')}</p><h1>{t('nav.policies')}</h1><p>{t('policy.lead')}</p></div></div>
    <div className="split">
      <section aria-labelledby="policy-list"><h2 id="policy-list">{t('policy.listTitle')}</h2>
        {!policies.length && <p>{t('policy.empty')}</p>}
        <ul className="records">{policies.map(row => <li key={row.id}><strong>{row.title}</strong><span>{t('policy.summary', { mode: code('mode', row.policy.mode), level: String(row.policy.identity_level), count: row.policy.reviewer_quorum })} · {row.policy.snapshot_interval_seconds ? t('policy.snapshotsEvery', { seconds: String(row.policy.snapshot_interval_seconds) }) : t('policy.noSnapshots')}</span><span>{t('policy.retention', { identity: String(row.policy.identity_retention_days), recording: String(row.policy.recording_retention_days) })}</span>{!launchable(row.policy) && <span className="hint">{t('policy.unavailable')}</span>}</li>)}</ul>
        <h2>{t('policy.attachTitle')}</h2><p>{t('policy.attachLead')}</p>
        <form onSubmit={event => { event.preventDefault(); void command('policy.attach', { policy_id: policyId, window_id: windowId }, t('policy.attached')); }}>
          <label>{t('policy.sitting')}<select required value={windowId} onChange={event => setWindowId(event.target.value)}><option value="">{t('policy.chooseSitting')}</option>{rows.windows?.map(row => <option key={row.id} value={row.id}>{identifier(row.title) || row.id}</option>)}</select></label>
          <label>{t('policy.policy')}<select required value={policyId} onChange={event => setPolicyId(event.target.value)}><option value="">{t('policy.choosePolicy')}</option>{policies.map(row => launchable(row.policy) ? <option key={row.id} value={row.id}>{row.title}</option> : <option key={row.id} value={row.id} disabled>{t('policy.optionUnavailable', { title: row.title })}</option>)}</select></label>
          <button disabled={busy}>{t('policy.attach')}</button>
        </form>
        <ul className="records" aria-label={t('policy.attachedList')}>{rows.bindings?.map(row => <li key={row.id}><span>{identifier(rows.windows?.find(window => window.id === row.window_id)?.title) || identifier(row.window_id)}</span><strong>{policies.find(policy => policy.id === row.policy_id)?.title ?? identifier(row.policy_id)}</strong></li>)}</ul>
      </section>
      <section aria-labelledby="create-policy"><h2 id="create-policy">{t('policy.createTitle')}</h2><form onSubmit={submit}>
        <label>{t('policy.name')}<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)}/></label>
        <label>{t('policy.mode')}<select value={policy.mode} onChange={event => setPolicy({ ...policy, mode: event.target.value as Mode })} aria-describedby="policy-mode-hint">{offeredModes.map(mode => <option key={mode} value={mode}>{t(`policy.mode.${mode}` as AppKey)}</option>)}</select></label>
        <p id="policy-mode-hint" className="hint">{t('policy.modeHint')}</p>
        <label>{t('policy.identity')}<select value={policy.identity_level} onChange={event => setPolicy({ ...policy, identity_level: Number(event.target.value) as ProctorPolicy['identity_level'] })}>{([0, 1, 2, 3] as const).map(level => <option key={level} value={level}>{t(`policy.identity.${level}`)}</option>)}</select></label>
        <fieldset><legend>{t('policy.capture')}</legend>{offeredSources.length ? offeredSources.map(key => <label className="check" key={key}><input type="checkbox" checked={policy[key]} onChange={event => setPolicy({ ...policy, [key]: event.target.checked })}/>{code('source', key)}</label>) : <p className="hint">{t('policy.captureUnavailable')}</p>}</fieldset>
        <label>{t('policy.snapshots')}<select value={policy.snapshot_interval_seconds} onChange={event => setPolicy({ ...policy, snapshot_interval_seconds: Number(event.target.value) })} aria-describedby="policy-snapshots-hint">{snapshotIntervals.map(seconds => <option key={seconds} value={seconds}>{t(`policy.snapshots.${seconds}`)}</option>)}</select></label>
        <p id="policy-snapshots-hint" className="hint">{t('policy.snapshotsHint')}</p>
        <div className="form-pair"><label>{t('policy.recordingRetention')}<input type="number" min={1} max={365} required value={policy.recording_retention_days} onChange={event => setPolicy({ ...policy, recording_retention_days: Number(event.target.value) })}/></label><label>{t('policy.identityRetention')}<input type="number" min={1} max={365} required value={policy.identity_retention_days} onChange={event => setPolicy({ ...policy, identity_retention_days: Number(event.target.value) })}/></label></div>
        <label>{t('policy.recovery')}<input type="number" min={10} max={300} required value={policy.recovery_seconds} onChange={event => setPolicy({ ...policy, recovery_seconds: Number(event.target.value) })}/></label>
        <label>{t('policy.quorum')}<select value={policy.reviewer_quorum} onChange={event => setPolicy({ ...policy, reviewer_quorum: Number(event.target.value) as 1 | 2 })}><option value={2}>{t('policy.quorum.2')}</option><option value={1}>{t('policy.quorum.1')}</option></select></label>
        <label className="check"><input type="checkbox" checked={policy.auto_pause} onChange={event => setPolicy({ ...policy, auto_pause: event.target.checked })}/>{t('policy.autoPause')}</label>
        <p className="hint">{t('policy.hint')}</p>
        {(requiresCapture || policy.identity_level === 2) && <p className="service-warning" role="status">{t('policy.notReady')}</p>}
        <button disabled={busy}>{t('policy.submit')}</button>
      </form></section>
    </div>
  </>;
}
