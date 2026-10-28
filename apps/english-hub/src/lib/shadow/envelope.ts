// Loudness envelopes for shadowing: the learner's recording (measured) next to
// the model sentence (estimated). Browser text-to-speech cannot be recorded,
// so the model's envelope is built from the text itself: one soft bump per
// syllable, short gaps between words, longer ones at commas and full stops,
// stretched to how long the browser actually took to say it. Both envelopes
// are trimmed to the speech and resampled to the same number of bars, so the
// learner sees rhythm and pauses side by side. Pure functions, no browser APIs.

export const FRAME_MS = 20;

/** Root-mean-square loudness per frame. */
export const rmsEnvelope = (samples: ArrayLike<number>, sampleRate: number, frameMs = FRAME_MS): number[] => {
  const size = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const out: number[] = [];
  for (let start = 0; start < samples.length; start += size) {
    const end = Math.min(samples.length, start + size);
    let sum = 0;
    for (let i = start; i < end; i += 1) {
      const value = samples[i] ?? 0;
      sum += value * value;
    }
    out.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  return out;
};

const percentile = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))] ?? 0;
};

/** Loudness above which a frame counts as speech: 15% of the way from the noise floor to the peak. */
export const speechThreshold = (envelope: number[]): number => {
  const floor = percentile(envelope, 0.2);
  const peak = percentile(envelope, 0.98);
  return Math.max(0.004, floor + (peak - floor) * 0.15);
};

/** First and last speech frame (inclusive), or null when the recording is silent. */
export const speechBounds = (envelope: number[], threshold = speechThreshold(envelope)): { start: number; end: number } | null => {
  let start = -1;
  let end = -1;
  for (let i = 0; i < envelope.length; i += 1) {
    if ((envelope[i] ?? 0) >= threshold) {
      if (start < 0) start = i;
      end = i;
    }
  }
  // A single click is not speech.
  if (start < 0 || end - start < 2) return null;
  return { start, end };
};

/** Silences of at least `minMs` inside the speech (not before or after it). */
export const findPauses = (
  envelope: number[],
  options: { frameMs?: number; minMs?: number; threshold?: number } = {},
): Array<{ atMs: number; ms: number }> => {
  const frameMs = options.frameMs ?? FRAME_MS;
  const minFrames = Math.ceil((options.minMs ?? 600) / frameMs);
  const threshold = options.threshold ?? speechThreshold(envelope);
  const bounds = speechBounds(envelope, threshold);
  if (!bounds) return [];
  const out: Array<{ atMs: number; ms: number }> = [];
  let runStart = -1;
  for (let i = bounds.start; i <= bounds.end + 1; i += 1) {
    const quiet = i <= bounds.end && (envelope[i] ?? 0) < threshold;
    if (quiet && runStart < 0) runStart = i;
    if (!quiet && runStart >= 0) {
      if (i - runStart >= minFrames) out.push({ atMs: (runStart - bounds.start) * frameMs, ms: (i - runStart) * frameMs });
      runStart = -1;
    }
  }
  return out;
};

/** Rough syllable count: groups of vowels, a silent final "e" dropped, at least one. */
export const syllables = (word: string): number => {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return /\d/.test(word) ? Math.max(1, word.replace(/\D/g, '').length) : 0;
  const groups = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
};

