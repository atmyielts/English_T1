// Server-sent events, both directions: the function parses provider streams and
// writes its own stream to the app; the app parses that stream. Chunks may split
// anywhere, including inside a line or a multi-byte character (decode with a
// streaming TextDecoder before pushing).

export interface SSEEvent { event: string; data: string; id?: string }

export class SSEParser {
  private buffer = '';
  private event = '';
  private data: string[] = [];
  private id: string | undefined;

  /** Feeds decoded text; returns the events completed by it. */
  push(text: string): SSEEvent[] {
    this.buffer += text;
    const events: SSEEvent[] = [];
    let newline: number;
    while ((newline = this.buffer.search(/\r\n|\r|\n/)) >= 0) {
      const line = this.buffer.slice(0, newline);
      const width = this.buffer.startsWith('\r\n', newline) ? 2 : 1;
      // A lone \r at the end of a chunk may be the first half of \r\n.
      if (width === 1 && this.buffer[newline] === '\r' && newline === this.buffer.length - 1) break;
      this.buffer = this.buffer.slice(newline + width);
      const done = this.line(line);
      if (done) events.push(done);
    }
    if (this.buffer.length > 1_000_000) throw new Error('sse_line_too_long');
    return events;
  }

  /** Ends the stream; a final event without a blank line still counts. */
  flush(): SSEEvent[] {
    const events: SSEEvent[] = [];
    if (this.buffer) {
      const done = this.line(this.buffer);
      this.buffer = '';
      if (done) events.push(done);
    }
    const last = this.dispatch();
    if (last) events.push(last);
    return events;
  }

  private line(line: string): SSEEvent | null {
    if (line === '') return this.dispatch();
    if (line.startsWith(':')) return null;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') this.event = value;
    else if (field === 'data') this.data.push(value);
    else if (field === 'id') this.id = value;
    return null;
  }

  private dispatch(): SSEEvent | null {
    if (!this.data.length && !this.event) return null;
    const event: SSEEvent = { event: this.event || 'message', data: this.data.join('\n'), ...(this.id !== undefined ? { id: this.id } : {}) };
    this.event = '';
    this.data = [];
    return event;
  }
}

/** One event as wire text. Data is JSON on one line, so it never needs splitting. */
export function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
