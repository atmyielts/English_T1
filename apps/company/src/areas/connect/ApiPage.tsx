// API keys and the interactive reference. A key typed into "Try it" stays in this page's
// memory for that request and goes nowhere else.
import React, { useMemo, useState } from 'react';
import { CopyButton } from '../people/ui.tsx';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { useWorkspace } from '../../session.tsx';
import { Page, send, Status, useAction, useDateText, useLoad, useOrgPath } from './shared.tsx';

const baseUrl = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''}/functions/v1/company/api/v1`;

interface Key { id: string; name: string; key_prefix: string; scope: 'read' | 'write'; expires_at: string | null; last_used_at: string | null; revoked_at: string | null; created_at: string }
interface Endpoint { id: string; method: 'GET' | 'POST'; path: string; label: AppKey; query?: string; body?: string; idHint?: boolean }

const ENDPOINTS: Endpoint[] = [
  { id: 'workspace', method: 'GET', path: 'workspace', label: 'connect.endpoint.workspace' },
  { id: 'people', method: 'GET', path: 'people', label: 'connect.endpoint.people', query: 'status=active&limit=50' },
  { id: 'person', method: 'GET', path: 'people/{id}', label: 'connect.endpoint.person', idHint: true },
  { id: 'create', method: 'POST', path: 'people', label: 'connect.endpoint.createPerson', body: '{\n  "full_name": "Malika Yusupova",\n  "email": "malika@example.com",\n  "job_role": "sales"\n}' },
  { id: 'invite', method: 'POST', path: 'people/{id}/invite', label: 'connect.endpoint.invite', idHint: true, body: '{}' },
  { id: 'tests', method: 'GET', path: 'tests', label: 'connect.endpoint.tests', query: 'kind=hiring' },
  { id: 'results', method: 'GET', path: 'tests/{id}/results', label: 'connect.endpoint.results', idHint: true },
  { id: 'candidates', method: 'GET', path: 'candidates', label: 'connect.endpoint.candidates', query: 'status=graded' },
  { id: 'levels', method: 'GET', path: 'levels', label: 'connect.endpoint.levels' },
  { id: 'activity', method: 'GET', path: 'activity/summary', label: 'connect.endpoint.activity', query: 'from=2026-11-01&to=2026-11-30' },
];

const curlOf = (endpoint: Endpoint, id: string, query: string, body: string) => {
  const path = endpoint.path.replace('{id}', id || '<id>');
  const url = `${baseUrl}/${path}${endpoint.method === 'GET' && query ? `?${query}` : ''}`;
  const lines = [`curl${endpoint.method === 'POST' ? ' -X POST' : ''} '${url}' \\`, `  -H 'Authorization: Bearer <API_KEY>'`];
  if (endpoint.method === 'POST') { lines[1] += ' \\'; lines.push(`  -H 'Content-Type: application/json' \\`, `  -d '${body.replace(/\s*\n\s*/g, ' ')}'`); }
  return lines.join('\n');
};

function Reference() {
  const t = useAppT();
  const [chosen, setChosen] = useState('people');
  const endpoint = useMemo(() => ENDPOINTS.find((entry) => entry.id === chosen)!, [chosen]);
  const [key, setKey] = useState('');
  const [id, setId] = useState('');
  const [query, setQuery] = useState(endpoint.query ?? '');
  const [body, setBody] = useState(endpoint.body ?? '');
  const [result, setResult] = useState<{ status: number; text: string } | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const pick = (next: string) => {
    const entry = ENDPOINTS.find((row) => row.id === next)!;
    setChosen(next); setQuery(entry.query ?? ''); setBody(entry.body ?? ''); setResult(null); setProblem('');
  };
  async function go(event: React.FormEvent) {
    event.preventDefault();
    setProblem(''); setResult(null);
    if (endpoint.method === 'POST') {
      try { JSON.parse(body || '{}'); } catch { setProblem(t('connect.api.tryBadJson')); return; }
    }
    setBusy(true);
    try {
      const path = endpoint.path.replace('{id}', encodeURIComponent(id.trim()));
      const response = await fetch(`${baseUrl}/${path}${endpoint.method === 'GET' && query ? `?${query}` : ''}`, {
        method: endpoint.method,
        headers: { Authorization: `Bearer ${key.trim()}`, 'Content-Type': 'application/json' },
        ...(endpoint.method === 'POST' ? { body } : {}),
      });
      const text = await response.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* shown as it came */ }
      setResult({ status: response.status, text: pretty.slice(0, 20_000) });
    } catch {
      setProblem(t('error.network'));
    } finally {
      setBusy(false);
    }
  }
  return <section aria-labelledby="connect-docs">
    <h2 id="connect-docs">{t('connect.api.docs')}</h2>
    <p>{t('connect.api.docsLead')}</p>
    <p className="hint">{t('connect.api.privacy')}</p>
    <p className="connect-base"><strong>{t('connect.api.base')}:</strong> <code>{baseUrl}</code> <CopyButton value={baseUrl}/></p>
    <div className="connect-endpoints" role="radiogroup" aria-label={t('connect.api.docs')}>
      {ENDPOINTS.map((entry) => <button key={entry.id} type="button" role="radio" aria-checked={entry.id === chosen} className={entry.id === chosen ? 'connect-endpoint on' : 'connect-endpoint'} onClick={() => pick(entry.id)}>
        <span className={`connect-method ${entry.method.toLowerCase()}`}>{entry.method}</span><code>/{entry.path}</code><small>{t(entry.label)}</small>
      </button>)}
    </div>
    <h3 className="connect-h3">{t('connect.api.curl')}</h3>
    <pre className="connect-code" tabIndex={0}>{curlOf(endpoint, id, query, body)}</pre>
    <div className="company-actions"><CopyButton value={curlOf(endpoint, id, query, body)}/></div>
    <h3 className="connect-h3">{t('connect.api.try')}</h3>
    <form onSubmit={go} className="connect-stack" autoComplete="off">
      <label>{t('connect.api.tryKey')}<input type="password" required value={key} autoComplete="off" onChange={(event) => setKey(event.target.value)}/><span className="hint">{t('connect.api.tryKeyHint')}</span></label>
      {endpoint.idHint && <label>{t('connect.api.tryId')}<input required value={id} onChange={(event) => setId(event.target.value)}/></label>}
      {endpoint.method === 'GET' && endpoint.query !== undefined && <label>{t('connect.api.tryQuery')}<input value={query} onChange={(event) => setQuery(event.target.value)}/></label>}
      {endpoint.method === 'POST' && <>
        <label>{t('connect.api.tryBody')}<textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)}/></label>
        <p className="connect-warn">{t('connect.api.tryWarn')}</p>
      </>}
      <div className="company-actions"><button disabled={busy}>{t('connect.api.trySend')}</button></div>
    </form>
    {problem && <p className="error" role="alert">{problem}</p>}
    {result && <div role="status">
      <p><span className={`company-badge ${result.status < 300 ? 'good' : 'bad'}`}>{t('connect.api.tryStatus', { status: result.status })}</span></p>
      <pre className="connect-code" tabIndex={0}>{result.text}</pre>
    </div>}
  </section>;
}

function Keys({ orgId }: { orgId: string }) {
  const t = useAppT(), { when } = useDateText(), path = useOrgPath(orgId);
  const { data, error: loadError, reload } = useLoad<{ keys: Key[]; per_minute: number }>(path('api-keys'));
  const { busy, error, notice, run } = useAction();
  const [form, setForm] = useState({ name: '', scope: 'read', expires_days: '' });
  const [secret, setSecret] = useState('');
  const create = (event: React.FormEvent) => {
    event.preventDefault();
    void run(() => send<{ secret: string }>(path('api-keys'), 'POST', { name: form.name, scope: form.scope, expires_days: form.expires_days === '' ? null : Number(form.expires_days) }), (result) => {
      setSecret(result.secret);
      setForm({ name: '', scope: 'read', expires_days: '' });
      void reload();
    });
  };
  const state = (key: Key) => key.revoked_at ? 'revoked' : key.expires_at && Date.parse(key.expires_at) <= Date.now() ? 'expired' : 'active';
  return <section aria-labelledby="connect-keys">
    <h2 id="connect-keys">{t('connect.api.keys')}</h2>
    <p>{t('connect.api.keysLead', { limit: data?.per_minute ?? 120 })}</p>
    <Status error={error || loadError} notice={notice}/>
    {secret && <div className="connect-once" role="status">
      <p><strong>{t('connect.api.created')}</strong></p>
      <code>{secret}</code>
      <div className="company-actions"><CopyButton value={secret} className=""/><button type="button" className="quiet" onClick={() => setSecret('')}>{t('common.close')}</button></div>
    </div>}
    <form onSubmit={create} className="connect-grid connect-form">
      <label>{t('connect.api.name')}<input required maxLength={80} placeholder={t('connect.api.namePlaceholder')} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/></label>
      <label>{t('connect.api.scope')}<select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value })}><option value="read">{t('connect.api.scope.read')}</option><option value="write">{t('connect.api.scope.write')}</option></select></label>
      <label>{t('connect.api.expires')}<input type="number" min={1} max={3650} value={form.expires_days} onChange={(event) => setForm({ ...form, expires_days: event.target.value })}/><span className="hint">{t('connect.api.expiresHint')}</span></label>
      <div className="company-actions"><button disabled={busy}>{t('connect.api.create')}</button></div>
    </form>
    {data && (data.keys.length ? <div className="company-table-wrap"><table className="company-table">
      <thead><tr><th>{t('connect.api.name')}</th><th>{t('connect.api.prefix')}</th><th>{t('connect.api.scope')}</th><th>{t('connect.api.lastUsed')}</th><th>{t('connect.api.state')}</th><th><span className="visually-hidden">{t('connect.api.revoke')}</span></th></tr></thead>
      <tbody>{data.keys.map((key) => <tr key={key.id}>
        <td>{key.name}</td>
        <td><code>{key.key_prefix}…</code></td>
        <td>{t(`connect.api.scope.${key.scope}` as AppKey)}</td>
        <td>{key.last_used_at ? when(key.last_used_at) : t('connect.api.never')}</td>
        <td><span className={`company-badge ${state(key) === 'active' ? 'good' : 'bad'}`}>{t(`connect.api.${state(key)}` as AppKey)}</span></td>
        <td>{state(key) === 'active' && <button type="button" className="quiet connect-danger" disabled={busy} onClick={() => { if (confirm(t('connect.api.revokeConfirm', { name: key.name }))) void run(() => send(path(`api-keys/${key.id}/revoke`), 'POST'), () => { void reload(); }); }}>{t('connect.api.revoke')}</button>}</td>
      </tr>)}</tbody>
    </table></div> : <p className="connect-empty">{t('connect.api.noKeys')}</p>)}
  </section>;
}

export function ApiPage() {
  const t = useAppT();
  const { org } = useWorkspace();
  return <Page title={t('connect.api.title')} lead={t('connect.api.lead')}>
    <Keys orgId={org.id}/>
    <Reference/>
  </Page>;
}
