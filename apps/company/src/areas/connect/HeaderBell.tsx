// The notifications bell in the workspace header: an unread count that stays fresh, and
// the latest few on click. The shell mounts it before the workspace has loaded, so it
// takes only the workspace id and needs no workspace context.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api.ts';
import { useAppT } from '../../i18n/index.ts';
import { Link, navigate } from '../../router.tsx';
import { useDateText, useNoticeText, type Notice } from './shared.tsx';

const POLL = 60_000;

export function HeaderBell({ orgId }: { orgId: string }) {
  const t = useAppT(), text = useNoticeText(), { when } = useDateText();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const count = useCallback(async () => {
    try {
      setUnread((await api<{ unread: number }>(`orgs/${orgId}/connect/notices/count`)).unread);
    } catch { /* The bell stays as it was; the next poll tries again. */ }
  }, [orgId]);

  // Only while the tab is in view: a background tab does not need to keep asking.
  useEffect(() => {
    void count();
    const timer = setInterval(() => { if (!document.hidden) void count(); }, POLL);
    const back = () => { if (!document.hidden) void count(); };
    document.addEventListener('visibilitychange', back);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', back); };
  }, [count]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setFailed(false);
    try {
      const result = await api<{ notices: Notice[]; unread: number }>(`orgs/${orgId}/connect/notices?limit=6`);
      setNotices(result.notices);
      setUnread(result.unread);
    } catch {
      setFailed(true);
    }
  }

  async function follow(notice: Notice) {
    setOpen(false);
    if (!notice.read_at) {
      setUnread((value) => Math.max(0, value - 1));
      void api(`orgs/${orgId}/connect/notices/${notice.id}/read`, { method: 'POST' }).catch(() => undefined);
    }
    navigate(notice.link ?? `/w/${orgId}/notifications`);
  }

  const label = unread ? `${t('connect.bell.label')}: ${t('connect.bell.unread', { count: unread })}` : t('connect.bell.label');
  return <div className="connect-bell" ref={root}>
    <button type="button" className="quiet connect-bell-button" aria-label={label} aria-expanded={open} onClick={() => void toggle()}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
      {unread > 0 && <span className="connect-bell-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div className="connect-bell-panel">
      {failed ? <p className="error" role="alert">{t('connect.bell.failed')}</p>
        : !notices ? <p role="status">{t('app.loading')}</p>
        : !notices.length ? <p>{t('connect.bell.empty')}</p>
        : <ul>{notices.map((notice) => <li key={notice.id} className={notice.read_at ? '' : 'unread'}>
          <button type="button" onClick={() => void follow(notice)}>
            <span>{text(notice)}</span>
            <small>{when(notice.created_at)}</small>
          </button>
        </li>)}</ul>}
      <Link to={`/w/${orgId}/notifications`} className="connect-bell-all" onClick={() => setOpen(false)}>{t('connect.bell.all')}</Link>
    </div>}
  </div>;
}
