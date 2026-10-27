import { ArrowRight, Brain, NotebookTabs, Sparkles, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LocaleSwitcher } from '../../../../packages/service-i18n/src/i18n.tsx';
import { PLATFORM_URL, SAT_SIMULATOR_URL } from '../lib/constants';
import { useAppT, type AppKey } from '../i18n';

const FEATURES: Array<{ icon: typeof Brain; key: 'f1' | 'f2' | 'f3' | 'f4' }> = [
  { icon: Brain, key: 'f1' }, { icon: Timer, key: 'f2' }, { icon: NotebookTabs, key: 'f3' }, { icon: Sparkles, key: 'f4' },
];

export const LandingPage = () => {
  const t = useAppT();
  return <main className="landing-page">
    <header className="landing-nav">
      <img src="/schood-logo.png" alt="Schood" />
      <strong>{t('app.name')}</strong>
      <a className="btn ghost compact" href={PLATFORM_URL}>{t('nav.home')}</a>
      <LocaleSwitcher label={t('nav.language')} />
      <Link to="/dashboard" className="btn ghost">{t('landing.open')}</Link>
    </header>
    <section className="landing-hero">
      <div>
        <p className="eyebrow">{t('landing.eyebrow')}</p>
        <h1>{t('landing.title')}</h1>
        <p>{t('landing.lead')}</p>
        <div className="hero-actions">
          <Link to="/dashboard" className="btn solid">{t('landing.start')}<ArrowRight size={17} aria-hidden="true" /></Link>
          <a className="btn ghost" href={SAT_SIMULATOR_URL}>{t('landing.mock')}</a>
        </div>
      </div>
    </section>
    <section className="feature-grid" aria-label={t('landing.features')}>
      {FEATURES.map(({ icon: Icon, key }) => <article className="feature-card" key={key}>
        <Icon size={22} aria-hidden="true" />
        <h2>{t(`landing.${key}.title` as AppKey)}</h2>
        <p>{t(`landing.${key}.copy` as AppKey)}</p>
      </article>)}
    </section>
  </main>;
};
