export const UPDATES_SEEN_STORAGE_KEY = 'schood_updates_seen_at';
export const UPDATES_SEEN_IDS_STORAGE_KEY = 'schood_updates_seen_ids_v1';

export type MarketingUpdate = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  cta_label?: string;
  cta_href?: string;
};

export const MARKETING_UPDATES: MarketingUpdate[] = [
  {
    id: 'mk-2026-01-academy',
    title: 'Academy is live',
    body: 'Teachers can now run classrooms, offers, payments, and student communication from one workspace.',
    created_at: '2026-02-13T10:00:00.000Z',
    cta_label: 'Open Academy',
    cta_href: '/academy',
  },
  {
    id: 'mk-2026-01-trials',
    title: 'Free trial claims are now available',
    body: 'Claim trial access from pricing pages before purchasing full subscriptions.',
    created_at: '2026-02-12T09:00:00.000Z',
    cta_label: 'See Pricing',
    cta_href: '/pricing',
  },
  {
    id: 'mk-2026-01-support',
    title: 'Support center upgraded',
    body: 'You can now contact support by form, email, and Telegram from one place.',
    created_at: '2026-02-11T09:00:00.000Z',
    cta_label: 'Contact Support',
    cta_href: '/contact',
  },
];

export const marketingUpdateKey = (id: string): string => `marketing:${id}`;
export const teacherMessageUpdateKey = (id: string): string => `teacher-message:${id}`;
export const teacherAlertUpdateKey = (id: string): string => `teacher-alert:${id}`;

export const readSeenUpdatesAt = (): number => {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(UPDATES_SEEN_STORAGE_KEY);
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const readSeenUpdateIds = (): Set<string> => {
  if (typeof window === 'undefined') return new Set<string>();
  const raw = window.localStorage.getItem(UPDATES_SEEN_IDS_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0));
      }
    } catch {
      // Fall through to legacy migration.
    }
  }

  const legacySeenAt = readSeenUpdatesAt();
  const migrated = new Set<string>();
  if (legacySeenAt > 0) {
    for (const item of MARKETING_UPDATES) {
      const created = Date.parse(item.created_at);
      if (Number.isFinite(created) && created <= legacySeenAt) migrated.add(marketingUpdateKey(item.id));
    }
  }
  return migrated;
};

export const writeSeenUpdateIds = (ids: Iterable<string>): void => {
  if (typeof window === 'undefined') return;
  const unique = Array.from(new Set(Array.from(ids).filter((id) => typeof id === 'string' && id.length > 0)));
  window.localStorage.setItem(UPDATES_SEEN_IDS_STORAGE_KEY, JSON.stringify(unique));
};

export const markUpdateIdsSeen = (ids: Iterable<string>): Set<string> => {
  const next = readSeenUpdateIds();
  for (const id of ids) {
    if (typeof id === 'string' && id.length > 0) next.add(id);
  }
  writeSeenUpdateIds(next);
  return next;
};
