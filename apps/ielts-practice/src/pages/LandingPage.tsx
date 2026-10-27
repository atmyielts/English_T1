import { Link } from 'react-router-dom';
import { ClipboardList, Sparkles, Target, TrendingUp } from 'lucide-react';
import { LocaleSwitcher } from '../../../../packages/service-i18n/src/i18n.tsx';
import { PracticeTopNav, type PracticeNavAction } from '../components/PracticeTopNav';
import { IELTS_PRACTICE_PRODUCT_SLUG } from '../lib/constants';
import { buildPlatformUrl, platformBase } from '../lib/platformUrls';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/useAccess';
import { sectionLabel, useAppT, type AppKey } from '../i18n';

const SCHOOD_HOME_URL = platformBase || 'https://schood.online';

const resolveDashboardReturnTo = (): string => {
  // Land signed-in learners on the guided daily session (the clear start→finish path),
  // not the dense analytics view.
  if (typeof window === 'undefined') return '/today';
  return `${window.location.origin}/today`;
};

const FULL_ROW = { gridColumn: '1 / -1' } as const;
const STATS = [1, 2, 3, 4] as const;
const STEP_ICONS = [ClipboardList, Target, Sparkles, TrendingUp];
const LABS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const FAQS = [1, 2, 3, 4] as const;
const COVERAGE = ['reading', 'listening', 'writing', 'speaking'] as const;

export const LandingPage = () => {
  const t = useAppT();
  const { status } = useAccess();
  const returnTo = resolveDashboardReturnTo();
  const authHref = buildPlatformUrl('/auth', returnTo, { mode: 'signin', product: IELTS_PRACTICE_PRODUCT_SLUG });
  const pricingHref = buildPlatformUrl('/pricing', returnTo, { product: IELTS_PRACTICE_PRODUCT_SLUG });
  const authed = status === 'authenticated';

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      window.location.reload();
    }
  };

  const actions: PracticeNavAction[] = [
    { id: 'home', label: t('land.nav.home'), href: SCHOOD_HOME_URL },
    { id: 'account', label: t('land.nav.account'), href: `${SCHOOD_HOME_URL}/account` },
    authed
      ? { id: 'today', label: t('land.nav.continue'), to: '/today' }
      : { id: 'signin', label: t('land.nav.signin'), href: authHref },
    ...(authed ? [{ id: 'signout', label: t('land.nav.signout'), onClick: () => void signOut() }] : []),
    { id: 'access', label: t('land.nav.access'), href: pricingHref, variant: 'solid' },
  ];

  return (
    <div className="practice-root">
      <PracticeTopNav
        title={t('land.title')}
        subtitle={t('land.subtitle')}
        brandHref={SCHOOD_HOME_URL}
        leadingNode={<LocaleSwitcher label={t('shell.language')} />}
        actions={actions}
      />

      <main className="landing-grid">
        <section className="hero-panel glass">
          <p className="eyebrow">{t('land.hero.eyebrow')}</p>
          <h1>{t('land.hero.title')}</h1>
          <p>{t('land.hero.lead')}</p>
          <div className="hero-actions">
            <Link to="/today" className="btn solid">{t('land.hero.start')}</Link>
            <a href={pricingHref} className="btn ghost">{t('land.hero.plans')}</a>
          </div>
        </section>

        <section className="metric-panel glass">
          {[1, 2, 3].map((n) => (
            <article key={n}>
              <h3>{t(`land.pillar${n}.title` as AppKey)}</h3>
              <p>{t(`land.pillar${n}.copy` as AppKey)}</p>
            </article>
          ))}
        </section>

        <section className="glass" style={{ ...FULL_ROW, padding: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 18, textAlign: 'center' }}>
            {STATS.map((n) => (
              <div key={n}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0e4955', lineHeight: 1 }}>{t(`land.stat${n}.value` as AppKey)}</div>
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{t(`land.stat${n}.label` as AppKey)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass" style={{ ...FULL_ROW, padding: 28 }}>
          <p className="eyebrow">{t('land.how.eyebrow')}</p>
          <h2 style={{ margin: '6px 0 18px', maxWidth: '24ch' }}>{t('land.how.title')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 16 }}>
            {STEP_ICONS.map((Icon, i) => (
              <article key={i} style={{ display: 'grid', gap: 8, alignContent: 'start', borderTop: '2px solid #0e4955', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 26, height: 26, borderRadius: 999, background: '#0e4955', color: '#fff',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700,
                    }}
                  >
                    {i + 1}
                  </span>
                  <Icon size={18} style={{ color: '#0e4955' }} aria-hidden="true" />
                </div>
                <strong style={{ fontSize: '1.02rem' }}>{t(`land.step${i + 1}.title` as AppKey)}</strong>
                <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t(`land.step${i + 1}.copy` as AppKey)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="glass" style={{ ...FULL_ROW, padding: 28 }}>
          <p className="eyebrow">{t('land.labs.eyebrow')}</p>
          <h2 style={{ margin: '6px 0 6px', maxWidth: '26ch' }}>{t('land.labs.title')}</h2>
          <p className="muted" style={{ marginTop: 0, maxWidth: '60ch' }}>{t('land.labs.lead')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 14, marginTop: 16 }}>
            {LABS.map((n) => (
              <article key={n} className="service-card glass" style={{ display: 'grid', gap: 4 }}>
                <h4 style={{ margin: 0 }}>{t(`land.lab${n}.title` as AppKey)}</h4>
                <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{t(`land.lab${n}.copy` as AppKey)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="cards-row">
          {COVERAGE.map((section) => (
            <article key={section} className={`service-card glass ${section}`}>
              <h4>{sectionLabel(t, section)}</h4>
              <p>{t(`land.cover.${section}` as AppKey)}</p>
            </article>
          ))}
        </section>

        <section className="glass" style={{ ...FULL_ROW, padding: 28 }}>
          <p className="eyebrow">{t('land.faq.eyebrow')}</p>
          <h2 style={{ margin: '6px 0 18px' }}>{t('land.faq.title')}</h2>
          <div style={{ display: 'grid', gap: 14 }}>
            {FAQS.map((n) => (
              <details key={n} style={{ borderBottom: '1px solid #e7e1d6', paddingBottom: 12 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600, listStyle: 'revert' }}>{t(`land.faq${n}.q` as AppKey)}</summary>
                <p className="muted" style={{ margin: '8px 0 0', maxWidth: '70ch' }}>{t(`land.faq${n}.a` as AppKey)}</p>
              </details>
            ))}
          </div>
        </section>

        <section
          className="glass"
          style={{
            ...FULL_ROW,
            padding: 32,
            textAlign: 'center',
            background: 'linear-gradient(135deg, #0e4955, #11363f)',
            color: '#fff',
            display: 'grid',
            gap: 14,
            justifyItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, color: '#fff', maxWidth: '24ch' }}>{t('land.cta.title')}</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.82)', maxWidth: '56ch' }}>{t('land.cta.lead')}</p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            {authed ? (
              <Link to="/today" className="btn solid">{t('land.hero.start')}</Link>
            ) : (
              <a href={authHref} className="btn solid">{t('land.cta.signin')}</a>
            )}
            <a href={pricingHref} className="btn ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
              {t('land.nav.access')}
            </a>
          </div>
        </section>
      </main>
    </div>
  );
};
