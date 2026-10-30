// The anonymous percentile (B3 mini-mocks): where a learner's latest result sits among
// the coach's other learners. The store returns only a histogram (a score and how many
// people have it as their latest result in the window); no person, id or name ever
// leaves it. The percentile is shown only to the learner it is about, and only when the
// window holds at least MIN_COHORT people, so no small group can be singled out. There
// is no public board: anything public built on this must leave out under-18s (and
// people whose age is unknown), as the doc's rules for leaderboards require.

export const MIN_COHORT = 30;

export interface CohortBucket { score: number; people: number }
export interface CohortPlace { percentile: number; people: number }

/**
 * The share of the other people below `mine`, counting ties as half: 0–100. `includesMe`
 * removes the learner's own entry from the histogram first. Null below MIN_COHORT people.
 */
export function cohortPercentile(histogram: readonly CohortBucket[], mine: number, includesMe = true): CohortPlace | null {
  const buckets = histogram.filter((bucket) => Number.isFinite(bucket.score) && bucket.people > 0);
  const people = buckets.reduce((sum, bucket) => sum + bucket.people, 0);
  if (people < MIN_COHORT) return null;
  let below = 0, ties = 0;
  for (const bucket of buckets) {
    if (bucket.score < mine - 1e-9) below += bucket.people;
    else if (Math.abs(bucket.score - mine) <= 1e-9) ties += bucket.people;
  }
  if (includesMe && ties > 0) ties -= 1;
  const others = people - (includesMe ? 1 : 0);
  if (others <= 0) return null;
  return { percentile: Math.round(((below + ties / 2) / others) * 100), people };
}
