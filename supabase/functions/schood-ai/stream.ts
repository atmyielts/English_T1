import { formatSSE } from '../../../packages/ai-core/src/mod.ts';

// Server-sent events to the app. Events are JSON on one line (see CONTRACT.md for
// the chat protocol). A comment ping every 15 s keeps proxies from closing a quiet
// stream. When the person closes the page or presses Stop, `signal` aborts; the
// producer still finishes its bookkeeping because it runs under `after`.

export type SendEvent = (event: string, data: unknown) => void;

export function sseResponse(headers: Record<string, string>, after: (work: Promise<unknown>) => void, produce: (send: SendEvent, signal: AbortSignal) => Promise<void>): Response {
  const encoder = new TextEncoder(), stop = new AbortController();
  let sink: ReadableStreamDefaultController<Uint8Array> | null = null, closed = false;
  const write = (text: string) => {
    if (closed || !sink) return;
    try { sink.enqueue(encoder.encode(text)); } catch { closed = true; }
  };
  const body = new ReadableStream<Uint8Array>({
    start(controller) { sink = controller; },
    cancel() { closed = true; stop.abort(); },
  });
  const ping = setInterval(() => write(': ping\n\n'), 15_000);
  const work = produce((event, data) => write(formatSSE(event, data)), stop.signal)
    .catch((cause) => {
      console.error(JSON.stringify({ event: 'schood_ai_sse_failed', error: String(cause).slice(0, 300) }));
      write(formatSSE('error', { code: 'internal_error', error: 'Something went wrong.' }));
    })
    .finally(() => {
      clearInterval(ping);
      if (!closed) { closed = true; try { sink?.close(); } catch { /* already closed */ } }
    });
  after(work);
  return new Response(body, { status: 200, headers: { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
