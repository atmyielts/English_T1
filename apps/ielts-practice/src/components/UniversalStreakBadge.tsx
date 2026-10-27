import { Flame } from 'lucide-react';
import { useUserStreak } from '../lib/useUserStreak';
import { useAppT } from '../i18n';

// Cross-app streak badge — drops into any nav. Shows current streak as a
// flame + XP counter. Quiet when there's no data (new user / not logged in).

interface Props {
  accessToken: string | null;
}

export const UniversalStreakBadge = ({ accessToken }: Props) => {
  const t = useAppT();
  const { data } = useUserStreak(accessToken);

  if (!accessToken || !data) return null;
  const streak = data.current_streak;
  const xp = data.total_xp;
  const isLit = streak > 0;

  return (
    <div
      title={isLit ? t('streak.title', { streak, xp, minutes: data.this_week_minutes }) : t('streak.start')}
      aria-label={t('streak.aria', { streak })}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid ${isLit ? 'color-mix(in srgb, #b6512c 28%, transparent)' : '#d4cdb9'}`,
        background: isLit
          ? 'color-mix(in srgb, #b6512c 8%, white)'
          : '#fafaf7',
        fontSize: 13.5,
        fontWeight: 600,
        color: isLit ? '#b6512c' : '#7a7263',
      }}
    >
      <Flame size={14} style={{ color: isLit ? '#b6512c' : '#9ca3af' }} />
      <span>{streak}</span>
      {xp > 0 ? (
        <span style={{ fontWeight: 500, fontSize: 12, color: '#7a7263' }}>· {xp} XP</span>
      ) : null}
    </div>
  );
};
