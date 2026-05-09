import React from 'react';
import { Clock4 } from 'lucide-react';

interface ListeningCheckBannerProps {
  active: boolean;
  secondsLeft: number;
}

const formatClock = (secondsTotal: number): string => {
  const s = Math.max(0, Math.floor(secondsTotal));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

export const ListeningCheckBanner: React.FC<ListeningCheckBannerProps> = ({ active, secondsLeft }) => {
  if (!active) return null;
  return (
    <div className="shrink-0 bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-sm text-emerald-900 flex items-center gap-3">
      <Clock4 size={16} className="text-emerald-700" />
      <div>
        <span className="font-semibold">Final check time:</span> the audio has ended. Use the remaining{' '}
        <span className="font-mono font-semibold">{formatClock(secondsLeft)}</span> to review your answers. The
        section auto-submits at the deadline.
      </div>
    </div>
  );
};
