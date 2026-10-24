import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { CertificateSheet, CertificateShare } from '../components/CertificateSheet';
import { useI18n, useT } from '../i18n';
import { ApiError } from '../lib/api';
import { getPublicCertificate } from '../lib/certificate';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, Loading, Panel } from '../ui/kit';

/** /c/:code — anyone with the link can check a certificate, signed in or not. */
export const PublicCertificatePage = () => {
  const t = useT();
  const { date } = useI18n();
  const { session } = useEnglish();
  const { code = '' } = useParams();
  const resource = useResource((signal) => getPublicCertificate(code, signal), [code]);
  const certificate = resource.error ? null : resource.data?.certificate ?? null;
  const notFound = resource.error instanceof ApiError && resource.error.status === 404;

  useEffect(() => {
    if (!certificate) return;
    const previous = document.title;
    document.title = `${certificate.display_name} · ${certificate.overall} · ${t('certificate.brand')}`;
    return () => { document.title = previous; };
  }, [certificate, t]);

  return (
    <div className="en-stack" style={{ width: '100%' }}>
      {resource.loading && !certificate ? <Panel><Loading lines={5} label={t('certificate.public.loading')} /></Panel> : null}

      {notFound ? (
        <Panel>
          <EmptyState
            title={t('certificate.public.notFound.title')}
            body={t('certificate.public.notFound.body')}
            action={<Link className="en-button" to={session ? '/today' : '/'}>{t('certificate.public.cta')}</Link>}
          />
        </Panel>
      ) : resource.error ? (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      ) : null}

      {certificate ? (
        <>
          <section className="en-panel en-tone-lime">
            <p className="eyebrow">{t('certificate.public.eyebrow')}</p>
            <div className="en-cert-verified">
              <span className="en-cert-verified-mark" aria-hidden="true">✓</span>
              <h1 style={{ margin: 0, fontSize: 'clamp(1.4rem, 3.4vw, 2rem)' }}>{t('certificate.public.verified')}</h1>
            </div>
            <p>{t('certificate.public.verifiedBody', { date: date(certificate.issued_at, { dateStyle: 'long' }) })}</p>
          </section>
          <CertificateSheet certificate={certificate} />
          <Panel>
            <CertificateShare certificate={certificate} telegram={false} />
            {session ? null : (
              <div className="en-actions">
                <Link className="en-button-quiet" to="/">{t('certificate.public.cta')}</Link>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
};
