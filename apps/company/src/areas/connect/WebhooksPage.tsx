// Webhook addresses, their one-time secrets, a test button and the delivery log.
import React, { useState } from 'react';
import { CopyButton } from '../people/ui.tsx';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { useWorkspace } from '../../session.tsx';
import { Page, send, Status, useAction, useDateText, useLoad, useOrgPath } from './shared.tsx';

interface Webhook { id: string; url: string; events: string[]; description: string | null; active: boolean; disabled_reason: string | null; failure_count: number; last_success_at: string | null; last_failure_at: string | null; created_at: string }
interface Delivery { id: string; event: string; status: 'queued' | 'delivering' | 'sent' | 'dead'; attempts: number; response_status: number | null; error: string | null; is_test: boolean; created_at: string }
const eventKey = (event: string) => `connect.event.${event}` as AppKey;

const VERIFY = `import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((part) => part.split('=')));
  const expected = createHmac('sha256', secret).update(\`\${parts.t}.\${rawBody}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300;
  return fresh && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}`;

function Log({ orgId, hook }: { orgId: string; hook: Webhook }) {
  const t = useAppT(), { when } = useDateText(), path = useOrgPath(orgId);
  const { data, error: loadError, reload } = useLoad<{ deliveries: Delivery[] }>(`${path(`webhooks/${hook.id}/deliveries`)}?limit=30`);
  const { busy, error, run } = useAction();
  if (loadError) return <p className="error" role="alert">{loadError}</p>;
  if (!data) return <p role="status">{t('app.loading')}</p>;
  if (!data.deliveries.length) return <p className="connect-empty">{t('connect.hooks.logEmpty')}</p>;
  return <>
    <Status error={error}/>
    <div className="company-table-wrap"><table className="company-table">
      <thead><tr><th>{t('connect.hooks.logWhen')}</th><th>{t('connect.hooks.logEvent')}</th><th>{t('connect.hooks.logStatus')}</th><th>{t('connect.hooks.logTries')}</th><th>{t('connect.hooks.logResult')}</th><th><span className="visually-hidden">{t('connect.hooks.retry')}</span></th></tr></thead>
      <tbody>{data.deliveries.map((row) => <tr key={row.id}>
        <td>{when(row.created_at)}</td>
        <td>{t(eventKey(row.event))}</td>
        <td><span className={`company-badge ${row.status === 'sent' ? 'good' : row.status === 'dead' ? 'bad' : 'warn'}`}>{t(`connect.hooks.status.${row.status}` as AppKey)}</span></td>
        <td>{row.attempts}</td>
        <td><code>{row.response_status ?? row.error ?? '—'}</code></td>
        <td>{row.status === 'dead' && !row.is_test && <button type="button" className="quiet" disabled={busy} onClick={() => void run(() => send(path(`webhooks/${hook.id}/deliveries/${row.id}/retry`), 'POST'), () => { void reload(); })}>{t('connect.hooks.retry')}</button>}</td>
      </tr>)}</tbody>
    </table></div>
  </>;
}

function Hook({ orgId, hook, reload, onSecret }: { orgId: string; hook: Webhook; reload: () => Promise<void>; onSecret: (secret: string) => void }) {
  const t = useAppT(), { when } = useDateText(), path = useOrgPath(orgId);
  const { busy, error, notice, run } = useAction();
  const [log, setLog] = useState(false);
  const [sample, setSample] = useState('');
  const base = path(`webhooks/${hook.id}`);
  const test = () => void run(() => send<{ sent: boolean; reason?: string; response_status?: number | null; error?: string | null; sample?: { body: string } }>(`${base}/test`, 'POST'), (result) => {
    setSample('');
    if (result.reason === 'webhooks_off') {
      try { setSample(JSON.stringify(JSON.parse(result.sample!.body), null, 2)); } catch { setSample(result.sample?.body ?? ''); }
      return t('connect.hooks.testOff');
    }
    return result.sent ? t('connect.hooks.testSent', { status: result.response_status ?? '' }) : t('connect.hooks.testFailed', { error: result.error ?? result.reason ?? '' });
  });
  return <li className="connect-hook">
    <div className="connect-row">
      <code className="connect-url">{hook.url}</code>
      <span className={`company-badge ${hook.active ? 'good' : 'warn'}`}>{hook.disabled_reason ? t('connect.hooks.disabled') : hook.active ? t('connect.hooks.active') : t('connect.hooks.paused')}</span>
    </div>
    {hook.description && <p className="hint">{hook.description}</p>}
    <p className="connect-tags">{hook.events.map((event) => <span className="company-badge" key={event}>{t(eventKey(event))}</span>)}</p>
    {(hook.last_success_at || hook.last_failure_at) && <p className="hint">
      {hook.last_success_at && t('connect.hooks.lastOk', { when: when(hook.last_success_at) })}{hook.last_success_at && hook.last_failure_at && ' · '}{hook.last_failure_at && t('connect.hooks.lastFail', { when: when(hook.last_failure_at) })}
    </p>}
    <Status error={error} notice={notice}/>
    {sample && <pre className="connect-code" tabIndex={0}>{sample}</pre>}
    <div className="company-actions">
      <button type="button" className="quiet" disabled={busy} onClick={test}>{t('connect.hooks.test')}</button>
      <button type="button" className="quiet" disabled={busy} onClick={() => void run(() => send(base, 'PATCH', { active: !hook.active }), () => { void reload(); })}>{hook.active ? t('connect.hooks.pause') : t('connect.hooks.resume')}</button>
      <button type="button" className="quiet" onClick={() => setLog(!log)} aria-expanded={log}>{log ? t('connect.hooks.hideLog') : t('connect.hooks.log')}</button>
      <button type="button" className="quiet" disabled={busy} onClick={() => { if (confirm(t('connect.hooks.rotateConfirm'))) void run(() => send<{ secret: string }>(`${base}/rotate`, 'POST'), (result) => { onSecret(result.secret); }); }}>{t('connect.hooks.rotate')}</button>
      <button type="button" className="quiet connect-danger" disabled={busy} onClick={() => { if (confirm(t('connect.hooks.removeConfirm'))) void run(() => send(base, 'DELETE'), () => { void reload(); }); }}>{t('connect.hooks.remove')}</button>
    </div>
    {log && <Log orgId={orgId} hook={hook}/>}
  </li>;
}

