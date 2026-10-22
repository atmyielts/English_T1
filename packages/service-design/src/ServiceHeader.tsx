import { useId, useState, type ReactNode } from 'react';

export type ServiceNavItem = { id: string; label: string; active?: boolean; onClick: () => void };
/** Visible chrome text, supplied already translated by the service. English defaults. */
export type ServiceHeaderLabels = { skip: string; home: string; menu: string; workspace: string };
const defaultLabels: ServiceHeaderLabels = { skip: 'Skip to main content', home: 'Schood home', menu: 'Menu', workspace: '{service} workspace' };
/** Schood service design only: no API, assessment, proctor, router or account-state dependencies. */
export function ServiceHeader({ service, nav = [], labels = defaultLabels, children }: { service: string; nav?: ServiceNavItem[]; labels?: ServiceHeaderLabels; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const controlsId = useId();
  return <header className="service-header" onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); event.currentTarget.querySelector<HTMLButtonElement>('.service-menu')?.focus(); } }}>
    <a className="skip-link" href="#workspace-main">{labels.skip}</a>
    <div className="service-header-inner">
      <div className="service-header-top">
        <a className="service-brand" href="https://schood.online" aria-label={labels.home}><span className="service-brand-dot" aria-hidden="true"/><span>Schood<span className="service-brand-descriptor">{service}</span></span></a>
        {nav.length > 0 && <button type="button" className="quiet service-menu" aria-expanded={open} aria-controls={controlsId} onClick={() => setOpen(value => !value)}>{labels.menu}</button>}
      </div>
      <div className={`service-header-controls ${nav.length ? 'service-has-nav' : ''} ${open ? 'service-menu-open' : ''}`} id={controlsId}>
        {nav.length > 0 && <nav className="service-nav" aria-label={labels.workspace.replace('{service}', service)}>{nav.map(item => <button type="button" key={item.id} aria-current={item.active ? 'page' : undefined} onClick={() => { setOpen(false); item.onClick(); }}>{item.label}</button>)}</nav>}
        <div className="service-header-actions">{children}</div>
      </div>
    </div>
  </header>;
}
