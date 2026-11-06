// /v/:code — anyone can check a certificate code: name, company, levels and date
// (no contact details). The page prints as a one-page certificate.
import React, { useState, type FormEvent } from 'react';
import type { Level, Skill } from '../../../../../packages/company-core/src/mod.ts';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { navigate } from '../../router.tsx';
import { LevelBadge, SkillBars, useFormat, useLoad } from './ui.tsx';

interface Certificate {
  code: string; name: string | null; company: string; title: string; kind: 'hiring' | 'placement' | 'progress';
  overall_level: Level | null; overall_score: number | null; skills: Partial<Record<Skill, { level: Level; score: number } | null>>;
  transcript_based: boolean; date: string | null;
}

export function CertificatePage({ code }: { code: string }) {
  const t = useAppT(), format = useFormat();
  const { data, error } = useLoad(() => api<{ certificate: Certificate }>(`public/v/${encodeURIComponent(code)}`, { auth: false }), [code]);
  if (error) return <section className="hiring-narrow"><h1>{t('hiring.cert.check')}</h1><p className="error" role="alert">{error}</p><Lookup/></section>;
  if (!data) return <p role="status">{t('app.loading')}</p>;
  const certificate = data.certificate;
  const skills = Object.keys(certificate.skills) as Skill[];
  return <div className="hiring-certificate-page">
    <div className="company-actions no-print hiring-cert-actions">
      <button type="button" onClick={() => print()}>{t('common.print')}</button>
    </div>
    <article className="hiring-certificate" aria-labelledby="certificate-title">
      <p className="hiring-cert-brand">Schood · {t('app.name')}</p>
      <h1 id="certificate-title">{t('hiring.cert.title')}</h1>
      <p className="hiring-cert-verified" role="status">✓ {t('hiring.cert.verified')}</p>
      <p>{t('hiring.cert.to')}</p>
      <p className="hiring-cert-name">{certificate.name ?? '—'}</p>
      <p>{t(`hiring.cert.took.${certificate.kind}` as AppKey, { title: certificate.title, company: certificate.company })}</p>
      <p className="hiring-cert-level"><LevelBadge level={certificate.overall_level}/></p>
      <SkillBars skills={skills} results={certificate.skills}/>
      <dl className="hiring-cert-meta">
        <div><dt>{t('hiring.cert.date')}</dt><dd>{format.date(certificate.date)}</dd></div>
        <div><dt>{t('hiring.cert.code')}</dt><dd><code>{certificate.code}</code></dd></div>
        <div><dt>{t('hiring.cert.checkAt')}</dt><dd>{location.host}/v/{certificate.code}</dd></div>
      </dl>
      <p className="hint">{t('hiring.report.estimateNote')}{certificate.transcript_based ? ` ${t('hiring.cert.transcript')}` : ''}</p>
    </article>
  </div>;
}

function Lookup() {
  const t = useAppT();
  const [code, setCode] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); if (code.trim()) navigate(`/v/${code.trim().toUpperCase()}`); };
  return <form onSubmit={submit} className="hiring-lookup">
    <label>{t('hiring.cert.code')}<input value={code} maxLength={12} autoCapitalize="characters" onChange={(event) => setCode(event.target.value)}/></label>
    <button>{t('hiring.cert.lookup')}</button>
  </form>;
}
