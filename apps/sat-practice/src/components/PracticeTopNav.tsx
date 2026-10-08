import { BookOpenCheck, Brain, CalendarDays, Flame, LineChart, NotebookTabs, Repeat, Sparkles } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LineChart },
  { to: '/today', label: 'Today', icon: CalendarDays },
  { to: '/bank', label: 'Bank', icon: BookOpenCheck },
  { to: '/notebook', label: 'Notebook', icon: NotebookTabs },
  { to: '/reviews', label: 'Reviews', icon: Repeat },
  { to: '/plan', label: 'Plan', icon: Brain },
] as const;

export const PracticeTopNav = (props: { streakDays?: number; xp?: number }) => (
  <header className="top-nav">
    <Link to="/dashboard" className="brand">
      <img src="/schood-logo.png" alt="Schood" />
      <div>
        <strong>SAT Practice Lab</strong>
        <span>Daily practice workspace</span>
      </div>
    </Link>
    <nav className="nav-links" aria-label="SAT Practice">
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
    {(props.streakDays != null || props.xp != null) ? <div className="nav-metrics">
      {props.streakDays != null ? <span title="Current streak"><Flame size={16} />{props.streakDays}d</span> : null}
      {props.xp != null ? <span title="XP earned"><Sparkles size={16} />{props.xp} XP</span> : null}
    </div> : null}
  </header>
);
