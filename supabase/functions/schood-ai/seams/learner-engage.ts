import { beginFor } from '../engage/base.ts';
import { usageSummary } from '../engage/progress.ts';
import { ageFromConsent } from '../learner/common.ts';
import type { RequestContext } from '../types.ts';

// Seams between the learner area and engage, wired at integration
// (docs/product/ai-requests/engage.md, section 2):
//   - P1: the weekly parent brief carries engage's time and verified-learning summary for
//     a child under 18 (minutes, active days, streak, daily limit). It carries no content.
//     The learner area has already checked the parent–child link. The summary is read for
//     the child (beginFor), so it also works in the scheduled brief job, which has no user.
//   - L3/L4/L12/L13 samples: seams/samples.ts.
//   - L17 duels need nothing here: engage's squad feed reads verified `L17` events with an outcome.

export interface ChildUsage { total_minutes: number; active_days: number; streak: number; daily_limit_minutes: number | null; limit_reached_days: number }

/** Engage's 7-day summary for a child who is not a confirmed adult, or null (an adult, or engage unavailable). */
export async function childUsage(ctx: RequestContext, childId: string): Promise<ChildUsage | null> {
  try {
    if ((await ageFromConsent(ctx, childId)) === 'adult') return null;
    const summary = await usageSummary(await beginFor(ctx, childId), childId, 7);
    return { total_minutes: summary.total_minutes, active_days: summary.active_days, streak: summary.streak, daily_limit_minutes: summary.daily_limit_minutes, limit_reached_days: summary.limit_reached_days };
  } catch (cause) {
    console.error(JSON.stringify({ event: 'learner_engage_usage_failed', error: cause instanceof Error ? cause.name : 'error' }));
    return null;
  }
}
