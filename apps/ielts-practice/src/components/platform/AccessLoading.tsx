import React from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { useAppT } from '../../i18n';

export const AccessLoading: React.FC<{ label: string; detail?: string }> = ({ label, detail }) => {
  const t = useAppT();
  return (
  <div className="access-loading-shell">
    <section className="access-loading-card" aria-live="polite" aria-busy="true">
      <span className="access-loading-mark" aria-hidden="true">
        <ShieldCheck size={22} strokeWidth={2.4} />
        <LoaderCircle size={18} strokeWidth={2.4} className="spin" />
      </span>
      <div className="access-loading-copy">
        <p className="eyebrow">{t('shell.brand')}</p>
        <h1>{label}</h1>
        <p>{detail ?? t('access.matching')}</p>
      </div>
    </section>
  </div>
  );
};
