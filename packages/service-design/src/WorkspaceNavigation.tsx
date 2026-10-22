import React, { useId, useState } from 'react';
import type { ServiceNavItem } from './ServiceHeader';

export type WorkspaceNavSection = { id: string; label: string; items: ServiceNavItem[] };
/** Grouped workspace navigation: a sidebar on wide screens, a disclosure menu on
 * narrow ones. Schood service design only; labels arrive already translated. */
export function WorkspaceNavigation({ label, menuLabel, sections }: { label: string; menuLabel: string; sections: WorkspaceNavSection[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const visible = sections.filter(section => section.items.length > 0);
  const current = visible.flatMap(section => section.items).find(item => item.active);
  if (!visible.length) return null;
  return <nav className="workspace-nav" aria-label={label}>
    <button type="button" className="quiet workspace-nav-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span>{menuLabel}</span>{current && <strong>{current.label}</strong>}
    </button>
    <div id={id} className={`workspace-nav-sections${open ? ' workspace-nav-open' : ''}`}>
      {visible.map(section => <div key={section.id} className="workspace-nav-group">
        <p className="workspace-nav-heading" id={`${id}-${section.id}`}>{section.label}</p>
        <ul aria-labelledby={`${id}-${section.id}`}>
          {section.items.map(item => <li key={item.id}>
            <button type="button" aria-current={item.active ? 'page' : undefined} onClick={() => { setOpen(false); item.onClick(); }}>{item.label}</button>
          </li>)}
        </ul>
      </div>)}
    </div>
  </nav>;
}
