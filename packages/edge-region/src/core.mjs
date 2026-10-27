// Runs Supabase Edge Functions next to the database.
//
// The database lives in Singapore (ap-southeast-1). Without a region, Supabase runs a
// function at the edge nearest the learner (eu-central-1 for Uzbekistan), so every
// query a function makes crosses Frankfurt-Singapore. Measured on module pages:
// SAT Playbook median 1.96 s -> 1.18 s, IELTS Playbook 1.48 s -> 1.09 s.
// A query parameter is used instead of the x-region header so it adds no CORS preflight.

export const DEFAULT_FUNCTION_REGION = 'ap-southeast-1';
const PARAM = 'forceFunctionRegion';

/** The functions base for a project URL, with a trailing slash. */
export const functionsBaseFor = (supabaseUrl) => {
  const url = String(supabaseUrl ?? '').trim().replace(/\/+$/, '');
  return url ? `${url}/functions/v1/` : '';
};

/** Adds the region to a URL aimed at the project's functions; any other URL is returned unchanged. */
export const withFunctionRegion = (url, functionsBase, region = DEFAULT_FUNCTION_REGION) => {
  const text = String(url);
  if (!region || !functionsBase || !text.startsWith(functionsBase)) return text;
  if (new RegExp(`[?&]${PARAM}=`).test(text)) return text;
  const hashAt = text.indexOf('#');
  const head = hashAt >= 0 ? text.slice(0, hashAt) : text;
  const tail = hashAt >= 0 ? text.slice(hashAt) : '';
  return `${head}${head.includes('?') ? '&' : '?'}${PARAM}=${encodeURIComponent(region)}${tail}`;
};

/**
 * Wraps a fetch so requests to the project's functions carry the region.
 * Strings, URL objects and Request objects are all handled; everything else passes through.
 */
export const regionFetch = (baseFetch, functionsBase, region = DEFAULT_FUNCTION_REGION) => {
  if (!functionsBase || !region) return baseFetch;
  const wrapped = (input, init) => {
    if (typeof input === 'string' || input instanceof URL) {
      return baseFetch(withFunctionRegion(String(input), functionsBase, region), init);
    }
    if (typeof Request !== 'undefined' && input instanceof Request) {
      const next = withFunctionRegion(input.url, functionsBase, region);
      return baseFetch(next === input.url ? input : new Request(next, input), init);
    }
    return baseFetch(input, init);
  };
  wrapped.schoodFunctionRegion = region;
  return wrapped;
};
