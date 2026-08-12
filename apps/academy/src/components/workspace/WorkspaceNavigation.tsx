import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export type WorkspaceNavigationItem = {
  id: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  onSelect: () => void;
  onPrepare?: () => void;
  badge?: number;
};

export type WorkspaceNavigationGroup = {
  label: string;
  items: WorkspaceNavigationItem[];
};

type WorkspaceNavigationProps = {
  title: string;
  subtitle: string;
  mark: ReactNode;
  groups: WorkspaceNavigationGroup[];
  platformUrl: string;
  roleLabel?: string;
  contextLabel?: string;
};

export const WorkspaceNavigation = ({
  title,
  subtitle,
  mark,
  groups,
  platformUrl,
  roleLabel,
  contextLabel,
}: WorkspaceNavigationProps) => {
  const navRef = useRef<HTMLElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);
  const visibleGroups = useMemo(() => groups.filter((group) => group.items.length > 0), [groups]);
  const activeItemId = visibleGroups.flatMap((group) => group.items).find((item) => item.active)?.id ?? '';

  const updateScrollState = useCallback(() => {
    const node = navRef.current;
    if (!node) return;
    setCanScrollBack(node.scrollLeft > 2);
    setCanScrollForward(node.scrollLeft + node.clientWidth < node.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const node = navRef.current;
    if (!node) return;
    const activeItem = node.querySelector<HTMLElement>('[aria-current="page"]');
    if (activeItem && window.matchMedia('(max-width: 980px)').matches) {
      activeItem.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    const frame = window.requestAnimationFrame(updateScrollState);
    window.addEventListener('resize', updateScrollState);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [activeItemId, updateScrollState]);

  const scrollNavigation = (direction: -1 | 1) => {
    const node = navRef.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.max(220, node.clientWidth * 0.72), behavior: 'smooth' });
  };

  return (
    <aside className="ts-sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">{mark}</span>
        <div className="brand-copy">
          <span className="brand-kicker">Workspace</span>
          <strong>{title}</strong>
          <p>{subtitle}</p>
        </div>
      </div>

      {roleLabel ? (
        <div className="workspace-identity" aria-label={`Signed in as ${roleLabel}`}>
          <span>{roleLabel}</span>
          {contextLabel ? <small>{contextLabel}</small> : null}
        </div>
      ) : null}

      <div className="workspace-nav__mobile-toolbar">
        <span>Workspace sections</span>
        <div>
          <button type="button" aria-label="Show previous workspace sections" disabled={!canScrollBack} onClick={() => scrollNavigation(-1)}><ChevronLeft size={17} /></button>
          <button type="button" aria-label="Show more workspace sections" disabled={!canScrollForward} onClick={() => scrollNavigation(1)}><ChevronRight size={17} /></button>
        </div>
      </div>

      <nav ref={navRef} className="workspace-nav" aria-label={`${title} navigation`} onScroll={updateScrollState}>
        {visibleGroups.map((group) => (
          <section className="workspace-nav__group" key={group.label} aria-label={group.label}>
            <span className="workspace-nav__label">{group.label}</span>
            {group.items.map((item) => (
              <button
                className={`nav-btn ${item.active ? 'is-active' : ''}`}
                type="button"
                onClick={item.onSelect}
                onPointerEnter={item.onPrepare}
                onPointerDown={item.onPrepare}
                onFocus={item.onPrepare}
                aria-current={item.active ? 'page' : undefined}
                key={item.id}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                {item.badge && item.badge > 0 ? <span className="nav-badge">{item.badge}</span> : null}
              </button>
            ))}
          </section>
        ))}
      </nav>

      <div className="sidebar-footer">
        <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
          Back to platform
        </a>
      </div>
    </aside>
  );
};
