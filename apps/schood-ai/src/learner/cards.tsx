import { Sparkles, UsersRound } from 'lucide-react';
import { Card, Eyebrow, Link, useT } from '../core/index.ts';

// Home cards (kept out of the page chunks so the home screen stays small).

export function LearnCard() {
  const t = useT();
  return <Card className="ai-spark-card flex flex-col gap-3">
    <Eyebrow icon={<Sparkles size={14} aria-hidden="true"/>}>{t('learner.card.eyebrow')}</Eyebrow>
    <h2 className="m-0 font-display text-xl font-bold">{t('learner.card.title')}</h2>
    <p className="m-0 text-sm leading-6 text-gray-700">{t('learner.card.lead')}</p>
    <div className="flex flex-wrap gap-2">
      <Link to="/tutor" className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('learner.tool.tutor')}</Link>
      <Link to="/learn" className="inline-flex min-h-11 items-center rounded-full border border-navy-line bg-white px-4 text-sm font-semibold text-gray-900 no-underline">{t('learner.card.all')}</Link>
    </div>
  </Card>;
}

export function FamilyCard() {
  const t = useT();
  return <Card className="flex flex-col gap-3">
    <Eyebrow icon={<UsersRound size={14} aria-hidden="true"/>}>{t('learner.tool.family')}</Eyebrow>
    <h2 className="m-0 font-display text-xl font-bold">{t('learner.familyCard.title')}</h2>
    <p className="m-0 text-sm leading-6 text-gray-700">{t('learner.familyCard.lead')}</p>
    <div><Link to="/family" className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('learner.familyCard.open')}</Link></div>
  </Card>;
}
