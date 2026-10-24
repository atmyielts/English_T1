import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { inboxText } from '../components/Inbox';
import { useI18n, useT } from '../i18n';
import { getInbox, markInboxRead, setUnreadCount, type InboxItem } from '../lib/glue';
import { useResource } from '../lib/useResource';
import { EmptyState, ErrorState, Loading, PageHeader, Panel, useErrorMessage } from '../ui/kit';
import '../components/glue.css';

const isStored = (item: InboxItem) => /^[0-9a-f-]{36}$/i.test(item.id);

/** /inbox: every notice in one place (level-ups, badges, streak, reviews, checks, reports, service notices). */
export const InboxPage = () => {
  const t = useT();
  const { date } = useI18n();
  const navigate = useNavigate();
  const errorText = useErrorMessage();
  const inbox = useResource((signal) => getInbox(signal), []);
  const [read, setRead] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const items = (inbox.data?.items ?? []).map((item) => (read.has(item.id) ? { ...item, read: true } : item));
  const unread = items.filter((item) => !item.read);

  const mark = async (targets: InboxItem[]) => {
    const ids = targets.filter((item) => !item.read && isStored(item)).map((item) => item.id);
    if (!ids.length) return;
    setRead(new Set([...read, ...ids]));
    setUnreadCount(Math.max(0, unread.length - ids.length));
    try {
      await markInboxRead(ids.length === unread.length ? { all: true } : { ids });
    } catch (cause) {
      setError(cause);
    }
  };

  const open = (item: InboxItem) => {
    void mark([item]);
    if (item.link) navigate(item.link);
  };

  const markAll = async () => {
    setBusy(true);
    setError(null);
    await mark(unread);
    setBusy(false);
  };

  return (
    <>
      <PageHeader
        eyebrow={t('glue.inbox.eyebrow')}
        title={t('glue.inbox.title')}
        lead={t('glue.inbox.lead')}
        actions={unread.length ? (
          <button type="button" className="quiet" disabled={busy} onClick={() => void markAll()}>{t('glue.inbox.markAll')}</button>
        ) : null}
      />
      <Panel>
        {inbox.loading && !inbox.data ? <Loading lines={5} /> : null}
        {inbox.error && !inbox.data ? <ErrorState error={inbox.error} onRetry={inbox.reload} /> : null}
        {inbox.data && !items.length ? (
          <EmptyState title={t('glue.inbox.empty.title')} body={t('glue.inbox.empty.body')} action={<Link className="en-button-quiet" to="/today">{t('nav.today')}</Link>} />
        ) : null}
        {items.length ? (
          <ul className="en-list en-inbox">
            {items.map((item) => {
              const text = inboxText(item, t);
              const content = (
                <>
                  <span className={`en-inbox-dot is-${item.kind}`} aria-hidden="true" />
                  <span className="en-item-main">
                    <strong>{text.title}</strong>
                    {text.body ? <span>{text.body}</span> : null}
                    <small className="hint">
                      {item.live ? t('glue.inbox.now') : date(item.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {item.read ? null : <span className="visually-hidden"> · {t('glue.inbox.unread')}</span>}
                    </small>
                  </span>
                </>
              );
              return (
                <li key={item.id} className={item.read ? 'is-read' : 'is-unread'}>
                  {item.link ? (
                    <button type="button" className="en-item en-inbox-item" onClick={() => open(item)}>{content}</button>
                  ) : (
                    <div className="en-item en-inbox-item">
                      {content}
                      {!item.read && isStored(item) ? (
                        <button type="button" className="quiet en-inbox-read" onClick={() => void mark([item])}>{t('glue.inbox.markRead')}</button>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
        {error ? <p className="error" role="alert">{errorText(error)}</p> : null}
        <p className="hint" style={{ marginBottom: 0 }}>
          {t('glue.inbox.settingsHint')} <Link to="/settings#notifications">{t('glue.inbox.settingsLink')}</Link>
        </p>
      </Panel>
    </>
  );
};
