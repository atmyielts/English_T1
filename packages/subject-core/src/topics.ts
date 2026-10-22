import type { Names } from './format.ts';

// PE-03 topic graph: topics, prerequisites and the exam blocks each topic appears in.
// Assessment Cloud items carry topic codes in `classification.topics`, so practice,
// mocks and item statistics all join on them.

export interface Topic {
  code: string;
  names: Names;
  strand: string;
  /** Exam blocks the topic can appear in. */
  blocks: ('compulsory' | 'specialised')[];
  /** Relative share of questions in a block. Shares are normalised per block. */
  weight: number;
  prerequisites: string[];
}

export interface Taxonomy {
  subject: string;
  version: string;
  /** False until checked against the official programme. */
  verified: boolean;
  source_note: string;
  topics: Topic[];
}

/** The taxonomy's topics among an item's classification topics, in taxonomy order. */
export function knownTopics(taxonomy: Taxonomy, codes: readonly string[]): string[] {
  const wanted = new Set(codes);
  return taxonomy.topics.filter((topic) => wanted.has(topic.code)).map((topic) => topic.code);
}

export function taxonomyProblems(taxonomy: Taxonomy): string[] {
  const problems: string[] = [];
  const byCode = new Map<string, Topic>();
  for (const topic of taxonomy.topics) {
    if (!/^[a-z][a-z0-9_.]{2,60}$/.test(topic.code)) problems.push(`${topic.code}.code`);
    if (byCode.has(topic.code)) problems.push(`${topic.code}.duplicate`);
    byCode.set(topic.code, topic);
    for (const locale of ['uz', 'ru', 'en'] as const) if (!topic.names?.[locale]) problems.push(`${topic.code}.names.${locale}`);
    if (!topic.blocks.length) problems.push(`${topic.code}.blocks`);
    if (!(topic.weight > 0)) problems.push(`${topic.code}.weight`);
  }
  for (const topic of taxonomy.topics) {
    for (const prerequisite of topic.prerequisites) if (!byCode.has(prerequisite)) problems.push(`${topic.code}.prerequisite.${prerequisite}`);
  }
  // Prerequisites must form a DAG.
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (code: string): boolean => {
    if (state.get(code) === 'done') return true;
    if (state.get(code) === 'visiting') return false;
    state.set(code, 'visiting');
    for (const prerequisite of byCode.get(code)?.prerequisites ?? []) if (byCode.has(prerequisite) && !visit(prerequisite)) return false;
    state.set(code, 'done');
    return true;
  };
  for (const topic of taxonomy.topics) if (!visit(topic.code)) {
    problems.push(`${topic.code}.cycle`);
    break;
  }
  return problems;
}

/** Each topic's share of the questions in a block, summing to 1. */
export function blockShares(taxonomy: Taxonomy, block: 'compulsory' | 'specialised'): Map<string, number> {
  const topics = taxonomy.topics.filter((topic) => topic.blocks.includes(block));
  const total = topics.reduce((sum, topic) => sum + topic.weight, 0);
  return new Map(topics.map((topic) => [topic.code, total ? topic.weight / total : 0]));
}
