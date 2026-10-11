import { translate } from '../../i18n';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Menu, Search, X } from 'lucide-react';

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
  collapsible?: boolean;
  defaultExpanded?: boolean;
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
  const menuRef = useRef<HTMLButtonElement>(null);
  const navigationId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const visibleGroups = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return groups.map(group => ({ ...group, items: group.items.filter(item => !search || translate(item.label).toLocaleLowerCase().includes(search)) }))
      .filter(group => group.items.length > 0);
  }, [groups, query]);

  const groupIsExpanded = (group: WorkspaceNavigationGroup) => {
    if (!group.collapsible || query.trim()) return true;
    return group.items.some((item) => item.active) || (expandedGroups[group.label] ?? group.defaultExpanded ?? false);
  };

  const closeMenu = () => {
    setMobileOpen(false);
    setQuery('');
    menuRef.current?.focus();
  };

  return (
    <aside className={`ts-sidebar ${mobileOpen ? 'is-menu-open' : ''}`} onKeyDown={event => {
      if (event.key === 'Escape' && mobileOpen) { event.preventDefault(); closeMenu(); }
    }}>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">{mark}</span>
        <div className="brand-copy">
          <strong>{translate(title)}</strong>
          <p>{subtitle}</p>
        </div>
      </div>

      {roleLabel ? (
        <div className="workspace-identity" aria-label={translate("Signed in as {role}", { role: translate(roleLabel) })}>
          <span>{translate(roleLabel)}</span>
          {contextLabel ? <small>{translate(contextLabel)}</small> : null}
        </div>
      ) : null}

      <button ref={menuRef} className="workspace-menu-toggle" type="button" aria-expanded={mobileOpen} aria-controls={navigationId} onClick={() => { setMobileOpen(!mobileOpen); setQuery(''); }}>
        {mobileOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        {translate('Sections')}
      </button>

      <nav id={navigationId} className="workspace-nav" aria-label={translate("{workspace} navigation", { workspace: translate(title) })}>
        <label className="workspace-nav-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">{translate('Find a section')}</span>
          <input type="search" value={query} placeholder={translate('Search sections')} onChange={event => setQuery(event.target.value)} />
        </label>
        {visibleGroups.length === 0 ? <p className="workspace-nav-empty">{translate('No matching sections. Try another name.')}</p> : null}
        {visibleGroups.map((group) => {
          const expanded = groupIsExpanded(group);
          return (
          <section className={`workspace-nav__group ${group.collapsible ? 'is-collapsible' : ''}`} key={group.label} aria-label={translate(group.label)}>
            {group.collapsible ? <button className="workspace-nav__group-toggle" type="button" aria-expanded={expanded} onClick={() => setExpandedGroups((current) => ({ ...current, [group.label]: !expanded }))}><span>{translate(group.label)}</span><ChevronDown size={15} /></button> : <span className="workspace-nav__label">{translate(group.label)}</span>}
            {expanded ? group.items.map((item) => (
              <button
                className={`nav-btn ${item.active ? 'is-active' : ''}`}
                type="button"
                onClick={() => { item.onSelect(); setMobileOpen(false); setQuery(''); if (window.matchMedia('(max-width: 980px)').matches) menuRef.current?.focus(); }}
                onPointerEnter={item.onPrepare}
                onPointerDown={item.onPrepare}
                onFocus={item.onPrepare}
                aria-current={item.active ? 'page' : undefined}
                key={item.id}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="nav-label">{translate(item.label)}</span>
                {item.badge && item.badge > 0 ? <span className="nav-badge">{item.badge}</span> : null}
              </button>
            )) : null}
          </section>
        )})}
      </nav>

      <div className="sidebar-footer">
        <a className="ghost-btn" href={`${platformUrl.replace(/\/$/, '')}/`}>
          {translate("Back to platform")}{' '}</a>
      </div>
    </aside>
  );
};
