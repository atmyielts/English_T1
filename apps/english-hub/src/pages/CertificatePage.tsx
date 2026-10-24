import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { CertificateSheet, CertificateShare } from '../components/CertificateSheet';
import { useI18n, useT } from '../i18n';
import {
  formatCode,
  getCertificates,
  issueCertificate,
  revokeCertificate,
  sameMoment,
  type OwnCertificate,
} from '../lib/certificate';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, LevelBadge, Loading, PageHeader, Panel, Tag } from '../ui/kit';

/** The name the learner signed up with, as a default they can change. */
const sessionName = (meta: Record<string, unknown> | undefined): string => {
  const full = typeof meta?.full_name === 'string' ? meta.full_name.trim() : '';
  if (full) return full;
  return typeof meta?.first_name === 'string' ? meta.first_name.trim() : '';
};

const Revoke = ({ certificate, onDone }: { certificate: OwnCertificate; onDone: () => void }) => {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await revokeCertificate(certificate.code);
      onDone();
    } catch (cause) {
      setError(cause);
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <div className="en-actions">
        <button type="button" className="is-link" onClick={() => setConfirming(true)}>{t('certificate.revoke.cta')}</button>
      </div>
    );
  }
  return (
    <div className="en-stack" role="group" aria-label={t('certificate.revoke.cta')}>
      <p className="hint">{t('certificate.revoke.confirm')}</p>
      {error ? <ErrorState error={error} /> : null}
      <div className="en-actions">
        <button type="button" disabled={busy} onClick={() => void revoke()}>
          {busy ? t('certificate.revoke.busy') : t('certificate.revoke.yes')}
        </button>
        <button type="button" className="quiet" disabled={busy} onClick={() => setConfirming(false)}>{t('certificate.revoke.no')}</button>
      </div>
    </div>
  );
};

/** /certificate — create, share and withdraw the learner's level certificate. */
export const CertificatePage = () => {
  const t = useT();
  const { date } = useI18n();
  const { session } = useEnglish();
  const resource = useResource((signal) => getCertificates(signal), []);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issueError, setIssueError] = useState<unknown>(null);
  const [revokedNotice, setRevokedNotice] = useState(false);

  const data = resource.data;
  useEffect(() => {
    if (!data || nameTouched) return;
    setName(data.default_name ?? sessionName(session?.user.user_metadata as Record<string, unknown> | undefined));
  }, [data, nameTouched, session]);

  const latest = data?.latest;
  const current = latest?.status === 'ok'
    ? data?.certificates.find((entry) => !entry.revoked_at && sameMoment(entry.measured_at, latest.measured_at)) ?? null
    : null;
  const others = (data?.certificates ?? []).filter((entry) => entry !== current);
  const nameOk = name.trim().length >= 2;

  const issue = async (event: FormEvent) => {
    event.preventDefault();
    if (!nameOk) return;
    setBusy(true);
    setIssueError(null);
    setRevokedNotice(false);
    try {
      await issueCertificate(name.trim());
      resource.reload();
    } catch (cause) {
      setIssueError(cause);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="en-stack">
      <PageHeader
        eyebrow={t('certificate.page.eyebrow')}
        title={t('certificate.page.title')}
        lead={t('certificate.page.lead')}
        back={{ to: '/progress', label: t('nav.progress') }}
      />

      {resource.error && !data ? <ErrorState error={resource.error} onRetry={resource.reload} /> : null}
      {resource.loading && !data ? <Panel><Loading lines={5} /></Panel> : null}
      {revokedNotice ? <p className="en-notice" role="status">{t('certificate.revoked')}</p> : null}

      {data && latest?.status === 'none' ? (
        <Panel>
          <EmptyState
            title={t('certificate.none.title')}
            body={t('certificate.none.body')}
            action={<Link className="en-button" to="/check">{t('certificate.none.cta')}</Link>}
          />
        </Panel>
      ) : null}

      {data && latest?.status === 'self_assessed' ? (
        <Panel>
          <EmptyState
            title={t('certificate.self.title')}
            body={t('certificate.self.body')}
            action={<Link className="en-button" to="/check">{t('certificate.self.cta')}</Link>}
          />
        </Panel>
      ) : null}

      {data && latest?.status === 'ok' && !current ? (
        <Panel title={t('certificate.create.title')} tone="lime">
          <div className="en-row">
            <LevelBadge level={latest.overall} />
            <p style={{ margin: 0 }}>
              {t('certificate.create.body', {
                method: t(`certificate.measuredBy.${latest.measured_by}`),
                date: date(latest.measured_at, { dateStyle: 'long' }),
              })}
            </p>
          </div>
          <form onSubmit={(event) => void issue(event)}>
            <div className="en-stack" style={{ gap: '0.35rem' }}>
              <label htmlFor="en-cert-name">{t('certificate.create.nameLabel')}</label>
              <input
                id="en-cert-name"
                value={name}
                maxLength={60}
                autoComplete="name"
                aria-describedby="en-cert-name-hint"
                aria-invalid={nameTouched && !nameOk ? true : undefined}
                onChange={(event) => { setName(event.target.value); setNameTouched(true); }}
              />
              <p id="en-cert-name-hint" className="hint">
                {nameTouched && !nameOk ? t('certificate.create.nameTooShort') : t('certificate.create.nameHint')}
              </p>
            </div>
            {issueError ? <ErrorState error={issueError} /> : null}
            <div className="en-actions">
              <button type="submit" className="is-large" disabled={busy || !nameOk}>
                {busy ? t('certificate.create.busy') : t('certificate.create.cta')}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      {current ? (
        <>
          <CertificateSheet certificate={current} />
          <Panel title={t('certificate.share.title')}>
            <CertificateShare certificate={current} />
            <Revoke certificate={current} onDone={() => { setRevokedNotice(true); resource.reload(); }} />
          </Panel>
        </>
      ) : null}

      {others.length ? (
        <Panel title={t('certificate.older.title')}>
          <div style={{ overflowX: 'auto' }}>
            <table className="en-table">
              <thead>
                <tr>
                  <th>{t('certificate.older.level')}</th>
                  <th>{t('certificate.older.date')}</th>
                  <th>{t('certificate.older.status')}</th>
                  <th><span className="visually-hidden">{t('certificate.older.open')}</span></th>
                </tr>
              </thead>
              <tbody>
                {others.map((entry) => (
                  <tr key={entry.code}>
                    <td><LevelBadge level={entry.overall} muted={Boolean(entry.revoked_at)} /></td>
                    <td>{date(entry.issued_at, { dateStyle: 'medium' })}</td>
                    <td><Tag>{entry.revoked_at ? t('certificate.older.revoked') : t('certificate.older.active')}</Tag></td>
                    <td>
                      {entry.revoked_at ? null : (
                        <Link to={`/c/${formatCode(entry.code)}`} aria-label={`${t('certificate.older.open')} ${formatCode(entry.code)}`}>
                          {t('certificate.older.open')} →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
};
