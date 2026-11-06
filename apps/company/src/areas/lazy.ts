// Area pages load on first visit, so the landing page and candidate links stay light.
import { lazy, type ComponentType } from 'react';

// deno-lint-ignore no-explicit-any
export function lazyPage<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): ComponentType<any> {
  // deno-lint-ignore no-explicit-any
  return lazy(async () => ({ default: (await load())[name] as ComponentType<any> }));
}
