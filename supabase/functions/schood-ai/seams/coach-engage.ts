import { pick } from '../../../../packages/coach-packs/src/text.ts';
import { runtimeOf } from '../coach/runtime.ts';
import { registerPassportSource } from '../engage/seams.ts';
import type { RequestContext } from '../types.ts';
import { recordWeeklyVoice } from './samples.ts';

export { isoWeek } from './samples.ts';

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

/** Keeps one scored voice answer per coach a week as a then-vs-now sample (never fails the turn). */
export function recordCoachVoice(ctx: RequestContext, voice: CoachVoice): void {
  recordWeeklyVoice(ctx, { key: `coach:${voice.pack}`, ...voice });
}
