// Test stand-in for std `serve`: records the handler instead of listening.
// deno-lint-ignore no-explicit-any
type Handler = (req: Request) => Response | Promise<Response>;
const g = globalThis as unknown as { __servedHandlers?: Handler[] };
export const serve = (handler: Handler): Promise<void> => {
  (g.__servedHandlers ??= []).push(handler);
  return new Promise<void>(() => {});
};

/** Imports an Edge Function entry module and returns the handler it served. */
export const loadHandler = async (moduleUrl: string | URL): Promise<Handler> => {
  const before = g.__servedHandlers?.length ?? 0;
  await import(String(moduleUrl));
  const handlers = g.__servedHandlers ?? [];
  if (handlers.length <= before) throw new Error(`no handler served by ${moduleUrl}`);
  return handlers[handlers.length - 1];
};
