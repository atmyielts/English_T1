import { integer, optionalText, record, text, uuid } from '../input.ts';
import type { RequestContext } from '../types.ts';
import { begin, refuse, sha256, type Engage } from './base.ts';
import { engage } from './binding.ts';
import { sampleSource } from './seams.ts';
import { audioMime, fromBase64 } from './storage.ts';
import type { SampleRow, StorageRef } from './types.ts';

// E7 Then vs now: the person's day-1 voice next to today's, and their first essay
// next to the latest, each with its scores. Samples are private. A row holds a
// reference (a storage path, or another area's clip id), never a copy for anyone
// else; playback is a link signed for a few minutes for the owner, or for someone
// holding the owner's own Skill Passport link that includes that sample.
//
// recordSample() is the helper the learner and coach areas call after they score a
// speaking turn or an essay (documented in docs/product/ai-requests/engage.md).

const MAX_AUDIO_BYTES = 2_500_000;
const PLAYBACK_SECONDS = 600;
const FILLERS = new Set(['um', 'uh', 'er', 'erm', 'ah', 'ee', 'aa', 'mm', 'hmm', 'like', 'anu', 'haligi', 'типа', 'ну', 'это', 'вот', 'короче', 'э', 'эм']);
const WORD = /[\p{L}\p{N}’'-]+/gu;

/** Measured numbers for a spoken answer from its transcript and length (no model involved). */
export function voiceMetrics(transcript: string | null, durationMs: number): Record<string, number> {
  const seconds = Math.max(1, durationMs / 1000);
  const words = (transcript ?? '').toLowerCase().match(WORD) ?? [];
  if (!words.length) return { seconds: Math.round(seconds) };
  const fillers = words.filter((word) => FILLERS.has(word)).length;
  const content = words.filter((word) => !FILLERS.has(word));
  return {
    seconds: Math.round(seconds),
    words: words.length,
    words_per_minute: Math.round((content.length / seconds) * 60),
    filler_per_100: Math.round((fillers / words.length) * 1000) / 10,
    unique_word_share: Math.round((new Set(content.slice(0, 150)).size / Math.max(1, Math.min(150, content.length))) * 100),
  };
}
/** Measured numbers for a piece of writing. */
export function writingMetrics(body: string): Record<string, number> {
  const words = body.match(WORD) ?? [];
  const sentences = body.split(/[.!?…]+(?:\s|$)/).map((part) => part.trim()).filter((part) => (part.match(WORD) ?? []).length > 0);
  const lower = words.map((word) => word.toLowerCase());
  return {
    words: words.length,
    sentences: sentences.length,
    words_per_sentence: Math.round((words.length / Math.max(1, sentences.length)) * 10) / 10,
    unique_word_share: Math.round((new Set(lower.slice(0, 150)).size / Math.max(1, Math.min(150, lower.length))) * 100),
    long_word_share: Math.round((lower.filter((word) => word.replace(/[’'-]/g, '').length >= 7).length / Math.max(1, lower.length)) * 100),
  };
}

const cleanScores = (value: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, score] of Object.entries(value as Record<string, unknown>).slice(0, 12)) {
    if (/^[a-z][a-z0-9_]{0,30}$/.test(key) && typeof score === 'number' && Number.isFinite(score) && score >= -1000 && score <= 100000) out[key] = Math.round(score * 100) / 100;
  }
  return out;
};

export interface RecordSampleInput {
  kind: 'voice' | 'writing';
  /** The calling area's own id for it (a coach turn, an essay); repeats are ignored. */
  sourceRef?: string;
  /** Raw audio to store (voice), or a reference already stored by the area. */
  audio?: { bytes: Uint8Array; mime: string };
  storage?: StorageRef;
  text?: string;
  durationMs?: number;
  transcript?: string;
  /** The area's scores (band per criterion, a percentage); kept as numbers only. */
  scores?: Record<string, number>;
  promptKey?: string;
  feature?: string;
  recordedAt?: string;
}

/**
 * Saves a then-vs-now sample for the signed-in person (or the Telegram-linked person
 * on the worker path). Call it after the area has scored the answer. Returns the
 * sample id. Throws invalid_request for audio that is not audio or is too large.
 */
export async function recordSample(ctx: RequestContext, input: RecordSampleInput): Promise<{ id: string }> {
  const b = await engage(ctx);
  const userId = ctx.user.id, source = ctx.area === 'engage' ? 'engage' : ctx.area;
  let storage: StorageRef | null = input.storage ?? null;
  if (input.kind === 'voice' && input.audio) {
    if (input.audio.bytes.length > MAX_AUDIO_BYTES) refuse('payload_too_large', 'The recording is too large.', 413, { max_bytes: MAX_AUDIO_BYTES });
    const mime = audioMime(input.audio.bytes, input.audio.mime) ?? refuse('invalid_request', 'The recording is not audio we can play.', 400, { field: 'audio' });
    const name = (await sha256(`${userId}:${crypto.randomUUID()}`)).slice(0, 24);
    storage = await b.storage.put(`schood-ai/engage/samples/${userId}/${name}.${mime.split('/')[1]}`, input.audio.bytes, mime);
  }
  if (input.kind === 'voice' && !storage && !input.sourceRef) refuse('invalid_request', 'A voice sample needs audio or a reference.', 400, { field: 'audio' });
  const writing = input.kind === 'writing' ? (input.text ?? '').slice(0, 20_000) : null;
  if (input.kind === 'writing' && (!writing || writing.trim().length < 40)) refuse('invalid_request', 'A writing sample needs the text.', 400, { field: 'text' });
  const metrics = input.kind === 'voice' ? voiceMetrics(input.transcript ?? null, input.durationMs ?? 0) : writingMetrics(writing!);
  const row = await b.repo.addSample({
    userId, kind: input.kind, source, sourceRef: input.sourceRef ?? null, storage, text: writing,
    promptKey: input.promptKey ?? null, feature: input.feature ?? null, scores: cleanScores(input.scores ?? {}), metrics,
    durationMs: input.durationMs ?? null, recordedAt: input.recordedAt ?? ctx.now().toISOString(),
  });
  return { id: row.id };
}

/** A playback link for a voice sample, or null (owner check is the caller's). */
export async function playbackUrl(e: Pick<Engage, 'b' | 'ctx'>, sample: SampleRow): Promise<string | null> {
  if (sample.kind !== 'voice' || sample.deletedAt) return null;
  if (sample.storage) return await e.b.storage.url(sample.storage, PLAYBACK_SECONDS);
  const resolve = sample.sourceRef ? sampleSource(sample.source) : null;
  return resolve ? await resolve(e.ctx, { userId: sample.userId, ref: sample.sourceRef!, ttlSeconds: PLAYBACK_SECONDS }).catch(() => null) : null;
}

export const sampleView = (sample: SampleRow, includeText: boolean) => ({
  id: sample.id, kind: sample.kind, source: sample.source, prompt: sample.promptKey, feature: sample.feature, recorded_at: sample.recordedAt,
  scores: sample.scores, metrics: sample.metrics, duration_ms: sample.durationMs, ...(includeText && sample.text ? { text: sample.text } : {}),
});

// --- Routes ---------------------------------------------------------------------------------------
export async function thenVsNow(ctx: RequestContext) {
  await ctx.requireFeature('E7');
  const e = await begin(ctx);
  const samples = (await e.b.repo.samples(e.userId)).sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const pair = async (kind: SampleRow['kind']) => {
    const list = samples.filter((sample) => sample.kind === kind);
    if (!list.length) return null;
    const first = list[0], latest = list.at(-1)!;
    const view = async (sample: SampleRow) => ({ ...sampleView(sample, true), url: await playbackUrl(e, sample) });
    return { first: await view(first), latest: first.id === latest.id ? null : await view(latest), days_between: Math.round((Date.parse(latest.recordedAt) - Date.parse(first.recordedAt)) / 86_400_000), count: list.length };
  };
  return { voice: await pair('voice'), writing: await pair('writing'), samples: samples.map((sample) => sampleView(sample, false)) };
}

export async function addVoiceSample(ctx: RequestContext) {
  await ctx.requireFeature('E7');
  const body = record(await ctx.body());
  const audio = fromBase64(text(body.audio_base64, 'audio_base64', { max: 3_500_000, trim: false })) ?? refuse('invalid_request', 'audio_base64 is not base64.', 400, { field: 'audio_base64' });
  const durationMs = integer(body.duration_ms, 'duration_ms', 3_000, 300_000);
  const transcript = optionalText(body.transcript, 'transcript', { max: 6_000 });
  const promptKey = optionalText(body.prompt_key, 'prompt_key', { max: 60 });
  const mime = text(body.mime, 'mime', { max: 60 });
  const { id } = await recordSample(ctx, { kind: 'voice', audio: { bytes: audio, mime }, durationMs, transcript: transcript ?? undefined, promptKey: promptKey ?? undefined, feature: 'E7' });
  return { id, ...(await thenVsNow(ctx)) };
}

export async function addWritingSample(ctx: RequestContext) {
  await ctx.requireFeature('E7');
  const body = record(await ctx.body());
  const writing = text(body.text, 'text', { min: 40, max: 12_000 });
  const promptKey = optionalText(body.prompt_key, 'prompt_key', { max: 60 });
  const { id } = await recordSample(ctx, { kind: 'writing', text: writing, promptKey: promptKey ?? undefined, feature: 'E7' });
  return { id, ...(await thenVsNow(ctx)) };
}

export async function deleteSample(ctx: RequestContext) {
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const id = uuid(body.id, 'id');
  const removed = await e.b.repo.deleteSample(e.userId, id, e.now.toISOString());
  if (!removed) refuse('not_found', 'Sample not found.', 404);
  // A deleted sample leaves every Passport link at once.
  const item = (await e.b.repo.passportItems(e.userId)).find((entry) => entry.source === 'engage' && entry.sourceRef === `sample:${id}`);
  if (item) await e.b.repo.setItemShown(e.userId, item.id, false);
  return { ok: true };
}

/** Playback of the person's own sample. */
export async function sampleAudio(ctx: RequestContext) {
  const e = await begin(ctx, { locale: false });
  const id = uuid(ctx.query.get('id'), 'id');
  const sample = await e.b.repo.sample(id);
  if (!sample || sample.deletedAt || sample.kind !== 'voice' || sample.userId !== e.userId) refuse('not_found', 'Sample not found.', 404);
  const url = await playbackUrl(e, sample!);
  if (!url) refuse('not_found', 'The recording is no longer available.', 404);
  return { url, expires_in: PLAYBACK_SECONDS };
}

/** Playback through a Passport share link (an anonymous route): only a voice sample the person put on that link. */
export async function linkSampleAudio(ctx: RequestContext) {
  const b = engage(ctx), id = uuid(ctx.query.get('id'), 'id');
  const token = ctx.query.get('link');
  if (!token || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) refuse('not_found', 'Sample not found.', 404);
  const link = await b.repo.passportLinkByHash(await sha256(token!));
  const sample = await b.repo.sample(id);
  const live = !!link && !link.revokedAt && !(link.expiresAt && Date.parse(link.expiresAt) < ctx.now().getTime());
  if (!live || !sample || sample.deletedAt || sample.kind !== 'voice' || sample.userId !== link!.userId) refuse('not_found', 'Sample not found.', 404);
  const item = (await b.repo.passportItems(sample!.userId)).find((entry) => entry.sourceRef === `sample:${id}` && entry.shown && link!.itemIds.includes(entry.id));
  if (!item) refuse('not_found', 'Sample not found.', 404);
  const url = await playbackUrl({ b, ctx }, sample!);
  if (!url) refuse('not_found', 'The recording is no longer available.', 404);
  return { url, expires_in: PLAYBACK_SECONDS };
}
