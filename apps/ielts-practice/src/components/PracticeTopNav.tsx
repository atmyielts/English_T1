import React, { useId, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export type PracticeNavAction = {
  id: string;
  label: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  variant?: 'ghost' | 'solid';
  disabled?: boolean;
  ariaLabel?: string;
};

type PracticeTopNavProps = {
  title: string;
  subtitle: string;
  brandTo?: string;
  brandHref?: string;
  compact?: boolean;
  actions?: PracticeNavAction[];
};

export const PracticeTopNav: React.FC<PracticeTopNavProps> = ({
  title,
  subtitle,
  brandTo = '/dashboard',
  brandHref,
  compact = false,
  actions = [],
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileNavId = useId();
  const closeMobileNav = () => setMobileOpen(false);

  const renderAction = (action: PracticeNavAction, mobile = false) => {
    const className = `${mobile ? 'mobile-nav-action' : 'btn'} ${action.variant ?? 'ghost'}`;
    const content = (
      <>
        <span>{action.label}</span>
        {mobile ? <ArrowRight size={15} strokeWidth={2.4} /> : null}
      </>
    );

    if (action.to) {
      return (
        <Link key={action.id} to={action.to} className={className} onClick={mobile ? closeMobileNav : undefined} aria-label={action.ariaLabel}>
          {content}
        </Link>
      );
    }

    if (action.href) {
      return (
        <a key={action.id} href={action.href} className={className} onClick={mobile ? closeMobileNav : undefined} aria-label={action.ariaLabel}>
          {content}
        </a>
      );
    }

    return (
      <button
        key={action.id}
        className={className}
        type="button"
        onClick={() => {
          if (mobile) closeMobileNav();
          action.onClick?.();
        }}
        disabled={action.disabled}
        aria-label={action.ariaLabel}
      >
        {content}
      </button>
    );
  };

  const brandContent = (
    <>
      <img src="/schood-logo.png" alt="Schood" />
      <div>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </>
  );

  return (
    <header className={`top-nav glass${compact ? ' compact' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="top-nav-row">
        {brandHref ? (
          <a className="brand" href={brandHref} onClick={closeMobileNav}>
            {brandContent}
          </a>
        ) : (
          <Link className="brand" to={brandTo} onClick={closeMobileNav}>
            {brandContent}
          </Link>
        )}

        <div className="top-nav-actions">
          {actions.map((action) => renderAction(action))}
          {actions.length > 0 ? (
            <button
              className="nav-menu-button"
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-controls={mobileNavId}
            >
              {mobileOpen ? <X size={17} strokeWidth={2.4} /> : <Menu size={17} strokeWidth={2.4} />}
              Menu
            </button>
          ) : null}
        </div>
      </div>

      {actions.length > 0 ? (
        <div id={mobileNavId} className="mobile-nav-panel" hidden={!mobileOpen} aria-hidden={!mobileOpen}>
          {actions.map((action) => renderAction(action, true))}
        </div>
      ) : null}
    </header>
  );
};
