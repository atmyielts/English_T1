export declare const DEFAULT_FUNCTION_REGION: string;
export declare const functionsBaseFor: (supabaseUrl: string | null | undefined) => string;
export declare const withFunctionRegion: (url: string | URL, functionsBase: string, region?: string) => string;
export declare const regionFetch: <F extends (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  baseFetch: F,
  functionsBase: string,
  region?: string,
) => F & { schoodFunctionRegion?: string };
