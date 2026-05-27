import { BookOpenCheck, Compass, LineChart, Map } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LineChart },
  { to: '/diagnostic', label: 'Diagnostic', icon: Compass },
  { to: '/format-overview', label: 'Modules', icon: BookOpenCheck },
] as const;

export const PlaybookTopNav = () => (
  <header className="top-nav">
    <Link to="/dashboard" className="brand">
      <img src="/schood-logo.png" alt="Schood" />
      <div>
        <strong>SAT Playbook</strong>
        <span>Strategy, diagnostics, study plan</span>
      </div>
    </Link>
    <nav className="nav-links" aria-label="SAT Playbook">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Icon size={16} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
    <div className="nav-metrics">
      <a href="https://sat.schood.online" className="nav-link">
        <Map size={16} />
        <span>Simulator</span>
      </a>
    </div>
  </header>
);
