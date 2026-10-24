// The full subscription is a Schood product granted through the usual Click → entitlements
// path and read through access-effective, like SAT Practice. Without a product id the
// service runs as an open beta and everyone has full access.

export function createAccessCheck(base: string, anon: string, productId: string, fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { at: number; plan: 'plus' | 'free' }>();
  return async (token: string): Promise<'plus' | 'free'> => {
    const cached = cache.get(token);
    if (cached && Date.now() - cached.at < 60_000) return cached.plan;
    try {
      const response = await fetcher(`${base}/functions/v1/access-effective`, { headers: { apikey: anon, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      const payload = response.ok ? await response.json() : null;
      if (!Array.isArray(payload?.effective_product_ids)) throw new Error(`access-effective ${response.status}`);
      const plan = payload.effective_product_ids.includes(productId) ? 'plus' : 'free';
      cache.set(token, { at: Date.now(), plan });
      if (cache.size > 5000) cache.clear();
      return plan;
    } catch (cause) {
      // A paying learner must not be locked out by an outage; this errs towards access.
      console.error(JSON.stringify({ access_check: 'unavailable', error: String(cause) }));
      return 'plus';
    }
  };
}
