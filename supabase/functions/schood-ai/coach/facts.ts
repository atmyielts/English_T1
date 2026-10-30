import { pick, say, type Activity, type CoachPack, type FactDataset, type Locale } from '../../../../packages/coach-packs/src/mod.ts';
import { dataBlock } from '../prompt.ts';

// Curated, dated facts (B5 Career and Interview: student-visa rules, documents,
// fees). The model never states such a fact from memory: it gets only the
// datasets the activity names, as data with their check date, and the learner
// sees when they were checked and where the official rule is.

const DAY = 86_400_000;

/** The datasets an activity relies on (`activity.facts`), in pack order. */
export function activityFacts(pack: CoachPack, activity: Activity | null | undefined): FactDataset[] {
  const ids = new Set(activity?.facts ?? []);
  return ids.size ? (pack.facts ?? []).filter((dataset) => ids.has(dataset.id)) : [];
}

export const isStale = (dataset: FactDataset, now: Date) => now.getTime() - Date.parse(`${dataset.checkedAt}T00:00:00Z`) > dataset.maxAgeDays * DAY;

/** The rule every prompt that carries facts adds. */
export const FACTS_RULE = '- Rules, requirements, documents, fees and dates come only from <schood_data kind="facts">, as of the date it shows. If something needs a fact that is not there, say you do not have it and that the official site has the current rule. Never state such a fact from memory.';

/** The facts as a data block for a prompt (statements in English, the model\'s working language). */
export function factsBlock(datasets: readonly FactDataset[], now: Date, index = 0): string {
  return dataBlock({
    kind: 'facts', title: 'Curated facts',
    data: datasets.map((dataset) => ({
      topic: dataset.topic, checked_on: dataset.checkedAt, possibly_out_of_date: isStale(dataset, now), official_source: dataset.source.url,
      facts: dataset.entries.map((entry) => ({ id: entry.id, statement: pick(entry.statement, 'en'), ...(entry.appliesTo ? { applies_to: entry.appliesTo } : {}) })),
    })),
  }, index);
}

/** What the learner reads before an activity that relies on facts: the date, the source and, if old, a warning. */
export function factsNotice(datasets: readonly FactDataset[], locale: Locale, now: Date): string | null {
  if (!datasets.length) return null;
  return datasets.map((dataset) => {
    const values = { title: pick(dataset.title, locale), date: dataset.checkedAt, source: dataset.source.name, url: dataset.source.url };
    return say(locale, isStale(dataset, now) ? 'facts.stale' : 'facts.note', values);
  }).join('\n\n');
}

/** For the Mini App's session page. */
export function factsSummary(datasets: readonly FactDataset[], locale: Locale, now: Date) {
  return datasets.map((dataset) => ({ id: dataset.id, title: pick(dataset.title, locale), checked_at: dataset.checkedAt, stale: isStale(dataset, now), source: { name: dataset.source.name, url: dataset.source.url } }));
}

