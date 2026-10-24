import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { getUnreadCount, onUnreadCount, type InboxItem } from '../lib/glue';
import './glue.css';

type T = ReturnType<typeof useT>;

const BellIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M8 1.5a4.5 4.5 0 0 1 4.5 4.5v2.4l1.2 2.1a.75.75 0 0 1-.65 1.12H2.95a.75.75 0 0 1-.65-1.12L3.5 8.4V6A4.5 4.5 0 0 1 8 1.5Zm0 1.5a3 3 0 0 0-3 3v2.6a.75.75 0 0 1-.1.37l-.66 1.15h7.52l-.66-1.15a.75.75 0 0 1-.1-.37V6a3 3 0 0 0-3-3Zm-1.75 9.75h3.5a1.75 1.75 0 0 1-3.5 0Z" />
  </svg>
);

/**
 * The bell in the workspace top bar, next to the XP chip: unread notices,
 * refreshed at most once a minute while moving between pages.
 */
export const InboxBell = ({ pathname }: { pathname: string }) => {
  const t = useT();
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => onUnreadCount(setUnread), []);
  useEffect(() => {
    const controller = new AbortController();
    getUnreadCount(controller.signal)
      .then(setUnread)
      .catch(() => { /* The bell is optional; pages work without it. */ });
    return () => controller.abort();
  }, [pathname]);

  if (unread === null) return null;
  const label = unread > 0 ? t('glue.inbox.bellUnread', { count: unread }) : t('glue.inbox.bell');
  return (
    <Link className={`en-ws-bell ${unread > 0 ? 'has-unread' : ''}`.trim()} to="/inbox" aria-label={label} title={label}>
      <BellIcon />
      {unread > 0 ? <span className="en-ws-bell-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span> : null}
    </Link>
  );
};

const serviceName = (service: unknown, t: T): string =>
  service === 'tutor' ? t('nav.tutor') : typeof service === 'string' ? t(`skill.${service}`) : '';

/** Title and body of a notice in the learner's language (operator notices bring their own text). */
export const inboxText = (item: InboxItem, t: T): { title: string; body: string | null } => {
  const p = item.params;
  const num = (value: unknown) => (typeof value === 'number' ? value : Number(value) || 0);
  const str = (value: unknown) => (value === null || value === undefined ? '' : String(value));
  switch (item.kind) {
    case 'level_up':
      return {
        title: t('glue.inbox.level_up.title'),
        body: p.skill ? t('glue.inbox.level_up.skill', { skill: t(`skill.${str(p.skill)}`), level: str(p.level) }) : t('glue.inbox.level_up.body', { level: str(p.level) }),
      };
    case 'badge':
      return { title: t('glue.inbox.badge.title', { badge: t(`xp.badge.${str(p.badge)}.title`) }), body: t('glue.inbox.badge.body') };
    case 'streak_risk':
      return { title: t('glue.inbox.streak_risk.title', { count: num(p.days) }), body: t('glue.inbox.streak_risk.body') };
    case 'review_due':
      return { title: t('glue.inbox.review_due.title', { count: num(p.count) }), body: t('glue.inbox.review_due.body') };
    case 'check_ready':
      return { title: t('glue.inbox.check_ready.title'), body: t('glue.inbox.check_ready.body') };
    case 'assignment_due':
      return {
        title: item.title ?? t('glue.inbox.assignment_due.title', { title: str(p.title) }),
        body: item.body ?? (p.due ? t('glue.inbox.assignment_due.body', { due: str(p.due) }) : null),
      };
    case 'weekly_report':
      return { title: t('glue.inbox.weekly_report.title'), body: t('glue.inbox.weekly_report.body', { count: num(p.activities) }) };
    case 'certificate':
      return { title: t('glue.inbox.certificate.title', { level: str(p.level) }), body: t('glue.inbox.certificate.body') };
    case 'service_paused':
      return { title: t('glue.inbox.service_paused.title', { service: serviceName(p.service, t) }), body: t('glue.inbox.service_paused.body') };
    default:
      return { title: item.title ?? t('glue.inbox.system.title'), body: item.body };
  }
};
