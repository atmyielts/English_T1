import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type GuideEvent, guideMetrics } from './guide-metrics.ts';

Deno.test('guide metrics count unique journeys and use one cohort even when audience arrives later', () => {
  const row = (patch: Partial<GuideEvent>): GuideEvent => ({ journey_id: 'a', version_id: 'v1', event: 'started', question_id: null, offer_id: null, audience: null, locale: 'en', campaign: 'direct', created_at: '2026-09-01T10:00:00Z', ...patch });
  const report = guideMetrics([
    row({}), row({ event: 'question_viewed', question_id: 'audience' }),
    row({ event: 'answered', question_id: 'audience', audience: 'learner', created_at: '2026-09-01T10:01:00Z' }),
    row({ event: 'result', audience: 'learner', created_at: '2026-09-01T10:02:00Z' }),
    row({ event: 'paid', offer_id: 'p1' }), row({ event: 'paid', offer_id: 'p2' }),
    row({ journey_id: 'b', event: 'result', audience: 'learner' }),
  ]);
  assertEquals(report.funnel.find(m => m.event === 'started')?.audience, 'learner');
  assertEquals(report.funnel.find(m => m.event === 'paid')?.count, 1);
  assertEquals(report.funnel.find(m => m.event === 'result')?.count, 2);
  assertEquals(report.funnel.find(m => m.event === 'completed_from_starts')?.count, 1);
  assertEquals(report.groups.filter(m => m.event === 'paid').length, 2);
  assertEquals(JSON.stringify(report).includes('journey_id'), false);
});
