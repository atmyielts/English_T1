import { pick } from '../../../../packages/coach-packs/src/text.ts';
import { runtimeOf } from '../coach/runtime.ts';
import { engage } from '../engage/binding.ts';
import { recordSample } from '../engage/samples.ts';
import { registerPassportSource } from '../engage/seams.ts';
import { audioMime } from '../engage/storage.ts';
import type { RequestContext } from '../types.ts';

// Seams between the coach engine and engage, wired at integration
// (docs/product/ai-requests/engage.md, section 2):
//   - coach certificates appear in the Skill Passport (registerPassportSource);
//   - a scored voice answer becomes a then-vs-now voice sample, at most one per coach
//     a week, so the sample store holds a weekly trace and not every answer.

registerPassportSource('coach', async (ctx, userId) => {
  const rt = runtimeOf((handle) => ctx.store(handle));
  const certificates = await rt.store.certificates(userId);
  return certificates.filter((cert) => !cert.revokedAt).map((cert) => {
    const coach = pick(rt.packs.get(cert.pack)?.manifest.name, ctx.locale) || cert.pack;
    return {
      kind: 'certificate' as const,
      ref: cert.id,
      title: `${coach}: ${cert.levelLabel}`.slice(0, 120),
      data: { pack: cert.pack, milestone: cert.milestone, level: cert.level, level_label: cert.levelLabel, code: cert.code },
      verifyUrl: `${rt.config.appUrl}/coach/verify/${cert.code}`,
      verified: true,
      issuedAt: cert.issuedAt,
    };
  });
});

/** ISO week of a date, `2026-W45`. */
export function isoWeek(at: Date): string {
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return `${day.getUTCFullYear()}-W${String(Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7)).padStart(2, '0')}`;
}

export interface CoachVoice {
  pack: string;
  feature: string;
  audio: Uint8Array;
  mime: string;
  transcript: string;
  durationSec: number;
  /** Band per criterion and the overall band; nulls are dropped. */
  scores: Record<string, number | null>;
  promptKey?: string;
}

/**
 * Keeps one scored voice answer per coach a week as a then-vs-now sample. Never fails the
 * coaching turn: runs after the response and only logs a failure (never the audio or text).
 */
export function recordCoachVoice(ctx: RequestContext, voice: CoachVoice): void {
  // Only audio engage can play back (Telegram voice notes are Ogg Opus).
  if (!audioMime(voice.audio, voice.mime)) return;
  ctx.after(async () => {
    try {
      const sourceRef = `coach:${voice.pack}:${isoWeek(ctx.now())}`;
      const userId = ctx.user.id;
      const kept = await engage(ctx).repo.samples(userId);
      if (kept.some((sample) => sample.source === 'coach' && sample.sourceRef === sourceRef)) return;
      const scores = Object.fromEntries(Object.entries(voice.scores).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
      await recordSample(ctx, {
        kind: 'voice', sourceRef, audio: { bytes: voice.audio, mime: voice.mime }, transcript: voice.transcript.slice(0, 6_000),
        durationMs: Math.max(0, Math.round(voice.durationSec * 1000)), scores, feature: voice.feature, promptKey: voice.promptKey?.slice(0, 60),
      });
    } catch (cause) {
      console.error(JSON.stringify({ event: 'coach_engage_sample_failed', pack: voice.pack, error: cause instanceof Error ? cause.name : 'error' }));
    }
  });
}
