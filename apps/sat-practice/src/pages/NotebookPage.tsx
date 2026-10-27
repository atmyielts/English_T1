import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MistakeNotebookList } from '../components/MistakeNotebookList';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { notebookGet, notebookPatch, notebookRetry, type NotebookItem } from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { useAppT, useErrorText } from '../i18n';

export const NotebookPage = () => {
  const t = useAppT();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [items, setItems] = useState<NotebookItem[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null), [reload, setReload] = useState(0);
  const sending = useRef(false), actor = useRef(accessToken);
  actor.current = accessToken;

  useEffect(() => {
    let active = true; setLoading(true); setItems([]); setError(null);
    if (!accessToken) return () => { active = false; };
    notebookGet(accessToken).then(res => { if (active) setItems(res.items); })
      .catch(err => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, reload]);

  const retry = async (item: NotebookItem) => {
    if (!accessToken || sending.current || loading) return;
    sending.current = true; setBusy(true); setError(null);
    try {
      const res = await notebookRetry(accessToken, item.id);
      if (actor.current === accessToken) navigate(`/lab/${res.attempt.id}`);
    } catch (err) {
      if (actor.current === accessToken) setError(err);
    } finally { sending.current = false; setBusy(false); }
  };

  const tag = async (item: NotebookItem, reasonTag: string) => {
    if (!accessToken || sending.current || loading) return;
    sending.current = true; setBusy(true); setError(null);
    try {
      const res = await notebookPatch(accessToken, item.id, { reason_tag: reasonTag });
      if (actor.current === accessToken) setItems(rows => rows.map(row => row.id === item.id ? { ...row, ...res.item } : row));
    } catch (err) {
      if (actor.current === accessToken) setError(err);
    } finally { sending.current = false; setBusy(false); }
  };

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">{t('notebook.eyebrow')}</p>
            <h1>{t('notebook.title')}</h1>
          </div>
        </header>
        {error ? <div role="alert" className="alert error">{errorText(error)} <button type="button" className="btn" disabled={loading || busy} onClick={() => setReload(v => v + 1)}>{t('notebook.retryLoad')}</button></div> : null}
        <section className="panel">
          {loading ? <p role="status">{t('notebook.loading')}</p> : !error && items.length === 0 ? <div className="empty-state">{t('notebook.empty')}</div> : null}
          <MistakeNotebookList items={items} busy={loading || busy} onRetry={item => void retry(item)} onTag={(item, reason) => void tag(item, reason)} />
        </section>
      </main>
    </div>
  );
};
