import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const IELTS_SIMULATOR_DASHBOARD_URL = 'https://ielts.schood.online/dashboard';
const PLAYBOOK_URL = 'https://playbook.ielts.schood.online';

interface PracticeShellProps {
  children: ReactNode;
  reviewsDueCount?: number;
}

const NAV_ITEMS: Array<{ label: string; to?: string; href?: string; matchPath?: string }> = [
  { label: 'Today', to: '/dashboard', matchPath: '/dashboard' },
  { label: 'Plan', to: '/plan', matchPath: '/plan' },
  { label: 'Queue', to: '/practice/reviews', matchPath: '/practice/reviews' },
  { label: 'Question Types', to: '/practice/stats/by-type', matchPath: '/practice/stats/by-type' },
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
            <Link to="/dashboard" className="practice-sidebar-brand" onClick={closeSidebar}>
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
              {NAV_ITEMS.map((item) => {
                const isActive = item.matchPath === location.pathname;
                const className = `sidebar-link${isActive ? ' active' : ''}`;
                const label =
                  item.label === 'Queue' && reviewsDueCount > 0
                    ? `Queue (${reviewsDueCount})`
                    : item.label;
                return (
                  <Link key={item.label} to={item.to ?? '/dashboard'} className={className} onClick={closeSidebar}>
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
