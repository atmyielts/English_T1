import { useEffect, useState, type AnchorHTMLAttributes } from 'react';

// A small path router: History API, `:param` segments, no dependency. Cloudflare
// Pages serves index.html for every path, so deep links like /tutor and
// /explain?source=ielts work on first load.

export interface Location { path: string; query: URLSearchParams }
const read = (): Location => ({ path: location.pathname.replace(/\/+$/, '') || '/', query: new URLSearchParams(location.search) });
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };
window.addEventListener('popstate', notify);

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === `${location.pathname}${location.search}`) return;
  if (options.replace) history.replaceState(null, '', to); else history.pushState(null, '', to);
  notify();
  // Focus moves to the new page's main content for keyboard and screen-reader users.
  requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: false }));
  scrollTo(0, 0);
}

export function useLocation(): Location {
  const [current, setCurrent] = useState(read);
  useEffect(() => {
    const update = () => setCurrent(read());
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);
  return current;
}

/** `/coach/:pack` matches `/coach/ielts` with { pack: 'ielts' }. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean), got = path.split('/').filter(Boolean);
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(got[i]);
    else if (want[i] !== got[i]) return null;
  }
  return params;
}

/** An in-app link: a real <a href> (open in new tab works) that navigates without reloading. */
export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a href={to} {...rest} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  }}/>;
}
