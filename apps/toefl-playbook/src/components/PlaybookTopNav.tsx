import { BookOpenCheck, Compass, LineChart, Map, Menu, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LineChart },
  { to: '/diagnostic', label: 'Diagnostic', icon: Compass },
  { to: '/modules', label: 'Modules', icon: BookOpenCheck },
] as const;

export const PlaybookTopNav = () => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const header = useRef<HTMLElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 980px)');
    const resize = () => setOpen(false);
    viewport.addEventListener('change', resize);
    return () => viewport.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <header className="top-nav" ref={header}
    onKeyDown={event => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();setOpen(false);toggle.current?.focus();
      }
    }}
    onBlur={event => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
    <Link to="/dashboard" className="brand">
      <img src="/schood-logo.png" alt="Schood" />
      <div>
        <strong>TOEFL Playbook</strong>
        <span>Strategy, diagnostics, study plan</span>
      </div>
    </Link>
    <button type="button" className="nav-menu-toggle" ref={toggle}
      aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls={panelId}
      onClick={() => setOpen(value => !value)}>
      {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
    </button>
    <div id={panelId} className={`nav-panel${open ? ' mobile-open' : ''}`}>
    <nav className="nav-links" aria-label="TOEFL Playbook">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            <Icon size={16} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
    <div className="nav-metrics">
      <a href="https://toefl.schood.online" className="nav-link" onClick={() => setOpen(false)}>
        <Map size={16} aria-hidden="true" />
        <span>Simulator</span>
      </a>
    </div>
    </div>
  </header>;
};
