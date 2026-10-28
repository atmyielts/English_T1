import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppT } from '../../i18n';
import { isRecord } from './tasks';

type Json = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

// ---------------------------------------------------------------------------
// Complete the Words

type Blank = { id: string; stem: string; length: number };

export const CompleteWords: React.FC<{
  data: Json;
  value: unknown;
  readOnly?: boolean;
  onChange: (value: unknown) => void;
  reveal?: Record<string, { expected: string; correct: boolean }> | null;
}> = ({ data, value, readOnly, onChange, reveal }) => {
  const t = useAppT();
  const blanks: Blank[] = Array.isArray(data.blanks)
    ? (data.blanks as unknown[]).filter(isRecord).map((b) => ({ id: str(b.id), stem: str(b.stem), length: Math.max(1, Number(b.length) || 1) }))
    : [];
  const byId = new Map(blanks.map((b) => [b.id, b]));
  const answers = isRecord(value) && isRecord(value.blanks) ? (value.blanks as Record<string, unknown>) : {};
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const order = blanks.map((b) => b.id);
  const pieces = str(data.text).split(/(\{\{[a-zA-Z0-9_-]+\}\})/);

  const update = (id: string, raw: string) => {
    const blank = byId.get(id);
    const letters = raw.replace(/[^A-Za-z']/g, '').slice(0, blank?.length ?? 20);
    onChange({ blanks: { ...Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, str(v)])), [id]: letters } });
    if (blank && letters.length >= blank.length) {
      const next = order[order.indexOf(id) + 1];
      if (next) refs.current[next]?.focus();
    }
  };

  return (
    <div className="t26-cw" data-testid="complete-words">
      <p className="t26-instructions">{t('cw.instructions')}</p>
      <p className="t26-cw-text">
        {pieces.map((piece, i) => {
          const m = piece.match(/^\{\{([a-zA-Z0-9_-]+)\}\}$/);
          if (!m) return <React.Fragment key={i}>{piece}</React.Fragment>;
          const blank = byId.get(m[1]);
          if (!blank) return null;
          const given = str(answers[blank.id]);
          const r = reveal?.[blank.id];
          return (
            <span key={i} className={`t26-cw-word${r ? (r.correct ? ' is-correct' : ' is-wrong') : ''}`}>
              <span aria-hidden="true">{blank.stem}</span>
              <input
                ref={(el) => { refs.current[blank.id] = el; }}
                value={given}
                disabled={readOnly}
                maxLength={blank.length}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="text"
                aria-label={t('cw.blank_label', { n: Number(blank.id) || blank.id, stem: blank.stem, count: blank.length })}
                style={{ width: `calc(${blank.length}ch + 0.9rem)` }}
                onChange={(e) => update(blank.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !given) {
                    const prev = order[order.indexOf(blank.id) - 1];
                    if (prev) refs.current[prev]?.focus();
                  }
                }}
              />
              {r && !r.correct ? <span className="t26-cw-key">({blank.stem}{r.expected})</span> : null}
            </span>
          );
        })}
      </p>
    </div>
  );
};

export const completeWordsAnswered = (data: Json, value: unknown): { done: number; total: number } => {
  const blanks = Array.isArray(data.blanks) ? (data.blanks as unknown[]).filter(isRecord) : [];
  const answers = isRecord(value) && isRecord(value.blanks) ? value.blanks : {};
  return { done: blanks.filter((b) => str(answers[str(b.id)]).length > 0).length, total: blanks.length };
};

// ---------------------------------------------------------------------------
// Build a Sentence

type Tile = { id: string; label: string };

