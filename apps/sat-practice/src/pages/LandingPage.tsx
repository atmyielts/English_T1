import { ArrowRight, Brain, NotebookTabs, Sparkles, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LocaleSwitcher } from '../../../../packages/service-i18n/src/i18n.tsx';
import { PublicExamHeader } from '../../../../packages/service-design/src/PublicExamHeader';
import { PLATFORM_URL, SAT_PLAYBOOK_URL, SAT_SIMULATOR_URL } from '../lib/constants';
import { useAccess } from '../lib/useAccess';
import { useAppT, type AppKey } from '../i18n';

const FEATURES: Array<{ icon: typeof Brain; key: 'f1' | 'f2' | 'f3' | 'f4' }> = [
  { icon: Brain, key: 'f1' }, { icon: Timer, key: 'f2' }, { icon: NotebookTabs, key: 'f3' }, { icon: Sparkles, key: 'f4' },
];

export const LandingPage = () => {
  const t = useAppT();
  const { status } = useAccess();
  return <div className="landing-page">
    <PublicExamHeader tone="sat"
      labels={{ sections: t('nav.label'), menu: t('nav.openMenu'), more: t('nav.more') }}
      brand={<Link to="/"><img src="/schood-logo.png" alt="" />{t('app.name')}</Link>}
      primary={<>
        <Link to="/short-sets">{t('shortSets.title')}</Link>
        <Link to="/modules">{t('landing.f2.title')}</Link>
        <Link to="/bank">{t('nav.bank')}</Link>
      </>}
      secondary={<>
        <a href={SAT_SIMULATOR_URL}>{t('landing.mock')}</a>
        <a href={SAT_PLAYBOOK_URL}>{t('nav.playbook')}</a>
        <a href={PLATFORM_URL}>{t('nav.home')}</a>
        {status === 'authenticated' ? <a href={`${PLATFORM_URL}/account`}>{t('nav.account')}</a> : null}
      </>}
      locale={<LocaleSwitcher label={t('nav.language')} />}
      account={<Link to="/dashboard">{t(status === 'unauthenticated' ? 'nav.signIn' : 'landing.open')}</Link>}
    />
    <main className="sat-landing-content">
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
        <div className="sat-landing-actions">
          <Link to="/short-sets" className="sat-landing-action"><Sparkles size={20} aria-hidden="true" /><strong>{t('shortSets.title')}</strong><ArrowRight size={17} aria-hidden="true" /></Link>
          <Link to="/modules" className="sat-landing-action"><Timer size={20} aria-hidden="true" /><strong>{t('landing.f2.title')}</strong><ArrowRight size={17} aria-hidden="true" /></Link>
          <Link to="/notebook" className="sat-landing-action"><NotebookTabs size={20} aria-hidden="true" /><strong>{t('nav.notebook')}</strong><ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
      </section>
      <section className="feature-grid" aria-label={t('landing.features')}>
        {FEATURES.map(({ icon: Icon, key }) => <article className="feature-card" key={key}>
          <Icon size={22} aria-hidden="true" />
          <h2>{t(`landing.${key}.title` as AppKey)}</h2>
          <p>{t(`landing.${key}.copy` as AppKey)}</p>
        </article>)}
      </section>
    </main>
  </div>;
};
