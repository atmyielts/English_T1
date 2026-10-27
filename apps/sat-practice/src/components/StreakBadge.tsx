import { Flame } from 'lucide-react';
import { useAppT } from '../i18n';

export const StreakBadge = (props: { days: number }) => {
  const t = useAppT();
  return <span className="streak-badge" title={t('nav.streak')}><Flame size={16} aria-hidden="true" />{t('streak.badge', { days: props.days })}</span>;
};
