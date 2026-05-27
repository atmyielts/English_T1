import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supportAnnouncementsList, supportAnnouncementsMarkRead, type PlatformAnnouncement } from '../../lib/platformClient';
import { supabase } from '../../lib/supabase';
import {
  MARKETING_UPDATES,
  UPDATES_SEEN_IDS_STORAGE_KEY,
  UPDATES_SEEN_STORAGE_KEY,
  markUpdateIdsSeen,
  marketingUpdateKey,
  platformAnnouncementUpdateKey,
  readSeenUpdateIds,
} from '../../lib/updates';
import { useI18n } from '../../i18n';

const HIDDEN_PREFIXES = ['/auth', '/admin', '/candidate'];

export const UpdatesButton: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentItemIds, setCurrentItemIds] = useState<string[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);

  const isUpdatesPage = location.pathname.startsWith('/updates');
  const isHidden = HIDDEN_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
  const hasUnread = unreadCount > 0;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setAccessToken(session?.access_token ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await supportAnnouncementsList({ limit: 100, accessToken });
      setAnnouncements(res.announcements ?? []);
    } catch {
      // Keep updates button non-blocking if announcements endpoint is temporarily unavailable.
      setAnnouncements([]);
    }
  }, [accessToken]);

  const refreshUnreadCount = useCallback(() => {
    const marketingIds = MARKETING_UPDATES.map((item) => marketingUpdateKey(item.id));
    const announcementIds = announcements.map((item) => platformAnnouncementUpdateKey(item.id));
    const ids = [...marketingIds, ...announcementIds];
    setCurrentItemIds(ids);

    if (isUpdatesPage) {
      markUpdateIdsSeen(ids);
      setUnreadCount(0);
      return;
    }

    const seenIds = readSeenUpdateIds();
    const marketingUnread = marketingIds.reduce((sum, id) => (seenIds.has(id) ? sum : sum + 1), 0);
    const announcementUnread = announcements.reduce((sum, item) => {
      const key = platformAnnouncementUpdateKey(item.id);
      if (accessToken) return item.is_read ? sum : sum + 1;
      return seenIds.has(key) ? sum : sum + 1;
    }, 0);
    const count = marketingUnread + announcementUnread;
    setUnreadCount(count);
  }, [accessToken, announcements, isUpdatesPage]);

  const markAnnouncementsRead = useCallback((items: PlatformAnnouncement[]) => {
    const ids = items.map((item) => item.id).filter(Boolean);
    if (ids.length === 0) return;

    const nowIso = new Date().toISOString();
    setAnnouncements((prev) =>
      prev.map((item) => (ids.includes(item.id) ? { ...item, is_read: true, read_at: item.read_at ?? nowIso } : item)),
    );

    if (!accessToken) return;
    void supportAnnouncementsMarkRead(accessToken, ids).catch(() => {
      // Local read state already hides the badge; server receipts will retry on the next visit/focus.
    });
  }, [accessToken]);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      refreshUnreadCount();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isUpdatesPage, refreshUnreadCount]);

  useEffect(() => {
    if (!isUpdatesPage || !accessToken || announcements.length === 0) return;
    const unread = announcements.filter((item) => !item.is_read);
    markAnnouncementsRead(unread);
  }, [accessToken, announcements, isUpdatesPage, markAnnouncementsRead]);

  useEffect(() => {
    const onFocus = () => {
      void loadAnnouncements();
      void refreshUnreadCount();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === UPDATES_SEEN_IDS_STORAGE_KEY || event.key === UPDATES_SEEN_STORAGE_KEY) {
        void refreshUnreadCount();
      }
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, [loadAnnouncements, refreshUnreadCount]);

  if (isHidden || isUpdatesPage) return null;

  return (
    <button
      type="button"
      onClick={() => {
        markUpdateIdsSeen(currentItemIds);
        markAnnouncementsRead(announcements.filter((item) => !item.is_read));
        setUnreadCount(0);
        navigate('/updates');
      }}
      className={`fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-gray-900 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-lg hover:bg-gray-50 ${
        hasUnread ? 'updates-attention' : ''
      }`}
      aria-label={t('updates.buttonAria')}
    >
      <Bell size={16} className={hasUnread ? 'updates-attention-icon' : ''} />
      {t('nav.updates')}
      {hasUnread ? (
        <span className="updates-attention-badge inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-[#0f172a] px-1.5 py-0.5 text-xs font-bold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </button>
  );
};
