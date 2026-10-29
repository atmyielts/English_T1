// A tiny history router: real paths (/w/<org>/hiring), so links can be shared.
import React, { useEffect, useState, type AnchorHTMLAttributes } from 'react';

const listeners = new Set<() => void>();
export function navigate(to: string, { replace = false } = {}) {
  if (to === location.pathname + location.search) return;
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  listeners.forEach((listener) => listener());
  scrollTo(0, 0);
}

export function useLocation(): { path: string; query: URLSearchParams } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const update = () => setTick((tick) => tick + 1);
    listeners.add(update);
    addEventListener('popstate', update);
    return () => { listeners.delete(update); removeEventListener('popstate', update); };
  }, []);
  return { path: location.pathname.replace(/\/+$/, '') || '/', query: new URLSearchParams(location.search) };
}

/** Matches `/w/:org/hiring/:id` against a path; returns the parameters or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean), have = path.split('/').filter(Boolean);
  if (want.length !== have.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < want.length; index++) {
    if (want[index].startsWith(':')) params[want[index].slice(1)] = decodeURIComponent(have[index]);
    else if (want[index] !== have[index]) return null;
  }
  return params;
}

/** An in-app link: keeps ctrl/cmd-click for new tabs. */
export function Link({ to, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...rest} href={to} onClick={(event) => {
    rest.onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  }}/>;
}