export function WebhooksPage() {
  const t = useAppT();
  const { org } = useWorkspace();
  const path = useOrgPath(org.id);
  const { data, error: loadError, reload } = useLoad<{ webhooks: Webhook[]; events: string[]; function_on: boolean }>(path('webhooks'));
  const { busy, error, notice, run } = useAction();
  const [url, setUrl] = useState(''), [description, setDescription] = useState('');
  const [events, setEvents] = useState<Set<string>>(new Set(['test.graded', 'candidate.finished']));
  const [secret, setSecret] = useState('');
  const create = (event: React.FormEvent) => {
    event.preventDefault();
    void run(() => send<{ secret: string }>(path('webhooks'), 'POST', { url, events: [...events], description }), (result) => {
      setSecret(result.secret); setUrl(''); setDescription('');
      void reload();
    });
  };
  return <Page title={t('connect.hooks.title')} lead={t('connect.hooks.lead')}>
    {loadError && <p className="error" role="alert">{loadError}</p>}
    {data && !data.function_on && <p className="connect-warn" role="status">{t('connect.hooks.off')}</p>}
    {secret && <div className="connect-once" role="status">
      <p><strong>{t('connect.hooks.secret')}</strong></p>
      <code>{secret}</code>
      <div className="company-actions"><CopyButton value={secret} className=""/><button type="button" className="quiet" onClick={() => setSecret('')}>{t('common.close')}</button></div>
    </div>}
    {data && <section aria-labelledby="connect-hooks-list">
      <h2 id="connect-hooks-list">{t('connect.hooks.title')}</h2>
      {data.webhooks.length ? <ul className="connect-hooks">{data.webhooks.map((hook) => <Hook key={hook.id} orgId={org.id} hook={hook} reload={reload} onSecret={setSecret}/>)}</ul> : <p className="connect-empty">{t('connect.hooks.none')}</p>}
    </section>}
    {data && <section aria-labelledby="connect-hooks-add">
      <h2 id="connect-hooks-add">{t('connect.hooks.add')}</h2>
      <Status error={error} notice={notice}/>
      <form onSubmit={create} className="connect-stack">
        <label>{t('connect.hooks.url')}<input type="url" required maxLength={500} inputMode="url" placeholder="https://" value={url} onChange={(event) => setUrl(event.target.value)}/></label>
        <label>{t('connect.hooks.description')}<input maxLength={200} value={description} onChange={(event) => setDescription(event.target.value)}/></label>
        <fieldset>
          <legend>{t('connect.hooks.events')}</legend>
          {data.events.map((name) => <label className="check" key={name}>
            <input type="checkbox" checked={events.has(name)} onChange={(event) => setEvents((current) => {
              const next = new Set(current);
              if (event.target.checked) next.add(name); else next.delete(name);
              return next;
            })}/>{t(eventKey(name))} <code className="connect-muted">{name}</code>
          </label>)}
        </fieldset>
        <div className="company-actions"><button disabled={busy || !events.size}>{t('connect.hooks.create')}</button></div>
      </form>
    </section>}
    <section aria-labelledby="connect-verify">
      <h2 id="connect-verify">{t('connect.hooks.verify')}</h2>
      <p>{t('connect.hooks.verifyLead')}</p>
      <pre className="connect-code" tabIndex={0}>{VERIFY}</pre>
    </section>
  </Page>;
}