export const BuildSentence: React.FC<{
  data: Json;
  value: unknown;
  readOnly?: boolean;
  onChange: (value: unknown) => void;
}> = ({ data, value, readOnly, onChange }) => {
  const t = useAppT();
  const frame = Array.isArray(data.frame) ? (data.frame as unknown[]).map(str) : [];
  const tiles: Tile[] = Array.isArray(data.tiles) ? (data.tiles as unknown[]).filter(isRecord).map((x) => ({ id: str(x.id), label: str(x.label) })) : [];
  const slotCount = frame.filter((f) => f === '_').length;
  const current: Array<string | null> = useMemo(() => {
    const raw = isRecord(value) && Array.isArray(value.order) ? (value.order as unknown[]) : [];
    return Array.from({ length: slotCount }, (_, i) => (typeof raw[i] === 'string' && raw[i] ? String(raw[i]) : null));
  }, [value, slotCount]);
  const used = new Set(current.filter(Boolean) as string[]);
  const label = (id: string | null) => tiles.find((x) => x.id === id)?.label ?? '';

  const place = (tileId: string) => {
    if (readOnly) return;
    const next = [...current];
    const empty = next.indexOf(null);
    if (empty < 0) return;
    next[empty] = tileId;
    onChange({ order: next });
  };
  const remove = (slot: number) => {
    if (readOnly) return;
    const next = [...current];
    next[slot] = null;
    onChange({ order: next });
  };

  let slot = -1;
  return (
    <div className="t26-bs" data-testid="build-sentence">
      <p className="t26-instructions">{t('bs.instructions')}</p>
      <div className="t26-bs-context">
        <span className="t26-avatar" aria-hidden="true">A</span>
        <p>{str(data.context)}</p>
      </div>
      <div className="t26-bs-reply">
        <span className="t26-avatar t26-avatar-b" aria-hidden="true">B</span>
        <p className="t26-bs-frame">
          {frame.map((piece, i) => {
            if (piece !== '_') return <span key={i} className="t26-bs-fixed">{piece}</span>;
            slot += 1;
            const s = slot;
            const id = current[s];
            return id ? (
              <button key={i} type="button" className="t26-bs-slot is-filled" disabled={readOnly} onClick={() => remove(s)} aria-label={t('bs.slot_filled', { n: s + 1, word: label(id) })}>
                {label(id)}
              </button>
            ) : (
              <span key={i} className="t26-bs-slot" aria-label={t('bs.slot_empty', { n: s + 1 })} role="img" />
            );
          })}
        </p>
      </div>
      <p className="t26-hint">{t('bs.tile_hint')}</p>
      <div className="t26-bs-tiles" role="group" aria-label={t('bs.tiles_label')}>
        {tiles.map((tile) => (
          <button
            key={tile.id}
            type="button"
            className="t26-bs-tile"
            disabled={readOnly || used.has(tile.id) || current.indexOf(null) < 0}
            aria-label={t('bs.tile_add', { word: tile.label })}
            onClick={() => place(tile.id)}
          >
            {tile.label}
          </button>
        ))}
        <button type="button" className="t26-link-button" disabled={readOnly || used.size === 0} onClick={() => onChange({ order: current.map(() => null) })}>
          {t('bs.clear')}
        </button>
      </div>
    </div>
  );
};

export const buildSentenceAnswered = (value: unknown): boolean =>
  isRecord(value) && Array.isArray(value.order) && (value.order as unknown[]).length > 0 && (value.order as unknown[]).every(Boolean);

// ---------------------------------------------------------------------------
// Multiple choice

export const ChoiceQuestion: React.FC<{
  id: string;
  data: Json;
  number?: number;
  value: unknown;
  readOnly?: boolean;
  onChange: (value: unknown) => void;
  hidePrompt?: boolean;
}> = ({ id, data, number, value, readOnly, onChange, hidePrompt }) => {
  const options = Array.isArray(data.options) ? (data.options as unknown[]).filter(isRecord) : [];
  const selected = isRecord(value) ? str(value.selected_option) : typeof value === 'string' ? value : '';
  return (
    <fieldset className="t26-mc" data-testid="choice-question">
      <legend className="t26-mc-prompt">
        {number ? <span className="t26-qnum">{number}.</span> : null} {hidePrompt ? null : str(data.prompt)}
      </legend>
      {options.map((o) => {
        const oid = str(o.id);
        return (
          <label key={oid} className={`t26-mc-option${selected === oid ? ' is-selected' : ''}`}>
            <input type="radio" name={`q-${id}`} value={oid} checked={selected === oid} disabled={readOnly} onChange={() => onChange({ selected_option: oid })} />
            <span className="t26-mc-letter" aria-hidden="true">{oid}</span>
            <span className="t26-mc-label">{str(o.label)}</span>
          </label>
        );
      })}
    </fieldset>
  );
};

