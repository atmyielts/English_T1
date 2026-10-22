import { useEffect, useState } from 'react';
import { postJson, request, type Row } from '../../../packages/assessment-web/src/client';
import { parseJoin } from '../../../packages/assessment-web/src/account-links';
import { errorText } from '../../../packages/assessment-web/src/i18n/errors.ts';
import { useI18n } from '../../../packages/service-i18n/src/i18n.tsx';
import { useAppT } from './i18n/index.ts';

export type PendingJoin = { id: string; code: string };
const STORE = 'schood-exam-join';

/** A join link survives sign-in and account creation on schood.online: it is
 * kept for this tab and removed from the address bar (other hash values, such
 * as a sign-in handoff, are left for the auth client). */
export function takePendingJoin(): PendingJoin | null {
  const fromLink = parseJoin(location.hash);
  if (fromLink) {
    try { sessionStorage.setItem(STORE, JSON.stringify(fromLink)); } catch { /* private mode: keep it in memory */ }
    const rest = new URLSearchParams(location.hash.replace(/^#/, ''));
    rest.delete('join');
    history.replaceState(null, '', location.pathname + location.search + (rest.toString() ? `#${rest}` : ''));
    return fromLink;
  }
  try { return JSON.parse(sessionStorage.getItem(STORE) ?? 'null'); } catch { return null; }
}
export function clearPendingJoin() {
  try { sessionStorage.removeItem(STORE); } catch { /* nothing stored */ }
}
export const joinReturnUrl = (join: PendingJoin) => `${location.origin}${location.pathname}#join=${join.id}.${join.code}`;
const openInstitution = (tenant: string) => location.assign(`${location.pathname}?tenant_id=${encodeURIComponent(tenant)}`);

/** Preview a sitting from its join link, then register with one confirmation. */
export function JoinSitting({ join, user, done }: { join: PendingJoin; user: string; done: () => void }) {
  const t = useAppT(), { date } = useI18n();
  const [preview, setPreview] = useState<Row | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setPreview(null); setError('');
    post('preview').then(value => { if (active) setPreview(value); }).catch(cause => { if (active) setError(errorText(cause, t)); });
    return () => { active = false; };
  }, [join.id, join.code, user]);
  async function post(step: 'preview' | 'accept') {
    return postJson<Row>(`candidate/join/${step}`, { link_id: join.id, code: join.code }, user);
  }
  async function accept() {
    setBusy(true); setError('');
    try {
      const result = await post('accept');
      clearPendingJoin();
      openInstitution(String(result.tenant_id));
    } catch (cause) {
      setError(errorText(cause, t));
      setBusy(false);
    }
  }
  const state = String(preview?.state ?? '');
  return <section className="join-sitting">
    <h1>{t('exam.join.title')}</h1>
    {!preview && !error && <p role="status">{t('exam.join.loading')}</p>}
    {preview && <>
      <dl>
        <dt>{t('exam.join.institution')}</dt><dd>{String(preview.institution)}</dd>
        <dt>{t('exam.join.sitting')}</dt><dd>{String(preview.title)}</dd>
        <dt>{t('exam.join.when')}</dt><dd>{t('exam.join.range', { opens: date(String(preview.opens_at)), closes: date(String(preview.closes_at)) })}</dd>
      </dl>
      {state === 'open' && <><p>{t('exam.join.confirm')}</p><button disabled={busy} onClick={() => void accept()}>{t('exam.join.submit')}</button></>}
      {state === 'joined' && <><p>{t('exam.join.already')}</p><button onClick={() => { clearPendingJoin(); openInstitution(String(preview.tenant_id)); }}>{t('exam.join.open')}</button></>}
      {state === 'closed' && <p role="alert">{t('exam.join.closed')}</p>}
      {state === 'revoked' && <p role="alert">{t('exam.join.revoked')}</p>}
      {state === 'full' && <p role="alert">{t('exam.join.full')}</p>}
    </>}
    {error && <p role="alert" className="error">{error}</p>}
    {(error || ['closed', 'revoked', 'full'].includes(state)) && <button className="quiet" onClick={() => { clearPendingJoin(); done(); }}>{t('exam.join.dismiss')}</button>}
  </section>;
}

/** Without an institution link, open the person's institution (or let them choose). */
export function InstitutionChooser({ user }: { user: string }) {
  const t = useAppT();
  const [rows, setRows] = useState<Row[] | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    request<Row[]>('candidate/institutions', undefined, undefined, undefined, undefined, user)
      .then(value => { if (!active) return; if (value.length === 1) openInstitution(String(value[0].tenant_id)); else setRows(value); })
      .catch(cause => { if (active) setError(errorText(cause, t)); });
    return () => { active = false; };
  }, [user]);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!rows) return <p role="status">{t('exam.institutions.loading')}</p>;
  if (!rows.length) return <section><h1>{t('exam.institutions.emptyTitle')}</h1><p>{t('exam.institutions.empty')}</p></section>;
  return <section><h1>{t('exam.institutions.title')}</h1><ul className="records">{rows.map(row => <li key={String(row.tenant_id)}><strong>{String(row.name)}</strong><button onClick={() => openInstitution(String(row.tenant_id))}>{t('exam.institutions.open')}</button></li>)}</ul></section>;
}
