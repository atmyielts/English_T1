import React, { useEffect, useState } from 'react';
import { BrainCog, Check, Highlighter, LockKeyhole, LogIn, MessagesSquare, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { useT } from '../i18n';
import type { PlaybookPageTeaser } from '../lib/api';
import { playbookProfileGet } from '../lib/api';
import { pricingUrl, signInUrl } from '../lib/access';
import { readPlanModules, setPlanModule } from '../lib/planModules';

export type ViewerTier = 'loading' | 'anonymous' | 'free' | 'premium';

/** Where a non-premium learner goes next: sign in first, otherwise pricing. */
export const upgradeHref = (tier: ViewerTier): string => (tier === 'anonymous' ? signInUrl() : pricingUrl());

export const PremiumBadge: React.FC = () => {
  const t = useT();
  return (
    <span className="premium-badge">
      <LockKeyhole size={12} strokeWidth={2.6} />
      {t('premium.badge')}
    </span>
  );
};

/** Shown to free / signed-out readers of a public module instead of the premium tools. */
export const PremiumFeaturesCard: React.FC<{ tier: ViewerTier }> = ({ tier }) => {
  const t = useT();
  if (tier === 'loading' || tier === 'premium') return null;
  const features = [
    { icon: Highlighter, title: t('premium.feature.highlight.title'), body: t('premium.feature.highlight.body') },
    { icon: BrainCog, title: t('premium.feature.explain.title'), body: t('premium.feature.explain.body') },
    { icon: MessagesSquare, title: t('premium.feature.coach.title'), body: t('premium.feature.coach.body') },
    { icon: ShieldCheck, title: t('premium.feature.plan.title'), body: t('premium.feature.plan.body') },
  ];
  return (
    <section className="premium-card" aria-labelledby="premium-tools-title" data-testid="premium-features">
      <div className="premium-card-head">
        <PremiumBadge />
        <h2 id="premium-tools-title">{t('premium.tools.title')}</h2>
        <p>{t('premium.tools.lead')}</p>
      </div>
      <ul className="premium-feature-list">
        {features.map(({ icon: Icon, title, body }) => (
          <li key={title}>
            <Icon size={18} />
            <div>
              <strong>{title}</strong>
              <span>{body}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="inline-actions">
        <a href={upgradeHref(tier)} className="button button-primary" data-testid="premium-upgrade">
          {tier === 'anonymous' ? <LogIn size={16} /> : <Sparkles size={16} />}
          {tier === 'anonymous' ? t('premium.signInToUnlock') : t('premium.upgrade')}
        </a>
      </div>
    </section>
  );
};

/** A premium guide the reader cannot open yet: what is inside + how to unlock it. */
export const PremiumLockedView: React.FC<{ teaser: PlaybookPageTeaser | null; tier: ViewerTier }> = ({ teaser, tier }) => {
  const t = useT();
  return (
    <section className="premium-locked" data-testid="premium-locked">
      <div className="premium-card-head">
        <PremiumBadge />
        <h2>{t('premium.locked.title')}</h2>
        <p>{t('premium.locked.lead')}</p>
      </div>
      {teaser && teaser.headings.length > 0 ? (
        <>
          <p className="eyebrow">{t('premium.locked.inside', { count: teaser.section_count })}</p>
          <ol className="premium-outline">
            {teaser.headings.map((heading) => (
              <li key={heading}>{heading}</li>
            ))}
          </ol>
        </>
      ) : null}
      <div className="inline-actions">
        <a href={upgradeHref(tier === 'premium' ? 'free' : tier)} className="button button-primary" data-testid="premium-upgrade">
          {tier === 'anonymous' ? <LogIn size={16} /> : <Sparkles size={16} />}
          {tier === 'anonymous' ? t('premium.signInToUnlock') : t('premium.upgrade')}
        </a>
        {tier === 'anonymous' ? (
          <a href={pricingUrl()} className="button button-secondary">
            {t('premium.seePlans')}
          </a>
        ) : null}
      </div>
    </section>
  );
};

/** "Use in my plan": pins the module to the learner's plan (premium); otherwise explains how to unlock it. */
export const UseInPlanButton: React.FC<{ slug: string; tier: ViewerTier; accessToken: string | null }> = ({
  slug,
  tier,
  accessToken,
}) => {
  const t = useT();
  const [inPlan, setInPlan] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tier !== 'premium' || !accessToken) return;
    let active = true;
    playbookProfileGet(accessToken)
      .then(({ profile }) => {
        if (active) setInPlan(readPlanModules(profile).includes(slug));
      })
      .catch(() => {
        if (active) setInPlan(false);
      });
    return () => {
      active = false;
    };
  }, [tier, accessToken, slug]);

  if (tier === 'loading') return null;
  if (tier !== 'premium' || !accessToken) {
    return (
      <a href={upgradeHref(tier)} className="button button-primary" data-testid="use-in-plan">
        <ShieldCheck size={17} />
        {t('content.useInPlan')}
        <PremiumBadge />
      </a>
    );
  }

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const modules = await setPlanModule(accessToken, slug, !inPlan);
      setInPlan(modules.includes(slug));
    } catch {
      setError(t('content.useInPlan.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="use-in-plan">
      <button
        type="button"
        className={inPlan ? 'button button-secondary' : 'button button-primary'}
        onClick={() => void toggle()}
        disabled={busy || inPlan === null}
        aria-pressed={Boolean(inPlan)}
        data-testid="use-in-plan"
      >
        {inPlan ? <Check size={17} /> : <Plus size={17} />}
        {busy ? t('common.saving') : inPlan ? t('content.inPlan') : t('content.useInPlan')}
      </button>
      {error ? <span className="inline-error" role="alert">{error}</span> : null}
    </span>
  );
};

export const PageSkeleton: React.FC = () => {
  const t = useT();
  return (
    <div className="page-skeleton" aria-busy="true" aria-live="polite" data-testid="page-skeleton">
      <span className="visually-hidden">{t('common.loading')}</span>
      {[0, 1, 2].map((index) => (
        <div key={index} className="content-card">
          <span className="p2-skeleton p2-skeleton-line medium" />
          <span className="p2-skeleton p2-skeleton-line long" />
          <span className="p2-skeleton p2-skeleton-line long" />
          <span className="p2-skeleton p2-skeleton-line short" />
        </div>
      ))}
    </div>
  );
};
