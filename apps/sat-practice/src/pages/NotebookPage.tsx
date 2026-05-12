import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MistakeNotebookList } from '../components/MistakeNotebookList';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { notebookGet, notebookPatch, notebookRetry, type NotebookItem } from '../lib/api';
import { useAccess } from '../lib/useAccess';

export const NotebookPage = () => {
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [items, setItems] = useState<NotebookItem[]>([]);

  const load = async () => {
    if (!accessToken) return;
    setItems((await notebookGet(accessToken)).items);
  };

  useEffect(() => {
    void load();
  }, [accessToken]);

  const retry = async (item: NotebookItem) => {
    if (!accessToken) return;
    const res = await notebookRetry(accessToken, item.id);
    navigate(`/lab/${res.attempt.id}`);
  };

  const tag = async (item: NotebookItem, reasonTag: string) => {
    if (!accessToken) return;
    await notebookPatch(accessToken, item.id, { reason_tag: reasonTag });
    await load();
  };

  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">Mistake Notebook</p>
            <h1>Every miss becomes a repair target</h1>
          </div>
        </header>
        <section className="panel">
          {items.length === 0 ? <div className="empty-state">No notebook entries yet. Submit a drill or finish a simulator mock.</div> : null}
          <MistakeNotebookList items={items} onRetry={retry} onTag={tag} />
        </section>
      </main>
    </div>
  );
};
