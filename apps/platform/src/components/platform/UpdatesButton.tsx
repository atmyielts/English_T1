import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supportAnnouncementsList, type PlatformAnnouncement } from '../../lib/platformClient';
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
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentItemIds, setCurrentItemIds] = useState<string[]>([]);
  const [announcements, setAnnouncements] = useState<PlatformAnnouncement[]>([]);

  const isUpdatesPage = location.pathname.startsWith('/updates');
  const isHidden = HIDDEN_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
  const hasUnread = unreadCount > 0;

  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await supportAnnouncementsList({ limit: 100 });
      setAnnouncements(res.announcements ?? []);
    } catch {
      // Keep updates button non-blocking if announcements endpoint is temporarily unavailable.
      setAnnouncements([]);
    }
  }, []);

  const refreshUnreadCount = useCallback(() => {
    const ids = [
      ...MARKETING_UPDATES.map((item) => marketingUpdateKey(item.id)),
      ...announcements.map((item) => platformAnnouncementUpdateKey(item.id)),
    ];
    setCurrentItemIds(ids);

    if (isUpdatesPage) {
      markUpdateIdsSeen(ids);
      setUnreadCount(0);
      return;
    }

    const seenIds = readSeenUpdateIds();
    const count = ids.reduce((sum, id) => (seenIds.has(id) ? sum : sum + 1), 0);
    setUnreadCount(count);
  }, [announcements, isUpdatesPage]);

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
