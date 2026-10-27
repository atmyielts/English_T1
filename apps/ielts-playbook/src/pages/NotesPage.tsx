import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, BookMarked, ArrowLeft } from 'lucide-react';
import { SiteChrome } from '../components/content/SiteChrome';
import { PageSkeleton } from '../components/PlaybookPremium';
import { useLocale, useT } from '../i18n';
import { useAccess } from '../lib/useAccess';
import { playbookNoteDelete, playbookNotesList, type PlaybookNote } from '../lib/api';

export const NotesPage: React.FC = () => {
  const t = useT();
  const { date } = useLocale();
  const { accessToken } = useAccess({ includeEffective: true });
  const [notes, setNotes] = useState<PlaybookNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    playbookNotesList(accessToken)
      .then((res) => {
        if (active) setNotes(Array.isArray(res.notes) ? res.notes : []);
      })
      .catch(() => {
        if (active) setError(t('notes.loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, t]);

  const removeNote = async (id: string) => {
    if (!accessToken) return;
    setRemoving(id);
    setError(null);
    try {
      await playbookNoteDelete(accessToken, id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      setError(t('notes.deleteError'));
    } finally {
      setRemoving(null);
    }
  };

  const grouped = notes.reduce<Record<string, PlaybookNote[]>>((acc, note) => {
    const key = note.page?.slug ?? note.page_id;
    (acc[key] ??= []).push(note);
    return acc;
  }, {});

  return (
    <SiteChrome compact>
      <section className="article-hero">
        <div>
          <p className="eyebrow">{t('notes.eyebrow')}</p>
          <h1>{t('notes.title')}</h1>
          <p className="hero-summary">{t('notes.lead')}</p>
          <div className="hero-actions">
            <Link to="/dashboard" className="button button-secondary">
              <ArrowLeft size={15} />
              {t('notes.back')}
            </Link>
          </div>
        </div>
      </section>

      {error ? <p className="notice-banner notice-danger" role="alert">{error}</p> : null}

      {loading ? (
        <PageSkeleton />
      ) : notes.length === 0 ? (
        <section className="content-card prose-card empty-state" data-testid="notes-empty">
          <BookMarked size={32} />
          <h2>{t('notes.empty.title')}</h2>
          <p>{t('notes.empty.body')}</p>
          <Link to="/essentials" className="button button-primary">{t('notes.empty.cta')}</Link>
        </section>
      ) : (
        <div className="page-blocks">
          {Object.entries(grouped).map(([key, group]) => {
            const firstNote = group[0];
            if (!firstNote) return null;
            const title = firstNote.page?.title ?? t('notes.unknownModule');
            const slug = firstNote.page?.slug;
            return (
              <section key={key} className="content-card">
                <h2>{slug ? <Link to={`/${slug}`} className="underline-link">{title}</Link> : title}</h2>
                <div className="note-list">
                  {group.map((note) => (
                    <article key={note.id} className="note-item">
                      <blockquote>“{note.anchor_text}”</blockquote>
                      {note.body ? <p>{note.body}</p> : null}
                      <div className="note-foot">
                        <span>{date(note.updated_at, { dateStyle: 'medium' })}</span>
                        <button
                          type="button"
                          className="link-button danger"
                          onClick={() => void removeNote(note.id)}
                          disabled={removing === note.id}
                        >
                          <Trash2 size={13} /> {t('notes.remove')}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </SiteChrome>
  );
};
