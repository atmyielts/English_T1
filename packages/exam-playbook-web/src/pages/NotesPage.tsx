import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../../service-i18n/src/i18n.tsx';
import { Shell } from '../components/TopNav';
import { EmptyState, ErrorPanel, Skeleton, formatDate, useErrorText } from '../components/ui';
import { useT } from '../i18n';
import type { Note } from '../lib/api';
import { usePlaybook } from '../lib/context';

export const NotesPage = () => {
  const t = useT();
  const { locale } = useI18n();
  const errorText = useErrorText();
  const { api, access } = usePlaybook();
  const token = access.token!;
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    api.notes(token).then((res) => active && setNotes(res.notes ?? [])).catch((err) => active && setError(errorText(err)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, token, attempt]);

  const remove = async (id: string) => {
    try {
      await api.deleteNote(id, token);
      setNotes((list) => (list ?? []).filter((n) => n.id !== id));
    } catch (err) {
      setError(errorText(err));
    }
  };

  const q = query.trim().toLowerCase();
  const shown = (notes ?? []).filter((n) => !q || `${n.anchor_text} ${n.body} ${String(n.page?.title ?? '')}`.toLowerCase().includes(q));

  return (
    <Shell narrow>
      <section className="page-header">
        <div>
          <p className="eyebrow">{t('nav.notes')}</p>
          <h1>{t('notes.title')}</h1>
          <p>{t('notes.lead')}</p>
        </div>
      </section>
      {error ? <ErrorPanel message={error} onRetry={() => setAttempt((n) => n + 1)} /> : notes === null ? <Skeleton lines={6} /> : notes.length === 0 ? (
        <EmptyState title={t('notes.empty')} body={t('notes.emptyBody')}><Link to="/modules" className="btn solid">{t('nav.modules')}</Link></EmptyState>
      ) : (
        <section className="panel">
          <label className="field">
            <span>{t('notes.search')}</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <ul className="note-list">
            {shown.map((note) => (
              <li key={note.id}>
                <p className="task-date">
                  {note.page?.slug ? <Link to={`/${String(note.page.slug)}${note.section_id ? `#s-${note.section_id}` : ''}`}>{String(note.page.title ?? note.page.slug)}</Link> : null} · {formatDate(note.created_at, locale)}
                </p>
                {note.anchor_text ? <blockquote>{note.anchor_text}</blockquote> : null}
                {note.body ? <p>{note.body}</p> : null}
                <button type="button" className="icon-button" onClick={() => void remove(note.id)} aria-label={t('notes.delete')}><Trash2 size={15} aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
};
