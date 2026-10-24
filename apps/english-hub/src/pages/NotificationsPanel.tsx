import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useT } from '../i18n';
import { getUnreadCount, onUnreadCount } from '../lib/glue';
import { Panel } from '../ui/kit';
import { RemindersPanel } from './RemindersPanel';
import '../components/glue.css';

/**
 * Settings → Notifications: every channel in one place. In the app (the
 * inbox and its bell), Telegram (daily reminder, Sunday summary, review
 * quiz; the existing /hub/reminders settings) and the weekly report.
 */
export const NotificationsPanel = () => {
  const t = useT();
  const { hash } = useLocation();
  const [unread, setUnread] = useState<number | null>(null);
  useEffect(() => onUnreadCount(setUnread), []);
  // Opened from the inbox ("/settings#notifications"): bring this section into view.
  useEffect(() => {
    if (hash !== '#notifications') return;
    // After the page's own scroll-to-top on navigation.
    const frame = window.requestAnimationFrame(() => document.getElementById('notifications')?.scrollIntoView({ block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [hash]);
  useEffect(() => {
    const controller = new AbortController();
    getUnreadCount(controller.signal).then(setUnread).catch(() => setUnread(null));
    return () => controller.abort();
  }, []);

  return (
    <div id="notifications">
      <Panel title={t('glue.notify.title')}>
        <p className="hint">{t('glue.notify.lead')}</p>
        <div className="en-stack en-notify-channel">
          <h3>{t('glue.notify.app.title')}</h3>
          <p style={{ margin: 0 }}>{t('glue.notify.app.body')}</p>
          <p className="hint" style={{ margin: 0 }}>
            {unread ? t('glue.notify.app.unread', { count: unread }) : t('glue.notify.app.allRead')}{' '}
            <Link to="/inbox">{t('glue.notify.app.open')}</Link>
          </p>
        </div>
        <RemindersPanel embedded />
        <div className="en-stack en-notify-channel">
          <h3>{t('glue.notify.weekly.title')}</h3>
          <p style={{ margin: 0 }}>{t('glue.notify.weekly.body')}</p>
          <p className="hint" style={{ margin: 0 }}><Link to="/journey">{t('glue.notify.weekly.open')}</Link></p>
        </div>
      </Panel>
    </div>
  );
};
