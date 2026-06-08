import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const IELTS_SIMULATOR_DASHBOARD_URL = 'https://ielts.schood.online/dashboard';
const PLAYBOOK_URL = 'https://playbook.ielts.schood.online';

interface PracticeShellProps {
  children: ReactNode;
  reviewsDueCount?: number;
}

// Three primary tabs map to the learner's three intents: DO / REVIEW / CONFIGURE.
const PRIMARY_NAV: Array<{ label: string; hint: string; to: string; matchPath: string }> = [
  { label: 'Today', hint: 'Your guided daily session', to: '/today', matchPath: '/today' },
  { label: 'Progress', hint: 'Bands, mastery & mistakes', to: '/dashboard', matchPath: '/dashboard' },
  { label: 'Plan', hint: 'Goal & schedule', to: '/plan', matchPath: '/plan' },
];

// Secondary tools — reachable but not competing with the daily path.
const MORE_NAV: Array<{ label: string; to: string; matchPath: string }> = [
  { label: 'Reviews due', to: '/practice/reviews', matchPath: '/practice/reviews' },
  { label: 'Stats by type', to: '/practice/stats/by-type', matchPath: '/practice/stats/by-type' },
  { label: 'AI Writing prep', to: '/writing-prep', matchPath: '/writing-prep' },
  { label: 'AI Mock generator', to: '/generator', matchPath: '/generator' },
];

const EXTERNAL_ITEMS: Array<{ label: string; href: string }> = [
  { label: 'IELTS Simulator', href: IELTS_SIMULATOR_DASHBOARD_URL },
  { label: 'IELTS Playbook', href: `${PLAYBOOK_URL}/dashboard?source=practice` },
];

export const PracticeShell = ({ children, reviewsDueCount = 0 }: PracticeShellProps) => {
  const sidebarMenuId = useId();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const closeSidebar = () => setSidebarOpen(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="practice-root">
      <div className="practice-workspace">
        <aside className={`practice-sidebar glass${sidebarOpen ? ' mobile-open' : ''}`}>
          <div className="practice-sidebar-head">
            <Link to="/today" className="practice-sidebar-brand" onClick={closeSidebar}>
              <img src="/schood-logo.png" alt="Schood" />
              <div>
                <strong>IELTS Practice</strong>
                <span>Practice Labs workspace</span>
              </div>
            </Link>
            <button
              className="sidebar-menu-button"
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              aria-expanded={sidebarOpen}
              aria-controls={sidebarMenuId}
            >
              {sidebarOpen ? <X size={17} strokeWidth={2.4} /> : <Menu size={17} strokeWidth={2.4} />}
              Menu
            </button>
          </div>

          <div id={sidebarMenuId} className="practice-sidebar-menu">
            <nav className="practice-sidebar-nav">
              {PRIMARY_NAV.map((item) => {
                const isActive = location.pathname === item.matchPath;
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    className={`sidebar-link${isActive ? ' active' : ''}`}
                    onClick={closeSidebar}
                    title={item.hint}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <span className="sidebar-nav-label muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.6, padding: '8px 0 2px' }}>More</span>
              {MORE_NAV.map((item) => {
                const isActive = location.pathname === item.matchPath;
                const label =
                  item.label === 'Reviews due' && reviewsDueCount > 0
                    ? `Reviews due (${reviewsDueCount})`
                    : item.label;
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    className={`sidebar-link${isActive ? ' active' : ''}`}
                    onClick={closeSidebar}
                  >
                    {label}
                  </Link>
                );
              })}

              {EXTERNAL_ITEMS.map((item) => (
                <a key={item.label} href={item.href} className="sidebar-link" onClick={closeSidebar}>
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <main className="practice-main">{children}</main>
      </div>
    </div>
  );
};
