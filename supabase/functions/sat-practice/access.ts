export const SAT_PRACTICE_PRODUCT_ID = '2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010';

export async function practiceAccess(
  base: string, anon: string, token: string, fetcher: typeof fetch = fetch,
): Promise<'allowed' | 'denied' | 'unavailable'> {
  try {
    const response = await fetcher(`${base}/functions/v1/access-effective`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return 'unavailable';
    const payload = await response.json();
    if (!Array.isArray(payload?.effective_product_ids)) return 'unavailable';
    return payload.effective_product_ids.includes(SAT_PRACTICE_PRODUCT_ID) ? 'allowed' : 'denied';
  } catch {
    return 'unavailable';
  }
}

// Answer keys remain server-side until the learner has submitted the attempt.
export function questionForLearner<T extends { correct: unknown }>(question: T): Omit<T, 'correct'> {
  const { correct: _answerKey, ...visible } = question;
  return visible;
}
