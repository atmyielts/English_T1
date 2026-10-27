import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAppT } from '../i18n';

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
  // Optional element rendered alongside the action buttons in the top-right.
  // Used by DashboardPage to mount the cross-app streak badge so it's visible
  // ambient context without polluting the action list.
  leadingNode?: React.ReactNode;
};

export const PracticeTopNav: React.FC<PracticeTopNavProps> = ({
  title,
  subtitle,
  brandTo = '/dashboard',
  brandHref,
  compact = false,
  leadingNode,
  actions = [],
}) => {
  const t = useAppT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileNavId = useId();
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const focusedControlRef = useRef<HTMLElement | null>(null);
  const { pathname, search } = useLocation();
  const closeMobileNav = () => {
    if (document.activeElement instanceof Element && document.activeElement.closest('.mobile-nav-panel')) toggleRef.current?.focus();
    setMobileOpen(false);
  };

  useEffect(() => setMobileOpen(false), [pathname, search]);
  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 760px)');
    const resize = () => {
      setMobileOpen(false);
      const focused = document.activeElement === document.body ? focusedControlRef.current : document.activeElement;
      if (viewport.matches && focused instanceof Element && focused.matches('.top-nav-actions > .btn')) {
        if (headerRef.current?.contains(focused)) toggleRef.current?.focus();
      } else if (!viewport.matches && (focused === toggleRef.current || (focused instanceof Element && focused.closest('.mobile-nav-panel') && headerRef.current?.contains(focused)))) {
        headerRef.current?.querySelector<HTMLElement>('.brand')?.focus();
      }
    };
    viewport.addEventListener('change', resize);
    return () => viewport.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) {
        if (document.activeElement instanceof Element && document.activeElement.closest('.mobile-nav-panel')) toggleRef.current?.focus();
        setMobileOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [mobileOpen]);

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
    <header ref={headerRef} className={`top-nav glass${compact ? ' compact' : ''}${mobileOpen ? ' mobile-open' : ''}`}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement) focusedControlRef.current = event.target;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && mobileOpen) {
          event.preventDefault();
          setMobileOpen(false);
          toggleRef.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
          focusedControlRef.current = null;
          setMobileOpen(false);
        }
      }}>
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
          {leadingNode}
          {actions.map((action) => renderAction(action))}
          {actions.length > 0 ? (
            <button
              className="nav-menu-button"
              ref={toggleRef}
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={t('shell.menu')}
              aria-expanded={mobileOpen}
              aria-controls={mobileNavId}
            >
              {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          ) : null}
        </div>
      </div>

      {actions.length > 0 ? (
        <nav id={mobileNavId} aria-label={t('shell.nav.label')} className="mobile-nav-panel" hidden={!mobileOpen} aria-hidden={!mobileOpen}>
          {actions.map((action) => renderAction(action, true))}
        </nav>
      ) : null}
    </header>
  );
};
