import { GraduationCap } from 'lucide-react';
import { Link, useT } from '../core/index.ts';

// The learner home's "Schood Coaches" card, loaded on demand (routes.tsx).
export default function CoachesCard() {
  const t = useT();
  return <div className="flex flex-col gap-2 rounded-3xl border border-navy-line bg-white/85 p-5">
    <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600"><GraduationCap size={16} aria-hidden="true"/>{t('coach.eyebrow')}</span>
    <p className="m-0 font-display text-lg font-bold">{t('coach.card.title')}</p>
    <p className="m-0 text-sm leading-6 text-gray-700">{t('coach.card.lead')}</p>
    <Link to="/coach" className="text-sm font-semibold text-gray-900 underline underline-offset-2">{t('coach.card.open')}</Link>
  </div>;
}
