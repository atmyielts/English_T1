import React from 'react';
import { ArrowRight, BookOpenCheck } from 'lucide-react';
import { NavLink, Link } from 'react-router-dom';

const navItems = [
  { to: '/essentials', label: 'Essentials' },
  { to: '/test-types-booking', label: 'Test Path' },
  { to: '/study-plans', label: 'Study Plans' },
  { to: '/updates', label: 'Updates' },
  { to: '/dashboard', label: 'Dashboard' },
];

export const SiteChrome: React.FC<React.PropsWithChildren<{ compact?: boolean }>> = ({ compact = false, children }) => (
  <div className={`site-shell${compact ? ' compact-shell' : ''}`}>
    <header className="site-header">
      <Link to="/" className="brand-mark">
        <span className="brand-knot" aria-hidden="true">
          <BookOpenCheck size={20} strokeWidth={2.4} />
        </span>
        <span>
          <strong>IELTS Playbook</strong>
          <span>by Schood</span>
        </span>
      </Link>
      <nav className="site-nav">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <Link to="/onboarding" className="nav-cta" aria-label="Build my IELTS study plan">
        Build My Plan
        <ArrowRight size={16} strokeWidth={2.4} />
      </Link>
    </header>
    <main>{children}</main>
  </div>
);
