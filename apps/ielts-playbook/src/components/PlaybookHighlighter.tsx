import React, { useEffect, useState } from 'react';
import { Highlighter, X } from 'lucide-react';
import { playbookNoteCreate } from '../lib/api';

interface Props {
  accessToken: string | null;
  pageSlug: string;
  containerRef: React.RefObject<HTMLElement | null>;
}

type FloatingState = {
  visible: boolean;
  x: number;
  y: number;
  selectedText: string;
};

// Renders a floating "Save highlight" button when the user selects text inside
// the article container. POSTs the selection + an optional note to the notes
// endpoint. Intentionally lightweight — does not visually mark the source text
// in the article (that'd require a much heavier highlight-renderer rewrite);
// instead the captured highlights live on /notes.
export const PlaybookHighlighter: React.FC<Props> = ({ accessToken, pageSlug, containerRef }) => {
  const [floating, setFloating] = useState<FloatingState>({ visible: false, x: 0, y: 0, selectedText: '' });
  const [composerOpen, setComposerOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const container = containerRef.current;
    if (!container) return;

    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setFloating((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 6) {
        setFloating((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      const range = sel.getRangeAt(0);
      const containerNode = containerRef.current;
      if (!containerNode || !containerNode.contains(range.commonAncestorContainer)) {
        setFloating((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        return;
      }
      const rect = range.getBoundingClientRect();
      setFloating({
        visible: true,
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.top + window.scrollY - 8,
        selectedText: text,
      });
    };

    document.addEventListener('mouseup', handler);
    document.addEventListener('touchend', handler);
    return () => {
      document.removeEventListener('mouseup', handler);
      document.removeEventListener('touchend', handler);
    };
  }, [accessToken, containerRef]);

  const openComposer = () => {
    setComposerOpen(true);
    setNoteText('');
    setFloating((prev) => ({ ...prev, visible: false }));
  };

  const saveNote = async () => {
    if (!accessToken) return;
    setSaving(true);
    try {
      await playbookNoteCreate(accessToken, {
        page_slug: pageSlug,
        anchor_text: floating.selectedText.slice(0, 1000),
        body: noteText.trim(),
        color: 'amber',
      });
      setComposerOpen(false);
      setSavedNotice('Saved to your notes.');
      setTimeout(() => setSavedNotice(null), 2400);
    } catch (err) {
      setSavedNotice(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (!accessToken) return null;

  return (
    <>
      {floating.visible ? (
        <button
          type="button"
          onClick={openComposer}
          style={{
            position: 'absolute',
            top: floating.y,
            left: floating.x,
            transform: 'translate(-50%, -100%)',
            padding: '6px 10px',
            background: '#1a1814',
            color: '#fff',
            border: 'none',
            borderRadius: 18,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          }}
        >
          <Highlighter size={13} />
          Save highlight
        </button>
      ) : null}

      {composerOpen ? (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 340,
            padding: 16,
            background: '#fff',
            border: '1px solid #e8e2d0',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(26, 24, 20, 0.18)',
            zIndex: 100,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontFamily: 'Fraunces, serif', fontSize: 15 }}>Save to notes</strong>
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#7a7263' }}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <blockquote
            style={{
              margin: '0 0 8px',
              padding: '8px 10px',
              fontSize: 12.5,
              fontStyle: 'italic',
              color: '#3b352a',
              borderLeft: '3px solid #d4a85a',
              background: 'color-mix(in srgb, #d4a85a 8%, white)',
            }}
          >
            {floating.selectedText.length > 220 ? `${floating.selectedText.slice(0, 220)}…` : floating.selectedText}
          </blockquote>
          <textarea
            placeholder="Add a note (optional)"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
            style={{
              width: '100%',
              padding: 8,
              fontSize: 13.5,
              border: '1px solid #d4cdb9',
              borderRadius: 6,
              resize: 'vertical',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          <button
            type="button"
            className="button button-primary"
            onClick={() => void saveNote()}
            disabled={saving}
            style={{ marginTop: 8, width: '100%' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : null}

      {savedNotice ? (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '10px 16px',
            background: '#1f8a55',
            color: '#fff',
            fontSize: 13.5,
            fontWeight: 600,
            borderRadius: 10,
            zIndex: 110,
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          }}
        >
          {savedNotice}
        </div>
      ) : null}
    </>
  );
};
