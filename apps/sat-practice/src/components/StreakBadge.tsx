import { Flame } from 'lucide-react';

export const StreakBadge = (props: { days: number }) => (
  <span className="streak-badge" title="Daily practice streak">
    <Flame size={16} />
    {props.days} day streak
  </span>
);
