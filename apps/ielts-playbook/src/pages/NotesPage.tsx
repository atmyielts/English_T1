import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, BookMarked, ArrowLeft } from 'lucide-react';
import { SiteChrome } from '../components/content/SiteChrome';
import { useAccess } from '../lib/useAccess';
import { playbookNoteDelete, playbookNotesList, type PlaybookNote } from '../lib/api';

export const NotesPage: React.FC = () => {
  const { accessToken } = useAccess({ includeEffective: true });
  const [notes, setNotes] = useState<PlaybookNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void (async () => {
      try {
        const res = await playbookNotesList(accessToken);
        setNotes(res.notes);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load notes');
      } finally {
        setLoading(false);
      }
    })();
  }, [accessToken]);

  const removeNote = async (id: string) => {
    if (!accessToken) return;
    try {
      await playbookNoteDelete(accessToken, id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete note');
    }
  };

  const grouped = notes.reduce<Record<string, PlaybookNote[]>>((acc, note) => {
    const key = note.page?.slug ?? note.page_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(note);
    return acc;
  }, {});

  return (
    <SiteChrome compact>
      <section className="article-hero">
        <div>
          <p className="eyebrow">Personal study sheet</p>
          <h1>My notes</h1>
          <p className="hero-summary">
            Everything you highlighted across the playbook. Click any module to jump back to where it came from.
          </p>
          <div className="hero-actions">
            <Link to="/dashboard" className="button button-secondary">
              <ArrowLeft size={15} />
              Back to dashboard
            </Link>
          </div>
        </div>
      </section>

      {error ? <p className="notice-banner notice-danger">{error}</p> : null}

      {loading ? (
        <div className="route-loading">Loading notes…</div>
      ) : notes.length === 0 ? (
        <section className="content-card prose-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <BookMarked size={32} color="#7a7263" style={{ margin: '0 auto 12px', display: 'block' }} />
          <h2 style={{ fontFamily: 'Fraunces, serif' }}>No notes yet</h2>
          <p style={{ fontSize: 14.5, color: '#3b352a' }}>
            Highlight any passage while reading a module — your saved snippets land here automatically.
          </p>
        </section>
      ) : (
        <div className="page-blocks">
          {Object.entries(grouped).map(([key, group]) => {
            const firstNote = group[0];
            if (!firstNote) return null;
            const title = firstNote.page?.title ?? 'Unknown module';
            const slug = firstNote.page?.slug;
            return (
              <section key={key} className="content-card">
                <h2 style={{ fontFamily: 'Fraunces, serif' }}>
                  {slug ? <Link to={`/${slug}`} style={{ textDecoration: 'underline' }}>{title}</Link> : title}
                </h2>
                <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
                  {group.map((note) => (
                    <article
                      key={note.id}
                      style={{
                        padding: 14,
                        background: 'color-mix(in srgb, #d4a85a 8%, white)',
                        border: '1px solid #e8e2d0',
                        borderLeft: '3px solid #d4a85a',
                        borderRadius: 10,
                      }}
                    >
                      <blockquote
                        style={{
                          margin: 0,
                          fontSize: 14,
                          fontStyle: 'italic',
                          color: '#1a1814',
                          lineHeight: 1.55,
                        }}
                      >
                        "{note.anchor_text}"
                      </blockquote>
                      {note.body ? (
                        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: '#3b352a', lineHeight: 1.5 }}>
                          {note.body}
                        </p>
                      ) : null}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: '#7a7263' }}>
                          {new Date(note.updated_at).toLocaleDateString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => void removeNote(note.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#9b2c2c',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 12,
                          }}
                        >
                          <Trash2 size={13} /> Remove
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
