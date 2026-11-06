// Connections: which channels are on, the workspace's reminder rules, invitation emails
// and the way to everything else in this section.
import React, { useEffect, useState } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { hourLabel, HOURS, Page, send, Status, useAction, useLoad, useOrgPath } from './shared.tsx';

interface Settings { telegram_enabled: boolean; email_enabled: boolean; quiet_start: number; quiet_end: number; daily_cap: number; digest_enabled: boolean; digest_weekday: number }
interface Overview {
  switches: { telegram: boolean; email: boolean; webhooks: boolean };
  settings: Settings;
  counts: { api_keys: number; webhooks: number; queued: number; opted_in: number; invited: number };
  samples: { kind: string; text: string }[];
}
interface Invited { available: boolean; function_on: boolean; people: { id: string; full_name: string | null; email: string }[] }
type Outcome = { member_id: string; status: 'sent' | 'skipped' | 'failed'; reason?: string };

function ChannelState({ on }: { on: boolean }) {
  const t = useAppT();
  return <span className={`company-badge ${on ? 'good' : 'warn'}`}>{on ? t('connect.hub.functionOn') : t('connect.hub.functionOff')}</span>;
}

function Telegram({ orgId, data, onSaved }: { orgId: string; data: Overview; onSaved: (settings: Settings) => void }) {
  const t = useAppT(), path = useOrgPath(orgId);
  const { busy, error, notice, run } = useAction();
  const [form, setForm] = useState(data.settings);
  useEffect(() => setForm(data.settings), [data.settings]);
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    void run(() => send<{ settings: Settings }>(path('settings'), 'PATCH', form), (result) => { onSaved(result.settings); return t('connect.hub.saved'); });
  };
  return <section aria-labelledby="connect-telegram">
    <div className="connect-row"><h2 id="connect-telegram">{t('connect.hub.telegram')}</h2><ChannelState on={data.switches.telegram}/></div>
    <p>{t('connect.hub.telegramLead', { count: data.counts.opted_in })}</p>
    <Status error={error} notice={notice}/>
    <form onSubmit={save} className="connect-stack">
      <label className="check"><input type="checkbox" checked={form.telegram_enabled} onChange={(event) => setForm({ ...form, telegram_enabled: event.target.checked })}/>{t('connect.hub.telegramSwitch')}</label>
      <div className="connect-grid">
        <label>{t('connect.hub.quietStart')}<select value={form.quiet_start} onChange={(event) => setForm({ ...form, quiet_start: Number(event.target.value) })}>{HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}</select></label>
        <label>{t('connect.hub.quietEnd')}<select value={form.quiet_end} onChange={(event) => setForm({ ...form, quiet_end: Number(event.target.value) })}>{HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}</select></label>
        <label>{t('connect.hub.cap')}<input type="number" min={1} max={20} value={form.daily_cap} onChange={(event) => setForm({ ...form, daily_cap: Number(event.target.value) })}/></label>
      </div>
      <h3 className="connect-h3">{t('connect.hub.digest')}</h3>
      <p className="hint">{t('connect.hub.digestLead')}</p>
      <label className="check"><input type="checkbox" checked={form.digest_enabled} onChange={(event) => setForm({ ...form, digest_enabled: event.target.checked })}/>{t('connect.hub.digestSwitch')}</label>
      <div className="connect-grid">
        <label>{t('connect.hub.digestDay')}<select value={form.digest_weekday} disabled={!form.digest_enabled} onChange={(event) => setForm({ ...form, digest_weekday: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((day) => <option key={day} value={day}>{t(`connect.weekday.${day}` as AppKey)}</option>)}</select></label>
      </div>
      <div className="company-actions"><button disabled={busy}>{t('connect.hub.save')}</button></div>
    </form>
    <h3 className="connect-h3">{t('connect.hub.samples')}</h3>
    <p className="hint">{t('connect.hub.samplesLead')}</p>
    <ul className="connect-samples">{data.samples.map((sample) => <li key={sample.kind}>{sample.text}</li>)}</ul>
  </section>;
}

function Email({ orgId, data, onSaved }: { orgId: string; data: Overview; onSaved: (settings: Settings) => void }) {
  const t = useAppT(), path = useOrgPath(orgId);
  const { busy, error, notice, run } = useAction();
  const { data: invited, error: loadError, reload } = useLoad<Invited>(path('email/invited'));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string, on: boolean) => setPicked((current) => {
    const next = new Set(current);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const flip = (enabled: boolean) => void run(() => send<{ settings: Settings }>(path('settings'), 'PATCH', { email_enabled: enabled }), (result) => { onSaved(result.settings); void reload(); });
  const dispatch = () => void run(() => send<{ results: Outcome[]; sent: number }>(path('email/invites'), 'POST', { member_ids: [...picked].slice(0, 50) }), (result) => {
    setPicked(new Set());
    void reload();
    return t('connect.hub.emailResult', { sent: result.sent, other: result.results.length - result.sent });
  });
  return <section aria-labelledby="connect-email">
    <div className="connect-row"><h2 id="connect-email">{t('connect.hub.email')}</h2><ChannelState on={data.switches.email}/></div>
    <p>{t('connect.hub.emailLead')}</p>
    <Status error={error || loadError} notice={notice}/>
    <label className="check"><input type="checkbox" checked={data.settings.email_enabled} disabled={busy} onChange={(event) => flip(event.target.checked)}/>{t('connect.hub.emailSwitch')}</label>
    {invited?.available && (invited.people.length ? <div className="connect-stack">
      <fieldset>
        <legend>{t('connect.hub.emailPick')}</legend>
        <label className="check"><input type="checkbox" checked={picked.size === invited.people.length} onChange={(event) => setPicked(event.target.checked ? new Set(invited.people.map((row) => row.id)) : new Set())}/>{t('connect.hub.emailAll')}</label>
        {invited.people.map((row) => <label className="check" key={row.id}><input type="checkbox" checked={picked.has(row.id)} onChange={(event) => toggle(row.id, event.target.checked)}/>{row.full_name ?? row.email} <span className="connect-muted">{row.email}</span></label>)}
      </fieldset>
      <p className="hint">{t('connect.hub.emailNote')}</p>
      <div className="company-actions"><button type="button" disabled={busy || !picked.size} onClick={dispatch}>{t('connect.hub.emailSend', { count: picked.size })}</button></div>
    </div> : <p className="hint">{t('connect.hub.emailNobody')}</p>)}
  </section>;
}

export function HubPage() {
  const t = useAppT(), { locale } = useI18n();
  const { org } = useWorkspace();
  const path = useOrgPath(org.id);
  const { data, setData, error } = useLoad<Overview>(`${path('overview')}?locale=${locale}`);
  const base = `/w/${org.id}/connect`;
  return <Page title={t('connect.hub.title')} lead={t('connect.hub.lead')}>
    {error && <p className="error" role="alert">{error}</p>}
    {!data ? !error && <p role="status">{t('app.loading')}</p> : <>
      <Telegram orgId={org.id} data={data} onSaved={(settings) => setData({ ...data, settings })}/>
      <Email orgId={org.id} data={data} onSaved={(settings) => setData({ ...data, settings })}/>
      <section aria-labelledby="connect-more">
        <h2 id="connect-more">{t('connect.hub.more')}</h2>
        <div className="connect-cards">
          <Link to={`${base}/import`}><strong>{t('connect.nav.import')}</strong><span>{t('connect.hub.importCard')}</span></Link>
          <Link to={`${base}/api`}><strong>{t('connect.nav.api')}</strong><span>{t('connect.hub.apiKeys', { count: data.counts.api_keys })}</span></Link>
          <Link to={`${base}/webhooks`}><strong>{t('connect.nav.webhooks')}</strong><span>{t('connect.hub.webhooks', { count: data.counts.webhooks })}</span></Link>
          <Link to={`${base}/brand`}><strong>{t('connect.nav.brand')}</strong><span>{t('connect.hub.brandCard')}</span></Link>
          <Link to={`${base}/privacy`}><strong>{t('connect.nav.privacy')}</strong><span>{t('connect.hub.privacyCard')}</span></Link>
          <Link to={`${base}/audit`}><strong>{t('connect.nav.audit')}</strong><span>{t('connect.hub.auditCard')}</span></Link>
        </div>
      </section>
    </>}
  </Page>;
}
