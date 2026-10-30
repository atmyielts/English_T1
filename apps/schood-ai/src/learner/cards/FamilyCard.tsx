import { UsersRound } from 'lucide-react';
import { Card, Eyebrow, Link, useT } from '../../core/index.ts';

// The parent home card, loaded on demand (core/areas.ts: HomeCard.component).

export default function FamilyCard() {
  const t = useT();
  return <Card className="flex flex-col gap-3">
    <Eyebrow icon={<UsersRound size={14} aria-hidden="true"/>}>{t('learner.tool.family')}</Eyebrow>
    <h2 className="m-0 font-display text-xl font-bold">{t('learner.familyCard.title')}</h2>
    <p className="m-0 text-sm leading-6 text-gray-700">{t('learner.familyCard.lead')}</p>
    <div><Link to="/family" className="inline-flex min-h-11 items-center rounded-full bg-navy px-4 text-sm font-semibold text-white no-underline">{t('learner.familyCard.open')}</Link></div>
  </Card>;
}
