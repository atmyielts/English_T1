import { useCallback, useEffect, useState } from 'react';
import { platformUrl } from '../lib/supabase';
import { teacherStudioStudentFeed } from '../lib/client';
import {
  MARKETING_UPDATES,
  UPDATES_SEEN_IDS_STORAGE_KEY,
  UPDATES_SEEN_STORAGE_KEY,
  markUpdateIdsSeen,
  marketingUpdateKey,
  readSeenUpdateIds,
  teacherAlertUpdateKey,
  teacherMessageUpdateKey,
} from '../lib/updates';

export const UpdatesButton = () => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentItemIds, setCurrentItemIds] = useState<string[]>([]);
  const productSlug = String(import.meta.env.VITE_PLATFORM_PRODUCT_SLUG ?? 'academy').trim() || 'academy';

  const refreshUnreadCount = useCallback(async () => {
    const itemIds = new Set<string>(MARKETING_UPDATES.map((item) => marketingUpdateKey(item.id)));

    try {
      const feed = await teacherStudioStudentFeed();
      for (const message of feed.messages) itemIds.add(teacherMessageUpdateKey(message.id));
      for (const alert of feed.alerts) itemIds.add(teacherAlertUpdateKey(alert.id));
    } catch {
      // Keep button available even if student feed is not accessible for this account.
    }

    const ids = Array.from(itemIds);
    setCurrentItemIds(ids);
    const seen = readSeenUpdateIds();
    const count = ids.reduce((sum, id) => (seen.has(id) ? sum : sum + 1), 0);
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    void refreshUnreadCount();
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

  return (
    <button
      type="button"
      className="updates-fab"
      onClick={() => {
        markUpdateIdsSeen(currentItemIds);
        setUnreadCount(0);
        const target = platformUrl.replace(/\/$/, '');
        const returnTo = window.location.href;
        const href = `${target}/updates?returnTo=${encodeURIComponent(returnTo)}&product=${encodeURIComponent(productSlug)}`;
        window.location.assign(href);
      }}
      aria-label="Open updates center"
    >
      <span aria-hidden="true">🔔</span>
      Updates
      {unreadCount > 0 ? (
        <span className="updates-count">{unreadCount > 99 ? '99+' : unreadCount}</span>
      ) : null}
    </button>
  );
};
