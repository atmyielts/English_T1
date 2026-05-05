import React, { useId, useState } from 'react';
import { ArrowRight, BookOpenCheck, Menu, X } from 'lucide-react';
import { NavLink, Link } from 'react-router-dom';

const navItems = [
  { to: '/essentials', label: 'Essentials' },
  { to: '/test-types-booking', label: 'Test Path' },
  { to: '/study-plans', label: 'Study Plans' },
  { to: '/updates', label: 'Updates' },
  { to: '/dashboard', label: 'Dashboard' },
];

export const SiteChrome: React.FC<React.PropsWithChildren<{ compact?: boolean }>> = ({ compact = false, children }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileNavId = useId();
  const closeMobileNav = () => setMobileOpen(false);

  return (
    <div className={`site-shell${compact ? ' compact-shell' : ''}`}>
      <header className={`site-header${mobileOpen ? ' mobile-open' : ''}`}>
        <div className="site-header-row">
          <Link to="/" className="brand-mark" onClick={closeMobileNav}>
            <span className="brand-knot" aria-hidden="true">
              <BookOpenCheck size={20} strokeWidth={2.4} />
            </span>
            <span>
              <strong>IELTS Playbook</strong>
              <span>by Schood</span>
            </span>
          </Link>
          <nav className="site-nav" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="site-actions">
            <Link to="/onboarding" className="nav-cta" aria-label="Build my IELTS study plan">
              Build My Plan
              <ArrowRight size={16} strokeWidth={2.4} />
            </Link>
            <button
              type="button"
              className="nav-menu-button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-controls={mobileNavId}
            >
              {mobileOpen ? <X size={17} strokeWidth={2.4} /> : <Menu size={17} strokeWidth={2.4} />}
              Menu
            </button>
          </div>
        </div>

        <div id={mobileNavId} className="mobile-nav-panel" hidden={!mobileOpen} aria-hidden={!mobileOpen}>
          {navItems.map((item) => (
            <NavLink
              key={`mobile-${item.to}`}
              to={item.to}
              onClick={closeMobileNav}
              className={({ isActive }) => (isActive ? 'mobile-nav-link active' : 'mobile-nav-link')}
            >
              {item.label}
              <ArrowRight size={15} strokeWidth={2.4} />
            </NavLink>
          ))}
          <Link to="/onboarding" className="mobile-nav-cta" onClick={closeMobileNav} aria-label="Build my IELTS study plan">
            Build My Plan
            <ArrowRight size={16} strokeWidth={2.4} />
          </Link>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
};
