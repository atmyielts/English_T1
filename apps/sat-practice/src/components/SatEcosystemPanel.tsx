import { ArrowUpRight } from 'lucide-react';
import { SAT_PLAYBOOK_URL, SAT_SIMULATOR_URL } from '../lib/constants';
import { useAppT } from '../i18n';

export const SatEcosystemPanel = () => {
  const t = useAppT();
  return (
    <section className="panel ecosystem-panel">
      <div>
        <p className="eyebrow">{t('ecosystem.eyebrow')}</p>
        <h2>{t('ecosystem.title')}</h2>
        <p>{t('ecosystem.body')}</p>
      </div>
      <div className="row-actions">
        <a className="btn ghost" href={new URL('/dashboard', SAT_SIMULATOR_URL).toString()}>{t('ecosystem.simulator')}<ArrowUpRight size={17} aria-hidden="true" /></a>
        <a className="btn ghost" href={SAT_PLAYBOOK_URL}>{t('ecosystem.playbook')}<ArrowUpRight size={17} aria-hidden="true" /></a>
      </div>
    </section>
  );
};
