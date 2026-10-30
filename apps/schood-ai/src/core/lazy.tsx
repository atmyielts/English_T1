import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { HomeCard } from './areas.ts';
import type { Me } from './types.ts';

// Pieces of an area that load after the first paint: nav icons named in the area's
// `icons` module and home cards with a `component` loader. They keep every area's
// code out of the main chunk, however many areas merge.

type IconModule = () => Promise<Record<string, LucideIcon>>;
const icons = new Map<IconModule, Promise<Record<string, LucideIcon>>>(), loaded = new Map<IconModule, Record<string, LucideIcon>>();
const iconsOf = (load: IconModule) => {
  let pending = icons.get(load);
  if (!pending) {
    pending = load().then((module) => { loaded.set(load, module); return module; });
    pending.catch(() => icons.delete(load));
    icons.set(load, pending);
  }
  return pending;
};

export interface IconProps { size?: number; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }
/** An icon by name from an area's lazy icon module; a same-size blank until it loads (no layout shift). */
export function namedIcon(load: IconModule | undefined, name: string): ComponentType<IconProps> {
  return function NamedIcon({ size = 17, ...props }: IconProps) {
    const [module, setModule] = useState(() => (load ? loaded.get(load) ?? null : null));
    useEffect(() => {
      if (!load || module) return;
      let live = true;
      iconsOf(load).then((value) => { if (live) setModule(value); }, () => {});
      return () => { live = false; };
    }, [module]);
    const Icon = module?.[name];
    return Icon ? <Icon size={size} {...props}/> : <span aria-hidden="true" className="inline-block shrink-0" style={{ width: size, height: size }}/>;
  };
}

/** A card that failed to load shows nothing rather than breaking home. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}
const cards = new Map<string, ComponentType<{ me: Me }>>();
const Placeholder = () => <div aria-hidden="true" className="min-h-32 animate-pulse rounded-3xl border border-navy-line/30 bg-white/60"/>;

/** A home card: inline `render`, or its own chunk through `component`. */
export function HomeCardView({ card, me }: { card: HomeCard; me: Me }) {
  if (card.render) return <>{card.render(me)}</>;
  if (!card.component) return null;
  let View = cards.get(card.id);
  if (!View) { View = lazy(card.component); cards.set(card.id, View); }
  return <Quiet><Suspense fallback={<Placeholder/>}><View me={me}/></Suspense></Quiet>;
}

