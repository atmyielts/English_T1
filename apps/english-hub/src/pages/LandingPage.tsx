import { useEffect } from 'react';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { englishJourney } from '../lib/journeyAnalytics';
import { SKILLS } from '../lib/skills';
import { SkillDot } from '../ui/kit';

const FEATURES = ['roleplay', 'mock', 'l1', 'telegram', 'app', 'cert'] as const;
const PLANS = ['free', 'one', 'all'] as const;

/** Signed-out home. Describes what learners actually do; shows no invented results. */
export const LandingPage = () => {
  const t = useT();
  const { signInHref, pricingHref } = useEnglish();

  useEffect(() => {
    englishJourney.track('english_hub_viewed', { accessToken: null, once: true });
  }, []);

  return (
    <>
      <section className="en-hero">
        <div>
          <p className="eyebrow">{t('landing.eyebrow')}</p>
          <h1>{t('landing.title')}</h1>
          <p className="en-lead">{t('landing.lead')}</p>
          <div className="en-actions" style={{ marginTop: '1.5rem' }}>
            <a className="en-button is-large is-lime" href={signInHref('/today')} onClick={() => englishJourney.track('signin_started', { target: 'english_plan' })}>
              {t('landing.cta')}
            </a>
            <a className="en-button-quiet is-large" href={pricingHref()}>{t('landing.pricing')}</a>
          </div>
          <p className="hint" style={{ marginTop: '.75rem' }}>{t('landing.free')}</p>
        </div>
        <div className="en-hero-card" aria-hidden="true">
          <p className="eyebrow">{t('landing.sample.eyebrow')}</p>
          {(['reading', 'grammar', 'speaking'] as const).map((skill, index) => (
            <div key={skill} className="en-item">
              <span className={`en-check ${index === 0 ? 'is-done' : ''}`}>{index === 0 ? '✓' : ''}</span>
              <span className="en-item-main">
                <strong>{t(`landing.sample.${skill}`)}</strong>
                <span className="en-row" style={{ gap: '.4rem' }}><SkillDot skill={skill} />{t(`skill.${skill}`)}</span>
              </span>
              <span className="en-item-meta"><span className="en-tag">{t('common.minutesShort', { count: [6, 8, 5][index]! })}</span></span>
            </div>
          ))}
        </div>
      </section>

      <section className="en-panel">
        <h2>{t('landing.how.title')}</h2>
        <div className="en-how">
          <div><h3>{t('landing.how.1.title')}</h3><p>{t('landing.how.1.body')}</p></div>
          <div><h3>{t('landing.how.2.title')}</h3><p>{t('landing.how.2.body')}</p></div>
          <div><h3>{t('landing.how.3.title')}</h3><p>{t('landing.how.3.body')}</p></div>
        </div>
      </section>

      <div className="en-stack">
        <h2 style={{ margin: 0 }}>{t('landing.skills.title')}</h2>
        <div className="en-grid-cards">
          {SKILLS.map((skill) => (
            <a key={skill.key} className="en-skill-card" href={signInHref(skill.path)} onClick={() => englishJourney.track('english_skill_selected', { target: skill.key })}>
              <h3><SkillDot skill={skill.key} />{t(`skill.${skill.key}`)}</h3>
              <p>{t(`skill.${skill.key}.what`)}</p>
            </a>
          ))}
        </div>
      </div>

      <section className="en-panel en-showcase">
        <h2>{t('show.features.title')}</h2>
        <p className="en-lead">{t('show.features.lead')}</p>
        <div className="en-grid-cards">
          {FEATURES.map((key) => (
            <div key={key} className="en-show-card">
              <h3>{t(`show.f.${key}.title`)}</h3>
              <p>{t(`show.f.${key}.body`)}</p>
            </div>
          ))}
        </div>
        <div className="en-actions">
          <a className="en-button-quiet" href="https://t.me/schoodonlinebot" target="_blank" rel="noopener noreferrer">{t('show.telegram.cta')}</a>
        </div>
      </section>

      <div className="en-stack">
        <h2 style={{ margin: 0 }}>{t('show.plans.title')}</h2>
        <div className="en-grid-cards">
          {PLANS.map((key) => (
            <div key={key} className={`en-skill-card en-plan ${key === 'all' ? 'is-best' : ''}`.trim()}>
              <h3>{t(`show.plan.${key}.name`)}</h3>
              <strong className="en-plan-price">{t(`show.plan.${key}.price`)}</strong>
              <p>{t(`show.plan.${key}.body`)}</p>
              {key === 'free' ? (
                <a className="en-button is-lime" href={signInHref('/today')}>{t('landing.cta')}</a>
              ) : (
                <a className={key === 'all' ? 'en-button' : 'en-button-quiet'} href={pricingHref()}>{t('show.plan.cta')}</a>
              )}
            </div>
          ))}
        </div>
      </div>

      <section className="en-panel en-final">
        <div>
          <h2>{t('show.final.title')}</h2>
          <p>{t('show.final.body')}</p>
        </div>
        <a className="en-button is-large is-lime" href={signInHref('/today')} onClick={() => englishJourney.track('signin_started', { target: 'english_plan_final' })}>
          {t('landing.cta')}
        </a>
      </section>
    </>
  );
};
