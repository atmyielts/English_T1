import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  formatRouteContextReason,
  formatRouteContextSource,
  hasEnglishRouteContext,
  type EnglishRouteContext,
} from './routeContext';

export const RouteContextRibbon = ({
  context,
  title = 'Why you are here',
  cta,
}: {
  context: EnglishRouteContext;
  title?: string;
  cta?: ReactNode;
}) => {
  if (!hasEnglishRouteContext(context)) return null;

  return (
    <section className="card route-context-ribbon">
      <div className="route-context-copy">
        <small className="route-context-kicker">{title}</small>
        <h2>{context.intent ?? 'Continue your focus path'}</h2>
        <p>
          {context.skill ? (
            <>
              Target skill: <strong>{context.skill}</strong>.
            </>
          ) : null}{' '}
          {formatRouteContextReason(context.reason) ? (
            <>
              Reason: <strong>{formatRouteContextReason(context.reason)}</strong>.
            </>
          ) : null}{' '}
          {formatRouteContextSource(context.sourceService) ? (
            <>
              Routed from <strong>{formatRouteContextSource(context.sourceService)}</strong>.
            </>
          ) : null}
        </p>
      </div>
      {cta ? <div className="route-context-actions">{cta}</div> : null}
    </section>
  );
};

export const AccessBoundaryCard = ({
  hasAccess,
  title,
  message,
  ctaHref,
}: {
  hasAccess: boolean;
  title: string;
  message: string;
  ctaHref: string;
}) => (
  <section className={'card route-preview-card' + (hasAccess ? ' unlocked' : '')}>
    <div>
      <small className="route-context-kicker">{hasAccess ? 'Live access ready' : 'Preview only'}</small>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
    {!hasAccess ? (
      <a className="ghost-btn" href={ctaHref}>
        Pricing and trial
      </a>
    ) : null}
  </section>
);

export const PageHero = ({
  eyebrow,
  title,
  copy,
  actions,
  aside,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  actions?: ReactNode;
  aside?: ReactNode;
}) => (
  <section className="card route-page-hero">
    <div className="route-page-hero-copy">
      <small className="route-context-kicker">{eyebrow}</small>
      <h1>{title}</h1>
      <p>{copy}</p>
      {actions ? <div className="route-page-hero-actions">{actions}</div> : null}
    </div>
    {aside ? <div className="route-page-hero-aside">{aside}</div> : null}
  </section>
);

export const SectionGrid = ({ children }: { children: ReactNode }) => (
  <div className="route-section-grid">{children}</div>
);

export const StatCard = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) => (
  <article className="card route-stat-card">
    <small>{label}</small>
    <strong>{value}</strong>
    <p>{hint}</p>
  </article>
);

export const EnglishSkillWorkspace = ({
  serviceName,
  serviceTagline,
  menuItems,
  serviceSwitchLinks,
  hubHref,
  platformHref,
  pricingHref,
  signInHref,
  status,
  needsAccess,
  checkingAccess,
  accessError,
  search,
  onSearchChange,
  onSignOut,
  upgradeTitle,
  upgradeCopy,
  updatesHref,
  children,
}: {
  serviceName: string;
  serviceTagline: string;
  menuItems: Array<{ label: string; href: string; active: boolean }>;
  serviceSwitchLinks: Array<{ key: string; label: string; href: string }>;
  hubHref: string;
  platformHref: string;
  pricingHref: string;
  signInHref: string;
  status: 'checking' | 'signed_in' | 'signed_out';
  needsAccess: boolean;
  checkingAccess: boolean;
  accessError: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onSignOut: () => void;
  upgradeTitle: string;
  upgradeCopy: string;
  updatesHref: string;
  children: ReactNode;
}) => (
  <div className="reading-root">
    <div className="ambient-layer" />
    <div className={`app-shell ${status === 'signed_out' ? 'signed-out' : ''}`.trim()}>
      <aside id="service-side-nav" className="left-nav">
        <Link className="brand-mark" to="/dashboard" style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left' }}>
          <span className="dot" />
          <div>
            <strong>{serviceName.toUpperCase()}</strong>
            <small>Unified auth + payment</small>
          </div>
        </Link>

        <div className="left-nav-body">
          <nav className="menu-list">
            {menuItems.map((item) => (
              <Link key={item.href} className={'menu-link ' + (item.active ? 'active' : '')} to={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>

          <section className="service-switcher">
            <div className="service-switch-head">
              <span>Switch service</span>
              <a className="muted-link" href={hubHref}>
                Hub
              </a>
            </div>
            <div className="service-switch-grid">
              {serviceSwitchLinks.map((service) => (
                <a key={service.key} className="service-switch-link" href={service.href}>
                  {service.label}
                </a>
              ))}
            </div>
          </section>

          <div className="left-footer">
            <div className="support-zone">
              <a className="menu-link muted-link" href={platformHref.replace('/workspace/student', '/contact')}>
                Support
              </a>
              <a className="menu-link muted-link" href={pricingHref}>
                Pricing and trial
              </a>
            </div>

            <div className="mobile-account-zone">
              <a className="menu-link muted-link" href={platformHref}>
                Platform
              </a>
              <a className="menu-link muted-link" href={hubHref}>
                English hub
              </a>
              {needsAccess ? (
                <a className="menu-link muted-link" href={pricingHref}>
                  Get access
                </a>
              ) : null}
              {status === 'signed_in' ? (
                <button className="menu-link muted-link" type="button" onClick={onSignOut}>
                  Sign out
                </button>
              ) : (
                <a className="menu-link muted-link" href={signInHref}>
                  Sign in
                </a>
              )}
            </div>

            <article className="upgrade-card">
              <h3>{upgradeTitle}</h3>
              <p>{upgradeCopy}</p>
              <a className="black-btn" href={pricingHref}>
                View plans
              </a>
            </article>
          </div>
        </div>
      </aside>

      <main className="main-column">
        <header className="topbar">
          <div className="topbar-title">
            <h1>Welcome back, learner</h1>
            <p>{serviceTagline}</p>
          </div>

          <div className="topbar-actions">
            <label className="search-box">
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search classes, sets, tasks..."
              />
            </label>
            <a className="icon-btn" href={platformHref}>
              Platform
            </a>
            <a className="icon-btn" href={hubHref}>
              English hub
            </a>
            {needsAccess ? (
              <a className="icon-btn" href={pricingHref}>
                Get access
              </a>
            ) : null}
            {status === 'signed_in' ? (
              <button className="icon-btn" type="button" onClick={onSignOut}>
                Sign out
              </button>
            ) : (
              <a className="icon-btn" href={signInHref}>
                Sign in
              </a>
            )}
          </div>
        </header>

        {checkingAccess ? (
          <div className="access-banner">
            <strong>Checking access...</strong>
            <span>Verifying your active plan for {serviceName}.</span>
          </div>
        ) : null}
        {needsAccess ? (
          <div className="access-banner warning">
            <strong>Plan required for full access.</strong>
            <span>You can browse the route structure, but live actions stay locked until trial or purchase.</span>
            <a className="ghost-btn" href={pricingHref}>
              Pricing and trial
            </a>
          </div>
        ) : null}
        {accessError ? <div className="access-banner warning">{accessError}</div> : null}

        {children}
      </main>
    </div>
    <a className="updates-fab" href={updatesHref}>
      Updates
    </a>
  </div>
);
