import { edge } from '../../lib/api';
import type { HandbookEntry } from '../../lib/handbookSearch';

/** Every published grammar rule with its explanation in English, Russian and Uzbek. */
export const getHandbook = (signal?: AbortSignal) =>
  edge<{ entries: HandbookEntry[] }>('grammar-remediation', '/handbook', {
    query: { language_code: 'en' },
    signal,
  });
