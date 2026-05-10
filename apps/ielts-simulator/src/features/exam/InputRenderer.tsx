import React from 'react';
import type { ContentUnit } from '../../domain/models';
import { audioPlaybackEvent } from '../../lib/platformClient';

type Json = Record<string, unknown>;

type TextAnswer = { text: string };
type SingleChoiceAnswer = { selected_option: string };
type MultiChoiceAnswer = { selected_options: string[] };
type MatchingAnswer = { matches: Record<string, string> };
type GapFillAnswer = { blanks: Record<string, string> };
type TableCompletionAnswer = { cells: Record<string, string> };
type DiagramLabelingAnswer = { labels: Record<string, string> };
type DragDropAnswer = { targets: Record<string, string> };

type AudioData = {
  url?: string;
  storage?: { bucket: string; path: string };
  duration_seconds?: number;
  play_once?: boolean;
  auto_start?: boolean;
  tone?: { frequency_hz: number; duration_seconds: number };

  // Server-injected playback state (sessions.metadata.audio_playback)
  locked?: boolean;
  resume_from_seconds?: number;
  playback?: {
    started_at?: string;
    ended_at?: string;
    last_time_seconds?: number;
    duration_seconds?: number;
    updated_at?: string;
  };
};

type InstructionData = { text: string };
type PassageData = { title?: string; text: string };
type ImageData = { url: string; alt?: string; caption?: string };
type QuestionTextData = {
  prompt: string;
  placeholder?: string;
  rows?: number;
  show_word_count?: boolean;
  min_words?: number;
  max_words?: number;
};
type Option = { id: string; label: string };
type QuestionChoiceData = { prompt: string; options: Option[]; max_select?: number };
type QuestionMatchingData = { prompt: string; items: Option[]; options: Option[]; allow_reuse?: boolean };
type QuestionTFNGData = {
  prompt: string;
  statements?: Array<{ id: string; text: string }>;
  items?: Option[]; // fallback for matching-like payloads
  options?: Option[]; // optional override
};
type QuestionGapFillData = { prompt: string; text: string; blanks?: Array<{ id: string; placeholder?: string }> };
type QuestionSelectFromListData = {
  prompt: string;
  text: string;
  options: Option[];
  blanks?: Array<{ id: string; placeholder?: string }>;
  allow_reuse?: boolean;
};
type TableCell = { text?: string; blank_id?: string; placeholder?: string };
type QuestionTableCompletionData = { prompt: string; columns: string[]; rows: TableCell[][] };
type QuestionDiagramLabelingData = {
  prompt: string;
  image?: { url: string; alt?: string; caption?: string };
  labels: Array<{ id: string; prompt: string }>;
};
type QuestionDragDropData = { prompt: string; items: Option[]; targets: Array<{ id: string; label: string }>; allow_reuse?: boolean };

interface InputRendererProps {
  unit: ContentUnit;
  value?: unknown;
  onChange?: (value: unknown) => void;
  questionNumber?: number | { start: number; end: number };
  readOnly?: boolean;
  audioContext?: { accessToken: string; sessionId: string; volume?: number } | null;
  // Declared so callers in ExamPlayer compile under strict TS. The renderer
  // currently doesn't consume this — wiring it to the audio element's onEnded
  // is a follow-up to the strict-mode work in dc6e992.
  onAudioEnded?: () => void;
}

const safeJson = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});

const playTone = async (tone: { frequency_hz: number; duration_seconds: number }) => {
  const AudioContextAny = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextAny) return;

  const ctx = new AudioContextAny();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = tone.frequency_hz;
  gain.gain.value = 0.08;

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + Math.max(0.1, tone.duration_seconds));

  osc.onended = async () => {
    try {
      await ctx.close();
    } catch {
      // ignore
    }
  };
};

const qPrefixFrom = (q: InputRendererProps['questionNumber']): string => {
  if (typeof q === 'number') return `Q${q}. `;
  if (q && typeof q === 'object') return q.start === q.end ? `Q${q.start}. ` : `Q${q.start}-${q.end}. `;
  return '';
};

const extractPlaceholders = (text: string): string[] => {
  const ids: string[] = [];
  const seen = new Set<string>();
  const re = /\{\{([a-zA-Z0-9_-]+)\}\}/g;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text))) {
    const id = m[1];
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
};

