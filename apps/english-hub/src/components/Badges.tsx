import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, useT } from '../i18n';
import { useResource } from '../lib/useResource';
import { badgeFamily, badgeMark, getAchievements, markBadgesSeen, type Badge } from '../lib/xp';
import { ErrorState, Loading, Panel, ProgressBar, Tag } from '../ui/kit';
import '../xp.css';

/** Once new badges are on screen, remember they were seen so they are celebrated only once. */
const useMarkSeen = (badges: Badge[] | undefined) => {
  const keys = (badges ?? []).filter((badge) => badge.new).map((badge) => badge.key).join(',');
  useEffect(() => {
    if (keys) markBadgesSeen(keys.split(',')).catch(() => undefined);
  }, [keys]);
};

const BadgeCard = ({ badge, showNew }: { badge: Badge; showNew: boolean }) => {
  const t = useT();
  const { date } = useI18n();
  const title = t(`xp.badge.${badge.key}.title`);
  return (
    <li className={`en-badge ${badge.earned ? 'is-earned' : 'is-locked'}`}>
      <span className={`en-badge-medal is-${badgeFamily(badge.key)}`} aria-hidden="true">{badgeMark(badge.key)}</span>
      <span className="en-badge-copy">
        <strong>{title}</strong>
        <small>{t(`xp.badge.${badge.key}.body`)}</small>
        {badge.earned ? (
          badge.earned_at ? <small>{t('xp.badges.earnedOn', { date: date(badge.earned_at, { dateStyle: 'medium' }) })}</small> : null
        ) : (
          <>
            <ProgressBar value={(badge.current / Math.max(1, badge.target)) * 100} label={`${title}: ${t('xp.badges.progress', { current: badge.current, target: badge.target })}`} />
            <small>{t('xp.badges.progress', { current: badge.current, target: badge.target })}</small>
          </>
        )}
      </span>
      {showNew && badge.new ? <Tag>{t('xp.badges.new')}</Tag> : null}
      {!badge.earned ? <span className="visually-hidden">{t('xp.badges.locked')}</span> : null}
    </li>
  );
};

/** All badges on Progress: earned first, then the closest to being earned. */
export const BadgesPanel = () => {
  const t = useT();
  const res = useResource((signal) => getAchievements(signal), []);
  const badges = res.data?.badges;
  useMarkSeen(badges);
  const ordered = [...(badges ?? [])].sort((a, b) =>
    Number(b.earned) - Number(a.earned) || (a.earned ? 0 : b.current / b.target - a.current / a.target));
  const earned = (badges ?? []).filter((badge) => badge.earned).length;

  return (
    <Panel title={t('xp.badges.title')} aside={badges ? <span>{t('xp.badges.count', { earned, total: badges.length })}</span> : null}>
      <p className="hint">{t('xp.badges.lead')}</p>
      {res.error && !badges ? <ErrorState error={res.error} onRetry={res.reload} /> : null}
      {!badges && !res.error ? <Loading lines={4} /> : null}
      {badges ? (
        <ul className="en-badges" id="badges">
          {ordered.map((badge) => <BadgeCard key={badge.key} badge={badge} showNew />)}
        </ul>
      ) : null}
    </Panel>
  );
};

/** A one-time celebration for badges earned since the learner last looked. */
export const NewBadges = ({ showLink = true }: { showLink?: boolean }) => {
  const t = useT();
  const res = useResource((signal) => getAchievements(signal), []);
  const [dismissed, setDismissed] = useState(false);
  useMarkSeen(res.data?.badges);
  const fresh = (res.data?.badges ?? []).filter((badge) => badge.new);
  if (!fresh.length || dismissed) return null;
  return (
    <section className="en-panel en-celebrate" role="status" aria-live="polite">
      <h2>{t('xp.badges.celebrate.title', { count: fresh.length })}</h2>
      <ul className="en-badges">
        {fresh.map((badge) => <BadgeCard key={badge.key} badge={badge} showNew={false} />)}
      </ul>
      <div className="en-actions">
        <button type="button" onClick={() => setDismissed(true)}>{t('xp.badges.celebrate.dismiss')}</button>
        {showLink ? <Link className="en-button-quiet" to="/progress#badges">{t('xp.badges.celebrate.all')}</Link> : null}
      </div>
    </section>
  );
};
