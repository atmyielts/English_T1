import React, { useEffect, useState } from 'react';
import { Highlighter, X } from 'lucide-react';
import { apiErrorStatus, playbookNoteCreate } from '../lib/api';
import { useT } from '../i18n';

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

const EDGE = 12;
const BUTTON_HALF_WIDTH = 72;

/** Keep the floating button inside the viewport even when the selection hugs an edge. */
export const clampToViewport = (x: number, y: number, viewportWidth: number): { x: number; y: number } => ({
  x: Math.min(Math.max(x, EDGE + BUTTON_HALF_WIDTH), Math.max(EDGE + BUTTON_HALF_WIDTH, viewportWidth - EDGE - BUTTON_HALF_WIDTH)),
  // The button is drawn above the point; never let it leave the top edge.
  y: Math.max(y, 48),
});

// Floating "Save highlight" button for text selected inside the article. The
// selection and an optional note are saved to /notes.
export const PlaybookHighlighter: React.FC<Props> = ({ accessToken, pageSlug, containerRef }) => {
  const t = useT();
  const [floating, setFloating] = useState<FloatingState>({ visible: false, x: 0, y: 0, selectedText: '' });
  const [composerOpen, setComposerOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const container = containerRef.current;
    if (!container) return;

    const hide = () => setFloating((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return hide();
      const text = sel.toString().trim();
      if (text.length < 3) return hide();
      const range = sel.getRangeAt(0);
      const containerNode = containerRef.current;
      if (!containerNode || !containerNode.contains(range.commonAncestorContainer)) return hide();
      // Viewport coordinates paired with position: fixed below.
      const rect = range.getBoundingClientRect();
      const point = clampToViewport(rect.left + rect.width / 2, rect.top - 8, window.innerWidth);
      setFloating({ visible: true, x: point.x, y: point.y, selectedText: text });
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
      setNotice({ kind: 'ok', text: t('highlight.saved') });
      setTimeout(() => setNotice(null), 2400);
    } catch (err) {
      const status = apiErrorStatus(err);
      setNotice({
        kind: 'error',
        text: status === 403 ? t('error.premiumRequired') : status === 401 ? t('error.signedOut') : t('highlight.saveError'),
      });
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
          className="highlight-fab"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openComposer}
          style={{ top: floating.y, left: floating.x }}
        >
          <Highlighter size={13} />
          {t('highlight.save')}
        </button>
      ) : null}

      {composerOpen ? (
        <div className="highlight-composer" role="dialog" aria-label={t('highlight.title')}>
          <div className="highlight-composer-head">
            <strong>{t('highlight.title')}</strong>
            <button type="button" className="icon-button" onClick={() => setComposerOpen(false)} aria-label={t('common.close')}>
              <X size={16} />
            </button>
          </div>
          <blockquote>
            {floating.selectedText.length > 220 ? `${floating.selectedText.slice(0, 220)}…` : floating.selectedText}
          </blockquote>
          <textarea
            placeholder={t('highlight.notePlaceholder')}
            aria-label={t('highlight.notePlaceholder')}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            rows={3}
          />
          <button type="button" className="button button-primary" onClick={() => void saveNote()} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
          {notice?.kind === 'error' ? <p className="inline-error" role="alert">{notice.text}</p> : null}
        </div>
      ) : null}

      {notice?.kind === 'ok' ? <div className="highlight-toast" role="status">{notice.text}</div> : null}
    </>
  );
};