/** Places in the text where a speaker naturally pauses (commas, dashes, sentence ends inside the text). */
export const expectedPauses = (text: string): number => {
  const inner = text.trim().replace(/[.!?…]+["'”’)]*$/, '');
  return (inner.match(/[,;:—–]|[.!?](?=\s)/g) ?? []).length;
};

/** About how long the browser takes to say the text at a speech rate (1 = normal, ~2.6 words a second). */
export const estimateSpeechMs = (text: string, rate = 1): number => {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round(((words / 2.6) * 1000 + expectedPauses(text) * 250) / Math.max(0.3, rate));
};

/**
 * The model sentence's envelope, estimated from the text: a bump per syllable
 * (stressed-looking long words a little louder), 60 ms between words, 260 ms
 * at commas and 420 ms between sentences, scaled to `durationMs`.
 */
export const estimateModelEnvelope = (text: string, durationMs: number, frameMs = FRAME_MS): number[] => {
  type Piece = { kind: 'syllable'; weight: number; loud: number } | { kind: 'gap'; weight: number };
  const pieces: Piece[] = [];
  const tokens = text.split(/\s+/).filter(Boolean);
  tokens.forEach((token, index) => {
    const count = syllables(token);
    for (let s = 0; s < count; s += 1) {
      // Content words (longer) carry the beat; the first syllable is the loudest.
      const loud = (token.replace(/[^A-Za-z]/g, '').length > 3 ? 1 : 0.7) * (s === 0 ? 1 : 0.8);
      pieces.push({ kind: 'syllable', weight: 1, loud });
    }
    if (index === tokens.length - 1) return;
    if (/[.!?…]["'”’)]*$/.test(token)) pieces.push({ kind: 'gap', weight: 2.1 });
    else if (/[,;:—–]["'”’)]*$/.test(token)) pieces.push({ kind: 'gap', weight: 1.3 });
    else pieces.push({ kind: 'gap', weight: 0.3 });
  });
  const totalWeight = pieces.reduce((sum, piece) => sum + piece.weight, 0);
  const frames = Math.max(1, Math.round(durationMs / frameMs));
  if (!totalWeight) return new Array<number>(frames).fill(0);
  const out = new Array<number>(frames).fill(0);
  let cursor = 0;
  for (const piece of pieces) {
    const from = (cursor / totalWeight) * frames;
    cursor += piece.weight;
    const to = (cursor / totalWeight) * frames;
    if (piece.kind === 'gap') continue;
    for (let f = Math.floor(from); f < Math.ceil(to) && f < frames; f += 1) {
      const position = ((f + 0.5) - from) / Math.max(0.0001, to - from);
      if (position < 0 || position > 1) continue;
      out[f] = Math.max(out[f] ?? 0, Math.sin(Math.PI * position) * piece.loud);
    }
  }
  return out;
};

/** Average-pools (or stretches) a series to exactly `bins` values. */
export const resample = (values: number[], bins: number): number[] => {
  if (bins <= 0) return [];
  if (!values.length) return new Array<number>(bins).fill(0);
  const out: number[] = [];
  for (let b = 0; b < bins; b += 1) {
    const from = (b / bins) * values.length;
    const to = ((b + 1) / bins) * values.length;
    const start = Math.floor(from);
    const end = Math.max(start + 1, Math.ceil(to));
    let sum = 0;
    let count = 0;
    for (let i = start; i < end && i < values.length; i += 1) {
      sum += values[i] ?? 0;
      count += 1;
    }
    out.push(count ? sum / count : 0);
  }
  return out;
};

const normalise = (values: number[]): number[] => {
  const peak = Math.max(0, ...values);
  return peak > 0 ? values.map((value) => Math.min(1, value / peak)) : values.map(() => 0);
};

/**
 * Both envelopes cut to their speech and drawn as the same number of bars, so
 * the start and end of the sentence line up whatever the speaking speed.
 */
export const alignEnvelopes = (model: number[], learner: number[], bins = 64): { model: number[]; learner: number[] } => {
  const cut = (envelope: number[]) => {
    const bounds = speechBounds(envelope);
    return bounds ? envelope.slice(bounds.start, bounds.end + 1) : envelope;
  };
  return { model: normalise(resample(cut(model), bins)), learner: normalise(resample(cut(learner), bins)) };
};

/** Speech length in ms (trimmed of silence before and after). */
export const speechMs = (envelope: number[], frameMs = FRAME_MS): number => {
  const bounds = speechBounds(envelope);
  return bounds ? (bounds.end - bounds.start + 1) * frameMs : 0;
};

export type RhythmHints = {
  /** The learner's speaking time divided by the model's. */
  ratio: number | null;
  pace: 'slow' | 'fast' | 'good' | null;
  /** Long silences beyond the natural pauses the sentence has. */
  extraPauses: number;
  pauses: Array<{ atMs: number; ms: number }>;
};

/** Pace and pause hints. Within 25% slower / 20% faster than the model counts as a good pace. */
export const rhythmHints = (input: { modelMs: number | null; learnerMs: number | null; pauses?: Array<{ atMs: number; ms: number }>; text: string }): RhythmHints => {
  const pauses = input.pauses ?? [];
  const extraPauses = Math.max(0, pauses.length - expectedPauses(input.text));
  if (!input.modelMs || !input.learnerMs || input.modelMs <= 0 || input.learnerMs <= 0) {
    return { ratio: null, pace: null, extraPauses, pauses };
  }
  const ratio = Math.round((input.learnerMs / input.modelMs) * 100) / 100;
  const pace = ratio > 1.25 ? 'slow' : ratio < 0.8 ? 'fast' : 'good';
  return { ratio, pace, extraPauses, pauses };
};

/**
 * Long text split into pieces of whole sentences (at most `maxWords` words
 * each, unless one sentence is longer), so a tutor reply or a paragraph can be
 * shadowed one comfortable piece at a time.
 */
export const splitForShadowing = (text: string, maxWords = 25): string[] => {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.!?…]+(?:[.!?…]+["'”’)]*|$)/g) ?? [];
  const out: string[] = [];
  let current = '';
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const joined = current ? `${current} ${sentence}` : sentence;
    if (current && joined.split(' ').length > maxWords) {
      out.push(current);
      current = sentence;
    } else {
      current = joined;
    }
  }
  if (current) out.push(current);
  return out;
};
