import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import './public-exam-header.css';

type Props = {
  tone: 'sat' | 'ielts' | 'toefl';
  brand: ReactNode;
  primary: ReactNode;
  secondary: ReactNode;
  locale: ReactNode;
  account: ReactNode;
  labels: { sections: string; menu: string; more: string };
};

/** Landing navigation. The app supplies links and auth actions so URLs and access stay app-owned. */
export function PublicExamHeader({ tone, brand, primary, secondary, locale, account, labels }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const navigationId = useId();
  const moreId = useId();
  const header = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const more = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 950px)');
    const closeOnResize = () => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && header.current?.contains(focused)) {
        if (viewport.matches && focused.closest('.exam-public-controls')) toggle.current?.focus();
        if (!viewport.matches && focused === toggle.current) header.current.querySelector<HTMLAnchorElement>('.exam-public-brand a')?.focus();
      }
      setMobileOpen(false);
      setMoreOpen(false);
    };
    viewport.addEventListener('change', closeOnResize);
    return () => viewport.removeEventListener('change', closeOnResize);
  }, []);

  useEffect(() => {
    if (!mobileOpen && !moreOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) {
        setMobileOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [mobileOpen, moreOpen]);

  return (
    <header className="exam-public-header" data-tone={tone} ref={header}
      onBlur={event => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
          setMobileOpen(false);
          setMoreOpen(false);
        }
      }}
      onKeyDown={event => {
        if (event.key !== 'Escape') return;
        if (mobileOpen) {
          event.preventDefault();
          setMobileOpen(false);
          toggle.current?.focus();
        } else if (moreOpen) {
          event.preventDefault();
          setMoreOpen(false);
          more.current?.focus();
        }
      }}>
      <div className="exam-public-brand">{brand}</div>
      <button className="exam-public-toggle" type="button" ref={toggle}
        aria-expanded={mobileOpen} aria-controls={navigationId} onClick={() => setMobileOpen(open => !open)}>
        {labels.menu}
      </button>
      <div className="exam-public-controls" id={navigationId} data-open={mobileOpen}
        onClick={event => {
          if (event.target instanceof Element && event.target.closest('a[href]')) {
            setMobileOpen(false);
            setMoreOpen(false);
          }
        }}>
        <nav className="exam-public-primary" aria-label={labels.sections}>{primary}</nav>
        <div className="exam-public-actions">
          <div className="exam-public-more">
            <button className="exam-public-more-toggle" type="button" ref={more} aria-expanded={moreOpen}
              aria-controls={moreId} onClick={() => setMoreOpen(open => !open)}>
              {labels.more}
            </button>
            <div className="exam-public-secondary" id={moreId} data-open={moreOpen}>{secondary}</div>
          </div>
          {locale}
          {account ? <div className="exam-public-account">{account}</div> : null}
        </div>
      </div>
    </header>
  );
}
