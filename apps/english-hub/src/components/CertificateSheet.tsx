import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n, useT } from '../i18n';
import { CERTIFICATE_SKILLS, certificateUrl, formatCode, type Certificate } from '../lib/certificate';
import '../certificate.css';

const Sheet = ({ certificate, hidden = false }: { certificate: Certificate; hidden?: boolean }) => {
  const t = useT();
  const { date } = useI18n();
  const code = formatCode(certificate.code);
  const url = certificateUrl(certificate.code);
  const skills = CERTIFICATE_SKILLS.filter((skill) => certificate.per_skill[skill]);
  return (
    <article className="en-cert" aria-label={hidden ? undefined : t('certificate.title')} aria-hidden={hidden || undefined}>
      <div className="en-cert-frame">
        <header className="en-cert-head">
          <img src="/schood-logo.png" alt="" width={52} height={52} />
          <span className="en-cert-brand">
            <strong>{t('certificate.brand')}</strong>
            <span>english.schood.online</span>
          </span>
          <span className="en-cert-number">№ {code}</span>
        </header>

        <h2 className="en-cert-title">{t('certificate.title')}</h2>

        <div className="en-cert-holder">
          <span className="en-cert-label">{t('certificate.recordsThat')}</span>
          <strong className="en-cert-name">{certificate.display_name}</strong>
        </div>

        <div className="en-cert-level">
          <span className="en-cert-label">{t('certificate.measuredLevel')}</span>
          <div className="en-cert-level-row">
            <strong className="en-cert-cefr">{certificate.overall}</strong>
            <span className="en-cert-level-copy">
              <strong>{t(`level.${certificate.overall}.name`)}</strong>
              <span>{t(`certificate.can.${certificate.overall}`)}</span>
            </span>
          </div>
        </div>

        {skills.length ? (
          <div className="en-cert-section">
            <span className="en-cert-label">{t('certificate.bySkill')}</span>
            <dl className="en-cert-skills">
              {skills.map((skill) => (
                <div key={skill}>
                  <dt>{t(`skill.${skill}`)}</dt>
                  <dd>{certificate.per_skill[skill]}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        <dl className="en-cert-facts">
          <div>
            <dt>{t('certificate.howMeasured')}</dt>
            <dd>{t(`certificate.measuredBy.${certificate.measured_by}`)} · {date(certificate.measured_at, { dateStyle: 'long' })}</dd>
          </div>
          <div>
            <dt>{t('certificate.activities')}</dt>
            <dd>{t('certificate.activitiesValue', { count: certificate.activities_count })}</dd>
          </div>
          <div>
            <dt>{t('certificate.issued')}</dt>
            <dd>{date(certificate.issued_at, { dateStyle: 'long' })}</dd>
          </div>
        </dl>

        <footer className="en-cert-foot">
          <p className="en-cert-verify">
            <span>{t('certificate.code')}: <strong>{code}</strong></span>
            <span>{t('certificate.verifyAt')} <span className="en-cert-url">{url}</span></span>
          </p>
          <p className="en-cert-disclaimer">{t('certificate.disclaimer')}</p>
        </footer>
      </div>
    </article>
  );
};

/**
 * The certificate as shown on screen, plus a print-only copy placed directly
 * in <body>, so "Download PDF" (window.print) gives one clean A4 landscape page
 * without the app's header, navigation or footer.
 */
export const CertificateSheet = ({ certificate }: { certificate: Certificate }) => (
  <>
    <Sheet certificate={certificate} />
    {typeof document === 'undefined'
      ? null
      : createPortal(<div className="en-cert-print"><Sheet certificate={certificate} hidden /></div>, document.body)}
  </>
);

/** Download PDF, Telegram, copy link and the device's own share sheet. */
export const CertificateShare = ({ certificate, telegram = true }: { certificate: Certificate; telegram?: boolean }) => {
  const t = useT();
  const url = certificateUrl(certificate.code);
  const text = t('certificate.share.text', { level: certificate.overall });
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const field = useRef<HTMLInputElement>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopy('copied');
    } catch {
      field.current?.select();
      setCopy('failed');
    }
  };

  const shareNative = async () => {
    try {
      await navigator.share({ title: t('certificate.title'), text, url });
    } catch {
      // Dismissed by the learner, or not allowed here; nothing to report.
    }
  };

  return (
    <div className="en-stack">
      <div className="en-stack" style={{ gap: '0.35rem' }}>
        <label htmlFor="en-cert-link">{t('certificate.share.link')}</label>
        <input id="en-cert-link" ref={field} readOnly value={url} onFocus={(event) => event.currentTarget.select()} />
      </div>
      <div className="en-actions">
        <button type="button" onClick={() => window.print()}>{t('certificate.share.pdf')}</button>
        {telegram ? (
          <a
            className="en-button-quiet"
            href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('certificate.share.telegram')}
          </a>
        ) : null}
        <button type="button" className="quiet" onClick={() => void copyLink()}>{t('certificate.share.copy')}</button>
        {canShare ? <button type="button" className="quiet" onClick={() => void shareNative()}>{t('certificate.share.native')}</button> : null}
      </div>
      <p className="hint" role="status" aria-live="polite">
        {copy === 'copied' ? t('certificate.share.copied') : copy === 'failed' ? t('certificate.share.copyFailed') : t('certificate.share.pdfHint')}
      </p>
    </div>
  );
};
