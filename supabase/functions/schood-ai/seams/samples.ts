import { engage } from '../engage/binding.ts';
import { recordSample } from '../engage/samples.ts';
import { audioMime } from '../engage/storage.ts';
import type { RequestContext } from '../types.ts';

// Then-vs-now samples from the areas that hear or read learners (engage's recordSample,
// docs/product/ai-requests/engage.md). Voice: at most one recording per key a week, so the
// sample store keeps a weekly trace and not every answer. Writing: each scored essay.
// Both run after the response and never fail the area's request; a failure is logged
// without the audio or text.

/** ISO week of a date, `2026-W45`. */
export function isoWeek(at: Date): string {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return `${day.getUTCFullYear()}-W${String(Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7)).padStart(2, '0')}`;
}

const numbers = (scores: Record<string, number | null | undefined>) =>
  Object.fromEntries(Object.entries(scores).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
const failed = (ctx: RequestContext, what: string, cause: unknown) =>
  console.error(JSON.stringify({ event: 'engage_sample_seam_failed', area: ctx.area, what, error: cause instanceof Error ? cause.name : 'error' }));

export interface WeeklyVoice {
  /** The area's key for the trace (`coach:ielts`, `learner:L4`); the week is added. */
  key: string;
  feature: string;
  audio: Uint8Array;
  mime: string;
  transcript: string;
  durationSec: number;
  scores?: Record<string, number | null | undefined>;
  promptKey?: string;
}

/** One voice sample per key a week, from audio engage can play back. */
export function recordWeeklyVoice(ctx: RequestContext, voice: WeeklyVoice): void {
  if (!audioMime(voice.audio, voice.mime)) return;
  ctx.after(async () => {
    try {
      const sourceRef = `${voice.key}:${isoWeek(ctx.now())}`;
      const kept = await engage(ctx).repo.samples(ctx.user.id);
      if (kept.some((sample) => sample.source === ctx.area && sample.sourceRef === sourceRef)) return;
      await recordSample(ctx, {
        kind: 'voice', sourceRef, audio: { bytes: voice.audio, mime: voice.mime }, transcript: voice.transcript.slice(0, 6_000),
        durationMs: Math.max(0, Math.round(voice.durationSec * 1000)), scores: numbers(voice.scores ?? {}), feature: voice.feature, promptKey: voice.promptKey?.slice(0, 60),
      });
    } catch (cause) {
      failed(ctx, 'voice', cause);
    }
  });
}

/** A scored essay as a writing sample (one per essay id). */
export function recordEssay(ctx: RequestContext, essay: { id: string; feature: string; text: string; scores: Record<string, number | null | undefined>; promptKey?: string }): void {
  if (essay.text.trim().length < 40) return;
  ctx.after(async () => {
    try {
      await recordSample(ctx, { kind: 'writing', sourceRef: `${ctx.area}:essay:${essay.id}`, text: essay.text, scores: numbers(essay.scores), feature: essay.feature, promptKey: essay.promptKey?.slice(0, 60) });
    } catch (cause) {
      failed(ctx, 'writing', cause);
    }
  });
}
