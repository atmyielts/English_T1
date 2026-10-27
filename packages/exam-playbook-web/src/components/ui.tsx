import { ArrowRight, Check, Crown, ExternalLink, Lock, LogIn } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useT, type Key } from '../i18n';
import { ApiError } from '../lib/api';
import { usePlaybook } from '../lib/context';
import { pricingUrl, signInUrl } from '../lib/platformUrls';
import { Shell } from './TopNav';

export const Skeleton = ({ lines = 3, title = true, label }: { lines?: number; title?: boolean; label?: string }) => {
  const t = useT();
  return (
    <section className="panel skeleton-panel" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">{label ?? t('common.loading')}</span>
      {title ? <span className="skeleton-line title" /> : null}
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={`skeleton-line ${i % 3 === 2 ? 'medium' : 'long'}`} />
      ))}
    </section>
  );
};

export const SkeletonGrid = ({ cards = 4 }: { cards?: number }) => (
  <div className="feature-grid" aria-busy="true">
    {Array.from({ length: cards }, (_, i) => (
      <div key={i} className="feature-card skeleton-card">
        <span className="skeleton-line title" />
        <span className="skeleton-line long" />
        <span className="skeleton-line medium" />
      </div>
    ))}
  </div>
);

/** Maps API errors to friendly copy. Never shows server internals. */
export const useErrorText = () => {
  const t = useT();
  return (error: unknown): string => {
    if (error instanceof ApiError) {
      const known: Record<string, Key> = {
        auth_required: 'error.authRequired',
        premium_required: 'error.premiumRequired',
        not_found: 'error.notFound',
        invalid_field: 'error.invalidField',
        template_empty: 'error.templateEmpty',
        no_diagnostic: 'error.noDiagnostic',
        coach_limit: 'error.coachLimit',
        plan_full: 'error.planFull',
        notes_full: 'error.notesFull',
        not_removable: 'error.notRemovable',
        forbidden: 'error.forbidden',
        duplicate: 'error.duplicate',
      };
      const key = known[error.code];
      if (key) return t(key);
      if (error.status === 429) return t('error.rateLimited');
    }
    if (error instanceof DOMException && error.name === 'AbortError') return t('error.timeout');
    return t('error.generic');
  };
};

export const ErrorPanel = ({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: ReactNode }) => {
  const t = useT();
  return (
    <section className="panel" aria-label={t('common.problem')}>
      <p className="alert error" role="alert">{message}</p>
      <div className="hero-actions">
        {onRetry ? <button type="button" className="btn solid" onClick={onRetry}>{t('common.retry')}</button> : null}
        {children}
      </div>
    </section>
  );
};

export const EmptyState = ({ title, body, children }: { title: string; body?: string; children?: ReactNode }) => (
  <section className="panel empty-panel">
    <h2>{title}</h2>
    {body ? <p>{body}</p> : null}
    {children ? <div className="hero-actions">{children}</div> : null}
  </section>
);

export const PremiumFeatures = () => {
  const t = useT();
  return (
    <ul className="check-list">
      {(['premium.feature.guides', 'premium.feature.diagnostic', 'premium.feature.plans', 'premium.feature.notes', 'premium.feature.coach'] as Key[]).map((key) => (
        <li key={key}><Check size={16} aria-hidden="true" /> {t(key)}</li>
      ))}
    </ul>
  );
};