const splitWithPlaceholders = (text: string): Array<{ kind: 'text'; value: string } | { kind: 'blank'; id: string }> => {
  const parts: Array<{ kind: 'text'; value: string } | { kind: 'blank'; id: string }> = [];
  const re = /\{\{([a-zA-Z0-9_-]+)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(text))) {
    const blankId = m[1];
    if (!blankId) continue;
    const start = m.index;
    if (start > last) parts.push({ kind: 'text', value: text.slice(last, start) });
    parts.push({ kind: 'blank', id: blankId });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts;
};

const AudioUnit: React.FC<{
  unitId: string;
  data: AudioData;
  readOnly?: boolean;
  context?: { accessToken: string; sessionId: string; volume?: number } | null;
}> = ({ unitId, data, readOnly, context }) => {
  const url = typeof data.url === 'string' && data.url.length > 0 ? data.url : null;
  const tone = data.tone && typeof data.tone.frequency_hz === 'number' ? data.tone : null;
  const playOnce = readOnly ? false : data.play_once === true;
  const locked = playOnce && data.locked === true;
  const resumeFrom =
    typeof data.resume_from_seconds === 'number' && Number.isFinite(data.resume_from_seconds)
      ? Math.max(0, data.resume_from_seconds)
      : null;

  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playedOnce, setPlayedOnce] = React.useState<boolean>(locked);
  const [playing, setPlaying] = React.useState(false);
  const [playerError, setPlayerError] = React.useState<string | null>(null);
  const [positionSeconds, setPositionSeconds] = React.useState<number>(resumeFrom ?? 0);

  const maxTimeRef = React.useRef<number>(resumeFrom ?? 0);
  const startedSentRef = React.useRef(false);
  const progressTimerRef = React.useRef<number | null>(null);
  const toneTimerRef = React.useRef<number | null>(null);

  const volume =
    context && typeof context.volume === 'number' && Number.isFinite(context.volume) ? context.volume : null;

  React.useEffect(() => {
    setPlayedOnce(locked);
  }, [locked]);

  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (volume == null) return;
    a.volume = Math.max(0, Math.min(1, volume));
  }, [volume]);

  React.useEffect(() => {
    if (resumeFrom == null) return;
    maxTimeRef.current = Math.max(maxTimeRef.current, resumeFrom);
    setPositionSeconds((p) => Math.max(p, resumeFrom));
  }, [resumeFrom]);

  const formatClock = (secondsTotal: number): string => {
    const s = Math.max(0, Math.floor(secondsTotal));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const snapshotForEvent = (): { t: number | null; d: number | null } => {
    const a = audioRef.current;
    if (!a) return { t: null, d: null };
    const t = a.currentTime;
    if (typeof t === 'number' && Number.isFinite(t)) maxTimeRef.current = Math.max(maxTimeRef.current, t);
    const d = Number.isFinite(a.duration) ? a.duration : null;
    return { t: Number.isFinite(maxTimeRef.current) ? maxTimeRef.current : null, d };
  };

  const pushEvent = async (event: 'start' | 'progress' | 'end') => {
    if (!context) return;
    try {
      const snap = snapshotForEvent();
      await audioPlaybackEvent(context.accessToken, {
        session_id: context.sessionId,
        content_unit_id: unitId,
        event,
        current_time_seconds: snap.t,
        duration_seconds: snap.d,
      });
    } catch {
      // best-effort; don't block playback on network blips
    }
  };

  const stopProgress = () => {
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    progressTimerRef.current = null;
  };

  const startProgress = () => {
    if (!playOnce || !context) return;
    if (progressTimerRef.current) return;
    progressTimerRef.current = window.setInterval(() => void pushEvent('progress'), 8000);
  };

  React.useEffect(() => {
    return () => {
      stopProgress();
      if (toneTimerRef.current) window.clearTimeout(toneTimerRef.current);
      toneTimerRef.current = null;
    };
  }, []);

  const play = async () => {
    if (!url && !tone) return;
    if (playOnce && (locked || playedOnce)) return;
    try {
      setPlayerError(null);
      setPlaying(true);

      if (!url && tone) {
        // Tone-only placeholder audio (useful for local testing without uploaded files).
        if (!startedSentRef.current) {
          startedSentRef.current = true;
          void pushEvent('start');
        }

        const dur = Math.max(0.1, tone.duration_seconds);
        setPositionSeconds(0);
        void playTone(tone);

        if (toneTimerRef.current) window.clearTimeout(toneTimerRef.current);
        toneTimerRef.current = window.setTimeout(() => {
          setPlaying(false);
          setPlayedOnce(true);
          setPositionSeconds(dur);
          void pushEvent('end');
        }, dur * 1000);
        return;
      }

      if (resumeFrom != null && audioRef.current) {
        try {
          audioRef.current.currentTime = Math.max(audioRef.current.currentTime ?? 0, resumeFrom);
        } catch {
          // ignore seek errors
        }
      }

      await audioRef.current?.play();
    } catch {
      setPlaying(false);
      setPlayerError('Playback failed (browser blocked autoplay or file unavailable).');
    }
  };

  // Optional: attempt to auto-start. Browsers may block autoplay; this is best-effort.
  React.useEffect(() => {
    if (!playOnce) return;
    if (readOnly) return;
    if (!data.auto_start) return;
    if (!url) return;
    if (locked || playedOnce) return;

    let cancelled = false;
    const go = async () => {
      try {
        await audioRef.current?.play();
      } catch {
        // ignore; user will click play
        if (!cancelled) setPlaying(false);
      }
    };

    void go();
    return () => {
      cancelled = true;
    };
  }, [data.auto_start, locked, playedOnce, playOnce, readOnly, url]);

  return (
    <div className="p-4 border rounded bg-blue-50 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-bold text-gray-800">Audio</p>
          <p className="text-sm text-gray-600">
            {playOnce ? (
              <span className="inline-flex items-center gap-2">
                <span className="font-semibold text-emerald-800">Play once</span>
                <span className="text-gray-400">|</span>
                <span className="font-mono">{formatClock(positionSeconds)}</span>
              </span>
            ) : typeof data.duration_seconds === 'number' ? (
              `${data.duration_seconds}s`
            ) : (
              'Duration unknown'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {tone ? (
            <button
              type="button"
              onClick={() => playTone(tone)}
              className="px-4 py-2 rounded bg-gray-900 text-white font-semibold hover:bg-black transition-colors"
            >
              Play Sample
            </button>
          ) : null}

          {playOnce ? (
            <button
              type="button"
              disabled={locked || playedOnce || playing || (!url && !tone)}
              onClick={play}
              className="px-4 py-2 rounded bg-emerald-700 disabled:bg-gray-300 text-white font-semibold hover:bg-emerald-800 transition-colors"
            >
              {locked || playedOnce ? 'Played' : playing ? 'Playing...' : resumeFrom && resumeFrom > 0 ? 'Resume' : 'Play audio'}
            </button>
          ) : null}
        </div>
      </div>

      {playerError ? (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{playerError}</div>
      ) : null}

      {url ? (
        playOnce ? (
          <audio
            ref={audioRef}
            src={url}
            preload="none"
            onLoadedMetadata={() => {
              if (resumeFrom != null && audioRef.current) {
                try {
                  audioRef.current.currentTime = Math.max(audioRef.current.currentTime ?? 0, resumeFrom);
                } catch {
                  // ignore
                }
              }
            }}
            onPlay={() => {
              setPlaying(true);
              if (!startedSentRef.current) {
                startedSentRef.current = true;
                void pushEvent('start');
              }
              startProgress();
            }}
            onPause={() => {
              setPlaying(false);
              stopProgress();
              void pushEvent('progress');
            }}
            onTimeUpdate={() => {
              const a = audioRef.current;
              if (!a) return;
              const t = a.currentTime;
              if (typeof t === 'number' && Number.isFinite(t)) {
                maxTimeRef.current = Math.max(maxTimeRef.current, t);
                setPositionSeconds(maxTimeRef.current);
              }
            }}
            onSeeking={() => {
              const a = audioRef.current;
              if (!a) return;
              const allowed = maxTimeRef.current;
              if (a.currentTime > allowed + 0.25 || a.currentTime < allowed - 0.25) {
                try {
                  a.currentTime = allowed;
                } catch {
                  // ignore
                }
              }
            }}
            onEnded={() => {
              stopProgress();
              setPlaying(false);
              setPlayedOnce(true);
              void pushEvent('end');
            }}
          />
        ) : (
          <audio src={url} controls preload="none" controlsList="nodownload noplaybackrate" className="w-full" />
        )
      ) : tone ? (
        <div className="text-sm text-gray-600 bg-white/60 border border-blue-200 rounded p-3">
          Tone-only placeholder audio. Upload a real file in <span className="font-mono">/admin/assets</span> and reference it via{' '}
          <span className="font-mono">audio.data.storage</span> for realistic listening.
        </div>
      ) : (
        <div className="text-sm text-gray-600 bg-white/60 border border-blue-200 rounded p-3">
          {locked
            ? 'This audio was already played and is now locked.'
            : data.storage && typeof data.storage.bucket === 'string' && typeof data.storage.path === 'string'
              ? `Audio stored at ${data.storage.bucket}/${data.storage.path}. URL will be provided at runtime.`
              : 'No audio file attached.'}
        </div>
      )}
    </div>
  );
};

export const InputRenderer: React.FC<InputRendererProps> = ({ unit, value, onChange, questionNumber, readOnly, audioContext }) => {
  const data = safeJson(unit.data);

  const qPrefix = qPrefixFrom(questionNumber);
  const qStart = typeof questionNumber === 'number' ? questionNumber : questionNumber && typeof questionNumber === 'object' ? questionNumber.start : null;

  switch (unit.type) {
    case 'instruction': {
      const d = data as unknown as InstructionData;
      return (
        <div className="p-4 bg-gray-100 border border-gray-300 rounded my-4">
          <p className="text-gray-900 font-medium">{d.text}</p>
        </div>
      );
    }

    case 'reading_passage': {
      const d = data as unknown as PassageData;
      return (
        <div className="p-5 bg-white border border-gray-300 rounded text-justify leading-relaxed">
          {d.title ? <h3 className="text-lg font-bold mb-3 text-gray-900">{d.title}</h3> : null}
          <div className="whitespace-pre-wrap text-[15px] text-gray-900">{d.text}</div>
        </div>
      );
    }

    case 'image': {
      const d = data as unknown as ImageData;
      return (
        <figure className="my-4">
          <img
            src={d.url}
            alt={d.alt ?? ''}
            className="w-full max-h-[60vh] object-contain border border-gray-200 rounded bg-white"
            loading="lazy"
          />
          {d.caption ? <figcaption className="text-sm text-gray-600 mt-2">{d.caption}</figcaption> : null}
        </figure>
      );
    }

    case 'audio': {
      const d = data as unknown as AudioData;
      return <AudioUnit unitId={unit.id} data={d} readOnly={readOnly} context={audioContext ?? null} />;
    }

    case 'question_text': {
      const d = data as unknown as QuestionTextData;
      const v = safeJson(value) as unknown as TextAnswer;
      const text = typeof v.text === 'string' ? v.text : '';
      const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
      return (
        <div className="my-4">
          <p className="mb-2 font-semibold text-gray-900">
            <span className="text-gray-500">{qPrefix}</span>
            {d.prompt}
          </p>
          <textarea
            className="w-full p-4 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder={d.placeholder}
            rows={typeof d.rows === 'number' ? d.rows : 6}
            value={text}
            readOnly={readOnly}
            onChange={(e) => (readOnly ? undefined : onChange?.({ text: e.target.value } satisfies TextAnswer))}
          />
          {d.show_word_count || typeof d.min_words === 'number' || typeof d.max_words === 'number' ? (
            <div className="mt-2 text-xs text-gray-600 flex items-center justify-between">
              <div>
                Words: <span className="font-semibold text-gray-900">{words}</span>
              </div>
              <div className="text-gray-500">
                {typeof d.min_words === 'number' ? `Min ${d.min_words}` : null}
                {typeof d.min_words === 'number' && typeof d.max_words === 'number' ? ' | ' : null}
                {typeof d.max_words === 'number' ? `Max ${d.max_words}` : null}
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    case 'question_single_choice': {
      const d = data as unknown as QuestionChoiceData;
      const v = safeJson(value) as unknown as SingleChoiceAnswer;
      const selected = typeof v.selected_option === 'string' ? v.selected_option : '';

      return (
        <div className="my-4 space-y-3">
          <p className="font-bold text-gray-900">
            <span className="text-gray-500">{qPrefix}</span>
            {d.prompt}
          </p>
          <div className="space-y-2">
            {(d.options ?? []).map((opt) => (
              <label
                key={opt.id}
                className={`flex items-center p-3 border rounded cursor-pointer transition-colors ${
                  selected === opt.id ? 'bg-blue-50 border-blue-500' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name={unit.id}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  checked={selected === opt.id}
                  disabled={readOnly}
                  onChange={() => (readOnly ? undefined : onChange?.({ selected_option: opt.id } satisfies SingleChoiceAnswer))}
                />
                <span className="ml-3 text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    case 'question_multi_choice': {
      const d = data as unknown as QuestionChoiceData;
      const v = safeJson(value) as unknown as MultiChoiceAnswer;
      const selected = Array.isArray(v.selected_options) ? v.selected_options : [];
      const maxSelect = typeof d.max_select === 'number' ? d.max_select : null;

      const toggle = (optId: string) => {
        if (readOnly) return;
        const has = selected.includes(optId);
        const next = has ? selected.filter((x) => x !== optId) : [...selected, optId];
        if (maxSelect && next.length > maxSelect) return;
        onChange?.({ selected_options: next } satisfies MultiChoiceAnswer);
      };

      return (
        <div className="my-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold text-gray-900">
              <span className="text-gray-500">{qPrefix}</span>
              {d.prompt}
            </p>
            {maxSelect ? (
              <span className="text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-200 rounded px-2 py-1">
                Select up to {maxSelect}
              </span>
            ) : null}
          </div>
          <div className="space-y-2">
            {(d.options ?? []).map((opt) => (
              <label
                key={opt.id}
                className={`flex items-center p-3 border rounded cursor-pointer transition-colors ${
                  selected.includes(opt.id) ? 'bg-blue-50 border-blue-500' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  checked={selected.includes(opt.id)}
                  disabled={readOnly}
                  onChange={() => toggle(opt.id)}
                />
                <span className="ml-3 text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      );
    }

    case 'question_matching':
    case 'question_matching_headings':
    case 'question_sentence_endings': {
      const d = data as unknown as QuestionMatchingData;
      const v = safeJson(value) as unknown as MatchingAnswer;
      const matches: Record<string, string> = isObject(v.matches) ? (v.matches as Record<string, string>) : {};
      const allowReuse = d.allow_reuse === true;

      const selectedOptions = new Set(Object.values(matches));

      const setMatch = (itemId: string, optionId: string) => {
        if (readOnly) return;
        const next: Record<string, string> = { ...matches, [itemId]: optionId };
        onChange?.({ matches: next } satisfies MatchingAnswer);
      };

      return (
        <div className="my-4 space-y-4">
          <p className="font-bold text-gray-900">
            <span className="text-gray-500">{qPrefix}</span>
            {d.prompt}
          </p>

          <div className="space-y-3">
            {(d.items ?? []).map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="flex-1 text-gray-800">{item.label}</div>
                <select
                  className="min-w-56 border border-gray-300 rounded px-3 py-2 bg-white"
                  value={matches[item.id] ?? ''}
                  disabled={readOnly}
                  onChange={(e) => setMatch(item.id, e.target.value)}
                >
                  <option value="" disabled>
                    Select...
                  </option>
                  {(d.options ?? []).map((opt) => {
                    const disabled = !allowReuse && selectedOptions.has(opt.id) && matches[item.id] !== opt.id;
                    return (
                      <option key={opt.id} value={opt.id} disabled={disabled}>
                        {opt.label}
                      </option>
                    );
                  })}
                </select>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'question_true_false_not_given':
    case 'question_yes_no_not_given': {
      const d = data as unknown as QuestionTFNGData;
      const raw = safeJson(value) as any;
      const source =
        raw && typeof raw === 'object' && raw.matches && typeof raw.matches === 'object'
          ? raw.matches
          : raw && typeof raw === 'object' && raw.answers && typeof raw.answers === 'object'
            ? raw.answers
            : raw && typeof raw === 'object'
              ? raw
              : {};
      const matches: Record<string, string> = isObject(source) ? (source as Record<string, string>) : {};

      const statements = Array.isArray((d as any).statements)
        ? ((d as any).statements as any[]).map((s) => ({ id: String(s?.id ?? ''), text: String(s?.text ?? '') })).filter((s) => s.id && s.text)
        : Array.isArray((d as any).items)
          ? ((d as any).items as any[]).map((it) => ({ id: String(it?.id ?? ''), text: String(it?.label ?? '') })).filter((s) => s.id && s.text)
          : [];

      const defaultOptions: Option[] =
        unit.type === 'question_true_false_not_given'
          ? [
              { id: 'T', label: 'True' },
              { id: 'F', label: 'False' },
              { id: 'NG', label: 'Not Given' },
            ]
          : [
              { id: 'Y', label: 'Yes' },
              { id: 'N', label: 'No' },
              { id: 'NG', label: 'Not Given' },
            ];

      const options: Option[] = Array.isArray((d as any).options)
        ? ((d as any).options as any[]).map((o) => ({ id: String(o?.id ?? ''), label: String(o?.label ?? '') })).filter((o) => o.id && o.label)
        : defaultOptions;

      const setMatch = (statementId: string, optionId: string) => {
        if (readOnly) return;
        onChange?.({ matches: { ...matches, [statementId]: optionId } } satisfies MatchingAnswer);
      };

      return (
        <div className="my-4 space-y-4">
          <p className="font-bold text-gray-900">
            <span className="text-gray-500">{qPrefix}</span>
            {d.prompt}
          </p>

          <div className="space-y-3">
            {statements.map((s, idx) => {
              const selected = matches[s.id] ?? '';
              const qn = qStart != null ? qStart + idx : null;
              return (
                <div key={s.id} className="border border-gray-200 rounded-xl p-4 bg-white">
                  <div className="text-gray-900 font-medium">
                    {qn != null ? <span className="text-gray-500 mr-2">Q{qn}.</span> : null}
                    {s.text}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {options.map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer select-none ${
                          selected === opt.id ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`${unit.id}:${s.id}`}
                          checked={selected === opt.id}
                          disabled={readOnly}
                          onChange={() => setMatch(s.id, opt.id)}
                        />
                        <span className="text-sm font-semibold text-gray-800">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            {statements.length === 0 ? <div className="text-sm text-gray-600">No statements provided.</div> : null}
          </div>
        </div>
      );
    }

    case 'question_gap_fill': {
      const d = data as unknown as QuestionGapFillData;
      const v = safeJson(value) as unknown as GapFillAnswer;
      const blanks = isObject((v as any).blanks) ? ((v as any).blanks as Record<string, string>) : {};

      const text = String((d as any).text ?? '');
      const placeholderIds =
        Array.isArray(d.blanks) && d.blanks.length > 0 ? d.blanks.map((b) => String(b.id)) : extractPlaceholders(text);
      const split = splitWithPlaceholders(text);

      const blankIndex = new Map<string, number>();
      placeholderIds.forEach((id, idx) => blankIndex.set(id, idx));

      const setBlank = (id: string, textValue: string) => {
        if (readOnly) return;
        onChange?.({ blanks: { ...blanks, [id]: textValue } } satisfies GapFillAnswer);
      };

      return (
        <div className="my-4 space-y-3">
          <p className="font-bold text-gray-900">
            <span className="text-gray-500">{qPrefix}</span>
            {d.prompt}
          </p>
          <div className="p-4 border border-gray-200 rounded-xl bg-white leading-7 text-gray-900">
            {split.map((p, idx) => {
              if (p.kind === 'text') return <span key={idx}>{p.value}</span>;
              const val = typeof blanks[p.id] === 'string' ? blanks[p.id] : '';
              const i = blankIndex.get(p.id) ?? 0;
              const qn = qStart != null ? qStart + i : null;
              const ph = qn != null ? String(qn) : '...';
              return (
                <span key={idx} className="inline-flex items-center gap-1 mx-1 align-baseline">
                  <input
                    value={val}
                    onChange={(e) => setBlank(p.id, e.target.value)}
                    readOnly={readOnly}
                    placeholder={ph}
                    className="w-32 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none text-sm"
                  />
                </span>
              );
            })}
          </div>
        </div>
      );
    }

    case 'question_select_from_list': {
      const d = data as unknown as QuestionSelectFromListData;
      const v = safeJson(value) as unknown as GapFillAnswer;
      const blanks = isObject((v as any).blanks) ? ((v as any).blanks as Record<string, string>) : {};
      const allowReuse = d.allow_reuse === true;

      const selectedOptions = new Set(Object.values(blanks).filter(Boolean));

      const text = String((d as any).text ?? '');
      const placeholderIds =
        Array.isArray(d.blanks) && d.blanks.length > 0 ? d.blanks.map((b) => String(b.id)) : extractPlaceholders(text);
      const split = splitWithPlaceholders(text);

      const blankIndex = new Map<string, number>();
      placeholderIds.forEach((id, idx) => blankIndex.set(id, idx));

      const setBlank = (id: string, optionId: string) => {
        if (readOnly) return;
        onChange?.({ blanks: { ...blanks, [id]: optionId } } satisfies GapFillAnswer);
      };

      return (
        <div className="my-4 space-y-3">
          <p className="font-bold text-gray-900">
            <span className="text-gray-500">{qPrefix}</span>
            {d.prompt}
          </p>
          <div className="p-4 border border-gray-200 rounded-xl bg-white leading-7 text-gray-900">
            {split.map((p, idx) => {
              if (p.kind === 'text') return <span key={idx}>{p.value}</span>;
              const selected = typeof blanks[p.id] === 'string' ? blanks[p.id] : '';
              const i = blankIndex.get(p.id) ?? 0;
              const qn = qStart != null ? qStart + i : null;
              const ph = qn != null ? `Q${qn}` : 'Select...';

              return (
                <span key={idx} className="inline-flex items-center gap-1 mx-1 align-baseline">
                  <select
                    value={selected}
                    disabled={readOnly}
                    onChange={(e) => setBlank(p.id, e.target.value)}
                    className="min-w-40 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none text-sm bg-white"
                  >
                    <option value="" disabled>
                      {ph}
                    </option>
                    {(d.options ?? []).map((opt) => {
                      const disabled = !allowReuse && selectedOptions.has(opt.id) && selected !== opt.id;
                      return (
                        <option key={opt.id} value={opt.id} disabled={disabled}>
                          {opt.label}
                        </option>
                      );
                    })}
                  </select>
                </span>
              );
            })}
          </div>
        </div>
      );
    }

    case 'question_table_completion': {
      const d = data as unknown as QuestionTableCompletionData;
      const v = safeJson(value) as unknown as TableCompletionAnswer;
      const cells = isObject((v as any).cells) ? ((v as any).cells as Record<string, string>) : {};

      const setCell = (id: string, textValue: string) => {
        if (readOnly) return;
        onChange?.({ cells: { ...cells, [id]: textValue } } satisfies TableCompletionAnswer);
      };

      return (
        <div className="my-4 space-y-3">
          <p className="font-bold text-gray-900">
            <span className="text-gray-500">{qPrefix}</span>
            {d.prompt}
          </p>
          <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  {(d.columns ?? []).map((c, idx) => (
                    <th key={idx} className="text-left p-3 font-semibold whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(d.rows ?? []).map((row, rIdx) => (
                  <tr key={rIdx} className="border-t border-gray-100">
                    {row.map((cell, cIdx) => {
                      const isBlank = typeof cell?.blank_id === 'string' && cell.blank_id.length > 0;
                      if (!isBlank) {
                        return (
                          <td key={cIdx} className="p-3 text-gray-900 whitespace-pre-wrap">
                            {String(cell?.text ?? '')}
                          </td>
                        );
                      }

                      const id = String(cell.blank_id);
                      const val = typeof cells[id] === 'string' ? cells[id] : '';
                      return (
                        <td key={cIdx} className="p-3">
                          <input
                            value={val}
                            readOnly={readOnly}
                            onChange={(e) => setCell(id, e.target.value)}
                            placeholder={cell.placeholder ?? ''}
                            className="w-full min-w-32 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    case 'question_diagram_labeling': {
      const d = data as unknown as QuestionDiagramLabelingData;
      const v = safeJson(value) as unknown as DiagramLabelingAnswer;
      const labels = isObject((v as any).labels) ? ((v as any).labels as Record<string, string>) : {};

      const setLabel = (id: string, textValue: string) => {
        if (readOnly) return;
        onChange?.({ labels: { ...labels, [id]: textValue } } satisfies DiagramLabelingAnswer);
      };

      return (
        <div className="my-4 space-y-4">
          <p className="font-bold text-gray-900">
            <span className="text-gray-500">{qPrefix}</span>
            {d.prompt}
          </p>

          {d.image?.url ? (
            <figure className="my-2">
              <img
                src={d.image.url}
                alt={d.image.alt ?? ''}
                className="w-full max-h-[55vh] object-contain border border-gray-200 rounded bg-white"
                loading="lazy"
              />
              {d.image.caption ? <figcaption className="text-sm text-gray-600 mt-2">{d.image.caption}</figcaption> : null}
            </figure>
          ) : null}

          <div className="space-y-3">
            {(d.labels ?? []).map((l, idx) => {
              const id = String(l.id);
              const val = typeof labels[id] === 'string' ? labels[id] : '';
              const qn = qStart != null ? qStart + idx : null;
              return (
                <label key={id} className="block">
                  <div className="text-sm font-semibold text-gray-900 mb-1">
                    {qn != null ? <span className="text-gray-500 mr-2">Q{qn}.</span> : null}
                    {l.prompt}
                  </div>
                  <input
                    value={val}
                    readOnly={readOnly}
                    onChange={(e) => setLabel(id, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
                    placeholder="Your answer"
                  />
                </label>
              );
            })}
          </div>
        </div>
      );
    }

    case 'question_drag_drop': {
      const d = data as unknown as QuestionDragDropData;
      const v = safeJson(value) as unknown as DragDropAnswer;
      const targets = isObject((v as any).targets) ? ((v as any).targets as Record<string, string>) : {};
      const allowReuse = d.allow_reuse === true;

      const assigned = new Set(Object.values(targets).filter(Boolean));
      const available = (d.items ?? []).filter((it) => allowReuse || !assigned.has(it.id));

      const setTarget = (targetId: string, itemId: string) => {
        if (readOnly) return;
        const next = { ...targets, [targetId]: itemId };
        onChange?.({ targets: next } satisfies DragDropAnswer);
      };

      const clearTarget = (targetId: string) => {
        if (readOnly) return;
        const next = { ...targets };
        delete next[targetId];
        onChange?.({ targets: next } satisfies DragDropAnswer);
      };

      return (
        <div className="my-4 space-y-4">
          <p className="font-bold text-gray-900">
            <span className="text-gray-500">{qPrefix}</span>
            {d.prompt}
          </p>

          <div className="flex flex-wrap gap-2">
            {available.map((it) => (
              <div
                key={it.id}
                draggable={!readOnly}
                onDragStart={(e) => {
                  if (readOnly) return;
                  e.dataTransfer.setData('text/plain', it.id);
                }}
                className={`px-3 py-1.5 rounded-full border text-sm font-semibold cursor-grab select-none ${
                  readOnly ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50'
                }`}
                title="Drag into a target"
              >
                {it.label}
              </div>
            ))}
            {available.length === 0 ? <div className="text-sm text-gray-600">No available items.</div> : null}
          </div>

          <div className="space-y-3">
            {(d.targets ?? []).map((t, idx) => {
              const selected = targets[t.id] ?? '';
              const qn = qStart != null ? qStart + idx : null;
              return (
                <div
                  key={t.id}
                  onDragOver={(e) => (readOnly ? undefined : e.preventDefault())}
                  onDrop={(e) => {
                    if (readOnly) return;
                    const itemId = e.dataTransfer.getData('text/plain');
                    if (itemId) setTarget(t.id, itemId);
                  }}
                  className="flex items-center gap-3 border border-gray-200 rounded-xl p-3 bg-white"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {qn != null ? <span className="text-gray-500 mr-2">Q{qn}.</span> : null}
                      {t.label}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Drop an item here, or choose from the list.</div>
                  </div>

                  <select
                    className="min-w-56 border border-gray-300 rounded px-3 py-2 bg-white"
                    value={selected}
                    disabled={readOnly}
                    onChange={(e) => setTarget(t.id, e.target.value)}
                  >
                    <option value="" disabled>
                      Select...
                    </option>
                    {(d.items ?? []).map((it) => {
                      const disabled = !allowReuse && assigned.has(it.id) && selected !== it.id;
                      return (
                        <option key={it.id} value={it.id} disabled={disabled}>
                          {it.label}
                        </option>
                      );
                    })}
                  </select>

                  <button
                    type="button"
                    onClick={() => clearTarget(t.id)}
                    disabled={readOnly || !selected}
                    className="px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:bg-gray-50 text-sm font-semibold"
                  >
                    Clear
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="text-red-700 p-3 border border-red-200 bg-red-50 rounded">
          Unknown unit type: <span className="font-mono">{unit.type}</span>
        </div>
      );
  }
};

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