export const choiceAnswered = (value: unknown): boolean =>
  (isRecord(value) && str(value.selected_option).length > 0) || (typeof value === 'string' && value.length > 0);

// ---------------------------------------------------------------------------
// Reading stimuli

export const DailyText: React.FC<{ data: Json }> = ({ data }) => {
  const format = str(data.format);
  const email = isRecord(data.email) ? data.email : null;
  const messages = Array.isArray(data.messages) ? (data.messages as unknown[]).filter(isRecord) : [];
  const table = isRecord(data.table) ? data.table : null;
  const headers = table && Array.isArray(table.headers) ? (table.headers as unknown[]).map(str) : [];
  const rows = table && Array.isArray(table.rows) ? (table.rows as unknown[]).filter(Array.isArray).map((r) => (r as unknown[]).map(str)) : [];
  return (
    <article className={`t26-daily t26-daily-${format || 'text'}`} data-testid="daily-text">
      {data.title ? <p className="t26-instructions">{str(data.title)}</p> : null}
      <div className="t26-daily-card">
        {email ? (
          <dl className="t26-email-head">
            <div><dt>From</dt><dd>{str(email.from)}</dd></div>
            <div><dt>To</dt><dd>{str(email.to)}</dd></div>
            <div><dt>Subject</dt><dd>{str(email.subject)}</dd></div>
          </dl>
        ) : null}
        {data.heading ? <h3 className="t26-daily-heading">{str(data.heading)}</h3> : null}
        {messages.length > 0 ? (
          <ol className="t26-messages">
            {messages.map((m, i) => (
              <li key={i} className={i % 2 ? 'is-right' : ''}>
                <span className="t26-msg-meta">{str(m.sender)}{m.time ? ` · ${str(m.time)}` : ''}</span>
                <span className="t26-msg-text">{str(m.text)}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {table ? (
          <div className="t26-table-wrap">
            <table className="t26-table">
              {headers.length ? <thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead> : null}
              <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : null}
        {str(data.text).split('\n').filter((line) => line.trim()).map((line, i) => <p key={i}>{line}</p>)}
      </div>
    </article>
  );
};

export const AcademicPassage: React.FC<{ data: Json }> = ({ data }) => (
  <article className="t26-passage" data-testid="academic-passage">
    <h3>{str(data.title)}</h3>
    {str(data.text).split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
  </article>
);

// ---------------------------------------------------------------------------
// Writing

const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

export const EmailTask: React.FC<{ data: Json; value: unknown; readOnly?: boolean; onChange: (v: unknown) => void }> = ({ data, value, readOnly, onChange }) => {
  const t = useAppT();
  const text = isRecord(value) ? str(value.text) : '';
  const goals = Array.isArray(data.goals) ? (data.goals as unknown[]).map(str) : [];
  return (
    <div className="t26-writing" data-testid="write-email">
      <div className="t26-writing-prompt">
        <p>{str(data.scenario)}</p>
        <p className="t26-strong">{t('email.goals')}</p>
        <ul>{goals.map((g, i) => <li key={i}>{g}</li>)}</ul>
        <p className="t26-muted">{t('email.instructions')}</p>
      </div>
      <div className="t26-email-compose">
        <div className="t26-email-row"><span>{t('email.to')}:</span> <span className="t26-break">{str(data.to_address) || str(data.to)}</span></div>
        <div className="t26-email-row"><span>{t('email.subject')}:</span> <span className="t26-break">{str(data.subject)}</span></div>
        <textarea
          value={text}
          disabled={readOnly}
          rows={12}
          spellCheck={false}
          aria-label={t('email.placeholder')}
          placeholder={t('email.placeholder')}
          onChange={(e) => onChange({ text: e.target.value })}
        />
        <div className="t26-muted t26-right">{t('writing.words', { count: wordCount(text) })}</div>
      </div>
    </div>
  );
};

export const DiscussionTask: React.FC<{ data: Json; value: unknown; readOnly?: boolean; onChange: (v: unknown) => void }> = ({ data, value, readOnly, onChange }) => {
  const t = useAppT();
  const text = isRecord(value) ? str(value.text) : '';
  const professor = isRecord(data.professor) ? data.professor : {};
  const students = Array.isArray(data.students) ? (data.students as unknown[]).filter(isRecord) : [];
  return (
    <div className="t26-writing" data-testid="write-discussion">
      <div className="t26-writing-prompt">
        <p>{t('disc.instructions', { course: str(data.course) })}</p>
        <p className="t26-muted">{t('disc.do')}</p>
        <div className="t26-post t26-post-prof"><span className="t26-post-name">{str(professor.name)}</span><p>{str(professor.text)}</p></div>
        {students.map((s, i) => (
          <div key={i} className="t26-post"><span className="t26-post-name">{str(s.name)}</span><p>{str(s.text)}</p></div>
        ))}
      </div>
      <div className="t26-email-compose">
        <textarea
          value={text}
          disabled={readOnly}
          rows={12}
          spellCheck={false}
          aria-label={t('disc.placeholder')}
          placeholder={t('disc.placeholder')}
          onChange={(e) => onChange({ text: e.target.value })}
        />
        <div className="t26-muted t26-right">{t('writing.words', { count: wordCount(text) })}</div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Play-once audio

export const PlayOnceAudio: React.FC<{
  url: string | null;
  locked?: boolean;
  autoStart?: boolean;
  onStart?: (duration: number | null) => void;
  onEnded: () => void;
  volume?: number;
}> = ({ url, locked, autoStart, onStart, onEnded, volume }) => {
  const t = useAppT();
  const ref = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<'idle' | 'playing' | 'done' | 'blocked' | 'missing'>(locked ? 'done' : url ? 'idle' : 'missing');
  const endedRef = useRef(false);
  const finish = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setState('done');
    onEnded();
  };
  const play = async () => {
    const a = ref.current;
    if (!a || state === 'playing' || state === 'done') return;
    try {
      if (typeof volume === 'number') a.volume = Math.max(0, Math.min(1, volume));
      await a.play();
      setState('playing');
      onStart?.(Number.isFinite(a.duration) ? a.duration : null);
    } catch {
      setState('blocked');
    }
  };
  useEffect(() => {
    if (locked) { finish(); return; }
    if (autoStart && url) void play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="t26-audio" data-testid="play-once-audio" data-state={state}>
      {url && !locked ? (
        <audio
          ref={ref}
          src={url}
          preload="auto"
          onEnded={finish}
          onError={() => { if (!endedRef.current) setState('missing'); }}
        />
      ) : null}
      <span className={`t26-audio-icon is-${state}`} aria-hidden="true" />
      <div className="t26-audio-text">
        {state === 'playing' ? t('listen.playing') : state === 'done' ? t('listen.played') : state === 'missing' ? t('listen.audio_missing') : t('listen.once')}
        {state === 'blocked' ? <div className="t26-muted">{t('listen.blocked')}</div> : null}
      </div>
      {state === 'idle' || state === 'blocked' ? (
        <button type="button" className="t26-button" onClick={() => void play()}>{t('listen.press_play')}</button>
      ) : null}
      {state === 'missing' ? (
        <button type="button" className="t26-button-secondary" onClick={finish}>{t('common.continue')}</button>
      ) : null}
    </div>
  );
};
