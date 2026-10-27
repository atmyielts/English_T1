// Import this first in an app's entry point: supabase-js captures `fetch` when a
// client is created, so the wrapper must be in place before any module creates one.
// VITE_SUPABASE_FUNCTION_REGION overrides the region; an empty value turns it off.
import { DEFAULT_FUNCTION_REGION, functionsBaseFor, regionFetch } from './core.mjs';

const configured = import.meta.env.VITE_SUPABASE_FUNCTION_REGION as string | undefined;
const region = (configured ?? DEFAULT_FUNCTION_REGION).trim();
const functionsBase = functionsBaseFor(import.meta.env.VITE_SUPABASE_URL as string | undefined);

if (typeof window !== 'undefined' && region && functionsBase) {
  const current = window.fetch as typeof window.fetch & { schoodFunctionRegion?: string };
  if (!current.schoodFunctionRegion) {
    window.fetch = regionFetch(current.bind(window), functionsBase, region) as typeof window.fetch;
  }
}