/** Upgrade path shown wherever a Premium feature is used without access. */
export const PremiumGate = ({ title, body, compact, source }: { title?: string; body?: string; compact?: boolean; source: string }) => {
  const t = useT();
  const { config, access, api } = usePlaybook();
  const onUpgrade = () => void api.track({ event_name: 'upgrade_click', metadata: { source } }, access.token);
  if (access.status === 'anonymous') {
    return (
      <section className={`panel gate-panel${compact ? ' compact' : ''}`}>
        <span className="chip premium"><Lock size={13} aria-hidden="true" /> {t('premium.badge')}</span>
        <h2>{title ?? t('gate.signInTitle')}</h2>
        <p>{body ?? t('gate.signInBody', { service: config.serviceName })}</p>
        <div className="hero-actions">
          <a className="btn solid" href={signInUrl(config.productSlug)}><LogIn size={16} aria-hidden="true" /> {t('nav.signIn')}</a>
          <a className="btn ghost" href={pricingUrl(config.productSlug)} onClick={onUpgrade}>{t('gate.seePricing')}</a>
        </div>
      </section>
    );
  }
  return (
    <section className={`panel gate-panel${compact ? ' compact' : ''}`}>
      <span className="chip premium"><Crown size={13} aria-hidden="true" /> {t('premium.badge')}</span>
      <h2>{title ?? t('gate.premiumTitle', { service: config.serviceName })}</h2>
      <p>{body ?? t('gate.premiumBody', { bundle: config.completeBundleName })}</p>
      {compact ? null : <PremiumFeatures />}
      <div className="hero-actions">
        <a className="btn solid" href={pricingUrl(config.productSlug)} onClick={onUpgrade}>
          {t('gate.upgrade')} <ArrowRight size={16} aria-hidden="true" />
        </a>
        <Link className="btn ghost" to="/modules">{t('gate.browseFree')}</Link>
      </div>
    </section>
  );
};

/** Practice link with an honest access label: included, or which product unlocks it. */
export const PracticeAccess = ({ source, compact }: { source: string; compact?: boolean }) => {
  const t = useT();
  const { config, access, api } = usePlaybook();
  const hasIt = access.hasProduct(config.practice.productId);
  const product = t(config.practice.nameKey as Key);
  const href = `${config.practice.url}${config.practice.kind === 'product' ? '/dashboard' : ''}?source=playbook`;
  const label = config.practice.kind === 'product' ? t('practice.cta') : t('practice.ctaSimulator', { exam: config.examName });
  return (
    <div className={`practice-access${compact ? ' compact' : ''}`}>
      <a
        className="btn ghost"
        href={href}
        onClick={() => void api.track({ event_name: 'practice_click', metadata: { source, has_access: hasIt } }, access.token)}
      >
        {label} <ExternalLink size={15} aria-hidden="true" />
      </a>
      {access.status === 'loading' ? null : hasIt ? (
        <span className="access-note ok"><Check size={14} aria-hidden="true" /> {t('practice.included', { product })}</span>
      ) : (
        <span className="access-note">
          {t('practice.requires', { product, bundle: config.completeBundleName })}{' '}
          <a href={pricingUrl(config.practice.productSlug)} onClick={() => void api.track({ event_name: 'upgrade_click', metadata: { source: `${source}:practice` } }, access.token)}>
            {t('practice.seePricing')}
          </a>
        </span>
      )}
    </div>
  );
};

/** Route guard for Premium pages: shows a sign-in or upgrade card instead of bouncing. */
export const RequirePremium = () => {
  const t = useT();
  const { access } = usePlaybook();
  if (access.status === 'loading') {
    return <Shell><Skeleton lines={4} label={t('common.checkingAccess')} /></Shell>;
  }
  if (!access.premium) {
    return <Shell narrow><PremiumGate source="route" /></Shell>;
  }
  return <Outlet />;
};

export const RequireAdmin = () => {
  const t = useT();
  const { access, config } = usePlaybook();
  if (access.status === 'loading') return <Shell><Skeleton lines={4} label={t('common.checkingAccess')} /></Shell>;
  if (access.status === 'anonymous') {
    return (
      <Shell narrow>
        <EmptyState title={t('admin.signInTitle')} body={t('admin.signInBody')}>
          <a className="btn solid" href={signInUrl(config.productSlug)}>{t('nav.signIn')}</a>
        </EmptyState>
      </Shell>
    );
  }
  if (!access.isAdmin) {
    return (
      <Shell narrow>
        <EmptyState title={t('admin.noAccessTitle')} body={t('admin.noAccessBody')}>
          <Link className="btn ghost" to="/">{t('common.backHome')}</Link>
        </EmptyState>
      </Shell>
    );
  }
  return <Outlet />;
};

export const formatDate = (value: unknown, locale: string): string => {
  const text = String(value ?? '');
  if (!text) return '';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  if (Number.isNaN(date.getTime())) return '';
  const intl = locale === 'uz' ? 'uz-Latn-UZ' : locale === 'ru' ? 'ru-RU' : 'en-GB';
  return new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
};
