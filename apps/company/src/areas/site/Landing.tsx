// Placeholder landing page; the "gtm" workstream replaces it.
import React from 'react';
import { useAppT } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';

export function Landing() {
  const t = useAppT();
  return <main className="signin" id="workspace-main">
    <div className="brand">Schood <span>{t('app.name')}</span></div>
    <h1>{t('app.title')}</h1>
    <p><Link className="button-link" to="/w">{t('header.signIn')}</Link></p>
  </main>;
}
