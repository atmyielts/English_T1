import { Link } from 'react-router-dom';
import { useI18n, useT } from '../i18n';
import { useL1Library, type L1Note } from '../lib/l1';
import './practice.css';

const headingKey = (note: L1Note): string => (note.speakers === 'ru' ? 'l1.why.ru' : note.speakers === 'uz' ? 'l1.why.uz' : 'l1.why.both');

/** The note's explanation in the UI language, with an example and the handbook rule. */
export const L1NoteBody = ({ note, mine }: { note: L1Note; mine?: string | null }) => {
  const t = useT();
  const { locale } = useI18n();
  const example = note.examples[0];
  return (
    <div className="en-l1-body">
      <p>{note.why[locale]}</p>
      {mine ? <p className="hint"><strong>{t('traps.yours')}:</strong> <span lang="en">{mine}</span></p> : null}
      {example ? (
        <p className="en-diff" lang="en">
          <span className="visually-hidden">{t('l1.example')}: </span>
          <del>{example.bad}</del> <span aria-hidden="true">→</span> <ins>{example.good}</ins>
        </p>
      ) : null}
      {note.handbook ? <Link to={`/grammar/handbook#${encodeURIComponent(note.handbook)}`}>{t('l1.rule')}</Link> : null}
    </div>
  );
};

/**
 * "Why this happens for Russian/Uzbek speakers" under a mistake. Pass a note
 * id from the server, or the mistake itself (two sides, or a stored
 * `"wrong" → "right"` text) to match it here. Renders nothing without a note.
 */
export const L1Why = ({
  noteId,
  original,
  corrected,
  explanation,
  topic,
  mistake,
}: {
  noteId?: string | null;
  original?: string | null;
  corrected?: string | null;
  explanation?: string | null;
  topic?: string | null;
  mistake?: string | null;
}) => {
  const t = useT();
  const { locale } = useI18n();
  const library = useL1Library();
  if (!library) return null;
  let note: L1Note | null = null;
  if (noteId) note = library.l1NoteById(noteId);
  else if (mistake) {
    const parts = library.splitMistake(mistake);
    note = library.matchL1Notes(parts.corrected ? { original: parts.original, corrected: parts.corrected, topic } : { topic })[0] ?? null;
  } else note = library.matchL1Notes({ original, corrected, explanation, topic })[0] ?? null;
  if (!note) return null;
  return (
    <details className="en-l1">
      <summary>{t(headingKey(note))}: {note.title[locale]}</summary>
      <L1NoteBody note={note} />
    </details>
  );
};
