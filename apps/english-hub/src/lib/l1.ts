import { useEffect, useState } from 'react';

// The first-language notes library is shared with the server
// (supabase/functions/_shared/english-l1-notes.ts) and loaded on demand,
// so screens without mistakes don't download it.
type L1Library = typeof import('../../../../supabase/functions/_shared/english-l1-notes.ts');
export type { L1Note } from '../../../../supabase/functions/_shared/english-l1-notes.ts';

let loaded: L1Library | null = null;
let pending: Promise<L1Library> | null = null;

const loadL1 = (): Promise<L1Library> => {
  pending ??= import('../../../../supabase/functions/_shared/english-l1-notes.ts').then((module) => {
    loaded = module;
    return module;
  });
  return pending;
};

/** The notes library, or null while it loads (or if it failed to load). */
export const useL1Library = (): L1Library | null => {
  const [library, setLibrary] = useState<L1Library | null>(loaded);
  useEffect(() => {
    if (library) return;
    let active = true;
    loadL1().then((module) => { if (active) setLibrary(module); }).catch(() => { pending = null; });
    return () => { active = false; };
  }, [library]);
  return library;
};
