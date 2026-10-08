import { BookOpenCheck, Brain, CalendarDays, Flame, LineChart, Menu, NotebookTabs, Repeat, Sparkles, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LineChart },
  { to: '/today', label: 'Today', icon: CalendarDays },
  { to: '/bank', label: 'Bank', icon: BookOpenCheck },
  { to: '/notebook', label: 'Notebook', icon: NotebookTabs },
  { to: '/reviews', label: 'Reviews', icon: Repeat },
  { to: '/plan', label: 'Plan', icon: Brain },
] as const;

export const PracticeTopNav = (props: { streakDays?: number; xp?: number }) => {
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
        <strong>SAT Practice Lab</strong>
        <span>Daily practice workspace</span>
      </div>
    </Link>
    <button type="button" className="nav-menu-toggle" ref={toggle}
      aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls={panelId}
      onClick={() => setOpen(value => !value)}>
      {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
    </button>
    <div id={panelId} className={`nav-panel${open ? ' mobile-open' : ''}`}>
    <nav className="nav-links" aria-label="SAT Practice">
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
    {(props.streakDays != null || props.xp != null) ? <div className="nav-metrics">
      {props.streakDays != null ? <span title="Current streak"><Flame size={16} />{props.streakDays}d</span> : null}
      {props.xp != null ? <span title="XP earned"><Sparkles size={16} />{props.xp} XP</span> : null}
    </div> : null}
    </div>
  </header>;
};
