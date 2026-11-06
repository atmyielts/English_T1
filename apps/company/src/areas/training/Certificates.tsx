// Certificates of completion. /w/:org/my-certificates: the learner's own, plus anything
// already finished that has none yet. /w/:org/certificates: HR and managers see those
// of people who share their progress. /c/:code: anyone can check a code and print it.
import React, { useState, type FormEvent } from 'react';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { downloadCsv, Loading, useDate, useLoad, useLocalized, type Localized } from './lib.tsx';

interface Certificate { id: string; kind: 'track' | 'course'; ref_code: string; title: Localized; holder_name: string | null; lessons: number; score: number | null; code: string; issued_at: string; revoked_at: string | null }
interface Mine { certificates: Certificate[]; claimable: { kind: 'track' | 'course'; code: string; title: Localized; lessons: number }[] }
interface PublicCertificate { code: string; name: string | null; company: string | null; title: Localized; kind: 'track' | 'course'; lessons: number; score: number | null; date: string; revoked: boolean }

export function MyCertificates() {
  const t = useAppT(), pick = useLocalized(), when = useDate(), problem = useErrorText();
  const { org, member } = useWorkspace();
  const { data, error, reload } = useLoad<Mine>(member ? `orgs/${org.id}/my/certificates` : null);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  if (!member) return <section><h1>{t('training.cert.title')}</h1><p>{t('training.notMember')}</p></section>;
  if (!data) return <Loading error={error}/>;
  async function claim(kind: string, code: string) {
    setBusy(true); setFailure('');
    try {
      await api(`orgs/${org.id}/my/certificates`, { method: 'POST', body: { kind, code } });
      await reload();
    } catch (cause) {
      setFailure(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.cert.title')}</h1>
      <p>{t('training.cert.lead')}</p>
    </header>
    {failure && <p className="error" role="alert">{failure}</p>}
    {data.claimable.length > 0 && <section className="training-card" aria-labelledby="training-c-claim">
      <h2 id="training-c-claim">{t('training.cert.ready')}</h2>
      <ul className="training-list">
        {data.claimable.map((item) => <li key={`${item.kind}:${item.code}`}>
          <div><strong>{pick(item.title)}</strong><span>{t('training.plan.lessons', { count: item.lessons })}</span></div>
          <button type="button" disabled={busy} onClick={() => void claim(item.kind, item.code)}>{t('training.cert.claim')}<span className="visually-hidden"> {pick(item.title)}</span></button>
        </li>)}
      </ul>
    </section>}
    <section className="training-card" aria-labelledby="training-c-mine">
      <h2 id="training-c-mine">{t('training.cert.mine')}</h2>
      {data.certificates.length === 0 ? <p>{t('training.cert.none')} <Link to={`/w/${org.id}/my-path`}>{t('training.nav.myPath')}</Link></p> : <ul className="training-list">
        {data.certificates.map((item) => <li key={item.id}>
          <div>
            <strong>{pick(item.title)}</strong>
            <span>{when(item.issued_at)} · {t('training.me.certificateCode', { code: item.code })}</span>
            {item.revoked_at && <span className="company-badge bad">{t('training.cert.revoked')}</span>}
          </div>
          <Link className="button-link quiet" to={`/c/${item.code}`}>{t('training.me.certificateOpen')}<span className="visually-hidden"> {pick(item.title)}</span></Link>
        </li>)}
      </ul>}
      <p className="hint">{t('training.cert.note')}</p>
    </section>
  </div>;
}

export function CertificatesAdmin() {
  const t = useAppT(), pick = useLocalized(), when = useDate(), problem = useErrorText();
  const { org, departments } = useWorkspace();
  const { data, error, reload } = useLoad<{ can_manage: boolean; hidden: number; certificates: (Certificate & { full_name: string | null; email: string | null; department_id: string | null })[] }>(`orgs/${org.id}/certificates`);
  const [failure, setFailure] = useState('');
  if (!data) return <Loading error={error}/>;
  async function toggle(id: string, revoke: boolean) {
    if (revoke && !confirm(t('training.cert.revokeConfirm'))) return;
    setFailure('');
    try {
      await api(`orgs/${org.id}/certificates/${id}/revoke`, { method: 'POST', body: { revoke } });
      await reload();
    } catch (cause) {
      setFailure(problem(cause));
    }
  }
  return <div className="training-page">
    <header className="training-head">
      <h1>{t('training.cert.adminTitle')}</h1>
      <p>{t('training.cert.adminLead')}</p>
    </header>
    {failure && <p className="error" role="alert">{failure}</p>}
    <section className="training-card" aria-labelledby="training-c-admin">
      <h2 id="training-c-admin">{t('training.cert.issued', { count: data.certificates.length })}</h2>
      {data.certificates.length > 0 && <div className="company-actions">
        <button type="button" className="quiet" onClick={() => downloadCsv('certificates.csv', [
          [t('training.plan.col.name'), t('training.plan.col.department'), t('training.cert.col.what'), t('training.cert.col.date'), t('training.cert.col.code'), t('training.cert.lessons'), t('training.cert.score'), t('training.cert.revoked')],
          ...data.certificates.map((row) => [row.full_name ?? row.email, departments.find((entry) => entry.id === row.department_id)?.name ?? '', pick(row.title), row.issued_at.slice(0, 10), row.code, row.lessons, row.score, row.revoked_at ? row.revoked_at.slice(0, 10) : '']),
        ])}>{t('training.results.csv')}</button>
      </div>}
      {data.certificates.length === 0 ? <p>{t('training.cert.adminNone')}</p> : <div className="company-table-wrap">
        <table className="company-table">
          <caption className="visually-hidden">{t('training.cert.adminTitle')}</caption>
          <thead><tr><th scope="col">{t('training.plan.col.name')}</th><th scope="col">{t('training.plan.col.department')}</th><th scope="col">{t('training.cert.col.what')}</th><th scope="col">{t('training.cert.col.date')}</th><th scope="col">{t('training.cert.col.code')}</th>{data.can_manage && <th scope="col"><span className="visually-hidden">{t('training.cert.col.actions')}</span></th>}</tr></thead>
          <tbody>
            {data.certificates.map((row) => <tr key={row.id}>
              <td>{row.full_name ?? row.email}</td>
              <td>{departments.find((entry) => entry.id === row.department_id)?.name ?? '—'}</td>
              <td>{pick(row.title)}{row.revoked_at && <> <span className="company-badge bad">{t('training.cert.revoked')}</span></>}</td>
              <td>{when(row.issued_at)}</td>
              <td><Link to={`/c/${row.code}`}><code>{row.code}</code></Link></td>
              {data.can_manage && <td><button type="button" className="quiet" onClick={() => void toggle(row.id, !row.revoked_at)}>{row.revoked_at ? t('training.cert.restore') : t('training.cert.revoke')}<span className="visually-hidden"> {row.code}</span></button></td>}
            </tr>)}
          </tbody>
        </table>
      </div>}
      {data.hidden > 0 && <p className="hint">{t('training.cert.hidden', { count: data.hidden })}</p>}
    </section>
  </div>;
}

function Lookup() {
  const t = useAppT();
  const [code, setCode] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); if (code.trim()) navigate(`/c/${encodeURIComponent(code.trim().toUpperCase())}`); };
  return <form onSubmit={submit} className="training-c-lookup">
    <label>{t('training.cert.code')}<input value={code} maxLength={16} autoCapitalize="characters" onChange={(event) => setCode(event.target.value)}/></label>
    <button>{t('training.cert.lookup')}</button>
  </form>;
}

/** The public page behind a code. It prints as one page. */
export function CertificateCheck({ code }: { code: string }) {
  const t = useAppT(), pick = useLocalized(), when = useDate(), problem = useErrorText();
  const [data, setData] = useState<PublicCertificate | null>(null);
  const [failure, setFailure] = useState('');
  React.useEffect(() => {
    let live = true;
    setData(null); setFailure('');
    api<{ certificate: PublicCertificate }>(`public/c/${encodeURIComponent(code)}`, { auth: false })
      .then((result) => { if (live) setData(result.certificate); })
      .catch((cause) => { if (live) setFailure(problem(cause)); });
    return () => { live = false; };
  }, [code]);
  if (failure) return <section className="training-c-narrow"><h1>{t('training.cert.check')}</h1><p className="error" role="alert">{failure}</p><Lookup/></section>;
  if (!data) return <p role="status">{t('app.loading')}</p>;
  return <div className="training-c-page">
    <div className="company-actions no-print training-c-actions">
      <button type="button" onClick={() => print()}>{t('common.print')}</button>
    </div>
    <article className="training-c-sheet" aria-labelledby="training-c-title">
      <p className="training-c-brand">Schood · {t('app.name')}</p>
      <h1 id="training-c-title">{t('training.cert.sheetTitle')}</h1>
      {data.revoked
        ? <p className="training-c-state is-revoked" role="status">{t('training.cert.revokedNotice')}</p>
        : <p className="training-c-state" role="status">✓ {t('training.cert.verified')}</p>}
      <p>{t('training.cert.to')}</p>
      <p className="training-c-name">{data.name ?? '—'}</p>
      <p>{t(`training.cert.completed.${data.kind}` as AppKey, { company: data.company ?? '—' })}</p>
      <p className="training-c-title">{pick(data.title)}</p>
      <dl className="training-c-meta">
        <div><dt>{t('training.cert.lessons')}</dt><dd>{data.lessons}</dd></div>
        {data.score !== null && <div><dt>{t('training.cert.score')}</dt><dd>{data.score}%</dd></div>}
        <div><dt>{t('training.cert.col.date')}</dt><dd>{when(data.date)}</dd></div>
        <div><dt>{t('training.cert.code')}</dt><dd><code>{data.code}</code></dd></div>
        <div><dt>{t('training.cert.checkAt')}</dt><dd>{location.host}/c/{data.code}</dd></div>
      </dl>
      <p className="hint">{t('training.cert.disclaimer')}</p>
    </article>
  </div>;
}
