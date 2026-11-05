import { Gamepad2, Wand2 } from 'lucide-react';
import { Link, useT } from '../core/index.ts';

// The teacher area's home cards, loaded on demand (core's lazy `component` cards).

export function StudioCard() {
  const t = useT();
  return <div className="flex h-full flex-col gap-2 rounded-3xl border border-navy-line bg-white p-5">
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600"><Wand2 size={14} aria-hidden="true"/>{t('teacher.home.studioEyebrow')}</span>
    <strong className="font-display text-lg">{t('teacher.home.studioTitle')}</strong>
    <p className="m-0 text-sm text-gray-700">{t('teacher.home.studioLead')}</p>
    <Link to="/studio" className="mt-auto inline-flex min-h-10 w-fit items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('teacher.home.studioOpen')}</Link>
  </div>;
}

export function PlayCard() {
  const t = useT();
  return <div className="flex h-full flex-col gap-2 rounded-3xl border border-navy-line bg-white p-5">
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600"><Gamepad2 size={14} aria-hidden="true"/>{t('teacher.nav.play')}</span>
    <strong className="font-display text-lg">{t('teacher.home.playTitle')}</strong>
    <p className="m-0 text-sm text-gray-700">{t('teacher.home.playLead')}</p>
    <Link to="/play" className="mt-auto inline-flex min-h-10 w-fit items-center rounded-full border border-navy-line px-4 text-sm font-semibold text-gray-900 no-underline">{t('teacher.home.playOpen')}</Link>
  </div>;
}
