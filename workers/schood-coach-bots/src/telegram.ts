import type { OutButton, OutMessage } from '../../../packages/coach-packs/src/wire.ts';

// The Telegram Bot API, as the coach bots use it: send text, voice, polls and
// chat actions, answer button taps, edit buttons, and fetch voice and photo files.
// Messages from the function become Telegram calls here; nothing else is decided.

export type Fetch = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;
export interface TelegramResult<T = unknown> { ok: boolean; status: number; result?: T; description?: string; blocked: boolean }

export function telegram(token: string, fetcher: Fetch) {
  const base = `https://api.telegram.org/bot${token}`;
  async function call<T>(method: string, body: Record<string, unknown> | FormData): Promise<TelegramResult<T>> {
    let response: Response;
    try {
      response = body instanceof FormData
        ? await fetcher(`${base}/${method}`, { method: 'POST', body })
        : await fetcher(`${base}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      return { ok: false, status: 0, blocked: false, description: 'network' };
    }
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; result?: T; description?: string };
    const description = typeof payload.description === 'string' ? payload.description : undefined;
    // 403 "bot was blocked by the user" / "user is deactivated": stop writing to them.
    const blocked = response.status === 403;
    if (!response.ok) console.error(JSON.stringify({ event: 'telegram_api_failed', method, status: response.status }));
    return { ok: response.ok && payload.ok !== false, status: response.status, result: payload.result, description, blocked };
  }
  return {
    call,
    async file(fileId: string, maxBytes: number): Promise<Uint8Array | null> {
      const info = await call<{ file_path?: string; file_size?: number }>('getFile', { file_id: fileId });
      const path = info.result?.file_path;
      if (!info.ok || !path || (info.result?.file_size ?? 0) > maxBytes || !/^[A-Za-z0-9_./-]{1,200}$/.test(path)) return null;
      const response = await fetcher(`https://api.telegram.org/file/bot${token}/${path}`).catch(() => null);
      if (!response?.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      return bytes.length > maxBytes ? null : bytes;
    },
  };
}
export type Telegram = ReturnType<typeof telegram>;

/** A function button → a Telegram inline button (a Mini App page opens on the app's own origin). */
export function keyboard(rows: OutButton[][] | undefined, appUrl: string) {
  if (!rows?.length) return undefined;
  const inline_keyboard = rows.map((row) => row.map((button) => {
    const text = button.text.slice(0, 64);
    if (button.app && button.app.startsWith('/coach')) return { text, web_app: { url: `${appUrl}${button.app}` } };
    if (button.url && /^https:\/\//.test(button.url)) return { text, url: button.url };
    return { text, callback_data: (button.data ?? 'x').slice(0, 64) };
  })).filter((row) => row.length);
  return inline_keyboard.length ? { inline_keyboard } : undefined;
}

/** Splits long HTML at paragraph breaks so each piece stays under Telegram's 4,096 characters. */
export function splitHtml(html: string, max = 3900): string[] {
  if (html.length <= max) return [html];
  const parts: string[] = [];
  let current = '';
  for (const paragraph of html.split('\n\n')) {
    const piece = paragraph.length > max ? paragraph.slice(0, max) : paragraph;
    if (current && current.length + piece.length + 2 > max) { parts.push(current); current = ''; }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) parts.push(current);
  return parts;
}

export interface SendReport { blocked: boolean; failed: boolean; voices: { cacheKey: string; fileId: string }[]; polls: { ref: string; pollId: string }[] }

const fromBase64 = (base64: string) => { const binary = atob(base64); const out = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i); return out; };

/** Sends the function's messages to one chat, in order; reports new voice file ids and poll ids. */
export async function sendAll(api: Telegram, chatId: string, messages: OutMessage[], appUrl: string): Promise<SendReport> {
  const report: SendReport = { blocked: false, failed: false, voices: [], polls: [] };
  for (const message of messages) {
    let result: TelegramResult<Record<string, unknown>>;
    if (message.kind === 'text') {
      const pieces = splitHtml(message.html);
      for (const [index, piece] of pieces.entries()) {
        result = await api.call('sendMessage', { chat_id: chatId, text: piece, parse_mode: 'HTML', disable_web_page_preview: true, ...(index === pieces.length - 1 ? { reply_markup: keyboard(message.buttons, appUrl) } : {}) });
        if (!result.ok) break;
      }
    } else if (message.kind === 'voice') {
      if (message.fileId) {
        result = await api.call('sendVoice', { chat_id: chatId, voice: message.fileId, ...(message.caption ? { caption: message.caption, parse_mode: 'HTML' } : {}), reply_markup: keyboard(message.buttons, appUrl) });
      } else if (message.audio) {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('voice', new Blob([fromBase64(message.audio) as BlobPart], { type: message.mime || 'audio/ogg' }), 'voice.ogg');
        if (message.caption) { form.append('caption', message.caption); form.append('parse_mode', 'HTML'); }
        const markup = keyboard(message.buttons, appUrl);
        if (markup) form.append('reply_markup', JSON.stringify(markup));
        result = await api.call('sendVoice', form);
        const fileId = (result.result?.voice as { file_id?: string } | undefined)?.file_id;
        if (result.ok && message.cacheKey && fileId) report.voices.push({ cacheKey: message.cacheKey, fileId });
      } else continue;
    } else if (message.kind === 'poll') {
      result = await api.call('sendPoll', {
        chat_id: chatId, question: message.question.slice(0, 300), options: message.options.map((option) => ({ text: option.slice(0, 100) })),
        type: 'quiz', correct_option_id: message.correct, is_anonymous: false, ...(message.explanation ? { explanation: message.explanation.slice(0, 200) } : {}),
      });
      const pollId = (result.result?.poll as { id?: string } | undefined)?.id;
      if (result.ok && pollId) report.polls.push({ ref: message.ref, pollId });
    } else {
      result = await api.call('sendChatAction', { chat_id: chatId, action: message.action });
    }
    if (result!.blocked) { report.blocked = true; return report; }
    if (!result!.ok) report.failed = true;
  }
  return report;
}
