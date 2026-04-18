import React, { useMemo, useRef, useState } from 'react';

export type PassageAnnotation = {
  id: string;
  type: 'highlight' | 'note';
  start: number;
  end: number;
  note?: string;
  created_at: number;
};

type SelectionState = {
  start: number;
  end: number;
  text: string;
  rect: { top: number; left: number; width: number; height: number };
};

type Props = {
  sessionId: string;
  unitId: string;
  title?: string | null;
  text: string;
  annotations: PassageAnnotation[];
  onChange: (next: PassageAnnotation[]) => void;
};

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

const normalizeAnnotations = (textLen: number, raw: PassageAnnotation[]): PassageAnnotation[] => {
  const clean = raw
    .filter((a) => a && typeof a.start === 'number' && typeof a.end === 'number')
    .map((a) => ({
      ...a,
      start: clamp(Math.floor(a.start), 0, textLen),
      end: clamp(Math.floor(a.end), 0, textLen),
    }))
    .filter((a) => a.end > a.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  // Enforce non-overlapping by dropping overlaps (simple, predictable behaviour).
  const out: PassageAnnotation[] = [];
  let cursor = -1;
  for (const a of clean) {
    if (a.start < cursor) continue;
    out.push(a);
    cursor = a.end;
  }
  return out;
};

const stripSelection = () => {
  try {
    const sel = window.getSelection();
    sel?.removeAllRanges();
  } catch {
    // ignore
  }
};

export const PassageViewer: React.FC<Props> = ({ sessionId, unitId, title, text, annotations, onChange }) => {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);

  const [createNoteOpen, setCreateNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [activeNote, setActiveNote] = useState<PassageAnnotation | null>(null);

  const normalized = useMemo(() => normalizeAnnotations(text.length, annotations), [annotations, text.length]);

  const nodes = useMemo(() => {
    const parts: React.ReactNode[] = [];
    let cursor = 0;

    for (const a of normalized) {
      if (cursor < a.start) {
        parts.push(<span key={`t:${cursor}`}>{text.slice(cursor, a.start)}</span>);
      }

      const chunk = text.slice(a.start, a.end);
      if (a.type === 'note') {
        parts.push(
          <span
            key={`n:${a.id}`}
            className="inspera-note"
            title={a.note ? `Note: ${a.note}` : 'Note'}
            onClick={() => {
              setActiveNote(a);
            }}
          >
            {chunk}
          </span>,
        );
      } else {
        parts.push(
          <mark
            key={`h:${a.id}`}
            className="inspera-highlight"
            title="Click to remove highlight"
            onClick={() => {
              const next = normalized.filter((x) => x.id !== a.id);
              onChange(next);
            }}
          >
            {chunk}
          </mark>,
        );
      }

      cursor = a.end;
    }

    if (cursor < text.length) parts.push(<span key={`t:${cursor}`}>{text.slice(cursor)}</span>);
    return parts;
  }, [normalized, onChange, text]);

  const getSelectionState = (): SelectionState | null => {
    const root = bodyRef.current;
    if (!root) return null;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    if (!root.contains(range.commonAncestorContainer)) return null;

    try {
      const preStart = document.createRange();
      preStart.setStart(root, 0);
      preStart.setEnd(range.startContainer, range.startOffset);
      const start = preStart.toString().length;

      const preEnd = document.createRange();
      preEnd.setStart(root, 0);
      preEnd.setEnd(range.endContainer, range.endOffset);
      const end = preEnd.toString().length;

      const rect = range.getBoundingClientRect();
      const cleanStart = Math.min(start, end);
      const cleanEnd = Math.max(start, end);
      const selectedText = range.toString();

      if (cleanEnd <= cleanStart) return null;
      if (!selectedText.trim()) return null;

      return {
        start: clamp(cleanStart, 0, text.length),
        end: clamp(cleanEnd, 0, text.length),
        text: selectedText,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      };
    } catch {
      return null;
    }
  };

  const syncSelection = () => {
    const s = getSelectionState();
    setSelection(s);
  };

  const addAnnotation = (type: PassageAnnotation['type'], start: number, end: number, note?: string) => {
    const next = normalizeAnnotations(text.length, [
      // drop overlaps for simplicity
      ...normalized.filter((a) => a.end <= start || a.start >= end),
      { id: crypto.randomUUID(), type, start, end, note, created_at: Date.now() },
    ]);
    onChange(next);
  };

  const toolbar = (() => {
    if (!selection) return null;
    const top = Math.max(8, selection.rect.top - 46);
    const left = clamp(selection.rect.left, 8, Math.max(8, window.innerWidth - 240));
    return (
      <div
        className="fixed z-50 bg-white border border-gray-200 shadow-lg rounded-lg px-2 py-1 flex items-center gap-2 text-sm"
        style={{ top, left }}
      >
        <button
          type="button"
          className="px-2 py-1 rounded hover:bg-gray-100 font-semibold"
          onClick={() => {
            addAnnotation('highlight', selection.start, selection.end);
            setSelection(null);
            stripSelection();
          }}
        >
          Highlight
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded hover:bg-gray-100 font-semibold"
          onClick={() => {
            setNoteDraft('');
            setCreateNoteOpen(true);
          }}
        >
          Note
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded hover:bg-gray-100 text-gray-600"
          onClick={() => {
            setSelection(null);
            stripSelection();
          }}
        >
          Cancel
        </button>
      </div>
    );
  })();

  return (
    <div className="bg-[var(--inspera-panel)] text-[var(--inspera-text)] border border-[var(--inspera-border)] rounded">
      {title ? <div className="px-4 py-3 border-b border-[var(--inspera-border)] font-bold">{title}</div> : null}

      <div
        ref={bodyRef}
        className="px-4 py-4 whitespace-pre-wrap inspera-prose select-text"
        onMouseUp={syncSelection}
        onKeyUp={syncSelection}
      >
        {nodes}
      </div>

      {toolbar}

      {createNoteOpen && selection ? (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6"
          onClick={() => setCreateNoteOpen(false)}
        >
          <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Note</div>
            <div className="mt-2 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded p-3">
              <div className="font-semibold text-gray-900 mb-1">Selected text</div>
              <div className="whitespace-pre-wrap">{selection.text}</div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-semibold text-gray-900 mb-2">Your note</label>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-100 focus:border-amber-400"
                placeholder="Type a short note..."
                autoFocus
              />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
                onClick={() => setCreateNoteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-gray-900 hover:bg-black text-white font-semibold"
                onClick={() => {
                  const note = noteDraft.trim();
                  if (note) addAnnotation('note', selection.start, selection.end, note);
                  setCreateNoteOpen(false);
                  setSelection(null);
                  stripSelection();
                }}
              >
                Save note
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeNote ? (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={() => setActiveNote(null)}>
          <div className="w-full max-w-xl bg-white border border-gray-200 rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500">Note</div>
            <div className="mt-2 text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded p-3">
              <div className="font-semibold text-gray-900 mb-1">Your note</div>
              <div className="whitespace-pre-wrap">{activeNote.note ?? ''}</div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 font-semibold"
                onClick={() => setActiveNote(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
                onClick={() => {
                  const next = normalized.filter((x) => x.id !== activeNote.id);
                  onChange(next);
                  setActiveNote(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Keep this in the DOM for debugging/telemetry if needed */}
      <div className="sr-only" aria-hidden="true">
        {sessionId}:{unitId}
      </div>
    </div>
  );
};
