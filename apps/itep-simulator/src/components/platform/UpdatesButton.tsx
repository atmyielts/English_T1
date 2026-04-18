import React, { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { ITEP_PRODUCT_SLUG } from '../../lib/constants';
import { buildPlatformUrl } from '../../lib/platformUrls';
import {
  MARKETING_UPDATES,
  UPDATES_SEEN_IDS_STORAGE_KEY,
  UPDATES_SEEN_STORAGE_KEY,
  markUpdateIdsSeen,
  marketingUpdateKey,
  readSeenUpdateIds,
} from '../../lib/updates';

const HIDDEN_PREFIXES = ['/auth', '/candidate/session', '/session/'];

export const UpdatesButton: React.FC = () => {
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentItemIds, setCurrentItemIds] = useState<string[]>([]);
  const hasUnread = unreadCount > 0;

  const isHidden = HIDDEN_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));

  const refreshUnreadCount = useCallback(() => {
    const ids = MARKETING_UPDATES.map((item) => marketingUpdateKey(item.id));
    setCurrentItemIds(ids);
    const seenIds = readSeenUpdateIds();
    const count = ids.reduce((sum, id) => (seenIds.has(id) ? sum : sum + 1), 0);
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (cancelled) return;
      void refreshUnreadCount();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [refreshUnreadCount]);

  useEffect(() => {
    const onFocus = () => void refreshUnreadCount();
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
  }, [refreshUnreadCount]);

  if (isHidden) return null;

  return (
    <button
      type="button"
      onClick={() => {
        markUpdateIdsSeen(currentItemIds);
        setUnreadCount(0);
        const href = buildPlatformUrl('/updates', window.location.href, { product: ITEP_PRODUCT_SLUG });
        window.location.assign(href);
      }}
      className={`fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full border border-gray-900 bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-lg hover:bg-gray-50 ${
        hasUnread ? 'updates-attention' : ''
      }`}
      aria-label="Open updates center"
    >
      <Bell size={16} className={hasUnread ? 'updates-attention-icon' : ''} />
      Updates
      {hasUnread ? (
        <span className="updates-attention-badge inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-[#0f172a] px-1.5 py-0.5 text-xs font-bold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </button>
  );
};

